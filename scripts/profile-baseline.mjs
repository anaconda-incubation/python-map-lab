/** Add a local, read-only measurement panel to an isolated copy of the baseline build. */
import fs from 'node:fs'
import path from 'node:path'
const target='/tmp/maps-baseline-504362d'
fs.cpSync(path.resolve('../app/dist'),target,{recursive:true})
const script=`let readyMs=null,lcp=0,cls=0,longTasks=0,longestTask=0;
for(const type of ['largest-contentful-paint','layout-shift','longtask']) if(PerformanceObserver.supportedEntryTypes.includes(type))new PerformanceObserver(list=>{for(const e of list.getEntries()){if(type==='largest-contentful-paint')lcp=e.startTime;if(type==='layout-shift'&&!e.hadRecentInput)cls+=e.value;if(type==='longtask'){longTasks++;longestTask=Math.max(longestTask,e.duration)}}}).observe({type,buffered:true});
const timer=setInterval(()=>{if(document.querySelector('.pf-canvas[aria-busy="false"]')){readyMs=Math.round(performance.now());clearInterval(timer)}},25);
setTimeout(()=>clearInterval(timer),45000);
document.addEventListener('DOMContentLoaded',()=>{
 const panel=document.createElement('details');panel.style.cssText='margin:32px;padding:20px;border:1px solid #888;font:12px monospace';panel.innerHTML='<summary>Baseline local measurements</summary><button>Refresh baseline measurements</button><button>Reload baseline</button><pre style="white-space:pre-wrap;max-height:600px;overflow:auto"></pre>';
 const refresh=()=>{panel.querySelector('pre').textContent=JSON.stringify({readyMs,lcp:Math.round(lcp),cls,longTasks,longestTask:Math.round(longestTask),canvases:document.querySelectorAll('canvas').length,resources:performance.getEntriesByType('resource').map(r=>({path:new URL(r.name).pathname,transferred:r.transferSize,duration:Math.round(r.duration)}))},null,2)};
 panel.querySelector('summary').addEventListener('click',refresh);panel.querySelectorAll('button')[0].addEventListener('click',refresh);panel.querySelectorAll('button')[1].addEventListener('click',()=>location.reload());document.body.append(panel)
});`
fs.writeFileSync(target+'/baseline-profile.js',script)
const html=fs.readFileSync(target+'/index.html','utf8').replace('<head>','<head><script src="/baseline-profile.js"></script>')
fs.writeFileSync(target+'/index.html',html)
console.log('Isolated baseline profile at '+target)
