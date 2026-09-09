import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import type { Agent, Task, TaskPriority, TaskStatus, Workspace } from '../../../shared/types'
import { formatTime } from '../lib'
import Avatar from './Avatar'
import { Markdown } from './Chat'

const COLS: { id: TaskStatus; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'Todo' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' }
]
const PRIO: TaskPriority[] = ['low', 'normal', 'high', 'urgent']

type Props = {
  workspace: Workspace
  agents: Agent[]
  tasks: Task[]
  running: Set<string>
}

export default function Board({ workspace, agents, tasks, running }: Props) {
  const api = window.api
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState<TaskStatus | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [search, setSearch] = useState('')
  const [who, setWho] = useState<string>('all')
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<{ col: TaskStatus; before: string | null } | null>(null)

  const byId = (id?: string) => (id === 'me' ? null : agents.find((a) => a.id === id))
  const nameOf = (id?: string) => (id === 'me' ? 'Rafael' : (byId(id)?.name ?? ''))
  const q = search.trim().toLowerCase()
  const visible = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (who === 'all' || (who === 'none' ? !t.assignee : t.assignee === who)) &&
          (!q || t.title.toLowerCase().includes(q) || t.labels.some((l) => l.toLowerCase().includes(q)) || ('#' + t.number).includes(q))
      ),
    [tasks, q, who]
  )
  const col = (s: TaskStatus) => visible.filter((t) => t.status === s).sort((a, b) => a.order - b.order)
  const open = tasks.find((t) => t.id === openId) ?? null

  // ---- drag & drop ----
  const onDragStart = (e: DragEvent, id: string) => {
    e.dataTransfer.setData('text/task', id)
    e.dataTransfer.effectAllowed = 'move'
    setDragId(id)
  }
  const onDragOverCard = (e: DragEvent, colId: TaskStatus, cardId: string) => {
    e.preventDefault()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const before = e.clientY < r.top + r.height / 2
    const list = col(colId)
    const i = list.findIndex((t) => t.id === cardId)
    const target = before ? cardId : (list[i + 1]?.id ?? null)
    if (over?.col !== colId || over?.before !== target) setOver({ col: colId, before: target })
  }
  const onDragOverCol = (e: DragEvent, colId: TaskStatus) => {
    e.preventDefault()
    if ((e.target as HTMLElement).closest('.task')) return
    if (over?.col !== colId || over?.before !== null) setOver({ col: colId, before: null })
  }
  const onDrop = async (e: DragEvent, colId: TaskStatus) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/task') || dragId
    setDragId(null)
    const target = over
    setOver(null)
    if (!id) return
    const list = col(colId).filter((t) => t.id !== id)
    const beforeIdx = target?.before ? list.findIndex((t) => t.id === target.before) : -1
    let order: number
    if (beforeIdx < 0) order = (list[list.length - 1]?.order ?? 0) + 1
    else if (beforeIdx === 0) order = list[0].order - 1
    else order = (list[beforeIdx - 1].order + list[beforeIdx].order) / 2
    await api.updateTask(id, { status: colId, order })
  }

  const quickAdd = async (status: TaskStatus) => {
    const title = newTitle.trim()
    if (!title) return setAdding(null)
    await api.createTask({ workspaceId: workspace.id, title, status })
    setNewTitle('')
  }

  return (
    <div className="board">
      <header className="chat-header board-header">
        <span className="group-hash">⊞</span>
        <span className="name">Board</span>
        <input className="board-search" type="text" placeholder="Search tasks…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="rev-pick" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="all">Everyone</option>
          <option value="me">Rafael</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
          <option value="none">Unassigned</option>
        </select>
      </header>
      <div className="board-cols">
        {COLS.map((c) => {
          const list = col(c.id)
          return (
            <div key={c.id} className={'board-col' + (over?.col === c.id ? ' over' : '')} onDragOver={(e) => onDragOverCol(e, c.id)} onDrop={(e) => onDrop(e, c.id)} onDragLeave={(e) => e.currentTarget === e.target && setOver(null)}>
              <div className="col-head">
                <span className={'col-dot ' + c.id} />
                <span className="col-title">{c.label}</span>
                <span className="col-count">{list.length}</span>
                <button className="icon-btn col-add" title="Add task" onClick={() => (setAdding(c.id), setNewTitle(''))}>
                  ＋
                </button>
              </div>
              <div className="col-body">
                {list.map((t) => {
                  const a = byId(t.assignee)
                  return (
                    <div key={t.id} className={'task-slot' + (over?.col === c.id && over.before === t.id ? ' insert' : '')} onDragOver={(e) => onDragOverCard(e, c.id, t.id)}>
                      <button className={'task prio-' + t.priority + (t.id === dragId ? ' dragging' : '') + (t.id === openId ? ' open' : '')} draggable onDragStart={(e) => onDragStart(e, t.id)} onDragEnd={() => (setDragId(null), setOver(null))} onClick={() => setOpenId(t.id)}>
                        <div className="task-top">
                          <span className="task-num">#{t.number}</span>
                          {t.labels.map((l) => (
                            <span key={l} className="label">
                              {l}
                            </span>
                          ))}
                        </div>
                        <div className="task-title">{t.title}</div>
                        <div className="task-foot">
                          {t.priority !== 'normal' && <span className={'prio ' + t.priority}>{t.priority}</span>}
                          {t.comments.length > 0 && <span className="task-meta">💬 {t.comments.length}</span>}
                          <span style={{ flex: 1 }} />
                          {a ? <Avatar agent={a} size={20} running={running.has(a.id)} /> : t.assignee === 'me' ? <span className="initials tiny">RC</span> : null}
                        </div>
                      </button>
                    </div>
                  )
                })}
                {over?.col === c.id && over.before === null && dragId && <div className="task-slot insert end" />}
                {adding === c.id ? (
                  <input
                    className="quick-add"
                    autoFocus
                    placeholder="Task title, Enter to add"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onBlur={() => setAdding(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void quickAdd(c.id)
                      if (e.key === 'Escape') setAdding(null)
                    }}
                  />
                ) : (
                  <button className="quick-add-btn" onClick={() => (setAdding(c.id), setNewTitle(''))}>
                    ＋ Add task
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {open && <Drawer task={open} agents={agents} running={running} nameOf={nameOf} onClose={() => setOpenId(null)} />}
    </div>
  )
}

// ---------- drawer ----------
function Drawer({ task, agents, running, nameOf, onClose }: { task: Task; agents: Agent[]; running: Set<string>; nameOf: (id?: string) => string; onClose: () => void }) {
  const api = window.api
  const [title, setTitle] = useState(task.title)
  const [desc, setDesc] = useState(task.description)
  const [editDesc, setEditDesc] = useState(false)
  const [labels, setLabels] = useState(task.labels.join(', '))
  const [comment, setComment] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [asked, setAsked] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    setTitle(task.title)
    setDesc(task.description)
    setLabels(task.labels.join(', '))
    setEditDesc(false)
    setConfirm(false)
    setAsked(false)
  }, [task.id])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const patch = (p: Partial<Task>) => void api.updateTask(task.id, p)
  const assignee = task.assignee && task.assignee !== 'me' ? agents.find((a) => a.id === task.assignee) : null
  const ask = async () => {
    await api.askAgent(task.id)
    setAsked(true)
  }

  return (
    <aside className="drawer">
      <div className="drawer-head">
        <span className="task-num">#{task.number}</span>
        <span className="hint">created {formatTime(task.createdAt)} by {nameOf(task.createdBy) || 'agent'}</span>
        <span style={{ flex: 1 }} />
        <button className="icon-btn" onClick={onClose} title="Close">
          ×
        </button>
      </div>
      <input ref={titleRef} className="drawer-title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== task.title && patch({ title: title.trim() })} onKeyDown={(e) => e.key === 'Enter' && titleRef.current?.blur()} />
      <div className="drawer-grid">
        <label>Status</label>
        <select value={task.status} onChange={(e) => patch({ status: e.target.value as TaskStatus })}>
          {COLS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <label>Assignee</label>
        <select value={task.assignee ?? ''} onChange={(e) => patch({ assignee: e.target.value || undefined })}>
          <option value="">Unassigned</option>
          <option value="me">Rafael</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.emoji} {a.name}
            </option>
          ))}
        </select>
        <label>Priority</label>
        <select value={task.priority} onChange={(e) => patch({ priority: e.target.value as TaskPriority })}>
          {PRIO.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <label>Labels</label>
        <input
          value={labels}
          placeholder="comma, separated"
          onChange={(e) => setLabels(e.target.value)}
          onBlur={() =>
            patch({
              labels: labels
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            })
          }
        />
      </div>
      {assignee && (
        <div className="drawer-ask">
          <Avatar agent={assignee} size={22} running={running.has(assignee.id)} />
          <span>{assignee.name}</span>
          <span style={{ flex: 1 }} />
          <button className="btn small primary" onClick={ask} disabled={asked} title="Send this task to the agent as a message. Nothing happens otherwise.">
            {asked ? 'Sent ✓' : '▶ Ask agent to work on it'}
          </button>
        </div>
      )}
      <div className="drawer-section">
        <div className="drawer-label">
          Description
          {!editDesc && (
            <button className="note-btn" onClick={() => setEditDesc(true)}>
              Edit
            </button>
          )}
        </div>
        {editDesc ? (
          <textarea className="drawer-desc" autoFocus value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => (patch({ description: desc }), setEditDesc(false))} placeholder="Markdown…" />
        ) : task.description ? (
          <div className="drawer-md" onDoubleClick={() => setEditDesc(true)}>
            <Markdown text={task.description} />
          </div>
        ) : (
          <div className="hint drawer-md" onClick={() => setEditDesc(true)}>
            No description. Click to add.
          </div>
        )}
      </div>
      <div className="drawer-section">
        <div className="drawer-label">Comments</div>
        {task.comments.map((c, i) => (
          <div key={i} className={'tcomment' + (c.author === 'me' ? ' me' : '')}>
            <span className="note-who">{nameOf(c.author) || 'agent'}</span>
            <span className="hint">{formatTime(c.ts)}</span>
            <div>
              <Markdown text={c.text} />
            </div>
          </div>
        ))}
        <input
          className="tcomment-input"
          placeholder="Comment… (Enter)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === 'Enter' && comment.trim()) {
              await api.commentTask(task.id, comment.trim())
              setComment('')
            }
          }}
        />
      </div>
      <div className="drawer-foot">
        <button className="btn danger" onClick={() => (confirm ? (api.deleteTask(task.id), onClose()) : setConfirm(true))}>
          {confirm ? 'Really delete?' : 'Delete task'}
        </button>
      </div>
    </aside>
  )
}
