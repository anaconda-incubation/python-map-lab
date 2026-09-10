import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installOutboundTracking } from './analytics/events'

const removeTracking = installOutboundTracking()
if (import.meta.hot) import.meta.hot.dispose(removeTracking)

// No StrictMode: the MapStage canvas effect must not run twice.
createRoot(document.getElementById('root')!).render(<App />)
