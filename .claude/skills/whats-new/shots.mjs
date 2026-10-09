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

// scratch home: real agents/workspaces/profile (so the UI looks lived-in) but a bundled showcase vault for the KB
fs.rmSync(SCRATCH, { recursive: true, force: true })
fs.mkdirSync(path.join(HOME, 'kb'), { recursive: true })
const real = process.env.AGENT_SQUAD_HOME || path.join(os.homedir(), '.agent-squad')
for (const f of fs.readdirSync(real)) if (f.endsWith('.json')) fs.copyFileSync(path.join(real, f), path.join(HOME, f))
const vault = path.join(HOME, 'kb', 'showcase')
fs.cpSync(path.join(SKILL, 'showcase-vault'), vault, { recursive: true })
execSync('git init -q && git add -A && git commit -qm "kb: init"', { cwd: vault, stdio: 'ignore' })
const wsFile = path.join(HOME, 'workspaces.json')
const ws = JSON.parse(fs.readFileSync(wsFile, 'utf8'))
if (ws[0]) {
  ws[0].kbDir = vault
  ws[0].name = 'Squad'
}
fs.writeFileSync(wsFile, JSON.stringify(ws))
const profileFile = path.join(HOME, 'profile.json')
const profile = JSON.parse(fs.readFileSync(profileFile, 'utf8'))
profile.theme = 'dark'
if (verify) delete profile.seenVersion
else profile.seenVersion = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8')).version // no dialog in the way of captures
fs.writeFileSync(profileFile, JSON.stringify(profile))

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
