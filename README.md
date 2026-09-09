# Python Map Lab

An interactive field guide to map projections: explore a globe, read and edit NumPy, and draw the result directly in the browser. The interface uses Anaconda’s dark palette.

## Run

```sh
npm ci
npm run dev
```

Production preview:

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 4176 --strictPort
```

## Structure

- `src/pages/PythonFirst.tsx` coordinates the globe, projection lessons, and workspace tabs.
- `pythonLessons.ts`, `lessonStories.ts`, and `LessonReading.tsx` hold the lesson content. `experimentRecipes.ts` supplies the six experiments; `src/python/centered.py` is the editable azimuthal equidistant example.
- `src/chapters/PythonPanel.tsx` owns the CodeMirror editor and Python execution controls. `src/workers/pyodide.worker.ts` runs NumPy off the main thread.
- `src/lab/useMapStage.ts` connects React to the shared Three.js renderer. `src/projection` contains projection mathematics, geometry, distortion measurements, and cooperative baking.
- `src/pages/lessonNotebook.ts` creates self-contained GeoPandas notebooks with embedded Natural Earth geography. Executed nteract examples are in `notebook-checks/`.
- `src/index.css` provides global typography, colors, and shared components. `src/pages/python-first.css` styles the field guide and responsive sticky layout.

The retained `src/lab` numerical utilities support regression tests. The old essay and full lab screens are no longer routed; `/story/*` and `/lab/*` redirect to the field guide. Their historical source remains in Git and the original worktrees.

## Checks

```sh
npm test
npm run lint
npm run build
node scripts/compare-baseline.mjs ../python-first
```

The comparison script checks lesson content, experiment recipes, full notebook exports, and the retained renderer/Python runtime against the original worktree. See `CLEANUP_COMPARISON.md` for the cleanup review and browser checks.

## Assets

Maps use Natural Earth public-domain geography: 1:50 million vectors for the renderer and embedded 1:110 million land geometry for exported notebooks. The photographic globe uses NASA Blue Marble. The app’s Sources drawer contains projection references, credits, and the naming policy.
