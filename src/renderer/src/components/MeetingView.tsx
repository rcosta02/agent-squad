import { useEffect, useRef, useState } from 'react'
import type { Agent, Meeting } from '../../../shared/types'

type Props = {
  agents: Agent[]
  meeting: Meeting | null
  onBack: () => void
  onOpenAgent: (agentId: string) => void
}

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export default function MeetingView({ agents, meeting, onBack, onOpenAgent }: Props) {
  const api = window.api
  const [title, setTitle] = useState('')
  const [agentId, setAgentId] = useState(agents.find((a) => /secretary|notes|meeting/i.test(a.name))?.id ?? agents[0]?.id ?? '')
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  const [stopping, setStopping] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const recording = meeting?.status === 'recording'
  useEffect(() => {
    if (!recording) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [recording])
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [meeting?.segments.length])

  const start = async () => {
    setError('')
    try {
      await api.meetingStart(agentId, title.trim() || `Meeting ${new Date().toLocaleString()}`)
    } catch (e) {
      setError(String((e as Error).message).replace(/^.*Error: /, ''))
    }
  }
  const stop = async () => {
    setStopping(true)
    await api.meetingStop()
    setStopping(false)
  }

  const agent = agents.find((a) => a.id === meeting?.agentId)
  const elapsed = meeting ? ((meeting.endedAt ?? now) - meeting.startedAt) / 1000 : 0

  return (
    <div className="board meeting">
      <header className="chat-header board-header">
        <button className="btn small back-btn" onClick={onBack}>
          ← Conversations
        </button>
        <span className="name">Note taker</span>
        {meeting && (
          <span className={'rec-badge ' + meeting.status}>
            <span className="rec-dot" />
            {meeting.status === 'recording' ? 'Recording' : meeting.status === 'stopping' ? 'Finishing transcript…' : meeting.status === 'summarizing' ? 'Summarizing' : 'Done'} · {fmt(elapsed)}
          </span>
        )}
      </header>

      {!meeting || meeting.status === 'done' || meeting.status === 'summarizing' ? (
        <div className="meeting-setup">
          {meeting && (
            <div className="meeting-done">
              <div>
                <b>{meeting.title}</b> · {meeting.segments.length} segments · transcript saved.
              </div>
              {meeting.status === 'summarizing' && agent && (
                <div>
                  {agent.name} is writing the summary and proposing follow-ups.{' '}
                  <button className="note-btn" onClick={() => onOpenAgent(agent.id)}>
                    Open chat →
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="field">
            <label>Meeting title</label>
            <input type="text" value={title} placeholder="e.g. Weekly sync with David" onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label>Summarize with</label>
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.emoji} {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="hint">Records your microphone and everything you hear (calls, videos). Transcribed locally with whisper.cpp. Nothing leaves this Mac until the agent summarizes. First run asks for Microphone and System Audio Recording permission.</div>
          {error && <div className="error-text">{error}</div>}
          <button className="btn primary rec-start" disabled={!agentId} onClick={start}>
            ● Start recording
          </button>
        </div>
      ) : (
        <>
          <div className="transcript" ref={listRef}>
            {meeting.segments.length === 0 && <div className="hint">Listening… text appears a few seconds after each pause.</div>}
            {meeting.segments.map((s, i) => (
              <div key={i} className={'seg ' + s.who}>
                <span className="seg-t">{fmt(s.t)}</span>
                <span className="seg-who">{s.who === 'Me' ? 'You' : 'Them'}</span>
                <span className="seg-text">{s.text}</span>
              </div>
            ))}
            {meeting.pendingChunks > 0 && <div className="hint">Transcribing {meeting.pendingChunks} chunk{meeting.pendingChunks > 1 ? 's' : ''}…</div>}
            {meeting.error && <div className="error-text">{meeting.error}</div>}
          </div>
          <footer className="plan-footer">
            <span className="hint">{meeting.title} · summary by {agent?.name}</span>
            <span style={{ flex: 1 }} />
            <button className="btn primary" disabled={stopping || meeting.status !== 'recording'} onClick={stop}>
              {stopping ? 'Stopping…' : '■ Stop & summarize'}
            </button>
          </footer>
        </>
      )}
    </div>
  )
}
