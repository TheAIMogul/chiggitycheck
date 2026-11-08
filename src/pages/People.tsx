import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { ImportResult, KidListItem, Program, SignupItem } from '../../shared/types'
import { api, errMsg } from '../api'
import { useApp } from '../components/AppContext'
import { Avatar, EmptyState, ErrorState, Icon, Seg, SevPill, Shimmer, Strip, useApi, useDebounced } from '../components/ui'
import { LANG_NAME, LANG_SHORT, PROGRAM, fmtDay, fmtWhen, gradeLabel, hrs, initials, pct, plural, prob } from '../format'

type Tab = 'kids' | 'families' | 'mentors' | 'signups'

function ListSkeleton() {
  return (
    <div className="list plist">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="li"><Shimmer h={44} w={44} r={22} /><div><Shimmer h={15} w="40%" /><Shimmer h={12} w="60%" style={{ marginTop: 8 }} /></div><Shimmer h={14} w={60} /></div>
      ))}
    </div>
  )
}

/* ---------------- kids ---------------- */
function Kids() {
  const [sp, setSp] = useSearchParams()
  const [q, setQ] = useState(sp.get('q') ?? '')
  const dq = useDebounced(q.trim(), 250)
  const program = sp.get('program') ?? ''
  const site = sp.get('site') ?? ''
  const flag = sp.get('flag') ?? ''
  const [sites, setSites] = useState<string[]>([])
  const kids = useApi(() => api.kids({ q: dq, program, site, flag }), [dq, program, site, flag])

  useEffect(() => {
    api.kids({}).then((all: KidListItem[]) => setSites([...new Set(all.map((k) => k.site))].filter(Boolean).sort()), () => {})
  }, [])
  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(sp)
    if (v) n.set(k, v); else n.delete(k)
    setSp(n, { replace: true })
  }

  return (
    <section className="card">
      <div className="searchbox">
        <Icon name="search" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search any spelling, like Dariel Rmz" aria-label="Search kids" />
        {kids.loading && <span className="spin dk" />}
      </div>
      <div className="filters" role="group" aria-label="Filters">
        <button className={`pill${!program ? ' on' : ''}`} onClick={() => setParam('program', '')}>All programs</button>
        {(Object.keys(PROGRAM) as Program[]).map((p) => (
          <button key={p} className={`pill${program === p ? ' on' : ''}`} aria-pressed={program === p} onClick={() => setParam('program', program === p ? '' : p)}>{PROGRAM[p]}</button>
        ))}
        <span style={{ width: 1, height: 22, background: 'var(--line)' }} />
        {sites.map((s) => (
          <button key={s} className={`pill${site === s ? ' on' : ''}`} aria-pressed={site === s} onClick={() => setParam('site', site === s ? '' : s)}>{s}</button>
        ))}
        <span style={{ width: 1, height: 22, background: 'var(--line)' }} />
        <button className={`pill${flag === 'call' ? ' on' : ''}`} aria-pressed={flag === 'call'} onClick={() => setParam('flag', flag === 'call' ? '' : 'call')}><span className="sev u" />Needs a call</button>
      </div>
      <div style={{ marginTop: 10 }}>
        {kids.error ? <ErrorState error={kids.error} onRetry={kids.reload} inCard={false} />
          : !kids.data ? <ListSkeleton />
          : kids.data.length === 0 ? <EmptyState text={dq ? `Nobody matches "${dq}".` : 'No kids match these filters.'} action={<button className="btn ghost sm" onClick={() => { setQ(''); setSp({ tab: 'kids' }, { replace: true }) }}>Clear filters</button>} />
          : (
            <div className="list plist">
              <div className="sub" style={{ fontSize: 13, padding: '4px 10px' }}>{plural(kids.data.length, 'kid')}</div>
              {kids.data.map((k) => (
                <Link key={k.id} to={`/people/kids/${k.id}`} className="li">
                  <Avatar text={k.initials} seed={k.id} />
                  <div style={{ minWidth: 0 }}>
                    <div className="n">{k.name} <span className="lang">{LANG_SHORT[k.language]}</span></div>
                    <div className="r">{gradeLabel(k.grade)} · {k.school} · {PROGRAM[k.program]}{k.mentor ? ` · mentor ${k.mentor}` : ''}{k.status === 'changed_school' ? ' · changed schools' : k.status === 'exited' ? ' · exited' : ''}</div>
                    {k.matched_alias && <div className="matchedas">matched: {k.matched_alias}</div>}
                    <Strip dots={k.strip} />
                  </div>
                  <div className="side">
                    <b className="num">{pct(k.rate)}</b>
                    <span>{k.last_seen ? `last here ${fmtDay(k.last_seen)}` : 'not seen yet'}</span>
                    <SevPill severity={k.severity && k.severity !== 'fine' ? k.severity : null} />
                  </div>
                </Link>
              ))}
            </div>
          )}
      </div>
    </section>
  )
}

