import { constructionCamera, constructionWeights } from './authagraphMotion'
import { yieldToBrowser } from '../utils/cooperative'
/**
 * AuthaGraphSequence — the staged construction renderer (design.md §7.2.4):
 *   stage 0  sphere
 *   stage 1  sphere + 24-region subdivision highlight (facet/sector tint)
 *   stage 2  cone transfer — the published 2022 pre-projection (gnomonic
 *            sphere → 4 congruent cones, NQ₁ = sinρ/sin(ρ+θ))
 *   stage 3  unfolded net — the raw facet triangles (published equations,
 *            before rectangle packing)
 *   stage 4  the final 4√3:3 rectangle — the real authagraph.ts output
 *
 * Honest simplifications (documented): the hand-built 96-face curved
 * tetrahedron is represented by the paper's own cone redefinition; region
 * highlighting shows the 24-region pattern (12 routed sectors × 2) rather
 * than all 96; stage-to-stage blends are smoothstepped linear morphs rather
 * than physical hinge rotations. The final flat state is EXACTLY the real
 * projection.
 */
import * as THREE from 'three'
import {
  AUTHAGRAPH_EDGE_SCALE,
  CANONICAL_VERTICES,
  authagraphConePoint,
  authagraphFacetPoint,
  authagraphPoint,
} from '../projection/authagraph'
import { initBakeSystem } from '../projection/bake'
import { D2R } from '../projection/projections'
import { THEME_COLORS, type StageTheme } from './ThemeColors'

const SQRT3 = Math.sqrt(3)
const NET_SCALE = 1 / (2 * SQRT3 * AUTHAGRAPH_EDGE_SCALE)
const ORBIT_UP = new THREE.Vector3(0, 1, 0)

const FACET_TINTS = ['#C2481F', '#A9822E', '#3E6E5E', '#3D4E8C']

interface StageCam {
  position: [number, number, number]
  target: [number, number, number]
  fov: number
}

const vert = /* glsl */ `
uniform vec4 uShapeWeights;
attribute vec3 posSphere;
attribute vec3 posCone;
attribute vec3 posNet;
attribute vec3 posRect;
attribute float aFacet;
attribute float aRegion;
varying float vFacet;
varying float vRegion;
void main() {
  vec3 pos = posSphere * uShapeWeights.x + posCone * uShapeWeights.y
    + posNet * uShapeWeights.z + posRect * uShapeWeights.w;
  vFacet = aFacet;
  vRegion = aRegion;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`

const landFrag = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uRegionOpacity;
uniform vec3 uTint0;
uniform vec3 uTint1;
uniform vec3 uTint2;
uniform vec3 uTint3;
varying float vFacet;
varying float vRegion;
void main() {
  vec3 tint = vFacet < 0.5 ? uTint0 : (vFacet < 1.5 ? uTint1 : (vFacet < 2.5 ? uTint2 : uTint3));
  vec3 col = mix(uColor, tint, 0.38 * uRegionOpacity);
  gl_FragColor = vec4(col, uOpacity);
}
`

const lineFrag = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uOpacity;
void main() { gl_FragColor = vec4(uColor, uOpacity); }
`

/** slerp between two unit vectors, sampled at n points. */
function slerpArc(a: [number, number, number], b: [number, number, number], n: number): Array<[number, number, number]> {
  const d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
  const ang = Math.acos(d)
  const out: Array<[number, number, number]> = []
  if (ang < 1e-9) return [a]
  const s = Math.sin(ang)
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const ka = Math.sin((1 - t) * ang) / s
    const kb = Math.sin(t * ang) / s
    out.push([a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb])
  }
  return out
}

function vec(lon: number, lat: number): [number, number, number] {
  const c = Math.cos(lat)
  return [c * Math.cos(lon), c * Math.sin(lon), Math.sin(lat)]
}

function toLonLat(v: [number, number, number]): [number, number] {
  return [Math.atan2(v[1], v[0]), Math.asin(Math.max(-1, Math.min(1, v[2])))]
}

