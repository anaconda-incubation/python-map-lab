/**
 * Main-thread typed client for the Pyodide worker (design.md §8).
 * Lazy spawn, warmup on demand, 10s timeout with automatic hard restart
 * (terminate + respawn) and a toast-friendly error. Each Run executes afresh;
 * Python never runs per animation frame.
 */
import * as Comlink from 'comlink'
import type { PyodideApi } from '../workers/pyodide.worker'
import type { ProjectPointFn } from './types'

export interface RunProjectionResult {
  x: Float64Array
  y: Float64Array
  warnings: string[]
  stdout: string
  mapRing?: [number, number][]
}

export interface OptimizeResult {
  family: string
  params: number[]
  loss: number
  terms: Record<string, number>
  iterations: number
  evaluations: number
  converged: boolean
}

export interface DistortionStats {
  rms_log2_area: number
  median_omega_deg: number
  p95_omega_deg: number
  max_omega_deg: number
  airy_kavrayskiy: number
  samples: number
}

const TIMEOUT_MS = 10_000

class PyodideClient {
  private worker: Worker | null = null
  private proxy: Comlink.Remote<PyodideApi> | null = null
  private warming: Promise<void> | null = null
  private pending = new Set<(error: Error) => void>()
  onStatus: ((status: 'idle' | 'starting' | 'ready' | 'restarting' | 'error') => void) | null = null

  private spawn(): Comlink.Remote<PyodideApi> {
    this.worker = new Worker(new URL('../workers/pyodide.worker.ts', import.meta.url), {
      type: 'module',
    })
    this.proxy = Comlink.wrap<PyodideApi>(this.worker)
    return this.proxy
  }

  private async api(): Promise<Comlink.Remote<PyodideApi>> {
    return this.proxy ?? this.spawn()
  }

  /** Boot the runtime (numpy included). Safe to call early to prewarm. */
  warmup(signal?: AbortSignal): Promise<void> {
    if (!this.warming) {
      this.onStatus?.('starting')
      const warming = this.withTimeout(async () => {
        const api = await this.api()
        await api.warmup()
        this.onStatus?.('ready')
      }, 60_000).catch((err) => {
        if (this.warming === warming) this.warming = null
        this.onStatus?.('error')
        throw err
      })
      this.warming = warming
    }
    return signal ? this.withTimeout(() => this.warming!, 65_000, signal) : this.warming
  }

  private async withTimeout<T>(
    fn: () => Promise<T>,
    ms = TIMEOUT_MS,
    signal?: AbortSignal,
  ): Promise<T> {
    signal?.throwIfAborted()
    let timer: ReturnType<typeof setTimeout> | null = null
    let rejectJob: (error: Error) => void = () => {}
    const abort = () => this.hardRestart(new DOMException('Stopped', 'AbortError'))
    try {
      return await Promise.race([
        fn(),
        new Promise<never>((_, reject) => {
          rejectJob = reject
          this.pending.add(reject)
          signal?.addEventListener('abort', abort, { once: true })
          timer = setTimeout(() => reject(new Error('__timeout__')), ms)
        }),
      ])
    } catch (err) {
      if (err instanceof Error && err.message === '__timeout__') {
        this.hardRestart()
        throw new Error('Python timed out — the runtime was restarted. Try again.')
      }
      throw err
    } finally {
      if (timer) clearTimeout(timer)
      this.pending.delete(rejectJob)
      signal?.removeEventListener('abort', abort)
    }
  }

  /** Hard restart: terminate the worker; next call respawns lazily. */
  hardRestart(error = new DOMException('Python restarted', 'AbortError')): void {
    this.onStatus?.('restarting')
    this.worker?.terminate()
    this.worker = null
    this.proxy = null
    this.warming = null
    for (const reject of this.pending) reject(error)
    this.pending.clear()
  }

  /** Soft restart inside the worker (clears user namespace). */
  async restart(): Promise<void> {
    const api = await this.api()
    await api.restart()
  }

