// File-level KB operations. No Electron imports so this runs under plain node (tests) and main.
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const SKIP = new Set(['.git', '.claude-plugin', 'skills', 'node_modules'])

/** Resolve a user-supplied relative path under the KB dir. Notes must be .md; folders when allowDir. */
const safe = (dir: string, rel: string, allowDir = false) => {
  const abs = path.resolve(dir, rel)
  if (!abs.startsWith(dir + path.sep)) throw new Error('Invalid path')
  if (!allowDir && !abs.endsWith('.md')) throw new Error('Invalid path')
  if (path.relative(dir, abs).split(path.sep).some((s) => SKIP.has(s) || s.startsWith('.'))) throw new Error('Invalid path')
  return abs
}

export function kbList(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (SKIP.has(e.name) || e.name.startsWith('.')) continue
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.md')) out.push(path.relative(dir, p))
    }
  }
  walk(dir)
  // README first, then top-level pages, then folders alphabetically
  return out.sort((a, b) => (a === 'README.md' ? -1 : b === 'README.md' ? 1 : (a.includes('/') ? 1 : 0) - (b.includes('/') ? 1 : 0) || a.localeCompare(b)))
}

export const kbRead = (dir: string, rel: string) => fs.readFileSync(safe(dir, rel), 'utf8')
export const kbReadAll = (dir: string) => kbList(dir).map((rel) => ({ rel, content: fs.readFileSync(path.join(dir, rel), 'utf8') }))

export function kbCommit(dir: string, msg = 'kb: edit (user)') {
  try {
    execSync(`git add -A && git commit -qm ${JSON.stringify(msg)} --no-verify`, { cwd: dir, stdio: 'ignore' })
  } catch {} // nothing to commit, or git missing: files are saved regardless
}

/** Write without committing; the editor autosaves and commits at natural pauses via kbCommit. */
export function kbWrite(dir: string, rel: string, content: string) {
  const abs = safe(dir, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
}

export function kbMkdir(dir: string, rel: string) {
  fs.mkdirSync(safe(dir, rel, true), { recursive: true })
}

export function kbDelete(dir: string, rel: string) {
  if (rel === 'README.md') throw new Error('README.md is the index; edit it instead')
  fs.rmSync(safe(dir, rel, true), { recursive: true, force: true })
  kbCommit(dir, `kb: delete ${rel} (user)`)
}

// ---------- links ----------

const noExt = (rel: string) => rel.replace(/\.md$/, '')
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Rewrite [[from]] → [[to]] (plus |alias and #heading forms) outside code. `from`/`to` are link targets:
 * a note path without .md, or a folder path (then every [[folder/...]] link under it moves).
 */
export function rewriteLinks(content: string, from: string, to: string): string {
  const re = new RegExp(`\\[\\[(${escapeRe(from)})((?:/[^\\]|#]*)?)([#|][^\\]]*)?\\]\\]`, 'gi')
  const rewrite = (s: string) => s.replace(re, (_m, _f, sub, tail) => `[[${to}${sub ?? ''}${tail ?? ''}]]`)
  // split on fenced blocks and inline code spans; only rewrite the prose parts
  return content
    .split(/(```[\s\S]*?```|`[^`\n]*`)/)
    .map((part, i) => (i % 2 ? part : rewrite(part)))
    .join('')
}

/** Move a note or folder; rewrite links in every page; one commit. Returns the pages whose links changed. */
export function kbRename(dir: string, from: string, to: string): string[] {
  const absFrom = safe(dir, from, true)
  const absTo = safe(dir, to, true)
  if (!fs.existsSync(absFrom)) throw new Error(`${from} does not exist`)
  if (fs.existsSync(absTo)) throw new Error(`${to} already exists`)
  const isDir = fs.statSync(absFrom).isDirectory()
  if (!isDir && (!from.endsWith('.md') || !to.endsWith('.md'))) throw new Error('Invalid path')
  fs.mkdirSync(path.dirname(absTo), { recursive: true })
  fs.renameSync(absFrom, absTo)
  // link targets: folder-qualified always; bare basename when it moved
  const pairs: [string, string][] = isDir ? [[from, to]] : [[noExt(from), noExt(to)]]
  if (!isDir && path.basename(from) !== path.basename(to)) pairs.push([noExt(path.basename(from)), noExt(path.basename(to))])
  const touched: string[] = []
  for (const { rel, content } of kbReadAll(dir)) {
    let next = content
    for (const [a, b] of pairs) next = rewriteLinks(next, a, b)
    if (next !== content) {
      fs.writeFileSync(path.join(dir, rel), next)
      touched.push(rel)
    }
  }
  kbCommit(dir, `kb: rename ${from} → ${to} (user)`)
  return touched
}

/** Watch the KB folder (agents write to it); debounced, ignores .git. Returns a stop function. */
export function watchKb(dir: string, onChange: () => void): () => void {
  let t: NodeJS.Timeout | undefined
  const w = fs.watch(dir, { recursive: true }, (_e, name) => {
    if (typeof name === 'string' && name.split(path.sep).some((s) => SKIP.has(s))) return
    clearTimeout(t)
    t = setTimeout(onChange, 200)
  })
  return () => {
    clearTimeout(t)
    w.close()
  }
}
