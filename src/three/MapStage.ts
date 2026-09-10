/**
 * MapStage — the imperative Three.js engine (design.md §7).
 *
 * One WebGL2 renderer + one scene. All geography is baked to parallel
 * Float32Arrays per projection (src/projection/bake.ts); morphs are pure
 * uniform updates (uT) with a per-vertex longitude stagger so the map peels
 * from the antimeridian inward. Render-on-demand: a single rAF runs only
 * while autorotating or animating fades; state changes invalidate once.
 */
import * as THREE from 'three'
import { recordFrame, rendererCount } from '../utils/diagnostics'
import type { MapQuality } from '../projection/assets'
import { SURFACE_GRID, surfacePositions, morphProgress } from '../projection/surface'
import { bakeProjection, getBaked, registerBaked, LABEL_ANCHORS } from '../projection/bake'
import { getProjection, sphereInverse, spherePoint } from '../projection/projections'
import type {
  BakedProjection,
  InversePointFn,
  ProjectionId,
  ProjectPointFn,
} from '../projection/types'
import { LabelLayer } from './labels'
import { THEME_COLORS, rampGlsl, type StageTheme } from './ThemeColors'

export type { StageTheme }

export interface LayerState {
  geography: boolean
  graticule: boolean
  tissot: boolean
  area: boolean
  angle: boolean
}

export interface CameraKeyframe {
  position: [number, number, number]
  target: [number, number, number]
  fov: number
}

export type HoverCallback = (lonlat: { lon: number; lat: number } | null) => void

const STAGGER_RANGE = 0.18
const GLOBE_CAM: CameraKeyframe = { position: [0, 0.3, 5.3], target: [0, 0, 0], fov: 32 }
const FLAT_FOV = 12
const TISSOT_RADIUS = 0.09

export function globeCameraDistance(width: number, height: number): number {
  const padding = width <= 600 ? 1.05 : 1.18
  return padding / Math.sin((16 * Math.PI) / 180) / Math.min(1, width / Math.max(1, height))
}

/* ---------------- shaders ---------------- */

const MORPH_CHUNK = /* glsl */ `
uniform float uT;
attribute float aStagger;
float morphT() {
  float t = clamp((uT - aStagger * ${STAGGER_RANGE}) / ${1 - STAGGER_RANGE}, 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}
`

const landVert = /* glsl */ `
${MORPH_CHUNK}
attribute vec3 positionA;
attribute vec3 positionB;
attribute vec2 aArea;
attribute vec2 aAngle;
varying vec2 vAreaAngle;
varying vec3 vGlobeNormal;
void main() {
  float t = morphT();
  vec3 pos = mix(positionA, positionB, t);
  vGlobeNormal = normalize(mix(positionA, positionB, step(0.5, uT)));
  vAreaAngle = vec2(mix(aArea.x, aArea.y, t), mix(aAngle.x, aAngle.y, t));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`

