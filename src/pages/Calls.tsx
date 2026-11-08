import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import type { CallsResponse, Fact, FollowupItem, Lang, MessageEvent } from '../../shared/types'
import { api, errMsg } from '../api'
import { useApp } from '../components/AppContext'
import { Avatar, ErrorState, Highlighted, Icon, Seg, Shimmer, ShimmerCard, useIsPhone, type IconName } from '../components/ui'
import { LANG_NAME, LANG_NATIVE, SEV, SEV_DOT, SEV_LEVEL, firstName, fmtDay, fmtWeekday, fmtWhen, gradeLabel, prob } from '../format'

type Status = 'open' | 'sent' | 'replied' | 'watch'
const FACT_ICON: Record<Fact['kind'], IconName> = { sheet: 'sheet', mentor: 'people', form: 'form', schedule: 'clock', contact: 'phone' }
const EVENT_LABEL: Record<MessageEvent['status'], string> = { queued: 'Queued', sent: 'Sent', delivered: 'Delivered', read: 'Read', failed: 'Failed', received: 'Received' }

function whenLabel(f: FollowupItem, status: Status) {
  if (status === 'sent') return f.sent_at ? fmtDay(f.sent_at) : 'Sent'
  if (status === 'replied') return f.replied_at ? fmtDay(f.replied_at) : 'Replied'
  if (f.severity === 'urgent') return 'Today'
  if (f.severity === 'call') return 'This week'
  return 'Keep an eye'
}

/* ---------------- inbox ---------------- */
function Inbox({ data, status, setStatus, selected, onPick }: {
  data: CallsResponse | null; status: Status; setStatus: (s: Status) => void; selected: number | null; onPick: (id: number) => void
}) {
  return (
    <section className="card inbox">
      {status === 'watch' ? (
        <button className="pill ghost" style={{ marginBottom: 12, border: '1px solid rgba(11,12,16,.12)' }} onClick={() => setStatus('open')}><Icon name="back" style={{ width: 14, height: 14 }} />Back to calls</button>
      ) : (
        <div style={{ marginBottom: 12 }}>
          <Seg label="Follow-ups" value={status} onChange={setStatus} options={[
            { value: 'open', label: 'To call', count: data?.counts.open },
            { value: 'sent', label: 'Sent', count: data?.counts.sent },
            { value: 'replied', label: 'Replied', count: data?.counts.replied },
          ]} />
        </div>
      )}
      {status === 'watch' && <div className="title" style={{ fontSize: 19, margin: '0 0 8px 12px' }}>Keep an eye on</div>}
      <div className="list">
        {!data && [0, 1, 2, 3].map((i) => <div key={i} className="li"><Shimmer h={44} w={44} r={22} /><div><Shimmer h={14} w="70%" /><Shimmer h={12} w="50%" style={{ marginTop: 8 }} /></div><span /></div>)}
        {data && data.items.length === 0 && (
          <div className="sub" style={{ padding: '18px 12px' }}>
            {status === 'open' ? 'Nobody needs a call right now.' : status === 'sent' ? 'No messages sent yet. Send one from To call.' : status === 'replied' ? 'No replies yet.' : 'Nobody to keep an eye on.'}
          </div>
        )}
        {data?.items.map((f) => (
          <button key={f.id} type="button" className={`li${selected === f.id ? ' on' : ''}`} onClick={() => onPick(f.id)} aria-current={selected === f.id}>
            <Avatar text={f.kid_initials} seed={f.kid_id} />
            <div style={{ minWidth: 0 }}><div className="n">{f.kid_name}</div><div className="r">{f.reason.split(' · ')[0]} · {LANG_NAME[f.language]}</div></div>
            <div className="when"><span className={`sev ${SEV_DOT[f.severity]}`} />{whenLabel(f, status)}</div>
          </button>
        ))}
      </div>
      {status === 'open' && !!data?.counts.watch && (
        <button type="button" className="li" style={{ display: 'grid' }} onClick={() => setStatus('watch')}>
          <div className="av g6">{data.counts.watch}</div>
          <div style={{ minWidth: 0 }}><div className="n" style={{ color: 'var(--ink-2)' }}>{data.counts.watch} to keep an eye on</div><div className="r">One recent miss each</div></div>
          <span className="pill ghost">View</span>
        </button>
      )}
      <div className="divider" />
      <div className="sub" style={{ fontSize: 13.5 }}>Messages are drafted the moment a sheet is saved. Nothing goes out until you tap Send.</div>
    </section>
  )
}

