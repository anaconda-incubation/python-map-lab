/**
 * CHAPTER 05 — EQUAL EARTH (home.md §05; design.md §5 stage-LEFT chapter).
 *
 * Šavrič, Patterson & Jenny 2018: an equal-area pseudocylindrical projection
 * with a Robinson-like outline — designed, not discovered. Beats:
 *  (1) Gall–Peters → Equal Earth scroll-scrubbed morph: two equal-area maps
 *      trading shape philosophies;
 *  (2) the published equations + an expandable derivation of WHY F′(θ)
 *      appears in x (the Jacobian equal-area condition);
 *  (3) the signature interaction — a live A1–A4 coefficient playground.
 *      Sliders nudge the published coefficients ±15%; a JS mirror of the
 *      formula re-bakes the vertex set and the stage morphs in near-real-time
 *      with a ghost outline of the true Equal Earth behind it. The equal-area
 *      property is structurally enforced (max |det J − 1| stays 0.0000);
 *  (4) measured values (computed live from the published formulas), the
 *      PROJ-verified reference table, the UN forward-reference card;
 *  (5) a runnable Python panel (equal_earth.py) with reference-test asserts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ChapterKicker from '@/components/ChapterKicker'
import EquationBlock from '@/components/EquationBlock'
import DataCallout from '@/components/DataCallout'
import StageToggle, { type StageLayerState } from '@/components/StageToggle'
import PythonPanelB from '@/chapters/PythonPanelB'
import {
  bindScrub,
  flatCamFracX,
  flatCamFracY,
  tweenValue,
  useChapterStage,
  useElementSize,
  useStepObserver,
} from '@/chapters/stageUtilsB'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { PROJECTION_ENGINE_PY } from '@/python/projection_engine.py'
import { bakeCustomProjection } from '@/projection/bake'
import { tissotAt } from '@/projection/distortion'
import { fibonacciSphere } from '@/projection/metrics'
import { EE_A1, EE_A2, EE_A3, EE_A4, EE_M, equalEarthPoint, wrapLon } from '@/projection/projections'
import equalearth from '@/data/equalearth.json'
import type { MapStage } from '@/three/MapStage'
import type { ProjectPointFn } from '@/projection/types'

/* ---- constants ---- */
const EE_HW = Math.PI / (EE_M * EE_A1) // 2.706629984 (raw half-width)
const EE_HH = equalearth.referencePoints[1].y // 1.317362759 (raw half-height)
const EE_FRAME = { halfWidth: EE_HW, halfHeight: EE_HH }
const EE_HALF_W_N = 1
const EE_HALF_H_N = EE_HH / EE_HW // ≈ 0.48672
const EE_CUSTOM_ID = 'equal-earth-playground-b'

/** JS mirror of the published formula with scaled coefficients. The family
 * stays equal-area for ANY coefficients: x divides by F′(θ), whatever F is.
 * Exported for the playground invariant tests. */
// Public helper intentionally colocated with its provider or teaching component.
// eslint-disable-next-line react-refresh/only-export-components
export function eeMirror(mults: readonly number[]): ProjectPointFn {
  const a1 = EE_A1 * mults[0]
  const a2 = EE_A2 * mults[1]
  const a3 = EE_A3 * mults[2]
  const a4 = EE_A4 * mults[3]
  return (lon, lat) => {
    const theta = Math.asin(Math.max(-1, Math.min(1, EE_M * Math.sin(lat))))
    const t2 = theta * theta
    const t6 = t2 * t2 * t2
    const y = theta * (a1 + a2 * t2 + t6 * (a3 + a4 * t2))
    const fp = a1 + 3 * a2 * t2 + t6 * (7 * a3 + 9 * a4 * t2)
    return { x: (wrapLon(lon) * Math.cos(theta)) / (EE_M * fp), y }
  }
}

