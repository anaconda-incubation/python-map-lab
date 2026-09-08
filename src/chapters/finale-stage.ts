import * as THREE from 'three'
import earcut from 'earcut'
import labelsRaw from '@/data/labels.json?raw'

/**
 * finale-stage.ts — chapter-local morph stage for chapters 12 (Mercator →
 * Equal Earth) and 13 (Equal Earth → globe). Self-contained mini-pipeline
 * following design.md §7.2: every layer carries positionA/positionB +
 * per-vertex longitude stagger; a single uniform uT drives a GPU vertex
 * morph (zero CPU per frame). One canvas per chapter, created lazily via
 * IntersectionObserver and disposed when far out of view.
 *
 * Projections:
 *  - mercator:   x = λ, y = ln tan(π/4 + φ/2), truncated at ±85°
 *  - equalearth: Šavrič, Patterson & Jenny 2018 coefficients (see
 *                src/data/equalearth.json — DOI 10.1080/13658816.2018.1504949)
 *  - globe:      unit sphere
 */

const DEG = Math.PI / 180

/* Equal Earth coefficients — Šavrič, Patterson & Jenny 2018 */
const EE_A1 = 1.340264
const EE_A2 = -0.081106
const EE_A3 = 0.000893
const EE_A4 = 0.003796
const EE_M = 0.8660254037844386 // sqrt(3)/2
const EE_MAX_Y = 1.3173627591574 // PROJ eqearth.cpp MAX_Y

const MERC_MAX_LAT = 85 * DEG
const MERC_MAX_Y = Math.log(Math.tan(Math.PI / 4 + MERC_MAX_LAT / 2)) // ≈3.1313

export type ProjMode = 'mercator' | 'equalearth' | 'globe'
export type StageTheme = 'paper' | 'atlas'

const PROJECTION_NAMES: Record<ProjMode, string> = {
  mercator: 'Mercator',
  equalearth: 'Equal Earth',
  globe: 'the globe',
}

function equalEarthXY(lonRad: number, latRad: number): [number, number] {
  const theta = Math.asin(EE_M * Math.sin(latRad))
  const t2 = theta * theta
  const y = theta * (EE_A1 + t2 * (EE_A2 + t2 * t2 * (EE_A3 + t2 * EE_A4)))
  // F'(θ) = A1 + 3A2θ² + 7A3θ⁶ + 9A4θ⁸
  const fp = EE_A1 + t2 * (3 * EE_A2 + t2 * t2 * (7 * EE_A3 + 9 * EE_A4 * t2))
  const x = (lonRad * Math.cos(theta)) / (EE_M * fp)
  return [x, y]
}

/**
 * Project one lon/lat (degrees) into the stage's normalized frame.
 * Flat maps are normalized to half-height 1 on the z=0 plane; the globe is
 * the unit sphere. `lift` separates layers (radius / z offset).
 */
function project(
  mode: ProjMode,
  lonDeg: number,
  latDeg: number,
  lift: number,
  out: Float32Array,
  i: number,
): void {
  const lon = lonDeg * DEG
  const lat = latDeg * DEG
  if (mode === 'globe') {
    const r = 1 + lift
    const c = Math.cos(lat)
    out[i] = r * c * Math.sin(lon)
    out[i + 1] = r * Math.sin(lat)
    out[i + 2] = r * c * Math.cos(lon)
  } else if (mode === 'mercator') {
    const clat = Math.max(-MERC_MAX_LAT, Math.min(MERC_MAX_LAT, lat))
    const y = Math.log(Math.tan(Math.PI / 4 + clat / 2))
    out[i] = lon / MERC_MAX_Y
    out[i + 1] = y / MERC_MAX_Y
    out[i + 2] = lift
  } else {
    const [x, y] = equalEarthXY(lon, lat)
    out[i] = x / EE_MAX_Y
    out[i + 1] = y / EE_MAX_Y
    out[i + 2] = lift
  }
}

/** log₂ area scale for the overlay ramp: Mercator = 1/cos²φ, others exact 1. */
function heatFor(mode: ProjMode, latDeg: number): number {
  if (mode !== 'mercator') return 0
  const clat = Math.max(-MERC_MAX_LAT, Math.min(MERC_MAX_LAT, latDeg * DEG))
  const c = Math.cos(clat)
  return Math.min(4, Math.log2(1 / (c * c)))
}

