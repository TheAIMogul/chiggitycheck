import { useState } from 'react'
import { Link, useParams } from 'react-router'
import type { KidDetail } from '../../shared/types'
import { api } from '../api'
import { Lightbox } from '../components/Photo'
import { Avatar, ErrorState, Icon, ShimmerCard, useApi, type IconName } from '../components/ui'
import { LANG_NAME, PROGRAM, SEV, firstName, fmtDay, fmtDow, gradeLabel, initials, pct, prob } from '../format'

const EV_DOT: Record<KidDetail['history'][number]['kind'], string> = {
  urgent: 'r', call: 'o', watch: '', match: 'g', signup: 'g', school: '', contact: 'g', sent: '', reply: 'g',
}
const FU_TEXT: Record<string, string> = { open: 'Call open', sent: 'Message sent', replied: 'Family replied', closed: 'Family reached', not_needed: 'No call needed' }

function monthLabel(m: string) {
  if (/^\d{4}-\d{2}/.test(m)) return fmtDay(m.slice(0, 7) + '-01').split(' ')[0]
  return m.slice(0, 3)
}

function aliasIcon(source: string): IconName {
  const s = source.toLowerCase()
  if (s.includes('form') || s.includes('sign')) return 'form'
  if (s.includes('text')) return 'text'
  return 'sheet'
}

