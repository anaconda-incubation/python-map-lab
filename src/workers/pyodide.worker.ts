/**
 * Pyodide worker (design.md §1, §8): Python in a dedicated Web Worker,
 * exposed via Comlink. Pyodide 0.26.4 is loaded from the pinned CDN constant
 * in src/lib/pyodide.ts (importScripts in classic workers, ESM pyodide.mjs in
 * module workers). numpy loads on init; scipy lazily on first optimizer call.
 * No Python runs per animation frame — this worker only computes coefficient
 * sets / user projections; results are baked to Float32Array on the main thread.
 */
import * as Comlink from 'comlink'
import { PYODIDE_INDEX_URL, PYODIDE_SCRIPT_URL } from '../lib/pyodide'
import { DISTORTION_PY } from '../python/distortion.py'
import { OPTIMIZER_PY } from '../python/optimizer.py'
import { PROJECTION_ENGINE_PY } from '../python/projection_engine.py'

declare function importScripts(...urls: string[]): void

interface PyodideLike {
  runPython(code: string, options?: { globals?: unknown }): unknown
  runPythonAsync(code: string): Promise<unknown>
  loadPackage(name: string): Promise<void>
  pyimport(name: string): { install: (pkg: string) => Promise<void> }
  globals: { set(name: string, value: unknown): void; get(name: string): unknown }
}

let pyodide: PyodideLike | null = null
let numpyReady = false
let scipyReady = false
let sourcesLoaded = false

async function init(): Promise<PyodideLike> {
  if (pyodide) return pyodide
  // Classic workers: importScripts the UMD build. Module workers (Vite dev /
  // ES worker format): import the pyodide.mjs ESM build. Chrome defines
  // importScripts in module workers too — but it throws — so try/catch.
  let loaded = false
  if (typeof importScripts === 'function') {
    try {
      importScripts(PYODIDE_SCRIPT_URL)
      loaded = true
    } catch {
      loaded = false
    }
  }
  if (!loaded) {
    const mod = (await import(/* @vite-ignore */ `${PYODIDE_INDEX_URL}pyodide.mjs`)) as {
      loadPyodide: unknown
    }
    ;(self as unknown as { loadPyodide: unknown }).loadPyodide = mod.loadPyodide
  }
  const loadPyodide = (self as unknown as { loadPyodide: (o: { indexURL: string }) => Promise<PyodideLike> })
    .loadPyodide
  pyodide = await loadPyodide({ indexURL: PYODIDE_INDEX_URL })
  // numpy on init (micropip, per brief)
  try {
    const micropip = pyodide.pyimport('micropip')
    await micropip.install('numpy')
  } catch {
    await pyodide.loadPackage('micropip')
    const micropip = pyodide.pyimport('micropip')
    await micropip.install('numpy')
  }
  numpyReady = true
  pyodide.runPython(PROJECTION_ENGINE_PY)
  pyodide.runPython(DISTORTION_PY)
  sourcesLoaded = true
  return pyodide
}

async function ensureScipy(): Promise<void> {
  if (scipyReady) return
  const p = await init()
  try {
    const micropip = p.pyimport('micropip')
    await micropip.install('scipy')
  } catch {
    await p.loadPackage('scipy')
  }
  scipyReady = true
}

export interface RunProjectionResult {
  x: Float64Array
  y: Float64Array
  warnings: string[]
  stdout: string
}

const RUN_WRAPPER = `\
def __efc_run_user(code, params, lon, lat):
    import numpy as np, io, contextlib
    lon = np.asarray(lon, dtype=float)  # JsProxy Float64Array → numpy (buffer protocol)
    lat = np.asarray(lat, dtype=float)
    ns = {"np": np, "numpy": np, "__builtins__": __builtins__}
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        exec(code, ns)
        fn = ns.get("project")
        if fn is None or not callable(fn):
            raise ValueError("code must define project(lon, lat[, params])")
        try:
            out = fn(lon, lat, params)
        except TypeError:
            out = fn(lon, lat)
        x = np.asarray(out[0], dtype=float)
        y = np.asarray(out[1], dtype=float)
    warnings = []
    if x.shape != lon.shape or y.shape != lon.shape:
        raise ValueError(
            "project() must return arrays shaped like the input (got %s vs %s)"
            % (x.shape, lon.shape))
    finite = np.isfinite(x) & np.isfinite(y)
    if not finite.all():
        warnings.append("%d non-finite vertices (culled)" % int((~finite).sum()))
        x = np.where(finite, x, np.nan)
        y = np.where(finite, y, np.nan)
    r = np.hypot(np.where(np.isfinite(x), x, np.nan),
                 np.where(np.isfinite(y), y, np.nan))
    med = np.nanmedian(r)
    if np.isfinite(med) and med > 0:
        blow = r > 8 * med
        if blow.any():
            warnings.append(
                "%d vertices beyond 8x median radius culled (explosion clamp)"
                % int(blow.sum()))
            x = np.where(blow, np.nan, x)
            y = np.where(blow, np.nan, y)
    return x, y, warnings, buf.getvalue()
`

