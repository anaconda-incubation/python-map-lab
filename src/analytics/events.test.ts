import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { outboundDestination, track } from './events'

const send = vi.fn()
let consent: { confirmed: boolean; purposes: { Analytics: boolean | 'Auto' } }
beforeEach(() => {
  consent = { confirmed: true, purposes: { Analytics: true } }
  vi.stubEnv('VITE_HEAP_ENABLED', 'true')
  vi.stubGlobal('window', {
    location: { protocol: 'https:', hostname: 'mapswithpython.com' },
    airgap: { getConsent: () => consent },
    heap: { track: send },
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('consent-gated named events', () => {
  it('sends only the declared properties after consent', () => {
    const properties = { notebook: 'mercator', code: 'private code', coordinates: [1, 2] }
    track('Python Run', properties)
    expect(send).toHaveBeenCalledExactlyOnceWith('Python Run', { notebook: 'mercator' })
  })
  it.each([false, 'Auto'] as const)('drops events for analytics consent %s', value => {
    consent.purposes.Analytics = value
    track('Python Run', { notebook: 'mercator' })
    expect(send).not.toHaveBeenCalled()
  })
  it('does not collect unconfirmed defaults or replay events after consent', () => {
    consent.confirmed = false
    track('Python Run', { notebook: 'mercator' })
    consent.confirmed = true
    track('Notebook Download', { notebook: 'equalEarth' })
    expect(send).toHaveBeenCalledExactlyOnceWith('Notebook Download', { notebook: 'equalEarth' })
  })
  it('stops named events immediately when consent is withdrawn', () => {
    track('Python Run', { notebook: 'mercator' })
    consent.purposes.Analytics = false
    track('Python Run Completed', { notebook: 'mercator', outcome: 'success' })
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('defaults off and excludes preview domains', () => {
    vi.stubEnv('VITE_HEAP_ENABLED', '')
    track('Python Run', { notebook: 'mercator' })
    vi.stubEnv('VITE_HEAP_ENABLED', 'true')
    window.location.hostname = 'python-map-lab.pages.dev'
    track('Python Run', { notebook: 'mercator' })
    expect(send).not.toHaveBeenCalled()
  })
  it('works when consent or analytics scripts are missing or fail', () => {
    window.airgap = undefined
    expect(() => track('Python Run', { notebook: 'mercator' })).not.toThrow()
    expect(send).not.toHaveBeenCalled()
    window.airgap = { getConsent: () => consent }
    window.heap = undefined
    expect(() => track('Python Run', { notebook: 'mercator' })).not.toThrow()
    window.heap = { track: () => { throw new Error('blocked') } }
    expect(() => track('Python Run', { notebook: 'mercator' })).not.toThrow()
  })
})

describe('outbound destinations', () => {
  const page = 'https://mapswithpython.com/#learn'
  it('removes query strings, hashes, and credentials', () => {
    expect(outboundDestination('https://user:pass@example.com/resource?code=secret#coordinates', page))
      .toBe('https://example.com/resource')
  })
  it.each(['/learn', '#experiments', 'mailto:person@example.com', 'blob:https://mapswithpython.com/123', 'javascript:void(0)'])('ignores %s', href => {
    expect(outboundDestination(href, page)).toBeNull()
  })
})
