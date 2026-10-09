import fs from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { home } from './store'

const root = () => path.join(home(), 'kb')
export const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'
export const defaultKbDir = (name: string) => path.join(root(), slug(name))

const README = (name: string) => `# ${name} knowledge base

Index only. One line per page. Read a page when the task touches it; do not load everything.

## Projects
(none yet — add \`projects/<repo>.md\`, one line each: **name** — what it is)

## Architecture
- architecture.md — how the repos relate

## Practices
- practices.md — team conventions: commits, branches, PRs, code style

## Runbooks
(none yet — \`runbooks/<topic>.md\`)

## Decisions
(none yet — \`decisions/YYYY-MM-DD-<slug>.md\`)
`

const SKILL = `---
name: kb
description: Use when reading from or writing to the shared workspace knowledge base (projects, architecture, run instructions, conventions, runbooks, decisions). Trigger before answering questions about how a repo works or is run, and whenever you learn a durable fact worth keeping for other agents.
---

# Workspace knowledge base

Location: the folder named in your system prompt ("Shared knowledge base at ..."). Plain markdown, git-tracked.

## Reading
1. README.md is the index. It is already in your context. Do not re-read it.
2. Open only the page(s) the task needs: \`projects/<repo>.md\` for a repo, \`runbooks/\` for procedures, \`architecture.md\` for cross-repo questions.
3. Unsure which page? \`grep -ril <keyword> <kb-folder>\` then read the hit.
4. KB beats assumptions. If KB and the code disagree, trust the code and fix the KB.

## Writing
Write only durable facts: how to run/test/deploy, structure, gotchas, conventions, decisions. Never task status, chat history, secrets, or env values.

- Repo fact → \`projects/<repo>.md\`, right section (Run / Structure / Related / Gotchas). Keep page under ~50 lines; replace stale lines instead of appending duplicates.
- Cross-repo relationship → \`architecture.md\`.
- Team convention → \`practices.md\`.
- Procedure (deploy, rollback, debug recipe) → \`runbooks/<topic>.md\`, numbered steps, commands in code blocks.
- Decision with a why → \`decisions/YYYY-MM-DD-<slug>.md\`: Context / Decision / Consequences, under 15 lines.
- New page → add one line to README.md under the right heading. Keep README an index, not content.
- Link related pages with wikilinks: \`[[page-name]]\` (file name without .md; folder paths like \`[[runbooks/deploy]]\` also work). The user sees backlinks in the KB editor, so link generously: a runbook to its project page, a decision to what it affects.

After writing: \`git -C <kb-folder> add -A && git -C <kb-folder> commit -qm "kb: <what changed>"\`.

Style: terse bullets, commands in backticks, absolute paths, no marketing language.
`

/** Make sure the folder, index, and the local plugin that carries the kb skill exist. Never overwrites existing files. */
export function ensureKb(dir: string, name: string) {
  // Starter pages are seeded once (no .git yet). Afterwards the user owns the pages: a deleted or renamed
  // architecture.md must stay deleted, so only the app-owned skill files are kept current.
  const fresh = !fs.existsSync(path.join(dir, '.git'))
  for (const d of ['.claude-plugin', 'skills/kb', ...(fresh ? ['projects', 'runbooks', 'decisions'] : [])]) fs.mkdirSync(path.join(dir, d), { recursive: true })
  const write = (rel: string, content: string) => {
    const f = path.join(dir, rel)
    if (!fs.existsSync(f)) fs.writeFileSync(f, content)
  }
  if (fresh) {
    write('README.md', README(name))
    write('architecture.md', `# Architecture\n\n(how the repos relate: data flow, shared services, who calls whom)\n`)
    write('practices.md', `# Practices\n\n(team conventions: commit format, branches, PR process, code style)\n`)
  }
  write('README.md', README(name)) // the index must exist: the system prompt reads it and the editor opens it
  write('.claude-plugin/plugin.json', JSON.stringify({ name: 'kb', description: `Knowledge base skill for the ${name} workspace`, version: '1.0.0' }, null, 2))
  write('.gitignore', '.DS_Store\n')
  fs.writeFileSync(path.join(dir, 'skills/kb/SKILL.md'), SKILL) // always refresh: it is app-owned, not user content
  if (!fs.existsSync(path.join(dir, '.git'))) {
    try {
      execSync('git init -q && git add -A && git commit -qm "kb: init" --no-verify', { cwd: dir, stdio: 'ignore' })
    } catch {}
  }
}

/** README index for the system prompt, capped so it never dominates context. */
export function readIndex(dir: string, maxChars = 6000): string {
  try {
    const s = fs.readFileSync(path.join(dir, 'README.md'), 'utf8')
    return s.length > maxChars ? s.slice(0, maxChars) + '\n…(index truncated; grep the folder for more)' : s
  } catch {
    return ''
  }
}

// ---------- user-facing file access (renderer editor) ----------
export { kbList, kbRead, kbReadAll, kbWrite, kbCreate, kbCommit, kbDelete, kbMkdir, kbRename, watchKb } from './kbfs'
