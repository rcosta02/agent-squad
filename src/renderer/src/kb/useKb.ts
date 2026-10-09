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
  const [jump, setJump] = useState<number | undefined>() // line to scroll to after open
  const dirty = text !== saved
  const names = useMemo(() => [...pages.keys()], [pages])
  const graph = useMemo(() => buildGraph(pages), [pages])
  const resolve = useCallback((t: string) => resolveLink(t, names), [names])

  // refs so timers see the latest without re-arming
  const st = useRef({ current, text, saved })
  st.current = { current, text, saved }
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const commitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pending = useRef(false) // something written since the last commit

  const reload = useCallback(async () => {
    const all = await api.kbReadAll(wsId)
    const map = new Map(all.map((p) => [p.rel, p.content]))
    setPages(map)
    const { current: cur, text: t, saved: sv } = st.current
    if (cur && map.has(cur)) {
      const disk = map.get(cur)!
      if (disk !== sv) {
        if (t === sv) {
          setTextState(disk)
          setSaved(disk)
        } else setDiskChanged(true)
      }
    }
    return map
  }, [api, wsId])

  const flush = useCallback(async () => {
    clearTimeout(saveTimer.current)
    const { current: cur, text: t, saved: sv } = st.current
    if (!cur || t === sv) return
    await api.kbWrite(wsId, cur, t)
    setSaved(t)
    st.current.saved = t
    setPages((p) => new Map(p).set(cur, t))
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
      let map = pages
      if (!map.has(rel)) map = await reload()
      const content = map.get(rel) ?? ''
      setCurrent(rel)
      st.current.current = rel
      setTextState(content)
      setSaved(content)
      st.current.text = content
      st.current.saved = content
      setDiskChanged(false)
      setJump(line)
    },
    [commit, pages, reload]
  )

  const create = useCallback(
    async (rel: string) => {
      const clean = rel.endsWith('.md') ? rel : rel + '.md'
      if (!pages.has(clean)) {
        await api.kbWrite(wsId, clean, '')
        pending.current = true
        await reload()
      }
      await open(clean)
      return clean
    },
    [api, wsId, pages, reload, open]
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
      await api.kbRename(wsId, from, to)
      const map = await reload()
      const cur = st.current.current
      if (cur && !map.has(cur)) {
        const next = cur === from ? to : cur.startsWith(from + '/') ? to + cur.slice(from.length) : null
        if (next && map.has(next)) await open(next)
        else setCurrent(null)
      }
    },
    [api, wsId, commit, reload, open]
  )

  const remove = useCallback(
    async (rel: string) => {
      await api.kbDelete(wsId, rel)
      const map = await reload()
      const cur = st.current.current
      if (cur && !map.has(cur)) await open('README.md')
    },
    [api, wsId, reload, open]
  )

  const acceptDisk = useCallback(() => {
    const cur = st.current.current
    if (!cur) return
    const disk = pages.get(cur) ?? ''
    setTextState(disk)
    setSaved(disk)
    st.current.text = disk
    st.current.saved = disk
    setDiskChanged(false)
  }, [pages])

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

  return { pages, names, graph, resolve, current, text, dirty, diskChanged, jump, open, setText, flush, commit, create, mkdir, rename, remove, acceptDisk, reload }
}
