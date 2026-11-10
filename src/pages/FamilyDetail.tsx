import { useState } from 'react'
import { Link, useParams } from 'react-router'
import type { FamilyDetail as FD, Lang, Ripple } from '../../shared/types'
import { api } from '../api'
import { Lightbox } from '../components/Photo'
import { InlineEdit, useFlash, useRipple } from '../components/Ripple'
import { Avatar, ErrorState, Icon, Seg, ShimmerCard, useApi, type IconName } from '../components/ui'
import { LANG_NAME, LANG_SHORT, PROGRAM, SEV, firstName, fmtDay, gradeLabel, initials, prob, word } from '../format'

const SRC_ICON: Record<FD['sources'][number]['kind'], IconName> = { form: 'form', sheet: 'sheet', text: 'text' }
const FU_DOT: Record<string, string> = { urgent: 'r', call: 'o', watch: '', fine: 'g' }

function Flow({ n }: { n: number }) {
  const ys = Array.from({ length: n }, (_, i) => ((i + 0.5) * 300) / n)
  const d = ys.map((y) => (Math.abs(y - 150) < 1 ? `M0 ${y} L110 150` : `M0 ${y} C60 ${y},50 150,110 150`)).join(' ')
  return (
    <svg className="flow" viewBox="0 0 110 300" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} stroke="rgba(77,107,254,.6)" strokeWidth="2" fill="none" strokeDasharray="4 5" />
    </svg>
  )
}

