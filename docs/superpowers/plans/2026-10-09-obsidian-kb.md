# Obsidian-style KB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the toast-ui KB editor with an Obsidian-like live-preview markdown workspace: file tree, CodeMirror 6 editor, wikilinks, backlinks, quick switcher, vault search.

**Architecture:** Main process keeps owning files (read/write/rename/commit/watch) behind IPC. Renderer holds all pages in memory (`useKb` hook) and derives the link graph. The editor is CodeMirror 6 with one decoration plugin that hides markdown syntax on inactive lines. Styling is a scoped CSS file carrying Obsidian's measured variables.

**Tech Stack:** Electron, React 19, CodeMirror 6 (`@codemirror/state|view|language|commands|autocomplete|lang-markdown`, `@lezer/markdown`), node:fs watch, git via execSync.

**Spec:** `docs/superpowers/specs/2026-10-09-obsidian-kb-design.md`

## Global Constraints

- Notes are `.md` only; every path resolves under the workspace KB dir; `.git`, `.claude-plugin`, `skills`, dotfiles hidden; `README.md` cannot be deleted.
- Link resolution rule (shared by editor, backlinks, rename): `[[x]]` matches path-without-`.md` equal to `x`, else basename equal to `x`; case-insensitive; ties by sorted path.
- Typography/colour values exactly as the spec's Styling section.
- Tests: assert-based node scripts run by `npm test` (`node --experimental-strip-types`), no framework.
- Commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. Note text containing `[[` inside fenced code must not be treated as a link (editor + graph). Test in Task 2 and Task 4.
2. Rename to a name that already exists must refuse, not overwrite. Test in Task 1.
3. Agent writes the open note while the user has unsaved edits: user text must survive, status shows "Changed on disk". Covered by hook logic in Task 6 (manual check).
4. Multi-line selection must reveal raw markdown on every covered line, not only the head line. Test in Task 4.
5. Unresolved wikilink click creates the note in the current folder, never at the root when inside a folder. Test in Task 2 (resolve) + manual.

---

### Task 1: Main-process KB API

**Files:**
- Modify: `src/main/kb.ts` (kbWrite no commit; add kbCommit, kbRename, kbMkdir, kbReadAll, watch)
- Modify: `src/main/index.ts` (IPC handlers, `kb://` protocol)
- Modify: `src/preload/index.ts`, `src/shared/types.ts` (Api + `kbChanged` Event)
- Test: `src/main/kb.test.ts`

**Interfaces (Produces):**
```ts
kbWrite(dir, rel, content): void                 // no commit
kbCommit(dir): void
kbRename(dir, from, to): string[]                // returns rels whose links were rewritten
kbMkdir(dir, rel): void
kbReadAll(dir): { rel: string; content: string }[]
watchKb(dir, onChange: () => void): () => void   // returns stop
rewriteLinks(content, from, to): string           // pure, exported for tests
Api: kbCommit(ws), kbRename(ws, from, to), kbMkdir(ws, rel), kbReadAll(ws), kbWatch(ws, on: boolean)
Event: { type: 'kbChanged'; workspaceId: string }
```

- [ ] Test `rewriteLinks` on a temp string: `[[a]]`, `[[a|x]]`, `[[a#h]]`, `[[dir/a]]` → new name; `[[ab]]` untouched; links inside fenced code untouched.
- [ ] Test `kbRename` in a temp dir with git: file moved, other page rewritten, refuses when target exists.
- [ ] Implement; run `npm test`; commit `feat(kb): rename, commit, read-all, watcher`.

### Task 2: Link graph + resolution (renderer, pure)

**Files:**
- Create: `src/renderer/src/kb/links.ts`
- Test: `src/renderer/src/kb/links.test.ts`

**Interfaces (Produces):**
```ts
stripCodeBlocks(md): string                          // fenced + inline code blanked (same length)
extractLinks(md): { target: string; alias?: string; line: number; text: string }[]
resolve(target, pages: string[]): string | null     // spec rule
buildGraph(pages: Map<rel, content>): { out: Map<rel, Set<rel>>; in: Map<rel, Set<rel>>; unresolved: Map<rel, Set<string>> }
fuzzy(query, items: string[]): string[]             // subsequence match, ranked by basename hit then path length
```

