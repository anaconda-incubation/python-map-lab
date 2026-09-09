/**
 * Owns the Lab's single MapStage instance (lab.md: "The Lab's stage uses ONE
 * MapStage instance"). Mounts into a container div, drives ease-morph
 * transitions between baked projections (globe ↔ canonical ↔ custom), tracks
 * the layer toggles, and exposes a compare-scrub path (pair + t).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { MapStage } from '@/three/MapStage'
import { bakeCustomProjection } from '@/projection/bake'
import type { BakedProjection, ProjectPointFn } from '@/projection/types'
import type { StageLayer, StageLayerState } from '@/components/StageToggle'
import { useReducedMotion } from '@/hooks/useReducedMotion'

/* cubic-bezier(0.65, 0, 0.35, 1) — ease-morph (design.md §6) */
function easeMorph(t: number): number {
  // Newton solve for the bezier parameter
  const x1 = 0.65
  const y1 = 0
  const x2 = 0.35
  const y2 = 1
  let u = t
  for (let i = 0; i < 8; i++) {
    const cx = 3 * x1 * (1 - u) ** 2 * u + 3 * x2 * (1 - u) * u ** 2 + u ** 3 - t
    const dx = 3 * x1 * (1 - u) * (1 - 3 * u) + 3 * x2 * (2 - 3 * u) * u + 3 * u ** 2
    if (Math.abs(dx) < 1e-6) break
    u -= cx / dx
  }
  u = Math.min(1, Math.max(0, u))
  return 3 * y1 * (1 - u) ** 2 * u + 3 * y2 * (1 - u) * u ** 2 + u ** 3
}

interface AnimHandle {
  cancel: () => void
}

export interface LabStage {
  containerRef: React.RefObject<HTMLDivElement | null>
  setMapRing: (points: [number, number][], scale?: number) => void
  ready: boolean
  /** id of the projection shown at morph t = 1 (the "current" map) */
  currentId: string
  orbitBy: (yaw: number, pitch: number) => void
  layers: StageLayerState
  toggleLayer: (layer: StageLayer) => void
  /** Bake + register a custom projection; returns its key. */
  bakeAndRegister: (
    key: string,
    fn: ProjectPointFn,
    frame: { halfWidth: number; halfHeight: number },
  ) => Promise<BakedProjection>
  /** Animated morph from the current map to `id`. */
  morphTo: (id: string, durationMs?: number) => Promise<void>
  /** Compare path: show mix(pairA → pairB) at t without animation. */
  setPair: (aId: string, bId: string, t: number) => Promise<void>
  /** Instant t on the current pair (compare scrubbing — no buffer re-upload). */
  setT: (t: number) => void
  /** Animated morph of the current pair to t (used to leave compare mode). */
  scrubTo: (t: number, durationMs?: number) => void
}

const LAST_KEY = 'efmc-lab-last-projection'

