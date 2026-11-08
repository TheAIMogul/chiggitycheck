import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { EditResponse, Ripple } from '../../shared/types'
import { errMsg } from '../api'
import { secs } from '../format'
import { Icon, type IconName } from './ui'

/* ---------- motion helpers ---------- */
export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Split "77%" / "4.1 h" / "$12" into prefix, number, suffix. null when there is no number. */
function splitNum(s: string): { pre: string; n: number; post: string; dec: number } | null {
  const m = /^([^\d-]*)(-?\d[\d,]*(?:\.\d+)?)(.*)$/.exec(s.trim())
  if (!m) return null
  const raw = m[2].replace(/,/g, '')
  const n = Number(raw)
  if (isNaN(n)) return null
  const dec = raw.includes('.') ? raw.split('.')[1].length : 0
  return { pre: m[1], n, post: m[3], dec }
}

/** A number that counts from `from` to `to` in 600ms (jumps under prefers-reduced-motion). Strings without a number flip. */
export function CountTo({ from, to, ms = 600, className, delay = 0 }: { from?: string | number | null; to: string | number; ms?: number; className?: string; delay?: number }) {
  const target = String(to)
  const tgt = splitNum(target)
  const src = from === null || from === undefined ? null : splitNum(String(from))
  const [shown, setShown] = useState<string>(() => (tgt && !reducedMotion() ? `${tgt.pre}${(src?.n ?? 0).toFixed(tgt.dec)}${tgt.post}` : target))
  useEffect(() => {
    if (!tgt || reducedMotion()) { setShown(target); return }
    const start = src?.n ?? 0
    let raf = 0
    let t0 = 0
    const tick = (t: number) => {
      if (!t0) t0 = t
      const p = Math.min(1, (t - t0) / ms)
      const e = 1 - Math.pow(1 - p, 3)
      const v = start + (tgt.n - start) * e
      setShown(`${tgt.pre}${v.toFixed(tgt.dec)}${tgt.post}`)
      if (p < 1) raf = requestAnimationFrame(tick)
      else setShown(target)
    }
    const d = setTimeout(() => { raf = requestAnimationFrame(tick) }, delay)
    return () => { clearTimeout(d); cancelAnimationFrame(raf) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, from, ms, delay])
  return <span className={`num${className ? ' ' + className : ''}`}>{shown}</span>
}

/* ---------- ripple rows (shared by the toast and the Snap success view) ---------- */
export const RIPPLE_ICON: Record<Ripple['kind'], IconName> = { kid: 'people', people: 'people', calls: 'phone', report: 'doc', today: 'home', family: 'home' }

export function RippleRow({ r, i = 0, big }: { r: Ripple; i?: number; big?: boolean }) {
  const delay = i * 120
  return (
    <Link to={r.href} className={`rp-row${big ? ' big' : ''}`} style={{ animationDelay: `${delay}ms` }}>
      <span className={`rp-ic ${r.kind}`}><Icon name={RIPPLE_ICON[r.kind] ?? 'spark'} /></span>
      <span className="rp-lbl">{r.label}</span>
      <span className="rp-chg">
        {r.from && <><s>{r.from}</s><span className="rp-arrow">→</span></>}
        <b className="rp-to" style={{ animationDelay: `${delay + 180}ms` }}><CountTo from={r.from} to={r.to} delay={delay + 120} /></b>
      </span>
    </Link>
  )
}

/* ---------- context ---------- */
type Runnable = Promise<EditResponse> | (() => Promise<EditResponse>)
export interface RunOpts { extra?: Ripple[]; title?: string }
interface Toast { key: number; title: string; changes: Ripple[]; ms: number }
interface Ctx {
  saving: boolean
  run: (p: Runnable, opts?: RunOpts) => Promise<EditResponse | null>
}
const RippleCtx = createContext<Ctx>({ saving: false, run: async () => null })

/** `run(promise)` shows Saving…, then the ripple toast; on error, the message with Retry. */
export const useRipple = () => useContext(RippleCtx)

export function RippleProvider({ children, onRipple }: { children: ReactNode; onRipple?: (changes: Ripple[]) => void }) {
  const [saving, setSaving] = useState(0)
  const [toast, setToast] = useState<Toast | null>(null)
  const [error, setError] = useState<{ message: string; retry: (() => void) | null } | null>(null)
  const [hover, setHover] = useState(false)
  const seq = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const run = useCallback(async (p: Runnable, opts?: RunOpts): Promise<EditResponse | null> => {
    setSaving((n) => n + 1)
    setError(null)
    try {
      const res = await (typeof p === 'function' ? p() : p)
      const changes = [...res.changes, ...(opts?.extra ?? [])]
      setToast({ key: ++seq.current, title: opts?.title ?? (changes.length ? 'Updated everywhere' : 'Saved'), changes, ms: res.ms })
      onRipple?.(changes)
      return res
    } catch (e) {
      setError({ message: errMsg(e), retry: typeof p === 'function' ? () => { void run(p, opts) } : null })
      return null
    } finally {
      setSaving((n) => n - 1)
    }
  }, [onRipple])

  // auto-dismiss after 8s, paused while hovered
  useEffect(() => {
    clearTimeout(timer.current)
    if (!toast || hover) return
    timer.current = setTimeout(() => setToast(null), 8000)
    return () => clearTimeout(timer.current)
  }, [toast, hover])

  const value = useMemo(() => ({ saving: saving > 0, run }), [saving, run])

  return (
    <RippleCtx.Provider value={value}>
      {children}
      <div className="rp-stack" aria-live="polite">
        {saving > 0 && <div className="rp-saving" role="status"><span className="rp-dot" />Saving…</div>}
        {error && (
          <div className="rp-card rp-err" role="alert">
            <div className="rp-head"><b>That didn't save.</b><button type="button" className="rp-x" aria-label="Dismiss" onClick={() => setError(null)}><Icon name="x" style={{ width: 14, height: 14 }} /></button></div>
            <div className="sub" style={{ fontSize: 14, marginTop: 4 }}>{error.message}</div>
            {error.retry && <button type="button" className="btn dark sm" style={{ marginTop: 12 }} onClick={error.retry}>Retry</button>}
          </div>
        )}
        {toast && (
          <div key={toast.key} className="rp-card" role="status" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
            <div className="rp-head">
              <span className="rp-check"><Icon name="check" style={{ width: 13, height: 13, strokeWidth: 3 }} /></span>
              <b>{toast.title}</b>
              <span className="rp-ms">in {secs(toast.ms)}</span>
              <button type="button" className="rp-x" aria-label="Dismiss" onClick={() => setToast(null)}><Icon name="x" style={{ width: 14, height: 14 }} /></button>
            </div>
            {toast.changes.length > 0 && (
              <div className="rp-rows">
                {toast.changes.map((r, i) => <RippleRow key={`${r.kind}-${r.label}-${i}`} r={r} i={i} />)}
              </div>
            )}
            <i className="rp-bar" style={{ animationPlayState: hover ? 'paused' : 'running' }} />
          </div>
        )}
      </div>
    </RippleCtx.Provider>
  )
}

/* ---------- inline edit: click the pencil, type, Enter or blur saves ---------- */
export function InlineEdit({ value, onSave, label, display, className, placeholder, as = 'span', editLabel }: {
  value: string; onSave: (v: string) => void | Promise<unknown>; label: string; display?: ReactNode; className?: string; placeholder?: string
  as?: 'span' | 'h1' | 'b'; editLabel?: string
}) {
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!editing) setV(value) }, [value, editing])
  const commit = () => {
    setEditing(false)
    const t = v.trim()
    if (t && t !== value) void onSave(t)
  }
  const Tag = as
  if (editing) {
    return (
      <span className={`ie editing${className ? ' ' + className : ''}`}>
        <input ref={ref} autoFocus aria-label={label} value={v} placeholder={placeholder} size={Math.max(4, v.length + 1)}
          onChange={(e) => setV(e.target.value)} onBlur={commit} onFocus={(e) => e.target.select()}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } if (e.key === 'Escape') { setV(value); setEditing(false) } }} />
      </span>
    )
  }
  return (
    <Tag className={`ie${className ? ' ' + className : ''}`}>
      {display ?? value}
      <button type="button" className="ie-pen" aria-label={editLabel ?? `Edit ${label.toLowerCase()}`} title={editLabel ?? `Edit ${label.toLowerCase()}`} onClick={() => setEditing(true)}><Icon name="pen" /></button>
    </Tag>
  )
}

/** Keys that were just changed glow for a moment. */
export function useFlash() {
  const [keys, setKeys] = useState<Set<string>>(new Set())
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const flash = useCallback((ks: string[]) => {
    if (!ks.length) return
    setKeys(new Set(ks))
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setKeys(new Set()), 1400)
  }, [])
  const cls = useCallback((k: string) => (keys.has(k) ? 'vflash' : undefined), [keys])
  return { flash, cls, has: (k: string) => keys.has(k) }
}
