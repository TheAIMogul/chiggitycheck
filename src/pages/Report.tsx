import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { Breakdown, EvidenceResponse, ReportResponse } from '../../shared/types'
import { api, errMsg } from '../api'
import { useApp } from '../components/AppContext'
import { PhotoWithBox } from '../components/Photo'
import { ErrorState, Icon, Seg, Shimmer, ShimmerCard, useApi, useEscape } from '../components/ui'
import { PROGRAM, fmtDay, fmtDow, fmtWhen, hrs, pct, pctNum, plural, prob } from '../format'

const QUARTERS = [{ value: 'FY26Q4', label: 'Q4 FY26' }, { value: 'FY27Q1', label: 'Q1 FY27' }]

function Spark({ v }: { v: number[] }) {
  if (v.length < 2) return <svg className="spark" viewBox="0 0 200 44" preserveAspectRatio="none" aria-hidden="true"><path d="M0 22 L200 22" stroke="#4D6BFE" strokeWidth="2" fill="none" strokeDasharray="3 6" /></svg>
  const lo = Math.min(...v), hi = Math.max(...v)
  const flat = hi - lo < 1e-9
  const d = v.map((x, i) => `${i ? 'L' : 'M'}${((i / (v.length - 1)) * 200).toFixed(1)} ${flat ? 22 : (40 - ((x - lo) / (hi - lo)) * 36).toFixed(1)}`).join(' ')
  return <svg className="spark" viewBox="0 0 200 44" preserveAspectRatio="none" aria-hidden="true"><path d={d} stroke="#4D6BFE" strokeWidth="2" fill="none" strokeDasharray={flat ? '3 6' : undefined} /></svg>
}

/* ---------------- evidence drawer ---------------- */
function Evidence({ evRef, onClose }: { evRef: string; onClose: () => void }) {
  const { today } = useApp()
  const ev = useApi(() => api.evidence(evRef), [evRef])
  const [sess, setSess] = useState<number | null>(null)
  const [rec, setRec] = useState<number | null>(null)
  useEscape(onClose)
  useEffect(() => { setSess(null); setRec(null) }, [evRef])

  const d: EvidenceResponse | null = ev.data
  const sessionId = sess ?? d?.sessions[0]?.session_id ?? d?.records[0]?.session_id ?? null
  const session = d?.sessions.find((s) => s.session_id === sessionId)
  const recs = d?.records.filter((r) => r.session_id === sessionId) ?? []
  const selRec = recs[rec ?? recs.findIndex((r) => r.bbox)] ?? recs[0]
  const photo = selRec?.photo_url ?? session?.photo_url ?? null

  return (
    <>
      <div className="scrim open" onClick={onClose} />
      <aside className="drawer open" role="dialog" aria-modal="true" aria-label="Where this number comes from">
        <button className="x" type="button" aria-label="Close" onClick={onClose}><Icon name="x" style={{ width: 16, height: 16 }} /></button>
        <span className="eyebrow">Where this number comes from</span>
        {ev.error ? <ErrorState error={ev.error} onRetry={ev.reload} inCard={false} /> : !d ? (
          <div style={{ marginTop: 10 }}><Shimmer h={34} w="70%" /><Shimmer h={60} style={{ marginTop: 16 }} />{[0, 1, 2].map((i) => <Shimmer key={i} h={56} style={{ marginTop: 12 }} />)}</div>
        ) : (
          <>
            <h2 style={{ paddingRight: 44 }}>{d.title} {d.value}</h2>
            <div className="formula">{d.formula}</div>
            {d.summary && <div className="sub" style={{ marginTop: 10, fontSize: 14 }}>{d.summary}</div>}
            <div style={{ marginTop: 14 }}>
              {d.sessions.length === 0 && <div className="sub">No sheets behind this number.</div>}
              {d.sessions.map((s) => {
                const on = s.session_id === sessionId
                return (
                  <button key={s.session_id} type="button" className={`rec${on ? ' on' : ''}`} onClick={() => { setSess(s.session_id); setRec(null) }} aria-pressed={on}>
                    <div className="thumb">{s.photo_url ? <img src={s.photo_url} alt="" loading="lazy" /> : <><i style={{ top: 12 }} /><i style={{ top: 20 }} /><i style={{ top: 28 }} /></>}</div>
                    <div style={{ minWidth: 0 }}>
                      <b>{fmtDow(s.held_at)}</b>
                      <div className="sub">{s.present} here · {s.absent} missed{s.unclear ? ` · ${s.unclear} unclear` : ''}{s.program ? ` · ${PROGRAM[s.program]}` : ''} · {s.site}</div>
                    </div>
                    <span className={`pill ${on ? 'blue' : 'ghost'}`}>{on ? 'Viewing' : 'Open'}</span>
                  </button>
                )
              })}
            </div>
            {photo && (
              <div style={{ marginTop: 14 }}>
                <PhotoWithBox src={photo} alt={`Sign-in sheet, ${session?.site ?? selRec?.site ?? ''}, ${fmtDow(session?.held_at ?? selRec?.held_at)}`} bbox={selRec?.bbox ?? null} zoomable />
              </div>
            )}
            {recs.length > 0 && (
              <div className="recs" aria-label="Lines on this sheet">
                {recs.map((r, i) => (
                  <button key={i} type="button" className={r === selRec ? 'on' : undefined} onClick={() => setRec(i)}>
                    <span className="sub num">{r.row_index ?? '—'}</span>
                    <span style={{ minWidth: 0 }}><b>{r.kid_name ?? 'Not counted'}</b> <span className="raw">{r.raw_text}</span></span>
                    <span className="sub" style={{ fontSize: 13 }}>{r.mark ? (r.mark === 'present' ? 'here' : r.mark === 'absent' ? 'missed' : 'unclear') : ''}</span>
                  </button>
                ))}
              </div>
            )}
            {selRec && (
              <div className="sub" style={{ marginTop: 12, fontSize: 14 }}>
                Line {selRec.row_index ?? '—'} counted as <b style={{ color: 'var(--ink)' }}>{selRec.mark === 'present' ? 'here' : selRec.mark === 'absent' ? 'missed' : selRec.mark ?? 'not counted'}</b>
                {selRec.kid_name ? ` for ${selRec.kid_name}` : ''}.{selRec.probability !== null ? ` Read ${prob(selRec.probability)} sure` : ''}{selRec.confirmed_at ? `, confirmed ${fmtWhen(selRec.confirmed_at, today)}` : ''}.{selRec.note ? ` ${selRec.note}` : ''}
              </div>
            )}
          </>
        )}
      </aside>
    </>
  )
}

