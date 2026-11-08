import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { WeekResponse } from '../../shared/types'
import { api, errMsg } from '../api'
import { useApp } from '../components/AppContext'
import { Avatar, Bolded, ErrorState, Icon, Shimmer, ShimmerCard, SevBadge, Strip, useApi, type IconName } from '../components/ui'
import { LANG_SHORT, PROGRAM, fmtDay, fmtLong, hrs, pct, pctNum, plural } from '../format'

const FEED_ICON: Record<WeekResponse['feed'][number]['kind'], IconName> = {
  read: 'sheet', merge: 'merge', dedupe: 'copy', draft: 'msg', alias: 'pen', signup: 'form', reply: 'text', send: 'msg',
}
const CHECK_ICON: Record<WeekResponse['checks'][number]['kind'], IconName> = { signups: 'form', school_change: 'school', unmatched: 'q' }
const CHECK_ACTION: Record<WeekResponse['checks'][number]['kind'], string> = { signups: 'Review', school_change: 'OK', unmatched: 'Fix' }

function useSnapSample() {
  const nav = useNavigate()
  const { toast } = useApp()
  const [busy, setBusy] = useState<string | null>(null)
  const snap = async (key: string | null) => {
    if (!key) { nav('/snap'); return }
    setBusy(key)
    try {
      const r = await api.capture(key)
      if (r.status === 'already_captured') { toast('That sheet was already captured.'); nav('/snap') }
      else nav(`/snap/${r.session_id}`, { state: { photo_url: r.photo_url, upload_ms: r.upload_ms } })
    } catch (e) {
      toast(errMsg(e))
      setBusy(null)
    }
  }
  return { snap, busy }
}

function TodaySkeleton() {
  return (
    <>
      <div className="hello"><div style={{ width: '100%' }}><Shimmer h={14} w={260} /><Shimmer h={46} w="60%" style={{ marginTop: 14 }} /><Shimmer h={46} w="48%" style={{ marginTop: 10 }} /></div></div>
      <div className="plan">{[0, 1, 2].map((i) => <ShimmerCard key={i} lines={2} className="pstep" />)}</div>
      <div className="bento">
        <ShimmerCard className="card s8" lines={5} />
        <ShimmerCard className="card white s4 r2" lines={8} />
        <ShimmerCard className="card s4" tall lines={2} />
        <ShimmerCard className="card s4" lines={4} />
      </div>
    </>
  )
}

