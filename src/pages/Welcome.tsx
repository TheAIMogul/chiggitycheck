import { Link } from 'react-router'
import { Brand } from '../components/Chrome'
import { Icon } from '../components/ui'
import LaunchPopup from '../components/LaunchPopup'

const SHEET = [
  ['Dariel Rmz', ''], ['Camila Delgado', ''], ['Josh Carter', '✓'], ['Sofia Fernandez', '✓'], ['Kevin Nguyen', '✓'],
  ['Mateo Castellanos', '✓'], ['Ashley Pierre-Louis', '✓'], ['Yaneli P.', '✓'], ['Jaden Augustin', '✓'], ['Valeria Ramos', '✓'],
]

export default function Welcome() {
  return (
    <div>
      <LaunchPopup landing />
      <div className="wtop">
        <Brand to="/" />
        <nav aria-label="Page sections">
          <a href="#how">How it works</a>
          <a href="#funders">For funders</a>
          <a href="#under">Under the hood</a>
        </nav>
        <Link className="btn dark sm" to="/today">Open the demo</Link>
      </div>

      <section className="whero">
        <div>
          <div className="pill wash">Built for Tidepath Family Alliance · Give Miami Day Hackathon</div>
          <h1 style={{ marginTop: 20 }}>Snap the sign-in sheet.<br /><span>Everything else is done.</span></h1>
          <p className="lede">AttendClear reads the paper attendance sheet mentors already fill in. It tells you which families to call this week, writes the message in their language, and keeps the funder report finished.</p>
          <div className="ctas">
            <Link className="btn dark lg" to="/snap"><Icon name="cam" />Try it with a sheet</Link>
            <Link className="btn ghost lg" to="/today">See Marisol's week</Link>
          </div>
          <div className="note">No sign-up. Demo data is made up. Messages go to a sandbox, never a real phone.</div>
        </div>
        <div className="stage" aria-hidden="true">
          <div className="phone"><div className="scr">
            <div className="paper" style={{ transform: 'rotate(3deg)' }}>
              <div className="ph"><span>MENTORING · Citrus Grove</span><span className="hw" style={{ fontSize: 14 }}>9/23/26</span></div>
              <table><tbody>
                {SHEET.map(([n, m], i) => (
                  <tr key={i}><td>{i + 1}</td><td className="k">{n}</td><td className={m ? 'k' : undefined}>{m}</td></tr>
                ))}
              </tbody></table>
            </div>
            <div className="vf" /><div className="shutter" />
          </div></div>
          <div className="float f1" style={{ left: -10, top: 40 }}><span className="ic" style={{ background: 'var(--good)' }}><Icon name="check" /></span><div><b>14 names read</b><span>3.1 seconds · 12 matched</span></div></div>
          <div className="float f2" style={{ right: -10, top: 240 }}><span className="ic" style={{ background: 'var(--urgent)' }}><Icon name="phone" /></span><div><b>Call Dariel's mom today</b><span>3 missed · message ready in Spanish</span></div></div>
          <div className="float f3" style={{ left: -10, bottom: 0 }}><span className="ic" style={{ background: 'var(--blue)' }}><Icon name="doc" /></span><div><b>Q1 report is ready</b><span>531 of 531 lines link to a photo</span></div></div>
        </div>
      </section>

      <section className="how" id="how">
        <h2>Three steps. That's the whole job.</h2>
        <div className="sub">Marisol used to lose 5 to 15 hours a week to typing. Now it's one photo per session.</div>
        <div className="steps3">
          <div className="s3c"><div className="n">Step 1</div><h3>Snap</h3><p>Take a photo of the paper sheet. We read every name, even messy handwriting, and match it to the right kid.</p>
            <div className="vis"><span className="chip" style={{ fontFamily: "'Caveat',cursive", fontSize: 22, color: '#1b2a6b' }}>Dariel Rmz</span><span style={{ color: 'var(--ink-4)' }}>→</span><span className="chip">Dariel Ramírez <span className="pill wash" style={{ height: 22, fontSize: 12 }}>96%</span></span></div></div>
          <div className="s3c"><div className="n">Step 2</div><h3>Call</h3><p>We spot kids who stop showing up and tell you who to call first. The message is already written in the family's language.</p>
            <div className="vis"><span className="pill" style={{ color: 'var(--urgent)', background: 'rgba(229,72,77,.1)' }}>Urgent</span><span className="pill">ES</span><span className="pill">HT</span><span className="pill">EN</span></div></div>
          <div className="s3c" id="funders"><div className="n">Step 3</div><h3>Prove</h3><p>The quarterly report is always finished. Tap any number and see the exact sheet and line it came from.</p>
            <div className="vis"><span className="kpi num" style={{ fontSize: 44 }}>81%</span><span style={{ color: 'var(--ink-4)' }}>→</span><span className="thumb" style={{ display: 'inline-block' }}><i style={{ top: 12 }} /><i style={{ top: 20 }} /><i style={{ top: 28 }} /><em style={{ top: 9 }} /></span></div></div>
        </div>
      </section>

      <section className="ba">
        <div className="bawrap">
          <div className="before"><div className="k">Before</div>
            <div className="row"><span>Typing sheets into the spreadsheet</span><b>5–15 h/wk</b></div>
            <div className="row"><span>Same mom on three lists</span><b>3 spellings</b></div>
            <div className="row"><span>Kid missed before anyone called</span><b>3 weeks</b></div>
            <div className="row" style={{ border: 0 }}><span>Quarterly report</span><b>3 days</b></div>
          </div>
          <div className="after"><div className="k">With AttendClear</div>
            <div className="row"><span>Per session</span><b>1 photo</b></div>
            <div className="row"><span>Same mom</span><b>1 record</b></div>
            <div className="row"><span>Flagged after</span><b>2nd miss</b></div>
            <div className="row" style={{ border: 0 }}><span>Quarterly report</span><b>Already done</b></div>
          </div>
        </div>
      </section>

      <section className="quote"><p>"I just want to type each thing once, know which kids need a call this week, and have the quarterly report ready without losing days to it."</p><div className="by">Marisol, program manager</div></section>

      <section className="under" id="under">
        <div className="eyebrow" style={{ textAlign: 'center' }}>Under the hood</div>
        <div className="grid">
          <div className="it"><b>Reads handwriting</b><span>Cloudflare Workers AI vision model</span></div>
          <div className="it"><b>Matches names with a probability</b><span>OpenAI Decisions API, one call per sheet</span></div>
          <div className="it"><b>Writes in ES, HT, EN</b><span>GPT-5.5, only from real facts</span></div>
          <div className="it"><b>Every number has a receipt</b><span>Report figures link to the photo and line</span></div>
        </div>
      </section>

      <footer className="welcome-foot">
        <Link className="link" to="/signup">Sign up a family (live form)</Link>
        <Link className="link" to="/lab">Build a dataset from a sentence</Link>
        <Link className="link" to="/integrations">Connected tools</Link>
      </footer>
    </div>
  )
}
