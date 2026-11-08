import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Severity, StripDot } from '../../shared/types'
import { errMsg } from '../api'
import { SEV, SEV_DOT, fmtDay } from '../format'

/* ---------- icons: the mockup's inline sprite ---------- */
export type IconName =
  | 'check' | 'cam' | 'phone' | 'msg' | 'search' | 'bell' | 'sheet' | 'form' | 'text' | 'spark' | 'merge' | 'copy'
  | 'pen' | 'arrow' | 'lock' | 'school' | 'home' | 'people' | 'doc' | 'share' | 'clock' | 'q'
  | 'x' | 'upload' | 'back' | 'plug' | 'info' | 'reset' | 'db' | 'img' | 'zoomin' | 'zoomout' | 'expand'

export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7" /></symbol>
      <symbol id="i-cam" viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></symbol>
      <symbol id="i-phone" viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" /></symbol>
      <symbol id="i-msg" viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z" /></symbol>
      <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></symbol>
      <symbol id="i-bell" viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0112 0v5l2 2H4zM10 21h4" /></symbol>
      <symbol id="i-sheet" viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></symbol>
      <symbol id="i-form" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h5" /></symbol>
      <symbol id="i-text" viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" /></symbol>
      <symbol id="i-spark" viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></symbol>
      <symbol id="i-merge" viewBox="0 0 24 24"><path d="M6 4v5a5 5 0 005 5h7M14 10l4 4-4 4" /></symbol>
      <symbol id="i-copy" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" /></symbol>
      <symbol id="i-pen" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z" /></symbol>
      <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M7 17L17 7M9 7h8v8" /></symbol>
      <symbol id="i-lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></symbol>
      <symbol id="i-school" viewBox="0 0 24 24"><path d="M3 10l9-5 9 5-9 5z" /><path d="M7 12v5c3 2 7 2 10 0v-5" /></symbol>
      <symbol id="i-home" viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v9H4z" /></symbol>
      <symbol id="i-people" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0M16 4a3.5 3.5 0 010 7M21.5 20a6.5 6.5 0 00-5-6.3" /></symbol>
      <symbol id="i-doc" viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z" /><path d="M9 13h6M9 17h6" /></symbol>
      <symbol id="i-share" viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5M5 14v6h14v-6" /></symbol>
      <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></symbol>
      <symbol id="i-q" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M9.5 9.5a2.5 2.5 0 114 2c-1 .6-1.5 1-1.5 2M12 16.5v.5" /></symbol>
      <symbol id="i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></symbol>
      <symbol id="i-upload" viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4" /></symbol>
      <symbol id="i-back" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></symbol>
      <symbol id="i-plug" viewBox="0 0 24 24"><path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 01-12 0zM12 17v4" /></symbol>
      <symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 11v5M12 8v.5" /></symbol>
      <symbol id="i-reset" viewBox="0 0 24 24"><path d="M4 12a8 8 0 108-8 8 8 0 00-5.7 2.3L4 8.5M4 4v4.5h4.5" /></symbol>
      <symbol id="i-db" viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></symbol>
      <symbol id="i-img" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M20 16l-5-5-8 8" /></symbol>
      <symbol id="i-zoomin" viewBox="0 0 24 24"><path d="M12 6v12M6 12h12" /></symbol>
      <symbol id="i-zoomout" viewBox="0 0 24 24"><path d="M6 12h12" /></symbol>
      <symbol id="i-expand" viewBox="0 0 24 24"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /></symbol>
    </svg>
  )
}

export function Icon({ name, style, className }: { name: IconName; style?: CSSProperties; className?: string }) {
  return (
    <svg className={`i${className ? ' ' + className : ''}`} style={style} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  )
}

/* ---------- small pieces ---------- */
export function Strip({ dots, max = 12 }: { dots: StripDot[]; max?: number }) {
  const d = dots.slice(-max)
  return (
    <div className="strip" aria-label={`${d.filter((x) => x.mark === 'present').length} here, ${d.filter((x) => x.mark === 'absent').length} missed`}>
      {d.map((x) => (
        <i key={x.session_id} className={x.mark === 'absent' ? 'a' : undefined} style={x.mark === 'unclear' ? { background: 'rgba(77,107,254,.3)' } : undefined} title={`${fmtDay(x.held_at)} · ${x.mark}`} />
      ))}
    </div>
  )
}

export function SevBadge({ severity }: { severity: Severity | null }) {
  if (!severity) return null
  if (severity === 'urgent')
    return <span className="pill" style={{ color: 'var(--urgent)', background: 'rgba(229,72,77,.10)', height: 26, padding: '0 10px' }}>Urgent</span>
  return <span className={`sev ${SEV_DOT[severity]}`} title={SEV[severity]} aria-label={SEV[severity]} role="img" />
}

