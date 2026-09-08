import { yieldToBrowser } from '../utils/cooperative'
/**
 * CHAPTER 06 — AUTHAGRAPH (home.md §06; design.md §5 full-width Atlas
 * takeover, 200–400vh pinned construction sequence).
 *
 * Hajime Narukawa's polyhedral answer: divide the sphere onto a tetrahedron,
 * unfold it, let distortion spread to four oceanic vertices. The pinned,
 * scroll-scrubbed construction (sphere → 24/96 regions → cone transfer →
 * unfolded net → the real 4√3:3 rectangle) is rendered by AuthaGraphSequence
 * with step buttons (the reader can stop at each stage) and orbit-drag on the
 * solid stages. Then: what it costs and buys (measured stats, honest
 * "equal-area type" framing per Narukawa 2022), a seamless horizontal
 * tiling free-play, and a runnable Python panel for the 1/24-region forward
 * equations. Cited: Narukawa 2022, J-STAGE DOI 10.11212/jjca.60.1_1.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import ChapterKicker from '@/components/ChapterKicker'
import DataCallout from '@/components/DataCallout'
import StageToggle, { type StageLayerState } from '@/components/StageToggle'
import PythonPanelB from '@/chapters/PythonPanelB'
import {
  bindScrub,
  tweenValue,
  useAuthaGraphStage,
  useChapterStage,
  useStepObserver,
} from '@/chapters/stageUtilsB'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { setTheme } from '@/hooks/useTheme'
import { initBakeSystem } from '@/projection/bake'
import { AUTHAGRAPH_FRAME, authagraphPoint } from '@/projection/authagraph'
import authagraph from '@/data/authagraph.json'
import type { MapStage } from '@/three/MapStage'

gsap.registerPlugin(ScrollTrigger)

const D2R = Math.PI / 180
const TILE_W = 2 * AUTHAGRAPH_FRAME.halfWidth // 4√3·s
const TILE_H = 2 * AUTHAGRAPH_FRAME.halfHeight // 3·s

/* ---------------- construction-sequence metadata ---------------- */

const STAGE_META = [
  {
    key: '01',
    name: 'sphere',
    title: 'First, the sphere',
    text: 'Every flat map in this essay started here. Narukawa’s departure is not a formula but a solid: before flattening, divide.',
  },
  {
    key: '02',
    name: 'divide',
    title: 'Divide into regions',
    text: 'Great-circle arcs connect four tetrahedron vertices — each one sunk in open ocean. The four spherical triangles split into 24 regions, then 96; tint shows the facets.',
  },
  {
    key: '03',
    name: 'transfer',
    title: 'Transfer to the solid',
    text: 'Each region is projected from the sphere onto an inscribed cone-tetrahedron. Drag to orbit the solid as it assembles.',
  },
  {
    key: '04',
    name: 'unfold',
    title: 'Unfold the net',
    text: 'The faces hinge open along their shared edges. Because the solid — not the sphere — is what gets flattened, no single point on Earth bears the whole cost.',
  },
  {
    key: '05',
    name: 'rectangle',
    title: 'The 4√3 : 3 rectangle',
    text: 'The net settles into a rectangle with aspect 4√3:3 ≈ 2.31:1. Coastlines resolve; Antarctica appears whole. This final state is the real published projection.',
  },
]

/* ---------------- python panel source ---------------- */

