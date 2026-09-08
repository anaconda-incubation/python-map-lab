/**
 * CodeMirror 6 Python editor for WRITE PYTHON (design/lab.md MODE 2,
 * design.md §8): dark Atlas theme (ink text, vermilion keywords, seaweed
 * strings, ochre numbers, dimmed comments), Cmd/Ctrl+Enter runs, Esc blurs.
 */
import { useEffect, useRef } from 'react'
import { EditorState, Prec } from '@codemirror/state'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { python } from '@codemirror/lang-python'
import {
  bracketMatching,
  defaultHighlightStyle,
  syntaxHighlighting,
  HighlightStyle,
} from '@codemirror/language'
import { tags } from '@lezer/highlight'

const atlasTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--bg-2)',
      color: 'var(--fg)',
      fontSize: '13.5px',
      height: '100%',
    },
    '.cm-content': {
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      lineHeight: '1.6',
      padding: '12px 0',
      caretColor: 'var(--accent)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--bg-2)',
      color: 'var(--fg-3)',
      border: 'none',
      borderRight: '1px solid var(--hair)',
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      fontSize: '11px',
    },
    '.cm-activeLine': { backgroundColor: 'rgba(237, 230, 214, 0.04)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(237, 230, 214, 0.06)' },
    '&.cm-focused': { outline: 'none' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'rgba(194, 72, 31, 0.25) !important',
    },
    '.cm-cursor': { borderLeftColor: 'var(--accent)' },
    '.cm-matchingBracket': {
      backgroundColor: 'rgba(62, 110, 94, 0.35)',
      outline: 'none',
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--bg)',
      border: '1px solid var(--hair)',
      color: 'var(--fg)',
    },
  },
  { dark: true },
)

const atlasHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--accent)' },
  { tag: [tags.string, tags.special(tags.string)], color: '#7FA88F' }, // seaweed lightened for dark bg
  { tag: [tags.number, tags.bool], color: '#D9A03B' }, // ochre
  { tag: tags.comment, color: 'var(--fg-3)', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#EDE6D6' },
  { tag: [tags.definition(tags.variableName)], color: '#EDE6D6' },
  { tag: tags.operator, color: 'var(--fg-2)' },
  { tag: tags.variableName, color: 'var(--fg)' },
  { tag: [tags.propertyName, tags.attributeName], color: '#C9B37E' },
  { tag: tags.self, color: 'var(--accent)', fontStyle: 'italic' },
])

export interface PythonEditorProps {
  value: string
  onChange: (code: string) => void
  onRun: () => void
  ariaLabel?: string
}

export default function PythonEditor({ value, onChange, onRun, ariaLabel }: PythonEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onRunRef = useRef(onRun)
  onChangeRef.current = onChange
  onRunRef.current = onRun

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          drawSelection(),
          history(),
          python(),
          bracketMatching(),
          syntaxHighlighting(atlasHighlight, { fallback: true }),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          Prec.highest(
            keymap.of([
              {
                key: 'Mod-Enter',
                run: () => {
                  onRunRef.current()
                  return true
                },
              },
              {
                key: 'Escape',
                run: (v) => {
                  ;(v.dom.querySelector('.cm-content') as HTMLElement | null)?.blur()
                  return true
                },
              },
            ]),
          ),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          atlasTheme,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString())
          }),
          EditorView.contentAttributes.of({
            'aria-label': ariaLabel ?? 'Python projection editor',
            spellcheck: 'false',
          }),
        ],
      }),
      parent: host,
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // The editor owns its document after mount; external resets go through
    // the value-sync effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* External value changes (template load, reset, share-link restore) replace
     the document only when they differ from the editor's current text. */
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
        selection: { anchor: Math.min(view.state.selection.main.anchor, value.length) },
      })
    }
  }, [value])

  return <div ref={hostRef} className="h-full min-h-[45vh] w-full" />
}
