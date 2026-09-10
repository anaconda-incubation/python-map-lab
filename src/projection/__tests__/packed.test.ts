import {expect,it} from 'vitest'
import {pack,unpack} from '../packed'
it('round-trips aligned arrays, nested geometry, and non-finite masks without JSON coercion',()=>{
  const value={nested:[new Float32Array([1.25,-2,NaN]),new Uint32Array([0,255,100000])],points:new Float64Array([Math.PI,Infinity,-Infinity]),name:'world'}
  const encoded=pack(value),decoded=unpack<typeof value>(encoded.buffer as ArrayBuffer)
  expect(decoded).toEqual(value)
  expect(decoded.points.byteOffset%8).toBe(0)
})
it('rejects a truncated download',()=>{expect(()=>unpack(new Uint8Array([9,0,0,0]).buffer)).toThrow('Incomplete map data')})
