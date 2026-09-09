import { useState } from 'react'
import PythonPanel from '@/chapters/PythonPanel'
import { useMapStage } from '@/lab/useMapStage'
import { buildLabGrid, gridProjection } from '@/lab/gridfn'
import type { RunProjectionResult } from '@/projection/worker-client'
const grid=buildLabGrid()
const centeredCode=`import numpy as np

# Change these degrees to put your own place in the middle.
center_lat = 41.8781  # Chicago; north is positive
center_lon = -87.6298  # east is positive

def project(lon, lat):
    if not -90 <= center_lat <= 90:
        raise ValueError("Center latitude must be between -90 and 90 degrees.")
    phi0, lam0 = np.radians([center_lat, center_lon])
    delta = lon - lam0
    east = np.cos(lat) * np.sin(delta)
    north = (np.cos(phi0) * np.sin(lat)
             - np.sin(phi0) * np.cos(lat) * np.cos(delta))
    cos_c = (np.sin(phi0) * np.sin(lat)
             + np.cos(phi0) * np.cos(lat) * np.cos(delta))
    c = np.arctan2(np.hypot(east, north), cos_c)
    bearing = np.arctan2(east, north)
    x = c * np.sin(bearing)
    y = c * np.cos(bearing)
    # The opposite point has no unique bearing. Omit a tiny cap.
    visible = c < np.radians(178)
    return np.where(visible, x, np.nan), np.where(visible, y, np.nan)

# Optional distance ring: uncomment these lines and run again.
# Distances are great-circle distances on a sphere of radius 6371 km.
# ring_km = 3000
# if not 0 < ring_km <= 19000:
#     raise ValueError("Ring distance must be greater than 0 and at most 19,000 km.")
# angle = np.linspace(0, 2 * np.pi, 361)
# radius = ring_km / 6371
# map_ring = np.column_stack((radius * np.sin(angle), radius * np.cos(angle)))
# print(f"Ring: {ring_km:g} km from the center")
`
const variants: {name:string;line:string;why:string;flipY?:boolean;label?:string;code?:string;allowGaps?:boolean}[]=[
  {name:'Flip the world upside down',line:'x = lon',label:'y = -y',flipY:true,why:'A minus sign in front of y reflects the map vertically: south moves to the top, north to the bottom, and east stays on the right. This is a reflection, not a 180° rotation. It preserves the original map’s areas, distances, and angle magnitudes, so Mercator’s distortion remains. North-up is a convention, not a mathematical requirement. Try the same minus sign with any of the other recipes.'},
  {name:'Slide the latitudes',line:'x = lon + lat',why:'Each latitude moves sideways by a different amount. North slides right; south slides left. The world leans, and local angles change.'},
  {name:'Pinch the equator',line:'x = lon * lat',why:'At latitude zero, every longitude becomes x = 0. The equator collapses to a point. South of it, the negative multiplier also reverses east and west.'},
  {name:'Try a logarithm',line:'x = lon * np.log1p(np.abs(lat))',why:'log1p means log(1 + value). Taking the absolute latitude makes its input nonnegative in both hemispheres. The equator still pinches to a point, but east and west no longer reverse south of it. This is a different formula, not a repair that preserves the original map.'},
  {name:'Make a wave',line:'x = lon + 0.5 * np.sin(3 * lat)',why:'A sine wave moves each latitude left and right. Meridians wiggle. One extra term changes the entire outline.'},
  {name:'Center on a place',line:'center_lat, center_lon',code:centeredCode,allowGaps:true,why:'Put your place at the center of an azimuthal equidistant map. Edit center_lat and center_lon in degrees, then run. Start with Chicago, or try 90, 0 for the North Pole. Distance and compass direction from your center are preserved on the sphere; distances between other places, shapes, and areas are not. North points up at the center. The far side stretches around the rim. This example leaves out a small cap within 2° of the opposite point, where direction becomes ambiguous. Uncomment the optional ring code below the function to mark a great-circle distance in kilometres.'}
]
export default function WeirdVariants(){
  const {containerRef,bakeAndRegister,morphTo,setMapRing}=useMapStage('mercator')
  const [index,setIndex]=useState(1),[busy,setBusy]=useState(false),[version,setVersion]=useState(0),[status,setStatus]=useState('Choose a recipe, predict the result, then run it.')
  const variant=variants[index]
  const code=variant.code ?? `import numpy as np\n\ndef project(lon, lat):\n    phi = np.clip(lat, -1.48, 1.48)\n    ${variant.line}\n    y = ${variant.flipY?'-':''}np.log(np.tan(np.pi / 4 + phi / 2))\n    return x, y`
  async function apply(result:RunProjectionResult, source:string){
    const p=gridProjection(grid,result.x,result.y)
    if(p.invalidCount && (!variant.allowGaps || p.invalidCount > grid.lon.length * 0.05)) {
      setStatus('This run could not be drawn. The map still shows the last successful result.')
      const logarithmHint = /np\.log\(\s*lat\s*\)/.test(source)
        ? ' np.log(lat) is undefined for negative latitudes and goes to negative infinity at the equator. Try the “Try a logarithm” recipe: np.log1p(np.abs(lat)) stays finite in both hemispheres, but defines a different map.'
        : ' Check logarithms of zero or negative numbers, division by zero, and square roots of negative numbers. Very large outputs may also be outside the renderer’s limits.'
      throw new Error(`Cannot draw this run: ${p.invalidCount.toLocaleString()} of ${grid.lon.length.toLocaleString()} sampled locations have no drawable coordinates.${logarithmHint} Your code has been kept.`)
    }
    const key=`weird-${version%2}`
    await bakeAndRegister(key,p.fn,p.frame)
    setMapRing([])
    await morphTo(key,1200)
    setMapRing(result.mapRing ?? [], Math.max(p.frame.halfWidth,p.frame.halfHeight))
    setVersion(v=>v+1);setStatus(p.invalidCount ? 'Map redrawn. Unmapped samples are omitted around the opposite point.' : 'Map redrawn from this Python run. What changed?')
  }
  return <section className="pf-weird" aria-labelledby="weird-title"><p className="pf-eyebrow">A little mathematical mischief</p><h2 id="weird-title">What happens if we change the rules?</h2><p className="pf-weird-intro">Start with Mercator and change one operation. Slide, pinch, or ripple the world by changing x, or negate y to put south at the top. Or choose a new center and preserve distances from that place. These experiments explore what a formula does.</p><aside className="pf-log-note"><strong>Why not <code>np.log(lat)</code>?</strong><p>Latitude is zero at the equator and negative in the southern hemisphere. A real logarithm needs a positive input. Even <code>np.log(np.abs(lat))</code> still fails at zero. Try <code>np.log1p(np.abs(lat))</code>, which means log(1 + |latitude|), to explore a finite alternative.</p></aside><div className="pf-variant-choices" role="group" aria-label="Choose a weird variant">{variants.map((v,i)=><button key={v.name} disabled={busy} aria-pressed={i===index} onClick={()=>{setIndex(i);setStatus('Recipe loaded. Run it to update the map.')}}><code>{v.label ?? v.line}</code><span>{v.name}</span></button>)}</div><div className="pf-columns"><div className="pf-experiment-map-column"><div className="pf-experiment-map-sticky"><div className="pf-weird-map" role="img" aria-label="Experimental projection from Python"><div ref={containerRef} className="absolute inset-0"/></div><p role="status" className="pf-math-note">{status}</p></div></div><div className="pf-experiment-reading"><p className="pf-change">{variant.why}</p>{variant.allowGaps && <p className="pf-math-note"><a href="https://proj.org/en/stable/operations/projections/aeqd.html" target="_blank" rel="noreferrer">About the azimuthal equidistant projection ↗</a></p>}<PythonPanel hideCulledVertexWarnings={variant.allowGaps} key={index} filename="what_if.py" code={code} samples={grid} initiallyEditable onRunStateChange={setBusy} onResult={apply} onEdit={()=>setStatus('Code edited. Run it to update the map.')} onReset={()=>setStatus('Recipe reset. Run it to update the map.')} runLabel="Run this experiment"/></div></div></section>
}
