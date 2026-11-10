import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router'
import type { AboutResponse, SearchResult } from '../../shared/types'
import { api, errMsg } from '../api'
import { fmtFull, money } from '../format'
import { useApp } from './AppContext'
import { Modal } from './Photo'
import { Icon, Shimmer, useDebounced, useEscape, type IconName } from './ui'

const navCls = ({ isActive }: { isActive: boolean }) => (isActive ? 'on' : undefined)

export function Brand({ to = '/today', live }: { to?: string; live?: boolean }) {
  const { liveTick } = useApp()
  return (
    <Link to={to} className="brand" aria-label="AttendClear home">
      <div className="mark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
      AttendClear
      {live && <span key={liveTick} className={`livedot${liveTick ? ' go' : ''}`} title="Live: numbers update the moment anything is edited" aria-label="Live" />}
    </Link>
  )
}

/** true for ~1.2s after `tick` changes */
function useRecent(tick: number, ms = 1200) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!tick) return
    setOn(true)
    const t = setTimeout(() => setOn(false), ms)
    return () => clearTimeout(t)
  }, [tick, ms])
  return on
}

/* ---------- reset demo (shared by banner + avatar menu) ---------- */
function useReset() {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const go = async () => {
    setBusy(true)
    setErr(null)
    try {
      await api.reset()
      window.location.reload()
    } catch (e) {
      setErr(errMsg(e))
      setBusy(false)
    }
  }
  const dialog = asking ? (
    <Modal onClose={() => !busy && setAsking(false)} label="Reset the demo">
      <div className="title">Reset the demo?</div>
      <p className="sub" style={{ fontSize: 16, marginTop: 8 }}>Everything goes back to Wed Sep 23, 2026 before the sheet was snapped. Sent messages, new sign-ups and built datasets are removed.</p>
      {err && <div className="notice bad">{err}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
        <button className="btn ghost sm" onClick={() => setAsking(false)} disabled={busy}>Cancel</button>
        <button className="btn dark sm" onClick={go} disabled={busy}>{busy ? <><span className="spin" />Resetting…</> : 'Reset demo'}</button>
      </div>
    </Modal>
  ) : null
  return { ask: () => setAsking(true), dialog }
}

export function DemoBanner() {
  const { today } = useApp()
  const reset = useReset()
  return (
    <div className="demobar noprint">
      <span><b>Sandbox</b> · <span className="db-long">Today is </span>{fmtFull(today) || 'Wed Sep 23, 2026'}<span className="db-long"> · Tidepath Family Alliance is fictional</span></span>
      <Link to="/lab" style={{ whiteSpace: 'nowrap' }}>Build a dataset</Link>
      <span className="sep">·</span>
      <button type="button" onClick={reset.ask}>Reset</button>
      {reset.dialog}
    </div>
  )
}

/* ---------- command palette ---------- */
const KIND_ICON: Record<SearchResult['kind'], IconName> = { kid: 'people', family: 'home', mentor: 'spark' }

function CommandPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('')
  const dq = useDebounced(q.trim(), 160)
  const [res, setRes] = useState<SearchResult[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState(0)
  const nav = useNavigate()

  useEffect(() => {
    if (!dq) { setRes(null); return }
    let live = true
    setBusy(true)
    api.search(dq).then(
      (r) => { if (live) { setRes(r); setErr(null); setSel(0); setBusy(false) } },
      (e) => { if (live) { setErr(errMsg(e)); setBusy(false) } },
    )
    return () => { live = false }
  }, [dq])

  const go = (r: SearchResult) => { onClose(); nav(r.href) }
  return (
    <Modal onClose={onClose} label="Search">
      <div className="palette">
        <div className="searchbox" style={{ marginRight: 44 }}>
          <Icon name="search" />
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search kids, families, any spelling"
            aria-label="Search kids, families, mentors"
            onKeyDown={(e) => {
              if (!res?.length) return
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(res.length - 1, s + 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
              if (e.key === 'Enter') { e.preventDefault(); go(res[sel]) }
            }}
          />
          {busy && <span className="spin dk" />}
        </div>
        <div className="divider" style={{ margin: '6px 0 8px' }} />
        {err && <div className="notice bad" style={{ margin: 8 }}>{err}</div>}
        {!dq && <div className="sub" style={{ padding: '6px 12px 12px' }}>Try a messy spelling like "Dariel Rmz" or "Jeanbaptiste".</div>}
        {res && !res.length && !busy && <div className="sub" style={{ padding: '6px 12px 12px' }}>Nobody matches "{dq}".</div>}
        {res && res.length > 0 && (
          <ul role="listbox" aria-label="Results">
            {res.map((r, i) => (
              <li key={`${r.kind}-${r.id}`} className={i === sel ? 'on' : undefined} role="option" aria-selected={i === sel}>
                <a href={r.href} onClick={(e) => { e.preventDefault(); go(r) }} onMouseEnter={() => setSel(i)}>
                  <span className="ic"><Icon name={KIND_ICON[r.kind]} style={{ width: 16, height: 16 }} /></span>
                  <span style={{ minWidth: 0 }}>
                    <b style={{ display: 'block' }}>{r.title}</b>
                    <span className="sub" style={{ fontSize: 13 }}>{r.sub}</span>
                    {r.matched && <div className="matchedas">matched: {r.matched}</div>}
                  </span>
                  <span className="pill ghost" style={{ height: 24, fontSize: 12, textTransform: 'capitalize' }}>{r.kind}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}

/* ---------- about ---------- */
function AboutDialog({ onClose }: { onClose: () => void }) {
  const [a, setA] = useState<AboutResponse | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback(() => { setErr(null); api.about().then(setA, (e) => setErr(errMsg(e))) }, [])
  useEffect(load, [load])
  return (
    <Modal onClose={onClose} label="About AttendClear">
      <span className="eyebrow">About this demo</span>
      <div className="title" style={{ marginTop: 4 }}>AttendClear</div>
      {err && <div className="notice bad" style={{ marginTop: 14 }}>{err} <button className="btn dark sm" onClick={load}>Retry</button></div>}
      {!a && !err && <div style={{ marginTop: 16 }}><Shimmer h={16} /><Shimmer h={16} style={{ marginTop: 12 }} /><Shimmer h={16} w="60%" style={{ marginTop: 12 }} /></div>}
      {a && (
        <>
          <div className="saved" style={{ marginTop: 16 }}>
            <span className="sub" style={{ color: 'var(--ink-2)' }}>AI spend this session</span>
            <b className="num">{money(a.ai_spend_usd)}</b>
          </div>
          <div className="sub" style={{ fontSize: 13, marginTop: 6 }}>{a.ai_calls} model calls so far.</div>
          <div style={{ marginTop: 12 }}>
            <div className="kv"><span>Reads handwriting</span><b>{a.models.vision}</b></div>
            <div className="kv"><span>Backup reader</span><b>{a.models.vision_fallback}</b></div>
            <div className="kv"><span>Matches names</span><b>{a.models.decisions}</b></div>
            <div className="kv"><span>Writes messages</span><b>{a.models.drafting}</b></div>
            {Object.entries(a.counts).map(([k, v]) => (
              <div className="kv" key={k}><span style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span><b className="num">{v}</b></div>
            ))}
          </div>
          {a.repo && <a className="link" href={a.repo} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 14 }}>Source code</a>}
        </>
      )}
    </Modal>
  )
}

/* ---------- header ---------- */
export function Header() {
  const { openCount, pulse } = useApp()
  const reportGlow = useRecent(pulse.report)
  const [palette, setPalette] = useState(false)
  const [menu, setMenu] = useState(false)
  const [about, setAbout] = useState(false)
  const reset = useReset()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  useEffect(() => {
    if (!menu) return
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menu])
  const closeMenu = useCallback(() => setMenu(false), [])
  useEscape(closeMenu, menu)

  return (
    <header className="top">
      <Brand live />
      <nav className="seg" aria-label="Main">
        <NavLink to="/today" className={navCls}>Today</NavLink>
        <NavLink to="/snap" className={navCls}>Snap</NavLink>
        <NavLink to="/calls" className={navCls}>Calls {!!openCount && <span key={pulse.calls} className={`badge${pulse.calls ? ' bump' : ''}`} aria-label={`${openCount} open`}>{openCount}</span>}</NavLink>
        <NavLink to="/people" className={navCls}>People</NavLink>
        <NavLink to="/report" className={({ isActive }) => [isActive ? 'on' : '', reportGlow ? 'glow' : ''].join(' ').trim() || undefined}>Report</NavLink>
      </nav>
      <button type="button" className="search" onClick={() => setPalette(true)} aria-label="Search kids, families, any spelling">
        <Icon name="search" />Search kids, families, any spelling<kbd>⌘K</kbd>
      </button>
      <Link to="/calls" className="iconbtn" aria-label={openCount ? `${openCount} families need a call` : 'Calls'}>
        <Icon name="bell" />{!!openCount && <span className="dot" />}
      </Link>
      <div className="avwrap" ref={menuRef}>
        <button type="button" className="av g1" aria-label="Account menu" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>M</button>
        {menu && (
          <div className="menu" role="menu">
            <div style={{ padding: '8px 12px 6px' }}><b>Marisol</b><div className="sub" style={{ fontSize: 13 }}>Program manager · Tidepath</div></div>
            <div className="divider" style={{ margin: '6px 0' }} />
            <button role="menuitem" className="phone-only" onClick={() => { setMenu(false); setPalette(true) }}><Icon name="search" />Search</button>
            <Link role="menuitem" to="/lab" onClick={closeMenu}><Icon name="db" />Build a dataset</Link>
            <Link role="menuitem" to="/integrations" onClick={closeMenu}><Icon name="plug" />Connected tools</Link>
            <Link role="menuitem" to="/signup" onClick={closeMenu}><Icon name="form" />Public sign-up form</Link>
            <button role="menuitem" onClick={() => { setMenu(false); setAbout(true) }}><Icon name="info" />About and AI spend</button>
            <button role="menuitem" onClick={() => { setMenu(false); reset.ask() }}><Icon name="reset" />Reset demo</button>
          </div>
        )}
      </div>
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
      {about && <AboutDialog onClose={() => setAbout(false)} />}
      {reset.dialog}
    </header>
  )
}

export function PhoneBar() {
  const { openCount, pulse } = useApp()
  const reportGlow = useRecent(pulse.report)
  return (
    <nav className="pbar" aria-label="Main">
      <NavLink to="/today" className={navCls}><Icon name="home" />Today</NavLink>
      <NavLink to="/calls" className={navCls}><Icon name="phone" />{!!openCount && <span key={pulse.calls} className={`bd${pulse.calls ? ' bump' : ''}`}>{openCount}</span>}Calls</NavLink>
      <Link className="cam" to="/snap" aria-label="Snap a sheet"><Icon name="cam" /></Link>
      <NavLink to="/people" className={navCls}><Icon name="people" />People</NavLink>
      <NavLink to="/report" className={({ isActive }) => [isActive ? 'on' : '', reportGlow ? 'glow' : ''].join(' ').trim() || undefined}><Icon name="doc" />Report</NavLink>
    </nav>
  )
}
