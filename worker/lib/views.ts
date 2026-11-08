// Read models for every screen, computed live from D1.
import type {
  BBox, Breakdown, ChannelMessage, EvidenceResponse, FamilyDetail, FamilyListItem, Fact, FollowupItem, KidDetail, KidListItem, Lang, Mark,
  MentorDetail, MentorListItem, ReportResponse, SearchResult, Severity, SignupItem, StripDot, WeekResponse, WeekSession,
} from '../../shared/types';
import { SAMPLES } from '../seed/samples';
import { fmtNext, nextSession, SEV_RANK } from './followups';
import { type Env, addDays, daysBetween, dow, initials, md, normalize, time12, weekRange, LANG_NAME, PROGRAM_LABEL, SITE_SHORT } from './util';

type Row = Record<string, any>;
const all = async (env: Env, sql: string, ...b: unknown[]) => ((await env.DB.prepare(sql).bind(...b).all()).results as Row[]);
const one = async (env: Env, sql: string, ...b: unknown[]) => (await env.DB.prepare(sql).bind(...b).first()) as Row | null;
const Q = { start: '2026-07-01', end: '2026-09-30' };
const pct = (p: number, a: number) => (p + a ? Math.round((p / (p + a)) * 1000) / 10 : null);
const parseBox = (s: string | null): BBox | null => { try { return s ? (JSON.parse(s) as BBox) : null; } catch { return null; } };

/* ---------------- shared: strips & follow-ups ---------------- */
async function stripsFor(env: Env, kidIds: number[]): Promise<Map<number, StripDot[]>> {
  const out = new Map<number, StripDot[]>();
  if (!kidIds.length) return out;
  const ph = kidIds.map(() => '?').join(',');
  const rows = await all(env, `SELECT a.id, a.kid_id, a.session_id, a.mark, s.held_at, s.program, s.site, k.program AS kp, k.site AS ks FROM attendance a JOIN sessions s ON s.id=a.session_id JOIN kids k ON k.id=a.kid_id
    WHERE a.kid_id IN (${ph}) AND s.held_at BETWEEN ? AND ? AND s.status='confirmed' ORDER BY s.held_at`, ...kidIds, Q.start, Q.end);
  const flags = await all(env, `SELECT kid_id, reason_json FROM followups WHERE kid_id IN (${ph}) AND status='open' AND severity IN ('call','urgent')`, ...kidIds);
  const flagged = new Map<number, Set<string>>();
  for (const f of flags) flagged.set(f.kid_id, new Set(JSON.parse(f.reason_json || '{}').missed || []));
  for (const r of rows) {
    if (r.program !== r.kp && r.kp !== 'workshop') continue; // primary program only (workshop kids show workshops)
    if (r.kp === 'mentoring' && r.site !== r.ks) continue;
    const list = out.get(r.kid_id) || [];
    list.push({ attendance_id: r.id, session_id: r.session_id, held_at: r.held_at, mark: r.mark, flagged: !!flagged.get(r.kid_id)?.has(r.held_at) });
    out.set(r.kid_id, list);
  }
  return out;
}

async function messagesFor(env: Env, followupIds: number[]): Promise<Map<number, ChannelMessage[]>> {
  const out = new Map<number, ChannelMessage[]>();
  if (!followupIds.length) return out;
  const ph = followupIds.map(() => '?').join(',');
  const msgs = await all(env, `SELECT * FROM messages WHERE followup_id IN (${ph}) ORDER BY created_at, id`, ...followupIds);
  const ev = msgs.length ? await all(env, `SELECT * FROM message_events WHERE message_id IN (${msgs.map(() => '?').join(',')}) ORDER BY at, id`, ...msgs.map((m) => m.id)) : [];
  for (const m of msgs) {
    const list = out.get(m.followup_id) || [];
    list.push({ id: m.id, direction: m.direction, channel: m.channel, body: m.body, provider: m.provider, provider_message_id: m.provider_message_id, status: m.status, created_at: m.created_at, events: ev.filter((e) => e.message_id === m.id).map((e) => ({ status: e.status, at: e.at })) });
    out.set(m.followup_id, list);
  }
  return out;
}

function headline(r: Row, consecutive: number, misses30: number, program: string, contacted: boolean): string {
  const day = r.weekday ? `${r.weekday}s` : unitName(program);
  const who = contacted ? 'The family has been contacted.' : 'Nobody has called yet.';
  if (consecutive >= 2) return `Missed ${consecutive} ${day} in a row. ${who}`;
  if (misses30 >= 2) return `Missed ${misses30} of the last ${Math.min(4, misses30 + 1)} sessions. ${who}`;
  return `Missed the last session. ${who}`;
}
const unitName = (p: string) => (p === 'workshop' ? 'workshops' : 'sessions');

