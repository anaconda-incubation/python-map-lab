import type { ReactNode } from 'react'
import { MotionProvider } from '@/hooks/useReducedMotion'
import { AppearanceProvider } from '@/hooks/useAppearance'
import { ToastProvider } from '@/hooks/useToast'
import ToastViewport from './Toast'
import Drawer, { SourcesDrawerProvider } from './Drawer'
import TopNav from './TopNav'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AppearanceProvider>
      <MotionProvider>
        <ToastProvider>
          <SourcesDrawerProvider>
            <a
              href="#map-workspace"
              className="skip-link"
              onClick={(event) => {
                event.preventDefault()
                const map = document.getElementById('map-workspace')
                map?.focus({ preventScroll: true })
                map?.scrollIntoView({ block: 'start', behavior: 'instant' })
              }}
            >
              Skip to the map
            </a>
            <TopNav />
            <main id="main">{children}</main>
            <footer className="site-footer">
              <span>Every flat map of our 3D world involves tradeoffs.</span>
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
