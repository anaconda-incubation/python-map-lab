# Cleanup comparison

Baseline: `python-first`, commit `46fc244`. Cleanup: separate `python-cleanup` worktree and branch. The baseline checkout and its port 4175 preview were not changed. Cleanup preview: http://127.0.0.1:4176/.

## Changes

- Removed 46 unreachable files from the retired essay and full lab screens, plus their unused CSS selectors. Reachability was traced from the application entry point and all tests, including raw imports and worker URLs. Existing redirect routes remain.
- Separated experiment recipes and the centered Python example from the experiment UI.
- Moved overview tradeoffs into lesson data and extracted the Equal Earth note and lesson story into reading components.
- Shared projection-button behavior between the picker and overview.
- Removed superseded CSS declarations and formatted the active page components, content, and styles consistently.
- Replaced the outdated README with current architecture and verification instructions.

The projection mathematics, renderer, worker, editor, globe controls, notebook generator, geographic assets, and executed nteract notebooks were preserved.

## Size

Counts include `.ts`, `.tsx`, `.css`, and `.py` files under `src`, including tests.

| Measure | Baseline | Cleanup |
|---|---:|---:|
| Source files | 107 | 65 |
| Source lines | 21,411 | 10,421 |
| Source bytes | 856,541 | 362,255 |
| Built CSS bytes | 91,453 | 65,116 |

Net source reduction: 10,990 lines (51%). Built CSS reduction: 29%. No runtime speed claim is inferred from these figures.

## Automated verification

- Baseline: all 104 tests across 13 files pass; lint passes.
- Cleanup: all 104 tests across 13 files pass; lint and production build pass.
- `node scripts/compare-baseline.mjs ../python-first` passes. It compares all four lesson definitions and stories, all six complete experiment recipes, all four full notebook exports (including embedded geography and Python cells), and the unchanged rendering/runtime sources.
- `git diff --check` passes.

The notebooks were not re-executed during this cleanup: generated notebook objects match the previously nteract-verified baseline exactly.

## Browser comparison

At 1280 × 720, both previews were exercised independently:

- Globe: identical visible content, element dimensions, and sampled computed styles.
- Mercator, Gall–Peters, Equal Earth, AuthaGraph: matching lesson layouts, code, and equations; all four successfully redraw from Python in both versions. Mercator had one 0.01px inline-text positioning difference after formatting.
- Slide and centered experiments: matching content/layout/styles and successful Python execution in both versions.
- Cleanup additionally executes flip, pinch, logarithm, and wave recipes successfully.
- Centered experiment: 19,000 km ring renders and prints its distance; 19,001 km raises the existing validation error. Reset restores the recipe.
- Switching from experiments back to lessons preserves the previously executed AuthaGraph result and the enabled custom-notebook download.
- Sources drawer opens and closes in both versions, with matching content. Motion toggle works in the cleanup.
- Sticky map and editor presentation inspected visually after running the centered experiment.

Separate headless Chrome profiles produced byte-identical narrow screenshots (`review/original-narrow.png` and `review/cleanup-narrow.png`). These are initial-view comparisons, not a full mobile interaction test; the captures retain the baseline’s horizontal clipping at that narrow size.

These checks found no functionality regression in the exercised flows. They do not establish exhaustive equivalence across every browser, viewport, or arbitrary user-written Python program.
