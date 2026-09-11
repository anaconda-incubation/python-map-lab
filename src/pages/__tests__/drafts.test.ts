import { expect, it } from 'vitest'
import { isEditedDraft } from '../drafts'
import { presetCode, presetId, type Selection } from '../workspaceState'

it('does not treat a saved city example as an edit when returning to the map', () => {
  for (const id of ['mercator', 'gallPeters', 'equalEarth', 'authagraph', 'experiment-5']) {
    const original: Selection = {
      mode: id.startsWith('experiment') ? 'experiments' : 'learn',
      id,
      city: 'tokyo',
    }
    const returned = { ...original, city: '' }
    expect(isEditedDraft(returned)).toBe(false)
    expect(
      isEditedDraft(returned, { code: presetCode(original), preset: presetId(original) }),
    ).toBe(false)
  }
})

it('protects actual edits and unrecognized saved presets', () => {
  const selection: Selection = { mode: 'learn', id: 'equalEarth', city: 'tokyo' }
  const code = presetCode(selection)
  expect(
    isEditedDraft(selection, {
      code: code.replace('return x, y', 'return -x, y'),
      preset: presetId(selection),
    }),
  ).toBe(true)
  expect(isEditedDraft(selection, { code, preset: 'equalEarth-unknown' })).toBe(true)
  expect(isEditedDraft(selection, { code, preset: 'another-map' })).toBe(true)
})
