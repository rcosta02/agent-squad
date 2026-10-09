// Obsidian-style live preview: markdown syntax is hidden on every line the selection does not touch.
// buildDecorations() is pure (tested under node); livePreview() turns its output into CodeMirror decorations.
import { EditorState, StateEffect, StateField, type Range } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import type { SyntaxNode } from '@lezer/common'
import { BulletWidget, CheckboxWidget, HrWidget, ImageWidget, PropertiesWidget, TableWidget } from './widgets.ts'

export type Deco = {
  from: number
  to: number
  kind: 'hide' | 'mark' | 'line' | 'widget'
  cls?: string
  widget?: 'bullet' | 'checkbox' | 'hr' | 'table' | 'properties' | 'image'
  src?: string // image
  checked?: boolean // checkbox
  pos?: number // checkbox: offset of the "[" so a click can flip the marker
  target?: string // wikilink
  style?: string // line
}
export type Opts = { resolve(target: string): string | null; imgUrl(rel: string): string; focused?: boolean } // focused=false → no active lines (Obsidian shows no raw syntax in an unfocused editor)

/** 1-based line numbers touched by any selection range. */
export function activeLines(state: EditorState): Set<number> {
  const out = new Set<number>()
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number
    const b = state.doc.lineAt(r.to).number
    for (let n = a; n <= b; n++) out.add(n)
  }
  return out
}

const WIKI = /(!?)\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]*))?\]\]/g
const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i

