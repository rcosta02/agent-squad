// Wikilink parsing, resolution and graph. Pure, shared by the editor, backlinks panel and switcher.

export type Link = { target: string; alias?: string; line: number; text: string }
export type Graph = { out: Map<string, Set<string>>; in: Map<string, Set<string>>; unresolved: Map<string, Set<string>> }

/** Blank fenced blocks and inline code with spaces (same length, newlines kept) so offsets and line numbers survive. */
// Fences close at the matching fence or at the end of the text (an unclosed fence is code to the end, as the parser sees it).
export const stripCode = (md: string) =>
  md.replace(/(```|~~~)[\s\S]*?(?:\1|$(?![\s\S]))|`[^`\n]*`/g, (m) => m.replace(/[^\n]/g, ' '))

const noExt = (rel: string) => rel.replace(/\.md$/, '')
const base = (rel: string) => noExt(rel.slice(rel.lastIndexOf('/') + 1))

/** Every [[target]], [[target|alias]], [[target#heading]] outside code, with its 1-based line and the raw line text. */
export function extractLinks(md: string): Link[] {
  const out: Link[] = []
  const lines = md.split('\n')
  stripCode(md)
    .split('\n')
    .forEach((s, i) => {
      for (const m of s.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g)) {
        out.push({ target: m[1].trim(), alias: m[2]?.trim(), line: i + 1, text: lines[i] })
      }
    })
  return out
}

/** Spec rule: exact path (without .md) first, else basename; case-insensitive; ties by sorted path. */
export function resolve(target: string, pages: string[]): string | null {
  const t = noExt(target).toLowerCase()
  const sorted = [...pages].sort()
  return sorted.find((p) => noExt(p).toLowerCase() === t) ?? sorted.find((p) => base(p).toLowerCase() === t) ?? null
}

export function buildGraph(pages: Map<string, string>): Graph {
  const names = [...pages.keys()]
  const g: Graph = { out: new Map(), in: new Map(), unresolved: new Map() }
  for (const rel of names) {
    g.out.set(rel, new Set())
    g.in.set(rel, new Set())
    g.unresolved.set(rel, new Set())
  }
  for (const [rel, content] of pages) {
    for (const l of extractLinks(content)) {
      const to = resolve(l.target, names)
      if (to) {
        g.out.get(rel)!.add(to)
        g.in.get(to)!.add(rel)
      } else g.unresolved.get(rel)!.add(l.target)
    }
  }
  return g
}

/** Quick-switcher ranking: basename prefix, then basename substring, then path subsequence; shorter paths first. */
export function fuzzy(query: string, items: string[]): string[] {
  const q = query.toLowerCase()
  const score = (p: string) => {
    const b = base(p).toLowerCase()
    const full = p.toLowerCase()
    if (!q) return 3
    if (b.startsWith(q)) return 0
    if (b.includes(q)) return 1
    let i = 0
    for (const c of full) if (c === q[i]) i++
    return i === q.length ? 2 : -1
  }
  return items
    .map((p) => ({ p, s: score(p) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || a.p.length - b.p.length || a.p.localeCompare(b.p))
    .map((x) => x.p)
}
