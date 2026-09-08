import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import PythonPanel from '@/chapters/PythonPanel'
import EquationBlock from '@/components/EquationBlock'
import StageToggle from '@/components/StageToggle'
import { useMapStage } from '@/lab/useMapStage'
import { buildLabGrid, gridProjection } from '@/lab/gridfn'
import { pythonClient, type RunProjectionResult } from '@/projection/worker-client'
import { lessons } from './pythonLessons'
import './python-first.css'
import { lessonStories } from './lessonStories'
import WeirdVariants from './WeirdVariants'
import { getAuthagraphSamples } from './authagraphSamples'
const GRID = buildLabGrid()

export default function PythonFirst() {
  const [index, setIndex] = useState(0)
  const [authSamples, setAuthSamples] = useState<Awaited<ReturnType<typeof getAuthagraphSamples>> | null>(null)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [custom, setCustom] = useState(false)
  const [error, setError] = useState('')
  const [runtime, setRuntime] = useState('Python is warming up')
  const [lastCode, setLastCode] = useState<string | null>(null)
  const stage = useMapStage('mercator')
  const serial = useRef(0)
  const mounted = useRef(true)
  const lesson = lessons[index]
  const story = lessonStories[lesson.id]
  useEffect(() => {
    mounted.current = true
    void pythonClient.warmup().then(() => {if(mounted.current) setRuntime('Python ready')}).catch(() => {if(mounted.current) setRuntime('Python loads when you run')})
    return () => {mounted.current = false}
  }, [])
  async function choose(i: number) {
    if(busy || !stage.ready) return
    setBusy(true); setError('')
    try { if(lessons[i].id === 'authagraph') setAuthSamples(await getAuthagraphSamples()); await stage.morphTo(lessons[i].id,1200); setIndex(i); setDirty(false); setCustom(false); setLastCode(null) }
    catch {setError('The map could not load. Please try again.')}
    finally {setBusy(false)}
  }
  async function apply(result: RunProjectionResult, code: string) {
    setBusy(true); setError('')
    try {
      let halfWidth = 0, halfHeight = 0
      if(lesson.id === 'authagraph') for(let i=0;i<result.x.length;i++) {halfWidth=Math.max(halfWidth,Math.abs(result.x[i]));halfHeight=Math.max(halfHeight,Math.abs(result.y[i]))}
      const projection = lesson.id === 'authagraph' && authSamples ? {
        invalidCount: result.x.some((x,i)=>!Number.isFinite(x)||!Number.isFinite(result.y[i])) ? 1 : 0,
        frame: {halfWidth, halfHeight},
        fn: (lon:number,lat:number) => {const i=authSamples.indices.get(`${lon},${lat}`); if(i===undefined) throw new Error('Missing renderer sample');return {x:result.x[i],y:result.y[i]}}
      } : gridProjection(GRID,result.x,result.y)
      if(projection.invalidCount) throw new Error('Some coordinates are not finite. Check the formula before drawing the whole world.')
      if(projection.frame.halfWidth <= 0 || projection.frame.halfHeight <= 0) throw new Error('The map needs nonzero width and height.')
      const key = `lesson-run-${(++serial.current) % 2}`
      await stage.bakeAndRegister(key,projection.fn,projection.frame)
      await stage.morphTo(key,1200)
      setCustom(true); setDirty(false); setLastCode(code)
    } finally {setBusy(false)}
  }
  function downloadNotebook() {
    const code = lastCode ?? (lesson.supportCode ? `${lesson.supportCode}\n${lesson.code}` : lesson.code)
    const notebook = {nbformat:4,nbformat_minor:5,metadata:{kernelspec:{display_name:'Python 3',language:'python',name:'python3'}},cells:[
      {cell_type:'markdown',metadata:{},source:[`# ${lesson.name}: a world from a function\n\n${lesson.explanation}\n\nInstall numpy and matplotlib to run this notebook.`]},
      {cell_type:'code',execution_count:null,metadata:{},outputs:[],source:[code]},
      {cell_type:'code',execution_count:null,metadata:{},outputs:[],source:[`import matplotlib.pyplot as plt\nfig, ax = plt.subplots(figsize=(10, 6))\nfor latitude in range(-80, 81, 20):\n    lon = np.linspace(-np.pi, np.pi, 361)\n    x, y = project(lon, np.full_like(lon, np.radians(latitude)))\n    ax.plot(x, y, color="teal", linewidth=0.6)\nfor longitude in range(-180, 181, 20):\n    lat = np.linspace(np.radians(-85), np.radians(85), 341)\n    x, y = project(np.full_like(lat, np.radians(longitude)), lat)\n    ax.plot(x, y, color="teal", linewidth=0.6)\nax.set_aspect("equal")\nax.set_title("Your projection: coordinate grid")\nplt.show()`]}]}
    const url = URL.createObjectURL(new Blob([JSON.stringify(notebook,null,2)],{type:'application/x-ipynb+json'}))
    const a=document.createElement('a');a.href=url;a.download=`${lesson.id}-lesson.ipynb`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  return <div className="python-first">
    <section className="pf-intro">
      <p className="pf-eyebrow">An interactive Python field guide</p>
      <h1>A Few Lines Of <em>Python</em> Can Make the World of Difference</h1>
      <div className="pf-intro-bottom"><p>Choose a projection. Read its mathematics. Change the function and watch the world take a different shape.</p><span className="pf-runtime">● {runtime} · <a href="https://numpy.org/" target="_blank" rel="noopener noreferrer">NumPy ↗</a><br/><small>Runs here, in your browser. No setup.</small></span></div>
      <aside className="pf-context-note" aria-label="Why this matters now"><span>Why this matters now</span><p>Mercator was designed for navigation in 1569. In September 2026, the UN encouraged equal-area projections for general-reference world maps, so countries and continents appear in their true relative sizes. <a href="https://news.un.org/en/story/2026/09/1168284" target="_blank" rel="noopener noreferrer">Read the UN News article ↗</a></p></aside>
    </section>
    <section className="pf-workspace" aria-label="Interactive Python lesson">
      <div className="pf-choices" role="group" aria-label="Choose a projection">{lessons.map((l,i)=><button key={l.id} aria-pressed={index===i} disabled={busy || !stage.ready} onClick={()=>void choose(i)}><span>0{i+1} / {l.promise}</span><strong>{l.name}</strong></button>)}</div>
      <div className="pf-columns">
        <div className="pf-map-column"><div className="pf-map-sticky">
          <div className="pf-map-header"><span>01 / Observe the world</span><span>{custom?'Your Python result':lesson.name}</span></div>
          <div className="pf-canvas" role="img" aria-label={`${custom?'Python-generated':lesson.name} projection with geography and coordinate grid`}><div ref={stage.containerRef} className="absolute inset-0"/>{!stage.ready && <span className="pf-loading">Preparing the globe…</span>}</div>
          <div className="pf-map-controls"><StageToggle layers={stage.layers} onChange={stage.toggleLayer}/></div>
          <p className="pf-map-status" role="status">{busy?'Transforming the map…':dirty?'Code edited. Run Python to update the map.':custom?'Map drawn from your executed Python.':'Reference map loaded. Run the function to draw it with Python.'}</p>
          <div className="pf-question"><h2>{lesson.question}</h2><p>{lesson.explanation}</p></div>
          {error && <p role="alert">{error}</p>}
        </div></div>
        <div className="pf-code-column">
          <div className="pf-section-label">02 / Read, change, run</div>
          <p className="pf-change">{lesson.change}</p>
          <PythonPanel key={lesson.id} filename={`${lesson.id}.py`} code={lesson.code} samples={lesson.id==='authagraph' && authSamples ? authSamples : GRID} supportCode={lesson.supportCode} annotations={lesson.annotations} initiallyEditable runLabel="Run Python → redraw map" onRunStateChange={setBusy} onEdit={()=>setDirty(true)} onResult={apply} onReset={()=>{setDirty(false);void choose(index)}}/>
          {lesson.supportCode && <details className="pf-helper"><summary>Open the complete AuthaGraph helper code</summary><p>These functions run before the editable steps above. They are included in the notebook download.</p><pre><code>{lesson.supportCode}</code></pre></details>}
          <div className="pf-section-label pf-math-heading">03 / Connect the mathematics</div>
          <EquationBlock tex={lesson.tex} caption={custom || dirty ? 'Reference equations for the selected lesson. Your edited code may define a different projection.' : lesson.id==='authagraph' ? 'Facet-local angles λf and φf produce radius r and angle θ. The helpers then rotate and place each region in the rectangle.' : 'λ is longitude; φ is latitude. The function maps these angles to planar coordinates x and y.'}/>
          {lesson.id==='equalEarth' && <p className="pf-math-note">F(θ) = A₁θ + A₂θ³ + A₃θ⁷ + A₄θ⁹. The Python names its derivative explicitly.</p>}
          <div className="pf-next-actions"><button onClick={downloadNotebook} disabled={dirty}>Download {lastCode?'your':'starter'} notebook ↓</button><Link to={`/story/#${lesson.chapter}`}>Read the full derivation ↗</Link></div>
          {dirty && <p className="pf-math-note">Run your edits before downloading to include the executed version.</p>}
        </div>
      </div>
    </section>
    <section className="pf-story" aria-labelledby="lesson-story-title"><p className="pf-eyebrow">Understand {lesson.name}</p><h2 id="lesson-story-title">What is this code actually doing?</h2><div className="pf-story-grid"><div><h3>The simple explanation</h3><p>{story.simple}</p></div><div><h3>What the mapmaker wanted</h3><p>{story.objective}</p></div><div><h3>A little history</h3><p>{story.history}</p><a href={story.source} target="_blank" rel="noopener noreferrer">{story.sourceLabel} ↗</a></div></div></section>
    <WeirdVariants />
    <section className="pf-deeper"><p className="pf-eyebrow">Keep exploring</p><h2>There is a whole world behind the function.</h2><div className="pf-paths">
      <Link to="/story/"><span>THE VISUAL ESSAY</span><h3>Every flat map is a choice.</h3><p>The rotating globe, the history, the proofs, and the consequences. Take the full guided journey.</p><b>Follow the story →</b></Link>
      <Link to="/lab"><span>THE OPEN LAB</span><h3>Build your own answer.</h3><p>Write a projection from scratch, compare distortions, or let an optimizer search for your priorities.</p><b>Open the advanced lab →</b></Link>
      <Link to="/story/#ch-06"><span>A DIFFERENT KIND OF MATHEMATICS</span><h3>Unfold AuthaGraph.</h3><p>Rotate the globe. Divide the surface. Follow the polyhedral construction, one transformation at a time.</p><b>Explore the construction →</b></Link>
    </div></section>
  </div>
}
