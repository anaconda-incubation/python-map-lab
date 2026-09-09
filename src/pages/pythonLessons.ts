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
      'Created by Gerardus Mercator in 1569 for maritime navigation. Keeps local angles and makes constant compass bearings straight, but areas near the poles look much too large.',
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

# Meridians in degrees: east is positive, west is negative.
# Try 0 (Greenwich, UK), -74 (New York),
# 140 (Tokyo), or 73 (Mumbai). City values are approximate.
central_meridian = 0

# Angles enter in radians.
clip_degrees = 85

def project(lon, lat):
    lon = (lon - np.radians(central_meridian) + np.pi) % (2*np.pi) - np.pi
    phi = np.clip(lat, -np.radians(clip_degrees),
                  np.radians(clip_degrees))
    x = lon
    y = np.log(np.tan(np.pi / 4 + phi / 2))
    return x, y`,
    annotations: [
      {
        lines: [6, 12],
        title: 'Center the map',
        body: 'Change central_meridian in degrees, then run. Subtracting it turns the world; wrapping longitude moves the map cut to the opposite meridian. The equations below use longitude relative to this center.',
      },
      {
        lines: [9, 9],
        title: '01 · Set a boundary',
        body: 'Try 70 instead of 85, then run. The poles lie at infinity, so this implementation clamps the latitude.',
      },
      {
        lines: [15, 15],
        title: '02 · Why longitude becomes x',
        body: 'Longitude is an angle; x is a planar coordinate. With a unit-radius sphere and the selected central meridian at x = 0, Mercator uses the longitude in radians directly: x = lon. Meridians are therefore straight, vertical, and evenly spaced. This does not preserve ground distances: the same longitude interval covers less distance near the poles.',
      },
      {
        lines: [16, 16],
        title: '03 · Why latitude does not become y',
        body: 'The logarithm stretches y to match the horizontal stretch, preserving local angles away from the clamped polar bands. Compare the other lessons: Gall–Peters scales longitude by a constant, while Equal Earth scales it by a factor that depends on latitude.',
      },
    ],
  },
  {
    id: 'gallPeters',
    tradeoff:
      'Described by James Gall in 1855 and popularized by Arno Peters in 1973. Keeps countries in their true relative sizes, but its rectangular layout stretches shapes, especially near the equator and poles.',
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

# Meridians in degrees: east is positive, west is negative.
# Try 0 (Greenwich, UK), -74 (New York),
# 140 (Tokyo), or 73 (Mumbai). City values are approximate.
central_meridian = 0

# Gall–Peters uses 45°. Try 0° or 30°.
standard_parallel = 45

def project(lon, lat):
    lon = (lon - np.radians(central_meridian) + np.pi) % (2*np.pi) - np.pi
    p = np.radians(standard_parallel)
    x = lon * np.cos(p)
    y = np.sin(lat) / np.cos(p)
    return x, y`,
    annotations: [
      {
        lines: [6, 12],
        title: 'Center the map',
        body: 'Change central_meridian in degrees, then run. Subtracting it turns the world; wrapping longitude moves the map cut to the opposite meridian. The equations below use longitude relative to this center.',
      },
      {
        lines: [9, 9],
        title: '01 · Make a prediction',
        body: 'Try 30°. Will the world become wider or taller? This changes the cylindrical equal-area projection; only 45° is Gall–Peters.',
      },
      {
        lines: [14, 15],
        title: '02 · Notice the cancellation',
        body: 'The cosine factor multiplies x and divides y. Changing the standard parallel keeps the area-preserving construction.',
      },
    ],
  },
  {
    id: 'equalEarth',
    tradeoff:
      'Introduced in 2018 by Bojan Šavrič, Tom Patterson, and Bernhard Jenny. Keeps relative areas, with a rounded outline that balances how shapes look. Angles and distances still change.',
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

# Meridians in degrees: east is positive, west is negative.
# Try 0 (Greenwich, UK), -74 (New York),
# 140 (Tokyo), or 73 (Mumbai). City values are approximate.
central_meridian = 0

def project(lon, lat):
    lon = (lon - np.radians(central_meridian) + np.pi) % (2*np.pi) - np.pi
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
        lines: [6, 9],
        title: 'Center the map',
        body: 'Change central_meridian in degrees, then run. Subtracting it turns the world; wrapping longitude moves the map cut to the opposite meridian. The equations below use longitude relative to this center.',
      },
      {
        lines: [10, 14],
        title: '01 · Shape the outline',
        body: 'A1–A4 are the designers’ published polynomial coefficients, fitted to their chosen parallel spacing (see the explanation below). F is the polynomial on line 14. Try a small change to A1, such as 1.4, then run to see an Equal Earth-style variant.',
      },
      {
        lines: [15, 17],
        title: '02 · Pair the function with its derivative',
        body: 'Every coefficient appears in both F and its derivative. The matching horizontal compensation preserves area while the derivative remains nonzero.',
      },
    ],
  },
  {
    id: 'authagraph',
    tradeoff:
      'Created by Hajime Narukawa. Divides the globe into regions and unfolds them into a rectangle. The original orientation keeps Antarctica whole; choosing a new center moves the cuts. The formulation here is not exactly equal-area.',
    name: 'AuthaGraph',
    promise: 'Unfold the sphere',
    question: 'What if we flatten a solid instead?',
    explanation:
      'Choose a place to put at the center of the rectangle. Rotate the globe, route each point to a tetrahedral region, then flatten and arrange the regions. The aim is to spread distortion across the whole world, including Antarctica.',
    change:
      'Set both center_lat and center_lon in degrees. That place lands at the map’s center, with north pointing up locally. This changes the orientation and cuts, not the projection’s distortion tradeoffs. The NumPy helpers below implement Narukawa’s 2022 formulation with the public Imago rectangle arrangement.',
    chapter: 'ch-06',
    supportCode: authagraphSupport,
    tex: String.raw`\begin{aligned}a&=\lambda_f-\arcsin(\sin\lambda_f/\sqrt3)\\\theta&=\arctan(2\sqrt3\,a/\pi)\\r&=\frac{\sqrt3(2+\cos\lambda_f)}{(2+\sqrt2\tan\varphi_f)\cos\theta}\end{aligned}`,
    code: `import numpy as np

# Center a place: latitude north +, south -; longitude east +, west -.
# Approximate (latitude, longitude) pairs:
# Greenwich (51.5, 0), New York (40.7, -74),
# Tokyo (35.7, 139.7), Mumbai (19.1, 72.9).
center_lat, center_lon = 35.7, 139.7  # Tokyo

def project(lon, lat):
    lon, lat = center_on(lon, lat, center_lat, center_lon)
    lon, lat = orient_to_tetrahedron(lon, lat)
    lon, lat, face = choose_face(lon, lat)
    x, y = flatten_face(lon, lat, face)
    return unfold_rectangle(x, y, face)`,
    annotations: [
      {
        lines: [7, 10],
        title: '01 · Center a place',
        body: 'Change both coordinates together. center_on rotates the sphere so that this location projects to x = 0, y = 0, the rectangle’s center. Local north points up there. Unlike a central meridian, which centers a longitude line on other maps, this selects one point. Distances from that point are not preserved; use the Center on a place experiment for that.',
      },
      {
        lines: [11, 14],
        title: '02 · Follow each point',
        body: 'Orient the sphere, choose a face, flatten it, and place it in the rectangle. Open the helper code to see every calculation.',
      },
    ],
  },
]
