import { describe, expect, it } from 'vitest'
import { challengeSamples, checkMollweide } from '../mollweideChecks'
import reference from './mollweide-reference.json'
const result = () => ({
  x: Float64Array.from(reference.x),
  y: Float64Array.from(reference.y),
  warnings: [],
  stdout: '',
})
describe('Mollweide challenge checks against PROJ fixtures', () => {
  it('uses the independently generated coordinates at the intended sample locations', () => {
    expect(Array.from(challengeSamples.lon)).toEqual(reference.lon)
    challengeSamples.lat.forEach((lat, i) => expect(lat).toBeCloseTo(reference.lat[i], 14))
    expect(checkMollweide(result())).toContain('Checks passed')
  })
  it('rejects missing and nonfinite outputs', () => {
    const output = result()
    output.x[1] = NaN
    expect(() => checkMollweide(output)).toThrow('not finite')
    expect(() => checkMollweide({ ...result(), x: new Float64Array(0) })).toThrow('every input')
  })
  it('rejects a similar-looking map with the wrong scale', () => {
    const output = result()
    output.x = output.x.map((x) => x * 0.9)
    expect(() => checkMollweide(output)).toThrow('differ')
  })
  it('checks local area between the reference coordinates', () => {
    const output = result()
    output.x[49] += 0.001
    expect(() => checkMollweide(output)).toThrow('Local area')
  })
})
