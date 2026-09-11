import scaffold from '@/python/mollweide-scaffold.py?raw'
import { lessons } from './pythonLessons'
import { variants, experimentCode } from './experimentRecipes'

export const experimentNames = [
  'Flip the world',
  'Slide latitudes',
  'Pinch the equator',
  'Try a logarithm',
  'Make a wave',
  'Center on a place',
]
export const activities = [
  ...experimentNames.map((name, i) => ({ id: 'experiment-' + i, name })),
  { id: 'mollweide', name: 'Challenge: build Mollweide' },
]
export const destinations = [
  { id: 'globe', name: 'Start here' },
  ...lessons.map(({ id, name }) => ({ id, name })),
  { id: 'try', name: 'Try your own' },
]
export function lastActivity(): string {
  if (typeof window === 'undefined') return 'experiment-0'
  try {
    const id = sessionStorage.getItem('maps-last-activity')
    return activities.some((a) => a.id === id) ? id! : 'experiment-0'
  } catch {
    return 'experiment-0'
  }
}
export function rememberActivity(id: string) {
  try {
    sessionStorage.setItem('maps-last-activity', id)
  } catch {
    /* Optional convenience. */
  }
}
export const cities = [
  { id: 'greenwich', name: 'Greenwich', lat: 51.5, lon: 0 },
  { id: 'new-york', name: 'New York', lat: 40.7, lon: -74 },
  { id: 'tokyo', name: 'Tokyo', lat: 35.7, lon: 139.7 },
  { id: 'mumbai', name: 'Mumbai', lat: 19.1, lon: 72.9 },
]
export type Selection = { mode: 'learn' | 'experiments'; id: string; city: string }
export function readSelection(search: string, hash = ''): Selection {
  const params = new URLSearchParams(search)
  const mode =
    params.get('mode') === 'experiments' || hash === '#experiments' ? 'experiments' : 'learn'
  const allowed =
    mode === 'learn' ? ['globe', ...lessons.map((l) => l.id)] : activities.map((a) => a.id)
  const id = allowed.includes(params.get('map') ?? '') ? params.get('map')! : allowed[0]
  const city = [...cities.map((c) => c.id), 'north-pole'].includes(params.get('place') ?? '')
    ? params.get('place')!
    : ''
  const validCity =
    (mode === 'learn' && id !== 'globe' && city !== 'north-pole') ||
    (id === 'experiment-5' && ['new-york', 'tokyo', 'north-pole'].includes(city))
  return { mode, id, city: validCity ? city : '' }
}
export function selectionUrl(selection: Selection) {
  const params = new URLSearchParams({ mode: selection.mode, map: selection.id })
  if (selection.city) params.set('place', selection.city)
  return `/?${params}`
}
export function presetCode(selection: Selection) {
  if (selection.id === 'mollweide') return scaffold
  const lesson = lessons.find((l) => l.id === selection.id)
  let code =
    lesson?.code ??
    (selection.id === 'globe'
      ? ''
      : experimentCode(variants[Number(selection.id.split('-')[1])] ?? variants[0]))
  if (!selection.city) return code
  const city = cities.find((c) => c.id === selection.city) ?? {
    id: 'north-pole',
    name: 'North Pole',
    lat: 90,
    lon: 0,
  }
  if (lesson?.id === 'authagraph')
    code = code.replace(
      /^center_lat, center_lon = .+$/m,
      `center_lat, center_lon = ${city.lat}, ${city.lon}  # ${city.id}`,
    )
  else if (selection.id === 'experiment-5')
    code = code
      .replace(/^center_lat = .+$/m, `center_lat = ${city.lat}`)
      .replace(/^central_meridian = .+$/m, `central_meridian = ${city.lon}`)
  else
    code = code.replace(/^central_meridian = .+$/m, `central_meridian = ${city.lon}  # ${city.id}`)
  return code
}
export function presetId(selection: Selection) {
  return `${selection.id}${selection.city ? `-${selection.city}` : ''}`
}
export type Draft = { code: string; preset: string }
export function readDrafts(): Record<string, Draft> {
  if (typeof window === 'undefined') return {}
  try {
    const saved: unknown = JSON.parse(localStorage.getItem('maps-drafts-v1') ?? '{}')
    if (!saved || typeof saved !== 'object') return {}
    return Object.fromEntries(
      Object.entries(saved).filter(
        ([id, value]) =>
          [...lessons.map((l) => l.id), ...activities.map((a) => a.id)].includes(id) &&
          value &&
          typeof value.code === 'string' &&
          value.code.length < 100_000 &&
          typeof value.preset === 'string',
      ),
    )
  } catch {
    return {}
  }
}
export function writeDrafts(drafts: Record<string, Draft>) {
  try {
    localStorage.setItem('maps-drafts-v1', JSON.stringify(drafts))
  } catch {
    /* In-memory drafts still work. */
  }
}
