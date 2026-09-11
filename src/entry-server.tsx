import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import Layout from './components/Layout'
import HowItWorks from './pages/HowItWorks'
import PythonFirst from './pages/PythonFirst'
export function render(url = '/') {
  return renderToString(
    <StaticRouter location={url}>
      <Layout>{url === '/how-it-works' ? <HowItWorks /> : <PythonFirst />}</Layout>
    </StaticRouter>,
  )
}