const AUTHAGRAPH_FACE_PY = `"""authagraph_face.py - Narukawa 2022, eqs. (2.22)-(2.23).
Forward equations for ONE of the 24 regions of a tetrahedron face.
Region-local inputs: lam in (0, pi/3), rho = colatitude from face center N."""
import numpy as np

THETA_C = np.arctan(1.0 / np.sqrt(2.0))   # cone half-angle, 35.2644 deg
RHO_V = THETA_C                           # colatitude of the tetrahedron vertices


def face_forward(lam, rho):
    ratio = np.sin(rho) / np.sin(rho + THETA_C)
    x = (2.0 / (np.sqrt(3.0) * np.pi)) * ratio * (2.0 + np.cos(lam)) * (
        lam - np.arcsin(np.sin(lam) / np.sqrt(3.0))
    )
    y = np.sqrt(2.0 / 3.0) - (1.0 / 3.0) * ratio * (2.0 + np.cos(lam))
    return x, y


def project(lon, lat, params=None):
    # the panel harness feeds (lam, rho) in the lon/lat slots
    return face_forward(lon, lat)


corners = [(0.0, 0.0), (0.0, RHO_V), (np.pi / 3.0, RHO_V)]
print("corner (lam, rho) -> (x, y)")
for lam, rho in corners:
    x, y = face_forward(lam, rho)
    print(f"  ({lam:.4f}, {rho:.4f}) -> ({x:.4f}, {y:.4f})")
print("you have just projected one twenty-fourth of the Earth")
`

function faceSamples(): { lon: Float64Array; lat: Float64Array } {
  const lons: number[] = []
  const lats: number[] = []
  const LMAX = Math.PI / 3
  const RMAX = Math.atan(1 / Math.SQRT2)
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 12; c++) {
      lons.push(0.01 + ((LMAX - 0.02) * c) / 11)
      lats.push(0.005 + ((RMAX - 0.01) * r) / 5)
    }
  }
  return { lon: Float64Array.from(lons), lat: Float64Array.from(lats) }
}

/* ---------------- the chapter ---------------- */

export default function Ch06AuthaGraph() {
  const { reducedMotion } = useReducedMotion()

  return (
    <section id="ch-06" aria-labelledby="ch-06-title" className="scroll-mt-20">
      <ConstructionSequence reducedMotion={reducedMotion} />
      <CostsAndBuys reducedMotion={reducedMotion} />
      <TilingPlayground />
      <FacePanel />
    </section>
  )
}

/* ================= part A: the pinned construction ================= */

