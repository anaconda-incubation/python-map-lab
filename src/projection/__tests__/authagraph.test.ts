import { describe, expect, it } from 'vitest'
import {
  AUTHAGRAPH_EDGE_SCALE,
  AUTHAGRAPH_FRAME,
  AUTHAGRAPH_VERTICES,
  authagraphInverse,
  authagraphPoint,
  authagraphRoute,
  narukawaFaceForward,
} from '../authagraph'
import { fibonacciSphere } from '../metrics'

const D2R = Math.PI / 180

describe('authagraph (Narukawa 2022 published formulation)', () => {
  it('tetrahedron vertices form an exact regular tetrahedron (dot = −1/3)', () => {
    const vecs = AUTHAGRAPH_VERTICES.map(([lat, lon]) => {
      const la = lat * D2R
      const lo = lon * D2R
      return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]
    })
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        const d = vecs[i][0] * vecs[j][0] + vecs[i][1] * vecs[j][1] + vecs[i][2] * vecs[j][2]
        expect(d).toBeCloseTo(-1 / 3, 7)
      }
    }
  })
  it('face forward: θ(λ=0)=0, r at vertex center = √3·3/(2+√2·tan(π/2)) edge case stays finite', () => {
    const [r0, t0] = narukawaFaceForward(0, 0)
    // λ=0, φ=0: a=0 → θ=0; q = 3/2 → r = (3/2)·√3
    expect(t0).toBeCloseTo(0, 12)
    expect(r0).toBeCloseTo((3 / 2) * Math.sqrt(3), 10)
  })
  it('every sphere point lands inside the published 4√3:3 frame', () => {
    const { lon, lat } = fibonacciSphere(3000)
    const hw = AUTHAGRAPH_FRAME.halfWidth
    const hh = AUTHAGRAPH_FRAME.halfHeight
    for (let i = 0; i < lon.length; i++) {
      const p = authagraphPoint(lon[i], lat[i])
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
      expect(Math.abs(p.x)).toBeLessThanOrEqual(hw + 1e-9)
      expect(Math.abs(p.y)).toBeLessThanOrEqual(hh + 1e-9)
    }
    // frame aspect is 4√3 : 3
    expect(hw / hh).toBeCloseTo((4 * Math.sqrt(3)) / 3, 9)
    expect(AUTHAGRAPH_EDGE_SCALE).toBeCloseTo(Math.acos(-1 / 3) / 2, 12)
  })
  it('routes every point to one of 4 facets × 3 sectors', () => {
    const { lon, lat } = fibonacciSphere(500)
    const seen = new Set<string>()
    for (let i = 0; i < lon.length; i++) {
      const r = authagraphRoute(lon[i], lat[i])
      expect(r.facet).toBeGreaterThanOrEqual(0)
      expect(r.facet).toBeLessThan(4)
      expect(r.sector).toBeGreaterThanOrEqual(0)
      expect(r.sector).toBeLessThan(3)
      seen.add(`${r.facet}:${r.sector}`)
    }
    expect(seen.size).toBe(12) // the sphere actually uses all 12 raw sectors
  })
  it('inverse round-trips interior points', () => {
    const samples = [
      [0, 0],
      [10 * D2R, 40 * D2R],
      [-100 * D2R, -20 * D2R],
      [150 * D2R, 55 * D2R],
      [-30 * D2R, -60 * D2R],
    ]
    for (const [lon, lat] of samples) {
      const p = authagraphPoint(lon, lat)
      const q = authagraphInverse(p.x, p.y)
      expect(q).not.toBeNull()
      if (!q) continue
      // compare on the sphere (handles lon wrap)
      const c =
        Math.sin(lat) * Math.sin(q.lat) +
        Math.cos(lat) * Math.cos(q.lat) * Math.cos(q.lon - lon)
      expect(Math.acos(Math.min(1, Math.max(-1, c)))).toBeLessThan(2 * D2R)
    }
  })
})
