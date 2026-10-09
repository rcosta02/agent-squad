import { extractLinks, type Graph } from './links'

type Props = { current: string | null; pages: Map<string, string>; graph: Graph; resolve(t: string): string | null; onOpen(rel: string, line: number): void }

/** Obsidian's "Linked mentions": every page linking here, with the line that holds the link. */
export default function Backlinks({ current, pages, graph, resolve, onOpen }: Props) {
  const sources = current ? [...(graph.in.get(current) ?? [])].sort() : []
  const mentions = sources.flatMap((src) =>
    extractLinks(pages.get(src) ?? '')
      .filter((l) => resolve(l.target) === current)
      .map((l) => ({ src, line: l.line, text: l.text.trim() }))
  )
  return (
    <>
      <div className="kb-side-head">
        <span className="title">Linked mentions</span>
        <span className="hint">{mentions.length}</span>
      </div>
      <div className="kb-backlinks">
        {mentions.length === 0 && <div className="none">No backlinks found.</div>}
        {mentions.map((m, i) => (
          <button key={i} className="kb-backlink" onClick={() => onOpen(m.src, m.line)}>
            <div className="page">{m.src.replace(/\.md$/, '')}</div>
            <div className="ctx">{highlight(m.text)}</div>
          </button>
        ))}
      </div>
    </>
  )
}

const highlight = (s: string) => {
  const parts = s.split(/(\[\[[^\]]+\]\])/)
  return parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))
}