/* ---------------- detail ---------------- */
function Bubble({ m, today }: { m: FollowupItem['messages'][number]; today: string }) {
  const evs = m.events
  const cur = evs.length ? evs[evs.length - 1].status : m.status
  return (
    <div className={`bub ${m.direction}`}>
      {m.body}
      <div className="st">
        <span>{m.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}</span>
        {m.direction === 'out'
          ? evs.map((e, i) => <span key={i} className={e.status === cur ? 'cur' : undefined}>{i > 0 && '→ '}{EVENT_LABEL[e.status] ?? e.status} {fmtWhen(e.at, today).replace('Today ', '')}</span>)
          : <span>{fmtWhen(m.created_at, today)}</span>}
        {m.direction === 'out' && !evs.length && <span className="cur">{m.status}</span>}
      </div>
    </div>
  )
}

function Detail({ id, initial, onChanged }: { id: number; initial: FollowupItem | null; onChanged: (f: FollowupItem) => void }) {
  const { today, toast } = useApp()
  const [f, setF] = useState<FollowupItem | null>(initial)
  const [err, setErr] = useState<unknown>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [actErr, setActErr] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [form, setForm] = useState<'called' | 'replied' | null>(null)
  const [note, setNote] = useState('')
  const [savedAt, setSavedAt] = useState(0)
  const pollUntil = useRef(0)

  const load = useCallback(() => {
    setErr(null)
    api.followup(id).then(setF, setErr)
  }, [id])
  useEffect(() => {
    setF(initial); setEditing(false); setForm(null); setActErr(null); load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // live delivery receipts: poll every 2s for 20s after a send / reply
  const [polling, setPolling] = useState(false)
  useEffect(() => {
    if (!polling) return
    const t = setInterval(() => {
      if (Date.now() > pollUntil.current) { setPolling(false); return }
      api.followup(id).then((x) => { setF(x); onChanged(x) }, () => {})
    }, 2000)
    return () => clearInterval(t)
  }, [polling, id, onChanged])

  const act = async (name: string, fn: () => Promise<FollowupItem>, after?: () => void) => {
    setBusy(name); setActErr(null)
    try {
      const x = await fn()
      setF(x); onChanged(x); after?.()
    } catch (e) { setActErr(errMsg(e)) } finally { setBusy(null) }
  }
  const startPoll = () => { pollUntil.current = Date.now() + 20000; setPolling(true) }

  if (err && !f) return <ErrorState error={err} onRetry={load} />
  if (!f) return <ShimmerCard className="card detail" lines={8} tall />

  const lvl = SEV_LEVEL[f.severity]
  const isOpen = f.status === 'open'
  const lang = f.language
  const sevText = `${SEV[f.severity]} · ${prob(f.severity_confidence)} sure · based on the last 60 days${f.needs_staff_review ? ' · worth a second look' : ''}`

  return (
    <section className="card detail">
      <Link to="/calls" className="backlink pill ghost" style={{ border: '1px solid rgba(11,12,16,.12)' }}><Icon name="back" style={{ width: 14, height: 14 }} />All calls</Link>
      <div className="ph1">
        <Avatar text={f.kid_initials} seed={f.kid_id} />
        <div style={{ minWidth: 0 }}>
          <h1><Link to={`/people/kids/${f.kid_id}`}>{f.kid_name}</Link></h1>
          <div className="sub" style={{ fontSize: 16, marginTop: 2 }}>{gradeLabel(f.kid_grade)} · {f.kid_school}{f.mentor_name ? ` · Mentor ${f.mentor_name}` : ''}</div>
        </div>
        <div className="contact"><a className="btn ghost" href={`tel:${f.guardian_phone.replace(/[^\d+]/g, '')}`}><Icon name="phone" />Call {firstName(f.guardian_name)}</a></div>
      </div>

      <div className={`insight ${f.severity}`}>
        <div>
          <div className="big">{f.headline}</div>
          <div className={`meter ${f.severity}`} aria-label={`Risk ${lvl} of 4`}>{[1, 2, 3, 4].map((i) => <i key={i} className={i <= lvl ? 'on' : undefined} />)}</div>
          <div className="sub" style={{ marginTop: 8, fontSize: 13.5 }}>{sevText}</div>
        </div>
        <div className="dates">
          {f.recent.map((r) => (
            <div key={r.date} className="dt"><i className={r.mark === 'absent' ? 'a' : undefined} style={r.mark === 'unclear' ? { background: 'rgba(77,107,254,.3)' } : undefined} /><b>{fmtDay(r.date)}</b>{r.mark === 'present' ? 'here' : r.mark === 'absent' ? 'missed' : 'unclear'}</div>
          ))}
        </div>
      </div>

      <div className="composer">
        <div className="ctop">
          <span className="eyebrow" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>To {f.guardian_name} · {f.guardian_phone}{savedAt > 0 && <span key={savedAt} className="savedflash" role="status"><Icon name="check" />Saved</span>}</span>
          {isOpen && (
            <Seg<Lang> label="Message language" value={lang} onChange={(l) => l !== lang && act('lang', () => api.regenerate(f.id, l))}
              options={(['es', 'en', 'ht'] as Lang[]).map((l) => ({ value: l, label: LANG_NATIVE[l] }))} />
          )}
        </div>
        {busy === 'lang' || busy === 'rewrite' ? (
          <div aria-busy="true"><div className="sub" style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center' }}><span className="spin dk" />Writing it again from the real facts…</div><Shimmer h={16} /><Shimmer h={16} style={{ marginTop: 10 }} /><Shimmer h={16} w="70%" style={{ marginTop: 10 }} /></div>
        ) : editing ? (
          <>
            <textarea className="inplace" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Edit message" autoFocus
              onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && draft.trim()) void act('edit', () => api.editDraft(f.id, draft.trim()), () => { setEditing(false); setSavedAt(Date.now()) }) }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
              <button className="btn dark sm" disabled={!draft.trim() || busy === 'edit'} onClick={() => act('edit', () => api.editDraft(f.id, draft.trim()), () => { setEditing(false); setSavedAt(Date.now()) })}>{busy === 'edit' ? <><span className="spin" />Saving…</> : 'Save message'}</button>
              <button className="btn ghost sm" onClick={() => setEditing(false)}>Cancel</button>
              <span className="sub" style={{ fontSize: 12.5 }}>⌘↵ saves</span>
            </div>
          </>
        ) : (
          <div key={savedAt} className={`msg${savedAt > 0 ? ' justsaved' : ''}`}><Highlighted text={f.draft_text} marks={f.draft_highlights} /></div>
        )}
        {f.draft_translation && !editing && busy !== 'lang' && busy !== 'rewrite' && (
          <div className="trans"><b style={{ color: 'var(--ink-2)' }}>In English:</b> {f.draft_translation}</div>
        )}
        <div className="facts">
          {f.facts.map((x, i) => (
            <span key={i} className="fact"><span className="src"><Icon name={FACT_ICON[x.kind] ?? 'sheet'} /></span>{x.label} {x.source && <small>{x.source}</small>}</span>
          ))}
        </div>
      </div>

      {actErr && <div className="notice bad" role="alert" style={{ marginTop: 14, marginBottom: 0 }}>{actErr}</div>}

      {isOpen && !editing && (
        <div className="sendbar">
          <button className="btn dark lg" disabled={!!busy} onClick={() => act('send', () => api.send(f.id, 'whatsapp'), () => { startPoll(); toast('Sent to the WhatsApp sandbox') })}>
            {busy === 'send' ? <span className="spin" /> : <Icon name="msg" />}Send on WhatsApp
          </button>
          <button className="btn ghost" disabled={!!busy} onClick={() => act('sms', () => api.send(f.id, 'sms'), startPoll)}>{busy === 'sms' ? <span className="spin dk" /> : null}Send SMS</button>
          <button className="btn ghost" disabled={!!busy} onClick={() => { setForm('called'); setNote('') }}><Icon name="phone" />I called instead</button>
          <button className="btn ghost" disabled={!!busy} onClick={() => act('rewrite', () => api.regenerate(f.id))}><Icon name="spark" />Rewrite</button>
          <button className="btn ghost sm" disabled={!!busy} onClick={() => { setDraft(f.draft_text); setEditing(true) }}><Icon name="pen" />Edit</button>
          <button className="btn ghost sm" disabled={!!busy} onClick={() => act('nn', () => api.notNeeded(f.id))}>Not needed</button>
          <span className="sandbox" style={{ marginLeft: 'auto' }}><Icon name="info" style={{ width: 14, height: 14 }} />Sandbox: WhatsApp Business API</span>
        </div>
      )}

      {form && (
        <div className="inline-form">
          <label className="field">
            {form === 'called' ? 'What did they say? (optional)' : 'What did they reply? (optional)'}
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn dark sm" disabled={!!busy} onClick={() => act(form, () => (form === 'called' ? api.called(f.id, note.trim() || undefined) : api.replied(f.id, note.trim() || undefined)), () => { setForm(null); if (form === 'replied') startPoll() })}>
              {busy ? <span className="spin" /> : null}{form === 'called' ? 'Log the call' : 'Log the reply'}
            </button>
            <button className="btn ghost sm" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </div>
      )}

      {f.status === 'closed' && <div className="statusband">Closed{f.replied_at ? ` · ${fmtWhen(f.replied_at, today)}` : ''}. This family was reached.</div>}
      {f.status === 'not_needed' && <div className="statusband" style={{ background: 'rgba(11,12,16,.05)' }}>Marked not needed. It stays in the record.</div>}

      {f.messages.length > 0 && (
        <div className="thread" aria-live="polite">
          {f.messages.map((m) => <Bubble key={m.id} m={m} today={today} />)}
          {polling && <div className="sub" style={{ fontSize: 13, alignSelf: 'flex-end', display: 'flex', gap: 6, alignItems: 'center' }}><span className="spin dk" style={{ width: 12, height: 12 }} />Watching for delivery receipts…</div>}
        </div>
      )}

      {f.status === 'sent' && !form && (
        <div className="sendbar">
          <button className="btn dark" onClick={() => { setForm('replied'); setNote('') }}><Icon name="text" />They replied</button>
          <a className="btn ghost" href={`tel:${f.guardian_phone.replace(/[^\d+]/g, '')}`}><Icon name="phone" />Call {firstName(f.guardian_name)}</a>
          <span className="sandbox" style={{ marginLeft: 'auto' }}><Icon name="info" style={{ width: 14, height: 14 }} />Sandbox: WhatsApp Business API</span>
        </div>
      )}

      <div className="tl">
        <div className="p"><b><span className="sev g" />Drafted</b>{fmtWhen(f.created_at, today)}</div><span className="bar" />
        <div className={`p${f.sent_at ? '' : ' dim'}`}><b><span className={`sev ${f.sent_at ? 'g' : 'w'}`} />Sent</b>{f.sent_at ? fmtWhen(f.sent_at, today) : f.status === 'closed' ? 'Called instead' : 'Waiting on you'}</div><span className="bar" />
        <div className={`p${f.replied_at ? '' : ' dim'}`}><b><span className={`sev ${f.replied_at ? 'g' : 'w'}`} />Reply</b>
          {f.replied_at ? fmtWhen(f.replied_at, today) : f.reminder_at ? `Reminder ${fmtWeekday(f.reminder_at)} if no answer` : 'No reply yet'}</div>
      </div>
    </section>
  )
}

