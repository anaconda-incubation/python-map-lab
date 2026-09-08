import { useCallback, useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { setTheme } from '@/hooks/useTheme'
import { useChapterStage, StageShell } from './stage-shared'

gsap.registerPlugin(ScrollTrigger)
const clamp = (v: number) => Math.max(0, Math.min(1, v))
const PHASES = [
  ['Meet the globe', 'One planet. Every place connected.'],
  ['Follow the grid', 'The lines give every place an address. Watch them as the surface opens.'],
  ['Open the surface', 'The cut opens through the Pacific. The same places move into a new shape.'],
  ['Choose what matters', 'Equal Earth keeps relative areas true. The shapes change to make that possible.'],
]

export default function Ch00Opening() {
  const { reducedMotion } = useReducedMotion()
  const outer = useRef<HTMLElement>(null)
  const { containerRef, stageRef, generation } = useChapterStage('atlas')
  const progress = useRef({ value: 0 })
  const manual = useRef(false)
  const animation = useRef<gsap.core.Timeline | null>(null)
  const [phase, setPhase] = useState(0)
  const [value, setValue] = useState(0)
  const [paused, setPaused] = useState(false)
  const [readyGeneration, setReadyGeneration] = useState(0)
  const ready = generation > 0 && generation === readyGeneration
  const [failed, setFailed] = useState(false)

  const apply = useCallback((p: number) => {
    progress.current.value = p
    const t = clamp((p - 0.22) / 0.66)
    const stage = stageRef.current
    stage?.setMorph(t)
    stage?.setLayers({ geography: true, graticule: p > 0.09, tissot: false })
    stage?.setAutoRotate(p < 0.02 && !paused && !reducedMotion)
    stage?.setLabels(false)
    setValue(t)
    setPhase(p < 0.09 ? 0 : p < 0.22 ? 1 : p < 0.9 ? 2 : 3)
  }, [stageRef, paused, reducedMotion])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || !generation) return
    let cancelled = false
    void stage.setMorphTargets('globe', 'equalEarth').then(() => {
      if (cancelled) return
      apply(progress.current.value)
      setReadyGeneration(generation)
      setFailed(false)
    }).catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [generation, stageRef, apply])

  useEffect(() => {
    const el = outer.current
    if (!el) return
    const theme = ScrollTrigger.create({ trigger: el, start: 'top 60%', end: 'bottom 40%', onToggle: s => setTheme(s.isActive ? 'atlas' : 'paper') })
    let scrub: ScrollTrigger | undefined
    if (!reducedMotion) scrub = ScrollTrigger.create({
      trigger: el, start: 'top top', end: 'bottom bottom',
      onUpdate: s => { if (!manual.current && ready) apply(s.progress) },
    })
    const release = () => { manual.current = false; animation.current?.kill() }
    el.addEventListener('wheel', release, { passive: true })
    el.addEventListener('touchmove', release, { passive: true })
    return () => { theme.kill(); scrub?.kill(); el.removeEventListener('wheel', release); el.removeEventListener('touchmove', release) }
  }, [apply, ready, reducedMotion])
  useEffect(() => () => { animation.current?.kill() }, [])

  const play = (to: number, replay = false) => {
    manual.current = true
    animation.current?.kill()
    stageRef.current?.settleRotation()
    if (reducedMotion) { apply(to); return }
    if (replay) apply(0)
    const timeline = gsap.timeline()
    animation.current = timeline
    timeline.to(progress.current, { value: to, duration: to ? 3.4 : 2.4, delay: replay ? 0.5 : 0, ease: 'power1.inOut', onUpdate: () => apply(progress.current.value) })
  }

  return (
    <section ref={outer} id="ch-00" className={`atlas-opening ${reducedMotion ? 'is-still' : ''}`} aria-labelledby="ch-00-title">
      <div className="atlas-opening-sticky">
        <div className="atlas-hero">
          <div className="atlas-hero-copy">
            <p className="atlas-eyebrow">A world of tradeoffs</p>
            <h1 id="ch-00-title">Earth has no<br /><em>flat version.</em></h1>
            <p className="atlas-intro">Keep the shapes. Keep the sizes. You can’t keep both. Discover what changes when we flatten our world—then change the mathematics yourself in Python.</p>
            <div className="atlas-actions">
              <button className="atlas-button primary" disabled={!ready} onClick={() => play(value > 0.98 ? 0 : 1)}>{value > 0.98 ? 'Return to globe' : 'Flatten the Earth'}</button>
              <a className="atlas-button" href="#explore">Explore the maps <span aria-hidden>↗</span></a>
            </div>
            <a className="python-hero-link" href="#python-discovery">From equation to Python to Earth →</a>
            <p className="atlas-scroll-hint">{reducedMotion ? 'Choose a view at your own pace' : 'Scroll to unfold · or use the controls'}</p>
          </div>
          <div className="atlas-hero-visual">
            <StageShell stateText="" containerRef={containerRef} ariaLabel={phase === 0 ? 'Earth with natural terrain and oceans, slowly rotating' : PHASES[phase][1]} className="atlas-hero-stage" />
            {!ready && <p className="atlas-loading" role="status">{failed ? 'The globe could not load. You can still explore the essay below.' : 'Preparing your world…'}</p>}
            <p className="atlas-scene-caption" aria-live="polite"><span>0{phase + 1} / {PHASES[phase][0]}</span>{PHASES[phase][1]}</p>
            <div className="atlas-scene-controls">
              <button className="atlas-text-button" disabled={reducedMotion || value > 0 || !ready} aria-pressed={paused} onClick={() => setPaused(v => !v)}>{paused || reducedMotion ? 'Resume rotation' : 'Pause rotation'}</button>
              <button className="atlas-text-button" disabled={!ready} onClick={() => play(1, true)}>Replay transformation</button>
            </div>
          </div>
        </div>
        <div className="atlas-morph-control">
          <label htmlFor="opening-morph">Globe <span>Drag to unfold</span> Equal Earth</label>
          <input id="opening-morph" aria-label="Globe to Equal Earth transformation" type="range" min="0" max="1" step="0.005" value={value} disabled={!ready} onChange={e => { manual.current = true; animation.current?.kill(); const t = Number(e.target.value); apply(t === 0 ? 0 : t === 1 ? 1 : 0.22 + t * 0.66) }} />
        </div>
        <div className="atlas-sequence" aria-label="Transformation steps">{PHASES.map(([title], i) => <button key={title} className={phase === i ? 'active' : ''} aria-current={phase === i ? 'step' : undefined} disabled={!ready} onClick={() => play([0, 0.18, 0.57, 1][i])}><span>0{i + 1} / {['Discover', 'Reveal', 'Transform', 'Explore'][i]}</span>{title}</button>)}</div>
        <div className="atlas-credit">NASA Blue Marble · Terrain, ice & ocean bathymetry <a href="#ch-14">Image & data credits</a></div>
      </div>
    </section>
  )
}
