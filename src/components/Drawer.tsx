import { Link, useLocation } from 'react-router'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

/**
 * Sources & Notes drawer (design.md §9, home.md §14) — right side, 480px,
 * 380ms ease-atlas, focus-trapped, Esc closes.
 *
 * Layout mounts <SourcesDrawerProvider> + <Drawer/> once. Anything (nav,
 * footnote numerals, footer) opens it with `useSourcesDrawer().openDrawer()`.
 */

interface SourcesDrawerContextValue {
  open: boolean
  openDrawer: (entryId?: string) => void
  closeDrawer: () => void
}

const SourcesDrawerContext = createContext<SourcesDrawerContextValue | null>(null)

export function SourcesDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const openDrawer = useCallback(() => setOpen(true), [])
  const closeDrawer = useCallback(() => setOpen(false), [])
  const value = useMemo(() => ({ open, openDrawer, closeDrawer }), [open, openDrawer, closeDrawer])
  return <SourcesDrawerContext.Provider value={value}>{children}</SourcesDrawerContext.Provider>
}

// Public helper intentionally colocated with its provider or teaching component.
// eslint-disable-next-line react-refresh/only-export-components
export function useSourcesDrawer(): SourcesDrawerContextValue {
  const ctx = useContext(SourcesDrawerContext)
  if (!ctx) throw new Error('useSourcesDrawer must be used inside <SourcesDrawerProvider>')
  return ctx
}

/* ── Sources data (home.md §14) ─────────────────────────────────────── */

interface SourceEntry {
  chapter: string
  citation: string
  href: string
}

const SOURCES: SourceEntry[] = [
  {
    chapter: 'Equal Earth',
    citation:
      'Šavrič, B., Patterson, T., & Jenny, B. (2019). “The Equal Earth map projection.” International Journal of Geographical Information Science 33(3), 454–465.',
    href: 'https://doi.org/10.1080/13658816.2018.1504949',
  },
  {
    chapter: 'Distortion',
    citation:
      'Snyder, J. P. (1987). Map Projections: A Working Manual. USGS Professional Paper 1395 — Tissot’s indicatrix, equations 4-1 to 4-12.',
    href: 'https://pubs.usgs.gov/pp/1395/report.pdf',
  },
  {
    chapter: 'AuthaGraph',
    citation:
      'Narukawa, H. (2022). “Formulation of AuthaGraph Map Projection and an Evaluation of its Distortion.” Map (Journal of the Japan Cartographers Association) 60(1), 1–16. The 2022 formulation approximates the original hand-built curved tetrahedron with four cones (<4% radial deviation).',
    href: 'https://doi.org/10.11212/jjca.60.1_1',
  },
  {
    chapter: 'Equal Earth',
    citation:
      'Kerkovits, K. (2021). “Image-Based Angular Distortion Metric for Comparing World Map Projections.” ISPRS IJGI 11(1):1 — Equal Earth RMSE 2.678°.',
    href: 'https://www.mdpi.com/2220-9964/11/1/1',
  },
  {
    chapter: 'Distortion',
    citation:
      'Goldberg, D. M., & Gott, J. R. (2007). “Flexion and skewness in map projections of the Earth.” Cartographica 42(4).',
    href: 'https://utpjournals.press/doi/10.3138/carto.42.4.297',
  },
  {
    chapter: 'Measuring areas',
    citation:
      'González, Á. (2010). “Measurement of areas on a sphere using Fibonacci and latitude–longitude lattices.” Mathematical Geosciences 42.',
    href: 'https://doi.org/10.1007/s11004-009-9257-x',
  },
  {
    chapter: 'Reference',
    citation:
      'PROJ coordinate transformation software — documentation and reference implementations.',
    href: 'https://proj.org/',
  },
  {
    chapter: 'Naming policy',
    citation:
      'UNGEGN (UN Group of Experts on Geographical Names) standardization process; IHO publication S-23 “Limits of Oceans and Seas” for marine features.',
    href: 'https://unstats.un.org/unsd/ungegn/',
  },
  {
    chapter: 'Geometry',
    citation: 'Natural Earth vector data (110m and 50m land, lakes, coastline) — public domain.',
    href: 'https://www.naturalearthdata.com/about/terms-of-use/',
  },
  {
    chapter: 'Why this matters',
    citation:
      'African Union Commission, September 4, 2026: statement welcoming the UN General Assembly resolution championed by Togo and encouraging maps that more accurately represent land areas.',
    href: 'https://www.au.int/en/pressreleases/20260904/communique-auc-chairperson-adoption-correct-map-resolution',
  },
]

