import { bakeCustomProjection } from '@/projection/bake'
import { AUTHAGRAPH_FRAME } from '@/projection/authagraph'

// Sample exactly where the renderer asks, including finite-difference probes.
// A regular lon/lat grid would interpolate across AuthaGraph's rectangle cuts.
let pending: ReturnType<typeof collect> | undefined
async function collect() {
  const indices = new Map<string, number>()
  const lon: number[] = [], lat: number[] = []
  await bakeCustomProjection('authagraph-sample-layout', (lo, la) => {
    const key = `${lo},${la}`
    if (!indices.has(key)) { indices.set(key, lon.length); lon.push(lo); lat.push(la) }
    // A tiny continuous map keeps every triangle valid during collection,
    // so derivatives on both sides of every possible future cut are sampled.
    return {x:lo * 0.001, y:la * 0.001}
  }, AUTHAGRAPH_FRAME, {tissotStepDeg:30})
  return {lon:new Float64Array(lon),lat:new Float64Array(lat),indices}
}
export function getAuthagraphSamples() { return pending ??= collect() }
