/** Named events only. The approved Heap/Transcend installation is supplied separately. */
type Events = {
  'Projection Selected': { projection: string }
  'Experiment Selected': { experiment: string }
  'Mode Selected': { mode: 'learn' | 'experiments' }
  'Python Run': { notebook: string }
  'Python Run Completed': { notebook: string; outcome: 'success' | 'error' }
  'Notebook Download': { notebook: string }
  'Map Expanded': { view: string; expanded: boolean }
  'Outbound Click': { destination: string }
}

declare global {
  interface Window {
    heap?: { track: (name: string, properties: Record<string, unknown>) => void }
    airgap?: {
      getConsent: () => {
        confirmed: boolean
        purposes: { Analytics?: boolean | 'Auto' }
      }
    }
  }
}

const fields: { [E in keyof Events]: readonly (keyof Events[E])[] } = {
  'Projection Selected': ['projection'],
  'Experiment Selected': ['experiment'],
  'Mode Selected': ['mode'],
  'Python Run': ['notebook'],
  'Python Run Completed': ['notebook', 'outcome'],
  'Notebook Download': ['notebook'],
  'Map Expanded': ['view', 'expanded'],
  'Outbound Click': ['destination'],
}

export function track<E extends keyof Events>(name: E, properties: Events[E]) {
  try {
    // Preview builds and local testing must never contaminate production data.
    if (import.meta.env.VITE_HEAP_ENABLED !== 'true' ||
        window.location.protocol !== 'https:' ||
        !['mapswithpython.com', 'www.mapswithpython.com'].includes(window.location.hostname)) return
    const consent = window.airgap?.getConsent()
    if (!consent?.confirmed || consent.purposes.Analytics !== true) return
    // Drop unexpected properties, even if a caller bypasses TypeScript.
    const safe = Object.fromEntries(fields[name].map(key => [key, properties[key]]))
    window.heap?.track(name, safe)
  } catch {
    // Analytics failures must not interfere with a map, download, or navigation.
  }
}

export function outboundDestination(href: string, page: string): string | null {
  try {
    const url = new URL(href, page)
    if (!['https:', 'http:'].includes(url.protocol) || url.origin === new URL(page).origin) return null
    // Never transmit query parameters, fragments, credentials, or link text.
    return `${url.origin}${url.pathname}`
  } catch {
    return null
  }
}

export function installOutboundTracking() {
  const click = (event: MouseEvent) => {
    if (event.type === 'auxclick' && event.button !== 1) return
    const target = event.target
    if (!(target instanceof Element) || target.closest('.code-well')) return
    const link = target.closest<HTMLAnchorElement>('a[href]')
    if (!link || link.hasAttribute('download')) return
    const destination = outboundDestination(link.href, window.location.href)
    if (destination) track('Outbound Click', { destination })
  }
  document.addEventListener('click', click)
  document.addEventListener('auxclick', click)
  return () => {
    document.removeEventListener('click', click)
    document.removeEventListener('auxclick', click)
  }
}
