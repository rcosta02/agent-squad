// Shared contract between main (Electron) and renderer (React).

export type Workspace = { id: string; name: string; emoji: string; image?: string; kbDir?: string; groupUnread?: number; boardUnread?: number } // image = small data URL; empty = initials. kbDir = shared knowledge base folder

// ponytail: only Claude Code has a runner. Re-add codex / openai / opencode / cursor / anthropic-api here once sessions.ts can run them.
export const PROVIDERS = [['claude-code', 'Claude Code', 'CLI subscription']] as const
export type Provider = (typeof PROVIDERS)[number][0]
export type Theme = 'dark' | 'light'
export type Profile = { firstName: string; lastName: string; providers: Provider[]; theme?: Theme; zoom?: number } // zoom = percent, 100 = default

export type Agent = {
  id: string
  provider?: Provider // undefined = claude-code (agents created before providers existed)
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
  mcp?: { name: string; status: string; tools?: string[] }[] // from the last session init
  commands?: string[] // slash commands the CLI reported
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

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'blocked' | 'review' | 'done'
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'
export type TaskComment = { author: 'me' | string; text: string; ts: number } // author = 'me' or agent id
export type Task = {
  id: string
  number: number // per-workspace, for "#12"
  workspaceId: string
  title: string
  description: string
  status: TaskStatus
  order: number // sort key within a column
  assignee?: 'me' | string // agent id
  priority: TaskPriority
  labels: string[]
  createdBy: 'me' | string
  createdAt: number
  updatedAt: number
  planId?: string
  comments: TaskComment[]
}

export type McpServerInfo = { name: string; scope: 'user' | 'local' | 'project'; transport: string; target: string }

export type MeetingSegment = { t: number; who: 'Me' | 'Them'; text: string } // t = seconds from start
export type Meeting = {
  id: string
  workspaceId: string
  title: string
  dir: string // raw audio + meeting.json
  kbPath?: string // transcript copy inside the workspace KB (meetings/<id>-<slug>.md)
  summaryPath?: string // inline summary, if generated
  kbSummaryPath?: string // summary page inside the knowledge base, once added
  startedAt: number
  endedAt?: number
  status: 'recording' | 'stopping' | 'done'
  segments: MeetingSegment[]
  pendingChunks: number
  transcriptPath?: string
  language?: string // 'auto' | 'en' | 'pt' ...
  model?: string // whisper model file name
  error?: string
  silentSys?: number // consecutive all-zero system chunks (permission missing)
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
  | { id: string; role: 'user'; text: string; from?: string; routine?: string; group?: boolean; images?: string[]; files?: string[]; ts: number } // from = another agent's name; routine = routine name that fired this
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
  | { type: 'task'; task: Task }
  | { type: 'mcpAuthUrl'; url: string }
  | { type: 'meeting'; meeting: Meeting }
  | { type: 'taskDeleted'; taskId: string; workspaceId: string }

export type Api = {
  listWorkspaces(): Promise<Workspace[]>
  createWorkspace(input: { name: string; emoji: string; image?: string }): Promise<Workspace>
  updateWorkspace(id: string, patch: Partial<Workspace>): Promise<Workspace>
  deleteWorkspace(id: string): Promise<void> // refuses if it still has agents
  listAgents(): Promise<Agent[]>
  createAgent(input: { workspaceId: string; name: string; emoji: string; color: string; cwd: string; autonomous: boolean; systemPrompt?: string; model?: string; provider?: Provider }): Promise<Agent>
  getProfile(): Promise<Profile | null> // null = first run, show onboarding
  saveProfile(p: Profile): Promise<Profile>
  setZoom(percent: number): void
  setTheme(theme: Theme): Promise<void> // also repaints the native window background
  updateAgent(id: string, patch: Partial<Agent>): Promise<Agent>
  deleteAgent(id: string): Promise<void>
  getMessages(agentId: string): Promise<Msg[]>
  send(agentId: string, text: string, images?: string[], planMode?: boolean, files?: string[]): Promise<void> // images = data URLs; files = local paths handed to the agent as-is
  pickFiles(): Promise<string[]> // any files, returns paths
  pathForFile(file: File): string // local path of a dropped File (Electron webUtils)
  getPlan(id: string): Promise<Plan>
  respondPlan(id: string, decision: 'approve' | 'changes', feedback: string): Promise<void>
  saveAnnotations(id: string, annotations: Annotation[]): Promise<void>
  planRevisions(id: string): Promise<Plan[]> // whole chain, oldest first
  savePng(name: string, dataUrl: string): Promise<boolean> // save dialog
  interrupt(agentId: string): Promise<void>
  setViewing(id: string | null): Promise<void> // agent id or 'group:<workspaceId>'; which chat is on screen + window focused; marks it read
  getGroup(workspaceId: string): Promise<GroupMsg[]>
  listTasks(workspaceId: string): Promise<Task[]>
  createTask(input: { workspaceId: string; title: string; status?: TaskStatus; assignee?: string; priority?: TaskPriority; description?: string; labels?: string[]; planId?: string }): Promise<Task>
  updateTask(id: string, patch: Partial<Task>): Promise<Task>
  deleteTask(id: string): Promise<void>
  commentTask(id: string, text: string): Promise<Task>
  askAgent(taskId: string): Promise<void> // explicit: message the assignee to work on it
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
  mcpConfigured(agentId: string): Promise<McpServerInfo[]>
  mcpAdd(agentId: string, input: { name: string; transport: 'http' | 'sse' | 'stdio'; target: string; args?: string[]; env?: Record<string, string>; headers?: Record<string, string>; scope: 'user' | 'local' | 'project' }): Promise<void>
  mcpRemove(agentId: string, name: string, scope: 'user' | 'local' | 'project'): Promise<void>
  mcpAuthStart(agentId: string, name: string): Promise<string> // resolves with DONE / FAILED when the flow ends
  mcpAuthDone(): Promise<void> // cancel a running login
  mcpAuthInput(text: string): Promise<void> // answer a prompt of the running login (e.g. paste the redirect URL)
  openExternal(url: string): Promise<void>
  dictate(wavBase64: string, language?: string): Promise<string> // 16 kHz mono 16-bit WAV → text via whisper
  micAccess(): Promise<boolean>
  meetingStart(workspaceId: string, title: string, opts?: { language?: string; model?: string }): Promise<Meeting>
  whisperModels(): Promise<{ file: string; label: string; available: boolean; progress?: number }[]> // progress = % while downloading
  meetingStop(): Promise<Meeting | null> // stops and finishes transcription; nothing else happens
  meetingCurrent(): Promise<Meeting | null>
  meetingList(workspaceId: string): Promise<Meeting[]> // newest first
  meetingRead(id: string): Promise<string> // transcript markdown
  meetingSummarize(id: string): Promise<string> // direct Claude call, returns markdown; no agent involved
  meetingSummary(id: string): Promise<string> // existing summary markdown or ''
  meetingToKb(id: string): Promise<string> // deterministic: writes the summary page into the knowledge base, returns its relative path
  meetingRename(id: string, title: string): Promise<Meeting>
  meetingDelete(id: string): Promise<void>
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
