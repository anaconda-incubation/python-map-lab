import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ChapterKicker from '@/components/ChapterKicker'
import DataCallout from '@/components/DataCallout'
import areasData from '@/data/areas.json'
import { getProjection } from '@/projection/projections'
import { regionRing, sphericalRingArea, type RegionDef } from '@/projection/geometry'
import type { ProjectionId } from '@/projection/types'
import type { MapStage } from '@/three/MapStage'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import '@/projection/authagraph'
import { StageFrame } from '@/chapters/StageBlockC'
import {
  EASE_MORPH,
  tweenValue,
  useLazyMapStage,
  type TweenHandle,
} from '@/chapters/stageC'

/**
 * CHAPTER 09 · THE AREA TEST — "Fourteen Greenlands." (home.md §09)
 *
 * Pick regions; the table measures them. TRUE GEODESIC AREA comes from the
 * curated dataset (areas.json, footnoted). AREA ON THIS MAP is measured live
 * from the actual projected polygons: each region's densified boundary ring
 * is projected vertex-by-vertex through the active projection and its drawn
 * area is computed with the shoelace formula — nothing is hardcoded. The map
 * is then calibrated so its average area scale across all seven regions
 * matches truth, isolating the *relative* lie each projection tells.
 */

const REGIONS = areasData.regions as unknown as RegionDef[]

const PROJ_CHIPS: Array<{ id: ProjectionId; name: string }> = [
  { id: 'globe', name: 'GLOBE' },
  { id: 'mercator', name: 'MERCATOR' },
  { id: 'gallPeters', name: 'GALL–PETERS' },
  { id: 'equalEarth', name: 'EQUAL EARTH' },
  { id: 'authagraph', name: 'AUTHAGRAPH' },
]

const EARTH_MEAN_R_KM = 6371.0

interface Measurement {
  id: string
  name: string
  areaKm2: number
  vsGreenlandTrue: number
  /** shoelace area of the projected ring, raw projection units (R=1) */
  mapArea: number
  /** spherical area of the same ring (steradians, R=1) */
  sphereArea: number
}

/** Measure every region on a projection. Globe = the reference sphere itself. */
function measureAll(proj: ProjectionId): Measurement[] {
  const fn =
    proj === 'globe' ? null : (lon: number, lat: number) => getProjection(proj).projectPoint(lon, lat)
  return REGIONS.map((def) => {
    const ring = regionRing(def, 0.5)
    const sphereArea = sphericalRingArea(ring)
    let mapArea: number
    if (!fn) {
      mapArea = sphereArea
    } else {
      // shoelace over the projected boundary vertices
      let acc = 0
      let prev = fn(ring[ring.length - 1][0] * (Math.PI / 180), ring[ring.length - 1][1] * (Math.PI / 180))
      for (const [lon, lat] of ring) {
        const p = fn(lon * (Math.PI / 180), lat * (Math.PI / 180))
        if (Number.isFinite(p.x) && Number.isFinite(prev.x)) {
          acc += prev.x * p.y - p.x * prev.y
        }
        prev = p
      }
      mapArea = Math.abs(acc / 2)
    }
    return {
      id: def.id,
      name: def.name,
      areaKm2: def.areaKm2,
      vsGreenlandTrue: def.vsGreenland,
      mapArea,
      sphereArea,
    }
  })
}

const fmtKm = (v: number) =>
  `${Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} km²`

