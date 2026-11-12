import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { LAUNCH } from '../format'
import { Icon } from './ui'

// Storage can be blocked (private windows); the popup just shows again in that case.
const read = (kind: 'local' | 'session', k: string) => { try { return window[`${kind}Storage`].getItem(k) } catch { return null } }
const write = (kind: 'local' | 'session', k: string) => { try { window[`${kind}Storage`].setItem(k, '1') } catch { /* blocked */ } }
/** Called after a successful early-tester sign-up, so the popup never comes back on this device. */
export const markJoined = () => write('local', 'ac_joined')

/** Bottom-right invite to sign up before launch. Closing it hides it for the rest of the visit. */
export default function LaunchPopup({ landing = false }: { landing?: boolean }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (read('local', 'ac_joined') || read('session', 'ac_launch_closed')) return
    const t = setTimeout(() => setShow(true), 2500)
    return () => clearTimeout(t)
  }, [])
  if (!show) return null
  const close = () => { write('session', 'ac_launch_closed'); setShow(false) }
  return (
    <aside className={`launch${landing ? ' low' : ''}`} aria-label="Sign up for the launch">
      <button className="sn-x lx" aria-label="Close" onClick={close}>×</button>
      <div className="l-body">
        <div className="sn-k">Launching {LAUNCH}</div>
        <div className="l-t">Use AttendClear with your own program</div>
        <div className="l-s">Early testers get set up first. Signing up takes a minute.</div>
      </div>
      <Link className="btn dark sm" to="/early-access" onClick={() => setShow(false)}>
        <span className="l-long">Become an early tester</span><span className="l-short">Sign up</span><Icon name="arrow" style={{ width: 16, height: 16 }} />
      </Link>
    </aside>
  )
}
