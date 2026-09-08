/**
 * Pyodide lifecycle chip (design/lab.md "Pyodide lifecycle"): idle →
 * starting ("Starting Python runtime (one-time, ~6 MB)…") → ready
 * (seaweed pill) → restarting. Rendered near the header / mode switch.
 */

export type PyStatus = 'idle' | 'starting' | 'ready' | 'restarting' | 'error'

export interface PyStatusChipProps {
  status: PyStatus
}

const COPY: Record<PyStatus, string> = {
  idle: 'python sleeps until first run',
  starting: 'Starting Python runtime (one-time, ~6 MB)…',
  ready: 'python ready · numpy · scipy on demand',
  restarting: 'restarting python runtime…',
  error: 'python unavailable',
}

export default function PyStatusChip({ status }: PyStatusChipProps) {
  const color =
    status === 'ready'
      ? '#7FA88F'
      : status === 'error'
        ? 'var(--accent)'
        : 'var(--fg-3)'
  return (
    <span
      role="status"
      className="inline-flex items-center gap-2 px-3 py-1.5 font-ui uppercase"
      style={{
        border: `1px solid ${status === 'ready' ? 'rgba(127,168,143,0.45)' : 'var(--hair)'}`,
        color,
        fontSize: '10.5px',
        letterSpacing: '0.12em',
        background: 'var(--bg-2)',
      }}
    >
      <span
        aria-hidden
        className={status === 'starting' || status === 'restarting' ? 'py-pulse' : undefined}
        style={{
          width: 7,
          height: 7,
          borderRadius: '9999px',
          background: status === 'ready' ? '#7FA88F' : status === 'idle' ? 'var(--fg-3)' : 'var(--accent)',
        }}
      />
      {COPY[status]}
      <style>{`@keyframes py-pulse-kf { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } } .py-pulse { animation: py-pulse-kf 1.1s ease-in-out infinite; }`}</style>
    </span>
  )
}
