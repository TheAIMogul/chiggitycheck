import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
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
/* `m` is a tight crop of the same screen, readable at phone width */
const Shot = ({ src, m, alt, mobile }: { src: string; m: string; alt: string; mobile: boolean }) => (
  <div className={`stg-shot${mobile ? ' m' : ''}`}><img src={mobile ? m : src} alt={alt} /></div>
)
const Feature = ({ eyebrow, title, bullets, shot, m, alt, mobile }: { eyebrow: string; title: ReactNode; bullets: [IconName, ReactNode][]; shot: string; m: string; alt: string; mobile: boolean }) => (
  <div className="stg-feat">
    <div>
      <p className="stg-eyebrow">{eyebrow}</p>
      <h2 className="stg-h1 sm">{title}</h2>
      <ul className="stg-list fix">{bullets.map(([ic, t], i) => <li key={i}><Icon name={ic} /><span>{t}</span></li>)}</ul>
    </div>
    <Shot src={shot} m={m} alt={alt} mobile={mobile} />
  </div>
)

const SLIDES: { key: string; render: (go: (to: string) => void, ctx: Ctx) => ReactNode }[] = [
  {
    key: 'problem',
    render: () => (
      <div className="stg-wrap">
        <div className="stg-prob">
          <div>
            <p className="stg-eyebrow">The problem</p>
            <h2 className="stg-h1">Kids in afterschool programs are slipping through the cracks.<br /><span className="muted">Attendance still lives on paper.</span></h2>
            <p className="stg-lede">Afterschool programs, mentoring groups and college-prep nonprofits sign kids in on paper sheets. Nobody has time to type them up, so when a kid stops coming, no one notices until it's too late.</p>
          </div>
          <img className="stg-photo" src="/stage/problem.jpg" alt="A staff member sorting a stack of paper sign-in sheets while kids do homework, one chair left empty" />
        </div>
        <div className="stg-pains three">
          <Pain n="15" unit="hrs a week" text="staff spend retyping sign-in sheets" />
          <Pain n="3" unit="misses" text="before anyone notices and calls home" />
          <Pain n="3" unit="days" text="to pull the numbers together for funders" />
        </div>
        <p className="stg-lede big blue strong">We built a tool to solve that.</p>
      </div>
    ),
  },
  {
    key: 'what',
    render: (_go, ctx) => (
      <div className="xp-slide">
        <div>
          <p className="stg-eyebrow">Meet AttendClear</p>
          <h2 className="stg-h1 sm">Take a photo of the sign-in sheet. <span className="blue">It does the rest.</span></h2>
        </div>
        {ctx.mobile ? (
          <div className="stg-mwhat">
            <div className="stg-shot m"><img src="/sheets/demo-cg-2026-09-23.jpg" alt="A paper sign-in sheet on a clipboard" /></div>
            <div className="stg-mflow">{['Snap', 'Match', 'Call', 'Report'].map((x, k) => <span key={x}>{k > 0 && <i>›</i>}<b>{x}</b></span>)}</div>
          </div>
        ) : <Explainer active={ctx.active} />}
      </div>
    ),
  },
  {
    key: 'snap',
    render: (_go, ctx) => (
      <Feature eyebrow="1 · Snap" title={<>It reads the handwriting<br /><span className="blue">and knows who's who.</span></>} shot="/stage/snap.png" m="/stage/m-snap.jpg" alt="Sheet review screen" mobile={ctx.mobile}
        bullets={[
          ['cam', <><b>One photo.</b> Every name read.</>],
          ['merge', <><b>"Dariel Rmz"</b> is Dariel Ramírez.</>],
          ['q', <><b>It asks</b> only when unsure.</>],
        ]} />
    ),
  },
  {
    key: 'calls',
    render: (_go, ctx) => (
      <Feature eyebrow="2 · Nobody left behind" title={<>Who to call this week,<br /><span className="blue">with the message already written.</span></>} shot="/stage/calls.png" m="/stage/m-calls.jpg" alt="Calls screen" mobile={ctx.mobile}
        bullets={[
          ['phone', <><b>Flagged</b> at the second miss.</>],
          ['msg', <><b>Written</b> in the family's language.</>],
          ['check', <><b>Sent on WhatsApp.</b> Replies land on the record.</>],
        ]} />
    ),
  },
  {
    key: 'people',
    render: (_go, ctx) => (
      <Feature eyebrow="3 · One record per person" title={<>Three spellings.<br /><span className="blue">One family.</span></>} shot="/stage/family.png" m="/stage/m-family.jpg" alt="Family page showing one family found in three places" mobile={ctx.mobile}
        bullets={[
          ['people', <><b>Form, sheet, text:</b> one mom.</>],
          ['school', <><b>New school,</b> same history.</>],
          ['pen', <><b>Every spelling</b> kept.</>],
        ]} />
    ),
  },
  {
    key: 'report',
    render: (_go, ctx) => (
      <Feature eyebrow="4 · Prove it" title={<>The funder report is done.<br /><span className="blue">Every number opens its photo.</span></>} shot="/stage/evidence.png" m="/stage/m-evidence.jpg" alt="Report with the evidence drawer open" mobile={ctx.mobile}
        bullets={[
          ['doc', <><b>Always</b> up to date.</>],
          ['sheet', <><b>Tap a number,</b> see the sheet.</>],
          ['lock', <><b>Duplicates</b> removed for you.</>],
        ]} />
    ),
  },
  {
    key: 'real',
    render: (_go, ctx) => (
      <Feature eyebrow="5 · It's a real app" title={<>Live data.<br /><span className="blue">Nothing is faked.</span></>} shot="/stage/today.png" m="/stage/m-today.jpg" alt="Today dashboard" mobile={ctx.mobile}
        bullets={[
          ['form', <><b>Sign-up form</b> with no duplicates.</>],
          ['db', <><b>One sentence</b> builds a whole program.</>],
          ['plug', <><b>WhatsApp, SMS,</b> Sheets, QuickBooks.</>],
        ]} />
    ),
  },
  {
    key: 'how',
    render: (go, ctx) => (
      <div className="stg-demo">
        <img className="stg-photo m-only" src="/stage/solved.jpg" alt="" />
        <div>
          <p className="stg-eyebrow">Live demo</p>
          <h2 className="stg-h1 sm">No more retyping.<br />No kid slips through.<br /><span className="blue">No report crunch.</span></h2>
          <button className="stg-go" onClick={(e) => { e.stopPropagation(); go('/today') }}>
            <Icon name="cam" /> Start the demo
          </button>
        </div>
        {ctx.mobile ? (
          <Link className="stg-signup" to="/signup" onClick={(e) => e.stopPropagation()}>Sign up a family and watch it land <Icon name="arrow" /></Link>
        ) : (
        <div className="stg-qr" onClick={(e) => e.stopPropagation()}>
          <img src="/qr-signup.svg" alt="QR code for the public sign-up form at attendclear.com/signup" />
          <b>Try it from your seat</b>
          <span>Sign up a family and watch it land in the records.</span>
          <code>attendclear.com/signup</code>
        </div>
        )}
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

  useEffect(() => { window.history.replaceState(null, '', `#${i + 1}`); document.title = 'AttendClear' }, [i])
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
        <div className="stg-brand sm" ><Mark size={0.8} /><span>AttendClear</span></div>
        <Link to="/today" className="stg-skip">Skip to demo <Icon name="arrow" /></Link>
      </div>
      {SLIDES.map((s, idx) => (
        <section key={s.key} className={`stg-slide s-${s.key}${idx === i ? ' on' : idx < i ? ' past' : ''}`} aria-hidden={idx !== i}>
          {s.render(go, { active: idx === i, mobile: false })}
        </section>
      ))}
      <div className="stg-dots" onClick={(e) => e.stopPropagation()}>
        {SLIDES.map((s, idx) => <button key={s.key} aria-label={`Slide ${idx + 1}`} className={idx === i ? 'on' : ''} onClick={() => setI(idx)} />)}
      </div>
      
      {/* Portrait / phone: the same slides, one screen each, swiped sideways */}
      <MobileSlides go={go} />
    </div>
  )
}

function MobileSlides({ go }: { go: (to: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(0)
  const to = (k: number) => { const el = ref.current; if (el) el.scrollTo({ left: Math.max(0, Math.min(SLIDES.length - 1, k)) * el.clientWidth, behavior: 'smooth' }) }
  return (
    <div className="stg-mobile">
      <div className="stg-m" ref={ref} onScroll={(e) => { const el = e.currentTarget; setAt(Math.round(el.scrollLeft / el.clientWidth)) }}>
        {SLIDES.map((s, idx) => <section key={s.key} className={`stg-mcard s-${s.key}`} aria-label={`Slide ${idx + 1} of ${SLIDES.length}`}>{s.render(go, { active: false, mobile: true })}</section>)}
      </div>
      <div className="stg-mnav" onClick={(e) => e.stopPropagation()}>
        <button className="stg-mbtn" aria-label="Previous slide" disabled={at === 0} onClick={() => to(at - 1)}><Icon name="back" /></button>
        <div className="stg-mdots">{SLIDES.map((s, idx) => <button key={s.key} aria-label={`Slide ${idx + 1}`} className={idx === at ? 'on' : ''} onClick={() => to(idx)} />)}</div>
        {at < SLIDES.length - 1
          ? <button className="stg-mbtn next" onClick={() => to(at + 1)}>Next <Icon name="back" style={{ transform: 'rotate(180deg)' }} /></button>
          : <button className="stg-mbtn next" onClick={() => go('/today')}>Demo <Icon name="back" style={{ transform: 'rotate(180deg)' }} /></button>}
      </div>
    </div>
  )
}
