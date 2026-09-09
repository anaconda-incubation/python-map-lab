# Publishing hardening

The publishing branch is `main`; the original project history is retained.

## Changes

- Removed unused starter dependencies; 19 direct runtime dependencies remain. Declared the directly imported CodeMirror language and Lezer packages explicitly.
- Removed development inspection instrumentation from Vite builds.
- Added Node version guidance, a combined `npm run check`, and GitHub Actions checks.
- Tidied editor, notebook exporter, Sources drawer, and build configuration formatting.
- Prevented repeated Run events from starting concurrent executions before React updates.
- Rejected truncated coordinate arrays and maps collapsed to a single axis, including nonzero constant coordinates. Failed runs retain the prior map.
- Made the closed Sources drawer inert so its links cannot receive keyboard focus.
- Added an unknown-route fallback and a JavaScript-disabled explanation.
- Moved the historical visual review page out of public assets and stopped tracking local notebook runtime locks.
- Replaced the unverified UN News link and outdated contextual citation with the verified African Union statement of September 4, 2026.
- Rewrote the README for independent installation and static HTTPS deployment.

## Verification

- Fresh `npm ci --offline` in an isolated directory: succeeded, 300 packages.
- Clean-install `npm run check`: lint passed, 108 tests across 14 files passed, production build passed.
- Production assets contain no development inspection markers. Review documents and runtime locks are not deployed.
- Browser on the clean production build: globe and lesson navigation, Python Mercator run, expand/collapse, experiment navigation, Sources open/close, and closed-drawer inert state checked.
- A constant-x Python experiment reports a clear error and preserves the prior map; Reset restores the recipe.

The build retains Vite's advisory about the roughly 511 kB Three.js vendor chunk. This is a size advisory, not a build failure. Python's first load still depends on the pinned Pyodide CDN. No remote repository or hosting deployment was configured during this pass.
