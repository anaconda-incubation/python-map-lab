import { useEffect, useRef, useState } from 'react'
import { EditorView, keymap, lineNumbers, Decoration } from '@codemirror/view'
import { EditorState, StateEffect, StateField } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, toggleComment } from '@codemirror/commands'
import { python } from '@codemirror/lang-python'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { pythonClient, type RunProjectionResult } from '@/projection/worker-client'
import { measure } from '@/utils/diagnostics'
import { track } from '@/analytics/events'
import '@fontsource/jetbrains-mono/latin-400.css'
import DraftConfirmation from '@/components/DraftConfirmation'

export interface PanelAnnotation {
  lines: [number, number]
  title: string
  body: string
}
type Samples = { lon: Float64Array; lat: Float64Array; rows?: string[] }
export interface PythonPanelProps {
  filename: string
  code: string
  initialCode?: string
  supportCode?: string
  analyticsNotebook?: string
  annotations?: PanelAnnotation[]
  samples?: Samples | (() => Promise<Samples>)
  onResult?: (
    result: RunProjectionResult,
    code: string,
    signal: AbortSignal,
    fromKeyboard: boolean,
  ) => Promise<void>
  onRunStateChange?: (running: boolean) => void
  onStage?: (stage: string) => void
  onCodeChange?: (code: string) => void
  onReset?: () => void
  onEdit?: () => void
  onAnnotationHover?: (annotation: PanelAnnotation | null) => void
  initiallyEditable?: boolean
  runLabel?: string
  canRun?: boolean | string
  hideCulledVertexWarnings?: boolean
  className?: string
}
const theme = EditorView.theme({
  '&': { backgroundColor: 'transparent', color: 'var(--ink)', fontSize: '14px' },
  '.cm-content': {
    fontFamily: '"JetBrains Mono", monospace',
    padding: '12px 0',
    caretColor: 'var(--accent)',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--ink-3)',
    border: 'none',
    paddingRight: '8px',
  },
  '.cm-scroller': { overflowX: 'auto' },
  '&.cm-focused': { outline: '2px solid var(--accent)', outlineOffset: '-2px' },
})
const highlighting = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--accent)' },
  { tag: [tags.string, tags.docString], color: 'var(--seaweed)' },
  { tag: tags.number, color: 'var(--ochre)' },
  { tag: tags.comment, color: 'var(--ink-3)', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.propertyName], color: 'var(--indigo)' },
])
const highlightLines = StateEffect.define<[number, number] | null>()
const highlightField = StateField.define({
  create: () => Decoration.none,
  update(decorations, transaction) {
    decorations = decorations.map(transaction.changes)
    for (const effect of transaction.effects)
      if (effect.is(highlightLines)) {
        const range = effect.value
        decorations = range
          ? Decoration.set(
              Array.from(
                {
                  length: Math.max(
                    0,
                    Math.min(range[1], transaction.state.doc.lines) - range[0] + 1,
                  ),
                },
                (_, i) =>
                  Decoration.line({ class: 'annotated-line' }).range(
                    transaction.state.doc.line(range[0] + i).from,
                  ),
              ),
            )
          : Decoration.none
      }
    return decorations
  },
  provide: (field) => EditorView.decorations.from(field),
})
const defaultSamples = {
  lon: new Float64Array(9),
  lat: Float64Array.from(
    [-80, -60, -40, -20, 0, 20, 40, 60, 80],
    (value) => (value * Math.PI) / 180,
  ),
}

