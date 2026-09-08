/**
 * Spherical forward projections, R = 1, with central-meridian support.
 *
 * Sources (see /mnt/agents/output/info-math.md):
 * - Mercator: Snyder 1987 USGS PP 1395 eqs. (7-1)-(7-3)
 * - Gall-Peters: cylindrical equal-area, phi0 = 45° (PROJ +proj=cea +lat_ts=45)
 * - Equal Earth: Šavrič, Patterson & Jenny 2018, DOI 10.1080/13658816.2018.1504949
 * - Mollweide: Snyder 1987 eqs. (25-1)-(25-4)
 */
import equalearth from '../data/equalearth.json'
import type { FlatProjectionId, ProjectionDef, ProjectionId } from './types'

const D2R = Math.PI / 180
const R2D = 180 / Math.PI
const HALF_PI = Math.PI / 2

/** Equal Earth published constants (vendored, src/data/equalearth.json). */
export const EE_A1 = equalearth.constants.A1
export const EE_A2 = equalearth.constants.A2
export const EE_A3 = equalearth.constants.A3
export const EE_A4 = equalearth.constants.A4
export const EE_M = Math.sqrt(3) / 2

/** Gall-Peters standard parallel. */
export const GP_PHI0 = Math.PI / 4

/** Mercator latitude clamp (design: ±85°). */
export const MERCATOR_MAX_LAT = 85 * D2R

type ScalarFn = (lon: number, lat: number) => { x: number; y: number }

function vectorize(fn: ScalarFn) {
  return (lon: Float64Array, lat: Float64Array) => {
    const n = lon.length
    const x = new Float64Array(n)
    const y = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      const p = fn(lon[i], lat[i])
      x[i] = p.x
      y[i] = p.y
    }
    return { x, y }
  }
}

/** Reduce longitude to (-π, π] relative to a central meridian. */
export function wrapLon(lon: number, lon0 = 0): number {
  let l = lon - lon0
  while (l > Math.PI) l -= 2 * Math.PI
  while (l <= -Math.PI) l += 2 * Math.PI
  return l
}

/* ---------------- Mercator ---------------- */

export function mercatorPoint(lon: number, lat: number, lon0 = 0): { x: number; y: number } {
  const phi = Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, lat))
  return { x: wrapLon(lon, lon0), y: Math.log(Math.tan(Math.PI / 4 + phi / 2)) }
}

export function mercatorInverse(x: number, y: number, lon0 = 0): { lon: number; lat: number } {
  return { lon: wrapLon(x + lon0), lat: HALF_PI - 2 * Math.atan(Math.exp(-y)) }
}

/* ---------------- Gall-Peters ---------------- */

export function gallPetersPoint(lon: number, lat: number, lon0 = 0): { x: number; y: number } {
  const c = Math.cos(GP_PHI0)
  return { x: wrapLon(lon, lon0) * c, y: Math.sin(lat) / c }
}

export function gallPetersInverse(x: number, y: number, lon0 = 0): { lon: number; lat: number } {
  const c = Math.cos(GP_PHI0)
  return { lon: wrapLon(x / c + lon0), lat: Math.asin(Math.max(-1, Math.min(1, y * c))) }
}

/* ---------------- Equal Earth ---------------- */

/** F(θ) = A1θ + A2θ³ + A3θ⁷ + A4θ⁹ (spacing of parallels). */
export function equalEarthF(theta: number): number {
  const t2 = theta * theta
  const t6 = t2 * t2 * t2
  return theta * (EE_A1 + EE_A2 * t2 + t6 * (EE_A3 + EE_A4 * t2))
}

/** F′(θ) = A1 + 3A2θ² + 7A3θ⁶ + 9A4θ⁸. */
export function equalEarthFPrime(theta: number): number {
  const t2 = theta * theta
  const t6 = t2 * t2 * t2
  return EE_A1 + 3 * EE_A2 * t2 + t6 * (7 * EE_A3 + 9 * EE_A4 * t2)
}

export function equalEarthPoint(lon: number, lat: number, lon0 = 0): { x: number; y: number } {
  const theta = Math.asin(EE_M * Math.sin(lat))
  const lam = wrapLon(lon, lon0)
  return {
    x: (lam * Math.cos(theta)) / (EE_M * equalEarthFPrime(theta)),
    y: equalEarthF(theta),
  }
}

/**
 * Inverse via Newton–Raphson on y to recover θ from F(θ), then
 * λ = M·x·F′(θ)/cos θ, φ = asin(sin θ / M)  (PROJ eqearth.cpp approach).
 */
