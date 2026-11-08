import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { Icon, type IconName } from './ui'
import '../explainer.css'

/*
  Explainer: the auto-playing, looping storyboard shown on stage (slide 2).
  Four persistent glass nodes (Sheet → Kids → Calls → Report) joined by SVG wires;
  one timeline `t` (ms, 0..LOOP) drives every element. React flips classes at ~30fps,
  CSS transitions/keyframes do the smoothing. No dependencies.

  Loop (≈14.6 s):
    A  Snap     0.0–3.6 s  phone + shutter flash, 14 rows lift off the photo as chips
    B  Match    3.6–7.0 s  chips fly along the wire into Kids, snap onto canonical names
    C  Nobody   7.0–11.8 s strips appear, Dariel's new miss lands → Urgent → WhatsApp typed → ✓✓ → reply → Back
    D  Prove   11.8–14.6 s wires light into Report, numbers count up, sheet thumbnail slides in
*/

export type FlowNode = 'sheet' | 'kids' | 'calls' | 'report'

const SHEET_IMG = '/sheets/demo-cg-2026-09-23.jpg'

type Kid = { raw: string; name: string; p: number | null; learned?: boolean; strip: number[] }
/* 1 = here, 0 = missed. Order = the 14 handwritten rows on the real sheet. */
const KIDS: Kid[] = [
  { raw: 'Dariel Rmz', name: 'Dariel Ramírez', p: 99, learned: true, strip: [1, 1, 1, 0, 0] },
  { raw: 'Camila Delgado', name: 'Camila Delgado', p: 100, strip: [1, 1, 1, 1, 1] },
  { raw: 'Josh Carter', name: 'Joshua Carter', p: 100, learned: true, strip: [1, 1, 0, 1, 1] },
  { raw: 'Sofia Fernandez', name: 'Sofía Fernández', p: 98, learned: true, strip: [1, 1, 1, 1, 1] },
  { raw: 'Kevin Nguyen', name: 'Kevin Nguyen', p: 100, strip: [1, 0, 1, 1, 1] },
  { raw: 'Mateo Hernandez', name: 'Mateo Hernández', p: 99, strip: [1, 1, 1, 1, 1] },
  { raw: 'Ashley Pierre-Louis', name: 'Ashley Pierre-Louis', p: 100, strip: [1, 1, 1, 1, 1] },
  { raw: 'Yaneli P.', name: 'Yaneli P.', p: null, strip: [0, 0, 0, 0, 0] },
  { raw: 'Jaden Augustin', name: 'Jaden Augustin', p: 100, strip: [1, 1, 1, 0, 1] },
  { raw: 'Valeria Ramos', name: 'Valeria Ramos', p: 100, strip: [1, 1, 1, 1, 1] },
  { raw: 'D. Desir', name: 'Daniel Désir', p: 93, learned: true, strip: [1, 1, 1, 1, 1] },
  { raw: 'Brianna Castillo', name: 'Brianna Castillo', p: 100, strip: [1, 1, 1, 1, 1] },
  { raw: 'Andres F.', name: 'Andrés Fuentes', p: 96, learned: true, strip: [1, 0, 1, 1, 1] },
  { raw: 'Nia Carter', name: 'Nia Carter', p: 100, strip: [1, 1, 1, 1, 1] },
]
const N = KIDS.length
const DARIEL = 0
const YANELI = 7

/* ---------- timeline (ms) ---------- */
const T = {
  FLASH: 700,
  LIFT0: 1000, LIFT_STEP: 150, LIFT_DUR: 350,
  B0: 3600,
  FLY0: 3750, FLY_STEP: 115, FLY_DUR: 650,
  C0: 7000,
  STRIPS: 7100,
  DROP: 7600,
  URGENT: 8100,
  CALLS_ON: 8250,
  TYPE0: 8500, TYPE_END: 10100,
  TICKS: 10400,
  REPLY: 10800,
  BACK: 11350,
  D0: 11800,
  COUNT0: 12000, COUNT_END: 13000,
  THUMB: 13000,
  FADE: 14250,
  LOOP: 14600,
} as const
const lift = (i: number) => T.LIFT0 + i * T.LIFT_STEP
const fly = (i: number) => T.FLY0 + i * T.FLY_STEP
const land = (i: number) => fly(i) + T.FLY_DUR

