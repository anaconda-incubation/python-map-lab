/**
 * PythonPanelB — the executable textbook panel (design.md §8), essay-b build.
 *
 * A recessed well with a filename tab, status chip, Run / Reset / Edit
 * buttons, a CodeMirror 6 Python editor, and a stdout output area. Code runs
 * in the Pyodide Web Worker via pythonClient.runProjection — the same
 * worker/Comlink path the Projection Lab uses; NumPy is available. The code
 * must define project(lon, lat[, params]) returning arrays shaped like the
 * input (the worker validates shape/finiteness and captures stdout).
 *
 * Keyboard: Cmd/Ctrl+Enter runs, Esc blurs. Edit toggles read-only ↔ editable.
 * Hovering a line annotation below the editor highlights those code lines
 * (the equation ↔ code ↔ geometry teaching move; chapter agents wire the
 * stage side separately).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorView, keymap, lineNumbers, Decoration, type DecorationSet } from '@codemirror/view'
import { EditorState, Prec, Compartment, StateEffect, StateField } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { python } from '@codemirror/lang-python'
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language'
import { pythonClient } from '@/projection/worker-client'
import { useToast } from '@/hooks/useToast'
import type { ChapterAccent } from '@/components/ChapterKicker'

const ACCENT_VARS: Record<ChapterAccent, string> = {
  vermilion: 'var(--accent)',
  ochre: 'var(--ochre)',
  seaweed: 'var(--seaweed)',
  indigo: 'var(--indigo)',
  gold: 'var(--gold)',
}

export interface PanelAnnotation {
  /** Line range, e.g. "4" or "4–6" (1-based, inclusive). */
  lines: string
  /** Plain-language explanation. */
  text: string
}

export interface PythonPanelBProps {
  filename: string
  initialCode: string
  accent?: ChapterAccent
  annotations?: PanelAnnotation[]
  /** Sample points fed to project(lon, lat); defaults to a 15°×15° grid. */
  samples?: { lon: Float64Array; lat: Float64Array }
  caption?: string
}

type RunStatus = 'idle' | 'starting' | 'running' | 'done' | 'error'

/* ---- annotation line-highlight extension ---- */
const setAnnoLines = StateEffect.define<{ from: number; to: number } | null>()
const annoField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(setAnnoLines)) {
        if (!e.value) {
          deco = Decoration.none
        } else {
          const marks: import('@codemirror/state').Range<Decoration>[] = []
          const last = Math.min(e.value.to, tr.state.doc.lines)
          for (let l = e.value.from; l <= last; l++) {
            marks.push(Decoration.line({ class: 'cm-anno-line' }).range(tr.state.doc.line(l).from))
          }
          deco = Decoration.set(marks)
        }
      }
    }
    return deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

function parseLineRange(spec: string): { from: number; to: number } | null {
  const m = spec.match(/^(\d+)\s*(?:[–-]\s*(\d+))?$/)
  if (!m) return null
  const from = Number(m[1])
  const to = m[2] ? Number(m[2]) : from
  return from >= 1 && to >= from ? { from, to } : null
}

const editorTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', fontSize: '13.5px', maxHeight: '440px' },
  '.cm-content': {
    fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
    padding: '14px 0',
    caretColor: 'var(--fg)',
  },
  '.cm-scroller': { overflow: 'auto', lineHeight: '1.6' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--fg-3)',
    border: 'none',
    paddingLeft: '10px',
  },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--fg) 4%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--fg-2)' },
  '&.cm-focused': { outline: '2px solid var(--accent)', outlineOffset: '2px' },
  '.cm-anno-line': { backgroundColor: 'color-mix(in srgb, var(--accent) 9%, transparent)' },
})

