import { useRef } from 'react'
import type { MapQuality } from '@/projection/assets'

export type DistortionView = 'none' | 'circles' | 'area' | 'shape'

const views: { value: DistortionView; label: string; description: string }[] = [
  {
    value: 'none',
    label: 'Plain map',
    description: 'See the land and water without a distortion overlay.',
  },
  {
    value: 'circles',
    label: 'Distortion circles',
    description: 'These circles are equal on the globe. Compare how they stretch on the map.',
  },
  {
    value: 'area',
    label: 'Area distortion',
    description:
      'Color shows changes in area: blue = compressed, cream = unchanged, red = enlarged.',
  },
  {
    value: 'shape',
    label: 'Shape distortion',
    description: 'Color shows changes in local angles: cream = less distortion, deep red = more.',
  },
]

export default function MapOptions({
  distortion,
  onDistortionChange,
  grid,
  onGridChange,
  labels,
  onLabelsChange,
  quality,
  onQualityChange,
  running,
}: {
  distortion: DistortionView
  onDistortionChange: (view: DistortionView) => void
  grid: boolean
  onGridChange: (on: boolean) => void
  labels: boolean
  onLabelsChange: (on: boolean) => void
  quality: MapQuality
  onQualityChange: (quality: MapQuality) => void
  running: boolean
}) {
  const panel = useRef<HTMLDetailsElement>(null)
  function close() {
    if (!panel.current) return
    panel.current.open = false
    panel.current.querySelector('summary')?.focus({ preventScroll: true })
  }
  return (
    <details
      className="layers-popover"
      ref={panel}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && panel.current?.open) {
          event.stopPropagation()
          close()
        }
      }}
    >
      <summary>
        Map options <span aria-hidden="true">☷</span>
      </summary>
      <div className="layer-options">
        <div className="map-options-heading">
          <strong>Map options</strong>
          <button type="button" onClick={close} aria-label="Close map options">
            Close <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className="distortion-choice">
          <label htmlFor="distortion-view">Explore distortion</label>
          <select
            id="distortion-view"
            value={distortion}
            aria-describedby="distortion-help"
            onChange={(event) => onDistortionChange(event.target.value as DistortionView)}
          >
            {views.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <p id="distortion-help">{views.find(({ value }) => value === distortion)?.description}</p>
        </div>
        <div className="map-option-switches">
          <label className="map-option-switch">
            <span>Place names</span>
            <input
              type="checkbox"
              role="switch"
              checked={labels}
              onChange={(event) => onLabelsChange(event.target.checked)}
            />
          </label>
          <label className="map-option-switch">
            <span>Latitude &amp; longitude lines</span>
            <input
              type="checkbox"
              role="switch"
              checked={grid}
              onChange={(event) => onGridChange(event.target.checked)}
            />
          </label>
        </div>
        <details className="map-detail-options">
          <summary>
            Coastline detail <span aria-hidden="true">+</span>
          </summary>
          <label className="sr-only" htmlFor="map-quality">
            Coastline detail
          </label>
          <select
            id="map-quality"
            value={quality}
            disabled={running}
            onChange={(event) => onQualityChange(event.target.value as MapQuality)}
          >
            <option value="overview">Standard · faster</option>
            <option value="detail">Detailed · larger download</option>
          </select>
          <p>More coastline detail uses more data. The projection stays the same.</p>
        </details>
      </div>
    </details>
  )
}
