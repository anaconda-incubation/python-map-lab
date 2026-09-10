/**
 * Geography pipeline: vendored Natural Earth GeoJSON → densified geodetic
 * master geometry (lon/lat, degrees) that every projection bake shares, so
 * morph targets correspond 1:1 at the vertex level.
 *
 * Key rules:
 * - Densification happens in GEODETIC space (max segment ≈ 1°) and is
 *   antimeridian-safe: rings are unwrapped to a continuous longitude frame
 *   before subdivision/triangulation, so no segment ever spans >180°.
 * - Land polygons are triangulated with earcut (holes supported; lakes are
 *   additionally emitted as a separate overlay triangle soup, per design).
 */
import earcut from 'earcut'
import { D2R, R2D } from './projections'

export interface GeoJSONGeometry {
  type: string
  coordinates: unknown
}
export interface GeoJSONFeature {
  type: 'Feature'
  properties?: Record<string, unknown>
  geometry: GeoJSONGeometry
}
export interface GeoJSONCollection {
  type: 'FeatureCollection'
  features: GeoJSONFeature[]
}
export interface GeoData {
  land: GeoJSONCollection
  lakes: GeoJSONCollection
  coastline: GeoJSONCollection
}

/** Non-indexed triangle soup / segment-pair soup in geodetic degrees. */
export interface MasterGeometry {
  landTri: { lon: Float64Array; lat: Float64Array }
  lakeTri: { lon: Float64Array; lat: Float64Array }
  coastSeg: { lon: Float64Array; lat: Float64Array }
  landRings: number[][][] // densified, unwrapped lon rings (for reuse/debug)
}

let geoCache: Promise<GeoData> | null = null

/** Fetch the vendored Natural Earth files (public/geo). Cached. */
export function loadGeoData(base = './geo'): Promise<GeoData> {
  if (!geoCache) {
    const get = async (name: string): Promise<GeoJSONCollection> => {
      const res = await fetch(`${base}/${name}`)
      if (!res.ok) throw new Error(`failed to load ${name}: ${res.status}`)
      return (await res.json()) as GeoJSONCollection
    }
    geoCache = Promise.all([
      get('ne_50m_land.geojson'),
      get('ne_50m_lakes.geojson'),
      get('ne_50m_coastline.geojson'),
    ]).then(([land, lakes, coastline]) => ({ land, lakes, coastline }))
  }
  return geoCache
}

/** Test hook: reset the memoized fetch (e.g. custom base URLs). */
export function resetGeoCache(): void {
  geoCache = null
}

/* ---------------- antimeridian-safe densification ---------------- */

function unwrapDelta(prev: number, next: number): number {
  let d = next - prev
  while (d > 180) d -= 360
  while (d < -180) d += 360
  return d
}

/**
 * Densify a lon/lat polyline so no GEODETIC segment exceeds `maxDeg`,
 * working in an unwrapped longitude frame. Returns unwrapped [lon, lat][]
 * (longitudes may leave [−180, 180]; callers wrap when emitting).
 */
export function densifyPolyline(
  coords: ReadonlyArray<readonly [number, number]>,
  maxDeg = 1,
): number[][] {
  if (coords.length === 0) return []
  const out: number[][] = [[coords[0][0], coords[0][1]]]
  let cursor = coords[0][0]
  for (let i = 1; i < coords.length; i++) {
    const [rawLon, lat] = coords[i]
    // A GeoJSON polar cap explicitly closes along the full ±180° pole edge.
    // Collapsing that edge to zero unwraps Antarctica into an inverted strip.
    const previous = coords[i - 1]
    const polarClosure = Math.abs(previous[1]) === 90 && lat === previous[1] && Math.abs(rawLon - previous[0]) >= 359.999
    const dLon = polarClosure ? rawLon - previous[0] : unwrapDelta(cursor, rawLon)
    const nextLon = cursor + dLon
    const span = Math.max(Math.abs(dLon), Math.abs(lat - out[out.length - 1][1]))
    const steps = Math.max(1, Math.ceil(span / maxDeg))
    const [prevLon, prevLat] = out[out.length - 1]
    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      out.push([prevLon + (nextLon - prevLon) * t, prevLat + (lat - prevLat) * t])
    }
    cursor = nextLon
  }
  return out
}

/** Wrap a degree longitude into (−180, 180]. */
export function wrapLonDeg(lon: number): number {
  let l = lon % 360
  if (l <= -180) l += 360
  if (l > 180) l -= 360
  return l
}

/* ---------------- triangulation ---------------- */

/**
 * Triangulate one polygon (array of rings: exterior + holes) of densified,
 * unwrapped [lon, lat] points. Returns a triangle-soup vertex list in
 * degrees (unwrapped frame preserved).
 */
