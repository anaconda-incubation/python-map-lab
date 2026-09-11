import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import Layout from '@/components/Layout'
import PythonFirst from '@/pages/PythonFirst'

const HowItWorks = lazy(() => import('@/pages/HowItWorks'))

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<PythonFirst />} />
          <Route
            path="/how-it-works"
            element={
              <Suspense fallback={<p>Opening the story…</p>}>
                <HowItWorks />
              </Suspense>
            }
          />
          <Route path="/story/*" element={<Navigate to="/" replace />} />
          <Route path="/lab/*" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
