/**
 * StageToggle (design.md §9): the distortion-engine layer switches — a
 * vertical stack of pill toggles rendered over the stage's lower edge.
 * Native <button aria-pressed> so the stack is keyboard-operable by default.
 */

export type StageLayer = 'geography' | 'graticule' | 'tissot' | 'area' | 'angle'

export type StageLayerState = Record<StageLayer, boolean>

// Public helper intentionally colocated with its provider or teaching component.
// eslint-disable-next-line react-refresh/only-export-components
export const STAGE_LAYERS: { id: StageLayer; label: string }[] = [
  { id: 'geography', label: 'Geography' },
  { id: 'graticule', label: 'Grid' },
  { id: 'tissot', label: 'Distortion circles' },
  { id: 'area', label: 'Area distortion' },
  { id: 'angle', label: 'Shape distortion' },
]

export interface StageToggleProps {
  /** Current on/off state per layer. */
  layers: StageLayerState
  /** Called when a layer is toggled. */
  onChange: (layer: StageLayer, on: boolean) => void
  className?: string
}

export default function StageToggle({ layers, onChange, className }: StageToggleProps) {
  return (
    <div
      className={`flex flex-wrap items-start gap-2 max-w-[420px] ${className ?? ''}`}
      role="group"
      aria-label="Map layers"
    >
      {STAGE_LAYERS.map(({ id, label }) => {
        const on = layers[id]
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(id, !on)}
            className="flex items-center gap-2 rounded-full px-3 py-2 min-h-[44px] font-ui text-label uppercase transition-all duration-micro ease-atlas"
            style={{
              background: on ? 'var(--accent)' : 'color-mix(in srgb, var(--bg) 72%, transparent)',
              color: on ? 'var(--on-accent)' : 'var(--fg-2)',
              border: `1px solid ${on ? 'var(--accent)' : 'var(--hair)'}`,
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
            }}
          >
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full transition-colors duration-micro"
              style={{ background: on ? 'var(--on-accent)' : 'var(--fg-3)' }}
            />
            {label}
          </button>
        )
      })}
    </div>
  )
}
