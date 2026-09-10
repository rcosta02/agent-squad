import type { Workspace } from '../../../shared/types'
import { initials } from '../lib'

type Props = {
  workspaces: Workspace[]
  currentId: string | null
  unread: Record<string, number> // workspaceId -> unread agent count
  onSwitch: (id: string) => void
  onNew: () => void
  onMeeting: () => void
  onBoard: () => void
  onChat: () => void
  view: 'chat' | 'board' | 'meeting'
  recording: boolean
  boardUnread: number
}

export default function Rail({ workspaces, currentId, unread, onSwitch, onNew, onMeeting, onBoard, onChat, view, recording, boardUnread }: Props) {
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
        <button className={'rail-nav' + (view === 'chat' ? ' active' : '')} title="Conversations" onClick={onChat}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5z" />
          </svg>
        </button>
        <button className={'rail-nav' + (view === 'board' ? ' active' : '')} title="Board" onClick={onBoard}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <rect x="3" y="4" width="5" height="16" rx="1.5" />
            <rect x="9.5" y="4" width="5" height="10" rx="1.5" />
            <rect x="16" y="4" width="5" height="13" rx="1.5" />
          </svg>
          {boardUnread > 0 && <span className="rail-badge">{boardUnread}</span>}
        </button>
        <button className={'rail-nav' + (view === 'meeting' ? ' active' : '') + (recording ? ' live' : '')} title={recording ? 'Recording… open notes' : 'Notes'} onClick={onMeeting}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
          </svg>
          {recording && <span className="rail-badge live">●</span>}
        </button>
        <span className="initials">RC</span>
      </div>
    </nav>
  )
}
