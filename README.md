# Every Flat Map Is a Choice

An interactive map-projection essay built with React, TypeScript, Three.js, GSAP and Pyodide.

## Development

```sh
npm ci
npm run dev
```

`npm run build` creates `dist/`; `npm run preview` serves that production build. `npm test` runs the projection and geometry tests, and `npm run lint` checks source. Dependencies are pinned in the lockfile using the official npm registry.

## Visual experience

The opening pairs a midnight atlas palette with a textured rotating globe. A single controllable sequence settles rotation, introduces the grid, unfolds the geographic surface and resolves to Equal Earth. Visitors can scroll, play, replay, return to the globe or use the keyboard-accessible range control. The global motion preference follows the system unless overridden in the navigation.

Paper-toned reading sections follow an early linked globe/map experiment. Fifteen curated places across all seven continents can be tracked through Mercator, Equal Earth and Gall–Peters, with endpoint local-area measurements and an optional prediction exercise. The full morph studio retains all projections. Mathematics and Python examples are expandable; the lab has four purpose presets.

## Geography and imagery

- `public/textures/earth-blue-marble.jpg`: NASA Blue Marble Next Generation, July 2004, 5,400 × 2,700 pixels, topography and bathymetry. [Original composite](https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73751/world.topo.bathy.200407.3x5400x2700.jpg). Approximately 2.2 MB compressed. This is a cloud-free historical composite, not live imagery. Credits are included in the opening and Sources.
- `public/geo/ne_50m_*.geojson`: Natural Earth 1:50 million land, lakes and coastline, public domain, from the [Natural Earth vector repository](https://github.com/nvkelso/natural-earth-vector/tree/master/geojson). Used by the main projection engine. The dataset scale does not mean 50-metre resolution.
- Retained 1:110 million and curated region data support other demonstrations and numerical comparisons.
- `public/mercator-1569.svg` is explicitly labeled as a modern illustrative reconstruction.

The vector globe renders while the texture loads, and remains usable if loading fails. The ocean uses the same geographic morph as the land; the photographic treatment fades into a quieter flat-map palette. Longitude conventions, marker positions and labels share the rendered coordinate system. Stages suspend rendering outside the viewport and retain the existing lazy allocation/disposal lifecycle.

## Verification and remaining tuning

The redesign adds geometry tests for east/west orientation, inverse coordinates, finite surface buffers, land/ocean depth and staggered interpolation. Browser checks cover desktop/mobile composition, linked selection, replay/manual endpoints, reduced motion and lab presets.

The globe currently uses a single 5.4K texture and 50m vectors. Optional 8K/10m upgrades, KTX2 compression, cloud/normal maps and a shared renderer across narrative chapters remain separate enhancements. No device-wide frame-rate guarantee is made. AuthaGraph's existing staged construction is a vertex interpolation, not a physical hinge simulation; its seam behavior needs separate treatment from smooth projections.

## Scroll responsiveness update

Projection baking (including custom projections and the ocean surface), AuthaGraph construction, and its tiling preparation now yield to browser input in roughly 4 ms work slices. Concurrent requests for the same canonical projection share their pending result. Map labels no longer read element widths in the frame loop, and document-size refreshes are debounced. The essay uses scene-local colors and a gradient handoff into the first paper section instead of recoloring thousands of descendants at a boundary.

The detailed 50m AuthaGraph regression test checks byte-identical geometry and verifies other tasks run before preparation completes. One local Node run measured a 3,945 ms synchronous block versus a 5.7 ms maximum timer gap during cooperative preparation (940 task opportunities). This isolates CPU preparation; it does not measure GPU upload, shader compilation or browser frame rate. Run `npx vitest run src/projection/__tests__/cooperative-bake.test.ts --silent=false --reporter=verbose` to repeat it.

## AuthaGraph motion correction

The construction now holds the sphere while subdivision appears, then blends continuously through cone → net → rectangle. The former shader skipped the sphere/cone interpolation at stage 1. Geometry weights now reach all five advertised endpoints exactly, and camera position/FOV interpolate across the same continuous stage coordinate instead of rounding to discrete camera targets. A short scroll scrub absorbs wheel steps; stage navigation uses the same Lenis controller as scrolling.

All five captions remain mounted in one shared grid cell and crossfade without changing their position or container height. The longer construction note follows the animation. Drag and keyboard orbit remain available on the solid stages. Geometry is prepared once per stage mount and retained in GPU buffers during playback; scroll updates only change weights, camera targets and caption opacity. Regression coverage checks endpoints, continuity around every geometry/camera boundary, normalized weights and caption crossfades.

## Responsive reading and lab review

Reading columns now allow flex/grid children to shrink, so equations cannot push prose or pull quotes behind adjacent maps. Long derivations are split into aligned steps. Equation cards use container-relative type, wrap glossary entries, and expose a keyboard-focusable horizontal scroller with a visible hint only when a formula still needs it. The scorecard uses selectable projection cards with three primary metrics, expandable descriptive properties and explicit overlay controls instead of an internally scrolling eight-column table.

The lab uses the same Tissot sampling density for canonical and custom buffers, serializes candidate previews before committing the final result, refreshes replaced custom keys, and reports final rendering failures. Camera framing samples intermediate latitudes to include bulging outlines. The wider canvas has layer controls below it. Tall maps can still be legitimate optimizer outcomes; the UI explains the outline tradeoff rather than altering a projection to make it look better.

Run `LAB_REVIEW_OUT=public/lab-visual-review.html npx vitest run src/lab/__tests__/visual-matrix.test.ts` to regenerate the visual matrix. It covers four presets plus each of six goals alone in both families, checks finite coordinates and framing, and renders actual generated coordinates with Natural Earth 110m outlines. The matrix uses the JavaScript optimizer mirror; browser review additionally exercised four browser preset searches and a successful Python/SciPy search after fixing conversion of JavaScript weights to a Python dictionary. Open `/lab-visual-review.html` in the preview after building.
