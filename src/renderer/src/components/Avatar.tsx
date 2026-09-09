import type { Agent } from '../../../shared/types'

export default function Avatar({ agent, size = 36, running = false }: { agent: Agent; size?: number; running?: boolean }) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: agent.color, fontSize: Math.round(size * 0.5) }}
    >
      {agent.emoji}
      {running && <span className="dot" />}
    </span>
  )
}
