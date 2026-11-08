// "Build a dataset": a typed request becomes real records (families, kids, mentors, sessions, attendance, hours, sign-ups)
// written to D1, then scored by the same follow-up engine. Sheets for generated sessions render as SVG from their rows.
import { z } from 'zod';
import type { ScenarioResult } from '../../shared/types';
import { respond } from './ai';
import { refreshFollowups } from './followups';
import { type Env, HttpError, addDays, md, nameScore, normalize, nowISO, stripAccents, time12 } from './util';

type Row = Record<string, any>;
const Pattern = z.enum(['regular', 'slipping', 'stopped', 'new', 'never']);
const DatasetSchema = z.object({
  title: z.string(), summary: z.string(),
  site: z.object({ name: z.string(), neighborhood: z.string() }),
  program: z.enum(['mentoring', 'workshop', 'counseling']),
  weekday: z.number().int().min(0).max(6), start_time: z.string(), first_date: z.string(), sessions: z.number().int().min(0).max(14),
  new_mentors: z.array(z.object({ full_name: z.string() })),
  families: z.array(z.object({
    existing_household: z.string().nullable(), household_name: z.string(), guardian_name: z.string(), relationship: z.string(),
    language: z.enum(['en', 'es', 'ht']),
    kids: z.array(z.object({ first_name: z.string(), last_name: z.string(), grade: z.string(), school: z.string(), pattern: Pattern, stopped_after: z.string().nullable(), mentor_full_name: z.string().nullable() })),
  })),
  signup_source: z.enum(['webform', 'back-to-school fair', 'paper intake']),
  existing_kid_matches: z.array(z.object({ kid_name: z.string(), mentor_full_name: z.string() })),
});
type Dataset = z.infer<typeof DatasetSchema>;

const nstr = { type: ['string', 'null'] };
const JSON_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'summary', 'site', 'program', 'weekday', 'start_time', 'first_date', 'sessions', 'new_mentors', 'families', 'signup_source', 'existing_kid_matches'],
  properties: {
    title: { type: 'string', description: 'Short name for what was created, e.g. "Saturday soccer at Miami Jackson"' },
    summary: { type: 'string', description: 'One sentence a program manager would say about it.' },
    site: { type: 'object', additionalProperties: false, required: ['name', 'neighborhood'], properties: { name: { type: 'string' }, neighborhood: { type: 'string' } } },
    program: { type: 'string', enum: ['mentoring', 'workshop', 'counseling'] },
    weekday: { type: 'integer', description: '0 Sunday … 6 Saturday' }, start_time: { type: 'string', description: 'HH:MM 24h' },
    first_date: { type: 'string', description: 'YYYY-MM-DD of the first session, on the weekday' }, sessions: { type: 'integer', description: 'How many sessions have already happened (0-14)' },
    new_mentors: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['full_name'], properties: { full_name: { type: 'string' } } } },
    families: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['existing_household', 'household_name', 'guardian_name', 'relationship', 'language', 'kids'], properties: {
      existing_household: { ...nstr, description: 'Exact household name from the existing list if this is a family the program already serves, else null' },
      household_name: { type: 'string' }, guardian_name: { type: 'string' }, relationship: { type: 'string' }, language: { type: 'string', enum: ['en', 'es', 'ht'] },
      kids: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['first_name', 'last_name', 'grade', 'school', 'pattern', 'stopped_after', 'mentor_full_name'], properties: {
        first_name: { type: 'string' }, last_name: { type: 'string' }, grade: { type: 'string', description: 'e.g. 6th' }, school: { type: 'string', description: 'A real Miami-Dade school near the site' },
        pattern: { type: 'string', enum: ['regular', 'slipping', 'stopped', 'new', 'never'], description: 'regular = comes most weeks; slipping = missed the last two; stopped = stopped coming after stopped_after; new = joined in the last two weeks; never = signed up, never came' },
        stopped_after: { ...nstr, description: 'YYYY-MM-DD, only for stopped' }, mentor_full_name: { ...nstr, description: 'Mentor for mentoring programs (new or existing mentor name), else null' },
      } } },
    } } },
    signup_source: { type: 'string', enum: ['webform', 'back-to-school fair', 'paper intake'] },
    existing_kid_matches: { type: 'array', description: 'Only when the request assigns a mentor to kids already enrolled', items: { type: 'object', additionalProperties: false, required: ['kid_name', 'mentor_full_name'], properties: { kid_name: { type: 'string' }, mentor_full_name: { type: 'string' } } } },
  },
};