export default function PythonPanel(props: PythonPanelProps) {
  const {
    filename,
    code,
    initialCode = code,
    supportCode,
    analyticsNotebook,
    annotations = [],
    samples = defaultSamples,
    runLabel = 'Run Python',
    canRun = true,
    hideCulledVertexWarnings = false,
  } = props
  const host = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null)
  const current = useRef(props),
    source = useRef(initialCode),
    controller = useRef<AbortController | null>(null)
  const runAction = useRef<(keyboard: boolean) => void>(() => {})
  const [stage, setStage] = useState('Opening Python…'),
    [running, setRunning] = useState(false)
  const [error, setError] = useState(''),
    [result, setResult] = useState<RunProjectionResult | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  current.current = props
  function report(message: string) {
    setStage(message)
    current.current.onStage?.(message)
  }

  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: source.current,
        extensions: [
          lineNumbers(),
          history(),
          python(),
          theme,
          syntaxHighlighting(highlighting),
          highlightField,
          EditorView.contentAttributes.of({
            'aria-label': 'Python source code',
            spellcheck: 'false',
            autocapitalize: 'off',
            autocorrect: 'off',
          }),
          keymap.of([
            {
              key: 'Mod-Enter',
              run: () => {
                runAction.current(true)
                return true
              },
            },
            { key: 'Mod-/', run: toggleComment },
            {
              key: 'Escape',
              run: (view) => {
                view.contentDOM.blur()
                return true
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              source.current = update.state.doc.toString()
              current.current.onCodeChange?.(source.current)
              current.current.onEdit?.()
            }
          }),
        ],
      }),
    })
    view.current = editor
    let disposed = false
    const warmup = new AbortController()
    void measure('python-startup', () => pythonClient.warmup(warmup.signal))
      .then(() => {
        if (!disposed && !controller.current) setStage('Python ready')
      })
      .catch((error) => {
        if (!disposed && !controller.current)
          setStage(
            error.name === 'AbortError' ? 'Python stopped' : 'Python could not load. Run to retry.',
          )
      })
    return () => {
      disposed = true
      controller.current?.abort()
      warmup.abort()
      editor.destroy()
      view.current = null
      current.current.onRunStateChange?.(false)
    }
  }, [])

  async function run(fromKeyboard: boolean) {
    if (controller.current || !canRun) return
    const abort = new AbortController()
    controller.current = abort
    const executed = source.current
    setRunning(true)
    props.onRunStateChange?.(true)
    setError('')
    setResult(null)
    report('Starting Python…')
    if (analyticsNotebook) track('Python Run', { notebook: analyticsNotebook })
    try {
      await pythonClient.warmup(abort.signal)
      report('Preparing sample points…')
      const points = typeof samples === 'function' ? await samples() : samples
      abort.signal.throwIfAborted()
      report('Running your function…')
      const output = await measure('python-execution', () =>
        pythonClient.runProjection(
          supportCode ? `${supportCode}\n${executed}` : executed,
          {},
          points.lon,
          points.lat,
          abort.signal,
        ),
      )
      abort.signal.throwIfAborted()
      report('Preparing your map…')
      await props.onResult?.(output, executed, abort.signal, fromKeyboard)
      abort.signal.throwIfAborted()
      setResult(output)
      report('Your Python result is ready.')
      if (analyticsNotebook)
        track('Python Run Completed', { notebook: analyticsNotebook, outcome: 'success' })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError')
        report('Stopped. Your code and last valid map are kept.')
      else {
        const message = error instanceof Error ? error.message : String(error)
        setError(message.slice(0, 6000))
        report('Could not update the map. Your code and last valid map are kept.')
        if (analyticsNotebook)
          track('Python Run Completed', { notebook: analyticsNotebook, outcome: 'error' })
      }
    } finally {
      if (controller.current === abort) {
        controller.current = null
        setRunning(false)
        props.onRunStateChange?.(false)
      }
    }
  }
  runAction.current = run
  function reset() {
    setConfirmReset(false)
    view.current?.dispatch({
      changes: { from: 0, to: view.current.state.doc.length, insert: code },
    })
    setResult(null)
    setError('')
    report('Example restored.')
    props.onReset?.()
  }
  function highlight(annotation: PanelAnnotation | null) {
    view.current?.dispatch({ effects: highlightLines.of(annotation?.lines ?? null) })
    props.onAnnotationHover?.(annotation)
  }
  const warnings =
    result?.warnings.filter(
      (w) => !hideCulledVertexWarnings || !/^\d+ non-finite vertices \(culled\)$/.test(w),
    ) ?? []
  return (
    <div
      className={'code-well ' + (props.className ?? '')}
      data-heap-redact-text
      data-heap-redact-attributes="title,aria-label"
      aria-label={'Runnable Python: ' + filename}
    >
      <div className="python-toolbar">
        <span className="python-filename">{filename}</span>
        <div>
          {running ? (
            <button className="stop-button" onClick={() => controller.current?.abort()}>
              Stop
            </button>
          ) : (
            <button className="primary-button" disabled={!canRun} onClick={() => void run(false)}>
              {runLabel} →
            </button>
          )}
          <button disabled={running} onClick={() => setConfirmReset(true)}>
            Reset
          </button>
        </div>
      </div>
      <p className="python-status" role="status">
        {stage}
      </p>
      <div ref={host} className="python-editor" />
      {error && (
        <div className="python-error" role="alert">
          <strong>Check your function</strong>
          {error.includes('Traceback') ? (
            <>
              <p>{error.trim().split('\n').at(-1)}</p>
              <details>
                <summary>Full Python error</summary>
                <pre>{error}</pre>
              </details>
            </>
          ) : (
            <p>{error}</p>
          )}
        </div>
      )}
      {warnings.map((warning) => (
        <p className="python-warning" key={warning}>
          {warning}
        </p>
      ))}
      {result?.stdout.trim() && <pre className="python-output">{result.stdout}</pre>}
      {result && (
        <details className="python-coordinates">
          <summary>Inspect sample coordinates</summary>
          <table>
            <thead>
              <tr>
                <th>Point</th>
                <th>x</th>
                <th>y</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: Math.min(result.x.length, 9) }, (_, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{Number.isFinite(result.x[i]) ? result.x[i].toFixed(4) : '—'}</td>
                  <td>{Number.isFinite(result.y[i]) ? result.y[i].toFixed(4) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      {confirmReset && (
        <DraftConfirmation
          label="Reset to example"
          keep={() => setConfirmReset(false)}
          replace={reset}
        />
      )}
      {annotations.length > 0 && (
        <details className="python-annotations">
          <summary>Read the code, line by line</summary>
          <ol>
            {annotations.map((annotation) => (
              <li key={annotation.title}>
                <button
                  onMouseEnter={() => highlight(annotation)}
                  onMouseLeave={() => highlight(null)}
                  onFocus={() => highlight(annotation)}
                  onBlur={() => highlight(null)}
                >
                  <strong>
                    Lines {annotation.lines.join('–')} · {annotation.title}
                  </strong>
                  <span>{annotation.body}</span>
                </button>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  )
}
