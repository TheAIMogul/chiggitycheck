// Inline edits. Each one re-scores follow-ups for the kids involved and returns a diff of what else changed
// across the app (Calls, Today, Report, the kid, the family), so the UI can show the ripple.
import type { EditResponse, Lang, LiveSummary, Mark, Ripple, Severity } from '../../shared/types';
import { refreshFollowups } from './followups';
import { type Env, HttpError, normalize, nowISO, LANG_NAME, SITE_SHORT } from './util';
import { report } from './views';

type Row = Record<string, any>;

export async function liveSummary(env: Env): Promise<LiveSummary> {
  const c = (await env.DB.prepare(`SELECT SUM(status='open' AND severity IN ('call','urgent')) open, SUM(status='open' AND severity='urgent') urgent, SUM(status='open' AND severity='watch') watch FROM followups`).first()) as Row;
  const r = await report(env);
  const al = (await env.DB.prepare(`SELECT COUNT(*) n FROM aliases WHERE source!='record'`).first()) as Row;
  const sc = (await env.DB.prepare(`SELECT COUNT(*) n FROM signups`).first()) as Row;
  const ls = (await env.DB.prepare(`SELECT s.*, f.household_name FROM signups s LEFT JOIN families f ON f.id=s.family_id ORDER BY s.id DESC LIMIT 1`).first()) as Row | null;
  let last: LiveSummary['last_signup'] = null;
  if (ls) {
    const j = JSON.parse(ls.raw_json);
    last = { id: ls.id, kid: `${j.kid_first ?? ''} ${j.kid_last ?? ''}`.trim(), guardian: `${j.guardian_first ?? ''} ${j.guardian_last ?? ''}`.trim(), status: ls.status, matched_to: ls.status === 'linked' && ls.household_name ? `${ls.household_name} family` : null, family_id: ls.family_id, kid_id: ls.kid_id, at: ls.received_at };
  }
  return { calls_open: c.open ?? 0, urgent: c.urgent ?? 0, watch: c.watch ?? 0, attendance_rate: Number(r.kpis[1].value.replace('%', '')), kids_served: Number(r.kpis[0].value), hours: Number(r.kpis[3].value), sheets: r.data_quality.sheets, aliases: al.n ?? 0, signups: sc.n ?? 0, last_signup: last, updated_at: nowISO(env) };
}

async function kidSnapshot(env: Env, kidId: number) {
  const k = (await env.DB.prepare(`SELECT k.first_name, k.last_name, k.grade, k.school, k.site, k.program, (SELECT severity FROM followups f WHERE f.kid_id=k.id AND f.status='open' ORDER BY created_at DESC LIMIT 1) sev,
    (SELECT id FROM followups f WHERE f.kid_id=k.id AND f.status='open' ORDER BY created_at DESC LIMIT 1) fu,
    (SELECT COUNT(*) FROM attendance a JOIN sessions s ON s.id=a.session_id WHERE a.kid_id=k.id AND a.mark='present' AND s.status='confirmed' AND s.program=k.program AND (k.program!='mentoring' OR s.site=k.site) AND s.held_at BETWEEN '2026-07-01' AND '2026-09-30') p,
    (SELECT COUNT(*) FROM attendance a JOIN sessions s ON s.id=a.session_id WHERE a.kid_id=k.id AND a.mark='absent' AND s.status='confirmed' AND s.program=k.program AND (k.program!='mentoring' OR s.site=k.site) AND s.held_at BETWEEN '2026-07-01' AND '2026-09-30') ab FROM kids k WHERE k.id=?`).bind(kidId).first()) as Row | null;
  if (!k) return null;
  return { name: `${k.first_name} ${k.last_name}`, sev: (k.sev || 'fine') as Severity, fu: k.fu as number | null, rate: k.p + k.ab ? Math.round((k.p / (k.p + k.ab)) * 100) : null, grade: k.grade, school: k.school };
}
const SEV_LABEL: Record<Severity, string> = { fine: 'On track', watch: 'Keep an eye', call: 'Call this week', urgent: 'Urgent' };

