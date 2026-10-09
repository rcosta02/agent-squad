import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { fuzzy } from '../links'

/** Typing [[ offers page names; accepting writes [[name]] and places the cursor after it. */
export function wikilinkCompletion(pages: () => string[]) {
  const source = (ctx: CompletionContext): CompletionResult | null => {
    const m = ctx.matchBefore(/\[\[([^\]]*)$/)
    if (!m) return null
    const q = m.text.slice(2)
    const names = pages().map((p) => p.replace(/\.md$/, ''))
    const after = ctx.state.doc.sliceString(ctx.pos, ctx.pos + 2) === ']]' ? 2 : 0
    return {
      from: m.from,
      to: ctx.pos + after,
      filter: false,
      options: fuzzy(q, names)
        .slice(0, 40)
        .map((name) => ({ label: name, type: 'text', apply: `[[${name}]]` }))
    }
  }
  return autocompletion({ override: [source], activateOnTyping: true, icons: false, closeOnBlur: true })
}
