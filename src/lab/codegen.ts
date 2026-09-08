/**
 * "Send to Python mode" — the pedagogical bridge (design/lab.md): renders a
 * DESIGN BY GOAL result as a plain project() implementation with the found
 * coefficients baked in as readable numbers.
 */
import { CONTRACT } from './templates'
import type { Family } from './types'

function fmt(v: number): string {
  const s = Number(v.toPrecision(8)).toString()
  return s.includes('.') || s.includes('e') || s.includes('n') ? s : `${s}.0`
}

export function familyToPython(family: Family, params: number[], name: string, loss: number): string {
  const P = params.map(fmt).join(', ')
  if (family === 'equal_area') {
    return `${CONTRACT}
import numpy as np

# ${name} — found by DESIGN BY GOAL (Equal-Area Family), final loss ${loss.toFixed(4)}
# θ = asin(m sin φ);  y = Y(θ);  x = λ cos θ / (m·Y′(θ))  → equal-area by construction
P = [${P}]  # m, a1, a3, a5, a7, a9

def project(lon, lat, params):
    m, a1, a3, a5, a7, a9 = P
    theta = np.arcsin(np.clip(m, 1e-6, 1.0) * np.sin(lat))
    t2 = theta * theta
    y = theta * (a1 + t2 * (a3 + t2 * (a5 + t2 * (a7 + t2 * a9))))
    yp = a1 + t2 * (3 * a3 + t2 * (5 * a5 + t2 * (7 * a7 + t2 * 9 * a9)))
    x = lon * np.cos(theta) / (np.clip(m, 1e-6, 1.0) * yp)
    return x, y
`
  }
  return `${CONTRACT}
import numpy as np

# ${name} — found by DESIGN BY GOAL (Compromise Family), final loss ${loss.toFixed(4)}
# y = Y(θ);  x = λ (g0 + g2 θ² + g4 θ⁴ + g6 θ⁶)  — nothing is sacred; the loss is the only law
P = [${P}]  # m, a1, a3, a5, a7, a9, g0, g2, g4, g6

def project(lon, lat, params):
    m, a1, a3, a5, a7, a9, g0, g2, g4, g6 = P
    theta = np.arcsin(np.clip(m, 1e-6, 1.0) * np.sin(lat))
    t2 = theta * theta
    y = theta * (a1 + t2 * (a3 + t2 * (a5 + t2 * (a7 + t2 * a9))))
    x = lon * (g0 + t2 * (g2 + t2 * (g4 + t2 * g6)))
    return x, y
`
}