export function triangulatePolygon(rings: number[][][]): number[][] {
  if (rings.length === 0 || rings[0].length < 3) return []
  const flat: number[] = []
  const holeIndices: number[] = []
  let offset = 0
  for (let r = 0; r < rings.length; r++) {
    let ring = rings[r]
    // drop duplicated closing vertex
    if (
      ring.length > 1 &&
      Math.abs(ring[0][0] - ring[ring.length - 1][0]) < 1e-9 &&
      Math.abs(ring[0][1] - ring[ring.length - 1][1]) < 1e-9
    ) {
      ring = ring.slice(0, -1)
    }
    if (r > 0) holeIndices.push(offset)
    for (const [x, y] of ring) flat.push(x, y)
    offset += ring.length
  }
  const indices = earcut(flat, holeIndices.length ? holeIndices : undefined)
  const tris: number[][] = []
  for (let i = 0; i < indices.length; i++) {
    const k = indices[i] * 2
    tris.push([flat[k], flat[k + 1]])
  }
  return tris
}

/**
 * Recursively split a triangle soup so no GEODETIC edge span (lon or lat,
 * in the unwrapped frame) exceeds `maxSpanDeg`. Earcut produces large
 * interior fan triangles across big polygons (Eurasia spans >100°); after
 * projection those edges grow long enough to trip the bake's seam-collapse
 * heuristic, punching holes into interiors (Mercator Russia/Central Asia).
 * Subdividing in geodetic space keeps every source triangle small, so the
 * projected-edge collapse only ever fires on true discontinuities.
 */
export function subdivideTriangleSoup(tris: number[][], maxSpanDeg = 3): number[][] {
  const out: number[][] = []
  const span = (a: number[], b: number[]) =>
    Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]))
  const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  // Longest-edge bisection: halves only the longest edge per step, which
  // keeps sliver earcut triangles from exploding into 4^k fragments.
  const emit = (a: number[], b: number[], c: number[], depth: number): void => {
    const sab = span(a, b)
    const sbc = span(b, c)
    const sca = span(c, a)
    const m = Math.max(sab, sbc, sca)
    if (depth <= 0 || m <= maxSpanDeg) {
      out.push(a, b, c)
      return
    }
    if (sab === m) {
      const ab = mid(a, b)
      emit(a, ab, c, depth - 1)
      emit(ab, b, c, depth - 1)
    } else if (sbc === m) {
      const bc = mid(b, c)
      emit(a, b, bc, depth - 1)
      emit(a, bc, c, depth - 1)
    } else {
      const ca = mid(c, a)
      emit(a, b, ca, depth - 1)
      emit(b, c, ca, depth - 1)
    }
  }
  for (let i = 0; i + 2 < tris.length; i += 3) emit(tris[i], tris[i + 1], tris[i + 2], 14)
  return out
}

function polygonsOf(collection: GeoJSONCollection): number[][][][] {
  const out: number[][][][] = []
  for (const f of collection.features) {
    const g = f.geometry
    if (!g) continue
    if (g.type === 'Polygon') out.push(g.coordinates as number[][][])
    else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates as number[][][][]) out.push(poly)
    }
  }
  return out
}

function linesOf(collection: GeoJSONCollection): number[][][] {
  const out: number[][][] = []
  for (const f of collection.features) {
    const g = f.geometry
    if (!g) continue
    if (g.type === 'LineString') out.push(g.coordinates as number[][])
    else if (g.type === 'MultiLineString') {
      for (const line of g.coordinates as number[][][]) out.push(line)
    }
  }
  return out
}

/**
 * Build the shared geodetic master geometry from vendored GeoJSON.
 * `maxTriSpanDeg` bounds the geodetic span of any land/lake triangle edge
 * (see subdivideTriangleSoup) so projection bakes never see long interior
 * edges that masquerade as discontinuity seams.
 */
export function buildMasterGeometry(
  geo: GeoData,
  densifyDeg = 1,
  maxTriSpanDeg = 3,
): MasterGeometry {
  const landLon: number[] = []
  const landLat: number[] = []
  const lakeLon: number[] = []
  const lakeLat: number[] = []
  const coastLon: number[] = []
  const coastLat: number[] = []
  const landRings: number[][][] = []

  for (const poly of polygonsOf(geo.land)) {
    const densified = poly.map(
      (ring) => densifyPolyline(ring as unknown as [number, number][], densifyDeg),
    )
    landRings.push(densified[0])
    // Keep the unwrapped longitude frame: independently wrapping vertices to
    // (−180, 180] would re-introduce ~360° jumps inside triangles/segments
    // that straddle the antimeridian. Projection fns wrap internally.
    for (const [x, y] of subdivideTriangleSoup(triangulatePolygon(densified), maxTriSpanDeg)) {
      landLon.push(x)
      landLat.push(y)
    }
  }
  for (const poly of polygonsOf(geo.lakes)) {
    const densified = poly.map(
      (ring) => densifyPolyline(ring as unknown as [number, number][], densifyDeg),
    )
    for (const [x, y] of subdivideTriangleSoup(triangulatePolygon(densified), maxTriSpanDeg)) {
      lakeLon.push(x)
      lakeLat.push(y)
    }
  }
  for (const line of linesOf(geo.coastline)) {
    const dense = densifyPolyline(line as unknown as [number, number][], densifyDeg)
    for (let i = 1; i < dense.length; i++) {
      coastLon.push(dense[i - 1][0], dense[i][0])
      coastLat.push(dense[i - 1][1], dense[i][1])
    }
  }
  return {
    landTri: { lon: Float64Array.from(landLon), lat: Float64Array.from(landLat) },
    lakeTri: { lon: Float64Array.from(lakeLon), lat: Float64Array.from(lakeLat) },
    coastSeg: { lon: Float64Array.from(coastLon), lat: Float64Array.from(coastLat) },
    landRings,
  }
}

