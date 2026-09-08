import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

/**
 * Bottom-center toast notices (design.md §9): "Projection copied to URL",
 * "Python timed out", etc. Render the viewport once via <ToastViewport/>
 * (Layout already does) and fire notices from anywhere with useToast().
 */

export interface ToastItem {
  id: number
  message: string
  tone: 'default' | 'error'
}

interface ToastContextValue {
  toasts: ToastItem[]
  toast: (message: string, opts?: { tone?: ToastItem['tone']; durationMs?: number }) => void
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback<ToastContextValue['toast']>(
    (message, opts) => {
      const id = nextId.current++
      const tone = opts?.tone ?? 'default'
      const durationMs = opts?.durationMs ?? 3200
      setToasts((list) => [...list.slice(-3), { id, message, tone }])
      window.setTimeout(() => dismiss(id), durationMs)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ toasts, toast, dismiss }), [toasts, toast, dismiss])
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

// Public helper intentionally colocated with its provider or teaching component.
// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): Pick<ToastContextValue, 'toast' | 'dismiss'> {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return { toast: ctx.toast, dismiss: ctx.dismiss }
}

/** Internal: ToastViewport reads the full context. */
// eslint-disable-next-line react-refresh/only-export-components
export function useToastViewport(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('ToastViewport must be used inside <ToastProvider>')
  return ctx
}