function defaultSamples(): { lon: Float64Array; lat: Float64Array } {
  const lons: number[] = []
  const lats: number[] = []
  for (let lat = -75; lat <= 75; lat += 15) {
    for (let lon = -180; lon <= 180; lon += 15) {
      lons.push((lon * Math.PI) / 180)
      lats.push((lat * Math.PI) / 180)
    }
  }
  return { lon: Float64Array.from(lons), lat: Float64Array.from(lats) }
}

export default function PythonPanelB({
  filename,
  initialCode,
  accent = 'vermilion',
  annotations,
  samples,
  caption,
}: PythonPanelBProps) {
  const { toast } = useToast()
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const editableComp = useRef(new Compartment())
  const [editable, setEditable] = useState(false)
  const [status, setStatus] = useState<RunStatus>('idle')
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  const [output, setOutput] = useState<string>('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  const runRef = useRef<() => void>(() => {})
  const accentVar = ACCENT_VARS[accent]

  /* release the global status callback on unmount */
  useEffect(() => {
    return () => {
      pythonClient.onStatus = null
    }
  }, [])

  /* ---- editor lifecycle ---- */
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const state = EditorState.create({
      doc: initialCode,
      extensions: [
        lineNumbers(),
        history(),
        bracketMatching(),
        python(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        editorTheme,
        annoField,
        editableComp.current.of(EditorView.editable.of(false)),
        Prec.highest(
          keymap.of([
            { key: 'Mod-Enter', run: () => { runRef.current(); return true } },
            { key: 'Escape', run: (v) => { v.contentDOM.blur(); return true } },
          ]),
        ),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) setDirty(true)
        }),
      ],
    })
    const view = new EditorView({ state, parent: host })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // initialCode is fixed per panel instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---- actions ---- */
  const run = useCallback(async () => {
    const view = viewRef.current
    if (!view) return
    const code = view.state.doc.toString()
    setStatus('starting')
    setWarnings([])
    pythonClient.onStatus = (s) => {
      if (s === 'starting' || s === 'restarting') setStatus('starting')
      else if (s === 'ready') setStatus('running')
    }
    const t0 = performance.now()
    try {
      const smp = samples ?? defaultSamples()
      const result = await pythonClient.runProjection(code, {}, smp.lon, smp.lat)
      setElapsedMs(performance.now() - t0)
      setOutput(result.stdout || '(no printed output)')
      setWarnings(result.warnings)
      setStatus('done')
    } catch (err) {
      setStatus('error')
      const msg = err instanceof Error ? err.message : String(err)
      setOutput(msg)
      toast(msg, { tone: 'error' })
    }
  }, [samples, toast])

  runRef.current = run

  const reset = useCallback(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: initialCode },
    })
    setDirty(false)
    setStatus('idle')
    setOutput('')
    setWarnings([])
    setElapsedMs(null)
  }, [initialCode])

  const toggleEdit = useCallback(() => {
    const view = viewRef.current
    if (!view) return
    setEditable((prev) => {
      const next = !prev
      view.dispatch({ effects: editableComp.current.reconfigure(EditorView.editable.of(next)) })
      if (next) view.contentDOM.focus()
      return next
    })
  }, [])

  const highlight = useCallback((spec: string | null) => {
    const view = viewRef.current
    if (!view) return
    const range = spec ? parseLineRange(spec) : null
    view.dispatch({ effects: setAnnoLines.of(range) })
  }, [])

  /* ---- status chip ---- */
  const chip = useMemo(() => {
    switch (status) {
      case 'idle':
        return { label: 'idle', color: 'var(--fg-3)' }
      case 'starting':
        return { label: 'starting Python… (one-time, ~6 MB)', color: 'var(--gold)' }
      case 'running':
        return { label: 'running', color: 'var(--gold)' }
      case 'done':
        return { label: `done in ${Math.max(1, Math.round(elapsedMs ?? 0))} ms`, color: accentVar }
      case 'error':
        return { label: 'error', color: 'var(--accent)' }
    }
  }, [status, elapsedMs, accentVar])

  const btnBase =
    'rounded-full px-4 py-1.5 font-ui text-label uppercase transition-colors duration-micro ease-atlas'
  const ghostStyle = {
    border: '1px solid var(--hair)',
    color: 'var(--fg-2)',
    background: 'transparent',
  } as const

  return (
    <figure
      className="code-well overflow-hidden"
      style={{ borderRadius: 0 }}
      aria-label={`Runnable Python: ${filename}`}
    >
      {/* header row */}
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5"
        style={{ borderColor: 'var(--hair)' }}
      >
        <span
          className="font-mono text-caption"
          style={{ color: 'var(--fg-2)', borderLeft: `2px solid ${accentVar}`, paddingLeft: 8 }}
        >
          {filename}
          {dirty && (
            <span className="font-ui" style={{ color: 'var(--fg-3)' }}>
              {' '}
              (edited)
            </span>
          )}
        </span>
        <span
          className="font-ui text-label uppercase"
          style={{ color: chip.color }}
          role="status"
          aria-live="polite"
        >
          {chip.label}
        </span>
        <span className="grow" />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={run}
            disabled={status === 'starting' || status === 'running'}
            className={btnBase}
            style={{
              background: 'var(--accent)',
              color: 'var(--paper)',
              opacity: status === 'starting' || status === 'running' ? 0.55 : 1,
            }}
          >
            Run
          </button>
          <button type="button" onClick={reset} className={btnBase} style={ghostStyle}>
            Reset
          </button>
          <button
            type="button"
            onClick={toggleEdit}
            aria-pressed={editable}
            className={btnBase}
            style={{
              ...ghostStyle,
              ...(editable ? { borderColor: accentVar, color: accentVar } : {}),
            }}
          >
            {editable ? 'Editing' : 'Edit'}
          </button>
        </div>
      </div>

      {/* editor */}
      <div ref={hostRef} aria-label={`Python source for ${filename}`} />
      <p className="px-4 pb-2 font-ui text-[0.65rem] uppercase" style={{ color: 'var(--fg-3)', letterSpacing: '0.14em' }}>
        Ctrl/Cmd + Enter runs · Edit unlocks the editor · NumPy available
      </p>

      {/* output */}
      {(output || warnings.length > 0) && (
        <div className="border-t px-4 py-3" style={{ borderColor: 'var(--hair)' }}>
          {warnings.map((w, i) => (
            <p key={i} className="font-ui text-caption" style={{ color: 'var(--gold)' }}>
              warning: {w}
            </p>
          ))}
          <pre
            className="whitespace-pre-wrap font-mono text-caption"
            style={{ color: status === 'error' ? 'var(--accent)' : 'var(--fg)' }}
            tabIndex={0}
            aria-label="Program output"
          >
            {output}
          </pre>
        </div>
      )}

      {/* line-by-line pedagogy */}
      {annotations && annotations.length > 0 && (
        <ul className="border-t px-4 py-3" style={{ borderColor: 'var(--hair)' }}>
          {annotations.map((a, i) => (
            <li key={i}>
              <button
                type="button"
                className="block w-full py-1 text-left font-ui text-caption transition-colors duration-micro"
                style={{ color: 'var(--fg-2)' }}
                onMouseEnter={() => highlight(a.lines)}
                onMouseLeave={() => highlight(null)}
                onFocus={() => highlight(a.lines)}
                onBlur={() => highlight(null)}
              >
                <span className="font-mono" style={{ color: accentVar }}>
                  line{a.lines.includes('–') || a.lines.includes('-') ? 's' : ''} {a.lines}
                </span>
                {' — '}
                {a.text}
              </button>
            </li>
          ))}
        </ul>
      )}

      {caption && (
        <figcaption
          className="border-t px-4 py-2.5 font-ui text-caption"
          style={{ borderColor: 'var(--hair)', color: 'var(--fg-2)' }}
        >
          {caption}
        </figcaption>
      )}
    </figure>
  )
}
