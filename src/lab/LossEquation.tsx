/**
 * The loss equation, always visible (design/lab.md MODE 1 §2): KaTeX display
 * with the six weights live-substituted and normalized to sum 1; the weight
 * whose slider moved most recently renders in vermilion.
 */
import { useMemo } from 'react'
import katex from 'katex'
import { GOALS, type GoalWeights } from './types'

const TERM_TEX: Record<keyof GoalWeights, string> = {
  area: '\\mathrm{RMS}\\!\\left(\\log_2 s\\right)',
  shape: '\\mathrm{RMS}\\!\\left(\\omega\\right)',
  distance: '\\mathrm{RMS}\\!\\left(\\log_2 k_c\\right)',
  direction: '\\mathrm{RMS}\\!\\left(\\Delta\\beta\\right)',
  compact: '\\mathrm{eccentricity}',
  extremes: '\\max\\!\\left(\\omega\\right)',
}

const INK = '#EDE6D6'
const HOT = '#C2481F'

export interface LossEquationProps {
  weights: GoalWeights
  /** goal key whose slider moved most recently (vermilion highlight) */
  hotKey: keyof GoalWeights | null
}

export default function LossEquation({ weights, hotKey }: LossEquationProps) {
  const html = useMemo(() => {
    const sum = GOALS.reduce((s, g) => s + Math.max(0, weights[g.key]), 0) || 1
    const parts = GOALS.map((g) => {
      const w = Math.max(0, weights[g.key]) / sum
      const color = g.key === hotKey ? HOT : INK
      return `\\textcolor{${color}}{${w.toFixed(2)}}\\,${TERM_TEX[g.key]}`
    })
    const tex = `L = ${parts.join(' + ')}`
    return katex.renderToString(tex, { displayMode: true, throwOnError: false, strict: false })
  }, [weights, hotKey])

  return (
    <figure
      style={{ background: 'var(--bg-2)', border: '1px solid var(--hair)', padding: '1.25rem 1rem' }}
    >
      <div
        className="overflow-x-auto text-center"
        style={{ fontSize: '0.98em', color: 'var(--fg)' }}
        aria-label="Loss equation with live weights"
        // KaTeX output is generated locally from our own TeX strings.
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <figcaption className="mt-3 font-ui text-caption" style={{ color: 'var(--fg-2)' }}>
        This is the whole idea of the essay, written as one line of mathematics. A perfect
        solution does not exist — the optimizer can only trade one term against another.
      </figcaption>
    </figure>
  )
}
