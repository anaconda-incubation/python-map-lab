import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router'
import { track } from '@/analytics/events'
import { useAppearance } from '@/hooks/useAppearance'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import type { MapViewHandle } from '@/components/MapView'
import StageToggle, { type StageLayerState } from '@/components/StageToggle'
import { previewAspectRatio, previewUrl, type MapQuality } from '@/projection/assets'
import type { RunProjectionResult } from '@/projection/worker-client'
import { measure, diagnostics } from '@/utils/diagnostics'
import { lessons } from './pythonLessons'
import { variants } from './experimentRecipes'
import { EqualEarthNote, LessonStory } from './LessonReading'
import {
  cities,
  experimentNames,
  presetCode,
  presetId,
  readDrafts,
  readSelection,
  selectionUrl,
  writeDrafts,
  type Selection,
} from './workspaceState'
import './python-first.css'
import DraftConfirmation from '@/components/DraftConfirmation'

const MapView = lazy(() => import('@/components/MapView'))
const PythonPanel = lazy(() => import('@/chapters/PythonPanel'))
const EquationBlock = lazy(() => import('@/components/EquationBlock'))
const frames = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  )

function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const [opened, setOpened] = useState(false)
  return (
    <details
      className="lesson-disclosure"
      onToggle={(e) => {
        if (e.currentTarget.open) setOpened(true)
      }}
    >
      <summary>
        {title}
        <span aria-hidden="true">+</span>
      </summary>
      {opened && (
        <div className="disclosure-content">
          <Suspense fallback={<p>Opening…</p>}>{children}</Suspense>
        </div>
      )}
    </details>
  )
}

