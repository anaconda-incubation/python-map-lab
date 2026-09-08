import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorView, keymap, lineNumbers, Decoration, type DecorationSet } from '@codemirror/view'
import { Compartment, EditorState, StateEffect, StateField } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { python } from '@codemirror/lang-python'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { pythonClient, type RunProjectionResult } from '@/projection/worker-client'
import { useToast } from '@/hooks/useToast'

/**
 * PythonPanel (design.md §8) — the executable textbook panel.
 * Recessed paper well, filename tab, status chip, CodeMirror 6 editor holding
 * the REAL projection code that the Pyodide worker runs, Run/Reset/Edit,
 * Cmd/Ctrl+Enter, captured stdout + a result table, and a line-annotation
 * list whose hover highlights code lines and (via onAnnotationHover) pulses
 * the affected latitude bands on the chapter's companion instrument.
 */

export interface PanelAnnotation {
  /** 1-based inclusive line range in the displayed code. */
  lines: [number, number]
  /** Short handle, e.g. "line 14 — the conformal stretch". */
  title: string
  /** One or two sentences of plain-language explanation. */
  body: string
}

export interface PythonPanelProps {
  supportCode?: string
  filename: string
  onResult?: (result: RunProjectionResult, code: string) => Promise<void>
  onRunStateChange?: (running: boolean) => void
  onReset?: () => void
  onEdit?: () => void
  initiallyEditable?: boolean
  runLabel?: string
  /** Initial (and Reset) editor contents — the code that actually runs. */
  code: string
  annotations?: PanelAnnotation[]
  /** Sample points the code is evaluated on (radians). */
  samples?: { lon: Float64Array; lat: Float64Array; rows?: string[] }
  /** Hover/focus of an annotation (null on leave) — chapter wires stage pulses. */
  onAnnotationHover?: (ann: PanelAnnotation | null) => void
  className?: string
}

type Status = { kind: 'idle' } | { kind: 'starting' } | { kind: 'running' } | { kind: 'done'; ms: number }

/* ---------- CodeMirror theme (palette-matched, design.md §8) ---------- */

const panelTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    color: 'var(--ink)',
    fontSize: '14px',
  },
  '.cm-content': {
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    padding: '12px 0',
    caretColor: 'var(--accent)',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--ink-3)',
    border: 'none',
    paddingRight: '8px',
  },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--ink) 4%, transparent)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { overflowX: 'auto' },
})

const panelHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--accent)' },
  { tag: [tags.string, tags.docString], color: 'var(--seaweed)' },
  { tag: tags.number, color: 'var(--ochre)' },
  { tag: tags.comment, color: 'var(--ink-3)', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--indigo)' },
  { tag: [tags.operator], color: 'var(--ink-2)' },
  { tag: [tags.variableName], color: 'var(--ink)' },
  { tag: [tags.propertyName], color: 'var(--indigo)' },
  { tag: [tags.bool, tags.null, tags.atom], color: 'var(--ochre)' },
])

/* ---------- line-highlight decorations ---------- */

const setLineHighlight = StateEffect.define<{ from: number; to: number } | null>()
const highlightLineDeco = Decoration.line({
  attributes: {
    style: 'background: color-mix(in srgb, var(--accent) 12%, transparent); box-shadow: inset 2px 0 0 var(--accent)',
  },
})
const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(setLineHighlight)) {
        if (!e.value) {
          deco = Decoration.none
        } else {
          const ranges = []
          const last = tr.state.doc.lines
          for (let ln = e.value.from; ln <= Math.min(e.value.to, last); ln++) {
            ranges.push(highlightLineDeco.range(tr.state.doc.line(ln).from))
          }
          deco = Decoration.set(ranges, true)
        }
      }
    }
    return deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

const DEFAULT_SAMPLES = (() => {
  const lats = [-80, -60, -40, -20, 0, 20, 40, 60, 80]
  return {
    lon: new Float64Array(lats.length), // all on the central meridian
    lat: new Float64Array(lats.map((d) => (d * Math.PI) / 180)),
    rows: lats.map((d) => `λ 0°, φ ${d}°`),
  }
})()

