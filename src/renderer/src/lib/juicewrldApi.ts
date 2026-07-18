import { Track } from '../types'
import { apiRequest } from './apiClient'
import { cacheGet } from './apiCache'
import { peekSongPref } from './songPrefs'

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
  album?: string | null
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

/** Normalizes a /files/browse/ response to a flat entry array — shared by
 *  every view that hits that endpoint (ApiFilesView, CoverPickerModal). */
export function parseBrowseEntries(data: JWApiBrowseResponse): JWApiFileEntry[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object' && 'items' in data && Array.isArray(data.items)) return data.items
  return []
}

/** Strips trailing qualifiers ("(feat. X)", "[Prod. Y]") from a song title so
 *  a /files/browse/ search hits the file tree's naming — folders/images are
 *  rarely filed under the full bracketed title. Same idea as
 *  findSessionZips' strip() below, shared with CoverPickerModal and
 *  SongPrefsSection's inline cover search. */
export function cleanTitleForSearch(title: string): string {
  return title.replace(/\s*[[(].*$/, '').trim()
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Filters /files/browse/ search results down to entries whose path contains
 *  the query as a whole word — the API's `search` param is a plain substring
 *  match, so a short title like "Rental" also turns up unrelated files like
 *  "Parental Advisory.png" (which literally contains "rental"). Shared by
 *  CoverPickerModal and SongPrefsSection's inline cover search. */
export function filterSearchResults(entries: JWApiFileEntry[], term: string): JWApiFileEntry[] {
  const t = term.trim()
  if (!t) return entries
  const re = new RegExp(`\\b${escapeRegExp(t)}\\b`, 'i')
  return entries.filter((e) => re.test(e.path))
}

// ─── Fetch util ───────────────────────────────────────────────────────────────

// Builds the same URL/cache key apiFetch uses, so apiPeek below can read the
// exact entry apiFetch wrote for a given path+params.
function apiUrl(path: string, params: Record<string, string | number | null | undefined> = {}): string {
  const url = new URL(JWAPI_BASE + path)
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v))
  }
  return url.toString()
}

export async function apiFetch<T>(
  path: string,
  params: Record<string, string | number | null | undefined> = {}
): Promise<T> {
  const cacheKey = apiUrl(path, params)
  return apiRequest<T>(cacheKey, {
    cache: 'no-store',
    cacheKey,
    parseError: async (res) => `JW API error ${res.status}`,
  })
}

