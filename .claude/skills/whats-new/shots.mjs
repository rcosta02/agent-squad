// Drives the built app against a scratch home (never the user's data) and writes screenshots.
// Usage: node .claude/skills/whats-new/shots.mjs <steps.json> [--verify-dialog]
//   steps.json: [{ "click": "css" } | { "key": "Meta+o" } | { "type": "text" } | { "wait": 800 } | { "eval": "js" }
//                | { "shot": "name" } | { "clip": "name", "x":0,"y":0,"w":0,"h":0 } | { "exec": "shell" }]
//   Output PNGs land in src/renderer/src/whatsnew/img/<name>.png
//   --verify-dialog: clears seenVersion, launches, asserts the What's New dialog shows, fits without scrolling, closes on Enter,
//                    and stays hidden on a second launch. Exits 1 on failure.
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'

const APP = process.cwd()
const SKILL = path.dirname(new URL(import.meta.url).pathname)
const SCRATCH = path.join(os.tmpdir(), 'agent-squad-whatsnew')
const HOME = path.join(SCRATCH, 'home')
const IMG = path.join(APP, 'src/renderer/src/whatsnew/img')
const verify = process.argv.includes('--verify-dialog')
const stepsFile = process.argv.slice(2).find((a) => !a.startsWith('--'))

// Scratch home built entirely from dummy data. Nothing is read from ~/.agent-squad: marketing images must never show real work.
fs.rmSync(SCRATCH, { recursive: true, force: true })
fs.mkdirSync(path.join(HOME, 'kb'), { recursive: true })
const vault = path.join(HOME, 'kb', 'showcase')
fs.cpSync(path.join(SKILL, 'showcase-vault'), vault, { recursive: true })
execSync('git init -q && git add -A && git commit -qm "kb: init"', { cwd: vault, stdio: 'ignore' })
const version = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8')).version
const now = Date.now()
const ws = { id: 'ws-demo', name: 'Squad', emoji: '🚀', kbDir: vault }
const agent = (id, name, emoji, color, preview, minsAgo) => ({ id, workspaceId: ws.id, name, emoji, color, cwd: '/Users/alex/code/storefront', autonomous: false, provider: 'claude-code', updatedAt: now - minsAgo * 60000, preview })
const agents = [
  agent('a-architect', 'Architect', '🏗️', '#5e5ce6', 'Proposed splitting checkout into its own service; plan attached.', 12),
  agent('a-dev', 'Dev', '🚀', '#0a84ff', 'Pushed the fix and opened MR !412 — ready for review.', 35),
  agent('a-qa', 'QA', '🧪', '#30d158', 'All 212 e2e specs green on the release branch.', 120),
  agent('a-writer', 'Writer', '✍️', '#ff9f0a', 'Drafted the 2.14 changelog in the knowledge base.', 400)
]
const t = (m) => now - m * 60000
const devChat = [
  { id: 'm1', role: 'user', text: 'The cart total is off by one cent when a coupon is applied. Can you find it and fix it?', ts: t(40) },
  { id: 'm2', role: 'tool', toolUseId: 't1', name: 'Grep', input: { pattern: 'applyCoupon', path: 'src/cart' }, output: 'src/cart/total.ts:42: export function applyCoupon(total, coupon) {', done: true, ts: t(39) },
  { id: 'm3', role: 'tool', toolUseId: 't2', name: 'Read', input: { file_path: 'src/cart/total.ts' }, output: '…', done: true, ts: t(39) },
  { id: 'm4', role: 'assistant', text: 'Found it. `applyCoupon` rounds the discount before subtracting, so a 15% coupon on $19.99 drops a cent. Rounding once, after the subtraction, fixes it.\n\n- Patched `src/cart/total.ts`\n- Added a regression test with the $19.99 case\n- Pushed to `fix/coupon-rounding` and opened MR !412\n\nWant me to ask QA to run the checkout suite against it?', ts: t(36) },
  { id: 'm5', role: 'result', text: 'Done', costUsd: 0.18, durationMs: 212000, ts: t(36) }
]
fs.writeFileSync(path.join(HOME, 'workspaces.json'), JSON.stringify([ws], null, 2))
fs.writeFileSync(path.join(HOME, 'agents.json'), JSON.stringify(agents, null, 2))
fs.writeFileSync(path.join(HOME, 'messages-a-dev.json'), JSON.stringify(devChat))
fs.writeFileSync(path.join(HOME, 'routines.json'), '[]')
const profile = { firstName: 'Alex', lastName: 'Rivera', providers: ['claude-code'], theme: 'dark', zoom: 100 }
if (!verify) profile.seenVersion = version // no dialog in the way of captures
fs.writeFileSync(path.join(HOME, 'profile.json'), JSON.stringify(profile))

