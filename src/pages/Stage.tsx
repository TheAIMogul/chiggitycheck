import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { Icon, type IconName } from '../components/ui'

/* Stage explainer: landscape slides for the presenter. → / Space / PageDown / click = next, ← / PageUp = back, F = full screen, D = demo. */

const Mark = ({ size = 1 }: { size?: number }) => (
  <span className="stg-mark" style={{ width: `calc(var(--u) * ${4.2 * size})`, height: `calc(var(--u) * ${4.2 * size})` }}>
    <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>
)

function Pain({ n, unit, text }: { n: string; unit: string; text: string }) {
  return (
    <div className="stg-pain">
      <div className="stg-pain-n">{n}<span>{unit}</span></div>
      <div className="stg-pain-t">{text}</div>
    </div>
  )
}

function Step({ icon, title, sub, broken, img }: { icon: IconName; title: string; sub: string; broken?: boolean; img?: string }) {
  return (
    <div className={`stg-step${broken ? ' broken' : ''}`}>
      {img ? <img src={img} alt="Paper sign-in sheet on a clipboard" className="stg-step-img" /> : <span className="stg-step-ic"><Icon name={icon} /></span>}
      <div className="stg-step-t">{title}</div>
      <div className="stg-step-s">{sub}</div>
    </div>
  )
}
const Arrow = ({ broken }: { broken?: boolean }) => <span className={`stg-arrow${broken ? ' broken' : ''}`}>{broken ? '×' : '→'}</span>