/** Per-vertex stagger: the map peels from the antimeridian inward (§7.2). */
function delayFor(lonDeg: number): number {
  return (1 - Math.min(1, Math.abs(lonDeg) / 180)) * 0.18
}

/* ── Geography loading (vendored Natural Earth 110m, public domain) ──── */

type Ring = number[][] // [[lon,lat],...]
type PolygonRings = Ring[] // rings[0] exterior, rest holes

interface ParsedGeo {
  land: PolygonRings[]
  lakes: PolygonRings[]
  coastline: Ring[]
}

interface GeoJsonGeometry {
  type: string
  coordinates: number[][] | number[][][] | number[][][][]
}

interface GeoJsonFeatureCollection {
  type: 'FeatureCollection'
  features: { geometry: GeoJsonGeometry }[]
}

function polygonsOf(fc: GeoJsonFeatureCollection): PolygonRings[] {
  const out: PolygonRings[] = []
  for (const f of fc.features) {
    const g = f.geometry
    if (!g) continue
    if (g.type === 'Polygon') out.push(g.coordinates as number[][][])
    else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates as number[][][][]) out.push(poly)
    }
  }
  return out
}

function linesOf(fc: GeoJsonFeatureCollection): Ring[] {
  const out: Ring[] = []
  for (const f of fc.features) {
    const g = f.geometry
    if (!g) continue
    if (g.type === 'LineString') out.push(g.coordinates as number[][])
    else if (g.type === 'MultiLineString') {
      for (const line of g.coordinates as number[][][]) out.push(line)
    }
  }
  return out
}

let geoPromise: Promise<ParsedGeo> | null = null

function loadGeo(): Promise<ParsedGeo> {
  if (!geoPromise) {
    geoPromise = Promise.all([
      fetch('/geo/ne_110m_land.geojson').then((r) => r.json()),
      fetch('/geo/ne_110m_lakes.geojson').then((r) => r.json()),
      fetch('/geo/ne_110m_coastline.geojson').then((r) => r.json()),
    ]).then(([land, lakes, coast]) => ({
      land: polygonsOf(land as GeoJsonFeatureCollection),
      lakes: polygonsOf(lakes as GeoJsonFeatureCollection),
      coastline: linesOf(coast as GeoJsonFeatureCollection),
    }))
  }
  return geoPromise
}

/* ── Label anchors (src/data/labels.json — UNGEGN/IHO curated names) ─── */

interface LabelAnchor {
  id: string
  name: string
  lon: number
  lat: number
  kind: string
  priority: number
  hide?: string[]
}

const GLOBE_LABEL_IDS = new Set([
  'pacific-ocean',
  'atlantic-ocean',
  'indian-ocean',
  'arctic-ocean',
  'southern-ocean',
  'gulf-of-mexico',
  'lake-ontario',
  'africa',
  'south-america',
  'north-america',
  'greenland',
])

function globeLabels(): LabelAnchor[] {
  const parsed = JSON.parse(labelsRaw) as { labels: LabelAnchor[] }
  return parsed.labels.filter((l) => GLOBE_LABEL_IDS.has(l.id))
}

/* ── Geometry builders ──────────────────────────────────────────────── */

interface LayerGeometry {
  geometry: THREE.BufferGeometry
  /** Half-extents of the A and B states (for camera fitting). */
  extentA: { hw: number; hh: number }
  extentB: { hw: number; hh: number }
}

