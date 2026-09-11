import type { RunProjectionResult } from '@/projection/worker-client'

// Spherical reference, independently expressed as a scalar bracketed solve.
// Equations: https://proj.org/en/stable/operations/projections/moll.html
function reference(lon: number, lat: number) {
  if (Math.abs(lat) >= Math.PI / 2 - 1e-12) return [0, Math.sign(lat) * Math.SQRT2]
  let low = -Math.PI / 2,
    high = Math.PI / 2
  for (let i = 0; i < 55; i++) {
    const angle = (low + high) / 2
    if (2 * angle + Math.sin(2 * angle) < Math.PI * Math.sin(lat)) low = angle
    else high = angle
  }
  const theta = (low + high) / 2
  const lambda = ((((lon + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI
  return [((2 * Math.SQRT2) / Math.PI) * lambda * Math.cos(theta), Math.SQRT2 * Math.sin(theta)]
}
const points: [number, number][] = []
for (const lat of [-90, -70, -40, 0, 40, 70, 90])
  for (const lon of [-180, -120, -60, 0, 60, 120, 179])
    points.push([(lon * Math.PI) / 180, (lat * Math.PI) / 180])
const coordinateCount = points.length
const step = 1e-5
const areaCenters = [-0.9, 0, 0.9].flatMap((lat) => [-1.4, 0.5].map((lon) => [lon, lat]))
for (const [lon, lat] of areaCenters)
  points.push([lon + step, lat], [lon - step, lat], [lon, lat + step], [lon, lat - step])
export const challengeSamples = {
  lon: Float64Array.from(points, (p) => p[0]),
  lat: Float64Array.from(points, (p) => p[1]),
}
export function checkMollweide(result: RunProjectionResult): string {
  const { x, y } = result
  if (x.length !== points.length || y.length !== points.length)
    throw new Error('Return one x and one y for every input coordinate.')
  if (![...x, ...y].every(Number.isFinite))
    throw new Error('Some outputs are not finite. Check the poles and your angle solver.')
  const expected = points.slice(0, coordinateCount).map(([lon, lat]) => reference(lon, lat))
  const maximumError = Math.max(...expected.map(([rx, ry], i) => Math.hypot(x[i] - rx, y[i] - ry)))
  if (maximumError > 2e-5)
    throw new Error(
      `The coordinates differ from spherical Mollweide (largest sample error: ${maximumError.toFixed(4)}). Check the equator, poles, symmetry, and the 2:1 outline. Checks use a central meridian of 0°.`,
    )
  for (let i = 0; i < coordinateCount; i++)
    if ((x[i] / (2 * Math.SQRT2)) ** 2 + (y[i] / Math.SQRT2) ** 2 > 1 + 1e-5)
      throw new Error('A sample falls outside the target ellipse.')
  for (const [i, [, lat]] of areaCenters.entries()) {
    const j = coordinateCount + i * 4
    const dxdl = (x[j] - x[j + 1]) / (2 * step),
      dydl = (y[j] - y[j + 1]) / (2 * step)
    const dxdp = (x[j + 2] - x[j + 3]) / (2 * step),
      dydp = (y[j + 2] - y[j + 3]) / (2 * step)
    if (Math.abs((dxdl * dydp - dxdp * dydl) / Math.cos(lat) - 1) > 0.002)
      throw new Error(
        'Local area changes at an interior sample. Check the scale factors in x and y.',
      )
  }
  return 'Checks passed: finite coordinates, equator and poles, symmetry, ellipse bounds, reference samples, and local area at six interior points. This is evidence, not a proof for every possible input.'
}
