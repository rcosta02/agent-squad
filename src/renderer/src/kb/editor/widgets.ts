import { WidgetType, type EditorView } from '@codemirror/view'

export class BulletWidget extends WidgetType {
  eq() { return true }
  toDOM() {
    const s = document.createElement('span')
    s.className = 'cm-list-bullet'
    return s
  }
  ignoreEvent() { return false }
}

export class CheckboxWidget extends WidgetType {
  checked: boolean
  pos: number
  constructor(checked: boolean, pos: number) {
    super()
    this.checked = checked
    this.pos = pos
  }
  eq(o: CheckboxWidget) { return o.checked === this.checked && o.pos === this.pos }
  toDOM(view: EditorView) {
    const i = document.createElement('input')
    i.type = 'checkbox'
    i.className = 'task-list-item-checkbox'
    i.checked = this.checked
    i.onmousedown = (e) => e.preventDefault()
    i.onclick = (e) => {
      e.preventDefault()
      // marker is "[ ]" or "[x]" at pos; flip the middle char
      view.dispatch({ changes: { from: this.pos + 1, to: this.pos + 2, insert: this.checked ? ' ' : 'x' } })
    }
    return i
  }
  ignoreEvent() { return true }
}

export class HrWidget extends WidgetType {
  eq() { return true }
  toDOM() {
    const s = document.createElement('span')
    s.className = 'cm-hr'
    return s
  }
}

export class ImageWidget extends WidgetType {
  src: string
  constructor(src: string) {
    super()
    this.src = src
  }
  eq(o: ImageWidget) { return o.src === this.src }
  toDOM() {
    const img = document.createElement('img')
    img.className = 'cm-image'
    img.src = this.src
    return img
  }
}

/** Rendered table from its raw markdown rows. Cells are plain text (inline markdown shows raw), fine for v1. */
export class TableWidget extends WidgetType {
  raw: string
  constructor(raw: string) {
    super()
    this.raw = raw
  }
  eq(o: TableWidget) { return o.raw === this.raw }
  toDOM() {
    const rows = this.raw.split('\n').filter((l) => l.trim())
    const cells = (l: string) => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim())
    const t = document.createElement('table')
    t.className = 'cm-table'
    rows.forEach((l, i) => {
      if (i === 1 && /^\s*\|?\s*:?-+/.test(l)) return // delimiter row
      const tr = document.createElement('tr')
      for (const c of cells(l)) {
        const td = document.createElement(i === 0 ? 'th' : 'td')
        td.textContent = c
        tr.appendChild(td)
      }
      t.appendChild(tr)
    })
    return t
  }
  ignoreEvent() { return false }
}

export class PropertiesWidget extends WidgetType {
  raw: string
  constructor(raw: string) {
    super()
    this.raw = raw
  }
  eq(o: PropertiesWidget) { return o.raw === this.raw }
  toDOM() {
    const s = document.createElement('span')
    s.className = 'cm-properties'
    const n = this.raw.split('\n').length - 2
    s.textContent = `Properties (${Math.max(0, n)})`
    return s
  }
}
