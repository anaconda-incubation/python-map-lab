import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { MorphStage } from '@/chapters/finale-stage'
import { setTheme } from '@/hooks/useTheme'
import { useReducedMotion } from '@/hooks/useReducedMotion'

gsap.registerPlugin(ScrollTrigger)

/**
 * CHAPTER 12 · THE DECISION — September 4, 2026 (home.md §12). Atlas-dark
 * full-viewport takeover, pinned ~260vh, scroll-scrubbed:
 *   p 0–0.25  the vote: numerals count up with scroll (164 / 1 / 6)
 *   p 0.25–0.35  precision card (non-binding; Mercator is not banned)
 *   p 0.35–0.75  Mercator → Equal Earth morph; area overlay pulses once
 *   p 0.75–1.0  "A projection cannot avoid making choices…"
 * Reduced motion: stacked layout, numerals static, 400ms crossfade morph.
 */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

const VOTE_CAPTION =
  'UN General Assembly, non-binding resolution. African-led, with Togo in a leading role. It encourages — it does not require — equal-area projections such as Equal Earth for general-reference world maps.'

const PRECISION_CARD =
  'Mercator is not banned, not criticized by name, not going anywhere. It is not mathematically defective: it was designed for navigation, and at that job it remains exceptional. The resolution’s question is narrower — Mercator dramatically enlarges high-latitude regions next to equatorial ones, so what should a general map of the world optimize for?'

function VoteNumerals({
  forRef,
  againstRef,
  abstainRef,
  staticValues,
}: {
  forRef?: RefObject<HTMLSpanElement | null>
  againstRef?: RefObject<HTMLSpanElement | null>
  abstainRef?: RefObject<HTMLSpanElement | null>
  staticValues?: boolean
}) {
  return (
    <div className="flex flex-wrap items-end justify-center gap-x-12 gap-y-8 sm:gap-x-16">
      <div className="flex items-baseline gap-3">
        <span
          ref={forRef}
          className="data-numeral"
          style={{ fontSize: 'clamp(4rem, 11vw, 9rem)', color: 'var(--atlas-ink)' }}
        >
          {staticValues ? '164' : '0'}
        </span>
        <span className="font-ui text-kicker uppercase" style={{ color: 'var(--gold)' }}>
          For
        </span>
      </div>
      <div className="flex items-baseline gap-3">
        <span
          ref={againstRef}
          className="data-numeral"
          style={{ fontSize: 'clamp(2.5rem, 6vw, 4rem)', color: 'var(--atlas-ink-2)' }}
        >
          {staticValues ? '1' : '0'}
        </span>
        <span className="font-ui text-kicker uppercase" style={{ color: 'var(--atlas-ink-2)' }}>
          Against
        </span>
      </div>
      <div className="flex items-baseline gap-3">
        <span
          ref={abstainRef}
          className="data-numeral"
          style={{ fontSize: 'clamp(2.5rem, 6vw, 4rem)', color: 'var(--atlas-ink-2)' }}
        >
          {staticValues ? '6' : '0'}
        </span>
        <span className="font-ui text-kicker uppercase" style={{ color: 'var(--atlas-ink-2)' }}>
          Abstentions
        </span>
      </div>
    </div>
  )
}

function ChapterHeader() {
  return (
    <div className="text-center">
      <p className="kicker" style={{ color: 'var(--gold)' }}>
        CHAPTER 12 · THE DECISION
      </p>
      <h2
        id="ch-12-title"
        className="display-tight mt-5 font-display text-chapter"
        style={{ color: 'var(--atlas-ink)', fontWeight: 400 }}
      >
        September 4, 2026.
      </h2>
    </div>
  )
}

function Conclusion() {
  return (
    <div className="text-center">
      <p
        className="font-display"
        style={{
          color: 'var(--atlas-ink)',
          fontWeight: 400,
          fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
          lineHeight: 1.2,
        }}
      >
        A projection cannot avoid making choices.
      </p>
      <div className="mx-auto mt-6 h-[2px] w-24" style={{ background: 'var(--accent)' }} aria-hidden />
      <p
        className="mt-6 font-display italic"
        style={{
          color: 'var(--atlas-ink)',
          fontWeight: 340,
          fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
          lineHeight: 1.2,
        }}
      >
        But we can choose consciously.
      </p>
    </div>
  )
}

