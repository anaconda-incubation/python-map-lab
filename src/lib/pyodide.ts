/**
 * Pyodide is pinned by CDN URL — it is NOT an npm dependency (design.md §1).
 * The worker agent (src/workers/) imports these constants to boot the runtime
 * with `loadPyodide({ indexURL: PYODIDE_INDEX_URL })` after injecting
 * `PYODIDE_SCRIPT_URL` inside the worker.
 */
export const PYODIDE_VERSION = '0.26.4'
export const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`
export const PYODIDE_SCRIPT_URL = `${PYODIDE_INDEX_URL}pyodide.js`