export default function Today() {
  const { data: w, error, loading, reload } = useApi(api.week, [])
  const { snap, busy } = useSnapSample()

  if (loading && !w) return <TodaySkeleton />
  if (error || !w) return <ErrorState error={error} onRetry={reload} />

  const p = w.plan
  const snapState = p.snap.done ? 'done' : 'now'
  const callsDone = p.calls.total > 0 && p.calls.done >= p.calls.total
  const callsState = callsDone ? 'done' : p.snap.done ? 'now' : ''
  const reportState = p.report.ready ? 'done' : p.snap.done && callsDone ? 'now' : ''
  const waitingToday = w.days.some((d) => d.is_today && d.sessions.some((s) => s.status === 'waiting'))
  const s = w.stats
  const rates = s.weekly_rates
  const maxRate = Math.max(1, ...rates.map((r) => pctNum(r.rate)))
  const delta = s.delta_pts
  const mentorsShown = s.mentor_initials.slice(0, 4)
  const mentorsMore = s.mentors - mentorsShown.length

  return (
    <>
      <div className="hello">
        <div>
          <div className="eyebrow">{fmtLong(w.today)} · {w.greeting}</div>
          <h1 style={{ marginTop: 8 }}>{w.headline.text}<br /><span style={{ color: 'var(--ink-3)' }}>{w.headline.sub}</span></h1>
        </div>
      </div>

      <div className="plan">
        <div className={`pstep ${snapState}`}>
          <div className="n">{p.snap.done ? <Icon name="check" style={{ width: 22, height: 22, strokeWidth: 2.6 }} /> : 1}</div>
          <div><div className="t">{p.snap.label}</div><div className="d">{p.snap.detail}</div></div>
          <div className="a">
            {p.snap.done
              ? <Link className="btn ghost" to="/snap">Snap another</Link>
              : <button className="btn dark" onClick={() => snap(p.snap.sample_key)} disabled={!!busy}>{busy ? <span className="spin" /> : <Icon name="cam" />}Snap sheet</button>}
          </div>
        </div>
        <div className={`pstep ${callsState}`}>
          <div className="n">{callsDone ? <Icon name="check" style={{ width: 22, height: 22, strokeWidth: 2.6 }} /> : 2}</div>
          <div><div className="t">{p.calls.total ? `Call ${plural(p.calls.total, 'family', 'families')}` : 'No calls needed'}</div><div className="d">{p.calls.done} of {p.calls.total} done · messages are written</div></div>
          <div className="a"><Link className={`btn ${callsState === 'now' ? 'dark' : 'ghost'}`} to="/calls">Start calls</Link></div>
        </div>
        <div className={`pstep ${reportState}`}>
          <div className="n">{p.report.ready ? <Icon name="check" style={{ width: 22, height: 22, strokeWidth: 2.6 }} /> : 3}</div>
          <div><div className="t">Q1 report</div><div className="d">{p.report.ready ? 'Ready for funders' : 'Building'} · due {fmtDay(p.report.due) || p.report.due}</div></div>
          <div className="a"><Link className="btn ghost" to="/report">Open report</Link></div>
        </div>
      </div>

      <div className="bento">
        <section className="card s8">
          <div className="head">
            <div><div className="title">This week's sessions</div><div className="sub">{w.sheets_in} of {w.sheets_expected} sheets are in.{waitingToday ? ' One is waiting for you today.' : ''}</div></div>
            <span className="pill">{fmtDay(w.range.start)} – {fmtDay(w.range.end)}</span>
          </div>
          <div className="week">
            {w.days.map((d) => (
              <div key={d.date} className={`day${d.is_today ? ' today' : ''}`}>
                <div className="d">{d.is_today ? 'Today' : d.dow} <b>{d.day}</b></div>
                {d.sessions.length === 0 && <div className="sess later" style={{ borderStyle: 'dashed' }}>No sessions</div>}
                {d.sessions.map((x, i) => {
                  if (x.status === 'captured')
                    return (
                      <div key={i} className="sess"><b>{PROGRAM[x.program]}</b><span>{x.site}{x.kids !== null ? ` · ${x.kids} kids` : ''}</span><div className="ok">✓ Captured</div></div>
                    )
                  if (x.status === 'waiting')
                    return (
                      <div key={i} className="sess wait"><b>{PROGRAM[x.program]}</b><span>{x.site} · {x.time}</span><br />
                        <button className="go" onClick={() => snap(x.sample_key)} disabled={!!busy}>
                          {busy === x.sample_key ? <span className="spin" style={{ width: 12, height: 12 }} /> : <Icon name="cam" style={{ width: 13, height: 13 }} />}Snap sheet
                        </button>
                      </div>
                    )
                  return <div key={i} className="sess later"><b>{PROGRAM[x.program]}</b>{x.site} · {x.time}</div>
                })}
              </div>
            ))}
          </div>
        </section>

        <section className="card white s4 r2">
          <div className="head"><div className="title">Needs a call</div><Link className="btn dark sm" to="/calls">Open</Link></div>
          <div className="sub" style={{ marginTop: 2 }}>Ranked by risk, then time without contact</div>
          <div className="list" style={{ marginTop: 6 }}>
            {w.call.length === 0 && <div className="sub" style={{ padding: '18px 0' }}>Nobody needs a call right now.</div>}
            {w.call.map((f) => (
              <Link key={f.id} to={`/calls/${f.id}`} className="li">
                <Avatar text={f.kid_initials} seed={f.kid_id} />
                <div style={{ minWidth: 0 }}>
                  <div className="n">{f.kid_name} <span className="lang">{LANG_SHORT[f.language]}</span></div>
                  <div className="r">{f.reason}</div>
                  <Strip dots={f.strip} max={11} />
                </div>
                <SevBadge severity={f.severity} />
              </Link>
            ))}
            {w.watch.length > 0 && (
              <Link to="/calls?status=watch" className="li">
                <div className="av g6">{w.watch.length}</div>
                <div style={{ minWidth: 0 }}><div className="n" style={{ color: 'var(--ink-2)' }}>{w.watch.length} to keep an eye on</div><div className="r">One recent miss each</div></div>
                <span className="pill ghost">View</span>
              </Link>
            )}
          </div>
          <div className="divider" />
          <div className="head"><span className="sub">Families reached this quarter</span><b className="num">{s.reached} of {s.flagged}</b></div>
          <div className="head" style={{ marginTop: 8 }}><span className="sub">Median days to first call</span><b className="num">{s.median_days_to_contact === null ? '—' : plural(s.median_days_to_contact, 'day')}</b></div>
        </section>

        <Link to="/report" className="card s4" style={{ display: 'block' }}>
          <div className="head">
            <span className="eyebrow">Showed up · quarter</span>
            {delta !== 0 && <span className="delta" style={delta > 0 ? { color: 'var(--good)' } : undefined}>{delta < 0 ? '▼' : '▲'} {Math.abs(delta)} pts this week</span>}
          </div>
          <div className="kpi num" style={{ marginTop: 14 }}>{pct(s.attendance_rate_quarter)}</div>
          <div className="bars" aria-label="Weekly attendance">
            {rates.map((r, i) => (
              <i key={r.week} className={i === rates.length - 1 ? 'on' : undefined} style={{ height: `${Math.max(6, (pctNum(r.rate) / maxRate) * 100)}%` }} title={`${fmtDay(r.week)} · ${pct(r.rate)}`} />
            ))}
          </div>
          {rates.length > 0 && (
            <div className="bx"><span>{fmtDay(rates[0].week)}</span><span>{fmtDay(rates[Math.floor(rates.length / 2)].week)}</span><span>{fmtDay(rates[rates.length - 1].week)}</span></div>
          )}
        </Link>

        <section className="card s4">
          <div className="head"><span className="title" style={{ fontSize: 19 }}>Done for you</span><span className="pill wash"><Icon name="spark" style={{ width: 14, height: 14 }} />Automatic</span></div>
          <div className="feed" style={{ marginTop: 6 }}>
            {w.feed.length === 0 && <div className="sub" style={{ padding: '10px 0' }}>Nothing yet this week.</div>}
            {w.feed.slice(0, 4).map((f, i) => {
              const body = (
                <>
                  <div className="ic"><Icon name={FEED_ICON[f.kind] ?? 'spark'} /></div>
                  <div className="t"><Bolded text={f.text} bold={f.bold} /></div>
                  <div className="w">{f.when}</div>
                </>
              )
              return f.link ? <Link key={i} to={f.link} className="f">{body}</Link> : <div key={i} className="f">{body}</div>
            })}
          </div>
          <div className="saved"><span className="sub" style={{ color: 'var(--ink-2)' }}>Typing saved this quarter</span><b className="num">{hrs(w.typing_hours_saved)} hrs</b></div>
        </section>

        <section className="card s4">
          <div className="head"><div className="title" style={{ fontSize: 19 }}>Check these</div><span className="pill">{w.checks.length}</span></div>
          <div style={{ marginTop: 4 }}>
            {w.checks.length === 0 && <div className="sub" style={{ padding: '12px 0' }}>Nothing to check. Nice.</div>}
            {w.checks.map((c, i) => (
              <Link key={i} to={c.link} className="task">
                <div className="ic"><Icon name={CHECK_ICON[c.kind] ?? 'q'} /></div>
                <div className="t">{c.title}<span>{c.detail}</span></div>
                <span className="pill ghost">{CHECK_ACTION[c.kind] ?? 'Open'}</span>
              </Link>
            ))}
          </div>
        </section>

        <Link to="/people?tab=mentors" className="card s4" style={{ display: 'block' }}>
          <div className="head"><span className="eyebrow">Volunteer hours · quarter</span><span className="pill">{s.mentors} mentors</span></div>
          <div className="kpi num" style={{ marginTop: 14 }}>{hrs(s.hours_quarter)}</div>
          <div className="sub" style={{ marginTop: 6 }}>{s.hours_dupes_removed ? `${plural(s.hours_dupes_removed, 'double report')} removed automatically` : 'No double reports found'}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, gap: 10 }}>
            <div className="stack">
              {mentorsShown.map((m, i) => <div key={i} className={`av g${(i % 4) + 1}`}>{m}</div>)}
              {mentorsMore > 0 && <div className="av g6">+{mentorsMore}</div>}
            </div>
            {s.top_mentor && <span className="sub" style={{ fontSize: 14 }}>Top: {s.top_mentor.name.split(' ')[0]} · {hrs(s.top_mentor.hours)} h</span>}
          </div>
        </Link>

        <section className="card blue s4">
          <div className="head"><span className="eyebrow">Q1 report for funders</span><Icon name="arrow" style={{ color: '#fff' }} /></div>
          <div className="kpi" style={{ marginTop: 14 }}>{p.report.ready ? 'Ready' : 'Building'}</div>
          <div style={{ color: 'rgba(255,255,255,.9)', marginTop: 8 }}>Every number links back to the sheet it came from. Due {fmtDay(p.report.due) || p.report.due}.</div>
          <Link className="btn white sm" style={{ marginTop: 18 }} to="/report">Open report</Link>
        </section>

        <Link to="/lab" className="card s12" style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div className="mark" style={{ width: 52, height: 52, borderRadius: 16, color: '#fff' }}><Icon name="db" style={{ width: 24, height: 24 }} /></div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="title" style={{ fontSize: 20 }}>Try it: describe a program and we'll create it</div>
            <div className="sub">Type one sentence. ChiggityCheck writes the kids, sessions and sheets, saves them, and scores who needs a call.</div>
          </div>
          <span className="btn dark sm">Build a dataset</span>
        </Link>
      </div>

      <div className="pagefoot">
        <Link className="link" to="/integrations">Connected tools</Link>
        <Link className="link" to="/signup">Public sign-up form</Link>
      </div>
      {busy && <span className="sr" role="status">Capturing sheet…</span>}
    </>
  )
}
