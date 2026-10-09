import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildGraph, resolve as resolveLink } from './links'

const AUTOSAVE_MS = 400
const IDLE_COMMIT_MS = 60_000

/** All KB state for one workspace: pages in memory, link graph, the open note, autosave + commit points, disk watcher. */
export function useKb(wsId: string) {
  const api = window.api
  const [pages, setPages] = useState<Map<string, string>>(new Map())
  const [current, setCurrent] = useState<string | null>(null)
  const [text, setTextState] = useState('')
  const [saved, setSaved] = useState('') // last content written to disk for `current`
  const [diskChanged, setDiskChanged] = useState(false)
  const [diskText, setDiskText] = useState('') // the on-disk version while diskChanged, for Reload
  const [jump, setJump] = useState<number | undefined>() // line to scroll to after open
  const dirty = text !== saved
  const names = useMemo(() => [...pages.keys()], [pages])
  const graph = useMemo(() => buildGraph(pages), [pages])
  const resolve = useCallback((t: string) => resolveLink(t, names), [names])

  // refs so timers see the latest without re-arming
  const st = useRef({ current, text, saved, diskChanged, pages })
  st.current = { current, text, saved, diskChanged, pages }
  const busy = useRef(false) // rename/remove in flight: autosave must not recreate the old path
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const commitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pending = useRef(false) // something written since the last commit

  const reload = useCallback(async () => {
    const all = await api.kbReadAll(wsId)
    const map = new Map(all.map((p) => [p.rel, p.content]))
    setPages(map)
    st.current.pages = map
    const { current: cur, text: t, saved: sv } = st.current
    if (cur && map.has(cur)) {
      const disk = map.get(cur)!
      if (disk === t) {
        // user and disk agree (user typed what the agent wrote, or accepted it): nothing pending
        setSaved(disk)
        st.current.saved = disk
        setDiskChanged(false)
      } else if (disk !== sv) {
        if (t === sv) {
          setTextState(disk)
          setSaved(disk)
          st.current.text = disk
          st.current.saved = disk
        } else {
          setDiskText(disk)
          setDiskChanged(true)
          st.current.diskChanged = true
        }
      }
    }
    return map
  }, [api, wsId])

  const flush = useCallback(async () => {
    clearTimeout(saveTimer.current)
    const { current: cur, text: t, saved: sv, diskChanged: conflict } = st.current
    if (!cur || t === sv || conflict || busy.current) return // conflict: never overwrite the agent's version silently
    await api.kbWrite(wsId, cur, t)
    setSaved(t)
    st.current.saved = t
    setPages((p) => {
      const next = new Map(p).set(cur, t)
      st.current.pages = next
      return next
    })
    pending.current = true
  }, [api, wsId])

  const commit = useCallback(async () => {
    clearTimeout(commitTimer.current)
    await flush()
    if (!pending.current) return
    pending.current = false
    await api.kbCommit(wsId)
  }, [api, wsId, flush])

  const setText = useCallback(
    (t: string) => {
      setTextState(t)
      st.current.text = t
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => void flush(), AUTOSAVE_MS)
      clearTimeout(commitTimer.current)
      commitTimer.current = setTimeout(() => void commit(), IDLE_COMMIT_MS)
    },
    [flush, commit]
  )

  const open = useCallback(
    async (rel: string, line?: number) => {
      await commit()
      let map = st.current.pages
      if (!map.has(rel)) map = await reload()
      const content = map.get(rel) ?? ''
      setCurrent(rel)
      st.current.current = rel
      setTextState(content)
      setSaved(content)
      st.current.text = content
      st.current.saved = content
      setDiskChanged(false)
      st.current.diskChanged = false
      setJump(line)
    },
    [commit, reload]
  )

  const create = useCallback(
    async (rel: string) => {
      const clean = rel.endsWith('.md') ? rel : rel + '.md'
      const existing = resolveLink(clean, [...st.current.pages.keys()]) // case-insensitive: APFS would truncate a same-named note
      if (existing) {
        await open(existing)
        return existing
      }
      await api.kbCreate(wsId, clean)
      pending.current = true
      await reload()
      await open(clean)
      return clean
    },
    [api, wsId, reload, open]
  )

  const mkdir = useCallback(
    async (rel: string) => {
      await api.kbMkdir(wsId, rel)
      await reload()
    },
    [api, wsId, reload]
  )

  const rename = useCallback(
    async (from: string, to: string) => {
      await commit()
      busy.current = true
      try {
        await api.kbRename(wsId, from, to)
      } finally {
        busy.current = false
      }
      const map = await reload()
      const cur = st.current.current
      if (cur && !map.has(cur)) {
        const next = cur === from ? to : cur.startsWith(from + '/') ? to + cur.slice(from.length) : null
        // keystrokes typed during the round-trip were never written; drop them so a flush cannot recreate the old path
        st.current.saved = st.current.text
        if (next && map.has(next)) await open(next)
        else setCurrent(null)
      }
    },
    [api, wsId, commit, reload, open]
  )

  const remove = useCallback(
    async (rel: string) => {
      clearTimeout(saveTimer.current)
      const cur = st.current.current
      if (cur === rel || cur?.startsWith(rel + '/')) st.current.saved = st.current.text // nothing left to flush for a note being deleted
      busy.current = true
      try {
        await api.kbDelete(wsId, rel)
      } finally {
        busy.current = false
      }
      const map = await reload()
      if (cur && !map.has(cur)) await open('README.md')
    },
    [api, wsId, reload, open]
  )

  /** Reload: take the on-disk version, drop local edits. */
  const acceptDisk = useCallback(() => {
    setTextState(diskText)
    setSaved(diskText)
    st.current.text = diskText
    st.current.saved = diskText
    setDiskChanged(false)
    st.current.diskChanged = false
  }, [diskText])

  /** Keep mine: overwrite the on-disk version with the local text. */
  const keepMine = useCallback(() => {
    setDiskChanged(false)
    st.current.diskChanged = false
    void flush()
  }, [flush])

  // lifecycle: load, watch, commit on blur/unmount
  useEffect(() => {
    void reload().then((map) => {
      if (!st.current.current && map.has('README.md')) void open('README.md')
    })
    void api.kbWatch(wsId, true)
    const off = api.onEvent((e) => {
      if (e.type === 'kbChanged' && e.workspaceId === wsId) void reload()
    })
    const onBlur = () => void commit()
    window.addEventListener('blur', onBlur)
    return () => {
      off()
      window.removeEventListener('blur', onBlur)
      void api.kbWatch(wsId, false)
      void commit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId])

  return { pages, names, graph, resolve, current, text, dirty, diskChanged, jump, open, setText, flush, commit, create, mkdir, rename, remove, acceptDisk, keepMine, reload }
}
