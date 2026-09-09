# Editable central meridians

Nine Python examples expose `central_meridian` in degrees. Positive values
are east; negative values are west. Comments suggest Greenwich (0), New York
(-74), Tokyo (140), and Mumbai (73). The centered experiment also retains its
editable latitude and optional distance ring.

AuthaGraph instead exposes `center_lat` and `center_lon`: a selected point,
not a longitude line. A rigid sphere rotation maps that point to the inverse
of the fixed rectangle's origin and aligns its local north direction upward.
The anchor and bearing are derived and checked in the test notebook. This
moves the cuts and does not preserve distances from the selected point.

Longitude is wrapped relative to the chosen meridian before applying each
projection. Python now evaluates the renderer's exact sample coordinates,
including derivative probes, instead of interpolating across a regular grid.
This preserves the discontinuity where the shifted map is cut.

## Validation

- 106 unit tests passed; lint and production build passed.
- `notebook-checks/central-meridians.ipynb` ran 63 numerical cases in nteract:
  nine examples at 0, -74, 140, 73, 180, -180, and 500 degrees. Each was checked
  against the equivalent wrapped longitude input at zero central meridian.
- AuthaGraph separately verified that Greenwich, New York, Tokyo, Mumbai,
  and both poles project to (0, 0), within 1e-12. Local north projects upward
  at all four cities. Its four coastline plots now use these city centers.
- The revised AuthaGraph download's code and description were copied from
  the actual notebook generator into the saved notebook, then all five code
  cells reran successfully in nteract. Tokyo and New York were also checked
  through the browser's Pyodide/Three.js renderer.
- Forty Natural Earth coastline plots were rendered and visually inspected:
  `meridians-lessons.png` and `meridians-experiments.png`.
- The four saved lesson notebooks were rerun in full in nteract. All twenty
  code cells succeeded, using NumPy, GeoPandas, and Matplotlib.
- Live Pyodide/Three.js rendering succeeded for Mercator (-74), Gall–Peters
  (140), Equal Earth (73), AuthaGraph (-74), flip (-74), slide (140), pinch (73),
  logarithm (-74), wave (140), and the centered experiment (73, latitude
  19.076) with its optional 3,000 km ring enabled.

The centered experiment intentionally omits a small cap around the antipode,
where bearing is undefined. Other projection distortions remain intentional.

Regenerate the numerical test inputs from the current source with
`node scripts/export-meridian-cases.mjs`, then rerun the test notebook.
