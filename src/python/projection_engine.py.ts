/**
 * Canonical Python source for the executable textbook panels (design.md §8).
 * The SAME code that ships in the UI is what the Pyodide worker executes.
 * numpy implementations of the spherical forward projections (R = 1).
 */
export const PROJECTION_ENGINE_PY = `\
"""projection_engine.py — spherical forward projections, R = 1.
Every flat map is a choice: these are the choices, as code."""
import numpy as np

MERCATOR_MAX_LAT = np.radians(85.0)  # design clamp: beyond this Mercator is unusable


def mercator(lon, lat, lon0=0.0):
    """Mercator (1569): conformal. y = ln tan(pi/4 + phi/2)."""
    lam = (lon - lon0 + np.pi) % (2 * np.pi) - np.pi
    phi = np.clip(lat, -MERCATOR_MAX_LAT, MERCATOR_MAX_LAT)
    x = lam
    y = np.log(np.tan(np.pi / 4 + phi / 2))
    return x, y


def gall_peters(lon, lat, lon0=0.0):
    """Gall-Peters: cylindrical equal-area, standard parallels at +/-45 deg."""
    lam = (lon - lon0 + np.pi) % (2 * np.pi) - np.pi
    phi0 = np.pi / 4
    x = lam * np.cos(phi0)
    y = np.sin(lat) / np.cos(phi0)
    return x, y


# Equal Earth (Savric, Patterson & Jenny 2018, DOI 10.1080/13658816.2018.1504949)
EE_A1 = 1.340264
EE_A2 = -0.081106  # negative sign confirmed by the paper, Wikipedia and PROJ
EE_A3 = 0.000893
EE_A4 = 0.003796
EE_M = np.sqrt(3) / 2


def equal_earth(lon, lat, lon0=0.0):
    """Equal Earth: theta = asin(M sin phi); y = F(theta); x = lam cos theta / (M F'(theta))."""
    lam = (lon - lon0 + np.pi) % (2 * np.pi) - np.pi
    theta = np.arcsin(EE_M * np.sin(lat))
    t2 = theta * theta
    t6 = t2 * t2 * t2
    y = theta * (EE_A1 + EE_A2 * t2 + t6 * (EE_A3 + EE_A4 * t2))
    fp = EE_A1 + 3 * EE_A2 * t2 + t6 * (7 * EE_A3 + 9 * EE_A4 * t2)
    x = lam * np.cos(theta) / (EE_M * fp)
    return x, y


def _mollweide_theta(lat):
    """Solve 2*theta + sin(2*theta) = pi*sin(phi) by Newton-Raphson."""
    s = np.clip(np.sin(lat), -1.0, 1.0)
    theta = np.array(lat, dtype=float)
    for _ in range(32):
        d = (2 * theta + np.sin(2 * theta) - np.pi * s) / (2 + 2 * np.cos(2 * theta))
        theta = theta - d
        if np.max(np.abs(d)) < 1e-13:
            break
    return theta


def mollweide(lon, lat, lon0=0.0):
    """Mollweide (1805): equal-area pseudocylindrical, 2:1 ellipse."""
    lam = (lon - lon0 + np.pi) % (2 * np.pi) - np.pi
    theta = _mollweide_theta(lat)
    x = (2 * np.sqrt(2) / np.pi) * lam * np.cos(theta)
    y = np.sqrt(2) * np.sin(theta)
    return x, y


def equirectangular(lon, lat, lon0=0.0):
    """Plate carree: x = lam, y = phi. The zero-effort choice."""
    lam = (lon - lon0 + np.pi) % (2 * np.pi) - np.pi
    return lam, np.array(lat, dtype=float)


CANONICAL = {
    "mercator": mercator,
    "gall_peters": gall_peters,
    "equal_earth": equal_earth,
    "mollweide": mollweide,
    "equirectangular": equirectangular,
}


def project(name, lon, lat, lon0=0.0):
    return CANONICAL[name](lon, lat, lon0)
`
