import { contextBridge, ipcRenderer } from 'electron'
import type { Api, Event } from '../shared/types'

const api: Api = {
  listWorkspaces: () => ipcRenderer.invoke('workspaces:list'),
  createWorkspace: (input) => ipcRenderer.invoke('workspaces:create', input),
  updateWorkspace: (id, patch) => ipcRenderer.invoke('workspaces:update', id, patch),
  deleteWorkspace: (id) => ipcRenderer.invoke('workspaces:delete', id),
  listAgents: () => ipcRenderer.invoke('agents:list'),
  createAgent: (input) => ipcRenderer.invoke('agents:create', input),
  updateAgent: (id, patch) => ipcRenderer.invoke('agents:update', id, patch),
  deleteAgent: (id) => ipcRenderer.invoke('agents:delete', id),
  getMessages: (agentId) => ipcRenderer.invoke('messages:get', agentId),
  send: (agentId, text, images, planMode) => ipcRenderer.invoke('chat:send', agentId, text, images, planMode),
  getPlan: (id) => ipcRenderer.invoke('plan:get', id),
  respondPlan: (id, decision, feedback) => ipcRenderer.invoke('plan:respond', id, decision, feedback),
  saveAnnotations: (id, annotations) => ipcRenderer.invoke('plan:annotations', id, annotations),
  planRevisions: (id) => ipcRenderer.invoke('plan:revisions', id),
  savePng: (name, dataUrl) => ipcRenderer.invoke('file:savePng', name, dataUrl),
  interrupt: (agentId) => ipcRenderer.invoke('chat:interrupt', agentId),
  setViewing: (id) => ipcRenderer.invoke('view:set', id),
  getGroup: (wsId) => ipcRenderer.invoke('group:get', wsId),
  sendGroup: (wsId, text) => ipcRenderer.invoke('group:send', wsId, text),
  newSession: (agentId) => ipcRenderer.invoke('chat:newSession', agentId),
  switchSession: (agentId, sessionId) => ipcRenderer.invoke('chat:switchSession', agentId, sessionId),
  respondPermission: (agentId, toolUseId, allow) => ipcRenderer.invoke('chat:permission', agentId, toolUseId, allow),
  listRoutines: () => ipcRenderer.invoke('routines:list'),
  createRoutine: (input) => ipcRenderer.invoke('routines:create', input),
  updateRoutine: (id, patch) => ipcRenderer.invoke('routines:update', id, patch),
  deleteRoutine: (id) => ipcRenderer.invoke('routines:delete', id),
  runRoutine: (id) => ipcRenderer.invoke('routines:run', id),
  openKb: (workspaceId) => ipcRenderer.invoke('kb:open', workspaceId),
  kbList: (workspaceId) => ipcRenderer.invoke('kb:list', workspaceId),
  kbRead: (workspaceId, rel) => ipcRenderer.invoke('kb:read', workspaceId, rel),
  kbWrite: (workspaceId, rel, content) => ipcRenderer.invoke('kb:write', workspaceId, rel, content),
  kbDelete: (workspaceId, rel) => ipcRenderer.invoke('kb:delete', workspaceId, rel),
  copy: (text) => ipcRenderer.invoke('clipboard:write', text),
  pickFolder: () => ipcRenderer.invoke('dialog:folder'),
  pickImage: () => ipcRenderer.invoke('dialog:image'),
  pickImages: () => ipcRenderer.invoke('dialog:images'),
  onEvent: (cb) => {
    const handler = (_: unknown, e: Event) => cb(e)
    ipcRenderer.on('event', handler)
    return () => ipcRenderer.removeListener('event', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
