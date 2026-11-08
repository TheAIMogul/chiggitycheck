// Every model call goes through here and is logged to ai_calls with latency and cost in dollars.
import { z } from 'zod';
import { type Env, toBase64 } from './util';

// Prices in dollars per 1M tokens (OpenAI) / per 1,000 neurons (Workers AI).
const PRICE = {
  decisions_in: 0.1,        // gpt-6-luna Decisions API, output free
  draft_in: 5.0, draft_out: 30.0, // gpt-5.5
  neuron: 0.011 / 1000,     // Workers AI
};

export async function logAI(env: Env, kind: string, model: string, inTok: number, outTok: number, ms: number, cost: number, ok = true) {
  try {
    await env.DB.prepare('INSERT INTO ai_calls (kind, model, input_tokens, output_tokens, latency_ms, cost_usd, ok, created_at) VALUES (?,?,?,?,?,?,?,datetime(\'now\'))')
      .bind(kind, model, inTok, outTok, ms, cost, ok ? 1 : 0).run();
  } catch { /* logging never breaks a request */ }
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error(`${label} timed out after ${ms} ms`)), ms); });
  try { return await Promise.race([p, timeout]); } finally { if (t !== undefined) clearTimeout(t); }
}

/* ---------------- Model routing ----------------
 * OpenAI models (Decisions API, gpt-5.5) are called directly with the OpenAI key.
 * Workers AI vision runs through the "chiggitycheck" AI Gateway, which only adds logging (Workers AI bills the same). */
