import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/**
 * Reduced-motion state (design.md §6, §10).
 *
 * Effective value = manual override (nav toggle, persisted to localStorage)
 * falling back to the `prefers-reduced-motion` media query. Mirrored onto
 * `<html data-motion="reduced|full">` so CSS can react too. Projection animations read this via `useReducedMotion()`. Native scrolling
 * is independent of this preference.
 */

const STORAGE_KEY = 'efmc-motion-override'

type Override = 'reduced' | 'full' | null

interface MotionContextValue {
  /** Effective reduced-motion state (override ?? media query). */
  reducedMotion: boolean
  /** The manual override, if any. */
  override: Override
  /** Toggle the manual override between 'reduced' and 'full'. */
  toggle: () => void
  /** Set or clear the manual override explicitly. */
  setOverride: (value: Override) => void
}

const MotionContext = createContext<MotionContextValue | null>(null)

function readOverride(): Override {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    return v === 'reduced' || v === 'full' ? v : null
  } catch {
    return null
  }
}

export function MotionProvider({ children }: { children: ReactNode }) {
  const [override, setOverrideState] = useState<Override>(() =>
    typeof window === 'undefined' ? null : readOverride(),
  )
  const [mediaReduced, setMediaReduced] = useState<boolean>(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (e: MediaQueryListEvent) => setMediaReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const setOverride = useCallback((value: Override) => {
    setOverrideState(value)
    try {
      if (value === null) window.localStorage.removeItem(STORAGE_KEY)
      else window.localStorage.setItem(STORAGE_KEY, value)
    } catch {
      /* storage unavailable — override still applies for the session */
    }
  }, [])

  const toggle = useCallback(() => {
    setOverrideState((prev) => {
      const effective = prev === null ? mediaReduced : prev === 'reduced'
      const next: Override = effective ? 'full' : 'reduced'
      try {
        window.localStorage.setItem(STORAGE_KEY, next)
      } catch {
        /* ignore */
      }
      return next
    })
  }, [mediaReduced])

  const reducedMotion = override === null ? mediaReduced : override === 'reduced'

  useEffect(() => {
    document.documentElement.dataset.motion = reducedMotion ? 'reduced' : 'full'
  }, [reducedMotion])

  const value = useMemo(
    () => ({ reducedMotion, override, toggle, setOverride }),
    [reducedMotion, override, toggle, setOverride],
  )

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>
}

// Public helper intentionally colocated with its provider or teaching component.
// eslint-disable-next-line react-refresh/only-export-components
export function useReducedMotion(): MotionContextValue {
  const ctx = useContext(MotionContext)
  if (!ctx) throw new Error('useReducedMotion must be used inside <MotionProvider>')
  return ctx
}
