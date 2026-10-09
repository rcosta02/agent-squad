import { useEffect, useMemo, useState } from 'react'
import { fuzzy, stripCode } from './links'

type Props = {
  mode: 'open' | 'search'
  names: string[]
  pages: Map<string, string>
  onOpen(rel: string, line?: number): void
  onCreate(name: string): void
  onClose(): void
}

/** Cmd+O quick switcher and Cmd+Shift+F vault search share one modal. */
export default function Switcher({ mode, names, pages, onOpen, onCreate, onClose }: Props) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const items = useMemo(() => {
    if (mode === 'open') return fuzzy(q, names).slice(0, 50).map((rel) => ({ rel, line: undefined as number | undefined, ctx: '' }))
    const needle = q.trim().toLowerCase()
    if (!needle) return []
    const out: { rel: string; line?: number; ctx: string }[] = []
    for (const [rel, content] of pages) {
      const lines = content.split('\n')
      lines.forEach((l, i) => {
        if (l.toLowerCase().includes(needle)) out.push({ rel, line: i + 1, ctx: l.trim() })
      })
      if (out.length > 200) return out
    }
    return out
  }, [mode, q, names, pages])
  useEffect(() => setSel(0), [q, mode])

  const choose = (i: number) => {
    const it = items[i]
    if (it) onOpen(it.rel, it.line)
    else if (mode === 'open' && q.trim()) onCreate(q.trim())
    onClose()
  }
  const dir = (rel: string) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) : '')
  const base = (rel: string) => rel.split('/').pop()!.replace(/\.md$/, '')

  return (
    <div className="kb-switcher-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="kb-switcher" role="dialog">
        <input
          autoFocus
          value={q}
          placeholder={mode === 'open' ? 'Find or create a note…' : 'Search in all notes…'}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(items.length - 1, s + 1)))
            else if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(0, s - 1)))
            else if (e.key === 'Enter') {
              e.preventDefault()
              if (e.shiftKey && mode === 'open' && q.trim()) (onCreate(q.trim()), onClose())
              else choose(sel)
            } else if (e.key === 'Escape') onClose()
          }}
        />
        <div className="list">
          {items.map((it, i) => (
            <button key={it.rel + ':' + it.line + ':' + i} className={'item' + (i === sel ? ' sel' : '')} onMouseEnter={() => setSel(i)} onClick={() => choose(i)}>
              <span className="dir">{dir(it.rel)}</span>
              {base(it.rel)}
              {it.ctx && <span className="ctx">{mark(stripCode(it.ctx) === it.ctx ? it.ctx : it.ctx, q)}</span>}
            </button>
          ))}
          {mode === 'open' && q.trim() && !items.some((i) => base(i.rel).toLowerCase() === q.trim().toLowerCase()) && (
            <button className={'item' + (sel >= items.length ? ' sel' : '')} onClick={() => (onCreate(q.trim()), onClose())}>
              Create “{q.trim()}”
            </button>
          )}
        </div>
        <div className="hint">{mode === 'open' ? '↑↓ navigate · ↵ open · ⇧↵ create' : `${items.length} match${items.length === 1 ? '' : 'es'} · ↵ open`}</div>
      </div>
    </div>
  )
}

const mark = (s: string, q: string) => {
  const i = s.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0 || !q) return s
  return (
    <>
      {s.slice(0, i)}
      <mark>{s.slice(i, i + q.length)}</mark>
      {s.slice(i + q.length)}
    </>
  )
}
