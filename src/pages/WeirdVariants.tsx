import MapExpandButton, { useExpandedMap } from '@/components/MapExpandButton'
import { useState } from 'react'
import PythonPanel from '@/chapters/PythonPanel'
import { useMapStage } from '@/lab/useMapStage'
import { buildLabGrid, gridProjection } from '@/lab/gridfn'
import type { RunProjectionResult } from '@/projection/worker-client'
import { variants } from './experimentRecipes'

const grid = buildLabGrid()
export default function WeirdVariants() {
  const { expanded, columnsRef, toggleExpanded } = useExpandedMap()
  const { containerRef, bakeAndRegister, morphTo, setMapRing } =
    useMapStage('mercator')
  const [index, setIndex] = useState(1),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0),
    [status, setStatus] = useState(
      'Choose a recipe, predict the result, then run it.',
    )
  const variant = variants[index]
  const code =
    variant.code ??
    `import numpy as np\n\ndef project(lon, lat):\n    phi = np.clip(lat, -1.48, 1.48)\n    ${variant.line}\n    y = ${variant.flipY ? '-' : ''}np.log(np.tan(np.pi / 4 + phi / 2))\n    return x, y`
  async function apply(result: RunProjectionResult, source: string) {
    const p = gridProjection(grid, result.x, result.y)
    if (
      p.invalidCount &&
      (!variant.allowGaps || p.invalidCount > grid.lon.length * 0.05)
    ) {
      setStatus(
        'This run could not be drawn. The map still shows the last successful result.',
      )
      const logarithmHint = /np\.log\(\s*lat\s*\)/.test(source)
        ? ' np.log(lat) is undefined for negative latitudes and goes to negative infinity at the equator. Try the “Try a logarithm” recipe: np.log1p(np.abs(lat)) stays finite in both hemispheres, but defines a different map.'
        : ' Check logarithms of zero or negative numbers, division by zero, and square roots of negative numbers. Very large outputs may also be outside the renderer’s limits.'
      throw new Error(
        `Cannot draw this run: ${p.invalidCount.toLocaleString()} of ${grid.lon.length.toLocaleString()} sampled locations have no drawable coordinates.${logarithmHint} Your code has been kept.`,
      )
    }
    const key = `weird-${version % 2}`
    await bakeAndRegister(key, p.fn, p.frame)
    setMapRing([])
    await morphTo(key, 1200)
    setMapRing(
      result.mapRing ?? [],
      Math.max(p.frame.halfWidth, p.frame.halfHeight),
    )
    setVersion((v) => v + 1)
    setStatus(
      p.invalidCount
        ? 'Map redrawn. Unmapped samples are omitted around the opposite point.'
        : 'Map redrawn from this Python run. What changed?',
    )
  }
  return (
    <section className="pf-weird" aria-labelledby="weird-title">
      <p className="pf-eyebrow">A little mathematical mischief</p>
      <h2 id="weird-title">What happens if we change the rules?</h2>
      <p className="pf-weird-intro">
        Start with Mercator and change one operation. Slide, pinch, or ripple
        the world by changing x, or negate y to put south at the top. Or choose
        a new center and preserve distances from that place. These experiments
        explore what a formula does.
      </p>
      <aside className="pf-log-note">
        <strong>
          Why not <code>np.log(lat)</code>?
        </strong>
        <p>
          Latitude is zero at the equator and negative in the southern
          hemisphere. A real logarithm needs a positive input. Even{' '}
          <code>np.log(np.abs(lat))</code> still fails at zero. Try{' '}
          <code>np.log1p(np.abs(lat))</code>, which means log(1 + |latitude|),
          to explore a finite alternative.
        </p>
      </aside>
      <div
        className="pf-variant-choices"
        role="group"
        aria-label="Choose a weird variant"
      >
        {variants.map((v, i) => (
          <button
            key={v.name}
            disabled={busy}
            aria-pressed={i === index}
            onClick={() => {
              setIndex(i)
              setStatus('Recipe loaded. Run it to update the map.')
            }}
          >
            <code>{v.label ?? v.line}</code>
            <span>{v.name}</span>
          </button>
        ))}
      </div>
      <div
        id="experiment-map-layout"
        ref={columnsRef}
        className={`pf-columns ${expanded ? 'pf-expanded' : ''}`}
      >
        <div className="pf-experiment-map-column">
          <div className="pf-experiment-map-sticky">
            <MapExpandButton
              expanded={expanded}
              onClick={toggleExpanded}
              controls="experiment-map-layout"
            />
            <div
              className="pf-weird-map"
              role="img"
              aria-label="Experimental projection from Python"
            >
              <div ref={containerRef} className="absolute inset-0" />
            </div>
            <p role="status" className="pf-math-note">
              {status}
            </p>
            {variant.allowGaps && (
              <p className="pf-math-note">
                <strong>HINT:</strong> Select the optional ring block, then
                press <kbd>Ctrl + /</kbd> on Windows or <kbd>⌘ + /</kbd> on Mac
                to uncomment it. Run the experiment to show the ring.
              </p>
            )}
          </div>
        </div>
        <div className="pf-experiment-reading">
          <p className="pf-change">{variant.why}</p>
          {variant.allowGaps && (
            <p className="pf-math-note">
              <a
                href="https://proj.org/en/stable/operations/projections/aeqd.html"
                target="_blank"
                rel="noreferrer"
              >
                About the azimuthal equidistant projection ↗
              </a>
            </p>
          )}
          <PythonPanel
            hideCulledVertexWarnings={variant.allowGaps}
            key={index}
            filename="what_if.py"
            code={code}
            samples={grid}
            initiallyEditable
            onRunStateChange={setBusy}
            onResult={apply}
            onEdit={() => setStatus('Code edited. Run it to update the map.')}
            onReset={() => setStatus('Recipe reset. Run it to update the map.')}
            runLabel="Run this experiment"
          />
        </div>
      </div>
    </section>
  )
}
