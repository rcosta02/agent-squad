import { useState } from 'react'
import type { Agent, Workspace } from '../../../shared/types'
import { formatTime } from '../lib'
import Avatar from './Avatar'

type Props = {
  workspace: Workspace | null
  onNewWorkspace: () => void
  onEditWorkspace: () => void
  onOpenKb: () => void
  agents: Agent[]
  selectedId: string | null // agent id or 'group'
  groupUnread: number
  boardUnread: number
  running: Set<string>
  search: string
  onSearch: (q: string) => void
  onSelect: (id: string) => void
  onNew: () => void
}

export default function Sidebar({ workspace, onNewWorkspace, onEditWorkspace, onOpenKb, agents, selectedId, groupUnread, boardUnread, running, search, onSearch, onSelect, onNew }: Props) {
  const [menu, setMenu] = useState(false)
  const q = search.trim().toLowerCase()
  const visible = q
    ? agents.filter((a) => a.name.toLowerCase().includes(q) || (a.preview ?? '').toLowerCase().includes(q))
    : agents

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="menu-wrap ws-wrap">
          <button className="ws-btn" onClick={() => setMenu((v) => !v)} title="Switch workspace">
            <span className="ws-name">{workspace?.name ?? 'Workspace'}</span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M2 4l3 3 3-3" />
            </svg>
          </button>
          {menu && (
            <>
              <div className="menu-backdrop" onClick={() => setMenu(false)} />
              <div className="menu ws-menu">
                <button
                  className="menu-item"
                  onClick={() => {
                    setMenu(false)
                    onEditWorkspace()
                  }}
                >
                  ⚙︎ Edit workspace
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    setMenu(false)
                    onOpenKb()
                  }}
                >
                  📚 Knowledge base
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    setMenu(false)
                    onNewWorkspace()
                  }}
                >
                  ＋ New workspace
                </button>
              </div>
            </>
          )}
        </div>
        <button className="icon-btn" title="New agent" onClick={onNew}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
      </div>
      <div className="search">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5L14 14" />
        </svg>
        <input type="text" placeholder="Search" value={search} onChange={(e) => onSearch(e.target.value)} />
      </div>
      <div className="agent-list">
        {!q && (
          <button className={'agent-row group-row' + (selectedId === 'group' ? ' selected' : '') + (groupUnread ? ' unread' : '')} onClick={() => onSelect('group')}>
            <span className="group-avatar">#</span>
            <div className="agent-row-body">
              <div className="agent-row-top">
                <span className="agent-row-name">general</span>
              </div>
              <div className="agent-row-preview">Everyone · @mention to ask</div>
            </div>
            {groupUnread > 0 && <span className="unread-pill">{groupUnread}</span>}
          </button>
        )}
        {!q && (
          <button className={'agent-row group-row' + (selectedId === 'board' ? ' selected' : '') + (boardUnread ? ' unread' : '')} onClick={() => onSelect('board')}>
            <span className="group-avatar board">⊞</span>
            <div className="agent-row-body">
              <div className="agent-row-top">
                <span className="agent-row-name">Board</span>
              </div>
              <div className="agent-row-preview">Tasks · nothing starts by itself</div>
            </div>
            {boardUnread > 0 && <span className="unread-pill">{boardUnread}</span>}
          </button>
        )}
        {visible.map((a) => (
          <button key={a.id} className={'agent-row' + (a.id === selectedId ? ' selected' : '') + (a.unread ? ' unread' : '')} onClick={() => onSelect(a.id)}>
            <Avatar agent={a} running={running.has(a.id)} />
            <div className="agent-row-body">
              <div className="agent-row-top">
                <span className="agent-row-name">{a.name}</span>
                <span className="agent-row-time">{formatTime(a.updatedAt)}</span>
              </div>
              <div className="agent-row-preview">{a.preview || ' '}</div>
            </div>
            {a.unread && <span className="unread-pill">{a.unreadCount || 1}</span>}
          </button>
        ))}
        {visible.length === 0 && agents.length > 0 && <div className="list-empty">No matches</div>}
      </div>
    </aside>
  )
}
