/**
 * Saved shelf (design/lab.md): horizontal card rail of saved projections —
 * name + tiny outline sparkline of the map boundary — click to remount,
 * × to delete. Shared between both modes.
 */
import type { ShelfEntry } from './types'

export interface ShelfRailProps {
  entries: ShelfEntry[]
  onLoad: (entry: ShelfEntry) => void
  onDelete: (id: string) => void
}

function OutlineSvg({ points }: { points?: [number, number][] }) {
  if (!points || points.length < 3) {
    return (
      <rect x={-0.9} y={-0.55} width={1.8} height={1.1} fill="none" stroke="var(--fg-3)" strokeWidth={0.05} />
    )
  }
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(3)},${y.toFixed(3)}`).join(' ')
  return <path d={`${d} Z`} fill="none" stroke="var(--fg-2)" strokeWidth={0.045} />
}

export default function ShelfRail({ entries, onLoad, onDelete }: ShelfRailProps) {
  if (entries.length === 0) return null
  return (
    <section aria-label="Saved projections" className="mt-6">
      <h3 className="kicker" style={{ color: 'var(--fg-3)' }}>
        Saved shelf
      </h3>
      <div
        className="mt-3 flex gap-3 overflow-x-auto pb-2"
        role="list"
        style={{ scrollbarWidth: 'thin' }}
      >
        {entries.map((e) => (
          <div
            key={e.id}
            role="listitem"
            className="group relative shrink-0"
            style={{ border: '1px solid var(--hair)', background: 'var(--bg-2)' }}
          >
            <button
              type="button"
              onClick={() => onLoad(e)}
              className="block px-3 pb-2 pt-2 text-left transition-colors duration-micro hover:text-accent"
              style={{ minWidth: '128px', minHeight: '44px' }}
              title={`Load ${e.name}`}
            >
              <svg width={104} height={52} viewBox="-1.15 -1.15 2.3 2.3" aria-hidden>
                <OutlineSvg points={e.payload.outline} />
              </svg>
              <span
                className="mt-1 block max-w-[128px] truncate font-ui text-caption"
                style={{ color: 'var(--fg)' }}
              >
                {e.name}
              </span>
              <span
                className="block font-ui uppercase"
                style={{ color: 'var(--fg-3)', fontSize: '9.5px', letterSpacing: '0.14em' }}
              >
                {e.payload.mode === 'design' ? 'by goal' : 'python'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onDelete(e.id)}
              aria-label={`Delete ${e.name}`}
              className="absolute right-0 top-0 flex items-center justify-center transition-colors duration-micro hover:text-accent"
              style={{ color: 'var(--fg-3)', minWidth: '44px', minHeight: '44px', margin: '-8px -8px 0 0' }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