/* ---------------- report ---------------- */
export default function Report() {
  const [sp, setSp] = useSearchParams()
  const { toast } = useApp()
  const quarter = sp.get('quarter') ?? 'FY27Q1'
  const ev = sp.get('ev')
  const r = useApi(() => api.report(quarter), [quarter])
  const [by, setBy] = useState<'program' | 'site' | 'language'>('program')
  const [snapBusy, setSnapBusy] = useState(false)

  const setParam = useCallback((k: string, v: string | null) => {
    setSp((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n }, { replace: k === 'ev' ? false : true })
  }, [setSp])
  const open = (ref: string) => setParam('ev', ref)
  const close = useCallback(() => setParam('ev', null), [setParam])

  const share = async () => {
    const url = window.location.origin + `/report?quarter=${quarter}`
    try { await navigator.clipboard.writeText(url); toast('Link copied') } catch { toast(url) }
  }
  const snapshot = async () => {
    setSnapBusy(true)
    try {
      const s = await api.snapshot()
      r.setData((d: ReportResponse | null) => (d ? { ...d, snapshot: s } : d))
      toast('Snapshot saved')
    } catch (e) { toast(errMsg(e)) } finally { setSnapBusy(false) }
  }

  const head = (rep: ReportResponse | null) => (
    <div className="rhead">
      <div>
        <div className="eyebrow">{rep ? `${rep.org} · Program outcomes` : 'Program outcomes'}</div>
        {rep ? <h1 style={{ marginTop: 8 }}>{rep.label}<br /><span style={{ color: 'var(--ink-3)' }}>{fmtDay(rep.period.start)} to {fmtDay(rep.period.end)}, {rep.period.end.slice(0, 4)}</span></h1>
          : <><Shimmer h={44} w={260} style={{ marginTop: 10 }} /><Shimmer h={44} w={320} style={{ marginTop: 8 }} /></>}
      </div>
      <div className="noprint" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Seg label="Quarter" value={quarter} onChange={(q) => setParam('quarter', q === 'FY27Q1' ? null : q)} options={QUARTERS} />
        <button className="btn ghost" onClick={share}><Icon name="share" />Share link</button>
        <button className="btn dark" onClick={() => window.print()}>Download PDF</button>
      </div>
    </div>
  )

  if (r.error) return <>{head(null)}<div style={{ marginTop: 22 }}><ErrorState error={r.error} onRetry={r.reload} /></div></>
  if (!r.data) return (
    <>
      {head(null)}
      <div className="kpis">{[0, 1, 2, 3].map((i) => <ShimmerCard key={i} className="card kc" lines={1} tall />)}</div>
      <div className="bento" style={{ marginTop: 18 }}><ShimmerCard className="card s7" lines={4} /><ShimmerCard className="card s5" lines={4} /></div>
    </>
  )
  const d = r.data
  const rows: Breakdown[] = d.by[by]
  const fu = d.followups
  const w = (n: number) => `${fu.flagged ? Math.max(28, (n / fu.flagged) * 100) : 100}%`
  const dq = d.data_quality
  const m = d.mentoring

  return (
    <>
      {head(d)}
      <div className="trace"><span className="c"><Icon name="check" style={{ width: 16, height: 16, strokeWidth: 2.6 }} /></span><span><b>Every number is traceable.</b> {d.traced.linked} of {d.traced.total} attendance lines link to a photo. Tap any number.</span></div>

      <div className="kpis report-kpis">
        {d.kpis.map((k) => (
          <button key={k.key} type="button" className={`card kc${ev === k.evidence_ref ? ' sel' : ''}`} onClick={() => open(k.evidence_ref)} aria-label={`${k.label} ${k.value}. Show where this number comes from.`}>
            <span className="go"><Icon name="arrow" /></span>
            <span className="eyebrow">{k.label}</span>
            <div className="kpi num">{k.value}</div>
            <div className="sub">{k.sub}</div>
            <Spark v={k.spark} />
          </button>
        ))}
      </div>

      <div className="bento" style={{ marginTop: 18 }}>
        <section className="card s7">
          <div className="head">
            <div className="title">Who came, by {by === 'site' ? 'place' : by}</div>
            <span className="noprint"><Seg label="Break down by" value={by} onChange={setBy} options={[{ value: 'program', label: 'Program' }, { value: 'site', label: 'Place' }, { value: 'language', label: 'Language' }]} /></span>
          </div>
          <div style={{ marginTop: 10 }}>
            {rows.length === 0 && <div className="sub" style={{ padding: '12px 0' }}>No sessions yet.</div>}
            {rows.map((b) => (
              <button key={b.label} type="button" className="hbar" onClick={() => open(b.evidence_ref)} aria-label={`${b.label} ${pct(b.rate)}. Show sheets.`}>
                <span>{b.label} {b.locked && <Icon name="lock" style={{ width: 13, height: 13, color: 'var(--ink-3)', verticalAlign: -2 }} />}</span>
                <div className="tr"><i style={{ width: `${pctNum(b.rate)}%` }} /></div>
                <span className="v num">{pct(b.rate)}</span>
                <span className="p num">{plural(b.kids, 'kid')}</span>
              </button>
            ))}
          </div>
          {rows.some((b) => b.locked) && <div className="sub" style={{ marginTop: 12, fontSize: 13.5 }}>Counseling shows totals only. No names leave the counseling record.</div>}
        </section>

        <button type="button" className="card s5" onClick={() => open(fu.evidence_ref)} aria-label="Kids who started missing. Show the follow-ups.">
          <div className="title">Kids who started missing</div>
          <div className="funnel">
            <div style={{ width: '100%' }}>Flagged for a call <b className="num">{fu.flagged}</b></div>
            <div style={{ width: w(fu.reached), background: 'rgba(77,107,254,.18)' }}>Family reached <b className="num">{fu.reached}</b></div>
            <div style={{ width: w(fu.back_within_2w), background: 'rgba(77,107,254,.26)' }}>Back within 2 weeks <b className="num">{fu.back_within_2w}</b></div>
          </div>
          <div className="sub" style={{ marginTop: 12 }}>{fu.median_days === null ? 'No calls made yet.' : `Median ${plural(fu.median_days, 'day')} from first miss to a call.`}</div>
        </button>

        <button type="button" className="card s5" onClick={() => open(m.evidence_ref)} aria-label="Mentoring. Show the hours.">
          <div className="title">Mentoring</div>
          <div className="dq">
            <div><b className="num">{m.active_matches}</b><span>Kids with a mentor</span></div>
            <div><b className="num">{m.new_matches}</b><span>New matches</span></div>
            <div><b className="num">{m.active_mentors}</b><span>Active mentors</span></div>
            <div><b className="num">{hrs(m.avg_hours)} h</b><span>Average per mentor</span></div>
          </div>
        </button>

        <section className="card s7">
          <div className="head"><div className="title">How the data was checked</div><span className="pill" style={{ color: 'var(--good)', background: 'rgba(47,163,107,.12)' }}>{pct(dq.confirmed_pct)} confirmed by staff</span></div>
          <div className="dq" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
            <div><b className="num">{dq.sheets}</b><span>Sheets photographed</span></div>
            <div><b className="num">{dq.rows_read}</b><span>Lines read</span></div>
            <div><b className="num">{dq.aliases_learned}</b><span>Spellings learned</span></div>
            <div><b className="num">{dq.unresolved}</b><span>Lines left out</span></div>
          </div>
          <div className="head noprint" style={{ marginTop: 16, flexWrap: 'wrap' }}>
            <span className="sub" style={{ fontSize: 13.5 }}>
              Built from {plural(d.generated_from.sheets, 'sheet')}, {plural(d.generated_from.signups, 'sign-up')} and {plural(d.generated_from.hours_entries, 'hours entry', 'hours entries')}.
              {d.snapshot ? ` Snapshot saved ${fmtWhen(d.snapshot.built_at)}.` : ' No snapshot saved yet.'}
            </span>
            <button className="btn ghost sm" onClick={snapshot} disabled={snapBusy}>{snapBusy ? <span className="spin dk" /> : null}Save a snapshot</button>
          </div>
        </section>
      </div>

      {ev && <Evidence evRef={ev} onClose={close} />}
    </>
  )
}
