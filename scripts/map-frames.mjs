import fs from 'node:fs'
import { gunzipSync } from 'node:zlib'

// Layout metadata comes from the same baked bounds as the interactive renderer.
// Keeping it in the page shell avoids a height jump while map data downloads.
const manifest = JSON.parse(fs.readFileSync('src/projection/generated-manifest.json', 'utf8'))
const ratios = {}
for (const [id, asset] of Object.entries(manifest.qualities.overview.presets)) {
  const buffer = gunzipSync(fs.readFileSync(`public${asset.data}`))
  const header = JSON.parse(buffer.toString('utf8', 4, 4 + buffer.readUInt32LE(0)))
  const { minX, maxX, minY, maxY } = header.bounds
  const ratio = (maxX - minX) / (maxY - minY)
  if (!Number.isFinite(ratio) || ratio <= 0) throw new Error(`Invalid map bounds: ${id}`)
  ratios[id] = ratio
}
fs.writeFileSync('src/projection/generated-frames.json', JSON.stringify(ratios, null, 2) + '\n')