export async function followupItems(env: Env, where: string, ...binds: unknown[]): Promise<FollowupItem[]> {
  const rows = await all(env, `SELECT fu.*, k.first_name, k.last_name, k.preferred_name, k.grade, k.school, k.program, k.site,
      f.household_name, f.primary_contact_name AS guardian, f.relationship, f.phone,
      (SELECT m.full_name FROM matches x JOIN mentors m ON m.id=x.mentor_id WHERE x.kid_id=k.id AND x.ended_at IS NULL ORDER BY x.started_at DESC LIMIT 1) AS mentor,
      (SELECT x.started_at FROM matches x WHERE x.kid_id=k.id AND x.ended_at IS NULL ORDER BY x.started_at DESC LIMIT 1) AS mentor_since,
      (SELECT MAX(happened_at) FROM contacts c WHERE c.kid_id=k.id) AS last_contact
    FROM followups fu JOIN kids k ON k.id=fu.kid_id JOIN families f ON f.id=fu.family_id WHERE ${where}`, ...binds);
  if (!rows.length) return [];
  const strips = await stripsFor(env, rows.map((r) => r.kid_id));
  const msgs = await messagesFor(env, rows.map((r) => r.id));
  const items: FollowupItem[] = [];
  for (const r of rows) {
    const reason = JSON.parse(r.reason_json || '{}');
    const strip = strips.get(r.kid_id) || [];
    const recent = strip.slice(-4).map((d) => ({ date: d.held_at, mark: d.mark }));
    let consecutive = 0;
    for (let i = strip.length - 1; i >= 0; i--) { if (strip[i].mark === 'absent') consecutive++; else if (strip[i].mark === 'present') break; }
    const misses30 = strip.filter((d) => d.mark === 'absent' && daysBetween(d.held_at, env.DEMO_TODAY) <= 30).length;
    const lastPresent = [...strip].reverse().find((d) => d.mark === 'present')?.held_at ?? null;
    const factsRaw = JSON.parse(r.facts_json || '[]');
    const facts: Fact[] = Array.isArray(factsRaw) ? factsRaw : factsRaw.facts || [];
    const highlights: string[] = Array.isArray(factsRaw) ? [] : factsRaw.highlights || [];
    const kidName = `${r.first_name} ${r.last_name}`;
    const weekday = strip.length ? ({ 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' } as Record<number, string>)[new Date(strip[strip.length - 1].held_at + 'T12:00:00Z').getUTCDay()] : null;
    const contacted = !!r.sent_at || (!!r.last_contact && daysBetween(String(r.last_contact), env.DEMO_TODAY) <= 14 && String(r.last_contact) >= String(r.created_at).slice(0, 10));
    const reasonBits = [
      consecutive >= 2 ? `${consecutive} missed in a row` : misses30 >= 2 ? `${misses30} of the last ${Math.min(strip.length, 4)} missed` : 'missed the last session',
      lastPresent ? `last here ${md(lastPresent)}` : null,
    ].filter(Boolean);
    const msgList = msgs.get(r.id) || [];
    const draftHighlights = highlights.length ? highlights : [r.first_name, r.mentor?.split(' ')[0], ...(reason.missed || []).map(md), SITE_SHORT[r.site]].filter((h: string | undefined) => !!h && r.draft_text?.includes(h));
    const next = reason.next ?? fmtNext(await nextSession(env, r.program, r.site, env.DEMO_TODAY));
    items.push({
      id: r.id, kid_id: r.kid_id, kid_name: kidName, kid_initials: initials(kidName), kid_grade: r.grade, kid_school: r.school,
      family_id: r.family_id, household_name: r.household_name, guardian_name: r.guardian, guardian_relationship: r.relationship || 'Mom', guardian_phone: r.phone,
      language: (r.language || 'en') as Lang, severity: r.severity, severity_score: r.severity_score ?? 0, severity_confidence: r.severity_confidence ?? 0, needs_staff_review: !!r.needs_review,
      reason: reasonBits.join(' · '), headline: headline({ weekday }, consecutive, misses30, r.program, contacted),
      consecutive_misses: consecutive, misses_30d: misses30, last_present: lastPresent,
      mentor_name: r.mentor, mentor_since: r.mentor_since, program: r.program, site: r.site,
      recent, strip, draft_text: r.draft_text || '', draft_translation: r.draft_translation, draft_highlights: draftHighlights, facts,
      status: r.status, created_at: r.created_at, sent_at: r.sent_at, replied_at: r.replied_at, next_session: next,
      messages: msgList,
      reminder_at: r.sent_at && r.status === 'sent' ? addDays(String(r.sent_at), 3) : null,
    });
  }
  items.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || b.consecutive_misses - a.consecutive_misses || (a.last_present || '').localeCompare(b.last_present || ''));
  return items;
}

/* ---------------- quarter stats used by Today and Report ---------------- */
async function quarterStats(env: Env) {
  const rateRows = await all(env, `SELECT s.held_at, s.program, s.site, SUM(a.mark='present') p, SUM(a.mark='absent') ab, SUM(a.mark='unclear') u FROM attendance a JOIN sessions s ON s.id=a.session_id
    WHERE s.held_at BETWEEN ? AND ? AND s.status='confirmed' AND a.kid_id IS NOT NULL GROUP BY s.id`, Q.start, Q.end);
  const weeks = new Map<string, { p: number; a: number }>();
  for (const r of rateRows) { const w = weekRange(r.held_at).start; const x = weeks.get(w) || { p: 0, a: 0 }; x.p += r.p; x.a += r.ab; weeks.set(w, x); }
  const weekly = [...weeks.entries()].sort().map(([w, x]) => ({ week: w, rate: pct(x.p, x.a) ?? 0 }));
  const P = rateRows.reduce((s, r) => s + r.p, 0), A = rateRows.reduce((s, r) => s + r.ab, 0), U = rateRows.reduce((s, r) => s + r.u, 0);
  return { rateRows, weekly, quarterRate: pct(P, A) ?? 0, P, A, U };
}

async function followupStats(env: Env) {
  const fus = await all(env, `SELECT fu.id, fu.kid_id, fu.first_miss_at, fu.created_at, fu.status, fu.sent_at, fu.replied_at,
      (SELECT MIN(happened_at) FROM contacts c WHERE c.followup_id=fu.id) AS contact_at
    FROM followups fu WHERE fu.severity IN ('call','urgent') AND fu.created_at BETWEEN ? AND ?`, Q.start, Q.end + 'T23:59');
  const reached = fus.filter((f) => f.contact_at || f.replied_at || f.status === 'replied' || f.status === 'closed');
  const days = reached.map((f) => daysBetween(f.first_miss_at || f.created_at, (f.contact_at || f.replied_at || f.sent_at || f.created_at))).filter((d) => d >= 0).sort((a, b) => a - b);
  const median = days.length ? days[Math.floor(days.length / 2)] : null;
  // came back within 2 weeks of contact
  let back = 0;
  for (const f of reached) {
    const after = await one(env, `SELECT 1 FROM attendance a JOIN sessions s ON s.id=a.session_id WHERE a.kid_id=? AND a.mark='present' AND s.held_at > ? AND s.held_at <= ? LIMIT 1`, f.kid_id, String(f.contact_at || f.replied_at || f.created_at).slice(0, 10), addDays(String(f.contact_at || f.replied_at || f.created_at), 14));
    if (after) back++;
  }
  return { flagged: fus.length, reached: reached.length, back, median };
}

async function hoursStats(env: Env) {
  const rows = await all(env, `SELECT h.mentor_id, m.full_name, SUM(CASE WHEN h.superseded_by IS NULL THEN h.hours ELSE 0 END) hrs, SUM(h.superseded_by IS NOT NULL) dupes, COUNT(*) n
    FROM hours h JOIN mentors m ON m.id=h.mentor_id WHERE h.held_on BETWEEN ? AND ? GROUP BY h.mentor_id ORDER BY hrs DESC`, Q.start, Q.end);
  return { total: Math.round(rows.reduce((s, r) => s + r.hrs, 0) * 10) / 10, dupes: rows.reduce((s, r) => s + r.dupes, 0), entries: rows.reduce((s, r) => s + r.n, 0), mentors: rows.filter((r) => r.hrs > 0).length, rows };
}

/* ---------------- Today ---------------- */
export async function week(env: Env): Promise<WeekResponse> {
  const today = env.DEMO_TODAY;
  const range = weekRange(today);
  const sessions = await all(env, `SELECT s.*, (SELECT COUNT(*) FROM attendance a WHERE a.session_id=s.id AND a.kid_id IS NOT NULL) kids FROM sessions s WHERE held_at BETWEEN ? AND ? AND status='confirmed' ORDER BY held_at, start_time`, range.start, range.end);
  const expected: { date: string; program: string; site: string; time: string }[] = [
    { date: range.start, program: 'counseling', site: 'Tidepath office', time: '15:00' },
    { date: addDays(range.start, 2), program: 'mentoring', site: 'Citrus Grove MS', time: '16:00' },
    { date: addDays(range.start, 3), program: 'mentoring', site: 'West Little River CC', time: '16:30' },
  ];
  const days: WeekResponse['days'] = [];
  let sheetsIn = 0, sheetsExpected = 0;
  let snapPending: { label: string; detail: string; sample_key: string | null } | null = null;
  for (let i = 0; i < 5; i++) {
    const date = addDays(range.start, i);
    const list: WeekSession[] = [];
    for (const s of sessions.filter((x) => x.held_at === date)) {
      list.push({ program: s.program, site: SITE_SHORT[s.site] ?? s.site, time: time12(s.start_time), status: 'captured', kids: s.kids, session_id: s.id, sample_key: null });
    }
    for (const e of expected.filter((x) => x.date === date)) {
      if (sessions.some((s) => s.held_at === date && s.program === e.program && s.site === e.site)) continue;
      const sample = SAMPLES.find((x) => x.held_at === date && x.site === e.site && x.program === e.program && !x.session_id);
      const status = date <= today ? 'waiting' : 'upcoming';
      list.push({ program: e.program as WeekSession['program'], site: SITE_SHORT[e.site] ?? e.site, time: time12(e.time), status, kids: null, session_id: null, sample_key: sample?.key ?? null });
      if (status === 'waiting' && !snapPending) snapPending = { label: date === today ? "Snap today's sheet" : `Snap ${dow(date)}'s sheet`, detail: `${SITE_SHORT[e.site]} ${e.program} · ${time12(e.time)}`, sample_key: sample?.key ?? null };
    }
    for (const s of list) { if (s.status !== 'upcoming') sheetsExpected++; if (s.status === 'captured') sheetsIn++; }
    days.push({ date, dow: date === today ? 'Today' : dow(date), day: Number(date.slice(8)), is_today: date === today, sessions: list });
  }
  const open = await followupItems(env, `fu.status='open' AND fu.severity IN ('call','urgent','watch')`);
  const call = open.filter((f) => SEV_RANK[f.severity] >= 2);
  const watch = open.filter((f) => f.severity === 'watch');
  const doneThisWeek = (await one(env, `SELECT COUNT(*) n FROM followups WHERE severity IN ('call','urgent') AND (sent_at >= ? OR closed_at >= ?) AND status IN ('sent','replied','closed')`, range.start, range.start))?.n ?? 0;
  const { weekly, quarterRate } = await quarterStats(env);
  const thisWeek = weekly.find((w) => w.week === range.start)?.rate ?? null;
  const prevWeek = weekly.filter((w) => w.week < range.start).slice(-1)[0]?.rate ?? null;
  const fs = await followupStats(env);
  const hs = await hoursStats(env);
  const feed = (await all(env, `SELECT * FROM activity ORDER BY at DESC, id DESC LIMIT 4`)).map((a) => ({ kind: a.kind, text: a.text, bold: a.bold || '', when: a.at.slice(0, 10) === today ? 'Today' : a.at.slice(0, 10) >= range.start ? dow(a.at) : md(a.at), link: a.link }));
  const sheetsCaptured = (await one(env, `SELECT COUNT(*) n FROM sessions WHERE program!='counseling' AND status='confirmed' AND held_at BETWEEN ? AND ?`, Q.start, Q.end))?.n ?? 0;
  const linkedSignups = (await one(env, `SELECT COUNT(*) n FROM signups WHERE status='linked' AND received_at >= ?`, Q.start))?.n ?? 0;
  const review = (await one(env, `SELECT COUNT(*) n FROM signups WHERE status='review'`))?.n ?? 0;
  const schoolChange = await one(env, `SELECT h.*, k.first_name FROM kid_status_history h JOIN kids k ON k.id=h.kid_id ORDER BY changed_at DESC LIMIT 1`);
  const unmatched = await one(env, `SELECT a.raw_text, s.held_at, s.id sid FROM attendance a JOIN sessions s ON s.id=a.session_id WHERE a.kid_id IS NULL AND a.match_method='skipped' ORDER BY s.held_at DESC LIMIT 1`);
  const unmatchedN = (await one(env, `SELECT COUNT(*) n FROM attendance WHERE kid_id IS NULL AND match_method='skipped'`))?.n ?? 0;
  const checks: WeekResponse['checks'] = [];
  if (review) checks.push({ kind: 'signups', title: `${review} new sign-up${review > 1 ? 's' : ''}`, detail: 'Might be kids we already know', link: '/people?tab=signups' });
  if (schoolChange) checks.push({ kind: 'school_change', title: `${schoolChange.first_name} changed schools`, detail: `${schoolChange.to_school} since ${md(schoolChange.changed_at)}`, link: `/people/kids/${schoolChange.kid_id}` });
  if (unmatched) checks.push({ kind: 'unmatched', title: `${unmatchedN} name${unmatchedN > 1 ? 's' : ''} nobody matched`, detail: `"${unmatched.raw_text}" on the ${md(unmatched.held_at)} sheet`, link: `/report?ev=data_quality:unresolved` });
  const greetingHour = Number(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'America/New_York' }));
  return {
    today, now: new Date().toISOString(),
    greeting: `Good ${greetingHour < 12 ? 'morning' : greetingHour < 18 ? 'afternoon' : 'evening'}, ${env.STAFF_NAME}`,
    range,
    headline: { count: call.length, text: call.length ? `${call.length} ${call.length === 1 ? 'family needs' : 'families need'} a call.` : "Everybody's accounted for this week.", sub: call.length ? 'Everything else is on track.' : `${md(range.start)} to ${md(range.end)}` },
    plan: {
      snap: snapPending ? { done: false, ...snapPending } : { done: true, label: 'Sheets are in', detail: `${sheetsIn} of ${sheetsExpected} captured this week`, sample_key: null },
      calls: { done: doneThisWeek, total: doneThisWeek + call.length },
      report: { ready: true, due: 'Oct 15' },
    },
    days, sheets_in: sheetsIn, sheets_expected: sheetsExpected, call, watch,
    stats: {
      attendance_rate_quarter: quarterRate, attendance_rate_week: thisWeek, delta_pts: thisWeek !== null && prevWeek !== null ? Math.round((thisWeek - prevWeek) * 10) / 10 : 0,
      weekly_rates: weekly.slice(-11), reached: fs.reached, flagged: fs.flagged, median_days_to_contact: fs.median,
      hours_quarter: hs.total, hours_dupes_removed: hs.dupes, mentors: hs.mentors,
      top_mentor: hs.rows[0] ? { name: hs.rows[0].full_name, hours: hs.rows[0].hrs } : null, mentor_initials: hs.rows.slice(0, 4).map((r) => initials(r.full_name)),
    },
    feed,
    typing_hours_saved: Math.round(((sheetsCaptured * 40) + linkedSignups * 3) / 60),
    checks,
  };
}

