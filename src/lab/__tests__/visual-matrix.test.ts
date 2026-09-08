import { afterAll, describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { runSearchMirror } from '../loss'
import { DEFAULT_WEIGHTS, type Family, type GoalWeights } from '../types'
import { familyFrame, familyProjectFn } from '@/projection/worker-client'

const cases: Array<{ name: string; family: Family; weights: GoalWeights }> = [
  { name: 'Balanced', family: 'equal_area', weights: DEFAULT_WEIGHTS },
  { name: 'Country sizes', family: 'equal_area', weights: { area:10, shape:5, distance:2, direction:1, compact:5, extremes:7 } },
  { name: 'Navigation', family: 'compromise', weights: { area:1, shape:10, distance:4, direction:10, compact:2, extremes:3 } },
  { name: 'Polar regions', family: 'compromise', weights: { area:6, shape:7, distance:5, direction:3, compact:2, extremes:10 } },
]
for (const family of ['equal_area', 'compromise'] as const) {
  for (const key of Object.keys(DEFAULT_WEIGHTS) as Array<keyof GoalWeights>) {
    const weights = { area:0, shape:0, distance:0, direction:0, compact:0, extremes:0 }
    weights[key] = 10
    cases.push({ name: `${family}: ${key} only`, family, weights })
  }
}
const panels: string[] = []
const geo = JSON.parse(readFileSync(new URL('../../../public/geo/ne_110m_land.geojson', import.meta.url), 'utf8'))
const polygons: number[][][][] = geo.features.map((f: { geometry: { type: string; coordinates: number[][][] | number[][][][] } }) => f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).flat()

describe('lab preset and goal extremes', () => {
  for (const c of cases) it(c.name, async () => {
    const result = await runSearchMirror(c.family, c.weights, { maxiter:120 })
    expect(Number.isFinite(result.loss)).toBe(true)
    const fn = familyProjectFn(c.family, result.params), frame = familyFrame(c.family, result.params)
    for (let lat=-89; lat<=89; lat+=2) {
      for (let lon=-180; lon<=180; lon+=10) {
        const p=fn(lon*Math.PI/180,lat*Math.PI/180)
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
        expect(Math.abs(p.x)).toBeLessThanOrEqual(frame.halfWidth+.001)
        expect(Math.abs(p.y)).toBeLessThanOrEqual(frame.halfHeight+.001)
        if(lon>0) expect(p.x).toBeGreaterThan(0)
        if(lat>0) expect(p.y).toBeGreaterThan(0)
      }
    }
    if (process.env.LAB_REVIEW_OUT) {
      const scale=Math.min(340/(frame.halfWidth*2),165/(frame.halfHeight*2))
      const path=polygons.map(poly=>poly.map(ring=>ring.map(([lon,lat],i)=>{
        const p=fn(lon*Math.PI/180,lat*Math.PI/180)
        return `${i?'L':'M'}${(180+p.x*scale).toFixed(1)},${(92-p.y*scale).toFixed(1)}`
      }).join(' ')+'Z').join(' ')).join(' ')
      panels.push(`<figure><figcaption>${c.name}</figcaption><svg viewBox="0 0 360 184"><path d="${path}" fill="#a6b6a1" fill-rule="evenodd" stroke="#233630" stroke-width=".25"/></svg><small>Aspect ${(frame.halfWidth/frame.halfHeight).toFixed(2)} · loss ${result.loss.toFixed(3)}</small></figure>`)
    }
  }, 30000)
})
afterAll(()=>{
  if(process.env.LAB_REVIEW_OUT) writeFileSync(process.env.LAB_REVIEW_OUT,`<!doctype html><meta charset="utf-8"><title>Lab projection visual matrix</title><style>body{margin:22px;background:#f5f1e8;color:#252923;font:14px Georgia}h1{font-size:26px}main{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}figure{margin:0;padding:10px;border:1px solid #d8d0bd}svg{display:block;width:100%}figcaption{font:12px system-ui}small{font:10px system-ui;color:#687269}</style><h1>Lab visual matrix · four presets + every goal in both families</h1><p>120-iteration JavaScript optimizer mirror. Natural Earth 110m outlines; exact generated coordinates. This complements the live WebGL checks.</p><main>${panels.join('')}</main>`)
})
