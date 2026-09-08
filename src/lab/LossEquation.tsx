/**
 * The loss equation, always visible (design/lab.md MODE 1 §2): KaTeX display
 * with the six weights live-substituted and normalized to sum 1; the weight
 * whose slider moved most recently renders in vermilion.
 */
import { useMemo } from 'react'
import EquationBlock from '@/components/EquationBlock'
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
  const tex = useMemo(() => {
    const sum = GOALS.reduce((s, g) => s + Math.max(0, weights[g.key]), 0) || 1
    const parts = GOALS.map((g) => {
      const w = Math.max(0, weights[g.key]) / sum
      const color = g.key === hotKey ? HOT : INK
      return `\\textcolor{${color}}{${w.toFixed(2)}}\\,${TERM_TEX[g.key]}`
    })
    // One term per line keeps the full objective readable in a narrow lab column.
    return String.raw`\begin{aligned}L &= ` + parts.join(String.raw` \\[3pt] &\quad + `) + String.raw`\end{aligned}`
  }, [weights, hotKey])

  return (
    <EquationBlock
      tex={tex}
      caption="The six priorities form one objective. A perfect solution does not exist — the optimizer can only trade one term against another."
    />
  )
}
