# Maps with Python: mobile experience and performance redesign

Review date: September 10, 2026. Status: implemented in the `mobile-redesign` worktree and validated locally. See [the completion matrix and comparison report](docs/MOBILE_REDESIGN_REVIEW.md) for measured results, intentional design decisions, and device checks that require physical hardware.

Working branch: `mobile-redesign`, starting at `504362d`, in the adjacent `mobile-redesign` worktree. The existing `app` checkout remains on `main`. Compare the finished candidate with this exact starting commit, not an older cleanup branch.

## Recommendation

Make the map the first thing people can use. Follow it with one question, one experiment, and one explanation. Let people open the Python when they want to understand or change the mechanism.

The visual direction is an editorial atlas: generous map space, quiet typography, precise diagrams, restrained Anaconda green, and both a warm light theme and a carefully matched dark theme. The phone experience should feel intentionally designed for reading and experimenting with a thumb. The desktop experience should retain room for serious work with the map and code together.

Precompute the default maps from the same Python used in the lessons. Deliver those results as small, versioned assets, then load the Python runtime only when requested. Real execution remains the authority for edited code.

## Review evidence and limits

I inspected the production site in the browser at 320×740, 360×800, 390×844, 430×932, 768×1024, 844×390, and 1440×900. I used the lesson and experiment navigation, executed Mercator and the centered projection, inspected expansion, and changed the motion setting. I also read the 13-page supplied PDF, reviewed the source, and opened all three suggested reference sites.

These were responsive viewports in a desktop browser. They were not physical iPhone/Android tests, CPU/network-throttled benchmarks, or a Lighthouse audit. The available browser interface did not expose a performance trace. Touch gestures, the software keyboard, device memory, and mobile Safari still require direct validation. No field Core Web Vitals result is claimed here.

The PDF describes an architecture-led review and explicitly limits its hands-on validation. Its recommendations are useful hypotheses, not 42 verified defects. The plan below separates reproduced behavior from source findings and proposed improvements.

### Measured layout

Positions are approximate CSS pixels from the top of the document in the initial Learn layout. They describe where the map sits, not how long it takes to load.

| Viewport | First map canvas begins | Canvas dimensions | Projection menu height |
| --- | ---: | ---: | ---: |
| 320×740 | 1,220px | 278×300px | 239px |
| 360×800 | 1,183px | 318×300px | 226px |
| 390×844 | 1,073px | 348×300px | 226px |
| 430×932 | 1,031px | 388×300px | 226px |
| 768×1024 | 901px | 705×360px | 164px |
| 844×390 | 806px | 774×360px | 149px |
| 1440×900 | 638px | 669×358px | 98px |

### Reproduced problems

- A new phone visitor sees introduction and navigation before seeing any map. At 390px, the first canvas starts below the entire 844px viewport.
- Selecting a lesson from its overview description can leave the changed map above the viewport. The editor and result are separated by a long scroll.
- At 390px, expanding the globe reduced the visible canvas from 300px to 248px high because controls and the quote consume its fixed-height container.
- The experiment choices occupy approximately 1,206px inside a 358px scrolling strip. The centered experiment is several screen widths away from the first option.
- The narrow header crowds the Anaconda logo against Sources. Code requires substantial horizontal scrolling, and Run wraps onto two lines.
- The live UI reported 3,730ms for a Mercator execution and 12,119ms for the centered experiment. These single warm-session desktop-browser runs include the UI's result application path; they do not isolate Python time and are not phone benchmarks.
- Switching experiment recipes leaves the previous map visible until Run. That is explained in status text, but the visual association can still be misleading.
- Light mode is not exposed. The motion toggle also changes scrolling behavior because smooth scrolling is coupled to reduced motion.
- At the inspected widths the document itself did not overflow horizontally. The editor and recipe strip have their own horizontal overflow.

### Confirmed source findings

