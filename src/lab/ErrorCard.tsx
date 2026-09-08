/**
 * Friendly Python traceback card (design/lab.md MODE 2): vermilion left
 * border, last line highlighted, plain-English hints for the five most
 * common failure modes.
 */

const HINTS: { match: RegExp; hint: string }[] = [
  {
    match: /must return arrays shaped|shape mismatch|operands could not be broadcast/i,
    hint: 'Shape mismatch — project() must return arrays the same shape as lon and lat. Return (x, y), both computed from the whole array, not a scalar or a single number.',
  },
  {
    match: /NameError|is not defined/i,
    hint: 'Name error — a variable or function was used before it was defined. Check spelling, and remember numpy is available as np (or numpy).',
  },
  {
    match: /ZeroDivisionError|division by zero|divide by zero/i,
    hint: 'Division by zero — probably at a pole or the central meridian. Guard the denominator (np.where or a small epsilon), or accept the hole: NaN/inf vertices are culled, not fatal.',
  },
  {
    match: /invalid value encountered|NaN|not finite/i,
    hint: 'NaN/inf crept in — often log() of a negative, or tan() at ±90°. np.clip the input, or leave the NaNs: they become holes in your map.',
  },
  {
    match: /SyntaxError|IndentationError/i,
    hint: 'Python could not parse the code — check colons after def/if, and consistent 4-space indentation.',
  },
]

const GENERIC_HINT =
  'Remember the contract: lon and lat arrive in RADIANS (not degrees), and the return is (x, y) arrays. np.radians() converts if you think in degrees.'

function hintForError(message: string): string {
  for (const { match, hint } of HINTS) if (match.test(message)) return hint
  return GENERIC_HINT
}

/** Extract the traceback body from a Pyodide/JS error message. */
function tracebackLines(message: string): string[] {
  const lines = message
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.length > 0)
  // drop JS stack frames; keep the Python part
  const start = lines.findIndex((l) => /Traceback|Error|error/i.test(l))
  return (start >= 0 ? lines.slice(start) : lines).slice(0, 14)
}

export interface ErrorCardProps {
  message: string
  onDismiss: () => void
}

export default function ErrorCard({ message, onDismiss }: ErrorCardProps) {
  const lines = tracebackLines(message)
  const last = lines.length - 1
  return (
    <div
      role="alert"
      className="animate-[err-in_300ms_var(--ease-atlas)]"
      style={{
        borderLeft: '3px solid var(--accent)',
        background: 'var(--bg-2)',
        border: '1px solid var(--hair)',
        borderLeftWidth: '3px',
        borderLeftColor: 'var(--accent)',
        padding: '14px 16px',
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="font-ui text-caption font-semibold uppercase" style={{ color: 'var(--accent)' }}>
          Python raised
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="font-ui text-caption uppercase transition-colors hover:text-accent"
          style={{ color: 'var(--fg-3)', minWidth: '44px', minHeight: '44px', margin: '-12px -12px 0 0' }}
          aria-label="Dismiss error"
        >
          ×
        </button>
      </div>
      <pre
        className="mt-2 overflow-x-auto font-mono text-caption"
        style={{ color: 'var(--fg-2)', fontSize: '12px', lineHeight: 1.6 }}
      >
        {lines.map((l, i) => (
          <div key={i} style={i === last ? { color: 'var(--accent)' } : undefined}>
            {l}
          </div>
        ))}
      </pre>
      <p className="mt-3 font-body text-caption" style={{ color: 'var(--fg)' }}>
        {hintForError(message)}
      </p>
      <style>{`@keyframes err-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  )
}
