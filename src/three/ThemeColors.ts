/**
 * Cartographic rendering colors, mirrored from design.md §3 (Three.js column).
 * Kept as a constant rather than getComputedStyle so the engine works
 * headless and theme switches are synchronous uniform updates.
 */
export type StageTheme = 'paper' | 'atlas'

export interface ThemeColors {
  background: string
  ocean: string
  oceanGlow: string
  land: string
  landStroke: string
  lakes: string
  graticule: string
  graticuleAlpha: number
  tissot: string
  tissotFillAlpha: number
  selection: string
  labelInk: string
}

export const THEME_COLORS: Record<StageTheme, ThemeColors> = {
  paper: {
    background: '#EDF2E9',
    ocean: '#CCD9D6',
    oceanGlow: '#A8C9C7',
    land: '#9BAF94',
    landStroke: '#3A3428',
    lakes: '#CCD9D6',
    graticule: '#1B1812',
    graticuleAlpha: 0.14,
    tissot: '#C2481F',
    tissotFillAlpha: 0.12,
    selection: '#C2481F',
    labelInk: '#39443F',
  },
  atlas: {
    background: '#0B100D',
    ocean: '#2E2667',
    oceanGlow: '#CCC6FF',
    land: '#D2E8B7',
    landStroke: '#F0F6E8',
    lakes: '#2E2667',
    graticule: '#D8E5DC',
    graticuleAlpha: 0.12,
    tissot: '#CCC6FF',
    tissotFillAlpha: 0.06,
    selection: '#CCC6FF',
    labelInk: '#F5F7F5',
  },
}

/** Area-distortion ramp stops (log₂ diverging, design.md §3). */
export const AREA_RAMP: Array<[number, string]> = [
  [-3, '#2C6E9B'],
  [0, '#F5F1E8'],
  [1, '#D9A03B'],
  [2, '#C2481F'],
  [3, '#7E2412'],
]

/** Angular-distortion ramp stops (ω radians, sequential). */
export const ANGLE_RAMP: Array<[number, string]> = [
  [0, '#F5F1E8'],
  [0.2618, '#C9B37E'],
  [0.5236, '#C2481F'],
  [0.7854, '#5E1E0E'],
]

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** GLSL constant chunk evaluating the two §3 ramps. */
export function rampGlsl(): string {
  const mk = (stops: Array<[number, string]>) =>
    stops
      .map(([, c]) => {
        const [r, g, b] = hexToRgb(c)
        return `vec3(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)})`
      })
      .map((c, i) => ({ t: stops[i][0], c }))
  const area = mk(AREA_RAMP)
  const angle = mk(ANGLE_RAMP)
  const fn = (name: string, stops: Array<{ t: number; c: string }>) => {
    let body = `vec3 ${name}(float t) {\n`
    body += `  if (t <= ${stops[0].t.toFixed(4)}) return ${stops[0].c};\n`
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1]
      const b = stops[i]
      body += `  if (t <= ${b.t.toFixed(4)}) return mix(${a.c}, ${b.c}, (t - (${a.t.toFixed(4)})) / ${(b.t - a.t).toFixed(4)});\n`
    }
    body += `  return ${stops[stops.length - 1].c};\n}\n`
    return body
  }
  return fn('areaRamp', area) + fn('angleRamp', angle)
}
