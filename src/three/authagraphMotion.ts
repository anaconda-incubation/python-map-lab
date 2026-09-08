/** Shared, continuous staging for the GPU geometry, camera and captions. */
export const smoothUnit = (t: number) => {
  const x = Math.max(0, Math.min(1, t))
  return x * x * (3 - 2 * x)
}

export function constructionWeights(progress: number): [number, number, number, number] {
  const s = Math.max(0, Math.min(4, progress))
  // 0→1 introduces the region tint while holding the sphere.
  if (s <= 1) return [1, 0, 0, 0]
  const segment = Math.min(2, Math.floor(s - 1))
  const t = smoothUnit(s - 1 - segment)
  const weights: [number, number, number, number] = [0, 0, 0, 0]
  weights[segment] = 1 - t
  weights[segment + 1] = t
  return weights
}

const CAMERAS = [
  { position: [0, .35, 3.2], fov: 32 },
  { position: [0, .35, 3.2], fov: 32 },
  { position: [1.4, 1.1, 3.4], fov: 32 },
  { position: [0, .1, 4.6], fov: 26 },
  { position: [0, 0, 12.8], fov: 12 },
]

export function constructionCamera(progress: number) {
  const s = Math.max(0, Math.min(4, progress))
  const i = Math.min(3, Math.floor(s)), t = smoothUnit(s - i)
  const a = CAMERAS[i], b = CAMERAS[i + 1]
  return {
    position: a.position.map((v, k) => v + (b.position[k] - v) * t) as [number, number, number],
    target: [0, 0, 0] as [number, number, number],
    fov: a.fov + (b.fov - a.fov) * t,
  }
}

export function constructionCaptionOpacity(progress: number, index: number) {
  return smoothUnit((progress - index + .65) / .3) * (1 - smoothUnit((progress - index - .35) / .3))
}
