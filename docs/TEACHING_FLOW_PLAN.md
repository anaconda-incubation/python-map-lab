# Teaching flow and organization: integration plan

September 11, 2026. Proposed work against `mobile-redesign` at `38875f7`.

This is a plan, not an implementation. The current app was reviewed in the browser at 390×844 and 1440×900, alongside its navigation, lessons, experiment recipes, notebook export paths, and Sources drawer. The local preview was restarted at http://127.0.0.1:4177/. Existing notebook output changes in the worktree were left untouched.

## Review findings

| Feedback | Current candidate | Proposed response |
| --- | --- | --- |
| Remove two levels of navigation | Learn/Experiment and a context-dependent selector remain two decisions, even though they now share one compact row. | One sequence of six destinations; desktop tabs and one mobile selector. |
| Make Globe an introduction | The duplicate projection cards have already been removed. The introduction explains flattening but does not directly teach the circles. | Rename this destination Start here and give it a short interactive reading guide. |
| Explain the purpose before the mathematics | Mapmaker objectives and history exist, but appear inside a disclosure below Edit Python. | Promote the purpose and tradeoff into the visible lesson before code. |
| Keep logarithm guidance local | Already implemented for Try a logarithm only. | Preserve it and make the experiment's own prompt more specific. |
| Add an unsolved challenge | All six current experiments supply working examples. | Add one Mollweide challenge inside Try your own, with progressive hints and an optional solution. |
| Add a colophon | A brief technology-credit paragraph exists at the bottom of Sources. | Add a discoverable How this was built page with an honest explanation and useful next steps. |

## 1. One navigation sequence

Use these six destinations, in order:

**Start here · Mercator · Gall–Peters · Equal Earth · AuthaGraph · Try your own**

On desktop, show one line of directly selectable tabs. On phones and widths where the labels would wrap, show one full-width selector containing the same six choices. Remove the Learn/Experiment switch. Keep Next/Previous as a consistent alternative, with AuthaGraph leading to Try your own. Do not show both desktop tabs and the equivalent selector simultaneously.

Preserve the pinned mobile chooser, adaptive map height, conditional map pinning, full-width phone map, native scrolling, expansion, and theme choices. Map/Python remains a workspace control that appears after opening the editor; it does not become a second course-navigation row.

Within Try your own, use one labeled activity selector for the existing six recipes and the new challenge. This is a control for that workspace, not another global row of tabs. Keep the user's current activity when returning to Try your own.

**Acceptance:** Every lesson and activity remains reachable. Existing `mode`, `map`, `place`, and supported hash links continue to resolve; shared links and browser Back/Forward work. Navigation never overwrites a draft. All six primary destinations are represented equally on mobile and desktop.

## 2. Make Start here teach how to read the visualization

Keep the globe as the visual opening. Use one short human question: how does the map we choose change the world we see? Explain that navigation, comparing countries, and presenting the whole world call for different compromises. Keep the longer topical source/context below the introductory reading so it does not displace the map.

Add a short guided interaction using the existing renderer:

1. **Show the circles.** Explain that they represent the same small circles on the Earth's surface.
2. **Flatten to Mercator.** Preserve the circles during the existing animated transition, unless reduced motion is selected.
3. **Read the change.** Larger circles reveal area enlargement; stretched circles reveal changes in local shape and angles. Move on to Gall–Peters to see that equal areas can coexist with stretched shapes.

Use a small, accessible SVG diagram of an unchanged circle, a larger circle, and a stretched ellipse to support the explanation. Do not add another live map or rendering engine. Name Tissot's indicatrix only in optional further reading.

Explicitly distinguish projection distortion from the perspective of viewing a globe: circles near the globe's rim can look flattened on the screen even though the surface itself is unchanged. Avoid implying that every circle should look identical in a camera image of the globe.

The introduction controls the circles only after the reader chooses the demonstration. Returning to Start here should not silently undo a person's map-options choices. Provide a clear way to restart the short demonstration.

**Acceptance:** A new reader can explain the circles and make one comparison without opening Python. The introductory action, Map options selector, and selected projection remain synchronized. The opening page does not load Python, an editor, or a second renderer.

