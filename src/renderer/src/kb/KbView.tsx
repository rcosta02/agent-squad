import { useCallback, useEffect, useState } from 'react'
import type { Workspace } from '../../../shared/types'
import { useKb } from './useKb'
import FileTree from './FileTree'
import Backlinks from './Backlinks'
import Switcher from './Switcher'
import InlineTitle from './InlineTitle'
import Editor from './editor/Editor'
import './kb.css'

type Props = { workspace: Workspace; onClose: () => void }

export default function KbView({ workspace, onClose }: Props) {
  const kb = useKb(workspace.id)
  const wsId = workspace.id
  const [switcher, setSwitcher] = useState<'open' | 'search' | null>(null)
  const [left, setLeft] = useState(() => localStorage.getItem('kb-left') !== '0')
  const [right, setRight] = useState(() => localStorage.getItem('kb-right') !== '0')
  const [extraDirs, setExtraDirs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [focusTitle, setFocusTitle] = useState(0)
  // Every KB mutation goes through here: a refused rename/create/delete shows in the status bar instead of vanishing.
  const run = useCallback(<T,>(p: Promise<T>) => {
    return p.catch((e: unknown) => {
      const msg = String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': Error: /, '')
      setError(msg)
      setTimeout(() => setError((cur) => (cur === msg ? null : cur)), 6000)
      throw e
    })
  }, [])
  useEffect(() => localStorage.setItem('kb-left', left ? '1' : '0'), [left])
  useEffect(() => localStorage.setItem('kb-right', right ? '1' : '0'), [right])

  const untitled = (dir: string) => {
    let n = 0
    const name = () => (dir ? dir + '/' : '') + (n ? `Untitled ${n}` : 'Untitled') + '.md'
    while (kb.pages.has(name())) n++
    return name()
  }
  const create = useCallback(
    (dir: string) =>
      run(kb.create(untitled(dir)))
        .then(() => setFocusTitle((n) => n + 1))
        .catch(() => {}),
    [kb, run]
  )
  const mkdir = useCallback(
    async (parent: string) => {
      let n = 0
      const name = () => (parent ? parent + '/' : '') + (n ? `New folder ${n}` : 'New folder')
      const taken = new Set([...kb.names.map((p) => p.split('/').slice(0, -1).join('/')), ...extraDirs])
      while (taken.has(name())) n++
      await run(kb.mkdir(name())).catch(() => {})
      setExtraDirs((d) => [...d, name()])
    },
    [kb, extraDirs, run]
  )
  const openLink = useCallback(
    (target: string) => {
      const rel = kb.resolve(target)
      if (rel) void run(kb.open(rel)).catch(() => {})
      else {
        const dir = kb.current?.includes('/') ? kb.current.slice(0, kb.current.lastIndexOf('/')) : ''
        void run(kb.create((target.includes('/') ? '' : dir ? dir + '/' : '') + target + '.md')).catch(() => {})
      }
    },
    [kb, run]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'o') (e.preventDefault(), setSwitcher('open'))
      else if (mod && e.shiftKey && e.key.toLowerCase() === 'f') (e.preventDefault(), setSwitcher('search'))
      else if (mod && e.key.toLowerCase() === 'n') (e.preventDefault(), create(kb.current?.includes('/') ? kb.current.slice(0, kb.current.lastIndexOf('/')) : ''))
      else if (mod && e.key === 's') (e.preventDefault(), void kb.commit())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [kb, create])

  const words = kb.text.trim() ? kb.text.trim().split(/\s+/).length : 0
  const remove = (rel: string) => {
    if (!window.confirm(`Delete "${rel}"? This removes it from the knowledge base (git history keeps a copy).`)) return
    void run(kb.remove(rel)).catch(() => {})
  }

  return (
    <div className="board kb-root">
      <header className="chat-header board-header">
        <button className="btn small back-btn" onClick={onClose}>
          ← Conversations
        </button>
        <span className="name">{workspace.name} · Knowledge base</span>
      </header>
      <div className="kb-body">
        <div className={'kb-side' + (left ? '' : ' collapsed')}>
          <FileTree wsId={wsId} names={kb.names} extraDirs={extraDirs} current={kb.current} onOpen={(r) => void run(kb.open(r)).catch(() => {})} onCreate={(d) => void create(d)} onMkdir={(d) => void mkdir(d)} onRename={(a, b) => void run(kb.rename(a, b)).catch(() => {})} onDelete={remove} />
        </div>
        <div className="kb-main">
          <div className="kb-topbar">
            <SideToggle on={left} onToggle={() => setLeft((v) => !v)} title="Toggle files" d="M9 4v16" />
            <span className="crumb">{kb.current?.replace(/\.md$/, '').split('/').join(' / ')}</span>
            <button className="kb-icon-btn" title="Quick open ⌘O" onClick={() => setSwitcher('open')}>
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            </button>
            <SideToggle on={right} onToggle={() => setRight((v) => !v)} title="Toggle backlinks" d="M15 4v16" />
          </div>
          <div className="kb-scroll">
            {kb.current ? (
              <div className="kb-page">
                <InlineTitle rel={kb.current} focusKey={focusTitle} onRename={(to) => run(kb.rename(kb.current!, to))} />
                <Editor value={kb.text} docKey={kb.current} pages={kb.names} resolve={kb.resolve} imgUrl={(r) => window.api.kbUrl(wsId, resolveAsset(kb.current!, r))} onChange={kb.setText} onOpenLink={openLink} onOpenExternal={(u) => void window.api.openExternal(u)} scrollToLine={kb.jump} />
              </div>
            ) : (
              <div className="kb-empty">No note open. ⌘O to find one, ⌘N to create.</div>
            )}
          </div>
          <div className="kb-status">
            <span>
              {error ? (
                <span className="warn">{error}</span>
              ) : kb.diskChanged ? (
                <span className="warn">
                  Changed on disk · <button onClick={kb.acceptDisk}>Reload</button> · <button onClick={kb.keepMine}>Keep mine</button>
                </span>
              ) : kb.dirty ? (
                'Unsaved'
              ) : (
                'Saved'
              )}
            </span>
            <span className="grow" />
            <span>{words} words</span>
          </div>
        </div>
        <div className={'kb-side right' + (right ? '' : ' collapsed')}>
          <Backlinks current={kb.current} pages={kb.pages} graph={kb.graph} resolve={kb.resolve} onOpen={(r, l) => void kb.open(r, l)} />
        </div>
      </div>
      {switcher && <Switcher mode={switcher} names={kb.names} pages={kb.pages} onOpen={(r, l) => void run(kb.open(r, l)).catch(() => {})} onCreate={(name) => void run(kb.create(name)).then(() => setFocusTitle((n) => n + 1)).catch(() => {})} onClose={() => setSwitcher(null)} />}
    </div>
  )
}

const SideToggle = ({ on, onToggle, title, d }: { on: boolean; onToggle: () => void; title: string; d: string }) => (
  <button className={'kb-icon-btn' + (on ? ' on' : '')} title={title} onClick={onToggle}>
    <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><path d={d} /></svg>
  </button>
)

/** Image paths in a note resolve relative to the note's folder; main falls back to the vault root (Obsidian's shortest-path lookup). */
const resolveAsset = (note: string, rel: string) => {
  if (rel.startsWith('/')) return rel.slice(1)
  const dir = note.includes('/') ? note.slice(0, note.lastIndexOf('/') + 1) : ''
  return dir + rel
}
