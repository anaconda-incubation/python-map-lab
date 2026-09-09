import { useLayoutEffect, useRef, useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { scrollPageTo } from '@/utils/pageScroll'

// Keep the same map and editor mounted; only their layout changes.
// eslint-disable-next-line react-refresh/only-export-components
export function useExpandedMap() {
  const [expanded, setExpanded] = useState(false)
  const columnsRef = useRef<HTMLDivElement>(null)
  const changed = useRef(false)
  const { reducedMotion } = useReducedMotion()

  useLayoutEffect(() => {
    if (!changed.current || !columnsRef.current) return
    changed.current = false
    const columns = columnsRef.current
    const toolbar = columns.closest('section')?.querySelector('.pf-choices')
    const modes = document.querySelector('.pf-mode-switch')
    const stickyHeight = (el: Element | null | undefined) =>
      el && getComputedStyle(el).position === 'sticky' ? el.clientHeight : 0
    const navHeight = document.querySelector('.atlas-nav')?.clientHeight ?? 56
    const top =
      columns.getBoundingClientRect().top +
      window.scrollY -
      navHeight -
      stickyHeight(modes) -
      stickyHeight(toolbar)
    if (reducedMotion) window.scrollTo({ top, behavior: 'instant' })
    else scrollPageTo(top)
  }, [expanded, reducedMotion])

  return {
    expanded,
    columnsRef,
    toggleExpanded: () => {
      changed.current = true
      setExpanded((value) => !value)
    },
  }
}

export default function MapExpandButton({
  expanded,
  onClick,
  controls,
}: {
  expanded: boolean
  onClick: () => void
  controls: string
}) {
  const label = expanded ? 'Return to split view' : 'Expand map'
  return (
    <button
      className="pf-expand-map"
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      aria-controls={controls}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path
          d={
            expanded
              ? 'M3 9h6V3M21 15h-6v6M9 9 3 3M15 15l6 6'
              : 'M9 3H3v6M15 21h6v-6M3 3l6 6M21 21l-6-6'
          }
        />
      </svg>
    </button>
  )
}
