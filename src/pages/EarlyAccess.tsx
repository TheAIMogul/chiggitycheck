import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { api, errMsg, type TesterForm } from '../api'
import { Brand } from '../components/Chrome'
import { Icon } from '../components/ui'

const LAUNCH = 'November 17'
const EMPTY: TesterForm = { name: '', email: '', organization: '', role: '', org_type: '', people_served: '', phone: '', notes: '', website: '' }

export default function EarlyAccess() {
  const [f, setF] = useState<TesterForm>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<{ position: number; returning: boolean } | null>(null)
  const [count, setCount] = useState<number | null>(null)
  const set = <K extends keyof TesterForm>(k: K, v: TesterForm[K]) => setF((p) => ({ ...p, [k]: v }))

  useEffect(() => { document.title = 'Early testers · AttendClear'; api.testerCount().then((r) => setCount(r.count), () => {}) }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const r = await api.joinTesters(f)
      setDone(r); window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (x) { setErr(errMsg(x)) } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="wtop"><Brand to="/today" /><nav><Link to="/today">See the demo</Link></nav></div>
      <div className="signup ea">
        {done ? (
          <section className="card white" style={{ padding: 32 }}>
            <div className="trace" style={{ marginTop: 0 }}><span className="c"><Icon name="check" style={{ width: 16, height: 16, strokeWidth: 2.6 }} /></span><span><b>{done.returning ? 'Your details are updated.' : 'You\'re on the list.'}</b></span></div>
            <h1 style={{ fontSize: 36, marginTop: 18, lineHeight: 1.1 }}>{done.position ? <>You're early tester #{done.position}.</> : 'Thanks for signing up.'}</h1>
            <p className="sub" style={{ fontSize: 17, marginTop: 10 }}>AttendClear launches {LAUNCH}. We'll email {f.email} with your invite and set up your first sign-in sheet with you.</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
              <Link className="btn dark" to="/today">Back to the demo</Link>
            </div>
          </section>
        ) : (
          <section className="card white" style={{ padding: 32 }}>
            <div className="ea-kicker">Launching {LAUNCH}</div>
            <h1 style={{ fontSize: 36, lineHeight: 1.1, marginTop: 8 }}>Become an early tester</h1>
            <p className="sub" style={{ fontSize: 17, margin: '10px 0 0' }}>Snap your paper sign-in sheets and know who to call before anyone falls through. Early testers get free access, setup help from our team, and a say in what we build next.</p>
            {!!count && count >= 5 && <p className="sub" style={{ fontSize: 14, marginTop: 10 }}>{count} organizations have already signed up.</p>}
            <form onSubmit={submit} style={{ marginTop: 26 }}>
              <div className="two">
                <label className="field">Your name<input required autoComplete="name" value={f.name} onChange={(e) => set('name', e.target.value)} /></label>
                <label className="field">Work email<input required type="email" autoComplete="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></label>
              </div>
              <div className="two">
                <label className="field">Organization<input required autoComplete="organization" value={f.organization} onChange={(e) => set('organization', e.target.value)} /></label>
                <label className="field">Your role (optional)<input autoComplete="organization-title" value={f.role} onChange={(e) => set('role', e.target.value)} placeholder="Program director" /></label>
              </div>
              <div className="two">
                <label className="field">Type of organization
                  <select value={f.org_type} onChange={(e) => set('org_type', e.target.value)}>
                    <option value="">Choose one</option>
                    <option value="youth">Youth program</option>
                    <option value="adult">Adult or workforce program</option>
                    <option value="school">School or after-school</option>
                    <option value="community">Community or faith-based</option>
                    <option value="health">Health or social services</option>
                    <option value="other">Something else</option>
                  </select>
                </label>
                <label className="field">People you serve each week
                  <select value={f.people_served} onChange={(e) => set('people_served', e.target.value)}>
                    <option value="">Choose one</option>
                    <option value="1-50">Under 50</option>
                    <option value="50-200">50 to 200</option>
                    <option value="200-1000">200 to 1,000</option>
                    <option value="1000+">More than 1,000</option>
                  </select>
                </label>
              </div>
              <label className="field">Phone (optional)<input type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></label>
              <label className="field">How do you track attendance today? (optional)<textarea rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Paper sheets, a spreadsheet, a database…" /></label>
              <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={(e) => set('website', e.target.value)} name="website" />
              {err && <div className="notice bad" role="alert" style={{ margin: 0 }}>{err}</div>}
              <button className="btn dark lg" type="submit" disabled={busy} style={{ marginTop: 6 }}>{busy ? <><span className="spin" />Saving…</> : 'Join the early testers'}</button>
              <div className="sub" style={{ fontSize: 13 }}>We'll only use this to contact you about AttendClear. No spam.</div>
            </form>
          </section>
        )}
      </div>
    </div>
  )
}
