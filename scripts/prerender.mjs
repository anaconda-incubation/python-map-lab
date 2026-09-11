import { build } from 'esbuild'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
await build({
  entryPoints: ['src/entry-server.tsx'],
  outfile: '.asset-build/prerender.mjs',
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  target: 'node22',
  alias: { '@': './src' },
  external: ['react', 'react-dom/server', 'react-router'],
  define: { 'import.meta.env.VITE_HEAP_ENABLED': '"false"' },
  plugins: [
    {
      name: 'server-assets',
      setup(b) {
        b.onResolve({ filter: /\.css$/ }, (args) => ({ path: args.path, namespace: 'empty' }))
        b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '', loader: 'js' }))
        b.onResolve({ filter: /\.py\?raw$/ }, (args) => ({
          path: path.resolve(args.path.replace('@/', 'src/').replace('?raw', '')),
          namespace: 'python',
        }))
        b.onLoad({ filter: /.*/, namespace: 'python' }, async (args) => ({
          contents: await fs.readFile(args.path, 'utf8'),
          loader: 'text',
        }))
      },
    },
  ],
})
const { render } = await import(pathToFileURL(path.resolve('.asset-build/prerender.mjs')).href)
const html = await fs.readFile('dist/index.html', 'utf8')
await fs.writeFile(
  'dist/index.html',
  html.replace('<div id="root"></div>', `<div id="root">${render()}</div>`),
)
await fs.copyFile('environment.yml', 'dist/environment.yml')
await fs.mkdir('dist/how-it-works', { recursive: true })
await fs.writeFile('dist/how-it-works/index.html', html.replace('<div id="root"></div>', `<div id="root">${render('/how-it-works')}</div>`))
console.log('Prerendered the opening map and complete introductory reading.')
