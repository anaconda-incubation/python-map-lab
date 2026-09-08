import { useId } from 'react'

/**
 * ScrubSlider (design.md §9): full-width morph slider — 2px track, 20px thumb
 * (pressed-state scale 0.92), numeric readout of morph t, arrow keys step 1%
 * (native range behaviour at step 0.01; shift = 10%).
 */
export interface ScrubSliderProps {
  /** Morph parameter, 0..1. */
  value: number
  onChange: (value: number) => void
  /** Accessible label, e.g. "Morph between projections". */
  label: string
  /** Optional tick stops (0..1) rendered under the track, e.g. projection stops. */
  stops?: number[]
  className?: string
}

export default function ScrubSlider({ value, onChange, label, stops, className }: ScrubSliderProps) {
  const id = useId()
  const pct = Math.min(1, Math.max(0, value))

  return (
    <div className={className}>
      <div className="mb-2 flex items-baseline justify-between">
        <label
          htmlFor={id}
          className="font-ui text-label uppercase"
          style={{ color: 'var(--fg-3)' }}
        >
          {label}
        </label>
        <output
          htmlFor={id}
          className="font-mono text-caption"
          style={{ color: 'var(--fg-2)', fontFeatureSettings: "'tnum'" }}
          aria-live="off"
        >
          t = {pct.toFixed(2)}
        </output>
      </div>
      <div className="relative">
        <input
          id={id}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={pct}
          onChange={(e) => onChange(Number(e.target.value))}
          onKeyDown={(e) => {
            // Shift = 10% steps (arrow keys natively give 1% via step)
            if (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowUp')) {
              e.preventDefault()
              onChange(Math.min(1, pct + 0.1))
            } else if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowDown')) {
              e.preventDefault()
              onChange(Math.max(0, pct - 0.1))
            }
          }}
          className="scrub-slider block w-full"
          aria-valuetext={`morph t = ${pct.toFixed(2)}`}
        />
        {stops && stops.length > 0 && (
          <div className="pointer-events-none relative mt-1 h-2 w-full" aria-hidden>
            {stops.map((s) => (
              <span
                key={s}
                className="absolute top-0 h-2 w-px"
                style={{ left: `${s * 100}%`, background: 'var(--fg-3)' }}
              />
            ))}
          </div>
        )}
      </div>
      <style>{`
        .scrub-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 20px;
          background: transparent;
          cursor: pointer;
        }
        .scrub-slider::-webkit-slider-runnable-track {
          height: 2px;
          background: var(--bg-3);
        }
        .scrub-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          margin-top: -9px;
          border-radius: 9999px;
          background: var(--accent);
          border: 2px solid var(--bg);
          transition: transform 180ms var(--ease-atlas);
        }
        .scrub-slider:active::-webkit-slider-thumb { transform: scale(0.92); }
        .scrub-slider::-moz-range-track {
          height: 2px;
          background: var(--bg-3);
        }
        .scrub-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          background: var(--accent);
          border: 2px solid var(--bg);
          transition: transform 180ms var(--ease-atlas);
        }
        .scrub-slider:active::-moz-range-thumb { transform: scale(0.92); }
      `}</style>
    </div>
  )
}