  async runProjection(
    code: string,
    params: Record<string, number>,
    lon: Float64Array,
    lat: Float64Array,
    signal?: AbortSignal,
  ): Promise<RunProjectionResult> {
    await this.warmup(signal)
    const result = await this.withTimeout(
      async () => {
        const api = await this.api()
        // copies, because the worker result transfers its buffers
        return api.runProjection(code, params, lon, lat)
      },
      TIMEOUT_MS,
      signal,
    )
    return result
  }

  async optimizeProjection(
    family: 'equal_area' | 'compromise',
    weights: Record<string, number>,
    opts: { maxiter?: number } = {},
  ): Promise<OptimizeResult> {
    await this.warmup()
    return this.withTimeout(async () => {
      const api = await this.api()
      return (await api.optimizeProjection(family, weights, opts)) as unknown as OptimizeResult
    }, 120_000) // optimizer legitimately takes longer than 10s
  }

  async distortionStats(codeOrId: string): Promise<DistortionStats> {
    await this.warmup()
    return this.withTimeout(async () => {
      const api = await this.api()
      return (await api.distortionStats(codeOrId)) as unknown as DistortionStats
    })
  }
}

/** Shared singleton (one worker per page). */
export const pythonClient = new PyodideClient()

/**
 * TS mirror of the optimizer families (src/python/optimizer.py.ts), used to
 * bake optimized coefficient sets into MapStage buffers without a Python
 * round-trip. Must stay numerically identical to the Python family fns.
 */
export function familyProjectFn(
  family: 'equal_area' | 'compromise',
  params: number[],
): ProjectPointFn {
  if (family === 'equal_area') {
    // Clamp m exactly as src/python/optimizer.py.ts does (BEFORE asin) so the
    // mirror stays numerically identical to the Python family function.
    const [mRaw, a1, a3, a5, a7, a9] = params
    const m = Math.min(1, Math.max(1e-6, mRaw))
    return (lon, lat) => {
      const theta = Math.asin(Math.min(1, Math.max(-1, m * Math.sin(lat))))
      const t2 = theta * theta
      const y = theta * (a1 + t2 * (a3 + t2 * (a5 + t2 * (a7 + t2 * a9))))
      const yp = a1 + t2 * (3 * a3 + t2 * (5 * a5 + t2 * (7 * a7 + t2 * 9 * a9)))
      return { x: (lon * Math.cos(theta)) / (m * yp), y }
    }
  }
  const [mRaw, a1, a3, a5, a7, a9, g0, g2, g4, g6] = params
  const m = Math.min(1, Math.max(1e-6, mRaw))
  return (lon, lat) => {
    const theta = Math.asin(Math.min(1, Math.max(-1, m * Math.sin(lat))))
    const t2 = theta * theta
    const y = theta * (a1 + t2 * (a3 + t2 * (a5 + t2 * (a7 + t2 * a9))))
    const x = lon * (g0 + t2 * (g2 + t2 * (g4 + t2 * g6)))
    return { x, y }
  }
}

/** Frame estimate for a family projection (for bake normalization). */
export function familyFrame(
  family: 'equal_area' | 'compromise',
  params: number[],
): { halfWidth: number; halfHeight: number } {
  const fn = familyProjectFn(family, params)
  let hw = 0
  let hh = 0
  // A custom outline can bulge at intermediate latitudes, beyond both
  // its equator and pole. Sample the full boundary when fitting the camera.
  for (let i = 0; i <= 720; i++) {
    const lat = -Math.PI / 2 + (i * Math.PI) / 720
    const edge = fn(Math.PI, lat)
    if (Number.isFinite(edge.x)) hw = Math.max(hw, Math.abs(edge.x))
    if (Number.isFinite(edge.y)) hh = Math.max(hh, Math.abs(edge.y))
  }
  return { halfWidth: hw || 1, halfHeight: hh || 1 }
}
