import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useSourcesDrawer } from './Drawer'

export default function TopNav() {
  const { reducedMotion, toggle } = useReducedMotion()
  const { openDrawer } = useSourcesDrawer()
  return <header className="atlas-nav">
    <a href="/" className="atlas-wordmark"><span className="hidden sm:inline">Every flat map of our 3D world involves tradeoffs</span><span className="sm:hidden">A world of maps</span></a>
    <a className="pf-anaconda" href="https://www.anaconda.com/" target="_blank" rel="noopener noreferrer" aria-label="Anaconda (opens in a new tab)"><img src="/anaconda-logo.png" width="510" height="88" alt="Anaconda" /></a>
    <nav aria-label="Site" className="atlas-nav-links">
      <button onClick={() => openDrawer()}>Sources</button>
      <button aria-pressed={reducedMotion} aria-label={reducedMotion ? 'Reduced motion on; enable full motion' : 'Reduce motion'} onClick={toggle}>{reducedMotion ? 'Motion off' : 'Motion on'}</button>
    </nav>
  </header>
}