/** 24-region pattern: tetrahedron edges + medians, in geographic lon/lat. */
function buildRegionLines(): Float64Array {
  // Canonical tetrahedron vertices: facet centers.
  const cv = CANONICAL_VERTICES.map(([lon, lat]) => vec(lon, lat))
  const tris: Array<[number, number, number]> = [
    [0, 1, 2],
    [0, 2, 3],
    [0, 3, 1],
    [1, 3, 2],
  ]
  const pts: number[] = []
  const pushArcCanonical = (a: [number, number, number], b: [number, number, number]) => {
    const arc = slerpArc(a, b, Math.max(4, Math.ceil(Math.acos(Math.max(-1, Math.min(1, a[0]*b[0]+a[1]*b[1]+a[2]*b[2]))) / (2 * D2R))))
    for (let i = 1; i < arc.length; i++) {
      const p = toLonLat(arc[i - 1])
      const q = toLonLat(arc[i])
      pts.push(p[0], p[1], q[0], q[1])
    }
  }
  const edges = new Set<string>()
  for (const [i, j, k] of tris) {
    const vs = [cv[i], cv[j], cv[k]]
    for (let e = 0; e < 3; e++) {
      const a = vs[e]
      const b = vs[(e + 1) % 3]
      const key = [i, j, k][e] < [i, j, k][(e + 1) % 3] ? `${[i, j, k][e]}-${[i, j, k][(e + 1) % 3]}` : `${[i, j, k][(e + 1) % 3]}-${[i, j, k][e]}`
      if (!edges.has(key)) {
        edges.add(key)
        pushArcCanonical(a, b) // tetrahedron edge (great circle)
      }
      // median: vertex → midpoint of opposite edge (splits into 24 regions)
      const m1 = vs[(e + 1) % 3]
      const m2 = vs[(e + 2) % 3]
      const midRaw: [number, number, number] = [
        m1[0] + m2[0],
        m1[1] + m2[1],
        m1[2] + m2[2],
      ]
      const len = Math.hypot(...midRaw)
      const mid: [number, number, number] = [midRaw[0] / len, midRaw[1] / len, midRaw[2] / len]
      pushArcCanonical(a, mid)
    }
  }
  return Float64Array.from(pts)
}

