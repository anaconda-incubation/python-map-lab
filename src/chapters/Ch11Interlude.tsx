import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { python } from '@codemirror/lang-python'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import ChapterKicker from '@/components/ChapterKicker'
import { useToast } from '@/hooks/useToast'
import { runPython, warmPython } from '@/chapters/pyodide-demo-runner'

/**
 * CHAPTER 11 · INTERLUDE — The Python doorway (home.md §11). Slim paper
 * bridge, no stage: the architecture pipeline as a typographic diagram, a
 * minimal runnable PythonPanel teaser (CodeMirror + Pyodide worker), and
 * the two editorial doorways into /lab.
 */

const DEFAULT_CODE = `import numpy as np

# Mercator's north-south coordinate — the conformal stretch.
lat = np.linspace(-80, 80, 9)             # degrees
phi = np.radians(lat)                     # phi in radians
y = np.log(np.tan(np.pi / 4 + phi / 2))   # the whole projection, one line

for la, yi in zip(lat, y):
    print(f"lat {la:+5.1f} deg   y = {yi:+.4f}")

stretch = float(y[-1]) / float(phi[-1])   # vs a plain cylindrical map (y = phi)
print(f"\\nat 80 deg, Mercator has stretched north-south {stretch:.2f}x")
print("and the stretch grows without bound toward the poles.")
`

const ANNOTATIONS: { lines: string; text: string }[] = [
  {
    lines: 'line 4–5',
    text: 'Every coordinate arrives as plain degrees in a NumPy array — the sphere, as data.',
  },
  {
    lines: 'line 6',
    text: 'np.log(np.tan(…)) is the entire Mercator projection: the conformal stretch, in one line.',
  },
  {
    lines: 'line 11',
    text: 'The stretch is measured against a plain cylindrical map (y = φ). Nothing up our sleeve.',
  },
]

const PIPELINE: { step: string; title: string; note: string }[] = [
  { step: '01', title: 'Geographic data', note: 'Natural Earth GeoJSON, vendored at build time. No live map API.' },
  { step: '02', title: 'lon / lat arrays', note: 'The sphere as data — one number pair per vertex.' },
  { step: '03', title: 'Pyodide + NumPy', note: 'Python in a web worker. The projection is a function you can read.' },
  { step: '04', title: 'Typed arrays', note: 'Float32Array vertex buffers cross back to JavaScript.' },
  { step: '05', title: 'Three.js buffers', note: 'positionA and positionB attributes on the same geometry.' },
  { step: '06', title: 'GPU morph', note: 'The vertex shader computes mix(A, B, t); the scroll supplies t.' },
]

type PanelStatus = 'idle' | 'starting' | 'running' | 'done' | 'error'

function statusLabel(status: PanelStatus, ms: number | null): string {
  switch (status) {
    case 'idle':
      return 'idle'
    case 'starting':
      return 'starting Python…'
    case 'running':
      return 'running…'
    case 'done':
      return ms !== null ? `done in ${Math.max(1, Math.round(ms))}ms` : 'done'
    case 'error':
      return 'error'
  }
}

/** Reveal-on-scroll helper (§6: block fade/rise 24px at 85% viewport, once). */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || revealed) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setRevealed(true)
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -15% 0px', threshold: 0.1 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [revealed])
  const style = {
    opacity: revealed ? 1 : 0,
    transform: revealed ? 'translateY(0)' : 'translateY(24px)',
    transition: 'opacity 800ms var(--ease-atlas), transform 800ms var(--ease-atlas)',
  } as const
  return { ref, style }
}

