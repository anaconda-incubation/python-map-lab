/**
 * Instrumentation strip (design/lab.md): JetBrains Mono readouts beneath the
 * stage — RMS log₂ area, ω̃ / p95 / max angular deformation, equal-area
 * verdict — with ▲▼ delta chips against the previous run.
 */
import type { LabScores } from './types'

export interface InstrumentationProps {
  scores: LabScores | null
  prev: LabScores | null
  /** extra chip, e.g. "EQUAL-AREA ✓ (by construction)" */
  badge?: string | null
}

function fmt(v: number, digits = 2): string {
  return Number.isFinite(v) ? v.toFixed(digits) : '—'
}

function Delta({ now, before, digits = 2 }: { now: number; before: number | undefined; digits?: number }) {
  if (before === undefined || !Number.isFinite(before) || !Number.isFinite(now)) return null
  const d = now - before
  if (Math.abs(d) < 0.005) return null
  const better = d < 0
  return (
    <span
      className="ml-1 font-mono"
      style={{ color: better ? '#7FA88F' : 'var(--accent)', fontSize: '10.5px' }}
      title={better ? 'improved vs previous run' : 'worse vs previous run'}
    >
      {better ? '▼' : '▲'}
      {Math.abs(d).toFixed(digits)}
    </span>
  )
}

export default function Instrumentation({ scores, prev, badge }: InstrumentationProps) {
  const equalArea = scores ? scores.rmsLog2Area < 0.01 : null
  return (
    <div
      className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2.5 font-mono text-caption"
      style={{
        borderTop: '1px solid var(--hair)',
        color: 'var(--fg-2)',
        fontSize: '12px',
        fontFeatureSettings: "'tnum'",
      }}
      aria-live="polite"
      aria-label="Distortion instrumentation"
    >
      <span>
        RMS log₂ area:{' '}
        <span style={{ color: 'var(--fg)' }}>
          {scores ? fmt(scores.rmsLog2Area) : '—'}
          {scores && <Delta now={scores.rmsLog2Area} before={prev?.rmsLog2Area} />}
        </span>
      </span>
      <span>
        ω̃{' '}
        <span style={{ color: 'var(--fg)' }}>
          {scores ? `${fmt(scores.medianOmegaDeg, 1)}°` : '—'}
          {scores && <Delta now={scores.medianOmegaDeg} before={prev?.medianOmegaDeg} digits={1} />}
        </span>
      </span>
      <span>
        p95{' '}
        <span style={{ color: 'var(--fg)' }}>
          {scores ? `${fmt(scores.p95OmegaDeg, 1)}°` : '—'}
          {scores && <Delta now={scores.p95OmegaDeg} before={prev?.p95OmegaDeg} digits={1} />}
        </span>
      </span>
      <span>
        max{' '}
        <span style={{ color: 'var(--fg)' }}>
          {scores ? `${fmt(scores.maxOmegaDeg, 1)}°` : '—'}
          {scores && <Delta now={scores.maxOmegaDeg} before={prev?.maxOmegaDeg} digits={1} />}
        </span>
      </span>
      <span>
        equal-area:{' '}
        <span style={{ color: equalArea ? '#7FA88F' : 'var(--fg)' }}>
          {scores ? (equalArea ? '✓' : `✗ (RMS ${fmt(scores.rmsLog2Area)})`) : '—'}
        </span>
      </span>
      {badge && (
        <span
          className="px-2 py-0.5 font-ui uppercase"
          style={{
            fontSize: '10.5px',
            letterSpacing: '0.08em',
            color: '#7FA88F',
            border: '1px solid rgba(127,168,143,0.4)',
          }}
        >
          {badge}
        </span>
      )}
    </div>
  )
}
