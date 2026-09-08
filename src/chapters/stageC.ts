/**
 * Shared stage utilities for chapters 07–10 (THE MORPH STUDIO, THE SCORECARD,
 * THE AREA TEST, MOVE A CIRCLE). Scoped to essay-c's chapters only.
 *
 * - Lazy MapStage lifecycle: mount when the stage nears the viewport
 *   (IntersectionObserver rootMargin 150%), dispose when it leaves by ~250%,
 *   so at most ~2 WebGL contexts are alive on the essay page.
 * - rAF tween helper with the design-token easings (§6), reduced-motion aware.
 * - Lazily computed, module-cached distortion scorecards (metrics.ts runs on
 *   the main thread but is chunked behind setTimeout so first paint never
 *   blocks; results are reused by every chapter).
 */
import { useEffect, useRef, useState, type RefObject } from 'react'
import { MapStage, type LayerState, type StageTheme } from '@/three/MapStage'
import { getProjection } from '@/projection/projections'
import { projectionScorecard, type ProjectionScorecard } from '@/projection/metrics'
import type { ProjectionId } from '@/projection/types'
import '@/projection/authagraph' // ensure registration

/* ---------------- easings (design.md §6) ---------------- */

/** Small cubic-bezier solver (Newton + bisection fallback). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t
  const sampleDX = (t: number) => (3 * ax * t + 2 * bx) * t + cx
  return (x: number): number => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let t = x
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x
      if (Math.abs(err) < 1e-6) return sampleY(t)
      const d = sampleDX(t)
      if (Math.abs(d) < 1e-6) break
      t -= err / d
    }
    let lo = 0
    let hi = 1
    t = x
    while (lo < hi) {
      const v = sampleX(t)
      if (Math.abs(v - x) < 1e-6) break
      if (v < x) lo = t + 1e-7
      else hi = t - 1e-7
      t = (lo + hi) / 2
      if (hi - lo < 1e-6) break
    }
    return sampleY(t)
  }
}

export const EASE_MORPH = cubicBezier(0.65, 0, 0.35, 1)
export const EASE_ATLAS = cubicBezier(0.22, 1, 0.36, 1)

export interface TweenHandle {
  cancel: () => void
}

/** rAF tween of a scalar. Reduced motion ⇒ single jump to `to`. */
export function tweenValue(
  from: number,
  to: number,
  opts: {
    duration?: number
    ease?: (t: number) => number
    reduced?: boolean
    onUpdate: (v: number) => void
    onDone?: () => void
  },
): TweenHandle {
  const { duration = 1600, ease = EASE_MORPH, reduced = false, onUpdate, onDone } = opts
  if (reduced || duration <= 0 || from === to) {
    onUpdate(to)
    onDone?.()
    return { cancel: () => undefined }
  }
  let raf = 0
  let cancelled = false
  const start = performance.now()
  const step = (now: number) => {
    if (cancelled) return
    const t = Math.min(1, (now - start) / duration)
    onUpdate(from + (to - from) * ease(t))
    if (t < 1) raf = requestAnimationFrame(step)
    else onDone?.()
  }
  raf = requestAnimationFrame(step)
  return {
    cancel: () => {
      cancelled = true
      cancelAnimationFrame(raf)
    },
  }
}

/* ---------------- lazy MapStage lifecycle ---------------- */

export interface LazyStageOptions {
  theme?: StageTheme
  /** Layers applied right after (re)mount. */
  layers?: Partial<LayerState>
}

export interface LazyStage {
  /** Attach to the element that will host the WebGL canvas. */
  hostRef: RefObject<HTMLDivElement | null>
  /** The live MapStage, or null while unmounted (far from viewport). */
  stage: MapStage | null
}

/**
 * Mount a MapStage into `hostRef` only while the host is within 150% of the
 * viewport; dispose it once it leaves a 250% margin. Remounts create a fresh
 * stage — chapter effects must key on the returned `stage` object.
 */
export function useLazyMapStage(opts: LazyStageOptions = {}): LazyStage {
  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<MapStage | null>(null)
  const [stage, setStage] = useState<MapStage | null>(null)
  const optsRef = useRef(opts)
  useEffect(() => {
    optsRef.current = opts
  })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let mounted = false

    const mount = () => {
      if (mounted || !hostRef.current) return
      mounted = true
      const s = new MapStage({ theme: optsRef.current.theme ?? 'paper' })
      s.mount(hostRef.current)
      if (optsRef.current.layers) s.setLayers(optsRef.current.layers)
      stageRef.current = s
      setStage(s)
    }
    const dispose = () => {
      if (!mounted) return
      mounted = false
      stageRef.current?.dispose()
      stageRef.current = null
      setStage(null)
    }

    // Mount when close (150%), dispose when far (250%).
    const near = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) mount()
      },
      { rootMargin: '150% 0px' },
    )
    const far = new IntersectionObserver(
      (entries) => {
        if (entries.every((e) => !e.isIntersecting)) dispose()
      },
      { rootMargin: '250% 0px' },
    )
    near.observe(host)
    far.observe(host)
    return () => {
      near.disconnect()
      far.disconnect()
      dispose()
    }
  }, [])

  return { hostRef, stage }
}

/* ---------------- lazy, cached distortion scorecards ---------------- */

const scorecardCache = new Map<string, Promise<ProjectionScorecard>>()
let metricsQueue: Promise<unknown> = Promise.resolve()

/**
 * Full scorecard for a flat projection (5,001 area-weighted Fibonacci
 * samples by default), computed lazily and queued so chapters never run two
 * scorecards concurrently on the main thread. Module-cached.
 */
export function getScorecard(
  id: ProjectionId,
  opts: { samples?: number; distancePairs?: number; nonce?: number } = {},
): Promise<ProjectionScorecard> {
  const key = `${id}:${opts.samples ?? 5001}:${opts.distancePairs ?? 1500}:${opts.nonce ?? 0}`
  let p = scorecardCache.get(key)
  if (!p) {
    p = new Promise<ProjectionScorecard>((resolve, reject) => {
      metricsQueue = metricsQueue.then(
        () =>
          new Promise<void>((done) => {
            // yield to the event loop so interaction/paint wins
            setTimeout(() => {
              try {
                const fn = (lon: number, lat: number) =>
                  getProjection(id).projectPoint(lon, lat)
                resolve(projectionScorecard(fn, opts))
              } catch (err) {
                reject(err)
              } finally {
                done()
              }
            }, 24)
          }),
      )
    })
    scorecardCache.set(key, p)
  }
  return p
}

/** True once a scorecard is already cached (for synchronous renders). */
export function scorecardReady(
  id: ProjectionId,
  opts: { samples?: number; distancePairs?: number; nonce?: number } = {},
): boolean {
  return scorecardCache.has(
    `${id}:${opts.samples ?? 5001}:${opts.distancePairs ?? 1500}:${opts.nonce ?? 0}`,
  )
}

/* ---------------- formatting ---------------- */

export function fmt(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '—'
  return v.toFixed(digits)
}

/** 2–3 significant figures for measured scores. */
export function fmtSig(v: number): string {
  if (!Number.isFinite(v)) return '—'
  if (v === 0) return '0.00'
  const a = Math.abs(v)
  if (a >= 100) return v.toFixed(0)
  if (a >= 10) return v.toFixed(1)
  if (a >= 1) return v.toFixed(2)
  return v.toFixed(3)
}
