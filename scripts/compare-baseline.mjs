/** Compare immutable lesson/runtime inputs and exported notebooks with a worktree. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const baseline = path.resolve(process.argv[2] ?? '../python-first')
const current = process.cwd()
const read = (root, file) => fs.readFileSync(path.join(root, file), 'utf8')
async function load(root, file) {
  let source = read(root, file)
  source = source.replace(/import (\w+) from ['"]@\/(.*?)\?raw['"]/g,
    (_, name, file) => `const ${name} = ${JSON.stringify(read(root, `src/${file}`))}`)
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}
const before = (await load(baseline, 'src/pages/pythonLessons.ts')).lessons
const after = (await load(current, 'src/pages/pythonLessons.ts')).lessons
assert.deepEqual(after.map(({ tradeoff, ...lesson }) => lesson), before)
assert.deepEqual((await load(current, 'src/pages/lessonStories.ts')).lessonStories,
  (await load(baseline, 'src/pages/lessonStories.ts')).lessonStories)
const oldExperiments = read(baseline, 'src/pages/WeirdVariants.tsx')
const start = oldExperiments.indexOf('const centeredCode=')
const end = oldExperiments.indexOf('export default function')
const oldRecipes = ts.transpileModule(oldExperiments.slice(start, end) + '\nexport {variants}', {
  compilerOptions: { module: ts.ModuleKind.ESNext },
}).outputText
const oldVariants = (await import(`data:text/javascript;base64,${Buffer.from(oldRecipes).toString('base64')}`)).variants
assert.deepEqual((await load(current, 'src/pages/experimentRecipes.ts')).variants, oldVariants)
const geography = JSON.parse(read(current, 'public/geo/ne_110m_land.geojson'))
const originalNotebook = (await load(baseline, 'src/pages/lessonNotebook.ts')).lessonNotebook
const cleanedNotebook = (await load(current, 'src/pages/lessonNotebook.ts')).lessonNotebook
for (let i = 0; i < before.length; i++) {
  const code = before[i].supportCode ? `${before[i].supportCode}\n${before[i].code}` : before[i].code
  assert.deepEqual(cleanedNotebook(after[i], code, geography), originalNotebook(before[i], code, geography))
}
for (const dir of ['projection', 'three', 'workers']) {
  for (const file of fs.readdirSync(path.join(current, 'src', dir), {recursive:true})) {
    const relative = `src/${dir}/${file}`
    if (fs.statSync(path.join(current, relative)).isFile()) {
      assert.equal(read(current, relative), read(baseline, relative), relative)
    }
  }
}
for (const file of ['src/chapters/PythonPanel.tsx','src/lab/useMapStage.ts','src/lab/gridfn.ts','src/python/authagraph_lesson.py']) {
  assert.equal(read(current, file), read(baseline, file), file)
}
console.log('PASS: 4 lessons, 4 stories, 6 recipes, 4 complete notebook exports, and retained rendering/Python runtime files match the baseline.')
