import { useEffect, useRef } from 'react'
import Editor from '@toast-ui/editor'
import '@toast-ui/editor/dist/toastui-editor.css'
import '@toast-ui/editor/dist/theme/toastui-editor-dark.css'

type Props = { value: string; onChange: (md: string) => void; docKey: string }

/** WYSIWYG markdown: you edit the rendered document, markdown comes out. */
export default function MdEditor({ value, onChange, docKey }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const ed = useRef<Editor | null>(null)
  const last = useRef(value)

  useEffect(() => {
    if (!host.current) return
    const editor = new Editor({
      el: host.current,
      initialEditType: 'wysiwyg',
      hideModeSwitch: true,
      previewStyle: 'tab',
      height: '100%',
      theme: 'dark',
      usageStatistics: false,
      initialValue: value,
      autofocus: false,
      toolbarItems: [
        ['heading', 'bold', 'italic', 'strike'],
        ['hr', 'quote'],
        ['ul', 'ol', 'task', 'indent', 'outdent'],
        ['table', 'link', 'code', 'codeblock']
      ]
    })
    editor.on('change', () => {
      const md = editor.getMarkdown()
      last.current = md
      onChange(md)
    })
    ed.current = editor
    return () => {
      editor.destroy()
      ed.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey])

  // External value change (opened another file / reverted): push it in without echoing back.
  useEffect(() => {
    if (ed.current && value !== last.current) {
      last.current = value
      ed.current.setMarkdown(value, false)
    }
  }, [value])

  return <div className="md-host" ref={host} />
}
