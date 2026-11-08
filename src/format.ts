import type { Lang, Program, Severity, Mark } from '../shared/types'

const TZ = 'America/New_York'
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function toDate(s: string): { d: Date; tz: string } {
  if (DATE_ONLY.test(s)) {
    const [y, m, dd] = s.split('-').map(Number)
    return { d: new Date(Date.UTC(y, m - 1, dd, 12)), tz: 'UTC' }
  }
  // Timestamps with an explicit zone are converted to Miami time. The API's zone-less timestamps are already
  // Miami wall-clock time, so they are shown exactly as written.
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) return { d: new Date(s), tz: TZ }
  return { d: new Date(s.replace(' ', 'T').slice(0, 19) + 'Z'), tz: 'UTC' }
}
function fmt(s: string | null | undefined, o: Intl.DateTimeFormatOptions): string {
  if (!s) return ''
  const { d, tz } = toDate(s)
  if (isNaN(d.getTime())) return s
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, ...o }).format(d)
}
/** "Sep 23" */
export const fmtDay = (s?: string | null) => fmt(s, { month: 'short', day: 'numeric' })
/** "Wed Sep 23" */
export const fmtDow = (s?: string | null) => fmt(s, { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '')
/** "Wednesday, September 23" */
export const fmtLong = (s?: string | null) => fmt(s, { weekday: 'long', month: 'long', day: 'numeric' })
/** "Wed Sep 23, 2026" */
export const fmtFull = (s?: string | null) => {
  const r = fmt(s, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  return r.replace(/^(\w+),/, '$1')
}
/** "4:42 pm" */
export const fmtTime = (s?: string | null) =>
  s && !DATE_ONLY.test(s) ? fmt(s, { hour: 'numeric', minute: '2-digit' }).replace(' AM', ' am').replace(' PM', ' pm') : ''
/** "Sat" */
export const fmtWeekday = (s?: string | null) => fmt(s, { weekday: 'short' })
/** date key in Miami time: "2026-09-23" */
export function dayKey(s?: string | null): string {
  if (!s) return ''
  if (DATE_ONLY.test(s)) return s
  const { d, tz } = toDate(s)
  if (isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
/** "Today 4:42 pm" / "Sep 21, 4:42 pm" */
export function fmtWhen(s?: string | null, today?: string): string {
  if (!s) return ''
  const t = fmtTime(s)
  if (today && dayKey(s) === today) return t ? `Today ${t}` : 'Today'
  return t ? `${fmtDay(s)}, ${t}` : fmtDay(s)
}

/** rate may arrive as 0..1 or 0..100 */
export const pctNum = (v: number | null | undefined) => (v === null || v === undefined || isNaN(v) ? 0 : v <= 1 ? v * 100 : v)
export function pct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || isNaN(v)) return '—'
  return `${pctNum(v).toFixed(digits)}%`
}
export const prob = (p: number | null | undefined) => (p === null || p === undefined ? '' : `${Math.round(p <= 1 ? p * 100 : p)}%`)
export const probNum = (p: number | null | undefined) => (p === null || p === undefined ? 0 : Math.round(p <= 1 ? p * 100 : p))
export const hrs = (h: number) => (Number.isInteger(h) ? `${h}` : h.toFixed(1))
export const money = (usd: number) => `$${usd < 1 ? usd.toFixed(4) : usd.toFixed(2)}`
export const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`

export const LANG_NAME: Record<Lang, string> = { en: 'English', es: 'Spanish', ht: 'Kreyòl' }
export const LANG_NATIVE: Record<Lang, string> = { es: 'Español', en: 'English', ht: 'Kreyòl' }
export const LANG_SHORT: Record<Lang, string> = { en: 'EN', es: 'ES', ht: 'HT' }
export const PROGRAM: Record<Program, string> = { mentoring: 'Mentoring', workshop: 'Workshop', counseling: 'Counseling' }
export const SEV: Record<Severity, string> = { fine: 'On track', watch: 'Keep an eye', call: 'Call', urgent: 'Urgent' }
export const SEV_DOT: Record<Severity, string> = { fine: 'g', watch: 'w', call: 'c', urgent: 'u' }
export const SEV_LEVEL: Record<Severity, number> = { fine: 1, watch: 2, call: 3, urgent: 4 }
export const MARK: Record<Mark, string> = { present: 'here', absent: 'missed', unclear: 'unclear' }

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
export const word = (n: number, lower = false) => {
  const w = n >= 0 && n < WORDS.length ? WORDS[n] : String(n)
  return lower ? w.toLowerCase() : w
}
export const plural = (n: number, one: string, many?: string) => `${n} ${n === 1 ? one : (many ?? one + 's')}`

export function grad(id: number | string): string {
  const n = typeof id === 'number' ? id : [...id].reduce((a, c) => a + c.charCodeAt(0), 0)
  return `g${(Math.abs(n) % 5) + 1}`
}
export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\s-]/gu, '').split(/[\s-]+/).filter(Boolean)
  if (!parts.length) return '?'
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name
export function gradeLabel(g: string): string {
  if (!g) return ''
  if (/grade/i.test(g)) return g
  if (/^\d+$/.test(g)) {
    const n = +g
    const suf = n % 100 > 10 && n % 100 < 14 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
    return `${n}${suf} grade`
  }
  return `${g} grade`
}