/* ---------------- People ---------------- */
export async function kidList(env: Env, q: { q?: string; program?: string; site?: string; flag?: string }): Promise<KidListItem[]> {
  let rows = await all(env, `SELECT k.*, f.household_name, f.language,
      (SELECT m.full_name FROM matches x JOIN mentors m ON m.id=x.mentor_id WHERE x.kid_id=k.id AND x.ended_at IS NULL LIMIT 1) mentor,
      (SELECT severity FROM followups fu WHERE fu.kid_id=k.id AND fu.status='open' ORDER BY created_at DESC LIMIT 1) severity
    FROM kids k JOIN families f ON f.id=k.family_id WHERE k.program != 'counseling' ORDER BY k.last_name, k.first_name`);
  const matchedAlias = new Map<number, string>();
  if (q.q) {
    const n = normalize(q.q);
    const nn = n.replace(/ /g, '');
    const al = await all(env, `SELECT entity, entity_id, raw_text, normalized FROM aliases WHERE entity IN ('kid','family')`);
    const famKids = new Map<number, number[]>();
    for (const r of rows) famKids.set(r.family_id, [...(famKids.get(r.family_id) || []), r.id]);
    const hit = new Set<number>();
    for (const a of al) {
      if (a.normalized.includes(n) || a.normalized.replace(/ /g, '').includes(nn)) {
        const ids = a.entity === 'kid' ? [a.entity_id] : famKids.get(a.entity_id) || [];
        for (const id of ids) { hit.add(id); if (normalize(a.raw_text) !== normalize(`${rows.find((r) => r.id === id)?.first_name} ${rows.find((r) => r.id === id)?.last_name}`)) matchedAlias.set(id, a.raw_text); }
      }
    }
    rows = rows.filter((r) => hit.has(r.id) || normalize(`${r.first_name} ${r.last_name} ${r.household_name} ${r.school}`).includes(n));
  }
  if (q.program) rows = rows.filter((r) => r.program === q.program);
  if (q.site) rows = rows.filter((r) => normalize(r.site).includes(normalize(q.site!)));
  if (q.flag === 'call') rows = rows.filter((r) => r.severity === 'call' || r.severity === 'urgent');
  const strips = await stripsFor(env, rows.map((r) => r.id));
  return rows.map((r) => {
    const s = strips.get(r.id) || [];
    const p = s.filter((d) => d.mark === 'present').length, a = s.filter((d) => d.mark === 'absent').length;
    const name = `${r.first_name} ${r.last_name}`;
    return { id: r.id, name, initials: initials(name), school: r.school, grade: r.grade, program: r.program, site: r.site, mentor: r.mentor, language: r.language, strip: s, rate: pct(p, a), last_seen: [...s].reverse().find((d) => d.mark === 'present')?.held_at ?? null, severity: r.severity && r.severity !== 'fine' ? r.severity : null, status: r.status, family_id: r.family_id, household_name: r.household_name, matched_alias: matchedAlias.get(r.id) ?? null };
  });
}

