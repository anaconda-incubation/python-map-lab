import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import Layout from '@/components/Layout'
import PythonFirst from '@/pages/PythonFirst'
import Lab from '@/pages/Lab'

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<PythonFirst />} />
          <Route path="/story/*" element={<Navigate to="/" replace />} />
          <Route path="/lab" element={<Lab />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
