import { describe, expect, it } from 'vitest'
import { constructionCamera, constructionCaptionOpacity, constructionWeights } from '../authagraphMotion'

describe('AuthaGraph continuous construction', () => {
  it('holds the sphere for subdivision, then reaches every advertised solid exactly', () => {
    expect(constructionWeights(0)).toEqual([1, 0, 0, 0])
    expect(constructionWeights(1)).toEqual([1, 0, 0, 0])
    expect(constructionWeights(2)).toEqual([0, 1, 0, 0])
    expect(constructionWeights(3)).toEqual([0, 0, 1, 0])
    expect(constructionWeights(4)).toEqual([0, 0, 0, 1])
  })
  it('never jumps at integer geometry or half-integer camera boundaries in either direction', () => {
    for (const boundary of [.5, 1, 1.5, 2, 2.5, 3, 3.5]) {
      const a = constructionWeights(boundary - 1e-5), b = constructionWeights(boundary + 1e-5)
      a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThan(.0001))
      const ca = constructionCamera(boundary - 1e-5), cb = constructionCamera(boundary + 1e-5)
      ca.position.forEach((v, i) => expect(Math.abs(v - cb.position[i])).toBeLessThan(.001))
      expect(Math.abs(ca.fov - cb.fov)).toBeLessThan(.001)
    }
  })
  it('keeps geometry normalized and captions crossfading without a blank frame', () => {
    for (let n = 0; n <= 400; n++) {
      const s = n / 100, weights = constructionWeights(s)
      expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
      expect(weights.every(v => v >= 0 && v <= 1)).toBe(true)
      const captions = [0, 1, 2, 3, 4].map(i => constructionCaptionOpacity(s, i))
      expect(captions.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
    }
    expect(constructionCaptionOpacity(.5, 0)).toBeCloseTo(.5)
    expect(constructionCaptionOpacity(.5, 1)).toBeCloseTo(.5)
  })
})
