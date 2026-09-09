import { useEffect, useState } from 'react'
import type { Workspace } from '../../../shared/types'
import { initials, shrinkImage } from '../lib'

type Props = {
  initial?: Workspace
  canDelete: boolean
  onClose: () => void
  onSubmit: (input: { name: string; emoji: string; image?: string }) => void
  onDelete?: () => void
}

export default function WorkspaceModal({ initial, canDelete, onClose, onSubmit, onDelete }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [image, setImage] = useState<string | undefined>(initial?.image)
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const valid = name.trim().length > 0

  const pick = async () => {
    const raw = await window.api.pickImage()
    if (raw) setImage(await shrinkImage(raw))
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog">
        <h2>{initial ? 'Edit workspace' : 'New workspace'}</h2>
        <div className="field">
          <label>Name</label>
          <input type="text" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="e.g. AvantStay" />
        </div>
        <div className="field">
          <label>Icon</label>
          <div className="icon-row">
            <div className="rail-tile preview">{image ? <img className="rail-img" src={image} alt="" /> : <span className="rail-initials">{initials(name || '?')}</span>}</div>
            <button className="btn" type="button" onClick={pick}>
              Choose image…
            </button>
            {image && (
              <button className="btn" type="button" onClick={() => setImage(undefined)}>
                Remove
              </button>
            )}
            <span className="hint">No image → initials</span>
          </div>
        </div>
        <div className="modal-actions">
          {initial && onDelete && (
            <button className="btn danger" disabled={!canDelete} title={canDelete ? '' : 'Delete its agents first'} onClick={() => (confirm ? onDelete() : setConfirm(true))}>
              {confirm ? 'Really delete?' : 'Delete workspace'}
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!valid} onClick={() => onSubmit({ name: name.trim(), emoji: initial?.emoji ?? '', image: image ?? '' })}>
            {initial ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
