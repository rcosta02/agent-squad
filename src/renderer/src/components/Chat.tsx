import { Fragment, useCallback, useLayoutEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { IClock, IPlan, IPlug, ISession, IStop } from './Icons'
import { formatTime } from '../lib'
import type { Agent, Msg } from '../../../shared/types'
import type { AssistantMsg, ResultMsg, ToolMsg, UserMsg } from '../lib'
import Avatar from './Avatar'
import Composer, { fileToDataUrl } from './Composer'
import McpModal from './McpModal'
import PermissionCard from './PermissionCard'
import ToolCard from './ToolCard'

type Props = {
  agent: Agent
  msgs: Msg[] | undefined
  running: boolean
  onSend: (text: string, images: string[], planMode: boolean, files: string[]) => void
  onOpenPlan: (planId: string) => void
  onStop: () => void
  onEdit: () => void
  onNewSession: () => void
  onRoutines: () => void
  routineCount: number
  names: string[] // other agents in the workspace, for @mentions
  onSwitchSession: (sessionId: string) => void
  onPermission: (toolUseId: string, allow: boolean) => void
}

// ---------- minimal markdown ----------

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void window.api.copy(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }
  return (
    <div className="codeblock">
      <button className={'copy-btn' + (copied ? ' copied' : '')} onClick={copy} title="Copy">
        {copied ? (
          '✓'
        ) : (
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="5" y="5" width="9" height="9" rx="1.5" />
            <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
          </svg>
        )}
      </button>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}

let MENTION_NAMES: string[] = [] // set by the active chat; names sorted longest first
export const setMentionNames = (names: string[]) => {
  MENTION_NAMES = [...names].sort((a, b) => b.length - a.length)
}
const mentionRe = () => (MENTION_NAMES.length ? new RegExp('@(' + MENTION_NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![\\w])', 'gi') : null)

function withMentions(s: string, k0: number): ReactNode[] {
  const re = mentionRe()
  if (!re) return [s]
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let k = k0
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index))
    out.push(
      <span key={'m' + k++} className="mention">
        @{m[1]}
      </span>
    )
    last = m.index + m[0].length
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(...withMentions(s.slice(last, m.index), k * 100))
    const t = m[0]
    if (t.startsWith('`')) out.push(<code key={k++}>{t.slice(1, -1)}</code>)
    else out.push(<strong key={k++}>{t.slice(2, -2)}</strong>)
    last = m.index + t.length
  }
  if (last < s.length) out.push(...withMentions(s.slice(last), k * 100 + 1))
  return out
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let k = 0
  while (i < lines.length) {
    const line = lines[i]
    const img = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(line)
    if (img) {
      const src = img[2].startsWith('/') ? 'file://' + img[2] : img[2]
      blocks.push(<img key={k++} className="md-img" src={src} alt={img[1]} />)
      i++
      continue
    }
    if (line.startsWith('```')) {
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++])
      i++
      blocks.push(<CodeBlock key={k++} code={buf.join('\n')} />)
      continue
    }
    // table: header row, separator row, body rows
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? '')) {
      const cells = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
      const head = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]))
      blocks.push(
        <div key={k++} className="md-table">
          <table>
            <thead>
              <tr>
                {head.map((h, j) => (
                  <th key={j}>{inline(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {head.map((_, j) => (
                    <td key={j}>{inline(r[j] ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }
    const h = /^(#{1,4})\s+(.+)$/.exec(line)
    if (h) {
      const Tag = (['h1', 'h2', 'h3', 'h4'] as const)[h[1].length - 1]
      blocks.push(<Tag key={k++} className="md-h">{inline(h[2])}</Tag>)
      i++
      continue
    }
    const ol = /^\d+\.\s+/.test(line)
    if (ol) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\d+\.\s+/, ''))
      blocks.push(
        <ol key={k++}>
          {items.map((it, j) => (
            <li key={j}>{inline(it)}</li>
          ))}
        </ol>
      )
      continue
    }
    if (line.startsWith('* ')) {
      const items: string[] = []
      while (i < lines.length && lines[i].startsWith('* ')) items.push(lines[i++].slice(2))
      blocks.push(
        <ul key={k++}>
          {items.map((it, j) => (
            <li key={j}>{inline(it)}</li>
          ))}
        </ul>
      )
      continue
    }
    if (line.startsWith('- ')) {
      const items: string[] = []
      while (i < lines.length && lines[i].startsWith('- ')) items.push(lines[i++].slice(2))
      blocks.push(
        <ul key={k++}>
          {items.map((it, j) => (
            <li key={j}>{inline(it)}</li>
          ))}
        </ul>
      )
      continue
    }
    if (line.trim() === '') {
      i++
      continue
    }
    const buf: string[] = [lines[i++]] // always consume at least one line: a partial table/list line during streaming must not stall the loop
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('```') && !lines[i].startsWith('- ') && !lines[i].startsWith('* ') && !/^\s*\|/.test(lines[i]) && !/^#{1,4}\s/.test(lines[i]) && !/^\d+\.\s/.test(lines[i])) buf.push(lines[i++])
    blocks.push(
      <p key={k++}>
        {buf.map((l, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(l)}
          </Fragment>
        ))}
      </p>
    )
  }
  return <>{blocks}</>
}

// ---------- message renderers ----------

function UserBubble({ msg }: { msg: UserMsg }) {
  if (msg.from)
    return (
      <div className="msg-row">
        <div className="bubble from">
          <div className="from-label">{msg.group ? '# general · ' : 'Message from '}{msg.from}</div>
          {withMentions(msg.text, 0)}
        </div>
      </div>
    )
  return (
    <div className="msg-row user">
      <div className="bubble user">
        {msg.routine && <div className="routine-tag"><IClock /> {msg.routine}</div>}
        {msg.group && <div className="routine-tag"># general</div>}
        {msg.files && msg.files.length > 0 && (
          <div className="bubble-files">
            {msg.files.map((p) => (
              <span key={p} className="file-chip static" title={p}>
                {p.split('/').pop()}
              </span>
            ))}
          </div>
        )}
        {msg.images && msg.images.length > 0 && (
          <div className="bubble-images">
            {msg.images.map((p) => (
              <img key={p} src={'file://' + p} alt="" />
            ))}
          </div>
        )}
        {withMentions(msg.text, 0)}
      </div>
    </div>
  )
}

function AssistantBubble({ msg }: { msg: AssistantMsg }) {
  return (
    <div className="msg-row">
      <div className="bubble assistant">
        <Markdown text={msg.text} />
        {msg.streaming && <span className="cursor" />}
      </div>
    </div>
  )
}

function ResultLine({ msg }: { msg: ResultMsg }) {
  const parts: string[] = [msg.error ? msg.text || 'Error' : 'Done']
  if (msg.durationMs !== undefined) parts.push(Math.max(1, Math.round(msg.durationMs / 1000)) + 's')
  return <div className={'result' + (msg.error ? ' error' : '')}>{parts.join(' · ')}</div>
}

// ---------- chat ----------

function statusText(msgs: Msg[] | undefined, running: boolean): string | null {
  if (!running) return null
  const last = msgs?.[msgs.length - 1]
  if (!last) return 'Thinking…'
  if (last.role === 'tool' && !last.done) return `Running ${last.name}…`
  if (last.role === 'permission' && !last.decision) return 'Waiting for your approval'
  if (last.role === 'assistant' && last.streaming) return 'Writing…'
  return 'Thinking…'
}

export default function Chat({ agent, msgs, running, onSend, onStop, onEdit, onNewSession, onSwitchSession, onPermission, onRoutines, routineCount, names, onOpenPlan }: Props) {
  setMentionNames(names)
  const listRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState(false)
  const [mcpOpen, setMcpOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [dropped, setDropped] = useState<string[]>([])
  const [droppedFiles, setDroppedFiles] = useState<string[]>([])
  const clearDropped = useCallback(() => (setDropped([]), setDroppedFiles([])), [])
  const dragDepth = useRef(0)

  const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (![...e.dataTransfer.types].includes('Files')) return
    e.preventDefault()
    dragDepth.current++
    setDragging(true)
  }
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }
  const onDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const all = [...e.dataTransfer.files]
    const imgs = all.filter((f) => f.type.startsWith('image/'))
    const others = all.filter((f) => !f.type.startsWith('image/')).map((f) => window.api.pathForFile(f)).filter(Boolean)
    if (imgs.length) setDropped(await Promise.all(imgs.map(fileToDataUrl)))
    if (others.length) setDroppedFiles(others)
  }
  const nearBottom = useRef(true)

  const onScroll = () => {
    const el = listRef.current
    if (!el) return
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  useLayoutEffect(() => {
    nearBottom.current = true
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [agent.id])

  const status = statusText(msgs, running)

  useLayoutEffect(() => {
    const el = listRef.current
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight
  }, [msgs, status])

  // Group consecutive tool messages into one card.
  const items: ReactNode[] = []
  if (msgs) {
    let i = 0
    while (i < msgs.length) {
      const m = msgs[i]
      if (m.role === 'tool') {
        const group: ToolMsg[] = []
        while (i < msgs.length && msgs[i].role === 'tool') group.push(msgs[i++] as ToolMsg)
        items.push(<ToolCard key={group[0].id} msgs={group} />)
        continue
      }
      i++
      switch (m.role) {
        case 'user':
          items.push(<UserBubble key={m.id} msg={m} />)
          break
        case 'assistant':
          items.push(<AssistantBubble key={m.id} msg={m} />)
          break
        case 'permission':
          items.push(<PermissionCard key={m.id} msg={m} onRespond={(allow) => onPermission(m.toolUseId, allow)} />)
          break
        case 'result':
          items.push(<ResultLine key={m.id} msg={m} />)
          break
        case 'plan':
          items.push(
            <div key={m.id} className="msg-row">
              <button className={'plan-card ' + m.status} onClick={() => onOpenPlan(m.planId)}>
                <span className="plan-ico"><IPlan /></span>
                <span className="plan-title">{m.title}</span>
                {m.revision && m.revision > 1 && <span className="hint">rev {m.revision}</span>}
                {m.progress && (
                  <span className="progress">
                    <span className="progress-bar" style={{ width: `${Math.round((100 * m.progress.done) / m.progress.total)}%` }} />
                    <span className="progress-txt">
                      {m.progress.done}/{m.progress.total}
                    </span>
                  </span>
                )}
                <span className={'pill ' + m.status}>{m.status === 'pending' ? 'needs review' : m.status}</span>
                <span className="plan-open">Open →</span>
              </button>
            </div>
          )
          break
        case 'divider':
          items.push(
            <div key={m.id} className="divider">
              <span>{m.text}</span>
            </div>
          )
          break
      }
    }
  }

  return (
    <div
      className={'chat-drop' + (dragging ? ' dragging' : '')}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragging && <div className="drop-overlay">Drop files to attach</div>}
      {mcpOpen && <McpModal agent={agent} onClose={() => setMcpOpen(false)} />}
      <header className="chat-header">
        <Avatar agent={agent} size={20} />
        <span className="name">{agent.name}</span>
        {status && (
          <span className="status">
            <span className="status-dot" />
            {status}
          </span>
        )}
        {running && (
          <button className="stop-btn" onClick={onStop}>
            <IStop /> Stop
          </button>
        )}
        <div className="menu-wrap">
          <button className="icon-btn" title="Sessions" onClick={() => setMenu((v) => !v)} disabled={running}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          {menu && (
            <>
              <div className="menu-backdrop" onClick={() => setMenu(false)} />
              <div className="menu">
                <button
                  className="menu-item"
                  onClick={() => {
                    setMenu(false)
                    onNewSession()
                  }}
                >
                  <ISession /> New session
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    setMenu(false)
                    setMcpOpen(true)
                  }}
                >
                  <IPlug /> MCP servers{agent.mcp ? ` (${agent.mcp.filter((s) => s.status === 'connected').length}/${agent.mcp.length})` : ''}
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    setMenu(false)
                    onRoutines()
                  }}
                >
                  <IClock /> Routines{routineCount ? ` (${routineCount})` : ''}
                </button>
                {(agent.sessions ?? []).length > 0 && <div className="menu-label">Previous sessions</div>}
                {[...(agent.sessions ?? [])].reverse().map((s) => (
                  <button
                    key={s.sessionId}
                    className={'menu-item' + (s.sessionId === agent.sessionId ? ' current' : '')}
                    onClick={() => {
                      setMenu(false)
                      onSwitchSession(s.sessionId)
                    }}
                  >
                    <span className="menu-title">{s.title || 'Untitled'}</span>
                    <span className="menu-time">{formatTime(s.startedAt)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button className="icon-btn" title="Edit agent" onClick={onEdit}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </button>
      </header>
      <div className="messages" ref={listRef} onScroll={onScroll}>
        {msgs && msgs.length === 0 ? (
          <div className="empty">
            <div>Say something to {agent.name}</div>
            <div className="mono">{agent.cwd}</div>
          </div>
        ) : (
          items
        )}
        {status && (
          <div className="typing">
            <span className="typing-dots">
              <i />
              <i />
              <i />
            </span>
            {status}
          </div>
        )}
      </div>
      <Composer agentId={agent.id} agentName={agent.name} running={running} pending={dropped} pendingFiles={droppedFiles} onClearPending={clearDropped} onSend={onSend} onStop={onStop} names={names} allowPlan commands={agent.commands} />
    </div>
  )
}
