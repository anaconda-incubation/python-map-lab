/**
 * Tissot indicatrix via numerical Jacobian + closed-form 2×2 SVD.
 *
 * For a sphere of radius R = 1 the metric-corrected Jacobian in the local
 * orthonormal tangent basis is
 *   A = [[ (∂x/∂λ)/cosφ, ∂x/∂φ ],
 *        [ (∂y/∂λ)/cosφ, ∂y/∂φ ]]
 * Its singular values σ1 ≥ σ2 are Tissot's principal scale factors:
 *   areal scale s = σ1σ2,  ω = 2·asin((σ1−σ2)/(σ1+σ2)).
 * (Snyder 1987 eqs. 4-1..4-12; Laskowski 1989 SVD formulation.)
 *
 * Poles (cosφ → 0): the parallel derivative is divided by cosφ, so near the
 * poles we fall back to one-sided differences in φ and estimate the
 * λ-column with a small fixed δλ ring, which stays finite for every
 * projection in the registry (all have smooth λ-dependence at the pole).
 */
import type { TissotParams } from './types'

type PointFn = (lon: number, lat: number) => { x: number; y: number }

const DEFAULT_H = 1e-6
const POLE_COS_EPS = 1e-6

/** Closed-form singular values of a 2×2 matrix (eigenvalues of AᵀA). */
export function svd2x2(a: number, b: number, c: number, d: number): { sigma1: number; sigma2: number; rotation: number } {
  // AᵀA = [[a²+c², ab+cd],[ab+cd, b²+d²]]
  const m00 = a * a + c * c
  const m01 = a * b + c * d
  const m11 = b * b + d * d
  const tr = m00 + m11
  const det = m00 * m11 - m01 * m01
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det))
  const l1 = Math.max(0, tr / 2 + disc)
  const l2 = Math.max(0, tr / 2 - disc)
  const sigma1 = Math.sqrt(l1)
  const sigma2 = Math.sqrt(l2)
  // Rotation of the σ1 axis in map space: eigenvector direction of AᵀA mapped
  // through A. Solve directly for the right singular vector angle ψ, then the
  // map-space angle is atan2 of A·v.
  let rotation = 0
  if (sigma1 > 1e-15) {
    // right singular vector for λ1: solves (m00-l1)vx + m01 vy = 0
    let vx: number
    let vy: number
    if (Math.abs(m01) > 1e-15) {
      vx = m01
      vy = l1 - m00
    } else {
      vx = m00 >= m11 ? 1 : 0
      vy = m00 >= m11 ? 0 : 1
    }
    const n = Math.hypot(vx, vy) || 1
    vx /= n
    vy /= n
    rotation = Math.atan2(c * vx + d * vy, a * vx + b * vy)
  }
  return { sigma1, sigma2, rotation }
}

function safe(fn: PointFn, lon: number, lat: number): { x: number; y: number } | null {
  const p = fn(lon, lat)
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null
  return p
}

/**
 * Tissot parameters at (lon, lat) radians for a scalar projection function.
 * `h` is the finite-difference step (radians); central differences by default.
 */
export function tissotAt(fn: PointFn, lon: number, lat: number, h = DEFAULT_H): TissotParams {
  const cosPhi = Math.cos(lat)
  // ∂/∂φ: central differences, one-sided near the poles.
  let dxDphi: number
  let dyDphi: number
  {
    const up = safe(fn, lon, Math.min(Math.PI / 2, lat + h))
    const dn = safe(fn, lon, Math.max(-Math.PI / 2, lat - h))
    if (up && dn && lat + h <= Math.PI / 2 && lat - h >= -Math.PI / 2) {
      dxDphi = (up.x - dn.x) / (2 * h)
      dyDphi = (up.y - dn.y) / (2 * h)
    } else if (up) {
      const p0 = safe(fn, lon, lat)
      if (!p0) return invalid()
      dxDphi = (up.x - p0.x) / h
      dyDphi = (up.y - p0.y) / h
    } else if (dn) {
      const p0 = safe(fn, lon, lat)
      if (!p0) return invalid()
      dxDphi = (p0.x - dn.x) / h
      dyDphi = (p0.y - dn.y) / h
    } else {
      return invalid()
    }
  }
  // ∂/∂λ on a small latitude ring; corrected by cosφ. Near the pole cosφ → 0
  // and the raw difference quotient loses precision, so we enlarge the ring
  // step to keep Δλ·cosφ ≈ h (constant map-space displacement). Seam safety:
  // at projection branch cuts (λ = ±π for pseudocylindricals, facet seams for
  // authagraph) the central difference straddles the cut; when the central
  // slope dwarfs both one-sided slopes we use the smaller one-sided slope.
  let dxDlam: number
  let dyDlam: number
  {
    const hLam = cosPhi > POLE_COS_EPS ? h : h / Math.max(cosPhi, 1e-12)
    const step = Math.min(hLam, 1e-3)
    const p0 = safe(fn, lon, lat)
    const p1 = safe(fn, lon + step, lat)
    const p2 = safe(fn, lon - step, lat)
    if (!p1 || !p2) return invalid()
    const c = Math.max(cosPhi, 1e-12)
    const component = (v1: number, v2: number, v0: number | null): number => {
      const central = (v1 - v2) / (2 * step * c)
      if (v0 === null) return central
      const dPlus = (v1 - v0) / (step * c)
      const dMinus = (v0 - v2) / (step * c)
      const minOneSided = Math.abs(dPlus) <= Math.abs(dMinus) ? dPlus : dMinus
      const oneMag = Math.abs(minOneSided)
      // seam: central ≫ both one-sided estimates (branch jump, not gradient)
      if (
        Math.abs(central) > 4 * Math.max(oneMag, 1e-12) &&
        Math.abs(dPlus) > 4 * oneMag !== Math.abs(dMinus) > 4 * oneMag
      ) {
        return minOneSided
      }
      return central
    }
    dxDlam = component(p1.x, p2.x, p0 ? p0.x : null)
    dyDlam = component(p1.y, p2.y, p0 ? p0.y : null)
  }
  const { sigma1, sigma2, rotation } = svd2x2(dxDlam, dxDphi, dyDlam, dyDphi)
  const areaScale = sigma1 * sigma2
  const ratio = sigma1 + sigma2 > 0 ? (sigma1 - sigma2) / (sigma1 + sigma2) : 0
  const omega = 2 * Math.asin(Math.min(1, Math.max(0, ratio)))
  return { sigma1, sigma2, areaScale, omega, rotation, valid: true }
}

function invalid(): TissotParams {
  return { sigma1: 0, sigma2: 0, areaScale: 0, omega: 0, rotation: 0, valid: false }
}

/** Vectorized Tissot over lon/lat arrays (radians). */
export function tissotField(
  fn: PointFn,
  lon: Float64Array,
  lat: Float64Array,
  h = DEFAULT_H,
): TissotParams[] {
  const out = new Array<TissotParams>(lon.length)
  for (let i = 0; i < lon.length; i++) out[i] = tissotAt(fn, lon[i], lat[i], h)
  return out
}
