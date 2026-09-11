import numpy as np

central_meridian = 0  # degrees; east positive

def project(lon, lat):
    lon = (lon - np.radians(central_meridian) + np.pi) % (2 * np.pi) - np.pi
    # Solve 2*theta + sin(2*theta) = pi*sin(latitude).
    # Bisection is slower than Newton's method, but stays inside the bracket
    # and avoids division by a derivative that vanishes at the poles.
    low = np.full_like(lat, -np.pi / 2, dtype=float)
    high = np.full_like(lat, np.pi / 2, dtype=float)
    target = np.pi * np.sin(lat)
    for _ in range(50):
        theta = (low + high) / 2
        below = 2 * theta + np.sin(2 * theta) < target
        low = np.where(below, theta, low)
        high = np.where(below, high, theta)
    theta = (low + high) / 2
    # At a pole all longitudes meet at one point.
    pole = np.abs(lat) >= np.pi / 2 - 1e-12
    x = 2 * np.sqrt(2) / np.pi * lon * np.cos(theta)
    y = np.sqrt(2) * np.sin(theta)
    return np.where(pole, 0, x), np.where(pole, np.sign(lat) * np.sqrt(2), y)
