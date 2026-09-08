/**
 * URL-fragment sharing + localStorage shelf for the Projection Lab
 * (design/lab.md "Naming & sharing", "Saved shelf", guardrails §6 KB cap).
 */
import type { SharePayload, ShelfEntry } from './types'

/** URL payloads are capped at 6 KB (design/lab.md guardrails). */
export const SHARE_CAP_BYTES = 6 * 1024

const SHELF_KEY = 'efmc-lab-shelf-v1'
const COUNTER_KEY = 'efmc-lab-counter'

/* ---------------- base64url JSON ---------------- */

export function encodePayload(payload: SharePayload): string {
  const json = JSON.stringify(payload)
  const bytes = new TextEncoder().encode(json)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function decodePayload(s: string): SharePayload | null {
  try {
    const b64 = s.replaceAll('-', '+').replaceAll('_', '/')
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as SharePayload
    if (parsed && parsed.v === 1 && (parsed.mode === 'design' || parsed.mode === 'python')) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

/** Returns the fragment for /lab, or null when the payload is too large. */
export function shareFragment(payload: SharePayload): string | null {
  const encoded = encodePayload(payload)
  if (encoded.length > SHARE_CAP_BYTES) return null
  return `#p=${encoded}`
}

/** Parse the current location hash: mode links or a shared projection. */
export function parseLabHash(hash: string):
  | { kind: 'mode'; mode: 'design' | 'python' }
  | { kind: 'payload'; payload: SharePayload }
  | { kind: 'none' } {
  const h = hash.replace(/^#/, '')
  if (h === 'design' || h === 'python') return { kind: 'mode', mode: h }
  if (h.startsWith('p=')) {
    const payload = decodePayload(h.slice(2))
    if (payload) return { kind: 'payload', payload }
  }
  return { kind: 'none' }
}

/* ---------------- localStorage shelf ---------------- */

export function loadShelf(): ShelfEntry[] {
  try {
    const raw = window.localStorage.getItem(SHELF_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as ShelfEntry[]
    return Array.isArray(list) ? list.filter((e) => e && e.payload) : []
  } catch {
    return []
  }
}

export function saveToShelf(entry: Omit<ShelfEntry, 'id' | 'savedAt'>): ShelfEntry[] {
  const list = loadShelf()
  const next: ShelfEntry = {
    ...entry,
    id: `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    savedAt: Date.now(),
  }
  const out = [next, ...list].slice(0, 24)
  try {
    window.localStorage.setItem(SHELF_KEY, JSON.stringify(out))
  } catch {
    /* storage full/unavailable — the entry still lives this session */
  }
  return out
}

export function deleteFromShelf(id: string): ShelfEntry[] {
  const out = loadShelf().filter((e) => e.id !== id)
  try {
    window.localStorage.setItem(SHELF_KEY, JSON.stringify(out))
  } catch {
    /* ignore */
  }
  return out
}

/** "MY PROJECTION #N" — the localStorage-backed naming counter. */
export function nextProjectionName(): string {
  let n = 1
  try {
    n = Number(window.localStorage.getItem(COUNTER_KEY) ?? '0') + 1
    window.localStorage.setItem(COUNTER_KEY, String(n))
  } catch {
    /* ignore */
  }
  return `MY PROJECTION #${n}`
}
