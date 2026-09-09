import { useCallback, useEffect, useState } from 'react'
import type { Workspace } from '../../../shared/types'

type Props = { workspace: Workspace; onClose: () => void }

export default function KbModal({ workspace, onClose }: Props) {
  const api = window.api
  const [files, setFiles] = useState<string[]>([])
  const [current, setCurrent] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [saved, setSaved] = useState('')
  const [status, setStatus] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [newPath, setNewPath] = useState<string | null>(null) // null = input hidden
  const dirty = text !== saved

  const refresh = useCallback(async () => setFiles(await api.kbList(workspace.id)), [api, workspace.id])

  const open = useCallback(
    async (rel: string) => {
      const content = await api.kbRead(workspace.id, rel)
      setCurrent(rel)
      setText(content)
      setSaved(content)
      setConfirmDelete(false)
      setStatus('')
    },
    [api, workspace.id]
  )

  useEffect(() => {
    refresh().then(() => open('README.md'))
  }, [refresh, open])

  const save = useCallback(async () => {
    if (!current || !dirty) return
    await api.kbWrite(workspace.id, current, text)
    setSaved(text)
    setStatus('Saved · committed')
    refresh()
  }, [api, workspace.id, current, text, dirty, refresh])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, save])

  const newPage = async () => {
    const rel = (newPath ?? '').trim()
    if (!rel) return
    const clean = rel.endsWith('.md') ? rel : rel + '.md'
    setNewPath(null)
    await api.kbWrite(workspace.id, clean, `# ${clean.split('/').pop()!.replace(/\.md$/, '')}\n\n`)
    await refresh()
    await open(clean)
  }

  const remove = async () => {
    if (!current) return
    if (!confirmDelete) return setConfirmDelete(true)
    await api.kbDelete(workspace.id, current)
    setConfirmDelete(false)
    await refresh()
    await open('README.md')
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal kb" role="dialog">
        <div className="kb-side">
          <div className="kb-side-head">
            <span>{workspace.name} KB</span>
            <button className="icon-btn" title="New page" onClick={() => setNewPath(newPath === null ? 'runbooks/' : null)}>
              ＋
            </button>
          </div>
          {newPath !== null && (
            <input
              className="kb-new"
              autoFocus
              value={newPath}
              placeholder="runbooks/deploy.md"
              onChange={(e) => setNewPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void newPage()
                if (e.key === 'Escape') setNewPath(null)
              }}
            />
          )}
          <div className="kb-files">
            {files.map((f) => (
              <button key={f} className={'kb-file' + (f === current ? ' current' : '')} onClick={() => open(f)} title={f}>
                {f.includes('/') ? <span className="kb-dir">{f.split('/')[0]}/</span> : null}
                {f.split('/').pop()}
              </button>
            ))}
          </div>
          <button className="btn" onClick={() => api.openKb(workspace.id)}>
            Open in Finder
          </button>
        </div>
        <div className="kb-main">
          <div className="kb-head">
            <span className="mono">{current ?? ''}</span>
            <span className="hint">{status}</span>
            <span style={{ flex: 1 }} />
            {current && current !== 'README.md' && (
              <button className="btn small danger" onClick={remove}>
                {confirmDelete ? 'Really delete?' : 'Delete'}
              </button>
            )}
            <button className="btn small primary" disabled={!dirty} onClick={save}>
              Save ⌘S
            </button>
            <button className="btn small" onClick={onClose}>
              Close
            </button>
          </div>
          <textarea className="kb-editor" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
        </div>
      </div>
    </div>
  )
}
