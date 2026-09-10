import { runCooperatively } from '../utils/cooperative'
import { loadPreparedGeometry, loadPreset } from './assets'
/**
 * Bake pipeline: master geodetic geometry → per-projection parallel
 * Float32Arrays (design.md §7.2 step 1). Everything the GPU needs is baked
 * once here; morphs between projections are pure uniform updates because all
 * projections share the same vertex order (same master geometry).
 *
 * Interrupted/clipped projections (authagraph seams, orthographic back
 * hemisphere, mercator pole rows) keep the shared vertex count: invalid or
 * seam-crossing triangles/segments are COLLAPSED to degenerate (zero-area)
 * at the first valid vertex, so morphs remain 1:1.
 */
import { surfacePositionsWork } from './surface'
import labelsData from '../data/labels.json'
import { tissotAt } from './distortion'
import {
  type GraticuleData,
  type MasterGeometry,
} from './geometry'
import { D2R, getProjection, spherePoint } from './projections'
import type {
  BakeOptions,
  BakedProjection,
  InversePointFn,
  ProjectionId,
  ProjectPointFn,
} from './types'
import './authagraph' // registers the authagraph projection

export interface LabelAnchor {
  id: string
  name: string
  lon: number
  lat: number
  kind: string
  priority: number
  hide?: string[]
}

export const LABEL_ANCHORS: LabelAnchor[] = labelsData.labels as LabelAnchor[]

/** Stagger: morph peels from the antimeridian inward (0 at ±180°, 1 at 0°). */
function staggerFromLon(lonDeg: number): number {
  return 1 - Math.min(1, Math.abs(lonDeg) / 180)
}

interface RawPoint {
  x: number
  y: number
  z: number
  ok: boolean
}

/** Project one master vertex for the given projection. */
function makeProjector(
  id: ProjectionId,
  pointFn?: ProjectPointFn,
): (lonDeg: number, latDeg: number) => RawPoint {
  if (id === 'globe') {
    return (lonDeg, latDeg) => {
      const p = spherePoint(lonDeg * D2R, latDeg * D2R)
      return { x: p.x, y: p.y, z: p.z, ok: true }
    }
  }
  const fn =
    pointFn ??
    ((lon: number, lat: number) => getProjection(id).projectPoint(lon, lat))
  return (lonDeg, latDeg) => {
    const p = fn(lonDeg * D2R, latDeg * D2R)
    const ok = Number.isFinite(p.x) && Number.isFinite(p.y)
    return { x: p.x, y: p.y, z: 0, ok }
  }
}

/**
 * Bake one projection against shared master geometry.
 * `pointFn`/`frame`/`invert` allow custom (lab/user) projections; canonical
 * projections are resolved from the registry.
 */