const landFrag = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uAreaOpacity;
uniform float uAngleOpacity;
uniform float uGlobeMix;
uniform float uTextureReady;
varying vec3 vGlobeNormal;
varying vec2 vAreaAngle;
${rampGlsl()}
void main() {
  vec3 col = uColor;
  if (uAreaOpacity > 0.001) {
    col = mix(col, areaRamp(clamp(vAreaAngle.x, -3.0, 3.0)), 0.55 * uAreaOpacity);
  }
  if (uAngleOpacity > 0.001) {
    col = mix(col, angleRamp(clamp(vAreaAngle.y, 0.0, 0.7854)), 0.55 * uAngleOpacity);
  }
  float light = 0.6 + 0.4 * max(0.0, dot(normalize(vGlobeNormal), normalize(vec3(-0.6, 0.7, 1.0))));
  col *= mix(1.0, light, uGlobeMix);
  float photographic = uTextureReady * smoothstep(0.05, 0.9, uGlobeMix);
  gl_FragColor = vec4(col, uOpacity * (1.0 - photographic));
  #include <colorspace_fragment>
}
`

const lineVert = /* glsl */ `
${MORPH_CHUNK}
attribute vec3 positionA;
attribute vec3 positionB;
attribute float aEmphasis;
varying float vEmphasis;
void main() {
  float t = morphT();
  vec3 pos = mix(positionA, positionB, t);
  vEmphasis = aEmphasis;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`

const lineFrag = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uGlobeMix;
uniform float uTextureReady;
varying float vEmphasis;
void main() {
  gl_FragColor = vec4(uColor, uOpacity * mix(1.0, 1.6, vEmphasis) * (1.0 - 0.7 * uGlobeMix * uTextureReady));
  #include <colorspace_fragment>
}
`

const oceanVert = /* glsl */ `
${MORPH_CHUNK}
attribute vec3 positionA;
attribute vec3 positionB;
attribute vec3 aSphere;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec2 vUv;
void main() {
  vec3 pos = mix(positionA, positionB, morphT());
  vNormal = aSphere;
  vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`
const oceanFrag = /* glsl */ `
precision highp float;
uniform vec3 uBase;
uniform vec3 uGlow;
uniform float uOpacity;
uniform float uGlobeMix;
uniform float uTextureReady;
uniform float uGeography;
uniform sampler2D uEarth;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec2 vUv;
void main() {
  vec3 n = normalize(vNormal);
  vec3 view = normalize(cameraPosition - vWorldPos);
  float light = 0.32 + 0.78 * max(0.0, dot(n, normalize(vec3(-0.6, 0.65, 1.0))));
  vec3 satellite = texture2D(uEarth, vUv).rgb;
  float photo = uGeography * uTextureReady * smoothstep(0.05, 0.9, uGlobeMix);
  vec3 col = mix(uBase, satellite, photo);
  col *= mix(1.0, light, uGlobeMix);
  float rim = pow(1.0 - max(0.0, dot(n, view)), 3.0);
  col += uGlow * rim * 0.28 * uGlobeMix;
  gl_FragColor = vec4(col, uOpacity);
  #include <colorspace_fragment>
}
`

const tissotVert = /* glsl */ `
${MORPH_CHUNK}
attribute float aRim;
attribute vec3 iPosA;
attribute vec3 iPosB;
attribute vec4 iParamA;
attribute vec4 iParamB;
uniform float uRadius;
uniform float uGlobeMix;
varying float vRim;
varying float vValid;
void main() {
  float t = morphT();
  vec3 center = mix(iPosA, iPosB, t);
  vec4 prm = mix(iParamA, iParamB, t);
  vValid = prm.w;
  vec2 local = position.xy * vec2(prm.x, prm.y) * uRadius;
  float cr = cos(prm.z);
  float sr = sin(prm.z);
  vec2 scaled = vec2(local.x * cr - local.y * sr, local.x * sr + local.y * cr);
  vec3 flatPos = center + vec3(scaled, 0.002);
  vec3 n = normalize(center + vec3(1e-7));
  vec3 east = normalize(vec3(n.z, 0.0, -n.x) + vec3(1e-7));
  vec3 north = normalize(cross(n, east));
  vec3 globePos = normalize(center + east * scaled.x + north * scaled.y) * 1.004;
  vec3 pos = mix(flatPos, globePos, uGlobeMix);
  if (prm.w < 0.999) pos = center; // collapse instances invalid on either side
  vRim = aRim;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`

const tissotFrag = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uFillAlpha;
varying float vRim;
varying float vValid;
void main() {
  if (vValid < 0.999) discard;
  float stroke = smoothstep(0.86, 0.95, vRim);
  float alpha = max(uFillAlpha, stroke) * uOpacity;
  gl_FragColor = vec4(uColor, alpha);
  #include <colorspace_fragment>
}
`

/* ---------------- engine ---------------- */

interface MorphTarget {
  id: string
  baked: BakedProjection
  isGlobe: boolean
  inverse: InversePointFn | null
  /** forward scalar projection (null for custom targets that don't expose one) */
  point: ProjectPointFn | null
  cam: CameraKeyframe
}

type UniformSet = Record<string, THREE.IUniform>

export class MapStage {
  onHover: HoverCallback | null = null
  onContextLost: (() => void) | null = null
  private quality: MapQuality
  /**
   * Fired after every rendered frame (render-on-demand loop). HTML/SVG
   * overlay layers (region outlines, the Move-a-Circle glyph) re-project
   * here so they track morphs, drags and camera settles exactly.
   */
  onFrame: (() => void) | null = null

  private renderer: THREE.WebGLRenderer | null = null
  private mapRing: THREE.Line | null = null
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100)
  private container: HTMLElement | null = null
  private resizeObserver: ResizeObserver | null = null
  private labelLayer: LabelLayer | null = null

  private theme: StageTheme
  private isMobile = false
  private fitWidth = false
  private morphT = 0
  private morphTargetReq = 0
  private targetA: MorphTarget | null = null
  private targetB: MorphTarget | null = null
  private custom = new Map<string, MorphTarget>()

  // meshes
  private oceanSphere: THREE.Mesh | null = null
  private oceanPlane: THREE.Mesh | null = null
  private landMesh: THREE.Mesh | null = null
  private lakeMesh: THREE.Mesh | null = null
  private coastLines: THREE.LineSegments | null = null
  private graticuleLines: THREE.LineSegments | null = null
  private tissotMesh: THREE.Mesh | null = null
  private geometries: THREE.BufferGeometry[] = []
  private materials: THREE.ShaderMaterial[] = []

  // layer fade state (uniform value → target), 400ms eases
  private fades: Array<{ u: { value: number }; target: number }> = []
  private layers: LayerState = {
    geography: true,
    graticule: false,
    tissot: false,
    area: false,
    angle: false,
  }

  // camera animation state
  private camGoal: CameraKeyframe = GLOBE_CAM
  private camCurrent: CameraKeyframe = GLOBE_CAM
  private azimuth = 0.12
  private rotationVelocity = 0
  private earthTexture: THREE.Texture | null = null
  private textureReady = 0
  private labelsEnabled = true
  private inView = true
  private visibilityObserver: IntersectionObserver | null = null
  private autoRotate = false
  private lastTime = 0
  private rafId: number | null = null
  private disposed = false
  private readonly scratchVecA = new THREE.Vector3()
  private readonly scratchVecB = new THREE.Vector3()

  constructor(opts: { theme?: StageTheme; quality?: MapQuality } = {}) {
    this.theme = opts.theme ?? 'paper'
    this.quality = opts.quality ?? 'overview'
  }

  /* ---------- lifecycle ---------- */

  mount(container: HTMLElement): void {
    if (this.renderer) return
    this.container = container
    this.isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.isMobile ? 1.5 : 2))
    renderer.setClearColor(new THREE.Color(THEME_COLORS[this.theme].background))
    container.appendChild(renderer.domElement)
    Object.assign(renderer.domElement.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'block',
    })
    this.renderer = renderer
    rendererCount(1)
    renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost)
    document.addEventListener('visibilitychange', this.handleVisibility)

    const labelHost = document.createElement('div')
    Object.assign(labelHost.style, {
      position: 'absolute',
      inset: '0',
      overflow: 'hidden',
      pointerEvents: 'none',
    })
    labelHost.setAttribute('aria-hidden', 'true')
    container.appendChild(labelHost)
    this.labelLayer = new LabelLayer(labelHost, LABEL_ANCHORS, this.theme)

    this.resizeObserver = new ResizeObserver(() => this.handleResize())
    this.resizeObserver.observe(container)
    this.handleResize()
    this.visibilityObserver = new IntersectionObserver(([entry]) => {
      this.inView = entry.isIntersecting
      if (this.inView) {
        this.lastTime = 0
        this.invalidate()
      }
    })
    this.visibilityObserver.observe(container)

    renderer.domElement.addEventListener('pointermove', this.handlePointer)
    this.invalidate()
  }

  dispose(): void {
    this.setMapRing([])
    this.disposed = true
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.rafId = null
    this.resizeObserver?.disconnect()
    this.visibilityObserver?.disconnect()
    this.earthTexture?.dispose()
    if (this.renderer) {
      this.renderer.domElement.removeEventListener('pointermove', this.handlePointer)
      this.renderer.domElement.remove()
    }
    for (const g of this.geometries) g.dispose()
    for (const m of this.materials) m.dispose()
    if (this.renderer) {
      rendererCount(-1)
      this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost)
    }
    document.removeEventListener('visibilitychange', this.handleVisibility)
    this.renderer?.dispose()
    this.labelLayer?.dispose()
    this.renderer = null
    this.container = null
  }

  /* ---------- public API ---------- */

  /** Local diagnostics exercise the same recovery path as a device context loss. */
  testContextLoss(): void {
    this.renderer?.forceContextLoss()
  }

  /** Optional Python polyline, in the same normalized plane as the flat map. */
  setMapRing(points: [number, number][], scale = 1): void {
    if (this.mapRing) {
      this.scene.remove(this.mapRing)
      this.mapRing.geometry.dispose()
      ;(this.mapRing.material as THREE.Material).dispose()
      this.mapRing = null
    }
    if (points.length > 1) {
      const geometry = new THREE.BufferGeometry().setFromPoints(
        points.map(([x, y]) => new THREE.Vector3(x / scale, y / scale, 0.015)),
      )
      this.mapRing = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color: THEME_COLORS[this.theme].selection,
          depthTest: false,
        }),
      )
      this.mapRing.renderOrder = 100
      this.scene.add(this.mapRing)
    }
    this.invalidate()
  }

  /** Set the two morph endpoints (baked lazily on first use). */
  async setMorphTargets(a: ProjectionId | string, b: ProjectionId | string): Promise<void> {
    // Generation guard: concurrent calls race (bakes resolve at different
    // times); only the LATEST request may swap targets — a stale resolution
    // must not clobber newer buffers/camera (Morph Studio first-click bug).
    const req = ++this.morphTargetReq
    const [ta, tb] = await Promise.all([this.resolveTarget(a), this.resolveTarget(b)])
    if (this.disposed || !this.renderer || req !== this.morphTargetReq) return
    this.targetA = ta
    this.targetB = tb
    this.uploadBuffers(ta.baked, tb.baked)
    this.setMorph(this.morphT)
  }

  /** Drive the morph (0 = target A, 1 = target B). Pure uniform updates. */
  setMorph(t: number): void {
    this.morphT = Math.min(1, Math.max(0, t))
    const eased = this.morphT * this.morphT * (3 - 2 * this.morphT) // smoothstep for camera
    for (const m of this.materials) {
      if (m.uniforms.uT) m.uniforms.uT.value = this.morphT
      if (m.uniforms.uGlobeMix) m.uniforms.uGlobeMix.value = this.globeMix()
    }
    if (this.targetA && this.targetB) {
      this.camGoal = lerpCam(this.targetA.cam, this.targetB.cam, eased)
    }
    this.updateBackdrop()
    this.invalidate()
  }

  setLayers(partial: Partial<LayerState>): void {
    Object.assign(this.layers, partial)
    this.applyLayerFades()
    this.invalidate()
  }

  setTheme(theme: StageTheme): void {
    this.theme = theme
    const c = THEME_COLORS[theme]
    this.renderer?.setClearColor(new THREE.Color(c.background))
    this.labelLayer?.setTheme(theme)
    if (this.mapRing)
      (this.mapRing.material as THREE.LineBasicMaterial).color.set(THEME_COLORS[theme].selection)
    this.applyThemeUniforms()
    this.invalidate()
  }

  /** Manually keyframe the camera (cleared by the next setMorphTargets). */
  setCameraState(state: Partial<CameraKeyframe>, opts: { immediate?: boolean } = {}): void {
    const next: CameraKeyframe = {
      position: (state.position ?? this.camGoal.position) as [number, number, number],
      target: (state.target ?? this.camGoal.target) as [number, number, number],
      fov: state.fov ?? this.camGoal.fov,
    }
    this.camGoal = next
    if (opts.immediate) this.camCurrent = cloneCam(next)
    this.invalidate()
  }

  setAutoRotate(on: boolean): void {
    this.autoRotate = on
    this.invalidate()
  }

  setFitWidth(on: boolean): void {
    this.fitWidth = on
    for (const target of [this.targetA, this.targetB]) {
      if (target && !target.isGlobe) target.cam = this.flatCamera(target.baked)
    }
    if (this.targetA && this.targetB) this.setMorph(this.morphT)
  }

  resetCamera(): void {
    const target = this.targetB ?? this.targetA
    if (!target) return
    this.azimuth = 0
    this.rotationVelocity = 0
    this.autoRotate = false
    const camera = target.isGlobe ? this.globeCamera() : this.flatCamera(target.baked)
    target.cam = camera
    this.setCameraState(camera, { immediate: true })
  }

  /** Recompute the destination camera for the current canvas size. */
  fitToProjection(id: ProjectionId | string): void {
    const baked = getBaked(id) ?? this.custom.get(id)?.baked
    if (!baked) return
    const isGlobe = id === 'globe' || this.custom.get(id)?.isGlobe === true
    const cam = isGlobe ? this.globeCamera() : this.flatCamera(baked)
    this.camGoal = cam
    const target = this.morphT < 0.5 ? this.targetA : this.targetB
    if (target) target.cam = cam
    this.invalidate()
  }

  /** Register a lab/user projection baked into the shared-vertex format. */
  registerCustomProjection(
    id: string,
    buffers: BakedProjection,
    opts: { inverse?: InversePointFn | null; camera?: CameraKeyframe } = {},
  ): void {
    registerBaked(id, buffers)
    if (this.custom.size >= 3) this.custom.delete(this.custom.keys().next().value!)
    this.custom.set(id, {
      id,
      baked: buffers,
      isGlobe: false,
      inverse: opts.inverse ?? null,
      point: null,
      cam: opts.camera ?? this.flatCamera(buffers),
    })
  }

  /** Current pointer pick → lon/lat (radians) for the dominant target. */
  pick(clientX: number, clientY: number): { lon: number; lat: number } | null {
    if (!this.renderer || !this.container) return null
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(ndc, this.camera)
    const ray = raycaster.ray
    const dominant = this.morphT < 0.5 ? this.targetA : this.targetB
    if (!dominant) return null
    if (dominant.isGlobe || this.globeMix() > 0.5) {
      // analytic ray–unit-sphere
      const o = ray.origin
      const d = ray.direction
      const b = o.dot(d)
      const c = o.lengthSq() - 1
      const disc = b * b - c
      if (disc < 0) return null
      const t = -b - Math.sqrt(disc)
      if (t < 0) return null
      const p = o.clone().addScaledVector(d, t)
      return sphereInverse(p.x, p.y, p.z)
    }
    // flat: intersect z=0 plane
    if (Math.abs(ray.direction.z) < 1e-9) return null
    const t = -ray.origin.z / ray.direction.z
    if (t < 0) return null
    const p = ray.origin.clone().addScaledVector(ray.direction, t)
    const s = dominant.baked.normalizeScale
    const x = p.x / s
    const y = p.y / s
    const bds = dominant.baked.bounds
    if (p.x < bds.minX - 0.05 || p.x > bds.maxX + 0.05) return null
    if (p.y < bds.minY - 0.05 || p.y > bds.maxY + 0.05) return null
    const inv = dominant.inverse
    if (!inv) return null
    return inv(x, y)
  }

  /** Request a single render (state changed). */
  invalidate(): void {
    if (this.disposed) return
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame((t) => this.tick(t))
    }
  }

  /**
   * Project (lon, lat) in radians → container CSS pixels, honoring the
   * current morph (positions interpolate between targets like the label
   * layer) and globe limb-occlusion. Returns null when no targets are set
   * or a target exposes no forward projection. `visible` is false for
   * occluded (far-side) or behind-camera points — callers should break
   * overlay paths there rather than drop the point.
   */
  lonLatToScreen(lon: number, lat: number): { x: number; y: number; visible: boolean } | null {
    if (!this.renderer || !this.container || !this.targetA || !this.targetB) return null
    const wA = this.targetWorld(this.targetA, lon, lat)
    const wB = this.targetWorld(this.targetB, lon, lat)
    if (!wA || !wB) return null
    const t = morphProgress(this.morphT, lon)
    const v = new THREE.Vector3(
      wA.x + (wB.x - wA.x) * t,
      wA.y + (wB.y - wA.y) * t,
      wA.z + (wB.z - wA.z) * t,
    )
    let visible = true
    if (this.globeMix() > 0.5) {
      // far-side limb occlusion (matches LabelLayer, slightly tighter so
      // overlay strokes don't straddle the silhouette)
      const n = v.clone().normalize()
      const toCam = this.camera.position.clone().sub(v).normalize()
      if (n.dot(toCam) < 0.02) visible = false
    }
    const p = v.project(this.camera)
    if (p.z > 1) visible = false
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h, visible }
  }

  /** World-space position of (lon, lat) radians under one morph target. */
  private targetWorld(target: MorphTarget, lon: number, lat: number): THREE.Vector3 | null {
    if (target.isGlobe) {
      const p = spherePoint(lon, lat)
      return new THREE.Vector3(p.x, p.y, p.z)
    }
    if (!target.point) return null
    const p = target.point(lon, lat)
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null
    const s = target.baked.normalizeScale
    return new THREE.Vector3(p.x * s, p.y * s, 0.004)
  }

  /* ---------- internals ---------- */

  private async resolveTarget(id: ProjectionId | string): Promise<MorphTarget> {
    const existing = this.custom.get(id)
    if (existing) return existing
    const baked = await bakeProjection(id as ProjectionId, {
      tissotStepDeg: 30,
      quality: this.quality,
    })
    const def = [
      'globe',
      'mercator',
      'gallPeters',
      'equalEarth',
      'authagraph',
      'mollweide',
      'orthographic',
    ].includes(id)
      ? getProjection(id as ProjectionId)
      : null
    return {
      id,
      baked,
      isGlobe: id === 'globe',
      inverse: def?.invertPoint ?? null,
      point: def?.isGlobe ? null : (def?.projectPoint ?? null),
      cam: id === 'globe' ? this.globeCamera() : this.flatCamera(baked),
    }
  }

  private globeCamera(): CameraKeyframe {
    const distance = globeCameraDistance(
      this.container?.clientWidth ?? 800,
      this.container?.clientHeight ?? 800,
    )
    return { position: [0, 0.25, distance], target: [0, 0, 0], fov: 32 }
  }

  setLabels(visible: boolean): void {
    this.labelsEnabled = visible
    this.invalidate()
  }

  /** Camera orientation is independent of mesh coordinates and pointer picks. */
  settleRotation(): void {
    this.autoRotate = false
    this.invalidate()
  }

  private flatCamera(baked: BakedProjection): CameraKeyframe {
    const aspect = this.container
      ? this.container.clientWidth / Math.max(1, this.container.clientHeight)
      : 16 / 9
    const halfW = (baked.bounds.maxX - baked.bounds.minX) / 2
    const halfH = (baked.bounds.maxY - baked.bounds.minY) / 2
    const vFit = halfH / Math.tan(((FLAT_FOV / 2) * Math.PI) / 180)
    const hFit = halfW / (Math.tan(((FLAT_FOV / 2) * Math.PI) / 180) * aspect)
    // Compact Mercator can crop polar extremes; expanded maps always fit fully.
    const compact = (this.container?.clientWidth ?? 800) <= 600
    const cropPoles = this.fitWidth && window.matchMedia('(max-width: 600px)').matches
    const fit = compact && cropPoles ? hFit : Math.max(vFit, hFit)
    const d = fit * (compact ? 1.035 : 1.08) + (compact ? 0 : 1)
    const cx = (baked.bounds.minX + baked.bounds.maxX) / 2
    const cy = (baked.bounds.minY + baked.bounds.maxY) / 2
    return { position: [cx, cy, d], target: [cx, cy, 0], fov: FLAT_FOV }
  }

  private globeMix(): number {
    const a = this.targetA?.isGlobe ? 1 : 0
    const b = this.targetB?.isGlobe ? 1 : 0
    return a + (b - a) * this.morphT
  }

  /* ---------- buffer upload ---------- */

  private makeMaterial(vert: string, frag: string, uniforms: UniformSet): THREE.ShaderMaterial {
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms,
      transparent: true,
      depthWrite: true,
    })
    this.materials.push(mat)
    return mat
  }

  private track(uniform: { value: number }, target: number): void {
    uniform.value = target
    this.fades.push({ u: uniform, target })
  }

  private uploadBuffers(a: BakedProjection, b: BakedProjection): void {
    const theme = THEME_COLORS[this.theme]

    // --- land ---
    if (!this.landMesh) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute(
        'positionA',
        new THREE.BufferAttribute(new Float32Array(a.vertexCount * 3), 3),
      )
      geo.setAttribute(
        'positionB',
        new THREE.BufferAttribute(new Float32Array(a.vertexCount * 3), 3),
      )
      geo.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(a.vertexCount * 3), 3),
      )
      geo.setAttribute('aStagger', new THREE.BufferAttribute(new Float32Array(a.vertexCount), 1))
      geo.setAttribute('aArea', new THREE.BufferAttribute(new Float32Array(a.vertexCount * 2), 2))
      geo.setAttribute('aAngle', new THREE.BufferAttribute(new Float32Array(a.vertexCount * 2), 2))
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4)
      const mat = this.makeMaterial(landVert, landFrag, {
        uT: { value: this.morphT },
        uColor: { value: new THREE.Color(theme.land) },
        uOpacity: { value: 1 },
        uAreaOpacity: { value: 0 },
        uAngleOpacity: { value: 0 },
        uGlobeMix: { value: this.globeMix() },
        uTextureReady: { value: this.textureReady },
      })
      // lon/lat-space winding flips when triangles wrap onto the sphere —
      // render both sides (flat maps and globe share this geometry).
      mat.side = THREE.DoubleSide
      this.landMesh = new THREE.Mesh(geo, mat)
      this.landMesh.frustumCulled = false
      this.landMesh.renderOrder = 1
      this.scene.add(this.landMesh)
      this.geometries.push(geo)
      this.track(mat.uniforms.uOpacity as { value: number }, 1)
      this.track(mat.uniforms.uAreaOpacity as { value: number }, 0)
      this.track(mat.uniforms.uAngleOpacity as { value: number }, 0)
    }
    this.copyAttr(this.landMesh, 'positionA', a.landPositions)
    this.copyAttr(this.landMesh, 'positionB', b.landPositions)
    this.copyAttr(this.landMesh, 'position', a.landPositions)
    this.copyAttr(this.landMesh, 'aStagger', a.landStagger)
    this.interleaveAttr(this.landMesh, 'aArea', a.landOverlay.logArea, b.landOverlay.logArea)
    this.interleaveAttr(this.landMesh, 'aAngle', a.landOverlay.omega, b.landOverlay.omega)

    // --- lakes (ocean-fill cutouts drawn just above the land plane) ---
    if (!this.lakeMesh) {
      const geo = new THREE.BufferGeometry()
      const n = a.lakePositions.length / 3
      geo.setAttribute('positionA', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
      geo.setAttribute('positionB', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
      geo.setAttribute('aStagger', new THREE.BufferAttribute(new Float32Array(n), 1))
      geo.setAttribute('aArea', new THREE.BufferAttribute(new Float32Array(n * 2), 2))
      geo.setAttribute('aAngle', new THREE.BufferAttribute(new Float32Array(n * 2), 2))
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4)
      const mat = this.makeMaterial(landVert, landFrag, {
        uT: { value: this.morphT },
        uColor: { value: new THREE.Color(theme.lakes) },
        uOpacity: { value: 1 },
        uAreaOpacity: { value: 0 },
        uAngleOpacity: { value: 0 },
        uGlobeMix: { value: this.globeMix() },
        uTextureReady: { value: this.textureReady },
      })
      mat.side = THREE.DoubleSide
      this.lakeMesh = new THREE.Mesh(geo, mat)
      this.lakeMesh.frustumCulled = false
      this.lakeMesh.position.z = 0.0005
      this.lakeMesh.renderOrder = 2
      this.scene.add(this.lakeMesh)
      this.geometries.push(geo)
      this.track(mat.uniforms.uOpacity as { value: number }, 1)
    }
    this.copyAttr(this.lakeMesh, 'positionA', a.lakePositions)
    this.copyAttr(this.lakeMesh, 'positionB', b.lakePositions)
    this.copyAttr(this.lakeMesh, 'aStagger', a.lakeStagger)

    // --- coastlines + graticule (LineSegments) ---
    this.uploadLines(
      'coast',
      a.coastlinePositions,
      b.coastlinePositions,
      a.coastlineStagger,
      new Float32Array(a.coastlineStagger.length), // emphasis 0
      theme.landStroke,
      this.theme === 'atlas' ? 0.55 : 0.9,
    )
    this.uploadLines(
      'graticule',
      a.graticulePositions,
      b.graticulePositions,
      a.graticuleStagger,
      a.graticuleEmphasis,
      theme.graticule,
      theme.graticuleAlpha,
    )

    // --- Tissot instances ---
    this.uploadTissot(a, b, theme)

    // --- ocean backdrop ---
    this.ensureBackdrop(theme)
    this.applyLayerFades(true)
    this.applyThemeUniforms()
    this.updateBackdrop()
  }

  private copyAttr(mesh: THREE.Mesh | THREE.LineSegments, name: string, src: Float32Array): void {
    const attr = (mesh.geometry as THREE.BufferGeometry).getAttribute(name) as THREE.BufferAttribute
    ;(attr.array as Float32Array).set(src)
    attr.needsUpdate = true
  }

  private interleaveAttr(
    mesh: THREE.Mesh,
    name: string,
    srcA: Float32Array,
    srcB: Float32Array,
  ): void {
    const attr = (mesh.geometry as THREE.BufferGeometry).getAttribute(name) as THREE.BufferAttribute
    const dst = attr.array as Float32Array
    for (let i = 0; i < srcA.length; i++) {
      dst[i * 2] = srcA[i]
      dst[i * 2 + 1] = srcB[i]
    }
    attr.needsUpdate = true
  }

  private uploadLines(
    kind: 'coast' | 'graticule',
    posA: Float32Array,
    posB: Float32Array,
    stagger: Float32Array,
    emphasis: Float32Array,
    color: string,
    baseOpacity: number,
  ): void {
    let obj = kind === 'coast' ? this.coastLines : this.graticuleLines
    if (!obj) {
      const geo = new THREE.BufferGeometry()
      const n = stagger.length
      geo.setAttribute('positionA', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
      geo.setAttribute('positionB', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
      geo.setAttribute('aStagger', new THREE.BufferAttribute(new Float32Array(n), 1))
      geo.setAttribute('aEmphasis', new THREE.BufferAttribute(new Float32Array(n), 1))
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4)
      const mat = this.makeMaterial(lineVert, lineFrag, {
        uT: { value: this.morphT },
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: kind === 'coast' ? baseOpacity : 0 },
        uGlobeMix: { value: this.globeMix() },
        uTextureReady: { value: this.textureReady },
      })
      obj = new THREE.LineSegments(geo, mat)
      obj.frustumCulled = false
      obj.renderOrder = 3
      this.scene.add(obj)
      this.geometries.push(geo)
      if (kind === 'coast') {
        this.coastLines = obj
        this.track(mat.uniforms.uOpacity as { value: number }, baseOpacity)
      } else {
        this.graticuleLines = obj
        this.track(mat.uniforms.uOpacity as { value: number }, 0)
        mat.userData.baseOpacity = baseOpacity
      }
    }
    this.copyAttr(obj, 'positionA', posA)
    this.copyAttr(obj, 'positionB', posB)
    this.copyAttr(obj, 'position', posA)
    this.copyAttr(obj, 'aStagger', stagger)
    this.copyAttr(obj, 'aEmphasis', emphasis)
    const mat = obj.material as THREE.ShaderMaterial
    ;(mat.uniforms.uColor.value as THREE.Color).set(color)
    if (kind === 'coast') mat.userData.baseOpacity = baseOpacity
    else mat.userData.baseOpacity = baseOpacity
  }

  private uploadTissot(
    a: BakedProjection,
    b: BakedProjection,
    theme: { tissot: string; tissotFillAlpha: number },
  ): void {
    const n = a.tissotLonLat.length / 2
    if (!this.tissotMesh) {
      // base circle: center + rim fan, aRim = radial fraction
      const SEG = 48
      const basePos: number[] = []
      const rim: number[] = []
      const idx: number[] = []
      basePos.push(0, 0, 0)
      rim.push(0)
      for (let i = 0; i <= SEG; i++) {
        const ang = (i / SEG) * Math.PI * 2
        basePos.push(Math.cos(ang), Math.sin(ang), 0)
        rim.push(1)
      }
      for (let i = 1; i <= SEG; i++) idx.push(0, i, i + 1)
      const geo = new THREE.InstancedBufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(basePos, 3))
      geo.setAttribute('aRim', new THREE.Float32BufferAttribute(rim, 1))
      geo.setIndex(idx)
      geo.instanceCount = n
      geo.setAttribute('iPosA', new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3))
      geo.setAttribute('iPosB', new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3))
      geo.setAttribute('iParamA', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4))
      geo.setAttribute('iParamB', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4))
      geo.setAttribute('aStagger', new THREE.InstancedBufferAttribute(new Float32Array(n), 1))
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4)
      const mat = this.makeMaterial(tissotVert, tissotFrag, {
        uT: { value: this.morphT },
        uRadius: { value: TISSOT_RADIUS },
        uGlobeMix: { value: this.globeMix() },
        uColor: { value: new THREE.Color(theme.tissot) },
        uOpacity: { value: 0 },
        uFillAlpha: { value: theme.tissotFillAlpha },
      })
      mat.depthWrite = false
      this.tissotMesh = new THREE.Mesh(geo, mat)
      this.tissotMesh.frustumCulled = false
      this.tissotMesh.renderOrder = 4
      this.scene.add(this.tissotMesh)
      this.geometries.push(geo)
      this.track(mat.uniforms.uOpacity as { value: number }, 0)
    }
    const geo = this.tissotMesh.geometry as THREE.InstancedBufferGeometry
    if (geo.instanceCount !== n) geo.instanceCount = Math.min(geo.instanceCount, n)
    const setI = (name: string, src: Float32Array) => {
      const attr = geo.getAttribute(name) as THREE.InstancedBufferAttribute
      ;(attr.array as Float32Array).set(src)
      attr.needsUpdate = true
    }
    setI('iPosA', a.tissotPositions)
    setI('iPosB', b.tissotPositions)
    setI('iParamA', a.tissotParams)
    setI('iParamB', b.tissotParams)
    const stag = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      stag[i] = 1 - Math.min(1, Math.abs(a.tissotLonLat[i * 2]) / Math.PI)
    }
    setI('aStagger', stag)
  }

  private ensureBackdrop(theme: { ocean: string; oceanGlow: string }): void {
    if (!this.oceanSphere) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(SURFACE_GRID.sphere.slice(), 3))
      geo.setAttribute('positionA', new THREE.BufferAttribute(SURFACE_GRID.sphere.slice(), 3))
      geo.setAttribute('positionB', new THREE.BufferAttribute(SURFACE_GRID.sphere.slice(), 3))
      geo.setAttribute('aSphere', new THREE.BufferAttribute(SURFACE_GRID.sphere, 3))
      geo.setAttribute('aStagger', new THREE.BufferAttribute(SURFACE_GRID.stagger, 1))
      geo.setAttribute('uv', new THREE.BufferAttribute(SURFACE_GRID.uv, 2))
      const mat = this.makeMaterial(oceanVert, oceanFrag, {
        uT: { value: this.morphT },
        uBase: { value: new THREE.Color(theme.ocean) },
        uGlow: { value: new THREE.Color(theme.oceanGlow) },
        uOpacity: { value: 1 },
        uGlobeMix: { value: this.globeMix() },
        uTextureReady: { value: 0 },
        uGeography: { value: 1 },
        uEarth: { value: null },
      })
      mat.side = THREE.DoubleSide
      mat.transparent = false
      this.oceanSphere = new THREE.Mesh(geo, mat)
      this.oceanSphere.frustumCulled = false
      this.oceanSphere.renderOrder = -1
      this.scene.add(this.oceanSphere)
      this.geometries.push(geo)
      const loader = new THREE.TextureLoader()
      loader.load(
        this.quality === 'overview'
          ? '/textures/earth-overview.webp'
          : '/textures/earth-detail.webp',
        (texture) => {
          if (this.disposed) {
            texture.dispose()
            return
          }
          texture.colorSpace = THREE.SRGBColorSpace
          texture.anisotropy = Math.min(4, this.renderer?.capabilities.getMaxAnisotropy() ?? 1)
          this.earthTexture = texture
          mat.uniforms.uEarth.value = texture
          this.textureReady = 1
          for (const m of this.materials)
            if (m.uniforms.uTextureReady) m.uniforms.uTextureReady.value = 1
          this.invalidate()
        },
        undefined,
        () => {
          /* The vector globe remains usable if imagery is unavailable. */
        },
      )
    }
    if (this.targetA && this.targetB) {
      for (const [attribute, target] of [
        ['positionA', this.targetA],
        ['positionB', this.targetB],
      ] as const) {
        this.copyAttr(
          this.oceanSphere,
          attribute,
          target.baked.surfacePositions ??
            surfacePositions(target.isGlobe, target.point, target.baked.normalizeScale),
        )
      }
    }
  }

  private updateBackdrop(): void {
    if (!this.oceanSphere) return
    const uniforms = (this.oceanSphere.material as THREE.ShaderMaterial).uniforms
    uniforms.uT.value = this.morphT
    uniforms.uGlobeMix.value = this.globeMix()
  }

  /* ---------- layers / theme ---------- */

  private applyLayerFades(immediate = false): void {
    const theme = THEME_COLORS[this.theme]
    const set = (
      mesh: THREE.Mesh | THREE.LineSegments | null,
      key: string,
      on: boolean,
      base: number,
    ) => {
      if (!mesh) return
      const mat = mesh.material as THREE.ShaderMaterial
      const u = mat.uniforms[key] as { value: number }
      const entry = this.fades.find((f) => f.u === u)
      if (entry) entry.target = on ? base : 0
      if (immediate) u.value = on ? base : 0
      mesh.visible = on || u.value > 0.001
    }
    if (this.oceanSphere)
      (this.oceanSphere.material as THREE.ShaderMaterial).uniforms.uGeography.value = this.layers
        .geography
        ? 1
        : 0
    set(this.landMesh, 'uOpacity', this.layers.geography, 1)
    set(this.lakeMesh, 'uOpacity', this.layers.geography, 1)
    set(this.coastLines, 'uOpacity', this.layers.geography, baseCoast(this.theme))
    set(this.graticuleLines, 'uOpacity', this.layers.graticule, theme.graticuleAlpha)
    set(this.tissotMesh, 'uOpacity', this.layers.tissot, 1)
    set(this.landMesh, 'uAreaOpacity', this.layers.area, 1)
    set(this.landMesh, 'uAngleOpacity', this.layers.angle, 1)
  }

  private applyThemeUniforms(): void {
    const theme = THEME_COLORS[this.theme]
    const setColor = (mesh: THREE.Mesh | THREE.LineSegments | null, key: string, color: string) => {
      if (!mesh) return
      const u = (mesh.material as THREE.ShaderMaterial).uniforms[key]
      if (u) (u.value as THREE.Color).set(color)
    }
    setColor(this.landMesh, 'uColor', theme.land)
    setColor(this.lakeMesh, 'uColor', theme.lakes)
    setColor(this.coastLines, 'uColor', theme.landStroke)
    setColor(this.graticuleLines, 'uColor', theme.graticule)
    setColor(this.tissotMesh, 'uColor', theme.tissot)
    setColor(this.oceanSphere, 'uBase', theme.ocean)
    setColor(this.oceanSphere, 'uGlow', theme.oceanGlow)
    setColor(this.oceanPlane, 'uBase', theme.ocean)
    setColor(this.oceanPlane, 'uGlow', theme.oceanGlow)
    if (this.graticuleLines) {
      const f = this.fades.find(
        (x) => x.u === (this.graticuleLines!.material as THREE.ShaderMaterial).uniforms.uOpacity,
      )
      if (f && f.target > 0) f.target = theme.graticuleAlpha
    }
  }

  /* ---------- frame loop ---------- */

  private tick(time: number): void {
    this.rafId = null
    if (this.disposed || !this.renderer || !this.inView || document.hidden) return
    const dt = this.lastTime ? Math.min(0.1, (time - this.lastTime) / 1000) : 0.016
    this.lastTime = time

    const reduced = document.documentElement.dataset.motion === 'reduced'
    const rotating = this.autoRotate && !reduced && this.globeMix() > 0.99
    this.rotationVelocity +=
      ((rotating ? 0.035 : 0) - this.rotationVelocity) * (1 - Math.exp(-dt / 0.28))
    if (reduced) this.rotationVelocity = 0
    this.azimuth += this.rotationVelocity * dt
    this.azimuth = Math.atan2(Math.sin(this.azimuth), Math.cos(this.azimuth))
    if (!rotating) this.azimuth *= Math.exp(-dt / 0.25)

    // 400ms uniform fades (exponential ease, τ ≈ 130ms ≈ 400ms to ~95%)
    let animating =
      rotating || Math.abs(this.rotationVelocity) > 0.0001 || Math.abs(this.azimuth) > 0.0001
    const k = 1 - Math.exp(-dt / 0.13)
    for (const f of this.fades) {
      const delta = f.target - f.u.value
      if (Math.abs(delta) > 1e-3) {
        f.u.value += delta * k
        animating = true
      } else if (f.u.value !== f.target) {
        f.u.value = f.target
      }
    }
    // camera settle (ease-settle, τ ≈ 180ms)
    const camDelta =
      Math.abs(this.camCurrent.fov - this.camGoal.fov) +
      dist3(this.camCurrent.position, this.camGoal.position) +
      dist3(this.camCurrent.target, this.camGoal.target)
    if (camDelta > 1e-4) {
      const ck = 1 - Math.exp(-dt / 0.18)
      this.camCurrent = lerpCam(this.camCurrent, this.camGoal, ck)
      animating = true
    }

    // apply camera (scratch vectors — no per-frame allocation)
    const cc = this.camCurrent
    this.camera.fov = cc.fov
    const pos = this.scratchVecA.set(...cc.position)
    const az = this.azimuth * this.globeMix()
    if (Math.abs(az) > 1e-9) pos.applyAxisAngle(Y_AXIS, az)
    this.camera.position.copy(pos)
    this.camera.lookAt(this.scratchVecB.set(...cc.target))
    this.camera.updateProjectionMatrix()

    // hide fully-faded layers
    this.updateVisibility()

    this.renderer.render(this.scene, this.camera)
    recordFrame()
    this.updateLabels()
    this.onFrame?.()

    if (animating && this.rafId === null) {
      this.rafId = requestAnimationFrame((t) => this.tick(t))
    }
  }

  private updateVisibility(): void {
    const vis = (mesh: THREE.Mesh | THREE.LineSegments | null, key: string) => {
      if (!mesh) return
      const u = (mesh.material as THREE.ShaderMaterial).uniforms[key] as { value: number }
      mesh.visible = u.value > 0.001
    }
    vis(this.landMesh, 'uOpacity')
    vis(this.lakeMesh, 'uOpacity')
    vis(this.coastLines, 'uOpacity')
    vis(this.graticuleLines, 'uOpacity')
    vis(this.tissotMesh, 'uOpacity')
  }

  private updateLabels(): void {
    if (!this.labelLayer || !this.targetA || !this.targetB || !this.container) return
    const dominant = this.morphT < 0.5 ? this.targetA : this.targetB
    this.labelLayer.setVisible(this.labelsEnabled && (this.morphT < 0.02 || this.morphT > 0.98))
    this.labelLayer.update({
      positionsA: this.targetA.baked.labelPositions,
      positionsB: this.targetB.baked.labelPositions,
      t: this.morphT,
      camera: this.camera,
      cameraPos: this.camera.position,
      width: this.container.clientWidth,
      height: this.container.clientHeight,
      globeMix: this.globeMix(),
      azimuth: this.azimuth * this.globeMix(),
      currentId: dominant.id,
    })
  }

  private handleResize(): void {
    if (!this.renderer || !this.container) return
    const w = Math.max(1, this.container.clientWidth)
    const h = Math.max(1, this.container.clientHeight)
    this.isMobile = w < 900
    const maxPixels = this.isMobile ? 1_000_000 : 3_000_000
    this.renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        this.isMobile ? 1.5 : 2,
        Math.sqrt(maxPixels / (w * h)),
      ),
    )
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    for (const target of [this.targetA, this.targetB]) {
      if (target) target.cam = target.isGlobe ? this.globeCamera() : this.flatCamera(target.baked)
    }
    if (this.targetA && this.targetB) this.setMorph(this.morphT)
    this.camera.updateProjectionMatrix()
    this.invalidate()
  }

  private handleVisibility = (): void => {
    if (document.hidden && this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    if (!document.hidden) {
      this.lastTime = 0
      this.invalidate()
    }
  }

  private handleContextLost = (event: Event): void => {
    event.preventDefault()
    this.onContextLost?.()
  }

  private handlePointer = (ev: PointerEvent): void => {
    if (!this.onHover) return
    this.onHover(this.pick(ev.clientX, ev.clientY))
  }
}

/* ---------- helpers ---------- */

const Y_AXIS = new THREE.Vector3(0, 1, 0)

function baseCoast(theme: StageTheme): number {
  return theme === 'atlas' ? 0.55 : 0.9
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function dist3(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function lerpCam(a: CameraKeyframe, b: CameraKeyframe, t: number): CameraKeyframe {
  return {
    position: [
      lerp(a.position[0], b.position[0], t),
      lerp(a.position[1], b.position[1], t),
      lerp(a.position[2], b.position[2], t),
    ],
    target: [
      lerp(a.target[0], b.target[0], t),
      lerp(a.target[1], b.target[1], t),
      lerp(a.target[2], b.target[2], t),
    ],
    fov: lerp(a.fov, b.fov, t),
  }
}

function cloneCam(c: CameraKeyframe): CameraKeyframe {
  return {
    position: [...c.position] as [number, number, number],
    target: [...c.target] as [number, number, number],
    fov: c.fov,
  }
}