/** Shared attributes for a layer: lonlat is flat [lon,lat] degrees pairs. */
function makeGeometry(
  lonlat: Float32Array,
  indices: number[] | null,
  from: ProjMode,
  to: ProjMode,
  lift: number,
  alpha?: Float32Array,
  normals?: boolean,
): LayerGeometry {
  const n = lonlat.length / 2
  const posA = new Float32Array(n * 3)
  const posB = new Float32Array(n * 3)
  const delay = new Float32Array(n)
  const heatA = new Float32Array(n)
  const heatB = new Float32Array(n)
  const nrm = normals ? new Float32Array(n * 3) : null
  let minAx = 0, maxAx = 0, minAy = 0, maxAy = 0
  let minBx = 0, maxBx = 0, minBy = 0, maxBy = 0
  for (let v = 0; v < n; v++) {
    const lon = lonlat[v * 2]
    const lat = lonlat[v * 2 + 1]
    project(from, lon, lat, lift, posA, v * 3)
    project(to, lon, lat, lift, posB, v * 3)
    delay[v] = delayFor(lon)
    heatA[v] = heatFor(from, lat)
    heatB[v] = heatFor(to, lat)
    if (v === 0) {
      minAx = maxAx = posA[0]; minAy = maxAy = posA[1]
      minBx = maxBx = posB[0]; minBy = maxBy = posB[1]
    } else {
      minAx = Math.min(minAx, posA[v * 3]); maxAx = Math.max(maxAx, posA[v * 3])
      minAy = Math.min(minAy, posA[v * 3 + 1]); maxAy = Math.max(maxAy, posA[v * 3 + 1])
      minBx = Math.min(minBx, posB[v * 3]); maxBx = Math.max(maxBx, posB[v * 3])
      minBy = Math.min(minBy, posB[v * 3 + 1]); maxBy = Math.max(maxBy, posB[v * 3 + 1])
    }
    if (nrm) {
      project('globe', lon, lat, 0, nrm, v * 3)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('aPosA', new THREE.BufferAttribute(posA, 3))
  geometry.setAttribute('aPosB', new THREE.BufferAttribute(posB, 3))
  geometry.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1))
  geometry.setAttribute('aHeatA', new THREE.BufferAttribute(heatA, 1))
  geometry.setAttribute('aHeatB', new THREE.BufferAttribute(heatB, 1))
  if (nrm) geometry.setAttribute('aNormal', new THREE.BufferAttribute(nrm, 3))
  if (alpha) geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1))
  if (indices && indices.length > 0) geometry.setIndex(indices)
  return {
    geometry,
    extentA: { hw: Math.max(Math.abs(minAx), Math.abs(maxAx)), hh: Math.max(Math.abs(minAy), Math.abs(maxAy)) },
    extentB: { hw: Math.max(Math.abs(minBx), Math.abs(maxBx)), hh: Math.max(Math.abs(minBy), Math.abs(maxBy)) },
  }
}

/** Ocean: a lat/lon grid — sphere triangulation shared 1:1 with flat states. */
function buildOceanGrid(from: ProjMode, to: ProjMode): LayerGeometry {
  const LON_STEP = 3
  const LAT_STEP = 3
  const cols = Math.floor(360 / LON_STEP) + 1 // 121
  const rows = Math.floor(180 / LAT_STEP) + 1 // 61
  const lonlat = new Float32Array(cols * rows * 2)
  let k = 0
  for (let r = 0; r < rows; r++) {
    const lat = -90 + r * LAT_STEP
    for (let c = 0; c < cols; c++) {
      lonlat[k++] = -180 + c * LON_STEP
      lonlat[k++] = lat
    }
  }
  const indices: number[] = []
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c
      const b = a + 1
      const d = a + cols
      const e = d + 1
      indices.push(a, d, b, b, d, e)
    }
  }
  return makeGeometry(lonlat, indices, from, to, 0, undefined, true)
}

/** Land/lakes: earcut-triangulated polygons (triangulated in Equal Earth space). */
function buildPolygonMesh(polys: PolygonRings[], from: ProjMode, to: ProjMode, lift: number): LayerGeometry {
  const lonlatParts: number[] = []
  const indices: number[] = []
  let base = 0
  for (const rings of polys) {
    const flat: number[] = []
    const holes: number[] = []
    for (let ri = 0; ri < rings.length; ri++) {
      if (ri > 0) holes.push(flat.length / 2)
      const ring = rings[ri]
      // Drop a duplicate closing vertex if present (earcut expects open rings)
      const len =
        ring.length > 1 &&
        ring[0][0] === ring[ring.length - 1][0] &&
        ring[0][1] === ring[ring.length - 1][1]
          ? ring.length - 1
          : ring.length
      for (let p = 0; p < len; p++) {
        const lon = ring[p][0]
        const lat = Math.max(-89.9, Math.min(89.9, ring[p][1]))
        lonlatParts.push(lon, lat)
        const [x, y] = equalEarthXY(lon * DEG, lat * DEG)
        flat.push(x, y)
      }
    }
    const tris = earcut(flat, holes.length > 0 ? holes : undefined)
    for (const idx of tris) indices.push(base + idx)
    base += flat.length / 2
  }
  return makeGeometry(new Float32Array(lonlatParts), indices, from, to, lift)
}

