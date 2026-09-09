import type { Msg } from '../../shared/types'

export type UserMsg = Extract<Msg, { role: 'user' }>
export type AssistantMsg = Extract<Msg, { role: 'assistant' }>
export type ToolMsg = Extract<Msg, { role: 'tool' }>
export type PermissionMsg = Extract<Msg, { role: 'permission' }>
export type ResultMsg = Extract<Msg, { role: 'result' }>

export const EMOJIS = ['🤖', '🦊', '🐙', '🦉', '🐝', '🦄', '🐧', '🦋', '🐬', '🦁', '🌵', '🚀']
export const COLORS = ['#5ac8fa', '#34c759', '#ff9f0a', '#ff375f', '#bf5af2', '#0a84ff', '#ffd60a', '#64d2ff']

export function randomEmoji(): string {
  return EMOJIS[Math.floor(Math.random() * EMOJIS.length)]
}

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

function basename(p: string): string {
  const parts = p.split('/')
  return parts[parts.length - 1] || p
}

export function summarize(name: string, input: unknown): string {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : undefined)
  switch (name) {
    case 'Bash':
      return trunc((str('command') ?? '').replace(/\s+/g, ' '), 80)
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
      return basename(str('file_path') ?? '')
    case 'Grep':
    case 'Glob':
      return str('pattern') ?? ''
    case 'WebFetch':
      return str('url') ?? ''
    case 'Agent':
    case 'Task':
      return str('description') ?? ''
    case 'TodoWrite':
      return 'updated todos'
    default: {
      const v = Object.values(o).find((x) => typeof x === 'string') as string | undefined
      return trunc(v ?? '', 60)
    }
  }
}

export function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  if (now.getTime() - ts < 6 * 86400000) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function prettyJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const s = words.length >= 2 ? words[0][0] + words[1][0] : words[0].slice(0, 2)
  return s.toUpperCase()
}

/** Downscale an image data URL to a square cover-cropped PNG so workspaces.json stays small. */
export function shrinkImage(dataUrl: string, size = 128): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = c.height = size
      const ctx = c.getContext('2d')!
      const side = Math.min(img.width, img.height)
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size)
      resolve(c.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = dataUrl
  })
}
