import { PYODIDE_INDEX_URL, PYODIDE_SCRIPT_URL } from '@/lib/pyodide'

/**
 * pyodide-demo-runner.ts — chapter-local Pyodide execution for the chapter 11
 * teaching panel (design.md §8). A classic Web Worker is built from a Blob so
 * Pyodide (pinned CDN, §1) can load via importScripts without a build-step
 * worker. NumPy is pulled in via loadPackagesFromImports on first run.
 * One worker is shared module-wide; runs are serialized by the worker.
 */

export type RunStatus = 'booting' | 'running'

export interface RunResult {
  ok: boolean
  ms: number
  error?: string
}

interface RunCallbacks {
  onStdout?: (text: string) => void
  onStatus?: (status: RunStatus) => void
  timeoutMs?: number
}

const WORKER_SOURCE = `
let pyodidePromise = null;
function boot() {
  if (!pyodidePromise) {
    importScripts(${JSON.stringify(PYODIDE_SCRIPT_URL)});
    pyodidePromise = loadPyodide({ indexURL: ${JSON.stringify(PYODIDE_INDEX_URL)} });
  }
  return pyodidePromise;
}
self.onmessage = async (e) => {
  const { id, code } = e.data;
  try {
    self.postMessage({ id, type: 'status', status: 'booting' });
    const py = await boot();
    py.setStdout({ batched: (s) => self.postMessage({ id, type: 'stdout', text: s }) });
    py.setStderr({ batched: (s) => self.postMessage({ id, type: 'stdout', text: s }) });
    await py.loadPackagesFromImports(code);
    self.postMessage({ id, type: 'status', status: 'running' });
    const t0 = performance.now();
    await py.runPythonAsync(code);
    self.postMessage({ id, type: 'done', ms: performance.now() - t0 });
  } catch (err) {
    self.postMessage({ id, type: 'error', error: String(err && err.message ? err.message : err) });
  }
};
`

let worker: Worker | null = null
let nextId = 1

interface Pending {
  callbacks: RunCallbacks
  resolve: (r: RunResult) => void
  t0: number
  timer: number
}

const pending = new Map<number, Pending>()

function getWorker(): Worker {
  if (!worker) {
    const blob = new Blob([WORKER_SOURCE], { type: 'text/javascript' })
    worker = new Worker(URL.createObjectURL(blob))
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as {
        id: number
        type: 'status' | 'stdout' | 'done' | 'error'
        status?: RunStatus
        text?: string
        ms?: number
        error?: string
      }
      const p = pending.get(msg.id)
      if (!p) return
      if (msg.type === 'status' && msg.status) {
        p.callbacks.onStatus?.(msg.status)
      } else if (msg.type === 'stdout' && msg.text !== undefined) {
        p.callbacks.onStdout?.(msg.text)
      } else if (msg.type === 'done') {
        window.clearTimeout(p.timer)
        pending.delete(msg.id)
        p.resolve({ ok: true, ms: msg.ms ?? performance.now() - p.t0 })
      } else if (msg.type === 'error') {
        window.clearTimeout(p.timer)
        pending.delete(msg.id)
        p.resolve({
          ok: false,
          ms: performance.now() - p.t0,
          error: msg.error ?? 'Unknown Python error',
        })
      }
    }
    worker.onerror = (e) => {
      for (const [, p] of pending) {
        window.clearTimeout(p.timer)
        p.resolve({ ok: false, ms: performance.now() - p.t0, error: e.message || 'Worker error' })
      }
      pending.clear()
    }
  }
  return worker
}

/**
 * Warm the runtime before first use (§7.3: lazy warm-up with a visible
 * "starting Python…" state). Safe to call repeatedly — the worker caches
 * the boot promise.
 */
export function warmPython(onStatus?: (s: RunStatus) => void): Promise<RunResult> {
  return runPython("import numpy\nprint('python ready')", { onStatus, timeoutMs: 60000 })
}

/** Run user code with stdout streaming and a timeout (default 10s, §8). */
export function runPython(code: string, callbacks: RunCallbacks = {}): Promise<RunResult> {
  const w = getWorker()
  const id = nextId++
  const t0 = performance.now()
  const timeoutMs = callbacks.timeoutMs ?? 10000
  return new Promise<RunResult>((resolve) => {
    const timer = window.setTimeout(() => {
      pending.delete(id)
      resolve({ ok: false, ms: timeoutMs, error: 'Python timed out (10s).' })
    }, timeoutMs)
    pending.set(id, { callbacks, resolve, t0, timer })
    w.postMessage({ id, code })
  })
}