function* bakeWork(
  key: string,
  pointFn: ProjectPointFn | undefined,
  frame: { halfWidth: number; halfHeight: number },
  master: MasterGeometry,
  graticule: GraticuleData,
  opts: BakeOptions = {},
  invert: InversePointFn | null = null,
  isMercatorLikeClamp = false,
): Generator<void, BakedProjection> {
  void invert
  const isFlat = key !== 'globe'
  const project = makeProjector(key as ProjectionId, pointFn)
  // Aspect-corrected normalization: larger frame axis → [−1, 1].
  const normalizeScale = isFlat ? 1 / Math.max(frame.halfWidth, frame.halfHeight) : 1
  const maxJumpRaw = 0.3 * Math.max(frame.halfWidth, frame.halfHeight)

  /* ---- land triangles ---- */
  const nLand = master.landTri.lon.length
  const landPositions = new Float32Array(nLand * 3)
  const landStagger = new Float32Array(nLand)
  const logArea = new Float32Array(nLand)
  const omega = new Float32Array(nLand)
  for (let t = 0; t < nLand; t += 3) {
    if (t % 192 === 0) yield
    const lons = [master.landTri.lon[t], master.landTri.lon[t + 1], master.landTri.lon[t + 2]]
    const lats = [master.landTri.lat[t], master.landTri.lat[t + 1], master.landTri.lat[t + 2]]
    const pts = lons.map((lo, k) => project(lo, lats[k]))
    let ok = pts.every((p) => p.ok)
    if (ok && isFlat) {
      for (let e = 0; e < 3 && ok; e++) {
        const a = pts[e]
        const b = pts[(e + 1) % 3]
        if (Math.hypot(a.x - b.x, a.y - b.y) > maxJumpRaw) ok = false // facet seam
      }
    }
    if (!ok) {
      // collapse to the first valid vertex (degenerate, invisible)
      const anchor = pts.find((p) => p.ok) ?? { x: 0, y: 0, z: -2, ok: true }
      for (let k = 0; k < 3; k++) {
        landPositions[(t + k) * 3] = anchor.x * normalizeScale
        landPositions[(t + k) * 3 + 1] = anchor.y * normalizeScale
        landPositions[(t + k) * 3 + 2] = isFlat ? 0 : anchor.z * normalizeScale
        landStagger[t + k] = staggerFromLon(lons[0])
      }
      continue
    }
    for (let k = 0; k < 3; k++) {
      landPositions[(t + k) * 3] = pts[k].x * normalizeScale
      landPositions[(t + k) * 3 + 1] = pts[k].y * normalizeScale
      landPositions[(t + k) * 3 + 2] = isFlat ? 0 : pts[k].z * normalizeScale
      landStagger[t + k] = staggerFromLon(lons[k])
      if (isFlat) {
        const tp = tissotAt(
          (lo, la) => pointOrRegistered(key, pointFn, lo, la),
          lons[k] * D2R,
          lats[k] * D2R,
        )
        logArea[t + k] = tp.valid && tp.areaScale > 0 ? Math.log2(tp.areaScale) : 0
        omega[t + k] = tp.valid ? tp.omega : 0
        if (isMercatorLikeClamp && Math.abs(lats[k]) > 85) {
          logArea[t + k] = Math.log2(1 / Math.cos(85 * D2R) ** 2)
        }
      }
    }
  }

  /* ---- lake overlay triangles (ocean fill cutouts) ---- */
  const nLake = master.lakeTri.lon.length
  const lakePositions = new Float32Array(nLake * 3)
  const lakeStagger = new Float32Array(nLake)
  for (let t = 0; t < nLake; t += 3) {
    if (t % 768 === 0) yield
    const points = [0, 1, 2].map(k => project(master.lakeTri.lon[t + k], master.lakeTri.lat[t + k]))
    const valid = points.every(p => p.ok) && (!isFlat || points.every((p, k) => Math.hypot(p.x - points[(k + 1) % 3].x, p.y - points[(k + 1) % 3].y) <= maxJumpRaw))
    const anchor = points.find(p => p.ok) ?? { x: 0, y: 0, z: -2, ok: true }
    for (let k = 0; k < 3; k++) {
      const lo = master.lakeTri.lon[t + k]
      const p = valid ? points[k] : anchor
      lakePositions[(t + k) * 3] = (p.ok ? p.x : 0) * normalizeScale
      lakePositions[(t + k) * 3 + 1] = (p.ok ? p.y : 0) * normalizeScale
      lakePositions[(t + k) * 3 + 2] = isFlat ? 0 : (p.ok ? p.z : -2) * normalizeScale
      lakeStagger[t + k] = staggerFromLon(lo)
    }
  }

  /* ---- coastline + graticule segment pairs ---- */
  const bakeSegments = function* (
    segLon: Float64Array,
    segLat: Float64Array,
  ): Generator<void, { positions: Float32Array; stagger: Float32Array }> {
    const n = segLon.length
    const positions = new Float32Array(n * 3)
    const stagger = new Float32Array(n)
    for (let s = 0; s < n; s += 2) {
      if (s % 256 === 0) yield
      const a = project(segLon[s], segLat[s])
      const b = project(segLon[s + 1], segLat[s + 1])
      let ok = a.ok && b.ok
      if (ok && isFlat && Math.hypot(a.x - b.x, a.y - b.y) > maxJumpRaw) ok = false
      const write = (k: number, p: RawPoint, lonDeg: number) => {
        positions[(s + k) * 3] = p.x * normalizeScale
        positions[(s + k) * 3 + 1] = p.y * normalizeScale
        positions[(s + k) * 3 + 2] = isFlat ? 0 : p.z * normalizeScale
        stagger[s + k] = staggerFromLon(lonDeg)
      }
      if (ok) {
        write(0, a, segLon[s])
        write(1, b, segLon[s + 1])
      } else {
        const anchor = a.ok ? a : b.ok ? b : { x: 0, y: 0, z: -2, ok: true }
        write(0, anchor, segLon[s])
        write(1, anchor, segLon[s + 1])
      }
    }
    return { positions, stagger }
  }
  const coast = yield* bakeSegments(master.coastSeg.lon, master.coastSeg.lat)
  const grat = yield* bakeSegments(graticule.lon, graticule.lat)

  /* ---- Tissot instances (15° nodes + pole rows) ---- */
  const step = opts.tissotStepDeg ?? 15
  const nodes: { lon: number; lat: number }[] = []
  for (let lat = -75; lat <= 75; lat += step) {
    for (let lon = -180; lon < 180; lon += step) nodes.push({ lon, lat })
  }
  for (let lon = -180; lon < 180; lon += step) {
    nodes.push({ lon, lat: 90 })
    nodes.push({ lon, lat: -90 })
  }
  const nT = nodes.length
  const tissotPositions = new Float32Array(nT * 3)
  const tissotParams = new Float32Array(nT * 4)
  const tissotLonLat = new Float32Array(nT * 2)
  for (let i = 0; i < nT; i++) {
    const { lon, lat } = nodes[i]
    tissotLonLat[i * 2] = lon * D2R
    tissotLonLat[i * 2 + 1] = lat * D2R
    const p = project(lon, lat)
    let valid = p.ok
    if (isMercatorLikeClamp && Math.abs(lat) >= 85) valid = false
    let s1 = 1
    let s2 = 1
    let rot = 0
    if (isFlat && valid) {
      const tp = tissotAt(
        (lo, la) => pointOrRegistered(key, pointFn, lo, la),
        lon * D2R,
        lat * D2R,
      )
      valid = valid && tp.valid
      s1 = tp.sigma1 * normalizeScale
      s2 = tp.sigma2 * normalizeScale
      rot = tp.rotation
      // Display cap: σ1 → ∞ at true singularities (authagraph vertices, pole
      // lines); uncapped ellipses would span the whole map. Overlay scalars
      // (logArea/omega) stay uncapped — this caps ONLY the ellipse glyph size.
      const SIGMA_DISPLAY_CAP = 2.0
      if (s1 > SIGMA_DISPLAY_CAP) {
        s2 = Math.min(s2, (SIGMA_DISPLAY_CAP * s2) / s1)
        s1 = SIGMA_DISPLAY_CAP
      }
    }
    tissotPositions[i * 3] = (p.ok ? p.x : 0) * normalizeScale
    tissotPositions[i * 3 + 1] = (p.ok ? p.y : 0) * normalizeScale
    tissotPositions[i * 3 + 2] = isFlat ? 0.001 : (p.ok ? p.z : 0) * 1.002
    tissotParams[i * 4] = s1
    tissotParams[i * 4 + 1] = s2
    tissotParams[i * 4 + 2] = rot
    tissotParams[i * 4 + 3] = valid ? 1 : 0
  }

  /* ---- label anchors ---- */
  const nL = LABEL_ANCHORS.length
  const labelPositions = new Float32Array(nL * 3)
  for (let i = 0; i < nL; i++) {
    const a = LABEL_ANCHORS[i]
    const p = project(a.lon, a.lat)
    labelPositions[i * 3] = (p.ok ? p.x : 0) * normalizeScale
    labelPositions[i * 3 + 1] = (p.ok ? p.y : 0) * normalizeScale
    labelPositions[i * 3 + 2] = isFlat ? 0.002 : (p.ok ? p.z : 0) * 1.002
  }

  const bounds = isFlat
    ? {
        minX: -frame.halfWidth * normalizeScale,
        maxX: frame.halfWidth * normalizeScale,
        minY: -frame.halfHeight * normalizeScale,
        maxY: frame.halfHeight * normalizeScale,
      }
    : { minX: -1, minY: -1, maxX: 1, maxY: 1 }

  return {
    id: key as ProjectionId,
    surfacePositions: yield* surfacePositionsWork(!isFlat, isFlat ? (lo, la) => pointOrRegistered(key, pointFn, lo, la) : null, normalizeScale),
    landPositions,
    landOverlay: { logArea, omega },
    lakePositions,
    lakeStagger,
    coastlinePositions: coast.positions,
    graticulePositions: grat.positions,
    graticuleEmphasis: graticule.emphasis,
    tissotPositions,
    tissotParams,
    tissotLonLat,
    labelPositions,
    landStagger,
    coastlineStagger: coast.stagger,
    graticuleStagger: grat.stagger,
    bounds,
    normalizeScale,
    vertexCount: nLand,
  }
}

