import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ChapterKicker from '@/components/ChapterKicker'
import ScrubSlider from '@/components/ScrubSlider'
import StageToggle, { type StageLayer, type StageLayerState } from '@/components/StageToggle'
import type { ProjectionId } from '@/projection/types'
import type { ProjectionScorecard } from '@/projection/metrics'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { StageFrame } from '@/chapters/StageBlockC'
import {
  EASE_MORPH,
  fmtSig,
  getScorecard,
  tweenValue,
  useLazyMapStage,
  type TweenHandle,
} from '@/chapters/stageC'

/**
 * CHAPTER 07 · THE MORPH STUDIO — "One Earth, five answers." (home.md §07)
 * Segmented projection selector + full-width manual morph slider over the
 * five canonical projections. All transitions are true morphs through the
 * shared-vertex buffer pipeline (setMorphTargets + tweened setMorph) — never
 * fades. Live property chips report exact properties (provable) separately
 * from measured scores (sampled by metrics.ts).
 */

interface Stop {
  id: ProjectionId
  name: string
  short: string
}

const STOPS: Stop[] = [
  { id: 'globe', name: 'Globe', short: 'GLOBE' },
  { id: 'mercator', name: 'Mercator', short: 'MERCATOR' },
  { id: 'gallPeters', name: 'Gall–Peters', short: 'GALL–PETERS' },
  { id: 'equalEarth', name: 'Equal Earth', short: 'EQUAL EARTH' },
  { id: 'authagraph', name: 'AuthaGraph', short: 'AUTHAGRAPH' },
]
const N_SEG = STOPS.length - 1

type ExactProp = boolean | 'partial'

/** Exact properties — theorems about the projection, not measurements. */
const EXACT: Record<
  ProjectionId,
  { conformal: ExactProp; equalArea: ExactProp; rhumb: ExactProp }
> = {
  globe: { conformal: true, equalArea: true, rhumb: false },
  mercator: { conformal: true, equalArea: false, rhumb: true },
  gallPeters: { conformal: false, equalArea: true, rhumb: false },
  equalEarth: { conformal: false, equalArea: true, rhumb: false },
  authagraph: { conformal: false, equalArea: 'partial', rhumb: false },
  mollweide: { conformal: false, equalArea: true, rhumb: false },
  orthographic: { conformal: false, equalArea: false, rhumb: false },
}

/** Pair-jump shortcuts: direct morphs that skip intermediate stops. */
const PAIR_JUMPS: Array<{ from: number; to: number; label: string }> = [
  { from: 1, to: 3, label: 'Mercator ⇄ Equal Earth' },
  { from: 2, to: 3, label: 'Gall–Peters ⇄ Equal Earth' },
]

function mark(v: ExactProp): string {
  return v === true ? '✓' : v === 'partial' ? '◐' : '✗'
}