/** Coastline / graticule / Tissot: plain segment soup (vertex pairs). */
function buildSegments(
  lonlat: Float32Array,
  from: ProjMode,
  to: ProjMode,
  lift: number,
  alpha?: Float32Array,
): LayerGeometry {
  return makeGeometry(lonlat, null, from, to, lift, alpha)
}

function linesToSegments(lines: Ring[], stepDeg: number): { lonlat: Float32Array; alpha: Float32Array } {
  const parts: number[] = []
  const alphas: number[] = []
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const [lon1, lat1] = line[i]
      const [lon2, lat2] = line[i + 1]
      // Resample long segments so the morph path stays curved-faithful
      const segs = Math.max(1, Math.ceil(Math.hypot(lon2 - lon1, lat2 - lat1) / stepDeg))
      for (let s = 0; s < segs; s++) {
        const t0 = s / segs
        const t1 = (s + 1) / segs
        parts.push(lon1 + (lon2 - lon1) * t0, lat1 + (lat2 - lat1) * t0)
        parts.push(lon1 + (lon2 - lon1) * t1, lat1 + (lat2 - lat1) * t1)
        alphas.push(1, 1)
      }
    }
  }
  return { lonlat: new Float32Array(parts), alpha: new Float32Array(alphas) }
}

function buildGraticule(from: ProjMode, to: ProjMode): LayerGeometry {
  const parts: number[] = []
  const alphas: number[] = []
  const seg = (lon1: number, lat1: number, lon2: number, lat2: number, a: number) => {
    parts.push(lon1, lat1, lon2, lat2)
    alphas.push(a, a)
  }
  for (let lat = -80; lat <= 80; lat += 10) {
    const a = lat === 0 ? 1.6 : 1
    for (let lon = -180; lon < 180; lon += 2) seg(lon, lat, lon + 2, lat, a)
  }
  for (let lon = -180; lon < 180; lon += 10) {
    const a = lon === 0 ? 1.6 : 1
    for (let lat = -90; lat < 90; lat += 2) seg(lon, lat, lon, lat + 2, a)
  }
  return buildSegments(new Float32Array(parts), from, to, 0.006, new Float32Array(alphas))
}

/** Small geodesic circle around a center — projected, it becomes the Tissot ellipse. */
function geodesicCircle(lonC: number, latC: number, radiusDeg: number, n: number): Ring {
  const pts: Ring = []
  const f1 = latC * DEG
  const l1 = lonC * DEG
  const d = radiusDeg * DEG
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2
    const f2 = Math.asin(
      Math.sin(f1) * Math.cos(d) + Math.cos(f1) * Math.sin(d) * Math.cos(th),
    )
    const l2 =
      l1 +
      Math.atan2(
        Math.sin(th) * Math.sin(d) * Math.cos(f1),
        Math.cos(d) - Math.sin(f1) * Math.sin(f2),
      )
    const lon = ((l2 / DEG + 540) % 360) - 180
    pts.push([lon, f2 / DEG])
  }
  return pts
}

