import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import ChapterKicker from '@/components/ChapterKicker'
import { MorphStage } from '@/chapters/finale-stage'
import { setTheme } from '@/hooks/useTheme'
import { useReducedMotion } from '@/hooks/useReducedMotion'

gsap.registerPlugin(ScrollTrigger)

/**
 * CHAPTER 13 · ENDING — "There is no perfect flat Earth." (home.md §13).
 * Paper finale, full-viewport pin ~200vh, scroll-scrubbed:
 *   p 0–0.6    the flat Equal Earth map folds back into the globe
 *   p 0.6+     naming labels return (five oceans, Gulf of Mexico, Lake Ontario)
 *   p 0.6–0.85 the last lines
 *   p 0.85–1   the doorway: DESIGN YOUR OWN PROJECTION → /lab
 * Reduced motion: stacked layout, 400ms crossfade between the two stills.
 */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

function FinalLines() {
  return (
    <div className="text-center">
      <p
        className="font-display"
        style={{
          color: 'var(--ink)',
          fontWeight: 400,
          fontSize: 'clamp(1.75rem, 4.2vw, 2.75rem)',
          lineHeight: 1.2,
        }}
      >
        There is no perfect flat Earth.
      </p>
      <div className="mx-auto mt-6 h-[2px] w-24" style={{ background: 'var(--accent)' }} aria-hidden />
      <p
        className="mt-6 font-display italic"
        style={{
          color: 'var(--ink)',
          fontWeight: 340,
          fontSize: 'clamp(1.75rem, 4.2vw, 2.75rem)',
          lineHeight: 1.2,
        }}
      >
        Only a projection suited to the question you&rsquo;re asking.
      </p>
    </div>
  )
}

function Doorway() {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <Link
        to="/lab"
        className="group font-display uppercase"
        style={{
          color: 'var(--accent)',
          fontWeight: 460,
          fontSize: 'clamp(1.25rem, 2.6vw, 1.75rem)',
          letterSpacing: '0.04em',
        }}
      >
        Design your own projection{' '}
        <span
          className="inline-block transition-transform duration-micro ease-atlas group-hover:translate-x-1.5"
          aria-hidden
        >
          →
        </span>
      </Link>
      <a
        href="#ch-00"
        className="font-ui text-kicker uppercase transition-colors duration-micro hover:text-accent"
        style={{ color: 'var(--fg-3)' }}
      >
        Replay the opening ↺
      </a>
    </div>
  )
}

