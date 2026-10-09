import { useEffect } from 'react'
import type { ReleaseNote } from './notes'
import './whatsnew.css'

export default function WhatsNew({ note, onClose }: { note: ReleaseNote; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => (e.key === 'Escape' || e.key === 'Enter') && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal whatsnew" role="dialog" aria-label={`What's new in ${note.version}`}>
        <div className="wn-hero">
          <img src={note.hero} alt="" />
          <div className="wn-hero-text">
            <span className="wn-version">What's new in {note.version}</span>
            <h1>{note.headline}</h1>
            <p>{note.tagline}</p>
          </div>
        </div>
        <div className="wn-grid">
          {note.features.map((f) => (
            <div key={f.title} className="wn-card">
              {f.image && <img src={f.image} alt="" />}
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
        {note.also && (
          <ul className="wn-also">
            {note.also.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}
        <div className="modal-actions">
          <span className="spacer" />
          <button className="btn primary" type="button" onClick={onClose}>
            Let's go
          </button>
        </div>
      </div>
    </div>
  )
}
