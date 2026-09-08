import { registerPageScroller } from '@/utils/pageScroll'
import { useEffect, type ReactNode } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { MotionProvider, useReducedMotion } from '@/hooks/useReducedMotion'
import { ToastProvider } from '@/hooks/useToast'
import ToastViewport from '@/components/Toast'
import { SourcesDrawerProvider } from '@/components/Drawer'
import Drawer from '@/components/Drawer'
import TopNav from '@/components/TopNav'
import Footer from '@/components/Footer'

gsap.registerPlugin(ScrollTrigger)

/**
 * Layout (children pattern — design contract with App.tsx).
 * Owns: MotionProvider, ToastProvider, SourcesDrawerProvider, TopNav, the
 * fixed-nav content offset, Footer, and the global Lenis + GSAP ScrollTrigger
 * wiring (disabled under reduced motion, §6).
 */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <MotionProvider>
      <ToastProvider>
        <SourcesDrawerProvider>
          <ScrollRoot>{children}</ScrollRoot>
          <Drawer />
          <ToastViewport />
        </SourcesDrawerProvider>
      </ToastProvider>
    </MotionProvider>
  )
}

function ScrollRoot({ children }: { children: ReactNode }) {
  const { reducedMotion } = useReducedMotion()

  useEffect(() => {
    if (reducedMotion) return
    const lenis = new Lenis({ lerp: 0.09, anchors: { offset: -72 } })

    registerPageScroller(lenis)
    lenis.on('scroll', ScrollTrigger.update)
    let refreshTimer: ReturnType<typeof setTimeout> | undefined
    let previousHeight = 0
    const observer = new ResizeObserver(entries => {
      const height = entries[0]?.contentRect.height ?? 0
      if (Math.abs(height - previousHeight) < 1) return
      previousHeight = height
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => { lenis.resize(); ScrollTrigger.refresh() }, 160)
    })
    observer.observe(document.body)
    const tick = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)
    return () => {
      observer.disconnect()
      clearTimeout(refreshTimer)
      gsap.ticker.remove(tick)
      registerPageScroller(null)
      lenis.destroy()
    }
  }, [reducedMotion])

  return (
    <div className="relative min-h-[100dvh]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-toast focus:bg-bg focus:px-3 focus:py-2 focus:font-ui focus:text-caption"
      >
        Skip to content
      </a>
      <TopNav />
      {/* Fixed 56px nav — Layout owns the offset, pages never add it */}
      <main id="main" style={{ paddingTop: 'var(--nav-h)' }}>
        {children}
      </main>
      <Footer />
    </div>
  )
}
