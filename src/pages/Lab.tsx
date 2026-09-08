/**
 * PROJECTION LAB — /lab (design/lab.md). Atlas-dark standalone studio with
 * two modes sharing ONE MapStage instance and ONE Pyodide worker:
 *   DESIGN BY GOAL — six weighted sliders + live KaTeX loss equation +
 *     SciPy Nelder–Mead over two parametric families (with a real in-page
 *     mirror driving the live search visualization).
 *   WRITE PYTHON — CodeMirror 6 editor, user project() evaluated in the
 *     worker on a shared grid, baked + morphed on stage, JS distortion
 *     metrics, params pragmas, tracebacks, sharing + shelf.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { pythonClient, familyProjectFn, familyFrame } from '@/projection/worker-client'
import type { DistortionStats } from '@/projection/worker-client'
import { getProjection } from '@/projection/projections'
import { projectionScorecard, type ProjectionScorecard } from '@/projection/metrics'
import type { ProjectPointFn } from '@/projection/types'
import StageToggle from '@/components/StageToggle'
import ScrubSlider from '@/components/ScrubSlider'
import { useTheme } from '@/hooks/useTheme'
import { useToast } from '@/hooks/useToast'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useMapStage } from '@/lab/useMapStage'
import GoalSliders from '@/lab/GoalSliders'
import LossEquation from '@/lab/LossEquation'
import FamilyPicker from '@/lab/FamilyPicker'
import Sparkline from '@/lab/Sparkline'
import Instrumentation from '@/lab/Instrumentation'
import PythonEditor from '@/lab/PythonEditor'
import ErrorCard from '@/lab/ErrorCard'
import ShelfRail from '@/lab/ShelfRail'
import PyStatusChip, { type PyStatus } from '@/lab/PyStatusChip'
import ResultsPanel, { type DesignResult, type CanonScore } from '@/lab/ResultsPanel'
import { TEMPLATES, ensureContract } from '@/lab/templates'
import { parseParams, paramsRecord, type ParamDef } from '@/lab/params'
import { buildLabGrid, gridProjection, sampleOutline } from '@/lab/gridfn'
import { familyToPython } from '@/lab/codegen'
import { runSearchMirror, optimizerWeights, type LossTerms, type SearchResult } from '@/lab/loss'
import {
  shareFragment,
  parseLabHash,
  loadShelf,
  saveToShelf,
  deleteFromShelf,
  nextProjectionName,
} from '@/lab/share'
import {
  DEFAULT_WEIGHTS,
  COMPARE_CANON,
  type CompareCanonId,
  type Family,
  type GoalWeights,
  type LabMode,
  type LabScores,
  type SharePayload,
  type ShelfEntry,
} from '@/lab/types'

/* ---------------- score mapping helpers ---------------- */

function mapStats(s: DistortionStats): LabScores {
  return {
    rmsLog2Area: s.rms_log2_area,
    medianOmegaDeg: s.median_omega_deg,
    p95OmegaDeg: s.p95_omega_deg,
    maxOmegaDeg: s.max_omega_deg,
    airyKavrayskiy: s.airy_kavrayskiy,
  }
}

function mapScorecard(s: ProjectionScorecard): LabScores {
  return {
    rmsLog2Area: s.rmsLog2AreaError,
    medianOmegaDeg: s.medianOmegaDeg,
    p95OmegaDeg: s.p95OmegaDeg,
    maxOmegaDeg: s.maxOmegaDeg,
    airyKavrayskiy: s.airyKavrayskiy,
  }
}

const CANON_STAGE_NAMES: Record<string, string> = {
  globe: 'The Globe',
  mercator: 'Mercator',
  gallPeters: 'Gall–Peters',
  equalEarth: 'Equal Earth',
  authagraph: 'AuthaGraph',
  mollweide: 'Mollweide',
  orthographic: 'Orthographic',
}

const GRID = buildLabGrid()

/* ================= page ================= */