/* ---------------- families ---------------- */
function Families() {
  const fams = useApi(api.families, [])
  if (fams.error) return <ErrorState error={fams.error} onRetry={fams.reload} />
  return (
    <section className="card">
      {!fams.data ? <ListSkeleton /> : fams.data.length === 0 ? <EmptyState text="No families yet." action={<Link className="btn dark sm" to="/signup">Sign up a family</Link>} /> : (
        <div className="list plist">
          {fams.data.map((f) => (
            <Link key={f.id} to={`/people/families/${f.id}`} className="li">
              <Avatar text={initials(f.guardian_name)} seed={f.id + 2} />
              <div style={{ minWidth: 0 }}>
                <div className="n">{f.household_name} <span className="lang">{LANG_SHORT[f.language]}</span></div>
                <div className="r">{f.guardian_name} · {f.kids.join(', ') || 'no kids yet'}</div>
              </div>
              <div className="side">
                {f.alias_count > 1 && <span className="pill wash" style={{ height: 26 }}>{f.alias_count} spellings, 1 record</span>}
                {f.open_followup && <span className="pill" style={{ color: 'var(--urgent)', background: 'rgba(229,72,77,.10)', height: 26 }}>Call open</span>}
                <span>{f.phone}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

/* ---------------- mentors ---------------- */
function Mentors() {
  const ms = useApi(api.mentors, [])
  if (ms.error) return <ErrorState error={ms.error} onRetry={ms.reload} />
  const total = ms.data?.reduce((a, m) => a + m.hours, 0) ?? 0
  const dupes = ms.data?.reduce((a, m) => a + m.dupes, 0) ?? 0
  return (
    <section className="card">
      {ms.data && (
        <div className="head" style={{ padding: '0 10px 8px' }}>
          <span className="sub">{plural(ms.data.length, 'mentor')} · {hrs(total)} hours this quarter</span>
          {dupes > 0 && <span className="pill wash">{plural(dupes, 'double report')} counted once</span>}
        </div>
      )}
      {!ms.data ? <ListSkeleton /> : ms.data.length === 0 ? <EmptyState text="No mentors yet." /> : (
        <div className="list plist">
          {ms.data.map((m) => (
            <Link key={m.id} to={`/people/mentors/${m.id}`} className="li">
              <Avatar text={m.initials} seed={m.id + 1} />
              <div style={{ minWidth: 0 }}>
                <div className="n">{m.name}</div>
                <div className="r">{m.kids.length ? `Mentors ${m.kids.map((k) => k.name.split(' ')[0]).join(', ')}` : 'No kids matched yet'} · {plural(m.sessions, 'session')}</div>
              </div>
              <div className="side">
                <b className="num">{hrs(m.hours)} h</b>
                {m.dupes > 0 && <span className="pill wash" style={{ height: 24, fontSize: 12 }}>Reported twice, counted once</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

/* ---------------- sign-ups ---------------- */
function StatusPill({ s, p, to }: { s: SignupItem['status']; p: number | null; to: string | null }) {
  if (s === 'linked') return <span className="pill" style={{ color: 'var(--good)', background: 'rgba(47,163,107,.12)', height: 26 }}>Linked{to ? ` to ${to}` : ''}{p !== null ? ` · ${prob(p)}` : ''}</span>
  if (s === 'new') return <span className="pill wash" style={{ height: 26 }}>New family</span>
  return <span className="pill" style={{ color: '#B86A1E', background: 'rgba(240,150,60,.14)', height: 26 }}>Check this{p !== null ? ` · ${prob(p)}` : ''}</span>
}

function Signups() {
  const { today } = useApp()
  const list = useApi(api.signups, [])
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<ImportResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const doImport = async (f: File | undefined) => {
    if (!f) return
    setBusy(true); setErr(null); setRes(null)
    try { setRes(await api.importCsv(f)); list.reload(true) } catch (e) { setErr(errMsg(e)) } finally { setBusy(false); if (file.current) file.current.value = '' }
  }
  return (
    <>
      <section className="card" style={{ marginBottom: 18 }}>
        <div className="head">
          <div><div className="title">Bring your lists</div><div className="sub">Drop in a program spreadsheet or a form export. Families we already know are linked, not added twice.</div></div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn dark sm" onClick={() => file.current?.click()} disabled={busy}>{busy ? <span className="spin" /> : <Icon name="upload" />}Import a spreadsheet (CSV)</button>
            <Link className="btn ghost sm" to="/signup">Open the public sign-up form</Link>
          </div>
          <input ref={file} type="file" accept=".csv,text/csv" className="sr" onChange={(e) => doImport(e.target.files?.[0])} aria-label="CSV file" />
        </div>
        {err && <div className="notice bad" style={{ marginTop: 14, marginBottom: 0 }}>{err}</div>}
        {res && (
          <div style={{ marginTop: 16 }}>
            <div className="dq" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
              <div><b className="num">{res.rows}</b><span>Rows read</span></div>
              <div><b className="num">{res.linked}</b><span>Linked to a family we know</span></div>
              <div><b className="num">{res.created}</b><span>New families</span></div>
              <div><b className="num">{res.review}</b><span>Need a look</span></div>
            </div>
            <div className="tablewrap">
              <table className="hours">
                <thead><tr><th>Row</th><th>Kid</th><th>Guardian</th><th>Result</th></tr></thead>
                <tbody>
                  {res.results.map((r) => (
                    <tr key={r.row}><td className="num" style={{ textAlign: 'left' }}>{r.row}</td><td>{r.kid}</td><td>{r.guardian}</td><td><StatusPill s={r.status} p={r.probability} to={r.matched_to} /></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
      <section className="card">
        <div className="title" style={{ fontSize: 19 }}>Sign-ups</div>
        {list.error ? <ErrorState error={list.error} onRetry={list.reload} inCard={false} /> : !list.data ? <ListSkeleton /> : list.data.length === 0 ? (
          <EmptyState text="No sign-ups yet." action={<Link className="btn dark sm" to="/signup">Open the sign-up form</Link>} />
        ) : (
          <div className="list plist">
            {list.data.map((s) => {
              const to = s.kid_id ? `/people/kids/${s.kid_id}` : s.family_id ? `/people/families/${s.family_id}` : null
              const body = (
                <>
                  <Avatar text={initials(s.guardian)} seed={s.id} />
                  <div style={{ minWidth: 0 }}>
                    <div className="n">{s.kid} {s.language && <span className="lang">{LANG_SHORT[s.language]}</span>}</div>
                    <div className="r">{s.guardian}{s.phone ? ` · ${s.phone}` : ''} · {s.source} · {fmtWhen(s.received_at, today)}</div>
                  </div>
                  <div className="side"><StatusPill s={s.status} p={s.resolve_probability} to={s.matched_to} />{s.language && <span>{LANG_NAME[s.language]}</span>}</div>
                </>
              )
              return to ? <Link key={s.id} to={to} className="li">{body}</Link> : <div key={s.id} className="li">{body}</div>
            })}
          </div>
        )}
      </section>
    </>
  )
}

export default function People() {
  const [sp, setSp] = useSearchParams()
  const tab = (['kids', 'families', 'mentors', 'signups'].includes(sp.get('tab') ?? '') ? sp.get('tab') : 'kids') as Tab
  return (
    <>
      <div className="crumb">People</div>
      <div className="tabs">
        <h1>{{ kids: 'Kids', families: 'Families', mentors: 'Mentors', signups: 'Sign-ups' }[tab]}</h1>
        <Seg<Tab> label="People" value={tab} onChange={(t) => setSp({ tab: t })} options={[
          { value: 'kids', label: 'Kids' }, { value: 'families', label: 'Families' }, { value: 'mentors', label: 'Mentors' }, { value: 'signups', label: 'Sign-ups' },
        ]} />
      </div>
      {tab === 'kids' && <Kids />}
      {tab === 'families' && <Families />}
      {tab === 'mentors' && <Mentors />}
      {tab === 'signups' && <Signups />}
    </>
  )
}
