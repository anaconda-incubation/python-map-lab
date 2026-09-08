import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import ChapterKicker from '@/components/ChapterKicker'
import DataCallout from '@/components/DataCallout'
import EquationBlock from '@/components/EquationBlock'
import ScrubSlider from '@/components/ScrubSlider'
import PythonPanel, { type PanelAnnotation } from '@/chapters/PythonPanel'
import { PROJECTION_ENGINE_PY } from '@/python/projection_engine.py'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useChapterStage, useScrollSteps, Reveal, StageShell } from '@/chapters/stage-shared'

/**
 * CHAPTER 03 · A MERCATOR WORLD (design.md §5: stage LEFT — the first side
 * alternation). Vermilion accent. 1569 history, rhumb-line constant-bearing
 * demo, conformality, k = sec φ latitude instrument, Greenland vs Africa,
 * poles at infinity + the ±85° clamp, and PythonPanel #1 (mercator.py).
 * Mercator is treated as what it is: not wrong — optimizing something other
 * than area.
 */

const D2R = Math.PI / 180
const R2D = 180 / Math.PI
const mercY = (latDeg: number) => Math.log(Math.tan(Math.PI / 4 + (latDeg * D2R) / 2))
const MERC_Y_MAX = mercY(85) // the design clamp

/* ---------- the real code that runs (extracted from the shipped engine) ---------- */

const ENGINE_LINES = PROJECTION_ENGINE_PY.split('\n')
// The module header + Mercator section is exactly what the worker executes.
const MERCATOR_SOURCE = ENGINE_LINES.slice(0, ENGINE_LINES.findIndex((l) => l.startsWith('def gall_peters')))
  .join('\n')
  .trimEnd()
const PANEL_CODE =
  MERCATOR_SOURCE +
  `

project = mercator  # the worker calls project(lon, lat[, params])

for deg in (0, 30, 60, 80):
    k = 1.0 / np.cos(np.radians(deg))   # local linear scale, k = sec φ
    print(f"lat {deg:3d}: linear x{k:.2f}  area x{k * k:.2f}")`

function lineOf(needle: string): number {
  return PANEL_CODE.split('\n').findIndex((l) => l.includes(needle)) + 1
}
const L_CLAMP = lineOf('MERCATOR_MAX_LAT =')
const L_CLIP = lineOf('np.clip')
const L_X = lineOf('x = lam')
const L_Y = lineOf('np.log(np.tan')

/* ---------- rhumb-line math (Lisbon → New York) ---------- */

const A = { lon: -9.14, lat: 38.72, name: 'Lisbon' }
const B = { lon: -73.99, lat: 40.71, name: 'New York' }

/** Rhumb line: constant bearing — linear in Mercator (λ, y) space. */
function rhumbPoint(t: number): { lon: number; lat: number } {
  const y = mercY(A.lat) + (mercY(B.lat) - mercY(A.lat)) * t
  const lon = A.lon + (B.lon - A.lon) * t
  // invert y = ln tan(π/4 + φ/2): φ = π/2 − 2 atan(e^(−y))
  const lat = (Math.PI / 2 - 2 * Math.atan(Math.exp(-y))) * R2D
  return { lon, lat }
}

/** Great circle: slerp between unit-sphere positions. */
function gcPoint(t: number): { lon: number; lat: number } {
  const v = (p: { lon: number; lat: number }) => {
    const la = p.lat * D2R
    const lo = p.lon * D2R
    return [Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)]
  }
  const a = v(A)
  const b = v(B)
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
  const om = Math.acos(dot)
  const s1 = Math.sin((1 - t) * om) / Math.sin(om)
  const s2 = Math.sin(t * om) / Math.sin(om)
  const x = s1 * a[0] + s2 * b[0]
  const y = s1 * a[1] + s2 * b[1]
  const z = s1 * a[2] + s2 * b[2]
  return { lon: Math.atan2(z, x) * R2D, lat: Math.asin(Math.min(1, Math.max(-1, y))) * R2D }
}

type XY = [number, number]

