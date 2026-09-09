import fs from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { app } from 'electron'

const root = () => path.join(process.env.CLAUDE_DESK_HOME || path.join(app.getPath('home'), '.claude-desk'), 'kb')
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

After writing: \`git -C <kb-folder> add -A && git -C <kb-folder> commit -qm "kb: <what changed>"\`.

Style: terse bullets, commands in backticks, absolute paths, no marketing language.
`

/** Make sure the folder, index, and the local plugin that carries the kb skill exist. Never overwrites existing files. */
export function ensureKb(dir: string, name: string) {
  for (const d of ['projects', 'runbooks', 'decisions', '.claude-plugin', 'skills/kb']) fs.mkdirSync(path.join(dir, d), { recursive: true })
  const write = (rel: string, content: string) => {
    const f = path.join(dir, rel)
    if (!fs.existsSync(f)) fs.writeFileSync(f, content)
  }
  write('README.md', README(name))
  write('architecture.md', `# Architecture\n\n(how the repos relate: data flow, shared services, who calls whom)\n`)
  write('practices.md', `# Practices\n\n(team conventions: commit format, branches, PR process, code style)\n`)
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
const SKIP = new Set(['.git', '.claude-plugin', 'skills', 'node_modules'])
const safe = (dir: string, rel: string) => {
  const abs = path.resolve(dir, rel)
  if (!abs.startsWith(dir + path.sep) || !abs.endsWith('.md')) throw new Error('Invalid path')
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

const commit = (dir: string, msg: string) => {
  try {
    execSync(`git add -A && git commit -qm ${JSON.stringify(msg)} --no-verify`, { cwd: dir, stdio: 'ignore' })
  } catch {} // nothing to commit, or git missing: file is saved regardless
}

export function kbWrite(dir: string, rel: string, content: string) {
  const abs = safe(dir, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
  commit(dir, `kb: edit ${rel} (user)`)
}

export function kbDelete(dir: string, rel: string) {
  if (rel === 'README.md') throw new Error('README.md is the index; edit it instead')
  fs.rmSync(safe(dir, rel), { force: true })
  commit(dir, `kb: delete ${rel} (user)`)
}