function buildTissot(from: ProjMode, to: ProjMode): { stroke: LayerGeometry; fill: LayerGeometry } {
  const N = 20
  const strokeParts: number[] = []
  const fillLonlat: number[] = []
  const fillIdx: number[] = []
  let fillBase = 0
  for (let lat = -75; lat <= 75; lat += 15) {
    for (let lon = -180; lon < 180; lon += 15) {
      const circle = geodesicCircle(lon, lat, 2.5, N)
      for (let i = 0; i < N; i++) {
        const [aLon, aLat] = circle[i]
        const [bLon, bLat] = circle[(i + 1) % N]
        strokeParts.push(aLon, aLat, bLon, bLat)
      }
      // Fan fill: center + ring
      fillLonlat.push(lon, lat)
      for (const [pLon, pLat] of circle) fillLonlat.push(pLon, pLat)
      for (let i = 0; i < N; i++) {
        fillIdx.push(fillBase, fillBase + 1 + i, fillBase + 1 + ((i + 1) % N))
      }
      fillBase += N + 1
    }
  }
  return {
    stroke: buildSegments(new Float32Array(strokeParts), from, to, 0.007),
    fill: makeGeometry(new Float32Array(fillLonlat), fillIdx, from, to, 0.005),
  }
}

/* ── Shaders (uniform-driven morph; zero CPU per frame, §7.2) ───────── */

const VERT = /* glsl */ `
  attribute vec3 aPosA;
  attribute vec3 aPosB;
  attribute float aDelay;
  attribute float aHeatA;
  attribute float aHeatB;
  #ifdef HAS_NORMAL
  attribute vec3 aNormal;
  #endif
  #ifdef HAS_ALPHA
  attribute float aAlpha;
  #endif
  uniform float uT;
  varying float vHeat;
  varying float vRim;
  varying float vAlpha;
  void main() {
    float tt = smoothstep(0.0, 1.0, clamp((uT - aDelay) / 0.82, 0.0, 1.0));
    vec3 pos = mix(aPosA, aPosB, tt);
    vHeat = mix(aHeatA, aHeatB, tt);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vRim = 0.0;
    #ifdef HAS_NORMAL
    vec3 nrm = normalize(mix(aNormal, vec3(0.0, 0.0, 1.0), tt));
    vec3 nView = normalize(normalMatrix * nrm);
    vec3 vView = normalize(-mv.xyz);
    vRim = pow(1.0 - abs(dot(nView, vView)), 2.0) * (1.0 - tt * 0.85);
    #endif
    vAlpha = 1.0;
    #ifdef HAS_ALPHA
    vAlpha = aAlpha;
    #endif
    gl_Position = projectionMatrix * mv;
  }
`

const FRAG_SURFACE = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uRim;
  uniform float uOverlay;
  uniform float uAlpha;
  varying float vHeat;
  varying float vRim;
  varying float vAlpha;
  /* Area-distortion ramp (design.md §3): true → 2× → 4× → 8×+ (linear space) */
  vec3 heatRamp(float h) {
    vec3 cTrue = vec3(0.914, 0.880, 0.807);
    vec3 c2 = vec3(0.694, 0.352, 0.044);
    vec3 c4 = vec3(0.540, 0.065, 0.014);
    vec3 c8 = vec3(0.209, 0.018, 0.006);
    vec3 c = mix(cTrue, c2, clamp(h, 0.0, 1.0));
    c = mix(c, c4, clamp(h - 1.0, 0.0, 1.0));
    c = mix(c, c8, clamp((h - 2.0) / 2.0, 0.0, 1.0));
    return c;
  }
  void main() {
    vec3 base = mix(uColor, uRim, vRim * 0.55);
    vec3 col = mix(base, heatRamp(vHeat), uOverlay * 0.55);
    gl_FragColor = vec4(col, uAlpha);
    #include <colorspace_fragment>
  }
`

const FRAG_LINE = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  varying float vAlpha;
  varying float vHeat;
  varying float vRim;
  void main() {
    gl_FragColor = vec4(uColor, uAlpha * vAlpha);
    #include <colorspace_fragment>
  }
`

interface StageColors {
  ocean: THREE.Color
  rim: THREE.Color
  land: THREE.Color
  lakes: THREE.Color
  stroke: THREE.Color
  graticule: THREE.Color
  tissot: THREE.Color
}

function themeColors(theme: StageTheme): StageColors {
  const c = (hex: string) => new THREE.Color(hex)
  return theme === 'atlas'
    ? {
        ocean: c('#16222E'),
        rim: c('#1C2B3A'),
        land: c('#D9CFB4'),
        lakes: c('#16222E'),
        stroke: c('#EFE7D2'),
        graticule: c('#EDE6D6'),
        tissot: c('#C2481F'),
      }
    : {
        ocean: c('#17324E'),
        rim: c('#1E3F60'),
        land: c('#E6DCC3'),
        lakes: c('#17324E'),
        stroke: c('#3A3428'),
        graticule: c('#1B1812'),
        tissot: c('#C2481F'),
      }
}

