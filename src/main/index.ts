import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { Event } from '../shared/types'
import { Sessions } from './sessions'
import { kbDelete, kbList, kbRead, kbWrite } from './kb'
import * as mcp from './mcp'

// GUI apps on macOS get a bare PATH; pull the user's shell PATH so `claude`, node, MCP servers resolve.
try {
  const shellPath = execSync('/bin/zsh -lc "echo -n $PATH"', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').pop()
  process.env.PATH = [`${process.env.HOME}/.local/bin`, shellPath, process.env.PATH].filter(Boolean).join(':')
} catch {}

let win: BrowserWindow | null = null
const emit = (e: Event) => win?.webContents.send('event', e)
const sessions = new Sessions(emit)

const createWindow = () => {
  win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 500,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 },
    backgroundColor: '#1c1c1e',
    webPreferences: { preload: path.join(__dirname, '../preload/index.mjs'), sandbox: false }
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

ipcMain.handle('workspaces:list', () => sessions.listWorkspaces())
ipcMain.handle('workspaces:create', (_, input) => sessions.createWorkspace(input))
ipcMain.handle('workspaces:update', (_, id, patch) => sessions.updateWorkspace(id, patch))
ipcMain.handle('workspaces:delete', (_, id) => sessions.deleteWorkspace(id))
ipcMain.handle('agents:list', () => sessions.list())
ipcMain.handle('agents:create', (_, input) => sessions.create(input))
ipcMain.handle('agents:update', (_, id, patch) => sessions.update(id, patch))
ipcMain.handle('agents:delete', (_, id) => sessions.delete(id))
ipcMain.handle('messages:get', (_, id) => sessions.getMessages(id))
ipcMain.handle('chat:send', (_, id, text, images, planMode) => {
  void sessions.send(id, text, undefined, 0, undefined, images, undefined, planMode) // runs in background; results arrive as events
})
ipcMain.handle('plan:get', (_, id) => sessions.getPlan(id))
ipcMain.handle('plan:respond', (_, id, decision, feedback) => sessions.respondPlan(id, decision, feedback))
ipcMain.handle('plan:annotations', (_, id, annotations) => sessions.saveAnnotations(id, annotations))
ipcMain.handle('plan:revisions', (_, id) => sessions.planRevisions(id))
ipcMain.handle('file:savePng', async (_, name, dataUrl) => {
  const r = await dialog.showSaveDialog({ defaultPath: path.join(app.getPath('downloads'), name) })
  if (r.canceled || !r.filePath) return false
  fs.writeFileSync(r.filePath, Buffer.from(String(dataUrl).split(',')[1] ?? '', 'base64'))
  return true
})
ipcMain.handle('chat:interrupt', (_, id) => sessions.interrupt(id))
ipcMain.handle('view:set', (_, id) => sessions.setViewing(id))
ipcMain.handle('group:get', (_, wsId) => sessions.getGroup(wsId))
ipcMain.handle('tasks:list', (_, wsId) => sessions.listTasks(wsId))
ipcMain.handle('tasks:create', (_, input) => sessions.createTask(input, 'me'))
ipcMain.handle('tasks:update', (_, id, patch) => sessions.updateTask(id, patch, 'me'))
ipcMain.handle('tasks:delete', (_, id) => sessions.deleteTask(id))
ipcMain.handle('tasks:comment', (_, id, text) => sessions.commentTask(id, text, 'me'))
ipcMain.handle('tasks:ask', (_, id) => sessions.askAgent(id))
ipcMain.handle('group:send', (_, wsId, text) => sessions.sendGroup(wsId, text))
ipcMain.handle('chat:newSession', (_, id) => sessions.newSession(id))
ipcMain.handle('chat:switchSession', (_, id, sid) => sessions.switchSession(id, sid))
ipcMain.handle('chat:permission', (_, _id, toolUseId, allow) => sessions.respondPermission(toolUseId, allow))
ipcMain.handle('routines:list', () => sessions.listRoutines())
ipcMain.handle('routines:create', (_, input) => sessions.createRoutine(input))
ipcMain.handle('routines:update', (_, id, patch) => sessions.updateRoutine(id, patch))
ipcMain.handle('routines:delete', (_, id) => sessions.deleteRoutine(id))
ipcMain.handle('routines:run', (_, id) => sessions.runRoutine(id))
ipcMain.handle('kb:open', (_, wsId) => shell.openPath(sessions.kbDir(wsId)))
ipcMain.handle('kb:list', (_, wsId) => kbList(sessions.kbDir(wsId)))
ipcMain.handle('kb:read', (_, wsId, rel) => kbRead(sessions.kbDir(wsId), rel))
ipcMain.handle('kb:write', (_, wsId, rel, content) => kbWrite(sessions.kbDir(wsId), rel, content))
ipcMain.handle('kb:delete', (_, wsId, rel) => kbDelete(sessions.kbDir(wsId), rel))
let authDone: ((cb: string | null) => void) | null = null
ipcMain.handle('mcp:configured', (_, agentId) => mcp.configured(sessions.cwdOf(agentId)))
ipcMain.handle('mcp:add', (_, agentId, input) => mcp.add(input, sessions.cwdOf(agentId)))
ipcMain.handle('mcp:remove', (_, agentId, name, scope) => mcp.remove(name, scope, sessions.cwdOf(agentId)))
ipcMain.handle('mcp:authStart', (_, agentId, name) =>
  mcp.authenticate(
    name,
    sessions.cwdOf(agentId),
    (url) => emit({ type: 'mcpAuthUrl', url }),
    () => new Promise<string | null>((res) => (authDone = res))
  )
)
ipcMain.handle('mcp:authDone', (_, cb) => {
  authDone?.(cb ?? null)
  authDone = null
})
ipcMain.handle('shell:open', (_, url) => shell.openExternal(String(url)))
ipcMain.handle('clipboard:write', (_, text) => clipboard.writeText(String(text)))
ipcMain.handle('dialog:folder', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
  return r.canceled ? null : r.filePaths[0]
})

ipcMain.handle('dialog:image', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }] })
  if (r.canceled) return null
  const file = r.filePaths[0]
  const ext = path.extname(file).slice(1).toLowerCase()
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`
})

const toDataUrl = (file: string) => {
  const ext = path.extname(file).slice(1).toLowerCase()
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`
}
ipcMain.handle('dialog:images', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }] })
  return r.canceled ? [] : r.filePaths.map(toDataUrl)
})

app.whenReady().then(createWindow)
// Always on: closing the window keeps the app (and routines) alive; ⌘Q quits.
app.on('window-all-closed', () => {})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
  else win?.show()
})
