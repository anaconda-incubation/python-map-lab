/**
 * Core types for the projection math library (pure TS — no three.js imports).
 * All angles are radians, sphere radius R = 1, unless stated otherwise.
 */

export type ProjectionId =
  | 'globe'
  | 'mercator'
  | 'gallPeters'
  | 'equalEarth'
  | 'authagraph'
  | 'mollweide'
  | 'orthographic'

export type FlatProjectionId = Exclude<ProjectionId, 'globe'>

/** Vectorized forward projection: (lon, lat) in radians → plane coords. */
export type ProjectFn = (
  lon: Float64Array,
  lat: Float64Array,
) => { x: Float64Array; y: Float64Array }

/** Scalar forward projection of a single point (radians in, plane out). */
export type ProjectPointFn = (lon: number, lat: number) => { x: number; y: number }

/** Inverse projection of a single plane point back to (lon, lat) radians. */
export type InversePointFn = (x: number, y: number) => { lon: number; lat: number } | null

export interface ProjectionDef {
  id: ProjectionId
  name: string
  /** true when output is a 3D unit-sphere position rather than a 2D plane */
  isGlobe: boolean
  /** vectorized forward projection */
  project: ProjectFn
  /** scalar forward projection */
  projectPoint: ProjectPointFn
  /** inverse (for pointer picking); null when unsupported */
  invertPoint: InversePointFn | null
  /** nominal planar half-extents (before normalization) for frame fitting */
  frame: { halfWidth: number; halfHeight: number }
}

/** Tissot indicatrix parameters at one graticule node. */
export interface TissotParams {
  /** principal scale factors, sigma1 >= sigma2 */
  sigma1: number
  sigma2: number
  /** areal scale s = sigma1 * sigma2 */
  areaScale: number
  /** max angular deformation omega (radians) */
  omega: number
  /** rotation (radians, CCW from +x) of the sigma1 axis in map space */
  rotation: number
  /** false where the Jacobian is unreliable (poles, projection limbs) */
  valid: boolean
}

/** Per-projection baked buffers consumed by the MapStage GPU pipeline. */
export interface BakedProjection {
  /** Shared geodetic ocean / imagery surface, including custom projection shape. */
  surfacePositions?: Float32Array
  id: ProjectionId
  /** land triangle soup: xyz per vertex (Float32), length = nVerts * 3 */
  landPositions: Float32Array
  /** per-land-vertex overlay scalars */
  landOverlay: {
    /** log2 of areal scale (0 = true area) */
    logArea: Float32Array
    /** max angular deformation omega (radians) */
    omega: Float32Array
  }
  /** lake overlay triangle soup (rendered with ocean fill) */
  lakePositions: Float32Array
  lakeStagger: Float32Array
  /** coastline segments: xyz pairs (length = nSegVerts * 3) */
  coastlinePositions: Float32Array
  /** graticule segments: xyz pairs + per-vertex emphasis (1 = equator/PM) */
  graticulePositions: Float32Array
  graticuleEmphasis: Float32Array
  /** Tissot instances: positions (xyz) + params (sigma1, sigma2, rotation, valid) */
  tissotPositions: Float32Array
  tissotParams: Float32Array
  tissotLonLat: Float32Array
  /** label anchors: xyz per label, in label order */
  labelPositions: Float32Array
  /** stagger attribute source: normalized delay 0..1 derived from longitude */
  landStagger: Float32Array
  coastlineStagger: Float32Array
  graticuleStagger: Float32Array
  /** aspect-corrected frame in baked (normalized) coordinates */
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
  /** normalization scale that was applied to raw projection coordinates */
  normalizeScale: number
  vertexCount: number
}

export interface BakeOptions {
  signal?: AbortSignal
  quality?: 'overview' | 'detail'
  /** max geodesic segment length (deg) when densifying geography */
  densifyDeg?: number
  /** Tissot node spacing (deg); halved density on mobile */
  tissotStepDeg?: number
  /** override graticule spacing (deg); default 10 */
  graticuleStepDeg?: number
}
