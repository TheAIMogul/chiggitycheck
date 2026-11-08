import { useState, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import type { SampleSheet, UploadResponse } from '../../shared/types'
import { api, errMsg } from '../api'
import { ErrorState, Icon, Shimmer, useApi } from '../components/ui'
import { PROGRAM, fmtDow, fmtWhen } from '../format'
import { useApp } from '../components/AppContext'

export default function SnapStart() {
  const nav = useNavigate()
  const { today } = useApp()
  const samples = useApi(api.samples, [])
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [already, setAlready] = useState<{ r: UploadResponse; label: string } | null>(null)

  const handle = (r: UploadResponse, label: string) => {
    if (r.status === 'already_captured') { setAlready({ r, label }); setBusy(null); return }
    nav(`/snap/${r.session_id}`, { state: { photo_url: r.photo_url, upload_ms: r.upload_ms } })
  }
  const upload = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { setErr('That file is not a photo. Pick a JPG, PNG or HEIC image.'); return }
    setErr(null); setAlready(null); setBusy('upload')
    try { handle(await api.upload(file), 'This photo') } catch (e) { setErr(errMsg(e)); setBusy(null) }
  }
  const capture = async (s: SampleSheet) => {
    setErr(null); setAlready(null); setBusy(s.key)
    try { handle(await api.capture(s.key), `${s.site} · ${PROGRAM[s.program]}`) } catch (e) { setErr(errMsg(e)); setBusy(null) }
  }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files?.[0]) }

  return (
    <>
      <div
        className={`drop${over ? ' over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <div className="big">{busy === 'upload' ? <span className="spin" style={{ width: 34, height: 34, borderWidth: 3 }} /> : <Icon name="cam" />}</div>
        <h1>{busy === 'upload' ? 'Saving the photo…' : 'Take a photo of the sign-in sheet'}</h1>
        <div className="sub">On a phone this opens the camera. On a computer, drop a photo here.</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 26, flexWrap: 'wrap' }}>
          <label className="btn dark lg">
            <Icon name="cam" />Open camera
            <input className="sr" type="file" accept="image/*" capture="environment" disabled={!!busy} onChange={(e) => upload(e.target.files?.[0])} />
          </label>
          <label className="btn ghost lg">
            Choose a photo
            <input className="sr" type="file" accept="image/*" disabled={!!busy} onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        </div>
      </div>

      {err && <div className="notice bad" role="alert" style={{ marginTop: 16 }}>{err}</div>}
      {already && (
        <div className="notice neutral" role="status" style={{ marginTop: 16 }}>
          <Icon name="info" />
          <span style={{ flex: 1, minWidth: 200 }}>{already.label}: this sheet was already captured{already.r.captured_at ? ` on ${fmtWhen(already.r.captured_at, today)}` : ''}. Nothing was added twice.</span>
          <Link className="btn ghost sm" to={`/report?ev=${encodeURIComponent(`session:${already.r.session_id}`)}`}>See it in the report</Link>
        </div>
      )}

      <div className="head" style={{ marginTop: 30 }}><div><div className="title">No sheet handy? Use one of ours.</div><div className="sub">Real photos of sample sheets from this quarter.</div></div></div>
      {samples.error ? <div style={{ marginTop: 16 }}><ErrorState error={samples.error} onRetry={samples.reload} /></div> : (
        <div className="samples">
          {!samples.data && [0, 1, 2, 3].map((i) => <div key={i} className="sample"><Shimmer h={150} r={14} /><Shimmer h={14} w="70%" style={{ marginTop: 14 }} /><Shimmer h={12} w="50%" style={{ marginTop: 8 }} /></div>)}
          {samples.data?.map((s) => (
            <button key={s.key} type="button" className={`sample${s.recommended ? ' go' : ''}${busy === s.key ? ' busy' : ''}`} onClick={() => capture(s)} disabled={!!busy}>
              {s.recommended && <span className="pill blue tag">Start here</span>}
              {busy === s.key && <span className="pill dark tag"><span className="spin" style={{ width: 12, height: 12 }} />Opening</span>}
              <div className="pv"><img src={s.photo_url} alt={`Sign-in sheet, ${s.site}, ${fmtDow(s.held_at)}`} loading="lazy" /></div>
              <div className="t">{s.label || `${s.site} · ${PROGRAM[s.program]}`}</div>
              <div className="s">{fmtDow(s.held_at)} · {s.already_captured ? <span style={{ color: 'var(--good)' }}>captured</span> : 'not captured yet'}</div>
            </button>
          ))}
        </div>
      )}
      {samples.data && samples.data.length === 0 && <div className="sub" style={{ marginTop: 12 }}>No sample sheets are loaded.</div>}
    </>
  )
}
