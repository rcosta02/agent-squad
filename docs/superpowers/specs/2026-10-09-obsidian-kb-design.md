# Obsidian-style knowledge base — design

Date: 2026-10-09. Status: approved design, pending implementation plan.

## Goal

The workspace knowledge base (a git-tracked folder of markdown under `~/.agent-squad/kb/<workspace>`) is edited inside Agent Squad with the look and feel of Obsidian's default theme: live-preview markdown editing, `[[wikilinks]]` with backlinks, a folder tree, and a quick switcher. Single note open at a time. Same typography, spacing, and colours as Obsidian 1.14 defaults (values measured from its `app.css`; values are copied, the stylesheet is not).

Out of scope for v1: tabs and split panes, graph view, plugins, canvas, property editor UI, unlinked mentions, sync.

## Data layer (main process, `src/main/kb.ts`)

Existing `kbList`, `kbRead`, `kbDelete` stay. Changes:

| Call | Behaviour |
|---|---|
| `kbWrite(ws, rel, content)` | Writes the file. No commit. |
| `kbCommit(ws)` | `git add -A && git commit -m "kb: edit <files> (user)"`. No-op when clean. |
| `kbRename(ws, from, to)` | Moves a file or folder. Rewrites `[[from]]`, `[[from\|alias]]`, `[[from#heading]]` (and the folder-prefixed forms) in every page. One commit `kb: rename from → to (user)`. Refuses to overwrite. |
| `kbMkdir(ws, rel)` | Creates a folder. |
| `kbReadAll(ws)` | `{ rel, content }[]` for every page in one call. |
| `kbOpen(ws)` / `kbClose(ws)` | Start/stop a recursive `fs.watch` on the KB dir (debounced 200 ms, ignores `.git`). Emits `Event { type: 'kbChanged', workspaceId }`. |

Path safety as today: resolved path must stay under the KB dir; `.git`, `.claude-plugin`, `skills`, dotfiles hidden. Notes are `.md` only. `README.md` cannot be deleted.

Commit points (renderer-driven): switching note, closing the KB view, window blur, 60 s after the last edit.

Images: a `kb://<workspaceId>/<rel>` protocol registered in main serves files from the KB dir so `![[img.png]]` and `![](img.png)` render.

KB skill text (`SKILL` in `kb.ts`): agents link pages with `[[name]]` (file name without `.md`, folder paths allowed), and are told the user sees backlinks. README stays the index that enters the system prompt.

## Editor (`src/renderer/src/kb/editor/`)

CodeMirror 6: `@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/lang-markdown` (GFM, strikethrough, task list, table), `@codemirror/autocomplete`, `@codemirror/commands`, `@lezer/markdown`. toast-ui editor removed.

### Live preview plugin

A `ViewPlugin` rebuilds decorations on document or selection change from the Lezer tree of the visible ranges.

- A line is **active** when any selection head or anchor is on it, or a multi-line selection covers it. Active lines show raw markdown with syntax classes only.
- On **inactive** lines, delimiters are hidden with `Decoration.replace`: heading `#`s, `**`/`*`/`_`/`~~`/`` ` `` pairs, link brackets and URLs (`[text](url)` shows `text`), wikilink brackets (`[[page|alias]]` shows `alias`, else `page`), blockquote `>`, list markers (replaced by a bullet widget), task markers (replaced by a checkbox widget that toggles `[ ]`/`[x]` in the source), `---` thematic break (rule widget), code fence lines.
- Styling uses Obsidian's class names so the measured CSS applies directly: `cm-header cm-header-1..6`, `cm-strong`, `cm-em`, `cm-strikethrough`, `cm-inline-code`, `cm-hmd-codeblock` (line class), `cm-quote`, `cm-link`, `cm-url`, `cm-hmd-internal-link`, `cm-hmd-internal-link is-unresolved`, `HyperMD-list-line HyperMD-list-line-N`, `HyperMD-header HyperMD-header-N`, `HyperMD-quote`, `HyperMD-codeblock`, `HyperMD-table-row`.
- **Tables**: when no selection touches the table node, the whole node is replaced by a rendered table widget; otherwise raw text with row classes.
- **Images**: `![[file]]` / `![alt](path)` replaced by an image widget resolved through `kb://`; raw on the active line.
- **Frontmatter**: a leading `---` block renders as one collapsed "Properties" line when inactive.

Pure function `buildDecorations(tree, doc, activeLines): RangeSet` is unit-testable without a DOM.

### Links

- Click (or Cmd+click when the line is active) on a wikilink opens the target; unresolved targets create `<name>.md` in the current folder.
- Typing `[[` opens autocompletion over page names (fuzzy, folder-aware); accepting inserts `[[name]]` and closes the brackets.
- `[text](url)` external links open via `shell.openExternal`.

