import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Agent, GroupMsg, Msg, Routine, Workspace } from '../../shared/types'
import Chat from './components/Chat'
import NewAgentModal, { type AgentInput } from './components/NewAgentModal'
import Rail from './components/Rail'
import GroupChat from './components/GroupChat'
import KbModal from './components/KbModal'
import RoutinesModal from './components/RoutinesModal'
import Sidebar from './components/Sidebar'
import WorkspaceModal from './components/WorkspaceModal'

const api = window.api

type Modal = { mode: 'create' } | { mode: 'edit'; agentId: string } | { mode: 'ws-create' } | { mode: 'ws-edit' } | { mode: 'routines'; agentId: string } | { mode: 'kb' } | null

const WS_KEY = 'claude-desk.workspace'
const readWs = () => {
  try {
    return localStorage.getItem(WS_KEY)
  } catch {
    return null
  }
}

function upsertMsg(list: Msg[], msg: Msg): Msg[] {
  const i = list.findIndex((m) => m.id === msg.id)
  if (i < 0) return [...list, msg]
  const next = list.slice()
  next[i] = msg
  return next
}

function upsertAgent(list: Agent[], agent: Agent): Agent[] {
  const i = list.findIndex((a) => a.id === agent.id)
  if (i < 0) return [...list, agent]
  const next = list.slice()
  next[i] = agent
  return next
}

