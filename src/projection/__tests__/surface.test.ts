import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { spherePoint, sphereInverse, getProjection } from '../projections'
import { SURFACE_GRID, surfacePositions, morphProgress } from '../surface'
import '../authagraph'

describe('globe orientation and shared surface', () => {
  it('places east to the right of Greenwich in a north-up front camera', () => {
    const camera = new PerspectiveCamera(32, 1, 0.01, 100)
    camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld()
    const east = spherePoint(30 * Math.PI / 180, 0), west = spherePoint(-30 * Math.PI / 180, 0)
    expect(new Vector3(east.x,east.y,east.z).project(camera).x).toBeGreaterThan(0)
    expect(new Vector3(west.x,west.y,west.z).project(camera).x).toBeLessThan(0)
    expect(spherePoint(0,Math.PI/2).y).toBeCloseTo(1)
  })
  it('recovers geographical positions without a second camera rotation', () => {
    for (const [lon,lat] of [[0,0],[1.2,.4],[-2,-.8]]) {
      const p=spherePoint(lon,lat), back=sphereInverse(p.x,p.y,p.z)
      expect(back.lon).toBeCloseTo(lon,8); expect(back.lat).toBeCloseTo(lat,8)
    }
  })
  it('has finite, corresponding buffers for every canonical projection', () => {
    for(const id of ['globe','mercator','equalEarth','gallPeters','authagraph','orthographic'] as const) {
      const def=getProjection(id)
      const positions=surfacePositions(id==='globe',def.projectPoint,1/Math.max(def.frame.halfWidth,def.frame.halfHeight))
      expect(positions.length).toBe(SURFACE_GRID.sphere.length)
      expect(positions.every(Number.isFinite)).toBe(true)
    }
  })
  it('keeps the ocean below the land at both endpoints, without a residual sphere', () => {
    const sphere=surfacePositions(true,null,1), map=surfacePositions(false,(lon,lat)=>({x:lon,y:lat}),1/Math.PI)
    for(let i=0;i<sphere.length;i+=3){
      expect(Math.hypot(sphere[i],sphere[i+1],sphere[i+2])).toBeCloseTo(.986,5)
      expect(map[i+2]).toBeLessThan(0)
    }
  })
  it('keeps overlay anchors aligned with staggered geometry at endpoints and mid-morph', () => {
    for(const lon of [-Math.PI,0,Math.PI]) {
      expect(morphProgress(0,lon)).toBe(0); expect(morphProgress(1,lon)).toBe(1)
    }
    expect(morphProgress(.5,Math.PI)).toBeGreaterThan(morphProgress(.5,0))
  })
})
