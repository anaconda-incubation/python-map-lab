import { expect, it } from 'vitest'
import { projectionFromSamples } from '../projectionSamples'

it('keeps neighboring samples on opposite sides of a shifted map cut separate', () => {
  const lon = new Float64Array([1.849, 1.851])
  const lat = new Float64Array([0, 0])
  const samples = {
    lon,
    lat,
    indices: new Map(Array.from(lon, (lo, i) => [`${lo},0`, i] as const)),
  }
  const projected = projectionFromSamples(samples, {
    x: new Float64Array([3.14, -3.14]),
    y: new Float64Array([0, 0]),
    warnings: [],
    stdout: '',
  })
  expect(projected.fn(lon[0], 0).x).toBe(3.14)
  expect(projected.fn(lon[1], 0).x).toBe(-3.14)
  expect(() => projected.fn(1.85, 0)).toThrow('Missing renderer sample')
})

it('excludes deliberate NaN samples from the frame without hiding their count', () => {
  const samples = {
    lon: new Float64Array([0, 1]),
    lat: new Float64Array([0, 0]),
    indices: new Map([
      ['0,0', 0],
      ['1,0', 1],
    ]),
  }
  const projected = projectionFromSamples(samples, {
    x: new Float64Array([2, NaN]),
    y: new Float64Array([-3, NaN]),
    warnings: [],
    stdout: '',
  })
  expect(projected.frame).toEqual({ halfWidth: 2, halfHeight: 3 })
  expect(projected.invalidCount).toBe(1)
  expect(projected.fn(1, 0).x).toBeNaN()
})
