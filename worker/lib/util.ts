// Small shared helpers: dates on the frozen demo clock, name normalization, string similarity.

export type Env = Cloudflare.Env & { OPENAI_API_KEY?: string; AI_GATEWAY_ID: string };

/** The demo clock: date frozen at DEMO_TODAY, time of day is the real current time in Miami. */
export function nowISO(env: Env): string {
  const t = new Date();
  const hm = t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'America/New_York' });
  return `${env.DEMO_TODAY}T${hm}`;
}
export const today = (env: Env) => env.DEMO_TODAY as string;

export function addDays(iso: string, n: number): string {
  const d = new Date(iso.slice(0, 10) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b.slice(0, 10) + 'T12:00:00Z').getTime() - new Date(a.slice(0, 10) + 'T12:00:00Z').getTime()) / 86400000);
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function md(iso: string | null | undefined): string {
  if (!iso) return '';
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${MON[m - 1]} ${d}`;
}
export function dow(iso: string): string { return DOW[new Date(iso.slice(0, 10) + 'T12:00:00Z').getUTCDay()]; }
export function dowLong(iso: string): string { return DOW_LONG[new Date(iso.slice(0, 10) + 'T12:00:00Z').getUTCDay()]; }
export function time12(hhmm: string | null | undefined): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}
export function weekRange(iso: string): { start: string; end: string } {
  const d = new Date(iso + 'T12:00:00Z');
  const offset = (d.getUTCDay() + 6) % 7; // Monday start
  const start = addDays(iso, -offset);
  return { start, end: addDays(start, 6) };
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

export function stripAccents(s: string): string { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }

const NICKNAMES: Record<string, string[]> = {
  josh: ['joshua'], sam: ['samuel', 'samantha'], manny: ['emmanuel'], fabi: ['fabiola'], chris: ['christina', 'christopher'],
  lexi: ['alexa'], dani: ['daniela', 'daniel'], isa: ['isabella'], gabe: ['gabriel'], alex: ['alejandro', 'alexa', 'alexander'],
  nate: ['nathaniel'], jon: ['jonathan'], vale: ['valentina', 'valeria'], javi: ['javier'], mike: ['michael'], kev: ['kevin'],
};
export function normalize(s: string): string {
  return stripAccents(String(s || '')).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
export function expandNick(token: string): string[] { return [token, ...(NICKNAMES[token] || [])]; }

export function jaroWinkler(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const md = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array(a.length).fill(false), bm = new Array(b.length).fill(false);
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - md); j < Math.min(b.length, i + md + 1); j++) {
      if (bm[j] || a[i] !== b[j]) continue;
      am[i] = bm[j] = true; m++; break;
    }
  }
  if (!m) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < a.length; i++) { if (!am[i]) continue; while (!bm[k]) k++; if (a[i] !== b[k]) t++; k++; }
  const j = (m / a.length + m / b.length + (m - t / 2) / m) / 3;
  let p = 0; while (p < 4 && a[p] === b[p]) p++;
  return j + p * 0.1 * (1 - j);
}

/** Similarity between a handwritten name and a canonical first/last, handling initials, abbreviations and nicknames. */
export function nameScore(raw: string, first: string, last: string, aliases: string[] = []): number {
  const r = normalize(raw);
  if (!r) return 0;
  const al = aliases.map(normalize);
  if (al.includes(r)) return 0.99;
  const toks = r.split(' ');
  const f = normalize(first), l = normalize(last).replace(/ /g, '');
  const rf = toks[0], rl = toks.slice(1).join('').replace(/\./g, '');
  const firstScore = Math.max(...expandNick(rf).map((x) => (x.length === 1 ? (f[0] === x ? 0.8 : 0) : jaroWinkler(x, f))));
  let lastScore = 0;
  if (!rl) lastScore = 0.4;
  else if (rl.length === 1) lastScore = l[0] === rl ? 0.75 : 0;
  else {
    const consonants = l.replace(/[aeiou]/g, '');
    lastScore = Math.max(jaroWinkler(rl, l), consonants.startsWith(rl) || rl.split('').every((ch) => l.includes(ch)) && l[0] === rl[0] ? 0.82 : 0);
  }
  return Math.min(0.98, firstScore * 0.55 + lastScore * 0.45);
}

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

export function sha256Hex(buf: ArrayBuffer): Promise<string> {
  return crypto.subtle.digest('SHA-256', buf).then((h) => [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join(''));
}

export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export const LANG_NAME: Record<string, string> = { en: 'English', es: 'Spanish', ht: 'Haitian Creole' };
export const SITE_SHORT: Record<string, string> = { 'Citrus Grove MS': 'Citrus Grove', 'West Little River CC': 'West Little River', 'Tidepath office': 'Office' };
export const PROGRAM_LABEL: Record<string, string> = { mentoring: 'Mentoring', workshop: 'Workshops', counseling: 'Counseling' };
