import { EditorSelection, type StateCommand } from '@codemirror/state'
import { indentLess, indentMore } from '@codemirror/commands'
import type { KeyBinding } from '@codemirror/view'

/** Wrap or unwrap the selection with a delimiter (**, *, ~~). No selection: wrap the word under the cursor. */
const toggleWrap =
  (d: string): StateCommand =>
  ({ state, dispatch }) => {
    const tr = state.changeByRange((r) => {
      let { from, to } = r
      if (from === to) {
        const line = state.doc.lineAt(from)
        const before = line.text.slice(0, from - line.from).match(/[\w-]*$/)![0].length
        const after = line.text.slice(from - line.from).match(/^[\w-]*/)![0].length
        from -= before
        to += after
      }
      const text = state.doc.sliceString(from, to)
      const outer = state.doc.sliceString(from - d.length, to + d.length)
      if (outer.startsWith(d) && outer.endsWith(d) && outer.length >= 2 * d.length) {
        return { changes: [{ from: from - d.length, to: from }, { from: to, to: to + d.length }], range: EditorSelection.range(from - d.length, to - d.length) }
      }
      if (text.startsWith(d) && text.endsWith(d) && text.length >= 2 * d.length) {
        return { changes: { from, to, insert: text.slice(d.length, -d.length) }, range: EditorSelection.range(from, to - 2 * d.length) }
      }
      return { changes: { from, to, insert: d + text + d }, range: EditorSelection.range(from + d.length, to + d.length) }
    })
    dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input' }))
    return true
  }

const insertLink: StateCommand = ({ state, dispatch }) => {
  const tr = state.changeByRange((r) => {
    const text = state.doc.sliceString(r.from, r.to)
    const isUrl = /^https?:\/\//.test(text)
    const insert = isUrl ? `[](${text})` : `[${text}]()`
    const cursor = isUrl ? r.from + 1 : r.from + text.length + 3
    return { changes: { from: r.from, to: r.to, insert }, range: EditorSelection.cursor(cursor) }
  })
  dispatch(state.update(tr, { userEvent: 'input' }))
  return true
}

/** Cmd+Enter: toggle "- [ ]" ⇄ "- [x]" on every selected line; plain list items become tasks. */
const toggleTask: StateCommand = ({ state, dispatch }) => {
  const changes: { from: number; to: number; insert: string }[] = []
  const seen = new Set<number>()
  for (const r of state.selection.ranges) {
    for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) {
      if (seen.has(n)) continue
      seen.add(n)
      const l = state.doc.line(n)
      const m = l.text.match(/^(\s*(?:[-*+]|\d+[.)])\s+)(\[([ xX])\]\s)?/)
      if (!m) continue
      const at = l.from + m[1].length
      if (m[2]) changes.push({ from: at + 1, to: at + 2, insert: m[3] === ' ' ? 'x' : ' ' })
      else changes.push({ from: at, to: at, insert: '[ ] ' })
    }
  }
  if (!changes.length) return false
  dispatch(state.update({ changes, userEvent: 'input' }))
  return true
}

export const kbKeymap: KeyBinding[] = [
  { key: 'Mod-b', run: toggleWrap('**') },
  { key: 'Mod-i', run: toggleWrap('*') },
  { key: 'Mod-Shift-x', run: toggleWrap('~~') },
  { key: 'Mod-k', run: insertLink },
  { key: 'Mod-Enter', run: toggleTask },
  { key: 'Tab', run: indentMore },
  { key: 'Shift-Tab', run: indentLess }
]