## 3. Put the human purpose before code and equations

Use a consistent lesson sequence while retaining the map's visual prominence:

**The problem → the mapmaker's choice → the tradeoff → observe/predict → try a change → Python and mathematics.**

Each lesson gets a short visible purpose paragraph with its mapmaker/date where appropriate. Reuse the existing sourced material rather than duplicating competing versions of it. Bring the relevant parts of the objectives/history out of the lower disclosure. Keep deeper history and derivation expandable.

| Lesson | Opening emphasis |
| --- | --- |
| Mercator | Navigators needed a useful way to plot constant compass bearings. What happens when this map is used to compare country sizes? |
| Gall–Peters | Compare countries by their relative areas. What is the cost in shape? |
| Equal Earth | Preserve relative areas while giving readers a familiar, rounded world outline. |
| AuthaGraph | Arrange the world through a different geometric construction and explore where the cuts fall. Preserve the explanation that this site's formulation is not exactly equal-area. |

Retain the present centering explanations, geographic conventions, author credits, and caveats. Describe maps in terms of the jobs they serve; avoid implying one map is universally correct or assigning unsupported motives to its makers.

Move the Python invitation after the visible purpose and observation prompt. Keep the equations optional and put the intuitive explanation before them. Mirror this order in the four downloadable lesson notebooks: purpose, observation, experiment, implementation, deeper mathematics.

**Acceptance:** A reader sees why the projection exists and what it sacrifices before reaching code, on both desktop and mobile. Historical content has one source in the content model. Existing code, formulas, notebook behavior, and author attribution remain intact.

## 4. Make Try your own a clear progression

Retain all six existing recipes. Introduce the workspace with a short invitation to predict a result, change one operation, and run it. Give each recipe a question tied to what it does instead of using the same generic prediction everywhere.

Keep the logarithm explanation entirely within Try a logarithm. Explain its positive-input requirement next to that example; retain the distinction between a finite alternative and an equivalent formula. Do not restore a global warning above other activities. Leave the 19,000km ring boundary and uncomment shortcut on Center on a place.

Use the shared active map, options panel, lazy editor, source-preserving selection behavior, and run/stop controls. A challenge is another activity in this workspace, not another top-level tab.

**Acceptance:** A reader can move from a supplied example to an independent challenge without losing edits. Recipe-specific notes appear only where relevant. No eager Python load is introduced.

## 5. Add one optional Mollweide challenge

Recommend **Mollweide** first. Its equal-area, elliptical world map provides a clear visual goal that connects to Gall–Peters and Equal Earth. It also introduces a numerical solution step, so label it as a challenge. Cassini is a useful later exercise, but its best use near a central meridian makes it less direct for this first whole-world task. See the primary references below.

The initial activity should include:

- A plain-language goal and a clearly labeled target preview, distinct from the learner's output.
- A scaffold with imports, longitude handling, the `project(lon, lat)` interface, array conventions, and explicit TODOs for the learner's work.
- No completed implementation in the default editor. Running an incomplete scaffold produces a helpful unfinished-step message, not a falsely successful map or an intimidating unhandled traceback.
- Separate actions to run the result, check it, request the next hint, and reveal a worked solution.

Hints should progress from the desired geometry to the auxiliary-angle relationship, numerical approach, and edge cases. Keep the worked solution separate from the learner's draft. Revealing it does not overwrite or run their code; explicitly replacing the draft uses the existing confirmation flow.

Provide encouraging, specific checks against an independent spherical reference: finite output, equator/pole behavior, symmetry, expected bounds, and sampled coordinate agreement. Check area behavior away from singular points and cuts. Describe these as checks rather than proof of correctness. Preserve the last valid user map after errors and retain Stop and timeout behavior.

Generate the target preview ahead of time using the canonical solution. Load its assets only when the challenge is selected. Keep target and user-result labels truthful: a completed reference preview is not output from the incomplete scaffold. Add a separate exercise notebook with the same scaffold and hints; offer the worked solution as a separate opt-in notebook rather than relying on collapsed code cells to conceal it.

