import { describe, expect, it } from 'vitest'
import {
  densifyPolyline,
  geodesicCircle,
  sphericalRingArea,
  triangulatePolygon,
} from '../geometry'

describe('antimeridian-safe densification', () => {
  it('produces no segment spanning > 5° of longitude across ±180°', () => {
    const line: [number, number][] = [
      [170, 10],
      [185, 20], // same as −175
      [190, 5], // −170
      [160, 0],
    ]
    const dense = densifyPolyline(line, 1)
    expect(dense.length).toBeGreaterThan(20)
    for (let i = 1; i < dense.length; i++) {
      expect(Math.abs(dense[i][0] - dense[i - 1][0])).toBeLessThan(5)
    }
  })
  it('respects the max segment length in latitude too', () => {
    const dense = densifyPolyline(
      [
        [0, -40],
        [0, 40],
      ],
      1,
    )
    for (let i = 1; i < dense.length; i++) {
      expect(Math.abs(dense[i][1] - dense[i - 1][1])).toBeLessThanOrEqual(1 + 1e-9)
    }
  })
})

describe('triangulation', () => {
  it('triangulates a unit square into 2 triangles', () => {
    const tris = triangulatePolygon([
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ])
    expect(tris.length).toBe(6) // 2 triangles × 3 vertices
  })
  it('handles a polygon with a hole (hole area excluded)', () => {
    const tris = triangulatePolygon([
      [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
        [0, 0],
      ],
      [
        [1, 1],
        [1, 3],
        [3, 3],
        [3, 1],
        [1, 1],
      ],
    ])
    expect(tris.length % 3).toBe(0)
    expect(tris.length).toBeGreaterThanOrEqual(12)
    // total triangle area must equal 16 − 4 = 12
    let area = 0
    for (let t = 0; t < tris.length; t += 3) {
      const [x1, y1] = tris[t]
      const [x2, y2] = tris[t + 1]
      const [x3, y3] = tris[t + 2]
      area += Math.abs((x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1)) / 2
    }
    expect(area).toBeCloseTo(12, 6)
  })
})

describe('geodesic circle', () => {
  it('every point lies at the requested angular radius', () => {
    const { lon, lat } = geodesicCircle(-40, 72, 10, 64)
    const D2R = Math.PI / 180
    for (let i = 0; i < lon.length; i++) {
      const c =
        Math.sin(72 * D2R) * Math.sin(lat[i] * D2R) +
        Math.cos(72 * D2R) * Math.cos(lat[i] * D2R) * Math.cos((lon[i] + 40) * D2R)
      const d = Math.acos(Math.max(-1, Math.min(1, c))) / D2R
      expect(d).toBeCloseTo(10, 6)
    }
  })
})

describe('spherical ring area', () => {
  it('a 90°×90° quad at the equator covers π/2 steradians', () => {
    const ring = [
      [0, 0],
      [90, 0],
      [90, 90],
      [0, 90],
      [0, 0],
    ]
    expect(sphericalRingArea(ring)).toBeCloseTo(Math.PI / 2, 3)
  })
})
