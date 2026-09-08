import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import ChapterKicker from '@/components/ChapterKicker'
import ScrubSlider from '@/components/ScrubSlider'
import { geodesicCircle } from '@/projection/geometry'
import { getProjection, D2R, R2D } from '@/projection/projections'
import { tissotAt } from '@/projection/distortion'
import type { ProjectionId } from '@/projection/types'
import type { MapStage } from '@/three/MapStage'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { StageFrame } from '@/chapters/StageBlockC'
import {
  EASE_MORPH,
  tweenValue,
  useLazyMapStage,
  type TweenHandle,
} from '@/chapters/stageC'

/**
 * CHAPTER 10 · MOVE A CIRCLE — "One circle, two philosophies." (home.md §10)
 *
 * A 1,000 km-radius geodesic circle rides on the stage. Drag it (pointer via
 * MapStage.pick) or move it with the keyboard (arrows 1°, shift 10°). A scrub
 * slider morphs globe→flat; projection chips switch the flat destination
 * (morphing, never fading). Live readouts are honest: shape σ1/σ2 comes from
 * the numerical Jacobian in distortion.ts; displayed area is measured with
 * the shoelace formula over the projected circle polygon and normalized
 * against the identical circle drawn at the equator on the same map.
 */

const RADIUS_KM = 1000
const EARTH_R_KM = 6371
const RADIUS_DEG = (RADIUS_KM / EARTH_R_KM) * R2D // ≈ 8.99°
const CIRCLE_N = 128

const FLATS: Array<{ id: ProjectionId; name: string }> = [
  { id: 'mercator', name: 'MERCATOR' },
  { id: 'gallPeters', name: 'GALL–PETERS' },
  { id: 'equalEarth', name: 'EQUAL EARTH' },
]

/** Scripted journey: equator → 45°N → 70°N (the canonical demonstration). */
const JOURNEY: Array<{ lon: number; lat: number }> = [
  { lon: -30, lat: 0 },
  { lon: -30, lat: 45 },
  { lon: -30, lat: 70 },
]

interface Center {
  lon: number
  lat: number
}

const clampCenter = (c: Center): Center => ({
  lon: Math.max(-170, Math.min(170, c.lon)),
  lat: Math.max(-80, Math.min(80, c.lat)),
})

/** Shoelace area of the projected geodesic circle (raw projection units). */
function projectedCircleArea(proj: ProjectionId, c: Center): number {
  const fn = (lon: number, lat: number) => getProjection(proj).projectPoint(lon, lat)
  const { lon, lat } = geodesicCircle(c.lon, c.lat, RADIUS_DEG, CIRCLE_N)
  let acc = 0
  let prev = fn(lon[CIRCLE_N - 1] * D2R, lat[CIRCLE_N - 1] * D2R)
  for (let i = 0; i < CIRCLE_N; i++) {
    const p = fn(lon[i] * D2R, lat[i] * D2R)
    if (Number.isFinite(p.x) && Number.isFinite(prev.x)) acc += prev.x * p.y - p.x * prev.y
    prev = p
  }
  return Math.abs(acc / 2)
}

