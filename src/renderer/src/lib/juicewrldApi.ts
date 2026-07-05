import { Track } from '../types'

export const JWAPI_BASE = 'https://juicewrldapi.com/juicewrld'

// ─── API Types ────────────────────────────────────────────────────────────────

export interface JWApiEra {
  id: number
  name: string
  description?: string
  time_frame?: string
}

export interface JWApiSong {
  id: number
  public_id?: number | null
  name: string
  original_key?: string | null
  track_titles: string[]
  path: string
  length: string                     // "3:59"
  credited_artists: string
  producers: string
  engineers?: string | null
  recording_locations?: string | null
  record_dates?: string | null
  bitrate?: string | null
  additional_information?: string | null
  file_names?: string | null
  instrumentals?: string | null
  instrumental_names?: string | null
  preview_date?: string | null
  release_date?: string | null
  dates?: string | null
  session_titles?: string | null
  session_tracking?: string | null
  notes?: string | null
  snippets?: unknown[]
  era: JWApiEra | null
  image_url: string | null           // relative, e.g. "/assets/youtube.webp"
  category: 'released' | 'unreleased' | 'unsurfaced' | 'recording_session'
  lyrics: string | null
  synced_lyrics: string | null
  leak_type: string | null
  date_leaked: string | null
}

export interface JWApiPaginatedResponse {
  count: number
  next: string | null
  previous: string | null
  results: JWApiSong[]
}

export interface JWApiStats {
  total_songs: number
  category_stats: {
    released: number
    unreleased: number
    unsurfaced: number
    recording_session: number
  }
  era_stats: Record<string, number>
}

export interface JWApiRadioResponse {
  title: string
  path: string
  song: JWApiSong
  size: number
  hash: string
}

export interface JWApiFileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number | null
  modified?: string | null
}

// /files/browse/ may return { items: [...] } or a flat array
export type JWApiBrowseResponse = JWApiFileEntry[] | { items: JWApiFileEntry[]; current_path?: string }

// ─── Fetch util ───────────────────────────────────────────────────────────────

export async function apiFetch<T>(
  path: string,
  params: Record<string, string | number | null | undefined> = {}
): Promise<T> {
  const url = new URL(JWAPI_BASE + path)
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v))
  }
  const res = await fetch(url.toString(), { cache: 'no-store' })
  if (!res.ok) throw new Error(`JW API error ${res.status}`)
  return res.json() as Promise<T>
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

export function buildStreamUrl(path: string): string {
  return `${JWAPI_BASE}/files/download/?path=${encodeURIComponent(path)}`
}

export function buildCoverArtUrl(path: string): string {
  return `${JWAPI_BASE}/files/cover-art/?path=${encodeURIComponent(path)}`
}

