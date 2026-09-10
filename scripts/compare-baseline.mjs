/** Compare teaching behavior with the accepted main revision, not file byte counts. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
const baseline=path.resolve(process.argv[2]??'../app'),current=process.cwd()
const read=(root,file)=>fs.readFileSync(path.join(root,file),'utf8')
async function load(root,file){
  const source=read(root,file).replace(/import (\w+) from ['"]@\/(.*?)\?raw['"]/g,(_,name,file)=>`const ${name} = ${JSON.stringify(read(root,`src/${file}`))}`)
  const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}})
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}
const before=(await load(baseline,'src/pages/pythonLessons.ts')).lessons,after=(await load(current,'src/pages/pythonLessons.ts')).lessons
assert.deepEqual(after,before,'Lesson code, helpers, descriptions, equations, attribution, and annotations')
assert.deepEqual((await load(current,'src/pages/lessonStories.ts')).lessonStories,(await load(baseline,'src/pages/lessonStories.ts')).lessonStories)
const oldRecipes=await load(baseline,'src/pages/experimentRecipes.ts'),newRecipes=await load(current,'src/pages/experimentRecipes.ts')
assert.deepEqual(newRecipes.variants,oldRecipes.variants)
for(let i=0;i<6;i++)assert.equal(newRecipes.experimentCode(newRecipes.variants[i]),oldRecipes.experimentCode(oldRecipes.variants[i]))
const geography=JSON.parse(read(current,'public/geo/ne_110m_land.geojson'))
const oldNotebook=(await load(baseline,'src/pages/lessonNotebook.ts')).lessonNotebook,newNotebook=(await load(current,'src/pages/lessonNotebook.ts')).lessonNotebook
for(let i=0;i<before.length;i++){
  const code=(before[i].supportCode??'')+'\n'+before[i].code
  assert.deepEqual(newNotebook(after[i],code,geography),oldNotebook(before[i],code,geography))
}
for(const file of ['src/python/centered.py','src/python/authagraph_lesson.py','src/projection/projections.ts','src/projection/authagraph.ts','src/projection/distortion.ts','src/three/authagraphMotion.ts'])assert.equal(read(current,file),read(baseline,file),file)
console.log('PASS: all 4 lessons, 6 experiment recipes, history, equations, helpers, projection mathematics, and 4 full notebook exports match the accepted main baseline. Rendering/layout lifecycle changes are covered by tests and the browser comparison report.')
