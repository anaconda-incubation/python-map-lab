/**
 * DESIGN BY GOAL results panel (design/lab.md): name field, coefficient
 * readout table (click to copy), measured score block, comparison bars vs
 * the four canonical flat projections, and the actions row.
 */
import { useToast } from '@/hooks/useToast'
import type { LossTerms } from './loss'
import type { Family, LabScores } from './types'

export interface DesignResult {
  family: Family
  params: number[]
  loss: number
  terms: LossTerms | null
  iterations: number
  evaluations: number
  converged: boolean
  /** true when produced by the TS mirror (SciPy unavailable) */
  mirror: boolean
  elapsedMs: number
  stageKey: string
}

const PARAM_NAMES: Record<Family, string[]> = {
  equal_area: ['m', 'a1', 'a3', 'a5', 'a7', 'a9'],
  compromise: ['m', 'a1', 'a3', 'a5', 'a7', 'a9', 'g0', 'g2', 'g4', 'g6'],
}

export interface CanonScore {
  id: string
  name: string
  scores: LabScores
}

export interface ResultsPanelProps {
  result: DesignResult
  name: string
  onNameChange: (name: string) => void
  userScores: LabScores | null
  canonScores: CanonScore[] | null
  onCompare: () => void
  compareActive: boolean
  onSendToPython: () => void
  onShare: () => void
  onSave: () => void
}

const TERM_LABELS: [keyof LossTerms, string][] = [
  ['area', 'RMS log₂ area'],
  ['shape', 'RMS ω (shape)'],
  ['distance', 'distance stress'],
  ['extreme', 'p95 extremes'],
  ['outline', 'outline penalty'],
]

function fmt(v: number | undefined, digits = 4): string {
  return v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(digits)
}