export async function kidDetail(env: Env, id: number): Promise<KidDetail | null> {
  const list = (await kidList(env, {})).find((k) => k.id === id);
  const k = await one(env, `SELECT k.*, f.* , k.id kid_id, f.id fam_id FROM kids k JOIN families f ON f.id=k.family_id WHERE k.id=?`, id);
  if (!k || !list) return null;
  const siblings = await all(env, `SELECT id, first_name, last_name, grade, program FROM kids WHERE family_id=? AND id!=? AND program!='counseling'`, k.fam_id, id);
  const signup = await one(env, `SELECT received_at, source FROM signups WHERE kid_id=? ORDER BY received_at LIMIT 1`, id);
  const match = await one(env, `SELECT started_at FROM matches WHERE kid_id=? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`, id);
  const sess = await all(env, `SELECT a.*, s.held_at, s.site, s.program, s.photo_url FROM attendance a JOIN sessions s ON s.id=a.session_id WHERE a.kid_id=? AND s.status='confirmed' ORDER BY s.held_at`, id);
  const aliasRows = await all(env, `SELECT * FROM aliases WHERE entity='kid' AND entity_id=? AND source!='record' ORDER BY first_seen_at`, id);
  const aliasMap = new Map<string, { raw_text: string; source: string; dates: string[]; probability: number | null }>();
  for (const a of aliasRows) aliasMap.set(a.normalized, { raw_text: a.raw_text, source: a.source, dates: [md(a.first_seen_at)], probability: a.probability });
  for (const s of sess) { const n = normalize(s.raw_text || ''); const al = aliasMap.get(n); if (al && !al.dates.includes(md(s.held_at))) al.dates.push(md(s.held_at)); }
  const name = `${k.first_name} ${k.last_name}`;
  const months: KidDetail['calendar'] = [];
  for (const m of ['07', '08', '09']) months.push({ month: ['Jul', 'Aug', 'Sep'][Number(m) - 7], cells: list.strip.filter((d) => d.held_at.slice(5, 7) === m).map((d) => ({ session_id: d.session_id, held_at: d.held_at, mark: d.mark, flagged: d.flagged })) });
  const history: KidDetail['history'] = [];
  for (const f of await all(env, `SELECT * FROM followups WHERE kid_id=? ORDER BY created_at DESC`, id)) {
    const missed = (JSON.parse(f.reason_json || '{}').missed || []) as string[];
    if (f.severity === 'urgent' || f.severity === 'call') history.push({ kind: f.severity, title: f.severity === 'urgent' ? 'Flagged Urgent' : 'Flagged for a call', detail: `${missed.length ? `Missed ${missed.map(md).join(', ')}. ` : ''}${f.draft_text ? `${LANG_NAME[f.language]} message drafted.` : ''}`, date: f.created_at });
    else history.push({ kind: 'watch', title: 'Marked "keep an eye"', detail: 'One miss. No call needed yet.', date: f.created_at });
    if (f.sent_at) history.push({ kind: 'sent', title: 'Message sent on WhatsApp', detail: `To ${k.primary_contact_name}`, date: f.sent_at });
    if (f.replied_at) history.push({ kind: 'reply', title: 'Family replied', detail: '', date: f.replied_at });
  }
  for (const c of await all(env, `SELECT * FROM contacts WHERE kid_id=?`, id)) history.push({ kind: 'contact', title: c.kind === 'reply' ? 'Family replied' : 'Called the family', detail: c.body || '', date: c.happened_at });
  for (const h of await all(env, `SELECT * FROM kid_status_history WHERE kid_id=?`, id)) history.push({ kind: 'school', title: `Changed school to ${h.to_school}`, detail: h.note || '', date: h.changed_at });
  for (const m of await all(env, `SELECT x.*, m.full_name FROM matches x JOIN mentors m ON m.id=x.mentor_id WHERE x.kid_id=?`, id)) {
    history.push({ kind: 'match', title: `Matched with mentor ${m.full_name}`, detail: m.ended_at ? `Until ${md(m.ended_at)}` : '', date: m.started_at });
  }
  if (signup) history.push({ kind: 'signup', title: `Signed up on the ${signup.source === 'webform' ? 'web form' : signup.source}`, detail: `Linked to the ${k.household_name} family`, date: signup.received_at });
  history.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const fu = await one(env, `SELECT id, status FROM followups WHERE kid_id=? AND status IN ('open','sent') ORDER BY created_at DESC LIMIT 1`, id);
  return {
    ...list,
    family: { id: k.fam_id, household_name: k.household_name, guardian_name: k.primary_contact_name, relationship: k.relationship || 'Mom', phone: k.phone, language: k.language, neighborhood: k.neighborhood, siblings: siblings.map((s) => ({ id: s.id, name: `${s.first_name} ${s.last_name}`, grade: s.grade })), signed_up: signup?.received_at ?? null, signup_source: signup?.source ?? null },
    mentor_since: match?.started_at ?? null,
    sessions_count: list.strip.length, present_count: list.strip.filter((d) => d.mark === 'present').length,
    calendar: months,
    aliases: [...aliasMap.values()].filter((a) => normalize(a.raw_text) !== normalize(name) || a.source !== 'record').map((a) => ({ raw_text: a.raw_text, source: a.source === 'sheet' ? 'Sheet' : a.source === 'form' ? 'Sign-up form' : a.source === 'text' ? 'Text message' : 'Record', dates: a.dates.join(', '), probability: a.probability })),
    history,
    sessions: sess.map((s) => ({ attendance_id: s.id, session_id: s.session_id, held_at: s.held_at, site: s.site, program: s.program, row_index: s.row_index, raw_text: s.raw_text, mark: s.mark, probability: s.match_probability, photo_url: s.photo_url, bbox: parseBox(s.bbox) })),
    followup_id: fu?.id ?? null, followup_status: fu?.status ?? null,
    school_history: (await all(env, `SELECT * FROM kid_status_history WHERE kid_id=?`, id)).map((h) => ({ from_school: h.from_school, to_school: h.to_school, changed_at: h.changed_at, note: h.note })),
  };
}