export function buildDecorations(state: EditorState, opts: Opts): Deco[] {
  const doc = state.doc
  const out: Deco[] = []
  const active = opts.focused === false ? new Set<number>() : activeLines(state)
  const lineOf = (pos: number) => doc.lineAt(pos).number
  const isActive = (from: number, to: number) => {
    for (let n = lineOf(from); n <= lineOf(to); n++) if (active.has(n)) return true
    return false
  }
  const hide = (from: number, to: number) => from < to && out.push({ from, to, kind: 'hide' })
  const mark = (from: number, to: number, cls: string, extra: Partial<Deco> = {}) => from < to && out.push({ from, to, kind: 'mark', cls, ...extra })
  const line = (pos: number, cls: string, style?: string) => out.push({ from: doc.lineAt(pos).from, to: doc.lineAt(pos).from, kind: 'line', cls, style })
  const widget = (from: number, to: number, w: Deco['widget'], extra: Partial<Deco> = {}) => out.push({ from, to, kind: 'widget', widget: w, ...extra })

  // --- frontmatter: --- on line 1, closing --- later. Lezer sees it as hr + setext heading, so handle it first and skip its range.
  let fmEnd = -1
  if (doc.lines > 1 && doc.line(1).text === '---') {
    for (let n = 2; n <= doc.lines; n++) {
      if (doc.line(n).text === '---') {
        fmEnd = doc.line(n).to
        break
      }
    }
  }
  if (fmEnd >= 0) {
    if (isActive(0, fmEnd)) for (let n = 1; n <= lineOf(fmEnd); n++) line(doc.line(n).from, 'HyperMD-frontmatter')
    else widget(0, fmEnd, 'properties')
  }

  // --- code regions (fenced + inline) are off-limits for wikilink scanning
  const tree = ensureSyntaxTree(state, doc.length, 5000) ?? syntaxTree(state)
  const code: [number, number][] = []
  const wikis: [number, number][] = []
  tree.iterate({
    enter: (n) => {
      if (n.name === 'FencedCode' || n.name === 'CodeBlock' || n.name === 'InlineCode') code.push([n.from, n.to])
    }
  })
  const inCode = (pos: number) => code.some(([a, b]) => pos >= a && pos < b)
  const overlapsWiki = (a: number, b: number) => wikis.some(([x, y]) => a < y && b > x)

  // --- wikilinks and embeds, by regex over each line outside code / frontmatter
  for (let n = 1; n <= doc.lines; n++) {
    const l = doc.line(n)
    if (l.to <= fmEnd) continue
    for (const m of l.text.matchAll(WIKI)) {
      const from = l.from + m.index!
      const to = from + m[0].length
      if (inCode(from)) continue
      wikis.push([from, to])
      const [, bang, target, , alias] = m
      const t = target.trim()
      if (bang && IMG_EXT.test(t)) {
        if (active.has(n)) mark(from, to, 'cm-hmd-internal-link cm-formatting', { target: t })
        else widget(from, to, 'image', { src: opts.imgUrl(t) })
        continue
      }
      const resolved = opts.resolve(t)
      const cls = 'cm-hmd-internal-link' + (resolved ? '' : ' is-unresolved')
      if (active.has(n)) {
        mark(from, to, cls, { target: t })
        continue
      }
      const open = from + bang.length + 2
      const textStart = alias !== undefined ? to - 2 - alias.length : open
      hide(from, textStart)
      mark(textStart, to - 2, cls, { target: t })
      hide(to - 2, to)
    }
  }

  // --- syntax tree walk
  const listDepth: number[] = []
  const emphasis = (n: SyntaxNode, cls: string, markName: string) => {
    const act = isActive(n.from, n.to)
    mark(n.from, n.to, cls)
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.name !== markName) continue
      if (act) mark(c.from, c.to, 'cm-formatting')
      else hide(c.from, c.to)
    }
  }
  tree.iterate({
    enter: (n) => {
      if (n.to <= fmEnd) return false
      const act = isActive(n.from, n.to)
      switch (n.name) {
        case 'ATXHeading1': case 'ATXHeading2': case 'ATXHeading3': case 'ATXHeading4': case 'ATXHeading5': case 'ATXHeading6': {
          const lvl = n.name.slice(-1)
          line(n.from, `HyperMD-header HyperMD-header-${lvl}`)
          const hm = n.node.getChild('HeaderMark')
          if (hm) {
            const end = doc.sliceString(hm.to, hm.to + 1) === ' ' ? hm.to + 1 : hm.to
            if (act) mark(hm.from, hm.to, 'cm-formatting')
            else hide(hm.from, end)
          }
          return
        }
        case 'SetextHeading1': case 'SetextHeading2':
          line(n.from, `HyperMD-header HyperMD-header-${n.name.slice(-1)}`)
          return
        case 'StrongEmphasis': emphasis(n.node, 'cm-strong', 'EmphasisMark'); return
        case 'Emphasis': emphasis(n.node, 'cm-em', 'EmphasisMark'); return
        case 'Strikethrough': emphasis(n.node, 'cm-strikethrough', 'StrikethroughMark'); return
        case 'InlineCode': emphasis(n.node, 'cm-inline-code', 'CodeMark'); return false
        case 'Link': {
          if (overlapsWiki(n.from, n.to)) return false
          const marks = n.node.getChildren('LinkMark')
          const url = n.node.getChild('URL')
          if (marks.length < 2) return
          const textFrom = marks[0].to
          const textTo = marks[1].from
          mark(textFrom, textTo, 'cm-link')
          if (act) {
            for (const m of marks) mark(m.from, m.to, 'cm-formatting')
            if (url) mark(url.from, url.to, 'cm-url')
          } else {
            hide(marks[0].from, marks[0].to)
            hide(marks[1].from, n.to)
          }
          return
        }
        case 'Image': {
          if (overlapsWiki(n.from, n.to)) return false
          const url = n.node.getChild('URL')
          if (!url) return
          const src = doc.sliceString(url.from, url.to)
          if (act) {
            mark(n.from, n.to, 'cm-formatting')
            mark(url.from, url.to, 'cm-url')
          } else widget(n.from, n.to, 'image', { src: /^[a-z]+:\/\//i.test(src) ? src : opts.imgUrl(src) })
          return false
        }
        case 'ListItem': {
          listDepth.push(1)
          const depth = listDepth.length
          const lm = n.node.getChild('ListMark')
          const task = n.node.getChild('Task')
          const marker = task?.getChild('TaskMarker')
          const ordered = n.node.parent?.name === 'OrderedList'
          const checked = marker ? /x/i.test(doc.sliceString(marker.from, marker.to)) : false
          line(n.from, `HyperMD-list-line HyperMD-list-line-${depth}` + (task ? ' HyperMD-task-line' + (checked ? ' is-checked' : '') : ''), `--list-depth:${depth}`)
          if (lm) {
            const lineAct = active.has(lineOf(n.from))
            if (marker) {
              // task: one checkbox stands in for "- [ ] " (marker through the space after it)
              if (lineAct) mark(lm.from, marker.to, 'cm-formatting')
              else widget(lm.from, Math.min(marker.to + 1, n.to), 'checkbox', { checked, pos: marker.from })
              if (task) mark(marker.to, task.to, 'cm-task-text')
            } else if (ordered) mark(lm.from, lm.to, 'cm-list-number')
            else if (lineAct) mark(lm.from, lm.to, 'cm-formatting cm-list-bullet-raw')
            else widget(lm.from, Math.min(lm.to + 1, n.to), 'bullet')
          }
          return
        }
        case 'Blockquote': {
          for (let ln = lineOf(n.from); ln <= lineOf(n.to); ln++) line(doc.line(ln).from, 'HyperMD-quote')
          // continuation "> " marks live inside the nested paragraph, so walk every descendant
          n.node.cursor().iterate((c) => {
            if (c.name !== 'QuoteMark') return
            const end = doc.sliceString(c.to, c.to + 1) === ' ' ? c.to + 1 : c.to
            if (active.has(lineOf(c.from))) mark(c.from, c.to, 'cm-formatting')
            else hide(c.from, end)
          })
          return false
        }
        case 'FencedCode': {
          const a = lineOf(n.from)
          const b = lineOf(n.to)
          for (let ln = a; ln <= b; ln++) line(doc.line(ln).from, 'HyperMD-codeblock' + (ln === a ? ' HyperMD-codeblock-begin' : '') + (ln === b ? ' HyperMD-codeblock-end' : ''))
          // fence lines: raw while the cursor is anywhere in the block, otherwise emptied (the padded line stays)
          const marks = n.node.getChildren('CodeMark')
          const info = n.node.getChild('CodeInfo')
          if (act) for (const cm of marks) mark(cm.from, cm.to, 'cm-formatting')
          else {
            if (marks[0]) hide(marks[0].from, info ? info.to : marks[0].to)
            if (marks[1]) hide(marks[1].from, marks[1].to)
          }
          return false
        }
        case 'HorizontalRule': {
          if (act) mark(n.from, n.to, 'cm-formatting')
          else widget(n.from, n.to, 'hr')
          return false
        }
        case 'Table': {
          if (act) for (let ln = lineOf(n.from); ln <= lineOf(n.to); ln++) line(doc.line(ln).from, 'HyperMD-table-row')
          else widget(n.from, n.to, 'table')
          return false
        }
      }
      return
    },
    leave: (n) => {
      if (n.name === 'ListItem') listDepth.pop()
    }
  })
  return out.sort((a, b) => a.from - b.from || a.to - b.to)
}

// ---------- CodeMirror glue ----------
// A StateField, not a ViewPlugin: replace decorations that span line breaks (table, properties) are only allowed from fields.

export type ViewOpts = Opts & { onOpenLink(target: string): void }

const setFocus = StateEffect.define<boolean>()
const focusField = StateField.define<boolean>({
  create: () => false,
  update: (v, tr) => tr.effects.reduce((acc, e) => (e.is(setFocus) ? e.value : acc), v)
})

function toRanges(decos: Deco[], state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = []
  for (const d of decos) {
    switch (d.kind) {
      case 'hide': ranges.push(Decoration.replace({}).range(d.from, d.to)); break
      case 'mark': ranges.push(Decoration.mark({ class: d.cls!, attributes: d.target ? { 'data-target': d.target } : undefined }).range(d.from, d.to)); break
      case 'line': ranges.push(Decoration.line({ class: d.cls!, attributes: d.style ? { style: d.style } : undefined }).range(d.from)); break
      case 'widget': {
        const w =
          d.widget === 'bullet' ? new BulletWidget()
          : d.widget === 'checkbox' ? new CheckboxWidget(!!d.checked, d.pos ?? d.from)
          : d.widget === 'hr' ? new HrWidget()
          : d.widget === 'table' ? new TableWidget(state.doc.sliceString(d.from, d.to))
          : d.widget === 'properties' ? new PropertiesWidget(state.doc.sliceString(d.from, d.to))
          : new ImageWidget(d.src!)
        ranges.push(Decoration.replace({ widget: w, inclusive: false }).range(d.from, d.to))
      }
    }
  }
  return Decoration.set(ranges, true)
}

export function livePreview(opts: ViewOpts) {
  const build = (state: EditorState) => toRanges(buildDecorations(state, { ...opts, focused: state.field(focusField) }), state)
  const field = StateField.define<DecorationSet>({
    create: build,
    update: (deco, tr) => (tr.docChanged || tr.selection || tr.effects.some((e) => e.is(setFocus)) ? build(tr.state) : deco),
    provide: (f) => EditorView.decorations.from(f)
  })
  const events = EditorView.domEventHandlers({
    focus(_e, view) {
      view.dispatch({ effects: setFocus.of(true) })
      return false
    },
    blur(_e, view) {
      view.dispatch({ effects: setFocus.of(false) })
      return false
    },
    mousedown(e) {
      const el = (e.target as HTMLElement).closest?.('.cm-hmd-internal-link') as HTMLElement | null
      if (!el) return false
      const target = el.dataset.target
      if (!target) return false
      // On the active (raw) line the whole link is one formatting span: only Cmd/Ctrl-click opens it.
      const raw = el.classList.contains('cm-formatting')
      if (raw && !e.metaKey && !e.ctrlKey) return false
      e.preventDefault()
      opts.onOpenLink(target)
      return true
    }
  })
  return [focusField, field, events]
}
