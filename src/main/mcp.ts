import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { shell } from 'electron'
import { query, type Options } from '@anthropic-ai/claude-agent-sdk'
import type { McpServerInfo } from '../shared/types'

const claudeBin = process.env.CLAUDE_DESK_CLI || '/Users/rafaelcosta/.local/bin/claude'
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
 * OAuth for a direct HTTP/SSE server: a short hidden session asks the server's `authenticate` tool for the URL,
 * we open it in the browser, and keep the session alive (streaming input) so the CLI's localhost callback can land.
 * `waitDone` resolves when the user says they finished (or pastes the callback URL); we then ask the CLI to complete/verify.
 */
export async function authenticate(name: string, cwd: string, onUrl: (url: string) => void, waitDone: () => Promise<string | null>): Promise<string> {
  const slug = name.replace(/[^\w]/g, '_')
  const startTool = `mcp__${slug}__authenticate`
  const finishTool = `mcp__${slug}__complete_authentication`
  const st: { phase: 'start' | 'finish' } = { phase: 'start' }
  let callbackUrl: string | null = null
  const input = (async function* () {
    yield {
      type: 'user' as const,
      message: { role: 'user' as const, content: `Call the ${startTool} tool now. Reply with ONLY the authorization URL it returns, nothing else. If the tool does not exist, reply exactly: NO_AUTH_TOOL` },
      parent_tool_use_id: null,
      session_id: ''
    }
    callbackUrl = await waitDone()
    st.phase = 'finish'
    yield {
      type: 'user' as const,
      message: {
        role: 'user' as const,
        content: callbackUrl
          ? `Call ${finishTool} with callback_url "${callbackUrl}". Then reply exactly DONE if it succeeded or FAILED: <reason>.`
          : `The user says they authorized in the browser. Call ${startTool} again: if it now reports the server is authenticated or lists real tools, reply exactly DONE; otherwise reply FAILED: <reason>.`
      },
      parent_tool_use_id: null,
      session_id: ''
    }
  })()
  const options: Options = {
    cwd,
    pathToClaudeCodeExecutable: claudeBin,
    settingSources: ['user', 'project', 'local'],
    allowedTools: [startTool, finishTool],
    maxTurns: 6,
    systemPrompt: 'You are an auth helper. Follow the instruction literally. No commentary.'
  }
  let final = ''
  for await (const m of query({ prompt: input, options })) {
    if (m.type === 'assistant') {
      for (const b of m.message.content) {
        if (b.type !== 'text') continue
        const t = b.text.trim()
        if (st.phase === 'start') {
          const url = /https?:\/\/\S+/.exec(t)?.[0]
          if (t === 'NO_AUTH_TOOL') throw new Error('This server has no OAuth flow here (claude.ai connectors authenticate at claude.ai).')
          if (url) {
            onUrl(url)
            void shell.openExternal(url)
          }
        } else final = t
      }
    }
    if (m.type === 'result' && st.phase === 'finish') break
  }
  return final || 'FAILED: no response'
}