export async function familyList(env: Env): Promise<FamilyListItem[]> {
  const fams = await all(env, `SELECT f.*, (SELECT COUNT(*) FROM aliases a WHERE a.entity='family' AND a.entity_id=f.id) ac,
      (SELECT COUNT(*) FROM followups fu WHERE fu.family_id=f.id AND fu.status='open' AND fu.severity IN ('call','urgent')) openfu
    FROM families f WHERE EXISTS (SELECT 1 FROM kids k WHERE k.family_id=f.id AND k.program!='counseling') ORDER BY f.household_name`);
  const kids = await all(env, `SELECT family_id, first_name FROM kids WHERE program!='counseling'`);
  return fams.map((f) => ({ id: f.id, household_name: f.household_name, guardian_name: f.primary_contact_name, language: f.language, phone: f.phone, kids: kids.filter((k) => k.family_id === f.id).map((k) => k.first_name), alias_count: f.ac, open_followup: f.openfu > 0 }));
}

export async function familyDetail(env: Env, id: number): Promise<FamilyDetail | null> {
  const f = await one(env, `SELECT * FROM families WHERE id=?`, id);
  if (!f) return null;
  const kids = await all(env, `SELECT * FROM kids WHERE family_id=? AND program!='counseling'`, id);
  const al = await all(env, `SELECT * FROM aliases WHERE entity='family' AND entity_id=? ORDER BY first_seen_at`, id);
  const sources: FamilyDetail['sources'] = [];
  for (const a of al) {
    if (a.source === 'record') continue;
    let label = '', photo: string | null = null;
    const [kind, ref] = String(a.source_ref || '').split(':');
    if (a.source === 'form') { const s = await one(env, `SELECT received_at, source FROM signups WHERE id=?`, Number(ref)); label = s?.source && s.source !== 'webform' ? `Sign-up (${s.source})` : 'Sign-up form'; }
    if (a.source === 'sheet') { const s = await one(env, `SELECT held_at, program, photo_url FROM sessions WHERE id=?`, Number(ref)); label = `${s?.program === 'workshop' ? 'Workshop' : PROGRAM_LABEL[s?.program] ?? 'Attendance'} sheet · parent helper`; photo = s?.photo_url ?? null; }
    if (a.source === 'text') { const h = await one(env, `SELECT h.reported_at, m.full_name FROM hours h JOIN mentors m ON m.id=h.mentor_id WHERE h.id=?`, Number(ref)); label = `Hours text from ${h?.full_name?.split(' ')[0] ?? 'a mentor'}`; }
    void kind;
    sources.push({ kind: a.source, label, date: a.first_seen_at, raw_text: a.raw_text, probability: a.probability, first: false, photo_url: photo, bbox: null });
  }
  const firstSignup = await one(env, `SELECT * FROM signups WHERE family_id=? ORDER BY received_at LIMIT 1`, id);
  if (firstSignup) {
    const j = JSON.parse(firstSignup.raw_json);
    const g = `${j.guardian_first ?? ''} ${j.guardian_last ?? ''}`.trim();
    if (g && !sources.some((x) => normalize(x.raw_text) === normalize(g))) sources.push({ kind: 'form', label: firstSignup.source === 'webform' ? 'Sign-up form' : `Sign-up (${firstSignup.source})`, date: firstSignup.received_at, raw_text: g, probability: null, first: false, photo_url: null, bbox: null });
  }
  if (sources.length) { sources.sort((a, b) => a.date.localeCompare(b.date)); sources[0].first = true; }
  const changes = await all(env, `SELECT h.*, k.first_name, k.last_name FROM kid_status_history h JOIN kids k ON k.id=h.kid_id WHERE k.family_id=?`, id);
  const fus = await all(env, `SELECT fu.*, k.first_name FROM followups fu JOIN kids k ON k.id=fu.kid_id WHERE fu.family_id=? ORDER BY fu.created_at DESC`, id);
  const contacts = await all(env, `SELECT * FROM contacts WHERE family_id=? ORDER BY happened_at DESC`, id);
  return {
    id, household_name: f.household_name, guardian_name: f.primary_contact_name, relationship: f.relationship || 'Mom', phone: f.phone, email: f.email, language: f.language, neighborhood: f.neighborhood, address: f.address,
    kids: kids.map((k) => ({ id: k.id, name: `${k.first_name} ${k.last_name}`, grade: k.grade, school: k.school, program: k.program, site: k.site, status: k.status })),
    sources,
    school_changes: changes.map((h) => ({ kid_name: `${h.first_name} ${h.last_name}`, from_school: h.from_school, to_school: h.to_school, changed_at: h.changed_at, note: h.note })),
    followups: fus.map((x) => { const missed = (JSON.parse(x.reason_json || '{}').missed || []) as string[]; return { id: x.id, kid_name: x.first_name, severity: x.severity, status: x.status, summary: `${x.first_name} · ${missed.length} missed${x.draft_text ? ` · ${LANG_NAME[x.language]} message ${x.sent_at ? 'sent' : 'drafted'}` : ''}`, date: x.created_at }; }),
    contacts: contacts.map((c) => ({ kind: c.kind, body: c.body, date: c.happened_at })),
  };
}