**Acceptance:** The challenge initially contains no visible solution. Each hint/reveal is deliberate. Valid NumPy solutions render and pass the reference checks; common sign, pole, convergence, and array-shape mistakes produce useful feedback. The scaffold and solution notebooks are verified through nteract.

## 6. Make How this was built discoverable

Add an explicit **How this was built** footer link and a link near the Python invitation. Open a normal, shareable page with a return-to-map link that retains lesson context. Keep academic references in Sources; link from the existing brief credits to the fuller explanation.

Explain the implementation in this order:

1. **The experiment is real.** NumPy transforms coordinates in Python; Pyodide runs that Python in the browser. The interface and drawing use React and Three.js. Avoid suggesting that Python itself draws the WebGL scene.
2. **Why it opens quickly.** Default examples are computed in advance with the same canonical Python. Editing runs Python on demand. There is no separate server executing the user's Python.
3. **How to continue.** Download the notebooks, inspect the BSD-3-Clause source, and reproduce the experiments in an Anaconda-managed environment. Link to verified setup instructions and add an environment file if one is needed for a reproducible path.
4. **How AI can help.** Describe AI-assisted explanation, prototyping, and debugging with a concrete learning prompt. Encourage testing the mathematical properties and inspecting the rendering. Do not promise that generated mathematics is correct, and do not add a chatbot, account requirement, or API-key flow.
5. **Credits.** Give Anaconda clear attribution alongside the projection authors, open-source libraries, geographic data, design/type, and license information.

Keep the page concise and practical, with direct actions to download a notebook, view the source, and explore Anaconda. Verify product links and describe the capabilities actually used by this project.

**Acceptance:** How this was built can be found without opening the Sources drawer or an editor. It accurately distinguishes Python computation, JavaScript rendering, precomputed examples, and local execution. Its links work on the static host and survive a direct reload.

## Implementation order and verification

1. **Navigation and lesson order.** Update `PythonFirst.tsx`, `workspaceState.ts`, the shared lesson content, and responsive styles. Preserve existing route aliases and draft keys. Review a complete Start here → projection → Try your own journey.
2. **Circle introduction and contextual recipe prompts.** Reuse the existing distortion state and morphs. Verify the guide with motion on/off and every map-options mode.
3. **Colophon and notebook narrative.** Add the static route, discoverable links, credits, reproducible setup, and matching notebook introductions.
4. **Challenge.** Add the scaffold, progressive hints, reference checks, separate solution, target assets, and notebook exports. This is the largest new functional part and gets its own validation checkpoint.
5. **Regression review.** Check 320/390/476px phones, tablet, short landscape, and desktop; both themes; keyboard/focus behavior; pinned controls/map; expansion; deep links; history; draft persistence; failed runs; downloads; and all six existing recipes.
6. **Performance and mathematical checks.** Compare startup requests and initial-frame behavior against `38875f7`, including confirmation of no initial Python/editor/challenge downloads. Maintain one renderer and unchanged existing projection math. Run appropriate tests and production build; rerun changed notebook exports and the challenge via nteract. Physical touch and mobile-browser testing remain distinct from desktop viewport checks.

All implementation stays in the redesign worktree for review. This plan does not merge or deploy the candidate. No unrequested analytics activation or external messaging is included.

## Primary references for the challenge decision

- [Esri: Mollweide](https://doc.esri.com/en/arcgis-pro/latest/help/mapping/properties/mollweide.html): equal-area world projection with an elliptical 2:1 outline and the associated tradeoffs.
- [PROJ: Mollweide](https://proj.org/en/stable/operations/projections/moll.html): spherical global projection and supported parameters.
- [PROJ implementation](https://github.com/OSGeo/PROJ/blob/master/src/projections/moll.cpp): iterative auxiliary-angle computation and pole handling. Pin a release or commit when implementing reference checks.
- [PROJ: Cassini](https://proj.org/en/stable/operations/projections/cass.html): mathematical definition and guidance about use near the central meridian.