export function bakeFromFunction(...args: Parameters<typeof bakeWork>): BakedProjection {
  const work = bakeWork(...args)
  for (;;) { const step = work.next(); if (step.done) return step.value }
}

export function bakeFromFunctionAsync(...args: Parameters<typeof bakeWork>): Promise<BakedProjection> {
  return runCooperatively(bakeWork(...args), 4, args[5]?.signal)
}

function pointOrRegistered(
  key: string,
  fn: ProjectPointFn | undefined,
  lon: number,
  lat: number,
): { x: number; y: number } {
  if (fn) return fn(lon, lat)
  return getProjection(key as ProjectionId).projectPoint(lon, lat)
}

/* ---------------- cache + canonical API ---------------- */

const cache = new Map<string, BakedProjection>()
/** Generated topology and probes are fetched only for custom Python runs. */
export function initBakeSystem(opts: BakeOptions = {}) {
  return loadPreparedGeometry(opts.quality ?? 'overview')
}

/** Defaults are generated from the exact teaching Python, never baked at startup. */
export function bakeProjection(id: ProjectionId, opts: BakeOptions = {}): Promise<BakedProjection> {
  return loadPreset(id, opts.quality ?? 'overview')
}

/** Synchronous bake when the caller already has master geometry (tests). */
export function bakeProjectionSync(
  id: ProjectionId,
  master: MasterGeometry,
  graticule: GraticuleData,
  opts: BakeOptions = {},
): BakedProjection {
  return bakeFromFunction(
    id,
    undefined,
    getProjection(id).frame,
    master,
    graticule,
    opts,
    getProjection(id).invertPoint,
    id === 'mercator',
  )
}

/** Bake a custom (lab/user) projection into the same shared-vertex format. */
export async function bakeCustomProjection(
  key: string,
  pointFn: ProjectPointFn,
  frame: { halfWidth: number; halfHeight: number },
  opts: BakeOptions = {},
): Promise<BakedProjection> {
  const { master, graticule } = await initBakeSystem(opts)
  const baked = await bakeFromFunctionAsync(key, pointFn, frame, master, graticule, opts)
  registerBaked(key, baked)
  return baked
}

export function getBaked(id: string): BakedProjection | undefined {
  return cache.get(id)
}

export function registerBaked(key: string, baked: BakedProjection): void {
  cache.set(key, baked)
  while (cache.size > 4) cache.delete(cache.keys().next().value!)
}

/** Test hook. */
export function clearBakeCache(): void {
  cache.clear()
}