export function equalEarthInverse(
  x: number,
  y: number,
  lon0 = 0,
): { lon: number; lat: number } | null {
  const maxY = equalEarthF(Math.asin(EE_M)) // 1.3173627591574
  if (Math.abs(y) > maxY + 1e-9) return null
  let theta = y // reasonable seed; θ ≈ y / F′ magnitude
  for (let i = 0; i < 16; i++) {
    const f = equalEarthF(theta) - y
    const fp = equalEarthFPrime(theta)
    const d = f / fp
    theta -= d
    if (Math.abs(d) < 1e-12) break
  }
  const cosT = Math.cos(theta)
  if (Math.abs(cosT) < 1e-12) {
    if (Math.abs(x) > 1e-9) return null
    return { lon: lon0, lat: Math.asin(Math.max(-1, Math.min(1, Math.sin(theta) / EE_M))) }
  }
  const lam = (EE_M * x * equalEarthFPrime(theta)) / cosT
  if (Math.abs(lam) > Math.PI + 1e-6) return null
  const s = Math.sin(theta) / EE_M
  if (Math.abs(s) > 1) return null
  return { lon: wrapLon(lam + lon0), lat: Math.asin(s) }
}

/* ---------------- Mollweide ---------------- */

/** Solve 2θ + sin 2θ = π sin φ by Newton–Raphson. */
export function mollweideTheta(lat: number): number {
  const s = Math.max(-1, Math.min(1, Math.sin(lat)))
  if (Math.abs(Math.abs(lat) - HALF_PI) < 1e-12) return Math.sign(lat) * HALF_PI
  let theta = lat
  for (let i = 0; i < 32; i++) {
    const d = (2 * theta + Math.sin(2 * theta) - Math.PI * s) / (2 + 2 * Math.cos(2 * theta))
    theta -= d
    if (Math.abs(d) < 1e-13) break
  }
  return theta
}

export function mollweidePoint(lon: number, lat: number, lon0 = 0): { x: number; y: number } {
  const theta = mollweideTheta(lat)
  const SQRT2 = Math.SQRT2
  return {
    x: ((2 * SQRT2) / Math.PI) * wrapLon(lon, lon0) * Math.cos(theta),
    y: SQRT2 * Math.sin(theta),
  }
}

export function mollweideInverse(
  x: number,
  y: number,
  lon0 = 0,
): { lon: number; lat: number } | null {
  const SQRT2 = Math.SQRT2
  const sy = y / SQRT2
  if (Math.abs(sy) > 1) return null
  const theta = Math.asin(sy)
  const cosT = Math.cos(theta)
  if (cosT < 1e-12) {
    if (Math.abs(x) > 1e-9) return null
    return { lon: lon0, lat: Math.sign(y) * HALF_PI }
  }
  const lam = (x * Math.PI) / (2 * SQRT2 * cosT)
  if (Math.abs(lam) > Math.PI + 1e-6) return null
  const s = (2 * theta + Math.sin(2 * theta)) / Math.PI
  if (Math.abs(s) > 1) return null
  return { lon: wrapLon(lam + lon0), lat: Math.asin(s) }
}

/* ---------------- Equirectangular (lab reference + tests) ---------------- */

export function equirectangularPoint(lon: number, lat: number, lon0 = 0): { x: number; y: number } {
  return { x: wrapLon(lon, lon0), y: lat }
}

export function equirectangularInverse(x: number, y: number, lon0 = 0): { lon: number; lat: number } {
  return { lon: wrapLon(x + lon0), lat: y }
}

/* ---------------- Orthographic (clipped hemisphere) ---------------- */

export const ORTHO_LAT0 = 0 // equatorial aspect
export const ORTHO_LON0 = 0

/** Returns null on the back hemisphere (clipped). */
export function orthographicPoint(
  lon: number,
  lat: number,
  lon0 = ORTHO_LON0,
  lat0 = ORTHO_LAT0,
): { x: number; y: number } | null {
  const lam = wrapLon(lon, lon0)
  const cosc =
    Math.sin(lat0) * Math.sin(lat) + Math.cos(lat0) * Math.cos(lat) * Math.cos(lam)
  if (cosc < 0) return null
  return {
    x: Math.cos(lat) * Math.sin(lam),
    y: Math.cos(lat0) * Math.sin(lat) - Math.sin(lat0) * Math.cos(lat) * Math.cos(lam),
  }
}

