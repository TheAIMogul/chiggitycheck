import { Link, useParams } from 'react-router'
import { api } from '../api'
import { Avatar, ErrorState, Icon, ShimmerCard, useApi } from '../components/ui'
import { PROGRAM, fmtDow, hrs, plural } from '../format'

const SOURCE: Record<string, string> = { sheet: 'Sign-in sheet', text: 'Text message', form: 'Hours form', seed: 'Spreadsheet' }

export default function MentorDetail() {
  const { id } = useParams()
  const m = useApi(() => api.mentor(Number(id)), [id])
  if (m.error) return <ErrorState error={m.error} onRetry={m.reload} />
  if (!m.data) return <><div className="crumb">People › Mentors</div><ShimmerCard className="card white" lines={3} tall /></>
  const d = m.data
  const counted = d.entries.filter((e) => e.status === 'counted')

  return (
    <>
      <div className="crumb"><Link to="/people">People</Link> <span>›</span> <Link to="/people?tab=mentors">Mentors</Link> <span>›</span> <b style={{ color: 'var(--ink)' }}>{d.name}</b></div>
      <section className="card white" style={{ padding: 32 }}>
        <div className="hero">
          <Avatar text={d.initials} seed={d.id + 1} />
          <div><h1>{d.name}</h1><div className="meta">Mentor · {plural(d.kids.length, 'kid')} · {plural(d.sessions, 'session')} this quarter</div></div>
          {d.phone && <div className="acts" style={{ display: 'flex', gap: 10 }}><a className="btn ghost" href={`tel:${d.phone.replace(/[^\d+]/g, '')}`}><Icon name="phone" />Call {d.name.split(' ')[0]}</a></div>}
        </div>
        <div className="stats4">
          <div><b className="num">{hrs(d.hours)} h</b><span>Volunteer hours</span></div>
          <div><b className="num">{counted.length}</b><span>Entries counted</span></div>
          <div><b className="num">{d.dupes}</b><span>{d.dupes === 1 ? 'Double report removed' : 'Double reports removed'}</span></div>
          <div><b className="num">{d.kids.length}</b><span>Kids matched</span></div>
        </div>
      </section>

      <div className="bento" style={{ marginTop: 18 }}>
        <section className="card s4">
          <div className="title">Kids matched</div>
          <div className="list" style={{ marginTop: 6 }}>
            {d.kids.length === 0 && <div className="sub" style={{ padding: '12px 0' }}>No kids matched yet.</div>}
            {d.kids.map((k) => (
              <Link key={k.id} to={`/people/kids/${k.id}`} className="li" style={{ gridTemplateColumns: '36px minmax(0,1fr) auto' }}>
                <Avatar text={k.name.split(' ').map((p) => p[0]).slice(0, 2).join('')} seed={k.id} size={36} />
                <div className="n">{k.name}</div>
                <Icon name="arrow" style={{ color: 'var(--ink-4)' }} />
              </Link>
            ))}
          </div>
        </section>
        <section className="card s8">
          <div className="head"><div className="title">Hours this quarter</div>{d.dupes > 0 && <span className="pill wash">Reported twice, counted once</span>}</div>
          <div className="tablewrap">
            <table className="hours">
              <thead><tr><th>Date</th><th>Where</th><th>Reported by</th><th className="num">Hours</th></tr></thead>
              <tbody>
                {d.entries.map((e) => (
                  <tr key={e.id} className={e.status === 'duplicate' ? 'dupe' : undefined}>
                    <td className="s">{fmtDow(e.date)}</td>
                    <td className="s">{e.site}<div className="sub" style={{ fontSize: 13 }}>{PROGRAM[e.program]}</div></td>
                    <td>
                      <span className="s" style={e.status === 'duplicate' ? { textDecoration: 'line-through' } : undefined}>{SOURCE[e.source] ?? e.source}</span>
                      {e.raw_text && <div className="sub" style={{ fontSize: 13, fontFamily: 'ui-monospace,"SF Mono",Menlo,monospace' }}>"{e.raw_text}"</div>}
                      {e.status === 'duplicate' && <div style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600, marginTop: 2 }}>{e.note || 'Reported twice, counted once'}</div>}
                    </td>
                    <td className="num s">{hrs(e.hours)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={3}><b>Counted</b></td><td className="num"><b>{hrs(d.hours)} h</b></td></tr></tfoot>
            </table>
          </div>
        </section>
      </div>
    </>
  )
}
