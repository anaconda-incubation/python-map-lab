import fs from 'node:fs'
import crypto from 'node:crypto'
export const fingerprintFiles = [
  'scripts/generate-assets.ts',
  'scripts/project-assets.py',
  'src/pages/pythonLessons.ts',
  'src/pages/experimentRecipes.ts',
  'src/pages/workspaceState.ts',
  'src/python/centered.py',
  'src/python/mollweide-solution.py',
  'src/python/mollweide-scaffold.py',
  'src/python/authagraph_lesson.py',
  'src/projection/bake.ts',
  'src/projection/geometry.ts',
  'src/projection/surface.ts',
  'src/projection/distortion.ts',
  'src/projection/sample-layout.ts',
  'src/projection/packed.ts',
  'src/data/labels.json',
  ...['110m', '50m'].flatMap((scale) =>
    ['land', 'lakes', 'coastline'].map((kind) => `public/geo/ne_${scale}_${kind}.geojson`),
  ),
]
export function assetFingerprint() {
  const hash = crypto.createHash('sha256')
  for (const file of fingerprintFiles) hash.update(file).update(fs.readFileSync(file))
  return hash.digest('hex').slice(0, 16)
}