// Synchronous read of the offline cache for a path+params — returns the last
// successful apiFetch response for that exact key, or undefined. Lets views do
// stale-while-revalidate: render the cached copy instantly on mount, then let
// their normal apiFetch refresh it in the background.
export function apiPeek<T>(
  path: string,
  params: Record<string, string | number | null | undefined> = {}
): T | undefined {
  return cacheGet<T>(apiUrl(path, params))
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

export function buildStreamUrl(path: string): string {
  return `${JWAPI_BASE}/files/download/?path=${encodeURIComponent(path)}`
}

export function buildCoverArtUrl(path: string): string {
  return `${JWAPI_BASE}/files/cover-art/?path=${encodeURIComponent(path)}`
}

// ─── API file → track (for liking raw file-browser entries) ───────────────────
//
// Files browsed in ApiFilesView don't correspond to a numeric song id, so they
// can't go through the favorites API — they're liked purely locally, the same
// way locally-scanned library tracks are. The path is encoded directly into the
// track id so a liked entry can be reconstructed (e.g. in LikedSongsView)
// without re-fetching the folder it came from.
const API_FILE_ID_PREFIX = 'jw-file-'

export function apiFileTrackId(path: string): string {
  return `${API_FILE_ID_PREFIX}${path}`
}

export function apiFileIdToPath(trackId: string): string | null {
  return trackId.startsWith(API_FILE_ID_PREFIX) ? trackId.slice(API_FILE_ID_PREFIX.length) : null
}

export function apiFilePathToTrack(path: string, name?: string): Track {
  const fileName = name ?? path.split('/').pop() ?? path
  const title = fileName.replace(/\.[^.]+$/, '')
  const slashIdx = path.lastIndexOf('/')
  const parent = slashIdx > 0 ? path.slice(0, slashIdx) : ''
  const album = parent.split('/').pop() ?? ''
  return {
    id: apiFileTrackId(path),
    path,
    streamUrl: buildStreamUrl(path),
    imageUrl: buildCoverArtUrl(path),
    title,
    artist: 'Juice WRLD',
    album,
    albumArtist: 'Juice WRLD',
    year: null,
    trackNumber: null,
    duration: 0,
    genre: '',
    hasAlbumArt: true,
  }
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

/** Resolves a preference's `cover_url` — a user's chosen cover, pointing into
 *  the API's own storage — to a loadable URL.
 *
 *  Three forms are accepted, because a cover can plausibly be picked from
 *  either place the app already shows images from: an absolute/data URL passes
 *  through; a leading-slash path is a site-relative asset, the same shape a
 *  song's own `image_url` uses ("/assets/youtube.webp"); anything else is
 *  treated as a path into the file storage ApiFilesView browses and goes
 *  through the cover-art endpoint. Worth re-checking against the real column
 *  once /library/preferences/ ships — this is the one place that has to know. */
export function resolvePrefCoverUrl(coverUrl: string | null | undefined): string | undefined {
  if (!coverUrl) return undefined
  if (/^(https?:|data:|blob:)/.test(coverUrl)) return coverUrl
  if (coverUrl.startsWith('/')) return buildImageUrl(coverUrl)
  return buildCoverArtUrl(coverUrl)
}

// Discord's classic (local IPC) Rich Presence only reliably applies a
// `large_url` up to roughly this many characters — longer ones get silently
// ignored, leaving the static fallback logo. There's no way to shorten the
// query path itself, since /files/cover-art/ needs the song's exact path to
// resolve the file, so this gates whether we send the per-track cover at all
// rather than sending a truncated (and broken) one.
const DISCORD_RPC_URL_LIMIT = 256

/** Cover art URL for Discord RPC: prefers the curated `image_url`, and falls
 *  back to the file's own cover art by path — but only when that URL fits
 *  under Discord's length limit. Returns undefined (static logo) otherwise. */
export function discordCoverUrl(
  imageUrl: string | null | undefined,
  path: string | null | undefined
): string | undefined {
  const curated = buildImageUrl(imageUrl)
  if (curated) return curated
  if (!path) return undefined
  const url = buildCoverArtUrl(path)
  return url.length <= DISCORD_RPC_URL_LIMIT ? url : undefined
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

// A Track is what the app plays and displays, so this is where a user's
// per-song overrides get applied — every surface (queue, player, mini player,
// Discord RPC, lists built from Tracks) then picks them up for free. The
// canonical values stay on the Track as apiTitle/apiImageUrl.
//
// JWApiSong deliberately keeps the API's own data untouched: the editor views
// work from that shape, so an editor never sees another user's personal rename
// in a field they might propose upstream.
export function songToTrack(song: JWApiSong): Track {
  const apiTitle = song.track_titles?.[0] || song.name
  const apiImageUrl = buildImageUrl(song.image_url)
  const pref = peekSongPref(song.id)
  const coverUrl = resolvePrefCoverUrl(pref?.cover_url)
  return {
    id: `jw-${song.id}`,
    path: song.path,
    streamUrl: buildStreamUrl(song.path),
    imageUrl: coverUrl ?? apiImageUrl,
    title: pref?.name || apiTitle,
    apiTitle,
    apiImageUrl,
    artist: song.credited_artists || 'Juice WRLD',
    album: song.album || song.era?.name || '',
    era: song.era?.name || undefined,
    albumArtist: 'Juice WRLD',
    year: null,
    trackNumber: null,
    duration: parseDuration(song.length),
    genre: song.category,
    hasAlbumArt: !!song.image_url || !!coverUrl,
  }
}

// ─── Category display ─────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<string, string> = {
  released: 'Released',
  unreleased: 'Unreleased',
  unsurfaced: 'Unsurfaced',
  recording_session: 'Session',
}
