import { useCallback, useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import ChapterKicker from '@/components/ChapterKicker'
import DataCallout from '@/components/DataCallout'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useChapterStage, useScrollSteps, Reveal, StageShell } from '@/chapters/stage-shared'
import type { LayerState } from '@/three/MapStage'

gsap.registerPlugin(ScrollTrigger)

/**
 * CHAPTER 01 · THE IMPOSSIBILITY (design.md §5: stage RIGHT, narrative LEFT).
 * Grid on a sphere → equal Tissot circles → a scroll-scrubbed peel into a flat
 * map → the proof you can watch: conformal (Mercator) vs equal-area
 * (Gall–Peters). No flat map preserves both.
 */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (t: number) => t * t * (3 - 2 * t)

type StepId = 'intro' | 'grid' | 'circles' | 'peel' | 'mercator-circles' | 'trade'

const STEP_TEXT: Record<StepId, string> = {
  intro: 'A slowly turning engraved globe of the Earth.',
  grid: 'The globe wearing its reference grid: meridians and parallels every ten degrees.',
  circles: 'Identical small circles drawn on the globe at many latitudes — all truly equal.',
  peel: 'The globe peeling open into a flat map; the farther from the equator, the more the grid stretches.',
  'mercator-circles':
    'The flattened Mercator map: the circles are still perfect circles, but northern ones are drawn far larger.',
  trade:
    'A Gall–Peters equal-area map: the circles are now ellipses, squashed near the equator — but every ellipse encloses the same area.',
}

