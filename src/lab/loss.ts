/**
 * TS mirror of the DESIGN BY GOAL optimizer loss (src/python/optimizer.py.ts)
 * plus a real Nelder–Mead, run chunked on the main thread. This powers the
 * LIVE SEARCH visualization — the iteration ticker, the loss sparkline and
 * the candidate morphs are real evaluations of the same objective the SciPy
 * worker minimizes. The authoritative result still comes from
 * pythonClient.optimizeProjection; this mirror is the preview (and an
 * offline fallback).
 */
import { tissotAt } from '@/projection/distortion'
import { fibonacciSphere, greatCircle } from '@/projection/metrics'
import { familyProjectFn } from '@/projection/worker-client'
import type { Family, GoalWeights } from './types'

type PointFn = (lon: number, lat: number) => { x: number; y: number }

export interface LossTerms {
  area: number
  shape: number
  distance: number
  extreme: number
  outline: number
}

const N = 800
const SAMPLES = fibonacciSphere(N)

// Deterministic distance pairs (LCG, fixed seed — mirrors optimizer.py intent)
const PAIRS = (() => {
  let seed = 42
  const rand = () => {
    seed = (seed * 48271) % 0x7fffffff
    return seed / 0x7fffffff
  }
  const pi: number[] = []
  const pj: number[] = []
  const gc: number[] = []
  for (let k = 0; k < 500; k++) {
    const i = Math.floor(rand() * N)
    const j = Math.floor(rand() * N)
    if (i === j) continue
    const d = greatCircle(SAMPLES.lon[i], SAMPLES.lat[i], SAMPLES.lon[j], SAMPLES.lat[j])
    if (d <= 0.05) continue
    pi.push(i)
    pj.push(j)
    gc.push(d)
  }
  return { pi, pj, gc }
})()

const OUTLINE_LON = (() => {
  const a = new Float64Array(181)
  for (let i = 0; i < 181; i++) a[i] = -Math.PI + (i / 180) * 2 * Math.PI
  return a
})()

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/** Port of optimizer.py loss_terms(). Returns null for degenerate params. */
export function lossTerms(fn: PointFn): LossTerms | null {
  const la: number[] = []
  const om: number[] = []
  for (let i = 0; i < N; i++) {
    const t = tissotAt(fn, SAMPLES.lon[i], SAMPLES.lat[i])
    if (!t.valid || !(t.areaScale > 1e-8) || !(t.areaScale < 1e6)) continue
    la.push(Math.log2(t.areaScale))
    om.push(t.omega)
  }
  if (la.length < N / 2) return null
  const area = Math.sqrt(la.reduce((s, v) => s + v * v, 0) / la.length)
  const shape = Math.sqrt(om.reduce((s, v) => s + v * v, 0) / om.length)
  const omSorted = [...om].sort((a, b) => a - b)
  const laAbsSorted = la.map(Math.abs).sort((a, b) => a - b)
  const extreme = percentile(omSorted, 0.95) + percentile(laAbsSorted, 0.95)

  // distance term: RMS of log projected/geodesic ratios, mean removed
  let dMean = 0
  const lr: number[] = []
  for (let k = 0; k < PAIRS.pi.length; k++) {
    const a = fn(SAMPLES.lon[PAIRS.pi[k]], SAMPLES.lat[PAIRS.pi[k]])
    const b = fn(SAMPLES.lon[PAIRS.pj[k]], SAMPLES.lat[PAIRS.pj[k]])
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) {
      continue
    }
    const d = Math.hypot(a.x - b.x, a.y - b.y)
    lr.push(Math.log(Math.max(d, 1e-12) / PAIRS.gc[k]))
  }
  if (lr.length < 8) return null
  dMean = lr.reduce((s, v) => s + v, 0) / lr.length
  const distance = Math.sqrt(lr.reduce((s, v) => s + (v - dMean) ** 2, 0) / lr.length)

  // outline: pole-line ratio + aspect vs 2:1
  let maxXp = 0
  let maxXe = 0
  for (let i = 0; i < OUTLINE_LON.length; i++) {
    const p = fn(OUTLINE_LON[i], Math.PI / 2)
    const e = fn(OUTLINE_LON[i], 0)
    if (Number.isFinite(p.x)) maxXp = Math.max(maxXp, Math.abs(p.x))
    if (Number.isFinite(e.x)) maxXe = Math.max(maxXe, Math.abs(e.x))
  }
  const top = fn(0, Math.PI / 2)
  if (!Number.isFinite(top.y) || maxXe < 1e-9) return null
  const poleRatio = maxXp / maxXe
  const aspect = maxXe / Math.max(Math.abs(top.y), 1e-9)
  const outline = (poleRatio - 0.55) ** 2 + (aspect / 2 - 1) ** 2

  return { area, shape, distance, extreme, outline }
}

/** Map the six UI goal weights onto the five optimizer terms. */
export function optimizerWeights(w: GoalWeights): Record<string, number> {
  return {
    area: w.area,
    shape: w.shape,
    // Bearing fidelity and center-distance fidelity share one radial-scale
    // term for these pseudocylindrical families.
    distance: w.distance + w.direction,
    extreme: w.extremes,
    outline: w.compact,
  }
}

