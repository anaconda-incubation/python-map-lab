import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useSourcesDrawer } from './Drawer'

const CHAPTERS = [
  ['ch-00', 'The opening'], ['explore', 'Explore the maps'], ['python-discovery', 'Equation → Python → map'],
  ['ch-01', 'Why every flat map changes something'], ['ch-02', 'Measuring distortion'],
  ['ch-03', 'Mercator'], ['ch-04', 'Gall–Peters'], ['ch-05', 'Equal Earth'], ['ch-06', 'AuthaGraph'],
  ['ch-07', 'The morph studio'], ['ch-08', 'The scorecard'], ['ch-09', 'Compare regions'],
  ['ch-10', 'Move a circle'], ['ch-11', 'Inside the Python engine'], ['ch-12', 'The UN decision'],
  ['ch-13', 'Back to Earth'], ['ch-14', 'Sources & notes'],
]
export default function TopNav() {
  const { reducedMotion, toggle } = useReducedMotion()
  const { openDrawer } = useSourcesDrawer()
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('The opening')
  const dropdown = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const location = useLocation()
  useEffect(() => {
    const close = (e: PointerEvent) => { if (!dropdown.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [])
  useEffect(() => {
    if (!location.pathname.startsWith('/story')) return
    const observer = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) setCurrent(CHAPTERS.find(([id]) => id === e.target.id)?.[1] ?? 'The opening')
    }, { rootMargin: '-15% 0px -65% 0px' })
    CHAPTERS.forEach(([id]) => { const el = document.getElementById(id); if (el) observer.observe(el) })
    return () => observer.disconnect()
  }, [location.pathname])
  return <header className="atlas-nav">
    <a href="/" onClick={() => setOpen(false)} className="atlas-wordmark"><span className="hidden sm:inline">Every flat map is a choice</span><span className="sm:hidden">A world of maps</span></a>
    <span className="atlas-nav-current">{location.pathname === '/lab' ? 'Projection lab' : location.pathname === '/' ? 'Python field guide' : current}</span>
    <nav aria-label="Site" className="atlas-nav-links">
      <div ref={dropdown} onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus() } }} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false) }}>
        <button ref={trigger} aria-expanded={open} aria-controls="atlas-chapters" onClick={() => setOpen(v => !v)}>Visual essay <span aria-hidden>⌄</span></button>
        {open && <div id="atlas-chapters" className="atlas-chapter-menu"><p>Choose your own route</p>{CHAPTERS.map(([id, name], i) => <a key={id} href={`/story/#${id}`} onClick={() => setOpen(false)}><span>{String(i + 1).padStart(2, '0')}</span>{name}</a>)}<button onClick={() => { setOpen(false); openDrawer() }}>Open sources & notes ↗</button></div>}
      </div>
      <a href="/" className="python-nav-link">Python</a>
      <Link to="/lab" onClick={() => setOpen(false)}>Lab <span aria-hidden>↗</span></Link>
      <button className="hidden sm:block" onClick={() => openDrawer()}>Sources</button>
      <button aria-pressed={reducedMotion} aria-label={reducedMotion ? 'Reduced motion on; enable full motion' : 'Reduce motion'} onClick={toggle}>{reducedMotion ? 'Motion off' : 'Motion on'}</button>
    </nav>
  </header>
}
