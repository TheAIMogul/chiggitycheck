import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import type { ConfirmResponse, ConfirmRow, Mark, MentorListItem, Program, ReadResponse, ReadRow } from '../../shared/types'
import { api, errMsg } from '../api'
import { useApp } from '../components/AppContext'
import { Lightbox, PhotoWithBox } from '../components/Photo'
import { ErrorState, Icon, Seg, SevPill, Shimmer } from '../components/ui'
import { PROGRAM, SEV, firstName, fmtDow, gradeLabel, hrs, plural, prob, probNum, secs, word } from '../format'

/* one read per session, even under StrictMode double effects */
const readCache = new Map<number, Promise<ReadResponse>>()
function readOnce(id: number) {
  let p = readCache.get(id)
  if (!p) {
    p = api.read(id)
    readCache.set(id, p)
    p.catch(() => readCache.delete(id))
  }
  return p
}

interface Answer { action?: 'accept' | 'new' | 'skip'; kid_id?: number | null; first?: string; last?: string; mark?: Mark }

const needsWho = (r: ReadRow) => r.decision !== 'auto'
const needsMark = (r: ReadRow) => r.mark_question
const isNeed = (r: ReadRow) => needsWho(r) || needsMark(r)

function splitName(raw: string) {
  const parts = raw.replace(/[.,]/g, ' ').trim().split(/\s+/)
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') }
}

function answered(r: ReadRow, a: Answer | undefined): boolean {
  if (needsWho(r)) {
    if (!a?.action) return false
    if (a.action === 'new' && !(a.first?.trim())) return false
  }
  if (needsMark(r) && a?.action !== 'skip' && !a?.mark) return false
  return true
}

function MarkIcon({ mark }: { mark: Mark }) {
  if (mark === 'present') return <Icon name="check" style={{ color: 'var(--good)' }} />
  if (mark === 'absent') return <svg className="i" style={{ color: 'var(--urgent)' }} aria-hidden="true"><circle cx="12" cy="12" r="7" /></svg>
  return <Icon name="q" style={{ color: 'var(--call)' }} />
}

type Tab = 'needs' | 'matched' | 'all'

