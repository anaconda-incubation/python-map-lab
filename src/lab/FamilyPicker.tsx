/**
 * Parametric family picker (design/lab.md MODE 1 §3): two radio cards,
 * hairline-bordered, selected = vermilion left rule.
 */
import type { Family } from './types'

const FAMILIES: { id: Family; name: string; formula: string; caption: string }[] = [
  {
    id: 'equal_area',
    name: 'Equal-Area Family',
    formula: 'y = Y(θ), x = λ cos θ / (m·Y′(θ)) — free: m, a₁, a₃, a₅, a₇, a₉',
    caption:
      'Whatever the optimizer does, area stays exact — x divides by Y′, so the Jacobian determinant is locked to 1. You are shopping for shape.',
  },
  {
    id: 'compromise',
    name: 'Compromise Family',
    formula: 'y = Y(θ), x = λ (g₀ + g₂θ² + g₄θ⁴ + g₆θ⁶) — coefficients independent',
    caption:
      'Nothing is sacred. The loss is the only law — area can trade against shape and distance, so the optimizer must earn what you asked for.',
  },
]

export interface FamilyPickerProps {
  value: Family
  onChange: (family: Family) => void
  disabled?: boolean
}

export default function FamilyPicker({ value, onChange, disabled }: FamilyPickerProps) {
  return (
    <fieldset disabled={disabled} className="m-0 border-0 p-0">
      <legend className="sr-only">Parametric family</legend>
      <div className="flex flex-col gap-3" role="radiogroup" aria-label="Parametric family">
        {FAMILIES.map((f) => {
          const selected = value === f.id
          return (
            <label
              key={f.id}
              className="block cursor-pointer transition-colors duration-micro ease-atlas"
              style={{
                border: '1px solid var(--hair)',
                borderLeft: selected ? '3px solid var(--accent)' : '1px solid var(--hair)',
                background: selected ? 'var(--bg-2)' : 'transparent',
                padding: '14px 16px',
              }}
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  name="lab-family"
                  value={f.id}
                  checked={selected}
                  onChange={() => onChange(f.id)}
                  className="sr-only"
                />
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 shrink-0 rounded-full"
                  style={{
                    border: '1px solid var(--fg-3)',
                    background: selected ? 'var(--accent)' : 'transparent',
                    boxShadow: selected ? 'inset 0 0 0 2px var(--bg)' : 'none',
                  }}
                />
                <span className="font-ui text-body-sm font-semibold" style={{ color: 'var(--fg)' }}>
                  {f.name}
                </span>
              </span>
              <span
                className="mt-2 block font-mono text-caption"
                style={{ color: 'var(--fg-2)', fontSize: '11.5px' }}
              >
                {f.formula}
              </span>
              <span className="mt-2 block font-body text-caption" style={{ color: 'var(--fg-2)' }}>
                {f.caption}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