export default function App() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [routines, setRoutines] = useState<Routine[]>([])
  const [groups, setGroups] = useState<Record<string, GroupMsg[]>>({})
  const [workspaceId, setWorkspaceId] = useState<string | null>(readWs)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Record<string, Msg[]>>({})
  const [running, setRunning] = useState<Set<string>>(() => new Set())
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<Modal>(null)
  const loaded = useRef<Set<string>>(new Set())

  const workspace = useMemo(() => workspaces.find((w) => w.id === workspaceId) ?? workspaces[0] ?? null, [workspaces, workspaceId])
  const sorted = useMemo(
    () => agents.filter((a) => a.workspaceId === workspace?.id).sort((a, b) => b.updatedAt - a.updatedAt),
    [agents, workspace]
  )
  const unreadByWs = useMemo(() => {
    const m: Record<string, number> = {}
    for (const a of agents) if (a.unread) m[a.workspaceId] = (m[a.workspaceId] ?? 0) + 1
    for (const w of workspaces) if (w.groupUnread) m[w.id] = (m[w.id] ?? 0) + 1
    return m
  }, [agents, workspaces])
  const switchWorkspace = useCallback((id: string) => {
    setWorkspaceId(id)
    setSelectedId(null)
    try {
      localStorage.setItem(WS_KEY, id)
    } catch {}
  }, [])
  const isGroup = selectedId === 'group'
  const selected = useMemo(
    () => (isGroup ? null : (sorted.find((a) => a.id === selectedId) ?? sorted[0] ?? null)),
    [agents, sorted, selectedId, isGroup]
  )
  const names = useMemo(() => sorted.filter((a) => a.id !== selected?.id).map((a) => a.name), [sorted, selected])

  // Initial load + event subscription.
  useEffect(() => {
    let alive = true
    api.listWorkspaces().then((ws) => alive && setWorkspaces(ws))
    api.listAgents().then((list) => alive && setAgents(list))
    api.listRoutines().then((rs) => alive && setRoutines(rs))
    const off = api.onEvent((e) => {
      switch (e.type) {
        case 'message':
          setMessages((prev) => ({ ...prev, [e.agentId]: upsertMsg(prev[e.agentId] ?? [], e.msg) }))
          break
        case 'delta':
          setMessages((prev) => {
            const list = prev[e.agentId]
            if (!list) return prev
            const i = list.findIndex((m) => m.id === e.msgId)
            if (i < 0) return prev
            const m = list[i]
            if (m.role !== 'assistant') return prev
            const next = list.slice()
            next[i] = { ...m, text: m.text + e.text }
            return { ...prev, [e.agentId]: next }
          })
          break
        case 'status':
          setRunning((prev) => {
            const next = new Set(prev)
            if (e.running) next.add(e.agentId)
            else next.delete(e.agentId)
            return next
          })
          break
        case 'agent':
          setAgents((prev) => upsertAgent(prev, e.agent))
          break
        case 'workspace':
          setWorkspaces((prev) => {
            const i = prev.findIndex((w) => w.id === e.workspace.id)
            if (i < 0) return [...prev, e.workspace]
            const next = prev.slice()
            next[i] = e.workspace
            return next
          })
          break
        case 'routine':
          setRoutines((prev) => {
            const i = prev.findIndex((r) => r.id === e.routine.id)
            if (i < 0) return [...prev, e.routine]
            const next = prev.slice()
            next[i] = e.routine
            return next
          })
          break
        case 'group':
          setGroups((prev) => {
            const list = prev[e.workspaceId] ?? []
            if (list.some((m) => m.id === e.msg.id)) return prev
            return { ...prev, [e.workspaceId]: [...list, e.msg] }
          })
          break
        case 'routineDeleted':
          setRoutines((prev) => prev.filter((r) => r.id !== e.routineId))
          break
        case 'workspaceDeleted':
          setWorkspaces((prev) => prev.filter((w) => w.id !== e.workspaceId))
          break
        case 'agentDeleted':
          setAgents((prev) => prev.filter((a) => a.id !== e.agentId))
          setMessages((prev) => {
            const next = { ...prev }
            delete next[e.agentId]
            return next
          })
          loaded.current.delete(e.agentId)
          break
      }
    })
    return () => {
      alive = false
      off()
    }
  }, [])

  // Lazy-load history for the selected agent; merge with any live events that arrived first.
  useEffect(() => {
    const id = selected?.id
    if (!id || loaded.current.has(id)) return
    loaded.current.add(id)
    api.getMessages(id).then((hist) => {
      setMessages((prev) => {
        let merged = hist
        for (const m of prev[id] ?? []) merged = upsertMsg(merged, m)
        return { ...prev, [id]: merged }
      })
    })
  }, [selected?.id])

  // Tell main which chat is on screen (only while the window is focused) so it can track unread.
  useEffect(() => {
    const sync = () => void api.setViewing(document.hasFocus() ? (isGroup && workspace ? `group:${workspace.id}` : (selected?.id ?? null)) : null)
    sync()
    window.addEventListener('focus', sync)
    window.addEventListener('blur', sync)
    return () => {
      window.removeEventListener('focus', sync)
      window.removeEventListener('blur', sync)
    }
  }, [selected?.id, isGroup, workspace?.id])

  // Load group history once per workspace.
  useEffect(() => {
    if (!isGroup || !workspace || groups[workspace.id]) return
    api.getGroup(workspace.id).then((hist) =>
      setGroups((prev) => {
        const seen = new Set(hist.map((m) => m.id))
        return { ...prev, [workspace.id]: [...hist, ...(prev[workspace.id] ?? []).filter((m) => !seen.has(m.id))] }
      })
    )
  }, [isGroup, workspace?.id])

  const send = useCallback(
    (text: string, images: string[]) => {
      if (selected) void api.send(selected.id, text, images.length ? images : undefined)
    },
    [selected]
  )
  const stop = useCallback(() => {
    if (selected) void api.interrupt(selected.id)
  }, [selected])
  const respond = useCallback(
    (toolUseId: string, allow: boolean) => {
      if (selected) void api.respondPermission(selected.id, toolUseId, allow)
    },
    [selected]
  )

  const closeModal = useCallback(() => setModal(null), [])

  const submitModal = async (input: AgentInput) => {
    if (modal?.mode === 'edit') {
      const a = await api.updateAgent(modal.agentId, input)
      setAgents((prev) => upsertAgent(prev, a))
    } else {
      if (!workspace) return
      const a = await api.createAgent({ ...input, workspaceId: workspace.id })
      setAgents((prev) => upsertAgent(prev, a))
      setSelectedId(a.id)
    }
    setModal(null)
  }

  const deleteAgent = async () => {
    if (modal?.mode !== 'edit') return
    const id = modal.agentId
    await api.deleteAgent(id)
    setAgents((prev) => prev.filter((a) => a.id !== id))
    setMessages((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    loaded.current.delete(id)
    setModal(null)
  }

  const editing = modal?.mode === 'edit' ? agents.find((a) => a.id === modal.agentId) : undefined

  const submitWorkspace = async (input: { name: string; emoji: string; image?: string }) => {
    if (modal?.mode === 'ws-edit' && workspace) await api.updateWorkspace(workspace.id, input)
    else {
      const w = await api.createWorkspace(input)
      switchWorkspace(w.id)
    }
    setModal(null)
  }
  const deleteWorkspace = async () => {
    if (!workspace) return
    await api.deleteWorkspace(workspace.id)
    const next = workspaces.find((w) => w.id !== workspace.id)
    if (next) switchWorkspace(next.id)
    setModal(null)
  }

  return (
    <div className="app">
      <Rail workspaces={workspaces} currentId={workspace?.id ?? null} unread={unreadByWs} onSwitch={switchWorkspace} onNew={() => setModal({ mode: 'ws-create' })} />
      <Sidebar
        workspace={workspace}
        onNewWorkspace={() => setModal({ mode: 'ws-create' })}
        onEditWorkspace={() => setModal({ mode: 'ws-edit' })}
        onOpenKb={() => setModal({ mode: 'kb' })}
        agents={sorted}
        selectedId={isGroup ? 'group' : (selected?.id ?? null)}
        groupUnread={workspace?.groupUnread ?? 0}
        running={running}
        search={search}
        onSearch={setSearch}
        onSelect={setSelectedId}
        onNew={() => setModal({ mode: 'create' })}
      />
      <main className="chat-pane">
        {isGroup && workspace ? (
          <GroupChat agents={sorted} msgs={groups[workspace.id]} running={running} onSend={(t) => void api.sendGroup(workspace.id, t)} />
        ) : selected ? (
          <Chat
            agent={selected}
            msgs={messages[selected.id]}
            running={running.has(selected.id)}
            onSend={send}
            onStop={stop}
            onEdit={() => setModal({ mode: 'edit', agentId: selected.id })}
            onNewSession={() => void api.newSession(selected.id)}
            onSwitchSession={(sid) => void api.switchSession(selected.id, sid)}
            onRoutines={() => setModal({ mode: 'routines', agentId: selected.id })}
            routineCount={routines.filter((r) => r.agentId === selected.id && r.status === 'active').length}
            names={names}
            onPermission={respond}
          />
        ) : (
          <div className="empty">
            <div>Create an agent to get started</div>
            <button className="btn primary" onClick={() => setModal({ mode: 'create' })}>
              New agent
            </button>
          </div>
        )}
      </main>
      {modal?.mode === 'kb' && workspace && <KbModal workspace={workspace} onClose={closeModal} />}
      {modal?.mode === 'routines' && selected && (
        <RoutinesModal agent={selected} routines={routines.filter((r) => r.agentId === modal.agentId)} onClose={closeModal} />
      )}
      {(modal?.mode === 'ws-create' || modal?.mode === 'ws-edit') && (
        <WorkspaceModal
          key={modal.mode}
          initial={modal.mode === 'ws-edit' ? (workspace ?? undefined) : undefined}
          canDelete={workspaces.length > 1 && sorted.length === 0}
          onClose={closeModal}
          onSubmit={submitWorkspace}
          onDelete={modal.mode === 'ws-edit' ? deleteWorkspace : undefined}
        />
      )}
      {(modal?.mode === 'create' || modal?.mode === 'edit') && (
        <NewAgentModal
          key={modal.mode === 'edit' ? modal.agentId : 'create'}
          initial={editing}
          onClose={closeModal}
          onSubmit={submitModal}
          onDelete={modal.mode === 'edit' ? deleteAgent : undefined}
        />
      )}
    </div>
  )
}
