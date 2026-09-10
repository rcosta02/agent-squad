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
  commands?: string[] // slash commands for autocomplete
}

/** Capture mic → 16 kHz mono 16-bit WAV (base64). */
async function recordWav(stream: MediaStream, stop: Promise<void>): Promise<string> {
  const rec = new MediaRecorder(stream)
  const parts: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data)
  const done = new Promise<void>((r) => (rec.onstop = () => r()))
  rec.start()
  await stop
  rec.stop()
  await done
  const buf = await new Blob(parts).arrayBuffer()
  const ctx = new AudioContext()
  const audio = await ctx.decodeAudioData(buf)
  await ctx.close()
  const off = new OfflineAudioContext(1, Math.ceil(audio.duration * 16000), 16000)
  const src = off.createBufferSource()
  src.buffer = audio
  src.connect(off.destination)
  src.start()
  const out = (await off.startRendering()).getChannelData(0)
  const wav = new ArrayBuffer(44 + out.length * 2)
  const v = new DataView(wav)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF'); v.setUint32(4, 36 + out.length * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, out.length * 2, true)
  for (let i = 0; i < out.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, out[i])) * 32767, true)
  let bin = ''
  const bytes = new Uint8Array(wav)
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

export const fileToDataUrl = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(f)
  })

// eslint-disable-next-line react-refresh/only-export-components
export default function Composer({ agentName, agentId, running, pending, onClearPending, onSend, onStop, names = [], allowPlan = false, commands = [] }: Props) {
  const [planMode, setPlanMode] = useState(false)
  const [dictating, setDictating] = useState<'idle' | 'rec' | 'busy'>('idle')
  const stopDictation = useRef<(() => void) | null>(null)
  const waveRef = useRef<HTMLCanvasElement>(null)
  const drawWave = (stream: MediaStream) => {
    const ctx = new AudioContext()
    const src = ctx.createMediaStreamSource(stream)
    const an = ctx.createAnalyser()
    an.fftSize = 256
    src.connect(an)
    const data = new Uint8Array(an.frequencyBinCount)
    let raf = 0
    const tick = () => {
      const c = waveRef.current
      if (!c) return
      const g = c.getContext('2d')!
      an.getByteFrequencyData(data)
      const w = c.width, h = c.height, bars = 18, gap = 2, bw = (w - gap * (bars - 1)) / bars
      g.clearRect(0, 0, w, h)
      g.fillStyle = '#ff375f'
      for (let i = 0; i < bars; i++) {
        const v = data[Math.floor((i / bars) * data.length * 0.6)] / 255
        const bh = Math.max(3, v * h)
        g.beginPath()
        g.roundRect(i * (bw + gap), (h - bh) / 2, bw, bh, 2)
        g.fill()
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelAnimationFrame(raf)
      void ctx.close()
    }
  }

  const toggleDictation = async () => {
    if (dictating === 'rec') return stopDictation.current?.()
    if (dictating === 'busy') return
    try {
      await window.api.micAccess()
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setDictating('rec')
      const stopWave = drawWave(stream)
      const stop = new Promise<void>((r) => (stopDictation.current = r))
      const wav = await recordWav(stream, stop)
      stopWave()
      stream.getTracks().forEach((t) => t.stop())
      setDictating('busy')
      const text = await window.api.dictate(wav)
      if (text) setText((t) => (t.trim() ? t.replace(/\s*$/, ' ') : '') + text)
      ref.current?.focus()
    } catch (e) {
      console.error('dictation', e)
    }
    stopDictation.current = null
    setDictating('idle')
  }
  const ref = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState('')
  const [sel, setSel] = useState(0)
  // "@par" right before the caret → suggestions
  const caret = ref.current?.selectionStart ?? text.length
  const before = text.slice(0, caret)
  const at = /(^|\s)@([^@\n]*)$/.exec(before)
  const query = at ? at[2].toLowerCase() : null
  const slash = /^\/([\w-]*)$/.exec(text)
  const slashSuggestions = slash && commands.length ? commands.filter((c) => c.startsWith(slash[1])).slice(0, 8) : []
  const suggestions = query !== null ? names.filter((n) => n.toLowerCase().startsWith(query)).slice(0, 6) : slashSuggestions.map((c) => '/' + c)
  const insertSlash = (cmd: string) => {
    setText(cmd + ' ')
    setSel(0)
    requestAnimationFrame(() => ref.current?.focus())
  }
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
      if (e.key === 'Enter' || e.key === 'Tab') return (e.preventDefault(), suggestions[sel].startsWith('/') && !at ? insertSlash(suggestions[sel]) : insertMention(suggestions[sel]))
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
            <button key={n} type="button" className={'mention-opt' + (i === sel ? ' active' : '')} onMouseDown={(e) => (e.preventDefault(), n.startsWith('/') && !at ? insertSlash(n) : insertMention(n))}>
              {n.startsWith('/') && !at ? n : '@' + n}
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
        {dictating === 'rec' && <canvas ref={waveRef} className="wave" width={120} height={22} />}
        {dictating === 'busy' && <span className="wave-txt">Transcribing…</span>}
        <button className={'round-btn dictate ' + dictating} title={dictating === 'rec' ? 'Stop and transcribe' : dictating === 'busy' ? 'Transcribing…' : 'Dictate (whisper, local)'} type="button" onClick={toggleDictation} disabled={dictating === 'busy'}>
          {dictating === 'rec' ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <rect x="1" y="1" width="10" height="10" rx="2" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          )}
        </button>
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
