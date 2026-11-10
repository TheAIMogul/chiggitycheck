import { useState } from 'react'
import type { Integration } from '../../shared/types'
import { api, errMsg } from '../api'
import { useApp } from '../components/AppContext'
import { EmptyState, ErrorState, Icon, ShimmerCard, useApi, type IconName } from '../components/ui'
import { fmtWhen } from '../format'

const KIND_ICON: Record<Integration['kind'], IconName> = {
  messaging: 'msg', forms: 'form', spreadsheet: 'sheet', email: 'text', calendar: 'clock', accounting: 'doc', crm: 'people',
}

function Card({ it, onDone }: { it: Integration; onDone: () => void }) {
  const { today } = useApp()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const run = async (href: string, label: string) => {
    setBusy(label); setMsg(null)
    try { const r = await api.integrationAction(href); setMsg({ ok: true, text: r.message }); onDone() } catch (e) { setMsg({ ok: false, text: errMsg(e) }) } finally { setBusy(null) }
  }
  const connected = it.status === 'connected'
  return (
    <section className={`card icard${connected ? '' : ''}`}>
      <div className="head">
        <span className="ic" style={{ width: 44, height: 44, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'var(--blue-wash)', color: 'var(--blue)' }}><Icon name={KIND_ICON[it.kind] ?? 'plug'} /></span>
        <div style={{ display: 'flex', gap: 6 }}>
          <span className="pill" style={connected ? { color: 'var(--good)', background: 'rgba(47,163,107,.12)', height: 26 } : { height: 26 }}>{connected ? 'Connected' : 'Available'}</span>
          <span className={`pill ${it.mode === 'live' ? 'dark' : 'ghost'}`} style={{ height: 26 }}>{it.mode === 'live' ? 'Live' : 'Sandbox'}</span>
        </div>
      </div>
      <div>
        <div className="title" style={{ fontSize: 20 }}>{it.name}</div>
        <div className="sub" style={{ textTransform: 'capitalize', fontSize: 13 }}>{it.kind}</div>
      </div>
      <div style={{ fontSize: 15, color: 'var(--ink-2)' }}>{it.detail}</div>
      {(it.last_sync_at || it.last_result) && (
        <div className="sub" style={{ fontSize: 13 }}>{it.last_sync_at ? `Last sync ${fmtWhen(it.last_sync_at, today)}` : ''}{it.last_sync_at && it.last_result ? ' · ' : ''}{it.last_result}</div>
      )}
      {msg && <div className={`notice ${msg.ok ? 'good' : 'bad'}`} style={{ margin: 0, fontSize: 14 }} role="status">{msg.text}</div>}
      {it.actions.length > 0 && (
        <div className="acts">
          {it.actions.map((a, i) => {
            const cls = `btn ${i === 0 ? 'dark' : 'ghost'} sm`
            if (a.method === 'GET') return <a key={a.label} className={cls} href={a.href} {...(a.download ? { download: '' } : { target: '_blank', rel: 'noreferrer' })}>{a.download && <Icon name="upload" style={{ transform: 'rotate(180deg)' }} />}{a.label}</a>
            return <button key={a.label} className={cls} disabled={!!busy} onClick={() => run(a.href, a.label)}>{busy === a.label && <span className={i === 0 ? 'spin' : 'spin dk'} />}{a.label}</button>
          })}
        </div>
      )}
    </section>
  )
}

export default function Integrations() {
  const list = useApi(api.integrations, [])
  return (
    <>
      <div className="tabs">
        <div>
          <h1>Connected tools</h1>
          <div className="sub" style={{ fontSize: 17, marginTop: 4 }}>Where AttendClear sends messages and picks up lists. Sandbox tools never reach a real phone or inbox.</div>
        </div>
      </div>
      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? (
        <div className="igrid">{[0, 1, 2].map((i) => <ShimmerCard key={i} className="card" lines={3} />)}</div>
      ) : list.data.length === 0 ? <section className="card"><EmptyState text="No tools are set up yet." /></section> : (
        <div className="igrid">{list.data.map((it) => <Card key={it.key} it={it} onDone={() => list.reload(true)} />)}</div>
      )}
    </>
  )
}