export function SevPill({ severity }: { severity: Severity | null }) {
  if (!severity) return null
  const color = { urgent: 'var(--urgent)', call: '#B86A1E', watch: 'var(--ink-3)', fine: 'var(--good)' }[severity]
  const bg = { urgent: 'rgba(229,72,77,.10)', call: 'rgba(240,150,60,.14)', watch: 'rgba(11,12,16,.05)', fine: 'rgba(47,163,107,.12)' }[severity]
  return <span className="pill" style={{ color, background: bg, height: 26, padding: '0 10px' }}>{SEV[severity]}</span>
}

export function Avatar({ text, seed, size, className, style }: { text: string; seed: number | string; size?: number; className?: string; style?: CSSProperties }) {
  const s: CSSProperties = size ? { width: size, height: size, fontSize: Math.round(size * 0.33), ...style } : { ...style }
  const g = typeof seed === 'number' || seed ? `g${(Math.abs(typeof seed === 'number' ? seed : [...seed].reduce((a, c) => a + c.charCodeAt(0), 0)) % 5) + 1}` : 'g6'
  return <div className={`av ${g}${className ? ' ' + className : ''}`} style={s} aria-hidden="true">{text}</div>
}

export function Shimmer({ h = 18, w = '100%', r, style }: { h?: number; w?: number | string; r?: number; style?: CSSProperties }) {
  return <div className="shim" style={{ height: h, width: w, borderRadius: r, ...style }} aria-hidden="true" />
}

export function ShimmerCard({ lines = 4, className = 'card', tall }: { lines?: number; className?: string; tall?: boolean }) {
  return (
    <section className={className} aria-busy="true" aria-label="Loading">
      <Shimmer h={22} w="45%" />
      {tall && <Shimmer h={56} w="35%" style={{ marginTop: 18 }} />}
      {Array.from({ length: lines }).map((_, i) => (
        <Shimmer key={i} h={14} w={`${90 - i * 12}%`} style={{ marginTop: 14 }} />
      ))}
    </section>
  )
}

export function ErrorState({ error, onRetry, inCard = true }: { error: unknown; onRetry?: () => void; inCard?: boolean }) {
  const body = (
    <div className="state" role="alert">
      <div className="title">That didn't load.</div>
      <div className="sub">{errMsg(error)}</div>
      {onRetry && <button className="btn dark sm" onClick={onRetry}>Retry</button>}
    </div>
  )
  return inCard ? <section className="card">{body}</section> : body
}

export function EmptyState({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="state">
      <div className="sub" style={{ fontSize: 16, color: 'var(--ink-2)' }}>{text}</div>
      {action}
    </div>
  )
}

export function Seg<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: ReactNode; count?: number }[]; onChange: (v: T) => void; label: string
}) {
  return (
    <span className="segc" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : undefined} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count !== undefined && <b>{o.count}</b>}
        </button>
      ))}
    </span>
  )
}

/* ---------- data hook ---------- */
export function useApi<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps)
  const load = useCallback((quiet = false) => {
    const my = ++seq.current
    if (!quiet) setLoading(true)
    setError(null)
    run().then(
      (d) => { if (my === seq.current) { setData(d); setLoading(false) } },
      (e) => { if (my === seq.current) { setError(e); setLoading(false) } },
    )
  }, [run])
  useEffect(() => { load() }, [load])
  return { data, error, loading, reload: load, setData }
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function useEscape(onEsc: () => void, active = true) {
  useEffect(() => {
    if (!active) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onEsc() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onEsc, active])
}

export function useIsPhone(): boolean {
  const q = '(max-width: 860px)'
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const h = () => setM(mq.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])
  return m
}

/** Render `text` with every substring in `marks` wrapped in <mark>. */
export function Highlighted({ text, marks }: { text: string; marks: string[] }) {
  const ms = marks.filter(Boolean).sort((a, b) => b.length - a.length)
  if (!ms.length) return <>{text}</>
  const esc = ms.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const parts = text.split(new RegExp(`(${esc.join('|')})`, 'g'))
  return <>{parts.map((p, i) => (ms.includes(p) ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))}</>
}

/** Render `text` with the first occurrence of `bold` wrapped in <b>. */
export function Bolded({ text, bold }: { text: string; bold: string }) {
  if (!bold) return <>{text}</>
  const i = text.indexOf(bold)
  if (i < 0) return <>{text} <b>{bold}</b></>
  return <>{text.slice(0, i)}<b>{bold}</b>{text.slice(i + bold.length)}</>
}