export class AuthaGraphSequence {
  private renderer: THREE.WebGLRenderer | null = null
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100)
  private container: HTMLElement | null = null
  private resizeObserver: ResizeObserver | null = null
  private theme: StageTheme
  private stage = 0
  private camGoal: StageCam = constructionCamera(0)
  private camCurrent: StageCam = constructionCamera(0)
  private landMesh: THREE.Mesh | null = null
  private regionLines: THREE.LineSegments | null = null
  private frameLines: THREE.LineSegments | null = null
  private sphereMesh: THREE.Mesh | null = null
  private geometries: THREE.BufferGeometry[] = []
  private materials: THREE.ShaderMaterial[] = []
  private rafId: number | null = null
  private lastTime = 0
  private disposed = false
  private ready = false
  // user orbit-drag offset (radians), applied around the camera target and
  // faded out as the sequence flattens into the final rectangle (stage ≥ 3.4)
  private orbitAz = 0
  private orbitEl = 0

  constructor(opts: { theme?: StageTheme } = {}) {
    this.theme = opts.theme ?? 'atlas'
  }

  mount(container: HTMLElement): void {
    if (this.renderer) return
    this.container = container
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(new THREE.Color(THEME_COLORS[this.theme].background))
    Object.assign(renderer.domElement.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'block',
    })
    container.appendChild(renderer.domElement)
    this.renderer = renderer
    this.resizeObserver = new ResizeObserver(() => this.handleResize())
    this.resizeObserver.observe(container)
    this.handleResize()
  }

  /** Build all stage buffers (async: loads master geography). Idempotent. */
  async init(): Promise<void> {
    if (this.ready) return
    const { master } = await initBakeSystem()
    if (this.disposed || !this.renderer) return
    await this.buildLand(master.landTri.lon, master.landTri.lat)
    if (this.disposed) return
    this.buildRegionLineBuffers(buildRegionLines())
    this.buildFrame()
    this.buildSphere()
    this.ready = true
    this.setStage(this.stage, 0)
  }

  /**
   * Drive the sequence. `stage` selects the base stage (0..4); `t` morphs
   * toward the next stage (scroll-scrubbed by the chapter).
   */
  setStage(stage: number, t = 0): void {
    const s = Math.min(4, Math.max(0, stage + Math.min(1, Math.max(0, t))))
    this.stage = s
    const weights = constructionWeights(s)
    for (const m of this.materials) {
      if (m.uniforms.uShapeWeights) (m.uniforms.uShapeWeights.value as THREE.Vector4).fromArray(weights)
    }
    // region highlight peaks at stage 1
    for (const m of this.materials) {
      if (m.uniforms.uRegionOpacity) m.uniforms.uRegionOpacity.value = Math.max(0, 1 - Math.abs(s - 1))
    }
    if (this.regionLines) {
      ;(this.regionLines.material as THREE.ShaderMaterial).uniforms.uOpacity.value =
        0.15 + Math.max(0, 1 - Math.abs(s - 1)) * 0.55
    }
    if (this.frameLines) {
      ;(this.frameLines.material as THREE.ShaderMaterial).uniforms.uOpacity.value =
        THREE.MathUtils.smoothstep(s, 3.4, 4.0) * 0.8
    }
    if (this.sphereMesh) {
      ;(this.sphereMesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value =
        Math.max(0, 1 - s / 2) * 0.9
      this.sphereMesh.visible = s < 2
    }
    this.camGoal = constructionCamera(s)
    this.invalidate()
  }

  /**
   * Orbit-drag: offset the camera by (dAz, dEl) radians around its target.
   * Meaningful on the spherical/tetrahedral stages (0–3); the offset fades
   * out automatically as the map flattens into the final rectangle.
   */
  orbitBy(dAz: number, dEl: number): void {
    this.orbitAz += dAz
    this.orbitEl = Math.max(-1.1, Math.min(1.1, this.orbitEl + dEl))
    this.invalidate()
  }

  setTheme(theme: StageTheme): void {
    this.theme = theme
    const c = THEME_COLORS[theme]
    this.renderer?.setClearColor(new THREE.Color(c.background))
    for (const m of this.materials) {
      if (m.uniforms.uColor) (m.uniforms.uColor.value as THREE.Color).set(c.land)
    }
    this.invalidate()
  }

  dispose(): void {
    this.disposed = true
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.resizeObserver?.disconnect()
    for (const g of this.geometries) g.dispose()
    for (const m of this.materials) m.dispose()
    this.renderer?.dispose()
    this.renderer?.domElement.remove()
    this.renderer = null
  }

  /* ---------- buffers ---------- */

  private stagePositions(lonDeg: number, latDeg: number): {
    sphere: [number, number, number]
    cone: [number, number, number]
    net: [number, number]
    rect: [number, number]
    facet: number
    region: number
  } {
    const lon = lonDeg * D2R
    const lat = latDeg * D2R
    const c = Math.cos(lat)
    const sphere: [number, number, number] = [c * Math.sin(lon), Math.sin(lat), c * Math.cos(lon)]
    const cone = authagraphConePoint(lon, lat)
    const net = authagraphFacetPoint(lon, lat)
    const rect = authagraphPoint(lon, lat)
    return {
      sphere,
      cone: [cone[1], cone[2], cone[0]],
      net: [net.x * NET_SCALE, net.y * NET_SCALE],
      rect: [rect.x * NET_SCALE, rect.y * NET_SCALE],
      facet: net.facet,
      region: net.facet * 3 + net.sector,
    }
  }

  private async buildLand(lonsDeg: Float64Array, latsDeg: Float64Array): Promise<void> {
    const n = lonsDeg.length
    const sphere = new Float32Array(n * 3)
    const cone = new Float32Array(n * 3)
    const net = new Float32Array(n * 3)
    const rect = new Float32Array(n * 3)
    const facet = new Float32Array(n)
    const region = new Float32Array(n)
    const jump = 0.3 * 2 * SQRT3 * AUTHAGRAPH_EDGE_SCALE * NET_SCALE * 3 // seam collapse threshold (normalized)
    let deadline = performance.now() + 4
    for (let t = 0; t < n; t += 3) {
      if (t % 192 === 0 && performance.now() >= deadline) {
        await yieldToBrowser()
        if (this.disposed) return
        deadline = performance.now() + 4
      }
      const p = [0, 1, 2].map((k) => this.stagePositions(lonsDeg[t + k], latsDeg[t + k]))
      // collapse triangles crossing facet seams (projected edge too long)
      let seam = false
      for (let e = 0; e < 3 && !seam; e++) {
        const a = p[e]
        const b = p[(e + 1) % 3]
        if (Math.hypot(a.rect[0] - b.rect[0], a.rect[1] - b.rect[1]) > jump) seam = true
      }
      for (let k = 0; k < 3; k++) {
        const src = seam ? p[0] : p[k]
        const i = (t + k) * 3
        sphere[i] = src.sphere[0]
        sphere[i + 1] = src.sphere[1]
        sphere[i + 2] = src.sphere[2]
        cone[i] = src.cone[0]
        cone[i + 1] = src.cone[1]
        cone[i + 2] = src.cone[2]
        net[i] = src.net[0]
        net[i + 1] = src.net[1]
        net[i + 2] = 0
        rect[i] = src.rect[0]
        rect[i + 1] = src.rect[1]
        rect[i + 2] = 0
        facet[t + k] = src.facet
        region[t + k] = src.region
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(sphere, 3))
    geo.setAttribute('posSphere', new THREE.BufferAttribute(sphere, 3))
    geo.setAttribute('posCone', new THREE.BufferAttribute(cone, 3))
    geo.setAttribute('posNet', new THREE.BufferAttribute(net, 3))
    geo.setAttribute('posRect', new THREE.BufferAttribute(rect, 3))
    geo.setAttribute('aFacet', new THREE.BufferAttribute(facet, 1))
    geo.setAttribute('aRegion', new THREE.BufferAttribute(region, 1))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6)
    const c = THEME_COLORS[this.theme]
    const mat = this.makeMat(vert, landFrag, {
      uShapeWeights: { value: new THREE.Vector4(1, 0, 0, 0) },
      uColor: { value: new THREE.Color(c.land) },
      uOpacity: { value: 1 },
      uRegionOpacity: { value: 0 },
      uTint0: { value: new THREE.Color(FACET_TINTS[0]) },
      uTint1: { value: new THREE.Color(FACET_TINTS[1]) },
      uTint2: { value: new THREE.Color(FACET_TINTS[2]) },
      uTint3: { value: new THREE.Color(FACET_TINTS[3]) },
    })
    mat.side = THREE.DoubleSide // winding flips on the sphere (see MapStage)
    this.landMesh = new THREE.Mesh(geo, mat)
    this.landMesh.frustumCulled = false
    this.scene.add(this.landMesh)
    this.geometries.push(geo)
  }

  private buildRegionLineBuffers(lonLatPairs: Float64Array): void {
    const n = lonLatPairs.length / 2
    const sphere = new Float32Array(n * 3)
    const cone = new Float32Array(n * 3)
    const net = new Float32Array(n * 3)
    const rect = new Float32Array(n * 3)
    // lonLatPairs stores radians pairs (lon, lat), 2 vertices per segment
    for (let i = 0; i < n; i++) {
      const lonRad = lonLatPairs[i * 2]
      const latRad = lonLatPairs[i * 2 + 1]
      const c = Math.cos(latRad)
      sphere[i * 3] = c * Math.sin(lonRad)
      sphere[i * 3 + 1] = Math.sin(latRad)
      sphere[i * 3 + 2] = c * Math.cos(lonRad)
      const cp = authagraphConePoint(lonRad, latRad)
      cone[i * 3] = cp[1]
      cone[i * 3 + 1] = cp[2]
      cone[i * 3 + 2] = cp[0]
      const np = authagraphFacetPoint(lonRad, latRad)
      net[i * 3] = np.x * NET_SCALE
      net[i * 3 + 1] = np.y * NET_SCALE
      net[i * 3 + 2] = 0.004
      const rp = authagraphPoint(lonRad, latRad)
      rect[i * 3] = rp.x * NET_SCALE
      rect[i * 3 + 1] = rp.y * NET_SCALE
      rect[i * 3 + 2] = 0.004
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(sphere, 3))
    geo.setAttribute('posSphere', new THREE.BufferAttribute(sphere, 3))
    geo.setAttribute('posCone', new THREE.BufferAttribute(cone, 3))
    geo.setAttribute('posNet', new THREE.BufferAttribute(net, 3))
    geo.setAttribute('posRect', new THREE.BufferAttribute(rect, 3))
    geo.setAttribute('aFacet', new THREE.BufferAttribute(new Float32Array(n), 1))
    geo.setAttribute('aRegion', new THREE.BufferAttribute(new Float32Array(n), 1))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6)
    const c = THEME_COLORS[this.theme]
    const mat = this.makeMat(vert, lineFrag, {
      uShapeWeights: { value: new THREE.Vector4(1, 0, 0, 0) },
      uColor: { value: new THREE.Color(c.landStroke) },
      uOpacity: { value: 0.15 },
    })
    mat.depthWrite = false
    this.regionLines = new THREE.LineSegments(geo, mat)
    this.regionLines.frustumCulled = false
    this.scene.add(this.regionLines)
    this.geometries.push(geo)
  }

  /** The 4√3:3 frame outline (visible at stage 4). */
  private buildFrame(): void {
    const hw = 2 * SQRT3 * AUTHAGRAPH_EDGE_SCALE * NET_SCALE
    const hh = 1.5 * AUTHAGRAPH_EDGE_SCALE * NET_SCALE
    const corners = [
      [-hw, -hh, 0.003],
      [hw, -hh, 0.003],
      [hw, -hh, 0.003],
      [hw, hh, 0.003],
      [hw, hh, 0.003],
      [-hw, hh, 0.003],
      [-hw, hh, 0.003],
      [-hw, -hh, 0.003],
    ]
    const arr = new Float32Array(corners.flat())
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6)
    const c = THEME_COLORS[this.theme]
    const mat = this.makeMat(
      // plain pass-through vertex shader
      `void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      lineFrag,
      { uColor: { value: new THREE.Color(c.landStroke) }, uOpacity: { value: 0 } },
    )
    mat.depthWrite = false
    this.frameLines = new THREE.LineSegments(geo, mat)
    this.frameLines.frustumCulled = false
    this.scene.add(this.frameLines)
    this.geometries.push(geo)
  }

  private buildSphere(): void {
    const geo = new THREE.SphereGeometry(0.995, 96, 64)
    const c = THEME_COLORS[this.theme]
    const mat = this.makeMat(
      `varying vec3 vN; varying vec3 vW;
       void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }`,
      `precision highp float; uniform vec3 uBase; uniform vec3 uGlow; uniform float uOpacity;
       varying vec3 vN; varying vec3 vW;
       void main(){
         vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vW);
         float f = clamp(dot(n, v), 0.0, 1.0);
         vec3 col = uBase * (1.0 - 0.18 * pow(1.0 - f, 2.0));
         col = mix(col, uGlow, pow(1.0 - f, 3.0) * 0.85);
         gl_FragColor = vec4(col, uOpacity);
       }`,
      {
        uBase: { value: new THREE.Color(c.ocean) },
        uGlow: { value: new THREE.Color(c.oceanGlow) },
        uOpacity: { value: 0.9 },
      },
    )
    this.sphereMesh = new THREE.Mesh(geo, mat)
    this.sphereMesh.frustumCulled = false
    this.scene.add(this.sphereMesh)
    this.geometries.push(geo)
  }

  /* ---------- loop ---------- */

  private makeMat(
    vertShader: string,
    fragShader: string,
    uniforms: Record<string, { value: unknown }>,
  ): THREE.ShaderMaterial {
    const mat = new THREE.ShaderMaterial({
      vertexShader: vertShader,
      fragmentShader: fragShader,
      uniforms: uniforms as Record<string, THREE.IUniform>,
      transparent: true,
    })
    this.materials.push(mat)
    return mat
  }

  private invalidate(): void {
    if (this.disposed || this.rafId !== null) return
    this.rafId = requestAnimationFrame((t) => this.tick(t))
  }

  private tick(time: number): void {
    this.rafId = null
    if (this.disposed || !this.renderer) return
    const dt = this.lastTime ? Math.min(0.1, (time - this.lastTime) / 1000) : 0.016
    this.lastTime = time
    const k = 1 - Math.exp(-dt / 0.18)
    const camDelta =
      Math.abs(this.camCurrent.fov - this.camGoal.fov) +
      Math.hypot(
        this.camCurrent.position[0] - this.camGoal.position[0],
        this.camCurrent.position[1] - this.camGoal.position[1],
        this.camCurrent.position[2] - this.camGoal.position[2],
      )
    if (camDelta > 1e-4) {
      this.camCurrent = {
        position: [
          this.camCurrent.position[0] + (this.camGoal.position[0] - this.camCurrent.position[0]) * k,
          this.camCurrent.position[1] + (this.camGoal.position[1] - this.camCurrent.position[1]) * k,
          this.camCurrent.position[2] + (this.camGoal.position[2] - this.camCurrent.position[2]) * k,
        ],
        target: [...this.camGoal.target],
        fov: this.camCurrent.fov + (this.camGoal.fov - this.camCurrent.fov) * k,
      }
    }
    this.camera.fov = this.camCurrent.fov
    const target = new THREE.Vector3(...this.camCurrent.target)
    const pos = new THREE.Vector3(...this.camCurrent.position)
    const orbitW = 1 - THREE.MathUtils.smoothstep(this.stage, 3.0, 3.6)
    if (orbitW > 1e-3 && (Math.abs(this.orbitAz) > 1e-9 || Math.abs(this.orbitEl) > 1e-9)) {
      pos.sub(target)
      pos.applyAxisAngle(ORBIT_UP, this.orbitAz * orbitW)
      const axis = new THREE.Vector3().crossVectors(ORBIT_UP, pos)
      if (axis.lengthSq() > 0.25) pos.applyAxisAngle(axis.normalize(), this.orbitEl * orbitW)
      pos.add(target)
    }
    this.camera.position.copy(pos)
    this.camera.lookAt(target)
    this.camera.updateProjectionMatrix()
    this.renderer.render(this.scene, this.camera)
    if (camDelta > 1e-4) this.invalidate()
  }

  private handleResize(): void {
    if (!this.renderer || !this.container) return
    const w = Math.max(1, this.container.clientWidth)
    const h = Math.max(1, this.container.clientHeight)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.invalidate()
  }
}