const SLIDES: { key: string; render: (go: (to: string) => void) => ReactNode }[] = [
  {
    key: 'cover',
    render: () => (
      <div className="stg-center">
        <div className="stg-brand"><Mark size={1.6} /><span>ChiggityCheck</span></div>
        <h1 className="stg-h0">Snap the sign-in sheet.<br /><span className="blue">Everything else is done.</span></h1>
        <p className="stg-kicker">Give Miami Day Hackathon · Challenge 1: From sign-up to quarterly report</p>
      </div>
    ),
  },
  {
    key: 'marisol',
    render: () => (
      <div className="stg-wrap">
        <p className="stg-eyebrow">Meet the person we built this for</p>
        <h2 className="stg-h1">Marisol runs every program at<br />Tidepath Family Alliance.</h2>
        <div className="stg-stats">
          <div><b>900</b><span>kids a year</span></div>
          <div><b>150</b><span>families</span></div>
          <div><b>3</b><span>languages: English, Spanish, Kreyòl</span></div>
          <div><b>40</b><span>volunteer mentors</span></div>
        </div>
        <p className="stg-lede">Mentoring, family counseling and safety workshops in Little Havana and West Little River. Funded by about a dozen grants, each asking for a quarterly outcome report.</p>
        <p className="stg-note">Tidepath is a composite of 14 real South Florida nonprofits.</p>
      </div>
    ),
  },
  {
    key: 'problem',
    render: () => (
      <div className="stg-wrap">
        <p className="stg-eyebrow">The problem</p>
        <h2 className="stg-h1">Every list is typed by hand.<br /><span className="muted">And the numbers still don't match.</span></h2>
        <div className="stg-pains">
          <Pain n="5–15" unit="hrs" text="every week typing paper sheets and form sign-ups into spreadsheets" />
          <Pain n="3" unit="lists" text="the same mother appears on, spelled three different ways" />
          <Pain n="3" unit="misses" text="before anyone called home, because the sheets weren't typed in yet" />
          <Pain n="3" unit="days" text="to build each quarterly report, and the numbers never match the first time" />
        </div>
      </div>
    ),
  },
  {
    key: 'quote',
    render: () => (
      <div className="stg-center">
        <p className="stg-quote">“I just want to type each thing once, know which kids need a call this week, and have the quarterly report ready without losing days to it.”</p>
        <p className="stg-by">Marisol, program manager</p>
      </div>
    ),
  },
  {
    key: 'why',
    render: () => (
      <div className="stg-wrap">
        <p className="stg-eyebrow">Why it keeps happening</p>
        <h2 className="stg-h1">The truth starts on paper.<br /><span className="muted">Everything after it is retyping.</span></h2>
        <div className="stg-flow">
          <Step icon="sheet" title="Paper sheet" sub="Mentors check kids in on a clipboard" img="/sheets/demo-cg-2026-09-23.jpg" />
          <Arrow broken />
          <Step icon="pen" title="Typed by hand" sub="Days later, when there's time" broken />
          <Arrow broken />
          <Step icon="copy" title="Four lists" sub="Sign-ups, attendance, mentors, hours. None of them talk" broken />
          <Arrow broken />
          <Step icon="doc" title="Report by hand" sub="Funders get numbers they can't check" broken />
        </div>
      </div>
    ),
  },
  {
    key: 'idea',
    render: () => (
      <div className="stg-wrap">
        <p className="stg-eyebrow">Our idea</p>
        <h2 className="stg-h1">Don't add another form.<br /><span className="blue">The paper sheet is the input.</span></h2>
        <div className="stg-flow">
          <Step icon="cam" title="1 · Snap" sub="One photo of the sheet. AI reads every handwritten name" img="/sheets/demo-cg-2026-09-23.jpg" />
          <Arrow />
          <Step icon="merge" title="2 · Match" sub="Each spelling matched to the right kid, with a probability. Learned forever" />
          <Arrow />
          <Step icon="phone" title="3 · Call" sub="Who needs a call this week, message written in the family's language" />
          <Arrow />
          <Step icon="doc" title="4 · Prove" sub="Report always done. Every number opens the photo it came from" />
        </div>
      </div>
    ),
  },
  {
    key: 'solved',
    render: () => (
      <div className="stg-wrap">
        <p className="stg-eyebrow">What solved looks like</p>
        <h2 className="stg-h1">Type it once. Call the right family.<br /><span className="blue">The report is already done.</span></h2>
        <div className="stg-ba">
          <div className="before">
            <div className="k">Before</div>
            <div className="row"><span>Per session</span><b>40 min typing</b></div>
            <div className="row"><span>Same mom</span><b>3 records</b></div>
            <div className="row"><span>Kid flagged after</span><b>3rd miss</b></div>
            <div className="row"><span>Quarterly report</span><b>3 days</b></div>
          </div>
          <div className="after">
            <div className="k">With ChiggityCheck</div>
            <div className="row"><span>Per session</span><b>1 photo</b></div>
            <div className="row"><span>Same mom</span><b>1 record</b></div>
            <div className="row"><span>Kid flagged after</span><b>2nd miss</b></div>
            <div className="row"><span>Quarterly report</span><b>Already done</b></div>
          </div>
        </div>
      </div>
    ),
  },
  {
    key: 'demo',
    render: (go) => (
      <div className="stg-demo">
        <div>
          <p className="stg-eyebrow">Live demo</p>
          <h2 className="stg-h1 sm">Wednesday, September 23.<br /><span className="muted">Citrus Grove Middle School,<br />4:40 pm.</span></h2>
          <p className="stg-lede">A mentor just handed Marisol today's sheet. Let's snap it.</p>
          <button className="stg-go" onClick={(e) => { e.stopPropagation(); go('/today') }}>
            <Icon name="cam" /> Start the demo
          </button>
        </div>
        <div className="stg-qr" onClick={(e) => e.stopPropagation()}>
          <img src="/qr-signup.svg" alt="QR code for the public sign-up form at check.micahberkley.com/signup" />
          <b>Try it from your seat</b>
          <span>Sign up a family. Watch it land in Marisol's records.</span>
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
        <div className="stg-brand sm" style={{ visibility: i === 0 ? 'hidden' : 'visible' }}><Mark size={0.8} /><span>ChiggityCheck</span></div>
        <Link to="/today" className="stg-skip">Skip to demo <Icon name="arrow" /></Link>
      </div>
      {SLIDES.map((s, idx) => (
        <section key={s.key} className={`stg-slide${idx === i ? ' on' : idx < i ? ' past' : ''}`} aria-hidden={idx !== i}>
          {s.render(go)}
        </section>
      ))}
      <div className="stg-dots" onClick={(e) => e.stopPropagation()}>
        {SLIDES.map((s, idx) => <button key={s.key} aria-label={`Slide ${idx + 1}`} className={idx === i ? 'on' : ''} onClick={() => setI(idx)} />)}
      </div>
      {i === 0 && <div className="stg-hint">Press → to begin · F for full screen</div>}
      {/* Portrait / phone: the same story as one scrolling page */}
      <div className="stg-mobile">
        {SLIDES.map((s) => <section key={s.key} className="stg-mslide">{s.render(go)}</section>)}
      </div>
    </div>
  )
}
