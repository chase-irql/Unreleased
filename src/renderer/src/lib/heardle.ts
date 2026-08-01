// Data + rules for Heardle — the "name the song from its opening seconds"
// game (see components/HeardleView).
//
// Everything here is client-side: there's no puzzle endpoint on the API, so
// the daily song is *derived* from the date instead of being handed out. Every
// client that loads the same catalogue on the same local day picks the same
// answer (see pickDailySong), which is what makes the shared score grid mean
// anything.
import { apiRequest } from './apiClient'
import { JWAPI_BASE, buildImageUrl } from './juicewrldApi'
import type { JWApiSong, JWApiPaginatedResponse } from './juicewrldApi'

// Unlocked listening window after each wrong guess/skip, in seconds. Six
// guesses total — the classic Heardle ladder, which stays tight enough that a
// first-second win feels like something.
export const STAGE_SECONDS = [1, 2, 4, 7, 11, 16]
export const MAX_GUESSES = STAGE_SECONDS.length
export const FULL_WINDOW = STAGE_SECONDS[STAGE_SECONDS.length - 1]

/** Seconds unlocked after `guessCount` wrong guesses (the whole window once
 *  the round is over). */
export function unlockedSeconds(guessCount: number, finished: boolean): number {
  if (finished) return FULL_WINDOW
  return STAGE_SECONDS[Math.min(guessCount, MAX_GUESSES - 1)]
}

// Puzzle #1. Any date before this still works (the number just goes ≤ 0), but
// nothing sensible links to those, so it doubles as the launch day.
const EPOCH = Date.UTC(2026, 7, 1) // 2026-08-01

// ─── Song shape ───────────────────────────────────────────────────────────────
//
// A trimmed-down JWApiSong. The full objects carry lyrics and every metadata
// field, ~5 KB each — fine for a page of search results, far too heavy for a
// whole-category pool we want to keep in localStorage between sessions.

export interface HeardleSong {
  id: number
  name: string
  /** Every accepted spelling: `name` plus the API's `track_titles` aliases. */
  titles: string[]
  path: string
  era: string | null
  category: string
  imageUrl?: string
  length: string
}

function slim(song: JWApiSong): HeardleSong | null {
  // No path means nothing to stream — a song that can't be played can't be
  // guessed, and it must not sit in the pool the daily answer is drawn from.
  if (!song.path) return null
  const titles = [song.name, ...(song.track_titles ?? [])].filter(Boolean)
  return {
    id: song.id,
    name: song.track_titles?.[0] || song.name,
    titles: [...new Set(titles)],
    path: song.path,
    era: song.era?.name ?? null,
    category: song.category,
    imageUrl: buildImageUrl(song.image_url),
    length: song.length,
  }
}

// ─── Title matching ───────────────────────────────────────────────────────────

/** Flattens a title for comparison/search: punctuation and casing differ
 *  constantly between a song's `name` and its `track_titles` aliases. */
export function normalizeTitle(title: string): string {
  return title.replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase()
}

/** True when a guess names the answer. Ids first, then titles: the catalogue
 *  holds several rows that are the same song under different eras/versions, and
 *  picking the "wrong" one of those out of the dropdown is not a wrong guess. */
export function isCorrectGuess(guess: HeardleSong, answer: HeardleSong): boolean {
  if (guess.id === answer.id) return true
  const wanted = new Set(answer.titles.map(normalizeTitle))
  return guess.titles.some((t) => wanted.has(normalizeTitle(t)))
}

/** Dropdown candidates for what the user has typed so far. Whole-pool
 *  substring match over every alias, prefix matches first, capped so the list
 *  stays renderable. */
export function searchPool(pool: HeardleSong[], query: string, limit = 50): HeardleSong[] {
  const q = normalizeTitle(query)
  if (!q) return []
  const starts: HeardleSong[] = []
  const contains: HeardleSong[] = []
  for (const song of pool) {
    let best = -1
    for (const t of song.titles) {
      const idx = normalizeTitle(t).indexOf(q)
      if (idx >= 0 && (best < 0 || idx < best)) best = idx
    }
    if (best === 0) starts.push(song)
    else if (best > 0) contains.push(song)
    if (starts.length >= limit) break
  }
  return [...starts, ...contains].slice(0, limit)
}

// ─── Pool loading ─────────────────────────────────────────────────────────────

export type PoolId = 'released' | 'unreleased'