async function diff(env: Env, before: LiveSummary, kidIds: number[], kidsBefore: Map<number, Awaited<ReturnType<typeof kidSnapshot>>>): Promise<Ripple[]> {
  const after = await liveSummary(env);
  const out: Ripple[] = [];
  for (const id of kidIds) {
    const b = kidsBefore.get(id), a = await kidSnapshot(env, id);
    if (!a) continue;
    if (b && b.sev !== a.sev) out.push({ kind: (a.sev === 'call' || a.sev === 'urgent') ? 'calls' : 'kid', label: a.name, from: SEV_LABEL[b.sev], to: SEV_LABEL[a.sev], href: (a.sev === 'call' || a.sev === 'urgent') && a.fu ? `/calls/${a.fu}` : `/people/kids/${id}` });
    if (b && b.rate !== a.rate && a.rate !== null) out.push({ kind: 'people', label: `${a.name} · showed up`, from: `${b.rate ?? '–'}%`, to: `${a.rate}%`, href: `/people/kids/${id}` });
    if (b && b.name !== a.name) out.push({ kind: 'people', label: 'Name everywhere', from: b.name, to: a.name, href: `/people/kids/${id}` });
  }
  if (before.calls_open !== after.calls_open) out.push({ kind: 'calls', label: 'Families to call', from: String(before.calls_open), to: String(after.calls_open), href: '/calls' });
  if (before.urgent !== after.urgent) out.push({ kind: 'today', label: 'Urgent', from: String(before.urgent), to: String(after.urgent), href: '/today' });
  if (before.attendance_rate !== after.attendance_rate) out.push({ kind: 'report', label: 'Report · Showed up', from: `${before.attendance_rate}%`, to: `${after.attendance_rate}%`, href: '/report?ev=attendance:all' });
  if (before.kids_served !== after.kids_served) out.push({ kind: 'report', label: 'Report · Kids served', from: String(before.kids_served), to: String(after.kids_served), href: '/report?ev=kids_served' });
  if (before.aliases !== after.aliases) out.push({ kind: 'people', label: 'Spellings learned', from: String(before.aliases), to: String(after.aliases), href: '/report' });
  return out;
}

export async function editAttendance(env: Env, attendanceId: number, mark: Mark): Promise<EditResponse> {
  const t0 = Date.now();
  if (!['present', 'absent', 'unclear'].includes(mark)) throw new HttpError(400, 'mark', 'Mark must be present, absent or unclear.');
  const a = (await env.DB.prepare(`SELECT a.*, s.held_at, s.site FROM attendance a JOIN sessions s ON s.id=a.session_id WHERE a.id=?`).bind(attendanceId).first()) as Row | null;
  if (!a) throw new HttpError(404, 'no_line', 'That attendance line does not exist.');
  const before = await liveSummary(env);
  const kb = new Map([[a.kid_id, await kidSnapshot(env, a.kid_id)]]);
  await env.DB.prepare(`UPDATE attendance SET mark=?, match_method=CASE WHEN match_method='auto' THEN 'staff' ELSE match_method END, confirmed_at=? WHERE id=?`).bind(mark, nowISO(env), attendanceId).run();
  if (a.kid_id) await refreshFollowups(env, [a.kid_id]);
  const k = kb.get(a.kid_id);
  await env.DB.prepare(`INSERT INTO activity (kind, text, bold, link, at) VALUES ('alias', ?, ?, ?, ?)`).bind(`${env.STAFF_NAME} changed ${k?.name ?? 'a line'} on ${SITE_SHORT[a.site] ?? a.site} ${a.held_at} to ${mark === 'present' ? 'here' : mark === 'absent' ? 'missed' : 'unclear'}`, k?.name ?? 'a line', `/people/kids/${a.kid_id}`, nowISO(env)).run();
  return { ok: true, changes: await diff(env, before, a.kid_id ? [a.kid_id] : [], kb), ms: Date.now() - t0 };
}

export async function addAttendance(env: Env, sessionId: number, kidId: number, mark: Mark): Promise<EditResponse> {
  const t0 = Date.now();
  const s = (await env.DB.prepare(`SELECT * FROM sessions WHERE id=?`).bind(sessionId).first()) as Row | null;
  if (!s) throw new HttpError(404, 'no_session', 'No such session.');
  const before = await liveSummary(env);
  const kb = new Map([[kidId, await kidSnapshot(env, kidId)]]);
  const exists = await env.DB.prepare(`SELECT id FROM attendance WHERE session_id=? AND kid_id=?`).bind(sessionId, kidId).first<Row>();
  if (exists) await env.DB.prepare(`UPDATE attendance SET mark=?, confirmed_at=? WHERE id=?`).bind(mark, nowISO(env), exists.id).run();
  else {
    const n = (await env.DB.prepare(`SELECT COUNT(*) n FROM attendance WHERE session_id=?`).bind(sessionId).first()) as Row;
    const k = kb.get(kidId);
    await env.DB.prepare(`INSERT INTO attendance (session_id, kid_id, raw_text, mark, row_index, match_probability, match_method, confirmed_at) VALUES (?,?,?,?,?,1,'staff',?)`).bind(sessionId, kidId, k?.name ?? '', mark, (n.n ?? 0) + 1, nowISO(env)).run();
  }
  await refreshFollowups(env, [kidId]);
  return { ok: true, changes: await diff(env, before, [kidId], kb), ms: Date.now() - t0 };
}

