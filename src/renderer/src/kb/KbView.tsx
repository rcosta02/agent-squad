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
  useEffect(() => localStorage.setItem('kb-left', left ? '1' : '0'), [left])
  useEffect(() => localStorage.setItem('kb-right', right ? '1' : '0'), [right])

  const untitled = (dir: string) => {
    let n = 0
    const name = () => (dir ? dir + '/' : '') + (n ? `Untitled ${n}` : 'Untitled') + '.md'
    while (kb.pages.has(name())) n++
    return name()
  }
  const create = useCallback((dir: string) => void kb.create(untitled(dir)), [kb])
  const mkdir = useCallback(
    async (parent: string) => {
      let n = 0
      const name = () => (parent ? parent + '/' : '') + (n ? `New folder ${n}` : 'New folder')
      const taken = new Set([...kb.names.map((p) => p.split('/').slice(0, -1).join('/')), ...extraDirs])
      while (taken.has(name())) n++
      await kb.mkdir(name())
      setExtraDirs((d) => [...d, name()])
    },
    [kb, extraDirs]
  )
  const openLink = useCallback(
    (target: string) => {
      const rel = kb.resolve(target)
      if (rel) void kb.open(rel)
      else {
        const dir = kb.current?.includes('/') ? kb.current.slice(0, kb.current.lastIndexOf('/')) : ''
        void kb.create((target.includes('/') ? '' : dir ? dir + '/' : '') + target + '.md')
      }
    },
    [kb]
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
  const Side = ({ on, onToggle, title, d }: { on: boolean; onToggle: () => void; title: string; d: string }) => (
    <button className={'kb-icon-btn' + (on ? ' on' : '')} title={title} onClick={onToggle}>
      <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><path d={d} /></svg>
    </button>
  )

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
          <FileTree wsId={wsId} names={kb.names} extraDirs={extraDirs} current={kb.current} onOpen={(r) => void kb.open(r)} onCreate={create} onMkdir={(d) => void mkdir(d)} onRename={(a, b) => void kb.rename(a, b)} onDelete={(r) => void kb.remove(r)} />
        </div>
        <div className="kb-main">
          <div className="kb-topbar">
            <Side on={left} onToggle={() => setLeft((v) => !v)} title="Toggle files" d="M9 4v16" />
            <span className="crumb">{kb.current?.replace(/\.md$/, '').split('/').join(' / ')}</span>
            <button className="kb-icon-btn" title="Quick open ⌘O" onClick={() => setSwitcher('open')}>
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            </button>
            <Side on={right} onToggle={() => setRight((v) => !v)} title="Toggle backlinks" d="M15 4v16" />
          </div>
          <div className="kb-scroll">
            {kb.current ? (
              <div className="kb-page">
                <InlineTitle rel={kb.current} onRename={(to) => void kb.rename(kb.current!, to)} />
                <Editor value={kb.text} docKey={kb.current} pages={kb.names} resolve={kb.resolve} imgUrl={(r) => window.api.kbUrl(wsId, resolveAsset(kb.current!, r))} onChange={kb.setText} onOpenLink={openLink} scrollToLine={kb.jump} />
              </div>
            ) : (
              <div className="kb-empty">No note open. ⌘O to find one, ⌘N to create.</div>
            )}
          </div>
          <div className="kb-status">
            <span>{kb.diskChanged ? <span className="warn">Changed on disk · <button onClick={kb.acceptDisk}>Reload</button></span> : kb.dirty ? 'Unsaved' : 'Saved'}</span>
            <span className="grow" />
            <span>{words} words</span>
          </div>
        </div>
        <div className={'kb-side right' + (right ? '' : ' collapsed')}>
          <Backlinks current={kb.current} pages={kb.pages} graph={kb.graph} resolve={kb.resolve} onOpen={(r, l) => void kb.open(r, l)} />
        </div>
      </div>
      {switcher && <Switcher mode={switcher} names={kb.names} pages={kb.pages} onOpen={(r, l) => void kb.open(r, l)} onCreate={(name) => void kb.create(name)} onClose={() => setSwitcher(null)} />}
    </div>
  )
}

/** Image paths in a note resolve relative to the note's folder unless they start at the vault root. */
const resolveAsset = (note: string, rel: string) => {
  if (rel.startsWith('/')) return rel.slice(1)
  const dir = note.includes('/') ? note.slice(0, note.lastIndexOf('/') + 1) : ''
  return dir + rel
}