export default function Ch11Interlude() {
  const { toast } = useToast()
  const editorHostRef = useRef<HTMLDivElement>(null)
  const runRef = useRef<() => void>(() => {})
  const viewRef = useRef<EditorView | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<PanelStatus>('idle')
  const [doneMs, setDoneMs] = useState<number | null>(null)
  const [output, setOutput] = useState<string>('')
  const statusRef = useRef<PanelStatus>('idle')
  useEffect(() => { statusRef.current = status }, [status])

  const { ref: diagramRevealRef, style: diagramRevealStyle } = useReveal<HTMLDivElement>()
  const { ref: panelRevealRef, style: panelRevealStyle } = useReveal<HTMLDivElement>()
  const { ref: linksRevealRef, style: linksRevealStyle } = useReveal<HTMLDivElement>()

  /* CodeMirror editor (design.md §8 palette: ink text, vermilion keywords,
     seaweed strings, ochre numbers, ink-3 comments). */
  useEffect(() => {
    const host = editorHostRef.current
    if (!host) return
    const theme = EditorView.theme({
      '&': {
        backgroundColor: 'transparent',
        fontSize: '14px',
        fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
      },
      '.cm-content': { padding: '14px 0', caretColor: 'var(--accent)' },
      '.cm-line': { padding: '0 16px' },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        border: 'none',
        color: 'var(--ink-3)',
        paddingLeft: '8px',
      },
      '&.cm-focused': { outline: '2px solid var(--accent)', outlineOffset: '2px' },
      '.cm-activeLine': { backgroundColor: 'rgba(27, 24, 18, 0.04)' },
      '.cm-cursor': { borderLeftColor: 'var(--accent)' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
        backgroundColor: 'rgba(194, 72, 31, 0.16)',
      },
    })
    const highlight = HighlightStyle.define([
      { tag: [tags.keyword, tags.modifier], color: 'var(--accent)' },
      { tag: [tags.string], color: 'var(--seaweed)' },
      { tag: [tags.number], color: 'var(--ochre)' },
      { tag: [tags.comment], color: 'var(--ink-3)', fontStyle: 'italic' },
      { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--indigo)' },
      { tag: [tags.operator], color: 'var(--ink-2)' },
    ])
    const view = new EditorView({
      parent: host,
      doc: DEFAULT_CODE,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        python(),
        theme,
        syntaxHighlighting(highlight),
        EditorView.lineWrapping,
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              runRef.current()
              return true
            },
          },
          {
            key: 'Escape',
            run: (v) => {
              v.contentDOM.blur()
              return true
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
      ],
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  /* Lazy Pyodide warm-up when the panel first scrolls into view (§7.3). */
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    let warmed = false
    const io = new IntersectionObserver(
      (entries) => {
        if (warmed || !entries.some((e) => e.isIntersecting)) return
        warmed = true
        io.disconnect()
        if (statusRef.current !== 'idle') return
        setStatus('starting')
        void warmPython().then(() => {
          setStatus((s) => (s === 'starting' ? 'idle' : s))
        })
      },
      { rootMargin: '200px' },
    )
    io.observe(panel)
    return () => io.disconnect()
  }, [])

  const run = () => {
    const view = viewRef.current
    if (!view || statusRef.current === 'running' || statusRef.current === 'starting') return
    const code = view.state.doc.toString()
    setOutput('')
    setDoneMs(null)
    setStatus('starting')
    void runPython(code, {
      onStatus: (s) => setStatus(s === 'booting' ? 'starting' : 'running'),
      onStdout: (text) => setOutput((prev) => (prev ? `${prev}\n${text}` : text)),
    }).then((result) => {
      if (result.ok) {
        setDoneMs(result.ms)
        setStatus('done')
      } else {
        setStatus('error')
        setOutput((prev) => (prev ? `${prev}\n${result.error}` : result.error ?? 'Error'))
        toast(result.error?.includes('timed out') ? 'Python timed out' : 'Python error — see output', {
          tone: 'error',
        })
      }
    })
  }
  useEffect(() => { runRef.current = run })

  const reset = () => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: DEFAULT_CODE },
    })
    setOutput('')
    setDoneMs(null)
    setStatus('idle')
    view.contentDOM.focus()
  }

  return (
    <section
      id="ch-11"
      aria-labelledby="ch-11-title"
      className="mx-auto max-w-container scroll-mt-20 px-[var(--gutter)] py-24"
    >
      <div className="mx-auto max-w-measure">
        <ChapterKicker
          numeral="11"
          kicker="INTERLUDE"
          title="Take the experiment further."
          titleId="ch-11-title"
          standfirst="Everything you've seen is arithmetic. Every overlay, every ellipse, every morph — a few lines of NumPy. You have changed the equations. Now see how the engine turns those numbers into a world."
          accent="vermilion"
        />

        <p className="mt-10 font-body" style={{ color: 'var(--fg-2)' }}>
          Nothing on this page is a picture of a map. Every frame is computed, and the
          pipeline that computes it is short enough to hold in your head:
        </p>

        {/* The pipeline — typographic diagram, not an image */}
        <div ref={diagramRevealRef} style={diagramRevealStyle} className="mt-12">
          <ol aria-label="The rendering pipeline, six steps">
            {PIPELINE.map((node, i) => (
              <li key={node.step}>
                {i > 0 && (
                  <div className="flex justify-center py-1" aria-hidden>
                    <span style={{ color: 'var(--ink-3)' }}>↓</span>
                  </div>
                )}
                <div
                  className="flex items-baseline gap-4 px-5 py-4"
                  style={{ background: 'var(--bg-2)', border: '1px solid var(--hair)' }}
                >
                  <span className="font-ui text-label" style={{ color: 'var(--gold)' }}>
                    {node.step}
                  </span>
                  <div className="flex flex-1 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-6">
                    <span
                      className="shrink-0 font-mono text-[13.5px] font-bold sm:w-52"
                      style={{ color: 'var(--fg)' }}
                    >
                      {node.title}
                    </span>
                    <span className="font-body text-caption" style={{ color: 'var(--fg-2)' }}>
                      {node.note}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-center font-ui text-caption" style={{ color: 'var(--fg-3)' }}>
            Six steps connect the Python you edited to the map you see.
          </p>
        </div>

        {/* Runnable demo panel (PythonPanel teaser, §8) */}
        <div ref={panelRevealRef} style={panelRevealStyle} className="mt-16">
          <div ref={panelRef} className="code-well" style={{ borderRadius: '2px' }}>
            {/* header row */}
            <div
              className="flex flex-wrap items-center gap-3 px-4 py-2.5"
              style={{ borderBottom: '1px solid var(--hair)' }}
            >
              <span
                className="font-mono text-[12.5px]"
                style={{ color: 'var(--fg-2)' }}
              >
                mercator_y.py
              </span>
              <span
                role="status"
                aria-live="polite"
                className="font-ui text-label uppercase"
                style={{
                  color: status === 'error' ? 'var(--accent)' : 'var(--fg-3)',
                }}
              >
                {statusLabel(status, doneMs)}
              </span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={run}
                disabled={status === 'running' || status === 'starting'}
                className="px-4 py-1.5 font-ui text-label uppercase tracking-[0.14em] transition-opacity duration-micro disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'var(--paper)' }}
              >
                Run ⌘⏎
              </button>
              <button
                type="button"
                onClick={reset}
                className="px-3 py-1.5 font-ui text-label uppercase tracking-[0.14em] transition-colors duration-micro hover:text-accent"
                style={{ border: '1px solid var(--hair)', color: 'var(--fg-2)' }}
              >
                Reset
              </button>
            </div>
            {/* editor */}
            <div ref={editorHostRef} aria-label="Python editor — Mercator's y coordinate. Press Control or Command plus Enter to run." />
            {/* output */}
            <div style={{ borderTop: '1px solid var(--hair)' }}>
              <pre
                aria-live="polite"
                className="min-h-24 overflow-x-auto px-4 py-3 font-mono text-[13px] whitespace-pre-wrap"
                style={{ color: 'var(--fg)' }}
              >
                {output || (
                  <span style={{ color: 'var(--fg-3)' }}>
                    {'stdout — press Run (or ⌘/Ctrl+Enter) to project nine latitudes.'}
                  </span>
                )}
              </pre>
            </div>
          </div>

          {/* line-by-line pedagogy (§8) */}
          <ul className="mt-4 flex flex-col gap-2">
            {ANNOTATIONS.map((a) => (
              <li key={a.lines} className="flex gap-4 font-body text-caption" style={{ color: 'var(--fg-2)' }}>
                <span
                  className="shrink-0 font-mono text-[11.5px] uppercase"
                  style={{ color: 'var(--accent)' }}
                >
                  {a.lines}
                </span>
                <span>{a.text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Doorways to the lab */}
        <div ref={linksRevealRef} style={linksRevealStyle} className="mt-20">
          <p className="font-body" style={{ color: 'var(--fg-2)' }}>
            Before the finale, the map laboratory — build a projection of your own, or
            write the mathematics yourself.
          </p>
          <div className="mt-8 flex flex-col gap-6">
            <Link
              to="/lab"
              className="group font-display text-[clamp(1.375rem,2.8vw,1.75rem)] leading-snug transition-colors duration-micro"
              style={{ color: 'var(--fg)', fontWeight: 460 }}
            >
              Design by goal — tell an optimizer what you care about{' '}
              <span
                className="inline-block transition-transform duration-micro ease-atlas group-hover:translate-x-1.5"
                style={{ color: 'var(--accent)' }}
                aria-hidden
              >
                →
              </span>
            </Link>
            <Link
              to="/lab"
              className="group font-display text-[clamp(1.375rem,2.8vw,1.75rem)] leading-snug transition-colors duration-micro"
              style={{ color: 'var(--fg)', fontWeight: 460 }}
            >
              Write Python — define the function yourself{' '}
              <span
                className="inline-block transition-transform duration-micro ease-atlas group-hover:translate-x-1.5"
                style={{ color: 'var(--accent)' }}
                aria-hidden
              >
                →
              </span>
            </Link>
          </div>
          <Link
            to="/lab"
            className="mt-10 inline-block px-6 py-3 font-ui text-kicker uppercase transition-colors duration-micro"
            style={{ background: 'var(--accent)', color: 'var(--paper)' }}
          >
            Open the Projection Lab
          </Link>
        </div>
      </div>
    </section>
  )
}
