// Shared contract between main (Electron) and renderer (React).

export type Workspace = { id: string; name: string; emoji: string; image?: string; kbDir?: string; groupUnread?: number } // image = small data URL; empty = initials. kbDir = shared knowledge base folder

export type Agent = {
  id: string
  workspaceId: string
  name: string
  emoji: string
  color: string // hex, avatar background
  cwd: string
  sessionId?: string // current Claude Code session id; undefined = next message starts fresh
  sessions?: Session[] // every session this agent has had, oldest first
  autonomous: boolean // true = bypass permission prompts
  model?: string // 'opus' | 'sonnet' | 'haiku' | full id; undefined = user default
  systemPrompt?: string // appended to Claude Code's default prompt
  updatedAt: number
  preview?: string // last assistant line, for sidebar
  unread?: boolean // agent replied while its chat was not on screen
  unreadCount?: number // replies since the chat was last on screen
}

export type NoteReply = { author: 'me' | 'agent'; text: string; ts: number }
export type Annotation = { id: string; card: number; quote: string; text: string; ts: number; replies?: NoteReply[]; resolved?: boolean; orphaned?: boolean }
export type Plan = {
  id: string
  agentId: string
  title: string
  markdown: string
  createdAt: number
  status: 'pending' | 'approved' | 'changes' | 'shown' // pending = agent is waiting (plan mode); shown = informational
  annotations: Annotation[]
  parentId?: string // previous revision
  childId?: string // next revision
  revision: number // 1-based
  progress?: { done: number; total: number } // checklist steps
}

export type GroupMsg = { id: string; author: 'me' | string; text: string; ts: number } // author = 'me' or agent id

export type RoutineStatus = 'active' | 'paused' | 'cancelled'
export type Routine = {
  id: string
  agentId: string
  name: string
  cron: string // 5-field cron, local time
  prompt: string
  status: RoutineStatus
  createdAt: number
  lastRunAt?: number
  lastResult?: 'ok' | 'error' | 'busy' // busy = agent was mid-turn, tick skipped
  nextRunAt?: number
}

export type Session = { sessionId: string; startedAt: number; title: string }

export type Msg =
  | { id: string; role: 'user'; text: string; from?: string; routine?: string; group?: boolean; images?: string[]; ts: number } // from = another agent's name; routine = routine name that fired this
  | { id: string; role: 'assistant'; text: string; ts: number; streaming?: boolean }
  | {
      id: string
      role: 'tool'
      toolUseId: string
      name: string
      input: unknown
      output?: string
      error?: boolean
      done: boolean
      ts: number
    }
  | {
      id: string
      role: 'permission'
      toolUseId: string
      name: string
      input: unknown
      decision?: 'allow' | 'deny'
      ts: number
    }
  | { id: string; role: 'result'; text: string; costUsd?: number; durationMs?: number; error?: boolean; ts: number }
  | { id: string; role: 'divider'; text: string; ts: number }
  | { id: string; role: 'plan'; planId: string; title: string; status: Plan['status']; revision?: number; progress?: { done: number; total: number }; ts: number }

export type Event =
  | { type: 'message'; agentId: string; msg: Msg } // upsert by msg.id
  | { type: 'delta'; agentId: string; msgId: string; text: string } // append to assistant msg text
  | { type: 'status'; agentId: string; running: boolean }
  | { type: 'agent'; agent: Agent } // upsert
  | { type: 'agentDeleted'; agentId: string }
  | { type: 'workspace'; workspace: Workspace }
  | { type: 'workspaceDeleted'; workspaceId: string }
  | { type: 'routine'; routine: Routine }
  | { type: 'routineDeleted'; routineId: string }
  | { type: 'group'; workspaceId: string; msg: GroupMsg }
  | { type: 'plan'; plan: Plan }

export type Api = {
  listWorkspaces(): Promise<Workspace[]>
  createWorkspace(input: { name: string; emoji: string; image?: string }): Promise<Workspace>
  updateWorkspace(id: string, patch: Partial<Workspace>): Promise<Workspace>
  deleteWorkspace(id: string): Promise<void> // refuses if it still has agents
  listAgents(): Promise<Agent[]>
  createAgent(input: { workspaceId: string; name: string; emoji: string; color: string; cwd: string; autonomous: boolean; systemPrompt?: string; model?: string }): Promise<Agent>
  updateAgent(id: string, patch: Partial<Agent>): Promise<Agent>
  deleteAgent(id: string): Promise<void>
  getMessages(agentId: string): Promise<Msg[]>
  send(agentId: string, text: string, images?: string[], planMode?: boolean): Promise<void> // images = data URLs; planMode = read-only turn ending in a plan for approval
  getPlan(id: string): Promise<Plan>
  respondPlan(id: string, decision: 'approve' | 'changes', feedback: string): Promise<void>
  saveAnnotations(id: string, annotations: Annotation[]): Promise<void>
  planRevisions(id: string): Promise<Plan[]> // whole chain, oldest first
  savePng(name: string, dataUrl: string): Promise<boolean> // save dialog
  interrupt(agentId: string): Promise<void>
  setViewing(id: string | null): Promise<void> // agent id or 'group:<workspaceId>'; which chat is on screen + window focused; marks it read
  getGroup(workspaceId: string): Promise<GroupMsg[]>
  sendGroup(workspaceId: string, text: string): Promise<void> // @mentioned agents receive it
  newSession(agentId: string): Promise<void>
  switchSession(agentId: string, sessionId: string): Promise<void>
  respondPermission(agentId: string, toolUseId: string, allow: boolean): Promise<void>
  listRoutines(): Promise<Routine[]>
  createRoutine(input: { agentId: string; name: string; cron: string; prompt: string }): Promise<Routine>
  updateRoutine(id: string, patch: Partial<Routine>): Promise<Routine>
  deleteRoutine(id: string): Promise<void>
  runRoutine(id: string): Promise<void> // fire now, ignoring schedule
  openKb(workspaceId: string): Promise<void> // reveal the workspace knowledge base in Finder
  kbList(workspaceId: string): Promise<string[]> // relative paths of .md files
  kbRead(workspaceId: string, rel: string): Promise<string>
  kbWrite(workspaceId: string, rel: string, content: string): Promise<void> // writes + git commit
  kbDelete(workspaceId: string, rel: string): Promise<void>
  copy(text: string): Promise<void> // system clipboard
  pickFolder(): Promise<string | null>
  pickImage(): Promise<string | null> // data URL of the chosen image file
  pickImages(): Promise<string[]> // data URLs, multi-select
  onEvent(cb: (e: Event) => void): () => void
}

declare global {
  interface Window {
    api: Api
  }
}
