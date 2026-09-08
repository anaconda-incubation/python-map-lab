/**
 * Shared types for the Projection Lab (design/lab.md).
 */

export type LabMode = 'design' | 'python'

export type Family = 'equal_area' | 'compromise'

/** The six goal weights, slider order (design/lab.md MODE 1). */
export interface GoalWeights {
  area: number
  shape: number
  distance: number
  direction: number
  compact: number
  extremes: number
}

export const DEFAULT_WEIGHTS: GoalWeights = {
  area: 8,
  shape: 6,
  distance: 4,
  direction: 4,
  compact: 5,
  extremes: 5,
}

export interface GoalDef {
  key: keyof GoalWeights
  /** KaTeX weight symbol */
  symbol: string
  label: string
  definition: string
}

export const GOALS: GoalDef[] = [
  {
    key: 'area',
    symbol: 'w_a',
    label: 'Preserve area',
    definition: 'Equal-area: every cm² of map = the same km² of Earth.',
  },
  {
    key: 'shape',
    symbol: 'w_s',
    label: 'Preserve local shape',
    definition: 'Conformality: small shapes keep their angles.',
  },
  {
    key: 'distance',
    symbol: 'w_d',
    label: 'Preserve distance',
    definition: "Scale uniformity from the map's center.",
  },
  {
    key: 'direction',
    symbol: 'w_b',
    label: 'Preserve direction',
    definition: 'Bearings from the center stay true.',
  },
  {
    key: 'compact',
    symbol: 'w_c',
    label: 'Compact outline',
    definition: 'Penalize eccentric world outlines (favor a tidy rectangle/ellipse).',
  },
  {
    key: 'extremes',
    symbol: 'w_e',
    label: 'Reduce extremes',
    definition: 'Crush the worst-case (p95/max) distortion, wherever it lives.',
  },
]

/** Canonical flat projections the lab compares against. */
export const COMPARE_CANON = [
  { id: 'mercator', pyId: 'mercator', name: 'Mercator' },
  { id: 'gallPeters', pyId: 'gall_peters', name: 'Gall–Peters' },
  { id: 'equalEarth', pyId: 'equal_earth', name: 'Equal Earth' },
  { id: 'authagraph', pyId: null, name: 'AuthaGraph' },
] as const

export type CompareCanonId = (typeof COMPARE_CANON)[number]['id']

/** A measured score set (JS scorecard and/or Python global_metrics). */
export interface LabScores {
  rmsLog2Area: number
  medianOmegaDeg: number
  p95OmegaDeg: number
  maxOmegaDeg: number
  airyKavrayskiy: number
}

/** Serialized into the URL fragment and the localStorage shelf. */
export type SharePayload =
  | {
      v: 1
      mode: 'design'
      family: Family
      params: number[]
      weights: GoalWeights
      name: string
      outline?: [number, number][]
    }
  | {
      v: 1
      mode: 'python'
      code: string
      params: Record<string, number>
      name: string
      outline?: [number, number][]
    }

export interface ShelfEntry {
  id: string
  name: string
  savedAt: number
  payload: SharePayload
}
