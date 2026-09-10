import { useRef } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useAppearance } from '@/hooks/useAppearance'
import { useSourcesDrawer } from './Drawer'

export default function TopNav() {
  const { reducedMotion, toggle } = useReducedMotion()
  const { appearance, setAppearance } = useAppearance()
  const { openDrawer } = useSourcesDrawer()
  const settings = useRef<HTMLDetailsElement>(null)
  return (
    <header className="atlas-nav">
      <a href="/" className="atlas-wordmark" aria-label="Maps with Python, home">
        <span className="wordmark-symbol" aria-hidden="true">
          ◎
        </span>
        <span>Maps with Python</span>
      </a>
      <a
        className="pf-anaconda"
        href="https://www.anaconda.com/"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="By Anaconda (opens in a new tab)"
      >
        <span>BY</span>
        <img src="/anaconda-logo.png" width="510" height="88" alt="Anaconda" />
      </a>
      <nav className="atlas-nav-links" aria-label="Site">
        <button className="desktop-sources" onClick={() => openDrawer()}>
          Sources
        </button>
        <details
          className="site-settings"
          ref={settings}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && settings.current) {
              settings.current.open = false
              settings.current.querySelector('summary')?.focus()
            }
          }}
        >
          <summary aria-label="Appearance and settings">
            <span aria-hidden="true">◐</span>
            <span className="settings-text">Appearance</span>
          </summary>
          <div className="settings-panel">
            <label htmlFor="appearance">Appearance</label>
            <select
              id="appearance"
              value={appearance}
              onChange={(e) => setAppearance(e.target.value as 'system' | 'light' | 'dark')}
            >
              <option value="system">Use device setting</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
            <button aria-pressed={reducedMotion} onClick={toggle}>
              {reducedMotion ? 'Animations off' : 'Animations on'}
            </button>
            <button
              onClick={() => {
                if (settings.current) settings.current.open = false
                openDrawer()
              }}
            >
              Sources & credits ↗
            </button>
          </div>
        </details>
      </nav>
    </header>
  )
}
