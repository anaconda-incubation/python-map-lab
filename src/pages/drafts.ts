import {
  presetCode,
  readSelection,
  selectionUrl,
  type Draft,
  type Selection,
} from './workspaceState'

/** A saved city example is not a user edit, even after returning to another preset. */
export function isEditedDraft(selection: Selection, draft?: Draft): boolean {
  if (!draft) return false
  const city =
    draft.preset === selection.id
      ? ''
      : draft.preset.startsWith(selection.id + '-')
        ? draft.preset.slice(selection.id.length + 1)
        : null
  if (city === null) return true
  const original = { ...selection, city }
  if (readSelection(selectionUrl(original).slice(1)).city !== city) return true
  return draft.code !== presetCode(original)
}