export default function Ch12UnitedNations() {
  const { reducedMotion } = useReducedMotion()
  const sectionRef = useRef<HTMLElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  const stageHostRef = useRef<HTMLDivElement>(null)
  const voteRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const morphNoteRef = useRef<HTMLParagraphElement>(null)
  const conclusionRef = useRef<HTMLDivElement>(null)
  const forRef = useRef<HTMLSpanElement>(null)
  const againstRef = useRef<HTMLSpanElement>(null)
  const abstainRef = useRef<HTMLSpanElement>(null)
  const stageRef = useRef<MorphStage | null>(null)
  const lastProgress = useRef(0)
  const [stateLabel, setStateLabel] = useState(
    'Map stage: the world in the Mercator projection.',
  )
  const [stageFailed, setStageFailed] = useState(false)

  /* Scroll-scrubbed application — direct DOM writes, no React re-render. */
  const apply = useCallback((p: number) => {
    lastProgress.current = p
    const forV = Math.round(164 * clamp01((p - 0.03) / 0.15))
    const agV = Math.round(clamp01((p - 0.1) / 0.08))
    const abV = Math.round(6 * clamp01((p - 0.13) / 0.1))
    if (forRef.current) forRef.current.textContent = String(forV)
    if (againstRef.current) againstRef.current.textContent = String(agV)
    if (abstainRef.current) abstainRef.current.textContent = String(abV)

    const voteOp = p < 0.22 ? 1 : 1 - clamp01((p - 0.22) / 0.05)
    const cardOp = clamp01((p - 0.26) / 0.04) * (1 - clamp01((p - 0.34) / 0.04))
    const mapOp = clamp01((p - 0.36) / 0.05)
    const noteOp = clamp01((p - 0.42) / 0.04) * (1 - clamp01((p - 0.72) / 0.04))
    const conclOp = clamp01((p - 0.79) / 0.07)
    const setLayer = (el: HTMLElement | null, op: number) => {
      if (!el) return
      el.style.opacity = op.toFixed(3)
      el.style.visibility = op <= 0.001 ? 'hidden' : 'visible'
    }
    setLayer(voteRef.current, voteOp)
    setLayer(cardRef.current, cardOp)
    setLayer(conclusionRef.current, conclOp)
    if (morphNoteRef.current) morphNoteRef.current.style.opacity = noteOp.toFixed(3)
    if (conclusionRef.current) {
      conclusionRef.current.style.transform = `translateY(${((1 - conclOp) * 24).toFixed(1)}px)`
    }
    const host = stageHostRef.current
    if (host) host.style.opacity = mapOp.toFixed(3)

    const stage = stageRef.current
    if (stage) {
      stage.setProgress(clamp01((p - 0.4) / 0.3))
      const bump = (center: number, width: number) =>
        Math.max(0, 1 - Math.abs(p - center) / width)
      stage.setOverlay(Math.min(1, bump(0.44, 0.05) + bump(0.7, 0.05)))
      stage.setTissotOpacity(
        p < 0.36 ? 0 : p < 0.42 ? (p - 0.36) / 0.06 : p < 0.72 ? 1 : 1 - clamp01((p - 0.72) / 0.06),
      )
    }
  }, [])

  /* Stage lifecycle: create at 150% viewport proximity, dispose beyond 250%. */
  useEffect(() => {
    const host = stageHostRef.current
    if (!host || stageFailed) return
    let stage: MorphStage | null = null
    let cancelled = false
    const create = () => {
      if (stage) return
      const s = new MorphStage({
        container: host,
        theme: 'atlas',
        from: 'mercator',
        to: 'equalearth',
        tissot: true,
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
    const ioCreate = new IntersectionObserver(
      ([e]) => e.isIntersecting && create(),
      { rootMargin: '150%' },
    )
    const ioDestroy = new IntersectionObserver(
      ([e]) => !e.isIntersecting && destroy(),
      { rootMargin: '250%' },
    )
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
        // Discrete states: 400ms crossfade between Mercator and Equal Earth.
        ScrollTrigger.create({
          trigger: section,
          start: 'top 60%',
          end: 'bottom 40%',
          onToggle: (self) => setTheme(self.isActive ? 'atlas' : 'paper'),
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
              onUpdate: () => s.setProgress(proxy.t),
            })
          },
        })
      } else {
        apply(0)
        ScrollTrigger.create({
          trigger: pinRef.current,
          start: 'top top',
          end: '+=260%',
          pin: true,
          anticipatePin: 1,
          onUpdate: (self) => apply(self.progress),
          onEnter: () => setTheme('atlas'),
          onEnterBack: () => setTheme('atlas'),
          onLeave: () => setTheme('paper'),
          onLeaveBack: () => setTheme('paper'),
        })
      }
    }, section)
    return () => ctx.revert()
  }, [reducedMotion, apply])

  const stageFallback = (
    <div
      className="flex h-full items-center justify-center px-6"
      style={{ border: '1px solid var(--atlas-hair)' }}
    >
      <p className="max-w-measure text-center font-body text-body-sm" style={{ color: 'var(--atlas-ink-2)' }}>
        (The interactive stage needs WebGL. In words: on Mercator, Greenland rivals Africa;
        on Equal Earth, Africa is fourteen Greenlands — and every region keeps its true
        relative size.)
      </p>
    </div>
  )

  if (reducedMotion) {
    /* Stacked static layout — same content, discrete states, no pin. */
    return (
      <section
        id="ch-12"
        ref={sectionRef}
        aria-labelledby="ch-12-title"
        className="scroll-mt-20"
        style={{ background: 'var(--atlas)' }}
      >
        <span className="sr-only" role="status">
          {stateLabel}
        </span>
        <div className="mx-auto flex max-w-container flex-col gap-20 px-[var(--gutter)] py-24">
          <div className="flex flex-col items-center gap-10">
            <ChapterHeader />
            <VoteNumerals staticValues />
            <p className="max-w-measure text-center font-body text-body-sm" style={{ color: 'var(--atlas-ink-2)' }}>
              {VOTE_CAPTION}
            </p>
          </div>
          <div
            className="mx-auto max-w-measure px-6 py-6"
            style={{ border: '1px solid var(--gold)', background: 'var(--atlas-2)' }}
          >
            <p className="font-body text-body-sm" style={{ color: 'var(--atlas-ink)' }}>
              {PRECISION_CARD}
            </p>
          </div>
          <div
            ref={stageHostRef}
            role="img"
            aria-label={stateLabel}
            className="relative w-full"
            style={{ height: '70vh' }}
          >
            {stageFailed && stageFallback}
          </div>
          <Conclusion />
        </div>
      </section>
    )
  }

  return (
    <section
      id="ch-12"
      ref={sectionRef}
      aria-labelledby="ch-12-title"
      className="scroll-mt-20"
      style={{ background: 'var(--atlas)' }}
    >
      <span className="sr-only" role="status">
        {stateLabel}
      </span>
      <div ref={pinRef} className="relative overflow-hidden" style={{ height: '100dvh' }}>
        {/* stage */}
        <div
          ref={stageHostRef}
          role="img"
          aria-label={stateLabel}
          className="absolute inset-0"
          style={{ opacity: 0 }}
        >
          {stageFailed && stageFallback}
        </div>

        {/* p 0–0.25 — the vote */}
        <div
          ref={voteRef}
          data-step="vote"
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-10 px-[var(--gutter)]"
        >
          <ChapterHeader />
          <VoteNumerals forRef={forRef} againstRef={againstRef} abstainRef={abstainRef} />
          <p
            className="max-w-measure text-center font-body text-body-sm"
            style={{ color: 'var(--atlas-ink-2)' }}
          >
            {VOTE_CAPTION}
          </p>
        </div>

        {/* p 0.25–0.35 — precision card */}
        <div
          ref={cardRef}
          data-step="precision"
          className="pointer-events-none absolute inset-0 flex items-center justify-center px-[var(--gutter)]"
          style={{ opacity: 0, visibility: 'hidden' }}
        >
          <div
            className="max-w-measure px-6 py-6 sm:px-10 sm:py-8"
            style={{ border: '1px solid var(--gold)', background: 'var(--atlas-2)' }}
          >
            <p className="kicker mb-4" style={{ color: 'var(--gold)' }}>
              WHAT THE RESOLUTION IS — AND IS NOT
            </p>
            <p className="font-body text-body-sm" style={{ color: 'var(--atlas-ink)' }}>
              {PRECISION_CARD}
            </p>
          </div>
        </div>

        {/* morph annotation */}
        <p
          ref={morphNoteRef}
          data-step="morph"
          className="pointer-events-none absolute inset-x-0 bottom-8 px-[var(--gutter)] text-center font-ui text-caption"
          style={{ color: 'var(--atlas-ink-2)', opacity: 0 }}
        >
          Mercator inflates the high latitudes next to the equatorial regions. As the morph
          settles into Equal Earth, relative areas become true — Greenland deflates; Africa
          takes its real size.
        </p>

        {/* p 0.75–1.0 — the conclusion */}
        <div
          ref={conclusionRef}
          data-step="conclusion"
          className="pointer-events-none absolute inset-0 flex items-center justify-center px-[var(--gutter)]"
          style={{ opacity: 0, visibility: 'hidden' }}
        >
          <div
            className="px-8 py-10"
            style={{
              background:
                'radial-gradient(ellipse at center, var(--atlas) 38%, transparent 72%)',
            }}
          >
            <Conclusion />
          </div>
        </div>
      </div>
    </section>
  )
}
