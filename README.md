# Python Map Lab

An interactive field guide to map projections. Explore a globe, edit NumPy, and draw the result directly in the browser.

## Development

Use Node.js 22.12 or later (Node 22 is pinned in `.nvmrc`).

```sh
npm ci
npm run dev
```

## Production

```sh
npm run check
npm run preview -- --host 127.0.0.1 --port 4175 --strictPort
```

Deploy the generated `dist/` directory to a static HTTPS host at the domain root. Configure a fallback to `index.html` for browser routes; asset requests should still return a real 404 when missing. No backend, API keys, or build-time secrets are required. The preview command is for local verification, not a production server.

Python runs in a Web Worker using the pinned Pyodide distribution from `cdn.jsdelivr.net`. The first Python run requires network access to load Python and NumPy; later requests can use the browser cache. Fonts, geography, and globe textures are served with the site. Allow module workers and Pyodide/WebAssembly when configuring hosting security headers. Cache hashed `assets/` files long-term and revalidate `index.html` on deployment.

GitHub Actions runs lint, all unit tests, and a production build on pushes and pull requests. `main` is the publishing branch in [anaconda-incubation/python-map-lab](https://github.com/anaconda-incubation/python-map-lab). See [DEPLOYMENT.md](DEPLOYMENT.md) for Cloudflare Pages setup and automatic deployments.

## Structure

- `src/pages/PythonFirst.tsx`: lesson navigation, editable projections, and map state.
- `pythonLessons.ts`, `lessonStories.ts`, `LessonReading.tsx`: teaching content.
- `experimentRecipes.ts` and `src/python/centered.py`: the six experiments.
- `src/python/authagraph_lesson.py`: AuthaGraph helpers, including explicit point centering.
- `src/chapters/PythonPanel.tsx`: CodeMirror and Python execution controls.
- `src/workers/pyodide.worker.ts`: isolated Python execution; the client restarts timed-out runs.
- `src/three` and `src/projection`: rendering, projection mathematics, geometry, and distortion.
- `src/pages/lessonNotebook.ts`: self-contained GeoPandas notebook downloads with embedded geography.
- `notebook-checks/`: saved nteract validation notebooks. Local runtime lock files are ignored.
- `review/`: historical comparisons, numerical rendering checks, and publishing review notes. These are not shipped in `dist/`.

The historical cleanup comparison script requires an explicit old checkout path and is not part of the production checks. Old routes redirect to the field guide.

## Teaching controls

Mercator, Gall–Peters, and Equal Earth use a `central_meridian` in degrees, positive east and negative west. AuthaGraph instead uses `center_lat` and `center_lon` to place a selected point at the rectangle's center. Centering changes its cuts, not its distortion properties. The azimuthal equidistant experiment preserves great-circle distances from its center and supports an optional ring up to 19,000 km.

## License

Original project code is licensed under the [BSD 3-Clause License](LICENSE), copyright 2026 Anaconda, Inc. Third-party code and assets retain their existing licenses and notices, including the MPL-2.0 AuthaGraph implementations.

## Assets and attribution

Natural Earth public-domain geography supplies the renderer (1:50 million) and exported notebooks (1:110 million). The photographic globe uses NASA Blue Marble. The Sources drawer lists references and credits. AuthaGraph's adapted helper implementations retain their MPL-2.0 notices. Branding and typography retain their respective owners' rights.