function rng(seed: number) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const ABBR: Record<string, string> = { ramirez: 'Rmz', hernandez: 'Hdz', fernandez: 'Fdz', rodriguez: 'Rdz', martinez: 'Mtz', gonzalez: 'Glz' };
function spelling(first: string, last: string, r: () => number): string {
  const f = stripAccents(first), l = stripAccents(last);
  const v = [`${first} ${last}`, `${f} ${l}`, `${f} ${l}`, `${f} ${l[0]}.`, `${f[0]}. ${l}`];
  if (ABBR[normalize(last)]) v.push(`${f} ${ABBR[normalize(last)]}`);
  return v[Math.floor(r() * v.length)];
}
const PHONE = () => `(305) 555-0${String(100 + Math.floor(Math.random() * 99)).padStart(3, '0')}`;
export const ROW_BOX = (i: number): [number, number, number, number] => [(120 + 60) / 1200, (150 + 380 + i * 56) / 1600, (960 - 120) / 1200, 56 / 1600];

export async function buildScenario(env: Env, prompt: string): Promise<ScenarioResult> {
  if (!prompt || prompt.trim().length < 8) throw new HttpError(400, 'prompt', 'Describe a program, a site, kids and what happened.');
  const t0 = Date.now();
  const steps: ScenarioResult['steps'] = [];
  const families = (await env.DB.prepare(`SELECT id, household_name, primary_contact_name, language, neighborhood FROM families`).all()).results as Row[];
  const mentors = (await env.DB.prepare(`SELECT id, full_name FROM mentors`).all()).results as Row[];
  const kidsAll = (await env.DB.prepare(`SELECT id, first_name, last_name, family_id, program, site FROM kids WHERE program!='counseling'`).all()).results as Row[];
  const sites = (await env.DB.prepare(`SELECT DISTINCT site FROM sessions WHERE site != ''`).all()).results as Row[];

  // 1) The model writes the dataset
  let t = Date.now();
  const raw = await respond(env, 'scenario', {
    instructions: `You create realistic program data for ${env.ORG_NAME}, a Miami-Dade youth nonprofit serving Little Havana and West Little River families in English, Spanish and Haitian Creole. Today is ${env.DEMO_TODAY}; the quarter started 2026-07-01. Turn the staff member's request into a dataset. Follow every number and detail in the request exactly. Use realistic Miami names that fit each family's language. Sessions must fall on or before ${env.DEMO_TODAY}, on the chosen weekday, weekly. If the request mentions families or kids the program already has, use the exact household name from the existing list in existing_household. Use real Miami-Dade schools near the site. Keep it believable: most kids attend regularly unless the request says otherwise.`,
    input: `Request: ${prompt}\n\nExisting households (name · guardian · language): ${families.slice(0, 60).map((f) => `${f.household_name} · ${f.primary_contact_name} · ${f.language}`).join('; ')}\nExisting mentors: ${mentors.map((m) => m.full_name).join(', ')}\nExisting sites: ${sites.map((s) => s.site).join(', ')}\nExisting kids: ${kidsAll.slice(0, 80).map((k) => `${k.first_name} ${k.last_name}`).join(', ')}`,
    schema: { name: 'dataset', schema: JSON_SCHEMA }, effort: 'low', timeoutMs: 90000,
  });
  const ds: Dataset = DatasetSchema.parse(JSON.parse(raw));
  steps.push({ label: 'Model wrote the dataset', ms: Date.now() - t });

  // 2) Validate and expand into records
  t = Date.now();
  const r = rng(prompt.length * 7919 + Date.now() % 1000);
  const now = nowISO(env);
  const sc = await env.DB.prepare(`INSERT INTO scenarios (prompt, title, summary, model, created_at) VALUES (?,?,?,?,?)`).bind(prompt, ds.title, ds.summary, env.DRAFT_MODEL, now).run();
  const scenarioId = Number(sc.meta.last_row_id);
  const sessionsN = Math.min(ds.sessions, 14);
  let first = /^\d{4}-\d{2}-\d{2}$/.test(ds.first_date) ? ds.first_date : addDays(env.DEMO_TODAY, -7 * Math.max(1, sessionsN - 1));
  while (new Date(first + 'T12:00:00Z').getUTCDay() !== ds.weekday) first = addDays(first, 1);
  let dates = Array.from({ length: sessionsN }, (_, i) => addDays(first, i * 7)).filter((d) => d <= env.DEMO_TODAY);
  if (dates.length < sessionsN) { let last: string = env.DEMO_TODAY; while (new Date(last + 'T12:00:00Z').getUTCDay() !== ds.weekday) last = addDays(last, -1); dates = Array.from({ length: sessionsN }, (_, i) => addDays(last, -7 * (sessionsN - 1 - i))); }
  const site = ds.site.name.trim();
  const created = { families: 0, kids: 0, mentors: 0, sessions: 0, attendance: 0, hours: 0, signups: 0, followups: 0 };
  const highlights: ScenarioResult['highlights'] = [];

  // mentors
  const mentorId = new Map<string, number>(mentors.map((m) => [normalize(m.full_name), m.id]));
  for (const m of ds.new_mentors) {
    if (mentorId.has(normalize(m.full_name))) continue;
    const em = `${normalize(m.full_name).replace(' ', '.').replace(/ /g, '')}@volunteer.tidepath.org`;
    const ins = await env.DB.prepare(`INSERT INTO mentors (full_name, phone, email, created_at) VALUES (?,?,?,?)`).bind(m.full_name, PHONE(), em, now).run();
    mentorId.set(normalize(m.full_name), Number(ins.meta.last_row_id)); created.mentors++;
    await env.DB.prepare(`INSERT OR IGNORE INTO aliases (entity, entity_id, raw_text, normalized, source, probability, first_seen_at) VALUES ('mentor',?,?,?,'record',1,?)`).bind(ins.meta.last_row_id, m.full_name, normalize(m.full_name), now).run();
    highlights.push({ label: `New mentor: ${m.full_name}`, detail: 'Profile and hours', href: `/people/mentors/${ins.meta.last_row_id}` });
  }
  const facilitatorId = ds.new_mentors[0] ? mentorId.get(normalize(ds.new_mentors[0].full_name)) ?? null : null;

  // families & kids
  type K = { id: number; first: string; last: string; pattern: string; stopped_after: string | null; mentor: string | null; famId: number };
  const kids: K[] = [];
  for (const f of ds.families) {
    let famId: number | null = null;
    let merged = false;
    if (f.existing_household) {
      const hit = families.find((x) => normalize(x.household_name) === normalize(f.existing_household!)) || families.find((x) => nameScore(f.guardian_name, x.primary_contact_name.split(' ')[0], x.primary_contact_name.split(' ').slice(1).join(' ')) > 0.85);
      if (hit) { famId = hit.id; merged = true; }
    }
    if (!famId) {
      const ins = await env.DB.prepare(`INSERT INTO families (household_name, primary_contact_name, relationship, phone, language, address, neighborhood, created_from, scenario_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .bind(f.household_name, f.guardian_name, f.relationship || 'Mom', PHONE(), f.language, `${1000 + Math.floor(r() * 8000)} ${ds.site.neighborhood}`, ds.site.neighborhood, ds.signup_source, scenarioId, now).run();
      famId = Number(ins.meta.last_row_id); created.families++;
      await env.DB.prepare(`INSERT OR IGNORE INTO aliases (entity, entity_id, raw_text, normalized, source, probability, first_seen_at) VALUES ('family',?,?,?,'record',1,?)`).bind(famId, f.guardian_name, normalize(f.guardian_name), now).run();
    } else {
      await env.DB.prepare(`INSERT OR IGNORE INTO aliases (entity, entity_id, raw_text, normalized, source, source_ref, probability, first_seen_at) VALUES ('family',?,?,?,'form',?,0.95,?)`).bind(famId, f.guardian_name, normalize(f.guardian_name), `scenario:${scenarioId}`, now).run();
      highlights.push({ label: `${f.household_name}: already a family`, detail: 'Linked instead of creating a duplicate', href: `/people/families/${famId}` });
    }
    for (const k of f.kids) {
      const enrolled = k.pattern === 'new' ? addDays(env.DEMO_TODAY, -12) : addDays(dates[0] || env.DEMO_TODAY, -5);
      const ins = await env.DB.prepare(`INSERT INTO kids (family_id, first_name, last_name, school, grade, program, site, enrolled_at, scenario_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .bind(famId, k.first_name, k.last_name, k.school, k.grade, ds.program, site, enrolled, scenarioId, now).run();
      const id = Number(ins.meta.last_row_id); created.kids++;
      kids.push({ id, first: k.first_name, last: k.last_name, pattern: k.pattern, stopped_after: k.stopped_after, mentor: k.mentor_full_name, famId });
      await env.DB.prepare(`INSERT OR IGNORE INTO aliases (entity, entity_id, raw_text, normalized, source, probability, first_seen_at) VALUES ('kid',?,?,?,'record',1,?)`).bind(id, `${k.first_name} ${k.last_name}`, normalize(`${k.first_name} ${k.last_name}`), now).run();
      const [gf, ...gl] = f.guardian_name.split(' ');
      await env.DB.prepare(`INSERT INTO signups (source, raw_json, received_at, family_id, kid_id, resolve_probability, resolved_by, status) VALUES (?,?,?,?,?,?,?,?)`)
        .bind(ds.signup_source, JSON.stringify({ guardian_first: gf, guardian_last: gl.join(' '), language: f.language, kid_first: k.first_name, kid_last: k.last_name, grade: k.grade, school: k.school, program: ds.program, neighborhood: ds.site.neighborhood }), `${addDays(enrolled, -2)}T18:30:00`, famId, id, merged ? 0.95 : null, merged ? 'decisions' : 'new', merged ? 'linked' : 'new').run();
      created.signups++;
      if (merged) highlights.push({ label: `${k.first_name} ${k.last_name}`, detail: `Added to the existing ${f.household_name} family`, href: `/people/kids/${id}` });
      if (k.mentor_full_name) {
        let mid = mentorId.get(normalize(k.mentor_full_name));
        if (!mid) { const ins2 = await env.DB.prepare(`INSERT INTO mentors (full_name, phone, created_at) VALUES (?,?,?)`).bind(k.mentor_full_name, PHONE(), now).run(); mid = Number(ins2.meta.last_row_id); mentorId.set(normalize(k.mentor_full_name), mid); created.mentors++; }
        await env.DB.prepare(`INSERT INTO matches (kid_id, mentor_id, started_at) VALUES (?,?,?)`).bind(id, mid, enrolled).run();
      }
    }
  }
  for (const m of ds.existing_kid_matches) {
    const kid = kidsAll.map((k) => ({ k, s: nameScore(m.kid_name, k.first_name, k.last_name) })).sort((a, b) => b.s - a.s)[0];
    const mid = mentorId.get(normalize(m.mentor_full_name));
    if (kid && kid.s > 0.85 && mid) {
      await env.DB.prepare(`UPDATE matches SET ended_at=? WHERE kid_id=? AND ended_at IS NULL`).bind(env.DEMO_TODAY, kid.k.id).run();
      await env.DB.prepare(`INSERT INTO matches (kid_id, mentor_id, started_at) VALUES (?,?,?)`).bind(kid.k.id, mid, dates[0] || env.DEMO_TODAY).run();
      highlights.push({ label: `${kid.k.first_name} ${kid.k.last_name} → ${m.mentor_full_name}`, detail: 'New mentor match', href: `/people/kids/${kid.k.id}` });
    }
  }

  // sessions & attendance
  const stmts: D1PreparedStatement[] = [];
  for (let si = 0; si < dates.length; si++) {
    const d = dates[si];
    const ins = await env.DB.prepare(`INSERT INTO sessions (program, site, held_at, start_time, facilitator_mentor_id, source, photo_url, header_confidence, status, captured_by, captured_at, scenario_id, title, created_at) VALUES (?,?,?,?,?, 'photo', NULL, 0.9, 'confirmed', ?, ?, ?, ?, ?)`)
      .bind(ds.program, site, d, ds.start_time, facilitatorId, env.STAFF_NAME, `${d}T${ds.start_time}:00`, scenarioId, ds.title, now).run();
    const sid = Number(ins.meta.last_row_id); created.sessions++;
    await env.DB.prepare(`UPDATE sessions SET photo_url=? WHERE id=?`).bind(`/api/sheets/${sid}/image.svg`, sid).run();
    let row = 0;
    for (const k of kids) {
      if (k.pattern === 'never') continue;
      const isLast2 = si >= dates.length - 2;
      let mark: 'present' | 'absent' = 'present';
      if (k.pattern === 'new' && d < addDays(env.DEMO_TODAY, -12)) continue;
      if (k.pattern === 'slipping' && isLast2) mark = 'absent';
      if (k.pattern === 'stopped' && ((k.stopped_after && d > k.stopped_after) || (!k.stopped_after && si >= dates.length - 3))) mark = 'absent';
      if (k.pattern === 'regular' && r() < 0.08 && !isLast2) mark = 'absent';
      const raw = spelling(k.first, k.last, r);
      stmts.push(env.DB.prepare(`INSERT INTO attendance (session_id, kid_id, raw_text, mark, row_index, bbox, match_probability, match_method, confirmed_at) VALUES (?,?,?,?,?,?,?, 'auto', ?)`)
        .bind(sid, k.id, raw, mark, row + 1, JSON.stringify(ROW_BOX(row)), Number((0.9 + r() * 0.09).toFixed(2)), `${d}T${ds.start_time}:00`));
      stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO aliases (entity, entity_id, raw_text, normalized, source, source_ref, probability, first_seen_at) VALUES ('kid',?,?,?,'sheet',?,0.95,?)`).bind(k.id, raw, normalize(raw), `session:${sid}:${row + 1}`, `${d}T${ds.start_time}:00`));
      row++; created.attendance++;
    }
    for (const [name, mid] of mentorId) {
      if (!ds.new_mentors.some((m) => normalize(m.full_name) === name) && !kids.some((k) => k.mentor && normalize(k.mentor) === name)) continue;
      stmts.push(env.DB.prepare(`INSERT INTO hours (mentor_id, session_id, held_on, site, program, hours, reported_at, source, dedupe_key) VALUES (?,?,?,?,?,2,?,?,?)`)
        .bind(mid, sid, d, site, ds.program, `${d}T20:00:00`, mid === facilitatorId ? 'sheet' : 'form', `${mid}|${d}|${site}|${ds.program}`));
      created.hours++;
    }
  }
  for (let i = 0; i < stmts.length; i += 80) await env.DB.batch(stmts.slice(i, i + 80));
  steps.push({ label: `Checked and saved ${created.families + created.kids + created.mentors + created.sessions + created.attendance + created.hours + created.signups} records`, ms: Date.now() - t });

  // 3) Same follow-up engine as real sheets
  t = Date.now();
  const fu = await refreshFollowups(env, kids.filter((k) => k.pattern !== 'never').map((k) => k.id));
  created.followups = fu.created.length + fu.updated.length;
  for (const c of fu.created) highlights.unshift({ label: `${c.kid_name}: ${c.severity === 'urgent' ? 'Urgent' : 'Call this week'}`, detail: 'Message drafted in the family language', href: `/calls/${c.followup_id}` });
  steps.push({ label: 'Scored follow-ups and drafted messages', ms: Date.now() - t });
  if (dates.length) highlights.push({ label: `${site} in the report`, detail: 'Every new number links to its sheet', href: `/report?ev=${encodeURIComponent(`attendance:site:${site}`)}` });

  const ms = Date.now() - t0;
  await env.DB.prepare(`UPDATE scenarios SET ms=?, created_json=?, steps_json=?, highlights_json=?, dataset_json=? WHERE id=?`).bind(ms, JSON.stringify(created), JSON.stringify(steps), JSON.stringify(highlights), raw, scenarioId).run();
  await env.DB.prepare(`INSERT INTO activity (kind, text, bold, link, at) VALUES ('merge', ?, ?, '/lab', ?)`).bind(`Built "${ds.title}": ${created.kids} kids, ${created.sessions} sessions`, ds.title, now).run();
  return { id: scenarioId, prompt, title: ds.title, summary: ds.summary, model: env.DRAFT_MODEL, ms, created_at: now, created, steps, highlights };
}

export async function listScenarios(env: Env): Promise<ScenarioResult[]> {
  const rows = (await env.DB.prepare(`SELECT * FROM scenarios WHERE created_json IS NOT NULL ORDER BY id DESC LIMIT 20`).all()).results as Row[];
  return rows.map((s) => ({ id: s.id, prompt: s.prompt, title: s.title, summary: s.summary, model: s.model, ms: s.ms, created_at: s.created_at, created: JSON.parse(s.created_json), steps: JSON.parse(s.steps_json || '[]'), highlights: JSON.parse(s.highlights_json || '[]') }));
}

/** Render a sheet photo for sessions that have no camera photo (built datasets). Same geometry as the printed template. */
export async function sheetSvg(env: Env, sessionId: number): Promise<string> {
  const s = await env.DB.prepare(`SELECT s.*, m.full_name FROM sessions s LEFT JOIN mentors m ON m.id=s.facilitator_mentor_id WHERE s.id=?`).bind(sessionId).first<Row>();
  if (!s) throw new HttpError(404, 'no_session', 'No such sheet');
  const rows = (await env.DB.prepare(`SELECT raw_text, mark, row_index FROM attendance WHERE session_id=? ORDER BY row_index`).bind(sessionId).all()).results as Row[];
  const esc = (x: string) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const hand = `font-family="Bradley Hand, 'Segoe Print', 'Comic Sans MS', cursive" fill="#1b2a6b"`;
  const n = Math.max(16, rows.length);
  const lines = Array.from({ length: n }, (_, i) => {
    const r = rows[i]; const y = 380 + i * 56;
    const chk = r?.mark === 'present' ? `<path d="M${788} ${y + 30} l12 14 l26 -34" stroke="#1b2a6b" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : r?.mark === 'unclear' ? `<path d="M${790} ${y + 30} l9 11" stroke="#1b2a6b" stroke-width="3.5" stroke-linecap="round"/>` : '';
    return `<line x1="60" x2="900" y1="${y + 56}" y2="${y + 56}" stroke="#d4cdbd" stroke-width="1.4"/><text x="64" y="${y + 40}" font-size="15" fill="#9a958a" font-family="Inter, Arial">${i + 1}</text>${r ? `<text x="118" y="${y + 44}" font-size="32" ${hand}>${esc(r.raw_text)}</text>` : ''}${chk}`;
  }).join('');
  const date = s.held_at ? `${Number(s.held_at.slice(5, 7))}/${Number(s.held_at.slice(8, 10))}/${s.held_at.slice(2, 4)}` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
<defs><linearGradient id="w" x1="0" x2="1"><stop offset="0" stop-color="#6b4a32"/><stop offset="1" stop-color="#7a5640"/></linearGradient></defs>
<rect width="1200" height="1600" fill="url(#w)"/><rect x="74" y="80" width="1052" height="1460" rx="26" fill="#8a5d3b"/>
<rect x="450" y="46" width="300" height="96" rx="16" fill="#c9ced3"/>
<g transform="translate(120,150)"><rect width="960" height="1340" fill="#fbfaf5"/>
<text x="60" y="110" font-size="26" font-weight="700" letter-spacing="2" fill="#3a3833" font-family="Inter, Arial">TIDEPATH FAMILY ALLIANCE</text>
<text x="900" y="110" text-anchor="end" font-size="20" fill="#66625a" font-family="Inter, Arial">${esc(s.title || 'Attendance')}</text>
<text x="60" y="200" font-size="19" fill="#55524a" font-family="Inter, Arial">Program:</text><text x="160" y="204" font-size="32" ${hand}>${esc(s.program)}</text>
<text x="500" y="200" font-size="19" fill="#55524a" font-family="Inter, Arial">Site:</text><text x="560" y="204" font-size="30" ${hand}>${esc(s.site)}</text>
<text x="60" y="270" font-size="19" fill="#55524a" font-family="Inter, Arial">Date:</text><text x="130" y="274" font-size="32" ${hand}>${date}</text>
<text x="500" y="270" font-size="19" fill="#55524a" font-family="Inter, Arial">Mentor / Facilitator:</text><text x="700" y="274" font-size="30" ${hand}>${esc((s.full_name || '').split(' ')[0])}</text>
<text x="64" y="370" font-size="17" font-weight="700" fill="#3a3833" font-family="Inter, Arial">#</text><text x="118" y="370" font-size="17" font-weight="700" fill="#3a3833" font-family="Inter, Arial">NAME</text><text x="870" y="370" text-anchor="end" font-size="17" font-weight="700" fill="#3a3833" font-family="Inter, Arial">HERE ✓</text>
<line x1="60" x2="900" y1="380" y2="380" stroke="#2b2925" stroke-width="3"/>${lines}</g></svg>`;
}
export { md, time12 };
