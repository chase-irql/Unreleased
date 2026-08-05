import { JWAPI_BASE } from './juicewrldApi'
import { apiRequest } from './apiClient'
import { getToken } from './userApi'
import type { DailyMode, Guess, GameStatus, HeardleSong } from './heardle'

export const HEARDLE_LEADERBOARD_ENABLED = true

const HEARDLE_BASE = `${JWAPI_BASE}/heardle`
const API_ORIGIN = JWAPI_BASE.replace(/\/juicewrld\/?$/, '')

export type LeaderboardBoard = 'today' | 'streak' | 'versus'

export interface LeaderboardEntry {
  rank: number
  user_id: number
  display_name: string
  discord_avatar?: string | null
  guesses?: number | null
  won?: boolean
  current_streak?: number
  max_streak?: number
  played?: number
  lost?: number
  drawn?: number
  win_rate?: number
}

export interface LeaderboardResponse {
  board: LeaderboardBoard
  mode: DailyMode | 'versus'
  day: string
  entries: LeaderboardEntry[]
  me?: LeaderboardEntry | null
}

export interface PuzzleResponse {
  round_token: string
  day: string
  mode: DailyMode
  puzzle_number: number | null
  tries: number
  ladder: number[]
  clip_url: string
  clip_start: number
  status: GameStatus
  guesses: Guess[]
  reveal?: HeardleSong
}

export interface ResultSubmission {
  day: string
  mode: DailyMode
  song_id: number
  guesses: number
  won: boolean
  guess_song_ids: (number | null)[]
}

function authed<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Token ${token}`
  return apiRequest<T>(url, { ...options, headers: { ...headers, ...(options.headers as Record<string, string>) } })
}

export function absoluteClipUrl(relative: string): string {
  if (relative.startsWith('http')) return relative
  return `${API_ORIGIN}${relative}`
}

export async function startPuzzle(mode: DailyMode, day: string): Promise<PuzzleResponse> {
  return authed<PuzzleResponse>(`${HEARDLE_BASE}/puzzle/`, {
    method: 'POST',
    body: JSON.stringify({ mode, day }),
  })
}

export async function submitGuess(roundToken: string, songId: number): Promise<PuzzleResponse> {
  return authed<PuzzleResponse>(`${HEARDLE_BASE}/guess/`, {
    method: 'POST',
    body: JSON.stringify({ round_token: roundToken, song_id: songId }),
  })
}

export async function skipGuess(roundToken: string): Promise<PuzzleResponse> {
  return authed<PuzzleResponse>(`${HEARDLE_BASE}/skip/`, {
    method: 'POST',
    body: JSON.stringify({ round_token: roundToken }),
  })
}

const OUTBOX_KEY = 'unreleased:heardle:outbox'
const OUTBOX_LIMIT = 60

function readOutbox(): ResultSubmission[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY)
    const parsed = raw ? (JSON.parse(raw) as ResultSubmission[]) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeOutbox(items: ResultSubmission[]): void {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(items.slice(-OUTBOX_LIMIT)))
  } catch {}
}

export function outboxSize(): number {
  return readOutbox().length
}

function enqueue(result: ResultSubmission): void {
  const rest = readOutbox().filter((r) => !(r.day === result.day && r.mode === result.mode))
  writeOutbox([...rest, result])
}

export async function submitResult(result: ResultSubmission): Promise<void> {
  if (!HEARDLE_LEADERBOARD_ENABLED || !getToken()) {
    enqueue(result)
    return
  }
  try {
    await authed<unknown>(`${HEARDLE_BASE}/results/`, {
      method: 'POST',
      body: JSON.stringify(result),
    })
  } catch {
    enqueue(result)
  }
}

export async function flushResults(): Promise<void> {
  if (!HEARDLE_LEADERBOARD_ENABLED || !getToken()) return
  let pending = readOutbox()
  while (pending.length > 0) {
    const [next, ...rest] = pending
    try {
      await authed<unknown>(`${HEARDLE_BASE}/results/`, {
        method: 'POST',
        body: JSON.stringify(next),
      })
    } catch {
      break
    }
    pending = rest
    writeOutbox(pending)
  }
}

export async function fetchLeaderboard(
  board: LeaderboardBoard,
  mode: DailyMode | 'versus',
  day: string,
): Promise<LeaderboardResponse> {
  const url = new URL(`${HEARDLE_BASE}/leaderboard/`)
  url.searchParams.set('board', board)
  if (board !== 'versus') url.searchParams.set('mode', mode)
  url.searchParams.set('day', day)
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Token ${token}`
  return apiRequest<LeaderboardResponse>(url.toString(), { headers })
}