function ConstructionSequence({ reducedMotion }: { reducedMotion: boolean }) {
  const pinRef = useRef<HTMLDivElement | null>(null)
  const stageFloatRef = useRef(0)
  const [stageIdx, setStageIdx] = useState(0)
  const { containerRef, seqRef, alive } = useAuthaGraphStage('atlas')
  const dragRef = useRef<{ x: number; y: number; moved: number } | null>(null)

  /* Atlas theme while the dark region crosses the viewport middle */
  useEffect(() => {
    const el = pinRef.current
    if (!el) return
    const st = ScrollTrigger.create({
      trigger: el,
      start: 'top 55%',
      end: 'bottom 45%',
      onToggle: (self) => setTheme(self.isActive ? 'atlas' : 'paper'),
    })
    return () => {
      st.kill()
      setTheme('paper')
    }
  }, [])

  /* scroll-scrubbed stage progression */
  useEffect(() => {
    const el = pinRef.current
    if (!el || !alive || reducedMotion) return
    return bindScrub({
      trigger: el,
      start: 'top top',
      end: 'bottom bottom',
      onProgress: (p) => {
        const s = p * 3.999
        stageFloatRef.current = s
        const base = Math.min(3, Math.floor(s))
        seqRef.current?.setStage(base, s - base)
        setStageIdx(Math.min(4, Math.round(s)))
      },
    })
  }, [alive, reducedMotion, seqRef])

  /* reduced motion: show stage 0 on mount */
  useEffect(() => {
    if (reducedMotion && alive) seqRef.current?.setStage(stageIdx, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, alive])

  const jumpTo = useCallback(
    (k: number) => {
      const el = pinRef.current
      setStageIdx(k)
      if (reducedMotion) {
        seqRef.current?.setStage(k, 0)
        return
      }
      if (!el) return
      const rect = el.getBoundingClientRect()
      const top = rect.top + window.scrollY
      const span = el.offsetHeight - window.innerHeight
      const target = top + Math.min(0.999, k / 4 + 0.02) * span
      window.scrollTo({ top: target, behavior: 'smooth' })
    },
    [reducedMotion, seqRef],
  )

  /* orbit-drag (spherical / tetrahedral stages) */
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (stageFloatRef.current >= 3.5) return
    dragRef.current = { x: e.clientX, y: e.clientY, moved: 0 }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [])
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current
      if (!d) return
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      d.moved += Math.abs(dx) + Math.abs(dy)
      d.x = e.clientX
      d.y = e.clientY
      // grab-the-world convention: content follows the pointer
      seqRef.current?.orbitBy(-dx * 0.005, dy * 0.005)
    },
    [seqRef],
  )
  const onPointerUp = useCallback(() => {
    dragRef.current = null
  }, [])
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (stageFloatRef.current >= 3.5) return
      const step = e.shiftKey ? 0.3 : 0.12
      if (e.key === 'ArrowLeft') {
        seqRef.current?.orbitBy(step, 0)
        e.preventDefault()
      } else if (e.key === 'ArrowRight') {
        seqRef.current?.orbitBy(-step, 0)
        e.preventDefault()
      } else if (e.key === 'ArrowUp') {
        seqRef.current?.orbitBy(0, -step)
        e.preventDefault()
      } else if (e.key === 'ArrowDown') {
        seqRef.current?.orbitBy(0, step)
        e.preventDefault()
      }
    },
    [seqRef],
  )

  const meta = STAGE_META[stageIdx]
  const orbitsble = stageIdx < 4

  return (
    <div
      ref={pinRef}
      className="relative atlas-construction"
      style={reducedMotion ? undefined : { height: '380vh' }}
    >
      <div
        className={
          reducedMotion
            ? 'relative h-[85dvh] overflow-hidden'
            : 'sticky top-0 h-[100dvh] overflow-hidden'
        }
        style={{
          // The stage canvas is always Atlas-dark, but the page theme flips
          // back to paper as the pin's tail leaves the viewport — re-scope the
          // text vars so overlay copy never goes dark-on-dark at the boundary.
          ['--fg' as string]: 'var(--atlas-ink)',
          ['--fg-2' as string]: 'var(--atlas-ink-2)',
          ['--fg-3' as string]: 'var(--atlas-ink-2)',
        }}
      >
        {/* the WebGL sequence */}
        <div
          ref={containerRef}
          role="img"
          aria-label={`AuthaGraph construction, stage ${meta.key} of 05 — ${meta.name}: ${meta.text}`}
          aria-roledescription="interactive 3D construction; drag or use arrow keys to orbit the solid stages"
          tabIndex={0}
          className="absolute inset-0"
          style={{ cursor: orbitsble ? 'grab' : 'default', touchAction: orbitsble ? 'pan-y' : 'auto' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        />
        <p className="sr-only" aria-live="polite">
          Stage {meta.key} of 05, {meta.name}. {meta.text}
        </p>

        {/* title card */}
        <div className="pointer-events-none absolute left-0 right-0 top-0 px-[var(--gutter)] pt-16 lg:pt-20">
          <div className="max-w-[620px]">
            <ChapterKicker
              numeral="06"
              kicker="1999 / 2022"
              title="AuthaGraph: the polyhedral answer."
              titleId="ch-06-title"
              standfirst="Hajime Narukawa asked a different question: not ‘which formula?’ but ‘which solid?’ Divide the sphere onto a tetrahedron, unfold it, and distortion spreads out instead of concentrating."
              accent="indigo"
            />
          </div>
        </div>

        {/* stage caption card */}
        <div className="pointer-events-none absolute inset-x-0 bottom-24 px-[var(--gutter)] lg:bottom-28">
          <div className="max-w-[420px]">
            <p className="font-ui text-kicker uppercase" style={{ color: 'var(--indigo)' }}>
              {meta.key} · {meta.name}
            </p>
            <p
              className="mt-2 font-display text-[1.35rem] leading-snug"
              style={{ color: 'var(--fg)' }}
            >
              {meta.title}
            </p>
            <p className="mt-2 font-body text-body-sm" style={{ color: 'var(--fg-2)' }}>
              {meta.text}
            </p>
            {stageIdx === 2 && (
              <p
                className="mt-3 border-l-2 pl-3 font-ui text-caption"
                style={{ borderColor: 'var(--gold)', color: 'var(--fg-2)' }}
              >
                Honesty note: Narukawa’s 2022 published formulation approximates the
                original hand-built curved tetrahedron with four congruent cones
                (&lt;4% radial deviation). What you see is the published math, not the
                1999 artisanal solid.
              </p>
            )}
          </div>
        </div>

        {/* step rail */}
        <div
          className="absolute bottom-6 left-0 px-[var(--gutter)]"
          role="group"
          aria-label="Construction stages — jump to a stage"
        >
          <ol className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {STAGE_META.map((m, k) => (
              <li key={m.key}>
                <button
                  type="button"
                  onClick={() => jumpTo(k)}
                  aria-current={stageIdx === k ? 'step' : undefined}
                  className="font-ui text-label uppercase transition-colors duration-micro"
                  style={{
                    color: stageIdx === k ? 'var(--fg)' : 'var(--fg-3)',
                    borderBottom:
                      stageIdx === k ? '2px solid var(--indigo)' : '2px solid transparent',
                    paddingBottom: 2,
                  }}
                >
                  {m.key} {m.name}
                </button>
              </li>
            ))}
          </ol>
        </div>

        {/* orbit hint */}
        {orbitsble && (
          <p
            className="pointer-events-none absolute bottom-6 right-0 hidden px-[var(--gutter)] font-ui text-label uppercase lg:block"
            style={{ color: 'var(--fg-3)' }}
          >
            drag to orbit · arrow keys work too
          </p>
        )}
      </div>
    </div>
  )
}

/* ================= part B: what it costs and buys ================= */

const B_STEP_LABELS = [
  'Morphing from Equal Earth to the finished AuthaGraph map: the familiar pseudocylindrical outline folds up into the tetrahedral rectangle.',
  'The AuthaGraph world map with Tissot indicatrices: ellipses stay modest almost everywhere, worst near the four tetrahedron vertices, all of which lie in open ocean.',
  'The AuthaGraph map with its unusual graticule: meridians and parallels bend and kink along the region boundaries, and Antarctica appears whole at the bottom of the map.',
  'The AuthaGraph map, with a runnable Python panel implementing the published 1/24-region forward equations.',
]

function CostsAndBuys({ reducedMotion }: { reducedMotion: boolean }) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const morphBlockRef = useRef<HTMLDivElement | null>(null)
  const stepRef = useRef(0)
  const morphRef = useRef(0)
  const [ariaLabel, setAriaLabel] = useState(B_STEP_LABELS[0])
  const [layers, setLayers] = useState<StageLayerState>({
    geography: true,
    graticule: false,
    tissot: false,
    area: false,
    angle: false,
  })

  const onReady = useCallback((stage: MapStage) => {
    void stage.setMorphTargets('equalEarth', 'authagraph').then(() => {
      stage.setMorph(morphRef.current)
      stage.setLayers({
        geography: true,
        graticule: stepRef.current >= 2,
        tissot: stepRef.current >= 1,
        area: false,
        angle: false,
      })
    })
  }, [])

  const { containerRef, stageRef, alive } = useChapterStage('paper', onReady)

  useEffect(() => {
    stageRef.current?.setLayers(layers)
  }, [layers, alive, stageRef])

  useEffect(() => {
    const block = morphBlockRef.current
    if (!block || !alive || reducedMotion) return
    return bindScrub({
      trigger: block,
      start: 'top 80%',
      end: 'bottom 30%',
      onProgress: (p) => {
        morphRef.current = p
        stageRef.current?.setMorph(p)
      },
    })
  }, [alive, reducedMotion, stageRef])

  useStepObserver(rootRef, (s) => {
    stepRef.current = s
    setAriaLabel(B_STEP_LABELS[Math.min(s, B_STEP_LABELS.length - 1)])
    setLayers((prev) => ({ ...prev, tissot: s >= 1, graticule: s >= 2 }))
  })

  useEffect(() => {
    if (!reducedMotion || !alive) return
    const target = stepRef.current >= 1 ? 1 : 0
    return tweenValue(morphRef.current, target, 400, (v) => {
      morphRef.current = v
      stageRef.current?.setMorph(v)
    })
     
  }, [reducedMotion, alive, ariaLabel, stageRef])

  const published = authagraph.publishedDistortion

  return (
    <div ref={rootRef} className="mx-auto max-w-container px-[var(--gutter)] py-24">
      <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-[var(--gutter)]">
        {/* sticky stage — LEFT */}
        <div className="sticky top-[var(--nav-h)] z-20 order-first h-[52dvh] border-b border-hair bg-bg lg:order-1 lg:top-0 lg:z-auto lg:h-[100dvh] lg:self-start lg:border-b-0">
          <div ref={containerRef} role="img" aria-label={ariaLabel} className="absolute inset-0" />
          <StageToggle
            layers={layers}
            onChange={(layer, on) => setLayers((p) => ({ ...p, [layer]: on }))}
            className="absolute bottom-3 left-3"
          />
          <p className="sr-only" aria-live="polite">
            {ariaLabel}
          </p>
        </div>

        {/* narrative — RIGHT */}
        <div className="order-last lg:order-2">
          <div data-step="0" ref={morphBlockRef} className="max-w-measure pb-24 pt-16 lg:min-h-[130vh]">
            <h3 className="font-display text-subhead" style={{ color: 'var(--fg)', fontWeight: 460 }}>
              What it costs, and what it buys
            </h3>
            <p className="mt-5">
              Equal Earth folds up into the tetrahedral rectangle as you scroll. The
              finished map looks wrong the first time you see it: the graticule bends,
              the compass rose is meaningless, and the whole frame tilts off the familiar
              axes. Look longer and the bargains appear — the continents sit at sizes that
              are close to true, shapes hold together from Ecuador to Hokkaido, and
              Antarctica, amputated or smeared by nearly every rectangular map, appears
              whole.
            </p>
          </div>

          <div data-step="1" className="max-w-measure pb-24">
            <p>
              Measured over 312 sample points, Narukawa’s own 2022 evaluation reports:
            </p>
            <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-3">
              <DataCallout
                value={`≈${Math.round(published.meanAreaDistortion * 100)}%`}
                caption="mean area distortion — Lambert cylindrical equal-area scores 0%"
                accent="indigo"
              />
              <DataCallout
                value={`${published.meanMaxAngularDistortionRad.toFixed(2)} rad`}
                caption="mean maximum angular distortion — vs 0.55 rad for the Lambert cylinder"
                accent="indigo"
              />
              <DataCallout
                value={`≈${Math.round(published.meanDistanceDistortion * 100)}%`}
                caption="mean distance distortion — the third axis of the trade"
                accent="indigo"
              />
            </div>
            <p className="mt-8">
              By the averages, AuthaGraph scores <em>worse</em> than a plain equal-area
              cylinder. That is the point: it is a multi-objective design. The distortion
              is distributed to four tetrahedron vertices — every one of them parked in
              open ocean — instead of being concentrated at two inhabited poles. Watch the
              Tissot field: modest ellipses almost everywhere, trouble only near four
              points most maps would rather you not think about.
            </p>
            <div
              className="mt-8 border p-5"
              style={{ borderColor: 'var(--gold)', background: 'transparent' }}
            >
              <p className="font-ui text-label uppercase" style={{ color: 'var(--gold)' }}>
                Honesty
              </p>
              <p className="mt-3 font-body text-body-sm" style={{ color: 'var(--fg-2)' }}>
                AuthaGraph is an “equal-area type” map: area-correct at the level of its
                96 regions, not infinitesimally — it is not a mathematically exact
                equal-area projection, and its marketing has sometimes said otherwise. We
                follow Narukawa’s own 2022 framing. It is a remarkably good answer, not
                the one accurate map.
              </p>
            </div>
          </div>

          <div data-step="2" className="max-w-measure pb-16">
            <h3 className="font-display text-subhead" style={{ color: 'var(--fg)', fontWeight: 460 }}>
              A graticule that has been somewhere
            </h3>
            <p className="mt-5">
              Turn the graticule on and it tells the construction story all by itself:
              meridians and parallels kink along the seams where one region hands off to
              the next — the visible signature of a map that is not one smooth function
              but ninety-six stitched local ones. The four vertices whose coordinates the
              whole frame is built around:
            </p>
            <ul className="mt-6 space-y-3">
              {authagraph.tetrahedron.vertices.map((v) => (
                <li key={v.id} className="flex gap-4 border-b pb-3" style={{ borderColor: 'var(--hair)' }}>
                  <span className="font-ui text-label uppercase" style={{ color: 'var(--indigo)', minWidth: '2rem' }}>
                    {v.id}
                  </span>
                  <span className="font-mono text-caption" style={{ color: 'var(--fg)' }}>
                    {v.dms}
                  </span>
                  <span className="font-ui text-caption" style={{ color: 'var(--fg-2)' }}>
                    {v.ocean}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 font-ui text-caption" style={{ color: 'var(--fg-2)' }}>
              Exact DMS values as published; pairwise vertex dot products are −1/3, a
              regular tetrahedron. Each vertex hides in an ocean — that is deliberate.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ================= part C: seamless tiling free-play ================= */

function TilingPlayground() {
  const outerRef = useRef<HTMLDivElement | null>(null)
  const stripRef = useRef<HTMLDivElement | null>(null)
  const [path, setPath] = useState<string | null>(null)
  const [tileW, setTileW] = useState(0)
  const panRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const dragRef = useRef<{ x: number; v: number; t: number; moved: number } | null>(null)
  const tweenCancel = useRef<(() => void) | null>(null)

  /* project the coastline once, in tile-local units (0..TILE_W, 0..TILE_H) */
  useEffect(() => {
    let cancelled = false
    initBakeSystem().then(async ({ master }) => {
      if (cancelled) return
      const segLon = master.coastSeg.lon
      const segLat = master.coastSeg.lat
      const parts: string[] = []
      const hw = AUTHAGRAPH_FRAME.halfWidth
      const hh = AUTHAGRAPH_FRAME.halfHeight
      let deadline = performance.now() + 4
      for (let s = 0; s < segLon.length; s += 2) {
        if (s % 256 === 0 && performance.now() >= deadline) {
          await yieldToBrowser()
          if (cancelled) return
          deadline = performance.now() + 4
        }
        const a = authagraphPoint(segLon[s] * D2R, segLat[s] * D2R)
        const b = authagraphPoint(segLon[s + 1] * D2R, segLat[s + 1] * D2R)
        if (!Number.isFinite(a.x + a.y + b.x + b.y)) continue
        if (Math.abs(a.x - b.x) > hw || Math.abs(a.y - b.y) > hh) continue // seam
        parts.push(
          `M${(a.x + hw).toFixed(3)} ${(hh - a.y).toFixed(3)}L${(b.x + hw).toFixed(3)} ${(hh - b.y).toFixed(3)}`,
        )
      }
      setPath(parts.join(''))
    })
    return () => {
      cancelled = true
    }
  }, [])

  /* sizing: show ~1.35 tiles (fewer on narrow screens); height follows aspect */
  useEffect(() => {
    const el = outerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      setTileW(Math.max(460, w / 1.35))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const applyPan = useCallback(() => {
    const strip = stripRef.current
    if (!strip || tileW <= 0) return
    const wrap = ((panRef.current % tileW) + tileW) % tileW
    strip.style.transform = `translate3d(${-tileW + wrap}px, 0, 0)`
  }, [tileW])

  useEffect(() => {
    applyPan()
  }, [applyPan])

  const stopMotion = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    tweenCancel.current?.()
    tweenCancel.current = null
  }, [])

  const recenter = useCallback(() => {
    if (tileW <= 0) return
    stopMotion()
    const target = Math.round(panRef.current / tileW) * tileW
    tweenCancel.current = tweenValue(panRef.current, target, 700, (v) => {
      panRef.current = v
      applyPan()
    })
  }, [tileW, stopMotion, applyPan])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      stopMotion()
      dragRef.current = { x: e.clientX, v: 0, t: performance.now(), moved: 0 }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [stopMotion],
  )
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current
      if (!d) return
      const dx = e.clientX - d.x
      const now = performance.now()
      const dt = Math.max(1, now - d.t)
      d.v = (dx / dt) * 16 // px per frame, smoothed below
      d.x = e.clientX
      d.t = now
      d.moved += Math.abs(dx)
      panRef.current += dx
      applyPan()
    },
    [applyPan],
  )
  const onPointerUp = useCallback(() => {
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    if (d.moved < 6) {
      recenter()
      return
    }
    // inertia with exponential decay
    let v = d.v
    const step = () => {
      v *= 0.94
      if (Math.abs(v) < 0.2) {
        rafRef.current = null
        return
      }
      panRef.current += v
      applyPan()
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
  }, [recenter, applyPan])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (tileW <= 0) return
      const step = e.shiftKey ? tileW / 2 : tileW / 8
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        stopMotion()
        const dir = e.key === 'ArrowLeft' ? -1 : 1
        const target = panRef.current + dir * step
        tweenCancel.current = tweenValue(panRef.current, target, 320, (v) => {
          panRef.current = v
          applyPan()
        })
      } else if (e.key === 'Home') {
        e.preventDefault()
        recenter()
      }
    },
    [tileW, stopMotion, applyPan, recenter],
  )

  useEffect(() => stopMotion, [stopMotion])

  const tileH = tileW / (TILE_W / TILE_H)

  return (
    <div className="mx-auto max-w-container px-[var(--gutter)] py-24">
      <div className="max-w-measure">
        <h3 className="font-display text-subhead" style={{ color: 'var(--fg)', fontWeight: 460 }}>
          A map with no last place
        </h3>
        <p className="mt-5">
          The rectangle’s left and right edges are the same ocean cut, so copies of the
          map join seamlessly side by side. Drag: the world wraps, and the tessellation
          never runs out. Click to snap the prime tile back to center. There is no “edge
          of the map” to be exiled to — any meridian can be the center.
        </p>
      </div>

      <div
        ref={outerRef}
        className="relative mt-8 w-full overflow-hidden border"
        style={{
          borderColor: 'var(--hair)',
          height: tileH > 0 ? `${Math.round(tileH)}px` : '280px',
          cursor: 'grab',
          touchAction: 'pan-y',
          background: 'var(--bg-2)',
        }}
        role="group"
        aria-label="AuthaGraph seamless tiling explorer. Drag horizontally to pan; the map wraps. Arrow keys pan, Home re-centers the prime tile."
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        {path === null ? (
          <p className="absolute inset-0 grid place-items-center font-ui text-caption" style={{ color: 'var(--fg-3)' }}>
            loading coastline…
          </p>
        ) : (
          <div
            ref={stripRef}
            className="absolute left-0 top-0 will-change-transform"
            style={{ width: tileW * 3, height: tileH }}
          >
            <svg
              width={tileW * 3}
              height={tileH}
              viewBox={`0 0 ${TILE_W * 3} ${TILE_H}`}
              preserveAspectRatio="none"
              aria-hidden
            >
              <defs>
                <path id="ag-coast-b" d={path} fill="none" strokeWidth={0.012} stroke="var(--ink)" />
                <rect id="ag-frame-b" x={0} y={0} width={TILE_W} height={TILE_H} fill="none" strokeWidth={0.008} stroke="var(--indigo)" strokeOpacity={0.5} />
              </defs>
              {[0, 1, 2].map((i) => (
                <g key={i} transform={`translate(${i * TILE_W} 0)`} opacity={i === 1 ? 1 : 0.35}>
                  <rect x={0} y={0} width={TILE_W} height={TILE_H} fill="var(--paper)" />
                  <use href="#ag-frame-b" />
                  <use href="#ag-coast-b" />
                </g>
              ))}
            </svg>
          </div>
        )}
        <p
          className="pointer-events-none absolute bottom-3 left-3 rounded-full px-3 py-1.5 font-ui text-label uppercase"
          style={{
            background: 'color-mix(in srgb, var(--bg) 78%, transparent)',
            color: 'var(--fg-2)',
            border: '1px solid var(--hair)',
            backdropFilter: 'blur(6px)',
          }}
        >
          side by side, the rectangle repeats seamlessly · any meridian can be the center
        </p>
      </div>
      <p className="mt-3 font-ui text-caption" style={{ color: 'var(--fg-2)' }}>
        Three copies of the same world rendered from the published equations; the outer
        two are dimmed. The wrap is exact: a point leaving the right edge re-enters on
        the left, one tile over.
      </p>
    </div>
  )
}

