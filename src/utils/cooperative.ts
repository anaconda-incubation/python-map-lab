/** Yield a real task boundary so input and animation frames can run. */
export function yieldToBrowser(): Promise<void> {
  const scheduler = (globalThis as typeof globalThis & { scheduler?: { yield?: () => Promise<void> } }).scheduler
  return scheduler?.yield ? scheduler.yield() : new Promise(resolve => setTimeout(resolve, 0))
}

/** Keep expensive preparation within short slices, without changing its result. */
export async function runCooperatively<T>(work: Generator<void, T>, budgetMs = 4): Promise<T> {
  let deadline = performance.now() + budgetMs
  for (;;) {
    const step = work.next()
    if (step.done) return step.value
    if (performance.now() >= deadline) {
      await yieldToBrowser()
      deadline = performance.now() + budgetMs
    }
  }
}
