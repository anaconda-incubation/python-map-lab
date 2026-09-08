import { Link, useLocation } from 'react-router'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useSourcesDrawer } from './Drawer'

export default function TopNav() {
  const { reducedMotion, toggle } = useReducedMotion()
  const { openDrawer } = useSourcesDrawer()
  const location = useLocation()
  return <header className="atlas-nav">
    <a href="/" className="atlas-wordmark"><span className="hidden sm:inline">Every flat map is a choice</span><span className="sm:hidden">A world of maps</span></a>
    <a className="pf-anaconda" href="https://www.anaconda.com/" target="_blank" rel="noopener noreferrer">By Anaconda ↗</a>
    <span className="atlas-nav-current">{location.pathname === '/lab' ? 'Projection lab' : 'Python field guide'}</span>
    <nav aria-label="Site" className="atlas-nav-links">
      <a href="/" className="python-nav-link">Python</a>
      <a href="/#experiments">Experiments</a>
      <Link to="/lab">Lab <span aria-hidden>↗</span></Link>
      <button className="hidden sm:block" onClick={() => openDrawer()}>Sources</button>
      <button aria-pressed={reducedMotion} aria-label={reducedMotion ? 'Reduced motion on; enable full motion' : 'Reduce motion'} onClick={toggle}>{reducedMotion ? 'Motion off' : 'Motion on'}</button>
    </nav>
  </header>
}
