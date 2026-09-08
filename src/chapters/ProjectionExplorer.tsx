import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useChapterStage, StageShell } from './stage-shared'
import { getProjection } from '@/projection/projections'
import { tissotAt } from '@/projection/distortion'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import type { ProjectionId } from '@/projection/types'

const PLACES = [
  { name: 'Accra · Ghana', lon: -0.19, lat: 5.6 },
  { name: 'Oslo · Norway', lon: 10.75, lat: 59.91 },
  { name: 'Nuuk · Greenland', lon: -51.72, lat: 64.18 },
  { name: 'Nairobi · Kenya', lon: 36.82, lat: -1.29 },
  { name: 'Cape Town · South Africa', lon: 18.42, lat: -33.92 },
  { name: 'London · United Kingdom', lon: -0.13, lat: 51.51 },
  { name: 'New York, NY · USA', lon: -74.01, lat: 40.71 },
  { name: 'Austin, TX · USA', lon: -97.74, lat: 30.27 },
  { name: 'Los Angeles, CA · USA', lon: -118.24, lat: 34.05 },
  { name: 'Fairbanks, AK · USA', lon: -147.72, lat: 64.84 },
  { name: 'São Paulo · Brazil', lon: -46.63, lat: -23.55 },
  { name: 'Sydney · Australia', lon: 151.21, lat: -33.87 },
  { name: 'Tokyo · Japan', lon: 139.69, lat: 35.68 },
  { name: 'Hong Kong · China', lon: 114.17, lat: 22.32 },
  // NSF: https://www.nsf.gov/od/opp/ail/mcmurdo-station
  { name: 'McMurdo Station · Antarctica', lon: 166.67, lat: -77.85 },
]
const MAPS = [{ id: 'mercator', name: 'Mercator', promise: 'Local shapes stay true. Areas grow toward the poles.' },
  { id: 'equalEarth', name: 'Equal Earth', promise: 'Relative areas stay true. Local shapes change.' },
  { id: 'gallPeters', name: 'Gall–Peters', promise: 'Relative areas stay true, with stronger stretching near the equator.' }] as const

