import { query } from '@anthropic-ai/claude-agent-sdk'
import { claudeBin } from './cli'

export type ModelOption = { id: string; label: string; other?: true } // other = not in the account's /model picker, still accepted by --model

// Every model Anthropic still serves. Appended after the live list; sole list when the CLI can't be asked.
export const FALLBACK_MODELS: ModelOption[] = [
  { id: 'claude-fable-5-1', label: 'Fable 5.1' },
  { id: 'claude-fable-5', label: 'Fable 5' },
  { id: 'claude-opus-5', label: 'Opus 5' },
  { id: 'claude-opus-4-8', label: 'Opus 4.8' },
  { id: 'claude-opus-4-7', label: 'Opus 4.7' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6' },
  { id: 'claude-opus-4-5', label: 'Opus 4.5' },
  { id: 'claude-opus-4-0', label: 'Opus 4 (deprecated)' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-sonnet-4-5', label: 'Sonnet 4.5' },
  { id: 'claude-sonnet-4-0', label: 'Sonnet 4 (deprecated)' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5' }
]

// 'claude-opus-5[1m]' / 'claude-haiku-4-5-20251001' → 'claude-opus-5' / 'claude-haiku-4-5'
const canonical = (id: string) => id.replace(/\[1m\]$/, '').replace(/-\d{8}$/, '')

let cache: Promise<ModelOption[]> | undefined

// Live models (same rows as `/model`) first, then every served model the picker didn't cover.
// In-memory cache: refreshed on app restart.
export const listModels = (): Promise<ModelOption[]> => (cache ??= fetchModels())

async function fetchModels(): Promise<ModelOption[]> {
  // Prompt never yields, so no turn runs; the session exists only to answer the control request.
  const q = query({
    prompt: (async function* () { await new Promise(() => {}) })(),
    options: { pathToClaudeCodeExecutable: claudeBin }
  })
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15_000))
  try {
    const rows = await Promise.race([q.supportedModels(), timeout])
    const live = rows.filter((m) => m.value !== 'default') // 'default' duplicates the app's own "Default" option
    const covered = new Set(live.flatMap((m) => [canonical(m.value), m.resolvedModel ? canonical(m.resolvedModel) : '']))
    return [
      ...live.map((m) => ({ id: m.value, label: m.displayName })),
      ...FALLBACK_MODELS.filter((m) => !covered.has(m.id)).map((m) => ({ ...m, other: true as const }))
    ]
  } catch (e) {
    console.warn('[models] falling back to hardcoded list:', e)
    cache = undefined // retry next time
    return FALLBACK_MODELS
  } finally {
    q.close()
  }
}
