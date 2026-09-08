/**
 * WRITE PYTHON bake bridge (design/lab.md MODE 2): the worker evaluates the
 * user's project() on a shared regular lon/lat grid (~66k vertices); the
 * returned (x, y) become a bilinear-interpolated scalar ProjectPointFn that
 * feeds the exact same bake pipeline as canonical projections
 * (bakeCustomProjection), so Tissot/overlays/graticule all work with zero
 * additional Python calls.
 */
import type { ProjectPointFn } from '@/projection/types'

export interface LabGrid {
  lon: Float64Array
  lat: Float64Array
  nLon: number
  nLat: number
  /** grid step, radians */
  dLon: number
  dLat: number
}

/** Regular grid: lon ∈ [−π, π] (1° step), lat ∈ [−π/2, π/2] (1° step). */
export function buildLabGrid(): LabGrid {
  const nLon = 361
  const nLat = 181
  const dLon = (2 * Math.PI) / (nLon - 1)
  const dLat = Math.PI / (nLat - 1)
  const lon = new Float64Array(nLon * nLat)
  const lat = new Float64Array(nLon * nLat)
  let k = 0
  for (let j = 0; j < nLat; j++) {
    for (let i = 0; i < nLon; i++) {
      lon[k] = -Math.PI + i * dLon
      lat[k] = -Math.PI / 2 + j * dLat
      k++
    }
  }
  return { lon, lat, nLon, nLat, dLon, dLat }
}

export interface GridProjection {
  fn: ProjectPointFn
  frame: { halfWidth: number; halfHeight: number }
  /** count of non-finite vertices in the raw worker output */
  invalidCount: number
  /** |φ| where the projection stops being finite, degrees (null if none) */
  escapeLatDeg: number | null
}

/**
 * Build a scalar projection fn from worker output arrays (row-major grid,
 * row = latitude). Bilinear in map space; any NaN corner ⇒ NaN (a hole).
 */
export function gridProjection(grid: LabGrid, x: Float64Array, y: Float64Array): GridProjection {
  const { nLon, nLat, dLon, dLat } = grid
  const at = (i: number, j: number): number => j * nLon + i

  let invalidCount = 0
  let maxX = 0
  let maxY = 0
  let maxFiniteAbsLatIdx = -1
  let anyInvalid = false
  for (let j = 0; j < nLat; j++) {
    let rowFinite = false
    for (let i = 0; i < nLon; i++) {
      const k = at(i, j)
      const fx = x[k]
      const fy = y[k]
      if (Number.isFinite(fx) && Number.isFinite(fy)) {
        rowFinite = true
        maxX = Math.max(maxX, Math.abs(fx))
        maxY = Math.max(maxY, Math.abs(fy))
      } else {
        invalidCount++
        anyInvalid = true
      }
    }
    if (rowFinite) maxFiniteAbsLatIdx = Math.max(maxFiniteAbsLatIdx, Math.abs(j - (nLat - 1) / 2))
  }

  const escapeLatDeg = anyInvalid
    ? Math.min(90, (maxFiniteAbsLatIdx + 1) * (dLat * 180) / Math.PI)
    : null

  const fn: ProjectPointFn = (lon, lat) => {
    const u = (lon + Math.PI) / dLon
    const v = (lat + Math.PI / 2) / dLat
    const i0 = Math.max(0, Math.min(nLon - 2, Math.floor(u)))
    const j0 = Math.max(0, Math.min(nLat - 2, Math.floor(v)))
    const fu = Math.max(0, Math.min(1, u - i0))
    const fv = Math.max(0, Math.min(1, v - j0))
    const k00 = at(i0, j0)
    const k10 = at(i0 + 1, j0)
    const k01 = at(i0, j0 + 1)
    const k11 = at(i0 + 1, j0 + 1)
    const xs = [x[k00], x[k10], x[k01], x[k11]]
    const ys = [y[k00], y[k10], y[k01], y[k11]]
    for (let q = 0; q < 4; q++) {
      if (!Number.isFinite(xs[q]) || !Number.isFinite(ys[q])) {
        return { x: NaN, y: NaN }
      }
    }
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t
    return {
      x: lerp(lerp(xs[0], xs[1], fu), lerp(xs[2], xs[3], fu), fv),
      y: lerp(lerp(ys[0], ys[1], fu), lerp(ys[2], ys[3], fu), fv),
    }
  }

  return {
    fn,
    frame: { halfWidth: maxX || 1, halfHeight: maxY || 1 },
    invalidCount,
    escapeLatDeg,
  }
}

/**
 * Sample a closed world-outline polyline (normalized to [−1,1]) for the
 * saved-shelf sparkline cards. Traces equator → pole row → equator back.
 */
export function sampleOutline(fn: ProjectPointFn, frame: { halfWidth: number; halfHeight: number }): [number, number][] {
  const pts: [number, number][] = []
  const hw = frame.halfWidth || 1
  const hh = frame.halfHeight || 1
  const s = Math.max(hw, hh)
  const push = (lon: number, lat: number) => {
    const p = fn(lon, lat)
    if (Number.isFinite(p.x) && Number.isFinite(p.y)) pts.push([p.x / s, -p.y / s])
  }
  for (let i = 0; i <= 48; i++) push(-Math.PI + (i / 48) * 2 * Math.PI, Math.PI / 2 - 1e-6)
  for (let i = 48; i >= 0; i--) push(-Math.PI + (i / 48) * 2 * Math.PI, -Math.PI / 2 + 1e-6)
  return pts
}
