import { useMemo } from 'react'
import katex from 'katex'

/**
 * EquationBlock (design.md §9): KaTeX display block with an optional
 * expandable "what each symbol means" glossary row. (Hover-linked
 * equation ↔ code ↔ stage term highlighting is wired by chapter agents
 * on top of this; `data-term` hooks are provided via `terms`.)
 */
export interface EquationTerm {
  /** TeX symbol, e.g. "F'(\\theta)" — rendered in the glossary. */
  symbol: string
  /** Plain-language meaning. */
  meaning: string
}

export interface EquationBlockProps {
  /** Display-mode TeX source. */
  tex: string
  /** Optional symbol glossary rendered as an expandable row. */
  glossary?: EquationTerm[]
  /** Optional figure-note caption under the block. */
  caption?: string
  className?: string
}

export default function EquationBlock({ tex, glossary, caption, className }: EquationBlockProps) {
  const html = useMemo(
    () =>
      katex.renderToString(tex, {
        displayMode: true,
        throwOnError: false,
        strict: false,
      }),
    [tex],
  )

  return (
    <figure
      className={className}
      style={{
        background: 'var(--bg-2)',
        border: '1px solid var(--hair)',
        padding: '1.75rem 1.5rem',
      }}
    >
      <div
        className="overflow-x-auto text-center"
        style={{ fontSize: '1.25em', color: 'var(--fg)' }}
        // KaTeX output is generated locally from our own TeX strings.
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {glossary && glossary.length > 0 && (
        <details className="mt-4">
          <summary
            className="cursor-pointer font-ui text-label uppercase"
            style={{ color: 'var(--fg-3)' }}
          >
            What each symbol means
          </summary>
          <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
            {glossary.map((t, i) => (
              <div key={i} className="contents">
                <dt
                  className="whitespace-nowrap"
                  style={{ color: 'var(--fg)' }}
                  dangerouslySetInnerHTML={{
                    __html: katex.renderToString(t.symbol, { throwOnError: false }),
                  }}
                />
                <dd className="font-body text-caption" style={{ color: 'var(--fg-2)' }}>
                  {t.meaning}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {caption && (
        <figcaption
          className="mt-3 font-ui text-caption"
          style={{ color: 'var(--fg-2)' }}
        >
          {caption}
        </figcaption>
      )}
    </figure>
  )
}
