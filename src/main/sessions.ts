import { createSdkMcpServer, query, tool, type Options, type PermissionResult, type Query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import { execSync } from 'node:child_process'
import type { Agent, Event, GroupMsg, Msg, Routine, Workspace } from '../shared/types'
import { loadAgents, loadGroup, loadMessages, loadRoutines, loadWorkspaces, saveAgents, saveAttachment, saveGroup, saveMessages, saveRoutines, saveWorkspaces, deleteMessages } from './store'
import { cronMatches, isValidCron, nextRun } from './cron'
import { defaultKbDir, ensureKb, readIndex } from './kb'

type Emit = (e: Event) => void
type Group = { wsId: string; author: string } // turn triggered from the workspace group chat
type Pending = { text: string; from?: string; hop: number; routine?: string; group?: Group }
const MAX_HOPS = 4 // ponytail: A->B->A->B then stop; prevents agents chatting forever

// Electron's process.execPath is not node, so spawn the user's native `claude` binary instead of the SDK's bundled JS.
const claudeBin = (() => {
  if (process.env.CLAUDE_DESK_CLI) return process.env.CLAUDE_DESK_CLI
  try {
    return execSync('which claude', { encoding: 'utf8' }).trim() || undefined
  } catch {
    return undefined
  }
})()

export class Sessions {
  private agents: Agent[] = loadAgents()
  private workspaces: Workspace[] = loadWorkspaces()
  private routines: Routine[] = loadRoutines()
  private lastTickMinute = -1
  private messages = new Map<string, Msg[]>()
  private active = new Map<string, { q: Query; abort: AbortController }>()
  private pending = new Map<string, (allow: boolean) => void>() // toolUseId -> resolver
  private queue = new Map<string, Pending[]>() // agent-to-agent messages waiting for a busy agent
  private viewing: string | null = null // agent id or 'group:<wsId>' on screen while the window is focused
  private groups = new Map<string, GroupMsg[]>()
  private resetAfter = new Set<string>() // agents that asked for a fresh session once their turn ends

  constructor(private emit: Emit) {
    // Migration: agents created before workspaces existed go into a default one.
    if (this.workspaces.length === 0) {
      this.workspaces.push({ id: randomUUID(), name: 'Default', emoji: '🏠' })
      saveWorkspaces(this.workspaces)
    }
    let dirty = false
    for (const a of this.agents) {
      if (!a.workspaceId || !this.workspaces.some((w) => w.id === a.workspaceId)) {
        a.workspaceId = this.workspaces[0].id
        dirty = true
      }
    }
    if (dirty) saveAgents(this.agents)
    // Every workspace gets a knowledge base folder (additive: never touches existing files).
    let wsDirty = false
    for (const w of this.workspaces) {
      if (!w.kbDir) {
        w.kbDir = defaultKbDir(w.name)
        wsDirty = true
      }
      ensureKb(w.kbDir, w.name)
    }
    if (wsDirty) saveWorkspaces(this.workspaces)
    for (const r of this.routines) r.nextRunAt = r.status === 'active' ? nextRun(r.cron) : undefined
    setInterval(() => this.tick(), 20_000)
  }

  // ---------- routines ----------
  listRoutines() {
    return this.routines
  }

  createRoutine(input: { agentId: string; name: string; cron: string; prompt: string }) {
    if (!isValidCron(input.cron)) throw new Error('Invalid cron expression')
    this.get(input.agentId)
    const r: Routine = { ...input, id: randomUUID(), status: 'active', createdAt: Date.now(), nextRunAt: nextRun(input.cron) }
    this.routines.push(r)
    saveRoutines(this.routines)
    this.emit({ type: 'routine', routine: r })
    return r
  }

  updateRoutine(id: string, patch: Partial<Routine>) {
    const r = this.routines.find((x) => x.id === id)
    if (!r) throw new Error('No such routine')
    if (patch.cron !== undefined && !isValidCron(patch.cron)) throw new Error('Invalid cron expression')
    Object.assign(r, patch, { id, agentId: r.agentId })
    r.nextRunAt = r.status === 'active' ? nextRun(r.cron) : undefined
    saveRoutines(this.routines)
    this.emit({ type: 'routine', routine: r })
    return r
  }

  deleteRoutine(id: string) {
    this.routines = this.routines.filter((r) => r.id !== id)
    saveRoutines(this.routines)
    this.emit({ type: 'routineDeleted', routineId: id })
  }

  async runRoutine(id: string) {
    const r = this.routines.find((x) => x.id === id)
    if (!r) throw new Error('No such routine')
    if (this.active.has(r.agentId)) {
      this.updateRoutine(id, { lastRunAt: Date.now(), lastResult: 'busy' })
      return
    }
    this.updateRoutine(id, { lastRunAt: Date.now(), lastResult: 'ok' })
    try {
      await this.send(r.agentId, r.prompt, undefined, 0, r.name)
    } catch {
      this.updateRoutine(id, { lastResult: 'error' })
    }
  }

  private tick() {
    const now = new Date()
    const minute = Math.floor(now.getTime() / 60_000)
    if (minute === this.lastTickMinute) return
    this.lastTickMinute = minute
    for (const r of this.routines) {
      if (r.status !== 'active' || !cronMatches(r.cron, now)) continue
      if (!this.agents.some((a) => a.id === r.agentId)) continue
      void this.runRoutine(r.id)
    }
  }

  listWorkspaces() {
    return this.workspaces
  }

  createWorkspace(input: { name: string; emoji: string; image?: string }) {
    const w: Workspace = { ...input, id: randomUUID(), kbDir: defaultKbDir(input.name) }
    ensureKb(w.kbDir!, w.name)
    this.workspaces.push(w)
    saveWorkspaces(this.workspaces)
    this.emit({ type: 'workspace', workspace: w })
    return w
  }

  kbDir(wsId: string) {
    const w = this.workspaces.find((x) => x.id === wsId)
    if (!w?.kbDir) throw new Error('No such workspace')
    ensureKb(w.kbDir, w.name)
    return w.kbDir
  }

  updateWorkspace(id: string, patch: Partial<Workspace>) {
    const w = this.workspaces.find((x) => x.id === id)
    if (!w) throw new Error('No such workspace')
    Object.assign(w, patch, { id })
    saveWorkspaces(this.workspaces)
    this.emit({ type: 'workspace', workspace: w })
    return w
  }

  deleteWorkspace(id: string) {
    if (this.agents.some((a) => a.workspaceId === id)) throw new Error('Workspace still has agents. Delete or move them first.')
    if (this.workspaces.length === 1) throw new Error('Cannot delete the last workspace')
    this.workspaces = this.workspaces.filter((w) => w.id !== id)
    saveWorkspaces(this.workspaces)
    this.emit({ type: 'workspaceDeleted', workspaceId: id })
  }

  list() {
    return this.agents
  }

  create(input: Omit<Agent, 'id' | 'updatedAt'>) {
    const agent: Agent = { ...input, id: randomUUID(), updatedAt: Date.now() }
    this.agents.push(agent)
    saveAgents(this.agents)
    return agent
  }

  update(id: string, patch: Partial<Agent>) {
    const a = this.get(id)
    Object.assign(a, patch, { id })
    saveAgents(this.agents)
    this.emit({ type: 'agent', agent: a })
    if ('unread' in patch) this.refreshBadge()
    return a
  }

  delete(id: string) {
    this.interrupt(id)
    this.routines = this.routines.filter((r) => r.agentId !== id)
    saveRoutines(this.routines)
    this.agents = this.agents.filter((a) => a.id !== id)
    this.messages.delete(id)
    deleteMessages(id)
    saveAgents(this.agents)
    this.emit({ type: 'agentDeleted', agentId: id })
  }

  getMessages(id: string) {
    if (!this.messages.has(id)) this.messages.set(id, loadMessages(id))
    return this.messages.get(id)!
  }

  async interrupt(id: string) {
    const a = this.active.get(id)
    if (!a) return
    try {
      await a.q.interrupt()
    } catch {
      a.abort.abort()
    }
  }

  newSession(id: string) {
    const agent = this.get(id)
    if (this.active.has(id)) throw new Error('Agent is busy')
    if (!agent.sessionId) return
    this.push(agent, this.getMessages(id), { id: randomUUID(), role: 'divider', text: 'New session', ts: Date.now() })
    this.update(id, { sessionId: undefined })
  }

  switchSession(id: string, sessionId: string) {
    const agent = this.get(id)
    if (this.active.has(id)) throw new Error('Agent is busy')
    if (agent.sessionId === sessionId) return
    const s = agent.sessions?.find((x) => x.sessionId === sessionId)
    this.push(agent, this.getMessages(id), { id: randomUUID(), role: 'divider', text: `Resumed: ${s?.title ?? sessionId.slice(0, 8)}`, ts: Date.now() })
    this.update(id, { sessionId })
  }

  setViewing(id: string | null) {
    this.viewing = id
    const a = id && this.agents.find((x) => x.id === id)
    if (a && a.unread) this.update(a.id, { unread: false, unreadCount: 0 })
    if (id?.startsWith('group:')) {
      const w = this.workspaces.find((x) => x.id === id.slice(6))
      if (w?.groupUnread) this.updateWorkspace(w.id, { groupUnread: 0 })
    }
  }

  // ---------- group chat ----------
  getGroup(wsId: string) {
    if (!this.groups.has(wsId)) this.groups.set(wsId, loadGroup(wsId))
    return this.groups.get(wsId)!
  }

  /** Match @Name against agent names, longest name first, case-insensitive. */
  private mentions(text: string, candidates: Agent[]): Agent[] {
    const sorted = [...candidates].sort((a, b) => b.name.length - a.name.length)
    const hit = new Set<Agent>()
    const re = /@/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      const rest = text.slice(m.index + 1)
      const a = sorted.find((c) => rest.toLowerCase().startsWith(c.name.toLowerCase()) && !/[\w]/.test(rest.charAt(c.name.length)))
      if (a) hit.add(a)
    }
    return [...hit]
  }

  async sendGroup(wsId: string, text: string, author: 'me' | string = 'me', hop = 0) {
    const w = this.workspaces.find((x) => x.id === wsId)
    if (!w) throw new Error('No such workspace')
    const msgs = this.getGroup(wsId)
    const msg: GroupMsg = { id: randomUUID(), author, text, ts: Date.now() }
    msgs.push(msg)
    saveGroup(wsId, msgs)
    this.emit({ type: 'group', workspaceId: wsId, msg })
    if (author !== 'me' && this.viewing !== `group:${wsId}`) this.updateWorkspace(wsId, { groupUnread: (w.groupUnread ?? 0) + 1 })
    if (hop >= MAX_HOPS) return
    const members = this.agents.filter((a) => a.workspaceId === wsId && a.id !== author)
    const authorName = author === 'me' ? 'Rafael' : (this.agents.find((a) => a.id === author)?.name ?? 'someone')
    for (const a of this.mentions(text, members)) void this.send(a.id, text, undefined, hop, undefined, undefined, { wsId, author: authorName })
  }

  private refreshBadge() {
    const n = this.agents.filter((a) => a.unread).length
    app.dock?.setBadge(n ? String(n) : '')
  }

  respondPermission(toolUseId: string, allow: boolean) {
    this.pending.get(toolUseId)?.(allow)
    this.pending.delete(toolUseId)
  }

  async send(id: string, text: string, from?: string, hop = 0, routine?: string, imageData?: string[], group?: Group) {
    const agent = this.get(id)
    if (this.active.has(id)) {
      if (!from && !group) throw new Error('Agent is busy')
      this.queue.set(id, [...(this.queue.get(id) ?? []), { text, from, hop, group }])
      return
    }
    const msgs = this.getMessages(id)
    const images = imageData?.length ? imageData.map(saveAttachment) : undefined
    this.push(agent, msgs, { id: randomUUID(), role: 'user', text, from: group ? group.author : from, group: !!group, routine, images, ts: Date.now() })
    this.emit({ type: 'status', agentId: id, running: true })

    const abort = new AbortController()
    const wsForKb = this.workspaces.find((w) => w.id === agent.workspaceId)
    const kbPath = wsForKb?.kbDir
    const inKb = (p: unknown) => typeof p === 'string' && !!kbPath && p.startsWith(kbPath + '/')
    const canUseTool: Options['canUseTool'] = (toolName, input, { signal, toolUseID }) =>
      new Promise<PermissionResult>((resolve) => {
        // Knowledge-base edits are always fine: it is the app's own folder, git-tracked.
        if ((toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit') && inKb(input.file_path)) return resolve({ behavior: 'allow', updatedInput: input })
        if (toolName === 'Bash' && kbPath && typeof input.command === 'string' && /^git -C \S+ (add|commit|status|log|diff)\b/.test(input.command) && input.command.includes(kbPath)) return resolve({ behavior: 'allow', updatedInput: input })
        const toolUseId = toolUseID ?? randomUUID()
        const pm: Msg = { id: randomUUID(), role: 'permission', toolUseId, name: toolName, input, ts: Date.now() }
        this.push(agent, msgs, pm)
        const finish = (allow: boolean) => {
          this.push(agent, msgs, { ...pm, decision: allow ? 'allow' : 'deny' })
          resolve(allow ? { behavior: 'allow', updatedInput: input } : { behavior: 'deny', message: 'User denied' })
        }
        this.pending.set(toolUseId, finish)
        signal.addEventListener('abort', () => finish(false), { once: true })
      })

    const others = this.agents.filter((a) => a.id !== id && a.workspaceId === agent.workspaceId) // same workspace only
    const errText = (text: string) => ({ content: [{ type: 'text' as const, text }], isError: true })
    const desk = createSdkMcpServer({
      name: 'desk',
      tools: [
        tool('list_agents', 'List the other agents in this app that you can message.', {}, async () => ({
          content: [{ type: 'text', text: others.map((a) => `${a.name} (folder: ${a.cwd})`).join('\n') || 'No other agents.' }]
        }), { alwaysLoad: true }),
        tool(
          'message_agent',
          'Send a message to another agent by name. Delivery is async: their reply arrives later in your conversation as a message starting with "Message from <name>:".',
          { name: z.string(), text: z.string() },
          async ({ name, text: body }) => {
            if (hop >= MAX_HOPS) return errText('Relay limit reached. Stop messaging agents and report to the user.')
            const target = others.find((a) => a.name.toLowerCase() === name.toLowerCase())
            if (!target) return errText(`No agent named "${name}". Use list_agents.`)
            void this.send(target.id, body, agent.name, hop + 1)
            return { content: [{ type: 'text', text: `Delivered to ${target.name}${this.active.has(target.id) ? ' (busy, queued)' : ''}. Their reply will arrive later; finish your turn now.` }] }
          },
          { alwaysLoad: true }
        ),
        tool(
          'new_session',
          'Start a fresh session for yourself once this reply is finished: your conversation context is cleared (the transcript stays visible to the user). Use when the user asks you to reset/start over, or when your context is bloated with unrelated work. Finish what you are saying first.',
          {},
          async () => {
            this.resetAfter.add(id)
            return { content: [{ type: 'text', text: 'Your session will reset after this reply. Wrap up now; do not start new work.' }] }
          },
          { alwaysLoad: true }
        ),
        tool(
          'create_routine',
          'Schedule a recurring task for yourself in this app. It runs on this computer while the app is open, as a new message to you at each cron tick (5-field cron, local time, e.g. "0 8-18 * * 1-5" = hourly Mon-Fri 8:00-18:00). Use this instead of CronCreate/RemoteTrigger, which do not work here.',
          { name: z.string(), cron: z.string(), prompt: z.string() },
          async ({ name, cron, prompt }) => {
            try {
              const r = this.createRoutine({ agentId: id, name, cron, prompt })
              return { content: [{ type: 'text', text: `Routine "${r.name}" created (${r.cron}). Next run: ${r.nextRunAt ? new Date(r.nextRunAt).toLocaleString() : 'unknown'}.` }] }
            } catch (e) {
              return errText((e as Error).message)
            }
          },
          { alwaysLoad: true }
        ),
        tool(
          'list_routines',
          'List your scheduled routines in this app with their status.',
          {},
          async () => ({
            content: [
              {
                type: 'text',
                text:
                  this.routines
                    .filter((r) => r.agentId === id)
                    .map((r) => `${r.name} [${r.status}] ${r.cron} — ${r.prompt.slice(0, 80)}`)
                    .join('\n') || 'No routines.'
              }
            ]
          }),
          { alwaysLoad: true }
        ),
        tool(
          'update_routine',
          'Pause, resume, or cancel one of your routines by name.',
          { name: z.string(), status: z.enum(['active', 'paused', 'cancelled']) },
          async ({ name, status }) => {
            const r = this.routines.find((x) => x.agentId === id && x.name.toLowerCase() === name.toLowerCase())
            if (!r) return errText(`No routine named "${name}"`)
            this.updateRoutine(r.id, { status })
            return { content: [{ type: 'text', text: `Routine "${r.name}" is now ${status}.` }] }
          },
          { alwaysLoad: true }
        )
      ]
    })
    const ws = this.workspaces.find((w) => w.id === agent.workspaceId)
    const kb = ws?.kbDir ? this.kbDir(ws.id) : undefined
    const kbIndex = kb ? readIndex(kb) : ''
    const append = [
      `You are the agent named "${agent.name}" inside a desktop app, workspace "${ws?.name ?? ''}". Other agents in this workspace: ${others.map((a) => a.name).join(', ') || 'none'}. To talk to them use ONLY the mcp__desk__message_agent tool (and mcp__desk__list_agents to list them). The built-in SendMessage/ListAgents tools cannot reach these agents. Replies come back later as user messages starting with "Message from <name>:". Mentions: "@Name" in any message refers to that agent; in the workspace #general group chat an @mention delivers the message to them. To reset your own context call mcp__desk__new_session. For scheduled/recurring work use mcp__desk__create_routine (and list_routines / update_routine); the built-in CronCreate, CronList, CronDelete, RemoteTrigger and ScheduleWakeup tools do NOT work in this app.`,
      kb
        ? `Shared knowledge base at ${kb} (markdown, shared by all agents in this workspace). Its index follows. Before working on a repo or answering how something runs or relates, read the relevant page (Read/Grep in that folder). When you learn a durable fact (how to run, gotcha, decision, convention), write it there and update the index; use the kb skill for the rules.\n\n<kb-index>\n${kbIndex}\n</kb-index>`
        : '',
      agent.systemPrompt
    ]
      .filter(Boolean)
      .join('\n\n')

    const options: Options = {
      cwd: agent.cwd,
      resume: agent.sessionId,
      includePartialMessages: true,
      settingSources: ['user', 'project', 'local'],
      systemPrompt: { type: 'preset', preset: 'claude_code', append },
      mcpServers: { desk },
      additionalDirectories: kb ? [kb] : undefined,
      plugins: kb ? [{ type: 'local', path: kb }] : undefined,
      allowedTools: ['mcp__desk__list_agents', 'mcp__desk__message_agent', 'mcp__desk__create_routine', 'mcp__desk__list_routines', 'mcp__desk__update_routine', 'mcp__desk__new_session'],
      disallowedTools: ['SendMessage', 'ListAgents', 'CronCreate', 'CronList', 'CronDelete', 'RemoteTrigger', 'ScheduleWakeup'],
      permissionMode: agent.autonomous ? 'bypassPermissions' : 'default',
      allowDangerouslySkipPermissions: agent.autonomous || undefined,
      canUseTool,
      model: agent.model,
      abortController: abort,
      pathToClaudeCodeExecutable: claudeBin
    }

    let prompt = group
      ? `[#general group chat, ${group.author} wrote — you were @mentioned. Your reply is posted to the group; keep it short. To hand off, @mention another agent by name.]\n${text}`
      : from
        ? `Message from ${from}: ${text}`
        : routine
          ? `[Scheduled routine "${routine}"] ${text}`
          : text
    if (images) prompt += `\n\nAttached image${images.length > 1 ? 's' : ''} (view with the Read tool):\n${images.join('\n')}`
    const q = query({ prompt, options })
    this.active.set(id, { q, abort })

    // streaming state for this turn
    let current: Extract<Msg, { role: 'assistant' }> | null = null
    let lastText = ''

    try {
      for await (const m of q as AsyncIterable<SDKMessage>) {
        if ('parent_tool_use_id' in m && m.parent_tool_use_id) continue // hide subagent internals

        if (m.type === 'system' && m.subtype === 'init') {
          if (agent.sessionId !== m.session_id) {
            const sessions = [...(agent.sessions ?? []), { sessionId: m.session_id, startedAt: Date.now(), title: text.split('\n')[0].slice(0, 60) }]
            this.update(id, { sessionId: m.session_id, sessions })
          }
          continue
        }

        if (m.type === 'stream_event') {
          const ev = m.event
          if (ev.type === 'content_block_start' && ev.content_block.type === 'text') {
            current = { id: randomUUID(), role: 'assistant', text: '', ts: Date.now(), streaming: true }
            this.push(agent, msgs, current)
          } else if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta' && current) {
            current.text += ev.delta.text
            this.emit({ type: 'delta', agentId: id, msgId: current.id, text: ev.delta.text })
          } else if (ev.type === 'content_block_stop' && current) {
            current.streaming = false
            this.push(agent, msgs, current)
            lastText = current.text
            current = null
          }
          continue
        }

        if (m.type === 'assistant') {
          for (const block of m.message.content) {
            if (block.type === 'tool_use') {
              this.push(agent, msgs, {
                id: randomUUID(),
                role: 'tool',
                toolUseId: block.id,
                name: block.name,
                input: block.input,
                done: false,
                ts: Date.now()
              })
            }
          }
          continue
        }

        if (m.type === 'user' && Array.isArray(m.message.content)) {
          for (const block of m.message.content) {
            if (block.type !== 'tool_result') continue
            const t = msgs.find((x) => x.role === 'tool' && x.toolUseId === block.tool_use_id)
            if (!t || t.role !== 'tool') continue
            const c = block.content
            t.output = typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => ('text' in p ? p.text : '[image]')).join('\n') : ''
            t.error = !!block.is_error
            t.done = true
            this.push(agent, msgs, t)
          }
          continue
        }

        if (m.type === 'result') {
          const ok = m.subtype === 'success'
          this.push(agent, msgs, {
            id: randomUUID(),
            role: 'result',
            text: ok ? 'Done' : m.subtype.replace(/_/g, ' '),
            costUsd: m.total_cost_usd,
            durationMs: m.duration_ms,
            error: !ok,
            ts: Date.now()
          })
          if (ok && m.result) lastText = m.result
        }
      }
    } catch (err) {
      this.push(agent, msgs, { id: randomUUID(), role: 'result', text: String((err as Error).message ?? err), error: true, ts: Date.now() })
    } finally {
      if (current) {
        current.streaming = false
        this.push(agent, msgs, current)
      }
      this.active.delete(id)
      this.update(id, { preview: (lastText || 'Done').split('\n')[0].slice(0, 120), updatedAt: Date.now() })
      this.emit({ type: 'status', agentId: id, running: false })
      // Turn was triggered by another agent: send the reply back to them.
      const sender = !group && from && this.agents.find((a) => a.name === from)
      if (sender && lastText && hop < MAX_HOPS) void this.send(sender.id, lastText, agent.name, hop + 1)
      if (group && lastText) void this.sendGroup(group.wsId, lastText, id, hop + 1)
      if (this.resetAfter.delete(id)) {
        try {
          this.newSession(id)
        } catch {}
      }
      const next = this.queue.get(id)?.shift()
      if (next) void this.send(id, next.text, next.from, next.hop, undefined, undefined, next.group)
    }
  }

  private get(id: string) {
    const a = this.agents.find((x) => x.id === id)
    if (!a) throw new Error('No such agent')
    return a
  }

  private push(agent: Agent, msgs: Msg[], msg: Msg) {
    const i = msgs.findIndex((x) => x.id === msg.id)
    if (i >= 0) msgs[i] = msg
    else msgs.push(msg)
    saveMessages(agent.id, msgs)
    this.emit({ type: 'message', agentId: agent.id, msg })
    // Count a reply once it is complete (assistant text done streaming) or a permission request appears.
    const counts = (msg.role === 'assistant' && !msg.streaming) || (msg.role === 'permission' && !msg.decision)
    if (this.viewing !== agent.id && counts) this.update(agent.id, { unread: true, unreadCount: (agent.unreadCount ?? 0) + 1 })
  }
}