export default function SnapReview() {
  const { sessionId } = useParams()
  const id = Number(sessionId)
  const loc = useLocation()
  const nav = useNavigate()
  const { refreshCounts } = useApp()
  const st = (loc.state ?? {}) as { photo_url?: string; upload_ms?: number }

  const [read, setRead] = useState<ReadResponse | null>(null)
  const [err, setErr] = useState<unknown>(null)
  const [elapsed, setElapsed] = useState(0)
  const [tab, setTab] = useState<Tab>('needs')
  const [answers, setAnswers] = useState<Record<number, Answer>>({})
  const [focus, setFocus] = useState<number | null>(null)
  const [header, setHeader] = useState<{ program: Program; site: string; held_at: string; facilitator: string; facilitator_mentor_id: number | null } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [mentors, setMentors] = useState<MentorListItem[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [done, setDone] = useState<ConfirmResponse | null>(null)
  const [big, setBig] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const t0 = useRef(0)

  useEffect(() => {
    if (!id) return
    let live = true
    t0.current = performance.now()
    setErr(null)
    const tick = setInterval(() => setElapsed(performance.now() - t0.current), 100)
    readOnce(id).then(
      (r) => {
        if (!live) return
        clearInterval(tick)
        setRead(r)
        setHeader({ program: r.header.program, site: r.header.site, held_at: r.header.held_at, facilitator: r.header.facilitator, facilitator_mentor_id: r.header.facilitator_mentor_id })
        const init: Record<number, Answer> = {}
        for (const row of r.rows) {
          if (row.decision === 'auto' && row.best) init[row.row_index] = { action: 'accept', kid_id: row.best.kid_id, mark: row.mark_question ? undefined : row.mark }
          else if (row.decision === 'new') { const n = splitName(row.raw_text); init[row.row_index] = { first: n.first, last: n.last } }
        }
        setAnswers(init)
        if (!r.rows.some(isNeed)) setTab('matched')
      },
      (e) => { if (live) { clearInterval(tick); setErr(e) } },
    )
    return () => { live = false; clearInterval(tick) }
  }, [id, attempt])

  useEffect(() => {
    if (editing === 'lead' && !mentors) api.mentors().then(setMentors, () => setMentors([]))
  }, [editing, mentors])

  const rows = read?.rows ?? []
  const needs = useMemo(() => rows.filter(isNeed), [rows])
  const matched = useMemo(() => rows.filter((r) => !isNeed(r)), [rows])
  const left = needs.filter((r) => !answered(r, answers[r.row_index])).length
  const photo = read?.photo_url ?? st.photo_url
  const focusRow = rows.find((r) => r.row_index === focus)
  const setA = (row: number, a: Partial<Answer>) => setAnswers((p) => ({ ...p, [row]: { ...p[row], ...a } }))

  const save = async () => {
    if (!read || !header) return
    setSaving(true); setSaveErr(null)
    const out: ConfirmRow[] = rows.map((r) => {
      const a = answers[r.row_index] ?? {}
      const mark = a.mark ?? r.mark
      if (a.action === 'skip') return { row_index: r.row_index, kid_id: null, action: 'skip', mark }
      if (a.action === 'new') return { row_index: r.row_index, kid_id: null, action: 'new', mark, new_kid: { first_name: (a.first ?? '').trim(), last_name: (a.last ?? '').trim() } }
      return { row_index: r.row_index, kid_id: a.kid_id ?? r.best?.kid_id ?? null, action: 'accept', mark }
    })
    try {
      const res = await api.confirm(id, { header: { program: header.program, site: header.site, held_at: header.held_at, facilitator_mentor_id: header.facilitator_mentor_id }, rows: out })
      setDone(res)
      refreshCounts()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) { setSaveErr(errMsg(e)) } finally { setSaving(false) }
  }

  /* ---------- success ---------- */
  if (done) {
    const changes = [
      ...done.followups.created.map((c) => ({ id: c.followup_id, name: c.kid_name, to: c.severity, from: null as string | null })),
      ...done.followups.updated.map((c) => ({ id: c.followup_id, name: c.kid_name, to: c.to, from: SEV[c.from] })),
    ]
    return (
      <section className="card" style={{ maxWidth: 820, margin: '0 auto' }}>
        <div className="trace" style={{ marginTop: 0 }}><span className="c"><Icon name="check" style={{ width: 16, height: 16, strokeWidth: 2.6 }} /></span><span><b>Saved.</b> {done.attendance_written} attendance lines are in the record. {secs(done.ms)}</span></div>
        <h1 style={{ fontSize: 38, marginTop: 18 }}>{done.present} here, {done.absent} missed{done.unclear ? `, ${done.unclear} unclear` : ''}.</h1>
        <div className="dq" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
          <div><b className="num">{done.attendance_written}</b><span>Attendance lines</span></div>
          <div><b className="num">{done.aliases_learned}</b><span>Spellings learned</span></div>
          <div><b className="num">{hrs(done.hours_logged)} h</b><span>Volunteer hours</span></div>
          <div><b className="num">{done.new_kids}</b><span>New kids</span></div>
        </div>
        <div className="title" style={{ fontSize: 19, marginTop: 24 }}>Follow-ups updated</div>
        <div className="done-list">
          {changes.length === 0 && <div className="sub" style={{ padding: '10px 0' }}>No follow-ups changed. Everyone on this sheet is on track.</div>}
          {changes.map((c) => (
            <Link key={c.id} to={`/calls/${c.id}`} className="row">
              <span><b>{c.name}</b> <span className="sub">→ {SEV[c.to]}{c.from ? ` (was ${c.from})` : ' · new'}</span></span>
              <SevPill severity={c.to} />
            </Link>
          ))}
        </div>
        {changes.length > 0 && <div className="sub" style={{ marginTop: 10 }}>Messages are already drafted in each family's language.</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
          <button className="btn dark" onClick={() => nav('/calls')}><Icon name="phone" />Go to calls</button>
          <button className="btn ghost" onClick={() => nav('/today')}>Back to Today</button>
        </div>
      </section>
    )
  }

  /* ---------- pipeline ---------- */
  const t = read?.timings
  const pipe = (
    <div className="pipe" aria-live="polite">
      <div className="step"><span className="c"><Icon name="check" /></span>Photo saved {(t?.upload_ms ?? st.upload_ms) !== undefined && <small>{secs((t?.upload_ms ?? st.upload_ms) as number)}</small>}</div><span className="ln" />
      {read ? (
        <>
          <div className="step"><span className="c"><Icon name="check" /></span>Read {plural(rows.length, 'name')} <small>{secs(read.timings.read_ms)}</small></div><span className="ln" />
          <div className="step"><span className="c"><Icon name="check" /></span>Matched to kids <small>{secs(read.timings.match_ms)}</small></div><span className="ln" />
          <div className="step now"><span className="c">{needs.length ? left : <Icon name="check" />}</span>Your turn</div>
        </>
      ) : err ? (
        <div className="step" style={{ color: 'var(--urgent)' }}><span className="c" style={{ background: 'var(--urgent)' }}>!</span>Reading stopped</div>
      ) : (
        <>
          <div className="step now run"><span className="c"><span className="spin" style={{ width: 14, height: 14 }} /></span>Reading names… <small>{secs(elapsed)}</small></div><span className="ln" />
          <div className="step wait"><span className="c">3</span>Matching to kids</div><span className="ln" />
          <div className="step wait"><span className="c">4</span>Your turn</div>
        </>
      )}
    </div>
  )

  const chip = (key: string, label: ReactNode, editor: ReactNode) => (
    <span className={`chip${editing === key ? ' editing' : ''}`} onClick={() => editing !== key && setEditing(key)} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' && editing !== key) setEditing(key) }} aria-label={`Edit ${key}`}>
      {editing === key ? editor : <>{label} <Icon name="pen" /></>}
    </span>
  )

  const photoCard = (
    <section className="card photo">
      {header ? (
        <div className="chips">
          {chip('program', PROGRAM[header.program],
            <select autoFocus value={header.program} onBlur={() => setEditing(null)} onChange={(e) => { setHeader({ ...header, program: e.target.value as Program }); setEditing(null) }} aria-label="Program">
              {(Object.keys(PROGRAM) as Program[]).map((p) => <option key={p} value={p}>{PROGRAM[p]}</option>)}
            </select>)}
          {chip('site', header.site,
            <input autoFocus defaultValue={header.site} aria-label="Site" onBlur={(e) => { setHeader({ ...header, site: e.target.value.trim() || header.site }); setEditing(null) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />)}
          {chip('date', fmtDow(header.held_at),
            <input autoFocus type="date" defaultValue={header.held_at.slice(0, 10)} aria-label="Date" onBlur={(e) => { if (e.target.value) setHeader({ ...header, held_at: e.target.value }); setEditing(null) }} />)}
          {chip('lead', <><small>Led by</small> {header.facilitator || 'Nobody yet'}</>,
            mentors ? (
              <select autoFocus value={header.facilitator_mentor_id ?? ''} aria-label="Led by" onBlur={() => setEditing(null)}
                onChange={(e) => { const m = mentors.find((x) => x.id === Number(e.target.value)); setHeader({ ...header, facilitator_mentor_id: m?.id ?? null, facilitator: m?.name ?? '' }); setEditing(null) }}>
                <option value="">Nobody</option>
                {mentors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            ) : <span className="spin dk" />)}
        </div>
      ) : (
        <div className="chips">{[90, 130, 90, 140].map((w, i) => <Shimmer key={i} h={36} w={w} r={12} />)}</div>
      )}
      {photo
        ? <PhotoWithBox src={photo} alt={`Sign-in sheet, ${header?.site ?? 'uploaded'}${header ? `, ${fmtDow(header.held_at)}` : ''}`} bbox={focusRow?.bbox ?? null} zoomable onExpand={() => setBig(true)} />
        : <div className="shot ph"><Shimmer h={420} r={18} /></div>}
      {read?.read_source === 'verified_fallback' && <div className="notice neutral" style={{ marginTop: 14, marginBottom: 0, fontSize: 13.5 }}><Icon name="info" />Read from the verified copy of this sheet.</div>}
    </section>
  )

  const optBtn = (sel: boolean, onClick: () => void, title: string, small?: string) => (
    <button type="button" className={`opt${sel ? ' sel' : ''}`} aria-pressed={sel} onClick={(e) => { e.stopPropagation(); onClick() }}>
      {title}{small && <small>{small}</small>}
    </button>
  )

  const needCard = (r: ReadRow, i: number) => {
    const a = answers[r.row_index] ?? {}
    const best = r.best ? r.candidates.find((c) => c.kid_id === r.best!.kid_id) : r.candidates[0]
    const who = a.action === 'accept' ? r.candidates.find((c) => c.kid_id === a.kid_id) ?? best : best
    const name = a.action === 'new' ? (a.first || 'this kid') : who ? firstName(who.name) : 'this kid'
    return (
      <div key={r.row_index} className={`need reveal${focus === r.row_index ? ' focus' : ''}${answered(r, a) ? ' done' : ''}`} style={{ animationDelay: `${i * 120}ms` }} onClick={() => setFocus(r.row_index)}>
        {needsWho(r) && (
          <>
            <div className="meta">Line {r.row_index} · {r.decision === 'new' ? 'No enrolled kid looks like this' : `${plural(r.candidates.length, 'kid')} could be this`}</div>
            <div className="q">{r.decision === 'new' ? 'Who is this?' : 'Which kid is this?'}</div>
            <div className="w">{r.raw_text}</div>
            <div className="opts">
              {r.decision === 'new' && optBtn(a.action === 'new', () => setA(r.row_index, { action: 'new', kid_id: null }), 'Add a new kid', 'Family can come later')}
              {r.candidates.slice(0, r.decision === 'new' ? 2 : 3).map((c) =>
                optBtn(a.action === 'accept' && a.kid_id === c.kid_id, () => setA(r.row_index, { action: 'accept', kid_id: c.kid_id }), c.name, `${PROGRAM[c.program]} · ${prob(c.probability)} alike`))}
              {optBtn(a.action === 'skip', () => setA(r.row_index, { action: 'skip', kid_id: null }), 'Skip this line', "Won't be counted")}
            </div>
            {a.action === 'new' && (
              <div className="newkid" onClick={(e) => e.stopPropagation()}>
                <label className="field">First name<input value={a.first ?? ''} onChange={(e) => setA(r.row_index, { first: e.target.value })} /></label>
                <label className="field">Last name<input value={a.last ?? ''} onChange={(e) => setA(r.row_index, { last: e.target.value })} /></label>
              </div>
            )}
          </>
        )}
        {needsMark(r) && a.action !== 'skip' && (
          <div style={needsWho(r) ? { marginTop: 18 } : undefined}>
            {!needsWho(r) && (
              <div className="meta">Line {r.row_index} · {who?.name ?? r.raw_text} {r.best && <span className="pill wash" style={{ height: 22, fontSize: 12 }}>{prob(r.best.probability)} sure of the name</span>}</div>
            )}
            <div className="q">The check mark is only half there. Was {name} here?</div>
            <div className="opts">
              {optBtn(a.mark === 'present', () => setA(r.row_index, { mark: 'present' }), 'Yes, here')}
              {optBtn(a.mark === 'absent', () => setA(r.row_index, { mark: 'absent' }), 'No, missed it')}
              {optBtn(a.mark === 'unclear', () => setA(r.row_index, { mark: 'unclear' }), 'Not sure', 'Left out of the rate')}
            </div>
          </div>
        )}
      </div>
    )
  }

  const mrow = (r: ReadRow, i: number) => {
    const a = answers[r.row_index] ?? {}
    const c = r.candidates.find((x) => x.kid_id === (a.kid_id ?? r.best?.kid_id)) ?? r.candidates[0]
    const p = probNum(r.best?.probability ?? c?.probability)
    const mark = a.mark ?? r.mark
    return (
      <div key={r.row_index} className={`mrow reveal${focus === r.row_index ? ' focus' : ''}`} style={{ animationDelay: `${i * 120}ms` }} onClick={() => setFocus(r.row_index)}
        role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setFocus(r.row_index) }}>
        <span className="ix">{r.row_index}</span>
        <span className="raw">{r.raw_text}</span>
        <span className="to">→</span>
        <span className="who">
          {isNeed(r) && !answered(r, a) ? <><b style={{ color: 'var(--blue)' }}>Needs you</b><small>{r.raw_text}</small></>
            : a.action === 'skip' ? <><b style={{ color: 'var(--ink-3)' }}>Skipped</b><small>Won't be counted</small></>
            : a.action === 'new' ? <><b>{`${a.first ?? ''} ${a.last ?? ''}`.trim()}</b><small className="new">New kid</small></>
            : <><b>{c?.name ?? r.raw_text}</b>{r.new_spelling ? <small className="new">New spelling learned</small> : <small>{c ? `${gradeLabel(c.grade)}${c.mentor ? ` · mentor ${firstName(c.mentor)}` : ''}` : ''}</small>}</>}
        </span>
        <span className="conf"><i style={{ ['--p' as string]: `${p}%` }} />{p || ''}</span>
        <span className="mk" title={mark}><MarkIcon mark={mark} /></span>
      </div>
    )
  }

  const preview = read?.preview
  const firstChange = preview?.followup_changes[0]
  const shownMatched = [...matched].sort((x, y) => Number(y.new_spelling) - Number(x.new_spelling) || probNum(x.best?.probability) - probNum(y.best?.probability))

  return (
    <>
      {pipe}
      <div className="snap">
        {photoCard}
        <section>
          {err ? (
            <ErrorState error={err} onRetry={() => { readCache.delete(id); setErr(null); setAttempt((n) => n + 1) }} />
          ) : !read ? (
            <div className="card" aria-busy="true">
              <h1 style={{ fontSize: 34 }}>Reading the sheet…</h1>
              <div className="sub" style={{ fontSize: 16, marginTop: 4 }}>Real handwriting reading, then matching every name to the kids we know. This takes a few seconds.</div>
              {[0, 1, 2, 3, 4].map((i) => <Shimmer key={i} h={44} r={12} style={{ marginTop: 14, opacity: 1 - i * 0.15 }} />)}
            </div>
          ) : (
            <div className="card">
              <h1 style={{ fontSize: 34 }}>{matched.length} of {rows.length} matched.</h1>
              <div className="sub" style={{ fontSize: 16, marginTop: 4 }}>
                {needs.length ? `${word(needs.length)} ${needs.length === 1 ? 'name needs' : 'names need'} a quick answer. ` : 'Everything matched. '}Tap any name to find it on the photo.
              </div>
              <div style={{ marginTop: 16 }}>
                <Seg label="Rows" value={tab} onChange={setTab} options={[
                  { value: 'needs', label: 'Needs you', count: needs.length },
                  { value: 'matched', label: 'Matched', count: matched.length },
                  { value: 'all', label: 'All', count: rows.length },
                ]} />
              </div>

              {tab === 'needs' && (
                <>
                  {needs.length === 0 && <div className="sub" style={{ marginTop: 16 }}>Nothing needs you on this sheet.</div>}
                  {needs.map(needCard)}
                  {matched.length > 0 && (
                    <div className="card" style={{ marginTop: 14, padding: '18px 20px', background: 'rgba(255,255,255,.55)', boxShadow: 'none' }}>
                      <div className="head"><span className="eyebrow">Matched for you</span><span className="sub" style={{ fontSize: 13 }}>How sure</span></div>
                      <div className="matched">{shownMatched.slice(0, 4).map((r, i) => mrow(r, i + needs.length))}</div>
                      {matched.length > 4 && <button className="sub link" style={{ marginTop: 8, fontSize: 14 }} onClick={() => setTab('matched')}>+ {matched.length - 4} more matched</button>}
                    </div>
                  )}
                </>
              )}
              {tab === 'matched' && <div className="matched" style={{ marginTop: 14 }}>{matched.map(mrow)}</div>}
              {tab === 'all' && <div className="matched" style={{ marginTop: 14 }}>{rows.map(mrow)}</div>}

              {preview && (
                <div className="onsave">
                  <div className="ttl">When you save</div>
                  <div className="g">
                    <div><b className="num">{preview.attendance}</b><span>attendance lines</span></div>
                    <div><b className="num">{preview.new_spellings}</b><span>new spellings learned</span></div>
                    <div><b className="num">{hrs(preview.hours)} h</b><span>logged for {header?.facilitator || preview.facilitator || 'the leader'}</span></div>
                    {firstChange
                      ? <div><b>{firstName(firstChange.kid_name)}</b><span>moves to {SEV[firstChange.to]}{preview.followup_changes.length > 1 ? ` · +${preview.followup_changes.length - 1} more` : ''}</span></div>
                      : <div><b className="num">0</b><span>follow-up changes</span></div>}
                  </div>
                  {saveErr && <div className="notice bad" style={{ marginTop: 14, marginBottom: 0, color: '#fff', background: 'rgba(229,72,77,.35)' }}>{saveErr}</div>}
                  <div className="bar">
                    <span style={{ color: 'rgba(255,255,255,.7)', fontSize: 14 }}>
                      {saving ? 'Saving, scoring follow-ups and drafting messages…' : left ? `${plural(left, 'answer')} left` : 'Ready to save'}
                    </span>
                    <button className="btn white" disabled={left > 0 || saving} onClick={save}>
                      {saving ? <><span className="spin dk" />Saving…</> : 'Save attendance'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
      {big && photo && (
        <Lightbox src={photo} alt="Sign-in sheet, full size" bbox={focusRow?.bbox ?? null} title={header ? `${PROGRAM[header.program]} · ${header.site}` : 'Sign-in sheet'}
          caption={header ? fmtDow(header.held_at) : undefined} onClose={() => setBig(false)} />
      )}
    </>
  )
}