export function useMapStage(initialId?: string): LabStage {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<MapStage | null>(null)
  const animRef = useRef<AnimHandle | null>(null)
  const currentIdRef = useRef<string>('globe')
  const orbit = useRef({ yaw: 0, pitch: 0.05 })
  /** mirror of the stage's morph t (the hook drives every setMorph call) */
  const morphTRef = useRef(0)
  const [ready, setReady] = useState(false)
  const [currentId, setCurrentId] = useState('globe')
  const [layers, setLayers] = useState<StageLayerState>({
    geography: true,
    graticule: true,
    tissot: true,
    area: false,
    angle: false,
  })
  const { reducedMotion } = useReducedMotion()
  const reducedRef = useRef(reducedMotion)
  reducedRef.current = reducedMotion

  const cancelAnim = useCallback(() => {
    animRef.current?.cancel()
    animRef.current = null
  }, [])

  const animateMorph = useCallback((from: number, to: number, durationMs: number, done?: () => void) => {
    const stage = stageRef.current
    if (!stage) return
    cancelAnim()
    if (reducedRef.current || durationMs <= 0) {
      stage.setMorph(to)
      morphTRef.current = to
      done?.()
      return
    }
    let raf = 0
    let cancelled = false
    const t0 = performance.now()
    const step = (now: number) => {
      if (cancelled) return
      const p = Math.min(1, (now - t0) / durationMs)
      const t = from + (to - from) * easeMorph(p)
      stage.setMorph(t)
      morphTRef.current = t
      if (p < 1) raf = requestAnimationFrame(step)
      else done?.()
    }
    stage.setMorph(from)
    morphTRef.current = from
    raf = requestAnimationFrame(step)
    animRef.current = {
      cancel: () => {
        cancelled = true
        cancelAnimationFrame(raf)
      },
    }
  }, [cancelAnim])

  /* mount / dispose */
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const stage = new MapStage({ theme: 'atlas' })
    stageRef.current = stage
    stage.mount(container)
    let alive = true
    const last = (() => {
      try {
        return window.localStorage.getItem(LAST_KEY)
      } catch {
        return null
      }
    })()
    // only canonical ids survive a reload (custom bakes are session-only)
    const KNOWN = new Set(['mercator', 'gallPeters', 'equalEarth', 'authagraph', 'mollweide', 'orthographic'])
    const initial = initialId ?? (last && KNOWN.has(last) ? last : 'equalEarth')
    ;(async () => {
      await stage.setMorphTargets('globe', initial)
      if (!alive) return
      stage.setMorph(0)
      stage.setLayers({
        geography: true,
        graticule: true,
        tissot: true,
        area: false,
        angle: false,
      })
      stage.setAutoRotate(initial !== 'globe')
      // the globe greets, then morphs to the last-used / default projection
      animateMorph(0, 1, initial === 'globe' ? 0 : 1600, () => {
        stage.setAutoRotate(false)
        setReady(true)
      })
      currentIdRef.current = initial
      setCurrentId(initial)
    })()
    return () => {
      alive = false
      cancelAnim()
      stage.dispose()
      stageRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const bakeAndRegister = useCallback<LabStage['bakeAndRegister']>(async (key, fn, frame) => {
    const baked = await bakeCustomProjection(key, fn, frame, {
      // Match canonical MapStage buffers at every viewport width.
      tissotStepDeg: 30,
    })
    stageRef.current?.registerCustomProjection(key, baked)
    return baked
  }, [])

  const morphTo = useCallback<LabStage['morphTo']>(
    async (id, durationMs = 1600) => {
      const stage = stageRef.current
      if (!stage) return
      const from = currentIdRef.current
      orbit.current = { yaw: 0, pitch: 0.05 }
      if (from === id) {
        // A Python rerun or optimizer result may replace this registered key.
        await stage.setMorphTargets(id, id)
        stage.setMorph(1)
        return
      }
      await stage.setMorphTargets(from, id)
      stage.setMorph(0)
      await new Promise<void>((resolve) => {
        animateMorph(0, 1, durationMs, () => {
          currentIdRef.current = id
          setCurrentId(id)
          try {
            window.localStorage.setItem(LAST_KEY, id)
          } catch {
            /* ignore */
          }
          resolve()
        })
      })
    },
    [animateMorph],
  )

  const setPair = useCallback<LabStage['setPair']>(async (aId, bId, t) => {
    const stage = stageRef.current
    if (!stage) return
    cancelAnim()
    await stage.setMorphTargets(aId, bId)
    stage.setMorph(t)
    morphTRef.current = t
  }, [cancelAnim])

  const setT = useCallback((t: number) => {
    const stage = stageRef.current
    if (!stage) return
    cancelAnim()
    stage.setMorph(t)
    morphTRef.current = t
  }, [cancelAnim])

  const scrubTo = useCallback<LabStage['scrubTo']>(
    (t, durationMs = 300) => {
      const stage = stageRef.current
      if (!stage) return
      animateMorph(morphTRef.current, t, durationMs)
    },
    [animateMorph],
  )

  const toggleLayer = useCallback((layer: StageLayer) => {
    setLayers((prev) => {
      const next = { ...prev, [layer]: !prev[layer] }
      stageRef.current?.setLayers({ [layer]: next[layer] })
      return next
    })
  }, [])

  const orbitBy = useCallback((yaw: number, pitch: number) => {
    const stage = stageRef.current
    const container = containerRef.current
    if (!stage || !container || currentIdRef.current !== 'globe') return
    const o = orbit.current
    o.yaw += yaw
    o.pitch = Math.max(-1.35, Math.min(1.35, o.pitch + pitch))
    const aspect = container.clientWidth / Math.max(1, container.clientHeight)
    const d = 1.18 / Math.sin(16 * Math.PI / 180) / Math.min(1, aspect)
    stage.setAutoRotate(false)
    stage.setCameraState({position: [d * Math.sin(o.yaw) * Math.cos(o.pitch), d * Math.sin(o.pitch), d * Math.cos(o.yaw) * Math.cos(o.pitch)], target: [0, 0, 0], fov: 32})
  }, [])

  const setMapRing = useCallback((points: [number, number][], scale = 1) => {
    stageRef.current?.setMapRing(points, scale)
  }, [])

  return {
    setMapRing,
    containerRef,
    ready,
    currentId,
    orbitBy,
    layers,
    toggleLayer,
    bakeAndRegister,
    morphTo,
    setPair,
    setT,
    scrubTo,
  }
}
