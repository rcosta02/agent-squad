import { useEffect, useMemo, useState } from 'react'

// Unicode ranges by category; filtered to pictographic code points so unassigned slots do not render as boxes.
const RANGES: [string, [number, number][]][] = [
  ['Smileys', [[0x1f600, 0x1f64f], [0x1f910, 0x1f92f], [0x1f970, 0x1f97a], [0x1f9d0, 0x1f9d0], [0x2639, 0x263a]]],
  ['People', [[0x1f466, 0x1f487], [0x1f9d1, 0x1f9df], [0x1f574, 0x1f575], [0x1f57a, 0x1f57a], [0x1f930, 0x1f93e], [0x1f9b8, 0x1f9b9], [0x1f44b, 0x1f450], [0x1f590, 0x1f596], [0x1f918, 0x1f91f], [0x270a, 0x270d]]],
  ['Animals', [[0x1f400, 0x1f43f], [0x1f980, 0x1f9ae], [0x1f54a, 0x1f54a], [0x1f577, 0x1f578], [0x1f9a0, 0x1f9a2], [0x1f335, 0x1f33f], [0x1f340, 0x1f344]]],
  ['Food', [[0x1f345, 0x1f37f], [0x1f950, 0x1f96f], [0x1f9c0, 0x1f9cb], [0x2615, 0x2615]]],
  ['Travel', [[0x1f680, 0x1f6ff], [0x1f30d, 0x1f320], [0x1f3d4, 0x1f3df], [0x1f3e0, 0x1f3f0], [0x26f0, 0x26fd], [0x2708, 0x2708]]],
  ['Activities', [[0x1f3a0, 0x1f3d3], [0x1f3f8, 0x1f3ff], [0x1f93f, 0x1f94f], [0x26bd, 0x26be], [0x1f004, 0x1f004]]],
  ['Objects', [[0x1f4a1, 0x1f4ff], [0x1f500, 0x1f53d], [0x1f550, 0x1f567], [0x1f5a4, 0x1f5a5], [0x1f5c2, 0x1f5c4], [0x1f5d1, 0x1f5d3], [0x1f5e1, 0x1f5e3], [0x1f5fa, 0x1f5ff], [0x1f6e0, 0x1f6ec], [0x1f9e0, 0x1f9ff], [0x1fa70, 0x1faff], [0x2702, 0x2705], [0x2709, 0x2709], [0x270f, 0x2712], [0x2728, 0x2728]]],
  ['Symbols', [[0x1f493, 0x1f49f], [0x1f4a0, 0x1f4a0], [0x2600, 0x2614], [0x2618, 0x2623], [0x2626, 0x262f], [0x2638, 0x2638], [0x2648, 0x2653], [0x2660, 0x2668], [0x267b, 0x267f], [0x2692, 0x269c], [0x26a0, 0x26ab], [0x26c4, 0x26c5], [0x26ce, 0x26d4], [0x2733, 0x2734], [0x2744, 0x2747], [0x274c, 0x274e], [0x2753, 0x2757], [0x2763, 0x2764], [0x2795, 0x2797], [0x27a1, 0x27a1], [0x27b0, 0x27bf], [0x2b05, 0x2b07], [0x2b1b, 0x2b1c], [0x2b50, 0x2b55], [0x1f191, 0x1f19a], [0x1f7e0, 0x1f7eb]]],
  ['Flags', [[0x1f1e6, 0x1f1ff]]] // combined below into country pairs
]
const pict = /\p{Extended_Pictographic}/u

function build(): [string, string[]][] {
  return RANGES.map(([name, ranges]) => {
    if (name === 'Flags') {
      const A = 0x1f1e6
      const codes = ['US', 'BR', 'PT', 'CA', 'GB', 'DE', 'FR', 'ES', 'IT', 'MX', 'AR', 'JP', 'KR', 'CN', 'IN', 'AU', 'NL', 'SE', 'CH', 'IE', 'EU', 'UN']
      return [name, codes.map((c) => String.fromCodePoint(A + c.charCodeAt(0) - 65, A + c.charCodeAt(1) - 65))]
    }
    const out: string[] = []
    for (const [a, b] of ranges) for (let cp = a; cp <= b; cp++) {
      const ch = String.fromCodePoint(cp)
      if (pict.test(ch)) out.push(ch)
    }
    return [name, out]
  })
}

type Props = { value: string; onPick: (e: string) => void; onClose: () => void }

export default function EmojiPicker({ value, onPick, onClose }: Props) {
  const groups = useMemo(build, [])
  const [cat, setCat] = useState(groups[0][0])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), onClose())
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  const list = groups.find((g) => g[0] === cat)?.[1] ?? []
  return (
    <div className="emoji-pop" onMouseDown={(e) => e.stopPropagation()}>
      <div className="emoji-cats">
        {groups.map(([name, items]) => (
          <button key={name} type="button" className={'emoji-cat' + (name === cat ? ' on' : '')} title={name} onClick={() => setCat(name)}>
            {items[0]}
          </button>
        ))}
      </div>
      <div className="emoji-grid">
        {list.map((e) => (
          <button key={e} type="button" className={'emoji-cell' + (e === value ? ' on' : '')} onClick={() => (onPick(e), onClose())}>
            {e}
          </button>
        ))}
      </div>
    </div>
  )
}
