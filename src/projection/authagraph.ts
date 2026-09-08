/**
 * AuthaGraph — Hajime Narukawa's 2022 published formulation.
 *
 * This is a TypeScript port of mapshaper's `+proj=narukawa2022`
 * (src/crs/mapshaper-narukawa2022.mjs, © Matthew Bloch, MPL-2.0 — this file is
 * a derivative work under MPL-2.0; the mapshaper source header is reproduced
 * below). The facet transform uses Narukawa's published 2022 equations
 * (DOI 10.11212/jjca.60.1_1, J-STAGE free PDF); the rectangular facet routing
 * follows the public Imago arrangement by Justin Kunimune.
 *
 *   Facet formula:
 *     H. Narukawa, "Formulation of AuthaGraph Map Projection" (2022)
 *     https://www.jstage.jst.go.jp/article/jjca/60/1/60_1/_article/-char/en
 *
 * Honesty note (per the paper itself): the 2022 formulation redefines the
 * original hand-built "curved tetrahedron" as 4 congruent cones (<4% radial
 * deviation) so closed-form equations exist; equal-area holds only at the
 * 96-region (△NPO) level, not infinitesimally — the design is deliberately
 * multi-objective.
 */
import authagraphData from '../data/authagraph.json'
import { registerProjection, wrapLon } from './projections'

export const AUTHAGRAPH_IMPLEMENTATION_NOTE =
  'Full port of Narukawa’s 2022 published formulation (DOI 10.11212/jjca.60.1_1): ' +
  'per-point tetrahedral face routing over the four published vertices, the published ' +
  'forward equations θ = atan((2√3/π)(λ − asin(sin λ/√3))) and ' +
  'r = √3(2 + cos λ) / ((2 + √2 tan ρc) cos θ), unfolded into the 4√3:3 rectangle ' +
  'via the public Imago facet arrangement (mapshaper narukawa2022, MPL-2.0). ' +
  'This is Narukawa’s mathematical approximation of the hand-built commercial map: ' +
  'equal-area at the 96-region level only, not infinitesimally.'

const D2R = Math.PI / 180
const HALF_PI = Math.PI / 2
const SQRT2 = Math.SQRT2
const SQRT3 = Math.sqrt(3)
const ASIN_ONE_THIRD = Math.asin(1 / 3)
/** acos(-1/3)/2 — tetrahedron edge scale; the published frame is multiplied by this. */
export const AUTHAGRAPH_EDGE_SCALE = Math.acos(-1 / 3) / 2

export const AUTHAGRAPH_FRAME = {
  halfWidth: 2 * SQRT3 * AUTHAGRAPH_EDGE_SCALE,
  halfHeight: 1.5 * AUTHAGRAPH_EDGE_SCALE,
}

const XMIN = -2 * SQRT3
const XMAX = 2 * SQRT3
const YMIN = -1.5
const YMAX = 1.5
const BLOCK_HEIGHT = 2 * SQRT3
const LAYOUT_SHIFT = 1.16
const EPS = 1e-12

/** Published tetrahedron vertices (lat, lon degrees) from src/data/authagraph.json. */
export const AUTHAGRAPH_VERTICES: ReadonlyArray<readonly [number, number]> =
  authagraphData.tetrahedron.vertices.map((v) => [v.lat, v.lon] as const)

/** Cone half-apex angle θ = atan(1/√2) ≈ 35.264° (paper §2.1). */
export const AUTHAGRAPH_CONE_HALF_ANGLE = Math.atan(1 / SQRT2)

interface Facet {
  id: number
  x: number
  y: number
  lat: number
  lon: number
  meridian: number
  rotation: number
}

/**
 * D3 Imago's vertex-oriented tetrahedral block: planar center, spherical
 * center (lat, lon in canonical frame), local meridian, planar rotation.
 */
const FACET_DEFS: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [0, SQRT3, HALF_PI, 0, 0, -HALF_PI],
  [0, -SQRT3, -ASIN_ONE_THIRD, 0, Math.PI, HALF_PI],
  [3, 0, -ASIN_ONE_THIRD, (2 * Math.PI) / 3, Math.PI, (5 * Math.PI) / 6],
  [-3, 0, -ASIN_ONE_THIRD, (-2 * Math.PI) / 3, Math.PI, Math.PI / 6],
]