/** True Equal Earth outline (boundary meridians + pole lines), normalized. */
function eeOutlinePath(w: number, h: number): string {
  const px = (xn: number) => flatCamFracX(xn, EE_HALF_W_N, EE_HALF_H_N, w, h) * w
  const py = (yn: number) => flatCamFracY(yn, EE_HALF_W_N, EE_HALF_H_N, w, h) * h
  const pts: string[] = []
  // boundary meridian λ = +π, south pole → north pole
  for (let d = -90; d <= 90; d += 2) {
    const p = equalEarthPoint(Math.PI, (d * Math.PI) / 180)
    pts.push(`${pts.length === 0 ? 'M' : 'L'}${px(p.x / EE_HW).toFixed(1)} ${py(p.y / EE_HW).toFixed(1)}`)
  }
  // top pole line: from x(π, 90°) to x(−π, 90°)
  {
    const pL = equalEarthPoint(-Math.PI, Math.PI / 2)
    pts.push(`L${px(pL.x / EE_HW).toFixed(1)} ${py(pL.y / EE_HW).toFixed(1)}`)
  }
  // boundary meridian λ = −π, north → south
  for (let d = 90; d >= -90; d -= 2) {
    const p = equalEarthPoint(-Math.PI, (d * Math.PI) / 180)
    pts.push(`L${px(p.x / EE_HW).toFixed(1)} ${py(p.y / EE_HW).toFixed(1)}`)
  }
  // bottom pole line closes the path
  return pts.join(' ') + ' Z'
}

/** Live distortion stats for a coefficient set (Fibonacci sample, JS). */
function playgroundStats(mults: readonly number[]): { maxAreaErr: number; meanOmegaDeg: number } {
  const fn = eeMirror(mults)
  const { lon, lat } = fibonacciSphere(700)
  let maxAreaErr = 0
  let sumOmega = 0
  let n = 0
  for (let i = 0; i < lon.length; i++) {
    const t = tissotAt(fn, lon[i], lat[i])
    if (!t.valid || t.areaScale <= 0) continue
    maxAreaErr = Math.max(maxAreaErr, Math.abs(t.areaScale - 1))
    sumOmega += t.omega
    n++
  }
  return { maxAreaErr, meanOmegaDeg: n ? ((sumOmega / n) * 180) / Math.PI : 0 }
}

const STEP_LABELS = [
  'Morphing from the Gall–Peters cylindrical equal-area map to the Equal Earth projection: same promise of true areas, a different philosophy of shape.',
  'The Equal Earth world map with its graticule: curved meridians, unequally spaced parallels, a pole line about 0.59 times the width of the equator.',
  'The Equal Earth map with Tissot indicatrices and a live coefficient playground. Moving the sliders deforms the outline; a ghost of the published map stays behind for comparison. Area stays exact no matter what.',
  'The Equal Earth map with Tissot ellipses and the angular-distortion overlay: shape error is modest at the center and grows toward the boundary meridians.',
  'The Equal Earth map with a runnable Python panel that verifies the formulas against PROJ reference values.',
]

const COEFF_META = [
  { key: 'A₁', base: EE_A1, blurb: 'overall vertical spacing of parallels' },
  { key: 'A₂', base: EE_A2, blurb: 'cubic term — negative; pulls mid-latitudes toward the equator' },
  { key: 'A₃', base: EE_A3, blurb: 'seventh-order trim near the poles' },
  { key: 'A₄', base: EE_A4, blurb: 'ninth-order trim of the polar regions' },
] as const

