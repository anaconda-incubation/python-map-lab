import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ChapterKicker from '@/components/ChapterKicker'
import DataCallout from '@/components/DataCallout'
import EquationBlock from '@/components/EquationBlock'
import StageToggle, { type StageLayerState } from '@/components/StageToggle'
import { useChapterStage, useScrollSteps, Reveal, StageShell } from '@/chapters/stage-shared'

/**
 * CHAPTER 02 · THE DISTORTION ENGINE (design.md §5: stage RIGHT).
 * The mathematics of measurement: the cosφ-corrected Jacobian A, its SVD
 * σ₁/σ₂, areal scale s = σ₁σ₂, angular deformation ω — with a persistent
 * StageToggle driving a live Mercator stage, and the Fibonacci-sampling
 * explainer (5,001 equal-area points) behind every statistic on the site.
 */

type StepId = 'jacobian' | 'svd' | 'area' | 'angle' | 'sampling'

const STEP_TEXT: Record<StepId | 'intro', string> = {
  intro: 'A flat Mercator world map with its ten-degree graticule and Tissot circles.',
  jacobian: 'Mercator map with Tissot circles: each circle is the local derivative made visible.',
  svd: 'Mercator map; the circles grow with latitude but never deform into ellipses.',
  area: 'Mercator map tinted by areal scale: parchment near the equator, vermilion toward the poles.',
  angle: 'Mercator map tinted by angular deformation: uniformly zero — the map is conformal.',
  sampling: 'Mercator map with its Tissot field, computed at an equal-area sample of the sphere.',
}

const AREA_RAMP = [
  { c: 'var(--area-scale-compressed)', label: 'compressed' },
  { c: 'var(--area-scale-true)', label: '×1 true' },
  { c: 'var(--area-scale-2x)', label: '×2' },
  { c: 'var(--area-scale-4x)', label: '×4' },
  { c: 'var(--area-scale-8x)', label: '×8+' },
]
const ANGLE_RAMP = [
  { c: 'var(--angle-scale-0)', label: '0°' },
  { c: 'var(--angle-scale-15)', label: '15°' },
  { c: 'var(--angle-scale-30)', label: '30°' },
  { c: 'var(--angle-scale-45)', label: '45°+' },
]

/** Deterministic point sets for the sampling figure (illustrative N, not the 5,001). */
function fibonacciSphere(n: number): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const th = golden * i
    pts.push([r * Math.cos(th), y])
  }
  return pts
}
function uniformLatLon(rows: number, cols: number): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  for (let r = 0; r < rows; r++) {
    const lat = -Math.PI / 2 + ((r + 0.5) / rows) * Math.PI
    for (let c = 0; c < cols; c++) {
      const lon = -Math.PI + ((c + 0.5) / cols) * 2 * Math.PI
      // front hemisphere of the unit circle: x = cosφ sinλ, y = sinφ
      const x = Math.cos(lat) * Math.sin(lon)
      if (Math.cos(lat) * Math.cos(lon) < 0) continue // back hemisphere
      pts.push([x, Math.sin(lat)])
    }
  }
  return pts
}

