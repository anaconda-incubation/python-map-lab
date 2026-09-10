import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
await mkdir('.asset-build', { recursive: true })
await build({ entryPoints: ['scripts/generate-assets.ts'], outfile: '.asset-build/generator.mjs', bundle: true,
  format: 'esm', platform: 'node', target: 'node22', alias: { '@': './src' }, external: ['sharp'],
  plugins: [{ name: 'python-source', setup(b) {
    b.onResolve({ filter: /\.py\?raw$/ }, args => ({ path: fileURLToPath(new URL(args.path.replace('@/', '../src/').replace('?raw', ''), import.meta.url)), namespace: 'python' }))
    b.onLoad({ filter: /.*/, namespace: 'python' }, async args => ({ contents: await (await import('node:fs/promises')).readFile(args.path, 'utf8'), loader: 'text' }))
  }}],
})
const result = spawnSync(process.execPath, ['.asset-build/generator.mjs', ...process.argv.slice(2)], { stdio: 'inherit' })
process.exitCode = result.status ?? 1