export default function Ch13Ending() {
  const { reducedMotion } = useReducedMotion()
  const sectionRef = useRef<HTMLElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  const stageHostRef = useRef<HTMLDivElement>(null)
  const linesRef = useRef<HTMLDivElement>(null)
  const doorwayRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<MorphStage | null>(null)
  const lastProgress = useRef(0)
  const [stateLabel, setStateLabel] = useState(
    'Map stage: the world in the Equal Earth projection.',
  )
  const [stageFailed, setStageFailed] = useState(false)

  const apply = useCallback((p: number) => {
    lastProgress.current = p
    const linesOp = clamp01((p - 0.62) / 0.08)
    const doorOp = clamp01((p - 0.87) / 0.07)
    if (linesRef.current) {
      linesRef.current.style.opacity = linesOp.toFixed(3)
      linesRef.current.style.visibility = linesOp <= 0.001 ? 'hidden' : 'visible'
      linesRef.current.style.transform = `translateY(${((1 - linesOp) * 24).toFixed(1)}px)`
    }
    if (doorwayRef.current) {
      doorwayRef.current.style.opacity = doorOp.toFixed(3)
      doorwayRef.current.style.visibility = doorOp <= 0.001 ? 'hidden' : 'visible'
      doorwayRef.current.style.pointerEvents = doorOp > 0.5 ? 'auto' : 'none'
      doorwayRef.current.style.transform = `translateY(${((1 - doorOp) * 16).toFixed(1)}px)`
    }
    const stage = stageRef.current
    if (stage) {
      stage.setProgress(clamp01(p / 0.6))
      stage.setLabelVisibility(clamp01((p - 0.62) / 0.14))
    }
  }, [])

  /* Stage lifecycle: create at 150% proximity, dispose beyond 250%. */
  useEffect(() => {
    const host = stageHostRef.current
    if (!host || stageFailed) return
    let stage: MorphStage | null = null
    let cancelled = false
    const create = () => {
      if (stage) return
      const s = new MorphStage({
        container: host,
        theme: 'paper',
        from: 'equalearth',
        to: 'globe',
        labels: true,
        autorotate: true,
        onStateLabel: setStateLabel,
      })
      stage = s
      s.init()
        .then(() => {
          if (cancelled) {
            s.dispose()
            return
          }
          stageRef.current = s
          apply(lastProgress.current)
        })
        .catch(() => {
          if (!cancelled) setStageFailed(true)
        })
    }
    const destroy = () => {
      stage?.dispose()
      stage = null
      stageRef.current = null
    }
    const ioCreate = new IntersectionObserver(([e]) => e.isIntersecting && create(), {
      rootMargin: '150%',
    })
    const ioDestroy = new IntersectionObserver(([e]) => !e.isIntersecting && destroy(), {
      rootMargin: '250%',
    })
    ioCreate.observe(host)
    ioDestroy.observe(host)
    return () => {
      cancelled = true
      ioCreate.disconnect()
      ioDestroy.disconnect()
      destroy()
    }
  }, [apply, stageFailed, reducedMotion])

  /* Scroll orchestration */
  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    const ctx = gsap.context(() => {
      if (reducedMotion) {
        ScrollTrigger.create({
          trigger: section,
          start: 'top 60%',
          end: 'bottom 40%',
          onToggle: (self) => {
            if (self.isActive) setTheme('paper')
          },
        })
        ScrollTrigger.create({
          trigger: stageHostRef.current,
          start: 'top 55%',
          onEnter: () => {
            const s = stageRef.current
            if (!s) return
            const proxy = { t: 0 }
            gsap.to(proxy, {
              t: 1,
              duration: 0.4,
              ease: 'power1.inOut',
              onUpdate: () => {
                s.setProgress(proxy.t)
                s.setLabelVisibility(proxy.t)
              },
            })
          },
        })
      } else {
        apply(0)
        ScrollTrigger.create({
          trigger: pinRef.current,
          start: 'top top',
          end: '+=200%',
          pin: true,
          anticipatePin: 1,
          onUpdate: (self) => apply(self.progress),
          onEnter: () => setTheme('paper'),
          onEnterBack: () => setTheme('paper'),
        })
      }
    }, section)
    return () => ctx.revert()
  }, [reducedMotion, apply])

  const stageFallback = (
    <div
      className="flex h-full items-center justify-center px-6"
      style={{ border: '1px solid var(--hair)' }}
    >
      <p className="max-w-measure text-center font-body text-body-sm" style={{ color: 'var(--fg-2)' }}>
        (The interactive stage needs WebGL. In words: the flat map folds back along its
        meridians, the oceans close around it, and the Earth is a sphere again — the only
        map that never has to choose.)
      </p>
    </div>
  )

  const header = (
    <div className="mx-auto max-w-measure px-[var(--gutter)] pb-16 pt-24">
      <ChapterKicker
        kicker="EPILOGUE"
        title="There is no perfect flat Earth."
        titleId="ch-13-title"
        standfirst="The flat map has done its work. Let it go home."
        accent="vermilion"
      />
    </div>
  )

  if (reducedMotion) {
    return (
      <section id="ch-13" ref={sectionRef} aria-labelledby="ch-13-title" className="scroll-mt-20">
        <span className="sr-only" role="status">
          {stateLabel}
        </span>
        {header}
        <div className="mx-auto flex max-w-container flex-col gap-20 px-[var(--gutter)] pb-24">
          <div
            ref={stageHostRef}
            role="img"
            aria-label={stateLabel}
            className="relative w-full"
            style={{ height: '70vh' }}
          >
            {stageFailed && stageFallback}
          </div>
          <FinalLines />
          <Doorway />
        </div>
      </section>
    )
  }

  return (
    <section id="ch-13" ref={sectionRef} aria-labelledby="ch-13-title" className="scroll-mt-20">
      <span className="sr-only" role="status">
        {stateLabel}
      </span>
      {header}
      <div ref={pinRef} className="relative overflow-hidden" style={{ height: '100dvh' }}>
        {/* stage: Equal Earth → globe, labels return */}
        <div
          ref={stageHostRef}
          role="img"
          aria-label={stateLabel}
          className="absolute inset-0"
        >
          {stageFailed && stageFallback}
        </div>

        {/* p 0.6–0.85 — the last lines */}
        <div
          ref={linesRef}
          data-step="last-lines"
          className="pointer-events-none absolute inset-x-0 top-[16%] flex justify-center px-[var(--gutter)]"
          style={{ opacity: 0, visibility: 'hidden' }}
        >
          <div
            className="px-10 py-8"
            style={{
              background: 'radial-gradient(ellipse at center, var(--paper) 30%, transparent 70%)',
            }}
          >
            <FinalLines />
          </div>
        </div>

        {/* p 0.85–1 — the doorway */}
        <div
          ref={doorwayRef}
          data-step="doorway"
          className="absolute inset-x-0 bottom-[10%] flex justify-center px-[var(--gutter)]"
          style={{ opacity: 0, visibility: 'hidden', pointerEvents: 'none' }}
        >
          <div
            className="px-10 py-6"
            style={{
              background: 'radial-gradient(ellipse at center, var(--paper) 30%, transparent 72%)',
            }}
          >
            <Doorway />
          </div>
        </div>
      </div>
    </section>
  )
}
