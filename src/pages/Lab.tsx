import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { ScenarioResult } from '../../shared/types'
import { api, errMsg } from '../api'
import { useApp } from '../components/AppContext'
import { ErrorState, Icon, Shimmer, useApi } from '../components/ui'
import { fmtWhen, hrs, plural, secs } from '../format'

const EXAMPLES = [
  'Add an art club at Little Haven with 12 kids, 5 weeks, two kids missed the last two sessions',
  'A new mentor, Gabriel Ortiz, takes 4 kids at West Little River from Sep 1',
  '8 new sign-ups from a back-to-school fair, two of them are siblings of kids we already have',
  'A Spanish-speaking family with 3 kids joins workshops; the oldest stopped coming after Sep 8',
]
const WAIT_STEPS = ['Writing the dataset…', 'Checking every record…', 'Saving to the database…', 'Scoring follow-ups…']
// gentle pacing while we wait; the last step holds until the real answer arrives
const WAIT_AT = [0, 9000, 18000, 25000]

function Counts({ c }: { c: ScenarioResult['created'] }) {
  const items: [number, string][] = [
    [c.families, 'Families'], [c.kids, 'Kids'], [c.mentors, 'Mentors'], [c.sessions, 'Sessions'],
    [c.attendance, 'Attendance lines'], [c.hours, 'Volunteer hours'], [c.signups, 'Sign-ups'], [c.followups, 'Follow-ups'],
  ]
  return (
    <div className="counts">
      {items.map(([n, l]) => <div key={l}><b className="num">{l === 'Volunteer hours' ? hrs(n) : n}</b><span>{l}</span></div>)}
    </div>
  )
}

export default function Lab() {
  const { today, refreshCounts } = useApp()
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [res, setRes] = useState<ScenarioResult | null>(null)
  const earlier = useApi(api.scenarios, [])
  const ta = useRef<HTMLTextAreaElement>(null)
  const resRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!busy) return
    const t0 = performance.now()
    const t = setInterval(() => setElapsed(performance.now() - t0), 200)
    return () => clearInterval(t)
  }, [busy])

  const build = async () => {
    const p = prompt.trim()
    if (!p || busy) return
    setBusy(true); setErr(null); setRes(null); setElapsed(0)
    try {
      const r = await api.buildScenario(p)
      setRes(r)
      earlier.reload(true)
      refreshCounts()
      setTimeout(() => resRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  const stepIdx = WAIT_AT.reduce((a, at, i) => (elapsed >= at ? i : a), 0)

  return (
    <>
      <div className="tabs">
        <div>
          <div className="eyebrow">Prove it's live</div>
          <h1 style={{ marginTop: 6 }}>Build a dataset</h1>
          <div className="sub" style={{ fontSize: 17, marginTop: 4 }}>Describe a program in plain words. We write the records, check them, save them, and score who needs a call.</div>
        </div>
      </div>

      <section className="card lab">
        <label htmlFor="lab-prompt" className="sr">Describe a program</label>
        <textarea
          id="lab-prompt" ref={ta} autoFocus rows={4} value={prompt} disabled={busy}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) build() }}
          placeholder="Describe a program, a site, kids and what happened. For example: Add a Saturday soccer program at Miami Jackson with 18 kids for the last 6 weeks. Three kids are slipping and one family only speaks Haitian Creole."
        />
        <div className="examples" aria-label="Examples">
          {EXAMPLES.map((x) => <button key={x} type="button" disabled={busy} onClick={() => { setPrompt(x); ta.current?.focus() }}>{x}</button>)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 18, flexWrap: 'wrap' }}>
          <button className="btn dark lg" onClick={build} disabled={busy || !prompt.trim()}>{busy ? <><span className="spin" />Building…</> : <><Icon name="spark" />Build it</>}</button>
          <span className="sub" style={{ fontSize: 14 }}>{busy ? `${secs(elapsed)} · usually 10 to 40 seconds` : 'Takes 10 to 40 seconds. Everything it makes goes into the real record.'}</span>
        </div>

        {busy && (
          <div className="lsteps" aria-live="polite">
            {WAIT_STEPS.map((s, i) => (
              <div key={s} className={`step${i === stepIdx ? ' now run' : i > stepIdx ? ' wait' : ''}`}>
                <span className="c">{i < stepIdx ? <Icon name="check" /> : i === stepIdx ? <span className="spin" style={{ width: 14, height: 14 }} /> : i + 1}</span>{s}
              </div>
            ))}
          </div>
        )}
        {err && (
          <div className="notice bad" role="alert" style={{ marginTop: 18, marginBottom: 0 }}>
            <span style={{ flex: 1, minWidth: 200 }}>{err}</span>
            <button className="btn dark sm" onClick={build}>Retry</button>
          </div>
        )}
      </section>

      {res && (
        <section className="card white" ref={resRef} style={{ marginTop: 18, scrollMarginTop: 20 }}>
          <div className="trace" style={{ marginTop: 0 }}><span className="c"><Icon name="check" style={{ width: 16, height: 16, strokeWidth: 2.6 }} /></span><span><b>Saved to the record.</b> {secs(res.ms)} · {res.model}</span></div>
          <h2 style={{ fontSize: 32, marginTop: 18 }}>{res.title}</h2>
          <p className="sub" style={{ fontSize: 17, marginTop: 8 }}>{res.summary}</p>
          <div className="lsteps" style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {res.steps.map((s) => <div key={s.label} className="step"><span className="c"><Icon name="check" /></span>{s.label} <small>{secs(s.ms)}</small></div>)}
          </div>
          <Counts c={res.created} />
          {res.highlights.length > 0 && (
            <>
              <div className="title" style={{ fontSize: 19, marginTop: 24 }}>Look at what changed</div>
              <div style={{ marginTop: 6 }}>
                {res.highlights.map((h, i) => (
                  <Link key={i} to={h.href} className="hl"><span><b>{h.label}</b><div className="sub" style={{ fontSize: 14 }}>{h.detail}</div></span><Icon name="arrow" style={{ color: 'var(--ink-4)' }} /></Link>
                ))}
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
            <Link className="btn dark" to="/today">Open Today</Link>
            <Link className="btn ghost" to="/report">Open report</Link>
          </div>
        </section>
      )}

      <section className="card" style={{ marginTop: 18 }}>
        <div className="title" style={{ fontSize: 19 }}>Built earlier</div>
        {earlier.error ? <ErrorState error={earlier.error} onRetry={earlier.reload} inCard={false} /> : !earlier.data ? (
          <div style={{ marginTop: 12 }}><Shimmer h={16} /><Shimmer h={16} w="70%" style={{ marginTop: 12 }} /></div>
        ) : earlier.data.length === 0 ? (
          <div className="sub" style={{ marginTop: 8 }}>Nothing yet. Try one of the examples above.</div>
        ) : (
          <div style={{ marginTop: 6 }}>
            {earlier.data.map((s) => (
              <button key={s.id} type="button" className="hl" style={{ width: '100%', textAlign: 'left' }} onClick={() => { setRes(s); setTimeout(() => resRef.current?.scrollIntoView({ behavior: 'smooth' }), 50) }}>
                <span style={{ minWidth: 0 }}>
                  <b>{s.title}</b>
                  <div className="sub" style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"{s.prompt}"</div>
                  <div className="sub" style={{ fontSize: 13 }}>{plural(s.created.kids, 'kid')} · {plural(s.created.sessions, 'session')} · {plural(s.created.attendance, 'attendance line')} · {plural(s.created.followups, 'follow-up')}</div>
                </span>
                <span className="sub" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{fmtWhen(s.created_at, today)}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
