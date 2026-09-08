/**
 * Regression tests for the chapter 09 AREA TEST data (src/data/areas.json):
 * each region's coarse boundary ring must measure (spherical excess, R=6371)
 * within ±15% of its curated published area, so that on equal-area
 * projections the chapter's "ratio vs truth" column reads ≈ 1.00.
 */
import { describe, expect, it } from 'vitest'
import { regionRing, sphericalRingArea, type RegionDef } from '../geometry'
import areasData from '../../data/areas.json'

const K = 6371 * 6371
const REGIONS = areasData.regions as unknown as RegionDef[]

describe('areas.json region rings vs curated areas', () => {
  for (const def of REGIONS) {
    it(`${def.id} ring area ≈ curated area (±15%)`, () => {
      const km2 = sphericalRingArea(regionRing(def, 0.5)) * K
      const ratio = km2 / def.areaKm2
      expect(ratio).toBeGreaterThan(0.85)
      expect(ratio).toBeLessThan(1.15)
    })
  }

  it('Africa ÷ Greenland ring ratio matches the curated 14.0 headline (±7%)', () => {
    const area = (id: string) =>
      sphericalRingArea(regionRing(REGIONS.find((r) => r.id === id)!, 0.5))
    const ratio = area('africa') / area('greenland')
    expect(ratio / areasData.headlineRatio.value).toBeGreaterThan(0.93)
    expect(ratio / areasData.headlineRatio.value).toBeLessThan(1.07)
  })
})
