import { useEffect, useRef, useState } from 'react'

/** The note's file name as an editable H1 (Obsidian's inline title). Blur or Enter renames. */
export default function InlineTitle({ rel, onRename, focusKey }: { rel: string; onRename(to: string): Promise<unknown>; focusKey?: number }) {
  const base = rel.split('/').pop()!.replace(/\.md$/, '')
  const [v, setV] = useState(base)
  useEffect(() => setV(base), [base])
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (focusKey) (ref.current?.focus(), ref.current?.select())
  }, [focusKey])
  const commit = () => {
    const t = v.trim()
    if (!t || t === base || t.includes('/')) return setV(base)
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) : ''
    onRename(dir + t + '.md').catch(() => setV(base)) // refused (exists, invalid): show the real name again
  }
  return (
    <input
      ref={ref}
      className="kb-title"
      value={v}
      readOnly={rel === 'README.md'}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.preventDefault(), (e.target as HTMLInputElement).blur())
        if (e.key === 'Escape') (setV(base), (e.target as HTMLInputElement).blur())
      }}
    />
  )
}
