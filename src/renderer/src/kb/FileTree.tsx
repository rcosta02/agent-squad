import { useEffect, useMemo, useState, type DragEvent, type MouseEvent } from 'react'

type Props = {
  wsId: string
  names: string[] // relative note paths
  extraDirs: string[] // folders without notes yet (created this session)
  current: string | null
  onOpen(rel: string): void
  onCreate(dir: string): void
  onMkdir(dir: string): void
  onRename(from: string, to: string): void
  onDelete(rel: string): void
}
type Dir = { path: string; name: string; dirs: Map<string, Dir>; files: string[] }
type Menu = { x: number; y: number; target: { kind: 'file' | 'dir' | 'root'; path: string } }

const Chev = ({ open }: { open: boolean }) => <span className={'chev' + (open ? ' open' : '')}>▶</span>

export default function FileTree({ wsId, names, extraDirs, current, onOpen, onCreate, onMkdir, onRename, onDelete }: Props) {
  const key = `kb-closed:${wsId}`
  const [closed, setClosed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(key) ?? '[]'))
    } catch {
      return new Set()
    }
  })
  const [menu, setMenu] = useState<Menu | null>(null)
  const [editing, setEditing] = useState<{ path: string; value: string } | null>(null)
  const [dropOn, setDropOn] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify([...closed]))
    } catch {}
  }, [closed, key])
  useEffect(() => {
    if (!menu) return
    const off = () => setMenu(null)
    window.addEventListener('mousedown', off)
    window.addEventListener('keydown', off)
    return () => {
      window.removeEventListener('mousedown', off)
      window.removeEventListener('keydown', off)
    }
  }, [menu])

  const root = useMemo(() => {
    const r: Dir = { path: '', name: '', dirs: new Map(), files: [] }
    const dirAt = (parts: string[]) => {
      let n = r
      for (const d of parts) {
        if (!n.dirs.has(d)) n.dirs.set(d, { path: (n.path ? n.path + '/' : '') + d, name: d, dirs: new Map(), files: [] })
        n = n.dirs.get(d)!
      }
      return n
    }
    for (const f of names) dirAt(f.split('/').slice(0, -1)).files.push(f)
    for (const d of extraDirs) dirAt(d.split('/'))
    return r
  }, [names, extraDirs])

  const toggle = (p: string) =>
    setClosed((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  const context = (e: MouseEvent, target: Menu['target']) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, target })
  }
  const base = (p: string) => p.split('/').pop()!.replace(/\.md$/, '')
  const commitEdit = () => {
    if (!editing) return
    const { path, value } = editing
    setEditing(null)
    const v = value.trim()
    if (!v || v === base(path)) return
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''
    onRename(path, parent + v + (path.endsWith('.md') ? '.md' : ''))
  }
  const drag = (e: DragEvent, rel: string) => {
    e.dataTransfer.setData('text/kb', rel)
    e.dataTransfer.effectAllowed = 'move'
  }
  const drop = (e: DragEvent, dir: string) => {
    e.preventDefault()
    e.stopPropagation() // the tree root is a drop target too
    setDropOn(null)
    const rel = e.dataTransfer.getData('text/kb')
    if (!rel) return
    const to = (dir ? dir + '/' : '') + rel.split('/').pop()
    if (to !== rel) onRename(rel, to)
  }
  const dragOver = (e: DragEvent, dir: string) => {
    if (!e.dataTransfer.types.includes('text/kb')) return
    e.preventDefault()
    e.stopPropagation()
    setDropOn(dir)
  }

  const row = (kind: 'file' | 'dir', path: string, depth: number, label: string, extra?: React.ReactNode) => {
    const isEditing = editing?.path === path
    return (
      <div
        key={path}
        className={`kb-node kb-${kind}${path === current ? ' is-active' : ''}${dropOn === path && kind === 'dir' ? ' drop' : ''}`}
        style={{ ['--depth' as string]: depth }}
        draggable={!isEditing}
        onDragStart={(e) => drag(e, path)}
        onDragOver={kind === 'dir' ? (e) => dragOver(e, path) : undefined}
        onDragLeave={kind === 'dir' ? () => setDropOn(null) : undefined}
        onDrop={kind === 'dir' ? (e) => drop(e, path) : undefined}
        onClick={() => (kind === 'file' ? onOpen(path) : toggle(path))}
        onDoubleClick={(e) => {
          e.stopPropagation()
          if (path !== 'README.md') setEditing({ path, value: base(path) })
        }}
        onContextMenu={(e) => context(e, { kind, path })}
        title={path}
      >
        {extra}
        {isEditing ? (
          <input
            autoFocus
            value={editing.value}
            onChange={(e) => setEditing({ path, value: e.target.value })}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit()
              if (e.key === 'Escape') setEditing(null)
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="kb-label">{label}</span>
        )}
      </div>
    )
  }

  const render = (d: Dir, depth: number): React.ReactNode[] => {
    const dirs = [...d.dirs.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    const files = [...d.files].sort((a, b) => (a === 'README.md' ? -1 : b === 'README.md' ? 1 : base(a).localeCompare(base(b), undefined, { sensitivity: 'base' })))
    return [
      ...dirs.flatMap((sub) => [row('dir', sub.path, depth, sub.name, <Chev open={!closed.has(sub.path)} />), ...(closed.has(sub.path) ? [] : render(sub, depth + 1))]),
      ...files.map((f) => row('file', f, depth, base(f)))
    ]
  }

  const menuDir = menu ? (menu.target.kind === 'dir' ? menu.target.path : menu.target.kind === 'file' ? menu.target.path.split('/').slice(0, -1).join('/') : '') : ''

  return (
    <>
      <div className="kb-side-head">
        <span className="title">Files</span>
        <button className="kb-icon-btn" title="New note" onClick={() => onCreate('')}>
          <svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M12 11v6M9 14h6" /></svg>
        </button>
        <button className="kb-icon-btn" title="New folder" onClick={() => onMkdir('')}>
          <svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M12 10v6M9 13h6" /></svg>
        </button>
        <button className="kb-icon-btn" title="Collapse all" onClick={() => setClosed(new Set(allDirs(root)))}>
          <svg viewBox="0 0 24 24"><path d="M7 10l5-5 5 5M7 14l5 5 5-5" /></svg>
        </button>
      </div>
      <div className="kb-tree" onContextMenu={(e) => context(e, { kind: 'root', path: '' })} onDragOver={(e) => dragOver(e, '')} onDrop={(e) => drop(e, '')}>
        {render(root, 0)}
      </div>
      {menu && (
        <div className="kb-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
          <button onClick={() => (setMenu(null), onCreate(menuDir))}>New note</button>
          <button onClick={() => (setMenu(null), onMkdir(menuDir))}>New folder</button>
          {menu.target.kind !== 'root' && menu.target.path !== 'README.md' && (
            <>
              <button onClick={() => (setMenu(null), setEditing({ path: menu.target.path, value: base(menu.target.path) }))}>Rename</button>
              {(
                <button className="danger" onClick={() => (setMenu(null), onDelete(menu.target.path))}>
                  Delete
                </button>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}

const allDirs = (d: Dir): string[] => [...d.dirs.values()].flatMap((s) => [s.path, ...allDirs(s)])
