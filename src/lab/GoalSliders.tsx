/**
 * The six goal sliders (design/lab.md MODE 1 §1): 0–10, large thumbs,
 * keyboard ±1 / shift ±5, one-line definitions revealed on hover/focus.
 */
import { useState } from 'react'
import { GOALS, type GoalWeights } from './types'

export interface GoalSlidersProps {
  weights: GoalWeights
  onChange: (key: keyof GoalWeights, value: number) => void
  disabled?: boolean
}

export default function GoalSliders({ weights, onChange, disabled }: GoalSlidersProps) {
  const [hintKey, setHintKey] = useState<keyof GoalWeights | null>(null)
  const hint = hintKey ? GOALS.find((g) => g.key === hintKey) : null

  return (
    <div role="group" aria-label="Optimization goals">
      <div className="flex flex-col gap-4">
        {GOALS.map((g) => {
          const v = weights[g.key]
          const id = `goal-${g.key}`
          return (
            <div key={g.key}>
              <div className="mb-1 flex items-baseline justify-between">
                <label
                  htmlFor={id}
                  className="font-ui text-label uppercase"
                  style={{ color: 'var(--fg)' }}
                >
                  {g.label}
                </label>
                <output
                  htmlFor={id}
                  className="font-mono text-caption"
                  style={{ color: 'var(--accent)', fontFeatureSettings: "'tnum'" }}
                >
                  {v}
                </output>
              </div>
              <input
                id={id}
                type="range"
                min={0}
                max={10}
                step={1}
                value={v}
                disabled={disabled}
                aria-valuetext={`${g.label}: ${v} of 10. ${g.definition}`}
                onChange={(e) => onChange(g.key, Number(e.target.value))}
                onKeyDown={(e) => {
                  if (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowUp')) {
                    e.preventDefault()
                    onChange(g.key, Math.min(10, v + 5))
                  } else if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowDown')) {
                    e.preventDefault()
                    onChange(g.key, Math.max(0, v - 5))
                  }
                }}
                onMouseEnter={() => setHintKey(g.key)}
                onMouseLeave={() => setHintKey((k) => (k === g.key ? null : k))}
                onFocus={() => setHintKey(g.key)}
                onBlur={() => setHintKey((k) => (k === g.key ? null : k))}
                className="goal-slider block w-full"
              />
            </div>
          )
        })}
      </div>
      <p
        className="mt-3 min-h-[2.6em] font-ui text-caption transition-opacity duration-micro"
        style={{ color: 'var(--fg-2)', opacity: hint ? 1 : 0.35 }}
        aria-live="polite"
      >
        {hint ? hint.definition : 'Hover or focus a slider for its definition.'}
      </p>
      <style>{`
        .goal-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 44px;
          background: transparent;
          cursor: pointer;
        }
        .goal-slider:disabled { cursor: not-allowed; opacity: 0.5; }
        .goal-slider::-webkit-slider-runnable-track {
          height: 3px;
          background: var(--bg-3);
        }
        .goal-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 28px;
          height: 28px;
          margin-top: -12.5px;
          border-radius: 9999px;
          background: var(--accent);
          border: 2px solid var(--bg);
          transition: transform 180ms var(--ease-atlas);
        }
        .goal-slider:active::-webkit-slider-thumb { transform: scale(0.92); }
        .goal-slider::-moz-range-track { height: 3px; background: var(--bg-3); }
        .goal-slider::-moz-range-thumb {
          width: 24px; height: 24px; border-radius: 9999px;
          background: var(--accent); border: 2px solid var(--bg);
        }
      `}</style>
    </div>
  )
}
