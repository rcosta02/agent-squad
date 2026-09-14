import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { McpServerInfo } from '../shared/types'
import { claudeBin } from './cli'

const home = () => process.env.HOME || ''
const cli = (args: string[], cwd?: string) => execFileSync(claudeBin, args, { cwd, encoding: 'utf8', env: process.env, timeout: 20_000 })

/** Servers configured on disk: user scope (~/.claude.json), local scope (per-project in ~/.claude.json), project scope (.mcp.json in cwd). */
export function configured(cwd: string): McpServerInfo[] {
  const out: McpServerInfo[] = []
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(home(), '.claude.json'), 'utf8'))
    for (const [name, c] of Object.entries<Record<string, unknown>>(cfg.mcpServers ?? {})) out.push({ name, scope: 'user', transport: String(c.type ?? 'stdio'), target: String(c.url ?? c.command ?? '') })
    for (const [name, c] of Object.entries<Record<string, unknown>>(cfg.projects?.[cwd]?.mcpServers ?? {})) out.push({ name, scope: 'local', transport: String(c.type ?? 'stdio'), target: String(c.url ?? c.command ?? '') })
  } catch {}
  try {
    const p = JSON.parse(fs.readFileSync(path.join(cwd, '.mcp.json'), 'utf8'))
    for (const [name, c] of Object.entries<Record<string, unknown>>(p.mcpServers ?? {})) out.push({ name, scope: 'project', transport: String(c.type ?? 'stdio'), target: String(c.url ?? c.command ?? '') })
  } catch {}
  return out
}

export function add(input: { name: string; transport: 'http' | 'sse' | 'stdio'; target: string; args?: string[]; env?: Record<string, string>; headers?: Record<string, string>; scope: 'user' | 'local' | 'project' }, cwd: string) {
  if (!/^[\w.-]+$/.test(input.name)) throw new Error('Name: letters, digits, - _ . only')
  const json =
    input.transport === 'stdio'
      ? { type: 'stdio', command: input.target, args: input.args ?? [], env: input.env ?? {} }
      : { type: input.transport, url: input.target, headers: input.headers ?? {} }
  cli(['mcp', 'add-json', '-s', input.scope, input.name, JSON.stringify(json)], cwd)
}

export function remove(name: string, scope: 'user' | 'local' | 'project', cwd: string) {
  cli(['mcp', 'remove', '-s', scope, name], cwd)
}

/**
 * OAuth via `claude mcp login <name>`: the CLI opens the browser itself and waits for the localhost callback.
 * Works for direct HTTP/SSE servers and claude.ai connectors. `onUrl` receives the URL if the CLI prints one.
 */
export function authenticate(name: string, cwd: string, onUrl: (url: string) => void, onControl: (ctl: { kill: () => void; write: (s: string) => void }) => void): Promise<string> {
  return new Promise((resolve) => {
    // `claude mcp login` refuses to run without a TTY.
    // /usr/bin/expect is always present on macOS and allocates a pty even when our own stdin is a pipe; `interact` forwards our stdin to it.
    const child = spawn('/usr/bin/expect', ['-c', `set timeout -1; spawn ${JSON.stringify(claudeBin)} mcp login ${JSON.stringify(name)}; interact`], { cwd, env: { ...process.env, TERM: 'dumb' }, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    const onData = (d: Buffer) => {
      const t = d.toString()
      out += t
      const url = /https?:\/\/\S+/.exec(t)?.[0]
      if (url) onUrl(url)
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    onControl({ kill: () => child.kill('SIGTERM'), write: (s) => child.stdin.write(s + '\n') })
    child.on('exit', (code) => {
      const tail = out.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '').trim().split('\n').filter(Boolean).slice(-3).join(' ')
      resolve(code === 0 ? `DONE ${tail}` : `FAILED: ${tail || 'exit ' + code}`)
    })
    child.on('error', (e) => resolve(`FAILED: ${e.message}`))
  })
}
