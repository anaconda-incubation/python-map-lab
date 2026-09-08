import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ChapterKicker from '@/components/ChapterKicker'
import type { ProjectionScorecard } from '@/projection/metrics'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { StageFrame } from '@/chapters/StageBlockC'
import {
  EASE_ATLAS,
  EASE_MORPH,
  fmtSig,
  getScorecard,
  tweenValue,
  useLazyMapStage,
  type TweenHandle,
} from '@/chapters/stageC'

/**
 * CHAPTER 08 · THE SCORECARD — "What are we trying to preserve?" (home.md §08)
 *
 * A full-width typographic comparison of the five projections across AREA,
 * LOCAL SHAPE, DISTANCE, DIRECTION, CONTINUITY, POLAR BEHAVIOR and WORLD
 * OUTLINE. Two kinds of cells are visually distinguished at all times:
 *   EXACT    — provable properties (equal-area, conformal, rhumb), ✓/✗/◐
 *   MEASURED — statistics from src/projection/metrics.ts on a 5,001-point
 *              area-weighted Fibonacci sample (RMS log₂ area error, ω
 *              median/p95/max, distance stress after optimal global scale).
 * No subjective preference is presented as objective truth; qualitative cells
 * are explicitly labeled EDITORIAL.
 */

const FLAT_IDS = ['mercator', 'gallPeters', 'equalEarth', 'authagraph'] as const

type RowId = 'globe' | (typeof FLAT_IDS)[number]

interface Row {
  id: RowId
  name: string
  /** exact property marks */
  equalArea: '✓' | '✗' | '◐'
  conformal: '✓' | '✗' | '◐'
  /** qualitative, editorial cells */
  direction: string
  continuity: string
  polar: string
  outline: string
}

const ROWS: Row[] = [
  {
    id: 'globe',
    name: 'Globe',
    equalArea: '✓',
    conformal: '✓',
    direction: 'Great circles are straight; compass bearings curve.',
    continuity: 'Seamless — no cut exists.',
    polar: 'Points, exactly as on Earth.',
    outline: 'Sphere. The reference, not an answer.',
  },
  {
    id: 'mercator',
    name: 'Mercator',
    equalArea: '✗',
    conformal: '✓',
    direction: 'Rhumb lines straight — the only one. EXACT.',
    continuity: 'Continuous cylinder; one antimeridian cut.',
    polar: 'Poles at infinity — the map must clip (here ±85°).',
    outline: 'Rectangle, 2 : 1.06. Calm, familiar, wrong-sized.',
  },
  {
    id: 'gallPeters',
    name: 'Gall–Peters',
    equalArea: '✓',
    conformal: '✗',
    direction: 'Rhumb lines curve.',
    continuity: 'Continuous cylinder; one antimeridian cut.',
    polar: 'Poles stretched to full-width lines; shapes crush near them.',
    outline: 'Rectangle, 2.22 : 1.41.',
  },
  {
    id: 'equalEarth',
    name: 'Equal Earth',
    equalArea: '✓',
    conformal: '✗',
    direction: 'Rhumb lines curve.',
    continuity: 'Pseudocylindrical; one antimeridian cut.',
    polar: 'Pole line at 0.59× equator width — a designed compromise.',
    outline: 'Pointed ellipse, ≈ 2.05 : 1.',
  },
  {
    id: 'authagraph',
    name: 'AuthaGraph',
    equalArea: '◐',
    conformal: '✗',
    direction: 'Rhumb lines curve; bearings kink at face seams.',
    continuity: 'Unfolded tetrahedron — interior seams between 96 regions.',
    polar: 'Poles land inside faces, spread apart, not piled up.',
    outline: 'Rectangle, 4√3 : 3 ≈ 2.31 : 1. Tessellates seamlessly.',
  },
]

