import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import Layout from './components/Layout'
import PythonFirst from './pages/PythonFirst'
export function render() {
  return renderToString(
    <StaticRouter location="/">
      <Layout>
        <PythonFirst />
      </Layout>
    </StaticRouter>,
  )
}