### Keymap

Cmd+B / Cmd+I / Cmd+Shift+X toggle strong / em / strike; Cmd+K wraps selection as link; Tab / Shift+Tab indent list items; Enter continues lists and task items (empty item ends the list); Cmd+Enter toggles the task on the current line; Cmd+Z / Shift+Cmd+Z history. Standard CodeMirror search panel is disabled; vault search is ours.

## Shell UI (`src/renderer/src/kb/`)

Full view (replaces `KbModal`, which is deleted). Layout, left to right:

1. **File tree** (260 px, collapsible). Folders expand/collapse, state kept in `localStorage` per workspace. Header buttons: new note, new folder, collapse all. Context menu: new note here, new folder here, rename, delete (confirm). Drag a note onto a folder to move it (`kbRename`). Active note highlighted. Sorted folders first, then files, case-insensitive.
2. **Note** (center). Inline title: the file name rendered as an editable H1; blur or Enter renames via `kbRename`. Below it the editor, `--file-line-width: 700px`, centered, `--file-margins` padding. Empty state when nothing is open.
3. **Linked mentions** (280 px, collapsible). For the open note: each page linking to it, with the line containing the link. Click opens that page and scrolls to the line.

Commands: Cmd+O quick switcher (fuzzy over relative paths; Enter opens; Shift+Enter creates a note with the typed name). Cmd+N new untitled note in the current folder, title focused. Cmd+Shift+F vault search: substring, case-insensitive, over all pages; results show page and context line; Enter opens and selects the match. Esc closes panels; when no panel is open Esc is ignored (the back button returns to conversations).

Status bar: `Saved` / `Unsaved` / `Changed on disk — Reload` and word count.

### State

`useKb(workspaceId)` owns: `pages: Map<rel, content>`, `links: { out: Map<rel, Set<rel>>, in: Map<rel, Set<rel>> }` rebuilt from `[[...]]` over all contents, `current`, `dirty`, `diskChanged`. On `kbChanged` events it refetches `kbReadAll`; the open note reloads only if not dirty, otherwise `diskChanged` is set. Autosave: `kbWrite` 400 ms after the last change. Commit per the commit points above.

Link resolution: `[[x]]` matches a page whose path without `.md` equals `x`, else whose basename equals `x` (first by sorted path). Case-insensitive. Same rule used by the editor, backlinks, and rename rewriting.

## Styling (`src/renderer/src/kb/kb.css`, scoped under `.kb-root`)

Obsidian 1.14 default values:

- Fonts: text and UI `ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, "Inter", sans-serif`; mono `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`.
- Sizes: text 16 px, UI 13 px (small) / 15 px (medium); line-height 1.5 (tight 1.3); `--p-spacing: 1rem`; heading spacing 2.5 × p-spacing; headings 1.618 / 1.462 / 1.318 / 1.188 / 1.076 / 1 em, weights 700 then 600, line-heights 1.2 / 1.2 / 1.3 / 1.4 / 1.5 / 1.5; inline code `0.875em`; list indent 2 em; checkbox 18 px.
- Dark: base-00 `#1e1e1e`, base-10 `#242424`, base-20 `#262626`, base-25 `#2a2a2a`, base-30 `#363636`, base-35 `#3f3f3f`, base-40 `#555`, base-50 `#666`, base-60 `#999`, base-70 `#b3b3b3`, base-100 `#dadada`. Light: `#fff`, `#fafafa`, `#f6f6f6`, `#efefef`, `#e4e4e4`, `#dadada`, `#bdbdbd`, `#ababab`, `#707070`, `#5c5c5c`, `#222`. Accent `hsl(258 88% 66%)`; unresolved link = accent at 50 % opacity; blockquote border accent; code background base-20/base-10; selection accent at 20 %.
- Nav items 24 px rows, 13 px, radius 4 px; sidebars base-20 background with 1 px base-30 border.
- Follows the app's `data-theme` attribute.

## Testing

Node tests under `npm test` (assert-based, no framework): decoration ranges for each construct, active-line reveal, link graph builder, link resolution, rename rewriting (plain, alias, heading, folder prefix), fuzzy matcher ordering.

Manual checklist before release: open the same note in Obsidian and Agent Squad side by side; compare headings, paragraphs, lists, checkboxes, quotes, code, tables, links, images at 100 % zoom; type each construct and confirm reveal/hide on cursor move; rename a page and confirm links updated in Obsidian too; let an agent edit a page while it is open.

## Rollout

Same folder, same files, no migration. Ships as 0.2.0.
