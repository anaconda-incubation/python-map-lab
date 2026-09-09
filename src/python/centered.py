import numpy as np

# Change these degrees to put your own place in the middle.
center_lat = 41.8781  # Chicago; north is positive
# Central meridian: east positive, west negative.
# Try 0 (Greenwich), -74 (New York), 140 (Tokyo), or 73 (Mumbai).
central_meridian = -87.6298  # Chicago; approximate city longitude

def project(lon, lat):
    if not -90 <= center_lat <= 90:
        raise ValueError("Center latitude must be between -90 and 90 degrees.")
    phi0, lam0 = np.radians([center_lat, central_meridian])
    delta = lon - lam0
    east = np.cos(lat) * np.sin(delta)
    north = (np.cos(phi0) * np.sin(lat)
             - np.sin(phi0) * np.cos(lat) * np.cos(delta))
    cos_c = (np.sin(phi0) * np.sin(lat)
             + np.cos(phi0) * np.cos(lat) * np.cos(delta))
    c = np.arctan2(np.hypot(east, north), cos_c)
    bearing = np.arctan2(east, north)
    x = c * np.sin(bearing)
    y = c * np.cos(bearing)
    # The opposite point has no unique bearing. Omit a tiny cap.
    visible = c < np.radians(178)
    return np.where(visible, x, np.nan), np.where(visible, y, np.nan)

## Optional distance ring: uncomment these lines and run again.
## Distances are great-circle distances on a sphere of radius 6371 km.
# ring_km = 3000
# if not 0 < ring_km <= 19000:
#     raise ValueError("Ring distance must be greater than 0 and at most 19,000 km.")
# angle = np.linspace(0, 2 * np.pi, 361)
# radius = ring_km / 6371
# map_ring = np.column_stack((radius * np.sin(angle), radius * np.cos(angle)))
# print(f"Ring: {ring_km:g} km from the center")