// ─── Recording session ZIP lookup ──────────────────────────────────────────────
//
// "recording_session" songs have no `path` — the actual Pro Tools/Logic
// project is a pre-built .zip sitting elsewhere in the file tree (under
// "Studio Sessions/..."), not a single streamable audio file. There's no
// field on the song object that points at it directly, so this falls back to
// /files/browse/'s recursive `search` param (matched against the song's
// name/original_key) and picks out the .zip results.
export async function findSessionZips(song: JWApiSong): Promise<JWApiFileEntry[]> {
  const term = song.original_key || song.name
  if (!term) return []
  const data = await apiFetch<JWApiBrowseResponse>('/files/browse/', { search: term })
  const entries = Array.isArray(data) ? data : (data?.items ?? [])
  const zips = entries.filter(e => e.type === 'file' && e.name.toLowerCase().endsWith('.zip'))
  if (zips.length <= 1) return zips

  // Same search term can turn up session zips for unrelated songs that
  // happen to share a prefix (e.g. "Money Hunt" vs "Money Hunt (with Dripface
  // Hottie)") — only auto-pick when exactly one candidate's name (stripped of
  // extension and any trailing parenthetical/bracket qualifier) matches the
  // song title exactly; otherwise let the caller show all candidates.
  const strip = (name: string): string => name.replace(/\.[^.]+$/, '').replace(/\s*[[(].*$/, '').trim().toLowerCase()
  const target = term.trim().toLowerCase()
  const exact = zips.filter(z => strip(z.name) === target)
  return exact.length === 1 ? exact : zips
}

export function buildImageUrl(imageUrl: string | null | undefined): string | undefined {
  if (!imageUrl) return undefined
  if (imageUrl.startsWith('http') || imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) return imageUrl
  // Relative path — ensure single leading slash
  const rel = imageUrl.startsWith('/') ? imageUrl : '/' + imageUrl
  return `https://juicewrldapi.com${rel}`
}

/** Picks the best cover URL from a playlist summary or detail object.
 *  cover_image may contain a base64 data URI; cover_image_url may be a relative path. */
export function playlistCoverUrl(p: { cover_image_url?: string | null; cover_image?: string | null }): string | undefined {
  return buildImageUrl(p.cover_image_url ?? p.cover_image ?? undefined)
}

// ─── Duration parse ───────────────────────────────────────────────────────────

/** "3:59" → 239 seconds. Returns 0 on invalid input. */
export function parseDuration(length: string | null | undefined): number {
  if (!length) return 0
  const parts = length.split(':').map(Number)
  if (parts.length === 2) {
    const [m, s] = parts
    if (!isNaN(m) && !isNaN(s)) return m * 60 + s
  }
  if (parts.length === 3) {
    const [h, m, s] = parts
    if (!isNaN(h) && !isNaN(m) && !isNaN(s)) return h * 3600 + m * 60 + s
  }
  return 0
}

// ─── Convert API song to Track ────────────────────────────────────────────────

export function songToTrack(song: JWApiSong): Track {
  const title = song.track_titles?.[0] || song.name
  const imageUrl = buildImageUrl(song.image_url)
  return {
    id: `jw-${song.id}`,
    path: song.path,
    streamUrl: buildStreamUrl(song.path),
    imageUrl,
    title,
    artist: song.credited_artists || 'Juice WRLD',
    album: song.era?.name || '',
    albumArtist: 'Juice WRLD',
    year: null,
    trackNumber: null,
    duration: parseDuration(song.length),
    genre: song.category,
    hasAlbumArt: !!song.image_url,
  }
}

// ─── Radio: build a queue of random songs ─────────────────────────────────────

const RADIO_QUEUE_SIZE = 14

export async function buildRandomQueue(): Promise<JWApiSong[]> {
  const PLAYABLE = ['released', 'unreleased'] as const
  const countResults = await Promise.all(
    PLAYABLE.map((cat) => apiFetch<JWApiPaginatedResponse>('/songs/', { category: cat, page_size: 1 }))
  )
  const totals = countResults.map((r) => r.count)

  const fetches: Promise<JWApiSong | null>[] = []
  for (let i = 0; i < RADIO_QUEUE_SIZE; i++) {
    const catIdx = Math.floor(Math.random() * PLAYABLE.length)
    const category = PLAYABLE[catIdx]
    const total = totals[catIdx]
    if (total === 0) continue
    const offset = Math.floor(Math.random() * total)
    fetches.push(
      apiFetch<JWApiPaginatedResponse>('/songs/', { category, page_size: 1, offset })
        .then((r) => r.results[0] ?? null)
        .catch(() => null)
    )
  }

  const results = await Promise.all(fetches)
  const songs = results.filter((s): s is JWApiSong => !!s && !!s.path)
  // Fisher-Yates shuffle
  for (let i = songs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [songs[i], songs[j]] = [songs[j], songs[i]]
  }
  return songs
}

// ─── Category display ─────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<string, string> = {
  released: 'Released',
  unreleased: 'Unreleased',
  unsurfaced: 'Unsurfaced',
  recording_session: 'Session',
}
