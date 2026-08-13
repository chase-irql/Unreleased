// Advanced search syntax for the Tracker — field:"value" or field:value
// tokens (quotes only needed for multi-word values), mixed freely with plain
// free-text words. All tokens are AND'd together, e.g.
// `artists:"Juice WRLD" producer:nick unreleased` finds songs credited to
// Juice WRLD, produced by someone named Nick, with "unreleased" appearing
// anywhere. Matching is a case-insensitive, apostrophe-insensitive substring
// check — same leniency as the plain-text search elsewhere in the app.
//
// The API's own `searchall` param has no concept of per-field search, so
// this is entirely client-side: the Tracker falls back to fetching the whole
// (category/era-filtered) catalog whenever a query uses this syntax, then
// filters it here instead of trusting the server to have applied it.
import { CATEGORY_LABELS, JWApiSong } from './juicewrldApi'

export interface SearchToken {
  field: string | null // null = free text, matched against every field
  value: string
}

// Every alias resolves to one of these — kept as a flat switch rather than a
// map of arrays so each case can combine/derive text (e.g. era.name,
// category + its display label) instead of just reading a single property.
const KNOWN_FIELDS = new Set([
  'title', 'name', 'song',
  'artist', 'artists',
  'era',
  'category', 'cat',
  'producer', 'producers',
  'engineer', 'engineers',
  'notes', 'note',
  'album',
  'leak', 'leaktype',
  'bitrate',
  'location', 'locations', 'studio',
  'date', 'dates', 'recorded',
  'session',
  'original',
  'lyrics',
])

function stripApostrophes(s: string): string {
  return s.replace(/['’‘]/g, '')
}

function fieldText(song: JWApiSong, field: string): string {
  switch (field) {
    case 'title': case 'name': case 'song':
      return [song.name, ...(song.track_titles ?? [])].join(' ')
    case 'artist': case 'artists':
      return song.credited_artists || ''
    case 'era':
      return song.era?.name || ''
    case 'category': case 'cat':
      return [song.category, CATEGORY_LABELS[song.category]].filter(Boolean).join(' ')
    case 'producer': case 'producers':
      return song.producers || ''
    case 'engineer': case 'engineers':
      return song.engineers || ''
    case 'notes': case 'note':
      return song.notes || ''
    case 'album':
      return song.album || ''
    case 'leak': case 'leaktype':
      return song.leak_type || ''
    case 'bitrate':
      return song.bitrate || ''
    case 'location': case 'locations': case 'studio':
      return song.recording_locations || ''
    case 'date': case 'dates': case 'recorded':
      return song.record_dates || ''
    case 'session':
      return song.session_titles || ''
    case 'original':
      return song.original_key || ''
    case 'lyrics':
      return song.lyrics || ''
    default:
      return ''
  }
}

function allFieldsText(song: JWApiSong): string {
  return [
    song.name, ...(song.track_titles ?? []), song.credited_artists, song.producers,
    song.engineers, song.era?.name, song.notes, song.additional_information,
    song.session_titles, song.original_key, song.category, song.album, song.leak_type,
    song.recording_locations, song.record_dates,
  ].filter(Boolean).join(' ')
}

// Matches `field:"quoted value"`, `field:unquoted`, `"quoted free text"`, or
// a plain word — in that priority order, scanned left to right.
const TOKEN_RE = /([a-zA-Z]+):"([^"]*)"|([a-zA-Z]+):(\S+)|"([^"]*)"|(\S+)/g

// Mobile keyboards (Gboard's "smart punctuation" in particular — this is an
// Android app) rewrite a typed straight quote into a curly one regardless of
// the input's autoCorrect/autoCapitalize attributes, which are Safari-only
// hints. Without normalizing them back, `artists:"Juice WRLD"` would parse as
// unquoted (the closing curly quote isn't `"`), leaving a stray quote
// character stuck to the field value and matching nothing.
function normalizeQuotes(s: string): string {
  return s.replace(/[“”]/g, '"')
}

/** Parses a search box query into AND'd tokens. An unrecognized `field:`
 *  prefix (typo, or just a colon that wasn't meant as syntax) is treated as
 *  literal free text rather than silently dropped. */
export function parseSearchQuery(query: string): SearchToken[] {
  const q = normalizeQuotes(query.trim())
  if (!q) return []
  const tokens: SearchToken[] = []
  TOKEN_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TOKEN_RE.exec(q))) {
    if (m[1] !== undefined) {
      const field = m[1].toLowerCase()
      tokens.push(KNOWN_FIELDS.has(field) ? { field, value: m[2] } : { field: null, value: `${m[1]}:${m[2]}` })
    } else if (m[3] !== undefined) {
      const field = m[3].toLowerCase()
      tokens.push(KNOWN_FIELDS.has(field) ? { field, value: m[4] } : { field: null, value: `${m[3]}:${m[4]}` })
    } else if (m[5] !== undefined) {
      tokens.push({ field: null, value: m[5] })
    } else if (m[6] !== undefined) {
      tokens.push({ field: null, value: m[6] })
    }
  }
  return tokens.filter(t => t.value.trim() !== '')
}

/** Whether a query uses `field:value` syntax at all — callers use this to
 *  decide whether the server's plain-text `searchall` can be trusted or the
 *  catalog needs fetching in full for client-side filtering instead. */
export function hasFieldSyntax(query: string): boolean {
  return parseSearchQuery(query).some(t => t.field !== null)
}

export function matchesSearchQuery(song: JWApiSong, tokens: SearchToken[]): boolean {
  return tokens.every(({ field, value }) => {
    const haystack = stripApostrophes((field ? fieldText(song, field) : allFieldsText(song)).toLowerCase())
    return haystack.includes(stripApostrophes(value.toLowerCase()))
  })
}
