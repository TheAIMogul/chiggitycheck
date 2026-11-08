import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useParams } from 'react-router'
import type { KidDetail, Mark } from '../../shared/types'
import { api } from '../api'
import { Lightbox } from '../components/Photo'
import { InlineEdit, useFlash, useRipple } from '../components/Ripple'
import { Avatar, ErrorState, Icon, ShimmerCard, useApi, useEscape, type IconName } from '../components/ui'
import { LANG_NAME, MARK, PROGRAM, SEV, firstName, fmtDay, fmtDow, gradeLabel, initials, pct, prob } from '../format'

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

const cellCls = (mark: Mark, flagged: boolean) => [mark === 'absent' ? 'a' : mark === 'unclear' ? 'u' : '', flagged ? 'f' : ''].join(' ').trim()

/* ---------- popover: tap a square, change the mark ---------- */
function MarkPop({ anchor, session, onPick, onSheet, onClose }: {
  anchor: DOMRect; session: { held_at: string; site: string; mark: Mark; attendance_id: number | null }
  onPick: (m: Mark) => void; onSheet: () => void; onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: anchor.left, top: anchor.bottom + 8 })
  useEscape(onClose)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth, h = el.offsetHeight
    let left = anchor.left + anchor.width / 2 - w / 2
    left = Math.max(12, Math.min(window.innerWidth - w - 12, left))
    let top = anchor.bottom + 8
    if (top + h > window.innerHeight - 12) top = anchor.top - h - 8
    setPos({ left, top })
  }, [anchor])
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    const s = () => onClose()
    document.addEventListener('mousedown', h)
    window.addEventListener('scroll', s, { passive: true })
    return () => { document.removeEventListener('mousedown', h); window.removeEventListener('scroll', s) }
  }, [onClose])
  const opt = (m: Mark, label: string) => (
    <button type="button" className={`${m === 'absent' ? 'a' : m === 'unclear' ? 'u' : ''}${session.mark === m ? ' on' : ''}`.trim() || undefined}
      aria-pressed={session.mark === m} disabled={session.attendance_id === null} onClick={() => onPick(m)}><i />{label}</button>
  )
  // portal: the glass cards use backdrop-filter, which would otherwise become the containing block for position:fixed
  return createPortal(
    <div ref={ref} className="pop" role="dialog" aria-label={`Attendance on ${fmtDow(session.held_at)}`} style={{ left: pos.left, top: pos.top }}>
      <div className="t"><span>{fmtDow(session.held_at)}</span><small>{session.site}</small></div>
      <div className="marks">{opt('present', 'Here')}{opt('absent', 'Missed')}{opt('unclear', 'Unclear')}</div>
      {session.attendance_id === null && <div className="sub" style={{ fontSize: 12.5, marginTop: 8 }}>No attendance line for this day yet.</div>}
      <button type="button" className="sheet" onClick={onSheet}><Icon name="img" />Open the sheet photo</button>
    </div>,
    document.body,
  )
}

