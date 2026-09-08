import { useEffect, useState } from 'react'
import { useToastViewport, type ToastItem } from '@/hooks/useToast'

/**
 * Bottom-center toast viewport (design.md §9). Mounted once by Layout inside
 * <ToastProvider>. 280ms ease-atlas entrance; auto-dismiss handled by the
 * provider.
 */
export default function ToastViewport() {
  const { toasts, dismiss } = useToastViewport()
  return (
    <div
      className="pointer-events-none fixed bottom-6 left-1/2 z-toast flex -translate-x-1/2 flex-col items-center gap-2"
      aria-live="polite"
      role="status"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  )
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <button
      type="button"
      onClick={onDismiss}
      className="pointer-events-auto font-ui text-caption transition-all duration-[280ms] ease-atlas"
      style={{
        transform: visible ? 'translateY(0)' : 'translateY(12px)',
        opacity: visible ? 1 : 0,
        background: item.tone === 'error' ? 'var(--accent)' : 'var(--fg)',
        color: 'var(--bg)',
        padding: '10px 18px',
        border: '1px solid var(--hair)',
        maxWidth: 'min(90vw, 480px)',
      }}
    >
      {item.message}
    </button>
  )
}
