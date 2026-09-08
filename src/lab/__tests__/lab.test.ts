/**
 * Focused tests for the Projection Lab's pure logic: share round-trip,
 * param pragmas, grid interpolation, the loss mirror, and codegen.
 */
import { describe, it, expect } from 'vitest'
import { encodePayload, decodePayload, shareFragment, parseLabHash } from '../share'
import { parseParams, paramsRecord } from '../params'
import { ensureContract, TEMPLATES, CONTRACT } from '../templates'
import { buildLabGrid, gridProjection } from '../gridfn'
import { lossTerms, optimizerWeights, runSearchMirror, weightedLoss, FAMILY_SEEDS } from '../loss'
import { familyToPython } from '../codegen'
import { familyProjectFn, familyFrame } from '@/projection/worker-client'
import { equalEarthPoint } from '@/projection/projections'
import { DEFAULT_WEIGHTS, type SharePayload } from '../types'

describe('share payload round-trip', () => {
  const payload: SharePayload = {
    v: 1,
    mode: 'design',
    family: 'equal_area',
    params: [0.866, 1.34, -0.081, 0, 0.000893, 0.003796],
    weights: DEFAULT_WEIGHTS,
    name: 'MY PROJECTION #1 — déjà vu',
  }
  it('encode → decode restores the payload (unicode-safe, url-safe)', () => {
    const enc = encodePayload(payload)
    expect(enc).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodePayload(enc)).toEqual(payload)
  })
  it('rejects garbage', () => {
    expect(decodePayload('not-a-payload')).toBeNull()
    expect(decodePayload('')).toBeNull()
  })
  it('shareFragment caps at 6 KB', () => {
    const big: SharePayload = {
      v: 1,
      mode: 'python',
      code: 'x'.repeat(9000),
      params: {},
      name: 'big',
    }
    expect(shareFragment(big)).toBeNull()
    expect(shareFragment(payload)).toMatch(/^#p=/)
  })
  it('parseLabHash parses modes and payloads', () => {
    expect(parseLabHash('#design')).toEqual({ kind: 'mode', mode: 'design' })
    expect(parseLabHash('#python')).toEqual({ kind: 'mode', mode: 'python' })
    const frag = shareFragment(payload)!
    const parsed = parseLabHash(frag)
    expect(parsed.kind).toBe('payload')
    if (parsed.kind === 'payload') expect(parsed.payload).toEqual(payload)
    expect(parseLabHash('#nonsense')).toEqual({ kind: 'none' })
  })
})

describe('param pragmas', () => {
  it('parses # @param name min max default', () => {
    const defs = parseParams('# @param phi0_deg -60 60 45\ncode', {})
    expect(defs).toEqual([{ name: 'phi0_deg', min: -60, max: 60, value: 45 }])
    expect(paramsRecord(defs)).toEqual({ phi0_deg: 45 })
  })
  it('parses # param: name=value shorthand with a guessed range', () => {
    const defs = parseParams('# param: scale=1.0', {})
    expect(defs).toHaveLength(1)
    expect(defs[0].name).toBe('scale')
    expect(defs[0].value).toBe(1)
    expect(defs[0].min).toBeLessThan(1)
    expect(defs[0].max).toBeGreaterThan(1)
  })
  it('keeps the user’s current value across re-parses and caps at 4', () => {
    const code = ['a', 'b', 'c', 'd', 'e'].map((n) => `# @param ${n} 0 10 5`).join('\n')
    const defs = parseParams(code, { b: 7 })
    expect(defs).toHaveLength(4)
    expect(defs.find((d) => d.name === 'b')?.value).toBe(7)
  })
  it('clamps stale values into a changed range', () => {
    const defs = parseParams('# @param k 0 2 1', { k: 9 })
    expect(defs[0].value).toBe(2)
  })
})

describe('contract pinning', () => {
  it('leaves code with the contract untouched', () => {
    const { code, restored } = ensureContract(TEMPLATES[0].code)
    expect(restored).toBe(false)
    expect(code).toBe(TEMPLATES[0].code)
  })
  it('re-inserts the contract when deleted', () => {
    const { code, restored } = ensureContract('import numpy as np\n')
    expect(restored).toBe(true)
    expect(code.startsWith(CONTRACT)).toBe(true)
  })
  it('every template defines project() and the contract', () => {
    for (const t of TEMPLATES) {
      expect(t.code).toContain('# CONTRACT')
      expect(t.code).toContain('def project(')
    }
  })
})

