import { describe, expect, it } from 'vitest'
import {
  EE_A1,
  EE_M,
  MERCATOR_MAX_LAT,
  equalEarthPoint,
  gallPetersPoint,
  mercatorPoint,
  mollweidePoint,
  mollweideTheta,
} from '../projections'

const D2R = Math.PI / 180

describe('mercator', () => {
  it('maps the origin to the origin', () => {
    const p = mercatorPoint(0, 0)
    expect(p.x).toBe(0)
    expect(Math.abs(p.y)).toBeLessThan(1e-12) // tan(π/4) is not exactly 1 in FP
  })
  it('is symmetric in λ: x(λ) = −x(−λ)', () => {
    const a = mercatorPoint(1.2, 0.6)
    const b = mercatorPoint(-1.2, 0.6)
    expect(a.x).toBeCloseTo(-b.x, 12)
    expect(a.y).toBeCloseTo(b.y, 12)
  })
  it('y(45°) = ln tan(π/4 + π/8) ≈ 0.881373587', () => {
    expect(mercatorPoint(0, 45 * D2R).y).toBeCloseTo(0.881373587, 8)
  })
  it('clamps beyond ±85° instead of diverging', () => {
    const clamped = Math.log(Math.tan(Math.PI / 4 + MERCATOR_MAX_LAT / 2))
    expect(mercatorPoint(0, 89.9 * D2R).y).toBeCloseTo(clamped, 12)
    expect(Number.isFinite(mercatorPoint(0, 90 * D2R).y)).toBe(true)
  })
})

describe('gallPeters', () => {
  it('is symmetric in λ and y is odd in φ', () => {
    const a = gallPetersPoint(0.8, 0.5)
    const b = gallPetersPoint(-0.8, 0.5)
    const c = gallPetersPoint(0.8, -0.5)
    expect(a.x).toBeCloseTo(-b.x, 12)
    expect(a.y).toBeCloseTo(-c.y, 12)
  })
  it('matches the published check: (30°, 30°) → (0.370240245, 0.707106781)', () => {
    const p = gallPetersPoint(30 * D2R, 30 * D2R)
    expect(p.x).toBeCloseTo(0.370240245, 8)
    expect(p.y).toBeCloseTo(0.707106781, 8)
  })
})

describe('equalEarth', () => {
  const refs = [
    { lon: 122, lat: 47, x: 1.549254331, y: 0.893308325 },
    { lon: 90, lat: 45, x: 1.159854499, y: 0.860231086 },
    { lon: -75, lat: 15, x: -1.109359393, y: 0.302049072 },
    { lon: 30, lat: -60, x: 0.339843348, y: -1.088300836 },
    { lon: 180, lat: 45, x: 2.319708998, y: 0.860231086 },
    { lon: -150, lat: -30, x: -2.109751397, y: -0.59293512 },
  ]
  it('reproduces the published reference points (±1e-3)', () => {
    for (const r of refs) {
      const p = equalEarthPoint(r.lon * D2R, r.lat * D2R)
      expect(Math.abs(p.x - r.x)).toBeLessThan(1e-3)
      expect(Math.abs(p.y - r.y)).toBeLessThan(1e-3)
    }
  })
  it('origin → (0, 0)', () => {
    const p = equalEarthPoint(0, 0)
    expect(p.x).toBe(0)
    expect(p.y).toBe(0)
  })
  it('y(0°, 90°) = 1.3173627591574 (PROJ MAX_Y) ±1e-6', () => {
    expect(equalEarthPoint(0, 90 * D2R).y).toBeCloseTo(1.3173627591574, 6)
  })
  it('x(180°, 0°) = π/(M·A1) ≈ 2.70663 ±1e-6', () => {
    const expected = Math.PI / (EE_M * EE_A1)
    expect(expected).toBeCloseTo(2.70663, 5)
    expect(equalEarthPoint(180 * D2R, 0).x).toBeCloseTo(expected, 6)
  })
})

describe('mollweide', () => {
  it('equator spans ±2√2 (x(±180°, 0°) = ±2√2)', () => {
    expect(mollweidePoint(180 * D2R, 0).x).toBeCloseTo(2 * Math.SQRT2, 10)
    // −180° wraps to the same meridian as +180° (same map edge)
    expect(Math.abs(mollweidePoint(-180 * D2R, 0).x)).toBeCloseTo(2 * Math.SQRT2, 10)
    expect(mollweidePoint(0, 0).y).toBe(0)
  })
  it('pole maps to y = ±√2 with θ = ±π/2', () => {
    expect(mollweideTheta(90 * D2R)).toBeCloseTo(Math.PI / 2, 10)
    expect(mollweidePoint(0, 90 * D2R).y).toBeCloseTo(Math.SQRT2, 10)
  })
  it('matches the published check: (90°, 45°) → (1.139725025, 0.837273472)', () => {
    const p = mollweidePoint(90 * D2R, 45 * D2R)
    expect(p.x).toBeCloseTo(1.139725025, 8)
    expect(p.y).toBeCloseTo(0.837273472, 8)
  })
})
