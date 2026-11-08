// Follow-up engine: attendance pattern → severity (Decisions API) → message draft (gpt-5.5) → one open follow-up per kid.
import type { Fact, Lang, Severity } from '../../shared/types';
import { decide, respond } from './ai';
import { type Env, addDays, daysBetween, md, dowLong, time12, nowISO, LANG_NAME, SITE_SHORT } from './util';

export const SEV_RANK: Record<Severity, number> = { fine: 0, watch: 1, call: 2, urgent: 3 };
const LEVELS = [
  { label: 'Fine', description: 'Attending normally.' },
  { label: 'Watch', description: 'One recent miss or a pattern starting.' },
  { label: 'Call this week', description: 'Two or more consecutive misses, or three in the last month, with no contact.' },
  { label: 'Urgent', description: 'Three or more consecutive misses, or a safety-relevant note, and no contact in 14 days.' },
];
const LABEL_TO_SEV: Record<string, Severity> = { Fine: 'fine', Watch: 'watch', 'Call this week': 'call', Urgent: 'urgent' };

export interface KidFeatures {
  kid_id: number; name: string; first_name: string; preferred_name: string | null; program: string; site: string; school: string; grade: string; status: string;
  family_id: number; guardian: string; relationship: string; phone: string; language: Lang; household: string;
  mentor: string | null; mentor_since: string | null;
  sessions: { date: string; mark: string }[];        // this kid's program/site, last 60 days, oldest first
  consecutive_misses: number; misses_30d: number; missed_dates: string[]; last_present: string | null;
  last_contact: string | null; prior_followups: { date: string; severity: string; outcome: string }[];
  next_session: { date: string; time: string } | null;
}

export function ruleSeverity(f: Pick<KidFeatures, 'consecutive_misses' | 'misses_30d' | 'last_contact' | 'sessions'>, today: string): Severity {
  const contacted14 = f.last_contact && daysBetween(f.last_contact, today) <= 14;
  if (f.consecutive_misses >= 3 && !contacted14) return 'urgent';
  if (f.consecutive_misses >= 2 || f.misses_30d >= 3) return contacted14 ? 'watch' : 'call';
  const last = f.sessions[f.sessions.length - 1];
  if (last && last.mark === 'absent') return 'watch';
  return 'fine';
}

/** Next scheduled session for a program/site after `from`. Known schedules first, then "same weekday next week" from history. */
export async function nextSession(env: Env, program: string, site: string, from: string): Promise<{ date: string; time: string } | null> {
  const fixed: Record<string, { dow: number; time: string; every?: number; anchor?: string }> = {
    'mentoring|Citrus Grove MS': { dow: 3, time: '16:00' },
    'mentoring|West Little River CC': { dow: 4, time: '16:30' },
    'counseling|Tidepath office': { dow: 1, time: '15:00' },
  };
  const f = fixed[`${program}|${site}`];
  if (f) {
    for (let i = 1; i <= 14; i++) { const d = addDays(from, i); if (new Date(d + 'T12:00:00Z').getUTCDay() === f.dow) return { date: d, time: f.time }; }
  }
  if (program === 'workshop') {
    // biweekly Tuesdays alternating sites: next after Sep 15 (WLR) is Sep 29 (CG), then Oct 13 (WLR)
    const order = [['2026-09-29', 'Citrus Grove MS'], ['2026-10-13', 'West Little River CC'], ['2026-10-27', 'Citrus Grove MS']];
    const hit = order.find(([d, s]) => d > from && s === site);
    if (hit) return { date: hit[0], time: '18:00' };
  }
  const last = await env.DB.prepare('SELECT held_at, start_time FROM sessions WHERE program=? AND site=? ORDER BY held_at DESC LIMIT 1').bind(program, site).first<{ held_at: string; start_time: string }>();
  if (!last) return null;
  let d = last.held_at;
  while (d <= from) d = addDays(d, 7);
  return { date: d, time: last.start_time || '16:00' };
}
export const fmtNext = (n: { date: string; time: string } | null) => (n ? `${dowLong(n.date).slice(0, 3)} ${md(n.date)}, ${time12(n.time)}` : null);