export default function Ch09AreaTest() {
  const { reducedMotion } = useReducedMotion()
  const { hostRef, stage } = useLazyMapStage({ layers: { graticule: true } })

  const [proj, setProj] = useState<ProjectionId>('mercator')
  const [selected, setSelected] = useState<string[]>(['greenland', 'africa'])
  const [showTrue, setShowTrue] = useState(true)

  const currentRef = useRef<ProjectionId>('mercator')
  const tweenRef = useRef<TweenHandle | null>(null)

  /* ---------- measurements (real polygons, shoelace) ---------- */
  const measured = useMemo(() => measureAll(proj), [proj])
  // Calibrate: the map's mean area scale across all seven regions ≡ truth.
  const calib = useMemo(() => {
    const sumMap = measured.reduce((s, m) => s + m.mapArea, 0)
    const sumTruth = measured.reduce((s, m) => s + m.sphereArea, 0)
    return sumMap > 0 ? sumTruth / sumMap : 1 // steradians per map unit
  }, [measured])
  const km2PerMapUnit = calib * EARTH_MEAN_R_KM * EARTH_MEAN_R_KM

  const byId = useMemo(() => new Map(measured.map((m) => [m.id, m])), [measured])
  const greenland = byId.get('greenland')!
  const africa = byId.get('africa')!

  /** Live-measured Africa÷Greenland on this map (not hardcoded). */
  const mapRatio = africa.mapArea / Math.max(1e-12, greenland.mapArea)
  const trueRatio = africa.areaKm2 / greenland.areaKm2

  const rows = measured.filter((m) => selected.includes(m.id))
  const maxBar = Math.max(...rows.map((m) => m.mapArea / greenland.mapArea), 1)

  /* ---------- stage: morph between projection chips ---------- */
  useEffect(() => {
    const s = stage
    if (!s) return
    const from = currentRef.current
    const to = proj
    if (from === to) {
      void s.setMorphTargets(to, to).then(() => s.setMorph(1))
      return
    }
    currentRef.current = to
    tweenRef.current?.cancel()
    void s.setMorphTargets(from, to).then(() => {
      tweenRef.current = tweenValue(0, 1, {
        duration: 1400,
        ease: EASE_MORPH,
        reduced: reducedMotion,
        onUpdate: (v) => s.setMorph(v),
      })
    })
  }, [stage, proj, reducedMotion])

  useEffect(() => {
    stage?.setAutoRotate(proj === 'globe')
  }, [stage, proj])

  const toggleRegion = useCallback((id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }, [])

  const projName = PROJ_CHIPS.find((p) => p.id === proj)?.name ?? ''
  const ariaLabel = `Area test instrument. Projection: ${projName}. Selected regions: ${
    rows.map((r) => r.name).join(', ') || 'none'
  }. Measured Africa-to-Greenland ratio on this map: ${mapRatio.toFixed(1)} to 1; true ratio ${trueRatio.toFixed(1)} to 1.`

  return (
    <section
      id="ch-09"
      aria-labelledby="ch-09-title"
      className="mx-auto max-w-container scroll-mt-20 px-[var(--gutter)] py-24"
    >
      <ChapterKicker
        numeral="09"
        kicker="THE AREA TEST"
        title="Fourteen Greenlands."
        titleId="ch-09-title"
        standfirst="Africa is fourteen times the size of Greenland. Don't take the map's word for it — measure the polygons the map actually draws, and watch the ratio confess."
        accent="vermilion"
      />

      <div className="mt-12 max-w-measure">
        <p className="font-body text-body" style={{ color: 'var(--fg)' }}>
          Below, every number in the <em>AREA ON THIS MAP</em> column is computed from the
          projected boundary you can see highlighted on the stage: vertices pushed through
          the projection&apos;s own equations, area summed with the shoelace formula. Switch
          projections and the measurement — not an illustration of it — changes.
        </p>
      </div>

      {/* Controls */}
      <div className="mt-12 flex flex-col gap-6">
        <div>
          <p className="mb-2 font-ui text-label uppercase" style={{ color: 'var(--fg-3)' }}>
            Projection
          </p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Projection">
            {PROJ_CHIPS.map((p) => (
              <Chip
                key={p.id}
                active={proj === p.id}
                onClick={() => setProj(p.id)}
                label={p.name}
                radio
              />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 font-ui text-label uppercase" style={{ color: 'var(--fg-3)' }}>
            Regions (toggle to compare)
          </p>
          <div className="flex flex-wrap gap-2">
            {REGIONS.map((r) => (
              <Chip
                key={r.id}
                active={selected.includes(r.id)}
                onClick={() => toggleRegion(r.id)}
                label={r.name}
                pressed={selected.includes(r.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Stage with measured-region overlay */}
      <div className="mt-8">
        <StageFrame hostRef={hostRef} ariaLabel={ariaLabel} height="min(60vh, 540px)">
          <RegionOverlay stage={stage} selected={selected} />
        </StageFrame>
      </div>

      {/* Headline callout */}
      <div className="mt-12 grid items-end gap-8 md:grid-cols-2">
        <div aria-live="polite">
          <DataCallout
            size="lg"
            accent="vermilion"
            value={`${mapRatio.toFixed(1)} : 1`}
            suffix={`ON ${projName}`}
            caption={`Africa ÷ Greenland as this map actually draws them — measured from the projected polygons. The truth is ${trueRatio.toFixed(1)} : 1.`}
          />
        </div>
        <div>
          <button
            type="button"
            aria-pressed={showTrue}
            onClick={() => setShowTrue((v) => !v)}
            className="rounded-full px-4 py-2 font-ui text-label uppercase transition-colors duration-micro"
            style={{
              border: '1px solid var(--accent)',
              color: showTrue ? 'var(--paper)' : 'var(--accent)',
              background: showTrue ? 'var(--accent)' : 'transparent',
            }}
          >
            Show true ratio
          </button>
          {showTrue && (
            <div className="mt-4" aria-hidden={false}>
              <RatioBar
                label={`This map: ${mapRatio.toFixed(1)} × Greenland`}
                frac={Math.min(1, mapRatio / trueRatio)}
                color="var(--accent)"
              />
              <RatioBar
                label={`Truth: ${trueRatio.toFixed(1)} × Greenland`}
                frac={1}
                color="var(--seaweed)"
              />
              <p className="mt-2 font-ui text-caption" style={{ color: 'var(--fg-3)' }}>
                Bars are proportional to the measured ratio; the vermilion bar is the map&apos;s
                claim, the seaweed bar is the geodesic truth ({trueRatio.toFixed(1)} units of
                Greenland per unit of Africa).
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Result table */}
      <div className="mt-12 overflow-x-auto">
        <table
          className="w-full border-collapse"
          style={{ borderTop: '2px solid var(--fg)', borderBottom: '2px solid var(--fg)' }}
          aria-label="Measured areas per region on the current projection"
        >
          <thead>
            <tr>
              {['Region', 'True geodesic area', 'Area on this map', 'Ratio vs truth', 'Appearance vs Greenland'].map(
                (h) => (
                  <th
                    key={h}
                    scope="col"
                    className="py-3 pr-4 text-left font-ui text-label uppercase"
                    style={{ color: 'var(--fg-3)', borderBottom: '1px solid var(--hair)' }}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 font-ui text-caption" style={{ color: 'var(--fg-3)' }}>
                  Select at least one region above.
                </td>
              </tr>
            )}
            {rows.map((m) => {
              const mapKm2 = m.mapArea * km2PerMapUnit
              const vsTruth = mapKm2 / m.areaKm2
              const appear = m.mapArea / Math.max(1e-12, greenland.mapArea)
              const boring = Math.abs(vsTruth - 1) < 0.005
              return (
                <tr key={m.id} style={{ borderTop: '1px solid var(--hair)' }}>
                  <th
                    scope="row"
                    className="whitespace-nowrap py-4 pr-4 text-left font-display"
                    style={{ fontWeight: 460, fontSize: '1.05rem', color: 'var(--fg)' }}
                  >
                    {m.name}
                  </th>
                  <td className="py-4 pr-4">
                    <span className="font-mono text-caption" style={{ color: 'var(--fg)', fontFeatureSettings: "'tnum'" }}>
                      {fmtKm(m.areaKm2)}
                    </span>
                    <span className="ml-2 font-ui text-caption" style={{ color: 'var(--fg-3)', fontSize: 11 }}>
                      ({m.vsGreenlandTrue}× Greenland)
                    </span>
                  </td>
                  <td className="py-4 pr-4">
                    <span className="font-mono text-caption" style={{ color: 'var(--fg)', fontFeatureSettings: "'tnum'" }}>
                      {fmtKm(mapKm2)}
                    </span>
                  </td>
                  <td className="py-4 pr-4">
                    <span
                      className="font-mono text-caption transition-colors duration-ui"
                      style={{
                        color: boring ? 'var(--seaweed)' : 'var(--accent)',
                        fontFeatureSettings: "'tnum'",
                      }}
                    >
                      {vsTruth.toFixed(2)}×
                    </span>
                  </td>
                  <td className="w-full min-w-[180px] py-4 pr-4">
                    <div className="relative h-4" style={{ background: 'var(--bg-3)' }}>
                      <div
                        className="absolute inset-y-0 left-0 transition-all duration-reveal ease-atlas"
                        style={{
                          width: `${Math.min(100, (appear / maxBar) * 100)}%`,
                          background: 'var(--accent)',
                          opacity: 0.85,
                        }}
                      />
                      {/* true ratio tick */}
                      <div
                        className="absolute -inset-y-1 w-[2px]"
                        style={{
                          left: `${Math.min(100, (m.vsGreenlandTrue / maxBar) * 100)}%`,
                          background: 'var(--seaweed)',
                        }}
                        title={`True: ${m.vsGreenlandTrue}× Greenland`}
                      />
                    </div>
                    <p className="mt-1 font-mono text-caption" style={{ color: 'var(--fg-3)', fontSize: 11 }}>
                      map {appear.toFixed(2)}× · true {m.vsGreenlandTrue}× · tick = truth
                    </p>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="mt-3 max-w-measure font-ui text-caption" style={{ color: 'var(--fg-3)' }}>
          Method: region boundaries from the curated dataset, densified to 0.5°; each ring is
          projected vertex-by-vertex and measured with the shoelace formula. &quot;Area on
          this map&quot; is calibrated so the map&apos;s mean area scale across all seven
          regions equals truth — isolating relative error from an arbitrary choice of printed
          scale. True areas are published figures (total area incl. inland water; Alaska per
          US Census Bureau). On AuthaGraph, rings that span face seams are measured with
          their seam kinks included — that is the point.
        </p>
      </div>

      <p className="pull-line mt-16 max-w-measure text-pull">
        Equal-area projections make this table boring: every ratio reads 1.00. Boring is
        what &quot;correct&quot; looks like. But scroll back to chapter 08 and check what
        Equal Earth&apos;s LOCAL SHAPE column costs.
      </p>
    </section>
  )
}

/* ---------------- controls ---------------- */

function Chip({
  active,
  onClick,
  label,
  radio,
  pressed,
}: {
  active: boolean
  onClick: () => void
  label: string
  radio?: boolean
  pressed?: boolean
}) {
  return (
    <button
      type="button"
      {...(radio ? { role: 'radio', 'aria-checked': active } : { 'aria-pressed': pressed })}
      onClick={onClick}
      className="min-h-[44px] rounded-full px-4 py-2 font-ui text-label uppercase transition-all duration-micro ease-atlas"
      style={{
        border: `1px solid ${active ? 'var(--accent)' : 'var(--hair)'}`,
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? 'var(--paper)' : 'var(--fg-2)',
      }}
    >
      {label}
    </button>
  )
}

function RatioBar({ label, frac, color }: { label: string; frac: number; color: string }) {
  return (
    <div className="mb-3">
      <div className="h-5 w-full" style={{ background: 'var(--bg-3)' }}>
        <div
          className="h-full transition-all duration-reveal ease-atlas"
          style={{ width: `${frac * 100}%`, background: color }}
        />
      </div>
      <p className="mt-1 font-ui text-caption" style={{ color: 'var(--fg-2)' }}>
        {label}
      </p>
    </div>
  )
}

/* ---------------- stage overlay (measured regions, drawn live) ---------------- */

function RegionOverlay({ stage, selected }: { stage: MapStage | null; selected: string[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const ringsRef = useRef<Map<string, number[][]>>(new Map())
  const selectedRef = useRef(selected)
  useEffect(() => {
    selectedRef.current = selected
  })

  // Pre-densify rings once.
  useEffect(() => {
    const m = new Map<string, number[][]>()
    for (const def of REGIONS) m.set(def.id, regionRing(def, 0.5))
    ringsRef.current = m
  }, [])

  // Imperative redraw on every rendered frame (morphs keep the overlay glued).
  useEffect(() => {
    if (!stage) return
    const redraw = () => {
      const svg = svgRef.current
      if (!svg) return
      for (const def of REGIONS) {
        const path = svg.querySelector<SVGPathElement>(`path[data-region="${def.id}"]`)
        if (!path) continue
        if (!selectedRef.current.includes(def.id)) {
          path.setAttribute('d', '')
          continue
        }
        const ring = ringsRef.current.get(def.id)
        if (!ring) continue
        let d = ''
        let pen = false
        for (const [lon, lat] of ring) {
          const s = stage.lonLatToScreen(lon * (Math.PI / 180), lat * (Math.PI / 180))
          if (!s || !s.visible) {
            pen = false
            continue
          }
          d += `${pen ? 'L' : 'M'}${s.x.toFixed(1)},${s.y.toFixed(1)}`
          pen = true
        }
        if (pen) d += 'Z'
        path.setAttribute('d', d)
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

  // Selection changes need a redraw even when the stage is idle.
  useEffect(() => {
    stage?.invalidate()
  }, [stage, selected])

  return (
    <svg
      ref={svgRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      {REGIONS.map((def) => (
        <path
          key={def.id}
          data-region={def.id}
          fill="var(--accent)"
          fillOpacity={0.25}
          stroke="var(--accent)"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}
