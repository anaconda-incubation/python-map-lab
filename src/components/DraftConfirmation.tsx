import { useEffect, useId, useRef } from 'react'

/** A focused, keyboard-accessible choice before replacing a local draft. */
export default function DraftConfirmation({
  keep,
  replace,
  label,
}: {
  keep: () => void
  replace: () => void
  label: string
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useId()
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return (
    <dialog ref={dialog} className="preset-confirmation" aria-labelledby={title} onCancel={keep}>
      <h2 id={title}>Keep your Python draft?</h2>
      <p>Keep your edits, or replace them with the example’s Python?</p>
      <button autoFocus onClick={keep}>
        Keep my draft
      </button>
      <button onClick={replace}>{label}</button>
    </dialog>
  )
}
