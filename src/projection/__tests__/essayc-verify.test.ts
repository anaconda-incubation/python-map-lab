/**
 * Regression tests for the measured numbers shown by essay-c chapters 07–10.
 * These guard the claims the UI makes:
 *  - scorecards: exactness properties show up in measured statistics
 *    (Gall–Peters / Equal Earth RMS log₂ area error ≈ 0; Mercator ω ≈ 0);
 *  - area test: shoelace-measured projected region areas reproduce the
 *    curated 14 : 1 Africa : Greenland truth on equal-area maps and the
 *    famous collapse on Mercator;
 *  - move-a-circle: Mercator preserves the circle's shape and inflates its
 *    area toward the pole; Gall–Peters does the opposite.
 */
import { describe, expect, it } from 'vitest'
import { getProjection, D2R, R2D } from '../projections'
import { projectionScorecard } from '../metrics'
import { geodesicCircle, regionRing, sphericalRingArea, type RegionDef } from '../geometry'
import { tissotAt } from '../distortion'
import areasData from '../../data/areas.json'
import '../authagraph'

const REGIONS = areasData.regions as unknown as RegionDef[]
const RADIUS_DEG = (1000 / 6371) * R2D

function shoelace(ring: number[][], fn: (lon: number, lat: number) => { x: number; y: number }) {
  let acc = 0
  let prev = fn(ring[ring.length - 1][0] * D2R, ring[ring.length - 1][1] * D2R)
  for (const [lon, lat] of ring) {
    const p = fn(lon * D2R, lat * D2R)
    if (Number.isFinite(p.x) && Number.isFinite(prev.x)) acc += prev.x * p.y - p.x * prev.y
    prev = p
  }
  return Math.abs(acc / 2)
}

describe('scorecard statistics reflect exact properties', () => {
  it('Gall–Peters and Equal Earth measure as equal-area; Mercator as conformal', () => {
    const gp = projectionScorecard((l, p) => getProjection('gallPeters').projectPoint(l, p), {
      samples: 2001,
      distancePairs: 200,
    })
    const ee = projectionScorecard((l, p) => getProjection('equalEarth').projectPoint(l, p), {
      samples: 2001,
      distancePairs: 200,
    })
    const merc = projectionScorecard((l, p) => getProjection('mercator').projectPoint(l, p), {
      samples: 2001,
      distancePairs: 200,
    })
    expect(gp.rmsLog2AreaError).toBeLessThan(0.01)
    expect(ee.rmsLog2AreaError).toBeLessThan(0.01)
    expect(merc.maxOmegaDeg).toBeLessThan(0.5)
    expect(merc.rmsLog2AreaError).toBeGreaterThan(1) // area lie is the headline
    for (const sc of [gp, ee, merc]) {
      expect(Number.isFinite(sc.distanceStressRms)).toBe(true)
      expect(sc.validFraction).toBeGreaterThan(0.9)
    }
  }, 60_000)
})

describe('area test measurements (shoelace on projected rings)', () => {
  const mapRatio = (proj: string) => {
    const area = (id: string) => {
      const def = REGIONS.find((r) => r.id === id)!
      const ring = regionRing(def, 0.5)
      if (proj === 'globe') return sphericalRingArea(ring)
      const fn = (l: number, p: number) =>
        getProjection(proj as never).projectPoint(l, p)
      return shoelace(ring, fn)
    }
    return area('africa') / area('greenland')
  }

  it('equal-area projections and the globe reproduce the 14 : 1 truth (±10%)', () => {
    for (const proj of ['globe', 'gallPeters', 'equalEarth']) {
      expect(mapRatio(proj)).toBeGreaterThan(14.0 * 0.9)
      expect(mapRatio(proj)).toBeLessThan(14.0 * 1.1)
    }
  })

  it('Mercator collapses the ratio to near 1 : 1 (the famous lie)', () => {
    expect(mapRatio('mercator')).toBeLessThan(2)
  })
})

describe('move-a-circle readouts', () => {
  const circleArea = (proj: 'mercator' | 'gallPeters', lon: number, lat: number) => {
    const { lon: L, lat: P } = geodesicCircle(lon, lat, RADIUS_DEG, 128)
    const ring: number[][] = []
    for (let i = 0; i < L.length; i++) ring.push([L[i], P[i]])
    ring.push(ring[0])
    return shoelace(ring, (l, p) => getProjection(proj).projectPoint(l, p))
  }
  const axisRatio = (proj: 'mercator' | 'gallPeters', lon: number, lat: number) => {
    const t = tissotAt((l, p) => getProjection(proj).projectPoint(l, p), lon * D2R, lat * D2R)
    return t.sigma1 / t.sigma2
  }

  it('Mercator: shape stays 1.00, area grows >5× by 70°N', () => {
    expect(axisRatio('mercator', -30, 70)).toBeLessThan(1.001)
    expect(circleArea('mercator', -30, 70) / circleArea('mercator', -30, 0)).toBeGreaterThan(5)
  })

  it('Gall–Peters: area stays 1.000, shape shears by 70°N', () => {
    const ratio = circleArea('gallPeters', -30, 70) / circleArea('gallPeters', -30, 0)
    expect(Math.abs(ratio - 1)).toBeLessThan(0.02)
    expect(axisRatio('gallPeters', -30, 70)).toBeGreaterThan(3)
  })
})
