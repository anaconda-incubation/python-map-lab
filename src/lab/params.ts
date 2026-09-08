/**
 * Param pragma parsing for WRITE PYTHON (design/lab.md):
 *   # @param name min max default   → live slider, fed into params["name"]
 *   # param: name=1.0               → shorthand (range guessed around default)
 * Up to 4 params are rendered.
 */

export interface ParamDef {
  name: string
  min: number
  max: number
  value: number
}

const MAX_PARAMS = 4

function guessRange(v: number): { min: number; max: number } {
  const span = Math.max(Math.abs(v), 0.5)
  return { min: v - 2 * span, max: v + 2 * span }
}

export function parseParams(code: string, previous: Record<string, number>): ParamDef[] {
  const out: ParamDef[] = []
  const seen = new Set<string>()
  for (const rawLine of code.split('\n')) {
    const line = rawLine.trim()
    let m = /^#\s*@param\s+([A-Za-z_]\w*)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/.exec(line)
    if (m) {
      const [, name, lo, hi, def] = m
      if (seen.has(name)) continue
      seen.add(name)
      const min = Number(lo)
      const max = Number(hi)
      if (!(Number.isFinite(min) && Number.isFinite(max) && min < max)) continue
      const keep = previous[name]
      out.push({
        name,
        min,
        max,
        value: keep !== undefined ? Math.min(max, Math.max(min, keep)) : Number(def),
      })
    } else {
      m = /^#\s*param:\s*([A-Za-z_]\w*)\s*=\s*(-?[\d.eE+-]+)/.exec(line)
      if (m) {
        const [, name, def] = m
        if (seen.has(name)) continue
        seen.add(name)
        const v = Number(def)
        if (!Number.isFinite(v)) continue
        const { min, max } = guessRange(v)
        const keep = previous[name]
        out.push({
          name,
          min,
          max,
          value: keep !== undefined ? Math.min(max, Math.max(min, keep)) : v,
        })
      }
    }
    if (out.length >= MAX_PARAMS) break
  }
  return out
}

export function paramsRecord(defs: ParamDef[]): Record<string, number> {
  const rec: Record<string, number> = {}
  for (const d of defs) rec[d.name] = d.value
  return rec
}
