// Persistent (localStorage-backed) cache for GET API responses. When a
// request fails at the network level (offline, DNS failure, etc.) callers
// fall back to the last successful response for that same key instead of
// erroring out, so the app stays browsable/listenable without a connection.
// HTTP-level errors (4xx/5xx) are NOT covered here — those are real server
// responses, not offline symptoms, and should surface as-is.

const PREFIX = 'unreleased:apicache:'
const MAX_ENTRIES = 300

interface CacheEntry<T> {
  data: T
  ts: number
}

function cacheKeys(): string[] {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(PREFIX)) keys.push(k)
  }
  return keys
}

function evictOldest(count: number): void {
  const entries = cacheKeys().map((k) => {
    try {
      const { ts } = JSON.parse(localStorage.getItem(k) as string) as CacheEntry<unknown>
      return { k, ts }
    } catch {
      return { k, ts: 0 }
    }
  })
  entries.sort((a, b) => a.ts - b.ts)
  for (const { k } of entries.slice(0, count)) localStorage.removeItem(k)
}

export function cacheGet<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return undefined
    return (JSON.parse(raw) as CacheEntry<T>).data
  } catch {
    return undefined
  }
}

export function cacheSet<T>(key: string, data: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ data, ts: Date.now() } as CacheEntry<T>))
  } catch {
    // Likely quota exceeded — drop the oldest third of entries and retry once.
    evictOldest(Math.max(20, Math.floor(cacheKeys().length / 3)))
    try { localStorage.setItem(PREFIX + key, JSON.stringify({ data, ts: Date.now() } as CacheEntry<T>)) } catch {}
  }
  const keys = cacheKeys()
  if (keys.length > MAX_ENTRIES) evictOldest(keys.length - MAX_ENTRIES)
}

export function cacheDelete(key: string): void {
  try { localStorage.removeItem(PREFIX + key) } catch {}
}
