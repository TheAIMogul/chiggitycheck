import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { Icon } from '../components/ui'
import Explainer from '../components/Explainer'

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

type Ctx = { active: boolean; mobile: boolean }
const SLIDES: { key: string; render: (go: (to: string) => void, ctx: Ctx) => ReactNode }[] = [
  {
    key: 'problem',
    render: () => (
      <div className="stg-wrap">
        <p className="stg-eyebrow">The problem</p>
        <h2 className="stg-h1">Attendance lives on paper.<br /><span className="muted">So kids slip away and nobody notices.</span></h2>
        <div className="stg-pains three">
          <Pain n="5–15" unit="hrs/week" text="Staff retype paper sign-in sheets into spreadsheets." />
          <Pain n="3" unit="misses" text="before anyone calls the family. The sheets weren't typed in yet." />
          <Pain n="3" unit="days" text="to build the funder report. And the numbers don't match." />
        </div>
      </div>
    ),
  },
  {
    key: 'what',
    render: (_go, ctx) => (
      <div className="xp-slide">
        <div>
          <p className="stg-eyebrow">What ChiggityCheck does</p>
          <h2 className="stg-h1 sm">Take a photo of the sign-in sheet. <span className="blue">It does the rest.</span></h2>
        </div>
        <Explainer active={ctx.active} still={ctx.mobile} />
      </div>
    ),
  },
  {
    key: 'how',
    render: (go) => (
      <div className="stg-demo">
        <div>
          <p className="stg-eyebrow">How that fixes it</p>
          <h2 className="stg-h1 sm">One photo replaces<br />all the retyping.</h2>
          <ul className="stg-list fix">
            <li><Icon name="check" /><span><b>No more retyping.</b> One photo per session instead of 40 minutes of typing.</span></li>
            <li><Icon name="phone" /><span><b>No kid slips through.</b> Flagged at the 2nd miss, with the call message ready.</span></li>
            <li><Icon name="doc" /><span><b>No report crunch.</b> The report fills itself as sheets come in.</span></li>
          </ul>
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
