// ponytail: minimal 5-field cron (min hour dom mon dow) with * , - / — enough for schedules like "0 8-18 * * 1-5".
const parseField = (f: string, min: number, max: number): Set<number> => {
  const out = new Set<number>()
  for (const part of f.split(',')) {
    const [range, stepStr] = part.split('/')
    const step = stepStr ? Number(stepStr) : 1
    let lo = min
    let hi = max
    if (range !== '*') {
      const [a, b] = range.split('-').map(Number)
      lo = a
      hi = b ?? (stepStr ? max : a)
    }
    for (let i = lo; i <= hi; i += step) out.add(i)
  }
  return out
}

export function cronMatches(expr: string, d: Date): boolean {
  const f = expr.trim().split(/\s+/)
  if (f.length !== 5) return false
  const [mi, h, dom, mon, dow] = f
  return (
    parseField(mi, 0, 59).has(d.getMinutes()) &&
    parseField(h, 0, 23).has(d.getHours()) &&
    parseField(dom, 1, 31).has(d.getDate()) &&
    parseField(mon, 1, 12).has(d.getMonth() + 1) &&
    (parseField(dow, 0, 7).has(d.getDay()) || (d.getDay() === 0 && parseField(dow, 0, 7).has(7))) // 0 and 7 both Sunday
  )
}

export function isValidCron(expr: string): boolean {
  try {
    cronMatches(expr, new Date())
    return expr.trim().split(/\s+/).length === 5 && /^[\d*,\-/\s]+$/.test(expr)
  } catch {
    return false
  }
}

/** Next matching minute after `from`, scanning up to 8 days. */
export function nextRun(expr: string, from = new Date()): number | undefined {
  const d = new Date(from)
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() + 1)
  for (let i = 0; i < 8 * 24 * 60; i++) {
    if (cronMatches(expr, d)) return d.getTime()
    d.setMinutes(d.getMinutes() + 1)
  }
  return undefined
}
