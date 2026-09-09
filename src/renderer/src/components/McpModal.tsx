import { useEffect, useState } from 'react'
import type { Agent, McpServerInfo } from '../../../shared/types'

type Props = { agent: Agent; onClose: () => void }
type Scope = 'user' | 'local' | 'project'

export default function McpModal({ agent, onClose }: Props) {
  const api = window.api
  const [configured, setConfigured] = useState<McpServerInfo[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [transport, setTransport] = useState<'http' | 'sse' | 'stdio'>('http')
  const [target, setTarget] = useState('')
  const [args, setArgs] = useState('')
  const [env, setEnv] = useState('')
  const [scope, setScope] = useState<Scope>('user')
  const [error, setError] = useState('')
  const [auth, setAuth] = useState<{ name: string; url?: string; result?: string } | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)

  const refresh = () => api.mcpConfigured(agent.id).then(setConfigured)
  useEffect(() => {
    void refresh()
    return api.onEvent((e) => {
      if (e.type === 'mcpAuthUrl') setAuth((a) => (a ? { ...a, url: e.url } : a))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.id])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !auth && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, auth])

  const live = agent.mcp ?? []
  const rows = [
    ...live.map((s) => ({ ...s, cfg: configured.find((c) => c.name === s.name) })),
    ...configured.filter((c) => !live.some((s) => s.name === c.name)).map((c) => ({ name: c.name, status: 'not loaded yet', tools: [] as string[], cfg: c }))
  ]

  const submit = async () => {
    setError('')
    try {
      const envObj: Record<string, string> = {}
      for (const line of env.split('\n')) {
        const m = /^\s*([\w.-]+)\s*=\s*(.*)$/.exec(line)
        if (m) envObj[m[1]] = m[2]
      }
      await api.mcpAdd(agent.id, { name: name.trim(), transport, target: target.trim(), args: args.trim() ? args.trim().split(/\s+/) : [], env: envObj, scope })
      setAdding(false)
      setName('')
      setTarget('')
      setArgs('')
      setEnv('')
      await refresh()
    } catch (e) {
      setError(String((e as Error).message).replace(/^.*Error: /, ''))
    }
  }
  const removeServer = async (n: string, s: Scope) => {
    if (confirm !== n) return setConfirm(n)
    setConfirm(null)
    try {
      await api.mcpRemove(agent.id, n, s)
      await refresh()
    } catch (e) {
      setError(String((e as Error).message).replace(/^.*Error: /, ''))
    }
  }
  const startAuth = async (n: string) => {
    setAuth({ name: n })
    try {
      const r = await api.mcpAuthStart(agent.id, n)
      setAuth({ name: n, result: r })
    } catch (e) {
      setAuth({ name: n, result: 'FAILED: ' + String((e as Error).message).replace(/^.*Error: /, '') })
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !auth && onClose()}>
      <div className="modal wide" role="dialog">
        <h2>MCP servers · {agent.name}</h2>
        {rows.length === 0 && <div className="hint">No servers. Add one below.</div>}
        <div className="mcp-list">
          {rows.map((s) => (
            <div key={s.name} className="mcp-item">
              <div className="mcp-row" onClick={() => setExpanded(expanded === s.name ? null : s.name)}>
                <span className={'mcp-dot ' + (s.status === 'connected' ? 'ok' : s.status === 'needs-auth' ? 'warn' : s.status === 'not loaded yet' ? 'idle' : 'bad')} />
                <span className="mcp-name">{s.name}</span>
                <span className="hint">
                  {s.cfg ? `${s.cfg.scope} · ${s.cfg.transport}` : s.name.startsWith('claude.ai ') ? 'claude.ai' : s.name.startsWith('plugin:') ? 'plugin' : 'app'} · {s.status}
                  {s.tools?.length ? ` · ${s.tools.length} tools` : ''}
                </span>
                {s.status === 'needs-auth' && (
                  <button className="btn small primary" onClick={(e) => (e.stopPropagation(), startAuth(s.name))}>
                    Authenticate
                  </button>
                )}
                {s.cfg && (
                  <button className="btn small danger" onClick={(e) => (e.stopPropagation(), removeServer(s.name, s.cfg!.scope))}>
                    {confirm === s.name ? 'Really remove?' : 'Remove'}
                  </button>
                )}
              </div>
              {expanded === s.name && (
                <div className="mcp-tools">
                  {s.cfg && <div className="mono hint">{s.cfg.target}</div>}
                  {s.tools?.length ? s.tools.map((t) => <code key={t}>{t}</code>) : <span className="hint">Tool list appears after the agent's next turn.</span>}
                </div>
              )}
            </div>
          ))}
        </div>

        {adding ? (
          <div className="routine-form">
            <div className="field-row">
              <div className="field" style={{ flex: 1 }}>
                <label>Name</label>
                <input type="text" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="sentry" />
              </div>
              <div className="field">
                <label>Transport</label>
                <select value={transport} onChange={(e) => setTransport(e.target.value as 'http' | 'sse' | 'stdio')}>
                  <option value="http">http</option>
                  <option value="sse">sse</option>
                  <option value="stdio">stdio</option>
                </select>
              </div>
              <div className="field">
                <label>Scope</label>
                <select value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
                  <option value="user">user (all projects)</option>
                  <option value="local">local (this folder, private)</option>
                  <option value="project">project (.mcp.json, shared)</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>{transport === 'stdio' ? 'Command' : 'URL'}</label>
              <input type="text" className="mono" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={transport === 'stdio' ? 'npx' : 'https://mcp.example.com/mcp'} />
            </div>
            {transport === 'stdio' && (
              <div className="field">
                <label>Arguments</label>
                <input type="text" className="mono" value={args} onChange={(e) => setArgs(e.target.value)} placeholder="-y @scope/my-mcp-server" />
              </div>
            )}
            {transport === 'stdio' && (
              <div className="field">
                <label>Environment (KEY=value per line)</label>
                <textarea className="mono" value={env} onChange={(e) => setEnv(e.target.value)} />
              </div>
            )}
            {error && <div className="error-text">{error}</div>}
            <div className="modal-actions">
              <button className="btn" onClick={() => setAdding(false)}>
                Back
              </button>
              <span style={{ flex: 1 }} />
              <button className="btn primary" disabled={!name.trim() || !target.trim()} onClick={submit}>
                Add server
              </button>
            </div>
          </div>
        ) : (
          <>
            {error && <div className="error-text">{error}</div>}
            <div className="hint">Changes apply on the agent's next turn. Status and tools come from the last session start.</div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setAdding(true)}>
                ＋ Add server
              </button>
              <span style={{ flex: 1 }} />
              <button className="btn primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}

        {auth && (
          <div className="auth-box">
            <div className="drawer-label">Authenticating {auth.name}</div>
            {!auth.result && (
              <>
                <div>{auth.url ? 'A browser window opened for the login.' : 'Starting the login in your browser…'} Finish it there; this closes automatically.</div>
                {auth.url && (
                  <button className="btn small" onClick={() => api.openExternal(auth.url!)}>
                    Open login page again
                  </button>
                )}
                <div className="modal-actions">
                  <button className="btn" onClick={() => (api.mcpAuthDone(), setAuth(null))}>
                    Cancel
                  </button>
                </div>
              </>
            )}
            {auth.result && (
              <>
                <div className={auth.result.startsWith('DONE') ? 'ok-text' : 'error-text'}>{auth.result}</div>
                {auth.result.startsWith('DONE') && <div className="hint">Send the agent a message to reconnect and load the tools.</div>}
                <div className="modal-actions">
                  <span style={{ flex: 1 }} />
                  <button className="btn primary" onClick={() => setAuth(null)}>
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
