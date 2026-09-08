import { BrowserRouter, Routes, Route } from 'react-router'
import Layout from '@/components/Layout'
import Home from '@/pages/Home'
import PythonFirst from '@/pages/PythonFirst'
import Lab from '@/pages/Lab'

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<PythonFirst />} />
          <Route path="/story/*" element={<Home />} />
          <Route path="/lab" element={<Lab />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
