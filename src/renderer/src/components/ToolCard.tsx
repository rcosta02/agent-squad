import { useState } from 'react'
import { prettyJson, summarize, type ToolMsg } from '../lib'

export default function ToolCard({ msgs }: { msgs: ToolMsg[] }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set())

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="msg-row">
      <div className="tool-card">
        {msgs.map((m) => (
          <div key={m.id}>
            <button className="tool-line" onClick={() => toggle(m.id)}>
              <span className={'status ' + (!m.done ? 'spin' : m.error ? 'err' : 'ok')}>
                {!m.done ? '◌' : m.error ? '✗' : '✓'}
              </span>
              <span className="name">{m.name}</span>
              <span className="arrow">→</span>
              <span className="summary">{summarize(m.name, m.input)}</span>
            </button>
            {open.has(m.id) && (
              <div className="tool-detail">
                <label>Input</label>
                <pre>{prettyJson(m.input)}</pre>
                {m.output !== undefined && (
                  <>
                    <label>Output</label>
                    <pre>{m.output}</pre>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
