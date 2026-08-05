import { getToken } from './userApi'
import { JWAPI_BASE } from './juicewrldApi'
import { apiRequest } from './apiClient'
import type { Guess, GameStatus, HeardleSong } from './heardle'
import { absoluteClipUrl, type PuzzleResponse } from './heardleApi'

const MATCH_QUEUE_URL = `${JWAPI_BASE}/heardle/match/queue/`

export interface MatchEndReveal {
  id: number
  name: string
  titles?: string[]
  era?: string | null
  category?: string
  imageUrl?: string
  length?: string
}

export type MatchPhase = 'idle' | 'queue' | 'matched' | 'playing' | 'ended'

export interface MatchEndPayload {
  type: 'match_end'
  winner_id?: number | null
  drawn?: boolean
  reason?: string
  user_id?: number
  my_guess_count?: number
  opponent_guess_count?: number
  reveal?: MatchEndReveal | null
}

function wsOrigin(): string {
  const env = import.meta.env.VITE_JWAPI_WS as string | undefined
  if (env) return env.replace(/\/$/, '')
  const apiRoot = JWAPI_BASE.replace(/\/juicewrld\/?$/, '')
  return apiRoot.replace(/^http/, 'ws')
}

export interface OpponentProgress {
  user_id: number
  guess_count: number
  status: GameStatus
}

export interface HeardleMatchCallbacks {
  onConnected?: () => void
  onQueueWaiting?: () => void
  onQueueError?: (message: string) => void
  onGuessError?: (message: string) => void
  onMatched: (matchId: string, round?: PuzzleResponse) => void
  onRound: (round: PuzzleResponse) => void
  onOpponent: (progress: OpponentProgress) => void
  onEnd: (payload: MatchEndPayload) => void
  onError: (message: string) => void
}

let socket: WebSocket | null = null
let pendingQueueJoin = false
let pendingMatchAck: string | null = null

function wsUrl(): string {
  const token = getToken()
  const base = `${wsOrigin()}/juicewrld/ws/heardle/match/`
  return token ? `${base}?token=${encodeURIComponent(token)}` : base
}

function flushPending(): void {
  if (socket?.readyState !== WebSocket.OPEN) return
  if (pendingMatchAck) {
    socket.send(JSON.stringify({ type: 'match_ack', match_id: pendingMatchAck }))
    pendingMatchAck = null
  }
  if (pendingQueueJoin) {
    pendingQueueJoin = false
    socket.send(JSON.stringify({ type: 'queue_join' }))
  }
}

export function connectMatchSocket(callbacks: HeardleMatchCallbacks, userId?: number): () => void {
  if (socket) {
    try { socket.close() } catch {}
    socket = null
  }
  pendingQueueJoin = false
  const ws = new WebSocket(wsUrl())
  socket = ws
  ws.onopen = () => {
    callbacks.onConnected?.()
    flushPending()
  }
  ws.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data as string) as Record<string, unknown>
      const type = data.type as string
      if (type === 'connected') return
      if (type === 'queue_waiting') {
        callbacks.onQueueWaiting?.()
        return
      }
      if (type === 'queue_error') {
        callbacks.onQueueError?.(String(data.message ?? 'Queue failed'))
        return
      }
      if (type === 'guess_error') {
        callbacks.onGuessError?.(String(data.message ?? 'Guess failed'))
        return
      }
      if (type === 'matched') {
        callbacks.onMatched(String(data.match_id), data.round as PuzzleResponse | undefined)
        return
      }
      if (type === 'guess_update') {
        const progress = {
          user_id: Number(data.user_id),
          guess_count: Number(data.guess_count),
          status: data.status as GameStatus,
        }
        if (userId && progress.user_id === userId) {
          if (data.round) callbacks.onRound(data.round as PuzzleResponse)
        } else {
          callbacks.onOpponent(progress)
        }
        return
      }
      if (type === 'match_end') {
        callbacks.onEnd(data as unknown as MatchEndPayload)
        return
      }
    } catch {
      callbacks.onError('Invalid match message')
    }
  }
  ws.onerror = () => callbacks.onError('Connection error')
  ws.onclose = () => {
    if (socket === ws) socket = null
  }
  return () => {
    pendingQueueJoin = false
    pendingMatchAck = null
    if (socket === ws) {
      try { ws.close() } catch {}
      socket = null
    }
  }
}

export function sendQueueJoin(): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'queue_join' }))
  } else {
    pendingQueueJoin = true
  }
}

export function sendQueueLeave(): void {
  pendingQueueJoin = false
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'queue_leave' }))
  }
}

export function sendLeaveMatch(): void {
  pendingMatchAck = null
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'leave_match' }))
  }
}

export function sendMatchGuess(songId: number | null, skip = false, matchId?: string | null): void {
  if (socket?.readyState !== WebSocket.OPEN) return
  const payload: Record<string, unknown> = { type: 'guess', song_id: songId, skip }
  if (matchId) payload.match_id = matchId
  socket.send(JSON.stringify(payload))
}

export function ackMatchSocket(matchId: string): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'match_ack', match_id: matchId }))
    pendingMatchAck = null
  } else {
    pendingMatchAck = matchId
  }
}

export interface MatchQueuePollResult {
  queued: boolean
  matchId?: string
  round?: PuzzleResponse
}

export async function pollMatchQueue(): Promise<MatchQueuePollResult> {
  const token = getToken()
  if (!token) return { queued: true }
  const data = await apiRequest<{ queued: boolean; match_id?: string; round?: PuzzleResponse }>(
    MATCH_QUEUE_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Token ${token}` },
    },
  )
  return {
    queued: Boolean(data.queued),
    matchId: data.match_id,
    round: data.round,
  }
}

export async function leaveMatchQueueRest(): Promise<void> {
  const token = getToken()
  if (!token) return
  await apiRequest(MATCH_QUEUE_URL, {
    method: 'DELETE',
    headers: { Authorization: `Token ${token}` },
  })
}

export function puzzleFromMatchRound(round: PuzzleResponse): {
  roundToken: string
  clipUrl: string
  clipStart: number
  guesses: Guess[]
  status: GameStatus
  reveal: HeardleSong | null
  ladder: number[]
} {
  return {
    roundToken: round.round_token,
    clipUrl: absoluteClipUrl(round.clip_url),
    clipStart: round.clip_start,
    guesses: round.guesses ?? [],
    status: round.status,
    reveal: round.reveal ?? null,
    ladder: round.ladder ?? [],
  }
}