export default function FamilyDetail() {
  const { id } = useParams()
  const f = useApi(() => api.family(Number(id)), [id])
  const [open, setOpen] = useState<number | null>(null)
  const { run } = useRipple()
  const { flash, cls } = useFlash()

  if (f.error) return <ErrorState error={f.error} onRetry={f.reload} />
  if (!f.data) return <><div className="crumb">People › Families</div><ShimmerCard className="card" lines={6} tall /></>
  const d = f.data
  const n = d.sources.length
  const src = open !== null ? d.sources[open] : null
  const short = d.household_name.replace(/\s+family$/i, '')
  const openFollowup = d.followups.find((x) => x.status === 'open' || x.status === 'sent')

  /** optimistic edit → PATCH → ripple → quiet refetch */
  const save = (body: Parameters<typeof api.patchFamily>[1], optimistic: Partial<FD>, keys: string[], extra: Ripple[] = []) => {
    const prev = d
    f.setData({ ...d, ...optimistic })
    void run(() => api.patchFamily(d.id, body), { extra }).then((res) => {
      if (!res) { f.setData(prev); return }
      flash(keys)
      api.family(d.id).then((x) => f.setData(x), () => {})
    })
  }
  const setLang = (l: Lang) => {
    if (l === d.language) return
    const extra: Ripple[] = openFollowup
      ? [{ kind: 'calls', label: 'Open draft rewritten', from: '', to: `${firstName(openFollowup.kid_name)}'s message`, href: `/calls/${openFollowup.id}` }]
      : []
    save({ language: l }, { language: l }, ['lang'], extra)
  }

  return (
    <>
      <div className="crumb"><Link to="/people">People</Link> <span>›</span> <Link to="/people?tab=families">Families</Link> <span>›</span> <b style={{ color: 'var(--ink)' }}>{short}</b></div>
      <section className="card">
        <div className="head" style={{ alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: 40 }}>{n > 1 ? `One family, found in ${word(n, true)} places.` : 'One family, one record.'}</h1>
            <div className="sub" style={{ fontSize: 17, marginTop: 6 }}>{n > 1 ? 'Nobody typed this family twice. AttendClear connected the spellings.' : 'Every mention of this family points here.'}</div>
          </div>
        </div>
        <div className="merge">
          <div className="srcs">
            {d.sources.map((s, i) => {
              const inner = (
                <>
                  <span className="ic"><Icon name={SRC_ICON[s.kind] ?? 'sheet'} /></span>
                  <div style={{ minWidth: 0 }}><div className="k">{s.label} · {fmtDay(s.date)}</div><div className={`v${s.kind === 'sheet' ? ' hand' : ''}`}>{s.raw_text}</div></div>
                  <div className="p">{s.first ? <>First seen<small>original</small></> : <>{prob(s.probability)}<small>same person</small></>}</div>
                </>
              )
              return s.photo_url
                ? <button key={i} type="button" className="srccard" onClick={() => setOpen(i)} aria-label={`Open the ${s.label} photo`}>{inner}</button>
                : <div key={i} className="srccard">{inner}</div>
            })}
          </div>
          <Flow n={Math.max(1, n)} />
          <div className="one">
            <div className="av">{initials(d.guardian_name)}</div>
            <h2>{/family$/i.test(d.household_name) ? d.household_name : `${d.household_name} family`}</h2>
            <div className="m">{firstName(d.guardian_name)} · {LANG_NAME[d.language]} · {d.neighborhood}<br />{n} {n === 1 ? 'spelling' : 'spellings'}, 1 record</div>
            <div className="kids">
              {d.kids.map((k) => (
                <Link key={k.id} to={`/people/kids/${k.id}`} className="kid"><b>{firstName(k.name)}</b>{gradeLabel(k.grade).replace(' grade', '')} · {k.school}</Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="bento" style={{ marginTop: 18 }}>
        {d.school_changes.map((c, i) => (
          <section key={i} className="card s7">
            <div className="head"><div className="title">{firstName(c.kid_name)} changed schools</div><span className="pill wash">Counted once in the report</span></div>
            <div className="hist">
              <div className="school"><small>Until {fmtDay(c.changed_at)}</small><b>{c.from_school}</b></div>
              <div style={{ textAlign: 'center', color: 'var(--ink-4)', fontSize: 22 }}>→</div>
              <div className="school" style={{ background: '#fff', boxShadow: '0 0 0 2px var(--blue) inset' }}><small>Since {fmtDay(c.changed_at)}</small><b>{c.to_school}</b></div>
            </div>
            {c.note && <div className="sub" style={{ marginTop: 14 }}>{c.note}</div>}
          </section>
        ))}
        <section className={`card ${d.school_changes.length ? 's5' : 's7'}`}>
          <div className="title">Follow-ups</div>
          <div className="events">
            {d.followups.length === 0 && d.contacts.length === 0 && <div className="sub">No follow-ups for this family.</div>}
            {d.followups.map((x) => (
              <Link key={`f${x.id}`} to={`/calls/${x.id}`} className="ev"><span className={`d ${FU_DOT[x.severity] ?? ''}`} /><div className="t">{firstName(x.kid_name)} · {SEV[x.severity]}<span>{x.summary}</span></div><span className="w">{fmtDay(x.date)}</span></Link>
            ))}
            {d.contacts.map((c, i) => (
              <div key={`c${i}`} className="ev"><span className="d g" /><div className="t">{c.kind === 'call' ? 'Called the family' : c.kind === 'reply' ? 'Family replied' : 'Note'}<span>{c.body}</span></div><span className="w">{fmtDay(c.date)}</span></div>
            ))}
          </div>
        </section>
        <section className={`card ${d.school_changes.length ? 's12' : 's5'}`}>
          <div className="head"><div className="title">Contact</div><span className="pill wash" style={{ height: 26, fontSize: 12 }}>Tap to edit</span></div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 14 }}>
            <Avatar text={initials(d.guardian_name)} seed={d.id + 4} />
            <div style={{ minWidth: 0 }}>
              <InlineEdit as="b" value={d.guardian_name} label="Guardian name" className={cls('name')} onSave={(v) => save({ primary_contact_name: v }, { guardian_name: v }, ['name'])} />
              <div className="sub">{d.relationship} · {LANG_NAME[d.language]}</div>
            </div>
          </div>
          <div className="divider" />
          <div className="head"><span className="sub">Phone</span>
            <InlineEdit as="b" value={d.phone} label="Phone" className={`num ${cls('phone') ?? ''}`.trim()} onSave={(v) => save({ phone: v }, { phone: v }, ['phone'])}
              display={<a className="num" style={{ fontWeight: 700 }} href={`tel:${d.phone.replace(/[^\d+]/g, '')}`}>{d.phone}</a>} />
          </div>
          <div className="head" style={{ marginTop: 10 }}><span className="sub">Message language</span>
            <span className={cls('lang')}>
              <Seg<Lang> label="Message language" value={d.language} onChange={setLang} options={(['en', 'es', 'ht'] as Lang[]).map((l) => ({ value: l, label: LANG_SHORT[l] }))} />
            </span>
          </div>
          {openFollowup && <div className="sub" style={{ fontSize: 12.5, marginTop: 6, textAlign: 'right' }}>Changing the language rewrites {firstName(openFollowup.kid_name)}'s open draft.</div>}
          {d.email && <div className="head" style={{ marginTop: 10 }}><span className="sub">Email</span><b>{d.email}</b></div>}
          <div className="head" style={{ marginTop: 10 }}><span className="sub">Address</span><b style={{ textAlign: 'right' }}>{d.address}</b></div>
          <div className="head" style={{ marginTop: 10 }}><span className="sub">Kids</span><b style={{ textAlign: 'right' }}>{d.kids.map((k) => `${firstName(k.name)} (${PROGRAM[k.program as keyof typeof PROGRAM] ?? k.program})`).join(', ')}</b></div>
        </section>
      </div>

      {src && src.photo_url && (
        <Lightbox src={src.photo_url} alt={`${src.label}, ${fmtDay(src.date)}`} bbox={src.bbox} title={`${src.label} · ${fmtDay(src.date)}`}
          caption={<>Written as <b style={{ color: 'var(--ink)' }}>{src.raw_text}</b>{src.probability !== null ? ` · ${prob(src.probability)} same person` : ''}</>} onClose={() => setOpen(null)} />
      )}
    </>
  )
}
