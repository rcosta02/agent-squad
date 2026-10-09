import type { Msg } from '../shared/types'

// Agent-facing recall over its own message log (all sessions). Pure functions so they're testable without Electron.
// ponytail: substring scan over the in-memory log. Add sqlite FTS if logs reach tens of MB.

type Hit = { id: string; session: number; date: string; role: 'user' | 'assistant'; text: string }

// Session N = messages after the (N-1)th divider; the log starts in session 1.
const walk = (msgs: Msg[]) => {
  let session = 1
  const out: Hit[] = []
  for (const m of msgs) {
    if (m.role === 'divider') session++
    else if ((m.role === 'user' || m.role === 'assistant') && m.text.trim())
      out.push({ id: m.id, session, date: new Date(m.ts).toISOString().slice(0, 16).replace('T', ' '), role: m.role, text: m.text })
  }
  return out
}

const snippet = (text: string, q: string, span = 300) => {
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  const start = Math.max(0, i - span / 2)
  const s = text.slice(start, start + span).replace(/\s+/g, ' ').trim()
  return (start > 0 ? '…' : '') + s + (start + span < text.length ? '…' : '')
}

const line = (h: Hit, text: string) => `[${h.id.slice(0, 8)} · session ${h.session} · ${h.date} · ${h.role}] ${text}`

export function searchHistory(msgs: Msg[], query: string, limit = 10): string {
  const q = query.toLowerCase()
  const hits = walk(msgs).filter((h) => h.text.toLowerCase().includes(q))
  if (!hits.length) return 'No matches.'
  const shown = hits.slice(-limit).reverse() // newest first
  const head = hits.length > shown.length ? `${hits.length} matches, newest ${shown.length}:\n\n` : ''
  return head + shown.map((h) => line(h, snippet(h.text, query))).join('\n\n')
}

// Either a whole session, or the messages around one id (as returned by search). Per-message text capped.
export function readHistory(msgs: Msg[], opts: { session?: number; near?: string; radius?: number; limit?: number }): string {
  const all = walk(msgs)
  const cap = (t: string) => (t.length > 1500 ? t.slice(0, 1500) + '…' : t)
  if (opts.near) {
    const i = all.findIndex((h) => h.id.startsWith(opts.near!))
    if (i < 0) return `No message with id ${opts.near}.`
    const r = opts.radius ?? 5
    return all.slice(Math.max(0, i - r), i + r + 1).map((h) => line(h, cap(h.text))).join('\n\n')
  }
  const last = all.at(-1)?.session ?? 1
  const n = opts.session ?? last
  const rows = all.filter((h) => h.session === n)
  if (!rows.length) return `No session ${n}. Sessions run 1..${last}.`
  const limit = opts.limit ?? 40
  const shown = rows.slice(-limit)
  const head = rows.length > shown.length ? `Session ${n}: ${rows.length} messages, last ${shown.length}:\n\n` : `Session ${n}:\n\n`
  return head + shown.map((h) => line(h, cap(h.text))).join('\n\n')
}