const facets: Facet[] = FACET_DEFS.map((def, i) => ({
  id: i,
  x: def[0],
  y: def[1],
  lat: def[2],
  lon: def[3],
  meridian: def[4],
  rotation: def[5],
}))

/* ---------------- vector helpers ---------------- */

type V3 = [number, number, number]

function radiansToVector(lam: number, phi: number): V3 {
  const cosPhi = Math.cos(phi)
  return [Math.cos(lam) * cosPhi, Math.sin(lam) * cosPhi, Math.sin(phi)]
}

function dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function normalizeVector(a: V3): V3 {
  const k = 1 / Math.hypot(a[0], a[1], a[2])
  return [a[0] * k, a[1] * k, a[2] * k]
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function normalizeRadians(lam: number): number {
  while (lam > Math.PI) lam -= 2 * Math.PI
  while (lam < -Math.PI) lam += 2 * Math.PI
  return lam
}

/* ---------------- orientation (published vertices → canonical frame) ------ */

interface Orientation {
  x: V3
  y: V3
  z: V3
}

function createPublishedOrientation(): Orientation {
  // The third published vertex is the canonical southern vertex at longitude 0.
  const [nLat, nLon] = AUTHAGRAPH_VERTICES[0]
  const [sLat, sLon] = AUTHAGRAPH_VERTICES[2]
  const north = radiansToVector(nLon * D2R, nLat * D2R)
  const south = radiansToVector(sLon * D2R, sLat * D2R)
  const tangent = normalizeVector([
    south[0] - north[0] * dot(south, north),
    south[1] - north[1] * dot(south, north),
    south[2] - north[2] * dot(south, north),
  ])
  return { x: tangent, y: cross(north, tangent), z: north }
}

const orientation = createPublishedOrientation()

/** Geographic (lon, lat) → canonical tetrahedral frame (lon, lat). */
export function toCanonical(lon: number, lat: number): [number, number] {
  const v = radiansToVector(lon, lat)
  return [
    Math.atan2(dot(v, orientation.y), dot(v, orientation.x)),
    Math.asin(clamp(dot(v, orientation.z), -1, 1)),
  ]
}

/** Canonical frame → geographic (lon, lat). */
export function fromCanonical(lon: number, lat: number): [number, number] {
  const v = radiansToVector(lon, lat)
  const p: V3 = [
    orientation.x[0] * v[0] + orientation.y[0] * v[1] + orientation.z[0] * v[2],
    orientation.x[1] * v[0] + orientation.y[1] * v[1] + orientation.z[1] * v[2],
    orientation.x[2] * v[0] + orientation.y[2] * v[1] + orientation.z[2] * v[2],
  ]
  return [Math.atan2(p[1], p[0]), Math.asin(clamp(p[2], -1, 1))]
}

/* ---------------- spherical oblique transform per facet ---------------- */

/** Rotate (lat, lon) into the facet's oblique frame. Returns [lat1, lon1]. */
function obliquifySpherical(lat: number, lon: number, pole: Facet): [number, number] {
  const lat0 = pole.lat
  const lon0 = pole.lon
  const theta0 = pole.meridian
  let lat1: number
  let lon1: number
  if (Math.abs(lat0 - HALF_PI) < EPS) {
    lat1 = lat
    lon1 = lon - lon0
  } else {
    lat1 = Math.asin(
      clamp(
        Math.sin(lat0) * Math.sin(lat) +
          Math.cos(lat0) * Math.cos(lat) * Math.cos(lon0 - lon),
        -1,
        1,
      ),
    )
    const denominator = Math.cos(lat1)
    const value =
      denominator < EPS
        ? 1
        : (Math.cos(lat0) * Math.sin(lat) -
            Math.sin(lat0) * Math.cos(lat) * Math.cos(lon0 - lon)) /
          denominator
    lon1 = Math.acos(clamp(value, -1, 1)) - Math.PI
    if (Math.sin(lon - lon0) > 0) lon1 = -lon1
  }
  return [lat1, normalizeRadians(lon1 - theta0)]
}

function deobliquifySpherical(lat: number, lon: number, pole: Facet): [number, number] {
  const lat0 = pole.lat
  const lon0 = pole.lon
  const lonIn = lon + pole.meridian
  const latOut = Math.asin(
    clamp(
      Math.sin(lat0) * Math.sin(lat) - Math.cos(lat0) * Math.cos(lonIn) * Math.cos(lat),
      -1,
      1,
    ),
  )
  let lonOut: number
  if (Math.abs(lat0 - HALF_PI) < EPS) {
    lonOut = lonIn + lon0
  } else {
    const value =
      Math.sin(lat) / Math.cos(lat0) / Math.cos(latOut) - Math.tan(lat0) * Math.tan(latOut)
    if (Math.sin(lonIn) > 0) lonOut = lon0 + Math.acos(clamp(value, -1, 1))
    else lonOut = lon0 - Math.acos(clamp(value, -1, 1))
  }
  return [latOut, normalizeRadians(lonOut)]
}

/* ---------------- Narukawa 2022 face equations ---------------- */

/**
 * Published facet forward (paper eqs. 〈2.19〉–〈2.23〉, as implemented by
 * mapshaper narukawaFaceForward). Input: facet-relative longitude λ ∈
 * (−π/3, π/3) and facet colatitude-complement φ (oblique latitude).
 * Returns polar (r, θ) in the unfolded face plane.
 *   a = λ − asin(sin λ / √3)           (spherical-excess area term 〈2.16〉)
 *   θ = atan((2√3/π) · a)              (area-ratio condition 〈2.19〉)
 *   q = (2 + cos λ) / (2 + √2 tan φ)   (cone generator ratio 〈2.3〉/〈2.11〉)
 *   r = q · √3 / cos θ
 */
export function narukawaFaceForward(lam: number, phi: number): [number, number] {
  const a = lam - Math.asin(clamp(Math.sin(lam) / SQRT3, -1, 1))
  const theta = Math.atan(((2 * SQRT3) / Math.PI) * a)
  const denominator = 2 + SQRT2 * Math.tan(phi)
  const q = denominator > 0 ? (2 + Math.cos(lam)) / denominator : 0
  const r = (q * SQRT3) / Math.cos(theta)
  return [r, theta]
}

/** Facet inverse (bisection on the monotonic λ(θ) map, then q → φ). */
function narukawaFaceInverse(r: number, theta: number): [number, number] {
  const target = (Math.tan(theta) * Math.PI) / (2 * SQRT3)
  let lo = -Math.PI / 3
  let hi = Math.PI / 3
  let lam = 0
  for (let i = 0; i < 55; i++) {
    lam = (lo + hi) / 2
    const a = lam - Math.asin(clamp(Math.sin(lam) / SQRT3, -1, 1))
    if (a < target) lo = lam
    else hi = lam
  }
  lam = (lo + hi) / 2
  const q = (r * Math.cos(theta)) / SQRT3
  const phi = q < EPS ? HALF_PI : Math.atan(((2 + Math.cos(lam)) / q - 2) / SQRT2)
  return [phi, lam]
}

/* ---------------- routing ---------------- */

export interface AuthagraphRouting {
  facet: number
  sector: number
}

interface RawFacetPoint {
  x: number
  y: number
  facet: number
  sector: number
}

function findForwardFacet(lam: number, phi: number): Facet {
  let best: Facet = facets[0]
  let bestLat = -Infinity
  for (const facet of facets) {
    const relative = obliquifySpherical(phi, lam, facet)
    if (relative[0] > bestLat) {
      bestLat = relative[0]
      best = facet
    }
  }
  return best
}

function projectFacetRaw(lam: number, phi: number, facet: Facet): RawFacetPoint {
  const relative = obliquifySpherical(phi, lam, facet)
  const sector = Math.floor((relative[1] + Math.PI / 3) / ((2 * Math.PI) / 3))
  const base = sector * ((2 * Math.PI) / 3)
  const polar = narukawaFaceForward(relative[1] - base, relative[0])
  const angle = polar[1] + facet.rotation + base / 2
  const x = polar[0] * Math.cos(angle) + facet.x
  const y = polar[0] * Math.sin(angle) + facet.y
  return { x, y, facet: facet.id, sector: ((sector % 3) + 3) % 3 }
}

/** Fold/rotate the raw facet plane into the 4√3×3 rectangle (Imago layout). */
function applyConditionalLayout(raw: RawFacetPoint, facet: Facet): { x: number; y: number } {
  let x = raw.x
  let y = raw.y
  if (Math.abs(x) > 3 + EPS) {
    x = 2 * facet.x - x
    y = -y
  } else if (Math.abs(y) > SQRT3 + EPS) {
    x = -x
    y = BLOCK_HEIGHT * Math.sign(y) - y
  }
  let qx = y
  let qy = -x
  if (qy > EPS) {
    qx = BLOCK_HEIGHT - qx
    qy = -qy
  }
  qx += LAYOUT_SHIFT
  if (qx < 0) qx += 2 * BLOCK_HEIGHT
  x = qx - BLOCK_HEIGHT
  y = qy + 1.5
  return { x: clamp(x, XMIN, XMAX), y: clamp(y, YMIN, YMAX) }
}

/**
 * Forward projection. Input geographic lon/lat in radians; output is in the
 * published frame scaled by EDGE_SCALE (x ∈ ±2√3·s, y ∈ ±1.5·s).
 */
export function authagraphPoint(lon: number, lat: number): { x: number; y: number } {
  const p = toCanonical(lon, lat)
  const facet = findForwardFacet(p[0], p[1])
  const raw = projectFacetRaw(p[0], p[1], facet)
  const q = applyConditionalLayout(raw, facet)
  return { x: q.x * AUTHAGRAPH_EDGE_SCALE, y: q.y * AUTHAGRAPH_EDGE_SCALE }
}

/** Forward projection with routing info (used by the construction sequence). */
export function authagraphRoute(lon: number, lat: number): AuthagraphRouting {
  const p = toCanonical(lon, lat)
  const facet = findForwardFacet(p[0], p[1])
  const raw = projectFacetRaw(p[0], p[1], facet)
  return { facet: raw.facet, sector: raw.sector }
}

/** Inverse projection (for pointer picking). Returns null outside the frame. */
export function authagraphInverse(
  x: number,
  y: number,
): { lon: number; lat: number } | null {
  const xs = x / AUTHAGRAPH_EDGE_SCALE
  const ys = y / AUTHAGRAPH_EDGE_SCALE
  if (xs < XMIN - 1e-9 || xs > XMAX + 1e-9 || ys < YMIN - 1e-9 || ys > YMAX + 1e-9) {
    return null
  }
  let qx = xs + BLOCK_HEIGHT
  let qy = ys - 1.5
  let normalizedX = (qx - LAYOUT_SHIFT) / BLOCK_HEIGHT
  if (normalizedX > 1.5) normalizedX -= 2
  if (normalizedX > 0.5) {
    normalizedX = 1 - normalizedX
    qy *= -1
  }
  qx = normalizedX * BLOCK_HEIGHT // facet-plane x… keep variable names faithful
  const px = -qy
  const py = qx

  let best: Facet = facets[0]
  let minDistance = Infinity
  for (const facet of facets) {
    const d = Math.hypot(px - facet.x, py - facet.y)
    if (d < minDistance) {
      minDistance = d
      best = facet
    }
  }
  const dx = px - best.x
  const dy = py - best.y
  const r = Math.hypot(dx, dy)
  const theta = normalizeRadians(Math.atan2(dy, dx) - best.rotation)
  const base = Math.floor((theta + Math.PI / 6) / (Math.PI / 3)) * (Math.PI / 3)
  const relative = narukawaFaceInverse(r, theta - base)
  const relLon = relative[1] + base * 2
  const p = deobliquifySpherical(relative[0], relLon, best)
  const geo = fromCanonical(p[1], p[0])
  return { lon: wrapLon(geo[0]), lat: geo[1] }
}

/* ---------------- construction-sequence helpers ---------------- */

/**
 * Raw unfolded-net position: the published facet equations WITHOUT the final
 * rectangle packing (applyConditionalLayout). Output is a point inside one of
 * the four equilateral face triangles (edge 2√3, centered on the facet
 * centers (0,±√3),(±3,0)). Used by the AuthaGraph construction sequence's
 * "unfolded net" stage. Returns geographic-frame input in radians.
 */
export function authagraphFacetPoint(
  lon: number,
  lat: number,
): { x: number; y: number; facet: number; sector: number } {
  const p = toCanonical(lon, lat)
  const facet = findForwardFacet(p[0], p[1])
  const raw = projectFacetRaw(p[0], p[1], facet)
  return { x: raw.x, y: raw.y, facet: raw.facet, sector: raw.sector }
}

/** Rotate a canonical-frame 3D vector back to the geographic frame. */
export function canonicalVectorToGeographic(v: V3): V3 {
  return [
    orientation.x[0] * v[0] + orientation.y[0] * v[1] + orientation.z[0] * v[2],
    orientation.x[1] * v[0] + orientation.y[1] * v[1] + orientation.z[1] * v[2],
    orientation.x[2] * v[0] + orientation.y[2] * v[1] + orientation.z[2] * v[2],
  ]
}

/**
 * The published pre-projection (paper §2.3): gnomonic transfer sphere → cone.
 * Each point is placed on its facet's cone (apex at the canonical tetrahedron
 * vertex, half-apex angle θ = atan(1/√2)) at the published generator distance
 * NQ₁ = sin ρ / sin(ρ + θ). Returns a 3D vector in the GEOGRAPHIC frame so
 * the construction sequence can morph globe → cones without a visual spin.
 */
export function authagraphConePoint(lon: number, lat: number): V3 {
  const [clam, cphi] = toCanonical(lon, lat)
  const facet = findForwardFacet(clam, cphi)
  const [lat1] = obliquifySpherical(cphi, clam, facet)
  const rho = HALF_PI - lat1 // colatitude from the facet vertex
  const n = radiansToVector(facet.lon, facet.lat) // canonical vertex direction
  const q = radiansToVector(clam, cphi)
  const qDotN = dot(q, n)
  const e: V3 = [q[0] - qDotN * n[0], q[1] - qDotN * n[1], q[2] - qDotN * n[2]]
  const eLen = Math.hypot(e[0], e[1], e[2])
  const nq1 = Math.sin(rho) / Math.sin(rho + AUTHAGRAPH_CONE_HALF_ANGLE) // 〈2.3〉
  const cosT = Math.cos(AUTHAGRAPH_CONE_HALF_ANGLE)
  const sinT = Math.sin(AUTHAGRAPH_CONE_HALF_ANGLE)
  const g: V3 =
    eLen < 1e-12
      ? [-cosT * n[0], -cosT * n[1], -cosT * n[2]]
      : [
          -cosT * n[0] + (sinT * e[0]) / eLen,
          -cosT * n[1] + (sinT * e[1]) / eLen,
          -cosT * n[2] + (sinT * e[2]) / eLen,
        ]
  const p: V3 = [n[0] + nq1 * g[0], n[1] + nq1 * g[1], n[2] + nq1 * g[2]]
  return canonicalVectorToGeographic(p)
}

/** Canonical-frame tetrahedron vertices as (lon, lat) radians. */
export const CANONICAL_VERTICES: ReadonlyArray<readonly [number, number]> = facets.map(
  (f) => [f.lon, f.lat] as const,
)

/* ---------------- registration ---------------- */

registerProjection({
  id: 'authagraph',
  name: 'AuthaGraph (Narukawa 2022)',
  isGlobe: false,
  project: (lon, lat) => {
    const n = lon.length
    const x = new Float64Array(n)
    const y = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      const p = authagraphPoint(lon[i], lat[i])
      x[i] = p.x
      y[i] = p.y
    }
    return { x, y }
  },
  projectPoint: authagraphPoint,
  invertPoint: authagraphInverse,
  frame: AUTHAGRAPH_FRAME,
})
