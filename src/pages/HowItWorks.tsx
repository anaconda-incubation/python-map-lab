import { useEffect } from 'react'
import { Link, useLocation } from 'react-router'
import { readSelection, selectionUrl } from './workspaceState'
import { lessons } from './pythonLessons'
import { lessonStories } from './lessonStories'

export default function HowItWorks() {
  const location = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
    document.getElementById('colophon-title')?.focus({ preventScroll: true })
  }, [])
  return (
    <article className="colophon-page">
      <Link className="text-button" to={selectionUrl(readSelection(location.search))}>
        ← Back to your map
      </Link>
      <p className="eyebrow">The making of Maps with Python</p>
      <h1 id="colophon-title" tabIndex={-1}>
        A world from a function.
      </h1>
      <p className="colophon-lede">
        A few lines of Python turn longitude and latitude into a different view of Earth. You can
        read them, change them, and run them right here.
      </p>
      <section>
        <h2>Python does the mathematics.</h2>
        <p>
          <a href="https://numpy.org/">NumPy</a> handles the arrays of coordinates.{' '}
          <a href="https://pyodide.org/">Pyodide</a> brings Python to your browser in a worker, so a
          calculation can run without taking over scrolling. React builds the interface; Three.js
          draws and animates the maps. The drawing engine uses the coordinates returned by your
          Python.
        </p>
        <p>
          The opening maps are precomputed from the same Python shown in the lessons. That makes
          exploring them fast, including on phones. Opening the editor loads Python on demand;
          pressing Run computes your edited function. Your code runs in your browser, with no server
          executing it. Drafts stay in this browser.
        </p>
      </section>
      <section>
        <h2>Take the experiment with you.</h2>
        <p>
          Each notebook includes real Natural Earth geography and uses GeoPandas, NumPy, and
          Matplotlib. Open it in nteract or Jupyter, then run the cells in order.
        </p>
        <ul className="notebook-links">
          {lessons.map((l) => (
            <li key={l.id}>
              <a href={'/notebooks/' + l.id + '-lesson.ipynb'} download>
                {l.name} notebook ↓
              </a>
            </li>
          ))}
          <li>
            <a href="/notebooks/mollweide-exercise.ipynb" download>
              Mollweide exercise ↓
            </a>
          </li>
          <li>
            <a href="/notebooks/mollweide-solution.ipynb" download>
              Mollweide worked solution ↓
            </a>
          </li>
        </ul>
        <p>
          <a href="https://www.anaconda.com/download">Anaconda</a> provides tools for managing
          Python environments and experimenting with data. The repository includes an{' '}
          <a href="/environment.yml" download>
            environment file
          </a>{' '}
          for these notebooks. With conda installed:
        </p>
        <pre tabIndex={0}>
          <code>
            conda env create -f environment.yml{'\n'}conda activate maps-with-python{'\n'}jupyter
            lab
          </code>
        </pre>
        <p>
          The <a href="https://github.com/anaconda-incubation/python-map-lab">source code</a> is
          available under the BSD 3-Clause license. Run <code>npm ci</code> and{' '}
          <code>npm run dev</code> to work on the site; the README documents map generation and
          validation.
        </p>
      </section>
      <section>
        <h2>Use AI as a thinking partner.</h2>
        <p>
          This site was developed with AI assistance. Python’s readable functions make it useful for
          asking an AI to explain an equation, propose an experiment, or help debug an error. Ask it
          to state assumptions and test them against known coordinates.
        </p>
        <blockquote>
          “Explain this projection one line at a time. Help me predict what changing one coefficient
          will do. Suggest tests at the equator and poles before showing me an implementation.”
        </blockquote>
        <p>
          A convincing explanation is not enough: compare the geometry, check numerical results, and
          consult the original mathematics. The challenge’s sample checks help, but do not prove a
          projection correct everywhere.
        </p>
      </section>
      <section>
        <h2>Credits and sources.</h2>
        <p>
          Maps with Python is presented by Anaconda Incubation. The mapmakers’ ideas are the
          foundation of every lesson.
        </p>
        <ul>
          {lessons.map((l) => {
            const story = lessonStories[l.id]
            return (
              <li key={l.id}>
                <a href={story.source}>{l.name}</a> — {story.history}
                {story.historySource && (
                  <>
                    {' '}
                    <a href={story.historySource.url}>{story.historySource.label} ↗</a>
                  </>
                )}
              </li>
            )
          })}
          <li>
            <a href="https://proj.org/en/stable/operations/projections/moll.html">Mollweide</a> —
            Karl Brandan Mollweide, 1805. The exercise uses the spherical equations; PROJ supplies
            an independent reference for validation.
          </li>
        </ul>
        <p>
          Geography:{' '}
          <a href="https://www.naturalearthdata.com/about/terms-of-use/">Natural Earth</a> (public
          domain). Globe imagery:{' '}
          <a href="https://visibleearth.nasa.gov/collection/1484/blue-marble">NASA Blue Marble</a>.
          Rendering and interface: <a href="https://threejs.org/">Three.js</a>,{' '}
          <a href="https://react.dev/">React</a>, <a href="https://codemirror.net/">CodeMirror</a>,
          and <a href="https://katex.org/">KaTeX</a>. Type: Source Serif 4, Inter, and JetBrains
          Mono.
        </p>
        <p>
          Third-party code, data, fonts, and Anaconda branding retain their own licenses and rights;
          see the repository’s notices. Sources &amp; notes in the page menu provides additional
          references and our geographical naming policy.
        </p>
      </section>
    </article>
  )
}
