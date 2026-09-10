import { bakeFromFunction } from './bake'
import type { MasterGeometry, GraticuleData } from './geometry'
import type { RunProjectionResult } from './worker-client'

export type SamplePoints = { lon: Float64Array; lat: Float64Array }

/** Numeric nested maps avoid allocating a string on every projected vertex. */
export function sampleIndex(points: SamplePoints) {
  const rows = new Map<number, Map<number, number>>()
  for (let i = 0; i < points.lon.length; i++) {
    let row = rows.get(points.lon[i])
    if (!row) rows.set(points.lon[i], (row = new Map()))
    row.set(points.lat[i], i)
  }
  return { get: (lon: number, lat: number) => rows.get(lon)?.get(lat) }
}

/** Build-time collection includes all derivative probes on both sides of cuts. */
export function collectSamples(master: MasterGeometry, graticule: GraticuleData): SamplePoints {
  const coordinates = new Map<number, Set<number>>()
  const lon: number[] = [],
    lat: number[] = []
  bakeFromFunction(
    'sample-layout',
    (lo, la) => {
      let row = coordinates.get(lo)
      if (!row) coordinates.set(lo, (row = new Set()))
      if (!row.has(la)) {
        row.add(la)
        lon.push(lo)
        lat.push(la)
      }
      return { x: lo * 0.001, y: la * 0.001 }
    },
    { halfWidth: 1, halfHeight: 1 },
    master,
    graticule,
    { tissotStepDeg: 30 },
  )
  return { lon: new Float64Array(lon), lat: new Float64Array(lat) }
}

export function sampledProjection(
  points: SamplePoints,
  result: RunProjectionResult,
  index = sampleIndex(points),
) {
  if (result.x.length !== points.lon.length || result.y.length !== points.lon.length)
    throw new Error('Python must return one x and y coordinate for every sampled location.')
  let halfWidth = 0,
    halfHeight = 0,
    invalidCount = 0
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity
  for (let i = 0; i < result.x.length; i++) {
    const x = result.x[i],
      y = result.y[i]
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      invalidCount++
      continue
    }
    halfWidth = Math.max(halfWidth, Math.abs(x))
    halfHeight = Math.max(halfHeight, Math.abs(y))
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  return {
    invalidCount,
    hasArea: maxX > minX && maxY > minY,
    frame: { halfWidth, halfHeight },
    fn: (lon: number, lat: number) => {
      const i = index.get(lon, lat)
      if (i === undefined) throw new Error('Map samples are out of date. Reload to update them.')
      return { x: result.x[i], y: result.y[i] }
    },
  }
}