export async function mentorList(env: Env): Promise<MentorListItem[]> {
  const ms = await all(env, `SELECT m.*, (SELECT SUM(hours) FROM hours h WHERE h.mentor_id=m.id AND h.superseded_by IS NULL AND h.held_on BETWEEN ? AND ?) hrs,
      (SELECT COUNT(DISTINCT session_id) FROM hours h WHERE h.mentor_id=m.id AND h.session_id IS NOT NULL) sess,
      (SELECT COUNT(*) FROM hours h WHERE h.mentor_id=m.id AND h.superseded_by IS NOT NULL) dupes FROM mentors m ORDER BY hrs DESC`, Q.start, Q.end);
  const kids = await all(env, `SELECT x.mentor_id, k.id, k.first_name, k.last_name FROM matches x JOIN kids k ON k.id=x.kid_id WHERE x.ended_at IS NULL`);
  return ms.map((m) => ({ id: m.id, name: m.full_name, initials: initials(m.full_name), phone: m.phone, kids: kids.filter((k) => k.mentor_id === m.id).map((k) => ({ id: k.id, name: `${k.first_name} ${k.last_name}` })), hours: Math.round((m.hrs || 0) * 10) / 10, sessions: m.sess, dupes: m.dupes }));
}

export async function mentorDetail(env: Env, id: number): Promise<MentorDetail | null> {
  const base = (await mentorList(env)).find((m) => m.id === id);
  if (!base) return null;
  const rows = await all(env, `SELECT * FROM hours WHERE mentor_id=? ORDER BY held_on DESC, reported_at`, id);
  return { ...base, entries: rows.map((h) => ({ id: h.id, date: h.held_on, site: h.site ? SITE_SHORT[h.site] ?? h.site : 'Event', program: h.program, hours: h.hours, source: h.source, raw_text: h.raw_text, status: h.superseded_by ? 'duplicate' : 'counted', note: h.superseded_by ? 'Reported twice, counted once' : h.note })) };
}

export async function signupList(env: Env): Promise<SignupItem[]> {
  const rows = await all(env, `SELECT s.*, k.first_name kf, k.last_name kl, f.household_name FROM signups s LEFT JOIN kids k ON k.id=s.kid_id LEFT JOIN families f ON f.id=s.family_id ORDER BY (s.status='review') DESC, s.received_at DESC`);
  return rows.map((s) => {
    const j = JSON.parse(s.raw_json);
    return { id: s.id, received_at: s.received_at, source: s.source, guardian: `${j.guardian_first} ${j.guardian_last}`.trim(), kid: `${j.kid_first} ${j.kid_last}`.trim(), phone: j.phone ?? null, language: j.language ?? null, resolve_probability: s.resolve_probability, status: s.status, family_id: s.family_id, kid_id: s.kid_id, matched_to: s.status === 'linked' && s.kf ? `${s.kf} ${s.kl} · ${s.household_name} family` : s.status === 'review' ? (j.note || `Maybe the ${s.household_name ?? ''} family`).trim() : null };
  });
}

/* ---------------- Report ---------------- */
export async function report(env: Env): Promise<ReportResponse> {
  const { rateRows, weekly, quarterRate, U } = await quarterStats(env);
  const served = await all(env, `SELECT DISTINCT a.kid_id, k.program, k.site, k.family_id, f.language FROM attendance a JOIN sessions s ON s.id=a.session_id JOIN kids k ON k.id=a.kid_id JOIN families f ON f.id=k.family_id
    WHERE a.mark='present' AND s.held_at BETWEEN ? AND ? AND s.status='confirmed'`, Q.start, Q.end);
  const servedBySession = await all(env, `SELECT DISTINCT a.kid_id, s.program, s.site FROM attendance a JOIN sessions s ON s.id=a.session_id WHERE a.mark='present' AND s.held_at BETWEEN ? AND ? AND s.status='confirmed'`, Q.start, Q.end);
  const kidsServed = new Set(served.map((r) => r.kid_id)).size;
  const families = new Set(served.map((r) => r.family_id)).size;
  const sess = await all(env, `SELECT program, site, COUNT(*) n FROM sessions WHERE held_at BETWEEN ? AND ? AND status='confirmed' GROUP BY program, site`, Q.start, Q.end);
  const totalSessions = sess.reduce((s, r) => s + r.n, 0);
  const places = new Set(sess.map((r) => r.site)).size;
  const hs = await hoursStats(env);
  const fs = await followupStats(env);
  const matchesActive = (await one(env, `SELECT COUNT(*) n FROM matches WHERE started_at <= ? AND (ended_at IS NULL OR ended_at > ?)`, Q.end, Q.end))?.n ?? 0;
  const matchesNew = (await one(env, `SELECT COUNT(*) n FROM matches WHERE started_at BETWEEN ? AND ?`, Q.start, Q.end))?.n ?? 0;
  const activeMentors = (await one(env, `SELECT COUNT(DISTINCT mentor_id) n FROM matches WHERE ended_at IS NULL`))?.n ?? 0;
  const sheets = (await one(env, `SELECT COUNT(*) n FROM sessions WHERE program!='counseling' AND status='confirmed' AND held_at BETWEEN ? AND ?`, Q.start, Q.end))?.n ?? 0;
  const rowsRead = (await one(env, `SELECT COUNT(*) n FROM attendance a JOIN sessions s ON s.id=a.session_id WHERE s.program!='counseling' AND s.status='confirmed' AND s.held_at BETWEEN ? AND ?`, Q.start, Q.end))?.n ?? 0;
  const rowsConfirmed = (await one(env, `SELECT COUNT(*) n FROM attendance a JOIN sessions s ON s.id=a.session_id WHERE s.program!='counseling' AND a.confirmed_at IS NOT NULL AND a.kid_id IS NOT NULL AND s.held_at BETWEEN ? AND ?`, Q.start, Q.end))?.n ?? 0;
  const linked = (await one(env, `SELECT COUNT(*) n FROM attendance a JOIN sessions s ON s.id=a.session_id WHERE s.program!='counseling' AND s.photo_url IS NOT NULL AND s.held_at BETWEEN ? AND ?`, Q.start, Q.end))?.n ?? 0;
  const aliasesLearned = (await one(env, `SELECT COUNT(*) n FROM aliases WHERE source IN ('sheet','form','text') AND first_seen_at BETWEEN ? AND ?`, Q.start, Q.end + 'T23:59'))?.n ?? 0;
  const unresolved = (await one(env, `SELECT COUNT(*) n FROM attendance a JOIN sessions s ON s.id=a.session_id WHERE a.kid_id IS NULL AND s.held_at BETWEEN ? AND ?`, Q.start, Q.end))?.n ?? 0;
  const signups = (await one(env, `SELECT COUNT(*) n FROM signups WHERE received_at >= ?`, '2026-06-01'))?.n ?? 0;
  const snap = await one(env, `SELECT id, built_at FROM report_snapshots WHERE quarter_label='FY27Q1' ORDER BY built_at DESC LIMIT 1`);

  const rateFor = (filter: (r: Row) => boolean) => { const rs = rateRows.filter(filter); return pct(rs.reduce((s, r) => s + r.p, 0), rs.reduce((s, r) => s + r.ab, 0)); };
  const kidsFor = (filter: (r: Row) => boolean) => new Set(servedBySession.filter(filter).map((r) => r.kid_id)).size;
  const sessFor = (filter: (r: Row) => boolean) => sess.filter(filter).reduce((s, r) => s + r.n, 0);
  const programs = [...new Set(sess.map((r) => r.program))];
  const sites = [...new Set(sess.map((r) => r.site))];
  const byProgram: Breakdown[] = programs.map((p) => ({ label: PROGRAM_LABEL[p] ?? p, rate: rateFor((r) => r.program === p), kids: kidsFor((r) => r.program === p), sessions: sessFor((r) => r.program === p), evidence_ref: `attendance:program:${p}`, locked: p === 'counseling' }));
  const bySite: Breakdown[] = sites.map((s) => ({ label: SITE_SHORT[s] ?? s, rate: rateFor((r) => r.site === s), kids: kidsFor((r) => r.site === s), sessions: sessFor((r) => r.site === s), evidence_ref: `attendance:site:${s}`, locked: s === 'Tidepath office' }));
  const byLanguage: Breakdown[] = (['es', 'ht', 'en'] as Lang[]).map((l) => ({ label: LANG_NAME[l], rate: null, kids: new Set(served.filter((r) => r.language === l).map((r) => r.kid_id)).size, sessions: 0, evidence_ref: `language:${l}` }));
  const spark = weekly.map((w) => w.rate);
  // cumulative kids served by week for the sparkline
  const firstSeen = new Map<number, string>();
  for (const r of await all(env, `SELECT a.kid_id, MIN(s.held_at) d FROM attendance a JOIN sessions s ON s.id=a.session_id WHERE a.mark='present' AND s.held_at BETWEEN ? AND ? GROUP BY a.kid_id`, Q.start, Q.end)) firstSeen.set(r.kid_id, r.d);
  const cum = weekly.map((w) => [...firstSeen.values()].filter((d) => d <= addDays(w.week, 6)).length);
  const hoursByWeek = (await all(env, `SELECT held_on, SUM(hours) h FROM hours WHERE superseded_by IS NULL AND held_on BETWEEN ? AND ? GROUP BY held_on ORDER BY held_on`, Q.start, Q.end));
  let acc = 0; const hoursCum = weekly.map((w) => { acc = hoursByWeek.filter((h) => h.held_on <= addDays(w.week, 6)).reduce((s, h) => s + h.h, 0); return Math.round(acc); });
  return {
    quarter: 'FY27Q1', label: 'Q1 FY2027', period: Q, org: env.ORG_NAME,
    generated_from: { sheets, signups, hours_entries: hs.entries },
    traced: { linked, total: rowsRead },
    kpis: [
      { key: 'kids_served', label: 'Kids served', value: String(kidsServed), sub: `from ${families} families`, evidence_ref: 'kids_served', spark: cum },
      { key: 'attendance', label: 'Showed up', value: `${Math.round(quarterRate)}%`, sub: `${U} unclear mark${U === 1 ? '' : 's'} left out`, evidence_ref: 'attendance:all', spark },
      { key: 'sessions', label: 'Sessions held', value: String(totalSessions), sub: `at ${places} places`, evidence_ref: 'sessions', spark: weekly.map(() => 1) },
      { key: 'hours', label: 'Volunteer hours', value: String(hs.total), sub: `${hs.dupes} duplicate${hs.dupes === 1 ? '' : 's'} removed`, evidence_ref: 'hours', spark: hoursCum },
    ],
    families_served: families,
    by: { program: byProgram, site: bySite, language: byLanguage },
    followups: { flagged: fs.flagged, reached: fs.reached, back_within_2w: fs.back, median_days: fs.median, evidence_ref: 'followups' },
    mentoring: { active_matches: matchesActive, new_matches: matchesNew, active_mentors: activeMentors, avg_hours: activeMentors ? Math.round((hs.rows.filter((r) => r.hrs > 0).reduce((s, r) => s + r.hrs, 0) / hs.mentors) * 10) / 10 : 0, evidence_ref: 'matches' },
    data_quality: { sheets, rows_read: rowsRead, rows_confirmed: rowsConfirmed, aliases_learned: aliasesLearned, unresolved, confirmed_pct: rowsRead ? Math.round((rowsConfirmed / rowsRead) * 100) : 0 },
    snapshot: snap ? { id: snap.id, built_at: snap.built_at } : null,
  };
}