export function weightedLoss(terms: LossTerms, w: Record<string, number>): number {
  const wsum =
    Math.max(0, w.area) + Math.max(0, w.shape) + Math.max(0, w.distance) +
    Math.max(0, w.extreme) + Math.max(0, w.outline) || 1
  return (
    (Math.max(0, w.area) * terms.area +
      Math.max(0, w.shape) * terms.shape +
      Math.max(0, w.distance) * terms.distance +
      Math.max(0, w.extreme) * terms.extreme +
      Math.max(0, w.outline) * terms.outline) /
    wsum
  )
}

export const FAMILY_SEEDS: Record<Family, number[]> = {
  equal_area: [0.8660254, 1.340264, -0.081106, 0.0, 0.000893, 0.003796],
  compromise: [0.8660254, 1.340264, -0.081106, 0.0, 0.000893, 0.003796, 0.92, -0.1, 0.0, 0.0],
}

export interface SearchProgress {
  iteration: number
  evaluations: number
  loss: number
  params: number[]
}

export interface SearchResult {
  params: number[]
  loss: number
  terms: LossTerms | null
  iterations: number
  evaluations: number
  converged: boolean
  /** true when this came from the TS mirror rather than SciPy */
  mirror: boolean
}

/**
 * Chunked Nelder–Mead over the family coefficients (SciPy semantics:
 * 5%/0.00025 initial simplex, α=1 γ=2 ρ=0.5 σ=0.5, fatol/xatol 1e-6).
 * Yields to the event loop between chunks and reports every accepted best.
 */
export async function runSearchMirror(
  family: Family,
  weights: GoalWeights,
  opts: {
    maxiter?: number
    signal?: AbortSignal
    onProgress?: (p: SearchProgress) => void
  } = {},
): Promise<SearchResult> {
  const maxiter = opts.maxiter ?? 120
  const w = optimizerWeights(weights)
  const objective = (params: number[]): number => {
    try {
      const terms = lossTerms(familyProjectFn(family, params))
      if (!terms) return 1e3
      return weightedLoss(terms, w)
    } catch {
      return 1e3
    }
  }

  const x0 = FAMILY_SEEDS[family]
  const n = x0.length
  // initial simplex
  const simplex: number[][] = [x0.slice()]
  for (let i = 0; i < n; i++) {
    const p = x0.slice()
    p[i] = p[i] !== 0 ? p[i] * 1.05 : 0.00025
    simplex.push(p)
  }
  const fvals = simplex.map(objective)
  let evaluations = fvals.length
  let iterations = 0
  let converged = false
  let sinceYield = 0

  const order = () => {
    const idx = simplex.map((_, i) => i).sort((a, b) => fvals[a] - fvals[b])
    const s = idx.map((i) => simplex[i])
    const f = idx.map((i) => fvals[i])
    for (let i = 0; i <= n; i++) {
      simplex[i] = s[i]
      fvals[i] = f[i]
    }
  }
  const centroid = (exclude: number): number[] => {
    const c = new Array<number>(n).fill(0)
    for (let i = 0; i <= n; i++) {
      if (i === exclude) continue
      for (let j = 0; j < n; j++) c[j] += simplex[i][j] / n
    }
    return c
  }

  while (iterations < maxiter) {
    if (opts.signal?.aborted) break
    order()
    const best = simplex[0]
    const worst = simplex[n]
    // convergence: fatol + xatol (SciPy defaults, 1e-6)
    const fSpread = Math.abs(fvals[n] - fvals[0])
    let xSpread = 0
    for (let j = 0; j < n; j++) xSpread = Math.max(xSpread, Math.abs(worst[j] - best[j]))
    if (fSpread < 1e-6 && xSpread < 1e-6) {
      converged = true
      break
    }
    const xc = centroid(n)
    const xr = xc.map((c, j) => c + (c - worst[j])) // reflection α=1
    const fr = objective(xr)
    evaluations++
    if (fr < fvals[0]) {
      const xe = xc.map((c, j) => c + 2 * (c - worst[j])) // expansion γ=2
      const fe = objective(xe)
      evaluations++
      if (fe < fr) {
        simplex[n] = xe
        fvals[n] = fe
      } else {
        simplex[n] = xr
        fvals[n] = fr
      }
    } else if (fr < fvals[n - 1]) {
      simplex[n] = xr
      fvals[n] = fr
    } else {
      // contraction ρ=0.5
      const xco =
        fr < fvals[n]
          ? xc.map((c, j) => c + 0.5 * (xr[j] - c)) // outside
          : xc.map((c, j) => c + 0.5 * (worst[j] - c)) // inside
      const fc = objective(xco)
      evaluations++
      if (fc < Math.min(fr, fvals[n])) {
        simplex[n] = xco
        fvals[n] = fc
      } else {
        // shrink σ=0.5 toward best
        for (let i = 1; i <= n; i++) {
          simplex[i] = best.map((b, j) => b + 0.5 * (simplex[i][j] - b))
          fvals[i] = objective(simplex[i])
        }
        evaluations += n
      }
    }
    iterations++
    order()
    opts.onProgress?.({
      iteration: iterations,
      evaluations,
      loss: fvals[0],
      params: simplex[0].slice(),
    })
    if (++sinceYield >= 6) {
      sinceYield = 0
      await new Promise((r) => setTimeout(r, 0))
    }
  }

  order()
  const params = simplex[0].slice()
  return {
    params,
    loss: fvals[0],
    terms: lossTerms(familyProjectFn(family, params)),
    iterations,
    evaluations,
    converged,
    mirror: true,
  }
}
