import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { bakeFromFunction, bakeFromFunctionAsync } from '../bake'
import { buildGraticule, buildMasterGeometry, type GeoData } from '../geometry'
import { getProjection } from '../projections'

it('lets input tasks run while preparing detailed AuthaGraph, with identical geometry', async () => {
  const read = (name: string) => JSON.parse(readFileSync(join(__dirname, '../../../public/geo', name), 'utf8'))
  const geo: GeoData = { land: read('ne_50m_land.geojson'), lakes: read('ne_50m_lakes.geojson'), coastline: read('ne_50m_coastline.geojson') }
  const master = buildMasterGeometry(geo, 1)
  const grid = buildGraticule(10)
  const projection = getProjection('authagraph')
  const start = performance.now()
  const reference = bakeFromFunction('authagraph', undefined, projection.frame, master, grid)
  const synchronousMs = performance.now() - start
  let tasks = 0
  let last = performance.now()
  let largestGap = 0
  const heartbeat = setInterval(() => {
    const now = performance.now()
    largestGap = Math.max(largestGap, now - last)
    last = now
    tasks++
  }, 1)
  let actual
  try { actual = await bakeFromFunctionAsync('authagraph', undefined, projection.frame, master, grid) }
  finally { clearInterval(heartbeat) }
  expect(tasks).toBeGreaterThan(0)
  for (const key of ['landPositions', 'lakePositions', 'coastlinePositions', 'surfacePositions', 'tissotParams'] as const) {
    expect(Buffer.from(actual[key]!.buffer).equals(Buffer.from(reference[key]!.buffer))).toBe(true)
  }
  console.info(`50m AuthaGraph: synchronous block ${synchronousMs.toFixed(1)}ms; cooperative maximum task gap ${largestGap.toFixed(1)}ms; ${tasks} input opportunities`)
}, 15000)
