import { spawn, execFile, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import type { Meeting, MeetingSegment } from '../shared/types'

const home = () => process.env.CLAUDE_DESK_HOME || path.join(app.getPath('home'), '.claude-desk')
const modelPath = () => process.env.CLAUDE_DESK_WHISPER_MODEL || path.join(home(), 'models', 'ggml-large-v3-turbo.bin')
const whisperBin = () => process.env.CLAUDE_DESK_WHISPER || '/opt/homebrew/bin/whisper-cli'
const helperBin = () => process.env.CLAUDE_DESK_AUDIOTAP || path.join(app.getAppPath(), 'resources', 'audiotap')

type Emit = (m: Meeting) => void
type Chunk = { track: 'mic' | 'sys'; path: string; start: number; dur: number; final: boolean }

/** One recording at a time. Chunks are transcribed as they land; segments merge by absolute time. */
export class Recorder {
  meeting: Meeting | null = null
  private child: ChildProcess | null = null
  private queue: Promise<void> = Promise.resolve()
  private stopResolve: (() => void) | null = null

  constructor(private emit: Emit) {}

  preflight() {
    if (!fs.existsSync(helperBin())) throw new Error(`Audio helper missing at ${helperBin()}. Run: npm run helper`)
    if (!fs.existsSync(whisperBin())) throw new Error('whisper-cli not found. Install: brew install whisper-cpp')
    if (!fs.existsSync(modelPath())) throw new Error(`Whisper model missing at ${modelPath()}`)
  }

  start(agentId: string, title: string) {
    if (this.meeting && this.meeting.status === 'recording') throw new Error('Already recording')
    this.preflight()
    const id = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const dir = path.join(home(), 'meetings', id)
    fs.mkdirSync(dir, { recursive: true })
    this.meeting = { id, agentId, title: title || 'Meeting', dir, startedAt: Date.now(), status: 'recording', segments: [], pendingChunks: 0 }
    this.save()
    const child = spawn(helperBin(), [dir, '12'], { stdio: ['ignore', 'pipe', 'pipe'] })
    this.child = child
    let buf = ''
    child.stdout!.on('data', (d) => {
      buf += d.toString()
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (!line) continue
        try {
          const j = JSON.parse(line)
          if ('track' in j) this.onChunk(j as Chunk)
        } catch {}
      }
    })
    child.stderr!.on('data', (d) => {
      const t = d.toString()
      if (/failed|permission/i.test(t) && this.meeting) {
        this.meeting.error = t.trim().split('\n').pop()
        this.save()
      }
    })
    child.on('exit', () => {
      this.child = null
      // Wait for the transcription queue, then finish.
      void this.queue.then(() => {
        if (this.meeting && this.meeting.status === 'stopping') this.finish()
        this.stopResolve?.()
        this.stopResolve = null
      })
    })
    return this.meeting
  }

  private onChunk(c: Chunk) {
    const m = this.meeting
    if (!m) return
    m.pendingChunks++
    this.save()
    this.queue = this.queue.then(async () => {
      const who = c.track === 'mic' ? 'Me' : 'Them'
      if (c.track === 'sys') {
        if (wavRms(c.path) === 0) {
          m.silentSys = (m.silentSys ?? 0) + 1
          if (m.silentSys >= 3 && !m.error) m.error = 'System audio is silent. Grant "System Audio Recording" to the app that launched Claude Desk (System Settings → Privacy & Security → Screen & System Audio Recording), then restart the app.'
        } else m.silentSys = 0
      }
      try {
        const segs: MeetingSegment[] = (await transcribe(c.path)).map((s) => ({ t: c.start + s.t, who, text: s.text }))
        if (segs.length) {
          m.segments.push(...segs)
          m.segments.sort((a, b) => a.t - b.t)
          m.segments = dedupeCrosstalk(m.segments)
        }
      } catch (e) {
        m.error = `whisper: ${(e as Error).message}`
      }
      m.pendingChunks--
      this.save()
    })
  }

  stop(): Promise<Meeting | null> {
    const m = this.meeting
    if (!m || m.status !== 'recording') return Promise.resolve(m)
    m.status = 'stopping'
    m.endedAt = Date.now()
    this.save()
    return new Promise((res) => {
      this.stopResolve = () => res(this.meeting)
      if (this.child) this.child.kill('SIGINT')
      else void this.queue.then(() => (this.finish(), res(this.meeting)))
    })
  }

  private finish() {
    const m = this.meeting
    if (!m) return
    const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`
    const md = [`# ${m.title}`, ``, `Recorded ${new Date(m.startedAt).toLocaleString()} · ${fmt(((m.endedAt ?? Date.now()) - m.startedAt) / 1000)} · Me = Rafael, Them = the other side`, ``, ...m.segments.map((s) => `[${fmt(s.t)}] **${s.who}:** ${s.text}`)].join('\n')
    m.transcriptPath = path.join(m.dir, 'transcript.md')
    fs.writeFileSync(m.transcriptPath, md)
    m.status = 'done'
    this.save()
  }

  private save() {
    if (!this.meeting) return
    fs.writeFileSync(path.join(this.meeting.dir, 'meeting.json'), JSON.stringify(this.meeting, null, 2))
    this.emit(this.meeting)
  }
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const similar = (a: string, b: string) => {
  const A = new Set(norm(a).split(' ')), B = new Set(norm(b).split(' '))
  if (A.size < 3 || B.size < 3) return norm(a) === norm(b)
  let inter = 0
  for (const w of A) if (B.has(w)) inter++
  return inter / Math.min(A.size, B.size) >= 0.7
}
/** Without headphones the mic hears the speakers too. When a "Me" line matches a "Them" line within a few seconds, keep only the system-audio one. */
function dedupeCrosstalk(segs: MeetingSegment[]): MeetingSegment[] {
  return segs.filter((s, i) => {
    if (s.who !== 'Me') return true
    for (let j = Math.max(0, i - 6); j < Math.min(segs.length, i + 7); j++) {
      const o = segs[j]
      if (o.who === 'Them' && Math.abs(o.t - s.t) <= 6 && (similar(s.text, o.text) || norm(o.text).includes(norm(s.text)))) return false
    }
    return true
  })
}

/** RMS of a 16-bit mono WAV; whisper hallucinates ("Thank you.") on silence, so silent chunks are skipped. */
export function wavRms(file: string): number {
  const b = fs.readFileSync(file)
  const n = Math.floor((b.length - 44) / 2)
  if (n <= 0) return 0
  let acc = 0
  for (let i = 0; i < n; i += 4) acc += b.readInt16LE(44 + i * 2) ** 2 // every 4th sample is plenty
  return Math.sqrt(acc / Math.ceil(n / 4))
}
const SILENCE_RMS = 40

/** whisper-cli → segments with seconds offsets. Skips near-silent files fast. */
function transcribe(file: string): Promise<{ t: number; text: string }[]> {
  return new Promise((resolve, reject) => {
    const st = fs.statSync(file)
    if (st.size < 19200) return resolve([]) // < 0.6s of audio: whisper hallucinates on stubs
    if (wavRms(file) < SILENCE_RMS) return resolve([])
    const out = file.replace(/\.wav$/, '')
    execFile(whisperBin(), ['-m', modelPath(), '-f', file, '-l', 'auto', '-np', '-oj', '-of', out, '-t', '6'], { timeout: 240_000 }, (err) => {
      if (err) return reject(err)
      try {
        const j = JSON.parse(fs.readFileSync(out + '.json', 'utf8'))
        const segs = (j.transcription ?? [])
          .map((s: { offsets?: { from: number }; text: string }) => ({ t: (s.offsets?.from ?? 0) / 1000, text: String(s.text).trim() }))
          .filter((s: { text: string }) => s.text && !/^\[(BLANK_AUDIO|silence|music)\]$/i.test(s.text) && !/^\(.*\)$/.test(s.text))
        resolve(segs)
      } catch (e) {
        reject(e as Error)
      }
    })
  })
}

export const summaryPrompt = (m: Meeting) =>
  `A meeting titled "${m.title}" just ended. Transcript (Me = Rafael, Them = the other side): ${m.transcriptPath}

1. Read the transcript.
2. Write a KB page meetings/${m.id.slice(0, 10)}-<slug>.md with: title, date, who (if inferable), 5-line summary, decisions, action items (owner + due date if mentioned), open questions. Add it under a "## Meetings" heading in README.md (create the heading if missing). Commit.
3. Then call present_plan with a plan titled "Follow-ups: ${m.title}". One card "Proposed actions" with a checklist: board tasks to create (title, suggested assignee, priority), KB pages to update, agents to message. Nothing is created until the user approves. After approval, do exactly the approved items (create_task / kb edits / message_agent) and reply briefly.`
