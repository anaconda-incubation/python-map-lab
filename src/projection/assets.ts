import manifestData from './generated-manifest.json'
import frameRatios from './generated-frames.json'
import { unpack } from './packed'
import type { BakedProjection } from './types'
import type { MasterGeometry, GraticuleData } from './geometry'
import type { SamplePoints } from './sample-layout'
import { measure } from '../utils/diagnostics'

export type MapQuality = 'overview' | 'detail'
export type PreparedGeometry = {
  master: MasterGeometry
  graticule: GraticuleData
  samples: SamplePoints
}
type Asset = { data: string; preview?: string; bytes: number }
type Manifest = {
  version: string
  qualities: Record<MapQuality, { geometry: Asset; presets: Record<string, Asset> }>
}
export const mapManifest = manifestData as unknown as Manifest

const pending = new Map<string, Promise<unknown>>()
// Keep at most a handful of recently used complete assets, not every visited preset.
const cache = new Map<string, { value: unknown; bytes: number }>()
let cachedBytes = 0
async function load<T>(url: string): Promise<T> {
  const cached = cache.get(url)
  if (cached) {
    cache.delete(url)
    cache.set(url, cached)
    return cached.value as T
  }
  if (pending.has(url)) return pending.get(url) as Promise<T>
  const job = measure('map-data', async () => {
    const compressed = await measure('map-download', async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(45_000) })
      if (!response.ok) throw new Error('Could not load this map. Check your connection and retry.')
      return response.blob()
    })
    const { data, bytes } = await measure('map-decode', async () => {
      const buffer = await new Response(
        compressed.stream().pipeThrough(new DecompressionStream('gzip')),
      ).arrayBuffer()
      return { data: unpack<T>(buffer), bytes: buffer.byteLength }
    })
    cache.set(url, { value: data, bytes })
    cachedBytes += bytes
    while (cache.size > 1 && (cache.size > 5 || cachedBytes > 64 * 1024 * 1024)) {
      const first = cache.keys().next().value!
      cachedBytes -= cache.get(first)!.bytes
      cache.delete(first)
    }
    return data
  })
    .catch((error: unknown) => {
      if (error instanceof Error && error.message.startsWith('Could not load this map')) throw error
      throw new Error(
        'This map could not be downloaded or read. Check your connection and retry.',
        {
          cause: error,
        },
      )
    })
    .finally(() => pending.delete(url))
  pending.set(url, job)
  return job
}
export function loadPreparedGeometry(quality: MapQuality) {
  return load<PreparedGeometry>(mapManifest.qualities[quality].geometry.data)
}
export function loadPreset(id: string, quality: MapQuality) {
  const asset = mapManifest.qualities[quality]?.presets[id]
  if (!asset)
    return Promise.reject(new Error('This map preview is unavailable. Try another projection.'))
  return load<BakedProjection>(asset.data)
}
export function previewUrl(id: string) {
  return mapManifest.qualities.overview?.presets[id]?.preview
}
export function previewAspectRatio(id: string) {
  return (frameRatios as Record<string, number>)[id] ?? 1
}
