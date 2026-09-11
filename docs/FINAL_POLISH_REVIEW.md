# Final teaching-flow review

September 11, 2026. Worktree: `mobile-redesign`; branch: `final-polish`.

The reviewed mobile redesign and its pending notebook outputs were preserved in checkpoint `5091506`, before this teaching-flow pass. The accepted redesign at `38875f7` was also built separately for comparison. Main and the public deployment have not been updated.

## Completed changes

1. One primary navigation sequence: Start here, four projections, and Try your own. A single selector serves smaller screens; desktop shows one row. Existing preset URLs, draft keys, and city controls remain compatible. Previous/Next provide a sequential path, and the last selected activity is remembered.
2. Start here teaches the distortion circles with a small accessible diagram and a deliberate globe → Mercator → Gall–Peters comparison. The guide reuses the active map and preserves animation and map-options state.
3. Each projection opens with its human purpose, author/history, and tradeoff before Python and equations. The shared content also supplies notebook introductions and colophon credits.
4. All six existing experiments remain, with individual prediction prompts. Logarithm guidance appears only in its experiment; the distance-ring limit and uncomment shortcut remain local to Center on a place.
5. An optional Mollweide challenge starts with unfinished Python, a precomputed target, four progressive hints, independent sample checks, and an explicitly revealed solution. Revealing does not overwrite or run a draft. Exercise and solution notebooks are separate.
6. A static, shareable How this was built page explains NumPy/Pyodide, the JavaScript renderer, precomputed examples, local drafts, AI-assisted learning, credits, notebook downloads, and a conda environment file.
7. The centered attribution now reads BY ANACONDA INCUBATION. BY and INCUBATION share Inter and the same weight. Compact screens retain the home icon to give the longer attribution room.
8. A browser regression exposed a zero-sized hidden map pane corrupting its camera aspect during mobile Python execution. The renderer now retains a valid aspect and ignores zero-size resize notifications. Successful runs return to a visible map without requiring Reset.

## Verification

- `npm run check`: lint, 135 tests across 20 files, asset freshness, TypeScript, production build, and static prerender pass.
- All six downloadable notebooks executed through nteract. The four lessons and worked solution render real Natural Earth geography; the unfinished exercise completes its setup and explicitly asks the reader to finish the function without claiming to draw it. Saved executed copies are in `notebook-checks/final/`; downloadable notebooks remain clean.
- The canonical Mollweide solution was compared with pyproj 3.8.0 / PROJ 9.8.1 at 20,000 random points. Maximum coordinate difference was 1.44e-11 on a unit sphere. The independent fixture also tests the browser checker.
- All 30 flat-map presets, at both qualities, passed generated-asset parity checks: 245,760 visible vertices, maximum normalized error below 3e-8. Existing map asset filenames/content hashes are unchanged from `38875f7`.
- Browser inspection covered 320×740, 390×844, 476×1173, 768×1024, 844×390, and 1440×900. Checked attribution fit, full-width map framing, adaptive heights, one navigation row, native scrolling, conditional map pinning, light/dark dropdown colors, map expansion and Escape focus return.
- Checked the circle guide, existing lesson/activity selection, contextual notes, draft retention, challenge hint/reveal/replace controls, a valid challenge run and reference check, invalid-result preservation, Stop/recovery, the 10-second execution timeout, colophon direct reload, and browser Back/Forward. The colophon, environment file, and all six notebook downloads return HTTP 200 from the production preview.

## Performance boundaries

The opening page still uses one renderer and does not request Pyodide, CodeMirror, the challenge editor/checker, or Mollweide geometry. Baseline and candidate settled after two to three initial frames, with no continuing idle animation. Local diagnostics recorded zero long tasks; layout shift ranged from 0 to 0.00048 in the opening runs. Cached local runs are not a mobile network benchmark.

The compressed entry JavaScript grew from 100,360 to 102,410 bytes; compressed CSS grew from 8,426 to 8,848 bytes. The new challenge geometry is loaded only when selected. All individual assets remain below Cloudflare Pages' 25 MiB limit. The existing Three.js chunk-size advisory remains; it is lazy-loaded and unchanged.

These are desktop-browser viewport and local lab checks. Physical iOS/Android touch, software keyboards, mobile GPUs, and real cellular-network Core Web Vitals still need field testing after a preview deployment. Analytics remains disabled until the approved Heap and Transcend configuration is supplied.

## September 11 review follow-up

- Every regular map pane now uses its projection's aspect ratio at every breakpoint. Flat-map camera margins are consistently 2%; the generated preview framing follows the same fit. Phone and tablet maps reach the screen edges, and desktop maps fill their column. Mercator retains its wider polar crop; expansion still restores its complete extent.
- Large maps that cannot fit the viewport scroll naturally instead of pinning their controls below the screen. Compact mobile maps still pin only when enough reading space remains.
- Saved, unedited city examples are recognized against their original preset. Returning to a projection and selecting another city no longer produces a false draft-replacement prompt. Actual edits and unrecognized saved presets remain protected.
- Equal Earth's shared history now cites the UN General Assembly's September 4, 2026 recommendation of Equal Earth and other equal-area maps when relative size matters. The lesson, colophon, notebook generator, downloadable notebook, and executed validation copy use the same wording and primary UN source. Existing notebook code and executed figure outputs were preserved.
- `npm run check` passes: lint, 137 tests across 21 files, asset checks, TypeScript, build, and prerender. Two new draft regressions cover pristine city examples, real edits, and unknown presets.
- Browser checks covered 390×844, 771×1200, 844×390, 1280×900, and 1440×900. Inspected all four lesson projections and the globe, desktop column fit, mobile scrolling/pinning, Mercator expansion and Escape, Gall–Peters distortion circles, and a real AuthaGraph Python run returning to its full-width phone map. No horizontal page overflow or browser error/warning logs appeared in the review session. A separate localhost origin kept draft tests isolated from the user's existing drafts.