/* ---------------- graticule ---------------- */

export interface GraticuleData {
  lon: Float64Array // segment pairs, degrees
  lat: Float64Array
  emphasis: Float32Array // per segment vertex: 1 = equator/prime meridian
}

/**
 * 10° graticule as segment pairs (sampled every `sampleDeg`). Equator and
 * prime meridian carry emphasis 1 (rendered at 1.6× alpha).
 */
export function buildGraticule(stepDeg = 10, sampleDeg = 1): GraticuleData {
  const lon: number[] = []
  const lat: number[] = []
  const em: number[] = []
  // meridians
  for (let m = -180; m <= 180; m += stepDeg) {
    const e = m === 0 ? 1 : 0
    for (let p = -90; p < 90; p += sampleDeg) {
      lon.push(m, m)
      lat.push(p, p + sampleDeg)
      em.push(e, e)
    }
  }
  // parallels (skip the poles themselves)
  for (let p = -90 + stepDeg; p <= 90 - stepDeg; p += stepDeg) {
    const e = p === 0 ? 1 : 0
    for (let m = -180; m < 180; m += sampleDeg) {
      lon.push(m, m + sampleDeg)
      lat.push(p, p)
      em.push(e, e)
    }
  }
  return {
    lon: Float64Array.from(lon),
    lat: Float64Array.from(lat),
    emphasis: Float32Array.from(em),
  }
}

/* ---------------- geodesic circle (Move-a-Circle) ---------------- */

/**
 * Points on a geodesic circle: great-circle distance `radiusDeg` from the
 * center, `n` vertices. Destination-point formula on the unit sphere.
 */
export function geodesicCircle(
  centerLonDeg: number,
  centerLatDeg: number,
  radiusDeg: number,
  n = 96,
): { lon: Float64Array; lat: Float64Array } {
  const lon1 = centerLonDeg * D2R
  const lat1 = centerLatDeg * D2R
  const d = radiusDeg * D2R
  const lon = new Float64Array(n)
  const lat = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const brng = (i / n) * 2 * Math.PI
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng),
    )
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
        Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
      )
    lon[i] = lon2 * R2D
    lat[i] = lat2 * R2D
  }
  return { lon, lat }
}

/* ---------------- region polygons (areas.json) ---------------- */

export interface RegionDef {
  id: string
  name: string
  areaKm2: number
  vsGreenland: number
  region:
    | { type: 'rect'; lon: [number, number]; lat: [number, number] }
    | { type: 'poly'; ring: number[][] }
}

/** Region outline as a densified, antimeridian-safe [lon, lat][] ring. */
export function regionRing(def: RegionDef, densifyDeg = 1): number[][] {
  const r = def.region
  const raw: [number, number][] =
    r.type === 'rect'
      ? [
          [r.lon[0], r.lat[0]],
          [r.lon[1], r.lat[0]],
          [r.lon[1], r.lat[1]],
          [r.lon[0], r.lat[1]],
          [r.lon[0], r.lat[0]],
        ]
      : (r.ring.map((p) => [p[0], p[1]]) as [number, number][])
  return densifyPolyline(raw, densifyDeg)
}

/**
 * Spherical excess area of a lon/lat ring (steradians, R=1) via Chamberlain
 * & Duquette (the same estimator d3.geoArea uses). For tests and the AREA
 * TEST interactive.
 */
export function sphericalRingArea(ring: number[][]): number {
  let sum = 0
  for (let i = 1; i < ring.length; i++) {
    const [lon1, lat1] = ring[i - 1]
    const [lon2, lat2] = ring[i]
    const dLon = ((lon2 - lon1 + 540) % 360) - 180
    sum += (dLon * D2R) * (2 + Math.sin(lat1 * D2R) + Math.sin(lat2 * D2R))
  }
  return Math.abs(sum / 2)
}