export default function ProjectionExplorer() {
  const globe = useChapterStage('paper'), flat = useChapterStage('paper')
  const { reducedMotion } = useReducedMotion()
  const [map, setMap] = useState<ProjectionId>('mercator')
  const [placeIndex, setPlaceIndex] = useState(1)
  const [grid, setGrid] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [prediction, setPrediction] = useState<string | null>(null)
  const previous = useRef<ProjectionId>('mercator')
  const markers = [useRef<HTMLSpanElement>(null), useRef<HTMLSpanElement>(null)]
  const place = PLACES[placeIndex]
  const lon = place.lon * Math.PI / 180, lat = place.lat * Math.PI / 180
  const metric = tissotAt(getProjection(map).projectPoint, lon, lat)
  const choice = MAPS.find(m => m.id === map)!

  useEffect(() => {
    const s = globe.stageRef.current
    if (!s) return
    void s.setMorphTargets('globe', 'globe').then(() => { s.setMorph(0); s.setLabels(false); s.setAutoRotate(false); s.setLayers({ graticule: grid }) })
  }, [globe.generation, globe.stageRef, grid])

  useEffect(() => {
    const s = flat.stageRef.current
    if (!s) return
    let alive = true
    let tween: gsap.core.Tween | undefined
    setBusy(true)
    const from = previous.current
    void s.setMorphTargets(from, map).then(() => {
      if (!alive) return
      s.setLabels(false); s.setAutoRotate(false); s.setLayers({ graticule: grid })
      const value = { t: reducedMotion ? 1 : 0 }
      s.setMorph(value.t)
      tween = gsap.to(value, { t: 1, duration: reducedMotion ? 0 : 1.8, ease: 'power2.inOut', onUpdate: () => s.setMorph(value.t), onComplete: () => { previous.current = map; setBusy(false); setError(false) } })
    }).catch(() => { if (alive) { setBusy(false); setError(true) } })
    return () => { alive = false; tween?.kill() }
  }, [map, flat.generation, flat.stageRef, reducedMotion, grid])

  useEffect(() => {
    const stages = [globe.stageRef.current, flat.stageRef.current]
    stages.forEach((s, i) => {
      if (!s) return
      s.onFrame = () => {
        const el = markers[i].current, p = s.lonLatToScreen(lon, lat)
        if (!el || !p) return
        el.style.display = p.visible ? 'block' : 'none'
        el.style.left = `${p.x}px`; el.style.top = `${p.y}px`
      }
      s.invalidate()
    })
    return () => { stages.forEach(s => { if (s) s.onFrame = null }) }
    // Markers keep stable refs; updates follow the actual rendered frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lon, lat, globe.generation, flat.generation])

  return <section id="explore" className="atlas-explorer" aria-labelledby="explore-title">
    <p className="kicker">Start with a discovery</p>
    <h2 id="explore-title">Same place. A different promise.</h2>
    <p className="explore-intro">Choose a place and a map. The red marker follows the same location in both views. Notice what the map keeps—and what it changes.</p>
    <div className="atlas-explore-toolbar">
      <div className="atlas-projections" role="group" aria-label="Compare projections">{MAPS.map(m => <button key={m.id} aria-pressed={m.id === map} disabled={busy} onClick={() => setMap(m.id)}>{m.name}</button>)}</div>
      <label>Follow a place<select aria-label="Follow a place" value={placeIndex} onChange={e => setPlaceIndex(Number(e.target.value))}>{PLACES.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}</select></label>
      <button className="atlas-button" aria-pressed={grid} onClick={() => setGrid(v => !v)}>{grid ? 'Hide coordinate grid' : 'Show coordinate grid'}</button>
    </div>
    <div className="atlas-comparison">
      <figure><figcaption><span>The globe</span><span>Spherical reference</span></figcaption><div className="atlas-compare-stage"><StageShell containerRef={globe.containerRef} ariaLabel={`Globe with ${place.name} marked`} stateText="" className="absolute inset-0" /><span ref={markers[0]} className="atlas-place-marker" aria-hidden /></div><div className="atlas-place-result"><strong>{place.name.split(' · ')[0]}</strong>{Math.abs(place.lat).toFixed(1)}° {place.lat < 0 ? 'S' : 'N'} · {Math.abs(place.lon).toFixed(1)}° {place.lon < 0 ? 'W' : 'E'}<br />The spherical surface is our reference for area and shape.</div></figure>
      <figure><figcaption><span>{choice.name}</span><span>{busy ? 'Transforming…' : 'Flat projection'}</span></figcaption><div className="atlas-compare-stage"><StageShell containerRef={flat.containerRef} ariaLabel={`${choice.name} with ${place.name} marked`} stateText="" className="absolute inset-0" /><span ref={markers[1]} className="atlas-place-marker" aria-hidden /></div><div className="atlas-place-result" aria-live="polite"><strong>{error ? 'Map unavailable' : busy ? 'Watch the marker…' : `×${metric.areaScale.toFixed(2)} local area scale`}</strong>{busy ? 'The comparison updates when the map settles.' : 'At this point, relative to the unit sphere. Perspective on the globe is not an area measurement.'}</div></figure>
    </div>
    <p className="atlas-takeaway">{choice.promise}</p>
    <details className="atlas-optional"><summary>Try a prediction: what happens near the poles?</summary><p className="mb-4">On Mercator, move from Accra toward Oslo. What happens to the area of a small patch?</p><div className="atlas-projections">{['It grows', 'It stays the same', 'It shrinks'].map(answer => <button key={answer} aria-pressed={prediction === answer} onClick={() => { setPrediction(answer); setPlaceIndex(1); setMap('mercator') }}>{answer}</button>)}</div>{prediction && <p className="mt-4" role="status">{prediction === 'It grows' ? 'Exactly.' : 'It grows.'} Mercator enlarges local area toward the poles. Equal Earth keeps the local area scale at 1 instead.</p>}</details>
    <div className="atlas-next-links"><a href="#ch-01">Follow the guided story →</a><a href="#ch-09">Compare Africa and Greenland →</a><a href="#ch-07">Open the full morph studio →</a></div>
  </section>
}
