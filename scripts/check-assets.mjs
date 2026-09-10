import fs from 'node:fs'
import { assetFingerprint } from './asset-fingerprint.mjs'
const manifest = JSON.parse(fs.readFileSync('src/projection/generated-manifest.json', 'utf8'))
if (manifest.version !== assetFingerprint())
  throw new Error('Generated maps are stale. Follow docs/GENERATED_MAPS.md before building.')
let max = 0,
  count = 0
for (const quality of Object.values(manifest.qualities))
  for (const asset of [quality.geometry, ...Object.values(quality.presets)]) {
    const bytes = fs.statSync('public' + asset.data).size
    if (bytes !== asset.bytes || bytes > 24 * 1024 * 1024)
      throw new Error('Invalid or oversized map asset: ' + asset.data)
    if (asset.preview) fs.accessSync('public' + asset.preview)
    count++
    max = Math.max(max, bytes)
  }
console.log(`${count} versioned map assets verified; largest ${(max / 1024 / 1024).toFixed(1)} MB.`)