export default function Lab() {
  useTheme('atlas')
  const { toast } = useToast()
  const { reducedMotion } = useReducedMotion()
  const stage = useMapStage()

  /* ---- mode + pyodide lifecycle ---- */
  const [mode, setMode] = useState<LabMode>(() => {
    if (typeof window === 'undefined') return 'design'
    const h = parseLabHash(window.location.hash)
    if (h.kind === 'mode') return h.mode
    if (h.kind === 'payload') return h.payload.mode
    return 'design'
  })
  const [pyStatus, setPyStatus] = useState<PyStatus>('idle')
  const everReadyRef = useRef(false)
  const warmedRef = useRef(false)

  /* ---- design mode state ---- */
  const [weights, setWeights] = useState<GoalWeights>(DEFAULT_WEIGHTS)
  const [hotKey, setHotKey] = useState<keyof GoalWeights | null>(null)
  const [preset, setPreset] = useState('Balanced')
  const presets: Array<{ name: string; weights: GoalWeights; family: Family; note: string }> = [
    { name: 'Country sizes', family: 'equal_area', weights: { area: 10, shape: 5, distance: 2, direction: 1, compact: 5, extremes: 7 }, note: 'Keep relative areas exact. Find a shape compromise within the equal-area family.' },
    { name: 'Navigation priorities', family: 'compromise', weights: { area: 1, shape: 10, distance: 4, direction: 10, compact: 2, extremes: 3 }, note: 'Explore a stronger preference for local shape and bearings. This optimizer does not guarantee Mercator’s navigation properties.' },
    { name: 'Polar regions', family: 'compromise', weights: { area: 6, shape: 7, distance: 5, direction: 3, compact: 2, extremes: 10 }, note: 'Prioritize reducing extreme distortion. Inspect the polar regions in the result; no projection keeps every property.' },
    { name: 'Balanced', family: 'equal_area', weights: DEFAULT_WEIGHTS, note: 'Start with a balanced set of priorities, then adjust what matters to you.' },
  ]
  const [family, setFamily] = useState<Family>('equal_area')
  const [searching, setSearching] = useState(false)
  const [searchTick, setSearchTick] = useState({ iter: 0, loss: NaN, elapsedMs: 0 })
  const [lossHistory, setLossHistory] = useState<number[]>([])
  const [result, setResult] = useState<DesignResult | null>(null)
  const [designName, setDesignName] = useState('')

  /* ---- python mode state ---- */
  const [code, setCode] = useState<string>(TEMPLATES[0].code)
  const [templateId, setTemplateId] = useState<string>(TEMPLATES[0].id)
  const [filename, setFilename] = useState<string>(TEMPLATES[0].filename)
  const [paramDefs, setParamDefs] = useState<ParamDef[]>(() => parseParams(TEMPLATES[0].code, {}))
  const [running, setRunning] = useState(false)
  const [lastRunMs, setLastRunMs] = useState<number | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [runWarnings, setRunWarnings] = useState<string[]>([])
  const [stdout, setStdout] = useState('')
  const [invalidInfo, setInvalidInfo] = useState<{ count: number; escapeLatDeg: number | null } | null>(null)
  const [pyName, setPyName] = useState('')
  const [ranOnce, setRanOnce] = useState(false)

  /* ---- shared instrumentation / compare / shelf ---- */
  const [scores, setScores] = useState<LabScores | null>(null)
  const [prevScores, setPrevScores] = useState<LabScores | null>(null)
  const [canonScores, setCanonScores] = useState<CanonScore[] | null>(null)
  const [compareActive, setCompareActive] = useState(false)
  const [compareId, setCompareId] = useState<CompareCanonId>('equalEarth')
  const [compareT, setCompareT] = useState(0)
  const [shelf, setShelf] = useState<ShelfEntry[]>(() => loadShelf())
  const [announce, setAnnounce] = useState('')

  /* ---- refs ---- */
  const scoresRef = useRef<LabScores | null>(null)
  const userKeyRef = useRef<string | null>(null)
  const userFnRef = useRef<{ fn: ProjectPointFn; frame: { halfWidth: number; halfHeight: number } } | null>(null)
  const canonCacheRef = useRef<CanonScore[] | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const pingPongRef = useRef(0)
  const progressRef = useRef<{ iteration: number; loss: number; params: number[] } | null>(null)
  const lastCandidateRef = useRef(0)
  const runSeqRef = useRef(0)
  const pendingPayloadRef = useRef<SharePayload | null>(null)
  const hotTimerRef = useRef<number | null>(null)

  const setScoresBoth = useCallback((sc: LabScores) => {
    setPrevScores(scoresRef.current)
    scoresRef.current = sc
    setScores(sc)
  }, [])

  /* ---- pyodide status chip ---- */
  useEffect(() => {
    pythonClient.onStatus = (s) => {
      setPyStatus(s)
      if (s === 'ready') everReadyRef.current = true
      if (s === 'restarting') toast('Python timed out — the runtime was restarted. Try again.', { tone: 'error' })
    }
    return () => {
      pythonClient.onStatus = null
    }
  }, [toast])

  const warmPython = useCallback(() => {
    if (warmedRef.current) return
    warmedRef.current = true
    pythonClient.warmup().catch(() => {
      setPyStatus('error')
      toast('Python runtime could not start — the offline mirror still works for DESIGN BY GOAL.', {
        tone: 'error',
      })
    })
  }, [toast])

  /* ---- weight slider interaction (equation highlight) ---- */
  const changeWeight = useCallback((key: keyof GoalWeights, value: number) => {
    setPreset('Custom')
    setWeights((w) => ({ ...w, [key]: value }))
    setHotKey(key)
    if (hotTimerRef.current) window.clearTimeout(hotTimerRef.current)
    hotTimerRef.current = window.setTimeout(() => setHotKey(null), 1400)
  }, [])

  /* ---- canonical comparison scores (worker distortionStats, JS fallback) ---- */
  const loadCanonScores = useCallback(async (): Promise<CanonScore[]> => {
    if (canonCacheRef.current) return canonCacheRef.current
    const out: CanonScore[] = []
    for (const c of COMPARE_CANON) {
      let s: LabScores | null = null
      if (c.pyId) {
        try {
          s = mapStats(await pythonClient.distortionStats(c.pyId))
        } catch {
          s = null
        }
      }
      if (!s) {
        try {
          s = mapScorecard(projectionScorecard(getProjection(c.id).projectPoint, { samples: 2000 }))
        } catch {
          s = {
            rmsLog2Area: NaN,
            medianOmegaDeg: NaN,
            p95OmegaDeg: NaN,
            maxOmegaDeg: NaN,
            airyKavrayskiy: NaN,
          }
        }
      }
      out.push({ id: c.id, name: c.name, scores: s })
    }
    canonCacheRef.current = out
    return out
  }, [])

  /* ---------------- DESIGN BY GOAL: the search ---------------- */

  const showCandidate = useCallback(
    async (fam: Family, params: number[]) => {
      const key = `lab-cand-${pingPongRef.current++ % 2}`
      try {
        await stage.bakeAndRegister(key, familyProjectFn(fam, params), familyFrame(fam, params))
        await stage.morphTo(key, 350)
      } catch {
        /* candidate bake failures are non-fatal during the search */
      }
    },
    [stage],
  )

  const runSearch = useCallback(async () => {
    if (searching) return
    warmPython()
    setSearching(true)
    setRunError(null)
    setCompareActive(false)
    setLossHistory([])
    progressRef.current = null
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort
    const t0 = performance.now()

    // iteration ticker: sample the mirror's progress at 8 Hz
    const ticker = window.setInterval(() => {
      const p = progressRef.current
      setSearchTick({
        iter: p?.iteration ?? 0,
        loss: p?.loss ?? NaN,
        elapsedMs: performance.now() - t0,
      })
      if (p && Number.isFinite(p.loss)) {
        setLossHistory((h) => (h.length > 0 && h[h.length - 1] === p.loss ? h : [...h.slice(-119), p.loss]))
      }
    }, 125)

    // the live-search mirror (real Nelder–Mead, same objective as SciPy)
    const mirrorPromise = runSearchMirror(family, weights, {
      maxiter: 120,
      signal: abort.signal,
      onProgress: (p) => {
        progressRef.current = p
        const now = performance.now()
        if (!reducedMotion && now - lastCandidateRef.current > 450) {
          lastCandidateRef.current = now
          void showCandidate(family, p.params)
        }
      },
    })

    let finalRes: SearchResult
    try {
      const res = await pythonClient.optimizeProjection(family, optimizerWeights(weights), {
        maxiter: 120,
      })
      abort.abort()
      await mirrorPromise.catch(() => undefined)
      finalRes = {
        params: res.params,
        loss: res.loss,
        terms: (res.terms ?? null) as unknown as LossTerms | null,
        iterations: res.iterations,
        evaluations: res.evaluations,
        converged: res.converged,
        mirror: false,
      }
    } catch (err) {
      const mirrorRes = await mirrorPromise
      finalRes = mirrorRes
      toast(
        `SciPy search unavailable (${err instanceof Error ? err.message : 'error'}) — showing the built-in JS mirror result.`,
        { tone: 'error', durationMs: 5200 },
      )
    } finally {
      window.clearInterval(ticker)
    }

    const elapsedMs = performance.now() - t0
    const fn = familyProjectFn(family, finalRes.params)
    const frame = familyFrame(family, finalRes.params)
    const key = 'lab-design-result'
    try {
      await stage.bakeAndRegister(key, fn, frame)
      await stage.morphTo(key, 1400)
    } catch {
      /* stage gone (unmounted) */
    }
    userKeyRef.current = key
    userFnRef.current = { fn, frame }
    setResult({
      family,
      params: finalRes.params,
      loss: finalRes.loss,
      terms: finalRes.terms,
      iterations: finalRes.iterations,
      evaluations: finalRes.evaluations,
      converged: finalRes.converged,
      mirror: finalRes.mirror,
      elapsedMs,
      stageKey: key,
    })
    setDesignName((n) => n || nextProjectionName())
    setSearching(false)
    setScoresBoth(mapScorecard(projectionScorecard(fn, { samples: 2500 })))
    void loadCanonScores().then(setCanonScores)
    setAnnounce(
      finalRes.converged
        ? `Search converged in ${finalRes.iterations} iterations. Final loss ${finalRes.loss.toFixed(4)}. Your projection is on the stage.`
        : `Search budget exhausted after ${finalRes.iterations} iterations — best found is on the stage.`,
    )
  }, [searching, family, weights, warmPython, reducedMotion, showCandidate, stage, toast, loadCanonScores, setScoresBoth])

  /* ---------------- WRITE PYTHON: run ---------------- */

  const runPythonCode = useCallback(
    async (codeStr: string, params: Record<string, number>) => {
      const seq = ++runSeqRef.current
      setRunning(true)
      setRunError(null)
      setCompareActive(false)
      warmPython()
      const t0 = performance.now()
      try {
        const res = await pythonClient.runProjection(codeStr, params, GRID.lon, GRID.lat)
        if (seq !== runSeqRef.current) return
        const gp = gridProjection(GRID, res.x, res.y)
        const key = 'lab-python-result'
        await stage.bakeAndRegister(key, gp.fn, gp.frame)
        await stage.morphTo(key, 1600)
        if (seq !== runSeqRef.current) return
        userKeyRef.current = key
        userFnRef.current = { fn: gp.fn, frame: gp.frame }
        setScoresBoth(mapScorecard(projectionScorecard(gp.fn, { samples: 2500 })))
        setLastRunMs(Math.round(performance.now() - t0))
        setRunWarnings(res.warnings)
        setStdout(res.stdout)
        setInvalidInfo(gp.invalidCount > 0 ? { count: gp.invalidCount, escapeLatDeg: gp.escapeLatDeg } : null)
        setRanOnce(true)
        setPyName((n) => n || nextProjectionName())
        void loadCanonScores().then(setCanonScores)
        const ms = Math.round(performance.now() - t0)
        toast(`Projection rendered — done in ${ms} ms`)
        setAnnounce(
          gp.invalidCount > 0
            ? `Projection rendered with ${gp.invalidCount} vertices culled as holes. The map shows the survivors.`
            : 'Projection rendered on the stage.',
        )
      } catch (err) {
        if (seq !== runSeqRef.current) return
        setRunError(err instanceof Error ? err.message : String(err))
        setAnnounce('Python raised an error — see the traceback card under the editor.')
      } finally {
        if (seq === runSeqRef.current) setRunning(false)
      }
    },
    [stage, warmPython, toast, loadCanonScores, setScoresBoth],
  )

  const runPython = useCallback(() => {
    const { code: ensured, restored } = ensureContract(code)
    if (restored) {
      setCode(ensured)
      toast('The contract header is pinned — it was re-inserted at the top.')
    }
    void runPythonCode(ensured, paramsRecord(paramDefs))
  }, [code, paramDefs, runPythonCode, toast])

  /* param sliders re-run automatically (debounced 250ms) after the first run */
  const paramsSig = JSON.stringify(paramDefs.map((p) => p.value))
  useEffect(() => {
    if (!ranOnce || mode !== 'python') return
    const t = window.setTimeout(() => {
      void runPythonCode(code, paramsRecord(paramDefs))
    }, 250)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsSig])

  /* code edits re-scan the param pragmas */
  const onCodeChange = useCallback(
    (next: string) => {
      setCode(next)
      setParamDefs(parseParams(next, paramsRecord(paramDefs)))
    },
    [paramDefs],
  )

  const loadTemplate = useCallback(
    (id: string) => {
      const t = TEMPLATES.find((x) => x.id === id)
      if (!t) return
      if (code !== TEMPLATES.find((x) => x.id === templateId)?.code) {
        if (!window.confirm(`Replace the editor contents with the ${t.label} template?`)) return
      }
      setTemplateId(t.id)
      setCode(t.code)
      setFilename(t.filename)
      setParamDefs(parseParams(t.code, {}))
      setRunError(null)
    },
    [code, templateId],
  )

  const resetCode = useCallback(() => {
    const t = TEMPLATES.find((x) => x.id === templateId) ?? TEMPLATES[0]
    setCode(t.code)
    setParamDefs(parseParams(t.code, {}))
    setRunError(null)
    setStdout('')
    toast(`Reset to ${t.label}.`)
  }, [templateId, toast])

  /* ---------------- naming / share / shelf ---------------- */

  const activeName = mode === 'design' ? designName : pyName
  const setActiveName = mode === 'design' ? setDesignName : setPyName

  const currentPayload = useCallback((): SharePayload | null => {
    const outline = userFnRef.current
      ? sampleOutline(userFnRef.current.fn, userFnRef.current.frame)
      : undefined
    if (mode === 'design') {
      if (!result) return null
      return {
        v: 1,
        mode: 'design',
        family: result.family,
        params: result.params,
        weights,
        name: designName || 'MY PROJECTION #1',
        outline,
      }
    }
    return {
      v: 1,
      mode: 'python',
      code,
      params: paramsRecord(paramDefs),
      name: pyName || 'MY PROJECTION #1',
      outline,
    }
  }, [mode, result, weights, designName, code, paramDefs, pyName])

  const onShare = useCallback(async () => {
    const payload = currentPayload()
    if (!payload) {
      toast('Run a projection first.', { tone: 'error' })
      return
    }
    const fragment = shareFragment(payload)
    if (!fragment) {
      toast('Code too long to share as a link — use Save locally instead.', { tone: 'error', durationMs: 5200 })
      return
    }
    const url = `${window.location.origin}${window.location.pathname}${fragment}`
    try {
      await navigator.clipboard.writeText(url)
      window.history.replaceState(null, '', fragment)
      toast('Link copied — projection serialized into the URL.')
    } catch {
      window.history.replaceState(null, '', fragment)
      toast('Link is in the address bar now — copy it from there.')
    }
  }, [currentPayload, toast])

  const onSave = useCallback(() => {
    const payload = currentPayload()
    if (!payload) {
      toast('Run a projection first.', { tone: 'error' })
      return
    }
    setShelf(saveToShelf({ name: payload.name, payload }))
    toast(`${payload.name} saved to the shelf.`)
  }, [currentPayload, toast])

  /* ---------------- restore a projection (shelf / URL) ---------------- */

  const applyDesignPayload = useCallback(
    async (p: Extract<SharePayload, { mode: 'design' }>) => {
      setMode('design')
      setWeights(p.weights)
      setFamily(p.family)
      setDesignName(p.name)
      setCompareActive(false)
      const fn = familyProjectFn(p.family, p.params)
      const frame = familyFrame(p.family, p.params)
      const key = 'lab-design-result'
      await stage.bakeAndRegister(key, fn, frame)
      await stage.morphTo(key, 1400)
      userKeyRef.current = key
      userFnRef.current = { fn, frame }
      setResult({
        family: p.family,
        params: p.params,
        loss: NaN,
        terms: null,
        iterations: 0,
        evaluations: 0,
        converged: true,
        mirror: false,
        elapsedMs: 0,
        stageKey: key,
      })
      setScoresBoth(mapScorecard(projectionScorecard(fn, { samples: 2500 })))
      void loadCanonScores().then(setCanonScores)
      setAnnounce(`Restored ${p.name} on the stage.`)
    },
    [stage, setScoresBoth, loadCanonScores],
  )

  const applyPythonPayload = useCallback(
    async (p: Extract<SharePayload, { mode: 'python' }>) => {
      setMode('python')
      setCode(p.code)
      setTemplateId('blank')
      setFilename('shared_projection.py')
      setParamDefs(parseParams(p.code, p.params))
      setPyName(p.name)
      await runPythonCode(p.code, p.params)
    },
    [runPythonCode],
  )

  const applyPayload = useCallback(
    async (p: SharePayload) => {
      warmPython()
      if (p.mode === 'design') await applyDesignPayload(p)
      else await applyPythonPayload(p)
    },
    [applyDesignPayload, applyPythonPayload, warmPython],
  )

  /* hash on mount (deep links: /lab#design, /lab#python, /lab#p=…) */
  useEffect(() => {
    const h = parseLabHash(window.location.hash)
    if (h.kind === 'payload') pendingPayloadRef.current = h.payload
    const onHash = () => {
      const parsed = parseLabHash(window.location.hash)
      if (parsed.kind === 'mode') setMode(parsed.mode)
      else if (parsed.kind === 'payload') void applyPayload(parsed.payload)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [applyPayload])

  /* apply the pending payload once the stage is ready */
  useEffect(() => {
    if (!stage.ready || !pendingPayloadRef.current) return
    const p = pendingPayloadRef.current
    pendingPayloadRef.current = null
    void applyPayload(p)
  }, [stage.ready, applyPayload])

  /* keep the hash honest for plain mode links */
  const switchMode = useCallback((m: LabMode) => {
    setMode(m)
    const h = window.location.hash
    if (h === '' || h === '#design' || h === '#python') {
      window.history.replaceState(null, '', `#${m}`)
    }
  }, [])

  const loadShelfEntry = useCallback(
    (entry: ShelfEntry) => {
      void applyPayload(entry.payload)
    },
    [applyPayload],
  )

  /* ---------------- compare on stage ---------------- */

  const toggleCompare = useCallback(async () => {
    if (compareActive) {
      stage.scrubTo(0, 300)
      setCompareActive(false)
      setCompareT(0)
      return
    }
    const key = userKeyRef.current
    if (!key) {
      toast('Run a projection first — then compare it against the canon.', { tone: 'error' })
      return
    }
    setCompareActive(true)
    setCompareT(0)
    await stage.setPair(key, compareId, 0)
    setAnnounce(`Comparing against ${COMPARE_CANON.find((c) => c.id === compareId)?.name}. Drag the slider to morph between the two maps.`)
  }, [compareActive, compareId, stage, toast])

  useEffect(() => {
    if (!compareActive || !userKeyRef.current) return
    void stage.setPair(userKeyRef.current, compareId, compareT)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareId])

  const onCompareScrub = useCallback(
    (t: number) => {
      setCompareT(t)
      stage.setT(t)
    },
    [stage],
  )

  /* ---------------- derived UI state ---------------- */

  const captionName =
    activeName ||
    CANON_STAGE_NAMES[stage.currentId] ||
    (userKeyRef.current === stage.currentId ? 'YOUR PROJECTION' : CANON_STAGE_NAMES[stage.currentId] ?? 'Custom projection')

  const showNamePlate = Boolean(result || ranOnce)
  const stageAria = `Map stage. Current map: ${captionName}. ${
    scores
      ? `RMS log2 area ${scores.rmsLog2Area.toFixed(2)}, median angular deformation ${scores.medianOmegaDeg.toFixed(1)} degrees.`
      : ''
  } Layers on: ${Object.entries(stage.layers)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(', ')}.`

  const searchDisabled = searching || (pyStatus === 'starting' && !everReadyRef.current)
  const pythonChip = running
    ? 'running'
    : lastRunMs !== null
      ? `done in ${lastRunMs} ms`
      : 'idle'

  /* ---------------- send design result to python mode ---------------- */

  const sendToPython = useCallback(() => {
    if (!result) return
    const loss = Number.isFinite(result.loss) ? result.loss : 0
    const name = designName || 'MY PROJECTION #1'
    const generated = familyToPython(result.family, result.params, name, loss)
    setCode(generated)
    setTemplateId('blank')
    setFilename(`${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'my_projection'}.py`)
    setParamDefs(parseParams(generated, {}))
    setRunError(null)
    switchMode('python')
    toast('Coefficients written into the editor — run it to see the same map from your own code.')
  }, [result, designName, switchMode, toast])

  /* ================= render ================= */

  return (
    <div style={{ background: 'var(--bg)' }}>
      {/* screen-reader status */}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announce}
      </p>

      {/* ---------- header ---------- */}
      <div className="mx-auto max-w-container px-[var(--gutter)] pb-8 pt-14">
        <p className="font-ui text-kicker uppercase" style={{ color: 'var(--fg-3)' }}>
          <Link to="/" className="transition-colors hover:text-accent">
            The essay
          </Link>
          <span aria-hidden> / </span>
          <span style={{ color: 'var(--fg-2)' }}>Projection Lab</span>
        </p>
        <p className="kicker mt-8" style={{ color: 'var(--gold)' }}>
          The Projection Lab
        </p>
        <h1
          className="display-tight mt-4 font-display text-chapter"
          style={{ color: 'var(--fg)', fontWeight: 400 }}
        >
          Build your own answer.
        </h1>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <p
            className="max-w-measure font-body text-standfirst italic"
            style={{ color: 'var(--fg-2)' }}
          >
            A projection is a function and a function is a choice. Choose your tradeoffs and let an
            optimizer search — or write the mathematics yourself.
          </p>
          <PyStatusChip status={pyStatus} />
        </div>
      </div>

      {/* ---------- mode switch ---------- */}
      <div
        className="sticky z-20"
        style={{
          top: 'var(--nav-h)',
          background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderTop: '1px solid var(--hair)',
          borderBottom: '1px solid var(--hair)',
        }}
      >
        <div className="mx-auto max-w-container px-[var(--gutter)]">
          <div
            role="tablist"
            aria-label="Lab mode"
            className="relative flex"
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault()
                switchMode(mode === 'design' ? 'python' : 'design')
              }
            }}
          >
            {(['design', 'python'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                tabIndex={mode === m ? 0 : -1}
                onClick={() => switchMode(m)}
                className="flex-1 px-4 py-3.5 font-display transition-colors duration-micro ease-atlas"
                style={{
                  color: mode === m ? 'var(--fg)' : 'var(--fg-3)',
                  fontSize: '22px',
                  fontWeight: 460,
                  minHeight: '52px',
                }}
              >
                {m === 'design' ? 'Design by goal' : 'Write Python'}
              </button>
            ))}
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-0 left-0 h-[2px] w-1/2 transition-transform duration-ui ease-atlas"
              style={{
                background: 'var(--accent)',
                transform: mode === 'python' ? 'translateX(100%)' : 'translateX(0)',
              }}
            />
          </div>
        </div>
      </div>

      {/* ---------- main grid ---------- */}
      <div className="mx-auto max-w-container px-[var(--gutter)] lg:grid lg:grid-cols-[420px_minmax(0,1fr)] lg:items-start lg:gap-10">
        {/* stage column — on top (sticky) on mobile, sticky right on desktop */}
        <div className="order-first lg:order-none">
          <div
            className="max-lg:sticky max-lg:z-10 lg:sticky lg:flex lg:h-[calc(100dvh-var(--nav-h)-53px)] lg:flex-col"
            style={{
              top: 'calc(var(--nav-h) + 53px)',
              background: 'var(--bg)',
            }}
          >
            <div
              className="relative h-[55dvh] lg:h-auto lg:min-h-0 lg:flex-1"
              role="img"
              aria-label={stageAria}
              style={{ border: '1px solid var(--hair)' }}
            >
              <div ref={stage.containerRef} className="absolute inset-0" />

              {/* name plate */}
              <div className="absolute left-3 top-3 max-w-[70%]">
                {showNamePlate ? (
                  <input
                    value={activeName}
                    onChange={(e) => setActiveName(e.target.value)}
                    aria-label="Name your projection"
                    placeholder="MY PROJECTION #1"
                    maxLength={60}
                    className="w-full bg-transparent font-display italic"
                    style={{
                      color: 'var(--fg)',
                      fontSize: '17px',
                      borderBottom: '1px solid var(--hair)',
                      textShadow: '0 1px 8px var(--bg)',
                    }}
                  />
                ) : (
                  <span
                    className="font-ui uppercase"
                    style={{ color: 'var(--fg-3)', fontSize: '10.5px', letterSpacing: '0.14em', textShadow: '0 1px 8px var(--bg)' }}
                  >
                    {captionName}
                  </span>
                )}
              </div>

              {/* explosion / holes warning chip */}
              {invalidInfo && mode === 'python' && (
                <div
                  className="absolute right-3 top-3 max-w-[290px] px-3 py-2"
                  role="status"
                  style={{
                    border: '1px solid var(--ochre)',
                    background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
                    color: 'var(--ochre)',
                  }}
                >
                  <p className="font-ui" style={{ fontSize: '11px', lineHeight: 1.5 }}>
                    {invalidInfo.escapeLatDeg !== null
                      ? `Your projection escapes to infinity near φ = ±${invalidInfo.escapeLatDeg.toFixed(0)}°. ${invalidInfo.count} vertices clipped — the map shows the survivors.`
                      : `${invalidInfo.count} vertices came out non-finite and were culled — the map shows the survivors.`}
                    <span style={{ color: 'var(--fg-2)' }}> That is information, not a bug.</span>
                  </p>
                </div>
              )}

              {/* live search ticker */}
              {searching && (
                <div
                  className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-3 px-3 py-2"
                  role="status"
                  style={{
                    background: 'color-mix(in srgb, var(--bg) 85%, transparent)',
                    border: '1px solid var(--hair)',
                  }}
                >
                  <span
                    className="font-mono"
                    style={{ color: 'var(--fg)', fontSize: '12px', fontFeatureSettings: "'tnum'" }}
                  >
                    searching · {(searchTick.elapsedMs / 1000).toFixed(1)}s · iter{' '}
                    {String(searchTick.iter).padStart(3, '0')}
                    {Number.isFinite(searchTick.loss) ? ` · loss ${searchTick.loss.toFixed(4)} ↓` : ''}
                  </span>
                  <Sparkline values={lossHistory} label="Loss over the search so far" />
                </div>
              )}

              {/* layer toggles over the stage's lower edge */}
              <div className="absolute bottom-3 left-3">
                <StageToggle layers={stage.layers} onChange={(layer) => stage.toggleLayer(layer)} />
              </div>
            </div>

            {/* instrumentation strip */}
            <div style={{ border: '1px solid var(--hair)', borderTop: 'none' }}>
              <Instrumentation
                scores={scores}
                prev={prevScores}
                badge={
                  result && mode === 'design' && result.family === 'equal_area'
                    ? 'EQUAL-AREA ✓ BY CONSTRUCTION'
                    : null
                }
              />
              {/* compare controls */}
              {compareActive && (
                <div className="px-4 pb-3 pt-1" style={{ borderTop: '1px solid var(--hair)' }}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-ui uppercase" style={{ fontSize: '10.5px', letterSpacing: '0.12em', color: 'var(--fg-3)' }}>
                      Compare against
                    </span>
                    {COMPARE_CANON.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={compareId === c.id}
                        onClick={() => setCompareId(c.id)}
                        className="rounded-full px-3 py-1.5 font-ui uppercase transition-colors duration-micro"
                        style={{
                          fontSize: '10.5px',
                          letterSpacing: '0.1em',
                          minHeight: '44px',
                          border: `1px solid ${compareId === c.id ? 'var(--accent)' : 'var(--hair)'}`,
                          color: compareId === c.id ? 'var(--accent)' : 'var(--fg-2)',
                        }}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                  <ScrubSlider
                    value={compareT}
                    onChange={onCompareScrub}
                    label={`Yours → ${COMPARE_CANON.find((c) => c.id === compareId)?.name ?? ''}`}
                  />
                </div>
              )}
            </div>
          </div>

          {/* results + errors slide up beneath the stage */}
          <div className="mt-6 flex flex-col gap-6 pb-16">
            {result && mode === 'design' && (
              <ResultsPanel
                result={result}
                name={designName}
                onNameChange={setDesignName}
                userScores={scores}
                canonScores={canonScores}
                onCompare={() => void toggleCompare()}
                compareActive={compareActive}
                onSendToPython={sendToPython}
                onShare={() => void onShare()}
                onSave={onSave}
              />
            )}
            {mode === 'python' && ranOnce && !runError && (
              <section
                aria-label="Python projection actions"
                className="flex flex-wrap items-center gap-2"
                style={{ border: '1px solid var(--hair)', background: 'var(--bg-2)', padding: '14px 16px' }}
              >
                <button
                  type="button"
                  onClick={() => void toggleCompare()}
                  aria-pressed={compareActive}
                  className="font-ui uppercase transition-colors hover:text-accent"
                  style={{ border: '1px solid var(--hair)', color: 'var(--fg)', fontSize: '11px', letterSpacing: '0.12em', padding: '12px 16px', minHeight: '44px' }}
                >
                  {compareActive ? 'Comparing on stage' : 'Compare on stage'}
                </button>
                <button
                  type="button"
                  onClick={() => void onShare()}
                  className="font-ui uppercase transition-colors hover:text-accent"
                  style={{ border: '1px solid var(--hair)', color: 'var(--fg)', fontSize: '11px', letterSpacing: '0.12em', padding: '12px 16px', minHeight: '44px' }}
                >
                  Share link
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  className="font-ui uppercase transition-colors hover:text-accent"
                  style={{ border: '1px solid var(--hair)', color: 'var(--fg)', fontSize: '11px', letterSpacing: '0.12em', padding: '12px 16px', minHeight: '44px' }}
                >
                  Save locally
                </button>
                <span className="font-ui text-caption" style={{ color: 'var(--fg-3)' }}>
                  Compare splits into a morph scrub; Tissot and overlays apply to both ends.
                </span>
              </section>
            )}
          </div>
        </div>

        {/* controls column */}
        <aside
          className="py-8 lg:py-10"
          onPointerEnter={warmPython}
          onFocusCapture={warmPython}
          aria-label="Lab controls"
        >
          <div key={mode} className="mode-col">
            {mode === 'design' ? (
              <div className="flex flex-col gap-7">
                <p className="font-body text-body-sm italic" style={{ color: 'var(--fg-2)' }}>
                  Tell the machine what you care about. It searches for the projection.
                </p>
                <div><p className="mb-3 font-ui text-caption">Start with a purpose</p><div className="atlas-preset" role="group" aria-label="Projection purpose presets">{presets.map(p => <button key={p.name} disabled={searching} aria-pressed={preset === p.name} onClick={() => { setPreset(p.name); setWeights({ ...p.weights }); setFamily(p.family) }}>{p.name}</button>)}</div><p className="font-ui text-caption" aria-live="polite">{presets.find(p => p.name === preset)?.note} Adjust the sliders, then choose Search.</p></div>
                <GoalSliders weights={weights} onChange={changeWeight} disabled={searching} />
                <details className="atlas-optional"><summary>How these priorities become an equation</summary><LossEquation weights={weights} hotKey={hotKey} /></details>
                <FamilyPicker value={family} onChange={setFamily} disabled={searching} />
                <button
                  type="button"
                  onClick={() => void runSearch()}
                  disabled={searchDisabled}
                  className="w-full font-ui uppercase transition-all duration-micro ease-atlas"
                  style={{
                    background: searchDisabled ? 'var(--bg-3)' : 'var(--accent)',
                    color: searchDisabled ? 'var(--fg-3)' : 'var(--on-accent)',
                    fontSize: '12.5px',
                    letterSpacing: '0.18em',
                    padding: '16px',
                    minHeight: '52px',
                    cursor: searchDisabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  {searching
                    ? `Searching… iter ${searchTick.iter}`
                    : pyStatus === 'starting' && !everReadyRef.current
                      ? 'Python runtime starting…'
                      : 'Search'}
                </button>
                <p className="font-ui text-caption" style={{ color: 'var(--fg-3)' }}>
                  Nelder–Mead over the family coefficients, loss sampled on an area-uniform
                  Fibonacci sphere. It will not find a perfect map — there isn’t one. It will find
                  the best trade you asked for.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                <p className="font-body text-body-sm italic" style={{ color: 'var(--fg-2)' }}>
                  The executable textbook, unchaperoned.
                </p>

                {/* editor well */}
                <div style={{ border: '1px solid var(--hair)', background: 'var(--bg-2)' }}>
                  <div
                    className="flex flex-wrap items-center gap-2 px-3 py-2"
                    style={{ borderBottom: '1px solid var(--hair)' }}
                  >
                    <input
                      value={filename}
                      onChange={(e) => setFilename(e.target.value)}
                      aria-label="Filename"
                      className="w-40 bg-transparent font-mono text-caption"
                      style={{ color: 'var(--fg)', fontSize: '12px' }}
                    />
                    <span
                      className="font-ui uppercase"
                      role="status"
                      style={{
                        fontSize: '10px',
                        letterSpacing: '0.1em',
                        color: running ? 'var(--accent)' : 'var(--fg-3)',
                      }}
                    >
                      {running && <span aria-hidden className="py-pulse-dot">● </span>}
                      {pythonChip}
                    </span>
                    <span className="flex-1" />
                    <select
                      value={templateId}
                      onChange={(e) => loadTemplate(e.target.value)}
                      aria-label="Starter template"
                      className="bg-transparent font-ui text-caption uppercase"
                      style={{ color: 'var(--fg-2)', border: '1px solid var(--hair)', padding: '8px 10px', minHeight: '44px' }}
                    >
                      {TEMPLATES.map((t) => (
                        <option key={t.id} value={t.id} style={{ color: '#1B1812' }}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={resetCode}
                      className="font-ui uppercase transition-colors hover:text-accent"
                      style={{ color: 'var(--fg-2)', border: '1px solid var(--hair)', fontSize: '10.5px', letterSpacing: '0.12em', padding: '10px 14px', minHeight: '44px' }}
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={runPython}
                      disabled={running}
                      className="font-ui uppercase transition-all duration-micro"
                      style={{
                        background: running ? 'var(--bg-3)' : 'var(--accent)',
                        color: running ? 'var(--fg-3)' : 'var(--on-accent)',
                        fontSize: '10.5px',
                        letterSpacing: '0.12em',
                        padding: '10px 18px',
                        minHeight: '44px',
                        cursor: running ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {running ? 'Running…' : 'Run projection ⏎'}
                    </button>
                  </div>
                  <PythonEditor value={code} onChange={onCodeChange} onRun={runPython} ariaLabel={`Python editor, file ${filename}. Command or Control Enter runs the projection.`} />
                </div>
                <p className="font-ui text-caption" style={{ color: 'var(--fg-3)' }}>
                  ⌘/Ctrl+Enter runs. The contract header is pinned — it is re-inserted if removed.
                  Declare sliders with <code className="font-mono"># @param name min max default</code>.
                </p>

                {/* params panel */}
                {paramDefs.length > 0 && (
                  <div role="group" aria-label="Projection parameters" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {paramDefs.map((p, i) => (
                      <div key={p.name}>
                        <div className="mb-1 flex items-baseline justify-between">
                          <label htmlFor={`param-${p.name}`} className="font-mono text-caption" style={{ color: 'var(--fg)' }}>
                            {p.name}
                          </label>
                          <output htmlFor={`param-${p.name}`} className="font-mono text-caption" style={{ color: 'var(--accent)' }}>
                            {p.value.toFixed(3)}
                          </output>
                        </div>
                        <input
                          id={`param-${p.name}`}
                          type="range"
                          min={p.min}
                          max={p.max}
                          step={(p.max - p.min) / 200}
                          value={p.value}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            setParamDefs((defs) => defs.map((d, j) => (j === i ? { ...d, value: v } : d)))
                          }}
                          className="goal-slider block w-full"
                          style={{ height: '44px' }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* stdout */}
                {stdout && (
                  <pre
                    className="max-h-40 overflow-auto px-3 py-2 font-mono text-caption"
                    style={{ border: '1px solid var(--hair)', background: 'var(--bg)', color: 'var(--fg-2)', fontSize: '12px' }}
                    aria-label="Python standard output"
                  >
                    {stdout}
                  </pre>
                )}

                {/* traceback */}
                {runError && <ErrorCard message={runError} onDismiss={() => setRunError(null)} />}

                {/* warnings */}
                {runWarnings.length > 0 && !runError && (
                  <p className="font-ui text-caption" style={{ color: 'var(--ochre)' }}>
                    {runWarnings.join(' · ')}
                  </p>
                )}

                {/* teaching rail */}
                <div className="mt-2 flex flex-col gap-2">
                  {TEACHING_CARDS.map((t) => (
                    <details key={t.title} style={{ border: '1px solid var(--hair)', background: 'var(--bg-2)' }}>
                      <summary
                        className="cursor-pointer px-4 py-3 font-ui text-label uppercase"
                        style={{ color: 'var(--fg-2)', minHeight: '44px' }}
                      >
                        {t.title}
                      </summary>
                      <p className="px-4 pb-4 font-body text-caption" style={{ color: 'var(--fg-2)' }}>
                        {t.body}
                      </p>
                    </details>
                  ))}
                </div>
              </div>
            )}
          </div>

          <ShelfRail entries={shelf} onLoad={loadShelfEntry} onDelete={(id) => setShelf(deleteFromShelf(id))} />
        </aside>
      </div>
      <style>{`
        .mode-col { animation: mode-col-in 300ms var(--ease-atlas); }
        @keyframes mode-col-in { from { opacity: 0; } to { opacity: 1; } }
        .py-pulse-dot { animation: py-pulse-kf 1.1s ease-in-out infinite; }
        .goal-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 44px;
          background: transparent;
          cursor: pointer;
        }
        .goal-slider::-webkit-slider-runnable-track { height: 3px; background: var(--bg-3); }
        .goal-slider::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 28px; height: 28px; margin-top: -12.5px;
          border-radius: 9999px; background: var(--accent); border: 2px solid var(--bg);
          transition: transform 180ms var(--ease-atlas);
        }
        .goal-slider:active::-webkit-slider-thumb { transform: scale(0.92); }
        .goal-slider::-moz-range-track { height: 3px; background: var(--bg-3); }
        .goal-slider::-moz-range-thumb {
          width: 24px; height: 24px; border-radius: 9999px;
          background: var(--accent); border: 2px solid var(--bg);
        }
      `}</style>
    </div>
  )
}

const TEACHING_CARDS = [
  {
    title: 'Why radians',
    body: 'The sphere’s geometry lives in radians: an angle of 1 means an arc as long as the radius. Degrees would work only if every formula carried a π/180 along. The contract hands you radians; np.degrees() exists if you want to print them.',
  },
  {
    title: 'What NaN does to a mesh',
    body: 'The map is a mesh of triangles. A vertex that projects to NaN or infinity cannot be drawn, so the pipeline culls it and collapses any triangle touching it — a hole. Mercator’s poles are the famous example: the map does not fail, it confesses.',
  },
  {
    title: 'How the distortion numbers are computed',
    body: 'At each sample point we nudge longitude and latitude by a hair (finite differences), build the local Jacobian, and take its singular values σ₁ and σ₂. Areal scale is σ₁·σ₂; angular deformation ω = 2·asin((σ₁−σ₂)/(σ₁+σ₂)). Global numbers aggregate an area-uniform Fibonacci sample — every point stands for the same patch of Earth.',
  },
]
