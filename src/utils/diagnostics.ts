/** Local diagnostics only; no measurements or source are sent to analytics. */
export type Phase = { name: string; ms: number }
const phases: Phase[] = []
let frames = 0,
  renderers = 0
let lcp = 0,
  cls = 0,
  longTasks = 0,
  longestTask = 0,
  largestInteraction = 0
if (typeof PerformanceObserver !== 'undefined') {
  const observe = (type: string, callback: (entries: PerformanceEntry[]) => void, extra = {}) => {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) return
    new PerformanceObserver((list) => callback(list.getEntries())).observe({
      type,
      buffered: true,
      ...extra,
    })
  }
  observe('largest-contentful-paint', (entries) => {
    lcp = entries.at(-1)?.startTime ?? lcp
  })
  observe('layout-shift', (entries) => {
    for (const entry of entries) {
      const shift = entry as PerformanceEntry & { hadRecentInput: boolean; value: number }
      if (!shift.hadRecentInput) cls += shift.value
    }
  })
  observe('longtask', (entries) => {
    longTasks += entries.length
    for (const entry of entries) longestTask = Math.max(longestTask, entry.duration)
  })
  observe(
    'event',
    (entries) => {
      for (const entry of entries) largestInteraction = Math.max(largestInteraction, entry.duration)
    },
    { durationThreshold: 16 },
  )
}
export function recordPhase(name: string, ms: number) {
  phases.push({ name, ms: Math.round(ms) })
  if (phases.length > 80) phases.shift()
}
export async function measure<T>(name: string, work: () => Promise<T>): Promise<T> {
  const start = performance.now()
  try {
    return await work()
  } finally {
    recordPhase(name, performance.now() - start)
  }
}
export function recordFrame() {
  frames++
}
export function rendererCount(delta: number) {
  renderers += delta
}
export function diagnostics() {
  const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
  return {
    renderers,
    frames,
    lab: {
      lcp: Math.round(lcp),
      cumulativeLayoutShift: cls,
      longTasks,
      longestTask: Math.round(longestTask),
      largestObservedInteraction: largestInteraction,
    },
    phases: [...phases],
    resources: resources.map((r) => ({
      path: new URL(r.name).pathname,
      transferred: r.transferSize,
      duration: Math.round(r.duration),
    })),
  }
}