export default function Ch10MoveACircle() {
  const { reducedMotion } = useReducedMotion()
  const { hostRef, stage } = useLazyMapStage({ layers: { graticule: true } })

  const [center, setCenter] = useState<Center>({ lon: -30, lat: 25 })
  const [flat, setFlat] = useState<ProjectionId>('mercator')
  const [morph, setMorph] = useState(1) // 0 = globe, 1 = flat
  const [dragging, setDragging] = useState(false)
  const [journeying, setJourneying] = useState(false)
  const [ghost, setGhost] = useState<Center | null>(null)

  const morphRef = useRef(morph)
  const flatRef = useRef(flat)
  const centerRef = useRef(center)
  useEffect(() => {
    morphRef.current = morph
    flatRef.current = flat
    centerRef.current = center
  })
  const tweenRef = useRef<TweenHandle | null>(null)
  const journeyRef = useRef<{ cancel: () => void } | null>(null)
  const dragRef = useRef<{ pointerId: number } | null>(null)

  /* ---------- stage wiring ---------- */

  // (Re)mount: restore globe→flat pair at the current slider position.
  useEffect(() => {
    const s = stage
    if (!s) return
    void s.setMorphTargets('globe', flatRef.current).then(() => s.setMorph(morphRef.current))
  }, [stage])

  const scrubMorph = useCallback(
    (t: number) => {
      journeyRef.current?.cancel()
      setJourneying(false)
      setMorph(t)
      stage?.setMorph(t)
    },
    [stage],
  )

  /** Switch the flat destination by morphing (never a fade). */
  const switchFlat = useCallback(
    (next: ProjectionId) => {
      const s = stage
      if (!s || next === flatRef.current) return
      const prev = flatRef.current
      setFlat(next)
      const t = morphRef.current
      tweenRef.current?.cancel()
      if (t > 0.5) {
        // mostly flat: morph old flat → new flat, then re-anchor to globe→new
        void s.setMorphTargets(prev, next).then(() => {
          tweenRef.current = tweenValue(0, 1, {
            duration: 1400,
            ease: EASE_MORPH,
            reduced: reducedMotion,
            onUpdate: (v) => s.setMorph(v),
            onDone: () => {
              void s.setMorphTargets('globe', next).then(() => s.setMorph(1))
            },
          })
        })
      } else {
        // mostly globe: just re-anchor the pair
        void s.setMorphTargets('globe', next).then(() => s.setMorph(t))
      }
    },
    [stage, reducedMotion],
  )

  useEffect(() => {
    stage?.setAutoRotate(morph < 0.1 && !dragging)
  }, [stage, morph, dragging])

  /* ---------- derived readouts (honest math) ---------- */

  const readouts = useMemo(() => {
    const fn = (lon: number, lat: number) => getProjection(flat).projectPoint(lon, lat)
    const tis = tissotAt(fn, center.lon * D2R, center.lat * D2R)
    const areaHere = projectedCircleArea(flat, center)
    const areaEq = projectedCircleArea(flat, { lon: center.lon, lat: 0 })
    return {
      axisRatio: tis.valid && tis.sigma2 > 1e-9 ? tis.sigma1 / tis.sigma2 : NaN,
      areaScale: tis.valid ? tis.areaScale : NaN,
      areaVsEquator: areaEq > 1e-12 ? areaHere / areaEq : NaN,
    }
  }, [center, flat])

  /* ---------- drag interaction (MapStage pick) ---------- */

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      const s = stage
      if (!s) return
      const picked = s.pick(e.clientX, e.clientY)
      if (!picked) return
      // grab near the center handle OR near the rim ("drag the circle")
      const c = centerRef.current
      const grab = s.lonLatToScreen(c.lon * D2R, c.lat * D2R)
      const host = hostRef.current
      if (!grab || !host) return
      const rim = geodesicCircle(c.lon, c.lat, RADIUS_DEG, 4)
      const rimPt = s.lonLatToScreen(rim.lon[0] * D2R, rim.lat[0] * D2R)
      const rect = host.getBoundingClientRect()
      const dx = e.clientX - rect.left - grab.x
      const dy = e.clientY - rect.top - grab.y
      const dist = Math.hypot(dx, dy)
      const rPx = rimPt ? Math.hypot(rimPt.x - grab.x, rimPt.y - grab.y) : 0
      const nearCenter = dist < 48
      const nearRim = rPx > 0 && Math.abs(dist - rPx) < 30
      if (!nearCenter && !nearRim) return
      journeyRef.current?.cancel()
      setJourneying(false)
      dragRef.current = { pointerId: e.pointerId }
      setDragging(true)
      setGhost(centerRef.current)
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    },
    [stage, hostRef],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const s = stage
      if (!s || dragRef.current?.pointerId !== e.pointerId) return
      const picked = s.pick(e.clientX, e.clientY)
      if (!picked) return
      setCenter(clampCenter({ lon: picked.lon * R2D, lat: picked.lat * R2D }))
    },
    [stage],
  )

  const endDrag = useCallback((e: ReactPointerEvent) => {
    if (dragRef.current?.pointerId !== e.pointerId) return
    dragRef.current = null
    setDragging(false)
    setGhost(null)
  }, [])

  /** Keyboard move: arrows 1°, shift 10°. */
  const nudge = useCallback((dLon: number, dLat: number) => {
    journeyRef.current?.cancel()
    setJourneying(false)
    setCenter((c) => clampCenter({ lon: c.lon + dLon, lat: c.lat + dLat }))
  }, [])

  /* ---------- scripted journey ---------- */

  const sendItNorth = useCallback(() => {
    if (journeying) return
    setJourneying(true)
    if (reducedMotion) {
      // discrete states instead of animation
      const idx = JOURNEY.findIndex(
        (j) => Math.abs(j.lat - centerRef.current.lat) < 2 && Math.abs(j.lon - centerRef.current.lon) < 2,
      )
      const next = JOURNEY[(idx + 1) % JOURNEY.length]
      setCenter(next)
      setJourneying(false)
      return
    }
    let cancelled = false
    journeyRef.current = {
      cancel: () => {
        cancelled = true
        tweenRef.current?.cancel()
      },
    }
    const runLeg = (i: number) => {
      if (cancelled || i >= JOURNEY.length) {
        setJourneying(false)
        return
      }
      const from = centerRef.current
      const to = JOURNEY[i]
      tweenRef.current = tweenValue(0, 1, {
        duration: 800,
        ease: EASE_MORPH,
        onUpdate: (v) =>
          setCenter(
            clampCenter({
              lon: from.lon + (to.lon - from.lon) * v,
              lat: from.lat + (to.lat - from.lat) * v,
            }),
          ),
        onDone: () => runLeg(i + 1),
      })
    }
    runLeg(0)
  }, [journeying, reducedMotion])

  useEffect(
    () => () => {
      tweenRef.current?.cancel()
      journeyRef.current?.cancel()
    },
    [],
  )

  const flatName = FLATS.find((f) => f.id === flat)?.name ?? ''
  const ariaLabel = `Move-a-circle instrument. A geodesic circle of radius 1,000 kilometres sits at ${center.lat.toFixed(1)} degrees latitude, ${center.lon.toFixed(1)} degrees longitude. Map: ${
    morph < 0.05 ? 'the globe' : morph > 0.95 ? flatName : `mid-morph between globe and ${flatName}`
  }. On the flat map its shape axis ratio is ${
    Number.isFinite(readouts.axisRatio) ? readouts.axisRatio.toFixed(2) : 'unavailable'
  } and its drawn area is ${
    Number.isFinite(readouts.areaVsEquator) ? readouts.areaVsEquator.toFixed(2) : 'unavailable'
  } times its equatorial size.`

  return (
    <section
      id="ch-10"
      aria-labelledby="ch-10-title"
      className="mx-auto max-w-container scroll-mt-20 px-[var(--gutter)] py-24"
    >
      <ChapterKicker
        numeral="10"
        kicker="A TRAVELING CIRCLE"
        title="Move a circle."
        titleId="ch-10-title"
        standfirst="One geodesic circle, one thousand kilometres in radius, dragged across two philosophies of faithfulness. The circle never changes. The definition of 'true to life' does."
        accent="vermilion"
      />

      <div className="mt-12 lg:grid lg:grid-cols-[minmax(0,42%)_minmax(0,1fr)] lg:gap-12">
        {/* Narrative + instruments (LEFT) */}
        <div className="order-last lg:order-first">
          <p className="max-w-measure font-body text-body" style={{ color: 'var(--fg)' }}>
            This is the cleanest experiment in the essay. On the globe the circle is simply
            itself. Flatten the Earth and the two map families part ways: Mercator preserves infinitesimal local shapes and enlarges area toward the Arctic; an equal-area map
            keeps its size exact and pays for it in shape.
          </p>

          <div className="mt-8">
            <p className="mb-2 font-ui text-label uppercase" style={{ color: 'var(--fg-3)' }}>
              Flat destination
            </p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Flat projection">
              {FLATS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={flat === f.id}
                  onClick={() => switchFlat(f.id)}
                  className="min-h-[44px] rounded-full px-4 py-2 font-ui text-label uppercase transition-all duration-micro ease-atlas"
                  style={{
                    border: `1px solid ${flat === f.id ? 'var(--accent)' : 'var(--hair)'}`,
                    background: flat === f.id ? 'var(--accent)' : 'transparent',
                    color: flat === f.id ? 'var(--paper)' : 'var(--fg-2)',
                  }}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 max-w-measure">
            <ScrubSlider
              value={morph}
              onChange={scrubMorph}
              label="globe ━━●━━ flat"
              stops={[0, 1]}
            />
          </div>

          <button
            type="button"
            onClick={sendItNorth}
            disabled={journeying}
            className="mt-8 rounded-full px-5 py-2.5 font-ui text-label uppercase transition-colors duration-micro"
            style={{
              background: 'var(--accent)',
              color: 'var(--paper)',
              opacity: journeying ? 0.6 : 1,
            }}
          >
            {journeying ? 'Traveling north…' : 'Send it north — equator → 45° → 70°N'}
          </button>

          {/* Live instrumentation */}
          <dl
            className="code-well mt-8 grid grid-cols-1 gap-x-6 gap-y-3 p-6 sm:grid-cols-2"
            aria-live="off"
          >
            <Readout label="Geodesic radius" value={`${RADIUS_KM.toLocaleString()} km`} />
            <Readout
              label="Center"
              value={`${Math.abs(center.lat).toFixed(1)}°${center.lat >= 0 ? 'N' : 'S'}, ${Math.abs(center.lon).toFixed(1)}°${center.lon >= 0 ? 'E' : 'W'}`}
            />
            <Readout
              label={`Shape σ1/σ2 on ${flatName}`}
              value={
                morph < 0.5
                  ? '1.00 — the globe'
                  : Number.isFinite(readouts.axisRatio)
                    ? readouts.axisRatio.toFixed(2)
                    : '—'
              }
              hint="1.00 = local angles preserved"
            />
            <Readout
              label="Drawn area vs equator"
              value={
                morph < 0.5
                  ? '×1.00 — the globe'
                  : Number.isFinite(readouts.areaVsEquator)
                    ? `×${readouts.areaVsEquator >= 10 ? readouts.areaVsEquator.toFixed(1) : readouts.areaVsEquator.toFixed(2)}`
                    : '—'
              }
              hint="shoelace-measured from the drawn polygon"
            />
          </dl>
          <p className="mt-3 max-w-measure font-ui text-caption" style={{ color: 'var(--fg-3)' }}>
            The circle&apos;s true area on the sphere is 2πR²(1−cos r) ≈{' '}
            {(
              2 *
              Math.PI *
              EARTH_R_KM *
              EARTH_R_KM *
              (1 - Math.cos(RADIUS_DEG * D2R))
            ).toLocaleString(undefined, { maximumFractionDigits: 0 })}{' '}
            km². &quot;Drawn area&quot; normalizes against the same circle at the equator on
            the same map, so ×1.00 means &quot;the map shows it at its equatorial size&quot;.
            σ1/σ2 is computed from the projection&apos;s numerical Jacobian at the circle&apos;s
            center.
          </p>

          <p className="mt-8 max-w-measure font-body text-body" style={{ color: 'var(--fg)' }}>
            Mercator preserves infinitesimal local shapes and enlarges this region. A 1,000 km circle is a finite region, so its complete outline need not remain circular. Gall–Peters keeps its
            area exact and crushes its shape. The circle did not change. The definition of
            &quot;faithful&quot; did.
          </p>
        </div>

        {/* Stage (RIGHT, sticky) */}
        <div className="order-first mb-8 lg:order-last lg:mb-0">
          <div className="lg:sticky lg:top-24">
            <StageFrame hostRef={hostRef} ariaLabel={ariaLabel} height="min(72vh, 620px)" touchNone>
              <CircleOverlay
                stage={stage}
                center={center}
                ghost={ghost}
                dragging={dragging}
                onNudge={nudge}
              />
              {/* drag surface */}
              <div
                className="absolute inset-0"
                style={{ cursor: dragging ? 'grabbing' : 'default', touchAction: 'none' }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                aria-hidden
              />
            </StageFrame>
            <p className="mt-3 font-ui text-caption" style={{ color: 'var(--fg-2)' }}>
              Drag the circle on the map, or focus it and use arrow keys (1° per step, shift
              for 10°).
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------------- readouts ---------------- */

function Readout({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="font-ui text-label uppercase" style={{ color: 'var(--fg-3)' }}>
        {label}
      </dt>
      <dd
        className="font-mono"
        style={{ color: 'var(--fg)', fontFeatureSettings: "'tnum'", fontSize: '1rem' }}
      >
        {value}
      </dd>
      {hint && (
        <dd className="font-ui text-caption" style={{ color: 'var(--fg-3)', fontSize: 11 }}>
          {hint}
        </dd>
      )}
    </div>
  )
}

/* ---------------- the circle glyph (SVG, glued via lonLatToScreen) ---------------- */

function CircleOverlay({
  stage,
  center,
  ghost,
  dragging,
  onNudge,
}: {
  stage: MapStage | null
  center: Center
  ghost: Center | null
  dragging: boolean
  onNudge: (dLon: number, dLat: number) => void
}) {
  const pathRef = useRef<SVGPathElement>(null)
  const ghostRef = useRef<SVGPathElement>(null)
  const handleRef = useRef<HTMLButtonElement>(null)
  const centerRef = useRef(center)
  const ghostCenterRef = useRef(ghost)
  useEffect(() => {
    centerRef.current = center
    ghostCenterRef.current = ghost
  })

  useEffect(() => {
    if (!stage) return
    const drawCircleAt = (c: Center, el: SVGPathElement | null) => {
      if (!el) return
      const { lon, lat } = geodesicCircle(c.lon, c.lat, RADIUS_DEG, CIRCLE_N)
      let d = ''
      let pen = false
      for (let i = 0; i <= CIRCLE_N; i++) {
        const k = i % CIRCLE_N
        const s = stage.lonLatToScreen(lon[k] * D2R, lat[k] * D2R)
        if (!s || !s.visible) {
          pen = false
          continue
        }
        d += `${pen ? 'L' : 'M'}${s.x.toFixed(1)},${s.y.toFixed(1)}`
        pen = true
      }
      if (pen) d += 'Z'
      el.setAttribute('d', d)
    }
    const redraw = () => {
      drawCircleAt(centerRef.current, pathRef.current)
      drawCircleAt(ghostCenterRef.current ?? centerRef.current, ghostRef.current)
      if (ghostRef.current) {
        ghostRef.current.style.opacity = ghostCenterRef.current ? '1' : '0'
      }
      const handle = handleRef.current
      if (handle) {
        const s = stage.lonLatToScreen(
          centerRef.current.lon * D2R,
          centerRef.current.lat * D2R,
        )
        if (s && s.visible) {
          handle.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -50%)`
          handle.style.opacity = '1'
        } else {
          handle.style.opacity = '0'
        }
      }
    }
    // eslint-disable-next-line react-hooks/immutability -- imperative engine API (same pattern as MapStage.onHover)
    stage.onFrame = redraw
    redraw()
    stage.invalidate()
    return () => {
      if (stage.onFrame === redraw) stage.onFrame = null
    }
  }, [stage])

  // Center/ghost changes while idle still need one repaint.
  useEffect(() => {
    stage?.invalidate()
  }, [stage, center, ghost])

  return (
    <>
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <path
          ref={ghostRef}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1}
          strokeDasharray="3 4"
          style={{ opacity: 0, transition: 'opacity 300ms var(--ease-atlas)' }}
          strokeOpacity={0.35}
        />
        <path
          ref={pathRef}
          fill="var(--accent)"
          fillOpacity={dragging ? 0.16 : 0.12}
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </svg>
      <button
        ref={handleRef}
        type="button"
        aria-label="Move the circle. Arrow keys move one degree; hold shift for ten degrees."
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 1
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            onNudge(0, step)
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            onNudge(0, -step)
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault()
            onNudge(-step, 0)
          } else if (e.key === 'ArrowRight') {
            e.preventDefault()
            onNudge(step, 0)
          }
        }}
        className="absolute left-0 top-0 z-10 flex h-11 w-11 items-center justify-center rounded-full"
        style={{
          background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
          border: '2px solid var(--accent)',
          pointerEvents: 'none', // pointer drags are handled by the stage surface; this is the keyboard control
          opacity: 0, // revealed by redraw() once positioned
          // positioned imperatively in redraw()
        }}
      >
        <span
          aria-hidden
          className="block h-2 w-2 rounded-full"
          style={{ background: 'var(--accent)' }}
        />
      </button>
    </>
  )
}