async function launch() {
  const app = await electron.launch({
    executablePath: path.join(APP, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: [APP, '--user-data-dir=' + path.join(SCRATCH, 'userdata')],
    env: { ...process.env, AGENT_SQUAD_HOME: HOME, AGENT_SQUAD_CLI: '/bin/false' }
  })
  const win = await app.firstWindow()
  const errors = []
  win.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  win.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
  await win.waitForTimeout(2500)
  await win.setViewportSize({ width: 1400, height: 860 })
  return { app, win, errors }
}

let failed = false
if (verify) {
  const { app, win, errors } = await launch()
  const open = await win.$('.modal.whatsnew')
  if (!open) (failed = true), console.log('FAIL: dialog did not show on first launch of this version')
  else {
    await win.screenshot({ path: path.join(SCRATCH, 'whatsnew.png') })
    const [sh, ch] = await win.evaluate(() => [document.querySelector('.modal.whatsnew').scrollHeight, document.querySelector('.modal.whatsnew').clientHeight])
    if (sh > ch) (failed = true), console.log(`FAIL: dialog overflows (${sh} > ${ch}px): shorten copy or images`)
    else console.log(`ok: dialog fits (${sh}/${ch}px), screenshot at ${path.join(SCRATCH, 'whatsnew.png')}`)
    await win.keyboard.press('Enter')
    await win.waitForTimeout(400)
    if (await win.$('.modal.whatsnew')) (failed = true), console.log('FAIL: Enter did not close the dialog')
  }
  if (errors.length) (failed = true), console.log('FAIL: console errors\n' + errors.join('\n'))
  await app.close()
  const second = await launch()
  if (await second.win.$('.modal.whatsnew')) (failed = true), console.log('FAIL: dialog showed again on second launch')
  else console.log('ok: quiet on second launch')
  await second.app.close()
} else {
  if (!stepsFile) (console.log('need a steps.json'), process.exit(2))
  const steps = JSON.parse(fs.readFileSync(stepsFile, 'utf8'))
  const { app, win, errors } = await launch()
  fs.mkdirSync(IMG, { recursive: true })
  for (const s of steps) {
    try {
      if (s.click) await win.click(s.click, { timeout: 4000 })
      else if (s.key) await win.keyboard.press(s.key)
      else if (s.type) await win.keyboard.type(s.type)
      else if (s.wait) await win.waitForTimeout(s.wait)
      else if (s.eval) console.log('eval:', await win.evaluate(s.eval))
      else if (s.exec) execSync(s.exec, { stdio: 'ignore' })
      else if (s.shot) await win.screenshot({ path: path.join(IMG, s.shot + '.png') })
      else if (s.clip) await win.screenshot({ path: path.join(IMG, s.clip + '.png'), clip: { x: s.x, y: s.y, width: s.w, height: s.h } })
    } catch (e) {
      failed = true
      console.log('STEP FAILED', JSON.stringify(s), String(e).split('\n')[0])
    }
  }
  if (errors.length) (failed = true), console.log('console errors:\n' + errors.join('\n'))
  await app.close()
  console.log('images in', IMG)
}
process.exit(failed ? 1 : 0)