export default function ResultsPanel({
  result,
  name,
  onNameChange,
  userScores,
  canonScores,
  onCompare,
  compareActive,
  onSendToPython,
  onShare,
  onSave,
}: ResultsPanelProps) {
  const { toast } = useToast()
  const names = PARAM_NAMES[result.family]
  const barMax =
    canonScores && userScores
      ? Math.max(userScores.airyKavrayskiy, ...canonScores.map((c) => c.scores.airyKavrayskiy), 0.01)
      : 1

  const copyCoefficients = async () => {
    const text = names.map((n, i) => `${n} = ${result.params[i]}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast('Coefficients copied')
    } catch {
      toast('Copy failed — select and copy manually', { tone: 'error' })
    }
  }

  return (
    <section
      aria-label="Your projection"
      className="results-in"
      style={{ border: '1px solid var(--hair)', background: 'var(--bg-2)' }}
    >
      <div className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            aria-label="Projection name"
            className="display-tight w-full max-w-[340px] border-0 bg-transparent font-display"
            style={{ color: 'var(--fg)', fontSize: '24px', fontWeight: 400, borderBottom: '1px solid var(--hair)' }}
            placeholder="MY PROJECTION #1"
            maxLength={60}
          />
          <span
            className="font-ui uppercase"
            style={{ color: 'var(--fg-3)', fontSize: '10.5px', letterSpacing: '0.12em' }}
          >
            {result.iterations === 0
              ? 'restored from a shared link / shelf'
              : result.converged
                ? `converged in ${result.iterations} iterations`
                : `budget exhausted — best found (${result.iterations} iterations)`}
            {result.mirror
              ? ' · JS mirror (scipy offline)'
              : result.elapsedMs > 0
                ? ` · ${Math.round(result.elapsedMs)} ms`
                : ''}
          </span>
        </div>

        <div className="mt-5 grid gap-6 md:grid-cols-2">
          {/* coefficients */}
          <div>
            <div className="flex items-baseline justify-between">
              <h3 className="kicker" style={{ color: 'var(--fg-3)' }}>
                Coefficients · {result.family === 'equal_area' ? 'Equal-Area Family' : 'Compromise Family'}
              </h3>
              <button
                type="button"
                onClick={copyCoefficients}
                className="font-ui uppercase transition-colors hover:text-accent"
                style={{ color: 'var(--fg-3)', fontSize: '10.5px', letterSpacing: '0.12em' }}
              >
                Copy
              </button>
            </div>
            <table className="mt-2 w-full font-mono" style={{ fontSize: '12px', color: 'var(--fg-2)' }}>
              <tbody>
                {names.map((n, i) => (
                  <tr key={n} style={{ borderBottom: '1px solid var(--hair)' }}>
                    <td className="py-1 pr-4" style={{ color: 'var(--fg-3)' }}>
                      {n}
                    </td>
                    <td className="py-1 text-right" style={{ color: 'var(--fg)', fontFeatureSettings: "'tnum'" }}>
                      {fmt(result.params[i], 8)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* measured scores */}
          <div>
            <h3 className="kicker" style={{ color: 'var(--fg-3)' }}>
              Measured
            </h3>
            <div className="mt-2 flex flex-col gap-1.5 font-mono" style={{ fontSize: '12px' }}>
              {result.family === 'equal_area' ? (
                <span style={{ color: '#7FA88F' }}>EQUAL-AREA ✓ (by construction)</span>
              ) : (
                <span style={{ color: 'var(--fg)' }}>
                  RMS log₂ area {userScores ? fmt(userScores.rmsLog2Area, 3) : fmt(result.terms?.area, 3)}
                </span>
              )}
              {userScores && (
                <>
                  <span style={{ color: 'var(--fg-2)' }}>
                    ω median {fmt(userScores.medianOmegaDeg, 1)}° · p95 {fmt(userScores.p95OmegaDeg, 1)}° · max{' '}
                    {fmt(userScores.maxOmegaDeg, 1)}°
                  </span>
                  <span style={{ color: 'var(--fg-2)' }}>
                    Airy–Kavrayskiy {fmt(userScores.airyKavrayskiy, 3)}
                  </span>
                </>
              )}
              {result.terms && (
                <span style={{ color: 'var(--fg-3)' }}>
                  loss {fmt(result.loss)} ={' '}
                  {TERM_LABELS.map(([k, label]) => `${label} ${fmt(result.terms?.[k], 3)}`).join(' · ')}
                </span>
              )}
            </div>

            {/* comparison bars */}
            {canonScores && userScores && (
              <div className="mt-4" role="img" aria-label="Distortion comparison: your projection vs the four canonical projections, Airy–Kavrayskiy criterion">
                {([
                  { id: 'you', name: name || 'Your projection', scores: userScores, you: true },
                  ...canonScores.map((c) => ({ id: c.id, name: c.name, scores: c.scores, you: false })),
                ] as { id: string; name: string; scores: LabScores; you: boolean }[]).map((row) => (
                    <div key={row.id} className="mb-2">
                      <div className="flex justify-between font-ui" style={{ fontSize: '10.5px', letterSpacing: '0.08em', color: row.you ? 'var(--accent)' : 'var(--fg-3)' }}>
                        <span className="uppercase">{row.name}</span>
                        <span className="font-mono">{fmt(row.scores.airyKavrayskiy, 3)}</span>
                      </div>
                      <div className="mt-0.5 h-[6px] w-full" style={{ background: 'var(--bg-3)' }}>
                        <div
                          className="h-full"
                          style={{
                            width: `${Math.min(100, (row.scores.airyKavrayskiy / barMax) * 100)}%`,
                            background: row.you ? 'var(--accent)' : 'var(--fg-3)',
                            transition: 'width 600ms var(--ease-atlas)',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                <p className="mt-1 font-ui" style={{ fontSize: '10px', color: 'var(--fg-3)' }}>
                  Airy–Kavrayskiy global criterion — lower distorts less. No projection reaches 0.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* actions */}
        <div className="mt-6 flex flex-wrap gap-2">
          <ActionButton onClick={onCompare} pressed={compareActive}>
            {compareActive ? 'Comparing on stage' : 'Compare on stage'}
          </ActionButton>
          <ActionButton onClick={onSendToPython}>Send to Python mode</ActionButton>
          <ActionButton onClick={onShare}>Share link</ActionButton>
          <ActionButton onClick={onSave}>Save locally</ActionButton>
        </div>
      </div>
      <style>{`.results-in { animation: results-in-kf 420ms var(--ease-atlas); } @keyframes results-in-kf { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }`}</style>
    </section>
  )
}

function ActionButton({
  children,
  onClick,
  pressed,
}: {
  children: React.ReactNode
  onClick: () => void
  pressed?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className="font-ui uppercase transition-colors duration-micro ease-atlas hover:text-accent"
      style={{
        border: '1px solid var(--hair)',
        background: pressed ? 'var(--bg-3)' : 'transparent',
        color: 'var(--fg)',
        fontSize: '11px',
        letterSpacing: '0.12em',
        padding: '12px 16px',
        minHeight: '44px',
      }}
    >
      {children}
    </button>
  )
}
