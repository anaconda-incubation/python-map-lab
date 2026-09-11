import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { gzipSync } from 'node:zlib'
import sharp from 'sharp'
import { buildMasterGeometry, buildGraticule, type GeoData } from '../src/projection/geometry'
import { bakeFromFunction } from '../src/projection/bake'
import { collectSamples, sampledProjection } from '../src/projection/sample-layout'
import { pack, unpack } from '../src/projection/packed'
import mollweideSolution from '../src/python/mollweide-solution.py?raw'
import { challengeNotebook } from '../src/pages/challengeNotebook'
import { lessons } from '../src/pages/pythonLessons'
import { variants } from '../src/pages/experimentRecipes'
import { cities, presetCode, presetId, type Selection } from '../src/pages/workspaceState'
import { assetFingerprint } from './asset-fingerprint.mjs'
import { lessonNotebook } from '../src/pages/lessonNotebook'
import type { BakedProjection } from '../src/projection/types'
import type { PreparedGeometry } from '../src/projection/assets'

const root = process.cwd(),
  output = path.join(root, 'public/maps'),
  temporary = path.join(root, '.asset-build')
fs.mkdirSync(output, { recursive: true })
const selections: Selection[] = [
  { mode: 'experiments', id: 'mollweide', city: '' },
  ...lessons.map((l) => ({ mode: 'learn' as const, id: l.id, city: '' })),
  ...variants.map((_, i) => ({ mode: 'experiments' as const, id: 'experiment-' + i, city: '' })),
  ...lessons.flatMap((l) =>
    cities.map((city) => ({ mode: 'learn' as const, id: l.id, city: city.id })),
  ),
  ...['new-york', 'tokyo', 'north-pole'].map((city) => ({
    mode: 'experiments' as const,
    id: 'experiment-5',
    city,
  })),
]
const sources = selections.map((selection) => ({
  id: presetId(selection),
  code:
    selection.id === 'mollweide'
      ? mollweideSolution
      : (lessons.find((l) => l.id === selection.id)?.supportCode ?? '') +
        '\n' +
        presetCode(selection),
}))
const version = assetFingerprint()
const writeData = (name: string, value: unknown) => {
  const bytes = gzipSync(pack(value), { level: 9 })
  const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12)
  const filename = `${name}-${hash}.mapdata`
  fs.writeFileSync(path.join(output, filename), bytes)
  return { data: `/maps/${filename}`, bytes: bytes.length }
}

async function preview(b: BakedProjection) {
  const paths: string[] = []
  const pts = b.landPositions
  const project = (i: number) =>
    `${(400 + pts[i] * 350).toFixed(1)},${(250 - pts[i + 1] * 350).toFixed(1)}`
  for (let i = 0; i < pts.length; i += 9) {
    if (b.id === 'globe' && (pts[i + 2] + pts[i + 5] + pts[i + 8]) / 3 < 0.02) continue
    if (
      Math.abs(
        (pts[i + 3] - pts[i]) * (pts[i + 7] - pts[i + 1]) -
          (pts[i + 6] - pts[i]) * (pts[i + 4] - pts[i + 1]),
      ) < 1e-8
    )
      continue
    paths.push(`M${project(i)}L${project(i + 3)}L${project(i + 6)}Z`)
  }
  // Use the actual projected surface so ocean and land share the same cuts.
  const surface: string[] = [],
    s = b.surfacePositions!
  for (let i = 0; i < s.length; i += 9) {
    if (b.id === 'globe' && (s[i + 2] + s[i + 5] + s[i + 8]) / 3 < 0.01) continue
    if (
      Math.abs(
        (s[i + 3] - s[i]) * (s[i + 7] - s[i + 1]) - (s[i + 6] - s[i]) * (s[i + 4] - s[i + 1]),
      ) < 1e-8
    )
      continue
    const xy = (j: number) =>
      `${(400 + s[j] * 350).toFixed(1)},${(250 - s[j + 1] * 350).toFixed(1)}`
    surface.push(`M${xy(i)}L${xy(i + 3)}L${xy(i + 6)}Z`)
  }
  const height = b.id === 'globe' ? 800 : 550
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${250 - height / 2} 800 ${height}"><style>:root{--sea:#dce8e0;--land:#789879}@media(prefers-color-scheme:dark){:root{--sea:#242747;--land:#c9ddad}}</style><path fill="#d3e1db" stroke="#d3e1db" stroke-width=".4" d="${surface.join('')}"/><path fill="#7d9b76" stroke="#7d9b76" stroke-width=".3" d="${paths.join('')}"/></svg>`
  const hash = crypto.createHash('sha256').update(svg).digest('hex').slice(0, 12)
  const filename = `${b.id}-${hash}.webp`
  const bytes = await sharp(Buffer.from(svg))
    .resize({ width: 960 })
    .webp({ quality: 82 })
    .toBuffer()
  fs.writeFileSync(path.join(output, filename), bytes)
  return `/maps/${filename}`
}

