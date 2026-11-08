// Makes a real-looking photo for every history sheet, then checks each one with gpt-5.5 vision:
// same names in the same rows, same check marks. A sheet that drifts is regenerated (up to 3 tries).
// usage: node scripts/realistic-batch.mjs [s36 s37 ...]   (default: every session)  · results: reports/real-sheets/qa.json
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const key = readFileSync(join(homedir(), '.config/openai/chiggitycheck-image-key'), 'utf8').trim();
const seed = JSON.parse(readFileSync(join(ROOT, 'seed/seed.json'), 'utf8'));
const QA = join(ROOT, 'reports/real-sheets/qa.json');
const qa = existsSync(QA) ? JSON.parse(readFileSync(QA, 'utf8')) : {};
const want = process.argv.slice(2);
const sessions = seed.sessions.filter((s) => s.program !== 'counseling' && (!want.length || want.includes(`s${s.id}`)));

const norm = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
function lev(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }

async function check(png, rows) {
  const b64 = readFileSync(png).toString('base64');
  const body = { model: 'gpt-5.5', reasoning: { effort: 'low' }, input: [{ role: 'user', content: [
    { type: 'input_text', text: 'This is a photo of a paper attendance sheet. For every numbered row that has a handwritten name, return the row number, the name exactly as written, and the HERE column: "check" for a full check mark, "partial" for a faint or half mark, "empty" for nothing.' },
    { type: 'input_image', image_url: `data:image/png;base64,${b64}` }] }],
    text: { format: { type: 'json_schema', name: 'sheet', strict: true, schema: { type: 'object', additionalProperties: false, required: ['rows'], properties: { rows: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['row', 'name', 'here'], properties: { row: { type: 'integer' }, name: { type: 'string' }, here: { type: 'string', enum: ['check', 'partial', 'empty'] } } } } } } } } };
  const res = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(j).slice(0, 300));
  const text = j.output.flatMap((o) => o.content || []).find((c) => c.type === 'output_text').text;
  const got = JSON.parse(text).rows;
  const problems = [];
  if (got.length !== rows.length) problems.push(`rows ${got.length} vs ${rows.length}`);
  for (const r of rows) {
    const g = got.find((x) => x.row === r.row_index);
    if (!g) { problems.push(`row ${r.row_index} missing`); continue; }
    const a = norm(r.raw_text), b = norm(g.name);
    if (lev(a, b) > Math.max(2, Math.floor(a.length * 0.25))) problems.push(`row ${r.row_index} name "${g.name}" vs "${r.raw_text}"`);
    const exp = r.mark === 'present' ? 'check' : r.mark === 'unclear' ? 'partial' : 'empty';
    const ok = exp === g.here || (exp === 'partial' && g.here !== 'empty') ;
    if (!ok) problems.push(`row ${r.row_index} mark ${g.here} vs ${exp}`);
  }
  return problems;
}

async function one(s) {
  const name = `s${s.id}`;
  if (qa[name]?.ok && existsSync(join(ROOT, 'sheets/real', name + '.png'))) return;
  const rows = seed.attendance.filter((a) => a.session_id === s.id).sort((a, b) => a.row_index - b.row_index);
  const desc = rows.map((r) => `${r.row_index} ${r.raw_text} (${r.mark === 'present' ? 'check' : r.mark === 'unclear' ? 'only a faint half stroke' : 'HERE cell empty'})`).join(', ');
  let best = null;
  for (let t = 1; t <= 3; t++) {
    try {
      const { stdout } = await run('node', [join(ROOT, 'scripts/realistic-sheet.mjs'), name, desc], { maxBuffer: 1 << 24, timeout: 300000 });
      const out = JSON.parse(stdout.trim().split('\n').pop()).outs[0];
      const problems = await check(out, rows);
      const keep = join(ROOT, 'sheets/real', `${name}.try${t}.png`); copyFileSync(out, keep);
      if (!best || problems.length < best.problems.length) best = { keep, problems, t };
      console.log(name, 'try', t, problems.length ? problems.join('; ') : 'OK');
      if (!problems.length) break;
    } catch (e) { console.log(name, 'try', t, 'error', String(e.message || e).slice(0, 200)); }
  }
  if (best) { copyFileSync(best.keep, join(ROOT, 'sheets/real', name + '.png')); qa[name] = { ok: !best.problems.length, problems: best.problems, tries: best.t }; writeFileSync(QA, JSON.stringify(qa, null, 1)); }
}

const queue = [...sessions];
await Promise.all(Array.from({ length: 3 }, async () => { while (queue.length) await one(queue.shift()); }));
console.log('done', Object.values(qa).filter((x) => x.ok).length, 'ok of', Object.keys(qa).length);
