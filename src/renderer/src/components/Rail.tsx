import type { Workspace } from '../../../shared/types'
import { initials } from '../lib'

type Props = {
  workspaces: Workspace[]
  currentId: string | null
  unread: Record<string, number> // workspaceId -> unread agent count
  onSwitch: (id: string) => void
  onNew: () => void
}

export default function Rail({ workspaces, currentId, unread, onSwitch, onNew }: Props) {
  return (
    <nav className="rail">
      <div className="rail-list">
        {workspaces.map((w) => (
          <button
            key={w.id}
            className={'rail-tile' + (w.id === currentId ? ' current' : '')}
            title={w.name}
            onClick={() => onSwitch(w.id)}
          >
            {w.image ? <img className="rail-img" src={w.image} alt="" /> : <span className="rail-initials">{initials(w.name)}</span>}
            {unread[w.id] > 0 && <span className="rail-badge">{unread[w.id]}</span>}
          </button>
        ))}
        <button className="rail-tile rail-add" title="New workspace" onClick={onNew}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
      </div>
      <div className="rail-footer">
        <span className="initials">RC</span>
      </div>
    </nav>
  )
}
