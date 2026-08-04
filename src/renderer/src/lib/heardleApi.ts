// Heardle leaderboard data layer. The backend endpoints don't exist yet —
// every candidate path under /juicewrld/ 404s today, and the only cross-user
// read the API offers is the admin user list, so a leaderboard cannot be built
// out of what's already there. This file defines the contract the UI codes
// against, ready to flip on the moment /heardle/ ships. Same arrangement as
// lib/newsApi.
//
// Until then HEARDLE_LEADERBOARD_ENABLED keeps reads on an empty state, and
// finished rounds go to a local outbox instead of a dead route — so a player's
// results start counting from the day they played, not the day the endpoint
// lands.
//
// ── Proposed contract ────────────────────────────────────────────────────────
//
//   POST /heardle/results/            (auth: Token)
//     body: ResultSubmission
//     Upsert on (user, day, mode) — a client may resend the same result after
//     an outbox flush, and a replay must never create a second row or a second
//     streak day. Reject a day the server hasn't reached yet.
//
//   GET /heardle/leaderboard/?board=today|streak&mode=daily|personal&day=YYYY-MM-DD
//     -> LeaderboardResponse
//     `me` carries the caller's own row even when it falls outside the page,
//     so the panel can always show where you stand.
//
// ── The part that matters ────────────────────────────────────────────────────
//
// The server must own the day's answer and grade the submission itself. Right
// now the answer is derived client-side (see lib/heardle's pickDailySong), the
// whole pool is in the browser, and the round state is plain localStorage —
// so a posted score is a claim, not evidence. `guess_song_ids` is included for
// exactly this reason: it lets the server check that the guesses are real
// songs, that the winning one actually matches the day's answer, and that the
// count lines up. None of that works until the server picks the song.
import { JWAPI_BASE } from './juicewrldApi'
import { apiRequest } from './apiClient'
import { getToken } from './userApi'
import type { DailyMode } from './heardle'

/** Flip to true once the API exposes /heardle/. Everything below already
 *  speaks the intended contract, so no other change should be needed. */
export const HEARDLE_LEADERBOARD_ENABLED = false

const HEARDLE_BASE = `${JWAPI_BASE}/heardle`

/** Which ranking is being shown: today's round, or the running streak. */
export type LeaderboardBoard = 'today' | 'streak'

export interface LeaderboardEntry {
  rank: number
  user_id: number
  display_name: string
  discord_avatar?: string | null
  /** today: guesses used; null when the day was lost. */
  guesses?: number | null
  won?: boolean
  /** streak: the running counters. */
  current_streak?: number
  max_streak?: number
  played?: number
  /** 0–100. */
  win_rate?: number
}

export interface LeaderboardResponse {
  board: LeaderboardBoard
  mode: DailyMode
  day: string
  entries: LeaderboardEntry[]
  /** The caller's own row, even if it's off the end of `entries`. */
  me?: LeaderboardEntry | null
}

export interface ResultSubmission {
  day: string
  mode: DailyMode
  /** The answer this client played, so the server can reject a mismatch. */
  song_id: number
  guesses: number
  won: boolean
  /** Guessed song ids in order; null for a skip. Lets the server verify the
   *  result instead of taking the count on faith. */
  guess_song_ids: (number | null)[]
}

function assertEnabled(): void {
  if (!HEARDLE_LEADERBOARD_ENABLED) throw new Error('Leaderboards are not available yet')
}

function authed<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Token ${token}`
  return apiRequest<T>(url, { ...options, headers: { ...headers, ...(options.headers as Record<string, string>) } })
}

// ─── Outbox ───────────────────────────────────────────────────────────────────
//
// Finished rounds queue here when they can't be sent — no endpoint yet, signed
// out, or simply offline. Capped, because this can sit unsent for a long time
// and an unbounded list of every round ever played is not worth the storage.
// Oldest go first: a recent streak is what a leaderboard cares about.

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

/** Queues a result, replacing any earlier one for the same day+mode — a
 *  replayed round must not turn into two entries. */
function enqueue(result: ResultSubmission): void {
  const rest = readOutbox().filter((r) => !(r.day === result.day && r.mode === result.mode))
  writeOutbox([...rest, result])
}

/** Records a finished round for the leaderboard. Sends it when that's
 *  possible and queues it when it isn't; never throws at the caller, since a
 *  leaderboard problem must not disturb the game. */
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

/** Sends whatever is queued, oldest first, and keeps anything that fails.
 *  Stops at the first failure so a server that's down doesn't get the whole
 *  backlog thrown at it. Safe to call on every mount — a no-op when the
 *  endpoint is off, the user is signed out, or there's nothing waiting. */
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

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function fetchLeaderboard(
  board: LeaderboardBoard,
  mode: DailyMode,
  day: string,
): Promise<LeaderboardResponse> {
  assertEnabled()
  const url = new URL(`${HEARDLE_BASE}/leaderboard/`)
  url.searchParams.set('board', board)
  url.searchParams.set('mode', mode)
  url.searchParams.set('day', day)
  return authed<LeaderboardResponse>(url.toString())
}