/* ================= part D: the runnable face ================= */

function FacePanel() {
  return (
    <div className="mx-auto max-w-container px-[var(--gutter)] pb-24">
      <div className="max-w-measure">
        <h3 className="font-display text-subhead" style={{ color: 'var(--fg)', fontWeight: 460 }}>
          Project one twenty-fourth of the Earth
        </h3>
        <p className="mt-5">
          The 2022 paper’s forward equations, for one of the 24 regions of a tetrahedron
          face, verbatim. Run them: the script prints the region’s three corners — the
          face center N and its two tetrahedron vertices — in the face’s local frame.
        </p>
        <details open className="atlas-optional python-chapter"><summary>Experiment in Python · run, change, observe</summary><PythonPanelB
          filename="authagraph_face.py"
          initialCode={AUTHAGRAPH_FACE_PY}
          accent="indigo"
          samples={faceSamples()}
          caption="Narukawa 2022, eqs. (2.22)–(2.23). The other 23 regions are mirrors and rotations of this one; the site’s engine routes every point to its region, evaluates this, and packs the four faces into the 4√3:3 rectangle."
          annotations={[
            { lines: '6', text: 'the cone half-angle atan(1/√2) ≈ 35.26° — the cone redefinition of the curved tetrahedron' },
            { lines: '11', text: 'the radial ratio sin ρ / sin(ρ + θ): the gnomonic transfer from sphere to cone' },
            { lines: '12–15', text: 'the 1/24-region forward equations, with the (λ − asin(sin λ/√3)) areal correction' },
            { lines: '24–29', text: 'the three corners of the region: the face center and two tetrahedron vertices' },
          ]}
        /></details>
        <p className="mt-6 font-ui text-caption" style={{ color: 'var(--fg-2)' }}>
          Source: Hajime Narukawa, “Formulation of AuthaGraph Map Projection and an
          Evaluation of its Distortion,” <em>Map</em> (Journal of the Japan Cartographers
          Association) 60(1), 2022 —{' '}
          <a
            href="https://doi.org/10.11212/jjca.60.1_1"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
            style={{ color: 'var(--indigo)' }}
          >
            DOI 10.11212/jjca.60.1_1
          </a>
          . Reference implementation: mapshaper’s <code>+proj=narukawa2022</code> (MPL-2.0).
        </p>
      </div>
    </div>
  )
}
