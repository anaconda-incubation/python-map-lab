import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// No StrictMode: the MapStage canvas effect must not run twice.
createRoot(document.getElementById('root')!).render(<App />)
