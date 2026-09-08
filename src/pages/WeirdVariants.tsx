import { useState } from 'react'
import PythonPanel from '@/chapters/PythonPanel'
import { useMapStage } from '@/lab/useMapStage'
import { buildLabGrid, gridProjection } from '@/lab/gridfn'
import type { RunProjectionResult } from '@/projection/worker-client'
const grid=buildLabGrid()
const variants: {name:string;line:string;why:string;flipY?:boolean;label?:string}[]=[
  {name:'Flip the world upside down',line:'x = lon',label:'y = -y',flipY:true,why:'A minus sign in front of y reflects the map vertically: south moves to the top, north to the bottom, and east stays on the right. This is a reflection, not a 180° rotation. It preserves the original map’s areas, distances, and angle magnitudes, so Mercator’s distortion remains. North-up is a convention, not a mathematical requirement. Try the same minus sign with any of the other recipes.'},
  {name:'Slide the latitudes',line:'x = lon + lat',why:'Each latitude moves sideways by a different amount. North slides right; south slides left. The world leans, and local angles change.'},
  {name:'Pinch the equator',line:'x = lon * lat',why:'At latitude zero, every longitude becomes x = 0. The equator collapses to a point. South of it, the negative multiplier also reverses east and west.'},
  {name:'Try a logarithm',line:'x = lon * np.log1p(np.abs(lat))',why:'log1p means log(1 + value). Taking the absolute latitude makes its input nonnegative in both hemispheres. The equator still pinches to a point, but east and west no longer reverse south of it. This is a different formula, not a repair that preserves the original map.'},
  {name:'Make a wave',line:'x = lon + 0.5 * np.sin(3 * lat)',why:'A sine wave moves each latitude left and right. Meridians wiggle. One extra term changes the entire outline.'}
]
export default function WeirdVariants(){
  const {containerRef,bakeAndRegister,morphTo}=useMapStage('mercator')
  const [index,setIndex]=useState(1),[busy,setBusy]=useState(false),[version,setVersion]=useState(0),[status,setStatus]=useState('Choose a recipe, predict the result, then run it.')
  const variant=variants[index]
  const code=`import numpy as np\n\ndef project(lon, lat):\n    phi = np.clip(lat, -1.48, 1.48)\n    ${variant.line}\n    y = ${variant.flipY?'-':''}np.log(np.tan(np.pi / 4 + phi / 2))\n    return x, y`
  async function apply(result:RunProjectionResult, source:string){
    const p=gridProjection(grid,result.x,result.y)
    if(p.invalidCount) {
      setStatus('This run could not be drawn. The map still shows the last successful result.')
      const logarithmHint = /np\.log\(\s*lat\s*\)/.test(source)
        ? ' np.log(lat) is undefined for negative latitudes and goes to negative infinity at the equator. Try the “Try a logarithm” recipe: np.log1p(np.abs(lat)) stays finite in both hemispheres, but defines a different map.'
        : ' Check logarithms of zero or negative numbers, division by zero, and square roots of negative numbers. Very large outputs may also be outside the renderer’s limits.'
      throw new Error(`Cannot draw this run: ${p.invalidCount.toLocaleString()} of ${grid.lon.length.toLocaleString()} sampled locations have no drawable coordinates.${logarithmHint} Your code has been kept.`)
    }
    const key=`weird-${version%2}`
    await bakeAndRegister(key,p.fn,p.frame);await morphTo(key,1200)
    setVersion(v=>v+1);setStatus('Map redrawn from this Python run. What changed?')
  }
  return <section className="pf-weird" aria-labelledby="weird-title"><p className="pf-eyebrow">A little mathematical mischief</p><h2 id="weird-title">What happens if we change the rules?</h2><p className="pf-weird-intro">Start with Mercator and change one operation. Slide, pinch, or ripple the world by changing x, or negate y to put south at the top. These experiments explore what a formula does.</p><aside className="pf-log-note"><strong>Why not <code>np.log(lat)</code>?</strong><p>Latitude is zero at the equator and negative in the southern hemisphere. A real logarithm needs a positive input. Even <code>np.log(np.abs(lat))</code> still fails at zero. Try <code>np.log1p(np.abs(lat))</code>, which means log(1 + |latitude|), to explore a finite alternative.</p></aside><div className="pf-variant-choices" role="group" aria-label="Choose a weird variant">{variants.map((v,i)=><button key={v.name} disabled={busy} aria-pressed={i===index} onClick={()=>{setIndex(i);setStatus('Recipe loaded. Run it to update the map.')}}><code>{v.label ?? v.line}</code><span>{v.name}</span></button>)}</div><div className="pf-columns"><div className="pf-experiment-map-column"><div className="pf-experiment-map-sticky"><div className="pf-weird-map" role="img" aria-label="Experimental projection from Python"><div ref={containerRef} className="absolute inset-0"/></div><p role="status" className="pf-math-note">{status}</p></div></div><div className="pf-experiment-reading"><p className="pf-change">{variant.why}</p><PythonPanel key={index} filename="what_if.py" code={code} samples={grid} initiallyEditable onRunStateChange={setBusy} onResult={apply} onEdit={()=>setStatus('Code edited. Run it to update the map.')} onReset={()=>setStatus('Recipe reset. Run it to update the map.')} runLabel="Run this experiment"/></div></div></section>
}