if (process.argv[2] === 'prepare') {
  fs.writeFileSync(path.join(temporary, 'sources.json'), JSON.stringify(sources))
  for (const quality of ['overview', 'detail'] as const) {
    const scale = quality === 'overview' ? '110m' : '50m'
    const geo = Object.fromEntries(
      ['land', 'lakes', 'coastline'].map((kind) => [
        kind,
        JSON.parse(fs.readFileSync(`public/geo/ne_${scale}_${kind}.geojson`, 'utf8')),
      ]),
    ) as unknown as GeoData
    const master = buildMasterGeometry(geo, 2, quality === 'overview' ? 6 : 3)
    const graticule = buildGraticule(10)
    const samples = collectSamples(master, graticule)
    fs.writeFileSync(path.join(temporary, `${quality}.bin`), pack({ master, graticule, samples }))
    fs.writeFileSync(path.join(temporary, `${quality}-lon.bin`), new Uint8Array(samples.lon.buffer))
    fs.writeFileSync(path.join(temporary, `${quality}-lat.bin`), new Uint8Array(samples.lat.buffer))
    console.log(
      `${quality}: ${master.landTri.lon.length} land vertices; ${samples.lon.length} exact Python samples`,
    )
  }
} else if (process.argv[2] === 'finish') {
  const manifest = { version, qualities: {} as Record<string, unknown> }
  for (const quality of ['overview', 'detail'] as const) {
    const data = fs.readFileSync(path.join(temporary, `${quality}.bin`))
    const prepared = unpack<PreparedGeometry>(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    )
    const { master, graticule, samples } = prepared
    const geometry = writeData(`${quality}-geometry`, prepared)
    const presets: Record<string, unknown> = {}
    const globe = bakeFromFunction(
      'globe',
      undefined,
      { halfWidth: 1, halfHeight: 1 },
      master,
      graticule,
      { tissotStepDeg: 30 },
    )
    presets.globe = {
      ...writeData(`${quality}-globe`, globe),
      ...(quality === 'overview' ? { preview: await preview(globe) } : {}),
    }
    for (const source of sources) {
      const read = (axis: string) => {
        const bytes = fs.readFileSync(path.join(temporary, `${quality}-${source.id}-${axis}.bin`))
        return new Float64Array(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        )
      }
      const result = { x: read('x'), y: read('y'), warnings: [], stdout: '' }
      const p = sampledProjection(samples, result)
      if (!p.hasArea) throw new Error(`Degenerate preset: ${source.id}`)
      const baked = bakeFromFunction(source.id, p.fn, p.frame, master, graticule, {
        tissotStepDeg: 30,
      })
      presets[source.id] = {
        ...writeData(`${quality}-${source.id}`, baked),
        ...(quality === 'overview' ? { preview: await preview(baked) } : {}),
      }
      console.log(`${quality}/${source.id}: ${p.invalidCount} intentionally omitted samples`)
    }
    manifest.qualities[quality] = { geometry, presets }
  }
  fs.writeFileSync(
    'src/projection/generated-manifest.json',
    JSON.stringify(manifest, null, 2) + '\n',
  )
  const referenced = new Set<string>()
  for (const group of Object.values(manifest.qualities) as Array<{
    geometry: { data: string }
    presets: Record<string, { data: string; preview?: string }>
  }>) {
    for (const asset of [group.geometry, ...Object.values(group.presets)]) {
      referenced.add(path.basename(asset.data))
      if ('preview' in asset && asset.preview) referenced.add(path.basename(asset.preview))
    }
  }
  for (const name of fs.readdirSync(output))
    if (!referenced.has(name)) fs.unlinkSync(path.join(output, name))
  await sharp('public/textures/earth-blue-marble.jpg')
    .resize(1024)
    .webp({ quality: 80 })
    .toFile('public/textures/earth-overview.webp')
  await sharp('public/textures/earth-blue-marble.jpg')
    .resize(2048)
    .webp({ quality: 85 })
    .toFile('public/textures/earth-detail.webp')
  fs.mkdirSync('notebook-checks', { recursive: true })
  fs.mkdirSync('public/notebooks', { recursive: true })
  const land = JSON.parse(fs.readFileSync('public/geo/ne_110m_land.geojson', 'utf8'))
  for (const lesson of lessons) {
    const notebook = JSON.stringify(
      lessonNotebook(lesson, (lesson.supportCode ?? '') + '\n' + lesson.code, land),
      null,
      2,
    )
    const checkPath = 'notebook-checks/' + lesson.id + '-lesson.ipynb'
    const cellSources = (text: string) =>
      JSON.parse(text).cells.map((c: { id: string; source: string[] }) => [c.id, c.source])
    if (
      !fs.existsSync(checkPath) ||
      JSON.stringify(cellSources(fs.readFileSync(checkPath, 'utf8'))) !==
        JSON.stringify(cellSources(notebook))
    )
      fs.writeFileSync(checkPath, notebook)
    fs.writeFileSync('public/notebooks/' + lesson.id + '-lesson.ipynb', notebook)
  }
  for (const kind of ['exercise', 'solution'] as const) {
    const notebook = JSON.stringify(challengeNotebook(kind, land), null, 2)
    fs.writeFileSync('public/notebooks/mollweide-' + kind + '.ipynb', notebook)
    const check = 'notebook-checks/mollweide-' + kind + '.ipynb'
    if (
      !fs.existsSync(check) ||
      JSON.stringify(
        JSON.parse(fs.readFileSync(check, 'utf8')).cells.map((c: { source: string[] }) =>
          c.source.join(''),
        ),
      ) !==
        JSON.stringify(
          JSON.parse(notebook).cells.map((c: { source: string[] }) => c.source.join('')),
        )
    )
      fs.writeFileSync(check, notebook)
  }
  console.log(`Generated maps from canonical Python. Source version ${version}`)
} else {
  throw new Error(
    'Choose prepare or finish. Execute scripts/project-assets.py between these steps.',
  )
}