- `PythonFirst` warms Python at mount, before a visitor chooses to use it.
- Learn and Experiments remain mounted while hidden; each owns a map stage. Two canvases were present in the browser.
- CodeMirror and lesson UI are eagerly imported. Separate vendor chunks do not by themselves defer execution of static imports.
- The renderer fetches the 50m Natural Earth land/lakes/coastline files and constructs master geometry at runtime. The raw files total roughly 4MB; existing 110m equivalents total roughly 312KB. These are local uncompressed sizes, not measured network transfer sizes.
- The globe JPEG is roughly 2.2MB locally. Texture and font requests need an actual request-level audit before assigning savings.
- The exact sample layout for edited Python is itself assembled through a geometry bake and string-keyed coordinate collection. Precomputing only the default final image would leave this first-Run work in place.
- The globe uses `touch-action: none`. Its effect on physical phone scrolling must be tested, but the gesture ownership is explicitly configured in code.
- The page uses Lenis plus a GSAP ticker to modify ordinary scrolling.
- Python has a timeout/restart mechanism, but the editor does not expose a Stop control. Its displayed run duration includes more than the worker computation.

### Existing work to retain

The renderer already draws on demand, uses an intersection observer, caps pixel density, interpolates projection positions on the GPU, disposes resources, and cooperatively yields during much of baking. There is already one shared Python worker, and output coordinate buffers are transferred. The map engine also already has a paper color palette. These are foundations to extend, not optimizations to claim as newly introduced.

## Point-by-point implementation plan

### A. Put the map and the learning task first

**1. Rebuild the opening viewport around the map.**

Use a compact header, a short title and question, and a full-width map inside small phone gutters. Move the news/context banner and longer introduction into the reading flow. Keep the Python identity and Anaconda credit visible without requiring a long introduction. Target a map beginning within roughly 180–220px of the top at 390×844 and occupying around 40–50% of the viewport where height permits. Large text and short landscape screens take precedence over a fixed pixel target.

Acceptance: at 360–430px portrait, a new visitor can see a meaningful map, the current question, and the first action without scrolling through menus.

**2. Replace the two large navigation bands with compact controls.**

Use a small Learn / Experiments switch and a current-projection selector. Show the current step and Previous / Next alongside it. Keep direct access to every projection. On wide screens, a compact single-row projection list can remain. On phones, use a properly labeled selector or sheet rather than squeezing five large tiles into the page.

Acceptance: navigation no longer consumes several hundred pixels; all lessons remain reachable by keyboard and touch without traversing the story.

**3. Give each lesson a consistent learning sequence.**

Organize it as question → prediction → map interaction → short explanation → optional mathematics and Python. Examples include Greenland's apparent size for Mercator and comparing relative areas for equal-area maps. Preserve all historical attribution, sources, equations, and deeper explanations inside clearly named sections.

Acceptance: each lesson has one obvious starting action and an explicit next step; no educational material disappears as a side effect of tidying.

**4. Use a restrained story-map layout.**

Let ordinary scrolling reveal short explanatory sections. On desktop, keep the map beside the active reading section. On tall phones, test a bounded sticky map within the short demonstration section only; release it before long reading and code. On short landscape screens, use normal document flow. Advance projections with explicit controls rather than making ordinary scrolling run Python or silently replace a user's experiment.

Acceptance: scrolling remains predictable, the map does not permanently consume a phone's reading area, and the user can jump into or out of a lesson.

**5. Give desktop maps more room too.**

Increase the map's share of the working area to approximately 60–65%, with readable prose constrained to a comfortable line length. Keep an explicit full-width mode with the explanation and editor underneath. Avoid turning all text into full-viewport-width paragraphs.

Acceptance: at 1440px, map comparison is visibly easier while code and explanation remain usable beside it.

**6. Redesign mobile expansion as a real focus view.**

Allocate most of the available viewport to the canvas, keep the exit in the upper-right corner, and move secondary controls into a compact tray. Use dynamic viewport units and safe-area padding. Restore scroll position, focus, projection, and edits on exit. Do not rely on the browser Fullscreen API for the core experience.

Acceptance: Expand makes the actual canvas larger at 320–430px and in landscape; Exit remains reachable after rotation and browser-toolbar changes.

**7. Make page scrolling the default touch gesture.**

