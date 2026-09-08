/**
 * WRITE PYTHON starter templates (design/lab.md MODE 2). The contract block is
 * pinned: it is re-inserted on run if the user deletes it. Template math is
 * the same canonical code shipped in src/python/projection_engine.py.ts.
 */

export const CONTRACT = `# CONTRACT
# def project(lon, lat, params):
#     lon, lat : float64 arrays, RADIANS, lon in [-pi, pi]
#     returns   : (x, y) float64 arrays, same shape
#     params    : dict — expose up to 4 floats via the params panel
# Vectorized NumPy only. No loops needed. NaN/inf = a hole in your map.`

export interface LabTemplate {
  id: string
  label: string
  filename: string
  code: string
}

const EQUIRECTANGULAR = `${CONTRACT}
import numpy as np

def project(lon, lat, params):
    # Plate carrée: x = λ, y = φ. The zero-effort choice.
    return lon, lat
`

const MERCATOR = `${CONTRACT}
import numpy as np

# @param clip_deg 30 85 83
def project(lon, lat, params):
    # Mercator (1569): conformal. y = ln tan(π/4 + φ/2).
    # The clip is the whole story: without it y → ∞ at the poles.
    clip = np.radians(params["clip_deg"])
    phi = np.clip(lat, -clip, clip)
    # Delete the clip line above (and pass lat straight through) to watch
    # the projection escape to infinity — the lab will cull the runaways.
    x = lon
    y = np.log(np.tan(np.pi / 4 + phi / 2))
    return x, y
`

const CYLINDRICAL_EQUAL_AREA = `${CONTRACT}
import numpy as np

# @param phi0_deg -60 60 45
def project(lon, lat, params):
    # Cylindrical equal-area: compress y by sin φ, stretch x by cos φ₀.
    # Gall–Peters is φ₀ = 45°. The standard parallel is YOURS to move.
    phi0 = np.radians(params["phi0_deg"])
    x = lon * np.cos(phi0)
    y = np.sin(lat) / np.cos(phi0)
    return x, y
`

const EQUAL_EARTH_STYLE = `${CONTRACT}
import numpy as np

# Equal Earth-style pseudocylindrical (Šavrič, Patterson & Jenny 2018).
# θ = asin(M sin φ); y = F(θ); x = λ cos θ / (M·F′(θ)).
# @param A1 0.5 2.0 1.340264
# @param A2 -0.3 0.3 -0.081106
# @param A3 -0.05 0.05 0.000893
# @param A4 -0.02 0.02 0.003796
def project(lon, lat, params):
    A1 = params["A1"]; A2 = params["A2"]
    A3 = params["A3"]; A4 = params["A4"]
    M = np.sqrt(3) / 2
    theta = np.arcsin(M * np.sin(lat))
    t2 = theta * theta
    t6 = t2 * t2 * t2
    y = theta * (A1 + A2 * t2 + t6 * (A3 + A4 * t2))
    fp = A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)
    x = lon * np.cos(theta) / (M * fp)
    return x, y
`

const BLANK = `${CONTRACT}
import numpy as np

def project(lon, lat, params):
    # Your choice goes here. Return (x, y) arrays shaped like lon/lat.
    pass
`

export const TEMPLATES: LabTemplate[] = [
  { id: 'equirectangular', label: 'Equirectangular', filename: 'equirectangular.py', code: EQUIRECTANGULAR },
  { id: 'mercator', label: 'Mercator', filename: 'mercator.py', code: MERCATOR },
  { id: 'cylindrical-equal-area', label: 'Cylindrical equal-area', filename: 'cyl_equal_area.py', code: CYLINDRICAL_EQUAL_AREA },
  { id: 'equal-earth-style', label: 'Equal Earth-style', filename: 'equal_earth_style.py', code: EQUAL_EARTH_STYLE },
  { id: 'blank', label: 'Blank', filename: 'my_projection.py', code: BLANK },
]

/** Re-insert the pinned contract block if the user removed it. */
export function ensureContract(code: string): { code: string; restored: boolean } {
  if (code.includes('# CONTRACT')) return { code, restored: false }
  const sep = code.startsWith('\n') || code.length === 0 ? '' : '\n'
  return { code: `${CONTRACT}\n${sep}${code}`, restored: true }
}
