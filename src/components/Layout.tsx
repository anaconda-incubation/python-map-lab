import { Link, useLocation } from 'react-router'
import type { ReactNode } from 'react'
import { MotionProvider } from '@/hooks/useReducedMotion'
import { AppearanceProvider } from '@/hooks/useAppearance'
import { ToastProvider } from '@/hooks/useToast'
import ToastViewport from './Toast'
import Drawer, { SourcesDrawerProvider } from './Drawer'
import TopNav from './TopNav'

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation()
  const colophon = location.pathname === '/how-it-works'
  return (
    <AppearanceProvider>
      <MotionProvider>
        <ToastProvider>
          <SourcesDrawerProvider>
            <a
              href={colophon ? '#colophon-title' : '#map-workspace'}
              className="skip-link"
              onClick={(event) => {
                event.preventDefault()
                const map = document.getElementById(colophon ? 'colophon-title' : 'map-workspace')
                map?.focus({ preventScroll: true })
                map?.scrollIntoView({ block: 'start', behavior: 'instant' })
              }}
            >
              {colophon ? 'Skip to content' : 'Skip to the map'}
            </a>
            <TopNav />
            <main id="main">{children}</main>
            <footer className="site-footer">
              <span>Every flat map of our 3D world involves tradeoffs.</span>
              <Link to={'/how-it-works' + location.search}>How this was built →</Link>
              <small>© 2026 Anaconda Inc. All rights reserved.</small>
            </footer>
            <Drawer />
            <ToastViewport />
          </SourcesDrawerProvider>
        </ToastProvider>
      </MotionProvider>
    </AppearanceProvider>
  )
}