type StageKey = 'snap' | 'match' | 'nobody' | 'prove'
const STAGES: { key: StageKey; label: string; from: number; to: number; caption: string; still: number }[] = [
  { key: 'snap', label: 'Snap', from: 0, to: T.B0, caption: 'One photo. Every name read.', still: 3400 },
  { key: 'match', label: 'Match', from: T.B0, to: T.C0, caption: 'Each spelling matched to the right kid, and remembered.', still: 6900 },
  { key: 'nobody', label: 'Nobody left behind', from: T.C0, to: T.D0, caption: 'Two misses in a row? The family hears from us before the third.', still: 11700 },
  { key: 'prove', label: 'Prove', from: T.D0, to: T.LOOP, caption: 'The funder report is already done. Tap any number to see the photo.', still: 14100 },
]
const stageAt = (t: number) => STAGES.find((s) => t >= s.from && t < s.to) ?? STAGES[0]

const MSG_OUT = 'Hola Sra. Ramírez, le escribe Marisol de Tidepath… Dariel faltó el 9, 16 y 23 de septiembre. ¿Está todo bien?'
const MSG_IN = 'Gracias, tuvimos problemas con el transporte. Dariel va el miércoles.'

const NODES: { key: FlowNode; label: string; icon: IconName }[] = [
  { key: 'sheet', label: 'Sheet', icon: 'cam' },
  { key: 'kids', label: 'Kids', icon: 'people' },
  { key: 'calls', label: 'Calls', icon: 'phone' },
  { key: 'report', label: 'Report', icon: 'doc' },
]

/* Row anchor positions on the real photo (900×1200): row 1 text centre y≈428, pitch ≈41.85, names start x≈175. */
const PHOTO_ROW_TOP = (i: number) => ((428 + i * 41.85) / 1200) * 100
const PHOTO_ROW_LEFT = 19.5

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3)
const prog = (t: number, a: number, b: number) => clamp01((t - a) / (b - a))

type Rect = { x: number; y: number; w: number; h: number }
type Geo = { w: number; h: number; screen: Rect; photo: Rect[]; rows: Rect[]; nodes: Record<FlowNode, Rect> }

/* ====================================================================== */