export default function Ch02DistortionEngine() {
  const rootRef = useRef<HTMLElement | null>(null)
  const { containerRef, stageRef, generation } = useChapterStage('paper')
  const [stateText, setStateText] = useState(STEP_TEXT.intro)
  const [layers, setLayersState] = useState<StageLayerState>({
    geography: true,
    graticule: true,
    tissot: true,
    area: false,
    angle: false,
  })

  /* ---- stage setup: a flat Mercator plate ---- */
  useEffect(() => {
    const stage = stageRef.current
    if (!stage || generation === 0) return
    let cancelled = false
    void stage.setMorphTargets('globe', 'mercator').then(() => {
      if (cancelled || stageRef.current !== stage) return
      stage.setMorph(1)
      stage.setLayers({ geography: true, graticule: true, tissot: true })
      stage.fitToProjection('mercator')
    })
    return () => {
      cancelled = true
    }
  }, [generation, stageRef])

  const layersRef = useRef(layers)
  layersRef.current = layers

  const applyLayers = useCallback(
    (next: StageLayerState) => {
      layersRef.current = next
      setLayersState(next)
      stageRef.current?.setLayers(next)
    },
    [stageRef],
  )

  const onToggle = useCallback(
    (layer: keyof StageLayerState, on: boolean) => {
      applyLayers({ ...layersRef.current, [layer]: on })
    },
    [applyLayers],
  )

  const onStep = useCallback(
    (step: string) => {
      const s = step as StepId
      if (STEP_TEXT[s]) setStateText(STEP_TEXT[s])
      // Step entries set a sensible preset; the reader may override freely.
      if (s === 'area') applyLayers({ ...layersRef.current, tissot: true, area: true, angle: false })
      else if (s === 'angle') applyLayers({ ...layersRef.current, tissot: true, area: false, angle: true })
      else if (s === 'sampling') applyLayers({ ...layersRef.current, area: false, angle: false, tissot: true })
    },
    [applyLayers],
  )
  useScrollSteps(rootRef, onStep)

  const fibPts = useMemo(() => fibonacciSphere(220), [])
  const gridPts = useMemo(() => uniformLatLon(13, 26), [])

  return (
    <section
      ref={rootRef}
      id="ch-02"
      aria-labelledby="ch-02-title"
      className="relative mx-auto max-w-container scroll-mt-20 px-[var(--gutter)] pb-24 pt-16"
    >
      <div className="grid grid-cols-1 gap-y-6 lg:grid-cols-[minmax(0,42%)_minmax(0,1fr)] lg:gap-x-16">
        {/* Sticky stage with persistent StageToggle over its lower edge (§9) */}
        <div className="sticky top-[var(--nav-h)] z-10 order-first h-[55vh] lg:order-last lg:top-0 lg:h-[100dvh] lg:self-start">
          <StageShell containerRef={containerRef} ariaLabel={stateText} stateText={stateText} className="h-full">
            <div className="absolute bottom-4 left-4">
              <StageToggle layers={layers} onChange={onToggle} />
            </div>
            {/* overlay legends — numeric readouts paired with color (§3) */}
            {layers.area && (
              <div className="absolute bottom-4 right-4 hidden sm:block">
                <p className="mb-1 text-right font-ui text-label uppercase" style={{ color: 'var(--fg-3)' }}>
                  Area scale — each step doubles
                </p>
                <div className="flex items-center gap-1">
                  {AREA_RAMP.map((s) => (
                    <span key={s.label} className="flex flex-col items-center gap-1">
                      <span className="block h-2 w-8" style={{ background: s.c, border: '1px solid var(--hair)' }} />
                      <span className="font-ui text-[10px]" style={{ color: 'var(--fg-2)' }}>{s.label}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {layers.angle && (
              <div className="absolute bottom-4 right-4 hidden sm:block">
                <p className="mb-1 text-right font-ui text-label uppercase" style={{ color: 'var(--fg-3)' }}>
                  Max angular deformation ω
                </p>
                <div className="flex items-center gap-1">
                  {ANGLE_RAMP.map((s) => (
                    <span key={s.label} className="flex flex-col items-center gap-1">
                      <span className="block h-2 w-8" style={{ background: s.c, border: '1px solid var(--hair)' }} />
                      <span className="font-ui text-[10px]" style={{ color: 'var(--fg-2)' }}>{s.label}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </StageShell>
        </div>

        {/* Narrative column */}
        <div className="max-w-measure lg:pt-16">
          <div data-step="jacobian" className="flex min-h-[85vh] flex-col justify-center">
            <ChapterKicker
              numeral="02"
              kicker="THE DISTORTION ENGINE"
              title="Make distortion visible."
              titleId="ch-02-title"
              standfirst="Tissot's indicatrix turns distortion into geometry: draw a circle on the globe, project it, read the ellipse. Every number on this site comes from this machine."
              accent="vermilion"
            />
            <Reveal className="mt-10" delayMs={200}>
              <p className="font-body text-body" style={{ color: 'var(--fg)' }}>
                A projection is a function, and the honest way to interrogate a function is to
                differentiate it. At any point (λ, φ) the projection's local behavior is a 2×2
                matrix — the Jacobian — with one cartographic correction: a degree of longitude is
                only cos φ as long as a degree of latitude, so the longitude column is divided by
                cos φ to put both axes in true ground units.
              </p>
              <details className="atlas-optional"><summary>Explore the mathematics</summary><EquationBlock
                className="mt-8"
                tex={String.raw`A(\lambda,\varphi)=\begin{pmatrix} \dfrac{1}{\cos\varphi}\dfrac{\partial x}{\partial \lambda} & \dfrac{\partial x}{\partial \varphi} \\[2ex] \dfrac{1}{\cos\varphi}\dfrac{\partial y}{\partial \lambda} & \dfrac{\partial y}{\partial \varphi} \end{pmatrix}`}
                caption="The metric-corrected Jacobian (Snyder 1987, eqs. 4-1…4-7). It maps an infinitesimal step on the sphere to the step it becomes on the map."
                glossary={[
                  { symbol: String.raw`\partial x/\partial \lambda`, meaning: 'how fast the map moves east as longitude increases' },
                  { symbol: String.raw`1/\cos\varphi`, meaning: 'the correction for parallels shrinking toward the poles' },
                  { symbol: String.raw`\partial y/\partial \varphi`, meaning: 'how fast the map moves north as latitude increases' },
                ]}
              /></details>
            </Reveal>
          </div>

          <div data-step="svd" className="flex min-h-[85vh] items-center">
            <Reveal>
              <h3 className="font-display text-subhead" style={{ color: 'var(--fg)', fontWeight: 460 }}>
                Every ellipse is two numbers
              </h3>
              <p className="mt-4 font-body text-body" style={{ color: 'var(--fg)' }}>
                Any 2×2 matrix rotates, stretches along one axis, stretches along another, and
                rotates back — the singular value decomposition. The two stretch factors σ₁ and σ₂
                are the semi-axes of the Tissot ellipse you see on the stage. A circle stays a
                circle exactly when σ₁ = σ₂. On this Mercator map that holds everywhere — which is
                precisely what "conformal" means — but look how the pair grows with latitude.
              </p>
              <details className="atlas-optional"><summary>Explore the mathematics</summary><EquationBlock
                className="mt-8"
                tex={String.raw`A = U\,\Sigma\,V^{T}, \qquad \Sigma = \begin{pmatrix} \sigma_1 & 0 \\ 0 & \sigma_2 \end{pmatrix}, \quad \sigma_1 \ge \sigma_2 > 0`}
                caption="The SVD of the local derivative. σ₁ and σ₂ are Tissot's principal scale factors — the ellipse semi-axes."
              /></details>
              <div className="mt-8 grid grid-cols-3 gap-6">
                <DataCallout value="1.00" caption="σ₁ = σ₂ at the equator, Mercator. Undistorted." />
                <DataCallout value="2.00" caption="σ₁ = σ₂ at 60° N. Shape intact, scale doubled." accent="vermilion" />
                <DataCallout value="5.76" caption="σ₁ = σ₂ at 80° N. Still a circle — an enormous one." accent="vermilion" />
              </div>
            </Reveal>
          </div>

          <div data-step="area" className="flex min-h-[85vh] items-center">
            <Reveal>
              <h3 className="font-display text-subhead" style={{ color: 'var(--fg)', fontWeight: 460 }}>
                Area is the product
              </h3>
              <p className="mt-4 font-body text-body" style={{ color: 'var(--fg)' }}>
                Multiply the two stretches and you get the areal scale s = σ₁σ₂ — the determinant
                of A. Equal-area projections are exactly those with s = 1 everywhere. Turn on the
                <em> area </em> layer: the map is tinted by log₂ s, so each color step is a
                doubling. Mercator's equator sits at true scale; by 60°N the map is using four
                times the paper per square kilometer of Earth.
              </p>
              <details className="atlas-optional"><summary>Explore the mathematics</summary><EquationBlock
                className="mt-8"
                tex={String.raw`s \;=\; \det A \;=\; \sigma_1\,\sigma_2 \qquad\text{(equal-area } \Longleftrightarrow s \equiv 1\text{)}`}
                caption="Areal scale. An equal-area projection is a theorem about this number: it must be 1 at every point."
              /></details>
            </Reveal>
          </div>

          <div data-step="angle" className="flex min-h-[85vh] items-center">
            <Reveal>
              <h3 className="font-display text-subhead" style={{ color: 'var(--fg)', fontWeight: 460 }}>
                Angles are the difference
              </h3>
              <p className="mt-4 font-body text-body" style={{ color: 'var(--fg)' }}>
                The maximum angular deformation ω measures how badly the map bends angles — the
                gap between the two stretches. When σ₁ = σ₂ there is nothing to measure: ω = 0.
                Switch to the <em>angle</em> layer and Mercator reads a flat, honest zero from
                equator to clamp. That is its genius and its excuse.
              </p>
              <details className="atlas-optional"><summary>Explore the mathematics</summary><EquationBlock
                className="mt-8"
                tex={String.raw`\sin\frac{\omega}{2} \;=\; \frac{\sigma_1 - \sigma_2}{\sigma_1 + \sigma_2} \qquad\text{(conformal } \Longleftrightarrow \omega \equiv 0\text{)}`}
                caption="Maximum angular deformation (Tissot 1881). Zero everywhere defines the conformal projections."
              /></details>
              <p className="mt-6 pull-line text-pull">
                Area is the product; angle is the difference. No smooth map of the whole sphere
                nails both — that is chapter 01's theorem wearing numbers.
              </p>
            </Reveal>
          </div>

          <div data-step="sampling" className="flex min-h-[85vh] items-center">
            <Reveal>
              <h3 className="font-display text-subhead" style={{ color: 'var(--fg)', fontWeight: 460 }}>
                One more quiet decision: where to sample
              </h3>
              <p className="mt-4 font-body text-body" style={{ color: 'var(--fg)' }}>
                Every summary statistic on this site — RMS area error, median ω — is computed over{' '}
                <strong>5,001 points scattered on the sphere by a Fibonacci spiral</strong>: each
                point at longitude steps of the golden angle, 137.508°, at heights spaced so every
                point claims an equal patch of sphere. Why not a neat latitude–longitude grid?
                Because grid points huddle at the poles: a uniform grid weights the Arctic like a
                continent and the equator like an afterthought, and every "average distortion"
                would inherit that bias. Equal-area sampling is the map agenda applied to the
                measurement itself.
              </p>
              <figure className="mt-8 grid grid-cols-2 gap-4">
                {(
                  [
                    ['Fibonacci spiral — equal area per point', fibPts],
                    ['Uniform lat–lon grid — pole-biased', gridPts],
                  ] as const
                ).map(([cap, pts]) => (
                  <div key={cap} style={{ background: 'var(--bg-2)', border: '1px solid var(--hair)' }} className="p-3">
                    <svg viewBox="-1.1 -1.1 2.2 2.2" className="mx-auto block w-full max-w-[220px]" role="img" aria-label={cap}>
                      <circle cx="0" cy="0" r="1.02" fill="none" stroke="var(--hairline)" strokeWidth="0.02" />
                      {pts.map(([x, y], i) => (
                        <circle key={i} cx={x} cy={-y} r="0.022" fill="var(--accent)" opacity="0.75" />
                      ))}
                    </svg>
                    <figcaption className="mt-2 text-center font-ui text-caption" style={{ color: 'var(--fg-2)' }}>
                      {cap}
                    </figcaption>
                  </div>
                ))}
              </figure>
              <p className="mt-4 font-ui text-caption" style={{ color: 'var(--fg-2)' }}>
                Sampling scheme after González (2010); figures above use 220 points for legibility.
                Hover the stage toggles: geography, graticule, Tissot, area, angle — the overlays
                are the same numbers, drawn.
              </p>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  )
}