export const POOL_LABELS: Record<PoolId, string> = {
  released: 'Released',
  unreleased: 'Unreleased',
}

// Deliberately NOT routed through apiFetch: that caches each raw response
// under the offline cache, and a category's worth of full song objects is
// ~0.5 MB per page — enough to evict most of the app's other cached reads.
// The slimmed pool is cached here instead, at roughly a twentieth the size.
const POOL_TTL_MS = 24 * 60 * 60 * 1000
const PAGE_SIZE = 100
const MAX_PAGES = 25

const memoryPool = new Map<PoolId, HeardleSong[]>()

interface CachedPool { ts: number; songs: HeardleSong[] }

async function fetchPool(category: PoolId): Promise<HeardleSong[]> {
  const songs: HeardleSong[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${JWAPI_BASE}/songs/?category=${category}&page=${page}&page_size=${PAGE_SIZE}`
    const data = await apiRequest<JWApiPaginatedResponse>(url)
    for (const song of data.results ?? []) {
      const s = slim(song)
      if (s) songs.push(s)
    }
    if (!data.next) break
  }
  return songs
}

/** The full playable catalogue for a category, memoised for the session and
 *  cached on disk for a day. A stale cache is served immediately and left
 *  alone — the pool only shifts when the catalogue itself grows, and a pool
 *  that changed mid-round would change the answer under the player. */
export async function loadPool(category: PoolId): Promise<HeardleSong[]> {
  const memo = memoryPool.get(category)
  if (memo) return memo

  const cached = lsGet<CachedPool>(`pool:${category}`)
  if (cached && cached.songs?.length && Date.now() - cached.ts < POOL_TTL_MS) {
    memoryPool.set(category, cached.songs)
    return cached.songs
  }

  let songs: HeardleSong[]
  try {
    songs = await fetchPool(category)
  } catch (err) {
    // Offline with a stale copy is better than no game at all.
    if (cached?.songs?.length) {
      memoryPool.set(category, cached.songs)
      return cached.songs
    }
    throw err
  }
  memoryPool.set(category, songs)
  lsSet(`pool:${category}`, { ts: Date.now(), songs } as CachedPool)
  return songs
}

// ─── Daily selection ──────────────────────────────────────────────────────────

/** Local calendar day as YYYY-MM-DD — the puzzle rolls over at the player's
 *  own midnight, so the countdown they see matches the one they feel. */
export function todayKey(d = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function dayKeyToUtc(dayKey: string): number {
  const [y, m, d] = dayKey.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** 1-based puzzle number for a day key — what the shared grid is titled with. */
export function puzzleNumber(dayKey: string): number {
  return Math.round((dayKeyToUtc(dayKey) - EPOCH) / 86_400_000) + 1
}

/** The day key before this one. */
export function previousDayKey(dayKey: string): string {
  return todayKey(new Date(dayKeyToUtc(dayKey) - 86_400_000))
}

/** Milliseconds until the local day rolls over. */
export function msUntilNextPuzzle(now = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return next.getTime() - now.getTime()
}

// FNV-1a. Not cryptographic — it just has to scatter consecutive date strings
// so consecutive days don't land on neighbouring songs.
function hash32(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** The answer for a given day. Sorted by id first so the choice never depends
 *  on the order the API happened to return pages in — two clients must agree.
 *  (Adding songs to the catalogue does shift the mapping; that only matters
 *  within a day, and the pool cache means a shift mid-day is unlikely.) */
export function pickDailySong(pool: HeardleSong[], dayKey: string): HeardleSong | null {
  if (pool.length === 0) return null
  const sorted = [...pool].sort((a, b) => a.id - b.id)
  return sorted[hash32(`heardle-${dayKey}`) % sorted.length]
}

/** The player's own answer for a given day — same idea as pickDailySong, but
 *  the seed carries a per-device id, so it's a different song from everyone
 *  else's while still being stable for the whole day. */
export function pickPersonalSong(pool: HeardleSong[], dayKey: string, seed: string): HeardleSong | null {
  if (pool.length === 0) return null
  const sorted = [...pool].sort((a, b) => a.id - b.id)
  return sorted[hash32(`heardle-${seed}-${dayKey}`) % sorted.length]
}

/** This install's personal-mode seed, minted on first use and kept forever —
 *  losing it re-rolls today's personal song. Not an identity: nothing is sent
 *  anywhere, it exists purely to be different from the next person's. */
export function playerSeed(): string {
  const saved = lsGet<string>('seed')
  if (saved) return saved
  const seed = Math.random().toString(36).slice(2) + Date.now().toString(36)
  lsSet('seed', seed)
  return seed
}

/** A random song for practice rounds. */
export function pickRandomSong(pool: HeardleSong[]): HeardleSong | null {
  if (pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

// ─── Game state ───────────────────────────────────────────────────────────────

export interface Guess {
  /** null for a skip. */
  songId: number | null
  label: string
  era: string | null
  /** Wrong guess that shares the answer's era — shown as a warm "close" hint. */
  sameEra: boolean
}

export type GameStatus = 'playing' | 'won' | 'lost'

/** The two once-a-day modes. `daily` is the same song for everyone; `personal`
 *  is the player's own. They keep separate saved rounds and separate streaks —
 *  playing one must never advance (or break) the other's. `unlimited` isn't
 *  here: practice rounds are neither saved nor counted. */
export type DailyMode = 'daily' | 'personal'

export interface RoundState {
  day: string
  answerId: number
  guesses: Guess[]
  status: GameStatus
}

export interface Stats {
  played: number
  won: number
  currentStreak: number
  maxStreak: number
  /** Wins bucketed by the guess that landed them, index 0 = first try. */
  distribution: number[]
  lastDay: string | null
}

export const EMPTY_STATS: Stats = {
  played: 0, won: 0, currentStreak: 0, maxStreak: 0,
  distribution: Array(MAX_GUESSES).fill(0), lastDay: null,
}

const LS_PREFIX = 'unreleased:heardle:'

function lsGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function lsSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value))
  } catch {}
}

/** The saved round for `dayKey`, or null when it's a new day / a different
 *  answer (the catalogue grew and the day's pick moved — start over rather
 *  than replay someone else's guesses against the wrong song). */
export function loadRound(mode: DailyMode, dayKey: string, answerId: number): RoundState | null {
  const saved = lsGet<RoundState>(`round:${mode}`)
  if (!saved || saved.day !== dayKey || saved.answerId !== answerId) return null
  return saved
}

export function saveRound(mode: DailyMode, state: RoundState): void {
  lsSet(`round:${mode}`, state)
}

export function loadStats(mode: DailyMode): Stats {
  const saved = lsGet<Stats>(`stats:${mode}`)
  if (!saved) return { ...EMPTY_STATS, distribution: Array(MAX_GUESSES).fill(0) }
  return {
    ...EMPTY_STATS,
    ...saved,
    distribution: Array.from({ length: MAX_GUESSES }, (_, i) => saved.distribution?.[i] ?? 0),
  }
}

/** Folds one finished round into that mode's saved stats. Idempotent per day —
 *  `lastDay` guards against a re-render (or a second window) counting the same
 *  result twice. */
export function recordResult(mode: DailyMode, dayKey: string, won: boolean, guessCount: number): Stats {
  const stats = loadStats(mode)
  if (stats.lastDay === dayKey) return stats

  const continues = stats.lastDay === previousDayKey(dayKey)
  const currentStreak = won ? (continues ? stats.currentStreak : 0) + 1 : 0
  const next: Stats = {
    played: stats.played + 1,
    won: stats.won + (won ? 1 : 0),
    currentStreak,
    maxStreak: Math.max(stats.maxStreak, currentStreak),
    distribution: stats.distribution.map((n, i) => (won && i === guessCount - 1 ? n + 1 : n)),
    lastDay: dayKey,
  }
  lsSet(`stats:${mode}`, next)
  return next
}

// ─── Sharing ──────────────────────────────────────────────────────────────────

/** The spoiler-free result grid: a square per guess, left to right. Personal
 *  rounds get their own title — the grid isn't comparable with anyone else's,
 *  so it shouldn't read as if it were. */
export function shareText(mode: DailyMode, dayKey: string, guesses: Guess[], status: GameStatus): string {
  const squares: string[] = guesses.map((g) => (g.songId === null ? '⬛' : '🟥'))
  if (status === 'won') squares[squares.length - 1] = '🟩'
  while (squares.length < MAX_GUESSES) squares.push('⬜')
  const title = mode === 'daily'
    ? `Unreleased Heardle #${puzzleNumber(dayKey)}`
    : `My Heardle — ${dayKey}`
  return `${title}\n\n🔊${squares.join('')}`
}
