import centeredCode from '@/python/centered.py?raw'

export const variants: {
  name: string
  line: string
  why: string
  flipY?: boolean
  label?: string
  code?: string
  allowGaps?: boolean
}[] = [
  {
    name: 'Flip the world upside down',
    line: 'x = lon',
    label: 'y = -y',
    flipY: true,
    why: 'A minus sign in front of y reflects the map vertically: south moves to the top, north to the bottom, and east stays on the right. This is a reflection, not a 180° rotation. It preserves the original map’s areas, distances, and angle magnitudes, so Mercator’s distortion remains. North-up is a convention, not a mathematical requirement. Try the same minus sign with any of the other recipes.',
  },
  {
    name: 'Slide the latitudes',
    line: 'x = lon + lat',
    why: 'Each latitude moves sideways by a different amount. North slides right; south slides left. The world leans, and local angles change.',
  },
  {
    name: 'Pinch the equator',
    line: 'x = lon * lat',
    why: 'At latitude zero, every longitude becomes x = 0. The equator collapses to a point. South of it, the negative multiplier also reverses east and west.',
  },
  {
    name: 'Try a logarithm',
    line: 'x = lon * np.log1p(np.abs(lat))',
    why: 'log1p means log(1 + value). Taking the absolute latitude makes its input nonnegative in both hemispheres. The equator still pinches to a point, but east and west no longer reverse south of it. This is a different formula, not a repair that preserves the original map.',
  },
  {
    name: 'Make a wave',
    line: 'x = lon + 0.5 * np.sin(3 * lat)',
    why: 'A sine wave moves each latitude left and right. Meridians wiggle. One extra term changes the entire outline.',
  },
  {
    name: 'Center on a place',
    line: 'center_lat, center_lon',
    code: centeredCode,
    allowGaps: true,
    why: 'Put your place at the center of an azimuthal equidistant map. Edit center_lat and center_lon in degrees, then run. Start with Chicago, or try 90, 0 for the North Pole. Distance and compass direction from your center are preserved on the sphere; distances between other places, shapes, and areas are not. North points up at the center. The far side stretches around the rim. This example leaves out a small cap within 2° of the opposite point, where direction becomes ambiguous. Uncomment the optional ring code below the function to mark a great-circle distance in kilometres.',
  },
]
