import { useEffect } from 'react'

export type Theme = 'paper' | 'atlas'

/**
 * Theme crossfade mechanism (design.md §3): sets `data-theme` on `<html>`;
 * index.css transitions background/color with `ease-atlas` 600ms so the page
 * crossfades rather than hard-cutting. Restores the previous theme on unmount.
 *
 * Usage: `useTheme('atlas')` at the top of a page/takeover component.
 */
export function useTheme(theme: Theme) {
  useEffect(() => {
    const root = document.documentElement
    const previous = (root.dataset.theme as Theme | undefined) ?? 'paper'
    root.dataset.theme = theme
    return () => {
      root.dataset.theme = previous
    }
  }, [theme])
}

/** Imperative setter for scroll-driven chapter boundaries. */
export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
}
