import { useEffect, useRef, useState } from 'react'
import type { Agent, Meeting, Workspace } from '../../../shared/types'
import { formatTime } from '../lib'
import { Markdown } from './Chat'

type Props = {
  workspace: Workspace
  agents: Agent[]
  meeting: Meeting | null // the live one (any workspace)
  onBack: () => void
  onOpenAgent: (agentId: string) => void
}

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export default function MeetingView({ workspace, agents, meeting, onBack, onOpenAgent }: Props) {
  const api = window.api
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  const [stopping, setStopping] = useState(false)
  const [list, setList] = useState<Meeting[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [sumAgent, setSumAgent] = useState(agents.find((a) => /secretary|notes|meeting/i.test(a.name))?.id ?? agents[0]?.id ?? '')
  const [sent, setSent] = useState(false)
  const [tab, setTab] = useState<'transcript' | 'summary'>('transcript')
  const [summary, setSummary] = useState('')
  const [busy, setBusy] = useState(false)
  const [sumErr, setSumErr] = useState('')
  const [confirm, setConfirm] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const live = meeting && meeting.workspaceId === workspace.id && meeting.status !== 'done' ? meeting : null
  const refresh = () => api.meetingList(workspace.id).then(setList)
  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id, meeting?.status])
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [live])
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [live?.segments.length])
  useEffect(() => {
    if (!openId) return
    setSent(false)
    setConfirm(false)
    setSumErr('')
    api.meetingRead(openId).then(setText)
    api.meetingSummary(openId).then((sm) => {
      setSummary(sm)
      setTab(sm ? 'summary' : 'transcript')
    })
  }, [openId, api])

  const start = async () => {
    setError('')
    try {
      await api.meetingStart(workspace.id, title.trim() || `Meeting ${new Date().toLocaleString()}`)
      setTitle('')
    } catch (e) {
      setError(String((e as Error).message).replace(/^.*Error: /, ''))
    }
  }
  const stop = async () => {
    setStopping(true)
    await api.meetingStop()
    setStopping(false)
    void refresh()
  }
  const elapsed = live ? (now - live.startedAt) / 1000 : 0
  const opened = list.find((m) => m.id === openId)

  return (
    <div className="board meeting">
      <header className="chat-header board-header">
        <button className="btn small back-btn" onClick={onBack}>
          ← Conversations
        </button>
        <span className="name">{workspace.name} · Meetings</span>
        {live && (
          <span className={'rec-badge ' + live.status}>
            <span className="rec-dot" />
            {live.status === 'recording' ? 'Recording' : 'Finishing transcript…'} · {fmt(elapsed)}
          </span>
        )}
      </header>

      {live ? (
        <>
          <div className="transcript" ref={listRef}>
            {live.segments.length === 0 && <div className="hint">Listening… text appears a few seconds after each pause.</div>}
            {live.segments.map((s, i) => (
              <div key={i} className={'seg ' + s.who}>
                <span className="seg-t">{fmt(s.t)}</span>
                <span className="seg-who">{s.who === 'Me' ? 'You' : 'Them'}</span>
                <span className="seg-text">{s.text}</span>
              </div>
            ))}
            {live.pendingChunks > 0 && <div className="hint">Transcribing…</div>}
            {live.error && <div className="error-text">{live.error}</div>}
          </div>
          <footer className="plan-footer">
            <span className="hint">{live.title}</span>
            <span style={{ flex: 1 }} />
            <button className="btn primary" disabled={stopping || live.status !== 'recording'} onClick={stop}>
              {stopping ? 'Stopping…' : '■ Stop'}
            </button>
          </footer>
        </>
      ) : (
        <div className="meetings-layout">
          <aside className="meetings-side">
            <div className="meeting-new">
              <input type="text" value={title} placeholder="Meeting title" onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && start()} />
              <button className="btn primary rec-start" onClick={start} disabled={!!meeting && meeting.status !== 'done'}>
                ● Record
              </button>
              {error && <div className="error-text">{error}</div>}
            </div>
            <div className="meetings-list">
              {list.length === 0 && <div className="hint">No meetings yet.</div>}
              {list.map((m) => (
                <button key={m.id} className={'meeting-row' + (m.id === openId ? ' current' : '')} onClick={() => setOpenId(m.id)}>
                  <div className="meeting-row-title">{m.title}</div>
                  <div className="meeting-row-meta">
                    {formatTime(m.startedAt)} · {fmt(((m.endedAt ?? m.startedAt) - m.startedAt) / 1000)}
                  </div>
                </button>
              ))}
            </div>
            <div className="hint">Transcripts are saved in the workspace knowledge base under meetings/. Ask any agent about a meeting and it will grep them.</div>
          </aside>
          <section className="meeting-main">
            {!opened ? (
              <div className="empty">
                <div>Select a meeting to read its transcript.</div>
              </div>
            ) : (
              <>
                <div className="meeting-toolbar">
                  <span className="hint mono meeting-path">{opened.kbPath?.split('/').slice(-2).join('/') ?? opened.id}</span>
                  <span style={{ flex: 1 }} />
                  <select className="rev-pick" value={sumAgent} onChange={(e) => setSumAgent(e.target.value)}>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.emoji} {a.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn small"
                    disabled={busy}
                    title="Summarize right here. No agent involved."
                    onClick={async () => {
                      setBusy(true)
                      setSumErr('')
                      try {
                        setSummary(await api.meetingSummarize(opened.id))
                        setTab('summary')
                      } catch (e) {
                        setSumErr(String((e as Error).message).replace(/^.*Error: /, ''))
                      }
                      setBusy(false)
                    }}
                  >
                    {busy ? 'Summarizing…' : summary ? 'Re-summarize' : 'Summarize'}
                  </button>
                  <button
                    className="btn small primary"
                    disabled={!sumAgent || sent}
                    title="Ask the selected agent to fold this meeting into the knowledge base."
                    onClick={async () => {
                      await api.meetingToKb(opened.id, sumAgent)
                      setSent(true)
                    }}
                  >
                    {sent ? 'Sent to agent ✓' : 'Add to knowledge base'}
                  </button>
                  {sent && (
                    <button className="note-btn" onClick={() => onOpenAgent(sumAgent)}>
                      Open chat →
                    </button>
                  )}
                  <button className="btn small danger" onClick={() => (confirm ? (api.meetingDelete(opened.id).then(refresh), setOpenId(null)) : setConfirm(true))}>
                    {confirm ? 'Really delete?' : 'Delete'}
                  </button>
                </div>
                {sumErr && <div className="error-text" style={{ padding: '8px 16px' }}>{sumErr}</div>}
                <div className="tabs">
                  <button className={'tab' + (tab === 'transcript' ? ' on' : '')} onClick={() => setTab('transcript')}>
                    Transcript
                  </button>
                  <button className={'tab' + (tab === 'summary' ? ' on' : '')} onClick={() => setTab('summary')} disabled={!summary && !busy}>
                    Summary
                  </button>
                </div>
                <div className="meeting-doc">
                  {tab === 'summary' ? busy && !summary ? <div className="hint">Summarizing…</div> : <Markdown text={summary} /> : <Markdown text={text} />}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
