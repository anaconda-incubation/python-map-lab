import { useState } from 'react'
import DraftConfirmation from '@/components/DraftConfirmation'
import solution from '@/python/mollweide-solution.py?raw'
import { mollweideHints as hints } from './mollweideHints'

export default function MollweideChallenge({
  replace,
  running,
}: {
  replace: (code: string) => void
  running: boolean
}) {
  const [hint, setHint] = useState(0),
    [revealed, setRevealed] = useState(false),
    [confirm, setConfirm] = useState(false)
  return (
    <section className="challenge-support" aria-label="Mollweide challenge help">
      <p>
        The target is Mollweide’s 1805 equal-area world map. Shapes and distances still change.{' '}
        <a
          href="https://doc.esri.com/en/arcgis-pro/latest/help/mapping/properties/mollweide.html"
          target="_blank"
          rel="noreferrer"
        >
          About the projection ↗
        </a>
      </p>
      <p className="lesson-small">
        Run Python draws your function. Check result tests it at a 0° central meridian without
        replacing the map. Your draft is kept when a run fails.
      </p>
      {hints.slice(0, hint).map((text) => (
        <p className="challenge-hint" key={text}>
          {text}
        </p>
      ))}
      <div className="lesson-actions">
        {hint < hints.length && (
          <button onClick={() => setHint(hint + 1)}>
            {hint ? 'Next hint' : 'Give me a hint'} →
          </button>
        )}
        <button onClick={() => setRevealed(!revealed)} aria-expanded={revealed}>
          {revealed ? 'Hide worked solution' : 'Reveal worked solution'}
        </button>
      </div>
      {revealed && (
        <div className="worked-solution">
          <h3>One worked approach</h3>
          <p>
            Reading this does not change or run your draft. This version uses a bracketed solver so
            the pole derivative cannot cause a division by zero.
          </p>
          <pre className="helper-code" tabIndex={0}>
            <code>{solution}</code>
          </pre>
          <button className="primary-button" disabled={running} onClick={() => setConfirm(true)}>
            Replace my draft with this solution
          </button>
        </div>
      )}
      <div className="lesson-actions">
        <a href="/notebooks/mollweide-exercise.ipynb" download>
          Download the exercise ↓
        </a>
        <a href="/notebooks/mollweide-solution.ipynb" download>
          Download the worked solution ↓
        </a>
      </div>
      {confirm && (
        <DraftConfirmation
          label="Use the worked solution"
          keep={() => setConfirm(false)}
          replace={() => {
            replace(solution)
            setConfirm(false)
          }}
        />
      )}
    </section>
  )
}
