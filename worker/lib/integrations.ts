// Connected tools. Exports (CSV, calendar) are real files; Mailchimp / QuickBooks / CRM run against sandbox endpoints that
// compute exactly what would be sent and record the sync, without calling the third-party service.
import type { Integration } from '../../shared/types';
import { type Env, HttpError, addDays, nowISO, LANG_NAME, PROGRAM_LABEL, SITE_SHORT } from './util';

type Row = Record<string, any>;
const ACTIONS: Record<string, Integration['actions']> = {
  whatsapp: [{ label: 'Download message log', method: 'GET', href: '/api/export/messages.csv', download: true }],
  sms: [{ label: 'Download message log', method: 'GET', href: '/api/export/messages.csv', download: true }],
  webform: [{ label: 'Open the sign-up form', method: 'GET', href: '/signup' }, { label: 'Import a spreadsheet', method: 'GET', href: '/people?tab=signups' }],
  sheets: [{ label: 'Download program tracker (.csv)', method: 'GET', href: '/api/export/tracker.csv', download: true }, { label: 'Download volunteer hours (.csv)', method: 'GET', href: '/api/export/hours.csv', download: true }],
  mailchimp: [{ label: 'Sync audience now', method: 'POST', href: '/api/integrations/mailchimp/sync' }, { label: 'Download audience (.csv)', method: 'GET', href: '/api/export/audience.csv', download: true }],
  calendar: [{ label: 'Download calendar (.ics)', method: 'GET', href: '/api/calendar.ics', download: true }],
  quickbooks: [{ label: 'Prepare Q1 in-kind entry', method: 'POST', href: '/api/integrations/quickbooks/post' }],
  crm: [{ label: 'Share Q1 outcomes', method: 'POST', href: '/api/integrations/crm/push' }],
};

export async function list(env: Env): Promise<Integration[]> {
  const rows = (await env.DB.prepare(`SELECT * FROM integrations ORDER BY rowid`).all()).results as Row[];
  return rows.map((r) => ({ key: r.key, name: r.name, kind: r.kind, status: r.status, mode: r.mode, detail: r.detail, last_sync_at: r.last_sync_at, last_result: r.last_result, actions: ACTIONS[r.key] || [] }));
}