export default function PythonPanel({
  filename,
  supportCode,
  onResult, onReset, onEdit, onRunStateChange, initiallyEditable = false, runLabel = 'Run Python',
  code,
  annotations = [],
  samples = DEFAULT_SAMPLES,
  onAnnotationHover,
  className,
}: PythonPanelProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const editorHostRef = useRef<HTMLDivElement | null>(null)
  const runRef = useRef<() => void>(() => {})
  const viewRef = useRef<EditorView | null>(null)
  const codeRef = useRef(code)
  const editCallback = useRef(onEdit)
  useEffect(() => { editCallback.current = onEdit }, [onEdit])
  const readOnlyCompartment = useRef(new Compartment())
  const [editable, setEditable] = useState(initiallyEditable)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [stdout, setStdout] = useState<string | null>(null)
  const [table, setTable] = useState<Array<{ label: string; x: number; y: number }> | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  /* ---- editor lifecycle (once) ---- */
  useEffect(() => {
    const host = editorHostRef.current
    if (!host) return
    const runKey = {
      key: 'Mod-Enter',
      run: () => {
        runRef.current()
        return true
      },
    }
    const blurKey = {
      key: 'Escape',
      run: (v: EditorView) => {
        ;(v.contentDOM as HTMLElement).blur()
        return true
      },
    }
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: codeRef.current,
        extensions: [
          EditorView.contentAttributes.of({ 'aria-label': 'Python source code' }),
          lineNumbers(),
          history(),
          python(),
          panelTheme,
          syntaxHighlighting(panelHighlight),
          highlightField,
          keymap.of([runKey, blurKey, ...defaultKeymap, ...historyKeymap]),
          readOnlyCompartment.current.of([
            EditorState.readOnly.of(true),
            EditorView.editable.of(false),
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) { codeRef.current = u.state.doc.toString(); editCallback.current?.() }
          }),
        ],
      }),
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  /* ---- read-only ↔ editable ---- */
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyCompartment.current.reconfigure([
        EditorState.readOnly.of(!editable || status.kind === 'running'),
        EditorView.editable.of(editable && status.kind !== 'running'),
      ]),
    })
  }, [editable, status.kind])

  /* ---- lazy Pyodide warmup when the panel nears the viewport ---- */
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    let started = false
    const io = new IntersectionObserver(
      (entries) => {
        if (started || !entries.some((e) => e.isIntersecting)) return
        started = true
        setStatus({ kind: 'starting' })
        pythonClient
          .warmup()
          .then(() => setStatus((s) => (s.kind === 'starting' ? { kind: 'idle' } : s)))
          .catch(() => {
            setStatus({ kind: 'idle' })
            toast('Python runtime failed to start — check your connection and retry.', {
              tone: 'error',
            })
          })
        io.disconnect()
      },
      { rootMargin: '200px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [toast])

  /* ---- run / reset ---- */
  const run = useCallback(async () => {
    if (status.kind === 'running') return
    setStatus({ kind: 'running' })
    onRunStateChange?.(true)
    setError(null)
    const t0 = performance.now()
    try {
      const executedCode = supportCode ? `${supportCode}\n${codeRef.current}` : codeRef.current
      const res = await pythonClient.runProjection(executedCode, {}, samples.lon, samples.lat)
      await onResult?.(res, executedCode)
      const rows: string[] =
        samples.rows ?? Array.from({ length: samples.lon.length }, (_, i) => `point ${i + 1}`)
      setStdout(res.stdout)
      setWarnings(res.warnings)
      setTable(
        rows.slice(0, Math.min(res.x.length, 9)).map((label, i) => ({
          label,
          x: res.x[i],
          y: res.y[i],
        })),
      )
      setStatus({ kind: 'done', ms: Math.max(1, Math.round(performance.now() - t0)) })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setStatus({ kind: 'idle' })
      toast(msg, { tone: 'error' })
    } finally { onRunStateChange?.(false) }
  }, [samples, status.kind, toast, onResult, onRunStateChange, supportCode])
  useEffect(() => { runRef.current = run })

  const reset = useCallback(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: code },
    })
    codeRef.current = code
    onReset?.()
    setStdout(null)
    setTable(null)
    setWarnings([])
    setError(null)
    setStatus({ kind: 'idle' })
  }, [code, onReset])

  const highlight = useCallback(
    (ann: PanelAnnotation | null) => {
      viewRef.current?.dispatch({
        effects: setLineHighlight.of(ann ? { from: ann.lines[0], to: ann.lines[1] } : null),
      })
      onAnnotationHover?.(ann)
    },
    [onAnnotationHover],
  )

  const chip =
    status.kind === 'idle'
      ? 'idle'
      : status.kind === 'starting'
        ? 'starting Python runtime…'
        : status.kind === 'running'
          ? 'running'
          : `done in ${status.ms} ms`

  return (
    <div ref={rootRef} aria-label={`Runnable Python: ${filename}`} className={`code-well ${className ?? ''}`} style={{ background: 'var(--bg-2)' }}>
      {/* header row: filename tab + status chip + buttons */}
      <div
        className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5"
        style={{ borderColor: 'var(--hair)' }}
      >
        <span
          className="rounded-t-sm border border-b-0 px-3 py-1 font-mono text-caption"
          style={{ borderColor: 'var(--hair)', background: 'var(--bg-3)', color: 'var(--fg)' }}
        >
          {filename}
        </span>
        <span
          role="status"
          className="ml-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-ui text-label uppercase"
          style={{
            borderColor: 'var(--hair)',
            color: status.kind === 'running' || status.kind === 'starting' ? 'var(--accent)' : 'var(--fg-3)',
          }}
        >
          <span
            aria-hidden
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              status.kind === 'running' || status.kind === 'starting' ? 'animate-pulse' : ''
            }`}
            style={{
              background:
                status.kind === 'done'
                  ? 'var(--seaweed)'
                  : status.kind === 'idle'
                    ? 'var(--fg-3)'
                    : 'var(--accent)',
            }}
          />
          {chip}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={run}
            disabled={status.kind === 'running' || status.kind === 'starting'}
            className="rounded-sm px-3.5 py-1.5 font-ui text-label uppercase text-paper transition-all duration-micro ease-atlas disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {runLabel}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={status.kind === 'running'}
            className="rounded-sm border px-3.5 py-1.5 font-ui text-label uppercase transition-colors duration-micro ease-atlas"
            style={{ borderColor: 'var(--hair)', color: 'var(--fg-2)', background: 'transparent' }}
          >
            Reset
          </button>
          <button
            type="button"
            aria-pressed={editable}
            onClick={() => setEditable((v) => !v)}
            className="rounded-sm border px-3.5 py-1.5 font-ui text-label uppercase transition-colors duration-micro ease-atlas"
            style={{
              borderColor: editable ? 'var(--accent)' : 'var(--hair)',
              color: editable ? 'var(--accent)' : 'var(--fg-2)',
              background: 'transparent',
            }}
          >
            {editable ? 'Editing' : 'Edit'}
          </button>
        </div>
      </div>

      {/* first-use notice */}
      {status.kind === 'starting' && (
        <p className="border-b px-4 py-2 font-ui text-caption" style={{ borderColor: 'var(--hair)', color: 'var(--fg-2)' }}>
          Starting Python runtime (one-time, ~6 MB)…
        </p>
      )}

      {/* editor */}
      <div ref={editorHostRef} className="px-2" />

      {/* output */}
      {(stdout !== null || table || error) && (
        <div className="border-t px-4 py-3" style={{ borderColor: 'var(--hair)' }}>
          {error && (
            <pre className="whitespace-pre-wrap font-mono text-caption" style={{ color: 'var(--accent)' }}>
              {error}
            </pre>
          )}
          {warnings.map((w) => (
            <p key={w} className="font-ui text-caption" style={{ color: 'var(--ochre)' }}>
              warning: {w}
            </p>
          ))}
          {stdout !== null && stdout.trim() !== '' && (
            <pre className="whitespace-pre-wrap font-mono text-caption" style={{ color: 'var(--fg)' }}>
              {stdout}
            </pre>
          )}
          {table && (
            <details className="python-coordinates"><summary>Inspect sample coordinates (first {table.length})</summary><table className="mt-2 w-full font-mono text-caption" style={{ color: 'var(--fg-2)' }}>
              <thead>
                <tr className="text-left font-ui text-label uppercase" style={{ color: 'var(--fg-3)' }}>
                  <th className="py-1 pr-4 font-medium">point</th>
                  <th className="py-1 pr-4 font-medium">x</th>
                  <th className="py-1 font-medium">y</th>
                </tr>
              </thead>
              <tbody>
                {table.map((r) => (
                  <tr key={r.label}>
                    <td className="py-0.5 pr-4">{r.label}</td>
                    <td className="py-0.5 pr-4">{Number.isFinite(r.x) ? r.x.toFixed(4) : '—'}</td>
                    <td className="py-0.5">{Number.isFinite(r.y) ? r.y.toFixed(4) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table></details>
          )}
        </div>
      )}

      {/* line-by-line annotations (equation ↔ code ↔ geometry link, §8) */}
      {annotations.length > 0 && (
        <ol className="border-t px-4 py-3" style={{ borderColor: 'var(--hair)' }}>
          {annotations.map((ann) => (
            <li key={ann.title} className="py-1.5">
              <button
                type="button"
                className="block w-full rounded-sm px-2 py-1 text-left transition-colors duration-micro ease-atlas"
                style={{ color: 'var(--fg-2)' }}
                onMouseEnter={() => highlight(ann)}
                onMouseLeave={() => highlight(null)}
                onFocus={() => highlight(ann)}
                onBlur={() => highlight(null)}
              >
                <span className="font-mono text-caption" style={{ color: 'var(--accent)' }}>
                  {ann.lines[0] === ann.lines[1]
                    ? `line ${ann.lines[0]}`
                    : `lines ${ann.lines[0]}–${ann.lines[1]}`}
                </span>
                <span className="font-ui text-caption font-semibold"> — {ann.title}. </span>
                <span className="font-body text-caption">{ann.body}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
