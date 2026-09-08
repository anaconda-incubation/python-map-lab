/**
 * Loss sparkline (design/lab.md): SVG path, 120×28, vermilion stroke.
 * Fed with the real loss history of the in-flight search.
 */
export interface SparklineProps {
  values: number[]
  width?: number
  height?: number
  label?: string
}

export default function Sparkline({ values, width = 120, height = 28, label }: SparklineProps) {
  const w = width
  const h = height
  let path = ''
  let lastX = 0
  let lastY = h / 2
  if (values.length >= 2) {
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min || 1
    const pts = values.map((v, i) => {
      const x = (i / (values.length - 1)) * (w - 4) + 2
      const y = h - 3 - ((v - min) / span) * (h - 6)
      return [x, y] as const
    })
    path = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    ;[lastX, lastY] = pts[pts.length - 1]
  }
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={label ?? 'Loss history sparkline'}
      style={{ display: 'block' }}
    >
      {path && (
        <>
          <path d={path} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
          <circle cx={lastX} cy={lastY} r={2.4} fill="var(--accent)" />
        </>
      )}
    </svg>
  )
}
