import { spherePoint } from './projections'

/** Seam-split grid: land and ocean share the same geographic deformation. */
export function surfaceGrid(step = 2) {
  const coordinates: number[] = []
  for (let lat = -90; lat < 90; lat += step) for (let lon = -180; lon < 180; lon += step) {
    coordinates.push(lon, lat, lon + step, lat, lon + step, lat + step,
      lon, lat, lon + step, lat + step, lon, lat + step)
  }
  const count = coordinates.length / 2
  const uv = new Float32Array(count * 2), sphere = new Float32Array(count * 3), stagger = new Float32Array(count)
  for (let i = 0; i < coordinates.length; i += 2) {
    const n = i / 2, lon = coordinates[i], lat = coordinates[i + 1]
    uv[i] = (lon + 180) / 360; uv[i + 1] = (lat + 90) / 180
    const p = spherePoint(lon * Math.PI / 180, lat * Math.PI / 180)
    sphere.set([p.x, p.y, p.z], n * 3)
    stagger[n] = 1 - Math.abs(lon) / 180
  }
  return { coordinates, uv, sphere, stagger }
}
export const SURFACE_GRID = surfaceGrid()
export function* surfacePositionsWork(globe: boolean, project: ((lon: number, lat: number) => { x: number; y: number }) | null, scale: number): Generator<void, Float32Array> {
  if (globe) return SURFACE_GRID.sphere.map(v => v * 0.986)
  const out = new Float32Array(SURFACE_GRID.sphere.length)
  for (let i = 0; i < SURFACE_GRID.coordinates.length; i += 2) {
    if (i % 256 === 0) yield
    const lon = SURFACE_GRID.coordinates[i] * Math.PI / 180, lat = SURFACE_GRID.coordinates[i + 1] * Math.PI / 180
    const p = project?.(lon, lat) ?? { x: lon, y: lat }
    out.set([p.x * scale, p.y * scale, -0.014], i / 2 * 3)
  }
  for (let i = 0; i < out.length; i += 9) {
    const good = Array.from(out.subarray(i, i + 9)).every(Number.isFinite) && [0, 3, 6].every((k, j) => {
      const q = ((j + 1) % 3) * 3
      return Math.hypot(out[i + k] - out[i + q], out[i + k + 1] - out[i + q + 1]) < 0.4
    })
    if (!good) for (let k = 0; k < 9; k += 3) out.set([0, 0, -0.02], i + k)
  }
  return out
}
export function surfacePositions(...args: Parameters<typeof surfacePositionsWork>): Float32Array {
  const work = surfacePositionsWork(...args)
  for (;;) { const step = work.next(); if (step.done) return step.value }
}
export function morphProgress(t: number, lon: number) {
  const stagger = 1 - Math.min(1, Math.abs(lon) / Math.PI)
  const p = Math.max(0, Math.min(1, (t - stagger * 0.18) / 0.82))
  return p * p * (3 - 2 * p)
}
