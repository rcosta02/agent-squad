import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, drawSelection, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { livePreview } from './livePreview'
import { kbKeymap } from './keymap'
import { wikilinkCompletion } from './wikilinkComplete'

type Props = {
  value: string
  docKey: string // changes → fresh editor (new note)
  pages: string[]
  resolve(target: string): string | null
  imgUrl(rel: string): string
  onChange(md: string): void
  onOpenLink(target: string): void
  scrollToLine?: number
}

/** CodeMirror 6 live-preview markdown editor. Uncontrolled after mount; `value` changes from outside (disk reload) are applied. */
export default function Editor({ value, docKey, pages, resolve, imgUrl, onChange, onOpenLink, scrollToLine }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const latest = useRef({ pages, resolve, imgUrl, onChange, onOpenLink })
  latest.current = { pages, resolve, imgUrl, onChange, onOpenLink }

  useEffect(() => {
    if (!host.current) return
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          highlightActiveLine(),
          EditorView.lineWrapping,
          markdown({ base: markdownLanguage }),
          livePreview({ resolve: (t) => latest.current.resolve(t), imgUrl: (r) => latest.current.imgUrl(r), onOpenLink: (t) => latest.current.onOpenLink(t) }),
          wikilinkCompletion(() => latest.current.pages),
          keymap.of([...kbKeymap, ...historyKeymap, ...defaultKeymap]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) latest.current.onChange(u.state.doc.toString())
          })
        ]
      })
    })
    view.current = v
    return () => {
      v.destroy()
      view.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey])

  // External replacement (reload from disk) — only when it really differs, to keep the cursor otherwise.
  useEffect(() => {
    const v = view.current
    if (!v) return
    const cur = v.state.doc.toString()
    if (cur !== value) v.dispatch({ changes: { from: 0, to: cur.length, insert: value } })
  }, [value])

  // Pages list changed (new note, rename): re-decorate so unresolved links update.
  useEffect(() => {
    view.current?.dispatch({ selection: view.current.state.selection })
  }, [pages])

  useEffect(() => {
    const v = view.current
    if (!v || !scrollToLine) return
    const n = Math.min(scrollToLine, v.state.doc.lines)
    const pos = v.state.doc.line(n).from
    v.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) })
    v.focus()
  }, [scrollToLine, docKey])

  return <div className="kb-editor" ref={host} />
}
