import authagraphSupport from '@/python/authagraph_lesson.py?raw'
import type { PanelAnnotation } from '@/chapters/PythonPanel'
export interface Lesson {
  supportCode?: string
  id: string
  name: string
  tradeoff: string
  promise: string
  question: string
  explanation: string
  change: string
  tex: string
  code: string
  annotations: PanelAnnotation[]
  chapter: string
}
export const lessons: Lesson[] = [
  {
    id: 'mercator',
    tradeoff:
      'Made for navigation: keeps local angles and makes constant compass bearings straight. Areas near the poles look much too large.',
    name: 'Mercator',
    promise: 'Keep local angles',
    question: 'Why does Greenland look so large?',
    explanation:
      'Mercator stretches both directions equally at each point. Local angles survive, but area grows rapidly toward the poles.',
    change:
      'Start with x = lon: equal steps in longitude become equal horizontal steps on the map. Then watch how the logarithm in y stretches high latitudes.',
    tex: String.raw`\begin{aligned}x&=\lambda\\[5pt]y&=\ln\tan\left(\frac\pi4+\frac\varphi2\right)\end{aligned}`,
    chapter: 'ch-03',
    code: `import numpy as np

# Angles enter in radians.
clip_degrees = 85

def project(lon, lat):
    phi = np.clip(lat, -np.radians(clip_degrees),
                  np.radians(clip_degrees))
    x = lon
    y = np.log(np.tan(np.pi / 4 + phi / 2))
    return x, y`,
    annotations: [
      {
        lines: [4, 4],
        title: '01 · Set a boundary',
        body: 'Try 70 instead of 85, then run. The poles lie at infinity, so this implementation clamps the latitude.',
      },
      {
        lines: [9, 9],
        title: '02 · Why longitude becomes x',
        body: 'Longitude is an angle; x is a planar coordinate. With a unit-radius sphere and Greenwich at x = 0, Mercator uses the longitude in radians directly: x = lon. Meridians are therefore straight, vertical, and evenly spaced. This does not preserve ground distances: the same longitude interval covers less distance near the poles.',
      },
      {
        lines: [10, 10],
        title: '03 · Why latitude does not become y',
        body: 'The logarithm stretches y to match the horizontal stretch, preserving local angles away from the clamped polar bands. Compare the other lessons: Gall–Peters scales longitude by a constant, while Equal Earth scales it by a factor that depends on latitude.',
      },
    ],
  },
  {
    id: 'gallPeters',
    tradeoff:
      'Keeps countries in their true relative sizes. Its rectangular layout stretches shapes, especially near the equator and poles.',
    name: 'Gall–Peters',
    promise: 'Keep relative areas',
    question: 'Can we fix area by changing two lines?',
    explanation:
      'Horizontal compression is balanced by vertical expansion. Areas stay proportional, while shapes change with latitude.',
    change:
      'Compare with Mercator: x gains a cosine factor; y uses sine instead of a logarithm.',
    tex: String.raw`\begin{aligned}x&=\lambda\cos\varphi_0\\[5pt]y&=\frac{\sin\varphi}{\cos\varphi_0}\\[5pt]\varphi_0&=45^\circ\end{aligned}`,
    chapter: 'ch-04',
    code: `import numpy as np

# Gall–Peters uses 45°. Try 0° or 30°.
standard_parallel = 45

def project(lon, lat):
    p = np.radians(standard_parallel)
    x = lon * np.cos(p)
    y = np.sin(lat) / np.cos(p)
    return x, y`,
    annotations: [
      {
        lines: [4, 4],
        title: '01 · Make a prediction',
        body: 'Try 30°. Will the world become wider or taller? This changes the cylindrical equal-area projection; only 45° is Gall–Peters.',
      },
      {
        lines: [8, 9],
        title: '02 · Notice the cancellation',
        body: 'The cosine factor multiplies x and divides y. Changing the standard parallel keeps the area-preserving construction.',
      },
    ],
  },
  {
    id: 'equalEarth',
    tradeoff:
      'Also keeps relative areas, with a rounded outline that balances how shapes look. Angles and distances still change.',
    name: 'Equal Earth',
    promise: 'Area, with a curved outline',
    question: 'What does a little more Python buy us?',
    explanation:
      'Equal Earth keeps relative areas while shaping a rounded world. A polynomial controls the outline; its derivative compensates for the local vertical stretch.',
    change:
      'A new intermediate angle and polynomial replace the cylindrical formulas. The derivative in x is what keeps area exact.',
    tex: String.raw`\begin{aligned}\theta&=\arcsin(M\sin\varphi)\\y&=F(\theta)\\x&=\frac{\lambda\cos\theta}{M F'(\theta)}\\M&=\sqrt3/2\end{aligned}`,
    chapter: 'ch-05',
    code: `import numpy as np

def project(lon, lat):
    A1, A2 = 1.340264, -0.081106
    A3, A4 = 0.000893, 0.003796
    M = np.sqrt(3) / 2
    t = np.arcsin(M * np.sin(lat))
    y = A1*t + A2*t**3 + A3*t**7 + A4*t**9
    derivative = (A1 + 3*A2*t**2
                  + 7*A3*t**6 + 9*A4*t**8)
    x = lon * np.cos(t) / (M * derivative)
    return x, y`,
    annotations: [
      {
        lines: [4, 8],
        title: '01 · Shape the outline',
        body: 'A1–A4 are the designers’ published polynomial coefficients, fitted to their chosen parallel spacing (see the explanation below). F is the polynomial on line 8. Try a small change to A1, such as 1.4, then run to see an Equal Earth-style variant.',
      },
      {
        lines: [9, 11],
        title: '02 · Pair the function with its derivative',
        body: 'Every coefficient appears in both F and its derivative. The matching horizontal compensation preserves area while the derivative remains nonzero.',
      },
    ],
  },
  {
    id: 'authagraph',
    tradeoff:
      'Divides the globe into regions and unfolds them into a rectangle, keeping Antarctica whole. Cuts and distortion remain; the formulation here is not exactly equal-area.',
    name: 'AuthaGraph',
    promise: 'Unfold the sphere',
    question: 'What if we flatten a solid instead?',
    explanation:
      'Route each point to a tetrahedral region, flatten the regions, then arrange them into a rectangle. The aim is to spread distortion across the whole world, including Antarctica.',
    change:
      'Read the four steps first. Each helper is real NumPy, available below the editor. This implements Narukawa’s 2022 mathematical formulation with the public Imago rectangle arrangement.',
    chapter: 'ch-06',
    supportCode: authagraphSupport,
    tex: String.raw`\begin{aligned}a&=\lambda_f-\arcsin(\sin\lambda_f/\sqrt3)\\\theta&=\arctan(2\sqrt3\,a/\pi)\\r&=\frac{\sqrt3(2+\cos\lambda_f)}{(2+\sqrt2\tan\varphi_f)\cos\theta}\end{aligned}`,
    code: `import numpy as np

# The helper implementations are shown below.
# Try changing central_meridian to 20.
central_meridian = 0

def project(lon, lat):
    lon = (lon - np.radians(central_meridian) + np.pi) % (2*np.pi) - np.pi
    lon, lat = orient_to_tetrahedron(lon, lat)
    lon, lat, face = choose_face(lon, lat)
    x, y = flatten_face(lon, lat, face)
    return unfold_rectangle(x, y, face)`,
    annotations: [
      {
        lines: [5, 8],
        title: '01 · Turn the world',
        body: 'Changing the central meridian rotates geography relative to the tetrahedron. It changes which places lie near the cuts.',
      },
      {
        lines: [9, 12],
        title: '02 · Follow each point',
        body: 'Orient the sphere, choose a face, flatten it, and place it in the rectangle. Open the helper code to see every calculation.',
      },
    ],
  },
]
