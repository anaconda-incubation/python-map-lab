import { useState } from 'react'
import PythonPanel from '@/chapters/PythonPanel'
import { useMapStage } from '@/lab/useMapStage'
import { buildLabGrid, gridProjection } from '@/lab/gridfn'
import type { RunProjectionResult } from '@/projection/worker-client'
const grid=buildLabGrid()
const variants=[
  {name:'Slide the latitudes',line:'x = lon + lat',why:'Each latitude moves sideways by a different amount. North slides right; south slides left. The world leans, and local angles change.'},
  {name:'Pinch the equator',line:'x = lon * lat',why:'At latitude zero, every longitude becomes x = 0. The equator collapses to a point. South of it, the negative multiplier also reverses east and west.'},
  {name:'Make a wave',line:'x = lon + 0.5 * np.sin(3 * lat)',why:'A sine wave moves each latitude left and right. Meridians wiggle. One extra term changes the entire outline.'}
]
export default function WeirdVariants(){
  const {containerRef,bakeAndRegister,morphTo}=useMapStage('mercator')
  const [index,setIndex]=useState(0),[busy,setBusy]=useState(false),[version,setVersion]=useState(0),[status,setStatus]=useState('Choose a recipe, predict the result, then run it.')
  const variant=variants[index]
  const code=`import numpy as np\n\ndef project(lon, lat):\n    phi = np.clip(lat, -1.48, 1.48)\n    ${variant.line}\n    y = np.log(np.tan(np.pi / 4 + phi / 2))\n    return x, y`
  async function apply(result:RunProjectionResult){
    const p=gridProjection(grid,result.x,result.y)
    if(p.invalidCount) throw new Error('Check your formula: some coordinates are not finite.')
    const key=`weird-${version%2}`
    await bakeAndRegister(key,p.fn,p.frame);await morphTo(key,1200)
    setVersion(v=>v+1);setStatus('Map redrawn from this Python run. What changed?')
  }
  return <section className="pf-weird" aria-labelledby="weird-title"><p className="pf-eyebrow">A little mathematical mischief</p><h2 id="weird-title">What happens if we change the rules?</h2><p className="pf-weird-intro">These are experiments, not recommended world maps. Keep Mercator’s y, change only x, and see what a single operation does.</p><div className="pf-variant-choices" role="group" aria-label="Choose a weird variant">{variants.map((v,i)=><button key={v.name} disabled={busy} aria-pressed={i===index} onClick={()=>{setIndex(i);setStatus('Recipe loaded. Run it to update the map.')}}><code>{v.line}</code><span>{v.name}</span></button>)}</div><div className="pf-columns"><div><div className="pf-weird-map" role="img" aria-label="Experimental projection from Python"><div ref={containerRef} className="absolute inset-0"/></div><p role="status" className="pf-math-note">{status}</p><p>{variant.why}</p></div><PythonPanel key={index} filename="what_if.py" code={code} samples={grid} initiallyEditable onRunStateChange={setBusy} onResult={apply} onEdit={()=>setStatus('Code edited. Run it to update the map.')} onReset={()=>setStatus('Recipe reset. Run it to update the map.')} runLabel="Run this experiment"/></div></section>
}
