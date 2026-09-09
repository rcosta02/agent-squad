import { useEffect, useState } from 'react'
import type { Agent, Routine } from '../../../shared/types'
import { formatTime } from '../lib'

const PRESETS: [string, string][] = [
  ['0 8-18 * * 1-5', 'Every hour, Mon–Fri 8:00–18:00'],
  ['*/30 8-18 * * 1-5', 'Every 30 min, Mon–Fri 8:00–18:00'],
  ['0 * * * *', 'Every hour'],
  ['0 9 * * 1-5', 'Daily 9:00, Mon–Fri'],
  ['0 9 * * 1', 'Mondays 9:00']
]

const describe = (cron: string) => PRESETS.find(([c]) => c === cron)?.[1] ?? cron

type Props = {
  agent: Agent
  routines: Routine[]
  onClose: () => void
}

export default function RoutinesModal({ agent, routines, onClose }: Props) {
  const [adding, setAdding] = useState(routines.length === 0)
  const [name, setName] = useState('')
  const [cron, setCron] = useState(PRESETS[0][0])
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const api = window.api
  const create = async () => {
    try {
      await api.createRoutine({ agentId: agent.id, name: name.trim(), cron: cron.trim(), prompt: prompt.trim() })
      setName('')
      setPrompt('')
      setError('')
      setAdding(false)
    } catch (e) {
      setError(String((e as Error).message).replace(/^.*Error: /, ''))
    }
  }
  const valid = name.trim() && cron.trim() && prompt.trim()

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide" role="dialog">
        <h2>Routines · {agent.name}</h2>

        {routines.length === 0 && !adding && <div className="hint">No routines yet.</div>}
        {routines.map((r) => (
          <div key={r.id} className={'routine ' + r.status}>
            <div className="routine-main">
              <div className="routine-top">
                <span className="routine-name">{r.name}</span>
                <span className={'pill ' + r.status}>{r.status}</span>
              </div>
              <div className="routine-meta">
                <span>{describe(r.cron)}</span>
                {r.lastRunAt && (
                  <span>
                    · last {formatTime(r.lastRunAt)}
                    {r.lastResult && r.lastResult !== 'ok' ? ` (${r.lastResult})` : ''}
                  </span>
                )}
                {r.nextRunAt && r.status === 'active' && <span>· next {formatTime(r.nextRunAt)}</span>}
              </div>
              <div className="routine-prompt">{r.prompt}</div>
            </div>
            <div className="routine-actions">
              <button className="btn small" onClick={() => api.runRoutine(r.id)} title="Run now">
                ▶
              </button>
              {r.status === 'active' && (
                <button className="btn small" onClick={() => api.updateRoutine(r.id, { status: 'paused' })}>
                  Pause
                </button>
              )}
              {r.status !== 'active' && (
                <button className="btn small" onClick={() => api.updateRoutine(r.id, { status: 'active' })}>
                  Resume
                </button>
              )}
              {r.status !== 'cancelled' && (
                <button className="btn small" onClick={() => api.updateRoutine(r.id, { status: 'cancelled' })}>
                  Cancel
                </button>
              )}
              {r.status === 'cancelled' && (
                <button className="btn small danger" onClick={() => api.deleteRoutine(r.id)}>
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}

        {adding ? (
          <div className="routine-form">
            <div className="field-row">
              <div className="field" style={{ flex: 1 }}>
                <label>Name</label>
                <input type="text" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="e.g. MR watch" />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Schedule</label>
                <select value={PRESETS.some(([c]) => c === cron) ? cron : 'custom'} onChange={(e) => e.target.value !== 'custom' && setCron(e.target.value)}>
                  {PRESETS.map(([c, label]) => (
                    <option key={c} value={c}>
                      {label}
                    </option>
                  ))}
                  <option value="custom">Custom cron…</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>Cron (min hour day month weekday, local time)</label>
              <input type="text" className="mono" value={cron} onChange={(e) => setCron(e.target.value)} />
            </div>
            <div className="field">
              <label>Prompt</label>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="What the agent should do each run. Tell it to reply 'nothing new' when there is nothing to report." />
            </div>
            {error && <div className="error-text">{error}</div>}
            <div className="modal-actions">
              {routines.length > 0 && (
                <button className="btn" onClick={() => setAdding(false)}>
                  Back
                </button>
              )}
              <span style={{ flex: 1 }} />
              <button className="btn" onClick={onClose}>
                Close
              </button>
              <button className="btn primary" disabled={!valid} onClick={create}>
                Add routine
              </button>
            </div>
          </div>
        ) : (
          <div className="modal-actions">
            <button className="btn" onClick={() => setAdding(true)}>
              ＋ New routine
            </button>
            <span style={{ flex: 1 }} />
            <button className="btn primary" onClick={onClose}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