export default function KidProfile() {
  const { id } = useParams()
  const k = useApi(() => api.kid(Number(id)), [id])
  const { run } = useRipple()
  const { flash, cls } = useFlash()
  const [box, setBox] = useState<number | null>(null)
  const [pop, setPop] = useState<{ session_id: number; rect: DOMRect } | null>(null)
  const [just, setJust] = useState<number | null>(null)
  const closePop = useCallback(() => setPop(null), [])

  if (k.error) return <ErrorState error={k.error} onRetry={k.reload} />
  if (!k.data) return <><div className="crumb">People › Kids</div><ShimmerCard className="card white" lines={3} tall /><div className="bento" style={{ marginTop: 18 }}><ShimmerCard className="card s8" lines={4} /><ShimmerCard className="card s4" lines={4} /></div></>
  const d = k.data
  const fam = d.family
  const sev = d.severity
  const sevColor = sev === 'urgent' ? 'var(--urgent)' : sev === 'call' ? 'var(--call)' : sev === 'fine' || !sev ? 'var(--good)' : 'var(--ink-2)'
  const lb = box !== null ? d.sessions.find((s) => s.session_id === box) : null
  const calls = d.followup_id ? `/calls/${d.followup_id}` : null

  /** after an edit: refetch quietly and flash whatever moved in the stats row */
  const refetchAndFlash = async (extraKeys: string[] = []) => {
    const before = d
    const next = await api.kid(Number(id)).catch(() => null)
    if (!next) { k.reload(true); return }
    k.setData(next)
    const moved: string[] = [...extraKeys]
    if (pct(before.rate) !== pct(next.rate)) moved.push('rate')
    if (before.present_count !== next.present_count || before.sessions_count !== next.sessions_count) moved.push('count')
    if (before.severity !== next.severity || before.followup_status !== next.followup_status) moved.push('sev')
    if (before.history.length !== next.history.length) moved.push('history')
    if (before.school !== next.school) moved.push('school')
    if (before.name !== next.name) moved.push('name')
    if (before.grade !== next.grade) moved.push('grade')
    flash(moved)
  }

  const popSession = pop ? (() => {
    const s = d.sessions.find((x) => x.session_id === pop.session_id)
    const cell = d.calendar.flatMap((m) => m.cells).find((c) => c.session_id === pop.session_id)
    if (!cell) return null
    return { held_at: cell.held_at, site: s?.site ?? d.site, mark: cell.mark, attendance_id: cell.attendance_id ?? s?.attendance_id ?? null }
  })() : null

  const setMark = (session_id: number, attendance_id: number, mark: Mark) => {
    setPop(null)
    const prev = d
    // optimistic: flip the square now
    k.setData({
      ...d,
      calendar: d.calendar.map((m) => ({ ...m, cells: m.cells.map((c) => (c.session_id === session_id ? { ...c, mark } : c)) })),
      sessions: d.sessions.map((s) => (s.session_id === session_id ? { ...s, mark } : s)),
    })
    setJust(session_id)
    setTimeout(() => setJust(null), 400)
    void run(() => api.patchAttendance(attendance_id, mark)).then((res) => {
      if (!res) { k.setData(prev); return }
      void refetchAndFlash()
    })
  }

  const saveKid = (body: Parameters<typeof api.patchKid>[1], optimistic: Partial<KidDetail>, keys: string[]) => {
    const prev = d
    k.setData({ ...d, ...optimistic })
    void run(() => api.patchKid(d.id, body)).then((res) => {
      if (!res) { k.setData(prev); return }
      void refetchAndFlash(keys)
    })
  }
  const saveName = (v: string) => {
    const parts = v.trim().split(/\s+/)
    const first_name = parts[0] ?? v
    const last_name = parts.slice(1).join(' ')
    saveKid({ first_name, last_name }, { name: v.trim(), initials: initials(v) }, ['name'])
  }
  const saveGrade = (v: string) => saveKid({ grade: v.replace(/\s*grade$/i, '') }, { grade: v.replace(/\s*grade$/i, '') }, ['grade'])
  const saveSchool = (v: string) => saveKid({ school: v }, { school: v }, ['school', 'history'])

  return (
    <>
      <div className="crumb"><Link to="/people">People</Link> <span>›</span> <Link to="/people?tab=kids">Kids</Link> <span>›</span> <b style={{ color: 'var(--ink)' }}>{d.name}</b></div>
      <section className="card white" style={{ padding: 32 }}>
        <div className="hero">
          <Avatar text={d.initials} seed={d.id} />
          <div>
            <InlineEdit as="h1" value={d.name} label="Name" className={cls('name')} onSave={saveName} />
            <div className="meta">
              <InlineEdit value={d.grade} display={gradeLabel(d.grade)} label="Grade" className={cls('grade')} onSave={saveGrade} />
              {' · '}
              <InlineEdit value={d.school} label="School" editLabel="Change school" className={cls('school')} onSave={saveSchool} />
              {' · '}{PROGRAM[d.program]} at {d.site}
            </div>
          </div>
          <div className="acts" style={{ display: 'flex', gap: 10 }}>
            {calls ? <Link className="btn ghost" to={calls}><Icon name="phone" />Call family</Link> : <a className="btn ghost" href={`tel:${fam.phone.replace(/[^\d+]/g, '')}`}><Icon name="phone" />Call family</a>}
            {calls ? <Link className="btn dark" to={calls}><Icon name="msg" />Message</Link> : <a className="btn dark" href={`sms:${fam.phone.replace(/[^\d+]/g, '')}`}><Icon name="msg" />Message</a>}
          </div>
        </div>
        <div className="stats4">
          <div className={cls('rate')}><b className="num">{pct(d.rate)}</b><span>Showed up</span></div>
          <div className={cls('count')}><b className="num">{d.present_count} of {d.sessions_count}</b><span>Sessions this quarter</span></div>
          <div><b>{d.mentor ?? 'No mentor yet'}</b><span>{d.mentor_since ? `Mentor since ${fmtDay(d.mentor_since)}` : d.mentor ? 'Mentor' : 'Not matched'}</span></div>
          <div className={cls('sev')}><b style={{ color: sevColor }}>{sev ? SEV[sev] : 'On track'}</b><span>{d.followup_status ? FU_TEXT[d.followup_status] : 'No call needed'}</span></div>
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
                  <button key={c.session_id} type="button"
                    className={[cellCls(c.mark, c.flagged), pop?.session_id === c.session_id ? 'sel' : '', just === c.session_id ? 'just' : ''].join(' ').trim() || undefined}
                    aria-label={`${fmtDow(c.held_at)}: ${MARK[c.mark]}. Change it or open the sheet.`} aria-haspopup="dialog"
                    title={`${fmtDow(c.held_at)} · ${c.mark}`} onClick={(e) => setPop({ session_id: c.session_id, rect: e.currentTarget.getBoundingClientRect() })} />
                )),
                ...Array.from({ length: 14 - cells.length }).map((_, i) => <i key={`${m.month}-x${i}`} className="x" />),
              ]
            })}
          </div>
          <div className="legend">
            <span><em style={{ background: 'var(--blue)' }} />Here</span>
            <span><em style={{ boxShadow: 'inset 0 0 0 1.5px var(--urgent)' }} />Missed</span>
            <span><em style={{ boxShadow: '0 0 0 2px var(--call)' }} />Why we're calling</span>
            <span style={{ marginLeft: 'auto' }}>Tap any square to change it or open that sheet</span>
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
              <div key={`${h.kind}-${h.date}-${i}`} className={`ev${i === 0 && cls('history') ? ' vflash' : ''}`}><span className={`d ${EV_DOT[h.kind] ?? ''}`} /><div className="t">{h.title}{h.detail && <span>{h.detail}</span>}</div><span className="w">{fmtDay(h.date) || h.date}</span></div>
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

      {pop && popSession && (
        <MarkPop anchor={pop.rect} session={popSession} onClose={closePop}
          onPick={(m) => { if (popSession.attendance_id !== null && m !== popSession.mark) setMark(pop.session_id, popSession.attendance_id, m); else setPop(null) }}
          onSheet={() => { setBox(pop.session_id); setPop(null) }} />
      )}

      {lb && (lb.photo_url ? (
        <Lightbox src={lb.photo_url} alt={`Sign-in sheet, ${lb.site}, ${fmtDow(lb.held_at)}`} bbox={lb.bbox} title={`${PROGRAM[lb.program]} · ${lb.site} · ${fmtDow(lb.held_at)}`}
          caption={<>Line {lb.row_index ?? '—'}{lb.raw_text ? <> · written as <b style={{ color: 'var(--ink)' }}>{lb.raw_text}</b></> : null} · counted as <b style={{ color: 'var(--ink)' }}>{MARK[lb.mark]}</b>{lb.probability !== null ? ` · read ${prob(lb.probability)} sure` : ''}</>}
          onClose={() => setBox(null)} />
      ) : (
        <Lightbox src="" alt="" title={`${fmtDow(lb.held_at)} · ${lb.site}`} caption="No photo is stored for this session." onClose={() => setBox(null)} />
      ))}
    </>
  )
}