const COL_TIPS: Record<string, string> = {
  area: 'Exact: is the projection provably equal-area? Measured: RMS of log₂ local area scale over 5,001 area-weighted Fibonacci samples (0 = perfect).',
  shape: 'Exact: is it provably conformal? Measured: maximum angular deformation ω = 2·asin((σ1−σ2)/(σ1+σ2)) from the local Jacobian — median, p95 and worst.',
  distance: 'Measured only: RMS of log(projected ÷ great-circle distance) over 1,500 random sample pairs, after fitting one optimal global scale. What no uniform rescaling could fix.',
  direction: 'Editorial: rhumb lines (constant compass bearing) are straight only on Mercator — its founding property.',
  continuity: 'Editorial: where the map must cut the Earth to lay it flat.',
  polar: 'Editorial: what happens near ±90°, where most world maps quietly give up.',
  outline: 'Editorial: the map frame’s aspect and compactness — whether the world reads as one object.',
}

type Overlay = 'area' | 'angle' | null

export default function Ch08Scorecard() {
  const { reducedMotion } = useReducedMotion()
  const { hostRef, stage } = useLazyMapStage({
    layers: { graticule: true, tissot: true },
  })

  const [activeRow, setActiveRow] = useState<RowId>('mercator')
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [scores, setScores] = useState<
    Partial<Record<string, { nonce: number; sc: ProjectionScorecard }>>
  >({})
  const [nonce, setNonce] = useState(0)
  /** true while any scorecard for the current nonce is still computing */
  const measuring = FLAT_IDS.some((id) => scores[id]?.nonce !== nonce)

  const currentRef = useRef<RowId>('mercator')
  const tweenRef = useRef<TweenHandle | null>(null)

  /* ---------- measured scores (lazy, cached, re-runnable) ---------- */
  useEffect(() => {
    let alive = true
    for (const id of FLAT_IDS) {
      void getScorecard(id, { samples: 5001, distancePairs: 1500, nonce }).then((sc) => {
        if (!alive) return
        setScores((prev) => ({ ...prev, [id]: { nonce, sc } }))
      })
    }
    return () => {
      alive = false
    }
  }, [nonce])

  /* ---------- stage: morph to active row ---------- */
  useEffect(() => {
    const s = stage
    if (!s) return
    const from = currentRef.current
    const to = activeRow
    if (from === to) {
      void s.setMorphTargets(to, to).then(() => s.setMorph(1))
      return
    }
    currentRef.current = to
    tweenRef.current?.cancel()
    void s.setMorphTargets(from, to).then(() => {
      tweenRef.current = tweenValue(0, 1, {
        duration: 1200,
        ease: EASE_MORPH,
        reduced: reducedMotion,
        onUpdate: (v) => s.setMorph(v),
      })
    })
  }, [stage, activeRow, reducedMotion])

  useEffect(() => {
    stage?.setLayers({
      graticule: true,
      tissot: true,
      area: overlay === 'area',
      angle: overlay === 'angle',
    })
  }, [stage, overlay])

  useEffect(() => {
    stage?.setAutoRotate(activeRow === 'globe')
  }, [stage, activeRow])

  const activeName = ROWS.find((r) => r.id === activeRow)?.name ?? ''
  const ariaLabel = useMemo(
    () =>
      `Scorecard comparison stage. Showing ${activeName}` +
      (overlay === 'area'
        ? ' with the area-distortion overlay'
        : overlay === 'angle'
          ? ' with the angular-distortion overlay'
          : ' with Tissot indicatrices') +
      '. Hover or focus a table row to change the projection.',
    [activeName, overlay],
  )

  const colHover = useCallback((col: string | null) => {
    setOverlay(col === 'area' ? 'area' : col === 'shape' ? 'angle' : null)
  }, [])

  return (
    <section
      id="ch-08"
      aria-labelledby="ch-08-title"
      className="mx-auto max-w-container scroll-mt-20 px-[var(--gutter)] py-24"
    >
      <ChapterKicker
        numeral="08"
        kicker="THE SCORECARD"
        title="What are we trying to preserve?"
        titleId="ch-08-title"
        standfirst="Two kinds of rows live in this table. An exact property is a theorem about the projection — true or false, provable. A measured score is a statistic computed from sampling. Never confuse the map's promise with the map's performance."
        accent="vermilion"
      />

      {/* Legend */}
      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 font-ui text-caption" style={{ color: 'var(--fg-2)' }}>
        <span className="flex items-center gap-2">
          <Tag kind="exact" /> a theorem — provable, no sampling
        </span>
        <span className="flex items-center gap-2">
          <Tag kind="measured" /> a statistic — 5,001-point area-weighted Fibonacci sample
        </span>
        <span className="flex items-center gap-2">
          <Tag kind="editorial" /> a qualitative judgment — argued, not computed
        </span>
      </div>

      <div className="mt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,38%)] lg:gap-12">
        {/* Stage (above the table on mobile, sticky right on desktop) */}
        <div className="order-first mb-8 lg:order-last lg:mb-0">
          <div className="lg:sticky lg:top-24">
            <StageFrame hostRef={hostRef} ariaLabel={ariaLabel} height="min(50vh, 480px)" />
            <p className="mt-3 font-ui text-caption" style={{ color: 'var(--fg-2)' }}>
              The stage answers the table: focus or hover a row to morph; hover the AREA or
              LOCAL SHAPE headers to light the matching distortion overlay.
            </p>
          </div>
        </div>

        {/* The table */}
        <div className="overflow-x-auto">
          <table
            className="w-full border-collapse"
            style={{ borderTop: '2px solid var(--fg)', borderBottom: '2px solid var(--fg)' }}
          >
            <thead>
              <tr>
                <Th label="Projection" tip="The five answers from chapters 03–06, plus the reference globe." onHover={colHover} col="" className="sticky left-0 z-10 bg-bg text-left" />
                <Th label="Area" tip={COL_TIPS.area} onHover={colHover} col="area" />
                <Th label="Local shape" tip={COL_TIPS.shape} onHover={colHover} col="shape" />
                <Th label="Distance" tip={COL_TIPS.distance} onHover={colHover} col="distance" />
                <Th label="Direction" tip={COL_TIPS.direction} onHover={colHover} col="direction" />
                <Th label="Continuity" tip={COL_TIPS.continuity} onHover={colHover} col="continuity" />
                <Th label="Polar behavior" tip={COL_TIPS.polar} onHover={colHover} col="polar" />
                <Th label="World outline" tip={COL_TIPS.outline} onHover={colHover} col="outline" />
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const sc = row.id === 'globe' ? undefined : scores[row.id]?.sc
                const active = row.id === activeRow
                return (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    onMouseEnter={() => setActiveRow(row.id)}
                    onFocus={() => setActiveRow(row.id)}
                    onClick={() => setActiveRow(row.id)}
                    aria-current={active}
                    className="cursor-pointer align-top outline-none transition-colors duration-micro"
                    style={{
                      borderTop: '1px solid var(--hair)',
                      background: active ? 'color-mix(in srgb, var(--bg-2) 70%, transparent)' : 'transparent',
                    }}
                  >
                    <th
                      scope="row"
                      className="sticky left-0 z-10 whitespace-nowrap py-4 pr-4 text-left font-display"
                      style={{
                        background: active ? 'var(--bg-2)' : 'var(--bg)',
                        color: active ? 'var(--accent)' : 'var(--fg)',
                        fontWeight: 460,
                        fontSize: '1.05rem',
                        minWidth: 120,
                      }}
                    >
                      {row.name}
                    </th>
                    {/* AREA */}
                    <td className="py-4 pr-4" style={{ minWidth: 150 }}>
                      <div className="flex items-center gap-2">
                        <Tag kind="exact" />
                        <Mark v={row.equalArea} />
                        <span className="font-ui text-caption" style={{ color: 'var(--fg-2)' }}>
                          {row.equalArea === '✓'
                            ? 'equal-area'
                            : row.equalArea === '◐'
                              ? 'equal-area type (96 regions)'
                              : 'not equal-area'}
                        </span>
                      </div>
                      <Measured
                        label="RMS log₂"
                        value={row.id === 'globe' ? '0.00' : sc ? fmtSig(sc.rmsLog2AreaError) : undefined}
                        suffix={row.id === 'globe' ? 'reference' : undefined}
                        reduced={reducedMotion}
                        shimmer={measuring && row.id !== 'globe'}
                      />
                    </td>
                    {/* LOCAL SHAPE */}
                    <td className="py-4 pr-4" style={{ minWidth: 170 }}>
                      <div className="flex items-center gap-2">
                        <Tag kind="exact" />
                        <Mark v={row.conformal} />
                        <span className="font-ui text-caption" style={{ color: 'var(--fg-2)' }}>
                          {row.conformal === '✓' ? 'conformal' : 'not conformal'}
                        </span>
                      </div>
                      {row.id === 'globe' ? (
                        <Measured label="ω max" value="0.0°" suffix="reference" reduced={reducedMotion} />
                      ) : (
                        <>
                          <Measured
                            label="ω median / p95"
                            value={sc ? `${fmtSig(sc.medianOmegaDeg)}° / ${fmtSig(sc.p95OmegaDeg)}°` : undefined}
                            reduced={reducedMotion}
                            shimmer={measuring}
                          />
                          <Measured
                            label="ω max"
                            value={sc ? `${fmtSig(sc.maxOmegaDeg)}°` : undefined}
                            reduced={reducedMotion}
                            shimmer={measuring}
                          />
                        </>
                      )}
                    </td>
                    {/* DISTANCE */}
                    <td className="py-4 pr-4" style={{ minWidth: 130 }}>
                      {row.id === 'globe' ? (
                        <Measured label="stress" value="0.00" suffix="reference" reduced={reducedMotion} />
                      ) : (
                        <Measured
                          label="stress RMS"
                          value={sc ? fmtSig(sc.distanceStressRms) : undefined}
                          reduced={reducedMotion}
                          shimmer={measuring}
                        />
                      )}
                      <p className="mt-1 font-ui text-caption" style={{ color: 'var(--fg-3)', fontSize: 11 }}>
                        after optimal global scale
                      </p>
                    </td>
                    {/* DIRECTION / CONTINUITY / POLAR / OUTLINE — editorial */}
                    {[row.direction, row.continuity, row.polar, row.outline].map((text, i) => (
                      <td key={i} className="py-4 pr-4" style={{ minWidth: 150 }}>
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 shrink-0">
                            <Tag kind={i === 0 && row.id === 'mercator' ? 'exact' : 'editorial'} />
                          </span>
                          <span className="font-ui text-caption" style={{ color: 'var(--fg-2)' }}>
                            {text}
                          </span>
                        </div>
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>

          <p className="mt-4 max-w-measure font-ui text-caption" style={{ color: 'var(--fg-3)' }}>
            Reference anchors from the literature: Kerkovits (2021) reports Equal Earth at
            RMSE 2.678° mean angular deformation; Narukawa (2022) reports AuthaGraph mean
            area distortion ≈ 38%, mean max angular distortion ≈ 0.77 rad, distance ≈ 59%.
            Our sampler measures different statistics on a different grid — agreement in
            character, not in the third decimal.
          </p>
        </div>
      </div>

      {/* Methodology disclosure */}
      <details
        className="code-well mt-12 max-w-measure p-6"
        style={{ border: '1px solid var(--hair)' }}
      >
        <summary
          className="cursor-pointer font-ui text-label uppercase"
          style={{ color: 'var(--fg-3)' }}
        >
          Sampling methodology — how these numbers are computed
        </summary>
        <div className="mt-4 font-mono text-caption" style={{ color: 'var(--fg-2)', lineHeight: 1.7 }}>
          <p>
            samples: 5,001 points, Fibonacci spiral (golden angle π(3−√5), González 2010) —
            each point represents equal sphere area 4π/N, so no weighting is needed.
          </p>
          <p className="mt-2">
            per point: numerical Jacobian J of the projection (central differences,
            h = 10⁻⁶ rad) → closed-form 2×2 SVD → σ1 ≥ σ2.
          </p>
          <p className="mt-2">
            area error: RMS of log₂(σ1·σ2). angular: ω = 2·asin((σ1−σ2)/(σ1+σ2)), reported
            as median / p95 / max. distance: RMS of log(d_projected / d_great-circle) over
            1,500 deterministic pseudo-random pairs, after fitting one optimal global scale
            by least squares. invalid samples (projection limbs, Mercator beyond ±85°) are
            excluded and renormalized out.
          </p>
          <button
            type="button"
            onClick={() => setNonce((n) => n + 1)}
            className="mt-4 rounded-full px-4 py-2 font-ui text-label uppercase transition-colors duration-micro"
            style={{ border: '1px solid var(--accent)', color: 'var(--accent)' }}
          >
            {measuring ? 'Measuring…' : 'Recompute now'}
          </button>
          <span className="ml-3 font-ui text-caption" style={{ color: 'var(--fg-3)' }}>
            re-runs all four scorecards in about a second, on this device
          </span>
        </div>
      </details>

      <p className="pull-line mt-16 max-w-measure text-pull">
        Every projection in this table is the best answer to some question. The table&apos;s
        job is not to crown a winner — it is to make the questions askable.
      </p>
    </section>
  )
}

/* ---------------- cells ---------------- */

function Tag({ kind }: { kind: 'exact' | 'measured' | 'editorial' }) {
  const color =
    kind === 'exact' ? 'var(--seaweed)' : kind === 'measured' ? 'var(--ochre)' : 'var(--fg-3)'
  return (
    <span
      className="font-ui font-semibold uppercase"
      style={{
        fontSize: 9,
        letterSpacing: '0.12em',
        color,
        border: `1px solid ${color}`,
        borderRadius: 3,
        padding: '1px 4px',
        whiteSpace: 'nowrap',
      }}
    >
      {kind}
    </span>
  )
}

function Mark({ v }: { v: '✓' | '✗' | '◐' }) {
  return (
    <span
      aria-hidden
      className="font-ui font-semibold"
      style={{
        color: v === '✓' ? 'var(--seaweed)' : v === '◐' ? 'var(--ochre)' : 'var(--accent)',
        fontSize: '1rem',
      }}
    >
      {v}
    </span>
  )
}

/** Measured numeral with 600ms count-up on first reveal (reduced-motion: static). */
function Measured({
  label,
  value,
  suffix,
  reduced,
  shimmer,
}: {
  label: string
  value: string | undefined
  suffix?: string
  reduced: boolean
  shimmer?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState<string | undefined>(undefined)
  const numeric = value !== undefined ? parseFloat(value) : NaN
  const animate = !reduced && value !== undefined && Number.isFinite(numeric)

  useEffect(() => {
    if (!animate) return
    const el = ref.current
    if (!el || value === undefined) return
    let raf = 0
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        const start = performance.now()
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / 600)
          const v = numeric * EASE_ATLAS(t)
          setShown(value.replace(/[\d.]+/, trimNum(v, value)))
          if (t < 1) raf = requestAnimationFrame(step)
          else setShown(value)
        }
        raf = requestAnimationFrame(step)
      },
      { threshold: 0.4 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [value, numeric, animate])

  return (
    <div
      ref={ref}
      className="mt-1.5 flex items-baseline gap-2 transition-opacity duration-ui"
      style={{ opacity: shimmer && value === undefined ? 0.45 : 1 }}
    >
      <span className="font-ui text-label uppercase" style={{ color: 'var(--fg-3)' }}>
        {label}
      </span>
      <span
        className="font-mono text-caption"
        style={{ color: 'var(--fg)', fontFeatureSettings: "'tnum'" }}
      >
        {animate ? (shown ?? '·····') : (value ?? '·····')}
      </span>
      {suffix && (
        <span className="font-ui text-caption" style={{ color: 'var(--fg-3)', fontSize: 11 }}>
          {suffix}
        </span>
      )}
    </div>
  )
}

/** Match the target string's decimal precision during count-up. */
function trimNum(v: number, target: string): string {
  const m = target.match(/[\d.]+/)
  if (!m) return String(v)
  const decimals = m[0].includes('.') ? m[0].split('.')[1].length : 0
  return v.toFixed(decimals)
}

function Th({
  label,
  tip,
  col,
  onHover,
  className,
}: {
  label: string
  tip: string
  col: string
  onHover: (col: string | null) => void
  className?: string
}) {
  return (
    <th
      scope="col"
      title={tip}
      onMouseEnter={() => onHover(col)}
      onMouseLeave={() => onHover(null)}
      className={`py-3 pr-4 text-left font-ui text-label uppercase ${className ?? ''}`}
      style={{ color: 'var(--fg-3)', borderBottom: '1px solid var(--hair)', cursor: 'help' }}
    >
      {label}
    </th>
  )
}
