import { useEffect, useState } from 'react'
import type { Agent } from '../../../shared/types'
import { COLORS, randomEmoji } from '../lib'
import EmojiPicker from './EmojiPicker'

const MODELS: [string, string][] = [
  ['claude-fable-5-1', 'Fable 5.1'],
  ['claude-fable-5', 'Fable 5'],
  ['claude-opus-5', 'Opus 5'],
  ['claude-opus-4-8', 'Opus 4.8'],
  ['claude-opus-4-7', 'Opus 4.7'],
  ['claude-opus-4-6', 'Opus 4.6'],
  ['claude-sonnet-5', 'Sonnet 5'],
  ['claude-sonnet-4-6', 'Sonnet 4.6'],
  ['claude-haiku-4-5', 'Haiku 4.5']
]

export type AgentInput = { name: string; emoji: string; color: string; cwd: string; autonomous: boolean; systemPrompt?: string; model?: string }

type Props = {
  initial?: Agent
  onClose: () => void
  onSubmit: (input: AgentInput) => void
  onDelete?: () => void
}

export default function NewAgentModal({ initial, onClose, onSubmit, onDelete }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [emoji, setEmoji] = useState(initial?.emoji ?? randomEmoji())
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [color, setColor] = useState(initial?.color ?? COLORS[Math.floor(Math.random() * COLORS.length)])
  const [cwd, setCwd] = useState(initial?.cwd ?? '')
  const [autonomous, setAutonomous] = useState(initial?.autonomous ?? false)
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt ?? '')
  const [model, setModel] = useState(initial?.model ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const valid = name.trim().length > 0 && cwd.trim().length > 0 && emoji.trim().length > 0

  const pick = async () => {
    const dir = await window.api.pickFolder()
    if (dir) setCwd(dir)
  }

  const submit = () => {
    if (!valid) return
    const sp = systemPrompt.trim()
    onSubmit({ name: name.trim(), emoji: emoji.trim(), color, cwd: cwd.trim(), autonomous, systemPrompt: sp ? sp : undefined, model: model || undefined })
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog">
        <h2>{initial ? 'Edit agent' : 'New agent'}</h2>

        <div className="field-row">
          <div className="field">
            <label>Name</label>
            <input type="text" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="e.g. Backend" />
          </div>
          <div className="field narrow">
            <label>Emoji</label>
            <div className="emoji-field">
              <button type="button" className="emoji-btn" style={{ background: color }} onClick={() => setEmojiOpen((v) => !v)} title="Choose emoji">
                {emoji || '?'}
              </button>
            </div>
          </div>
        </div>
        {emojiOpen && <EmojiPicker value={emoji} onPick={setEmoji} onClose={() => setEmojiOpen(false)} />}

        <div className="field">
          <label>Color</label>
          <div className="swatches">
            <label className="swatch custom" style={{ background: color }} title="Custom color">
              <input type="color" value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#5ac8fa'} onChange={(e) => setColor(e.target.value)} />
              <span>+</span>
            </label>
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={'swatch' + (c === color ? ' active' : '')}
                style={{ background: c }}
                onClick={() => setColor(c)}
                title={c}
              />
            ))}
          </div>
        </div>

        <div className="field">
          <label>Folder</label>
          <div className="folder-row">
            <input type="text" value={cwd} readOnly placeholder="No folder selected" />
            <button className="btn" type="button" onClick={pick}>
              Choose…
            </button>
          </div>
        </div>

        <div className="field">
          <label>Model</label>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="">Default (your Claude Code setting)</option>
            {MODELS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <label className="check">
          <input type="checkbox" checked={autonomous} onChange={(e) => setAutonomous(e.target.checked)} />
          Autonomous — skip permission prompts
        </label>

        <div className="field">
          <label>System prompt (optional)</label>
          <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="Extra instructions appended to Claude's system prompt" />
        </div>

        <div className="modal-actions">
          {initial && onDelete && (
            <button
              className="btn danger"
              type="button"
              onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
            >
              {confirmDelete ? 'Really delete?' : 'Delete agent'}
            </button>
          )}
          <span className="spacer" />
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" type="button" onClick={submit} disabled={!valid}>
            {initial ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
