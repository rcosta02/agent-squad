import { useState } from 'react'
import { prettyJson, summarize, type PermissionMsg } from '../lib'

export default function PermissionCard({ msg, onRespond }: { msg: PermissionMsg; onRespond: (allow: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const summary = summarize(msg.name, msg.input)

  return (
    <div className="msg-row">
      <div className="perm-card">
        <div>
          Claude wants to run <strong>{msg.name}</strong>
        </div>
        {summary && <div className="summary">{summary}</div>}
        <button className="link-btn" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide details' : 'Show details'}
        </button>
        {open && (
          <div className="tool-detail" style={{ marginLeft: 0 }}>
            <label>Input</label>
            <pre>{prettyJson(msg.input)}</pre>
          </div>
        )}
        {msg.decision ? (
          <div className="perm-decided">{msg.decision === 'allow' ? 'Allowed' : 'Denied'}</div>
        ) : (
          <div className="perm-actions">
            <button className="btn primary" onClick={() => onRespond(true)}>
              Allow
            </button>
            <button className="btn" onClick={() => onRespond(false)}>
              Deny
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
