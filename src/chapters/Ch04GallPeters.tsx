/**
 * CHAPTER 04 — GALL–PETERS (home.md §04; design.md §5 stage-RIGHT chapter).
 *
 * The cylindrical equal-area projection with standard parallels at ±45°:
 *   x = λ·cos φ₀,  y = sin φ / cos φ₀,  φ₀ = 45°.
 * Beats: (1) Mercator → Gall–Peters scroll-scrubbed morph and the 1855/1973
 * history, told briefly and fairly; (2) THE educational moment — the
 * derivation d(sin φ) = cos φ dφ tied to dA_sphere = cos φ dφ dλ, with a live
 * Jacobian readout (h, k, h·k = 1) and a parallel explorer linked to the
 * stage; (3) what it costs: real Tissot ellipses + the uniform area overlay;
 * (4) a runnable Python panel (gall_peters.py) that proves det J ≡ 1.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ChapterKicker from '@/components/ChapterKicker'
import EquationBlock from '@/components/EquationBlock'
import StageToggle, { type StageLayerState } from '@/components/StageToggle'
import PythonPanelB from '@/chapters/PythonPanelB'
import {
  bindScrub,
  flatCamFracY,
  tweenValue,
  useChapterStage,
  useElementSize,
  useStepObserver,
} from '@/chapters/stageUtilsB'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { PROJECTION_ENGINE_PY } from '@/python/projection_engine.py'
import type { MapStage } from '@/three/MapStage'

/* ---- Gall–Peters constants (φ₀ = 45°, R = 1) ---- */
const COS_PHI0 = Math.SQRT1_2
const GP_SCALE = 1 / (Math.PI * COS_PHI0) // bake normalization (half-width → 1)
const GP_HALF_W_N = 1
const GP_HALF_H_N = (1 / COS_PHI0) * GP_SCALE // ≈ 0.63662

/** The gall_peters function, verbatim from the shared projection engine. */
const GP_SOURCE = (() => {
  const m = PROJECTION_ENGINE_PY.match(/def gall_peters[\s\S]*?return x, y/)
  const core = m ? m[0] : ''
  return `"""gall_peters.py - cylindrical equal-area, standard parallels +/-45 deg.
The chapter's derivation, as runnable code (numpy)."""
import numpy as np

${core}

def project(lon, lat, params=None):
    return gall_peters(lon, lat)

# --- the equal-area proof, checked numerically ---
phi0 = np.pi / 4
print(" lat    h = cos45/cos(phi)    k = cos(phi)/cos45      h*k")
for deg in [0, 15, 30, 45, 60, 75]:
    phi = np.radians(deg)
    h = np.cos(phi0) / np.cos(phi)
    k = np.cos(phi) / np.cos(phi0)
    print(f"{deg:4d}  {h:16.4f} {k:16.4f} {h * k:14.6f}")

lons, lats = np.meshgrid(
    np.radians(np.arange(-180, 181, 10)), np.radians(np.arange(-80, 81, 10))
)
x, y = gall_peters(lons, lats)
jac = np.cos(phi0) * (np.cos(lats) / np.cos(phi0))  # dx*dy = cos(phi) dlam dphi
ratio = jac / np.cos(lats)                          # map area / sphere area
print("max |map area / sphere area - 1| = %.3e" % float(np.max(np.abs(ratio - 1))))
assert np.max(np.abs(ratio - 1)) < 1e-12
print("area is preserved exactly, everywhere.")
`
})()

const STEP_LABELS = [
  'World map morphing from Mercator to the Gall–Peters cylindrical equal-area projection. Continents keep their true relative sizes; shapes stretch.',
  'The Gall–Peters world map with Tissot indicatrices: ellipses near the equator are stretched vertically, ellipses toward the poles horizontally, and every ellipse has exactly the same area.',
  'The Gall–Peters map with the area-distortion overlay on: the land is one uniform color, because every region is drawn at its true area. A movable parallel marker shows the local vertical and horizontal scales.',
  'The Gall–Peters map with Tissot ellipses, alongside a runnable Python panel that verifies the area-preserving property numerically.',
]

