---
name: kb
description: Use when reading from or writing to the shared workspace knowledge base (projects, architecture, run instructions, conventions, runbooks, decisions). Trigger before answering questions about how a repo works or is run, and whenever you learn a durable fact worth keeping for other agents.
---

# Workspace knowledge base

Location: the folder named in your system prompt ("Shared knowledge base at ..."). Plain markdown, git-tracked.

## Reading
1. README.md is the index. It is already in your context. Do not re-read it.
2. Open only the page(s) the task needs: `projects/<repo>.md` for a repo, `runbooks/` for procedures, `architecture.md` for cross-repo questions.
3. Unsure which page? `grep -ril <keyword> <kb-folder>` then read the hit.
4. KB beats assumptions. If KB and the code disagree, trust the code and fix the KB.

## Writing
Write only durable facts: how to run/test/deploy, structure, gotchas, conventions, decisions. Never task status, chat history, secrets, or env values.

- Repo fact → `projects/<repo>.md`, right section (Run / Structure / Related / Gotchas). Keep page under ~50 lines; replace stale lines instead of appending duplicates.
- Cross-repo relationship → `architecture.md`.
- Team convention → `practices.md`.
- Procedure (deploy, rollback, debug recipe) → `runbooks/<topic>.md`, numbered steps, commands in code blocks.
- Decision with a why → `decisions/YYYY-MM-DD-<slug>.md`: Context / Decision / Consequences, under 15 lines.
- New page → add one line to README.md under the right heading. Keep README an index, not content.
- Link related pages with wikilinks: `[[page-name]]` (file name without .md; folder paths like `[[runbooks/deploy]]` also work). The user sees backlinks in the KB editor, so link generously: a runbook to its project page, a decision to what it affects.

After writing: `git -C <kb-folder> add -A && git -C <kb-folder> commit -qm "kb: <what changed>"`.

Style: terse bullets, commands in backticks, absolute paths, no marketing language.
