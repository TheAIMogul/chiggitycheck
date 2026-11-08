import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { LiveSummary, Ripple } from '../../shared/types'
import { api } from '../api'
import { RippleProvider } from './Ripple'

export const DEMO_TODAY_FALLBACK = '2026-09-23'

interface Ctx {
  openCount: number | null
  live: LiveSummary | null
  /** increments whenever /api/live comes back different */
  liveTick: number
  /** increments when the Calls badge should bump / the Report item should glow */
  pulse: { calls: number; report: number }
  refreshCounts: () => void
  today: string
  toast: (msg: string) => void
}

const AppCtx = createContext<Ctx>({ openCount: null, live: null, liveTick: 0, pulse: { calls: 0, report: 0 }, refreshCounts: () => {}, today: DEMO_TODAY_FALLBACK, toast: () => {} })

const liveKey = (l: LiveSummary) => [l.calls_open, l.urgent, l.watch, l.attendance_rate, l.kids_served, l.hours, l.sheets, l.aliases, l.signups, l.last_signup?.id].join('|')
type SignupNote = NonNullable<LiveSummary['last_signup']>

export function AppProvider({ children }: { children: ReactNode }) {
  const [live, setLive] = useState<LiveSummary | null>(null)
  const [liveTick, setLiveTick] = useState(0)
  const [pulse, setPulse] = useState({ calls: 0, report: 0 })
  const [today, setToday] = useState(DEMO_TODAY_FALLBACK)
  const [msg, setMsg] = useState<string | null>(null)
  const [note, setNote] = useState<SignupNote | null>(null)
  const noteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const prev = useRef<LiveSummary | null>(null)

  const refreshCounts = useCallback(() => {
    api.live().then((l) => {
      const was = prev.current
      prev.current = l
      setLive(l)
      if (was && liveKey(was) !== liveKey(l)) {
        setLiveTick((t) => t + 1)
        if (was.calls_open !== l.calls_open || was.urgent !== l.urgent) setPulse((p) => ({ ...p, calls: p.calls + 1 }))
        if (l.last_signup && (!was.last_signup || l.last_signup.id > was.last_signup.id)) {
          setNote(l.last_signup)
          clearTimeout(noteTimer.current)
          noteTimer.current = setTimeout(() => setNote(null), 12000)
        }
      }
    }, () => {})
  }, [])
  useEffect(() => {
    refreshCounts()
    api.about().then((a) => a.today && setToday(a.today.slice(0, 10)), () => {})
    // keep every screen live: new sign-ups, replies and edits from other devices show up within seconds
    const iv = setInterval(() => { if (document.visibilityState === 'visible') refreshCounts() }, 5000)
    return () => clearInterval(iv)
  }, [refreshCounts])

  const toast = useCallback((m: string) => {
    setMsg(m)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(null), 3200)
  }, [])

  // after any live edit: bump the nav for the kinds that changed, then refetch the live numbers
  const onRipple = useCallback((changes: Ripple[]) => {
    const calls = changes.some((c) => c.kind === 'calls' || c.href.startsWith('/calls'))
    const report = changes.some((c) => c.kind === 'report')
    if (calls || report) setPulse((p) => ({ calls: p.calls + (calls ? 1 : 0), report: p.report + (report ? 1 : 0) }))
    refreshCounts()
  }, [refreshCounts])

  const value = useMemo<Ctx>(() => ({ openCount: live ? live.calls_open : null, live, liveTick, pulse, refreshCounts, today, toast }), [live, liveTick, pulse, refreshCounts, today, toast])

  return (
    <AppCtx.Provider value={value}>
      <RippleProvider onRipple={onRipple}>
        {children}
        {msg && <div className="toast" role="status">{msg}</div>}
        {note && (
          <div className="signup-note" role="status">
            <span className="sn-dot" />
            <div className="sn-body">
              <div className="sn-k">New sign-up · just now</div>
              <div className="sn-t">{note.kid || 'A new kid'} <span>from {note.guardian}</span></div>
              <div className="sn-s">{note.status === 'linked' ? `Linked to the ${note.matched_to ?? 'existing family'}. No duplicate.` : note.status === 'review' ? 'Might be a family we know. Waiting for a quick look.' : 'New family created.'}</div>
            </div>
            <Link className="btn dark sm" to="/people?tab=signups" onClick={() => setNote(null)}>See it</Link>
            <button className="sn-x" aria-label="Dismiss" onClick={() => setNote(null)}>×</button>
          </div>
        )}
      </RippleProvider>
    </AppCtx.Provider>
  )
}

export const useApp = () => useContext(AppCtx)
