import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { diffLines } from 'diff'
import type { Annotation, Plan } from '../../../shared/types'
import { formatTime } from '../lib'
import { Markdown } from './Chat'

// ---------- parsing: "## " headings → cards; fenced blocks → visual blocks ----------
type Block =
  | { kind: 'md'; text: string }
  | { kind: 'mermaid'; code: string }
  | { kind: 'diff'; code: string; file?: string }
  | { kind: 'code'; code: string; lang: string }
  | { kind: 'pair'; before: string; after: string; lang: string }
  | { kind: 'steps'; items: { done: boolean; text: string }[] }
type Card = { title: string; blocks: Block[] }

function parse(md: string): { title: string; cards: Card[] } {
  const lines = md.replace(/\r/g, '').split('\n')
  let title = 'Plan'
  const cards: Card[] = []
  let cur: Card = { title: 'Overview', blocks: [] }
  let md_: string[] = []
  const flushMd = () => {
    const t = md_.join('\n').trim()
    if (t) cur.blocks.push({ kind: 'md', text: t })
    md_ = []
  }
  const pushCard = () => {
    flushMd()
    if (cur.blocks.length) cards.push(cur)
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const h1 = /^#\s+(.+)/.exec(line)
    if (h1 && cards.length === 0 && cur.blocks.length === 0 && md_.join('').trim() === '') {
      title = h1[1].trim()
      continue
    }
    const h2 = /^##\s+(.+)/.exec(line)
    if (h2) {
      pushCard()
      cur = { title: h2[1].trim(), blocks: [] }
      continue
    }
    const fence = /^```(\w*)\s*$/.exec(line)
    if (fence) {
      flushMd()
      const lang = fence[1].toLowerCase()
      const buf: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++])
      const code = buf.join('\n')
      if (lang === 'mermaid') cur.blocks.push({ kind: 'mermaid', code })
      else if (lang === 'diff') {
        const f = /^file:\s*(.+)$/.exec(buf[0] ?? '')
        cur.blocks.push({ kind: 'diff', code: f ? buf.slice(1).join('\n') : code, file: f?.[1].trim() })
      } else if (lang === 'before') {
        let j = i + 1
        while (j < lines.length && lines[j].trim() === '') j++
        const nf = /^```(\w*)\s*$/.exec(lines[j] ?? '')
        if (nf && nf[1].toLowerCase() === 'after') {
          const ab: string[] = []
          j++
          while (j < lines.length && !/^```/.test(lines[j])) ab.push(lines[j++])
          cur.blocks.push({ kind: 'pair', before: code, after: ab.join('\n'), lang: 'code' })
          i = j
        } else cur.blocks.push({ kind: 'code', code, lang: 'before' })
      } else cur.blocks.push({ kind: 'code', code, lang: lang || 'text' })
      continue
    }
    const step = /^\s*[-*]\s+\[( |x|X)\]\s+(.+)/.exec(line)
    if (step) {
      flushMd()
      const last = cur.blocks[cur.blocks.length - 1]
      const item = { done: step[1] !== ' ', text: step[2] }
      if (last && last.kind === 'steps') last.items.push(item)
      else cur.blocks.push({ kind: 'steps', items: [item] })
      continue
    }
    md_.push(line)
  }
  pushCard()
  return { title, cards }
}

// ---------- mermaid (lazy, offline) ----------
let mermaidReady: Promise<typeof import('mermaid')['default']> | null = null
const getMermaid = () => {
  if (!mermaidReady)
    mermaidReady = import('mermaid').then((m) => {
      m.default.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict', fontFamily: 'inherit' })
      return m.default
    })
  return mermaidReady
}
let mermaidSeq = 0

/** SVG → PNG data URL at 2x. */
async function svgToPng(svg: SVGSVGElement): Promise<string> {
  const xml = new XMLSerializer().serializeToString(svg)
  const box = svg.getBoundingClientRect()
  const w = Math.max(1, Math.ceil(box.width)) * 2
  const h = Math.max(1, Math.ceil(box.height)) * 2
  const img = new Image()
  await new Promise<void>((res, rej) => {
    img.onload = () => res()
    img.onerror = () => rej(new Error('svg render failed'))
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)
  })
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#1a1a1c'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  return c.toDataURL('image/png')
}

function Mermaid({ code, notes, onNodeClick }: { code: string; notes: string[]; onNodeClick: (label: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [err, setErr] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    setReady(false)
    getMermaid()
      .then((m) => m.render('mm' + ++mermaidSeq, code))
      .then(({ svg }) => {
        if (alive && ref.current) {
          ref.current.innerHTML = svg
          setReady(true)
        }
      })
      .catch((e) => alive && setErr(String((e as Error).message ?? e)))
    return () => {
      alive = false
    }
  }, [code])
  // mark nodes whose label has a note
  useEffect(() => {
    const root = ref.current
    if (!root || !ready) return
    root.querySelectorAll<SVGGElement>('g.node, g.actor, .cluster').forEach((g) => {
      const label = g.textContent?.trim() ?? ''
      g.classList.toggle('annotated', !!label && notes.includes(label))
    })
  }, [notes, ready])
  const click = (e: React.MouseEvent) => {
    const g = (e.target as Element).closest('g.node, g.actor')
    const label = g?.textContent?.trim()
    if (label) onNodeClick(label)
  }
  const exportPng = async () => {
    const svg = ref.current?.querySelector('svg')
    if (!svg) return
    await window.api.savePng('diagram.png', await svgToPng(svg))
  }
  if (err)
    return (
      <div className="plan-err">
        Diagram failed: {err}
        <pre>{code}</pre>
      </div>
    )
  return (
    <div className="mermaid-wrap">
      <div className="mermaid-box" ref={ref} onClick={click} title="Click a node to comment on it" />
      {ready && (
        <button className="btn small mermaid-png" onClick={exportPng} title="Save as PNG">
          PNG
        </button>
      )}
    </div>
  )
}

// ---------- diff + before/after ----------
function DiffBlock({ code, file }: { code: string; file?: string }) {
  return (
    <div className="diff-box">
      {file && <div className="diff-file">{file}</div>}
      <pre>
        {code.split('\n').map((l, i) => (
          <div key={i} className={'dl ' + (l.startsWith('+') && !l.startsWith('+++') ? 'add' : l.startsWith('-') && !l.startsWith('---') ? 'del' : l.startsWith('@@') ? 'hunk' : '')}>
            {l || ' '}
          </div>
        ))}
      </pre>
    </div>
  )
}

function Pair({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => diffLines(before, after), [before, after])
  const left: { t: string; c: string }[] = []
  const right: { t: string; c: string }[] = []
  for (const p of parts) {
    const ls = p.value.replace(/\n$/, '').split('\n')
    if (p.added) ls.forEach((t) => right.push({ t, c: 'add' }))
    else if (p.removed) ls.forEach((t) => left.push({ t, c: 'del' }))
    else
      ls.forEach((t) => {
        left.push({ t, c: '' })
        right.push({ t, c: '' })
      })
  }
  const col = (rows: { t: string; c: string }[], label: string) => (
    <div className="pair-col">
      <div className="pair-label">{label}</div>
      <pre>
        {rows.map((r, i) => (
          <div key={i} className={'dl ' + r.c}>
            {r.t || ' '}
          </div>
        ))}
      </pre>
    </div>
  )
  return (
    <div className="pair-box">
      {col(left, 'Before')}
      {col(right, 'After')}
    </div>
  )
}

// ---------- annotations via CSS Highlight API ----------
type HL = { new (...ranges: Range[]): unknown }
const highlights = (): Map<string, unknown> | null => {
  const css = (globalThis as unknown as { CSS?: { highlights?: Map<string, unknown> } }).CSS
  return css?.highlights ?? null
}
function findRange(root: HTMLElement, quote: string): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let full = ''
  let n: Node | null
  while ((n = walker.nextNode())) {
    nodes.push(n as Text)
    full += (n as Text).data
  }
  const idx = full.indexOf(quote)
  if (idx < 0) return null
  const locate = (pos: number) => {
    let acc = 0
    for (const t of nodes) {
      if (pos <= acc + t.data.length) return { node: t, off: pos - acc }
      acc += t.data.length
    }
    return null
  }
  const a = locate(idx)
  const b = locate(idx + quote.length)
  if (!a || !b) return null
  const r = document.createRange()
  r.setStart(a.node, a.off)
  r.setEnd(b.node, b.off)
  return r
}

// ---------- view ----------
type Props = { planId: string; onBack: () => void }

export default function PlanView({ planId, onBack }: Props) {
  const api = window.api
  const [chain, setChain] = useState<Plan[]>([])
  const [viewId, setViewId] = useState(planId)
  const [note, setNote] = useState('')
  const [draft, setDraft] = useState<{ card: number; quote: string; x: number; y: number } | null>(null)
  const [draftText, setDraftText] = useState('')
  const [copied, setCopied] = useState(false)
  const cardRefs = useRef<(HTMLElement | null)[]>([])

  const reload = useCallback(() => api.planRevisions(planId).then(setChain), [api, planId])
  useEffect(() => {
    reload()
    return api.onEvent((e) => {
      if (e.type === 'plan' && (e.plan.id === planId || chain.some((p) => p.id === e.plan.id) || e.plan.parentId)) void reload()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, planId, reload])
  // Jump to the newest revision when one arrives while viewing the latest.
  useEffect(() => {
    const last = chain[chain.length - 1]
    if (last && !chain.some((p) => p.id === viewId)) setViewId(last.id)
  }, [chain, viewId])

  const plan = chain.find((p) => p.id === viewId) ?? null
  const parsed = useMemo(() => (plan ? parse(plan.markdown) : null), [plan])

  useEffect(() => {
    const H = (globalThis as unknown as { Highlight?: HL }).Highlight
    const map = highlights()
    if (!H || !map || !plan) return
    const ranges: Range[] = []
    for (const a of plan.annotations) {
      if (a.resolved) continue
      const el = cardRefs.current[a.card]
      if (!el) continue
      const r = findRange(el, a.quote)
      if (r) ranges.push(r)
    }
    map.set('plan-notes', new H(...ranges))
    return () => {
      map.delete('plan-notes')
    }
  }, [plan, parsed])

  const openDraft = (card: number, quote: string, x: number, y: number) => {
    setDraft({ card, quote, x, y })
    setDraftText('')
  }
  const onMouseUp = useCallback(() => {
    const sel = window.getSelection()
    const text = sel?.toString().trim() ?? ''
    if (!sel || sel.isCollapsed || text.length < 2 || text.length > 600) return
    const anchor = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement
    const cardEl = anchor?.closest<HTMLElement>('[data-card]')
    if (!cardEl) return
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    openDraft(Number(cardEl.dataset.card), text, rect.left + rect.width / 2, rect.top)
  }, [])

  const save = (annotations: Annotation[]) => plan && api.saveAnnotations(plan.id, annotations)
  const addAnnotation = async () => {
    if (!plan || !draft || !draftText.trim()) return
    await save([...plan.annotations, { id: crypto.randomUUID(), card: draft.card, quote: draft.quote, text: draftText.trim(), ts: Date.now() }])
    setDraft(null)
    window.getSelection()?.removeAllRanges()
  }
  const patch = (id: string, f: (a: Annotation) => Annotation) => plan && save(plan.annotations.map((a) => (a.id === id ? f(a) : a)))

  const feedback = () => {
    if (!plan || !parsed) return ''
    const lines = plan.annotations.filter((a) => !a.resolved).map((a, i) => `${i + 1}. [${parsed.cards[a.card]?.title ?? 'Plan'}] "${a.quote.slice(0, 160)}" — ${a.text}`)
    return [`Plan feedback for "${plan.title}" (rev ${plan.revision}):`, ...lines, note.trim() ? `\nGeneral: ${note.trim()}` : ''].filter(Boolean).join('\n')
  }
  const openNotes = plan?.annotations.filter((a) => !a.resolved) ?? []
  const canSend = !!plan && (openNotes.length > 0 || note.trim().length > 0)
  const respond = async (decision: 'approve' | 'changes') => {
    if (!plan) return
    await api.respondPlan(plan.id, decision, decision === 'changes' ? feedback() : note.trim())
    if (decision === 'approve') onBack()
  }
  const copyMd = () => {
    if (!plan) return
    void api.copy(plan.markdown).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }

  if (!plan || !parsed) return <div className="plan-view" />
  const open = plan.status === 'pending' || plan.status === 'shown'
  const isLatest = chain[chain.length - 1]?.id === plan.id

  const renderBlock = (card: number, b: Block, i: number): ReactNode => {
    switch (b.kind) {
      case 'md':
        return <Markdown key={i} text={b.text} />
      case 'mermaid':
        return (
          <Mermaid
            key={i}
            code={b.code}
            notes={plan.annotations.filter((a) => a.card === card && !a.resolved).map((a) => a.quote)}
            onNodeClick={(label) => open && openDraft(card, label, window.innerWidth / 2, 120)}
          />
        )
      case 'diff':
        return <DiffBlock key={i} code={b.code} file={b.file} />
      case 'pair':
        return <Pair key={i} before={b.before} after={b.after} />
      case 'code':
        return (
          <pre key={i} className="plan-code">
            <code>{b.code}</code>
          </pre>
        )
      case 'steps':
        return (
          <ul key={i} className="steps">
            {b.items.map((s, j) => (
              <li key={j} className={s.done ? 'done' : ''}>
                <span className="box">{s.done ? '✓' : ''}</span>
                {s.text}
              </li>
            ))}
          </ul>
        )
    }
  }

  return (
    <div className="plan-view">
      <header className="chat-header plan-header">
        <button className="btn small" onClick={onBack}>
          ← Chat
        </button>
        <span className="name">{plan.title}</span>
        {chain.length > 1 && (
          <select className="rev-pick" value={viewId} onChange={(e) => setViewId(e.target.value)}>
            {chain.map((p) => (
              <option key={p.id} value={p.id}>
                rev {p.revision} · {p.status} · {formatTime(p.createdAt)}
              </option>
            ))}
          </select>
        )}
        <span className={'pill ' + plan.status}>{plan.status}</span>
        {plan.progress && (
          <span className="progress" title="Steps done">
            <span className="progress-bar" style={{ width: `${Math.round((100 * plan.progress.done) / plan.progress.total)}%` }} />
            <span className="progress-txt">
              {plan.progress.done}/{plan.progress.total}
            </span>
          </span>
        )}
        {openNotes.length > 0 && <span className="hint">{openNotes.length} open note{openNotes.length > 1 ? 's' : ''}</span>}
        <button className="btn small" onClick={copyMd} title="Copy plan markdown">
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </header>
      <div className="plan-body" onMouseUp={onMouseUp}>
        <div className="plan-cards">
          {parsed.cards.map((c, i) => (
            <section
              key={i}
              className="plan-card"
              data-card={i}
              ref={(el) => {
                cardRefs.current[i] = el
              }}
            >
              <h3>{c.title}</h3>
              {c.blocks.map((b, j) => renderBlock(i, b, j))}
              {plan.annotations.some((a) => a.card === i) && (
                <div className="notes">
                  {plan.annotations
                    .filter((a) => a.card === i)
                    .map((a) => (
                      <div key={a.id} className={'note' + (a.resolved ? ' resolved' : '') + (a.orphaned ? ' orphaned' : '')}>
                        <div className="note-quote">
                          “{a.quote.slice(0, 120)}”{a.orphaned && <span className="note-flag"> · text no longer in this revision</span>}
                        </div>
                        <div className="note-text">{a.text}</div>
                        {a.replies?.map((r, k) => (
                          <div key={k} className={'note-reply ' + r.author}>
                            <span className="note-who">{r.author === 'agent' ? 'Agent' : 'You'}</span> {r.text}
                          </div>
                        ))}
                        <div className="note-actions">
                          {!a.resolved ? (
                            <button className="note-btn" onClick={() => patch(a.id, (x) => ({ ...x, resolved: true }))}>
                              Resolve
                            </button>
                          ) : (
                            <button className="note-btn" onClick={() => patch(a.id, (x) => ({ ...x, resolved: false }))}>
                              Reopen
                            </button>
                          )}
                          <button className="note-btn" onClick={() => save(plan.annotations.filter((x) => x.id !== a.id))}>
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
      {draft && open && (
        <div className="anno-pop" style={{ left: Math.max(160, Math.min(window.innerWidth - 160, draft.x)), top: Math.max(60, draft.y - 8) }} onMouseUp={(e) => e.stopPropagation()}>
          <div className="note-quote">“{draft.quote.slice(0, 80)}”</div>
          <textarea
            autoFocus
            value={draftText}
            placeholder="Comment…"
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) (e.preventDefault(), void addAnnotation())
              if (e.key === 'Escape') setDraft(null)
            }}
          />
          <div className="anno-actions">
            <button className="btn small" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button className="btn small primary" disabled={!draftText.trim()} onClick={addAnnotation}>
              Add
            </button>
          </div>
        </div>
      )}
      {open && isLatest && (
        <footer className="plan-footer">
          <input type="text" value={note} placeholder="General note (optional)…" onChange={(e) => setNote(e.target.value)} />
          <button className="btn" disabled={!canSend} onClick={() => respond('changes')} title={canSend ? '' : 'Select text (or click a diagram node) to add a note, or write a general note'}>
            Request changes
          </button>
          <button className="btn primary" onClick={() => respond('approve')}>
            {plan.status === 'pending' ? 'Approve & implement' : 'Approve'}
          </button>
        </footer>
      )}
    </div>
  )
}
