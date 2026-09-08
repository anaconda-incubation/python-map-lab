import type { ReactNode, RefObject } from 'react'

/* ---------------- stage frame with a11y mirror ---------------- */

export interface StageFrameProps {
  hostRef: RefObject<HTMLDivElement | null>
  /** Live description of the current map state (projection, layers, t). */
  ariaLabel: string
  /** Pixel-free height, e.g. 'min(72vh, 640px)'. */
  height: string
  /** Set on drag stages (Move a Circle) so touch drags don't scroll the page. */
  touchNone?: boolean
  children?: ReactNode
  className?: string
}

/**
 * Framed stage block: the WebGL host (role="img" + live aria-label), a
 * visually-hidden state mirror, and an absolutely-positioned overlay slot for
 * SVG annotation layers.
 */
export function StageFrame({ hostRef, ariaLabel, height, touchNone, children, className }: StageFrameProps) {
  return (
    <figure
      className={className}
      style={{ margin: 0 }}
    >
      <div
        className="relative w-full overflow-hidden"
        style={{ height, border: '1px solid var(--hair)', background: 'var(--bg-2)' }}
      >
        <div
          ref={hostRef}
          role="img"
          aria-label={ariaLabel}
          className="absolute inset-0"
          style={touchNone ? { touchAction: 'none' } : undefined}
        />
        {children}
      </div>
      <span className="sr-only">{ariaLabel}</span>
    </figure>
  )
}