export default function Ch05EqualEarth() {
  const { reducedMotion } = useReducedMotion()
  const rootRef = useRef<HTMLElement | null>(null)
  const morphBlockRef = useRef<HTMLDivElement | null>(null)
  const [step, setStep] = useState(0)
  const stepRef = useRef(0)
  const morphRef = useRef(0)
  const [morphDone, setMorphDone] = useState(false)
  const [ariaLabel, setAriaLabel] = useState(STEP_LABELS[0])
  const [mults, setMults] = useState<readonly number[]>([1, 1, 1, 1])
  const multsRef = useRef<readonly number[]>(mults)
  useEffect(() => {
    multsRef.current = mults
  }, [mults])
  const modified = useMemo(() => mults.some((m) => Math.abs(m - 1) > 1e-9), [mults])
  const [layers, setLayers] = useState<StageLayerState>({
    geography: true,
    graticule: true,
    tissot: false,
    area: false,
    angle: false,
  })

  const applyStep = useCallback((s: number) => {
    stepRef.current = s
    setStep(s)
    setAriaLabel(STEP_LABELS[Math.min(s, STEP_LABELS.length - 1)])
    setLayers((prev) => ({
      ...prev,
      graticule: true,
      tissot: s >= 2,
      angle: s === 3,
      area: false,
    }))
  }, [])

  const onReady = useCallback((stage: MapStage) => {
    const restore = () => {
      stage.setMorph(morphRef.current)
      stage.setLayers({
        geography: true,
        graticule: true,
        tissot: stepRef.current >= 2,
        area: false,
        angle: stepRef.current === 3,
      })
    }
    const m = multsRef.current
    if (m.some((v) => Math.abs(v - 1) > 1e-9)) {
      // remount with user coefficients still active: re-bake the custom map
      void bakeCustomProjection(EE_CUSTOM_ID, eeMirror(m), EE_FRAME).then((baked) => {
        stage.registerCustomProjection(EE_CUSTOM_ID, baked)
        void stage.setMorphTargets('gallPeters', EE_CUSTOM_ID).then(restore)
      })
      return
    }
    void stage.setMorphTargets('gallPeters', 'equalEarth').then(restore)
  }, [])

  const { containerRef, stageRef, alive } = useChapterStage('paper', onReady)
  const stageBox = useElementSize(containerRef)

  useEffect(() => {
    stageRef.current?.setLayers(layers)
  }, [layers, alive, stageRef])

  /* scroll-scrubbed Gall–Peters → Equal Earth morph */
  useEffect(() => {
    const block = morphBlockRef.current
    if (!block || !alive || reducedMotion) return
    return bindScrub({
      trigger: block,
      start: 'top 80%',
      end: 'bottom 25%',
      onProgress: (p) => {
        morphRef.current = p
        stageRef.current?.setMorph(p)
        setMorphDone(p > 0.98)
      },
    })
  }, [alive, reducedMotion, stageRef])

  useStepObserver(rootRef, applyStep)

  /* reduced motion: discrete crossfade */
  useEffect(() => {
    if (!reducedMotion || !alive) return
    const target = stepRef.current >= 1 ? 1 : 0
    const cancel = tweenValue(morphRef.current, target, 400, (v) => {
      morphRef.current = v
      stageRef.current?.setMorph(v)
    })
    setMorphDone(target === 1)
    return cancel
  }, [step, reducedMotion, alive, stageRef])

  /* ---- coefficient playground: re-bake the vertex set with a JS mirror ---- */
  const bakeQueue = useRef<{ running: boolean; pending: readonly number[] | null }>({
    running: false,
    pending: null,
  })
  const requestBake = useCallback(
    (m: readonly number[]) => {
      const q = bakeQueue.current
      if (q.running) {
        q.pending = m
        return
      }
      q.running = true
      const run = async (mm: readonly number[]) => {
        try {
          const stage = stageRef.current
          if (!stage) return
          const baked = await bakeCustomProjection(EE_CUSTOM_ID, eeMirror(mm), EE_FRAME)
          if (stageRef.current !== stage) return
          stage.registerCustomProjection(EE_CUSTOM_ID, baked)
          await stage.setMorphTargets('gallPeters', EE_CUSTOM_ID)
          stage.setMorph(morphRef.current)
        } finally {
          q.running = false
          if (q.pending) {
            const p = q.pending
            q.pending = null
            requestBake(p)
          }
        }
      }
      void run(m)
    },
    [stageRef],
  )

  useEffect(() => {
    if (!alive) return
    if (modified) {
      requestBake(mults)
    } else {
      // back to the canonical baked projection
      const stage = stageRef.current
      if (stage) {
        void stage.setMorphTargets('gallPeters', 'equalEarth').then(() => {
          stage.setMorph(morphRef.current)
        })
      }
    }
  }, [mults, modified, alive, requestBake, stageRef])

  /* live playground stats (cheap: 700-sample Tissot field in JS) */
  const stats = useMemo(
    () => (modified || step >= 2 ? playgroundStats(mults) : null),
    [mults, modified, step],
  )

  /* measured values for the published map (computed from the formulas) */
  const measured = useMemo(() => {
    const center = tissotAt(equalEarthPoint, 0, 0)
    const boundary = tissotAt(equalEarthPoint, Math.PI, Math.PI / 4)
    return {
      omegaCenterDeg: (center.omega * 180) / Math.PI,
      omegaBoundaryDeg: (boundary.omega * 180) / Math.PI,
      areaErr: Math.max(Math.abs(center.areaScale - 1), Math.abs(boundary.areaScale - 1)),
    }
  }, [])

  const ghostPath = useMemo(() => {
    if (stageBox.w <= 0) return ''
    return eeOutlinePath(stageBox.w, stageBox.h)
  }, [stageBox])
  const ghostVisible = alive && morphDone && modified && step >= 2

  const refs = equalearth.referencePoints.slice(1, 5)

  return (
    <section
      id="ch-05"
      ref={rootRef}
      aria-labelledby="ch-05-title"
      className="mx-auto max-w-container scroll-mt-20 px-[var(--gutter)] py-24"
    >
      <ChapterKicker
        numeral="05"
        kicker="2018"
        title="Equal Earth: a projection with authors."
        titleId="ch-05-title"
        standfirst="In 2018 Bojan Šavrič, Tom Patterson and Bernhard Jenny published a projection engineered to be exactly equal-area and still look like the world people expect. Eight years later, the United Nations cited it by name."
        accent="seaweed"
      />

      <div className="mt-16 flex flex-col lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-[var(--gutter)]">
        {/* sticky stage — LEFT on desktop */}
        <div className="sticky top-[var(--nav-h)] z-20 order-first h-[52dvh] border-b border-hair bg-bg lg:order-1 lg:top-0 lg:z-auto lg:h-[100dvh] lg:self-start lg:border-b-0">
          <div ref={containerRef} role="img" aria-label={ariaLabel} className="absolute inset-0" />
          {/* ghost outline of the true Equal Earth, aligned to the flat camera */}
          {ghostVisible && (
            <svg
              aria-hidden
              className="pointer-events-none absolute inset-0"
              width={stageBox.w}
              height={stageBox.h}
            >
              <path
                d={ghostPath}
                fill="none"
                stroke="var(--seaweed)"
                strokeOpacity={0.4}
                strokeWidth={1.5}
                strokeDasharray="5 4"
              />
            </svg>
          )}
          <StageToggle
            layers={layers}
            onChange={(layer, on) => setLayers((p) => ({ ...p, [layer]: on }))}
            className="absolute bottom-3 left-3"
          />
          <p className="sr-only" aria-live="polite">
            {ariaLabel}
          </p>
        </div>

        {/* narrative column — RIGHT */}
        <div className="order-last lg:order-2">
          {/* step 0 — intro + morph scrub */}
          <div data-step="0" ref={morphBlockRef} className="max-w-measure pb-24 pt-16 lg:min-h-[150vh]">
            <p>
              Gall–Peters got area right by accepting the shape consequences of a cylinder.
              Robinson, the 1974 compromise that dominated atlases for decades, did the
              opposite: it smoothed every error by eye and preserved nothing exactly. For
              half a century the choice seemed to be between a theorem and a taste.
            </p>
            <p className="mt-6">
              Watch the map now. The cylindrical grid relaxes; the pole — crushed to a point
              on most equal-area maps — opens into a line a little over half the width of
              the equator; the meridians bow outward into curves. This is the map settling
              into the Equal Earth projection, and it keeps the theorem: area is still
              exact, everywhere. What changed is the shapes. Where the distortion went is a
              decision, and this time the decision-makers signed their work.
            </p>
          </div>

          {/* step 1 — the equations */}
          <div data-step="1" className="max-w-measure pb-24">
            <h3 className="font-display text-subhead" style={{ color: 'var(--fg)', fontWeight: 460 }}>
              The design brief, as equations
            </h3>
            <p className="mt-5">
              The authors' optimization problem: equal-area <em>exactly</em> (unlike
              Robinson), pseudocylindrical, a pole line 0.59× the equator, pleasant
              continental shapes — and small, few, memorable coefficients. The answer is a
              polynomial that spaces the parallels, plus one forcing condition that ties
              the horizontal scale to it:
            </p>
            <details className="atlas-optional"><summary>Explore the mathematics</summary><EquationBlock
              className="mt-8"
              tex={String.raw`\begin{aligned} \theta &= \arcsin\!\left(\tfrac{\sqrt{3}}{2}\sin\varphi\right) \\[4pt] y &= F(\theta) = A_1\theta + A_2\theta^3 + A_3\theta^7 + A_4\theta^9 \\[4pt] x &= \frac{\lambda\cos\theta}{M\,F'(\theta)}, \qquad M = \tfrac{\sqrt{3}}{2} \end{aligned}`}
              glossary={[
                { symbol: '\\theta', meaning: 'an auxiliary latitude: the authalic-like remapping sin θ = (√3/2) sin φ' },
                { symbol: 'F(\\theta)', meaning: 'the spacing of the parallels — this polynomial is the entire visual design' },
                { symbol: "F'(\\theta)", meaning: 'its derivative: the local vertical scale' },
                { symbol: 'A_1 \\dots A_4', meaning: '1.340264, −0.081106, 0.000893, 0.003796 — the published coefficients (note: A₂ is negative; one PDF shows a misprinted + sign)' },
              ]}
              caption="Šavrič, Patterson & Jenny 2018, DOI 10.1080/13658816.2018.1504949."
            /></details>
            <details className="mt-6 border p-5" style={{ borderColor: 'var(--hair)', background: 'var(--bg-2)' }}>
              <summary className="cursor-pointer font-ui text-label uppercase" style={{ color: 'var(--seaweed)' }}>
                Why does F′ appear in x? — the three-line derivation
              </summary>
              <div className="mt-4 space-y-4 font-body text-body-sm" style={{ color: 'var(--fg-2)' }}>
                <p>
                  1 · On the sphere, dA = cos&nbsp;φ&nbsp;dλ&nbsp;dφ. Since
                  sin&nbsp;θ = M&nbsp;sin&nbsp;φ, differentiating gives
                  cos&nbsp;φ&nbsp;dφ = (cos&nbsp;θ/M)&nbsp;dθ, so the sphere's patch is
                  dA = (cos&nbsp;θ/M)&nbsp;dλ&nbsp;dθ.
                </p>
                <p>
                  2 · On any pseudocylindrical map, a parallel's width is some
                  w(θ), with x = λ·w(θ) and y = F(θ). The map's patch of
                  dλ&nbsp;dθ is a rectangle of area w(θ)·F′(θ)&nbsp;dλ&nbsp;dθ.
                </p>
                <p>
                  3 · Equal area demands the two patches match:
                  w(θ)·F′(θ) = cos&nbsp;θ/M — so w(θ) = cos&nbsp;θ/(M·F′(θ)).
                  Differentiate the design goal and the x-formula falls out. The horizontal
                  scale must cancel the vertical scale's derivative; that is the whole
                  trick, and it works for <em>any</em> choice of coefficients.
                </p>
              </div>
            </details>
          </div>

          {/* step 2 — the coefficient playground */}
          <div data-step="2" className="max-w-measure pb-24">
            <h3 className="font-display text-subhead" style={{ color: 'var(--fg)', fontWeight: 460 }}>
              The coefficients are the design
            </h3>
            <p className="mt-5">
              Four numbers carry the entire look of the map. Nudge them — each slider
              scales one published coefficient by ±15% — and the stage re-projects every
              coastline vertex with the same formula, live. The dashed ghost is the
              published Equal Earth, held behind your version for comparison.
            </p>

            <div
              className="mt-6 border p-5"
              style={{ borderColor: 'var(--hair)', background: 'var(--bg-2)' }}
              role="group"
              aria-label="Equal Earth coefficient playground"
            >
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                {COEFF_META.map((c, i) => (
                  <div key={c.key}>
                    <div className="flex items-baseline justify-between">
                      <label
                        htmlFor={`ee-a${i + 1}`}
                        className="font-ui text-label uppercase"
                        style={{ color: 'var(--fg-3)' }}
                      >
                        {c.key}
                      </label>
                      <output
                        htmlFor={`ee-a${i + 1}`}
                        className="font-mono text-caption"
                        style={{ color: 'var(--fg-2)', fontFeatureSettings: "'tnum'" }}
                      >
                        {(c.base * mults[i]).toFixed(6)}
                      </output>
                    </div>
                    <input
                      id={`ee-a${i + 1}`}
                      type="range"
                      min={0.85}
                      max={1.15}
                      step={0.001}
                      value={mults[i]}
                      onChange={(e) =>
                        setMults((prev) => prev.map((v, j) => (j === i ? Number(e.target.value) : v)))
                      }
                      onKeyDown={(e) => {
                        if (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowUp')) {
                          e.preventDefault()
                          setMults((prev) =>
                            prev.map((v, j) => (j === i ? Math.min(1.15, v + 0.01) : v)),
                          )
                        } else if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowDown')) {
                          e.preventDefault()
                          setMults((prev) =>
                            prev.map((v, j) => (j === i ? Math.max(0.85, v - 0.01) : v)),
                          )
                        }
                      }}
                      className="scrub-slider mt-2 block w-full"
                      aria-valuetext={`${c.key} = ${(c.base * mults[i]).toFixed(6)}, ${Math.round(mults[i] * 100)} percent of the published value — ${c.blurb}`}
                    />
                    <p className="mt-1 font-ui text-[0.68rem] leading-snug" style={{ color: 'var(--fg-3)' }}>
                      {c.blurb}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-3 border-t pt-4" style={{ borderColor: 'var(--hair)' }}>
                <dl className="grid grid-cols-[auto_auto] gap-x-5 gap-y-1 font-mono text-caption" style={{ color: 'var(--fg)' }}>
                  <dt style={{ color: 'var(--fg-2)' }}>max |det J − 1|</dt>
                  <dd style={{ color: 'var(--seaweed)' }}>{stats ? stats.maxAreaErr.toFixed(4) : '0.0000'}</dd>
                  <dt style={{ color: 'var(--fg-2)' }}>mean ω (shape error)</dt>
                  <dd>{stats ? `${stats.meanOmegaDeg.toFixed(1)}°` : '—'}</dd>
                </dl>
                <button
                  type="button"
                  disabled={!modified}
                  onClick={() => setMults([1, 1, 1, 1])}
                  className="rounded-full px-4 py-1.5 font-ui text-label uppercase transition-all duration-micro ease-atlas"
                  style={{
                    border: '1px solid var(--seaweed)',
                    color: modified ? 'var(--paper)' : 'var(--fg-3)',
                    background: modified ? 'var(--seaweed)' : 'transparent',
                    opacity: modified ? 1 : 0.6,
                  }}
                >
                  Restore Equal Earth coefficients
                </button>
              </div>
              <p className="mt-4 font-ui text-caption" style={{ color: 'var(--fg-2)' }}>
                You cannot break the equal-area property here — the formula divides by F′
                whatever F you choose. You can only make the map ugly. That is what "a
                family of solutions" means: the published four numbers are the authors'
                taste, not a theorem.
              </p>
            </div>
          </div>

          {/* step 3 — measured */}
          <div data-step="3" className="max-w-measure pb-24">
            <h3 className="font-display text-subhead" style={{ color: 'var(--fg)', fontWeight: 460 }}>
              See it measured
            </h3>
            <p className="mt-5">
              With Tissot ellipses and the angular overlay on, the published map reads like
              this (computed live from the formulas above, 700-sample Fibonacci field):
            </p>
            <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-3">
              <DataCallout
                value={measured.areaErr.toFixed(2)}
                caption="area error — max |det J − 1|: exact, by construction"
                accent="seaweed"
              />
              <DataCallout
                value={`≈${measured.omegaCenterDeg.toFixed(0)}°`}
                caption="max angular distortion ω at the map center"
                accent="seaweed"
              />
              <DataCallout
                value={`≈${measured.omegaBoundaryDeg.toFixed(0)}°`}
                caption="ω at the boundary meridian, 45°N — where the shape bill comes due"
                accent="seaweed"
              />
            </div>
            <p className="mt-8">
              Robinson-like shapes; area exactly right. An independent check (Kerkovits
              2021) scores Equal Earth's angular RMS error at 2.678° — among the lowest of
              any equal-area world map. The reference values below are the same ones PROJ's
              test suite uses; the Python panel below asserts against them.
            </p>
            <div className="mt-6 overflow-x-auto border" style={{ borderColor: 'var(--hair)' }}>
              <table className="w-full font-mono text-caption" style={{ color: 'var(--fg-2)' }}>
                <thead>
                  <tr className="font-ui uppercase" style={{ color: 'var(--fg-3)', borderBottom: '1px solid var(--hair)' }}>
                    <th className="px-3 py-2 text-left font-medium">lon</th>
                    <th className="px-3 py-2 text-left font-medium">lat</th>
                    <th className="px-3 py-2 text-left font-medium">x</th>
                    <th className="px-3 py-2 text-left font-medium">y</th>
                  </tr>
                </thead>
                <tbody>
                  {refs.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--hair)' }}>
                      <td className="px-3 py-1.5">{r.lon}°</td>
                      <td className="px-3 py-1.5">{r.lat}°</td>
                      <td className="px-3 py-1.5">{r.x.toFixed(6)}</td>
                      <td className="px-3 py-1.5">{r.y.toFixed(6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-3 py-2 font-ui text-[0.68rem] uppercase" style={{ color: 'var(--fg-3)', letterSpacing: '0.14em' }}>
                PROJ-verified reference points (Šavrič et al. 2018 / PROJ eqearth)
              </p>
            </div>
          </div>

          {/* step 4 — the UN names it + python */}
          <div data-step="4" className="max-w-measure pb-16">
            <div
              className="border p-5"
              style={{ borderColor: 'var(--gold)', background: 'transparent' }}
            >
              <p className="font-ui text-label uppercase" style={{ color: 'var(--gold)' }}>
                Forward reference — chapter 12
              </p>
              <p className="mt-3 font-body text-body-sm" style={{ color: 'var(--fg-2)' }}>
                In the annex of the UN General Assembly's September 2026 resolution, Equal
                Earth is the named example of an equal-area projection suitable for
                general-reference world maps. How a projection ends up in a UN document —
                that is chapter 12.
              </p>
            </div>

            <h3 className="mt-12 font-display text-subhead" style={{ color: 'var(--fg)', fontWeight: 460 }}>
              Testable cartography
            </h3>
            <p className="mt-5">
              Fifteen lines of NumPy, including the Newton–Raphson inverse (the same
              approach PROJ uses). Run it: the script prints the reference table and
              asserts every row.
            </p>
            <details className="atlas-optional"><summary>Run & explore the Python</summary><PythonPanelB
              filename="equal_earth.py"
              initialCode={EE_SOURCE}
              accent="seaweed"
              caption="The published numpy code, executed in-browser. The inverse is Newton–Raphson on y — PROJ's eqearth does the same (≤12 iterations, tol 1e-11)."
              annotations={[
                { lines: '16', text: 'sin θ = (√3/2) sin φ — the auxiliary latitude' },
                { lines: '19–20', text: 'y = F(θ): the polynomial that spaces the parallels — the design lives here' },
                { lines: '21', text: "x divides by F′(θ): the equal-area forcing condition from the derivation" },
                { lines: '25–36', text: 'the Newton–Raphson inverse: recover θ from y, then λ and φ' },
                { lines: '50–56', text: 'asserts against PROJ-verified reference values — a map projection with unit tests' },
              ]}
            /></details>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---- the panel source: the published constants + function, verbatim ---- */
const EE_SOURCE = (() => {
  const m = PROJECTION_ENGINE_PY.match(/# Equal Earth[\s\S]*?return x, y/)
  const core = m ? m[0] : ''
  return `"""equal_earth.py - Savric, Patterson & Jenny 2018 (DOI 10.1080/13658816.2018.1504949).
Forward equations + Newton-Raphson inverse, verified against PROJ reference values."""
import numpy as np

${core}


def equal_earth_inverse(x, y):
    """Newton-Raphson on y to recover theta (PROJ eqearth.cpp approach)."""
    theta = np.array(y, dtype=float)
    for _ in range(16):
        t2 = theta * theta
        t6 = t2 * t2 * t2
        f = theta * (EE_A1 + EE_A2 * t2 + t6 * (EE_A3 + EE_A4 * t2)) - y
        fp = EE_A1 + 3 * EE_A2 * t2 + t6 * (7 * EE_A3 + 9 * EE_A4 * t2)
        theta = theta - f / fp
    lam = EE_M * x * fp / np.cos(theta)
    phi = np.arcsin(np.sin(theta) / EE_M)
    return lam, phi


def project(lon, lat, params=None):
    return equal_earth(lon, lat)


refs = [
    (122.0, 47.0, 1.549254331, 0.893308325),   # PROJ worked example
    (0.0, 90.0, 0.0, 1.317362759),             # north pole line, PROJ MAX_Y
    (180.0, 0.0, 2.706629984, 0.0),            # antimeridian half-width pi/(M*A1)
    (90.0, 45.0, 1.159854499, 0.860231086),
]
print("reference tests (PROJ-verified):")
for lon, lat, xr, yr in refs:
    x, y = equal_earth(np.radians(lon), np.radians(lat))
    ok = abs(x - xr) < 1e-6 and abs(y - yr) < 1e-6
    print(f"  ({lon:6.1f}, {lat:5.1f}) -> ({x:.6f}, {y:.6f})  {'ok' if ok else 'MISMATCH'}")
    assert ok
    lam, phi = equal_earth_inverse(x, y)
    assert abs(lam - np.radians(lon)) < 1e-6 and abs(phi - np.radians(lat)) < 1e-6
print("all reference tests passed (forward and inverse).")
`
})()
