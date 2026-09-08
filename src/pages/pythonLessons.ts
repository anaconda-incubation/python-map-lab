import type { PanelAnnotation } from '@/chapters/PythonPanel'
export interface Lesson { id: string; name: string; promise: string; question: string; explanation: string; change: string; tex: string; code: string; annotations: PanelAnnotation[]; chapter: string }
export const lessons: Lesson[] = [
  { id:'mercator', name:'Mercator', promise:'Keep local angles', question:'Why does Greenland look so large?', explanation:'Mercator stretches both directions equally at each point. Local angles survive, but area grows rapidly toward the poles.', change:'Watch the y line. A logarithm stretches high latitudes; longitude passes straight through.', tex:String.raw`\begin{aligned}x&=\lambda\\[5pt]y&=\ln\tan\left(\frac\pi4+\frac\varphi2\right)\end{aligned}`, chapter:'ch-03',
    code:`import numpy as np

# Angles enter in radians.
clip_degrees = 85

def project(lon, lat):
    phi = np.clip(lat, -np.radians(clip_degrees),
                  np.radians(clip_degrees))
    x = lon
    y = np.log(np.tan(np.pi / 4 + phi / 2))
    return x, y`,
    annotations:[{lines:[4,4],title:'01 · Set a boundary',body:'Try 70 instead of 85, then run. The poles lie at infinity, so this implementation clamps the latitude.'},{lines:[9,10],title:'02 · Follow the transformation',body:'x keeps longitude. The logarithm in y compensates for shrinking parallels on the sphere. The clamped polar bands are outside the conformal region.'}] },
  {id:'gallPeters',name:'Gall–Peters',promise:'Keep relative areas',question:'Can we fix area by changing two lines?',explanation:'Horizontal compression is balanced by vertical expansion. Areas stay proportional, while shapes change with latitude.',change:'Compare with Mercator: x gains a cosine factor; y uses sine instead of a logarithm.',tex:String.raw`\begin{aligned}x&=\lambda\cos\varphi_0\\[5pt]y&=\frac{\sin\varphi}{\cos\varphi_0}\\[5pt]\varphi_0&=45^\circ\end{aligned}`,chapter:'ch-04',
    code:`import numpy as np

# Gall–Peters uses 45°. Try 0° or 30°.
standard_parallel = 45

def project(lon, lat):
    p = np.radians(standard_parallel)
    x = lon * np.cos(p)
    y = np.sin(lat) / np.cos(p)
    return x, y`,annotations:[{lines:[4,4],title:'01 · Make a prediction',body:'Try 30°. Will the world become wider or taller? This changes the cylindrical equal-area projection; only 45° is Gall–Peters.'},{lines:[8,9],title:'02 · Notice the cancellation',body:'The cosine factor multiplies x and divides y. Changing the standard parallel keeps the area-preserving construction.'}]},
  {id:'equalEarth',name:'Equal Earth',promise:'Area, with a curved outline',question:'What does a little more Python buy us?',explanation:'Equal Earth keeps relative areas while shaping a rounded world. A polynomial controls the outline; its derivative compensates for the local vertical stretch.',change:'A new intermediate angle and polynomial replace the cylindrical formulas. The derivative in x is what keeps area exact.',tex:String.raw`\begin{aligned}\theta&=\arcsin(M\sin\varphi)\\y&=F(\theta)\\x&=\frac{\lambda\cos\theta}{M F'(\theta)}\\M&=\sqrt3/2\end{aligned}`,chapter:'ch-05',code:`import numpy as np

def project(lon, lat):
    A1, A2 = 1.340264, -0.081106
    A3, A4 = 0.000893, 0.003796
    M = np.sqrt(3) / 2
    t = np.arcsin(M * np.sin(lat))
    y = A1*t + A2*t**3 + A3*t**7 + A4*t**9
    derivative = (A1 + 3*A2*t**2
                  + 7*A3*t**6 + 9*A4*t**8)
    x = lon * np.cos(t) / (M * derivative)
    return x, y`,annotations:[{lines:[4,8],title:'01 · Shape the outline',body:'F is the polynomial on line 8. Try a small change to A1, such as 1.4, then run to see an Equal Earth-style variant.'},{lines:[9,11],title:'02 · Pair the function with its derivative',body:'Every coefficient appears in both F and its derivative. The matching horizontal compensation preserves area while the derivative remains nonzero.'}]}
]
