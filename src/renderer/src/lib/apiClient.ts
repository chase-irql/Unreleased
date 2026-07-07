// Shared HTTP layer for both juicewrldApi.ts and userApi.ts — one place that
// does the fetch, the offline-cache fallback, and error parsing, so neither
// caller has to reimplement any of it.
import { cacheGet, cacheSet } from './apiCache'

async function defaultParseError(res: Response): Promise<string> {
  try {
    const body = await res.json()
    if (typeof body === 'string') return body
    if (body.detail) return String(body.detail)
    const firstKey = Object.keys(body)[0]
    if (firstKey) {
      const val = body[firstKey]
      return Array.isArray(val) ? String(val[0]) : String(val)
    }
  } catch {}
  return `Request failed (${res.status})`
}

export interface ApiRequestOptions extends RequestInit {
  // Opts a GET into the offline fallback cache — pass only for idempotent
  // reads whose staleness is acceptable (playlists, favorites, profile,
  // song/browse data). On a network-level failure (offline, DNS, etc.) the
  // last successful response for this key is returned instead of throwing.
  // HTTP-level errors (4xx/5xx) are real responses and always throw — they
  // never fall back to cache.
  cacheKey?: string
  parseError?: (res: Response) => Promise<string>
}

export async function apiRequest<T>(url: string, options: ApiRequestOptions = {}): Promise<T> {
  const { cacheKey, parseError = defaultParseError, ...init } = options

  let res: Response
  try {
    res = await fetch(url, init)
  } catch (err) {
    if (cacheKey) {
      const cached = cacheGet<T>(cacheKey)
      if (cached !== undefined) return cached
    }
    throw err
  }

  if (!res.ok) throw new Error(await parseError(res))
  if (res.status === 204) return undefined as T

  const text = await res.text()
  const data = (text ? JSON.parse(text) : undefined) as T
  if (cacheKey) cacheSet(cacheKey, data)
  return data
}

export { cacheDelete } from './apiCache'
