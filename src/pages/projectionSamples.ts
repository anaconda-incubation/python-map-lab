import { bakeCustomProjection } from '@/projection/bake'
import type { RunProjectionResult } from '@/projection/worker-client'

// Sample exactly where the renderer asks, including finite-difference probes.
// A regular lon/lat grid would interpolate across the shifted map cut.
let pending: ReturnType<typeof collect> | undefined
async function collect() {
  const indices = new Map<string, number>()
  const lon: number[] = [],
    lat: number[] = []
  await bakeCustomProjection(
    'python-sample-layout',
    (lo, la) => {
      const key = `${lo},${la}`
      if (!indices.has(key)) {
        indices.set(key, lon.length)
        lon.push(lo)
        lat.push(la)
      }
      // A tiny continuous map keeps every triangle valid during collection,
      // so derivatives on both sides of every possible future cut are sampled.
      return { x: lo * 0.001, y: la * 0.001 }
    },
    { halfWidth: 1, halfHeight: 1 },
    { tissotStepDeg: 30 },
  )
  return { lon: new Float64Array(lon), lat: new Float64Array(lat), indices }
}
export function getProjectionSamples() {
  return (pending ??= collect().catch((error) => {
    pending = undefined
    throw error
  }))
}

/** Preserve discontinuities: never interpolate between opposite map edges. */
export function projectionFromSamples(
  samples: Awaited<ReturnType<typeof getProjectionSamples>>,
  result: RunProjectionResult,
) {
  if (
    result.x.length !== samples.lon.length ||
    result.y.length !== samples.lon.length
  ) {
    throw new Error(
      'Python must return one x and y coordinate for every sampled location.',
    )
  }
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
      const i = samples.indices.get(`${lon},${lat}`)
      if (i === undefined) throw new Error('Missing renderer sample')
      return { x: result.x[i], y: result.y[i] }
    },
  }
}