Use a visible Explore map control to opt into drag/zoom interaction. While reading, a vertical swipe over the map should continue down the page. While exploring, provide clear Done/Reset controls and retain keyboard rotation. Test gesture handoff on actual iOS and Android devices.

Acceptance: visitors can scroll past the globe with one finger and cannot become trapped in the map.

**8. Reduce always-visible map controls.**

Keep the primary action and a labeled Layers control near the map. Move geography, grid, distortion circles, area, and shape options into a compact panel. Introduce distortion overlays when the lesson explains them, while preserving manual access. Give interactive targets at least 44×44px and selected states that do not depend on color alone.

Acceptance: all existing layers still work; the phone map is not followed by three rows of controls before the explanation begins.

**9. Make labels quieter and more understandable.**

Retain projection-aware placement and collision avoidance. Establish a predictable priority for core geographic labels, allow a Labels switch, and introduce extra labels as space permits. Keep decorative label elements out of redundant screen-reader output and provide a concise textual map summary. Do not force every label to appear on a small map.

Acceptance: labels do not dominate the globe, overlap controls, or imply that missing labels represent missing geography.

### B. Improve reading, appearance, and interaction

**10. Add System / Light / Dark appearance.**

Follow the operating system for first-time visitors and remember an explicit choice. Finish the existing paper palette with warm off-white backgrounds, dark ink, restrained green accents, and coordinated ocean/land colors. Theme map labels, overlays, editor, equations, focus states, and dialogs together. Respect the preference before the first painted frame.

Acceptance: both themes are visually reviewed and meet appropriate text/control contrast; there is no dark-to-light startup flash.

**11. Simplify typography and spacing.**

Retain the editorial serif character, use a clear UI face, and reserve monospace for code. Shorten introductory copy, reduce decorative all-caps labels, fix the header's logo sizing, and establish consistent spacing. Preserve the actual Anaconda artwork and the small copyright footer. Do not shrink equations or touch controls to make an overcrowded layout fit.

Acceptance: no logo collision at 320px; comfortable reading at 200% zoom; no page-level horizontal overflow.

**12. Restore native scrolling.**

Remove Lenis from the page and remove scroll-only ticker/ScrollTrigger plumbing where no longer used. Retain projection transitions separately. Honor reduced motion for map morphs and optional UI animation. Anchor navigation must land below the compact header and manage focus sensibly.

Acceptance: wheel, trackpad, touch, keyboard, and browser history scrolling behave normally, regardless of the animation setting.

**13. Replace the experiment ribbon on phones.**

Show a concise recipe name, its complete selected equation, and a chooser containing all six experiments. Keep equations unbroken; use intentional horizontal code scrolling where needed instead of unreadably small fonts. Show the logarithm warning in the logarithm recipe, not as a mandatory introduction to every experiment.

Acceptance: Center on a place is as discoverable as Flip the world; no option depends on noticing a three-screen-wide ribbon.

**14. Offer easy preset changes without hiding the Python.**

Provide a small number of meaningful preset buttons for supported lesson parameters, such as central meridians and a few named centers. Associate every preset with its exact Python source. If code has been edited, preserve the draft and make replacement explicit. Cached presets can update immediately; arbitrary source changes require Run.

Acceptance: displayed parameters, code, map, and result status always agree. The distinction between a central meridian and a fully centered place remains accurate.

**15. Make the phone editor an intentional workspace.**

Open the editor with a clear Edit Python action. Provide a compact Run / Stop / Reset toolbar and a Back to map control. Keep code horizontal scrolling confined to the editor. Treat the software keyboard as a viewport change; release sticky page elements and keep Run reachable. Preserve desktop keyboard shortcuts and the existing uncomment hint.

Acceptance: an actual phone user can open code, make an edit, run it, inspect the result, and return without losing the cursor or covering controls with the keyboard.

**16. Put the result close to the action.**

In phone editing mode, provide an explicit result view or Map / Code switch in the same workspace. After a touch-triggered Run, reveal the result predictably; keyboard runs should not steal editor focus. Keep the last valid map when execution fails. Distinguish Example preview, Edited—not run, Running, and Your Python result.

