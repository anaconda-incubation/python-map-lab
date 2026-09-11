# Generated map assets

The reader view loads a precomputed map from the **same Python source** shown in the lesson. Edited code always runs in Pyodide. Nothing is executed from a shared URL.

## Rebuild after changing a formula, helper, geometry algorithm, or data

1. Run `npm run assets:prepare`. This writes the authoritative lesson/preset sources and exact longitude/latitude sample arrays into the ignored `.asset-build` directory.
2. In nteract, run the generation cell in `notebook-checks/mobile-assets.ipynb` with this checkout as `root`. It calls `scripts/project-assets.py` and executes all 30 Python presets at both geometry qualities. Alternatively a configured NumPy environment can run `python scripts/project-assets.py`.
3. Run `npm run assets:finish`. It creates the compatible renderer buffers, compressed previews, textures, and standalone notebook exports. It preserves executed check notebooks when their sources are unchanged.
4. Run `npm run check` and `node scripts/compare-baseline.mjs ../app` against the accepted baseline. Review the map in the browser, especially Antarctica and moved cuts. Rerun changed notebooks in nteract, including the separate Mollweide exercise and worked solution.

`npm run build` refuses stale generated assets. The fingerprint covers Python source, preset selection, geometry, sampling, rendering preparation, labels, and vendored geography. Asset filenames also hash the complete payload, so cache identity changes with actual content. Cloudflare may cache `/maps/*` immutably. Each file stays below its 25 MiB limit.

## Runtime boundaries

- The HTML already contains an introductory map image and readable lesson content. No JavaScript is needed to see that preview or download a standalone notebook.
- One active WebGL renderer loads the chosen `.mapdata` file. Presets do not request Python, CodeMirror, the sample layout, or the raw GeoJSON.
- Opening Python loads CodeMirror and starts a single worker. The first Run fetches precomputed master geometry and exact sample arrays; it does not rediscover samples. Numerical lookup uses exact nested numeric maps, never interpolation across cuts.
- Overview uses 110m Natural Earth geography with a maximum 6° interior triangle span. Detailed mode uses 50m geography with a maximum 3° span. Projected discontinuity checks remain active at both qualities. A full pole-closing edge is preserved before triangulation.
- Asset requests coalesce; an LRU cache keeps at most five recent decoded assets and a 64 MiB target. A single oversized detail asset may exceed the target. Active renderer endpoints are separately retained until the next transition; custom endpoints are bounded.
- Stop aborts preparation or terminates Python, rejects pending jobs, preserves the draft, and restarts the worker lazily. Infinite output is capped at 64,000 characters. Code errors leave the last valid map.
- `?diagnostics` exposes local phase, resource, frame, and lab observations. It sends nothing to analytics. These are desktop-browser lab readings, not field Core Web Vitals.

## Scope

`main` and the public site are unchanged by this worktree. Heap remains disabled pending the approved production ID and Transcend configuration. The hosting process remains a static Cloudflare Pages build: `npm ci`, `npm run build`, output `dist`, no deploy command required for the connected Pages project.

## Responsive map frames

The normal build also runs `scripts/map-frames.mjs`. It reads the already-generated map bounds and writes the small `generated-frames.json` layout index. This keeps the initial phone pane proportional before downloading interactive geometry; it does not rerun Python or change projection assets. Custom Python results supply their own bounds after execution. The regular Mercator pane uses a 2:1 viewport at every screen width, fits the map horizontally, and biases the crop northward to remove more of the oversized southern polar region. Expand restores the full extent. This changes only the view, not the projection coordinates or notebook output.

## Challenge assets

Mollweide adds overview/detail buffers and a target image generated from `src/python/mollweide-solution.py`. Its initial editor uses `mollweide-scaffold.py`; this deliberately unfinished source is never represented as the source of the target rendering. `challengeNotebook.ts` exports separate exercise and solution notebooks and shares the optional hints with the page. The build checks 64 map buffers in total (60 flat preset buffers, two globe buffers, and two shared geometry buffers).
