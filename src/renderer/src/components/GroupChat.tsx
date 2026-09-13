import { useLayoutEffect, useRef } from 'react'
import type { Agent, GroupMsg } from '../../../shared/types'
import Avatar from './Avatar'
import { Markdown, setMentionNames } from './Chat'
import Composer from './Composer'

type Props = {
  agents: Agent[] // members
  msgs: GroupMsg[] | undefined
  running: Set<string>
  onSend: (text: string) => void
}

export default function GroupChat({ agents, msgs, running, onSend }: Props) {
  const listRef = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  setMentionNames(agents.map((a) => a.name))
  const working = agents.filter((a) => running.has(a.id))

  useLayoutEffect(() => {
    const el = listRef.current
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight
  }, [msgs, working.length])

  const onScroll = () => {
    const el = listRef.current
    if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  return (
    <div className="chat-drop">
      <header className="chat-header">
        <span className="group-hash">#</span>
        <span className="name">general</span>
        <div className="members">
          {agents.map((a) => (
            <Avatar key={a.id} agent={a} size={20} running={running.has(a.id)} />
          ))}
        </div>
      </header>
      <div className="messages" ref={listRef} onScroll={onScroll}>
        {(!msgs || msgs.length === 0) && (
          <div className="empty">
            <div>Everyone is here. @mention an agent to bring them in.</div>
            <div className="mono">{agents.map((a) => '@' + a.name).join('  ')}</div>
          </div>
        )}
        {msgs?.map((m) => {
          if (m.author === 'me')
            return (
              <div key={m.id} className="msg-row user">
                <div className="bubble user">
                  <Markdown text={m.text} />
                </div>
              </div>
            )
          const a = agents.find((x) => x.id === m.author)
          return (
            <div key={m.id} className="msg-row">
              <div className="bubble assistant">
                <div className="from-label" style={{ color: a?.color }}>
                  {a?.name ?? 'Unknown agent'}
                </div>
                <Markdown text={m.text} />
              </div>
            </div>
          )
        })}
        {working.length > 0 && (
          <div className="typing">
            <span className="typing-dots">
              <i />
              <i />
              <i />
            </span>
            {working.map((a) => a.name).join(', ')} {working.length > 1 ? 'are' : 'is'} working…
          </div>
        )}
      </div>
      <Composer agentId="group" agentName="#general" running={false} pending={[]} onClearPending={() => {}} onSend={(t: string) => onSend(t)}  onStop={() => {}} names={agents.map((a) => a.name)} />
    </div>
  )
}
