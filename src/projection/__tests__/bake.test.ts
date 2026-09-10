/**
 * End-to-end bake test against the REAL vendored Natural Earth data
 * (public/geo/*.geojson, read from disk — vitest runs in Node).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bakeProjectionSync } from '../bake'
import {
  buildGraticule,
  buildMasterGeometry,
  type GeoData,
} from '../geometry'
import { D2R, getProjection } from '../projections'

const read = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, '../../../public/geo', name), 'utf8'))

const geo: GeoData = {
  land: read('ne_110m_land.geojson'),
  lakes: read('ne_110m_lakes.geojson'),
  coastline: read('ne_110m_coastline.geojson'),
}

const master = buildMasterGeometry(geo, 1)
const graticule = buildGraticule(10)

describe('master geometry from real Natural Earth data', () => {
  it('produces substantial real geometry', () => {
    expect(master.landTri.lon.length).toBeGreaterThan(10000)
    expect(master.coastSeg.lon.length).toBeGreaterThan(10000)
    expect(master.lakeTri.lon.length).toBeGreaterThan(100)
  })
  it('no coastline segment spans the antimeridian (> 5° lon)', () => {
    const { lon } = master.coastSeg
    for (let i = 0; i < lon.length; i += 2) {
      expect(Math.abs(lon[i] - lon[i + 1])).toBeLessThanOrEqual(5)
    }
  })
})

describe('bake pipeline', () => {
  const mercator = bakeProjectionSync('mercator', master, graticule)
  const equalEarth = bakeProjectionSync('equalEarth', master, graticule)
  const authagraph = bakeProjectionSync('authagraph', master, graticule)
  const globe = bakeProjectionSync('globe', master, graticule)

  it('all projections share vertex counts (morph correspondence is 1:1)', () => {
    expect(equalEarth.vertexCount).toBe(mercator.vertexCount)
    expect(authagraph.vertexCount).toBe(mercator.vertexCount)
    expect(globe.vertexCount).toBe(mercator.vertexCount)
    expect(authagraph.coastlinePositions.length).toBe(mercator.coastlinePositions.length)
    expect(authagraph.graticulePositions.length).toBe(mercator.graticulePositions.length)
    expect(authagraph.tissotParams.length).toBe(mercator.tissotParams.length)
  })
  it('flat maps normalize into aspect-corrected frames', () => {
    for (const b of [mercator, equalEarth, authagraph]) {
      const w = b.bounds.maxX - b.bounds.minX
      const h = b.bounds.maxY - b.bounds.minY
      expect(Math.max(w, h)).toBeCloseTo(2, 6)
    }
  })
  it('globe positions stay on the unit sphere (non-collapsed vertices)', () => {
    let checked = 0
    for (let i = 0; i < globe.vertexCount && checked < 500; i += 97) {
      const x = globe.landPositions[i * 3]
      const y = globe.landPositions[i * 3 + 1]
      const z = globe.landPositions[i * 3 + 2]
      const r = Math.hypot(x, y, z)
      if (r > 0.5) {
        expect(r).toBeCloseTo(1, 5)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(50)
  })
  it('mercator overlay: log2 area at high latitudes exceeds the tropics', () => {
    // find a vertex near lat 70 and one near lat 0 and compare baked overlays
    let hiIdx = -1
    let loIdx = -1
    for (let i = 0; i < master.landTri.lat.length; i++) {
      const la = master.landTri.lat[i]
      if (hiIdx < 0 && la > 68 && la < 76) hiIdx = i
      if (loIdx < 0 && Math.abs(la) < 2) loIdx = i
      if (hiIdx >= 0 && loIdx >= 0) break
    }
    expect(hiIdx).toBeGreaterThanOrEqual(0)
    expect(loIdx).toBeGreaterThanOrEqual(0)
    // sec^2(70deg) ~ 8.6 → log2 ~ 3.1; equator ~ 0
    expect(mercator.landOverlay.logArea[hiIdx]).toBeGreaterThan(2.5)
    expect(Math.abs(mercator.landOverlay.logArea[loIdx])).toBeLessThan(0.2)
  })
  it('equalEarth overlay: area error ~0 everywhere on land', () => {
    let maxAbs = 0
    for (let i = 0; i < equalEarth.vertexCount; i++) {
      const v = Math.abs(equalEarth.landOverlay.logArea[i])
      if (v > maxAbs) maxAbs = v
    }
    expect(maxAbs).toBeLessThan(0.05) // < 3.5% area error, incl. seam adjacency
  })
  it('authagraph Tissot instances are valid on most of the sphere', () => {
    const n = authagraph.tissotParams.length / 4
    let valid = 0
    for (let i = 0; i < n; i++) if (authagraph.tissotParams[i * 4 + 3] === 1) valid++
    expect(valid / n).toBeGreaterThan(0.9)
  })
  it('mercator land has no interior holes (continental coverage)', () => {
    // Regression: long earcut fan triangles used to trip the seam-collapse
    // heuristic, punching holes over Russia/Central Asia. The master
    // triangulation is now subdivided so only true discontinuities collapse.
    const s = mercator.normalizeScale
    const nTri = mercator.landPositions.length / 9
    const covers = (px: number, py: number): number => {
      let n = 0
      for (let t = 0; t < nTri; t++) {
        const ax = mercator.landPositions[t * 9]
        const ay = mercator.landPositions[t * 9 + 1]
        const bx = mercator.landPositions[t * 9 + 3]
        const by = mercator.landPositions[t * 9 + 4]
        const cx = mercator.landPositions[t * 9 + 6]
        const cy = mercator.landPositions[t * 9 + 7]
        const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if (Math.abs(d) < 1e-12) continue
        const w1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d
        const w2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d
        if (w1 >= -1e-6 && w2 >= -1e-6 && 1 - w1 - w2 >= -1e-6) n++
      }
      return n
    }
    const merc = getProjection('mercator')
    const samples: [number, number][] = [
      [60, 55], // Russia
      [45, 60], // western Russia
      [90, 50], // Central Asia
      [138, 36], // Japan
      [-100, 40], // CONUS
      [-60, -10], // Brazil
      [15, 62], // Sweden
    ]
    for (const [lon, lat] of samples) {
      const p = merc.projectPoint(lon * D2R, lat * D2R)
      expect(covers(p.x * s, p.y * s)).toBeGreaterThan(0)
    }
  })
  it('mercator bake collapses an explicit antimeridian-straddling triangle', () => {
    const seamMaster = {...master,landTri:{lon:new Float64Array([179,181,179]),lat:new Float64Array([10,10,12])}}
    const baked = bakeProjectionSync('mercator',seamMaster,graticule)
    for(let i=3;i<9;i+=3) expect(Array.from(baked.landPositions.slice(i,i+3))).toEqual(Array.from(baked.landPositions.slice(0,3)))
  })
  it('orthographic invalidates back-hemisphere Tissot nodes', () => {
    const ortho = bakeProjectionSync('orthographic', master, graticule)
    const n = ortho.tissotParams.length / 4
    let invalid = 0
    for (let i = 0; i < n; i++) if (ortho.tissotParams[i * 4 + 3] === 0) invalid++
    expect(invalid / n).toBeGreaterThan(0.3)
  })
})