describe('grid interpolation bridge', () => {
  it('reproduces a known projection (equirectangular) within interpolation error', () => {
    const g = buildLabGrid()
    const x = new Float64Array(g.lon.length)
    const y = new Float64Array(g.lon.length)
    for (let i = 0; i < g.lon.length; i++) {
      x[i] = g.lon[i]
      y[i] = g.lat[i]
    }
    const gp = gridProjection(g, x, y)
    const p = gp.fn(1.0, 0.5)
    expect(p.x).toBeCloseTo(1.0, 10)
    expect(p.y).toBeCloseTo(0.5, 10)
    expect(gp.invalidCount).toBe(0)
    expect(gp.escapeLatDeg).toBeNull()
    expect(gp.frame.halfWidth).toBeCloseTo(Math.PI, 6)
    expect(gp.frame.halfHeight).toBeCloseTo(Math.PI / 2, 6)
  })
  it('propagates NaN corners as holes and reports the escape latitude', () => {
    const g = buildLabGrid()
    const x = new Float64Array(g.lon.length)
    const y = new Float64Array(g.lon.length)
    for (let i = 0; i < g.lon.length; i++) {
      const blow = Math.abs(g.lat[i]) > (80 * Math.PI) / 180
      x[i] = blow ? NaN : g.lon[i]
      y[i] = blow ? NaN : g.lat[i]
    }
    const gp = gridProjection(g, x, y)
    expect(gp.invalidCount).toBeGreaterThan(0)
    expect(gp.escapeLatDeg).not.toBeNull()
    expect(gp.escapeLatDeg!).toBeGreaterThanOrEqual(80)
    expect(gp.escapeLatDeg!).toBeLessThanOrEqual(83)
    expect(Number.isFinite(gp.fn(0, 0).x)).toBe(true)
    expect(Number.isFinite(gp.fn(0, (89 * Math.PI) / 180).x)).toBe(false)
  })
})

describe('loss mirror', () => {
  it('scores the Equal Earth seed as near-equal-area with low loss', () => {
    const fn = familyProjectFn('equal_area', FAMILY_SEEDS.equal_area)
    const terms = lossTerms(fn)
    expect(terms).not.toBeNull()
    expect(terms!.area).toBeLessThan(0.05) // equal-area by construction
    const l = weightedLoss(terms!, optimizerWeights(DEFAULT_WEIGHTS))
    expect(l).toBeGreaterThan(0)
    expect(l).toBeLessThan(1)
  })
  it('returns null for degenerate coefficients', () => {
    const fn = familyProjectFn('equal_area', [0, 0, 0, 0, 0, 0])
    expect(lossTerms(fn)).toBeNull()
  })
  it('optimizerWeights folds direction into distance', () => {
    const w = optimizerWeights({ area: 1, shape: 1, distance: 2, direction: 3, compact: 1, extremes: 1 })
    expect(w.distance).toBe(5)
  })
  it('Nelder–Mead improves on the seed loss', async () => {
    const weights = { ...DEFAULT_WEIGHTS }
    const w = optimizerWeights(weights)
    const seedFn = familyProjectFn('equal_area', FAMILY_SEEDS.equal_area)
    const seedLoss = weightedLoss(lossTerms(seedFn)!, w)
    const res = await runSearchMirror('equal_area', weights, { maxiter: 40 })
    expect(res.loss).toBeLessThanOrEqual(seedLoss + 1e-9)
    expect(res.params).toHaveLength(6)
    expect(res.evaluations).toBeGreaterThan(res.iterations)
  }, 20000)
})

describe('codegen', () => {
  it('generates valid-looking python with the coefficients baked in', () => {
    const params = FAMILY_SEEDS.equal_area
    const code = familyToPython('equal_area', params, 'MY PROJECTION #1', 0.1234)
    expect(code).toContain('# CONTRACT')
    expect(code).toContain('def project(lon, lat, params):')
    expect(code).toContain('0.8660254')
    expect(code).toContain('final loss 0.1234')
    const c = familyToPython('compromise', FAMILY_SEEDS.compromise, 'X', 0.5)
    expect(c).toContain('g0, g2, g4, g6')
  })
  it('generated equal-area math matches the TS family fn', () => {
    // same closed form → compare a sample point against the reference fn
    const params = FAMILY_SEEDS.equal_area
    const ref = familyProjectFn('equal_area', params)
    const ee = ref(1.1, 0.7)
    const canon = equalEarthPoint(1.1, 0.7)
    expect(ee.x).toBeCloseTo(canon.x, 6)
    expect(ee.y).toBeCloseTo(canon.y, 6)
    const frame = familyFrame('equal_area', params)
    expect(frame.halfWidth).toBeGreaterThan(1)
    expect(frame.halfHeight).toBeGreaterThan(0.5)
  })
})

describe('custom projection framing', () => {
  it('fits intermediate-latitude bulges, not just the equator and poles', () => {
    const params = [.8660254, 1, 0, 0, 0, 0, 1, 2, -2, 0]
    const fn = familyProjectFn('compromise', params)
    const frame = familyFrame('compromise', params)
    const bulge = fn(Math.PI, Math.asin(Math.sin(Math.sqrt(.5)) / params[0]))
    expect(frame.halfWidth).toBeGreaterThan(4.7)
    expect(frame.halfWidth).toBeCloseTo(bulge.x, 3)
    for (let deg = -90; deg <= 90; deg += .25) {
      const p = fn(Math.PI, deg * Math.PI / 180)
      expect(Math.abs(p.x)).toBeLessThanOrEqual(frame.halfWidth + 1e-6)
      expect(Math.abs(p.y)).toBeLessThanOrEqual(frame.halfHeight + 1e-6)
    }
  })
})