Acceptance: the visitor can tell which code produced the visible map and does not need to search several screens upward for the outcome.

**17. Preserve drafts and navigation context.**

Store a separate draft for each lesson and recipe, restore it when switching back, and distinguish Reset code from Reset view. Add shareable URLs for known lessons and safe preset parameters, and support Back/Forward. Do not execute code from a shared URL automatically. Keep drafts local and out of analytics.

Acceptance: switching lessons, expanding, changing appearance, and returning from a result do not erase work.

### C. Make the first map inexpensive

**18. Separate reading, exploration, and Python loading.**

Render the page shell and a genuine map preview immediately. Load the active interactive map next. Dynamically import CodeMirror, the Python client/runtime, and optional notebook/equation work at their point of use. Remove unconditional mount warmup and hidden-panel warmup. Opening Edit Python can begin preparing the runtime while the user reads or edits; basic lesson selection should not require it.

Acceptance: a cold reader visit requests no Pyodide/NumPy runtime and no CodeMirror bundle before an explicit Python action. A meaningful map is visible during interactive initialization.

**19. Keep one active map stage.**

Share the map workspace across Learn and Experiments, or fully unmount the inactive stage while preserving lightweight state. Avoid hidden canvases, duplicate globe textures, and hidden editor construction. Keep the existing shared worker architecture.

Acceptance: one live WebGL renderer in the standard phone experience; repeated mode changes do not grow the renderer/resource count.

**20. Generate default projection assets at build time.**

Use the canonical lesson/recipe Python and its helper code to generate default positions for the actual renderer. Include required topology, map boundaries, graticules, distortion data, and label anchors. Produce a small preview image or SVG from the same projection, so a real map can appear before WebGL. Give each artifact a source/data/schema fingerprint and load only the active preset; cautiously prefetch the next small lesson asset after useful content appears.

Acceptance: default lessons and recipe previews do not run Python or reconstruct their full projected geometry at startup. Automated parity checks compare the generated assets with live execution, including clipping and non-finite masks.

**21. Precompute the exact sampling layout used for edited Python.**

Move the invariant sample/probe collection out of the visitor's first Run. Store compact coordinate arrays and stable sample indices alongside the geometry version. Retain the finite-difference probes used to detect cuts; do not substitute approximate interpolation for arbitrary Python. Remove per-point string lookup work where a stable index can be passed through the renderer, after measuring that path.

Acceptance: the first custom Run avoids the sample-discovery bake, and custom discontinuities still produce clean cuts rather than connecting unrelated edges.

**22. Introduce measured geometry quality levels.**

Start the phone overview with the existing 110m Natural Earth data, then compare its fidelity against 50m before adopting it. Use a higher-detail option for larger/expanded maps. Generate complete compatible geometry/sample sets per level. Change level at a settled boundary rather than mixing incompatible vertex arrays mid-morph.

Acceptance: lower detail preserves recognizability, lakes, small regions important to the lesson, dateline cuts, and Antarctica. Performance and asset savings are recorded; detail is not reduced solely because a device is called mobile.

**23. Version caches correctly.**

Include geometry quality, sampling schema, source version, parameters, and projection identity in relevant cache keys. The current ID-only bake cache is not sufficient for multiple quality levels. Bound custom-result and high-detail caches, coalesce duplicate work, and fingerprint static assets for long-lived Cloudflare caching.

Acceptance: no stale map after a deployment or parameter/quality change; repeated switches reuse compatible data without unbounded retention.

**24. Reduce texture and typography costs.**

Create a smaller globe texture for phone overview use and retain higher detail for larger canvases if it is visually useful. Audit actual font usage and keep only needed subsets and weights. Measure compressed network transfers rather than counting every file in the build output as a downloaded asset. Avoid preloading optional editor and mathematics fonts.

Acceptance: before/after request lists show smaller cold-start transfer; globe appearance remains recognizable and text remains stable while fonts load.

**25. Preserve and tune the existing animated transitions.**

Keep GPU interpolation, cooperative processing, and demand-driven frames. Match cached endpoints to the same topology and normalization. Retain special handling for AuthaGraph cuts and topology changes. Coalesce rapid selections to the most recent target; reduced-motion users get an immediate settled result. Profile pixel count and antialiasing before adding an adaptive quality controller.

