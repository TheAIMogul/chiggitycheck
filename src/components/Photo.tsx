import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { BBox } from '../../shared/types'
import { Icon, useEscape } from './ui'

/** A real sheet photo with an optional normalized bbox outlined on top. */
export function PhotoWithBox({ src, alt, bbox, zoomable, onExpand }: {
  src: string; alt: string; bbox?: BBox | null; zoomable?: boolean; onExpand?: () => void
}) {
  const [zoom, setZoom] = useState(1)
  const [broken, setBroken] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)

  // keep the highlighted line in view when zoomed in
  useEffect(() => {
    if (!bbox || !scroller.current || !inner.current || zoom === 1) return
    const el = scroller.current
    const h = inner.current.offsetHeight * zoom
    const w = inner.current.offsetWidth * zoom
    el.scrollTo({ top: Math.max(0, (bbox[1] + bbox[3] / 2) * h - el.clientHeight / 2), left: Math.max(0, (bbox[0] + bbox[2] / 2) * w - el.clientWidth / 2), behavior: 'smooth' })
  }, [bbox, zoom])

  if (broken) return <div className="shot ph"><span><Icon name="img" /> Photo unavailable</span></div>

  return (
    <div className="shot">
      {zoomable && (
        <div className="tools">
          <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} disabled={zoom <= 1}><Icon name="zoomout" style={{ width: 16, height: 16 }} /></button>
          <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(3, z + 0.5))} disabled={zoom >= 3}><Icon name="zoomin" style={{ width: 16, height: 16 }} /></button>
          {onExpand && <button type="button" aria-label="Open full size" onClick={onExpand}><Icon name="expand" style={{ width: 16, height: 16 }} /></button>}
        </div>
      )}
      <div className="zoomer" ref={scroller}>
        <div className="inner" ref={inner} style={{ width: `${zoom * 100}%` }}>
          <img src={src} alt={alt} onError={() => setBroken(true)} />
          {bbox && (
            <span className="bbox" style={{ left: `${bbox[0] * 100}%`, top: `${bbox[1] * 100}%`, width: `${bbox[2] * 100}%`, height: `${bbox[3] * 100}%` }} />
          )}
        </div>
      </div>
    </div>
  )
}

export function Modal({ onClose, children, wide, label }: { onClose: () => void; children: ReactNode; wide?: boolean; label: string }) {
  useEscape(onClose)
  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={label}>
        <button className="x" type="button" aria-label="Close" onClick={onClose}><Icon name="x" style={{ width: 16, height: 16 }} /></button>
        {children}
      </div>
    </div>
  )
}

export function Lightbox({ src, alt, bbox, title, caption, onClose }: {
  src: string; alt: string; bbox?: BBox | null; title: string; caption?: ReactNode; onClose: () => void
}) {
  return (
    <Modal onClose={onClose} wide label={title}>
      <div className="title" style={{ paddingRight: 48 }}>{title}</div>
      {caption && <div className="sub" style={{ marginTop: 4 }}>{caption}</div>}
      <div style={{ marginTop: 16 }}>
        <PhotoWithBox src={src} alt={alt} bbox={bbox} zoomable />
      </div>
    </Modal>
  )
}