const csv = (rows: (string | number | null)[][]) => rows.map((r) => r.map((v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n') + '\n';

export async function exportFile(env: Env, name: string): Promise<{ body: string; type: string; filename: string }> {
  if (name === 'tracker.csv') {
    const rows = (await env.DB.prepare(`SELECT s.held_at, s.program, s.site, k.first_name, k.last_name, k.grade, k.school, a.mark, a.raw_text, a.match_probability, f.household_name, f.primary_contact_name, f.phone, f.language,
        (SELECT m.full_name FROM matches x JOIN mentors m ON m.id=x.mentor_id WHERE x.kid_id=k.id AND x.ended_at IS NULL LIMIT 1) mentor
      FROM attendance a JOIN sessions s ON s.id=a.session_id JOIN kids k ON k.id=a.kid_id JOIN families f ON f.id=k.family_id WHERE s.program!='counseling' AND s.status='confirmed' ORDER BY s.held_at, s.site, a.row_index`).all()).results as Row[];
    await env.DB.prepare(`UPDATE integrations SET last_sync_at=?, last_result=? WHERE key='sheets'`).bind(nowISO(env), `Exported ${new Set(rows.map((r) => r.first_name + r.last_name)).size} kids, ${rows.length} attendance lines`).run();
    return { filename: 'tidepath-program-tracker-FY27Q1.csv', type: 'text/csv', body: csv([['Date', 'Program', 'Site', 'Kid', 'Grade', 'School', 'Mark', 'Written on sheet as', 'Match', 'Family', 'Guardian', 'Phone', 'Language', 'Mentor'],
      ...rows.map((r) => [r.held_at, PROGRAM_LABEL[r.program], SITE_SHORT[r.site] ?? r.site, `${r.first_name} ${r.last_name}`, r.grade, r.school, r.mark, r.raw_text, r.match_probability, r.household_name, r.primary_contact_name, r.phone, LANG_NAME[r.language], r.mentor])]) };
  }
  if (name === 'hours.csv') {
    const rows = (await env.DB.prepare(`SELECT h.*, m.full_name FROM hours h JOIN mentors m ON m.id=h.mentor_id ORDER BY h.held_on`).all()).results as Row[];
    return { filename: 'tidepath-volunteer-hours-FY27Q1.csv', type: 'text/csv', body: csv([['Date', 'Volunteer', 'Hours', 'Site', 'Program', 'Reported via', 'Reported at', 'Counted', 'Note'], ...rows.map((h) => [h.held_on, h.full_name, h.hours, h.site ? SITE_SHORT[h.site] ?? h.site : 'Event', h.program, h.source, h.reported_at, h.superseded_by ? 'no' : 'yes', h.superseded_by ? 'Reported twice, counted once' : h.note ?? h.raw_text])]) };
  }
  if (name === 'messages.csv') {
    const rows = (await env.DB.prepare(`SELECT ms.*, f.household_name FROM messages ms JOIN families f ON f.id=ms.family_id ORDER BY ms.created_at`).all()).results as Row[];
    return { filename: 'tidepath-messages.csv', type: 'text/csv', body: csv([['Time', 'Direction', 'Channel', 'Family', 'To', 'Provider id', 'Status', 'Message'], ...rows.map((m) => [m.created_at, m.direction, m.channel, m.household_name, m.to_number, m.provider_message_id, m.status, m.body])]) };
  }
  if (name === 'audience.csv') {
    const rows = await audience(env);
    return { filename: 'tidepath-family-audience.csv', type: 'text/csv', body: csv([['Email', 'Phone', 'First name', 'Last name', 'Language', 'Tags'], ...rows.map((r) => [r.email, r.phone, r.first, r.last, r.lang, r.tags.join('; ')])]) };
  }
  throw new HttpError(404, 'no_export', 'No such export.');
}

async function audience(env: Env) {
  const fams = (await env.DB.prepare(`SELECT f.*, GROUP_CONCAT(DISTINCT k.program) progs, GROUP_CONCAT(DISTINCT k.site) sites FROM families f JOIN kids k ON k.family_id=f.id WHERE k.program!='counseling' GROUP BY f.id`).all()).results as Row[];
  return fams.map((f) => { const [first, ...rest] = String(f.primary_contact_name).split(' '); return { email: f.email || '', phone: f.phone, first, last: rest.join(' '), lang: LANG_NAME[f.language], tags: [`lang:${f.language}`, ...String(f.progs || '').split(',').map((p) => `program:${p}`), ...String(f.sites || '').split(',').map((s) => `site:${SITE_SHORT[s] ?? s}`)] }; });
}

export async function calendar(env: Env): Promise<string> {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AttendClear//Tidepath Family Alliance//EN', 'X-WR-CALNAME:Tidepath sessions', 'X-WR-TIMEZONE:America/New_York'];
  const series = [
    { name: 'Mentoring · Citrus Grove MS', start: '2026-07-08', time: '160000', end: '180000', rule: 'FREQ=WEEKLY;BYDAY=WE;UNTIL=20261216T235959Z' },
    { name: 'Mentoring · West Little River CC', start: '2026-07-09', time: '163000', end: '183000', rule: 'FREQ=WEEKLY;BYDAY=TH;UNTIL=20261217T235959Z' },
    { name: 'Workshop (alternating sites)', start: '2026-07-07', time: '180000', end: '203000', rule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;UNTIL=20261215T235959Z' },
  ];
  for (const s of series) lines.push('BEGIN:VEVENT', `UID:${s.start}-${s.time}@chiggitycheck`, `DTSTAMP:20260923T120000Z`, `DTSTART;TZID=America/New_York:${s.start.replace(/-/g, '')}T${s.time}`, `DTEND;TZID=America/New_York:${s.start.replace(/-/g, '')}T${s.end}`, `RRULE:${s.rule}`, `SUMMARY:${s.name}`, 'END:VEVENT');
  lines.push('END:VCALENDAR');
  void env; void addDays;
  return lines.join('\r\n');
}

export async function action(env: Env, key: string, verb: string): Promise<{ message: string }> {
  const now = nowISO(env);
  if (key === 'mailchimp' && verb === 'sync') {
    const a = await audience(env);
    const by = (l: string) => a.filter((x) => x.lang === l).length;
    const result = `${a.length} contacts · tags ES ${by('Spanish')}, HT ${by('Haitian Creole')}, EN ${by('English')}`;
    await env.DB.prepare(`UPDATE integrations SET last_sync_at=?, last_result=? WHERE key='mailchimp'`).bind(now, result).run();
    return { message: `Audience synced (sandbox): ${result}. ${a.filter((x) => !x.email).length} families have no email and stay on WhatsApp only.` };
  }
  if (key === 'quickbooks' && verb === 'post') {
    const h = await env.DB.prepare(`SELECT SUM(hours) h, COUNT(DISTINCT mentor_id) m FROM hours WHERE superseded_by IS NULL AND held_on BETWEEN '2026-07-01' AND '2026-09-30'`).first<Row>();
    const result = `Draft journal entry: ${Math.round((h?.h || 0) * 10) / 10} volunteer hours from ${h?.m} volunteers, Q1 FY2027`;
    await env.DB.prepare(`UPDATE integrations SET last_sync_at=?, last_result=? WHERE key='quickbooks'`).bind(now, result).run();
    return { message: `${result}. Prepared in the sandbox for your bookkeeper to value and post.` };
  }
  if (key === 'crm' && verb === 'push') {
    await env.DB.prepare(`UPDATE integrations SET status='connected', last_sync_at=?, last_result=? WHERE key='crm'`).bind(now, 'Q1 FY2027 outcomes shared with development').run();
    return { message: 'Shared the Q1 FY2027 outcome numbers and the report link with the development team (sandbox).' };
  }
  throw new HttpError(404, 'no_action', 'That action does not exist.');
}
