---
name: whats-new
description: Use when preparing an Agent Squad release and the What's New dialog needs its entry for the version in package.json — before `npm run release`, or when asked to "write the what's new", "release notes dialog", "announce this version".
---

# What's New entry for a release

The dialog in `src/renderer/src/whatsnew/` shows one entry, once, the first time a user runs a new version. The entry sells the release to a non-technical reader: what they can now do, in their words, with pictures. The code is the source of truth for every claim; the git range is the source of truth for what is in the release.

## The deliverable

One object appended to `NOTES` in `src/renderer/src/whatsnew/notes.ts`, `version` equal to `package.json` `version`, plus its images in `src/renderer/src/whatsnew/img/`. Shape:

| Field | Shape |
|---|---|
| `headline` | 3-6 words, outcome not feature ("Your knowledge base, reimagined") |
| `tagline` | one sentence under 25 words, what changes for the reader |
| `hero` | full-width screenshot of the release's biggest feature, imported from `./img/` |
| `features` | exactly 4 cards; `title` 2-4 words, `text` 1-2 sentences of benefit, every card has an `image` |
| `also` | 0-3 items, each under 14 words, for smaller user-visible changes |

Voice: second person, present tense, concrete ("⌘O jumps to any page"), no commit language, no internals (no "refactor", "StateField", "IPC"). Keyboard shortcuts as ⌘ glyphs. Nothing in the dialog about the dialog itself.

## Steps

1. **Scope the release.** `git describe --tags --abbrev=0` gives the last released tag; `git log --oneline <tag>..HEAD` is the release. Read each user-facing commit's diff enough to state what a user can now do. Internal fixes, docs, CI, signing: not announcement material (an invisible fix may earn an `also` line only if users hit the bug).
2. **Verify every claim in code** before writing it: shortcuts in the component that binds them, behaviours in the function that implements them. A claim you cannot point to a line for does not go in.
3. **Capture images with the harness first, never reuse last release's pictures.** Images before copy: `notes.ts` imports them, and the build fails on a missing PNG. Save a steps file as `.claude/skills/whats-new/<version>-shots.json` (start from `kb-shots.json`; adjust clicks and clip boxes), build, run:
   ```bash
   npx electron-vite build
   node .claude/skills/whats-new/shots.mjs .claude/skills/whats-new/<version>-shots.json
   ```
   It launches the built app on a scratch home with the bundled showcase vault (your real data never appears), runs the steps, writes PNGs into `img/`. Clip boxes exclude the app chrome: start at x ≥ 82 (the rail) and y ≥ 52 (the title bar). View every PNG you reference; recrop until the subject fills the frame. Card images are shown at about 350×82 px cropped from the top-left, so clip tight around the one thing the card is about.
4. **Write the entry** in `notes.ts` to the shape above, importing the PNGs you just captured. Keep older entries; only the running version's entry is shown.
5. **Verify the dialog in the app**:
   ```bash
   npm test && npx electron-vite build && node .claude/skills/whats-new/shots.mjs --verify-dialog
   ```
   Passes only when the dialog shows on first launch of this version, fits without scrolling, closes on Enter, and stays hidden on the second launch. Overflow means shorter copy or shorter images, not a taller window. Look at the screenshot it prints before calling it done.
6. **Commit** `notes.ts` and the new images together. Do not bump the version here; the release step owns that.

## Common mistakes

- Reusing images from the previous entry: the pictures are the feature; a stale picture sells the wrong thing.
- Listing commits as bullets: readers want outcomes, four of them, not a changelog.
- Four cards but two without images: the grid leaves holes and the dialog grows past the window.
- Clip boxes starting at x=0: the workspace rail ends up in every picture.
- Writing from memory of the diff: a shortcut that does not exist in the component is a support ticket.
- Calling it done after `tsc`: the dialog is layout; only the app run proves it fits.
