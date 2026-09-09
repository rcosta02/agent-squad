import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { Agent, GroupMsg, Msg, Plan, Routine, Task, Workspace } from '../shared/types'

// ponytail: flat JSON files, no DB. Fine for hundreds of messages per agent.
const dir = () => {
  const d = process.env.CLAUDE_DESK_HOME || path.join(app.getPath('home'), '.claude-desk')
  fs.mkdirSync(d, { recursive: true })
  return d
}
const agentsFile = () => path.join(dir(), 'agents.json')
const workspacesFile = () => path.join(dir(), 'workspaces.json')
const routinesFile = () => path.join(dir(), 'routines.json')
const msgFile = (id: string) => path.join(dir(), `messages-${id}.json`)

const readJson = <T>(file: string, fallback: T): T => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

export const saveAttachment = (dataUrl: string): string => {
  const m = /^data:image\/(\w+);base64,(.+)$/.exec(dataUrl)
  if (!m) throw new Error('Not an image data URL')
  const d = path.join(dir(), 'attachments')
  fs.mkdirSync(d, { recursive: true })
  const file = path.join(d, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`)
  fs.writeFileSync(file, Buffer.from(m[2], 'base64'))
  return file
}
export const loadAgents = (): Agent[] => readJson<Agent[]>(agentsFile(), [])
export const loadWorkspaces = (): Workspace[] => readJson<Workspace[]>(workspacesFile(), [])
export const saveWorkspaces = (ws: Workspace[]) => fs.writeFileSync(workspacesFile(), JSON.stringify(ws, null, 2))
export const saveAgents = (agents: Agent[]) => fs.writeFileSync(agentsFile(), JSON.stringify(agents, null, 2))
export const loadRoutines = (): Routine[] => readJson<Routine[]>(routinesFile(), [])
export const saveRoutines = (rs: Routine[]) => fs.writeFileSync(routinesFile(), JSON.stringify(rs, null, 2))
export const loadGroup = (wsId: string): GroupMsg[] => readJson<GroupMsg[]>(path.join(dir(), `group-${wsId}.json`), [])
export const saveGroup = (wsId: string, msgs: GroupMsg[]) => fs.writeFileSync(path.join(dir(), `group-${wsId}.json`), JSON.stringify(msgs))
const plansDir = () => {
  const d = path.join(dir(), 'plans')
  fs.mkdirSync(d, { recursive: true })
  return d
}
export const loadPlan = (id: string): Plan | undefined => readJson<Plan | undefined>(path.join(plansDir(), `${id}.json`), undefined)
export const savePlan = (p: Plan) => fs.writeFileSync(path.join(plansDir(), `${p.id}.json`), JSON.stringify(p, null, 2))
export const loadTasks = (wsId: string): Task[] => readJson<Task[]>(path.join(dir(), `tasks-${wsId}.json`), [])
export const saveTasks = (wsId: string, tasks: Task[]) => fs.writeFileSync(path.join(dir(), `tasks-${wsId}.json`), JSON.stringify(tasks, null, 2))
export const loadMessages = (id: string): Msg[] => readJson<Msg[]>(msgFile(id), [])
export const saveMessages = (id: string, msgs: Msg[]) => fs.writeFileSync(msgFile(id), JSON.stringify(msgs))
export const deleteMessages = (id: string) => fs.rmSync(msgFile(id), { force: true })
