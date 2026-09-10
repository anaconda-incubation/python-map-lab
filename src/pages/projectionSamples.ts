import { loadPreparedGeometry, type MapQuality } from '@/projection/assets'
import { sampleIndex, sampledProjection, type SamplePoints } from '@/projection/sample-layout'
import type { RunProjectionResult } from '@/projection/worker-client'
import { measure } from '@/utils/diagnostics'

const indices = new WeakMap<SamplePoints, ReturnType<typeof sampleIndex>>()
export async function getProjectionSamples(quality: MapQuality = 'overview') {
  return measure('sample-layout', async () => {
    const { samples } = await loadPreparedGeometry(quality)
    if (!indices.has(samples)) indices.set(samples, sampleIndex(samples))
    return samples
  })
}
export function projectionFromSamples(samples: SamplePoints, result: RunProjectionResult) {
  return sampledProjection(samples, result, indices.get(samples))
}