export function orthographicInverse(
  x: number,
  y: number,
  lon0 = ORTHO_LON0,
  lat0 = ORTHO_LAT0,
): { lon: number; lat: number } | null {
  const rho = Math.hypot(x, y)
  if (rho > 1 + 1e-9) return null
  const c = Math.asin(Math.min(1, rho))
  const sinc = Math.sin(c)
  const lat = Math.asin(
    Math.cos(c) * Math.sin(lat0) + (y * sinc * Math.cos(lat0)) / (rho || 1),
  )
  const lon =
    rho < 1e-12
      ? lon0
      : lon0 +
        Math.atan2(
          x * sinc,
          rho * Math.cos(lat0) * Math.cos(c) - y * Math.sin(lat0) * sinc,
        )
  return { lon: wrapLon(lon), lat }
}

/* ---------------- Globe (sphere XYZ) ---------------- */

/** X = cosφ sinλ, Y = sinφ, Z = cosφ cosλ; east is screen-right (unit sphere, design.md §7). */
export function spherePoint(lon: number, lat: number): { x: number; y: number; z: number } {
  const c = Math.cos(lat)
  return { x: c * Math.sin(lon), y: Math.sin(lat), z: c * Math.cos(lon) }
}

export function sphereInverse(x: number, y: number, z: number): { lon: number; lat: number } {
  return { lon: Math.atan2(x, z), lat: Math.asin(Math.max(-1, Math.min(1, y))) }
}

/* ---------------- Registry ---------------- */

function flatDef(
  id: FlatProjectionId,
  name: string,
  fn: ScalarFn,
  inv: ((x: number, y: number) => { lon: number; lat: number } | null) | null,
  frame: { halfWidth: number; halfHeight: number },
): ProjectionDef {
  return {
    id,
    name,
    isGlobe: false,
    project: vectorize(fn),
    projectPoint: fn,
    invertPoint: inv,
    frame,
  }
}

/** Mercator half-height at the ±85° clamp. */
const MERC_HALF_H = Math.log(Math.tan(Math.PI / 4 + MERCATOR_MAX_LAT / 2))

const registry: Partial<Record<ProjectionId, ProjectionDef>> = {}

export function getProjection(id: ProjectionId): ProjectionDef {
  let def = registry[id]
  if (!def) {
    def = createProjection(id)
    registry[id] = def
  }
  return def
}

function createProjection(id: ProjectionId): ProjectionDef {
  switch (id) {
    case 'globe':
      return {
        id,
        name: 'Globe',
        isGlobe: true,
        project: (lon, lat) => {
          // Globe positions are 3D; the 2D contract returns x/z for API
          // symmetry. bake.ts uses projectPoint3 for full XYZ.
          const n = lon.length
          const x = new Float64Array(n)
          const y = new Float64Array(n)
          for (let i = 0; i < n; i++) {
            const p = spherePoint(lon[i], lat[i])
            x[i] = p.x
            y[i] = p.z
          }
          return { x, y }
        },
        projectPoint: (lon, lat) => {
          const p = spherePoint(lon, lat)
          return { x: p.x, y: p.z }
        },
        invertPoint: null,
        frame: { halfWidth: 1, halfHeight: 1 },
      }
    case 'mercator':
      return flatDef(id, 'Mercator', mercatorPoint, mercatorInverse, {
        halfWidth: Math.PI,
        halfHeight: MERC_HALF_H,
      })
    case 'gallPeters':
      return flatDef(id, 'Gall–Peters', gallPetersPoint, gallPetersInverse, {
        halfWidth: Math.PI * Math.cos(GP_PHI0),
        halfHeight: 1 / Math.cos(GP_PHI0),
      })
    case 'equalEarth':
      return flatDef(id, 'Equal Earth', equalEarthPoint, equalEarthInverse, {
        halfWidth: Math.PI / (EE_M * EE_A1),
        halfHeight: equalEarthF(Math.asin(EE_M)),
      })
    case 'mollweide':
      return flatDef(id, 'Mollweide', mollweidePoint, mollweideInverse, {
        halfWidth: 2 * Math.SQRT2,
        halfHeight: Math.SQRT2,
      })
    case 'orthographic':
      return flatDef(
        id,
        'Orthographic',
        (lon, lat) => orthographicPoint(lon, lat) ?? { x: NaN, y: NaN },
        orthographicInverse,
        { halfWidth: 1, halfHeight: 1 },
      )
    case 'authagraph': {
      // Wired in registerAuthagraph() to avoid a circular import.
      throw new Error('authagraph not registered')
    }
  }
}

/** Called by authagraph.ts at module load; index.ts re-exports it. */
export function registerProjection(def: ProjectionDef): void {
  registry[def.id] = def
}

export { D2R, R2D, HALF_PI }
