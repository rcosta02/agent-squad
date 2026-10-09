import assert from 'node:assert/strict'
import { EditorState, EditorSelection } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { activeLines, buildDecorations, type Deco } from './livePreview.ts'

const doc = [
  /*1*/ '---',
  /*2*/ 'title: x',
  /*3*/ '---',
  /*4*/ '# Heading',
  /*5*/ 'some **bold** and _em_ and ~~gone~~ and `code`',
  /*6*/ 'link [text](http://u.x) wiki [[page]] alias [[page|Alias]] missing [[nope]]',
  /*7*/ '- item',
  /*8*/ '  - [ ] task',
  /*9*/ '1. one',
  /*10*/ '> quoted',
  /*11*/ '```js',
  /*12*/ 'x = [[page]]',
  /*13*/ '```',
  /*14*/ '---',
  /*15*/ '| a | b |',
  /*16*/ '|---|---|',
  /*17*/ '| 1 | 2 |',
  /*18*/ '',
  /*19*/ '![pic](img.png) and ![[photo.png]]',
  /*20*/ ''
].join('\n')

const resolve = (t: string) => (t === 'page' ? 'page.md' : null)
const state = (cursorLine = 20, anchorLine?: number) => {
  const s = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] })
  const head = s.doc.line(cursorLine).from
  const anchor = anchorLine ? s.doc.line(anchorLine).from : head
  return s.update({ selection: EditorSelection.single(anchor, head) }).state
}
const decos = (s: EditorState): Deco[] => buildDecorations(s, { resolve, imgUrl: (r) => 'kb://ws/' + r })
const lineText = (s: EditorState, n: number) => s.doc.line(n)
const within = (ds: Deco[], s: EditorState, n: number) => {
  const l = lineText(s, n)
  return ds.filter((d) => d.from >= l.from && d.to <= l.to)
}
const hidden = (ds: Deco[]) => ds.filter((d) => d.kind === 'hide').map((d) => doc.slice(d.from, d.to))
const classes = (ds: Deco[]) => ds.map((d) => d.cls ?? '').join(' ')

// --- inactive document: syntax hidden ---
const s0 = state()
const d0 = decos(s0)
assert.ok(hidden(within(d0, s0, 4)).includes('# '), 'heading mark hidden')
assert.ok(classes(within(d0, s0, 4)).includes('HyperMD-header-1'), 'heading line class')
assert.deepEqual(hidden(within(d0, s0, 5)), ['**', '**', '_', '_', '~~', '~~', '`', '`'], 'inline marks hidden')
assert.ok(classes(within(d0, s0, 5)).includes('cm-strong') && classes(within(d0, s0, 5)).includes('cm-inline-code'))
const l6 = within(d0, s0, 6)
assert.ok(hidden(l6).includes('[') && hidden(l6).includes('](http://u.x)'), 'md link brackets and url hidden')
assert.ok(hidden(l6).includes('[[page|'), 'alias wikilink hides target part')
assert.equal(l6.filter((d) => d.kind === 'mark' && d.cls?.includes('cm-hmd-internal-link')).length, 3, 'three wikilinks marked')
assert.equal(l6.filter((d) => d.cls?.includes('is-unresolved')).length, 1, 'one unresolved')
assert.ok(!l6.some((d) => d.kind === 'mark' && d.cls === 'cm-link' && doc.slice(d.from, d.to).includes('page')), 'wikilink not also treated as md link')
assert.ok(within(d0, s0, 7).some((d) => d.kind === 'widget' && d.widget === 'bullet'), 'bullet widget')
assert.ok(within(d0, s0, 8).some((d) => d.kind === 'widget' && d.widget === 'checkbox'), 'checkbox widget')
assert.ok(classes(within(d0, s0, 8)).includes('HyperMD-list-line-2'), 'nested list depth')
assert.ok(classes(within(d0, s0, 9)).includes('cm-list-number'), 'ordered marker styled, not hidden')
assert.ok(hidden(within(d0, s0, 10)).includes('> '), 'quote mark hidden')
assert.ok(classes(within(d0, s0, 11)).includes('HyperMD-codeblock-begin') && classes(within(d0, s0, 13)).includes('HyperMD-codeblock-end'))
assert.ok(!within(d0, s0, 12).some((d) => d.cls?.includes('internal-link')), '[[page]] inside fence is not a link')
assert.ok(within(d0, s0, 14).some((d) => d.kind === 'widget' && d.widget === 'hr'), 'hr widget')
const tbl = d0.find((d) => d.kind === 'widget' && d.widget === 'table')
assert.ok(tbl && tbl.from === lineText(s0, 15).from && tbl.to === lineText(s0, 17).to, 'whole table replaced by widget when inactive')
const fm = d0.find((d) => d.kind === 'widget' && d.widget === 'properties')
assert.ok(fm && fm.from === 0 && fm.to === lineText(s0, 3).to, 'frontmatter collapsed to properties widget')
assert.ok(!within(d0, s0, 1).some((d) => d.widget === 'hr'), 'frontmatter fence is not an hr')
const imgs = within(d0, s0, 19).filter((d) => d.widget === 'image')
assert.deepEqual(imgs.map((d) => d.src), ['kb://ws/img.png', 'kb://ws/photo.png'], 'md image and embed both render via kb://')

// --- cursor on a line reveals it ---
const s5 = state(5)
const d5 = decos(s5)
assert.deepEqual(hidden(within(d5, s5, 5)), [], 'nothing hidden on the active line')
assert.ok(classes(within(d5, s5, 5)).includes('cm-formatting'), 'marks shown as formatting')
assert.ok(classes(within(d5, s5, 5)).includes('cm-strong'), 'but styling stays')
assert.ok(hidden(within(d5, s5, 4)).includes('# '), 'other lines still hidden')

// --- cursor inside table / code / frontmatter reveals the whole block ---
const s16 = state(16)
const d16 = decos(s16)
assert.ok(!d16.some((d) => d.widget === 'table'), 'table raw when cursor inside')
assert.ok(classes(within(d16, s16, 15)).includes('HyperMD-table-row'))
const s2 = state(2)
assert.ok(!decos(s2).some((d) => d.widget === 'properties') && classes(within(decos(s2), s2, 1)).includes('HyperMD-frontmatter'))

// --- multi-line selection reveals every covered line ---
const sSel = state(4, 6)
assert.deepEqual([...activeLines(sSel)].sort((a, b) => a - b), [4, 5, 6])
const dSel = decos(sSel)
assert.deepEqual(hidden(within(dSel, sSel, 5)), [])
assert.deepEqual(hidden(within(dSel, sSel, 4)), [])
assert.ok(hidden(within(dSel, sSel, 7)).length || within(dSel, sSel, 7).some((d) => d.widget === 'bullet'), 'line outside selection still rendered')
console.log('livePreview ok')