export async function featuresFor(env: Env, kidIds: number[]): Promise<KidFeatures[]> {
  if (!kidIds.length) return [];
  const today = env.DEMO_TODAY;
  const since = addDays(today, -60);
  const ph = kidIds.map(() => '?').join(',');
  const kids = (await env.DB.prepare(`SELECT k.*, f.primary_contact_name AS guardian, f.relationship, f.phone, f.language, f.household_name,
      (SELECT m.full_name FROM matches x JOIN mentors m ON m.id=x.mentor_id WHERE x.kid_id=k.id AND x.ended_at IS NULL ORDER BY x.started_at DESC LIMIT 1) AS mentor,
      (SELECT x.started_at FROM matches x WHERE x.kid_id=k.id AND x.ended_at IS NULL ORDER BY x.started_at DESC LIMIT 1) AS mentor_since
      FROM kids k JOIN families f ON f.id=k.family_id WHERE k.id IN (${ph})`).bind(...kidIds).all()).results as Record<string, any>[];
  const att = (await env.DB.prepare(`SELECT a.kid_id, a.mark, s.held_at, s.program, s.site FROM attendance a JOIN sessions s ON s.id=a.session_id
      WHERE a.kid_id IN (${ph}) AND s.held_at >= ? AND s.status='confirmed' ORDER BY s.held_at`).bind(...kidIds, since).all()).results as Record<string, any>[];
  const contacts = (await env.DB.prepare(`SELECT kid_id, MAX(happened_at) AS last FROM contacts WHERE kid_id IN (${ph}) GROUP BY kid_id`).bind(...kidIds).all()).results as Record<string, any>[];
  const sent = (await env.DB.prepare(`SELECT kid_id, MAX(sent_at) AS last FROM followups WHERE kid_id IN (${ph}) AND sent_at IS NOT NULL GROUP BY kid_id`).bind(...kidIds).all()).results as Record<string, any>[];
  const prior = (await env.DB.prepare(`SELECT kid_id, created_at, severity, status FROM followups WHERE kid_id IN (${ph}) AND status IN ('closed','sent','replied') ORDER BY created_at`).bind(...kidIds).all()).results as Record<string, any>[];
  const out: KidFeatures[] = [];
  for (const k of kids) {
    const mine = att.filter((a) => a.kid_id === k.id && a.program === k.program && (k.program !== 'mentoring' || a.site === k.site));
    const sessions = mine.map((a) => ({ date: a.held_at as string, mark: a.mark as string }));
    let consecutive = 0;
    const missed: string[] = [];
    for (let i = sessions.length - 1; i >= 0; i--) {
      if (sessions[i].mark === 'absent') { consecutive++; missed.unshift(sessions[i].date); } else if (sessions[i].mark === 'present') break;
    }
    const misses30 = sessions.filter((s) => s.mark === 'absent' && daysBetween(s.date, today) <= 30);
    const lastPresent = [...sessions].reverse().find((s) => s.mark === 'present')?.date ?? null;
    const c = contacts.find((x) => x.kid_id === k.id)?.last ?? null;
    const sn = sent.find((x) => x.kid_id === k.id)?.last ?? null;
    const lastContact = [c, sn].filter(Boolean).sort().pop() ?? null;
    const missedDates = consecutive >= 2 ? missed : misses30.map((s) => s.date);
    out.push({
      kid_id: k.id, name: `${k.first_name} ${k.last_name}`, first_name: k.first_name, preferred_name: k.preferred_name, program: k.program, site: k.site, school: k.school, grade: k.grade, status: k.status,
      family_id: k.family_id, guardian: k.guardian, relationship: k.relationship, phone: k.phone, language: k.language, household: k.household_name,
      mentor: k.mentor, mentor_since: k.mentor_since, sessions, consecutive_misses: consecutive, misses_30d: misses30.length, missed_dates: missedDates,
      last_present: lastPresent, last_contact: lastContact,
      prior_followups: prior.filter((p) => p.kid_id === k.id).map((p) => ({ date: String(p.created_at).slice(0, 10), severity: p.severity, outcome: p.status })),
      next_session: await nextSession(env, k.program, k.site, today),
    });
  }
  return out;
}

export interface Scored { f: KidFeatures; severity: Severity; score: number; confidence: number; language: Lang; needs_review: boolean; source: 'decisions' | 'rules' }

