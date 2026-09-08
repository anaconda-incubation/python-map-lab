import type Lenis from 'lenis'

let activeScroller: Lenis | null = null
export function registerPageScroller(scroller: Lenis | null) { activeScroller = scroller }

/** Programmatic navigation shares the same controller as wheel/touch scrolling. */
export function scrollPageTo(top: number) {
  if (activeScroller) activeScroller.scrollTo(top, { duration: .8 })
  else window.scrollTo({ top, behavior: 'smooth' })
}