export default function Ch07MorphStudio() {
  const { reducedMotion } = useReducedMotion()
  const { hostRef, stage } = useLazyMapStage({
    layers: { graticule: true, tissot: false },
  })

  const [rotationPaused, setRotationPaused] = useState(false)
  const [slider, setSlider] = useState(0) // 0..1 across the five stops
  const [stopIndex, setStopIndex] = useState(0) // dominant stop for chips/aria
  const [layers, setLayers] = useState<StageLayerState>({
    geography: true,
    graticule: true,
    tissot: false,
    area: false,
    angle: false,
  })
  const [scores, setScores] = useState<Partial<Record<string, ProjectionScorecard>>>({})

  const sliderRef = useRef(slider)
  useEffect(() => {
    sliderRef.current = slider
  })
  const pairRef = useRef<{ a: ProjectionId; b: ProjectionId } | null>(null)
  /** Latest scrub position (updated synchronously — sliderRef lags a frame). */
  const lastGRef = useRef(0)
  const tweenRef = useRef<TweenHandle | null>(null)
  const radioRefs = useRef<Array<HTMLButtonElement | null>>([])

  // Roving focus: when the active stop changes from keyboard input, move
  // focus to the newly active radio button.
  useEffect(() => {
    const active = radioRefs.current[stopIndex]
    if (active && document.activeElement?.getAttribute('role') === 'radio') {
      active.focus()
    }
  }, [stopIndex])

  /* ---------- drive the stage ---------- */

  const applyValue = useCallback(
    (g: number) => {
      const s = stage
      if (!s) return
      const clamped = Math.min(1, Math.max(0, g))
      lastGRef.current = clamped
      const seg = Math.min(N_SEG - 1, Math.floor(clamped * N_SEG))
      const local = clamped * N_SEG - seg
      const a = STOPS[seg].id
      const b = STOPS[seg + 1].id
      const pair = pairRef.current
      if (!pair || pair.a !== a || pair.b !== b) {
        pairRef.current = { a, b }
        // Serialize: the swap resolves asynchronously (MapStage ignores
        // stale resolutions). When it lands, settle on the LATEST position
        // if it still belongs to this segment pair — never a stale local.
        void s.setMorphTargets(a, b).then(() => {
          if (pairRef.current?.a !== a || pairRef.current?.b !== b) return
          const g2 = lastGRef.current
          const seg2 = Math.min(N_SEG - 1, Math.floor(g2 * N_SEG))
          if (STOPS[seg2].id !== a || STOPS[seg2 + 1].id !== b) return
          s.setMorph(g2 * N_SEG - seg2)
        })
      } else {
        s.setMorph(local)
      }
      // dominant stop drives chips + aria
      const nearest = Math.round(clamped * N_SEG)
      setStopIndex((prev) => (prev === nearest ? prev : nearest))
    },
    [stage],
  )

  const scrubTo = useCallback(
    (g: number) => {
      tweenRef.current?.cancel()
      setSlider(g)
      applyValue(g)
    },
    [applyValue],
  )

  /** Tweened jump to an absolute slider position (segmented control). */
  const goToStop = useCallback(
    (i: number) => {
      const target = i / N_SEG
      tweenRef.current?.cancel()
      tweenRef.current = tweenValue(sliderRef.current, target, {
        duration: 1600,
        ease: EASE_MORPH,
        reduced: reducedMotion,
        onUpdate: (v) => {
          setSlider(v)
          applyValue(v)
        },
      })
    },
    [applyValue, reducedMotion],
  )

  /** Direct pair morph (skips intermediate stops); thumb rides along. */
  const pairJump = useCallback(
    (from: number, to: number) => {
      const s = stage
      if (!s) return
      tweenRef.current?.cancel()
      // Jump direction: if we are already at `to`, go back to `from`.
      const atTo = Math.abs(sliderRef.current - to / N_SEG) < 0.02
      const [p, q] = atTo ? [to, from] : [from, to]
      // Serialize the target swap: start the morph tween only after THIS
      // swap lands; a superseding request (pairRef changed) abandons it.
      pairRef.current = { a: STOPS[p].id, b: STOPS[q].id }
      void s.setMorphTargets(STOPS[p].id, STOPS[q].id).then(() => {
        if (pairRef.current?.a !== STOPS[p].id || pairRef.current?.b !== STOPS[q].id) return
        tweenRef.current = tweenValue(0, 1, {
          duration: 1600,
          ease: EASE_MORPH,
          reduced: reducedMotion,
          onUpdate: (v) => {
            s.setMorph(v)
            const g = (p + (q - p) * v) / N_SEG
            lastGRef.current = g
            setSlider(g)
            const nearest = Math.round(g * N_SEG)
            setStopIndex((prev) => (prev === nearest ? prev : nearest))
          },
          onDone: () => {
            // re-sync the slider mapping at the destination stop
            pairRef.current = null
            applyValue(q / N_SEG)
          },
        })
      })
    },
    [stage, reducedMotion, applyValue],
  )

  /* ---------- stage wiring ---------- */

  useEffect(() => {
    if (!stage) return
    pairRef.current = null
    applyValue(sliderRef.current)
  }, [stage, applyValue])

  useEffect(() => {
    stage?.setLayers(layers)
  }, [stage, layers])

  // Autorotate only while resting on the globe stop.
  useEffect(() => {
    stage?.setAutoRotate(stopIndex === 0 && !reducedMotion && !rotationPaused)
  }, [stage, stopIndex, reducedMotion, rotationPaused])

  // Measured chips, lazily computed (module-cached; shared with ch. 08).
  useEffect(() => {
    let alive = true
    for (const stop of STOPS) {
      if (stop.id === 'globe') continue
      void getScorecard(stop.id, { samples: 2001, distancePairs: 400 }).then((sc) => {
        if (alive) setScores((prev) => (prev[stop.id] ? prev : { ...prev, [stop.id]: sc }))
      })
    }
    return () => {
      alive = false
    }
  }, [])

  const onLayer = useCallback((layer: StageLayer, on: boolean) => {
    setLayers((prev) => ({ ...prev, [layer]: on }))
  }, [])

  const stop = STOPS[stopIndex]
  const exact = EXACT[stop.id]
  const score = scores[stop.id]

  const midMorph = Math.abs(slider * N_SEG - Math.round(slider * N_SEG)) > 0.02
  const ariaLabel = useMemo(
    () =>
      `Projection morph studio. Currently showing: ${stop.name}` +
      (midMorph
        ? `, mid-morph at ${(slider * 100).toFixed(0)} percent of the globe-to-AuthaGraph sequence`
        : '') +
      '. Use map layers to reveal the coordinate grid and distortion circles.',
    [stop.name, slider, midMorph],
  )

  return (
    <section
      id="ch-07"
      aria-labelledby="ch-07-title"
      className="mx-auto max-w-container scroll-mt-20 px-[var(--gutter)] py-24"
    >
      <ChapterKicker
        numeral="07"
        kicker="THE SELECTOR"
        title="One Earth, five answers."
        titleId="ch-07-title"
        standfirst="Every projection in this essay is the same Earth, re-optimized. Drag the morph yourself. The same geographic vertices move continuously while terrain shading gives way to a clear cartographic surface."
        accent="vermilion"
      />

      <div className="mt-12 max-w-measure">
        <p className="font-body text-body" style={{ color: 'var(--fg)' }}>
          Watch the graticule, not the continents. Continents are cargo; the grid is the
          machine. As you scrub, meridians bend or stay parallel, Tissot circles swell or
          shear, and the camera reframes to each map&apos;s own aspect — the five answers
          differ only in what they choose to keep true.
        </p>
      </div>

      {/* The instrument: selector + stage + slider + chips */}
      <div className="mt-16">
        {/* Segmented control */}
        <div
          role="radiogroup"
          aria-label="Projection"
          className="flex flex-wrap items-baseline gap-x-6 gap-y-2 overflow-x-auto pb-2"
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault()
              goToStop(Math.min(N_SEG, stopIndex + 1))
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault()
              goToStop(Math.max(0, stopIndex - 1))
            } else if (e.key === 'Home') {
              e.preventDefault()
              goToStop(0)
            } else if (e.key === 'End') {
              e.preventDefault()
              goToStop(N_SEG)
            }
          }}
        >
          {STOPS.map((s, i) => {
            const active = i === stopIndex
            return (
              <button
                key={s.id}
                ref={(el) => {
                  radioRefs.current[i] = el
                }}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => goToStop(i)}
                className="display-tight font-display transition-colors duration-micro ease-atlas"
                style={{
                  fontSize: 'clamp(1rem, 1.8vw, 1.25rem)',
                  fontWeight: active ? 560 : 340,
                  color: active ? 'var(--accent)' : 'var(--fg-3)',
                  borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                  paddingBottom: 2,
                }}
              >
                {s.short}
              </button>
            )
          })}
        </div>

        {/* Stage */}
        <div className="relative mt-6">
          <StageFrame
            hostRef={hostRef}
            ariaLabel={ariaLabel}
            height="min(70vh, 620px)"
          >
            <div className="absolute bottom-3 left-3">
              <StageToggle layers={layers} onChange={onLayer} />
            </div>
          </StageFrame>
        </div>

        {/* Manual morph slider */}
        <div className="mt-6">
          <ScrubSlider
            value={slider}
            onChange={scrubTo}
            label="globe ━━●━━ flat — drag to morph by hand"
            stops={STOPS.map((_, i) => i / N_SEG)}
          />
          <div
            className="mt-1 flex justify-between font-ui text-label uppercase"
            style={{ color: 'var(--fg-3)' }}
            aria-hidden
          >
            {STOPS.map((s) => (
              <span key={s.id}>{s.short}</span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {PAIR_JUMPS.map((j) => (
              <button
                key={j.label}
                type="button"
                onClick={() => pairJump(j.from, j.to)}
                className="rounded-full px-3 py-1.5 font-ui text-label uppercase transition-colors duration-micro ease-atlas"
                style={{
                  border: '1px solid var(--hair)',
                  color: 'var(--fg-2)',
                  background: 'transparent',
                }}
              >
                {j.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex gap-5"><button className="atlas-text-button" onClick={() => goToStop(0)}>Return to globe</button><button className="atlas-text-button" disabled={stopIndex !== 0 || reducedMotion} aria-pressed={rotationPaused} onClick={() => setRotationPaused(v => !v)}>{rotationPaused ? 'Resume rotation' : 'Pause rotation'}</button></div>
        <p className="atlas-takeaway">{stop.id === 'globe' ? 'The sphere is our reference. Choose a map to explore its tradeoff.' : stop.id === 'mercator' ? 'Local shapes stay true. High-latitude areas become larger.' : stop.id === 'authagraph' ? 'A polyhedral construction distributes distortion across the world.' : 'Relative areas stay true. Local shapes change.'}</p>
        <details className="atlas-optional"><summary>Inspect the exact properties & measured scores</summary>
        {/* Live property chips */}
        <div
          className="mt-8 flex flex-wrap gap-2"
          aria-label={`Properties of ${stop.name}`}
        >
          <PropChip
            kind="exact"
            label="Conformal — local shape"
            value={`${mark(exact.conformal)} ${exact.conformal === true ? 'exact' : 'not conformal'}`}
            good={exact.conformal === true}
            tip="A theorem: angles between curves are preserved exactly. True of the globe and Mercator; false of everything equal-area."
          />
          <PropChip
            kind="exact"
            label="Equal-area"
            value={
              exact.equalArea === 'partial'
                ? '◐ equal-area type'
                : `${mark(exact.equalArea)} ${exact.equalArea === true ? 'exact' : 'not equal-area'}`
            }
            good={exact.equalArea !== false}
            tip="A theorem: every region's relative size is preserved. AuthaGraph is equal-area at the 96-region level — 'equal-area type', not infinitesimal."
          />
          <PropChip
            kind="exact"
            label="Rhumb lines"
            value={`${mark(exact.rhumb)} ${exact.rhumb === true ? 'straight' : 'curved'}`}
            good={exact.rhumb === true}
            tip="A line of constant compass bearing is straight only on Mercator — the property the map was invented for."
          />
          <PropChip
            kind="measured"
            label="RMS log₂ area error"
            value={
              stop.id === 'globe'
                ? '0.00 — reference'
                : score
                  ? fmtSig(score.rmsLog2AreaError)
                  : 'measuring…'
            }
            good={score ? score.rmsLog2AreaError < 0.05 : undefined}
            tip="Measured: root-mean-square of log₂ local area scale over 2,001 area-weighted Fibonacci sample points (0 = perfectly equal-area)."
          />
          <PropChip
            kind="measured"
            label="Max angular deformation ω"
            value={
              stop.id === 'globe'
                ? '0° — reference'
                : score
                  ? `${fmtSig(score.maxOmegaDeg)}°`
                  : 'measuring…'
            }
            good={score ? score.maxOmegaDeg < 15 : undefined}
            tip="Measured: worst Tissot axis ratio expressed as maximum angular deformation over the same sample. Mercator reads ≈0° because it is conformal (its poles are simply clipped at ±85°); equal-area maps pay for exact area here."
          />
        </div>
        <p className="mt-4 max-w-measure font-ui text-caption" style={{ color: 'var(--fg-2)' }}>
          Chips marked <ChipTag kind="exact" /> are theorems — provable, no sampling. Chips
          marked <ChipTag kind="measured" /> are statistics from the distortion engine
          (2,001-point area-weighted Fibonacci sample). The full methodology is the next
          chapter&apos;s subject.
        </p>
        </details>
      </div>

      <div className="mt-16 grid gap-8 md:grid-cols-2">
        <p className="max-w-measure font-body text-body" style={{ color: 'var(--fg)' }}>
          Follow a coastline through the transformation: its vertices move continuously between
          the two projections. Terrain shading fades as the globe opens, leaving the coordinate
          grid and geography easier to compare.
        </p>
        <aside
          className="p-6 font-ui text-caption"
          style={{
            border: '1px solid var(--gold)',
            color: 'var(--fg-2)',
            background: 'transparent',
          }}
        >
          <span className="font-ui text-label uppercase" style={{ color: 'var(--gold)' }}>
            Note on the AuthaGraph morph
          </span>
          <p className="mt-2">
            AuthaGraph morphs pass through its unfolded-net state — the only projection here
            that is not one smooth function of longitude and latitude. Watch the seams where
            the tetrahedron&apos;s faces meet: the interpolation is per-vertex between baked
            buffers, so seam-collapse artifacts during transit are honest, not hidden.
          </p>
        </aside>
      </div>
    </section>
  )
}

/* ---------------- chips ---------------- */

function ChipTag({ kind }: { kind: 'exact' | 'measured' }) {
  return (
    <span
      className="font-ui font-semibold uppercase"
      style={{
        fontSize: 9,
        letterSpacing: '0.14em',
        color: kind === 'exact' ? 'var(--seaweed)' : 'var(--ochre)',
        border: `1px solid ${kind === 'exact' ? 'var(--seaweed)' : 'var(--ochre)'}`,
        borderRadius: 3,
        padding: '1px 4px',
        verticalAlign: 'middle',
      }}
    >
      {kind}
    </span>
  )
}

function PropChip({
  kind,
  label,
  value,
  good,
  tip,
}: {
  kind: 'exact' | 'measured'
  label: string
  value: string
  good?: boolean
  tip: string
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-full py-1.5 pl-2 pr-3 transition-all duration-micro ease-atlas"
      title={tip}
      style={{
        border: '1px solid var(--hair)',
        background: 'var(--bg)',
      }}
    >
      <ChipTag kind={kind} />
      <span className="font-ui text-label uppercase" style={{ color: 'var(--fg-3)' }}>
        {label}
      </span>
      <span
        className="font-mono text-caption transition-colors duration-micro"
        style={{
          color:
            good === undefined ? 'var(--fg-2)' : good ? 'var(--seaweed)' : 'var(--accent)',
          fontFeatureSettings: "'tnum'",
        }}
      >
        {value}
      </span>
    </div>
  )
}