export default function Calls() {
  const { id: idParam } = useParams()
  const [sp] = useSearchParams()
  const status = (['open', 'sent', 'replied', 'watch'].includes(sp.get('status') ?? '') ? sp.get('status') : 'open') as Status
  const id = idParam ? Number(idParam) : null
  const nav = useNavigate()
  const phone = useIsPhone()
  const { refreshCounts } = useApp()
  const [data, setData] = useState<CallsResponse | null>(null)
  const [err, setErr] = useState<unknown>(null)

  const load = useCallback(() => {
    setErr(null)
    api.calls(status).then(setData, setErr)
  }, [status])
  useEffect(() => { setData(null); load() }, [load])

  // desktop: open the first one automatically
  useEffect(() => {
    if (!phone && !id && data?.items.length) nav(`/calls/${data.items[0].id}${status !== 'open' ? `?status=${status}` : ''}`, { replace: true })
  }, [phone, id, data, nav, status])

  const setStatus = (s: Status) => {
    nav(`/calls${s === 'open' ? '' : `?status=${s}`}`)
  }
  const pick = (fid: number) => nav(`/calls/${fid}${status !== 'open' ? `?status=${status}` : ''}`)
  const onChanged = useCallback((x: FollowupItem) => {
    setData((d) => (d ? { ...d, items: d.items.map((i) => (i.id === x.id ? x : i)) } : d))
    api.calls(status).then((r) => setData((d) => (d ? { ...d, counts: r.counts } : r)), () => {})
    refreshCounts()
  }, [status, refreshCounts])

  return (
    <div className={`split${id ? '' : ' no-detail'}`}>
      {err && !data ? <ErrorState error={err} onRetry={load} /> : <Inbox data={data} status={status} setStatus={setStatus} selected={id} onPick={pick} />}
      {id ? (
        <Detail key={id} id={id} initial={data?.items.find((x) => x.id === id) ?? null} onChanged={onChanged} />
      ) : (
        <section className="card detail">
          {data && data.items.length === 0
            ? <div className="state"><div className="title">All caught up.</div><div className="sub">No families waiting in this list.</div><Link className="btn dark sm" to="/today">Back to Today</Link></div>
            : <ShimmerCard className="" lines={6} tall />}
        </section>
      )}
    </div>
  )
}