export async function editKid(env: Env, kidId: number, body: Record<string, unknown>): Promise<EditResponse> {
  const t0 = Date.now();
  const allowed = ['first_name', 'last_name', 'preferred_name', 'grade', 'school', 'program', 'site', 'status'];
  const sets = Object.entries(body).filter(([k, v]) => allowed.includes(k) && typeof v === 'string');
  if (!sets.length) throw new HttpError(400, 'fields', 'Nothing to change.');
  const k = (await env.DB.prepare(`SELECT * FROM kids WHERE id=?`).bind(kidId).first()) as Row | null;
  if (!k) throw new HttpError(404, 'no_kid', 'No such kid.');
  const before = await liveSummary(env);
  const kb = new Map([[kidId, await kidSnapshot(env, kidId)]]);
  await env.DB.prepare(`UPDATE kids SET ${sets.map(([c]) => `${c}=?`).join(', ')} WHERE id=?`).bind(...sets.map(([, v]) => String(v).trim()), kidId).run();
  const nk = (await env.DB.prepare(`SELECT * FROM kids WHERE id=?`).bind(kidId).first()) as Row;
  if (nk.school !== k.school) await env.DB.prepare(`INSERT INTO kid_status_history (kid_id, from_status, to_status, from_school, to_school, changed_at, note) VALUES (?,?,?,?,?,?,?)`).bind(kidId, k.status, nk.status === 'active' ? 'changed_school' : nk.status, k.school, nk.school, env.DEMO_TODAY, `Changed by ${env.STAFF_NAME}`).run();
  if (nk.school !== k.school && nk.status === 'active') await env.DB.prepare(`UPDATE kids SET status='changed_school' WHERE id=?`).bind(kidId).run();
  const name = `${nk.first_name} ${nk.last_name}`;
  await env.DB.prepare(`INSERT OR IGNORE INTO aliases (entity, entity_id, raw_text, normalized, source, probability, first_seen_at) VALUES ('kid',?,?,?,'record',1,?)`).bind(kidId, name, normalize(name), nowISO(env)).run();
  await refreshFollowups(env, [kidId]);
  const changes = await diff(env, before, [kidId], kb);
  if (nk.school !== k.school) changes.unshift({ kind: 'report', label: 'School history kept · counted once', from: k.school, to: nk.school, href: `/people/kids/${kidId}` });
  return { ok: true, changes, ms: Date.now() - t0 };
}

export async function editFamily(env: Env, familyId: number, body: Record<string, unknown>): Promise<EditResponse> {
  const t0 = Date.now();
  const allowed = ['primary_contact_name', 'relationship', 'phone', 'language', 'neighborhood', 'household_name', 'email'];
  const sets = Object.entries(body).filter(([k, v]) => allowed.includes(k) && typeof v === 'string');
  if (!sets.length) throw new HttpError(400, 'fields', 'Nothing to change.');
  const f = (await env.DB.prepare(`SELECT * FROM families WHERE id=?`).bind(familyId).first()) as Row | null;
  if (!f) throw new HttpError(404, 'no_family', 'No such family.');
  if (body.language && !['en', 'es', 'ht'].includes(String(body.language))) throw new HttpError(400, 'language', 'Language must be en, es or ht.');
  const before = await liveSummary(env);
  const kids = ((await env.DB.prepare(`SELECT id FROM kids WHERE family_id=? AND program!='counseling'`).bind(familyId).all()).results as Row[]).map((r) => r.id);
  const kb = new Map<number, Awaited<ReturnType<typeof kidSnapshot>>>();
  for (const id of kids) kb.set(id, await kidSnapshot(env, id));
  await env.DB.prepare(`UPDATE families SET ${sets.map(([c]) => `${c}=?`).join(', ')} WHERE id=?`).bind(...sets.map(([, v]) => String(v).trim()), familyId).run();
  const changes: Ripple[] = [];
  if (body.primary_contact_name && String(body.primary_contact_name) !== f.primary_contact_name) {
    await env.DB.prepare(`INSERT OR IGNORE INTO aliases (entity, entity_id, raw_text, normalized, source, probability, first_seen_at) VALUES ('family',?,?,?,'record',1,?)`).bind(familyId, String(body.primary_contact_name), normalize(String(body.primary_contact_name)), nowISO(env)).run();
    changes.push({ kind: 'family', label: 'Guardian name everywhere', from: f.primary_contact_name, to: String(body.primary_contact_name).trim(), href: `/people/families/${familyId}` });
  }
  if (body.language && body.language !== f.language) {
    // open drafts must be rewritten in the new language
    await env.DB.prepare(`UPDATE followups SET language=?, draft_text=NULL, draft_translation=NULL, updated_at=? WHERE family_id=? AND status='open'`).bind(body.language, nowISO(env), familyId).run();
    await refreshFollowups(env, kids);
    changes.push({ kind: 'calls', label: 'Message language', from: LANG_NAME[f.language], to: LANG_NAME[body.language as Lang], href: '/calls' });
  }
  if (body.phone && body.phone !== f.phone) changes.push({ kind: 'calls', label: 'Phone on every call', from: f.phone, to: String(body.phone).trim(), href: '/calls' });
  return { ok: true, changes: [...changes, ...(await diff(env, before, kids, kb))], ms: Date.now() - t0 };
}