Acceptance: the requested animated projection transitions remain; there are no seam-spanning artifacts, stale targets, or unnecessary idle frames.

### D. Make execution and failure understandable

**26. Expose honest execution stages and Stop.**

Separate preparing/downloading Python, loading NumPy, running the function, preparing geometry, and presenting the result. Keep detailed durations available without fake percentages. Wire Stop to worker termination where necessary, reject the canceled job, and restart lazily on the next Run. Use the existing timeout protections, extended to all relevant preparation steps.

Acceptance: visitors can stop an infinite loop, retry a failed runtime download, and retain both their code and last valid map.

**27. Make asynchronous results safe to apply.**

Track a job ID and worker generation across initialization, execution, geometry preparation, and animation. Only the latest applicable result may update the active lesson. Resolve cancellation promises cleanly. Audit rapid lesson changes, Stop followed by Run, and unmount during a bake. Preserve transferred output arrays; only optimize input copies if profiling shows a material cost and ownership remains safe.

Acceptance: old results never overwrite a newer selection or appear in another lesson; the UI cannot remain permanently busy after cancellation.

**28. Recover from rendering and connection failures.**

Add visible retry/fallback states for geography fetch failure, WebGL initialization failure, and context loss. Use the precomputed map image and readable lesson content when interaction is unavailable. Pause relevant work when the document is hidden and resume safely. Keep cleanup explicit and test repeated mount/unmount and orientation changes.

Acceptance: a failed renderer or CDN request leaves a usable teaching page, not an empty rectangle or an endless loading state.

**29. Keep accessibility part of the core interaction.**

Provide logical heading order, skip links, clear focus outlines, meaningful map descriptions, keyboard operation, labeled controls, and restrained status announcements. Ensure expanded views and sheets return focus correctly. Test zoom, reduced motion, light/dark themes, screen-reader reading order, and color-independent distortion legends.

Acceptance: a learner can navigate and understand the lesson without manipulating the canvas or relying on color alone.

**30. Keep notebooks aligned with the visible lesson.**

Preserve exports containing the chosen lesson, actual edited/executed source as appropriate, helpers, real geography, dependency setup, explanations, and plotting. Update any comments or parameters changed by the redesign. Rerun every exported notebook through nteract as already authorized, including dependencies and saved map outputs. Retain the 19,000km ring limit and the latitude/longitude teaching distinctions.

Acceptance: all four lesson notebook exports execute and produce their expected maps; notebook math and initial browser previews agree. Add recipe export coverage if that feature is introduced, without presenting it as an existing capability.

**31. Tidy code around the new boundaries.**

Separate lesson content/presets, workspace state, runtime execution, rendering, and responsive presentation. Consolidate repeated map/editor controls, remove dead scroll dependencies only after checking usage, and replace misleading comments about lazy loading. Prefer small components with direct ownership to a new generalized framework. Keep Python/helper/source generation in one authoritative pipeline.

Acceptance: the result is easier to follow, with fewer duplicate states and side effects, and passes existing checks plus focused behavioral regressions.

### E. Prove the candidate is better

**32. Add development-only phase measurements.**

Measure page shell, first visible map, interactive map readiness, data fetch/decode, geometry preparation, runtime initialization, Python execution, result preparation, and result presentation separately. Record renderer counts and settled frame behavior. Keep diagnostics local by default. Use matched production builds and record the cache/network/device conditions for every comparison.

Acceptance: a slow result can be attributed to a specific phase; a fast placeholder cannot conceal a slow interactive map.

**33. Define budgets and test under constrained conditions.**

Use LCP ≤2.5s, INP ≤200ms, and CLS ≤0.1 as field goals at the 75th percentile, consistent with Google's Web Vitals guidance. Lab checks are evidence toward those goals, not field certification. Separately require zero initial Python/editor requests for readers, one active phone renderer, an immediately visible initial map, and no continuous settled rendering. Aim for smooth transitions; agree on a stable lower-frame-rate fallback only after measuring representative hardware.

