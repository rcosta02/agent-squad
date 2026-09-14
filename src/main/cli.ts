import { execSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

// Electron's process.execPath is not node, so the SDK must spawn the user's native `claude` binary.
// Order: AGENT_SQUAD_CLI env → `which claude` (login-shell PATH is merged in main/index.ts) → the default install location.
export const claudeBin: string = (() => {
  if (process.env.AGENT_SQUAD_CLI) return process.env.AGENT_SQUAD_CLI
  try {
    const found = execSync('which claude', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    if (found) return found
  } catch {}
  return path.join(os.homedir(), '.local', 'bin', 'claude')
})()
