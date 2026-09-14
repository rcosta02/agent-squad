import { useEffect, useState } from 'react'
import { PROVIDERS, type Profile, type Provider, type Theme } from '../../../shared/types'

const ZOOM = { min: 80, max: 150, step: 10 }

type Props = {
  initial?: Profile
  onClose?: () => void // undefined on first run: nothing to go back to
  onSubmit: (p: Profile) => void
  onPreview: (theme: Theme, zoom: number) => void // live-apply while the dialog is open
}

export default function OnboardingModal({ initial, onClose, onSubmit, onPreview }: Props) {
  const [firstName, setFirst] = useState(initial?.firstName ?? '')
  const [lastName, setLast] = useState(initial?.lastName ?? '')
  const [providers, setProviders] = useState<Provider[]>(initial?.providers ?? ['claude-code'])
  const [theme, setTheme] = useState<Theme>(initial?.theme ?? 'dark')
  const [zoom, setZoom] = useState(initial?.zoom ?? 100)
  useEffect(() => onPreview(theme, zoom), [theme, zoom, onPreview])
  const bump = (d: number) => setZoom((z) => Math.min(ZOOM.max, Math.max(ZOOM.min, z + d)))

  useEffect(() => {
    if (!onClose) return
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggle = (id: Provider) => setProviders((ps) => (ps.includes(id) ? ps.filter((p) => p !== id) : [...ps, id]))
  const valid = firstName.trim().length > 0 && lastName.trim().length > 0 && providers.length > 0

  const submit = () => {
    if (!valid) return
    onSubmit({ firstName: firstName.trim(), lastName: lastName.trim(), providers: PROVIDERS.map(([id]) => id).filter((id) => providers.includes(id)), theme, zoom })
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" role="dialog">
        <h2>{initial ? 'Profile' : 'Welcome'}</h2>
        {!initial && <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>Tell us your name and which agent providers you use. You can change this later from the avatar in the rail.</p>}

        <div className="field-row">
          <div className="field">
            <label>First name</label>
            <input type="text" value={firstName} autoFocus onChange={(e) => setFirst(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </div>
          <div className="field">
            <label>Last name</label>
            <input type="text" value={lastName} onChange={(e) => setLast(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </div>
        </div>

        <div className="field">
          <label>Agent providers (pick one or more)</label>
          <div className="providers">
            {PROVIDERS.map(([id, label, hint]) => (
              <label key={id} className={'provider' + (providers.includes(id) ? ' on' : '')}>
                <input type="checkbox" checked={providers.includes(id)} onChange={() => toggle(id)} />
                {label}
                <small>{hint}</small>
              </label>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Appearance</label>
          <div className="theme-pick">
            {(['dark', 'light'] as Theme[]).map((t) => (
              <button key={t} type="button" className={'theme-card ' + t + (theme === t ? ' on' : '')} onClick={() => setTheme(t)}>
                <span className="theme-thumb">
                  <span className="tt-rail" />
                  <span className="tt-side">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="tt-main">
                    <b />
                    <b className="me" />
                  </span>
                </span>
                <span className="theme-name">{t === 'dark' ? 'Dark' : 'Light'}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Zoom</label>
          <div className="zoom-row">
            <button type="button" className="zoom-btn" onClick={() => bump(-ZOOM.step)} disabled={zoom <= ZOOM.min} aria-label="Zoom out">
              −
            </button>
            <input type="range" min={ZOOM.min} max={ZOOM.max} step={ZOOM.step} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
            <button type="button" className="zoom-btn" onClick={() => bump(ZOOM.step)} disabled={zoom >= ZOOM.max} aria-label="Zoom in">
              +
            </button>
            <button type="button" className="zoom-val" onClick={() => setZoom(100)} title="Reset to 100%">
              {zoom}%
            </button>
          </div>
        </div>

        <div className="modal-actions">
          <span className="spacer" />
          {onClose && (
            <button className="btn" type="button" onClick={onClose}>
              Cancel
            </button>
          )}
          <button className="btn primary" type="button" onClick={submit} disabled={!valid}>
            {initial ? 'Save' : 'Get started'}
          </button>
        </div>
      </div>
    </div>
  )
}
