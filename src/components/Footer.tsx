import { useSourcesDrawer } from '@/components/Drawer'

/**
 * Footer / colophon (design.md §9, home.md §14). Three columns: thesis line,
 * verbatim naming-policy statement, colophon & credits.
 */
export default function Footer() {
  const { openDrawer } = useSourcesDrawer()
  return (
    <footer
      className="mt-24"
      style={{ borderTop: '1px solid var(--hair)' }}
      aria-label="Colophon"
    >
      <div className="mx-auto grid max-w-container gap-10 px-[var(--gutter)] py-16 md:grid-cols-3">
        <p className="pull-line text-pull">
          A map is an optimization problem — ask what you are optimizing for.
        </p>

        <div className="font-body text-caption" style={{ color: 'var(--fg-2)' }}>
          <p className="kicker mb-3" style={{ color: 'var(--gold)' }}>
            Naming policy
          </p>
          <p>
            This site uses internationally recognized geographical names as standardized through
            the UN Group of Experts on Geographical Names (UNGEGN) process and, for marine
            features, the International Hydrographic Organization. Names (e.g. “Gulf of Mexico”,
            “Lake Ontario”) are baked into a curated static dataset at build time — no live map,
            geocoding, or naming API is consulted at runtime. Geometry: Natural Earth (public
            domain).
          </p>
        </div>

        <div className="font-ui text-caption" style={{ color: 'var(--fg-2)' }}>
          <p className="kicker mb-3" style={{ color: 'var(--gold)' }}>
            Colophon
          </p>
          <p>
            Type: Fraunces, Source Serif 4, Inter, JetBrains Mono. Mathematics: KaTeX. Built with
            Three.js · GSAP · Pyodide. Geography: Natural Earth 50m · NASA Blue Marble. AuthaGraph formulas after
            Narukawa (2022); Equal Earth after Šavrič, Patterson &amp; Jenny (2018).
          </p>
          <button
            type="button"
            onClick={() => openDrawer()}
            className="mt-4 uppercase tracking-[0.14em] underline underline-offset-4 transition-colors duration-micro hover:text-accent"
          >
            Sources &amp; notes
          </button>
        </div>
      </div>
    </footer>
  )
}
