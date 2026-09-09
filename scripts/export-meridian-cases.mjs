import fs from 'node:fs'
import ts from 'typescript'
async function load(file) {
  const source = fs.readFileSync(file, 'utf8').replace(/import (\w+) from ['"]@\/(.*?)\?raw['"]/g,
    (_, name, file) => `const ${name} = ${JSON.stringify(fs.readFileSync(`src/${file}`, 'utf8'))}`)
  const {outputText} = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext}})
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}
const {lessons} = await load('src/pages/pythonLessons.ts')
const {variants, experimentCode} = await load('src/pages/experimentRecipes.ts')
const cases = [
  ...lessons.map(l => ({name:l.name, code:(l.supportCode ?? '')+'\n'+l.code})),
  ...variants.map(v => ({name:v.name, code:experimentCode(v)})),
]
fs.writeFileSync('notebook-checks/meridian-cases.json', JSON.stringify(cases,null,2)+'\n')
console.log(`Exported ${cases.length} live Python examples.`)
