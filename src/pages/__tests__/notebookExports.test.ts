import fs from 'node:fs'
import { expect, it } from 'vitest'
import { lessons } from '../pythonLessons'
import { lessonNotebook } from '../lessonNotebook'
import { challengeNotebook } from '../challengeNotebook'
const land = JSON.parse(fs.readFileSync('public/geo/ne_110m_land.geojson', 'utf8'))
const sources = (notebook: { cells: { source: string[] }[] }) =>
  notebook.cells.map((c) => c.source.join(''))
it('ships the same lesson code and narrative that dynamic notebook downloads use', () => {
  for (const lesson of lessons) {
    const actual = JSON.parse(fs.readFileSync(`public/notebooks/${lesson.id}-lesson.ipynb`, 'utf8'))
    expect(sources(actual)).toEqual(
      sources(lessonNotebook(lesson, (lesson.supportCode ?? '') + '\n' + lesson.code, land)),
    )
  }
})
it('keeps the exercise unfinished and its solution in a separate download', () => {
  for (const kind of ['exercise', 'solution'] as const) {
    const notebook = challengeNotebook(kind, land)
    expect(
      sources(JSON.parse(fs.readFileSync(`public/notebooks/mollweide-${kind}.ipynb`, 'utf8'))),
    ).toEqual(sources(notebook))
    const code = notebook.cells.find((c) => c.id === 'projection')!.source.join('')
    expect(code.includes('NotImplementedError')).toBe(kind === 'exercise')
    expect(code.includes('for _ in range')).toBe(kind === 'solution')
  }
})