export async function score(env: Env, feats: KidFeatures[]): Promise<Scored[]> {
  const today = env.DEMO_TODAY;
  const candidates = feats.filter((f) => f.sessions.length);
  if (!candidates.length) return [];
  const questions = candidates.flatMap((f) => [
    { type: 'score' as const, name: `sev_${f.kid_id}`, instructions: `How urgently does staff need to contact the family of kid K${f.kid_id} about attendance? Today is ${today}. Use kid K${f.kid_id}'s record only.`, levels: LEVELS },
    { type: 'choice' as const, name: `lang_${f.kid_id}`, instructions: `Which language should a message to the family of kid K${f.kid_id} be written in? The family record says ${LANG_NAME[f.language]}; flag a mismatch only if the record clearly suggests otherwise.`, choices: [{ value: 'en', description: 'English' }, { value: 'es', description: 'Spanish' }, { value: 'ht', description: 'Haitian Creole' }] },
    { type: 'predicate' as const, name: `rev_${f.kid_id}`, instructions: `Is there anything unusual about kid K${f.kid_id} that a human should look at before an automatic message goes to the family (for example a school change, a recent call that explains the absences, or a safety concern)?` },
  ]);
  const data = { today, program_note: 'Sessions are weekly (mentoring) or every two weeks (workshops). Marks: present, absent, unclear.', kids: candidates.map((f) => ({
    id: `K${f.kid_id}`, program: f.program, site: f.site, status: f.status, family_language: f.language,
    sessions_last_60_days: f.sessions, consecutive_misses: f.consecutive_misses, misses_last_30_days: f.misses_30d,
    last_present: f.last_present, last_contact_with_family: f.last_contact, prior_followups: f.prior_followups,
  })) };
  try {
    const ans = await decide(env, 'followup_score', data, questions);
    return candidates.map((f) => {
      const s = ans.get(`sev_${f.kid_id}`);
      const l = ans.get(`lang_${f.kid_id}`);
      const r = ans.get(`rev_${f.kid_id}`);
      let severity: Severity = ruleSeverity(f, today);
      let sc = SEV_RANK[severity], conf = 0.6;
      if (s && s.type === 'score') {
        const best = [...s.probabilities].sort((a, b) => b.probability - a.probability)[0];
        severity = LABEL_TO_SEV[best.label] ?? severity;
        sc = s.score; conf = best.probability;
      }
      // Guardrail: the model can raise a flag, but never clear a kid with 2+ misses in a row and no contact.
      const rule = ruleSeverity(f, today);
      if (SEV_RANK[rule] >= 2 && SEV_RANK[severity] < SEV_RANK[rule]) severity = rule;
      const language = (l && l.type === 'choice' ? l.choice : f.language) as Lang;
      return { f, severity, score: Number(sc.toFixed(2)), confidence: Number(conf.toFixed(2)), language, needs_review: !!(r && r.type === 'predicate' && r.probability > 0.6), source: 'decisions' as const };
    });
  } catch (e) {
    console.error('decisions scoring failed, using rules', e);
    return candidates.map((f) => ({ f, severity: ruleSeverity(f, today), score: SEV_RANK[ruleSeverity(f, today)], confidence: 0.6, language: f.language, needs_review: false, source: 'rules' as const }));
  }
}

export function factsFor(f: KidFeatures): Fact[] {
  const facts: Fact[] = [];
  if (f.missed_dates.length) facts.push({ kind: 'sheet', label: `Missed ${f.missed_dates.map(md).join(', ')}`, source: `${f.missed_dates.length} sheet${f.missed_dates.length > 1 ? 's' : ''}` });
  if (f.last_present) facts.push({ kind: 'sheet', label: `Last here ${md(f.last_present)}`, source: 'sheet' });
  if (f.mentor) facts.push({ kind: 'mentor', label: `Mentor ${f.mentor}`, source: f.mentor_since ? `since ${md(f.mentor_since)}` : 'match' });
  facts.push({ kind: 'form', label: LANG_NAME[f.language], source: 'sign-up form' });
  if (f.next_session) facts.push({ kind: 'schedule', label: `Next: ${fmtNext(f.next_session)}`, source: 'schedule' });
  return facts;
}