export interface MorphStageOptions {
  container: HTMLElement
  theme: StageTheme
  from: ProjMode
  to: ProjMode
  /** Show the Tissot indicatrix field (chapter 12). */
  tissot?: boolean
  /** Globe naming labels from labels.json (chapter 13; `to` must be globe). */
  labels?: boolean
  /** Slow globe autorotation once the morph completes (chapter 13). */
  autorotate?: boolean
  /** Screen-reader state narration callback (role="img" mirror). */
  onStateLabel?: (label: string) => void
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export class MorphStage {
  private opts: MorphStageOptions
  private renderer: THREE.WebGLRenderer | null = null
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(32, 1, 0.01, 400)
  private group = new THREE.Group()
  private materials: THREE.ShaderMaterial[] = []
  private geometries: THREE.BufferGeometry[] = []
  private tissotMaterials: THREE.ShaderMaterial[] = []
  private overlayMaterials: THREE.ShaderMaterial[] = []
  private extentA = { hw: 1, hh: 1 }
  private extentB = { hw: 1, hh: 1 }
  private t = 0
  private overlay = 0
  private tissotOpacity = 1
  private labelVisibility = 0
  private labelEls: { el: HTMLSpanElement; lon: number; lat: number }[] = []
  private labelLayer: HTMLDivElement | null = null
  private raf = 0
  private disposed = false
  private ready = false
  private needsRender = true
  private spin = 0
  private lastTime = 0
  private resizeObs: ResizeObserver | null = null
  private lastStateLabel = ''

  constructor(opts: MorphStageOptions) {
    this.opts = opts
  }

  async init(): Promise<void> {
    const { container, theme, from, to } = this.opts
    const geo = await loadGeo()
    if (this.disposed) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      throw new Error('WebGL unavailable')
    }
    this.renderer = renderer
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(0x000000, 0)
    const canvas = renderer.domElement
    canvas.style.position = 'absolute'
    canvas.style.inset = '0'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.display = 'block'
    container.appendChild(canvas)

    const colors = themeColors(theme)
    this.scene.add(this.group)

    const surfaceMat = (
      color: THREE.Color,
      opts: { rim?: THREE.Color; alpha?: number; overlay?: boolean; normals?: boolean } = {},
    ) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG_SURFACE,
        uniforms: {
          uT: { value: 0 },
          uColor: { value: color },
          uRim: { value: opts.rim ?? color },
          uOverlay: { value: 0 },
          uAlpha: { value: opts.alpha ?? 1 },
        },
        defines: opts.normals ? { HAS_NORMAL: 1 } : {},
        transparent: (opts.alpha ?? 1) < 1,
        depthWrite: (opts.alpha ?? 1) >= 1,
      })
      this.materials.push(mat)
      if (opts.overlay) this.overlayMaterials.push(mat)
      return mat
    }
    const lineMat = (color: THREE.Color, alpha: number, perVertexAlpha: boolean) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG_LINE,
        uniforms: {
          uT: { value: 0 },
          uColor: { value: color },
          uRim: { value: color },
          uOverlay: { value: 0 },
          uAlpha: { value: alpha },
        },
        defines: perVertexAlpha ? { HAS_ALPHA: 1 } : {},
        transparent: true,
        depthWrite: false,
      })
      this.materials.push(mat)
      return mat
    }
    const addMesh = (layer: LayerGeometry, mat: THREE.ShaderMaterial) => {
      this.geometries.push(layer.geometry)
      const mesh = new THREE.Mesh(layer.geometry, mat)
      mesh.frustumCulled = false // no 'position' attribute; culling n/a
      this.group.add(mesh)
    }

    // Ocean grid — also owns the camera-fit extents
    const ocean = buildOceanGrid(from, to)
    this.extentA = ocean.extentA
    this.extentB = ocean.extentB
    addMesh(ocean, surfaceMat(colors.ocean, { rim: colors.rim, overlay: true, normals: true }))

    addMesh(buildPolygonMesh(geo.land, from, to, 0.0025), surfaceMat(colors.land, { overlay: true }))
    addMesh(buildPolygonMesh(geo.lakes, from, to, 0.004), surfaceMat(colors.lakes))

    const coast = linesToSegments(geo.coastline, 2)
    const coastLayer = buildSegments(coast.lonlat, from, to, 0.006)
    this.geometries.push(coastLayer.geometry)
    const coastLines = new THREE.LineSegments(
      coastLayer.geometry,
      lineMat(colors.stroke, theme === 'atlas' ? 0.55 : 0.85, false),
    )
    coastLines.frustumCulled = false
    this.group.add(coastLines)

    const grat = buildGraticule(from, to)
    this.geometries.push(grat.geometry)
    const gratLines = new THREE.LineSegments(
      grat.geometry,
      lineMat(colors.graticule, theme === 'atlas' ? 0.12 : 0.14, true),
    )
    gratLines.frustumCulled = false
    this.group.add(gratLines)

    if (this.opts.tissot) {
      const tis = buildTissot(from, to)
      const fill = surfaceMat(colors.tissot, { alpha: 0.12 })
      const stroke = lineMat(colors.tissot, 0.85, false)
      this.tissotMaterials.push(fill, stroke)
      addMesh(tis.fill, fill)
      this.geometries.push(tis.stroke.geometry)
      const tisLines = new THREE.LineSegments(tis.stroke.geometry, stroke)
      tisLines.frustumCulled = false
      this.group.add(tisLines)
    }

    if (this.opts.labels && to === 'globe') this.buildLabelLayer()

    this.resizeObs = new ResizeObserver(() => this.resize())
    this.resizeObs.observe(container)
    this.resize()

    this.ready = true
    this.lastTime = performance.now()
    const loop = (now: number) => {
      if (this.disposed) return
      this.raf = requestAnimationFrame(loop)
      const dt = Math.min(0.1, (now - this.lastTime) / 1000)
      this.lastTime = now
      if (this.opts.autorotate && this.t >= 0.999) {
        this.spin += dt * 0.02 // 0.02 rad/s idle rotation (§7.1)
        this.needsRender = true
      }
      if (this.needsRender) {
        this.needsRender = false
        this.render()
      }
    }
    this.raf = requestAnimationFrame(loop)
    this.announce()
  }

  private buildLabelLayer(): void {
    const layer = document.createElement('div')
    layer.style.position = 'absolute'
    layer.style.inset = '0'
    layer.style.overflow = 'hidden'
    layer.style.pointerEvents = 'none'
    layer.setAttribute('aria-hidden', 'true')
    for (const anchor of globeLabels()) {
      const el = document.createElement('span')
      el.className = 'map-label'
      el.textContent = anchor.name
      el.style.position = 'absolute'
      el.style.left = '0'
      el.style.top = '0'
      el.style.opacity = '0'
      el.style.transition = 'opacity 250ms ease'
      layer.appendChild(el)
      this.labelEls.push({ el, lon: anchor.lon, lat: anchor.lat })
    }
    this.opts.container.appendChild(layer)
    this.labelLayer = layer
  }

  private resize(): void {
    if (!this.renderer) return
    const w = Math.max(1, this.opts.container.clientWidth)
    const h = Math.max(1, this.opts.container.clientHeight)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.needsRender = true
  }

  /** Scroll-scrubbed morph progress, 0..1. */
  setProgress(t: number): void {
    const v = clamp01(t)
    if (v === this.t) return
    this.t = v
    this.needsRender = true
    this.announce()
  }

  /** Area-distortion overlay strength 0..1 (chapter 12 pulse). */
  setOverlay(v: number): void {
    const nv = clamp01(v)
    if (Math.abs(nv - this.overlay) < 0.004) return
    this.overlay = nv
    this.needsRender = true
  }

  setTissotOpacity(v: number): void {
    const nv = clamp01(v)
    if (Math.abs(nv - this.tissotOpacity) < 0.004) return
    this.tissotOpacity = nv
    this.needsRender = true
  }

  /** Label layer fade-in as the globe returns (0..1). */
  setLabelVisibility(v: number): void {
    const nv = clamp01(v)
    if (Math.abs(nv - this.labelVisibility) < 0.004) return
    this.labelVisibility = nv
    this.needsRender = true
  }

  private announce(): void {
    if (!this.opts.onStateLabel) return
    const { from, to } = this.opts
    const a = PROJECTION_NAMES[from]
    const b = PROJECTION_NAMES[to]
    let label: string
    if (this.t <= 0.02) label = `Map stage: the world in the ${a} projection.`
    else if (this.t >= 0.98)
      label =
        to === 'globe'
          ? 'Map stage: the flat map has folded back into a globe. Geographic naming labels — the five oceans, Gulf of Mexico, Lake Ontario — are shown.'
          : `Map stage: the world in the ${b} projection; relative land areas are true.`
    else label = `Map stage: morphing from ${a} to ${b} (${Math.round(this.t * 100)}%).`
    if (label !== this.lastStateLabel) {
      this.lastStateLabel = label
      this.opts.onStateLabel(label)
    }
  }

  private render(): void {
    if (!this.renderer || !this.ready) return
    const { from, to } = this.opts
    const t = this.t
    const te = easeInOut(t)

    for (const m of this.materials) m.uniforms.uT!.value = t
    for (const m of this.overlayMaterials) m.uniforms.uOverlay!.value = this.overlay
    for (const m of this.tissotMaterials) {
      const base = m.fragmentShader === FRAG_LINE ? 0.85 : 0.12
      m.uniforms.uAlpha!.value = base * this.tissotOpacity
    }

    // Camera language (§7.2.5): flat states feel near-orthographic; the globe
    // gets a perspective hero framing. Reframe fits each map's aspect.
    const fovA = from === 'globe' ? 32 : 13
    const fovB = to === 'globe' ? 32 : 13
    const fov = fovA + (fovB - fovA) * te
    const hw = this.extentA.hw + (this.extentB.hw - this.extentA.hw) * te
    const hh = this.extentA.hh + (this.extentB.hh - this.extentA.hh) * te
    const pad = 1.08
    const halfFov = (fov / 2) * DEG
    const d =
      Math.max((hh * pad) / Math.tan(halfFov), (hw * pad) / (Math.tan(halfFov) * this.camera.aspect)) *
      1.0
    const elA = from === 'globe' ? 0.38 : 0.03
    const elB = to === 'globe' ? 0.38 : 0.03
    const el = elA + (elB - elA) * te
    this.camera.fov = fov
    this.camera.position.set(0, d * Math.sin(el), d * Math.cos(el))
    this.camera.lookAt(0, 0, 0)
    this.camera.updateProjectionMatrix()

    // Globe swing: the group only rotates once the destination is the sphere.
    this.group.rotation.y = to === 'globe' ? -0.55 * te + this.spin : 0

    this.renderer.render(this.scene, this.camera)
    if (this.labelEls.length > 0) this.updateLabels()
  }

  private updateLabels(): void {
    const w = this.opts.container.clientWidth
    const h = this.opts.container.clientHeight
    const camDir = this.camera.position.clone().normalize()
    const v = new THREE.Vector3()
    const q = this.group.quaternion
    for (const { el, lon, lat } of this.labelEls) {
      const f = lat * DEG
      const l = lon * DEG
      v.set(Math.cos(f) * Math.sin(l), Math.sin(f), Math.cos(f) * Math.cos(l))
      v.applyQuaternion(q)
      const front = v.clone().normalize().dot(camDir)
      const ndc = v.clone().project(this.camera)
      const x = (ndc.x * 0.5 + 0.5) * w
      const y = (-ndc.y * 0.5 + 0.5) * h
      el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
      const limb = clamp01((front - 0.1) / 0.18)
      el.style.opacity = (this.labelVisibility * limb).toFixed(3)
    }
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.resizeObs?.disconnect()
    for (const g of this.geometries) g.dispose()
    for (const m of this.materials) m.dispose()
    this.labelLayer?.remove()
    this.labelEls = []
    if (this.renderer) {
      this.renderer.dispose()
      this.renderer.domElement.remove()
      this.renderer = null
    }
    this.ready = false
  }
}
