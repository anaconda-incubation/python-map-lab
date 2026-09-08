/**
 * stageUtilsB.ts — shared machinery for essay-b chapters (04–06).
 *
 * - Lazy stage lifecycle: MapStage / AuthaGraphSequence instances are created
 *   only when their container is ~150% of the viewport away from view, and
 *   disposed once they are ~250% beyond it (design: ≤2 WebGL stages alive).
 * - Step observer: narrative blocks carry data-step attributes; a block is
 *   "active" when it crosses the middle band of the viewport (55% threshold,
 *   implemented as rootMargin -45% top/bottom).
 * - bindScrub: GSAP ScrollTrigger scroll-scrubbed progress binding (Lenis is
 *   already wired to ScrollTrigger in Layout).
 * - tweenValue: tiny rAF tween used on the reduced-motion path (400ms
 *   crossfades between discrete states instead of scrubbing).
 */
import { useEffect, useRef, useState, type RefObject } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { MapStage, type StageTheme } from '@/three/MapStage'
import { AuthaGraphSequence } from '@/three/AuthaGraphSequence'

gsap.registerPlugin(ScrollTrigger)

/* ---------------- generic lazy-mount lifecycle ---------------- */

function useLazyMount(
  create: (el: HTMLElement) => { dispose: () => void },
  deps: unknown[],
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [alive, setAlive] = useState(false)
  const createRef = useRef(create)
  useEffect(() => {
    createRef.current = create
  })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let instance: { dispose: () => void } | null = null
    let gone = false
    const mount = () => {
      if (instance || gone) return
      instance = createRef.current(el)
      setAlive(true)
    }
    const unmount = () => {
      instance?.dispose()
      instance = null
      setAlive(false)
    }
    const ioMount = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) mount()
      },
      { rootMargin: '150% 0px 150% 0px' },
    )
    const ioDispose = new IntersectionObserver(
      (entries) => {
        if (entries.every((e) => !e.isIntersecting)) unmount()
      },
      { rootMargin: '250% 0px 250% 0px' },
    )
    ioMount.observe(el)
    ioDispose.observe(el)
    return () => {
      gone = true
      ioMount.disconnect()
      ioDispose.disconnect()
      unmount()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { containerRef, alive }
}

/** Lazy MapStage. `onReady` runs after every (re)mount — re-apply state there. */
export function useChapterStage(
  theme: StageTheme,
  onReady?: (stage: MapStage) => void,
): {
  containerRef: RefObject<HTMLDivElement | null>
  stageRef: RefObject<MapStage | null>
  alive: boolean
} {
  const stageRef = useRef<MapStage | null>(null)
  const readyRef = useRef(onReady)
  useEffect(() => {
    readyRef.current = onReady
  })
  const { containerRef, alive } = useLazyMount(
    (el) => {
      const stage = new MapStage({ theme })
      stageRef.current = stage
      stage.mount(el)
      readyRef.current?.(stage)
      return {
        dispose: () => {
          stage.dispose()
          if (stageRef.current === stage) stageRef.current = null
        },
      }
    },
    [theme],
  )
  return { containerRef, stageRef, alive }
}

/** Lazy AuthaGraphSequence (async buffer build after mount). */
export function useAuthaGraphStage(theme: StageTheme): {
  containerRef: RefObject<HTMLDivElement | null>
  seqRef: RefObject<AuthaGraphSequence | null>
  alive: boolean
} {
  const seqRef = useRef<AuthaGraphSequence | null>(null)
  const { containerRef, alive } = useLazyMount(
    (el) => {
      const seq = new AuthaGraphSequence({ theme })
      seqRef.current = seq
      seq.mount(el)
      void seq.init()
      return {
        dispose: () => {
          seq.dispose()
          if (seqRef.current === seq) seqRef.current = null
        },
      }
    },
    [theme],
  )
  return { containerRef, seqRef, alive }
}

/* ---------------- steps ---------------- */

/**
 * Observe [data-step] blocks under rootRef; fires when a block crosses the
 * middle 10% band of the viewport (the 55% activation threshold).
 */
export function useStepObserver(
  rootRef: RefObject<HTMLElement | null>,
  onStep: (step: number) => void,
): void {
  const cbRef = useRef(onStep)
  useEffect(() => {
    cbRef.current = onStep
  })
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const els = Array.from(root.querySelectorAll<HTMLElement>('[data-step]'))
    if (els.length === 0) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            cbRef.current(Number(e.target.getAttribute('data-step') ?? 0))
          }
        }
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    )
    for (const el of els) io.observe(el)
    return () => io.disconnect()
  }, [rootRef])
}

/* ---------------- scroll scrubbing ---------------- */

/**
 * Scroll-scrubbed progress (0..1) across a trigger element. Returns a cleanup.
 * Lenis already proxies scroll to ScrollTrigger in Layout.
 */
export function bindScrub(opts: {
  trigger: HTMLElement
  start?: string
  end?: string
  onProgress: (progress: number) => void
}): () => void {
  const st = ScrollTrigger.create({
    trigger: opts.trigger,
    start: opts.start ?? 'top 80%',
    end: opts.end ?? 'bottom 30%',
    onUpdate: (self) => opts.onProgress(self.progress),
    onRefresh: (self) => opts.onProgress(self.progress),
  })
  return () => st.kill()
}

/* ---------------- reduced-motion tween ---------------- */

const easeSmooth = (t: number): number => t * t * (3 - 2 * t)

/** rAF tween from→to over durMs; returns a cancel function. */
export function tweenValue(
  from: number,
  to: number,
  durMs: number,
  apply: (value: number) => void,
): () => void {
  if (from === to || durMs <= 0) {
    apply(to)
    return () => {}
  }
  const t0 = performance.now()
  let raf = 0
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / durMs)
    apply(from + (to - from) * easeSmooth(p))
    if (p < 1) raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
  return () => cancelAnimationFrame(raf)
}

/* ---------------- misc ---------------- */

/** Track an element's pixel size (for HTML overlays aligned to the camera). */
export function useElementSize(ref: RefObject<HTMLElement | null>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [ref])
  return size
}

/**
 * Vertical placement (fraction of container height) of a flat-map y coordinate
 * under MapStage's flat camera (fov 12°, fit with 8% padding — mirrors
 * MapStage.flatCamera). Used to align HTML overlays with the baked map.
 */
export function flatCamFracY(
  yNorm: number,
  halfW: number,
  halfH: number,
  containerW: number,
  containerH: number,
): number {
  if (containerW <= 0 || containerH <= 0) return 0.5
  const tanHalf = Math.tan((6 * Math.PI) / 180) // fov 12° / 2
  const aspect = containerW / containerH
  const d = Math.max(halfH / tanHalf, halfW / (tanHalf * aspect)) * 1.08 + 1
  const ndcY = yNorm / (d * tanHalf)
  return 0.5 - ndcY / 2
}

/** Same, for the horizontal placement of a flat-map x coordinate. */
export function flatCamFracX(
  xNorm: number,
  halfW: number,
  halfH: number,
  containerW: number,
  containerH: number,
): number {
  if (containerW <= 0 || containerH <= 0) return 0.5
  const tanHalf = Math.tan((6 * Math.PI) / 180)
  const aspect = containerW / containerH
  const d = Math.max(halfH / tanHalf, halfW / (tanHalf * aspect)) * 1.08 + 1
  const ndcX = xNorm / (d * tanHalf * aspect)
  return 0.5 + ndcX / 2
}
