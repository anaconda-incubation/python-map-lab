import { mollweideHints } from './mollweideHints'
import { lessonNotebook } from './lessonNotebook'
import scaffold from '@/python/mollweide-scaffold.py?raw'
import solution from '@/python/mollweide-solution.py?raw'

export function challengeNotebook(kind: 'exercise' | 'solution', geography: unknown) {
  const exercise = kind === 'exercise'
  const notebook = lessonNotebook(
    {
      id: 'mollweide',
      name: 'Mollweide',
      explanation:
        'The challenge is a world map that keeps relative areas within an ellipse twice as wide as it is tall. Shapes and distances change. Karl Brandan Mollweide introduced it in 1805. [Projection reference](https://proj.org/en/stable/operations/projections/moll.html).',
      question: 'What must happen to the equator, the poles, and the outline?',
      change: '',
      annotations: [],
    },
    exercise ? scaffold : solution,
    geography,
  )
  notebook.cells[0].source[0] += exercise
    ? '\n\n## Your exercise\n\nThis file does not contain a worked solution. Complete the TODOs in `project`. It accepts NumPy arrays of radians and returns x and y arrays for a unit-radius sphere. Start with the equator and poles, then test intermediate latitudes. The web challenge offers progressive hints and a separate solution download. Running this unfinished notebook reports what remains to do; it does not draw a pretend result.'
    : '\n\n## Worked solution\n\nThis file intentionally includes the answer. Bisection solves the auxiliary-angle equation in a fixed bracket. At the poles we explicitly return a single point. Run in order, then compare with your own approach.'
  if (exercise) {
    const index = notebook.cells.findIndex((c) => c.id === 'drawing-helpers')
    notebook.cells.splice(index, 0, {
      ...notebook.cells[index],
      id: 'readiness',
      source: [
        'ready = False\ntry:\n    project(np.array([0.0]), np.array([0.0]))\n    ready = True\nexcept NotImplementedError as error:\n    print(error)\n    print("Complete the projection cell, then rerun from that cell. No map has been drawn yet.")',
      ],
    })
    for (const cell of notebook.cells.filter((c) => ['drawing-helpers', 'map'].includes(c.id))) {
      cell.source = [
        'if ready:\n' +
          cell.source
            .join('')
            .split('\n')
            .map((line) => '    ' + line)
            .join('\n'),
      ]
    }
  }
  if (exercise)
    notebook.cells.push({
      id: 'optional-hints',
      cell_type: 'markdown',
      metadata: {},
      source: [
        '## Optional hints\n\nRead one hint, try it, then come back for the next.\n\n' +
          mollweideHints.join('\n\n'),
      ],
    })
  return notebook
}