export async function evidence(env: Env, ref: string): Promise<EvidenceResponse> {
  const parts = ref.split(':');
  const base = `SELECT s.id, s.held_at, s.site, s.program, s.photo_url, m.full_name fac, SUM(a.mark='present') p, SUM(a.mark='absent') ab, SUM(a.mark='unclear') u
    FROM sessions s LEFT JOIN attendance a ON a.session_id=s.id AND a.kid_id IS NOT NULL LEFT JOIN mentors m ON m.id=s.facilitator_mentor_id WHERE s.held_at BETWEEN ? AND ? AND s.status='confirmed'`;
  let sql = base, binds: unknown[] = [Q.start, Q.end], title = '', recFilter = '', recBinds: unknown[] = [];
  if (parts[0] === 'attendance' || parts[0] === 'sessions') {
    if (parts[1] === 'program') { sql += ' AND s.program=?'; binds.push(parts[2]); title = `${PROGRAM_LABEL[parts[2]] ?? parts[2]}`; }
    if (parts[1] === 'site') { sql += ' AND s.site=?'; binds.push(parts.slice(2).join(':')); title = SITE_SHORT[parts.slice(2).join(':')] ?? parts[2]; }
  }
  if (parts[0] === 'data_quality') { recFilter = ' AND a.kid_id IS NULL'; }
  if (parts[0] === 'language') { recFilter = ` AND a.mark='present' AND f.language=?`; recBinds = [parts[1]]; }
  if (parts[0] === 'kids_served') { recFilter = ` AND a.mark='present'`; }
  sql += ' GROUP BY s.id ORDER BY s.held_at DESC';
  const sessions = await all(env, sql, ...binds);
  const counseling = sessions.filter((s) => s.program === 'counseling');
  const visible = sessions.filter((s) => s.program !== 'counseling');
  const P = sessions.reduce((s, r) => s + (r.p || 0), 0), A = sessions.reduce((s, r) => s + (r.ab || 0), 0), Un = sessions.reduce((s, r) => s + (r.u || 0), 0);
  const ids = visible.map((s) => s.id);
  let records: EvidenceResponse['records'] = [];
  if (parts[0] === 'hours') {
    const hrs = await all(env, `SELECT h.*, m.full_name FROM hours h JOIN mentors m ON m.id=h.mentor_id WHERE h.held_on BETWEEN ? AND ? ORDER BY (h.superseded_by IS NOT NULL) DESC, h.held_on DESC LIMIT 80`, Q.start, Q.end);
    const hs = await hoursStats(env);
    return { ref, title: 'Volunteer hours', value: String(hs.total), formula: `Sum of ${hs.entries - hs.dupes} hours entries. ${hs.dupes} entr${hs.dupes === 1 ? 'y' : 'ies'} for the same mentor, date, site and program counted once.`, summary: `${hs.mentors} volunteers · ${hs.entries} entries`, sessions: [],
      records: hrs.map((h) => ({ session_id: h.session_id, held_at: h.held_on, site: h.site ? SITE_SHORT[h.site] ?? h.site : 'Event', row_index: null, raw_text: h.raw_text, mark: null, kid_name: `${h.full_name} · ${h.hours} h · ${h.source}`, probability: null, photo_url: null, bbox: null, confirmed_at: h.reported_at, note: h.superseded_by ? 'Reported twice, counted once' : h.note ?? undefined })) };
  }
  if (parts[0] === 'followups' || parts[0] === 'matches') {
    const isF = parts[0] === 'followups';
    const rows = isF
      ? await all(env, `SELECT fu.*, k.first_name, k.last_name, (SELECT MIN(happened_at) FROM contacts c WHERE c.followup_id=fu.id) contact_at FROM followups fu JOIN kids k ON k.id=fu.kid_id WHERE fu.severity IN ('call','urgent') ORDER BY fu.created_at DESC`)
      : await all(env, `SELECT x.*, k.first_name, k.last_name, m.full_name FROM matches x JOIN kids k ON k.id=x.kid_id JOIN mentors m ON m.id=x.mentor_id ORDER BY x.started_at DESC`);
    const fs = await followupStats(env);
    return { ref, title: isF ? 'Kids who started missing' : 'Mentor matches', value: isF ? `${fs.flagged} flagged` : `${rows.filter((r) => !r.ended_at).length} active`,
      formula: isF ? `A flag is raised at the second missed session in a row, or the third in a month. Reached = a call, a reply, or a closed follow-up.` : 'Active = started on or before Sep 30 and not ended.',
      summary: isF ? `${fs.reached} reached · median ${fs.median ?? '–'} days from first miss to contact` : '', sessions: [],
      records: rows.map((r) => ({ session_id: 0, held_at: (isF ? r.created_at : r.started_at).slice(0, 10), site: '', row_index: null, raw_text: null, mark: null, kid_name: isF ? `${r.first_name} ${r.last_name} · ${r.status}${r.contact_at ? ` · reached ${md(r.contact_at)}` : ''}` : `${r.first_name} ${r.last_name} ↔ ${r.full_name}${r.ended_at ? ` (ended ${md(r.ended_at)})` : ''}`, probability: null, photo_url: null, bbox: null, confirmed_at: null })) };
  }
  if (ids.length) {
    records = (await all(env, `SELECT a.*, s.held_at, s.site, s.photo_url, k.first_name, k.last_name FROM attendance a JOIN sessions s ON s.id=a.session_id LEFT JOIN kids k ON k.id=a.kid_id LEFT JOIN families f ON f.id=k.family_id
      WHERE a.session_id IN (${ids.map(() => '?').join(',')})${recFilter} ORDER BY s.held_at DESC, a.row_index LIMIT 400`, ...ids, ...recBinds))
      .map((a) => ({ session_id: a.session_id, held_at: a.held_at, site: SITE_SHORT[a.site] ?? a.site, row_index: a.row_index, raw_text: a.raw_text, mark: a.mark as Mark, kid_name: a.first_name ? `${a.first_name} ${a.last_name}` : null, probability: a.match_probability, photo_url: a.photo_url, bbox: parseBox(a.bbox), confirmed_at: a.confirmed_at, note: a.kid_id ? undefined : 'No enrolled kid matched; left out of every count' }));
  }
  const sessOut = visible.map((s) => ({ session_id: s.id, held_at: s.held_at, site: SITE_SHORT[s.site] ?? s.site, program: s.program, facilitator: s.fac, present: s.p || 0, absent: s.ab || 0, unclear: s.u || 0, rate: pct(s.p || 0, s.ab || 0), photo_url: s.photo_url }));
  const rate = pct(P, A);
  const counselNote = counseling.length ? `. Counseling: ${counseling.length} sessions counted from the counseling records, no names shown.` : '';
  if (parts[0] === 'sessions') return { ref, title: 'Sessions held', value: String(sessions.length), formula: `Every session with a captured sheet or counseling count between Jul 1 and Sep 30${counselNote || '.'}`, summary: `${visible.length} sheets photographed`, sessions: sessOut, records: [] };
  if (parts[0] === 'kids_served' || parts[0] === 'language') {
    const kidsN = new Set(records.filter((r) => r.kid_name).map((r) => r.kid_name)).size;
    return { ref, title: parts[0] === 'language' ? `Kids from ${LANG_NAME[parts[1]]}-speaking families` : 'Kids served', value: String(kidsN), formula: 'Unique kids marked present on at least one sheet this quarter' + (counselNote || '.'), summary: `${records.length} present marks across ${visible.length} sheets`, sessions: sessOut, records };
  }
  if (parts[0] === 'data_quality') return { ref, title: 'Lines left out', value: String(records.length), formula: 'Names on a sheet that no enrolled kid matched and staff chose to skip. They are not counted anywhere.', summary: '', sessions: sessOut.filter((s) => records.some((r) => r.session_id === s.session_id)), records };
  return { ref, title: `Showed up${title ? ` · ${title}` : ''}`, value: rate !== null ? `${Math.round(rate)}%` : '–', formula: `${P} here ÷ (${P} here + ${A} missed)${Un ? ` · ${Un} unclear left out` : ''}${counselNote}`, summary: `${visible.length} sheets · ${records.length} lines`, sessions: sessOut, records };
}