Acceptance: report cold and warm results separately, include repeated runs rather than a best-case sample, and compare both branches on the same host and test setup. Set numeric per-phase and byte budgets after collecting the missing baseline trace.

**34. Use a complete functional and visual comparison matrix.**

Compare Globe, all four lessons, all six experiments, layers, labels, expansion, motion, themes, edited code, meridians, centered maps, invalid inputs, ring limits, downloads, and navigation/draft persistence. Exercise small portrait, large portrait, tablet, landscape, and desktop. Cover physical iPhone Safari and Android Chrome, keyboard use, slow/failing connections, hidden-tab return, context loss, and repeated switching. Run the established check suite and focused new tests; update the old byte-equality comparison script to compare relevant behavior where intentional refactoring makes text equality inappropriate.

Acceptance: a written before/after matrix identifies preserved behavior, intentional changes, measured gains, and any unresolved device limitations. Screenshots use the same projection, center, layers, settled animation, and viewport.

**35. Preserve analytics boundaries and stage the release.**

Keep the existing consent-gated Heap integration disabled until the approved IDs and Transcend configuration arrive. Update named UI events to match the redesign without collecting code, coordinates, or free-form content. Build the candidate in its worktree and show it at a separate local or Cloudflare preview address. Keep production and `main` on the current site during comparison; merge and publish the chosen candidate as a separate release step.

Acceptance: no tracking is enabled by this performance work, and the current production version remains available for an honest comparison and rollback.

## Implementation order and review checkpoints

1. **Baseline and page structure:** preserve the exact starting revision, record phase/request measurements, implement the compact shell, native scrolling, appearance, map sizing, and lesson navigation. Review phone and desktop screenshots before deeper runtime work.
2. **Immediate map delivery:** build the canonical asset/sample generator, add versioned preview assets, remove eager Python/editor work, and use one active map stage. Demonstrate a cold visit that shows a map without Python.
3. **Teaching and editing flow:** finish the guided lesson sections, experiment chooser, preset/source agreement, mobile editor/result navigation, and draft preservation. Review a complete phone journey from arrival to first successful edit.
4. **Reliability and cost:** finish Stop/cancellation, quality/cache handling, context recovery, texture/font tuning, and lifecycle checks. Optimize remaining hotspots only where the measurements justify it.
5. **Parity and release comparison:** execute notebook checks, run mathematical/functional/visual tests, compare repeated performance measurements, and present the candidate next to the starting site. Record outstanding real-device validation separately from completed checks.

Each checkpoint should produce a working, reviewable candidate. Avoid combining a framework migration, a new renderer, and the UX redesign in the same change.

## Reference interpretation

- [Hospital Accessibility in Germany](https://emsde.thath.net/) gives the map the main stage and keeps controls spatially associated with it. Its inspected narrow layout crowds the controls into the map area, so it is a desktop hierarchy reference rather than a phone template.
- [Kiel walkability study](https://altmo.thath.net/case-studies/planning-auto-reduction-with-walkability-measurements-in-kiel) separates narrative steps and provides a persistent map section. Borrow that explanatory structure while using much wider text and map space on phones than its inspected layout.
- [Esri's Living in the Age of Humans](https://storymaps.arcgis.com/collections/cf8b6867ad954a6e9ed400ca9e9206ea?item=3) demonstrates clear chapter progression and staged explanation. Borrow the pacing and compact mobile progression, with substantially less opening chrome for this shorter interactive tool.
- The supplied `maps-with-python-review.pdf` informed the architecture and validation checklist. Existing optimizations were checked against source before being included as proposed work.
- [Google Web Vitals guidance](https://web.dev/articles/vitals) supplies the field thresholds in point 33. These thresholds have not yet been measured for this site.

## What completion means

A new phone visitor sees a useful map immediately, understands one clear next step, and can complete the first lesson without loading Python. A visitor who opens Python can edit, run, stop, inspect the result, and export their work without losing context. Desktop retains rich maps, real code, and animated projection comparisons. The candidate includes measured improvements and mathematical/notebook parity evidence, not just smaller bundles or a nicer screenshot.
