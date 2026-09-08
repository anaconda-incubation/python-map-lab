import ChapterKicker from '@/components/ChapterKicker'
import { useSourcesDrawer } from '@/components/Drawer'
import sourcesRaw from '@/data/sources.json?raw'

/**
 * CHAPTER 14 · COLOPHON — Sources & notes (home.md §14). The on-page
 * endnotes list, grouped by chapter and driven by src/data/sources.json
 * (shared with the global sources drawer, which mirrors the same
 * citations). Each group deep-links to its chapter anchor; each entry
 * links out to the source. The Footer (Layout) carries the verbatim
 * naming-policy statement and credits.
 */

interface SourceEntry {
  id: string
  citation: string
  href: string
  note?: string
}

interface SourceGroup {
  id: string
  label: string
  anchor: string
  entries: SourceEntry[]
}

const SOURCES = (JSON.parse(sourcesRaw) as { groups: SourceGroup[] }).groups

export default function Ch14Colophon() {
  const { openDrawer } = useSourcesDrawer()
  return (
    <section
      id="ch-14"
      aria-labelledby="ch-14-title"
      className="mx-auto max-w-container scroll-mt-20 px-[var(--gutter)] py-24"
    >
      <div className="mx-auto max-w-measure">
        <ChapterKicker
          numeral="14"
          kicker="COLOPHON"
          title="Sources & notes."
          titleId="ch-14-title"
          standfirst="Everything asserted in this essay is traceable. The endnotes below are grouped by chapter; the same list lives in the drawer, reachable from anywhere on the page."
          accent="gold"
        />

        <button
          type="button"
          onClick={() => openDrawer()}
          className="mt-10 px-5 py-2.5 font-ui text-kicker uppercase transition-colors duration-micro"
          style={{
            border: '1px solid var(--hair)',
            color: 'var(--fg)',
            background: 'var(--bg-2)',
          }}
        >
          Open sources &amp; notes drawer
        </button>

        <div className="mt-16 flex flex-col gap-12">
          {SOURCES.map((group, groupIndex) => (
            <div key={group.id} style={{ borderTop: '1px solid var(--hair)' }} className="pt-8">
              <p className="font-ui text-label uppercase" style={{ color: 'var(--gold)' }}>
                <a
                  href={group.anchor}
                  className="transition-colors duration-micro hover:text-accent"
                >
                  {group.label} <span aria-hidden>↗</span>
                </a>
              </p>
              <ol className="mt-5 flex flex-col gap-6">
                {group.entries.map((entry, entryIndex) => {
                  const index = SOURCES.slice(0, groupIndex).reduce((n, g) => n + g.entries.length, 0) + entryIndex + 1
                  return (
                    <li key={entry.id} className="flex gap-4">
                      <span className="footnote-ref" aria-hidden>
                        {String(index).padStart(2, '0')}
                      </span>
                      <div>
                        <p className="font-body text-body-sm" style={{ color: 'var(--fg)' }}>
                          {entry.citation}
                        </p>
                        {entry.note && (
                          <p className="mt-1 font-body text-caption" style={{ color: 'var(--fg-2)' }}>
                            {entry.note}
                          </p>
                        )}
                        <a
                          href={entry.href}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block font-ui text-caption underline underline-offset-2 transition-colors duration-micro hover:text-accent"
                          style={{ color: 'var(--fg-2)' }}
                        >
                          {entry.href.replace(/^https?:\/\//, '')}
                        </a>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          ))}
        </div>

        <p className="mt-16 font-body text-caption" style={{ color: 'var(--fg-3)' }}>
          Citations were verified against the published sources. Where this essay simplifies —
          and it does — the simplification is ours, not the authors&rsquo;.
        </p>
      </div>
    </section>
  )
}
