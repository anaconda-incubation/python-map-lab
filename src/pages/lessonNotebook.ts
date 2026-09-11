import { lessonStories } from './lessonStories'
import type { Lesson } from './pythonLessons'

/** Self-contained geography, so the downloaded notebook needs no data URLs. */
export function lessonNotebook(
  lesson: Pick<Lesson, 'id' | 'name' | 'explanation' | 'change' | 'annotations' | 'question'>,
  code: string,
  geography: unknown,
) {
  const story = lessonStories[lesson.id]
  const markdown = (id: string, source: string) => ({
    id,
    cell_type: 'markdown',
    metadata: {},
    source: [source],
  })
  const cell = (id: string, source: string) => ({
    id,
    cell_type: 'code',
    metadata: {},
    execution_count: null,
    outputs: [],
    source: [source],
  })
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: {
        display_name: 'Python 3',
        language: 'python',
        name: 'python3',
      },
      runt: {
        schema_version: '1',
        pixi: {
          channels: ['conda-forge'],
          dependencies: ['numpy', 'matplotlib', 'geopandas'],
          pypi_dependencies: [],
        },
      },
    },
    cells: [
      markdown(
        'intro',
        `# ${lesson.name}: a world from a function\n\n${story ? `${story.objective}\n\n${story.history}\n\n[${story.sourceLabel}](${story.source})\n\n## The tradeoff\n\n` : ''}${lesson.explanation}\n\nBefore running: ${lesson.question} Make a prediction, then compare it with the map.\n\nRun cells from top to bottom. This notebook includes Natural Earth land geometry and uses GeoPandas, NumPy and Matplotlib. nteract reads the declared dependencies; other notebook environments can use the setup cell. First-time installation requires internet access.`,
      ),
      cell(
        'setup',
        `import importlib.util
import sys

missing = [name for name in ("numpy", "matplotlib", "geopandas")
           if importlib.util.find_spec(name) is None]
if missing:
    if sys.platform == "emscripten":
        import micropip
        await micropip.install(missing)
    else:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", *missing])

import numpy as np
import geopandas as gpd
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
print("NumPy, GeoPandas and Matplotlib are ready.")`,
      ),
      markdown(
        'formula-note',
        '## The projection\n\nChange the function below, then rerun the map. Inputs are longitude and latitude in radians; outputs are planar coordinates for a unit-radius sphere.' +
          (lesson.id === 'authagraph'
            ? `\n\n${lesson.change}\n\n${lesson.annotations[0].body}`
            : ''),
      ),
      cell('projection', code),
      markdown(
        'data-note',
        '## Real geography\n\nNatural Earth 1:110m land polygons, embedded in this file (public domain). GeoPandas holds the geographic features in longitude/latitude coordinates. The custom Python function projects their coastlines directly; it is not a standard GeoPandas CRS conversion.\n\n[About Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/)',
      ),
      cell(
        'geography',
        `import json
land = gpd.GeoDataFrame.from_features(json.loads(${JSON.stringify(JSON.stringify(geography))})["features"], crs="EPSG:4326")
print(f"Loaded {len(land)} land features in {land.crs}.")
land[["geometry"]].head()`,
      ),
      markdown(
        'drawing-note',
        '## Draw your world\n\nThe pale green lines are real coastlines; the lilac lines mark latitude and longitude. Segments crossing projection cuts are omitted so the notebook does not draw false lines across the map. This is a coastline view, not a filled area comparison.',
      ),
      cell(
        'drawing-helpers',
        `def projected_segments(coordinates):
    # Densify long geographic edges before applying the nonlinear function.
    dense = []
    for start, end in zip(coordinates[:-1], coordinates[1:]):
        steps = max(1, int(np.ceil(np.max(np.abs(end - start)) / 0.5)))
        dense.extend(np.linspace(start, end, steps, endpoint=False))
    dense.append(coordinates[-1])
    radians = np.radians(np.asarray(dense))
    x, y = project(radians[:, 0], radians[:, 1])
    points = np.column_stack((x, y))
    segments = np.stack((points[:-1], points[1:]), axis=1)
    finite = np.isfinite(segments).all(axis=(1, 2))
    lengths = np.linalg.norm(segments[:, 1] - segments[:, 0], axis=1)
    # A conservative cut threshold in unit-sphere map coordinates.
    return segments[finite & (lengths < 0.25)]

coastlines = []
for geometry in land.geometry:
    polygons = list(geometry.geoms) if geometry.geom_type == "MultiPolygon" else [geometry]
    for polygon in polygons:
        coastlines.extend(projected_segments(np.asarray(polygon.exterior.coords)))

grid_lines = []
for latitude in range(-80, 81, 20):
    grid_lines.extend(projected_segments(np.column_stack((np.linspace(-180, 180, 721), np.full(721, latitude)))))
for longitude in range(-180, 181, 20):
    grid_lines.extend(projected_segments(np.column_stack((np.full(341, longitude), np.linspace(-85, 85, 341)))))
print(f"Projected {len(coastlines):,} coastline segments.")`,
      ),
      cell(
        'map',
        `fig, ax = plt.subplots(figsize=(12, 8), facecolor="#0B0D0C")
ax.set_facecolor("#171236")
ax.add_collection(LineCollection(grid_lines, colors="#9183FF", linewidths=0.35, alpha=0.5))
ax.add_collection(LineCollection(coastlines, colors="#DEFFAA", linewidths=0.7))
ax.autoscale()
ax.margins(0.04)
ax.set_aspect("equal")
ax.set_title(${JSON.stringify(lesson.name + ' · Your Python projection')}, color="#F5F7F5", fontsize=20, pad=18)
ax.set_xticks([])
ax.set_yticks([])
for spine in ax.spines.values():
    spine.set_visible(False)
fig.text(0.5, 0.035, "Natural Earth coastlines · GeoPandas + NumPy + Matplotlib", ha="center", color="#C1CBC3", fontsize=10)
plt.show()`,
      ),
      markdown(
        'explore',
        '## Try a change\n\nEdit a coefficient or operation in `project`, then rerun the drawing cells. What moved? What stayed proportional? The projection controls the tradeoffs; GeoPandas supplies the real geography.',
      ),
    ],
  }
}