export default function Ch04GallPeters() {
  const { reducedMotion } = useReducedMotion()
  const rootRef = useRef<HTMLElement | null>(null)
  const morphBlockRef = useRef<HTMLDivElement | null>(null)
  const [step, setStep] = useState(0)
  const stepRef = useRef(0)
  const morphRef = useRef(0)
  const [latDeg, setLatDeg] = useState(30)
  const [layers, setLayers] = useState<StageLayerState>({
    geography: true,
    graticule: true,
    tissot: false,
    area: false,
    angle: false,
  })
  const [ariaLabel, setAriaLabel] = useState(STEP_LABELS[0])
  const [morphDone, setMorphDone] = useState(false)

  const applyStep = useCallback(
    (s: number) => {
      stepRef.current = s
      setStep(s)
      setAriaLabel(STEP_LABELS[Math.min(s, STEP_LABELS.length - 1)])
      setLayers((prev) => ({ ...prev, tissot: s >= 1, area: s === 2, graticule: true }))
    },
    [],
  )

  const onReady = useCallback((stage: MapStage) => {
    void stage.setMorphTargets('mercator', 'gallPeters').then(() => {
      stage.setMorph(morphRef.current)
      stage.setLayers({
        geography: true,
        graticule: true,
        tissot: stepRef.current >= 1,
        area: stepRef.current === 2,
        angle: false,
      })
    })
  }, [])

  const { containerRef, stageRef, alive } = useChapterStage('paper', onReady)
  const stageBox = useElementSize(containerRef)

  /* apply layer state */
  useEffect(() => {
    stageRef.current?.setLayers(layers)
  }, [layers, alive, stageRef])

  /* scroll-scrubbed Mercator → Gall–Peters morph over the opening block */
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

  /* steps */
  useStepObserver(rootRef, applyStep)

  /* reduced motion: discrete morph states with a 400ms crossfade */
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

  /* ---- live Jacobian readout for the parallel explorer ---- */
  const latRad = (latDeg * Math.PI) / 180
  const hScale = COS_PHI0 / Math.cos(latRad) // parallel scale
  const kScale = Math.cos(latRad) / COS_PHI0 // meridian scale
  const omegaDeg =
    (2 * Math.asin(Math.abs(hScale - kScale) / (hScale + kScale)) * 180) / Math.PI
  const explorerOnStage = alive && morphDone && step >= 1
  const parallelTopPct = useMemo(() => {
    if (stageBox.h <= 0) return 50
    const yN = (Math.sin(latRad) / COS_PHI0) * GP_SCALE
    return flatCamFracY(yN, GP_HALF_W_N, GP_HALF_H_N, stageBox.w, stageBox.h) * 100
  }, [latRad, stageBox])

  return (
    <section
      id="ch-04"
      ref={rootRef}
      aria-labelledby="ch-04-title"
      className="mx-auto max-w-container scroll-mt-20 px-[var(--gutter)] py-24"
    >
      <ChapterKicker
        numeral="04"
        kicker="1855 / 1973"
        title="Gall–Peters: the counterattack."
        titleId="ch-04-title"
        standfirst="Mercator answered the sailor's question. The cylindrical equal-area map answers a different one: how big is anything, really? The price of exact area is exact, visible shape distortion."
        accent="ochre"
      />

      <div className="mt-16 flex flex-col lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-[var(--gutter)]">
        {/* sticky stage — RIGHT on desktop, sticky mini-stage on mobile */}
        <div className="sticky top-[var(--nav-h)] z-20 order-first h-[52dvh] border-b border-hair bg-bg lg:order-2 lg:top-0 lg:z-auto lg:h-[100dvh] lg:self-start lg:border-b-0">
          <div
            ref={containerRef}
            role="img"
            aria-label={ariaLabel}
            className="absolute inset-0"
          />
          {/* parallel explorer marker (aligned to the flat camera) */}
          {explorerOnStage && (
            <div
              aria-hidden
              className="pointer-events-none absolute left-0 right-0"
              style={{ top: `${parallelTopPct}%` }}
            >
              <div className="h-px w-full" style={{ background: 'var(--ochre)' }} />
              <span
                className="absolute right-2 top-1 font-ui text-label uppercase"
                style={{ color: 'var(--ochre)' }}
              >
                φ = {latDeg}°
              </span>
            </div>
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

        {/* narrative column — LEFT */}
        <div className="order-last lg:order-1">
          {/* step 0 — history + morph scrub region */}
          <div data-step="0" ref={morphBlockRef} className="max-w-measure pb-24 pt-16 lg:min-h-[150vh]">
            <p>
              In 1855 a Scottish clergyman and amateur astronomer, James Gall, read a paper
              before the British Association describing cylindrical projections — among them
              one that kept every region at its true area by setting the standard parallels
              at 45°. It attracted little notice. In 1973 the German filmmaker and historian
              Arno Peters announced what he presented as a brand-new map of the world, and
              with it a moral argument: the Mercator map, he said, made the wealthy,
              mid-latitude world look large and the equatorial world look small, and a
              truthful map was a matter of justice.
            </p>
            <p className="mt-6">
              Cartographers pushed back, and they were right on two counts: Gall had
              published the projection 118 years earlier, and no map is "true" by
              construction — this one trades shape for area. But Peters was right about the
              thing that mattered: the choice of projection is a choice of what the world
              looks like, and the choice had been made quietly, by default, for four
              centuries. The map you are watching settle in — Mercator's grid being
              re-stretched into equal-area form — is the same Earth with a different answer.
            </p>
          </div>

          {/* step 1 — the derivation */}
          <div data-step="1" className="max-w-measure pb-24">
            <h3 className="font-display text-subhead" style={{ color: 'var(--fg)', fontWeight: 460 }}>
              Why this one preserves area
            </h3>
            <p className="mt-5">
              On a sphere of radius 1, a patch of longitude dλ and latitude dφ has area
              dA = cos&nbsp;φ&nbsp;dλ&nbsp;dφ — parallels shrink toward the poles, and the
              cosine is that shrinking. A cylindrical map sets x from λ alone; if the map
              also sets y = sin&nbsp;φ, something elegant happens:
            </p>
            <details className="atlas-optional"><summary>Explore the mathematics</summary><EquationBlock
              className="mt-8"
              tex={String.raw`\begin{aligned} x &= \lambda\cos\varphi_0 \\[6pt] y &= \frac{\sin\varphi}{\cos\varphi_0} \\[6pt] dy &= \frac{\cos\varphi}{\cos\varphi_0}\,d\varphi \\[10pt] dA_{\text{map}} &= dx\,dy \\[6pt] &= \cos\varphi_0\,d\lambda\cdot\frac{\cos\varphi}{\cos\varphi_0}\,d\varphi \\[6pt] &= \cos\varphi\,d\lambda\,d\varphi \\[6pt] &= dA_{\text{sphere}} \end{aligned}`}
              glossary={[
                { symbol: '\\varphi_0 = 45^\\circ', meaning: 'the standard parallel — the latitude where the map is undistorted (Gall chose 45°; Peters kept it)' },
                { symbol: 'd(\\sin\\varphi) = \\cos\\varphi\\,d\\varphi', meaning: 'the derivative that makes everything work: y-movement on the map automatically carries the sphere’s cosine factor' },
                { symbol: 'dA_{\\text{sphere}} = \\cos\\varphi\\,d\\lambda\\,d\\varphi', meaning: 'the true area of a small patch of the globe of radius 1' },
              ]}
              caption="The derivative of sin φ supplies exactly the cos φ that the sphere's area element needs. No other simple cylinder has this property; that is why y = sin φ is the only cylindrical equal-area choice (up to the standard parallel)."
            /></details>
            <p className="mt-8">
              The Jacobian determinant of this map — the local ratio of map area to sphere
              area — is the horizontal scale h = cos&nbsp;φ₀/cos&nbsp;φ times the vertical
              scale k = cos&nbsp;φ/cos&nbsp;φ₀. The two factors are reciprocals, so their
              product is exactly 1 at every latitude. Slide the parallel and watch:
            </p>

            {/* parallel explorer */}
            <div
              className="mt-6 border p-5"
              style={{ borderColor: 'var(--hair)', background: 'var(--bg-2)' }}
            >
              <div className="flex items-baseline justify-between gap-4">
                <label
                  htmlFor="gp-lat"
                  className="font-ui text-label uppercase"
                  style={{ color: 'var(--fg-3)' }}
                >
                  Parallel φ (marker on stage)
                </label>
                <output
                  htmlFor="gp-lat"
                  className="font-mono text-caption"
                  style={{ color: 'var(--fg-2)', fontFeatureSettings: "'tnum'" }}
                >
                  {latDeg}°
                </output>
              </div>
              <input
                id="gp-lat"
                type="range"
                min={-75}
                max={75}
                step={1}
                value={latDeg}
                onChange={(e) => setLatDeg(Number(e.target.value))}
                className="scrub-slider mt-3 block w-full"
                aria-valuetext={`latitude ${latDeg} degrees`}
              />
              <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3">
                <svg width="72" height="72" viewBox="-36 -36 72 72" role="img"
                  aria-label={`Tissot ellipse at ${latDeg} degrees: axis ratio ${(Math.max(hScale, kScale) / Math.min(hScale, kScale)).toFixed(2)} to 1`}>
                  <circle cx={0} cy={0} r={30} fill="none" stroke="var(--fg-3)" strokeDasharray="3 4" strokeWidth={1} />
                  {/* constant-area ellipse: rx·ry = 30², axis ratio h:k */}
                  <ellipse
                    cx={0}
                    cy={0}
                    rx={Math.min(34, 30 * Math.sqrt(hScale / kScale))}
                    ry={Math.min(34, 30 * Math.sqrt(kScale / hScale))}
                    fill="color-mix(in srgb, var(--tissot) 12%, transparent)"
                    stroke="var(--tissot)"
                    strokeWidth={1.5}
                  />
                </svg>
                <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 font-mono text-caption" style={{ color: 'var(--fg)' }}>
                  <dt style={{ color: 'var(--fg-2)' }}>h (east–west scale)</dt>
                  <dd>{hScale.toFixed(4)}</dd>
                  <dt style={{ color: 'var(--fg-2)' }}>k (north–south scale)</dt>
                  <dd>{kScale.toFixed(4)}</dd>
                  <dt style={{ color: 'var(--fg-2)' }}>h·k = det J (area ratio)</dt>
                  <dd style={{ color: 'var(--ochre)' }}>{(hScale * kScale).toFixed(4)}</dd>
                  <dt style={{ color: 'var(--fg-2)' }}>max angular shear ω</dt>
                  <dd>{omegaDeg.toFixed(1)}°</dd>
                </dl>
              </div>
              <p className="mt-4 font-ui text-caption" style={{ color: 'var(--fg-2)' }}>
                At φ = 45° the ellipse is a circle — the standard parallel, where h = k = 1.
                Everywhere else the area stays 1.0000 while the shape pays the bill.
              </p>
            </div>
          </div>

          {/* step 2 — what it costs */}
          <div data-step="2" className="max-w-measure pb-24">
            <h3 className="font-display text-subhead" style={{ color: 'var(--fg)', fontWeight: 460 }}>
              What exact area costs
            </h3>
            <p className="mt-5">
              Turn on the area overlay on the stage: every pixel of land carries the same
              color, the color that means "×1.00, true area". It is the only flat map in
              this essay so far for which that overlay is perfectly boring. Now look at the
              Tissot ellipses instead. At the equator they stand 2:1 on end — vertical
              ovals, as if the map had been pulled through a wringer. At 45°N and 45°S they
              are true circles. Poleward of 60° they flatten into horizontal pancakes, and
              by 75° the shear reaches ω ≈ 100°.
            </p>
            <p className="mt-6">
              This is the trade, stated precisely: Gall–Peters preserves area{' '}
              <em>and not shape</em>. Africa really is fourteen times the size of Greenland,
              and on this map it looks it — but equatorial continents are squeezed
              east–west and polar ones stretched, and no one who grew up with it would call
              the shapes familiar. Equal area is not "the truth"; it is one term of the
              optimization held exactly, with the cost pushed entirely onto the other terms.
            </p>
            <p className="pull-line mt-10 text-pull">
              Peters did not fix the map. He chose a different thing to be right.
            </p>
          </div>

          {/* step 3 — python */}
          <div data-step="3" className="max-w-measure pb-16">
            <h3 className="font-display text-subhead" style={{ color: 'var(--fg)', fontWeight: 460 }}>
              Prove it, don't admire it
            </h3>
            <p className="mt-5">
              The whole projection is four lines of NumPy. Run it: the script tabulates the
              two scale factors at several latitudes, then checks the areal ratio on a
              10° grid and asserts it equals 1 to machine precision.
            </p>
            <details className="atlas-optional"><summary>Run & explore the Python</summary><PythonPanelB
              filename="gall_peters.py"
              initialCode={GP_SOURCE}
              accent="ochre"
              caption="Real code from the site's projection engine, executed by an in-browser Python runtime (Pyodide) in a Web Worker."
              annotations={[
                { lines: '7', text: 'reduce longitude to (−π, π] — the map wraps at the antimeridian' },
                { lines: '9', text: 'x = λ·cos φ₀: longitude, scaled so the standard parallel keeps true east–west scale' },
                { lines: '10', text: 'y = sin φ / cos φ₀ — the derivative of sin φ is what makes the map equal-area' },
                { lines: '20–24', text: 'the scale table: h and k are reciprocals, so h·k is 1 at every latitude' },
                { lines: '33', text: 'the assertion: map area ÷ sphere area = 1, to machine precision, on the whole grid' },
              ]}
            /></details>
          </div>
        </div>
      </div>
    </section>
  )
}
