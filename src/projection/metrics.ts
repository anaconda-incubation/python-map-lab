/**
 * Global distortion metrics for a projection, computed on an area-uniform
 * Fibonacci-sphere sample (González 2010; golden angle γ = π(3−√5)).
 *
 * All statistics are area-weighted (each Fibonacci sample represents equal
 * sphere area 4π/N), so no per-point weighting is needed beyond skipping
 * invalid points (clipped limbs etc.), which are renormalized out.
 */
import { tissotAt } from './distortion'

type PointFn = (lon: number, lat: number) => { x: number; y: number }

export interface ProjectionScorecard {
  /** RMS of log2(areal scale); 0 = perfectly equal-area */
  rmsLog2AreaError: number
  /** median max-angular-deformation ω, degrees */
  medianOmegaDeg: number
  /** 95th-percentile ω, degrees */
  p95OmegaDeg: number
  /** maximum ω, degrees */
  maxOmegaDeg: number
  /** Airy–Kavrayskiy global criterion E_AK (ln-based; 0 = distortion-free) */
  airyKavrayskiy: number
  /** RMS residual of log projected/geodesic distance ratios after optimal global scale fit */
  distanceStressRms: number
  /** fraction of the sphere sample that projected to finite points */
  validFraction: number
  sampleCount: number
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

/** Fibonacci sphere samples: N points, each of area 4π/N. */
export function fibonacciSphere(n: number): { lon: Float64Array; lat: Float64Array } {
  const lon = new Float64Array(n)
  const lat = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const z = -1 + (2 * (i + 0.5)) / n
    lon[i] = ((i * GOLDEN_ANGLE) % (2 * Math.PI)) - Math.PI
    lat[i] = Math.asin(Math.max(-1, Math.min(1, z)))
  }
  return { lon, lat }
}

/** Great-circle central angle between two (lon, lat) points (radians). */
export function greatCircle(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const s1 = Math.sin(lat1)
  const s2 = Math.sin(lat2)
  const c = s1 * s2 + Math.cos(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1)
  return Math.acos(Math.max(-1, Math.min(1, c)))
}

function quantile(sorted: ArrayLike<number>, q: number): number {
  if (sorted.length === 0) return NaN
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export interface MetricsOptions {
  samples?: number
  distancePairs?: number
  /** skip points where areal scale exceeds this (projection explosions) */
  maxAreaScale?: number
}

/**
 * Full scorecard for a projection. Distance stress samples random pairs,
 * fits one optimal global scale by least squares on log ratios
 * (scale = exp(mean(log(dProj/dGC)))), and reports the residual RMS — i.e.
 * distance distortion that no uniform rescaling could remove.
 */
export function projectionScorecard(fn: PointFn, opts: MetricsOptions = {}): ProjectionScorecard {
  const n = opts.samples ?? 5000
  const nPairs = opts.distancePairs ?? 1500
  const maxArea = opts.maxAreaScale ?? 1e6
  const { lon, lat } = fibonacciSphere(n)

  const logArea: number[] = []
  const omegas: number[] = []
  const ak: number[] = []
  const px = new Float64Array(n)
  const py = new Float64Array(n)
  const valid = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const t = tissotAt(fn, lon[i], lat[i])
    const p = fn(lon[i], lat[i])
    const ok =
      t.valid &&
      Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      t.areaScale > 0 &&
      t.areaScale < maxArea
    valid[i] = ok ? 1 : 0
    if (!ok) continue
    px[i] = p.x
    py[i] = p.y
    const la = Math.log2(t.areaScale)
    logArea.push(la)
    omegas.push(t.omega)
    // ε_AK² = ln²(a/b) + ln²(a·b)
    const ratio = t.sigma2 > 0 ? t.sigma1 / t.sigma2 : 1e12
    ak.push(Math.log(ratio) ** 2 + Math.log(t.areaScale) ** 2)
  }
  const m = omegas.length
  const validFraction = m / n
  // Mean-centered: a uniform global mis-scale is a choice of display scale, not
  // area inequality. Subtract mean(log2 areaScale) before the RMS so e.g.
  // AuthaGraph's frame constant does not masquerade as area distortion.
  const meanLogArea = logArea.reduce((s, v) => s + v, 0) / Math.max(1, m)
  const rmsLog2AreaError = Math.sqrt(
    logArea.reduce((s, v) => s + (v - meanLogArea) ** 2, 0) / Math.max(1, m),
  )
  const airyKavrayskiy = Math.sqrt(ak.reduce((s, v) => s + v, 0) / Math.max(1, m))
  const sorted = Float64Array.from(omegas).sort()
  const R2D = 180 / Math.PI

  // --- pairwise distance stress ---
  // Deterministic LCG so scorecards are reproducible.
  let seed = 0x2545f491
  const rand = () => {
    seed = (seed * 48271) % 0x7fffffff
    return seed / 0x7fffffff
  }
  const logRatios: number[] = []
  for (let k = 0; k < nPairs; k++) {
    const i = Math.floor(rand() * n)
    const j = Math.floor(rand() * n)
    if (i === j || !valid[i] || !valid[j]) continue
    const dGC = greatCircle(lon[i], lat[i], lon[j], lat[j])
    if (dGC < 0.05) continue // degenerate pair
    const dProj = Math.hypot(px[i] - px[j], py[i] - py[j])
    if (dProj <= 1e-12) continue
    logRatios.push(Math.log(dProj / dGC))
  }
  let distanceStressRms = NaN
  if (logRatios.length > 8) {
    const mean = logRatios.reduce((s, v) => s + v, 0) / logRatios.length
    distanceStressRms = Math.sqrt(
      logRatios.reduce((s, v) => s + (v - mean) ** 2, 0) / logRatios.length,
    )
  }

  return {
    rmsLog2AreaError,
    medianOmegaDeg: quantile(sorted, 0.5) * R2D,
    p95OmegaDeg: quantile(sorted, 0.95) * R2D,
    maxOmegaDeg: (sorted[sorted.length - 1] ?? NaN) * R2D,
    airyKavrayskiy,
    distanceStressRms,
    validFraction,
    sampleCount: m,
  }
}
