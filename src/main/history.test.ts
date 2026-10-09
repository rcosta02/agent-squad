// Run: npm test. ponytail: assert-based self-check, no framework.
import assert from 'node:assert/strict'
import { readHistory, searchHistory } from './history.ts'
import type { Msg } from '../shared/types.ts'

const t = Date.UTC(2026, 8, 14, 10, 0)
const msgs: Msg[] = [
  { id: 'aaaaaaaa-1', role: 'user', text: 'deploy the api with helm', ts: t },
  { id: 'bbbbbbbb-1', role: 'assistant', text: 'Deployed via helm chart v3.', ts: t + 1 },
  { id: 'cccccccc-1', role: 'tool', toolUseId: 'x', name: 'Bash', input: {}, output: 'helm helm helm', done: true, ts: t + 2 },
  { id: 'dddddddd-1', role: 'divider', text: 'New session', ts: t + 3 },
  { id: 'eeeeeeee-1', role: 'user', text: 'what did we use to deploy?', ts: t + 4 },
  { id: 'ffffffff-1', role: 'assistant', text: '   ', ts: t + 5 } // blank, skipped
]

const s = searchHistory(msgs, 'HELM')
assert.ok(s.includes('session 1') && s.includes('aaaaaaaa') && s.includes('bbbbbbbb'), 'case-insensitive hits in session 1')
assert.ok(!s.includes('cccccccc'), 'tool output not searched')
assert.ok(s.indexOf('bbbbbbbb') < s.indexOf('aaaaaaaa'), 'newest first')
assert.equal(searchHistory(msgs, 'kubernetes'), 'No matches.')
assert.ok(searchHistory(msgs, 'deploy', 1).startsWith('3 matches, newest 1:'), 'limit + count header')

assert.ok(readHistory(msgs, {}).startsWith('Session 2:'), 'defaults to latest session')
assert.ok(readHistory(msgs, { session: 1 }).includes('helm chart v3'))
assert.ok(readHistory(msgs, { session: 9 }).includes('Sessions run 1..2'))
const near = readHistory(msgs, { near: 'eeeeeeee', radius: 1 })
assert.ok(near.includes('bbbbbbbb') && near.includes('eeeeeeee') && !near.includes('aaaaaaaa'), 'near crosses session boundary, respects radius')
console.log('history ok')