export default function KidProfile() {
  const { id } = useParams()
  const k = useApi(() => api.kid(Number(id)), [id])
  const [box, setBox] = useState<number | null>(null)

  if (k.error) return <ErrorState error={k.error} onRetry={k.reload} />
  if (!k.data) return <><div className="crumb">People › Kids</div><ShimmerCard className="card white" lines={3} tall /><div className="bento" style={{ marginTop: 18 }}><ShimmerCard className="card s8" lines={4} /><ShimmerCard className="card s4" lines={4} /></div></>
  const d = k.data
  const fam = d.family
  const sev = d.severity
  const sevColor = sev === 'urgent' ? 'var(--urgent)' : sev === 'call' ? 'var(--call)' : sev === 'fine' || !sev ? 'var(--good)' : 'var(--ink-2)'
  const lb = box !== null ? d.sessions.find((s) => s.session_id === box) : null
  const calls = d.followup_id ? `/calls/${d.followup_id}` : null

  return (
    <>
      <div className="crumb"><Link to="/people">People</Link> <span>›</span> <Link to="/people?tab=kids">Kids</Link> <span>›</span> <b style={{ color: 'var(--ink)' }}>{d.name}</b></div>
      <section className="card white" style={{ padding: 32 }}>
        <div className="hero">
          <Avatar text={d.initials} seed={d.id} />
          <div><h1>{d.name}</h1><div className="meta">{gradeLabel(d.grade)} · {d.school} · {PROGRAM[d.program]} at {d.site}</div></div>
          <div className="acts" style={{ display: 'flex', gap: 10 }}>
            {calls ? <Link className="btn ghost" to={calls}><Icon name="phone" />Call family</Link> : <a className="btn ghost" href={`tel:${fam.phone.replace(/[^\d+]/g, '')}`}><Icon name="phone" />Call family</a>}
            {calls ? <Link className="btn dark" to={calls}><Icon name="msg" />Message</Link> : <a className="btn dark" href={`sms:${fam.phone.replace(/[^\d+]/g, '')}`}><Icon name="msg" />Message</a>}
          </div>
        </div>
        <div className="stats4">
          <div><b className="num">{pct(d.rate)}</b><span>Showed up</span></div>
          <div><b className="num">{d.present_count} of {d.sessions_count}</b><span>Sessions this quarter</span></div>
          <div><b>{d.mentor ?? 'No mentor yet'}</b><span>{d.mentor_since ? `Mentor since ${fmtDay(d.mentor_since)}` : d.mentor ? 'Mentor' : 'Not matched'}</span></div>
          <div><b style={{ color: sevColor }}>{sev ? SEV[sev] : 'On track'}</b><span>{d.followup_status ? FU_TEXT[d.followup_status] : 'No call needed'}</span></div>
        </div>
      </section>

      <div className="bento" style={{ marginTop: 18 }}>
        <section className="card s8">
          <div className="head"><div className="title">Attendance this quarter</div><span className="pill">{d.sessions_count} sessions</span></div>
          <div className="cal">
            {d.calendar.map((m) => {
              const cells = m.cells.slice(0, 14)
              return [
                <span key={m.month}>{monthLabel(m.month)}</span>,
                ...cells.map((c) => (
                  <button key={c.session_id} type="button" className={[c.mark === 'absent' ? 'a' : c.mark === 'unclear' ? 'u' : '', c.flagged ? 'f' : ''].join(' ').trim() || undefined}
                    aria-label={`${fmtDow(c.held_at)}: ${c.mark === 'present' ? 'here' : c.mark === 'absent' ? 'missed' : 'unclear'}. Open the sheet.`}
                    title={`${fmtDow(c.held_at)} · ${c.mark}`} onClick={() => setBox(c.session_id)} />
                )),
                ...Array.from({ length: 14 - cells.length }).map((_, i) => <i key={`${m.month}-x${i}`} className="x" />),
              ]
            })}
          </div>
          <div className="legend">
            <span><em style={{ background: 'var(--blue)' }} />Here</span>
            <span><em style={{ boxShadow: 'inset 0 0 0 1.5px var(--urgent)' }} />Missed</span>
            <span><em style={{ boxShadow: '0 0 0 2px var(--call)' }} />Why we're calling</span>
            <span style={{ marginLeft: 'auto' }}>Tap any square to open that sheet</span>
          </div>
        </section>

        <section className="card s4">
          <div className="title">Family</div>
          <Link to={`/people/families/${fam.id}`} style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 14 }}>
            <Avatar text={initials(fam.guardian_name)} seed={fam.id + 4} />
            <div><b>{fam.guardian_name}</b><div className="sub">{fam.relationship} · {LANG_NAME[fam.language]} · {fam.neighborhood}</div></div>
          </Link>
          <div className="divider" />
          <div className="head"><span className="sub">Phone</span><a className="num" style={{ fontWeight: 700 }} href={`tel:${fam.phone.replace(/[^\d+]/g, '')}`}>{fam.phone}</a></div>
          {fam.siblings.length > 0 && (
            <div className="head" style={{ marginTop: 10 }}><span className="sub">{fam.siblings.length > 1 ? 'Siblings' : 'Sibling'}</span>
              <b style={{ textAlign: 'right' }}>{fam.siblings.map((s, i) => <span key={s.id}>{i > 0 && ', '}<Link to={`/people/kids/${s.id}`}>{firstName(s.name)}, {gradeLabel(s.grade).replace(' grade', '')}</Link></span>)}</b>
            </div>
          )}
          {fam.signed_up && <div className="head" style={{ marginTop: 10 }}><span className="sub">Signed up</span><b>{fmtDay(fam.signed_up)}{fam.signup_source ? ` · ${fam.signup_source}` : ''}</b></div>}
        </section>

        <section className="card s6">
          <div className="head"><div className="title">Also written as</div><span className="pill wash">Learned automatically</span></div>
          <div style={{ marginTop: 8 }}>
            {d.aliases.length === 0 && <div className="sub" style={{ padding: '12px 0' }}>Always written the same way so far.</div>}
            {d.aliases.map((a, i) => (
              <div key={i} className="alias"><span className="src"><Icon name={aliasIcon(a.source)} /></span><span className="raw">{a.raw_text}<small>{a.source} · {a.dates}</small></span>{a.probability !== null && <span className="pill">{prob(a.probability)}</span>}</div>
            ))}
          </div>
        </section>

        <section className="card s6">
          <div className="title">History</div>
          <div className="events">
            {d.history.length === 0 && <div className="sub">Nothing yet.</div>}
            {d.history.map((h, i) => (
              <div key={i} className="ev"><span className={`d ${EV_DOT[h.kind] ?? ''}`} /><div className="t">{h.title}{h.detail && <span>{h.detail}</span>}</div><span className="w">{fmtDay(h.date) || h.date}</span></div>
            ))}
          </div>
        </section>

        {d.school_history.length > 0 && (
          <section className="card s12">
            <div className="head"><div className="title">{firstName(d.name)} changed schools</div><span className="pill wash">Counted once in the report</span></div>
            {d.school_history.map((s, i) => (
              <div key={i}>
                <div className="hist">
                  <div className="school"><small>Until {fmtDay(s.changed_at)}</small><b>{s.from_school}</b></div>
                  <div style={{ textAlign: 'center', color: 'var(--ink-4)', fontSize: 22 }}>→</div>
                  <div className="school" style={{ background: '#fff', boxShadow: '0 0 0 2px var(--blue) inset' }}><small>Since {fmtDay(s.changed_at)}</small><b>{s.to_school}</b></div>
                </div>
                {s.note && <div className="sub" style={{ marginTop: 14 }}>{s.note}</div>}
              </div>
            ))}
          </section>
        )}
      </div>

      {lb && (lb.photo_url ? (
        <Lightbox src={lb.photo_url} alt={`Sign-in sheet, ${lb.site}, ${fmtDow(lb.held_at)}`} bbox={lb.bbox} title={`${PROGRAM[lb.program]} · ${lb.site} · ${fmtDow(lb.held_at)}`}
          caption={<>Line {lb.row_index ?? '—'}{lb.raw_text ? <> · written as <b style={{ color: 'var(--ink)' }}>{lb.raw_text}</b></> : null} · counted as <b style={{ color: 'var(--ink)' }}>{lb.mark === 'present' ? 'here' : lb.mark === 'absent' ? 'missed' : 'unclear'}</b>{lb.probability !== null ? ` · read ${prob(lb.probability)} sure` : ''}</>}
          onClose={() => setBox(null)} />
      ) : (
        <Lightbox src="" alt="" title={`${fmtDow(lb.held_at)} · ${lb.site}`} caption="No photo is stored for this session." onClose={() => setBox(null)} />
      ))}
    </>
  )
}