async function runProjection(
  code: string,
  params: Record<string, number>,
  lon: Float64Array,
  lat: Float64Array,
): Promise<RunProjectionResult> {
  const p = await init()
  p.globals.set('__efc_code', code)
  p.globals.set('__efc_params', params)
  p.globals.set('__efc_lon', lon)
  p.globals.set('__efc_lat', lat)
  p.runPython(RUN_WRAPPER)
  p.runPython(
    `__efc_result = __efc_run_user(__efc_code, __efc_params, __efc_lon, __efc_lat)`,
  )
  const proxy = p.globals.get('__efc_result') as {
    toJs: (o?: unknown) => [Float64Array, Float64Array, string[], string]
    destroy: () => void
  }
  const [x, y, warnings, stdout] = proxy.toJs({ create_proxies: false })
  proxy.destroy()
  return Comlink.transfer({ x, y, warnings, stdout }, [x.buffer, y.buffer])
}

async function optimizeProjection(
  family: 'equal_area' | 'compromise',
  weights: Record<string, number>,
  opts: { maxiter?: number } = {},
): Promise<Record<string, unknown>> {
  await ensureScipy()
  const p = await init()
  p.runPython(OPTIMIZER_PY)
  p.globals.set('__efc_family', family)
  p.globals.set('__efc_weights', weights)
  p.globals.set('__efc_maxiter', opts.maxiter ?? 600)
  p.runPython(
    `__efc_opt = optimize_projection(__efc_family, __efc_weights, __efc_maxiter)`,
  )
  const proxy = p.globals.get('__efc_opt') as {
    toJs: (o?: unknown) => Map<string, unknown>
    destroy: () => void
  }
  const js = proxy.toJs({ create_proxies: false, dict_converter: Object.fromEntries })
  proxy.destroy()
  return js as unknown as Record<string, unknown>
}

async function distortionStats(codeOrId: string): Promise<Record<string, unknown>> {
  const p = await init()
  p.globals.set('__efc_target', codeOrId)
  p.runPython(RUN_WRAPPER)
  p.runPython(`\
import numpy as np
__efc_id = __efc_target if __efc_target in CANONICAL else None
if __efc_id is not None:
    __efc_fn = lambda lon, lat: project(__efc_id, np.asarray(lon), np.asarray(lat))
    __efc_stats = global_metrics(__efc_fn)
else:
    __efc_ns = {"np": np, "numpy": np, "__builtins__": __builtins__}
    exec(__efc_target, __efc_ns)
    __efc_ufn = __efc_ns.get("project")
    if __efc_ufn is None:
        raise ValueError("code must define project(lon, lat)")
    __efc_fn = lambda lon, lat: __efc_ufn(np.asarray(lon), np.asarray(lat))
    __efc_stats = global_metrics(__efc_fn)
`)
  const proxy = p.globals.get('__efc_stats') as {
    toJs: (o?: unknown) => Map<string, unknown>
    destroy: () => void
  }
  const js = proxy.toJs({ create_proxies: false, dict_converter: Object.fromEntries })
  proxy.destroy()
  return js as unknown as Record<string, unknown>
}

/**
 * Soft restart: clears the user namespace and reloads canonical sources.
 * The client performs a HARD restart (terminate + respawn) after timeouts.
 */
async function restart(): Promise<boolean> {
  const p = pyodide
  if (!p) return false
  p.runPython(`\
import sys
__keep = {"__name__", "__builtins__"}
for __k in list(globals().keys()):
    if __k not in __keep and not __k.startswith("__pyodide"):
        globals().pop(__k, None)
`)
  sourcesLoaded = false
  p.runPython(PROJECTION_ENGINE_PY)
  p.runPython(DISTORTION_PY)
  sourcesLoaded = true
  return true
}

const api = {
  /** Boot the runtime + numpy (idempotent). */
  warmup: async (): Promise<boolean> => {
    await init()
    return numpyReady && sourcesLoaded
  },
  runProjection,
  optimizeProjection,
  distortionStats,
  restart,
}

export type PyodideApi = typeof api

Comlink.expose(api)