- [ ] Tests: code-fence exclusion; alias/heading parsing; resolve exact path > basename > null, case-insensitive; graph in/out; fuzzy ranking.
- [ ] Implement; `npm test`; commit.

### Task 3: Dependencies + CSS

**Files:**
- Modify: `package.json` (add CodeMirror packages, remove `@toast-ui/editor`)
- Create: `src/renderer/src/kb/kb.css`

- [ ] `npm i @codemirror/state @codemirror/view @codemirror/language @codemirror/commands @codemirror/autocomplete @codemirror/lang-markdown @lezer/markdown @lezer/highlight && npm rm @toast-ui/editor`
- [ ] Write `kb.css` with all spec variables and rules for `.kb-root`, tree, editor classes (`cm-header-N`, `HyperMD-list-line`, `cm-quote`, `cm-inline-code`, `cm-hmd-codeblock`, `cm-hmd-internal-link`, `is-unresolved`, table widget, checkbox widget), sidebars, switcher modal, status bar; light/dark via `[data-theme]`.
- [ ] Build passes; commit.

### Task 4: Live-preview decoration plugin

**Files:**
- Create: `src/renderer/src/kb/editor/livePreview.ts` (pure `buildDecorations` + ViewPlugin)
- Create: `src/renderer/src/kb/editor/widgets.ts` (bullet, checkbox, hr, table, image widgets)
- Test: `src/renderer/src/kb/editor/livePreview.test.ts`

**Interfaces (Produces):**
```ts
activeLines(state: EditorState): Set<number>                    // 1-based line numbers touched by any selection range
buildDecorations(state: EditorState, opts: { imgUrl(rel): string }): DecorationSet
livePreview(opts): Extension
```
Tests run CodeMirror in node (no DOM needed for state + decorations): parse fixtures, collect `{from,to,kind}` from the set, assert hidden ranges for each construct, assert nothing hidden on active lines, assert multi-line selection reveals all lines, assert `[[x]]` inside code fence not styled as link.

- [ ] Tests → impl → `npm test` → commit.

### Task 5: Editor component

**Files:**
- Create: `src/renderer/src/kb/editor/Editor.tsx`
- Create: `src/renderer/src/kb/editor/keymap.ts` (bold/italic/strike/link toggles, list continuation, task toggle)
- Create: `src/renderer/src/kb/editor/wikilinkComplete.ts`

**Interfaces (Produces):**
```ts
<Editor value docKey pages={string[]} onChange(md) onOpenLink(target) imgUrl(rel) scrollToLine? />
```
- [ ] Implement; manual check in app; commit.

### Task 6: KB state hook

**Files:**
- Create: `src/renderer/src/kb/useKb.ts`

**Interfaces (Produces):**
```ts
useKb(wsId) → { pages, graph, current, text, dirty, diskChanged, open(rel), setText, save(), commit(), create(rel), mkdir(rel), rename(from,to), remove(rel), reload() }
```
Autosave 400 ms; commit on switch/close/blur/60 s idle; `kbChanged` → refetch, reload if clean else `diskChanged`.

- [ ] Implement; commit.

### Task 7: Shell UI

**Files:**
- Create: `src/renderer/src/kb/KbView.tsx`, `FileTree.tsx`, `Backlinks.tsx`, `Switcher.tsx` (quick open + vault search in one modal with two modes), `InlineTitle.tsx`
- Modify: `src/renderer/src/App.tsx` (mount KbView instead of KbModal)
- Delete: `src/renderer/src/components/KbModal.tsx`, `MdEditor.tsx`

- [ ] Implement tree (collapse state in localStorage, context menu, drag-move), inline title rename, backlinks, Cmd+O / Cmd+N / Cmd+Shift+F, status bar.
- [ ] Manual checklist from spec; commit.

### Task 8: Skill text + version

- [ ] Update `SKILL` in `src/main/kb.ts`: `[[name]]` links, backlinks visible to user.
- [ ] Bump to 0.2.0; commit.
