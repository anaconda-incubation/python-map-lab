import MapExpandButton, { useExpandedMap } from '@/components/MapExpandButton'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { scrollPageTo } from '@/utils/pageScroll'
import PythonPanel from '@/chapters/PythonPanel'
import EquationBlock from '@/components/EquationBlock'
import StageToggle from '@/components/StageToggle'
import { useMapStage } from '@/lab/useMapStage'
import { buildLabGrid, gridProjection } from '@/lab/gridfn'
import {
  pythonClient,
  type RunProjectionResult,
} from '@/projection/worker-client'
import { lessons } from './pythonLessons'
import { lessonNotebook } from './lessonNotebook'
import './python-first.css'
import { EqualEarthNote, LessonStory } from './LessonReading'
import WeirdVariants from './WeirdVariants'
import { getAuthagraphSamples } from './authagraphSamples'
import { bakeProjection } from '@/projection/bake'
const GRID = buildLabGrid()

export default function PythonFirst() {
  const { expanded, columnsRef, toggleExpanded } = useExpandedMap()
  const location = useLocation()
  const navigate = useNavigate()
  const experimenting = location.hash === '#experiments'
  function selectMode(experiments: boolean) {
    void navigate(experiments ? '/#experiments' : '/#learn', { replace: true })
  }
  useEffect(() => {
    if (!['#experiments', '#learn'].includes(location.hash)) return
    const frame = requestAnimationFrame(() => {
      const el = document.getElementById('workspace-modes')
      if (el) scrollPageTo(el.getBoundingClientRect().top + window.scrollY - 80)
    })
    return () => cancelAnimationFrame(frame)
  }, [location.hash])
  const [index, setIndex] = useState(-1)
  const [authSamples, setAuthSamples] = useState<Awaited<
    ReturnType<typeof getAuthagraphSamples>
  > | null>(null)
  const [busy, setBusy] = useState(false)
  const [workMessage, setWorkMessage] = useState('Preparing your projection…')
  const [dirty, setDirty] = useState(false)
  const [custom, setCustom] = useState(false)
  const [error, setError] = useState('')
  const [runtime, setRuntime] = useState('Python is warming up')
  const [lastCode, setLastCode] = useState<string | null>(null)
  const stage = useMapStage('globe')
  const serial = useRef(0)
  const mounted = useRef(true)
  const globe = index === -1
  const drag = useRef<{ id: number; x: number; y: number } | null>(null)
  const lesson = lessons[Math.max(0, index)]
  useEffect(() => {
    mounted.current = true
    void pythonClient
      .warmup()
      .then(() => {
        if (mounted.current) setRuntime('Python ready')
      })
      .catch(() => {
        if (mounted.current) setRuntime('Python loads when you run')
      })
    return () => {
      mounted.current = false
    }
  }, [])
  function warmAuthagraph() {
    // Both preparations are cached and shared with the eventual selection.
    void Promise.all([
      getAuthagraphSamples(),
      bakeProjection('authagraph', { tissotStepDeg: 30 }),
    ]).catch(() => {})
  }
  async function choose(i: number) {
    if (busy || !stage.ready) return
    const id = i === -1 ? 'globe' : lessons[i].id
    setBusy(true)
    setError('')
    setWorkMessage(
      id === 'authagraph'
        ? 'Working on AuthaGraph: preparing its regions and Python samples…'
        : 'Transforming your projection…',
    )
    try {
      const [samples] = await Promise.all([
        id === 'authagraph' ? getAuthagraphSamples() : Promise.resolve(null),
        stage.morphTo(id, 1200),
      ])
      if (samples) setAuthSamples(samples)
      setIndex(i)
      setDirty(false)
      setCustom(false)
      setLastCode(null)
    } catch {
      setError('The map could not load. Please try again.')
    } finally {
      setBusy(false)
    }
  }
  function lessonButtonProps(i: number) {
    const warm = () => {
      if (lessons[i].id === 'authagraph') warmAuthagraph()
    }
    return {
      disabled: busy || !stage.ready,
      onPointerEnter: warm,
      onFocus: warm,
      onClick: () => void choose(i),
    }
  }
  async function apply(result: RunProjectionResult, code: string) {
    setBusy(true)
    setError('')
    setWorkMessage('Python finished. Preparing the map geometry…')
    try {
      let halfWidth = 0,
        halfHeight = 0
      if (lesson.id === 'authagraph')
        for (let i = 0; i < result.x.length; i++) {
          halfWidth = Math.max(halfWidth, Math.abs(result.x[i]))
          halfHeight = Math.max(halfHeight, Math.abs(result.y[i]))
        }
      const projection =
        lesson.id === 'authagraph' && authSamples
          ? {
              invalidCount: result.x.some(
                (x, i) => !Number.isFinite(x) || !Number.isFinite(result.y[i]),
              )
                ? 1
                : 0,
              frame: { halfWidth, halfHeight },
              fn: (lon: number, lat: number) => {
                const i = authSamples.indices.get(`${lon},${lat}`)
                if (i === undefined) throw new Error('Missing renderer sample')
                return { x: result.x[i], y: result.y[i] }
              },
            }
          : gridProjection(GRID, result.x, result.y)
      if (projection.invalidCount)
        throw new Error(
          'Some coordinates are not finite. Check the formula before drawing the whole world.',
        )
      if (projection.frame.halfWidth <= 0 || projection.frame.halfHeight <= 0)
        throw new Error('The map needs nonzero width and height.')
      const key = `lesson-run-${++serial.current % 2}`
      await stage.bakeAndRegister(key, projection.fn, projection.frame)
      setWorkMessage('Bringing your projection into view…')
      await stage.morphTo(key, 1200)
      setCustom(true)
      setDirty(false)
      setLastCode(code)
    } finally {
      setBusy(false)
    }
  }
  async function downloadNotebook() {
    try {
      const code =
        lastCode ??
        (lesson.supportCode
          ? `${lesson.supportCode}\n${lesson.code}`
          : lesson.code)
      const response = await fetch('/geo/ne_110m_land.geojson')
      if (!response.ok)
        throw new Error('Could not load notebook geography. Please try again.')
      const notebook = lessonNotebook(lesson, code, await response.json())
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(notebook, null, 2)], {
          type: 'application/x-ipynb+json',
        }),
      )
      const a = document.createElement('a')
      a.href = url
      a.download = `${lesson.id}-lesson.ipynb`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Notebook download failed. Please try again.',
      )
    }
  }
  return (
    <div className="python-first">
      <section className="pf-intro">
        <p className="pf-eyebrow">An interactive Python field guide</p>
        <h1>
          A Few Lines Of <em>Python</em> Can Make the World of Difference
        </h1>
        <div className="pf-intro-bottom">
          <p>
            Choose a projection. Read its mathematics. Change the function and
            watch the world take a different shape.
          </p>
          <span className="pf-runtime">
            ● {runtime} ·{' '}
            <a
              href="https://numpy.org/"
              target="_blank"
              rel="noopener noreferrer"
            >
              NumPy ↗
            </a>
            <br />
            <small>
              Runs directly in your browser via{' '}
              <a
                href="https://pyodide.org/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Pyodide ↗
              </a>
              .
            </small>
          </span>
        </div>
        <aside className="pf-context-note" aria-label="Why this matters now">
          <span>Why this matters now</span>
          <p>
            Mercator was designed for navigation in 1569. In September 2026, the
            UN encouraged equal-area projections for general-reference world
            maps, so countries and continents appear in their true relative
            sizes.{' '}
            <a
              href="https://news.un.org/en/story/2026/09/1168284"
              target="_blank"
              rel="noopener noreferrer"
            >
              Read the UN News article ↗
            </a>
          </p>
        </aside>
      </section>
      <section
        id="workspace-modes"
        className="pf-mode-switch"
        aria-label="Choose how to explore"
      >
        <div
          role="tablist"
          aria-label="Workspace mode"
          className="pf-mode-tabs"
          onKeyDown={(e) => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
              e.preventDefault()
              const next =
                e.key === 'Home'
                  ? false
                  : e.key === 'End'
                    ? true
                    : !experimenting
              selectMode(next)
              document
                .getElementById(next ? 'experiment-tab' : 'learn-tab')
                ?.focus()
            }
          }}
        >
          <button
            id="learn-tab"
            role="tab"
            aria-selected={!experimenting}
            aria-controls="learn-panel"
            tabIndex={experimenting ? -1 : 0}
            onClick={() => selectMode(false)}
          >
            <strong>Learn the projections</strong>
            <span>Explore the globe, equations, and mapmakers’ choices.</span>
          </button>
          <button
            id="experiment-tab"
            role="tab"
            aria-selected={experimenting}
            aria-controls="experiment-panel"
            tabIndex={experimenting ? 0 : -1}
            onClick={() => selectMode(true)}
          >
            <strong>What if we change the rules?</strong>
            <span>Flip, stretch, and reshape the world with Python.</span>
          </button>
        </div>
      </section>
      <div
        id="learn-panel"
        role="tabpanel"
        aria-labelledby="learn-tab"
        hidden={experimenting}
      >
        <section
          className="pf-workspace"
          aria-label="Interactive Python lesson"
        >
          <div
            className="pf-choices"
            role="group"
            aria-label="Choose a projection"
          >
            <button
              aria-pressed={globe}
              disabled={busy || !stage.ready}
              onClick={() => void choose(-1)}
            >
              <span>Start here / The reference</span>
              <strong>Globe</strong>
            </button>
            {lessons.map((l, i) => (
              <button
                key={l.id}
                {...lessonButtonProps(i)}
                aria-pressed={index === i}
              >
                <span>
                  0{i + 1} / {l.promise}
                </span>
                <strong>{l.name}</strong>
              </button>
            ))}
          </div>
          <div
            id="lesson-map-layout"
            ref={columnsRef}
            className={`pf-columns ${expanded ? 'pf-expanded' : ''}`}
          >
            <div className="pf-map-column">
              <div className="pf-map-sticky">
                <MapExpandButton
                  expanded={expanded}
                  onClick={toggleExpanded}
                  controls="lesson-map-layout"
                />
                <div className="pf-map-header">
                  <span>01 / Observe the world</span>
                  <span>
                    {globe
                      ? 'Globe'
                      : custom
                        ? 'Your Python result'
                        : lesson.name}
                  </span>
                </div>
                <div
                  className={`pf-canvas ${globe ? 'pf-globe' : ''}`}
                  aria-busy={busy || !stage.ready}
                  role={globe ? 'region' : 'img'}
                  tabIndex={globe ? 0 : undefined}
                  onPointerDown={(e) => {
                    if (!globe || busy || !stage.ready || e.button !== 0) return
                    drag.current = {
                      id: e.pointerId,
                      x: e.clientX,
                      y: e.clientY,
                    }
                    e.currentTarget.setPointerCapture(e.pointerId)
                  }}
                  onPointerMove={(e) => {
                    const d = drag.current
                    if (!d || d.id !== e.pointerId || busy) return
                    stage.orbitBy(
                      (d.x - e.clientX) * 0.006,
                      (e.clientY - d.y) * 0.006,
                    )
                    d.x = e.clientX
                    d.y = e.clientY
                  }}
                  onPointerUp={() => {
                    drag.current = null
                  }}
                  onPointerCancel={() => {
                    drag.current = null
                  }}
                  onLostPointerCapture={() => {
                    drag.current = null
                  }}
                  onKeyDown={(e) => {
                    if (!globe || busy || !stage.ready) return
                    const direction: Record<string, [number, number]> = {
                      ArrowLeft: [-0.15, 0],
                      ArrowRight: [0.15, 0],
                      ArrowUp: [0, 0.15],
                      ArrowDown: [0, -0.15],
                    }
                    if (direction[e.key]) {
                      e.preventDefault()
                      stage.orbitBy(...direction[e.key])
                    }
                  }}
                  aria-label={
                    globe
                      ? 'Interactive globe. Drag or use arrow keys to rotate.'
                      : `${custom ? 'Python-generated' : lesson.name} projection with geography and coordinate grid`
                  }
                >
                  <div ref={stage.containerRef} className="absolute inset-0" />
                  {!stage.ready && (
                    <span className="pf-loading">Preparing the globe…</span>
                  )}
                  {busy && (
                    <div
                      className="pf-working"
                      role="status"
                      aria-live="polite"
                    >
                      <span className="pf-working-dot" aria-hidden="true" />
                      <span>
                        {workMessage}
                        <small>The detailed map can take a few seconds.</small>
                      </span>
                    </div>
                  )}
                </div>
                <div className="pf-map-controls">
                  <StageToggle
                    layers={stage.layers}
                    onChange={stage.toggleLayer}
                  />
                </div>
                <p className="pf-map-status" role="status">
                  {busy
                    ? workMessage
                    : globe
                      ? 'Drag to rotate · Arrow keys work too'
                      : dirty
                        ? 'Code edited. Run Python to update the map.'
                        : custom
                          ? 'Map drawn from your executed Python.'
                          : 'Reference map loaded. Run the function to draw it with Python.'}
                </p>

                {globe && (
                  <blockquote className="pf-globe-quote">
                    A map is an optimization problem. Ask what you are
                    optimizing for.
                  </blockquote>
                )}
                {error && <p role="alert">{error}</p>}
              </div>
            </div>
            {globe ? (
              <div className="pf-overview">
                <p className="pf-section-label">02 / Choose what matters</p>
                <h2>You cannot flatten a sphere without changing it.</h2>
                <p className="pf-overview-intro">
                  A globe keeps the Earth’s geometry on a curved surface. Think
                  of peeling an orange. To lay the peel flat, you have to
                  stretch it or cut it. Each map makes a different bargain.
                </p>
                <div className="pf-tradeoffs">
                  {lessons.map((l, i) => (
                    <button key={l.id} {...lessonButtonProps(i)}>
                      <span>
                        <strong>{l.name}</strong>
                        <span aria-hidden="true">↗</span>
                      </span>
                      <p>{l.tradeoff}</p>
                      <small>Explore the map and its Python →</small>
                    </button>
                  ))}
                </div>
                <p className="pf-overview-footnote">
                  The globe is our reference. Choose a flat map to see its
                  mathematics, run its Python, and explore the tradeoffs
                  yourself.
                </p>
              </div>
            ) : (
              <div className="pf-code-column">
                <div className="pf-question pf-reading-question">
                  <h2>{lesson.question}</h2>
                  <p>{lesson.explanation}</p>
                </div>
                <div className="pf-section-label">02 / Read, change, run</div>
                <p className="pf-change">{lesson.change}</p>
                <PythonPanel
                  key={lesson.id}
                  filename={`${lesson.id}.py`}
                  code={lesson.code}
                  samples={
                    lesson.id === 'authagraph' && authSamples
                      ? authSamples
                      : GRID
                  }
                  supportCode={lesson.supportCode}
                  annotations={lesson.annotations}
                  initiallyEditable
                  runLabel="Run Python → redraw map"
                  onRunStateChange={(running) => {
                    setBusy(running)
                    if (running)
                      setWorkMessage(
                        lesson.id === 'authagraph'
                          ? 'Running AuthaGraph’s Python across the globe…'
                          : 'Running your Python…',
                      )
                  }}
                  onEdit={() => setDirty(true)}
                  onResult={apply}
                  onReset={() => {
                    setDirty(false)
                    void choose(index)
                  }}
                />
                {lesson.id === 'equalEarth' && <EqualEarthNote />}
                {lesson.supportCode && (
                  <details className="pf-helper">
                    <summary>Open the complete AuthaGraph helper code</summary>
                    <p>
                      These functions run before the editable steps above. They
                      are included in the notebook download.
                    </p>
                    <pre
                      data-lenis-prevent
                      tabIndex={0}
                      role="region"
                      aria-label="Complete AuthaGraph helper code; scroll to read"
                    >
                      <code>{lesson.supportCode}</code>
                    </pre>
                  </details>
                )}
                <div className="pf-section-label pf-math-heading">
                  03 / Connect the mathematics
                </div>
                <EquationBlock
                  tex={lesson.tex}
                  caption={
                    custom || dirty
                      ? 'Reference equations for the selected lesson. Your edited code may define a different projection.'
                      : lesson.id === 'authagraph'
                        ? 'Facet-local angles λf and φf produce radius r and angle θ. The helpers then rotate and place each region in the rectangle.'
                        : 'λ is longitude; φ is latitude. The function maps these angles to planar coordinates x and y.'
                  }
                />
                {lesson.id === 'equalEarth' && (
                  <p className="pf-math-note">
                    F(θ) = A₁θ + A₂θ³ + A₃θ⁷ + A₄θ⁹. The Python names its
                    derivative explicitly.
                  </p>
                )}
                <div className="pf-next-actions">
                  <button onClick={downloadNotebook} disabled={dirty}>
                    Download {lastCode ? 'your' : 'starter'} notebook ↓
                  </button>
                  <a href="#lesson-story-title">
                    Understand the code and its purpose ↓
                  </a>
                </div>
                {dirty && (
                  <p className="pf-math-note">
                    Run your edits before downloading to include the executed
                    version.
                  </p>
                )}
                <LessonStory lesson={lesson} />
              </div>
            )}
          </div>
        </section>
      </div>
      <div
        id="experiment-panel"
        role="tabpanel"
        aria-labelledby="experiment-tab"
        hidden={!experimenting}
      >
        <WeirdVariants />
      </div>
    </div>
  )
}