/* ── Drawer component ───────────────────────────────────────────────── */

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

export default function Drawer() {
  const { open, closeDrawer } = useSourcesDrawer()
  const location = useLocation()
  const panelRef = useRef<HTMLDivElement>(null)
  const lastFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    lastFocused.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDrawer()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      // Focus trap
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      )
      if (items.length === 0) return
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      lastFocused.current?.focus?.()
    }
  }, [open, closeDrawer])

  return (
    <div
      className="fixed inset-0 z-[120]"
      style={{ pointerEvents: open ? 'auto' : 'none' }}
      aria-hidden={!open}
      inert={!open}
    >
      {/* scrim */}
      <div
        className="absolute inset-0 transition-opacity duration-ui ease-atlas"
        style={{
          background: 'rgba(14, 18, 22, 0.45)',
          opacity: open ? 1 : 0,
        }}
        onClick={closeDrawer}
      />
      {/* panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Sources and notes"
        className="absolute right-0 top-0 flex h-full w-full flex-col overflow-hidden transition-transform duration-ui ease-atlas"
        style={{
          maxWidth: '480px',
          background: 'var(--bg)',
          borderLeft: '1px solid var(--hair)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          visibility: open ? 'visible' : 'hidden',
          transitionProperty: 'transform, visibility',
        }}
      >
        <div
          className="flex shrink-0 items-center justify-between gap-4 px-6 py-4"
          style={{
            background: 'var(--bg)',
            borderBottom: '1px solid var(--hair)',
          }}
        >
          <p className="kicker">SOURCES &amp; NOTES</p>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Close sources and notes"
            className="min-h-11 px-3 font-ui text-caption uppercase tracking-[0.14em] transition-colors duration-micro ease-atlas"
            style={{ color: 'var(--fg-2)' }}
          >
            Close ✕
          </button>
        </div>
        <div
          tabIndex={0}
          role="region"
          aria-label="Source references"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6"
          style={{ scrollbarGutter: 'stable' }}
        >
          <ol className="flex flex-col gap-6">
            {SOURCES.map((s, i) => (
              <li key={i} className="flex gap-4">
                <span className="footnote-ref" aria-hidden>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0 break-words">
                  <p className="font-ui text-label uppercase" style={{ color: 'var(--gold)' }}>
                    {s.chapter}
                  </p>
                  <p className="mt-1 font-body text-body-sm" style={{ color: 'var(--fg-2)' }}>
                    {s.citation}
                  </p>
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block font-ui text-caption underline underline-offset-2"
                    style={{ color: 'var(--fg)' }}
                  >
                    {s.href.replace(/^https?:\/\//, '')}
                  </a>
                </div>
              </li>
            ))}
          </ol>
          <section className="mt-8 border-t pt-6" style={{ borderColor: 'var(--hair)' }}>
            <h2 className="kicker mb-3">
              <Link to={'/how-it-works' + location.search} onClick={closeDrawer}>
                How this was built →
              </Link>
            </h2>
            <p className="font-ui text-caption" style={{ color: 'var(--fg-2)' }}>
              Type: Source Serif 4, Inter, JetBrains Mono. Mathematics: KaTeX. Built with Three.js ·
              NumPy · Pyodide. Geography: Natural Earth 110m and 50m · NASA Blue Marble. AuthaGraph
              formulas after Narukawa (2022); Equal Earth after Šavrič, Patterson &amp; Jenny
              (2018).
            </p>
          </section>
          <details className="mt-6">
            <summary className="kicker cursor-pointer">About geographical names</summary>
            <p className="mt-3 font-body text-caption" style={{ color: 'var(--fg-2)' }}>
              This site uses internationally recognized geographical names as standardized through
              the UN Group of Experts on Geographical Names (UNGEGN) process and, for marine
              features, the International Hydrographic Organization. Names are drawn from a curated
              static dataset. No live map, geocoding, or naming API is consulted at runtime.
              Geometry: Natural Earth (public domain).
            </p>
          </details>
        </div>
      </div>
    </div>
  )
}
