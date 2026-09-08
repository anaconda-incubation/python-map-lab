/**
 * Canonical Python source: Tissot indicatrix + global metrics, mirroring
 * src/projection/distortion.ts and metrics.ts exactly (design.md §8).
 */
export const DISTORTION_PY = `\
"""distortion.py — Tissot's indicatrix via numerical Jacobian + 2x2 SVD.
A = [[(dx/dlam)/cos(phi), dx/dphi], [(dy/dlam)/cos(phi), dy/dphi]]  (R = 1)
sigma1, sigma2 = singular values;  s = sigma1*sigma2 (areal scale);
omega = 2*asin((sigma1-sigma2)/(sigma1+sigma2)) (max angular deformation)."""
import numpy as np

GOLDEN_ANGLE = np.pi * (3 - np.sqrt(5))
H = 1e-6


def fibonacci_sphere(n):
    """Area-uniform sample: n points, each representing 4*pi/n steradians."""
    i = np.arange(n)
    z = -1.0 + 2.0 * (i + 0.5) / n
    lat = np.arcsin(np.clip(z, -1, 1))
    lon = (i * GOLDEN_ANGLE) % (2 * np.pi) - np.pi
    return lon, lat


def jacobian(fn, lon, lat, h=H):
    """Metric-corrected 2x2 Jacobian at (lon, lat); central differences."""
    cos_phi = np.cos(lat)
    step = min(h / max(abs(cos_phi), 1e-12), 1e-3)
    x1, y1 = fn(lon + step, lat)
    x2, y2 = fn(lon - step, lat)
    c = max(abs(cos_phi), 1e-12)
    dx_dlam = (x1 - x2) / (2 * step * c)
    dy_dlam = (y1 - y2) / (2 * step * c)
    lat_up = min(np.pi / 2, lat + h)
    lat_dn = max(-np.pi / 2, lat - h)
    xu, yu = fn(lon, lat_up)
    xd, yd = fn(lon, lat_dn)
    span = lat_up - lat_dn
    dx_dphi = (xu - xd) / span
    dy_dphi = (yu - yd) / span
    return np.array([[dx_dlam, dx_dphi], [dy_dlam, dy_dphi]])


def tissot(fn, lon, lat):
    """(sigma1, sigma2, area_scale, omega_rad, rotation) at one point."""
    A = jacobian(fn, lon, lat)
    M = A.T @ A
    tr = M[0, 0] + M[1, 1]
    det = M[0, 0] * M[1, 1] - M[0, 1] ** 2
    disc = np.sqrt(max(0.0, tr * tr / 4 - det))
    s1 = np.sqrt(max(0.0, tr / 2 + disc))
    s2 = np.sqrt(max(0.0, tr / 2 - disc))
    area = s1 * s2
    omega = 2 * np.arcsin(min(1.0, max(0.0, (s1 - s2) / (s1 + s2)))) if s1 + s2 > 0 else 0.0
    # rotation of the sigma1 axis in map space
    if s1 > 1e-15 and abs(M[0, 1]) > 1e-15:
        vx, vy = M[0, 1], (s1 * s1) - M[0, 0]
        nrm = np.hypot(vx, vy)
        vx, vy = vx / nrm, vy / nrm
    else:
        vx, vy = (1.0, 0.0) if M[0, 0] >= M[1, 1] else (0.0, 1.0)
    rot = np.arctan2(A[1, 0] * vx + A[1, 1] * vy, A[0, 0] * vx + A[0, 1] * vy)
    return s1, s2, area, omega, rot


def global_metrics(fn, n=2000):
    """Area-weighted global stats over a Fibonacci sample.
    Returns dict: rms_log2_area, median/p95/max omega (deg), airy_kavrayskiy."""
    lon, lat = fibonacci_sphere(n)
    log_area = []
    omegas = []
    ak = []
    for lo, la in zip(lon, lat):
        try:
            x, y = fn(lo, la)
            if not (np.isfinite(x) and np.isfinite(y)):
                continue
            s1, s2, area, omega, _ = tissot(fn, lo, la)
            if not (0 < area < 1e6):
                continue
            log_area.append(np.log2(area))
            omegas.append(omega)
            ak.append(np.log(s1 / s2) ** 2 + np.log(area) ** 2)
        except Exception:
            continue
    om = np.array(omegas)
    return {
        "rms_log2_area": float(np.sqrt(np.mean(np.square(log_area)))),
        "median_omega_deg": float(np.degrees(np.median(om))),
        "p95_omega_deg": float(np.degrees(np.percentile(om, 95))),
        "max_omega_deg": float(np.degrees(np.max(om))),
        "airy_kavrayskiy": float(np.sqrt(np.mean(ak))),
        "samples": int(len(omegas)),
    }
`
