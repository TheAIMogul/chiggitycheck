import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { Icon, type IconName } from '../components/ui'
import Explainer from '../components/Explainer'

/* Stage explainer: landscape slides for the presenter. → / Space / PageDown / click = next, ← / PageUp = back, F = full screen, D = demo. */

const Mark = ({ size = 1 }: { size?: number }) => (
  <span className="stg-mark" style={{ width: `calc(var(--u) * ${4.2 * size})`, height: `calc(var(--u) * ${4.2 * size})` }}>
    <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>
)

export function Pain({ n, unit, text }: { n: string; unit: string; text: string }) {
  return (
    <div className="stg-pain">
      <div className="stg-pain-n">{n}<span>{unit}</span></div>
      <div className="stg-pain-t">{text}</div>
    </div>
  )
}

type Ctx = { active: boolean; mobile: boolean }
const Shot = ({ src, alt, top }: { src: string; alt: string; top?: boolean }) => (
  <div className={`stg-shot${top ? ' top' : ''}`}><img src={src} alt={alt} /></div>
)
const Feature = ({ eyebrow, title, bullets, shot, alt, top }: { eyebrow: string; title: ReactNode; bullets: [IconName, ReactNode][]; shot: string; alt: string; top?: boolean }) => (
  <div className="stg-feat">
    <div>
      <p className="stg-eyebrow">{eyebrow}</p>
      <h2 className="stg-h1 sm">{title}</h2>
      <ul className="stg-list fix">{bullets.map(([ic, t], i) => <li key={i}><Icon name={ic} /><span>{t}</span></li>)}</ul>
    </div>
    <Shot src={shot} alt={alt} top={top} />
  </div>
)