const DRAFT_SCHEMA = {
  name: 'family_message',
  schema: {
    type: 'object', additionalProperties: false, required: ['message', 'english', 'highlights'],
    properties: {
      message: { type: 'string', description: 'The message in the requested language.' },
      english: { type: 'string', description: 'A faithful English translation of the message (repeat the message if it is already English).' },
      highlights: { type: 'array', items: { type: 'string' }, description: 'Exact substrings of `message` that come straight from the facts: names, dates, place, time.' },
    },
  },
};

const MONTHS: Record<Lang, string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  ht: ['janvye', 'fevriye', 'mas', 'avril', 'me', 'jen', 'jiyè', 'out', 'septanm', 'oktòb', 'novanm', 'desanm'],
};
const WEEKDAYS: Record<Lang, string[]> = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
  ht: ['dimanch', 'lendi', 'madi', 'mèkredi', 'jedi', 'vandredi', 'samdi'],
};
const PROGRAM_WORD: Record<Lang, Record<string, string>> = {
  en: { mentoring: 'mentoring', workshop: 'workshop', counseling: 'counseling' },
  es: { mentoring: 'mentoría', workshop: 'taller', counseling: 'consejería' },
  ht: { mentoring: 'mantora', workshop: 'atelye', counseling: 'konsèy' },
};
function dayWords(iso: string, lang: Lang): string {
  const d = new Date(iso.slice(0, 10) + 'T12:00:00Z');
  const n = d.getUTCDate(), m = MONTHS[lang][d.getUTCMonth()];
  return lang === 'en' ? `${m} ${n}` : lang === 'es' ? `${n} de ${m}` : `${n} ${m}`;
}

export async function draftMessage(env: Env, f: KidFeatures, language: Lang): Promise<{ message: string; english: string | null; highlights: string[] }> {
  const L = language;
  const mentorFirst = f.mentor ? f.mentor.split(' ')[0] : null;
  const facts = {
    kid_name: f.preferred_name || f.first_name, guardian_full_name: f.guardian, guardian_relationship: f.relationship,
    program: PROGRAM_WORD[L][f.program] ?? f.program, place: SITE_SHORT[f.site] ?? f.site,
    mentor_first_name: mentorFirst,
    missed_sessions: f.missed_dates.map((d) => `${WEEKDAYS[L][new Date(d + 'T12:00:00Z').getUTCDay()]} ${dayWords(d, L)}`),
    missed_count: f.missed_dates.length, consecutive_misses: f.consecutive_misses,
    last_attended: f.last_present ? dayWords(f.last_present, L) : null,
    next_session: f.next_session ? `${WEEKDAYS[L][new Date(f.next_session.date + 'T12:00:00Z').getUTCDay()]} ${dayWords(f.next_session.date, L)}, ${time12(f.next_session.time)}` : null,
    office_phone: env.OFFICE_PHONE, staff_name: env.STAFF_NAME, organization: env.ORG_NAME,
  };
  const instructions = `You write short, warm, specific WhatsApp messages from ${env.ORG_NAME} to a parent or guardian. Write ONLY in ${LANG_NAME[L]}${L === 'ht' ? ' (Kreyòl ayisyen, standard orthography)' : ''}. Use ONLY the facts provided, worded exactly as given (dates, program word, place). Never invent names, dates, reasons or events. Under 70 words. Plain words a busy parent reads quickly. No emojis, no bullet points.
Structure: greet the guardian respectfully by title and surname; say who is writing (${env.STAFF_NAME} from ${env.ORG_NAME}); say ${facts.kid_name} missed the listed sessions; say ${mentorFirst ? `${mentorFirst}, the mentor, is asking about ${facts.kid_name}` : 'the team misses them'}; ask if everything is OK; give the next session; invite a reply or a call to ${env.OFFICE_PHONE}; sign "${env.STAFF_NAME}, ${env.ORG_NAME}".`;
  const raw = await respond(env, 'draft', { instructions, input: `Facts (JSON): ${JSON.stringify(facts)}`, schema: DRAFT_SCHEMA, effort: 'low', timeoutMs: 40000 });
  const j = JSON.parse(raw) as { message: string; english: string; highlights: string[] };
  const must = [facts.kid_name, mentorFirst, facts.place, ...f.missed_dates.map((d) => dayWords(d, L))].filter(Boolean) as string[];
  const highlights = [...new Set([...(j.highlights || []), ...must])].filter((h) => h && j.message.includes(h) && h !== env.ORG_NAME && h !== env.OFFICE_PHONE && h !== env.STAFF_NAME);
  return { message: j.message.trim(), english: L === 'en' ? null : j.english.trim(), highlights };
}

