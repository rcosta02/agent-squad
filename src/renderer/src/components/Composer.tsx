import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'

type Props = {
  agentName: string
  agentId: string
  running: boolean
  pending: string[] // images dropped onto the chat, as data URLs
  onClearPending: () => void
  onSend: (text: string, images: string[], planMode: boolean) => void
  onStop: () => void
  names?: string[] // mentionable agent names
  allowPlan?: boolean // show the Plan toggle
}

export const fileToDataUrl = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(f)
  })

// eslint-disable-next-line react-refresh/only-export-components
export default function Composer({ agentName, agentId, running, pending, onClearPending, onSend, onStop, names = [], allowPlan = false }: Props) {
  const [planMode, setPlanMode] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState('')
  const [sel, setSel] = useState(0)
  // "@par" right before the caret → suggestions
  const caret = ref.current?.selectionStart ?? text.length
  const before = text.slice(0, caret)
  const at = /(^|\s)@([^@\n]*)$/.exec(before)
  const query = at ? at[2].toLowerCase() : null
  const suggestions = query !== null ? names.filter((n) => n.toLowerCase().startsWith(query)).slice(0, 6) : []
  const insertMention = (name: string) => {
    if (!at) return
    const start = caret - at[2].length - 1
    const next = text.slice(0, start) + '@' + name + ' ' + text.slice(caret)
    setText(next)
    setSel(0)
    requestAnimationFrame(() => {
      const el = ref.current
      if (el) {
        el.focus()
        el.selectionStart = el.selectionEnd = start + name.length + 2
      }
    })
  }
  const [images, setImages] = useState<string[]>([])

  const resize = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 132) + 'px'
  }

  useEffect(() => {
    setText('')
    setImages([])
    resize()
    ref.current?.focus()
  }, [agentId])

  useEffect(resize, [text])

  // Images dropped on the chat pane arrive via props; move them into local state.
  useEffect(() => {
    if (pending.length) {
      setImages((prev) => [...prev, ...pending])
      onClearPending()
    }
  }, [pending, onClearPending])

  const submit = () => {
    const t = text.trim()
    if (!t && images.length === 0) return
    onSend(t || 'See attached image.', images, planMode)
    setPlanMode(false)
    setText('')
    setImages([])
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length) {
      if (e.key === 'ArrowDown') return (e.preventDefault(), setSel((p) => (p + 1) % suggestions.length))
      if (e.key === 'ArrowUp') return (e.preventDefault(), setSel((p) => (p - 1 + suggestions.length) % suggestions.length))
      if (e.key === 'Enter' || e.key === 'Tab') return (e.preventDefault(), insertMention(suggestions[sel]))
      if (e.key === 'Escape') return setText(text) // no-op keeps caret; popup closes on next keystroke
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  const onPaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...e.clipboardData.items].filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile()).filter((f): f is File => !!f)
    if (!files.length) return
    e.preventDefault()
    setImages((prev) => [...prev, ...[]])
    const urls = await Promise.all(files.map(fileToDataUrl))
    setImages((prev) => [...prev, ...urls])
  }

  const pick = async () => {
    const urls = await window.api.pickImages()
    if (urls.length) setImages((prev) => [...prev, ...urls])
  }

  return (
    <div className="composer">
      {suggestions.length > 0 && (
        <div className="mention-pop">
          {suggestions.map((n, i) => (
            <button key={n} type="button" className={'mention-opt' + (i === sel ? ' active' : '')} onMouseDown={(e) => (e.preventDefault(), insertMention(n))}>
              @{n}
            </button>
          ))}
        </div>
      )}
      {images.length > 0 && (
        <div className="attachments">
          {images.map((src, i) => (
            <div key={i} className="attachment">
              <img src={src} alt="" />
              <button type="button" title="Remove" onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="composer-inner">
        <button className="round-btn plus" title="Attach images" type="button" onClick={pick}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
        <textarea
          ref={ref}
          rows={1}
          value={text}
          placeholder={planMode ? `Ask ${agentName} for a plan (read-only, needs your approval)` : `Message ${agentName}`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onPaste={onPaste}
        />
        {allowPlan && (
          <button className={'plan-toggle' + (planMode ? ' on' : '')} title="Plan mode: agent only reads and proposes a plan you approve" type="button" onClick={() => setPlanMode((v) => !v)}>
            📋 Plan
          </button>
        )}
        {running ? (
          <button className="round-btn stop" title="Stop" onClick={onStop} type="button">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <rect x="1" y="1" width="10" height="10" rx="2" />
            </svg>
          </button>
        ) : (
          <button className="round-btn send" title="Send" onClick={submit} disabled={!text.trim() && images.length === 0} type="button">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
