import { useState, type FormEvent } from 'react'
import type { Lang, Program, SignupForm, SignupResult } from '../../shared/types'
import { api, errMsg } from '../api'
import { Brand } from '../components/Chrome'
import { Icon } from '../components/ui'
import { prob, secs } from '../format'

const EMPTY: SignupForm = {
  guardian_first: '', guardian_last: '', phone: '', email: '', language: 'en',
  kid_first: '', kid_last: '', grade: '', school: '', program: 'mentoring', neighborhood: '',
}

const T: Record<Lang, Record<string, string>> = {
  en: { title: 'Sign up for Tidepath', lede: 'Free mentoring, workshops and counseling for middle schoolers in Miami.', you: 'About you', kid: 'About your child', first: 'First name', last: 'Last name', phone: 'Phone', email: 'Email (optional)', lang: 'Language for messages', grade: 'Grade', school: 'School', program: 'Program', hood: 'Neighborhood (optional)', send: 'Sign up' },
  es: { title: 'Inscríbase en Tidepath', lede: 'Mentoría, talleres y consejería gratis para estudiantes de secundaria en Miami.', you: 'Sobre usted', kid: 'Sobre su hijo o hija', first: 'Nombre', last: 'Apellido', phone: 'Teléfono', email: 'Correo (opcional)', lang: 'Idioma para mensajes', grade: 'Grado', school: 'Escuela', program: 'Programa', hood: 'Barrio (opcional)', send: 'Inscribirse' },
  ht: { title: 'Enskri nan Tidepath', lede: 'Mantora, atelye ak konsèy gratis pou elèv lekòl mwayen nan Miami.', you: 'Sou ou', kid: 'Sou pitit ou', first: 'Prenon', last: 'Non', phone: 'Telefòn', email: 'Imèl (si ou vle)', lang: 'Lang pou mesaj yo', grade: 'Klas', school: 'Lekòl', program: 'Pwogram', hood: 'Katye (si ou vle)', send: 'Enskri' },
}

export default function Signup() {
  const [f, setF] = useState<SignupForm>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [res, setRes] = useState<SignupResult | null>(null)
  const t = T[f.language]
  const set = <K extends keyof SignupForm>(k: K, v: SignupForm[K]) => setF((p) => ({ ...p, [k]: v }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    const body: SignupForm = { ...f, email: f.email?.trim() || undefined, neighborhood: f.neighborhood?.trim() || undefined }
    try { setRes(await api.signup(body)); window.scrollTo({ top: 0, behavior: 'smooth' }) } catch (x) { setErr(errMsg(x)) } finally { setBusy(false) }
  }

  const famName = res ? (/family$/i.test(res.family.name) ? res.family.name : `${res.family.name} family`) : ''

  return (
    <div>
      <div className="wtop"><Brand to="/" /></div>
      <div className="signup">
        {res ? (
          <section className="card white" style={{ padding: 28 }}>
            <div className="trace" style={{ marginTop: 0 }}><span className="c"><Icon name="check" style={{ width: 16, height: 16, strokeWidth: 2.6 }} /></span><span><b>Thanks! You're signed up.</b> {secs(res.ms)}</span></div>
            <h1 style={{ fontSize: 34, marginTop: 18, lineHeight: 1.1 }}>
              {res.status === 'linked' ? <>Linked to the {famName}{res.probability !== null ? ` (${prob(res.probability)} sure)` : ''}</>
                : res.status === 'new' ? 'New family created'
                : <>Close to the {famName}. Staff will double-check.</>}
            </h1>
            <p className="sub" style={{ fontSize: 17, marginTop: 10 }}>{res.explanation}</p>
            <div className="dq">
              <div><b style={{ fontSize: 20 }}>{famName}</b><span>{res.family.existing ? 'Family we already knew' : 'New family'}</span></div>
              <div><b style={{ fontSize: 20 }}>{res.kid.name}</b><span>{res.kid.existing ? 'Kid we already knew' : 'New kid'}</span></div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
              <button className="btn dark" onClick={() => { setRes(null); setF({ ...EMPTY, language: f.language }) }}>Sign up another child</button>
            </div>
          </section>
        ) : (
          <section className="card white" style={{ padding: 28 }}>
            <div className="head" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <h1 style={{ fontSize: 34 }}>{t.title}</h1>
                <p className="sub" style={{ fontSize: 17, margin: '8px 0 0' }}>{t.lede}</p>
              </div>
            </div>
            <form onSubmit={submit} style={{ marginTop: 22 }}>
              <label className="field">{t.lang}
                <select value={f.language} onChange={(e) => set('language', e.target.value as Lang)}>
                  <option value="en">English</option><option value="es">Español</option><option value="ht">Kreyòl ayisyen</option>
                </select>
              </label>
              <div className="title" style={{ fontSize: 19, marginTop: 6 }}>{t.you}</div>
              <div className="two">
                <label className="field">{t.first}<input required autoComplete="given-name" value={f.guardian_first} onChange={(e) => set('guardian_first', e.target.value)} /></label>
                <label className="field">{t.last}<input required autoComplete="family-name" value={f.guardian_last} onChange={(e) => set('guardian_last', e.target.value)} /></label>
              </div>
              <div className="two">
                <label className="field">{t.phone}<input required type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(305) 555-0100" /></label>
                <label className="field">{t.email}<input type="email" autoComplete="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></label>
              </div>
              <div className="title" style={{ fontSize: 19, marginTop: 6 }}>{t.kid}</div>
              <div className="two">
                <label className="field">{t.first}<input required value={f.kid_first} onChange={(e) => set('kid_first', e.target.value)} /></label>
                <label className="field">{t.last}<input required value={f.kid_last} onChange={(e) => set('kid_last', e.target.value)} /></label>
              </div>
              <div className="two">
                <label className="field">{t.grade}
                  <select required value={f.grade} onChange={(e) => set('grade', e.target.value)}>
                    <option value="" disabled>—</option>
                    {['4', '5', '6', '7', '8', '9'].map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </label>
                <label className="field">{t.school}<input required value={f.school} onChange={(e) => set('school', e.target.value)} placeholder="Citrus Grove MS" /></label>
              </div>
              <div className="two">
                <label className="field">{t.program}
                  <select value={f.program} onChange={(e) => set('program', e.target.value as Program)}>
                    <option value="mentoring">{f.language === 'es' ? 'Mentoría' : f.language === 'ht' ? 'Mantora' : 'Mentoring'}</option>
                    <option value="workshop">{f.language === 'es' ? 'Talleres' : f.language === 'ht' ? 'Atelye' : 'Workshops'}</option>
                    <option value="counseling">{f.language === 'es' ? 'Consejería' : f.language === 'ht' ? 'Konsèy' : 'Counseling'}</option>
                  </select>
                </label>
                <label className="field">{t.hood}<input value={f.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} placeholder="Little Havana" /></label>
              </div>
              {err && <div className="notice bad" role="alert" style={{ margin: 0 }}>{err}</div>}
              <button className="btn dark lg" type="submit" disabled={busy} style={{ marginTop: 6 }}>{busy ? <><span className="spin" />Checking our records…</> : t.send}</button>
              <div className="sub" style={{ fontSize: 13 }}>Demo form for a fictional nonprofit. Please don't enter real family details.</div>
            </form>
          </section>
        )}
      </div>
    </div>
  )
}