export async function search(env: Env, q: string): Promise<SearchResult[]> {
  const n = normalize(q);
  if (!n) return [];
  const out: SearchResult[] = [];
  for (const k of (await kidList(env, { q })).slice(0, 8)) out.push({ kind: 'kid', id: k.id, title: k.name, sub: `${k.grade} · ${k.school}`, matched: k.matched_alias, href: `/people/kids/${k.id}` });
  const fams = await all(env, `SELECT DISTINCT f.id, f.household_name, f.primary_contact_name, a.raw_text FROM families f JOIN aliases a ON a.entity='family' AND a.entity_id=f.id WHERE a.normalized LIKE ? OR replace(a.normalized,' ','') LIKE ? LIMIT 6`, `%${n}%`, `%${n.replace(/ /g, '')}%`);
  for (const f of fams) if (!out.some((o) => o.kind === 'family' && o.id === f.id)) out.push({ kind: 'family', id: f.id, title: `${f.household_name} family`, sub: f.primary_contact_name, matched: normalize(f.raw_text) !== normalize(f.primary_contact_name) ? f.raw_text : null, href: `/people/families/${f.id}` });
  for (const m of await all(env, `SELECT id, full_name FROM mentors WHERE lower(full_name) LIKE ? LIMIT 4`, `%${n}%`)) out.push({ kind: 'mentor', id: m.id, title: m.full_name, sub: 'Mentor', matched: null, href: `/people/mentors/${m.id}` });
  return out;
}

export function severityFromScore(s: number): Severity { return s >= 2.5 ? 'urgent' : s >= 1.5 ? 'call' : s >= 0.7 ? 'watch' : 'fine'; }