const gw = (env: Env) => ({ gateway: { id: env.AI_GATEWAY_ID } });
async function openai<T>(env: Env, path: string, body: unknown, ms: number, label: string): Promise<T> {
  const res = await withTimeout(fetch(`https://api.openai.com/v1/${path}`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), ms, label);
  if (!res.ok) throw new Error(`${label} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

/* ---------------- OpenAI Decisions API ---------------- */
export type DecisionQuestion =
  | { type: 'predicate'; name: string; instructions: string }
  | { type: 'choice'; name: string; instructions: string; choices: { value: string; description: string }[] }
  | { type: 'score'; name: string; instructions: string; levels: { label: string; description: string }[] };
export type DecisionAnswer =
  | { type: 'predicate'; name: string; probability: number }
  | { type: 'choice'; name: string; choice: string; probabilities: { value: string; probability: number }[]; confidence: number }
  | { type: 'score'; name: string; score: number; probabilities: { value: number; label: string; probability: number }[]; confidence: number };

export async function decide(env: Env, kind: string, data: unknown, questions: DecisionQuestion[], intro = '', imageUrl: string | null = null): Promise<Map<string, DecisionAnswer>> {
  const out = new Map<string, DecisionAnswer>();
  for (let i = 0; i < questions.length; i += 400) {
    const chunk = questions.slice(i, i + 400);
    const t0 = Date.now();
    const body = {
      model: env.DECISIONS_MODEL,
      input: [{ role: 'user', content: [...(intro ? [{ type: 'input_text', text: intro }] : []), ...(imageUrl ? [{ type: 'input_image', image_url: imageUrl }] : []), { type: 'input_json', data }] }],
      questions: chunk,
    };
    let j: { answers: DecisionAnswer[]; usage?: { input_tokens?: number } };
    try {
      j = await openai(env, 'decisions', body, 30000, 'Decisions API');
    } catch (e) {
      await logAI(env, kind, env.DECISIONS_MODEL, 0, 0, Date.now() - t0, 0, false);
      throw e;
    }
    const ms = Date.now() - t0;
    const inTok = j.usage?.input_tokens ?? 0;
    await logAI(env, kind, env.DECISIONS_MODEL, inTok, 0, ms, (inTok / 1e6) * PRICE.decisions_in);
    for (const a of j.answers) out.set(a.name, a);
  }
  return out;
}

/* ---------------- OpenAI Responses API (drafting, structured JSON, vision fallback) ---------------- */
type RespContent = { type: 'input_text'; text: string } | { type: 'input_image'; image_url: string };
export async function respond(env: Env, kind: string, opts: { instructions: string; input: string | RespContent[]; schema?: { name: string; schema: object }; effort?: 'none' | 'low' | 'medium'; timeoutMs?: number; maxTokens?: number }): Promise<string> {
  const t0 = Date.now();
  const body: Record<string, unknown> = {
    model: env.DRAFT_MODEL,
    instructions: opts.instructions,
    input: typeof opts.input === 'string' ? opts.input : [{ role: 'user', content: opts.input }],
    reasoning: { effort: opts.effort ?? 'low' },
  };
  if (opts.maxTokens) body.max_output_tokens = opts.maxTokens;
  if (opts.schema) body.text = { format: { type: 'json_schema', name: opts.schema.name, schema: opts.schema.schema, strict: true } };
  type Resp = { output?: { type: string; content?: { type: string; text?: string }[] }[]; output_text?: string; usage?: { input_tokens?: number; output_tokens?: number } };
  let j: Resp;
  try {
    j = await openai<Resp>(env, 'responses', body, opts.timeoutMs ?? 45000, 'Responses API');
  } catch (e) {
    await logAI(env, kind, env.DRAFT_MODEL, 0, 0, Date.now() - t0, 0, false);
    throw e;
  }
  const ms = Date.now() - t0;
  const text = j.output_text ?? (j.output || []).flatMap((o) => (o.type === 'message' ? o.content || [] : [])).filter((c) => c.type === 'output_text').map((c) => c.text || '').join('');
  const inTok = j.usage?.input_tokens ?? 0, outTok = j.usage?.output_tokens ?? 0;
  await logAI(env, kind, env.DRAFT_MODEL, inTok, outTok, ms, (inTok / 1e6) * PRICE.draft_in + (outTok / 1e6) * PRICE.draft_out);
  return text.trim();
}

/* ---------------- Vision: read a sheet photo ---------------- */
export const SheetReadSchema = z.object({
  header: z.object({
    program: z.string().default('unknown'),
    site: z.string().default(''),
    date: z.string().default(''),
    facilitator: z.string().default(''),
  }),
  rows: z.array(z.object({
    row_index: z.coerce.number().int(),
    name_as_written: z.string().default(''),
    mark: z.enum(['present', 'absent', 'unclear']).catch('unclear'),
  })).min(1),
});
export type SheetRead = z.infer<typeof SheetReadSchema>;

const READ_PROMPT = 'You read paper attendance sheets from a youth program. This photo is one sheet. Return ONLY JSON with this exact shape: '
  + '{"header":{"program":"mentoring|workshop|counseling|unknown","site":"","date":"","facilitator":""},"rows":[{"row_index":1,"name_as_written":"","mark":"present|absent|unclear"}]}. '
  + 'Include every numbered row that has a handwritten name, in order. Copy each name exactly as written: do not correct spellings, do not expand abbreviations or initials. '
  + 'mark is "present" if the HERE column has a full check mark, "absent" if that box is empty, "unclear" if the mark is partial, faint or ambiguous. '
  + 'For the header copy what is handwritten next to Program, Site, Date and Mentor / Facilitator.';

function parseJSONLoose(s: string): unknown {
  const m = s.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : s);
}

// primaryOnly: for sheets we hold a verified reading of, try only the primary model (bounded by primaryTimeoutMs);
// the caller falls back to the verified reading instead of weaker models that can misread a known sheet.
export async function readSheet(env: Env, image: ArrayBuffer, mime: string, opts: { primaryOnly?: boolean; primaryTimeoutMs?: number } = {}): Promise<{ read: SheetRead; model: string; ms: number; raw: string }> {
  const dataUrl = `data:${mime};base64,${toBase64(image)}`;
  const errors: string[] = [];
  // 1) Workers AI: Mistral Small 3.1 (vision)
  try {
    const t0 = Date.now();
    const r = (await withTimeout(env.AI.run(env.VISION_MODEL as keyof AiModels, {
      messages: [{ role: 'user', content: [{ type: 'text', text: READ_PROMPT }, { type: 'image_url', image_url: { url: dataUrl } }] }],
      max_tokens: 2000, temperature: 0,
    } as never, gw(env) as never), opts.primaryTimeoutMs ?? 40000, 'Workers AI vision')) as { response?: string; choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; neurons?: number } };
    const ms = Date.now() - t0;
    const raw = r.response ?? r.choices?.[0]?.message?.content ?? '';
    const read = SheetReadSchema.parse(parseJSONLoose(raw));
    await logAI(env, 'vision', env.VISION_MODEL, r.usage?.prompt_tokens ?? 0, r.usage?.completion_tokens ?? 0, ms, (r.usage?.neurons ?? 60) * PRICE.neuron);
    return { read, model: env.VISION_MODEL, ms, raw };
  } catch (e) { errors.push(`primary: ${(e as Error).message}`); await logAI(env, 'vision', env.VISION_MODEL, 0, 0, 0, 0, false); }
  if (opts.primaryOnly) throw new Error(errors.join(' | '));
  // 2) Workers AI: Moondream 3.1
  try {
    const t0 = Date.now();
    const r = (await withTimeout(env.AI.run(env.VISION_FALLBACK_MODEL as keyof AiModels, { task: 'query', image: dataUrl, question: READ_PROMPT, reasoning: false, temperature: 0, max_tokens: 2000 } as never, gw(env) as never), 30000, 'Moondream')) as { answer?: string };
    const ms = Date.now() - t0;
    const raw = r.answer ?? '';
    const read = SheetReadSchema.parse(parseJSONLoose(raw));
    await logAI(env, 'vision', env.VISION_FALLBACK_MODEL, 0, 0, ms, 0.0006);
    return { read, model: env.VISION_FALLBACK_MODEL, ms, raw };
  } catch (e) { errors.push(`fallback: ${(e as Error).message}`); }
  // 3) OpenAI vision
  try {
    const t0 = Date.now();
    const raw = await respond(env, 'vision', { instructions: READ_PROMPT, input: [{ type: 'input_text', text: 'Read this sheet.' }, { type: 'input_image', image_url: dataUrl }], effort: 'low', timeoutMs: 40000 });
    const read = SheetReadSchema.parse(parseJSONLoose(raw));
    return { read, model: env.DRAFT_MODEL, ms: Date.now() - t0, raw };
  } catch (e) { errors.push(`openai: ${(e as Error).message}`); }
  throw new Error(errors.join(' | '));
}
