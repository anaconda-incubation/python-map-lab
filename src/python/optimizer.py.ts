/**
 * Canonical Python source: the DESIGN BY GOAL optimizer (design.md §2, lab).
 * Two parametric families over the auxiliary latitude theta = asin(m sin phi):
 *
 *   Equal-Area Family (equal-area enforced by construction):
 *     y = Y(theta) = a1 t + a3 t^3 + a5 t^5 + a7 t^7 + a9 t^9
 *     x = lam cos(theta) / (m Y'(theta))      → Jacobian determinant ≡ 1
 *
 *   Compromise Family (independent horizontal coefficients):
 *     x = lam (g0 + g2 t^2 + g4 t^4 + g6 t^6),  y = Y(theta)
 *
 * Loss = weighted area/shape/distance/extreme/outline terms over an
 * area-uniform Fibonacci sample, normalized by the weight sum so slider
 * weights behave sensibly. Minimized with SciPy Nelder-Mead.
 */
export const OPTIMIZER_PY = `\
"""optimizer.py — design a projection by weighted goals."""
import numpy as np

GOLDEN_ANGLE = np.pi * (3 - np.sqrt(5))
H = 1e-6

# --- shared area-uniform sample ---
N = 800
_i = np.arange(N)
_z = -1.0 + 2.0 * (_i + 0.5) / N
LAT = np.arcsin(np.clip(_z, -1, 1))
LON = (_i * GOLDEN_ANGLE) % (2 * np.pi) - np.pi
COS_LAT = np.cos(LAT)

# distance pairs (deterministic)
_rng = np.random.default_rng(42)
PI = _rng.integers(0, N, 500)
PJ = _rng.integers(0, N, 500)
_gc = np.arccos(np.clip(
    np.sin(LAT[PI]) * np.sin(LAT[PJ])
    + np.cos(LAT[PI]) * np.cos(LAT[PJ]) * np.cos(LON[PI] - LON[PJ]), -1, 1))
_mask = _gc > 0.05
PI, PJ, GC = PI[_mask], PJ[_mask], _gc[_mask]

# outline sampling
_outline_lam = np.linspace(-np.pi, np.pi, 181)
_pole_lat = np.full_like(_outline_lam, np.pi / 2)
_eq_lat = np.zeros_like(_outline_lam)


def make_family_fn(family, params):
    """Return a vectorized forward projection fn(lon, lat) -> (x, y)."""
    if family == "equal_area":
        m, a1, a3, a5, a7, a9 = params
        def fn(lon, lat):
            theta = np.arcsin(np.clip(m, 1e-6, 1.0) * np.sin(lat))
            t2 = theta * theta
            y = theta * (a1 + t2 * (a3 + t2 * (a5 + t2 * (a7 + t2 * a9))))
            yp = a1 + t2 * (3 * a3 + t2 * (5 * a5 + t2 * (7 * a7 + t2 * 9 * a9)))
            x = lon * np.cos(theta) / (m * yp)
            return x, y
        return fn
    elif family == "compromise":
        m, a1, a3, a5, a7, a9, g0, g2, g4, g6 = params
        def fn(lon, lat):
            theta = np.arcsin(np.clip(m, 1e-6, 1.0) * np.sin(lat))
            t2 = theta * theta
            y = theta * (a1 + t2 * (a3 + t2 * (a5 + t2 * (a7 + t2 * a9))))
            x = lon * (g0 + t2 * (g2 + t2 * (g4 + t2 * g6)))
            return x, y
        return fn
    raise ValueError("unknown family: " + family)


def _sigmas(fn):
    """Vectorized metric-corrected Jacobian SVD over the sample."""
    cos_c = np.maximum(np.abs(COS_LAT), 1e-12)
    step = np.minimum(H / cos_c, 1e-3)
    x1, y1 = fn(LON + step, LAT)
    x2, y2 = fn(LON - step, LAT)
    dxl = (x1 - x2) / (2 * step * cos_c)
    dyl = (y1 - y2) / (2 * step * cos_c)
    lat_up = np.minimum(np.pi / 2, LAT + H)
    lat_dn = np.maximum(-np.pi / 2, LAT - H)
    xu, yu = fn(LON, lat_up)
    xd, yd = fn(LON, lat_dn)
    span = lat_up - lat_dn
    dxp = (xu - xd) / span
    dyp = (yu - yd) / span
    m00 = dxl * dxl + dyl * dyl
    m01 = dxl * dxp + dyl * dyp
    m11 = dxp * dxp + dyp * dyp
    tr = m00 + m11
    det = m00 * m11 - m01 * m01
    disc = np.sqrt(np.maximum(0.0, tr * tr / 4 - det))
    s1 = np.sqrt(np.maximum(0.0, tr / 2 + disc))
    s2 = np.sqrt(np.maximum(0.0, tr / 2 - disc))
    return s1, s2


def loss_terms(fn):
    s1, s2 = _sigmas(fn)
    area_scale = s1 * s2
    ok = np.isfinite(area_scale) & (area_scale > 1e-8) & (area_scale < 1e6)
    if ok.sum() < N // 2:
        return None  # degenerate parameter set
    la = np.log2(area_scale[ok])
    area_term = float(np.sqrt(np.mean(la * la)))
    omega = 2 * np.arcsin(np.clip((s1[ok] - s2[ok]) / (s1[ok] + s2[ok] + 1e-15), 0, 1))
    shape_term = float(np.sqrt(np.mean(omega * omega)))
    extreme_term = float(np.percentile(omega, 95) + np.percentile(np.abs(la), 95))
    x, y = fn(LON, LAT)
    if not (np.all(np.isfinite(x)) and np.all(np.isfinite(y))):
        return None
    d = np.hypot(x[PI] - x[PJ], y[PI] - y[PJ])
    lr = np.log(np.maximum(d, 1e-12) / GC)
    dist_term = float(np.sqrt(np.mean((lr - lr.mean()) ** 2)))
    # outline: pole-line ratio + aspect vs 2:1
    xp, _ = fn(_outline_lam, _pole_lat)
    xe, _ = fn(_outline_lam, _eq_lat)
    _, ytop = fn(np.array([0.0]), np.array([np.pi / 2]))
    pole_ratio = float(np.max(np.abs(xp)) / max(np.max(np.abs(xe)), 1e-9))
    aspect = float(np.max(np.abs(xe)) / max(abs(ytop[0]), 1e-9))
    outline_term = (pole_ratio - 0.55) ** 2 + (aspect / 2 - 1) ** 2
    return {
        "area": area_term,
        "shape": shape_term,
        "distance": dist_term,
        "extreme": extreme_term,
        "outline": outline_term,
    }


DEFAULT_WEIGHTS = {"area": 1.0, "shape": 1.0, "distance": 0.5, "extreme": 0.5, "outline": 0.3}

SEEDS = {
    "equal_area": [0.8660254, 1.340264, -0.081106, 0.0, 0.000893, 0.003796],
    "compromise": [0.8660254, 1.340264, -0.081106, 0.0, 0.000893, 0.003796, 0.92, -0.1, 0.0, 0.0],
}


def optimize_projection(family, weights=None, maxiter=600):
    """Nelder-Mead over the family coefficients. Returns params + breakdown."""
    from scipy.optimize import minimize

    w = dict(DEFAULT_WEIGHTS)
    if weights:
        w.update({k: float(v) for k, v in weights.items()})
    wsum = sum(max(v, 0.0) for v in w.values()) or 1.0

    def objective(params):
        try:
            fn = make_family_fn(family, params)
            terms = loss_terms(fn)
            if terms is None:
                return 1e3
            return sum(max(w[k], 0.0) * terms[k] for k in terms) / wsum
        except Exception:
            return 1e3

    x0 = np.array(SEEDS[family], dtype=float)
    res = minimize(objective, x0, method="Nelder-Mead",
                   options={"maxiter": int(maxiter), "xatol": 1e-6, "fatol": 1e-6})
    fn = make_family_fn(family, res.x)
    terms = loss_terms(fn)
    return {
        "family": family,
        "params": [float(p) for p in res.x],
        "loss": float(res.fun),
        "terms": terms,
        "iterations": int(res.nit),
        "evaluations": int(res.nfev),
        "converged": bool(res.success),
    }
`
