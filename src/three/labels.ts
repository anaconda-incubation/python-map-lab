/**
 * HTML label layer for the MapStage (design.md §7.1): curated anchors from
 * src/data/labels.json projected to screen space on each state change /
 * rendered frame (render-on-demand keeps this off the hot path). Globe
 * limb-occlusion via normal·view with a 250ms CSS fade. Collision priority:
 * ocean > continent > country > water, max ~14 visible labels.
 */
import * as THREE from 'three'
import { morphProgress } from '../projection/surface'
import type { LabelAnchor } from '../projection/bake'
import { THEME_COLORS, type StageTheme } from './ThemeColors'

export interface LabelUpdateArgs {
  positionsA: Float32Array
  positionsB: Float32Array
  t: number
  camera: THREE.Camera
  cameraPos: THREE.Vector3
  width: number
  height: number
  /** 1 = fully globe, 0 = fully flat */
  globeMix: number
  /** autorotation azimuth (rad) applied to the globe */
  azimuth: number
  currentId: string
}

const MAX_VISIBLE = 14
const KIND_RANK: Record<string, number> = {
  ocean: 0,
  continent: 1,
  country: 2,
  water: 3,
  region: 4,
}

export class LabelLayer {
  private host: HTMLElement
  private anchors: LabelAnchor[]
  private els: HTMLSpanElement[] = []
  private widths: number[] = []
  setVisible(visible: boolean): void { this.host.style.opacity = visible ? '1' : '0' }

  constructor(host: HTMLElement, anchors: LabelAnchor[], theme: StageTheme) {
    this.host = host
    this.anchors = anchors
    for (const a of anchors) {
      const el = document.createElement('span')
      el.textContent = a.name
      el.dataset.labelId = a.id
      Object.assign(el.style, {
        position: 'absolute',
        transform: 'translate(-50%, -50%)',
        fontFamily: 'Inter, sans-serif',
        fontSize: '11px',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontWeight: '500',
        padding: '2px 5px',
        borderRadius: '3px',
        background: theme === 'paper' ? 'rgba(245,241,232,0.9)' : 'rgba(16,28,35,0.84)',
        whiteSpace: 'nowrap',
        opacity: '0',
        transition: 'opacity 250ms ease',
        color: THEME_COLORS[theme].labelInk,
        textShadow:
          theme === 'paper'
            ? '0 0 3px rgba(245,241,232,0.9)'
            : '0 0 3px rgba(14,18,22,0.9)',
      } satisfies Partial<CSSStyleDeclaration>)
      host.appendChild(el)
      this.els.push(el)
      // Font-size and letter spacing are fixed; avoid layout reads in the render loop.
      this.widths.push(a.name.length * 8 + 24)
    }
  }

  setTheme(theme: StageTheme): void {
    for (const el of this.els) {
      el.style.color = THEME_COLORS[theme].labelInk
      el.style.background = theme === 'paper' ? 'rgba(245,241,232,0.9)' : 'rgba(16,28,35,0.84)'
      el.style.textShadow =
        theme === 'paper'
          ? '0 0 3px rgba(245,241,232,0.9)'
          : '0 0 3px rgba(14,18,22,0.9)'
    }
  }

  update(args: LabelUpdateArgs): void {
    const { positionsA, positionsB, t, camera, cameraPos, width, height, globeMix, currentId } =
      args
    const v = new THREE.Vector3()
    const rotated = new THREE.Vector3()
    const scored: Array<{ i: number; rank: number; priority: number }> = []
    const screen: Array<{ x: number; y: number; visible: boolean }> = []

    for (let i = 0; i < this.anchors.length; i++) {
      const a = this.anchors[i]
      let visible = true
      if (a.hide?.includes(currentId)) visible = false
      const ax = positionsA[i * 3]
      const ay = positionsA[i * 3 + 1]
      const az = positionsA[i * 3 + 2]
      const bx = positionsB[i * 3]
      const by = positionsB[i * 3 + 1]
      const bz = positionsB[i * 3 + 2]
      const localT = morphProgress(t, a.lon * Math.PI / 180)
      v.set(ax + (bx - ax) * localT, ay + (by - ay) * localT, az + (bz - az) * localT)
      // limb occlusion on the globe: normal·view with a soft threshold
      if (visible && globeMix > 0.5) {
        rotated.copy(v)
        const n = rotated.clone().normalize()
        const toCam = cameraPos.clone().sub(rotated).normalize()
        if (n.dot(toCam) < 0.06) visible = false
      }
      const proj = v.clone().project(camera)
      const behind = proj.z > 1
      const x = (proj.x * 0.5 + 0.5) * width
      const y = (-proj.y * 0.5 + 0.5) * height
      const onScreen =
        !behind && x > 12 && x < width - 12 && y > 12 && y < height - 12
      screen.push({ x, y, visible: visible && onScreen })
      if (visible && onScreen) {
        scored.push({ i, rank: KIND_RANK[a.kind] ?? 5, priority: a.priority })
      }
    }

    // collision priority: kind rank, then curated priority; keep top ~14
    scored.sort((p, q) => p.rank - q.rank || p.priority - q.priority)
    const keep = new Set<number>()
    const boxes: Array<{ x: number; y: number; w: number; h: number }> = []
    for (const item of scored) {
      const point = screen[item.i]
      const w = this.widths[item.i], h = 30
      const box = { x: point.x - w / 2, y: point.y - h / 2, w, h }
      if (box.x < 8 || box.x + w > width - 8 || box.y < 8 || box.y + h > height - 8) continue
      if (boxes.some(b => box.x < b.x + b.w && box.x + w > b.x && box.y < b.y + b.h && box.y + h > b.y)) continue
      keep.add(item.i); boxes.push(box)
      if (keep.size >= (width < 500 ? 5 : MAX_VISIBLE)) break
    }

    for (let i = 0; i < this.els.length; i++) {
      const el = this.els[i]
      const s = screen[i]
      if (s.visible && keep.has(i)) {
        el.style.left = `${s.x.toFixed(1)}px`
        el.style.top = `${s.y.toFixed(1)}px`
        el.style.opacity = '1'
      } else {
        el.style.opacity = '0'
      }
    }
  }

  dispose(): void {
    for (const el of this.els) el.remove()
    this.els = []
    this.host.remove()
  }
}