export default function Ch01Impossibility() {
  const { reducedMotion } = useReducedMotion()
  const rootRef = useRef<HTMLElement | null>(null)
  const peelRef = useRef<HTMLDivElement | null>(null)
  const { containerRef, stageRef, generation } = useChapterStage('paper')
  const [stateText, setStateText] = useState(STEP_TEXT.intro)
  const morph = useRef({ t: 0 })
  const targets = useRef<'gm' | 'mg'>('gm') // globe→mercator or mercator→gallPeters

  /* ---- stage setup ---- */
  useEffect(() => {
    const stage = stageRef.current
    if (!stage || generation === 0) return
    let cancelled = false
    void stage.setMorphTargets('globe', 'mercator').then(() => {
      if (cancelled || stageRef.current !== stage) return
      targets.current = 'gm'
      stage.setMorph(morph.current.t)
      stage.setLayers({ geography: true, graticule: false, tissot: false })
      stage.setAutoRotate(!reducedMotion)
      stage.fitToProjection('globe')
    })
    return () => {
      cancelled = true
    }
  }, [generation, stageRef, reducedMotion])

  const tweenMorph = useCallback(
    (to: number, duration = 1.4) => {
      const stage = stageRef.current
      if (!stage) return
      gsap.to(morph.current, {
        t: to,
        duration: reducedMotion ? 0.4 : duration,
        ease: reducedMotion ? 'power2.inOut' : 'power3.inOut', // ease-morph family
        overwrite: true,
        onUpdate: () => stageRef.current?.setMorph(smooth(morph.current.t)),
      })
    },
    [stageRef, reducedMotion],
  )

  const setLayers = useCallback(
    (partial: Partial<LayerState>) => stageRef.current?.setLayers(partial),
    [stageRef],
  )

  /* ---- step wiring (55% viewport threshold) ---- */
  const onStep = useCallback(
    (step: string) => {
      const stage = stageRef.current
      const s = step as StepId
      if (STEP_TEXT[s]) setStateText(STEP_TEXT[s])
      if (!stage) return
      switch (s) {
        case 'intro':
          stage.setAutoRotate(!reducedMotion)
          setLayers({ graticule: false, tissot: false })
          if (targets.current !== 'gm') {
            targets.current = 'gm'
            void stage.setMorphTargets('globe', 'mercator')
          }
          tweenMorph(0)
          break
        case 'grid':
          stage.setAutoRotate(!reducedMotion)
          setLayers({ graticule: true, tissot: false })
          break
        case 'circles':
          setLayers({ graticule: true, tissot: true })
          break
        case 'peel':
          // morph is scroll-scrubbed by the peel block's ScrollTrigger;
          // under reduced motion it becomes one 400ms crossfade (§6).
          stage.setAutoRotate(false)
          if (targets.current !== 'gm') {
            targets.current = 'gm'
            void stage.setMorphTargets('globe', 'mercator')
          }
          if (reducedMotion) tweenMorph(1, 0.4)
          break
        case 'mercator-circles':
          stage.setAutoRotate(false)
          if (targets.current !== 'gm') {
            targets.current = 'gm'
            void stage.setMorphTargets('globe', 'mercator').then(() => tweenMorph(1, 0.8))
          } else {
            tweenMorph(1)
          }
          setLayers({ tissot: true, graticule: true })
          break
        case 'trade': {
          stage.setAutoRotate(false)
          const go = () => tweenMorph(1)
          if (targets.current !== 'mg') {
            targets.current = 'mg'
            void stage.setMorphTargets('mercator', 'gallPeters').then(() => {
              morph.current.t = 0
              stageRef.current?.setMorph(0)
              go()
            })
          } else {
            go()
          }
          setLayers({ tissot: true, graticule: true })
          break
        }
      }
    },
    [stageRef, reducedMotion, tweenMorph, setLayers],
  )
  useScrollSteps(rootRef, onStep)

  /* ---- the peel: scroll-scrubbed globe → Mercator (reader controls time) ---- */
  useEffect(() => {
    if (reducedMotion) return
    const block = peelRef.current
    if (!block) return
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: block,
        start: 'top 55%',
        end: 'bottom 45%',
        scrub: true,
        onUpdate: (self) => {
          if (targets.current !== 'gm') return
          morph.current.t = self.progress
          stageRef.current?.setMorph(smooth(clamp01(self.progress)))
        },
      })
    }, block)
    return () => ctx.revert()
  }, [reducedMotion, stageRef])

  return (
    <section
      ref={rootRef}
      id="ch-01"
      aria-labelledby="ch-01-title"
      className="relative mx-auto max-w-container scroll-mt-20 px-[var(--gutter)] pb-24 pt-16"
    >
      <div className="grid grid-cols-1 gap-y-6 lg:grid-cols-[minmax(0,42%)_minmax(0,1fr)] lg:gap-x-16">
        {/* Sticky stage — 55vh mini-stage on mobile, full height right column on desktop (§5) */}
        <div className="sticky top-[var(--nav-h)] z-10 order-first h-[55vh] lg:order-last lg:top-0 lg:h-[100dvh] lg:self-start">
          <StageShell
            containerRef={containerRef}
            ariaLabel={stateText}
            stateText={stateText}
            className="h-full"
          >
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
              style={{ background: 'var(--hair)' }}
              aria-hidden
            />
          </StageShell>
        </div>

        {/* Narrative column */}
        <div className="max-w-measure lg:pt-16">
          <div data-step="intro" className="flex min-h-[70vh] flex-col justify-center">
            <ChapterKicker
              numeral="01"
              kicker="THE IMPOSSIBILITY"
              title="You cannot have everything."
              titleId="ch-01-title"
              standfirst="A theorem, a grid, and a promise that cannot be kept: no flat map preserves both area and shape. Here is the proof you can watch."
              accent="vermilion"
            />
            <Reveal className="mt-10" delayMs={200}>
              <p className="font-body text-body" style={{ color: 'var(--fg)' }}>
                Start with a spherical model of Earth. Along its surface, relative areas and
                local shapes give us a reference for comparing flat maps. Greenland is about
                fourteen times smaller than Africa. The view on your screen still uses
                perspective, so features near the globe’s edge appear compressed.
              </p>
            </Reveal>
          </div>

          <div data-step="grid" className="flex min-h-[80vh] items-center">
            <Reveal>
              <h3 className="font-display text-subhead" style={{ color: 'var(--fg)', fontWeight: 460 }}>
                The reference grid
              </h3>
              <p className="mt-4 font-body text-body" style={{ color: 'var(--fg)' }}>
                Drape the globe in its coordinate net: meridians of longitude converging at the
                poles, parallels of latitude stacked like rings. Every point on Earth gets an
                address — (λ, φ), longitude and latitude. Watch the cells of that grid. Near the
                equator they are nearly square. Near the poles they taper to nothing, because the
                meridians meet.
              </p>
              <p className="mt-4 font-body text-body" style={{ color: 'var(--fg)' }}>
                A flat map is a function: (λ, φ) → (x, y). Whatever that function is, it must
                decide what happens to those tapering cells. That decision is the entire subject
                of this essay.
              </p>
            </Reveal>
          </div>

          <div data-step="circles" className="flex min-h-[80vh] items-center">
            <Reveal>
              <h3 className="font-display text-subhead" style={{ color: 'var(--fg)', fontWeight: 460 }}>
                Equal circles, honestly drawn
              </h3>
              <p className="mt-4 font-body text-body" style={{ color: 'var(--fg)' }}>
                Now stamp the globe with identical small circles — same radius, everywhere:
                equator, tundra, mid-ocean. On the sphere they are indistinguishable, because the
                sphere is the same everywhere. Cartographers call each one a{' '}
                <em>Tissot indicatrix</em>: a measuring instrument disguised as a circle. Project
                the globe onto a plane and each circle reports what the projection did to its
                neighborhood — stretched into an ellipse, inflated, or left alone.
              </p>
            </Reveal>
          </div>

          {/* Scroll-scrubbed peel */}
          <div ref={peelRef} data-step="peel" className="flex min-h-[220vh] items-center">
            <Reveal>
              <h3 className="font-display text-subhead" style={{ color: 'var(--fg)', fontWeight: 460 }}>
                Now flatten it. Slowly.
              </h3>
              <p className="mt-4 font-body text-body" style={{ color: 'var(--fg)' }}>
                Keep scrolling and watch the peel: the sphere opens along the antimeridian and
                unrolls into a rectangle — Mercator's rectangle. You control the speed, so watch
                the grid, not the continents. Continents are cargo; the grid is the machine. The
                horizontal parallels stay evenly spaced in name only — watch them drift apart as
                latitude climbs, and watch the circles.
              </p>
              <p className="mt-4 font-body text-body" style={{ color: 'var(--fg-2)' }}>
                Nothing here is an artist's impression. Every vertex you see is the same vertex,
                re-positioned by one function.
              </p>
            </Reveal>
          </div>

          <div data-step="mercator-circles" className="flex min-h-[90vh] items-center">
            <Reveal>
              <h3 className="font-display text-subhead" style={{ color: 'var(--fg)', fontWeight: 460 }}>
                Mercator's bargain: shapes live, sizes die
              </h3>
              <p className="mt-4 font-body text-body" style={{ color: 'var(--fg)' }}>
                On the flat map the circles are still circles — Mercator preserves local shape and
                angle perfectly. But read their sizes. A circle at 60°N is drawn twice as wide as
                the same circle at the equator, which means four times the ink. The map keeps its
                promise about shape by quietly breaking the one about area.
              </p>
              <div className="mt-8 grid grid-cols-2 gap-6">
                <DataCallout value="×2.00" caption="Mercator linear scale at 60° N vs the equator — sec 60°." accent="vermilion" />
                <DataCallout value="×4.00" caption="Area scale at 60° N — the square of the linear stretch." accent="vermilion" />
              </div>
            </Reveal>
          </div>

          <div data-step="trade" className="flex min-h-[90vh] items-center">
            <Reveal>
              <h3 className="font-display text-subhead" style={{ color: 'var(--fg)', fontWeight: 460 }}>
                The other bargain: areas live, shapes die
              </h3>
              <p className="mt-4 font-body text-body" style={{ color: 'var(--fg)' }}>
                Choose differently and the map obeys differently. The Gall–Peters projection keeps
                every region's area exact — watch each circle deflate into an ellipse, and notice
                that every ellipse, however squashed, encloses the same area as every other.
                Greenland shrinks to its true fourteenth of Africa. The equatorial shapes pay the
                bill.
              </p>
              <p className="mt-6 pull-line text-pull">
                A sphere gives you area and shape together. A plane makes you choose. That is not a
                failure of cartography — it is a theorem about curvature.
              </p>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  )
}