/** Score kids and create/update exactly one open follow-up each. Returns what changed. */
export async function refreshFollowups(env: Env, kidIds: number[], opts: { draft?: boolean } = {}) {
  const feats = await featuresFor(env, kidIds);
  const scored = await score(env, feats);
  const now = nowISO(env);
  const created: { followup_id: number; kid_name: string; severity: Severity }[] = [];
  const updated: { followup_id: number; kid_name: string; from: Severity; to: Severity }[] = [];
  const drafts: Promise<void>[] = [];
  for (const s of scored) {
    const open = await env.DB.prepare(`SELECT * FROM followups WHERE kid_id=? AND status='open' ORDER BY created_at DESC LIMIT 1`).bind(s.f.kid_id).first<Record<string, any>>();
    const reason = { missed: s.f.missed_dates, consecutive_misses: s.f.consecutive_misses, misses_30d: s.f.misses_30d, last_present: s.f.last_present, next: fmtNext(s.f.next_session), source: s.source };
    const facts = factsFor(s.f);
    if (s.severity === 'fine') {
      if (open) await env.DB.prepare(`UPDATE followups SET status='closed', closed_at=?, updated_at=? WHERE id=?`).bind(now, now, open.id).run();
      continue;
    }
    let id: number;
    const needsDraft = SEV_RANK[s.severity] >= 2;
    if (!open) {
      const r = await env.DB.prepare(`INSERT INTO followups (kid_id, family_id, reason_json, severity, severity_score, severity_confidence, needs_review, language, facts_json, status, first_miss_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,'open',?,?,?)`)
        .bind(s.f.kid_id, s.f.family_id, JSON.stringify(reason), s.severity, s.score, s.confidence, s.needs_review ? 1 : 0, s.language, JSON.stringify(facts), s.f.missed_dates[0] ?? null, now, now).run();
      id = Number(r.meta.last_row_id);
      if (needsDraft) created.push({ followup_id: id, kid_name: s.f.name, severity: s.severity });
    } else {
      id = open.id;
      const changed = open.severity !== s.severity || JSON.parse(open.reason_json || '{}').missed?.join() !== s.f.missed_dates.join();
      await env.DB.prepare(`UPDATE followups SET reason_json=?, severity=?, severity_score=?, severity_confidence=?, needs_review=?, language=?, facts_json=?, updated_at=? WHERE id=?`)
        .bind(JSON.stringify(reason), s.severity, s.score, s.confidence, s.needs_review ? 1 : 0, s.language, JSON.stringify(facts), now, id).run();
      if (open.severity !== s.severity && SEV_RANK[s.severity] >= 2) {
        if (SEV_RANK[open.severity as Severity] >= 2) updated.push({ followup_id: id, kid_name: s.f.name, from: open.severity, to: s.severity });
        else created.push({ followup_id: id, kid_name: s.f.name, severity: s.severity });
      }
      if (!changed && open.draft_text) continue;
    }
    if (needsDraft && opts.draft !== false) {
      drafts.push((async () => {
        try {
          const d = await draftMessage(env, s.f, s.language);
          await env.DB.prepare(`UPDATE followups SET draft_text=?, draft_translation=?, facts_json=?, updated_at=? WHERE id=?`)
            .bind(d.message, d.english, JSON.stringify({ facts, highlights: d.highlights }), nowISO(env), id).run();
        } catch (e) { console.error('draft failed', e); }
      })());
    }
  }
  await Promise.all(drafts);
  if (created.length || updated.length) {
    await env.DB.prepare(`INSERT INTO activity (kind, text, bold, link, at) VALUES ('draft', ?, ?, '/calls', ?)`)
      .bind(`Wrote ${created.length + updated.length} message${created.length + updated.length > 1 ? 's' : ''} for families to call`, `${created.length + updated.length} message${created.length + updated.length > 1 ? 's' : ''}`, now).run();
  }
  return { created, updated, scored };
}