export default function PythonFirst() {
  const location = useLocation(),
    navigate = useNavigate()
  const selection = readSelection(location.search, location.hash)
  const { theme } = useAppearance(),
    { reducedMotion } = useReducedMotion()
  const [drafts, setDrafts] = useState(readDrafts)
  const [editorId, setEditorId] = useState(''),
    [mobilePane, setMobilePane] = useState<'map' | 'code'>('map')
  const [expanded, setExpanded] = useState(false),
    [exploring, setExploring] = useState(false)
  const [quality, setQuality] = useState<MapQuality>('overview')
  const [labels, setLabels] = useState(true)
  const [layers, setLayers] = useState<StageLayerState>({
    geography: true,
    graticule: false,
    tissot: false,
    area: false,
    angle: false,
  })
  const [mapReady, setMapReady] = useState(false),
    [mapChanging, setMapChanging] = useState(false),
    [mapError, setMapError] = useState(''),
    [retry, setRetry] = useState(0)
  const [running, setRunning] = useState(false),
    [runMessage, setRunMessage] = useState('')
  const [executed, setExecuted] = useState<{
    key: string
    code: string
    quality: string
    aspectRatio: number
  } | null>(null)
  const [pendingSelection, setPendingSelection] = useState<Selection | null>(null)
  const [shareMessage, setShareMessage] = useState(''),
    [diagnosticReport, setDiagnosticReport] = useState('')
  const [small, setSmall] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 900px)').matches,
  )
  const map = useRef<MapViewHandle>(null),
    mapSection = useRef<HTMLElement>(null),
    codeSection = useRef<HTMLElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null),
    restoreScroll = useRef(0),
    customSerial = useRef(0)
  const currentSelection = useRef(location.key)
  currentSelection.current = location.key
  const preset = presetId(selection),
    baseCode = presetCode(selection)
  const code = drafts[selection.id]?.code ?? baseCode
  const lesson = lessons.find((l) => l.id === selection.id)
  const experiment =
    selection.mode === 'experiments' ? variants[Number(selection.id.split('-')[1])] : undefined
  const globe = selection.id === 'globe',
    editorOpen = editorId === selection.id && !globe
  const custom =
    executed?.key === location.key && executed.code === code && executed.quality === quality
  const resultAspect =
    executed?.key === location.key && executed.quality === quality
      ? executed.aspectRatio
      : previewAspectRatio(preset)
  const paneAspect =
    selection.id === 'mercator'
      ? Math.max(1.5, resultAspect)
      : Math.max(1, Math.min(3, resultAspect))
  const dirty = code !== baseCode && !custom
  const options =
    selection.mode === 'learn'
      ? [{ id: 'globe', name: 'Globe' }, ...lessons.map((l) => ({ id: l.id, name: l.name }))]
      : experimentNames.map((name, i) => ({ id: 'experiment-' + i, name }))
  const position = options.findIndex((o) => o.id === selection.id)
  const title = options[position]?.name ?? 'Globe'
  const description = globe
    ? 'A globe keeps Earth’s geometry on a curved surface. To lay that surface flat, we have to stretch it or cut it. Each projection makes a different bargain.'
    : (lesson?.explanation ?? experiment?.why)
  const question = globe
    ? 'What changes when we flatten the world?'
    : (lesson?.question ?? 'What will this change do to the world?')

  useEffect(() => {
    const query = matchMedia('(max-width: 900px)')
    const update = () => setSmall(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    const timer = setTimeout(() => writeDrafts(drafts), 250)
    return () => clearTimeout(timer)
  }, [drafts])
  useEffect(() => {
    if (!expanded || !small) return
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    mapSection.current?.querySelector<HTMLButtonElement>('.expand-button')?.focus()
    return () => {
      document.body.style.overflow = before
    }
  }, [expanded, small])
  useEffect(() => {
    const viewport = window.visualViewport
    const update = () =>
      document.documentElement.style.setProperty(
        '--visible-height',
        (viewport?.height ?? window.innerHeight) + 'px',
      )
    update()
    viewport?.addEventListener('resize', update)
    return () => viewport?.removeEventListener('resize', update)
  }, [])

  function choose(next: Selection, replaceDraft = false) {
    if (running) return
    if (
      next.id === selection.id &&
      next.city !== selection.city &&
      code !== baseCode &&
      !replaceDraft
    ) {
      setPendingSelection(next)
      return
    }
    if (replaceDraft || (next.id === selection.id && next.city !== selection.city)) {
      setDrafts((previous) => ({
        ...previous,
        [next.id]: { code: presetCode(next), preset: presetId(next) },
      }))
    }
    setPendingSelection(null)
    setMobilePane('map')
    setExploring(false)
    setExecuted(null)
    setMapError('')
    setShareMessage('')
    if (next.mode !== selection.mode) track('Mode Selected', { mode: next.mode })
    if (next.mode === 'learn') track('Projection Selected', { projection: next.id })
    else track('Experiment Selected', { experiment: variants[Number(next.id.split('-')[1])].name })
    void navigate(
      selectionUrl(next) +
        (new URLSearchParams(location.search).has('diagnostics') ? '&diagnostics' : ''),
    )
    if (mapSection.current && mapSection.current.getBoundingClientRect().top < 0)
      mapSection.current.scrollIntoView({ block: 'start', behavior: 'instant' })
  }
  function edit(nextCode: string) {
    setDrafts((previous) => ({ ...previous, [selection.id]: { code: nextCode, preset } }))
  }
  function toggleLayer(layer: keyof StageLayerState) {
    setLayers((previous) => ({ ...previous, [layer]: !previous[layer] }))
  }
  function openEditor() {
    setEditorId(selection.id)
    setMobilePane('code')
    void frames().then(() => {
      codeSection.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
      codeSection.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
    })
  }
  function showMap() {
    setMobilePane('map')
    void frames().then(() =>
      mapSection.current?.scrollIntoView({ block: 'start', behavior: 'instant' }),
    )
  }
  function toggleExpanded() {
    if (!expanded) {
      restoreFocus.current = document.activeElement as HTMLElement
      restoreScroll.current = window.scrollY
    } else
      void frames().then(() => {
        window.scrollTo({ top: restoreScroll.current, behavior: 'instant' })
        restoreFocus.current?.focus({ preventScroll: true })
      })
    setExpanded((value) => !value)
    track('Map Expanded', { view: selection.mode, expanded: !expanded })
  }
  async function apply(
    result: RunProjectionResult,
    source: string,
    signal: AbortSignal,
    fromKeyboard: boolean,
  ) {
    const key = location.key
    const { getProjectionSamples, projectionFromSamples } = await import('./projectionSamples')
    const { bakeCustomProjection } = await import('@/projection/bake')
    const samples = await getProjectionSamples(quality)
    signal.throwIfAborted()
    const projected = projectionFromSamples(samples, result)
    if (!projected.hasArea)
      throw new Error(
        'This function collapses the map to a line or point. Both x and y must span an area.',
      )
    if (projected.invalidCount && !experiment?.allowGaps)
      throw new Error(
        'Some coordinates are not finite. Check logarithms, division by zero, and square roots. Your code and last valid map have been kept.',
      )
    setRunMessage('Preparing the map…')
    const baked = await measure('result-geometry', () =>
      bakeCustomProjection(
        'python-result-' + (++customSerial.current % 2),
        projected.fn,
        projected.frame,
        { quality, tissotStepDeg: 30, signal },
      ),
    )
    signal.throwIfAborted()
    if (key !== currentSelection.current) throw new DOMException('Selection changed', 'AbortError')
    if (!fromKeyboard) {
      setMobilePane('map')
      await frames()
    }
    setRunMessage('Drawing your result…')
    if (!map.current) throw new Error('The map is still opening. Please run again shortly.')
    await map.current.showResult(
      baked,
      result.mapRing ?? [],
      Math.max(projected.frame.halfWidth, projected.frame.halfHeight),
      signal,
    )
    signal.throwIfAborted()
    const { minX, maxX, minY, maxY } = baked.bounds
    setExecuted({ key, code: source, quality, aspectRatio: (maxX - minX) / (maxY - minY) })
    setRunMessage(
      projected.invalidCount
        ? 'Your Python result. The small cap opposite the center is omitted.'
        : 'Your Python result is ready.',
    )
    if (!fromKeyboard) showMap()
  }
  async function downloadNotebook() {
    if (!lesson) return
    try {
      const { lessonNotebook } = await import('./lessonNotebook')
      const response = await fetch('/geo/ne_110m_land.geojson')
      if (!response.ok) throw new Error('Could not load notebook geography. Please retry.')
      const source = (lesson.supportCode ? lesson.supportCode + '\n' : '') + code
      const notebook = lessonNotebook(lesson, source, await response.json())
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(notebook, null, 2)], { type: 'application/x-ipynb+json' }),
      )
      const link = document.createElement('a')
      link.href = url
      link.download = lesson.id + '-lesson.ipynb'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      track('Notebook Download', { notebook: lesson.id })
    } catch (error) {
      setRunMessage(error instanceof Error ? error.message : 'Download failed. Please retry.')
    }
  }
  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.origin + selectionUrl(selection))
      setShareMessage('Preset link copied. Your private code stays here.')
    } catch {
      setShareMessage('Copy the address in your browser to share this preset.')
    }
  }
  const cityOptions =
    selection.id === 'experiment-5'
      ? [
          ...cities.filter((c) => ['new-york', 'tokyo'].includes(c.id)),
          { id: 'north-pole', name: 'North Pole', lat: 90, lon: 0 },
        ]
      : cities
  const status = running
    ? runMessage || 'Running your Python…'
    : custom
      ? 'Your Python result'
      : executed?.key === location.key
        ? 'Previous Python result · your edits have not run'
        : dirty
          ? 'Example preview · your edits have not run'
          : 'Example preview · generated with this Python'

  return (
    <div className="atlas-document">
      <section className="atlas-intro" aria-label="About this field guide">
        <div>
          <p className="eyebrow">An interactive Python field guide</p>
          <h1>One world. Many maps.</h1>
        </div>
        <p className="intro-caption">
          A few lines of Python can change
          <br className="desktop-break" /> how you see the world.
        </p>
      </section>
      <div className="workspace-nav">
        <div className="mode-switch" role="group" aria-label="Choose how to explore">
          <button
            aria-pressed={selection.mode === 'learn'}
            onClick={() => choose({ mode: 'learn', id: 'globe', city: '' })}
            disabled={running}
          >
            Learn
          </button>
          <button
            aria-pressed={selection.mode === 'experiments'}
            onClick={() => choose({ mode: 'experiments', id: 'experiment-0', city: '' })}
            disabled={running}
          >
            Experiment
          </button>
        </div>
        <div className="projection-picker">
          <label className="sr-only" htmlFor="projection">
            Choose {selection.mode === 'learn' ? 'a projection' : 'an experiment'}
          </label>
          <select
            id="projection"
            value={selection.id}
            disabled={running}
            onChange={(e) => choose({ ...selection, id: e.target.value, city: '' })}
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <span className="step-count">
            {position + 1} / {options.length}
          </span>
        </div>
        <div className="step-arrows">
          <button
            aria-label="Previous map"
            disabled={position === 0 || running}
            onClick={() => choose({ ...selection, id: options[position - 1].id, city: '' })}
          >
            ←
          </button>
          <button
            aria-label="Next map"
            disabled={position === options.length - 1 || running}
            onClick={() => choose({ ...selection, id: options[position + 1].id, city: '' })}
          >
            →
          </button>
        </div>
      </div>
      {editorOpen && (
        <div className="mobile-workspace-tabs" role="group" aria-label="Python workspace view">
          <button aria-pressed={mobilePane === 'map'} onClick={showMap}>
            Map
          </button>
          <button
            aria-pressed={mobilePane === 'code'}
            onClick={() => {
              setMobilePane('code')
              void frames().then(() => codeSection.current?.scrollIntoView({ block: 'start' }))
            }}
          >
            Python
          </button>
        </div>
      )}
      <div
        className={
          'workspace-grid' +
          (expanded ? ' expanded' : '') +
          (editorOpen ? ' editor-open pane-' + mobilePane : '')
        }
      >
        <section
          ref={mapSection}
          id="map-workspace"
          tabIndex={-1}
          className="map-section"
          role={expanded && small ? 'dialog' : 'region'}
          aria-modal={(expanded && small) || undefined}
          aria-label={expanded && small ? 'Expanded map' : title + ' map'}
          onKeyDown={(e) => {
            if (!expanded) return
            if (e.key === 'Escape') {
              e.preventDefault()
              toggleExpanded()
            }
            if (small && e.key === 'Tab') {
              const controls = [
                ...e.currentTarget.querySelectorAll<HTMLElement>(
                  'button,select,summary,[tabindex="0"]',
                ),
              ].filter((el) => el.getBoundingClientRect().width > 0 && !el.hasAttribute('disabled'))
              const first = controls[0],
                last = controls[controls.length - 1]
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault()
                last?.focus()
              }
              if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault()
                first?.focus()
              }
            }
          }}
        >
          <div className="map-heading">
            <span>
              <span className="status-dot" aria-hidden="true" />
              {title}
            </span>
            <button
              className="expand-button icon-button"
              aria-label={expanded ? 'Exit expanded map' : 'Expand map'}
              aria-expanded={expanded}
              onClick={toggleExpanded}
            >
              {expanded ? '↙' : '↗'}
            </button>
          </div>
          <div
            className={'map-canvas ' + (globe ? 'globe-map' : 'flat-map')}
            style={{ '--map-aspect': paneAspect } as CSSProperties}
          >
            <img
              className={'map-preview' + (mapReady && !mapError ? ' preview-hidden' : '')}
              src={previewUrl(preset)}
              alt={
                'Preview of ' +
                title +
                '. ' +
                (globe
                  ? 'The curved Earth preserves its geometry.'
                  : (lesson?.promise ?? experiment?.name))
              }
              fetchPriority="high"
            />
            {typeof window !== 'undefined' && (
              <Suspense fallback={null}>
                <MapView
                  ref={map}
                  preset={preset}
                  quality={quality}
                  theme={theme}
                  layers={layers}
                  labels={labels}
                  exploring={exploring}
                  fitWidth={selection.id === 'mercator' && !expanded}
                  reducedMotion={reducedMotion}
                  retry={retry}
                  onReady={setMapReady}
                  onChanging={setMapChanging}
                  onError={(message) => {
                    setMapError(message)
                    setExecuted(null)
                  }}
                />
              </Suspense>
            )}
            {mapError && (
              <div className="map-recovery" role="alert">
                <p>{mapError}</p>
                <button
                  onClick={() => {
                    setMapError('')
                    setRetry((v) => v + 1)
                  }}
                >
                  Retry interactive map
                </button>
              </div>
            )}
            {!mapReady && !mapError && (
              <span className="map-loading">Preview ready · preparing interaction…</span>
            )}
          </div>
          <div className="map-toolbar">
            {globe ? (
              <button
                className={exploring ? 'selected' : ''}
                aria-pressed={exploring}
                disabled={!mapReady}
                onClick={() => setExploring((v) => !v)}
              >
                {exploring ? 'Done exploring' : 'Explore globe'}
                <span aria-hidden="true"> ⤢</span>
              </button>
            ) : (
              <span className="map-kind">{lesson?.promise ?? 'A change in the rules'}</span>
            )}
            <details className="layers-popover">
              <summary>
                Layers <span aria-hidden="true">☷</span>
              </summary>
              <div className="layer-options">
                <StageToggle layers={layers} onChange={toggleLayer} />
                <button aria-pressed={labels} onClick={() => setLabels((v) => !v)}>
                  Place labels {labels ? 'on' : 'off'}
                </button>
                <label htmlFor="map-quality">Geography detail</label>
                <select
                  id="map-quality"
                  value={quality}
                  disabled={running}
                  onChange={(e) => {
                    setQuality(e.target.value as MapQuality)
                    setExecuted(null)
                    setMapError('')
                  }}
                >
                  <option value="overview">Overview · faster</option>
                  <option value="detail">Detailed · larger download</option>
                </select>
                <p>
                  Labels adapt to the available space. Detail changes the coastline, not the
                  projection formula.
                </p>
                {(layers.area || layers.angle) && (
                  <p className="layer-legend">
                    {layers.area
                      ? 'Area: blue = compressed · cream = unchanged · red = enlarged.'
                      : 'Shape: cream = less angular distortion · deep red = more.'}
                  </p>
                )}
                <button
                  className="close-layers"
                  onClick={(e) => {
                    const panel = e.currentTarget.closest('details')
                    if (panel) {
                      panel.open = false
                      panel.querySelector('summary')?.focus()
                    }
                  }}
                >
                  Done
                </button>
              </div>
            </details>
            <button
              className="icon-button"
              aria-label="Reset map view"
              disabled={!mapReady}
              onClick={() => map.current?.resetView()}
            >
              ↺
            </button>
          </div>
          <p className="map-caption" role="status">
            {mapChanging && !running
              ? 'Changing to ' + title + '…'
              : globe
                ? exploring
                  ? 'Drag or use arrow keys to turn. + / − zoom. Done returns to reading.'
                  : 'Our reference: a curved world, before we flatten it.'
                : status}
            {selection.id === 'mercator' && !expanded && (
              <span className="map-crop-note">
                Polar edges may be cropped · Expand for the full map
              </span>
            )}
          </p>
          {exploring && (
            <div className="globe-help">
              <button aria-label="Zoom out" onClick={() => map.current?.zoom(0.9)}>
                −
              </button>
              <span>Drag to turn · reset to see the whole globe</span>
              <button aria-label="Zoom in" onClick={() => map.current?.zoom(1.1)}>
                +
              </button>
            </div>
          )}
          {globe && (
            <button
              className="primary-button mobile-first-action"
              onClick={() => choose({ mode: 'learn', id: 'mercator', city: '' })}
            >
              Flatten the globe <span aria-hidden="true">→</span>
            </button>
          )}
        </section>
        <article className="lesson-reading">
          <p className="eyebrow">
            {globe
              ? 'Start with a question'
              : selection.mode === 'learn'
                ? 'Observe · predict · understand'
                : 'A little mathematical mischief'}
          </p>
          <h2>{question}</h2>
          <p className="lesson-lede">{description}</p>
          {globe ? (
            <>
              <button
                className="primary-button"
                onClick={() => choose({ mode: 'learn', id: 'mercator', city: '' })}
              >
                Flatten the globe <span aria-hidden="true">→</span>
              </button>
              <blockquote>
                A map is an optimization problem.
                <br />
                Ask what you are optimizing for.
              </blockquote>
              <p className="lesson-small">
                Start with Mercator, then compare what other mapmakers chose to preserve. No Python
                setup needed.
              </p>
            </>
          ) : (
            <>
              <div className="prediction">
                <span className="eyebrow">Try this</span>
                <p>
                  {lesson?.id === 'authagraph'
                    ? 'Choose another city. What happens to the cuts?'
                    : lesson
                      ? 'Turn on distortion circles. Where do they stretch the most?'
                      : 'Compare this preview with Mercator. What changed?'}
                </p>
                {lesson && (
                  <button
                    className="text-button"
                    onClick={() => {
                      toggleLayer('tissot')
                      if (small) showMap()
                    }}
                  >
                    {layers.tissot ? 'Hide' : 'Show'} distortion circles →
                  </button>
                )}
              </div>
              {(!experiment || experiment.allowGaps) && (
                <div className="place-presets">
                  <label htmlFor="place-preset">
                    {lesson?.id === 'authagraph' || experiment
                      ? 'Center a place'
                      : 'Choose a central meridian'}
                  </label>
                  <select
                    id="place-preset"
                    disabled={running}
                    value={selection.city}
                    onChange={(e) => choose({ ...selection, city: e.target.value })}
                  >
                    <option value="">
                      {lesson?.id === 'authagraph'
                        ? 'Tokyo · original example'
                        : experiment
                          ? 'Chicago · original example'
                          : 'Greenwich · original example'}
                    </option>
                    {cityOptions.map((city) => (
                      <option key={city.id} value={city.id}>
                        {city.name} ·{' '}
                        {lesson?.id === 'authagraph' || experiment ? city.lat + '°, ' : ''}
                        {city.lon}°
                      </option>
                    ))}
                  </select>
                  <p>
                    {lesson?.id === 'authagraph'
                      ? 'Both coordinates place this point at the rectangle’s center. Distances are not preserved.'
                      : experiment
                        ? 'Distance from this point is preserved on a sphere. Other distances and shapes change.'
                        : 'A meridian centers a longitude line. It does not move a city to the vertical center.'}
                  </p>
                </div>
              )}
              <div className="python-entry">
                <div>
                  <span className="eyebrow">See how it works</span>
                  <strong>It’s real Python.</strong>
                  <p>Change the function. Run it here.</p>
                </div>
                <button className="primary-button" onClick={openEditor}>
                  {editorOpen ? 'Return to Python' : 'Edit Python'}{' '}
                  <span aria-hidden="true">↗</span>
                </button>
              </div>
              <p className="runtime-credit">
                <a href="https://numpy.org/" target="_blank" rel="noreferrer">
                  NumPy
                </a>{' '}
                runs in your browser via{' '}
                <a href="https://pyodide.org/" target="_blank" rel="noreferrer">
                  Pyodide
                </a>
                . Loads when you open Python.
              </p>
              {experiment && (
                <pre className="selected-equation" tabIndex={0} aria-label="Selected equation">
                  <code>{experiment.label ?? experiment.line}</code>
                </pre>
              )}
              {experiment?.allowGaps && (
                <p className="hint">
                  <strong>HINT:</strong> Select the optional ring block and press{' '}
                  <kbd>Ctrl + /</kbd> on Windows or <kbd>⌘ + /</kbd> on Mac to uncomment it. Ring
                  distances must be greater than 0 and at most 19,000 km.
                </p>
              )}
              {selection.id === 'experiment-3' && (
                <Disclosure title="Why not np.log(lat)?">
                  <p>
                    Latitude is zero at the equator and negative in the southern hemisphere. A real
                    logarithm needs positive input. Even np.log(np.abs(lat)) fails at zero.
                    np.log1p(np.abs(lat)) stays finite and defines a different map.
                  </p>
                </Disclosure>
              )}
              {lesson && (
                <>
                  <Disclosure title="Why this projection works">
                    <LessonStory lesson={lesson} />
                  </Disclosure>
                  <Disclosure title="Connect the mathematics">
                    <EquationBlock
                      tex={lesson.tex}
                      caption={
                        lesson.id === 'authagraph'
                          ? 'The helpers transform facet-local coordinates, then place the regions in the rectangle.'
                          : 'λ is longitude relative to the central meridian; φ is latitude. These are the reference equations; edited code may define another map.'
                      }
                    />
                    {lesson.id === 'equalEarth' && <EqualEarthNote />}
                  </Disclosure>
                </>
              )}
              <div className="lesson-actions">
                {lesson && (
                  <button onClick={downloadNotebook}>
                    Download {dirty ? 'your draft' : 'notebook'} ↓
                  </button>
                )}
                <button onClick={share}>Share this preset ↗</button>
              </div>
              {shareMessage && (
                <p role="status" className="lesson-small">
                  {shareMessage}
                </p>
              )}
            </>
          )}
        </article>
        {editorOpen && (
          <section ref={codeSection} className="python-section" aria-label="Python workspace">
            <div className="python-section-heading">
              <div>
                <p className="eyebrow">Read · change · run</p>
                <h2 tabIndex={-1}>Make it your own.</h2>
              </div>
              <button
                className="text-button"
                onClick={() => {
                  setEditorId('')
                  showMap()
                }}
              >
                Back to lesson ↑
              </button>
            </div>
            <details className="python-guidance" open={!small}>
              <summary>What to change</summary>
              <p>
                {lesson?.change ?? 'Change one operation, predict the result, then run your code.'}
              </p>
            </details>
            <Suspense fallback={<p className="editor-loading">Opening the Python editor…</p>}>
              <PythonPanel
                key={selection.id + ':' + selection.city}
                filename={lesson ? lesson.id + '.py' : 'what_if.py'}
                analyticsNotebook={lesson?.id ?? experiment?.name}
                code={baseCode}
                initialCode={code}
                supportCode={lesson?.supportCode}
                annotations={lesson?.annotations}
                initiallyEditable
                runLabel="Run Python"
                canRun={mapReady && !mapError}
                hideCulledVertexWarnings={experiment?.allowGaps}
                samples={async () =>
                  (await import('./projectionSamples')).getProjectionSamples(quality)
                }
                onCodeChange={edit}
                onResult={apply}
                onRunStateChange={setRunning}
                onStage={setRunMessage}
                onReset={() => {
                  setExecuted(null)
                  setRetry((v) => v + 1)
                }}
              />
            </Suspense>
            {runMessage && (
              <p className="run-message" role="status">
                {runMessage}
              </p>
            )}
            {lesson && (
              <div className="lesson-actions">
                <button onClick={downloadNotebook}>Download your notebook ↓</button>
              </div>
            )}
            {lesson?.supportCode && (
              <Disclosure title="Complete AuthaGraph helper code">
                <p>
                  These functions run before the editable steps. They are included in your notebook.
                </p>
                <pre className="helper-code" tabIndex={0}>
                  <code>{lesson.supportCode}</code>
                </pre>
              </Disclosure>
            )}
            <p className="hint">
              <strong>HINT:</strong> <kbd>Ctrl / ⌘ + Enter</kbd> runs the code.{' '}
              <kbd>Ctrl / ⌘ + /</kbd> comments or uncomments selected lines. Your edits stay in this
              browser.
            </p>
          </section>
        )}
      </div>
      <nav className="lesson-next" aria-label="Continue exploring">
        <span>
          {position + 1} of {options.length} · {title}
        </span>
        {position < options.length - 1 ? (
          <button
            disabled={running}
            onClick={() => choose({ ...selection, id: options[position + 1].id, city: '' })}
          >
            Next: {options[position + 1].name} →
          </button>
        ) : (
          <button
            disabled={running}
            onClick={() =>
              choose({
                mode: selection.mode === 'learn' ? 'experiments' : 'learn',
                id: selection.mode === 'learn' ? 'experiment-0' : 'globe',
                city: '',
              })
            }
          >
            {selection.mode === 'learn' ? 'Try changing the rules' : 'Return to the globe'} →
          </button>
        )}
      </nav>
      <aside className="context-note">
        <span className="eyebrow">Why this matters</span>
        <p>
          Mercator was designed for navigation in 1569. In September 2026, the UN encouraged
          equal-area projections for general-reference world maps.{' '}
          <a
            href="https://www.au.int/en/pressreleases/20260904/communique-auc-chairperson-adoption-correct-map-resolution"
            target="_blank"
            rel="noreferrer"
          >
            Read the African Union statement ↗
          </a>
        </p>
      </aside>
      {pendingSelection && (
        <DraftConfirmation
          label="Use the preset"
          keep={() => setPendingSelection(null)}
          replace={() => choose(pendingSelection, true)}
        />
      )}
      {new URLSearchParams(location.search).has('diagnostics') && (
        <details className="diagnostics">
          <summary onClick={() => setDiagnosticReport(JSON.stringify(diagnostics(), null, 2))}>
            Local performance measurements
          </summary>
          <p>
            Local diagnostics. No measurements are sent anywhere. Transfer sizes of cached or
            cross-origin resources can be zero.
          </p>
          <button onClick={() => setDiagnosticReport(JSON.stringify(diagnostics(), null, 2))}>
            Refresh measurements
          </button>
          <button
            onClick={() => {
              history.scrollRestoration = 'manual'
              window.scrollTo({ top: 0, behavior: 'instant' })
              window.location.reload()
            }}
          >
            Reload for another measurement
          </button>
          <button
            onClick={() => {
              map.current?.testContextLoss()
              showMap()
            }}
          >
            Test graphics recovery
          </button>
          <pre>{diagnosticReport}</pre>
        </details>
      )}
    </div>
  )
}
