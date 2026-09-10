import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { MapStage } from '@/three/MapStage'
import type { MapQuality } from '@/projection/assets'
import type { BakedProjection } from '@/projection/types'
import type { StageLayerState } from './StageToggle'
import { recordPhase } from '@/utils/diagnostics'

export interface MapViewHandle {
  showResult: (
    data: BakedProjection,
    ring: [number, number][],
    scale: number,
    signal: AbortSignal,
  ) => Promise<void>
  resetView: () => void
  zoom: (factor: number) => void
  testContextLoss: () => void
}
type Props = {
  preset: string
  quality: MapQuality
  theme: 'paper' | 'atlas'
  layers: StageLayerState
  labels: boolean
  exploring: boolean
  reducedMotion: boolean
  retry: number
  onReady: (ready: boolean) => void
  onChanging: (changing: boolean) => void
  onError: (message: string) => void
}
const MapView = forwardRef<MapViewHandle, Props>(function MapView(props, ref) {
  const host = useRef<HTMLDivElement>(null)
  const engine = useRef<MapStage | null>(null)
  const current = useRef(props.preset)
  const callbacks = useRef(props)
  callbacks.current = props
  const transition = useRef(0),
    animation = useRef<(() => void) | null>(null)
  const drag = useRef<{ id: number; x: number; y: number } | null>(null)
  const orbit = useRef({ yaw: 0, pitch: 0.05, zoom: 1 })
  const displayedRing = useRef<{ points: [number, number][]; scale: number }>({
    points: [],
    scale: 1,
  })
  const [mounted, setMounted] = useState(0)

  async function morph(id: string, signal?: AbortSignal) {
    const stage = engine.current
    if (!stage) throw new Error('The interactive map is still preparing. Please retry shortly.')
    const request = ++transition.current
    animation.current?.()
    const start = performance.now()
    callbacks.current.onChanging(true)
    try {
      await stage.setMorphTargets(current.current, id)
      if (request !== transition.current) throw new DOMException('Run stopped', 'AbortError')
      stage.setMorph(0)
      if (signal?.aborted) throw new DOMException('Run stopped', 'AbortError')
      const duration = callbacks.current.reducedMotion || current.current === id ? 0 : 850
      stage.setMapRing([])
      await new Promise<void>((resolve) => {
        let frame = 0
        const finish = () => {
          cancelAnimationFrame(frame)
          resolve()
        }
        animation.current = finish
        const t0 = performance.now()
        const step = (now: number) => {
          if (request !== transition.current || signal?.aborted) {
            if (signal?.aborted && request === transition.current) {
              stage.setMorph(0)
              stage.setMapRing(displayedRing.current.points, displayedRing.current.scale)
            }
            finish()
            return
          }
          const t = duration ? Math.min(1, (now - t0) / duration) : 1
          stage.setMorph(t * t * (3 - 2 * t))
          if (t < 1) frame = requestAnimationFrame(step)
          else {
            current.current = id
            finish()
          }
        }
        step(t0)
      })
      if (signal?.aborted || request !== transition.current)
        throw new DOMException('Run stopped', 'AbortError')
      displayedRing.current = { points: [], scale: 1 }
      recordPhase('map-transition', performance.now() - start)
    } finally {
      if (request === transition.current) callbacks.current.onChanging(false)
    }
  }

  function resetView() {
    orbit.current = { yaw: 0, pitch: 0.05, zoom: 1 }
    engine.current?.resetCamera()
  }
  useImperativeHandle(ref, () => ({
    async showResult(data, ring, scale, signal) {
      if (signal.aborted) throw new DOMException('Run stopped', 'AbortError')
      engine.current?.registerCustomProjection(data.id, data)
      await morph(data.id, signal)
      engine.current?.setMapRing(ring, scale)
      displayedRing.current = { points: ring, scale }
    },
    resetView,
    testContextLoss: () => engine.current?.testContextLoss(),
    zoom: (factor) => move(0, 0, factor),
  }))

  useEffect(() => {
    const container = host.current
    if (!container) return
    let stage: MapStage | null = null,
      alive = true
    const start = performance.now()
    callbacks.current.onReady(false)
    callbacks.current.onChanging(false)
    try {
      stage = new MapStage({ quality: props.quality, theme: callbacks.current.theme })
      engine.current = stage
      stage.onContextLost = () => {
        callbacks.current.onReady(false)
        callbacks.current.onError(
          'The map lost its graphics connection. Your code is safe. Retry to restore it.',
        )
      }
      stage.mount(container)
      stage.setLayers(callbacks.current.layers)
      stage.setLabels(callbacks.current.labels)
      const initial = callbacks.current.preset
      current.current = initial
      displayedRing.current = { points: [], scale: 1 }
      void stage
        .setMorphTargets(initial, initial)
        .then(() => {
          if (!alive || !stage) return
          stage.setMorph(1)
          stage.resetCamera()
          // The editor may already have hidden the canvas. Execution needs
          // prepared buffers, not a first visible frame, to become available.
          callbacks.current.onReady(true)
          let shown = false
          stage.onFrame = () => {
            if (!shown && alive) {
              shown = true
              recordPhase('interactive-map', performance.now() - start)
              recordPhase('map-frame-since-navigation', performance.now())
            }
          }
          setMounted((value) => value + 1)
        })
        .catch((error) => {
          if (alive) callbacks.current.onError(error.message)
        })
    } catch (error) {
      callbacks.current.onError(
        error instanceof Error
          ? error.message
          : 'Interactive graphics are unavailable. The preview is still readable.',
      )
    }
    return () => {
      alive = false
      // This is a job counter, not a DOM ref; invalidate every pending result.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      transition.current++
      animation.current?.()
      stage?.dispose()
      engine.current = null
    }
  }, [props.quality, props.retry])

  useEffect(() => {
    if (!mounted) return
    void morph(props.preset).catch((error) => {
      if (error.name !== 'AbortError') callbacks.current.onError(error.message)
    })
    // The generation guard owns overlapping selections.
  }, [props.preset, mounted])
  useEffect(() => {
    engine.current?.setTheme(props.theme)
  }, [props.theme])
  useEffect(() => {
    engine.current?.setLayers(props.layers)
  }, [props.layers])
  useEffect(() => {
    engine.current?.setLabels(props.labels)
  }, [props.labels])

  function move(yaw: number, pitch: number, zoom = 1) {
    if (!host.current || props.preset !== 'globe') return
    const o = orbit.current
    o.yaw += yaw
    o.pitch = Math.max(-1.3, Math.min(1.3, o.pitch + pitch))
    o.zoom = Math.max(0.8, Math.min(1.6, o.zoom * zoom))
    const aspect = host.current.clientWidth / Math.max(1, host.current.clientHeight)
    const distance = 1.12 / Math.sin((16 * Math.PI) / 180) / Math.min(1, aspect) / o.zoom
    engine.current?.setCameraState({
      position: [
        distance * Math.sin(o.yaw) * Math.cos(o.pitch),
        distance * Math.sin(o.pitch),
        distance * Math.cos(o.yaw) * Math.cos(o.pitch),
      ],
      target: [0, 0, 0],
      fov: 32,
    })
  }
  return (
    <div
      ref={host}
      data-projection={current.current}
      data-quality={props.quality}
      className={`map-engine ${props.exploring ? 'is-exploring' : ''}`}
      tabIndex={props.exploring ? 0 : -1}
      role="region"
      aria-label={
        props.exploring
          ? 'Explore globe. Drag to rotate, arrow keys to turn, plus or minus to zoom, Escape to release focus.'
          : 'World map visualization'
      }
      onPointerDown={(e) => {
        if (!props.exploring || e.button !== 0) return
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d || !props.exploring) return
        move((d.x - e.clientX) * 0.006, (e.clientY - d.y) * 0.006)
        d.x = e.clientX
        d.y = e.clientY
      }}
      onPointerUp={() => {
        drag.current = null
      }}
      onPointerCancel={() => {
        drag.current = null
      }}
      onLostPointerCapture={() => {
        drag.current = null
      }}
      onKeyDown={(e) => {
        if (!props.exploring) return
        const directions: Record<string, [number, number]> = {
          ArrowLeft: [-0.15, 0],
          ArrowRight: [0.15, 0],
          ArrowUp: [0, 0.15],
          ArrowDown: [0, -0.15],
        }
        if (directions[e.key]) {
          e.preventDefault()
          move(...directions[e.key])
        }
        if (['+', '-', '='].includes(e.key)) {
          e.preventDefault()
          move(0, 0, e.key === '-' ? 0.9 : 1.1)
        }
        if (e.key === 'Escape') e.currentTarget.blur()
      }}
    />
  )
})
export default MapView
