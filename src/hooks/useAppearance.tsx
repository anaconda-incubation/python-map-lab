import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
type Appearance = 'system' | 'light' | 'dark'
type Theme = 'paper' | 'atlas'
const AppearanceContext = createContext<{
  appearance: Appearance
  theme: Theme
  setAppearance: (value: Appearance) => void
} | null>(null)
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<Appearance>(() => {
    if (typeof window === 'undefined') return 'system'
    try {
      const saved = localStorage.getItem('maps-appearance')
      return saved === 'light' || saved === 'dark' ? saved : 'system'
    } catch {
      return 'system'
    }
  })
  const [systemDark, setSystemDark] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches,
  )
  const theme: Theme = (appearance === 'system' ? systemDark : appearance === 'dark')
    ? 'atlas'
    : 'paper'
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemDark(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('maps-appearance', appearance)
    } catch {
      /* Session choice still works. */
    }
  }, [appearance, theme])
  return (
    <AppearanceContext.Provider value={{ appearance, theme, setAppearance }}>
      {children}
    </AppearanceContext.Provider>
  )
}
// eslint-disable-next-line react-refresh/only-export-components
export function useAppearance() {
  const context = useContext(AppearanceContext)
  if (!context) throw new Error('AppearanceProvider is required')
  return context
}
