export interface ListeningPlayEvent {
  song: number
  played_at: string
}

export const SERVER_LISTENING_PLAYS_LIMIT = 10000

export function normalizeListeningPlayEvent(raw: unknown): ListeningPlayEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const song = Number(row.song)
  const played_at = typeof row.played_at === 'string' ? row.played_at.trim() : ''
  if (!Number.isFinite(song) || song <= 0 || !played_at) return null
  return { song, played_at }
}

export function capListeningPlays(events: ListeningPlayEvent[], max = SERVER_LISTENING_PLAYS_LIMIT): ListeningPlayEvent[] {
  if (events.length <= max) return events
  return [...events]
    .sort((a, b) => b.played_at.localeCompare(a.played_at))
    .slice(0, max)
}

export function mergeListeningPlays(local: ListeningPlayEvent[], server: ListeningPlayEvent[]): ListeningPlayEvent[] {
  const seen = new Set<string>()
  const out: ListeningPlayEvent[] = []
  for (const event of [...local, ...server].sort((a, b) => b.played_at.localeCompare(a.played_at))) {
    const key = `${event.song}\0${event.played_at}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(event)
  }
  return capListeningPlays(out)
}

export function appendListeningPlay(events: ListeningPlayEvent[], songId: number, at = new Date()): ListeningPlayEvent[] {
  const next = [{ song: songId, played_at: at.toISOString() }, ...events]
  return capListeningPlays(next)
}

export function filterListeningPlaysByDays(events: ListeningPlayEvent[], days: number): ListeningPlayEvent[] {
  if (days <= 0) return events
  const cutoff = Date.now() - days * 86400000
  return events.filter((event) => {
    const ts = Date.parse(event.played_at)
    return Number.isFinite(ts) && ts >= cutoff
  })
}

export function playcountsFromEvents(events: ListeningPlayEvent[]): Map<number, number> {
  const counts = new Map<number, number>()
  for (const event of events) {
    counts.set(event.song, (counts.get(event.song) ?? 0) + 1)
  }
  return counts
}

export function sortListeningPlays(events: ListeningPlayEvent[]): ListeningPlayEvent[] {
  return [...events].sort((a, b) => b.played_at.localeCompare(a.played_at))
}
