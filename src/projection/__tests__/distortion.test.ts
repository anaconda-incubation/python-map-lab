import { describe, expect, it } from 'vitest'
import { tissotAt } from '../distortion'
import { fibonacciSphere, projectionScorecard } from '../metrics'
import {
  equalEarthPoint,
  equirectangularPoint,
  gallPetersPoint,
  mercatorPoint,
  mollweidePoint,
} from '../projections'

const D2R = Math.PI / 180

describe('distortion engine (Tissot via SVD)', () => {
  it('equirectangular at the equator has σ ≈ (1, 1)', () => {
    const t = tissotAt(equirectangularPoint, 0.7, 0)
    expect(t.valid).toBe(true)
    expect(t.sigma1).toBeCloseTo(1, 4)
    expect(t.sigma2).toBeCloseTo(1, 4)
  })
  it('mercator is conformal: σ1/σ2 ≈ 1 everywhere (±1e-3)', () => {
    for (const lat of [-75, -45, -15, 0, 20, 45, 60, 80]) {
      const t = tissotAt(mercatorPoint, 1.1, lat * D2R)
      expect(t.valid).toBe(true)
      expect(t.sigma1 / t.sigma2).toBeGreaterThan(1 - 1e-3)
      expect(t.sigma1 / t.sigma2).toBeLessThan(1 + 1e-3)
      expect(t.omega).toBeLessThan(1e-3)
    }
  })
  it('mercator areal scale at 60° ≈ sec²60° = 4', () => {
    const t = tissotAt(mercatorPoint, 0.3, 60 * D2R)
    expect(t.areaScale).toBeCloseTo(4, 2)
  })
  it('gallPeters is equal-area: |det| ≈ 1 at many latitudes', () => {
    for (const lat of [-80, -60, -30, 0, 15, 45, 60, 75]) {
      for (const lon of [-2.5, 0, 1.9]) {
        const t = tissotAt(gallPetersPoint, lon, lat * D2R)
        expect(t.valid).toBe(true)
        expect(Math.abs(t.areaScale)).toBeCloseTo(1, 3)
      }
    }
  })
  it('gallPeters has angular deformation at 60° (ω > 0)', () => {
    const t = tissotAt(gallPetersPoint, 0, 60 * D2R)
    expect(t.omega).toBeGreaterThan(0.1)
  })
  it('equalEarth is equal-area: σ1σ2 ≈ 1 on a Fibonacci sample (max dev < 0.5%)', () => {
    const { lon, lat } = fibonacciSphere(4000)
    let maxDev = 0
    for (let i = 0; i < lon.length; i++) {
      const t = tissotAt(equalEarthPoint, lon[i], lat[i])
      if (!t.valid) continue
      const dev = Math.abs(t.areaScale - 1)
      if (dev > maxDev) maxDev = dev
    }
    expect(maxDev).toBeLessThan(0.005)
  })
  it('mollweide is equal-area: σ1σ2 ≈ 1 on a Fibonacci sample (max dev < 0.5%)', () => {
    const { lon, lat } = fibonacciSphere(4000)
    let maxDev = 0
    for (let i = 0; i < lon.length; i++) {
      const t = tissotAt(mollweidePoint, lon[i], lat[i])
      if (!t.valid) continue
      const dev = Math.abs(t.areaScale - 1)
      if (dev > maxDev) maxDev = dev
    }
    expect(maxDev).toBeLessThan(0.005)
  })
})

describe('global metrics', () => {
  it('equalEarth scores near-zero RMS log area error', () => {
    const card = projectionScorecard(equalEarthPoint, { samples: 2000 })
    expect(card.rmsLog2AreaError).toBeLessThan(0.01)
    expect(card.validFraction).toBeGreaterThan(0.99)
  })
  it('mercator has large area error but ~zero angular deformation', () => {
    const card = projectionScorecard(mercatorPoint, { samples: 2000 })
    expect(card.rmsLog2AreaError).toBeGreaterThan(0.5)
    expect(card.medianOmegaDeg).toBeLessThan(0.1)
  })
  it('distance stress of mercator exceeds that of equalEarth', () => {
    const mer = projectionScorecard(mercatorPoint, { samples: 1500, distancePairs: 600 })
    const ee = projectionScorecard(equalEarthPoint, { samples: 1500, distancePairs: 600 })
    expect(Number.isFinite(mer.distanceStressRms)).toBe(true)
    expect(Number.isFinite(ee.distanceStressRms)).toBe(true)
    expect(mer.distanceStressRms).toBeGreaterThan(ee.distanceStressRms)
  })
})
