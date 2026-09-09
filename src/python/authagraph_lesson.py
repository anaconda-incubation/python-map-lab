# AuthaGraph, Narukawa's 2022 formulation. NumPy port of this site's
# authagraph.ts, derived from mapshaper narukawa2022 (Matthew Bloch).
# SPDX-License-Identifier: MPL-2.0
# Facet equations: https://doi.org/10.11212/jjca.60.1_1
# Rectangle arrangement follows Justin Kunimune's public Imago layout.
# This mathematical formulation is not infinitesimally equal-area.
import numpy as np


def _vector(lon, lat):
    return np.array([np.cos(lon)*np.cos(lat),
                     np.sin(lon)*np.cos(lat), np.sin(lat)])


def _wrap(angle):
    return np.where(angle > np.pi, angle - 2*np.pi,
                    np.where(angle < -np.pi, angle + 2*np.pi, angle))


def center_on(lon, lat, center_lat, center_lon):
    """Rotate a chosen place to the rectangle center, with local north up."""
    if not np.isfinite(center_lat) or not -90 <= center_lat <= 90:
        raise ValueError("Center latitude must be between -90 and 90 degrees.")
    if not np.isfinite(center_lon):
        raise ValueError("Center longitude must be finite.")

    def basis(longitude, latitude):
        center = _vector(longitude, latitude)
        east = np.array([-np.sin(longitude), np.cos(longitude), 0.0])
        north = np.cross(center, east)
        return np.column_stack((east, north, center))

    # Inverse of unfold_rectangle at x = y = 0 for the fixed Imago layout.
    # This anchor belongs to the layout, not to the user's chosen city.
    anchor = basis(*np.radians([-164.98316248910135, 32.08994303932354]))
    # Bearing at that anchor whose projected direction is straight up.
    bearing = np.radians(11.853089103808436)
    east, north, center = anchor.T
    target = np.column_stack((east*np.cos(bearing) - north*np.sin(bearing),
                              east*np.sin(bearing) + north*np.cos(bearing), center))
    source = basis(*np.radians([center_lon % 360, center_lat]))
    points = target @ source.T @ _vector(lon, lat)
    return (np.arctan2(points[1], points[0]),
            np.arcsin(np.clip(points[2], -1, 1)))


def orient_to_tetrahedron(lon, lat):
    north = _vector(*np.radians([149.4509913, 76.8810628]))
    south = _vector(*np.radians([-18.8522325, -6.6370473]))
    tangent = south - north * np.dot(south, north)
    tangent /= np.linalg.norm(tangent)
    side = np.cross(north, tangent)
    points = _vector(lon, lat)
    return (np.arctan2(side @ points, tangent @ points),
            np.arcsin(np.clip(north @ points, -1, 1)))


def choose_face(lon, lat):
    root3 = np.sqrt(3)
    # x, y, spherical latitude, longitude, meridian, plane rotation
    facets = np.array([
        [0, root3, np.pi/2, 0, 0, -np.pi/2],
        [0, -root3, -np.arcsin(1/3), 0, np.pi, np.pi/2],
        [3, 0, -np.arcsin(1/3), 2*np.pi/3, np.pi, 5*np.pi/6],
        [-3, 0, -np.arcsin(1/3), -2*np.pi/3, np.pi, np.pi/6],
    ])
    latitudes, longitudes = [], []
    for _, _, lat0, lon0, meridian, _ in facets:
        if abs(lat0 - np.pi/2) < 1e-12:
            latitude, longitude = lat, lon - lon0
        else:
            latitude = np.arcsin(np.clip(
                np.sin(lat0)*np.sin(lat)
                + np.cos(lat0)*np.cos(lat)*np.cos(lon0-lon), -1, 1))
            denominator = np.cos(latitude)
            value = np.divide(
                np.cos(lat0)*np.sin(lat)
                - np.sin(lat0)*np.cos(lat)*np.cos(lon0-lon),
                denominator, out=np.ones_like(lat), where=denominator >= 1e-12)
            longitude = np.arccos(np.clip(value, -1, 1)) - np.pi
            longitude = np.where(np.sin(lon-lon0) > 0, -longitude, longitude)
        latitudes.append(latitude)
        longitudes.append(_wrap(longitude - meridian))
    latitudes, longitudes = np.array(latitudes), np.array(longitudes)
    face = np.argmax(latitudes, axis=0)
    idx = np.arange(lon.size)
    return longitudes[face, idx], latitudes[face, idx], facets[face]


def flatten_face(lon, lat, face):
    sector = np.floor((lon + np.pi/3) / (2*np.pi/3))
    base = sector * (2*np.pi/3)
    local = lon - base
    a = local - np.arcsin(np.clip(np.sin(local)/np.sqrt(3), -1, 1))
    theta = np.arctan(2*np.sqrt(3)*a/np.pi)
    denominator = 2 + np.sqrt(2)*np.tan(lat)
    q = np.divide(2 + np.cos(local), denominator,
                  out=np.zeros_like(lat), where=denominator > 0)
    radius = q*np.sqrt(3)/np.cos(theta)
    angle = theta + face[:, 5] + base/2
    return radius*np.cos(angle) + face[:, 0], radius*np.sin(angle) + face[:, 1]


def unfold_rectangle(x, y, face):
    root3 = np.sqrt(3)
    flip_x = np.abs(x) > 3 + 1e-12
    flip_y = (~flip_x) & (np.abs(y) > root3 + 1e-12)
    x, y = np.where(flip_x, 2*face[:, 0]-x, x), np.where(flip_x, -y, y)
    x, y = np.where(flip_y, -x, x), np.where(flip_y, 2*root3*np.sign(y)-y, y)
    qx, qy = y, -x
    flip = qy > 1e-12
    qx, qy = np.where(flip, 2*root3-qx, qx), np.where(flip, -qy, qy)
    qx += 1.16
    qx = np.where(qx < 0, qx + 4*root3, qx)
    scale = np.arccos(-1/3)/2
    return np.clip(qx-2*root3, -2*root3, 2*root3)*scale, np.clip(qy+1.5, -1.5, 1.5)*scale
