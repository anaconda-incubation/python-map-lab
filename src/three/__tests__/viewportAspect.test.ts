import { expect, it } from 'vitest'
import { viewportAspect } from '../viewportAspect'
import { globeCameraDistance } from '../MapStage'
it('preserves the camera aspect while the Python pane hides the map', () => {
  const visible = viewportAspect(390, 195)
  expect(viewportAspect(0, 0, visible)).toBe(2)
  expect(viewportAspect(0, 195, visible)).toBe(2)
  expect(viewportAspect(390, 0, visible)).toBe(2)
  expect(viewportAspect(320, 240, visible)).toBeCloseTo(4 / 3)
})
it('keeps new and hidden globe cameras finite', () => {
  expect(viewportAspect(0, 0, Infinity)).toBe(1)
  expect(Number.isFinite(globeCameraDistance(0, 0))).toBe(true)
  expect(Number.isFinite(globeCameraDistance(0, 844))).toBe(true)
})
