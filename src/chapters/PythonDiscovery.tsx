import { useCallback, useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import EquationBlock from '@/components/EquationBlock'
import PythonPanel from './PythonPanel'
import { StageShell, useChapterStage } from './stage-shared'
import { buildLabGrid, gridProjection } from '@/lab/gridfn'
import { bakeCustomProjection } from '@/projection/bake'
import type { RunProjectionResult } from '@/projection/worker-client'
import { useReducedMotion } from '@/hooks/useReducedMotion'

const GRID = buildLabGrid()
const SOURCE = `import numpy as np

# Try 0, 30, then 45. Run after each change.
standard_parallel = 45

def project(lon, lat):
    p = np.radians(standard_parallel)
    x = lon * np.cos(p)
    y = np.sin(lat) / np.cos(p)
    return x, y

print(f"Standard parallel: {standard_parallel}°")
print("Equal area: horizontal and vertical scales cancel.")`
const ANNOTATIONS = [
  { lines: [4, 4] as [number, number], title: 'Choose where shape is true', body: 'The standard parallel is an angle in degrees. Start at 45°, then try 0°.' },
  { lines: [8, 8] as [number, number], title: 'Longitude becomes x', body: 'Multiplying by cos(p) changes the horizontal scale.' },
  { lines: [9, 9] as [number, number], title: 'Latitude becomes y', body: 'Dividing by that same factor compensates vertically. The original formula preserves area.' },
]

export default function PythonDiscovery() {
  const { containerRef, stageRef, generation } = useChapterStage('paper')
  const { reducedMotion } = useReducedMotion()
  const [applied, setApplied] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [lessonError, setLessonError] = useState<string | null>(null)
  const [lastCode, setLastCode] = useState<string | null>(null)
  const bakedRef = useRef<Awaited<ReturnType<typeof bakeCustomProjection>> | null>(null)
  const tween = useRef<gsap.core.Tween | null>(null)
  const runId = useRef(0)
  const key = 'python-discovery'

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    let live = true
    const restore = async () => {
      if (bakedRef.current) stage.registerCustomProjection(key, bakedRef.current)
      await stage.setMorphTargets(bakedRef.current ? key : 'gallPeters', bakedRef.current ? key : 'gallPeters')
      if (!live) return
      stage.setMorph(1); stage.setAutoRotate(false); stage.setLabels(false)
      stage.setLayers({ graticule: true, tissot: false })
    }
    void restore().catch(() => { if (live) setLessonError('The map could not load. Retry by running the code.') })
    return () => { live = false; tween.current?.kill() }
  }, [generation, stageRef])
  useEffect(() => () => { runId.current++; tween.current?.kill() }, [])

  const showResult = useCallback(async (result: RunProjectionResult, code: string) => {
    const id = ++runId.current
    setRendering(true); setLessonError(null)
    try {
      const projection = gridProjection(GRID, result.x, result.y)
      if (projection.invalidCount === GRID.lon.length) throw new Error('No finite coordinates returned. Check the formula and run again.')
      const baked = await bakeCustomProjection(key, projection.fn, projection.frame, { tissotStepDeg: 30 })
      if (id !== runId.current) return
      const previous = bakedRef.current
      bakedRef.current = baked
      const stage = stageRef.current
      if (stage) {
        tween.current?.kill()
        if (previous) stage.registerCustomProjection(`${key}-previous`, previous)
        stage.registerCustomProjection(key, baked)
        await stage.setMorphTargets(previous ? `${key}-previous` : 'gallPeters', key)
        if (id !== runId.current) return
        stage.setLabels(false)
        stage.setMorph(reducedMotion ? 1 : 0)
        const position = { t: reducedMotion ? 1 : 0 }
        tween.current = gsap.to(position, { t: 1, duration: reducedMotion ? 0 : 1.2, ease: 'power2.inOut', onUpdate: () => stage.setMorph(position.t) })
      }
      setApplied(true); setDirty(false); setLastCode(code)
    } finally { if (id === runId.current) setRendering(false) }
  }, [stageRef, reducedMotion])

  const reset = useCallback(() => {
    runId.current++; tween.current?.kill(); bakedRef.current = null
    setApplied(false); setDirty(false); setLastCode(null); setLessonError(null)
    const stage = stageRef.current
    if (stage) void stage.setMorphTargets('gallPeters', 'gallPeters').then(() => stage.setMorph(1))
  }, [stageRef])

  const download = () => {
    if (!lastCode) return
    const url = URL.createObjectURL(new Blob([lastCode], { type: 'text/x-python' }))
    const link = document.createElement('a'); link.href = url; link.download = 'my_equal_area_map.py'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <section id="python-discovery" className="python-discovery" aria-labelledby="python-title">
    <header className="python-introduction">
      <div><p className="kicker">Your first map, written in Python</p><h2 id="python-title">A formula you can touch.</h2></div>
      <p>This is an executable atlas. Read the equation, change the code, and watch your result take shape. Python is part of the discovery from here on.</p>
    </header>
    <div className="python-journey" aria-label="Experiment workflow"><span>01 · Understand the equation</span><span>02 · Change the Python</span><span>03 · See your map</span></div>
    <div className="python-equation-strip">
      <div><p className="kicker">The promise · keep relative areas</p><EquationBlock tex={String.raw`x=\lambda\cos\varphi_0,\qquad y=\frac{\sin\varphi}{\cos\varphi_0}`} /></div>
      <p><strong>λ → lon &nbsp; φ → lat &nbsp; φ₀ → p</strong><br />Longitude and latitude arrive in radians. The standard parallel controls where local shape is true. The cosine factors cancel in the area calculation.</p>
    </div>
    <div className="python-workbench">
      <div className="python-source">
        <div className="python-prompt"><strong>Try this</strong><p>Change <code>standard_parallel = 45</code> to <code>0</code>. Predict which way the map stretches, then run it. Try <code>30</code> next.</p></div>
        <PythonPanel filename="your_first_map.py" code={SOURCE} samples={GRID} annotations={ANNOTATIONS} initiallyEditable runLabel="Run Python → map" onResult={showResult} onEdit={() => setDirty(true)} onReset={reset} />
      </div>
      <figure className="python-result">
        <figcaption><span>{applied ? 'Your Python result' : 'Reference · Gall–Peters'}</span><span>Live map</span></figcaption>
        <div className="python-map"><StageShell containerRef={containerRef} stateText="" ariaLabel={applied ? 'Map generated from your last successful Python run' : 'Gall–Peters reference map; run Python to replace it with your result'} className="absolute inset-0" /></div>
        <div className="python-result-caption" aria-live="polite"><strong>{rendering ? 'Preparing your map…' : dirty ? 'Code changed · run to update the map' : applied ? 'Drawn from your Python coordinates' : 'Ready for your first experiment'}</strong><p>{lessonError ?? (applied ? 'The map uses a 1° grid computed by Python, interpolated between sample points. Editing the formula can change its mathematical properties.' : 'This reference gives you a starting point. Run the code to draw a map from its output.')}</p></div>
        <div className="python-result-actions"><button disabled={!lastCode} onClick={download}>Download last run .py ↓</button><a href="/lab#python">Open the full Python lab ↗</a></div>
      </figure>
    </div>
    <aside className="python-reflection"><strong>What should you notice?</strong><p>With the original sine/cosine formula, changing the standard parallel changes the outline while keeping relative areas. If you replace <code>np.sin(lat)</code> with <code>lat</code>, that equal-area guarantee disappears. Change one line, run again, and compare.</p></aside>
    <p className="python-runtime-note">Python runs in your browser. The first run downloads the runtime and NumPy; later runs reuse them. Your edits stay here unless you download them.</p>
  </section>
}