export default function Explainer({ active = true, still = false }: { active?: boolean; still?: boolean }) {
  const reduced = useMemo(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, [])
  /* dev aid: /?xpt=9400#2 freezes the loop at that millisecond */
  const frozen = useMemo(() => { const v = Number(new URLSearchParams(window.location.search).get('xpt')); return Number.isFinite(v) && v > 0 ? v % T.LOOP : null }, [])
  const [t, setT] = useState(frozen ?? 0)
  const [paused, setPaused] = useState(frozen != null)
  const tRef = useRef(frozen ?? 0)
  const lastRef = useRef<number | null>(null)

  /* clock */
  useEffect(() => {
    if (still || !active || paused) { lastRef.current = null; return }
    let raf = 0
    const tick = (now: number) => {
      if (lastRef.current == null) lastRef.current = now
      const dt = Math.min(100, now - lastRef.current)
      lastRef.current = now
      if (!document.hidden) tRef.current = (tRef.current + dt) % T.LOOP
      const q = Math.floor(tRef.current / 33)
      setT((prev) => (Math.floor(prev / 33) === q ? prev : tRef.current))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, paused, still])
  useEffect(() => { if (!active && frozen == null) { tRef.current = 0; setT(0) } }, [active, frozen])

  /* effective time: still = final frame; reduced motion = last frame of each stage (crossfade only) */
  const te = still ? STAGES[3].still : reduced ? stageAt(t).still : t
  const stage = stageAt(te)
  const cut = !still && !reduced && t < 150
  const fading = !still && !reduced && t >= T.FADE
  const faded = fading || cut

  /* geometry: measured once per size so chips + wires live in px inside the diagram */
  const rootRef = useRef<HTMLDivElement>(null)
  const photoRefs = useRef<(HTMLSpanElement | null)[]>([])
  const rowRefs = useRef<(HTMLSpanElement | null)[]>([])
  const screenRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef<Partial<Record<FlowNode, HTMLDivElement | null>>>({})
  const [geo, setGeo] = useState<Geo | null>(null)
  useLayoutEffect(() => {
    if (still) return
    const el = rootRef.current
    if (!el) return
    const measure = () => {
      const R = el.getBoundingClientRect()
      if (R.width < 10 || R.height < 10) { setGeo(null); return }
      const rel = (e: Element | null | undefined): Rect => {
        const r = e?.getBoundingClientRect()
        return r ? { x: r.left - R.left, y: r.top - R.top, w: r.width, h: r.height } : { x: 0, y: 0, w: 0, h: 0 }
      }
      setGeo({
        w: R.width, h: R.height,
        screen: rel(screenRef.current),
        photo: KIDS.map((_, i) => rel(photoRefs.current[i])),
        rows: KIDS.map((_, i) => rel(rowRefs.current[i])),
        nodes: { sheet: rel(nodeRefs.current.sheet), kids: rel(nodeRefs.current.kids), calls: rel(nodeRefs.current.calls), report: rel(nodeRefs.current.report) },
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [still])

  /* derived per-stage state */
  const nameCount = KIDS.filter((_, i) => te >= lift(i) + T.LIFT_DUR).length
  const matched = KIDS.filter((_, i) => te >= land(i)).length
  const stripsOn = te >= T.STRIPS
  const dropped = te >= T.DROP
  const urgent = te >= T.URGENT && te < T.BACK
  const back = te >= T.BACK
  const callsOn = te >= T.CALLS_ON
  const typing = te >= T.TYPE0 && te < T.TYPE_END
  const typed = MSG_OUT.slice(0, Math.floor(prog(te, T.TYPE0, T.TYPE_END) * MSG_OUT.length))
  const ticksBlue = te >= T.TICKS
  const replied = te >= T.REPLY
  const count = easeOut(prog(te, T.COUNT0, T.COUNT_END))
  const counted = te >= T.COUNT_END
  const thumb = te >= T.THUMB

  const nodeOn: Record<FlowNode, boolean> = {
    sheet: stage.key === 'snap',
    kids: stage.key === 'match' || (stage.key === 'nobody' && !callsOn),
    calls: stage.key === 'nobody' && callsOn,
    report: stage.key === 'prove',
  }
  const wireState = (k: 'sk' | 'kc' | 'kr' | 'cr'): '' | 'on' | 'done' => {
    const win = { sk: [T.B0, T.C0], kc: [T.URGENT, T.D0], kr: [T.D0, T.FADE], cr: [T.D0, T.FADE] }[k]
    return te >= win[0] && te < win[1] ? 'on' : te >= win[1] ? 'done' : ''
  }
  const wires = geo ? wirePaths(geo) : null

  const status: Record<FlowNode, { text: string; tone?: 'blue' | 'red' | 'good' | 'busy' }> = {
    sheet: te < T.FLASH ? { text: 'Snap' } : nameCount < N ? { text: 'Reading…', tone: 'busy' } : { text: '14 names', tone: 'good' },
    kids: te < T.B0 ? { text: '57 kids' } : matched < N ? { text: 'Matching…', tone: 'busy' } : { text: '13 matched · 1 new', tone: 'good' },
    calls: !urgent && !back ? { text: 'None due' } : replied ? { text: 'Replied', tone: 'good' } : { text: '1 urgent', tone: 'red' },
    report: te < T.D0 ? { text: 'Q1 · draft' } : !counted ? { text: 'Updating…', tone: 'busy' } : { text: 'Ready', tone: 'good' },
  }

  const cls = ['xp', `s-${stage.key}`, still ? 'still' : '', reduced ? 'rm' : '', cut ? 'cut' : '', faded ? 'faded' : '', paused ? 'paused' : ''].filter(Boolean).join(' ')

  return (
    <div
      ref={rootRef}
      className={cls}
      onClick={(e) => { e.stopPropagation(); if (!still) setPaused((p) => !p) }}
      role={still ? undefined : 'button'}
      aria-label={still ? 'How ChiggityCheck works' : paused ? 'Resume the animation' : 'Pause the animation'}
    >
      <div className="xp-stage">
        {!still && wires && (
          <svg className="xp-wires" viewBox={`0 0 ${geo!.w} ${geo!.h}`} preserveAspectRatio="none" aria-hidden="true">
            {(['sk', 'kc', 'kr', 'cr'] as const).map((k) => (
              <g key={k} className={`xp-wire ${wireState(k)}`}>
                <path className="base" d={wires[k]} />
                <path className="glow" d={wires[k]} />
                <path className="pk" d={wires[k]} pathLength={1} />
              </g>
            ))}
          </svg>
        )}

        <div className="xp-nodes">
          {/* ---------- Sheet ---------- */}
          <Node k="sheet" on={nodeOn.sheet} status={status.sheet} refs={nodeRefs}>
            <div className="xp-phone">
              <div ref={screenRef} className={`xp-screen${te >= T.FLASH && te < T.FLASH + 500 ? ' flash' : ''}`}>
                <img src={SHEET_IMG} alt="" draggable={false} />
                {KIDS.map((_, i) => (
                  <span key={i} className={`xp-anchor${te >= lift(i) ? ' read' : ''}`} style={{ top: `${PHOTO_ROW_TOP(i)}%`, left: `${PHOTO_ROW_LEFT}%` }} ref={(el) => { photoRefs.current[i] = el }} />
                ))}
                {!still && te >= T.LIFT0 - 150 && te < lift(N - 1) + T.LIFT_DUR && (
                  <span className="xp-scan" style={{ top: `${PHOTO_ROW_TOP(Math.min(N - 1, Math.max(0, (te - T.LIFT0) / T.LIFT_STEP)))}%` }} />
                )}
                <span className="xp-notch" />
              </div>
              <span className="xp-shutter" />
            </div>
          </Node>

          {/* ---------- Kids ---------- */}
          <Node k="kids" on={nodeOn.kids} status={status.kids} refs={nodeRefs}>
            <div className={`xp-rows${stripsOn ? ' strips' : ''}`}>
              {KIDS.map((k, i) => {
                const hit = te >= land(i)
                const isD = i === DARIEL
                const rowCls = ['xp-row', hit ? 'hit' : '', isD && urgent ? 'urgent' : '', isD && back ? 'back' : ''].filter(Boolean).join(' ')
                return (
                  <div key={k.raw} className={rowCls}>
                    <span className={`xp-av g${(i % 6) + 1}`}>{isD && back ? <Icon name="check" /> : null}</span>
                    <span className="xp-name">
                      <span className="xp-anchor-row" ref={(el) => { rowRefs.current[i] = el }} />
                      <span className="xp-ph" />
                      <b>{k.name}</b>
                    </span>
                    <span className="xp-right">
                      {k.p == null ? (
                        <span className="xp-tag new">New kid?</span>
                      ) : (
                        <>
                          {k.learned && <span className="xp-learn">learned</span>}
                          <span className="xp-pill">{k.p}%</span>
                        </>
                      )}
                      <span className="xp-strip">
                        {k.strip.map((v, j) => <i key={j} className={v ? 'y' : 'n'} />)}
                        {isD && <i className={`n xp-drop${dropped ? ' in' : ''}`} />}
                        {i === YANELI && <em>new</em>}
                      </span>
                      {isD && <span className="xp-tag urgent">Urgent</span>}
                      {isD && <span className="xp-tag back">Back</span>}
                    </span>
                  </div>
                )
              })}
            </div>
          </Node>

          {/* ---------- Calls ---------- */}
          <Node k="calls" on={nodeOn.calls} status={status.calls} refs={nodeRefs}>
            <div className={`xp-empty${callsOn ? ' off' : ''}`}>
              <span className="xp-empty-ic"><Icon name="check" /></span>
              <b>Nobody to call</b>
              <span>Everyone's been here.</span>
            </div>
            <div className={`xp-chat${callsOn ? ' on' : ''}`}>
              <div className="xp-chat-h">
                <span className="xp-av g2">R</span>
                <span><b>Sra. Ramírez</b><small>WhatsApp · Español</small></span>
              </div>
              <div className={`xp-bub out${te >= T.TYPE0 ? ' on' : ''}`}>
                <span className="xp-bub-t">{typed}{typing && <i className="xp-caret" />}</span>
                <span className={`xp-ticks${ticksBlue ? ' sent' : ''}`}>{te >= T.TYPE_END ? '✓✓' : '✓'}</span>
              </div>
              <div className={`xp-bub in${replied ? ' on' : ''}`}>
                <span className="xp-bub-t">{MSG_IN}</span>
              </div>
              <div className={`xp-chat-f${replied ? ' on' : ''}`}><Icon name="check" /> Logged on Dariel's record · 2 min</div>
            </div>
          </Node>

          {/* ---------- Report ---------- */}
          <Node k="report" on={nodeOn.report} status={status.report} refs={nodeRefs}>
            <div className="xp-stats">
              <Stat label="Kids served" from={57} to={58} k={count} live={te >= T.COUNT0} />
              <Stat label="Showed up" from={86} to={86} k={count} live={te >= T.COUNT0} suffix="%" />
              <Stat label="Sessions" from={39} to={40} k={count} live={te >= T.COUNT0} />
              <Stat label="Volunteer hours" from={445.5} to={447.5} k={count} live={te >= T.COUNT0} dec={1} />
            </div>
            <div className={`xp-thumb${thumb ? ' on' : ''}`}>
              <img src={SHEET_IMG} alt="" draggable={false} />
              <span><b>Every number opens its photo</b><small>Sep 23 · Citrus Grove · 14 names</small></span>
            </div>
          </Node>
        </div>

        {/* ---------- flight layer: the 14 chips ---------- */}
        {!still && geo && (
          <div className="xp-fly" aria-hidden="true">
            {KIDS.map((k, i) => {
              const p = geo.photo[i], r = geo.rows[i], sc = geo.screen
              const st = te >= land(i) + 200 ? 'gone' : te >= land(i) ? 'land' : te >= fly(i) ? 'fly' : te >= lift(i) ? 'lift' : te >= lift(i) - 120 ? 'pre' : ''
              if (!st) return null
              /* lifted chips cascade down the phone screen, one slot per name */
              const slot = { x: sc.x + sc.w * 0.06, y: sc.y + sc.h * (0.06 + i * 0.07) }
              const style = { left: p.x, top: p.y, '--lx': `${slot.x - p.x}px`, '--ly': `${slot.y - p.y}px`, '--dx': `${r.x - p.x}px`, '--dy': `${r.y - p.y}px` } as CSSProperties
              return (
                <div key={k.raw} className={`xp-chip ${st}`} style={style}>
                  <div className="xp-chip-arc"><div className="xp-chip-in"><Icon name="pen" />{k.raw}</div></div>
                </div>
              )
            })}
          </div>
        )}

        {!still && paused && <div className="xp-paused">Paused · click to resume</div>}
      </div>

      <div className="xp-cap">
        <div className="xp-prog" aria-hidden="true">
          {STAGES.map((s) => (
            <span key={s.key} className={`xp-seg${s.key === stage.key ? ' on' : te >= s.to ? ' done' : ''}`}>
              <i style={{ transform: `scaleX(${s.key === stage.key ? prog(te, s.from, s.to) : te >= s.to ? 1 : 0})` }} />
              <span>{s.label}</span>
            </span>
          ))}
        </div>
        <p key={stage.key} className="xp-caption">{stage.caption}</p>
      </div>
    </div>
  )
}

/* ---------- pieces ---------- */

function Node({ k, on, status, refs, children }: {
  k: FlowNode; on: boolean
  status: { text: string; tone?: 'blue' | 'red' | 'good' | 'busy' }
  refs: RefObject<Partial<Record<FlowNode, HTMLDivElement | null>>>
  children: ReactNode
}) {
  const n = NODES.find((x) => x.key === k)!
  return (
    <div className={`xp-node n-${k}${on ? ' on' : ''}`} ref={(el) => { refs.current[k] = el }}>
      <div className="xp-node-h">
        <span className="xp-node-ic"><Icon name={n.icon} /></span>
        <b>{n.label}</b>
        <span className={`xp-status${status.tone ? ' ' + status.tone : ''}`}>{status.text}</span>
      </div>
      <div className="xp-body">{children}</div>
    </div>
  )
}

function Stat({ label, from, to, k, live, suffix = '', dec = 0 }: { label: string; from: number; to: number; k: number; live: boolean; suffix?: string; dec?: number }) {
  const v = live ? from + (to - from) * k : from
  const changed = to !== from
  return (
    <div className={`xp-stat${live ? ' live' : ''}${changed && k >= 1 ? ' bumped' : ''}${changed && live && k < 1 ? ' moving' : ''}`}>
      <span>{label}</span>
      <b className="num">{v.toFixed(dec)}{suffix}</b>
    </div>
  )
}

function wirePaths(g: Geo): Record<'sk' | 'kc' | 'kr' | 'cr', string> {
  const { sheet, kids, calls, report } = g.nodes
  const cx = (a: number, b: number) => (a + b) / 2
  // Sheet → Kids: right-middle of Sheet to left-middle of Kids, soft S-curve.
  const skA = { x: sheet.x + sheet.w, y: sheet.y + sheet.h * 0.52 }, skB = { x: kids.x, y: kids.y + kids.h * 0.5 }
  const sk = `M${skA.x},${skA.y} C${cx(skA.x, skB.x)},${skA.y} ${cx(skA.x, skB.x)},${skB.y} ${skB.x},${skB.y}`
  // Kids → Calls: from Dariel's row (first row) into the chat.
  const rowY = g.rows[DARIEL].y + g.rows[DARIEL].h / 2 || kids.y + kids.h * 0.2
  const kcA = { x: kids.x + kids.w, y: rowY }, kcB = { x: calls.x, y: calls.y + calls.h * 0.42 }
  const kc = `M${kcA.x},${kcA.y} C${cx(kcA.x, kcB.x)},${kcA.y} ${cx(kcA.x, kcB.x)},${kcB.y} ${kcB.x},${kcB.y}`
  // Calls → Report: right-middle to left, a bit lower.
  const crA = { x: calls.x + calls.w, y: calls.y + calls.h * 0.6 }, crB = { x: report.x, y: report.y + report.h * 0.45 }
  const cr = `M${crA.x},${crA.y} C${cx(crA.x, crB.x)},${crA.y} ${cx(crA.x, crB.x)},${crB.y} ${crB.x},${crB.y}`
  // Kids → Report: leaves the bottom of Kids, dips under Calls, climbs into the bottom of Report.
  const kx = kids.x + kids.w * 0.6, rx = report.x + report.w * 0.4, by = g.h + 6
  const kr = `M${kx},${kids.y + kids.h} C${kx},${by} ${rx},${by} ${rx},${report.y + report.h}`
  return { sk, kc, kr, cr }
}

/* ====================================================================== */
/* MiniFlow: the same four nodes + wires, ~120px tall, for app pages ("where this data flows"). */

export function MiniFlow({ active = [], pulse = true }: { active?: FlowNode[]; pulse?: boolean }) {
  const set = new Set(active)
  return (
    <div className={`mf${pulse ? ' pulse' : ''}`} aria-label={`Data flows into ${active.join(', ') || 'nothing yet'}`}>
      {NODES.map((n, i) => (
        <Fragment key={n.key}>
          {i > 0 && (
            <svg className={`mf-wire${set.has(n.key) ? ' on' : ''}`} viewBox="0 0 64 24" preserveAspectRatio="none" aria-hidden="true">
              <path className="base" d="M0,12 C22,12 42,12 64,12" />
              <path className="pk" d="M0,12 C22,12 42,12 64,12" pathLength={1} />
            </svg>
          )}
          <div className={`mf-node${set.has(n.key) ? ' on' : ''}`}>
            <span className="mf-ic"><Icon name={n.icon} /></span>
            <b>{n.label}</b>
          </div>
        </Fragment>
      ))}
    </div>
  )
}