/** Project (lon,lat) degrees into each pane's local coordinates. */
function mercatorPane(p: { lon: number; lat: number }): XY {
  return [(p.lon + 82) / 76, (mercY(p.lat) - 0.55) / 1.1] // normalized, y up
}
const ORTHO0 = { lon: -42, lat: 39 }
function globePane(p: { lon: number; lat: number }): XY {
  const la = p.lat * D2R
  const lo = (p.lon - ORTHO0.lon) * D2R
  const la0 = ORTHO0.lat * D2R
  return [Math.cos(la) * Math.sin(lo), Math.cos(la0) * Math.sin(la) - Math.sin(la0) * Math.cos(la) * Math.cos(lo)]
}

function pathFrom(fn: (t: number) => { lon: number; lat: number }, pane: (p: { lon: number; lat: number }) => XY, n = 96): string {
  let d = ''
  for (let i = 0; i <= n; i++) {
    const [x, y] = pane(fn(i / n))
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(4)},${(-y).toFixed(4)}`
  }
  return d
}

function RhumbDemo() {
  const { reducedMotion } = useReducedMotion()
  const [t, setT] = useState(0)
  const sailTween = useRef<gsap.core.Tween | null>(null)
  const prog = useRef({ v: 0 })

  useEffect(
    () => () => {
      sailTween.current?.kill()
    },
    [],
  )

  const sail = useCallback(() => {
    sailTween.current?.kill()
    if (reducedMotion) {
      setT(1)
      return
    }
    prog.current.v = t >= 1 ? 0 : t
    sailTween.current = gsap.to(prog.current, {
      v: 1,
      duration: 6 * (1 - prog.current.v),
      ease: 'none',
      onUpdate: () => setT(prog.current.v),
    })
  }, [reducedMotion, t])

  const paths = useMemo(
    () => ({
      rhumbMerc: pathFrom(rhumbPoint, mercatorPane),
      gcMerc: pathFrom(gcPoint, mercatorPane),
      rhumbGlobe: pathFrom(rhumbPoint, globePane),
      gcGlobe: pathFrom(gcPoint, globePane),
    }),
    [],
  )
  const ship = rhumbPoint(t)
  const shipMerc = mercatorPane(ship)
  const shipGlobe = globePane(ship)

  const dot = (xy: XY, key: string) => (
    <circle key={key} cx={xy[0]} cy={-xy[1]} r="0.014" fill="var(--accent)" stroke="var(--paper)" strokeWidth="0.006" />
  )

  return (
    <figure
      className="p-4"
      style={{ background: 'var(--bg-2)', border: '1px solid var(--hair)' }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Mercator pane */}
        <div>
          <svg viewBox="-0.6 -0.4 1.7 0.9" className="block w-full" role="img" aria-label="On Mercator, the constant-bearing route is a straight vermilion line; the great circle is a dashed curve bowed north.">
            {[30, 40, 50].map((lat) => {
              const y = -((mercY(lat) - 0.55) / 1.1)
              return <line key={lat} x1="-0.6" x2="1.1" y1={y} y2={y} stroke="var(--hairline)" strokeWidth="0.004" />
            })}
            {[-60, -40, -20, 0].map((lon) => {
              const x = (lon + 45) / 14
              return <line key={lon} y1="-0.4" y2="0.5" x1={x} x2={x} stroke="var(--hairline)" strokeWidth="0.004" />
            })}
            <path d={paths.gcMerc} fill="none" stroke="var(--ink-2)" strokeWidth="0.008" strokeDasharray="0.03 0.02" />
            <path d={paths.rhumbMerc} fill="none" stroke="var(--accent)" strokeWidth="0.011" />
            {dot(shipMerc, 'ship-m')}
          </svg>
          <p className="mt-1 text-center font-ui text-label uppercase" style={{ color: 'var(--fg-3)' }}>
            On Mercator — the rhumb is straight
          </p>
        </div>
        {/* Globe pane */}
        <div>
          <svg viewBox="-1.05 -1.05 2.1 2.1" className="block w-full" role="img" aria-label="On the globe, the same constant-bearing route is a long spiral-like curve; the great circle is shorter.">
            <circle cx="0" cy="0" r="1" fill="none" stroke="var(--hairline)" strokeWidth="0.012" />
            <path d={paths.gcGlobe} fill="none" stroke="var(--ink-2)" strokeWidth="0.012" strokeDasharray="0.045 0.03" />
            <path d={paths.rhumbGlobe} fill="none" stroke="var(--accent)" strokeWidth="0.016" />
            {dot(shipGlobe, 'ship-g')}
          </svg>
          <p className="mt-1 text-center font-ui text-label uppercase" style={{ color: 'var(--fg-3)' }}>
            On the globe — the rhumb is the long way
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          onClick={sail}
          className="shrink-0 rounded-sm px-3.5 py-1.5 font-ui text-label uppercase text-paper transition-transform duration-micro ease-atlas active:scale-[0.97]"
          style={{ background: 'var(--accent)' }}
        >
          Sail the rhumb
        </button>
        <ScrubSlider
          className="grow"
          value={t}
          onChange={(v) => {
            sailTween.current?.kill()
            setT(v)
          }}
          label="Voyage progress — Lisbon to New York, constant bearing"
        />
      </div>
      <figcaption className="mt-3 font-ui text-caption" style={{ color: 'var(--fg-2)' }}>
        The solid vermilion line holds one compass bearing, start to finish (≈ 278°): straight on
        Mercator by construction, a lengthening spiral on the globe. The dashed great circle is
        ~4% shorter but demands a bearing that changes every hour. In 1569, steering mattered more
        than miles.
      </figcaption>
    </figure>
  )
}

/* ---------- latitude scale instrument (k = sec φ) ---------- */

function MercatorLatitudeGauge({
  lat,
  pulse,
  compact = false,
}: {
  lat: number
  /** latitude band [from, to] to pulse, or null */
  pulse?: [number, number] | null
  compact?: boolean
}) {
  const H = compact ? 300 : 420
  const yy = (deg: number) => H / 2 - (mercY(deg) / MERC_Y_MAX) * (H / 2 - 14)
  const pulseRect = pulse
    ? {
        y: yy(Math.min(pulse[1], 85)),
        h: Math.abs(yy(pulse[0]) - yy(Math.min(pulse[1], 85))),
      }
    : null
  return (
    <svg
      viewBox={`0 0 120 ${H}`}
      className="block h-auto w-full"
      role="img"
      aria-label={`Mercator latitude gauge. At ${lat.toFixed(0)} degrees latitude the local linear scale is ${(1 / Math.cos(lat * D2R)).toFixed(2)}.`}
    >
      {/* map body */}
      <rect x="30" y={yy(85)} width="52" height={yy(-85) - yy(85)} fill="var(--paper-2)" stroke="var(--hairline)" strokeWidth="1" />
      {[-60, -30, 0, 30, 60].map((d) => (
        <g key={d}>
          <line x1="30" x2="82" y1={yy(d)} y2={yy(d)} stroke="var(--hairline)" strokeWidth="0.75" />
          <text x="24" y={yy(d) + 3} textAnchor="end" fontSize="9" fill="var(--ink-3)" fontFamily="Inter, sans-serif">
            {d}°
          </text>
        </g>
      ))}
      {/* pulse band (annotation hover link) */}
      {pulseRect && (
        <rect x="30" y={pulseRect.y} width="52" height={pulseRect.h} fill="var(--accent)" opacity="0.22" className="animate-pulse" />
      )}
      {/* current latitude marker */}
      <line x1="26" x2="94" y1={yy(lat)} y2={yy(lat)} stroke="var(--accent)" strokeWidth="2" />
      <text x="96" y={yy(lat) + 3} fontSize="9" fill="var(--accent)" fontFamily="JetBrains Mono, monospace">
        {lat.toFixed(0)}°
      </text>
      <text x="56" y={yy(85) - 6} textAnchor="middle" fontSize="8.5" fill="var(--ink-3)" fontFamily="Inter, sans-serif" letterSpacing="1">
        85° CLAMP
      </text>
    </svg>
  )
}

/* ---------- chapter ---------- */

type StepId = 'history' | 'rhumb' | 'conformal' | 'scale' | 'greenland' | 'poles' | 'python'

const STEP_TEXT: Record<StepId | 'intro', string> = {
  intro: 'A flat Mercator world map with its graticule, parchment continents on dark blue oceans.',
  history: 'Mercator world map, drawn as a printed plate beside the 1569 original.',
  rhumb: 'Mercator map: a straight line anywhere on it is a line of constant compass bearing.',
  conformal: 'Mercator map with Tissot circles: perfect circles everywhere — angles and local shapes are exact.',
  scale: 'Mercator map tinted by areal scale: true at the equator, doubling step by step toward the poles.',
  greenland: 'Mercator map: Greenland drawn nearly the size of Africa, though Africa is fourteen times larger.',
  poles: 'Mercator map cut off near 85 degrees latitude; the poles themselves lie at infinity.',
  python: 'Mercator map beside the runnable Python code that generates it.',
}

export default function Ch03Mercator() {
  const rootRef = useRef<HTMLElement | null>(null)
  const { containerRef, stageRef, generation } = useChapterStage('paper')
  const [stateText, setStateText] = useState(STEP_TEXT.intro)
  const [lat, setLat] = useState(45)
  const [pulse, setPulse] = useState<[number, number] | null>(null)

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || generation === 0) return
    let cancelled = false
    void stage.setMorphTargets('globe', 'mercator').then(() => {
      if (cancelled || stageRef.current !== stage) return
      stage.setMorph(1)
      stage.setLayers({ geography: true, graticule: true })
      stage.fitToProjection('mercator')
    })
    return () => {
      cancelled = true
    }
  }, [generation, stageRef])

  const onStep = useCallback(
    (step: string) => {
      const s = step as StepId
      if (STEP_TEXT[s]) setStateText(STEP_TEXT[s])
      const stage = stageRef.current
      if (!stage) return
      switch (s) {
        case 'conformal':
          stage.setLayers({ tissot: true, angle: true, area: false, graticule: true })
          break
        case 'scale':
        case 'greenland':
          stage.setLayers({ area: true, angle: false, tissot: true, graticule: true })
          break
        default:
          stage.setLayers({ area: false, angle: false, tissot: s === 'python', graticule: true })
      }
    },
    [stageRef],
  )
  useScrollSteps(rootRef, onStep)

  /* annotation hover → pulse latitude bands on the panel gauge (§8 three-way link) */
  const onAnnotationHover = useCallback((ann: PanelAnnotation | null) => {
    if (!ann) {
      setPulse(null)
      return
    }
    const [a] = ann.lines
    if (a === L_Y) setPulse([60, 85])
    else if (a === L_CLAMP || a === L_CLIP) setPulse([80, 85])
    else setPulse(null)
  }, [])

  const annotations = useMemo<PanelAnnotation[]>(
    () => [
      {
        lines: [L_CLAMP, L_CLAMP],
        title: 'the ±85° clamp',
        body: 'The poles project to infinity, so the map gives up at ±85° — hover this line and watch the top of the gauge ignite. Beyond the clamp Mercator is unusable for general reference.',
      },
      {
        lines: [L_CLIP, L_CLIP],
        title: 'clipping φ',
        body: 'np.clip enforces the clamp: ask for 90° and you get 85°. An honest function admits where it ends.',
      },
      {
        lines: [L_X, L_X],
        title: 'x = λ — meridians stay vertical and evenly spaced',
        body: 'Longitude maps to x unchanged. Every meridian becomes a vertical line, every parallel a horizontal one: the grid is a rectangle. That is what makes compass bearings straight.',
      },
      {
        lines: [L_Y, L_Y],
        title: 'y = log tan(π/4 + φ/2) — the conformal stretch',
        body: 'This single line is Mercator. It stretches the vertical axis by exactly sec φ so that local shapes survive — and it is why the high latitudes (the band now pulsing on the gauge) swell out of all proportion.',
      },
      {
        lines: [lineOf('project = mercator'), lineOf('print(f"lat')],
        title: 'the demo driver',
        body: 'The worker evaluates project(lon, lat) on the sample points below; the loop prints k = sec φ and k² at four latitudes. Run it and check 60° against the callouts above.',
      },
    ],
    [],
  )

  const k = 1 / Math.cos(lat * D2R)

  return (
    <section
      ref={rootRef}
      id="ch-03"
      aria-labelledby="ch-03-title"
      className="relative mx-auto max-w-container scroll-mt-20 px-[var(--gutter)] pb-24 pt-16"
    >
      <div className="grid grid-cols-1 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,42%)] lg:gap-x-16">
        {/* Sticky stage LEFT (§5 alternation) — mini-stage first on mobile */}
        <div className="sticky top-[var(--nav-h)] z-10 order-first h-[55vh] lg:top-0 lg:h-[100dvh] lg:self-start">
          <StageShell containerRef={containerRef} ariaLabel={stateText} stateText={stateText} className="h-full">
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px" style={{ background: 'var(--hair)' }} aria-hidden />
          </StageShell>
        </div>

        {/* Narrative RIGHT */}
        <div className="max-w-measure lg:col-start-2 lg:pt-16">
          <div data-step="intro" className="flex min-h-[80vh] flex-col justify-center">
            <ChapterKicker
              numeral="03"
              kicker="A MERCATOR WORLD"
              title="The map that won."
              titleId="ch-03-title"
              standfirst="1569. A projection built for sailors becomes the default picture of the world — and the world believes it."
              accent="vermilion"
            />
            <Reveal className="mt-10" delayMs={200}>
              <p className="font-body text-body" style={{ color: 'var(--fg)' }}>
                Gerardus Mercator did not set out to deceive anyone. He set out to save sailors. His
                1569 world map — <em>Nova et aucta orbis terrae descriptio ad usum navigantium</em>,
                "new and enlarged description of the Earth, for the use of navigators" — announces
                its optimization target in its title. Not area. Not shape. Bearings.
              </p>
            </Reveal>
          </div>

          <div data-step="history" className="flex min-h-[90vh] items-center">
            <Reveal>
              <figure>
                <img
                  src={`${import.meta.env.BASE_URL}mercator-1569.svg`}
                  alt="Modern illustrative reconstruction inspired by Mercator’s 1569 map, with stylized continents and rhumb lines."
                  className="block w-full"
                  style={{ border: '1px solid var(--hair)' }}
                  loading="lazy"
                />
                <figcaption className="mt-3 font-ui text-caption" style={{ color: 'var(--fg-2)' }}>
                  Modern illustrative reconstruction inspired by the 1569 map, not a scan of the original.
                  The rhumb-line web shows its purpose as a navigation instrument.
                </figcaption>
              </figure>
              <p className="mt-6 font-body text-body" style={{ color: 'var(--fg)' }}>
                Four and a half centuries later the same mathematics underlies every web map you
                have ever pinched. Web Mercator is the spherical special case of Mercator's
                projection, clamped near ±85.05° — a detail chapter 02's engine and this chapter's
                code both honor. Mercator is not wrong. It is optimizing something other than area.
              </p>
            </Reveal>
          </div>

          <div data-step="rhumb" className="flex min-h-[100vh] items-center">
            <Reveal className="w-full">
              <h3 className="font-display text-subhead" style={{ color: 'var(--fg)', fontWeight: 460 }}>
                Why sailors loved it: one bearing, held forever
              </h3>
              <p className="mt-4 font-body text-body" style={{ color: 'var(--fg)' }}>
                A <em>rhumb line</em> is a path of constant compass bearing. On a globe it curves —
                spiral toward the pole if you follow it long enough. Mercator's construction makes
                every rhumb line straight: draw a ruler between two ports, measure one angle, and
                steer it for three weeks. No other property mattered at sea.
              </p>
              <div className="mt-6">
                <RhumbDemo />
              </div>
            </Reveal>
          </div>

          <div data-step="conformal" className="flex min-h-[90vh] items-center">
            <Reveal>
              <h3 className="font-display text-subhead" style={{ color: 'var(--fg)', fontWeight: 460 }}>
                The price is exact, and exactly computed
              </h3>
              <p className="mt-4 font-body text-body" style={{ color: 'var(--fg)' }}>
                Straight rhumbs plus right-angle crossings of meridians and parallels force the map
                to be <em>conformal</em>: local shapes and angles are preserved exactly. On the
                stage, every Tissot circle is a perfect circle; the angle overlay reads zero
                everywhere. The requirement is one equation — the vertical stretch must equal the
                horizontal shrink of the parallels, sec φ — and integrating it produces Mercator's
                formula on the spot.
              </p>
              <details open className="atlas-optional python-math"><summary>The mathematics behind the map</summary><EquationBlock
                className="mt-8"
                tex={String.raw`\frac{dy}{d\varphi} = \frac{1}{\cos\varphi}\frac{dx}{d\lambda} = \sec\varphi \;\;\Longrightarrow\;\; y = \int_0^{\varphi} \sec u \, du = \ln\tan\!\left(\frac{\pi}{4} + \frac{\varphi}{2}\right)`}
                caption="Conformality is a differential equation. Its solution is the 1569 projection."
                glossary={[
                  { symbol: String.raw`\sec\varphi`, meaning: 'how much a degree of longitude shrinks on the sphere — the map must match it vertically' },
                  { symbol: String.raw`\ln\tan(\pi/4 + \varphi/2)`, meaning: "Mercator's y: the integral of sec φ, and the source of every polar exaggeration" },
                ]}
              /></details>
            </Reveal>
          </div>

          <div data-step="scale" className="flex min-h-[100vh] items-center">
            <Reveal className="w-full">
              <h3 className="font-display text-subhead" style={{ color: 'var(--fg)', fontWeight: 460 }}>
                The stretch, latitude by latitude
              </h3>
              <p className="mt-4 font-body text-body" style={{ color: 'var(--fg)' }}>
                Local scale on Mercator is a function of latitude alone: k = sec φ. Drag the
                parallel. At the equator the map is true. At 60°N — Oslo, Stockholm, southern
                Alaska — everything linear is doubled and every area quadrupled. By 80°N the
                multiplier is nearly six.
              </p>
              <div className="mt-6 flex flex-wrap items-start gap-6">
                <div className="w-36 shrink-0">
                  <MercatorLatitudeGauge lat={lat} />
                </div>
                <div className="min-w-[240px] grow">
                  <label htmlFor="ch03-lat" className="font-ui text-label uppercase" style={{ color: 'var(--fg-3)' }}>
                    Latitude φ
                  </label>
                  <input
                    id="ch03-lat"
                    type="range"
                    min={0}
                    max={85}
                    step={1}
                    value={lat}
                    onChange={(e) => setLat(Number(e.target.value))}
                    className="lat-slider mt-2 block w-full"
                    aria-valuetext={`latitude ${lat} degrees, linear scale ${k.toFixed(2)}`}
                  />
                  <style>{`
                    .lat-slider { -webkit-appearance: none; appearance: none; height: 20px; background: transparent; cursor: pointer; }
                    .lat-slider::-webkit-slider-runnable-track { height: 2px; background: var(--bg-3); }
                    .lat-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 20px; height: 20px; margin-top: -9px; border-radius: 9999px; background: var(--accent); border: 2px solid var(--bg); transition: transform 180ms var(--ease-atlas); }
                    .lat-slider:active::-webkit-slider-thumb { transform: scale(0.92); }
                    .lat-slider::-moz-range-track { height: 2px; background: var(--bg-3); }
                    .lat-slider::-moz-range-thumb { width: 16px; height: 16px; border-radius: 9999px; background: var(--accent); border: 2px solid var(--bg); }
                  `}</style>
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <DataCallout
                      value={`×${k.toFixed(2)}`}
                      caption={`linear scale at ${lat}° — k = sec φ${Math.abs(lat - 60) <= 2 ? ' (the ×2 line)' : ''}`}
                      accent="vermilion"
                    />
                    <DataCallout
                      value={`×${(k * k).toFixed(2)}`}
                      caption={`area scale at ${lat}° — k² = sec²φ${Math.abs(lat - 60) <= 2 ? ' (the ×4 line)' : ''}`}
                      accent="vermilion"
                    />
                  </div>
                </div>
              </div>
            </Reveal>
          </div>

          <div data-step="greenland" className="flex min-h-[90vh] items-center">
            <Reveal className="w-full">
              <h3 className="font-display text-subhead" style={{ color: 'var(--fg)', fontWeight: 460 }}>
                The Greenland problem
              </h3>
              <p className="mt-4 font-body text-body" style={{ color: 'var(--fg)' }}>
                On the map beside you, Greenland — centered near 72°N, where sec²φ runs past 10 —
                sprawls to roughly the visual size of Africa. Here is the truth, in the map's own
                units and in the Earth's:
              </p>
              <div className="mt-6 grid grid-cols-2 gap-6">
                <DataCallout value="14.0×" suffix="TRUE" caption="Africa ÷ Greenland by real area: 30.37M vs 2.17M km²." accent="vermilion" />
                <DataCallout value="≈1×" suffix="ON MERCATOR" caption="The apparent ratio on the map — visually, Greenland rivals Africa." />
              </div>
              <div className="mt-6 space-y-3" aria-hidden>
                <div>
                  <p className="mb-1 font-ui text-label uppercase" style={{ color: 'var(--fg-3)' }}>In truth — 1 : 14</p>
                  <div className="flex items-center gap-2">
                    <span className="block h-4" style={{ width: '7%', background: 'var(--accent)' }} />
                    <span className="block h-4" style={{ width: '93%', background: 'var(--seaweed)' }} />
                  </div>
                </div>
                <div>
                  <p className="mb-1 font-ui text-label uppercase" style={{ color: 'var(--fg-3)' }}>On the map — ≈ 1 : 1</p>
                  <div className="flex items-center gap-2">
                    <span className="block h-4" style={{ width: '49%', background: 'var(--accent)' }} />
                    <span className="block h-4" style={{ width: '49%', background: 'var(--seaweed)' }} />
                  </div>
                </div>
              </div>
              <p className="mt-4 font-ui text-caption" style={{ color: 'var(--fg-2)' }}>
                Vermilion: Greenland (2,166,086 km²). Seaweed: Africa (30,365,000 km²). The bars
                are the lie and the correction, side by side — chapter 09 measures it properly.
              </p>
            </Reveal>
          </div>

          <div data-step="poles" className="flex min-h-[90vh] items-center">
            <Reveal>
              <h3 className="font-display text-subhead" style={{ color: 'var(--fg)', fontWeight: 460 }}>
                Where the map ends
              </h3>
              <p className="mt-4 font-body text-body" style={{ color: 'var(--fg)' }}>
                As φ → 90°, sec φ → ∞, and y = ln tan(π/4 + φ/2) follows it to infinity. The North
                Pole is not at the top edge of a Mercator map; it is nowhere on it, at any height.
                So every practical Mercator draws a line and apologizes. This site, like most
                print atlases, clamps at ±85° — the map simply stops. Web Mercator (the spherical
                variant behind every slippy map) clamps at ±85.0511°, the latitude where the
                viewport becomes a perfect square; Antarctica and the Arctic Ocean are sacrificed
                to make the tile math clean.
              </p>
              <details open className="atlas-optional python-math"><summary>The mathematics behind the map</summary><EquationBlock
                className="mt-8"
                tex={String.raw`\lim_{\varphi \to 90^{\circ}} \ln\tan\!\left(\frac{\pi}{4} + \frac{\varphi}{2}\right) = +\infty \qquad\Rightarrow\qquad |\varphi| \le 85^{\circ}`}
                caption="The poles live at infinity. The clamp is not a flaw in the code — it is the map admitting its own horizon."
              /></details>
              <p className="mt-6 pull-line text-pull">
                Mercator is not the map that lies. It is the map that keeps one promise perfectly
                and hopes you won't audit the others.
              </p>
            </Reveal>
          </div>

          <div data-step="python" className="flex min-h-[100vh] items-center py-12">
            <Reveal className="w-full">
              <h3 className="font-display text-subhead" style={{ color: 'var(--fg)', fontWeight: 460 }}>
                The whole projection, as eleven lines of Python
              </h3>
              <p className="mt-4 font-body text-body" style={{ color: 'var(--fg)' }}>
                This is not a pseudocode sketch — it is the exact source the stage engine runs,
                executed in your browser on a Python interpreter compiled to WebAssembly. Press
                Run (or ⌘/Ctrl+Enter). Then press Edit and move the clamp to 89°; watch the warning
                system catch the explosion.
              </p>
              <div className="mt-6">
                <details open className="atlas-optional python-chapter"><summary>Experiment in Python · run, change, observe</summary><PythonPanel
                  filename="mercator.py"
                  code={PANEL_CODE}
                  annotations={annotations}
                  onAnnotationHover={onAnnotationHover}
                /></details>
              </div>
              <div className="mx-auto mt-4 w-28">
                <MercatorLatitudeGauge lat={60} pulse={pulse} compact />
                <p className="mt-1 text-center font-ui text-caption" style={{ color: 'var(--fg-2)' }}>
                  Hover an annotation above — the affected latitudes pulse here.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  )
}