const SLIDES: { key: string; render: (go: (to: string) => void, ctx: Ctx) => ReactNode }[] = [
  {
    key: 'problem',
    render: () => (
      <div className="stg-wrap">
        <p className="stg-eyebrow">The problem</p>
        <h2 className="stg-h1">Kids are slipping through the cracks,<br /><span className="muted">and the paperwork is why.</span></h2>
        <p className="stg-lede big">At a Miami youth nonprofit, attendance lives on paper sign-in sheets. Staff spend 5 to 15 hours a week retyping them. A kid can miss three sessions before anyone calls home, because the sheets aren't typed in yet. And every quarter, the funder report takes three days and the numbers don't match.</p>
        <p className="stg-lede big blue strong">We built a tool to solve that.</p>
      </div>
    ),
  },
  {
    key: 'what',
    render: (_go, ctx) => (
      <div className="xp-slide">
        <div>
          <p className="stg-eyebrow">Meet ChiggityCheck</p>
          <h2 className="stg-h1 sm">Take a photo of the sign-in sheet. <span className="blue">It does the rest.</span></h2>
        </div>
        <Explainer active={ctx.active} still={ctx.mobile} />
      </div>
    ),
  },
  {
    key: 'snap',
    render: () => (
      <Feature eyebrow="1 · Snap" title={<>It reads the handwriting<br /><span className="blue">and knows who's who.</span></>} shot="/stage/snap.png" alt="Sheet review screen" top
        bullets={[
          ['cam', <><b>One photo.</b> Every name and check mark read in about 12 seconds.</>],
          ['merge', <><b>Each spelling matched</b> to the right kid with a probability. "Dariel Rmz" is Dariel Ramírez, 99%. Learned forever.</>],
          ['q', <><b>It only asks when it must.</b> A kid it has never seen, or a half-finished check mark.</>],
        ]} />
    ),
  },
  {
    key: 'calls',
    render: () => (
      <Feature eyebrow="2 · Nobody left behind" title={<>Who to call this week,<br /><span className="blue">with the message already written.</span></>} shot="/stage/calls.png" alt="Calls screen" top
        bullets={[
          ['phone', <><b>Flagged at the second miss.</b> Every kid's pattern is scored the moment a sheet is saved.</>],
          ['msg', <><b>Written in the family's language</b> from the real facts: the dates, the mentor, the next session. Spanish, Haitian Creole or English.</>],
          ['check', <><b>Sent on WhatsApp.</b> Delivered, read, and the reply lands on the kid's record.</>],
        ]} />
    ),
  },
  {
    key: 'people',
    render: () => (
      <Feature eyebrow="3 · One record per person" title={<>Three spellings.<br /><span className="blue">One family.</span></>} shot="/stage/family.png" alt="Family page showing one family found in three places" top
        bullets={[
          ['people', <><b>The same mom</b> from a sign-up form, a sheet and a text message becomes one record, with every spelling kept.</>],
          ['school', <><b>A kid changes schools</b> and keeps their history. Counted once in the report.</>],
          ['pen', <><b>Edit anything</b> and the app shows you everything else that moved.</>],
        ]} />
    ),
  },
  {
    key: 'report',
    render: () => (
      <Feature eyebrow="4 · Prove it" title={<>The funder report is done.<br /><span className="blue">Every number opens its photo.</span></>} shot="/stage/evidence.png" alt="Report with the evidence drawer open" top
        bullets={[
          ['doc', <><b>Always current.</b> Kids served, attendance, sessions, mentor matches, volunteer hours, follow-ups.</>],
          ['sheet', <><b>Tap any number</b> and see the sheets and lines behind it, with the photo and the line highlighted.</>],
          ['lock', <><b>Honest by design.</b> Duplicate hours removed, unclear marks left out, counseling shown as totals only.</>],
        ]} />
    ),
  },
  {
    key: 'real',
    render: () => (
      <Feature eyebrow="5 · It's a real app" title={<>Live data.<br /><span className="blue">Nothing is faked.</span></>} shot="/stage/today.png" alt="Today dashboard" top
        bullets={[
          ['form', <><b>Public sign-up form</b> and spreadsheet import. Every submission is matched to existing families, so no duplicates.</>],
          ['db', <><b>Describe a program in a sentence</b> and it creates the kids, sessions, sheets and calls in 20 seconds.</>],
          ['plug', <><b>Connected tools:</b> WhatsApp, SMS, Google Sheets, Mailchimp, QuickBooks, calendar. Runs on Cloudflare at the edge.</>],
        ]} />
    ),
  },
  {
    key: 'how',
    render: (go) => (
      <div className="stg-demo">
        <div>
          <p className="stg-eyebrow">Live demo</p>
          <h2 className="stg-h1 sm">No more retyping.<br />No kid slips through.<br /><span className="blue">No report crunch.</span></h2>
          <button className="stg-go" onClick={(e) => { e.stopPropagation(); go('/today') }}>
            <Icon name="cam" /> Start the demo
          </button>
        </div>
        <div className="stg-qr" onClick={(e) => e.stopPropagation()}>
          <img src="/qr-signup.svg" alt="QR code for the public sign-up form at check.micahberkley.com/signup" />
          <b>Try it from your seat</b>
          <span>Sign up a family and watch it land in the records.</span>
          <code>check.micahberkley.com/signup</code>
        </div>
      </div>
    ),
  },
]

export default function Stage() {
  const navigate = useNavigate()
  const [i, setI] = useState(() => {
    const n = Number(window.location.hash.replace('#', ''))
    return Number.isFinite(n) && n >= 1 && n <= SLIDES.length ? n - 1 : 0
  })
  const go = useCallback((to: string) => navigate(to), [navigate])
  const next = useCallback(() => setI((x) => Math.min(SLIDES.length - 1, x + 1)), [])
  const prev = useCallback(() => setI((x) => Math.max(0, x - 1)), [])

  useEffect(() => { window.history.replaceState(null, '', `#${i + 1}`); document.title = 'ChiggityCheck' }, [i])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) {
        e.preventDefault()
        if (i === SLIDES.length - 1 && e.key === 'Enter') go('/today'); else next()
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); prev() }
      else if (e.key === 'Home') setI(0)
      else if (e.key === 'End') setI(SLIDES.length - 1)
      else if (e.key.toLowerCase() === 'f') { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.() }
      else if (e.key.toLowerCase() === 'd') go('/today')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [i, next, prev, go])

  return (
    <div className="stg" onClick={(e) => { if (e.clientX < window.innerWidth * 0.25) prev(); else next() }}>
      <div className="stg-top" onClick={(e) => e.stopPropagation()}>
        <div className="stg-brand sm" ><Mark size={0.8} /><span>ChiggityCheck</span></div>
        <Link to="/today" className="stg-skip">Skip to demo <Icon name="arrow" /></Link>
      </div>
      {SLIDES.map((s, idx) => (
        <section key={s.key} className={`stg-slide${idx === i ? ' on' : idx < i ? ' past' : ''}`} aria-hidden={idx !== i}>
          {s.render(go, { active: idx === i, mobile: false })}
        </section>
      ))}
      <div className="stg-dots" onClick={(e) => e.stopPropagation()}>
        {SLIDES.map((s, idx) => <button key={s.key} aria-label={`Slide ${idx + 1}`} className={idx === i ? 'on' : ''} onClick={() => setI(idx)} />)}
      </div>
      
      {/* Portrait / phone: the same story as one scrolling page */}
      <div className="stg-mobile">
        {SLIDES.map((s) => <section key={s.key} className="stg-mslide">{s.render(go, { active: false, mobile: true })}</section>)}
      </div>
    </div>
  )
}
