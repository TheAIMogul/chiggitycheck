import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from '../api'

export const DEMO_TODAY_FALLBACK = '2026-09-23'

interface Ctx {
  openCount: number | null
  refreshCounts: () => void
  today: string
  toast: (msg: string) => void
}

const AppCtx = createContext<Ctx>({ openCount: null, refreshCounts: () => {}, today: DEMO_TODAY_FALLBACK, toast: () => {} })

export function AppProvider({ children }: { children: ReactNode }) {
  const [openCount, setOpenCount] = useState<number | null>(null)
  const [today, setToday] = useState(DEMO_TODAY_FALLBACK)
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const refreshCounts = useCallback(() => {
    api.calls('open').then((r) => setOpenCount(r.counts.open), () => {})
  }, [])
  useEffect(() => {
    refreshCounts()
    api.about().then((a) => a.today && setToday(a.today.slice(0, 10)), () => {})
  }, [refreshCounts])

  const toast = useCallback((m: string) => {
    setMsg(m)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(null), 3200)
  }, [])

  return (
    <AppCtx.Provider value={{ openCount, refreshCounts, today, toast }}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </AppCtx.Provider>
  )
}

export const useApp = () => useContext(AppCtx)
