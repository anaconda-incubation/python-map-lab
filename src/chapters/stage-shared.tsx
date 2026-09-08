/**
 * Shared chapter-stage machinery for chapters 00–03 (design.md §5–§7, §10).
 *
 * - useChapterStage: lazy MapStage lifecycle — create via IntersectionObserver
 *   at ~150% viewport range, dispose beyond ~250%. Never mounts eagerly.
 * - useScrollSteps: data-step blocks fire at a 55% viewport threshold.
 * - Reveal: block-level fade/rise 24px at 85% viewport, once (§6).
 * - StageShell: accessible stage container (role="img", live aria-label,
 *   visually-hidden map-state mirror).
 */
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { MapStage, type StageTheme } from '@/three/MapStage'

export interface ChapterStage {
  /** Ref for the element the canvas mounts into (must be sized + relative). */
  containerRef: RefObject<HTMLDivElement | null>
  /** Live MapStage instance (null until lazily mounted). */
  stageRef: RefObject<MapStage | null>
  /** Increments each time a stage is (re)mounted — use as an effect dep. */
  generation: number
}

// Public helper intentionally colocated with its provider or teaching component.
// eslint-disable-next-line react-refresh/only-export-components
export function useChapterStage(theme: StageTheme): ChapterStage {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<MapStage | null>(null)
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const create = () => {
      if (stageRef.current) return
      const stage = new MapStage({ theme })
      stage.mount(el)
      stageRef.current = stage
      setGeneration((n) => n + 1)
    }
    const destroy = () => {
      if (!stageRef.current) return
      stageRef.current.dispose()
      stageRef.current = null
    }

    const near = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) create()
      },
      { rootMargin: '150% 0px 150% 0px' },
    )
    const far = new IntersectionObserver(
      (entries) => {
        if (entries.every((e) => !e.isIntersecting)) destroy()
      },
      { rootMargin: '250% 0px 250% 0px' },
    )
    near.observe(el)
    far.observe(el)
    return () => {
      near.disconnect()
      far.disconnect()
      destroy()
    }
  }, [theme])

  return { containerRef, stageRef, generation }
}

/**
 * Observe `[data-step]` narrative blocks inside `rootRef`; when one crosses
 * the 55% viewport line, fire onStep with its data-step value (design.md §6).
 */
// Public helper intentionally colocated with its provider or teaching component.
// eslint-disable-next-line react-refresh/only-export-components
export function useScrollSteps(
  rootRef: RefObject<HTMLElement | null>,
  onStep: (step: string) => void,
): void {
  const cbRef = useRef(onStep)
  useEffect(() => { cbRef.current = onStep }, [onStep])
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const blocks = Array.from(root.querySelectorAll<HTMLElement>('[data-step]'))
    if (blocks.length === 0) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const step = (e.target as HTMLElement).dataset.step
            if (step) cbRef.current(step)
          }
        }
      },
      // a thin band straddling the 55% line
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    )
    for (const b of blocks) io.observe(b)
    return () => io.disconnect()
  }, [rootRef])
}

/** Block-level reveal: fade + rise 24px at 85% viewport, once (§6). */
export function Reveal({
  children,
  className,
  delayMs = 0,
}: {
  children: ReactNode
  className?: string
  delayMs?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || shown) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true)
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -15% 0px', threshold: 0 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [shown])
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : 'translateY(24px)',
        transition: `opacity 800ms var(--ease-atlas) ${delayMs}ms, transform 800ms var(--ease-atlas) ${delayMs}ms`,
      }}
    >
      {children}
    </div>
  )
}

/**
 * Accessible wrapper for a stage canvas: role="img" + live aria-label and a
 * visually-hidden text mirror of the current map state (design.md §10).
 */
export function StageShell({
  containerRef,
  ariaLabel,
  stateText,
  className,
  children,
}: {
  containerRef: RefObject<HTMLDivElement | null>
  ariaLabel: string
  stateText: string
  className?: string
  children?: ReactNode
}) {
  // `relative` is only the default positioning context — if the caller
  // passes its own position utility (e.g. "absolute inset-0"), baking in
  // `relative` would silently win in the built CSS (`.relative` sorts after
  // `.absolute`), collapsing the stage to zero height.
  const hasPosition = /\b(?:static|fixed|absolute|relative|sticky)\b/.test(className ?? '')
  return (
    <div className={`${hasPosition ? '' : 'relative '}${className ?? ''}`}>
      <div
        ref={containerRef}
        role="img"
        aria-label={ariaLabel}
        className="absolute inset-0 overflow-hidden"
      />
      <p className="sr-only" aria-live="polite">
        {stateText}
      </p>
      {children}
    </div>
  )
}
