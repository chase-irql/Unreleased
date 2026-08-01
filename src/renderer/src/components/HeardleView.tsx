import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft, Play, Pause, SkipForward, Search, X, Check, Music2,
  BarChart3, Share2, RefreshCw, AlertCircle, Loader2, Volume2,
} from 'lucide-react'
import { useStorePick } from '../store/useStore'
import { apiFetch, songToTrack, buildStreamUrl, CATEGORY_LABELS } from '../lib/juicewrldApi'
import type { JWApiSong } from '../lib/juicewrldApi'
import {
  STAGE_SECONDS, MAX_GUESSES, FULL_WINDOW, POOL_LABELS,
  loadPool, pickDailySong, pickPersonalSong, pickRandomSong, playerSeed,
  searchPool, isCorrectGuess,
  todayKey, puzzleNumber, msUntilNextPuzzle, unlockedSeconds,
  loadRound, saveRound, loadStats, recordResult, shareText,
} from '../lib/heardle'
import type { HeardleSong, Guess, GameStatus, PoolId, Stats, DailyMode } from '../lib/heardle'

type Mode = DailyMode | 'unlimited'

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'daily', label: 'Daily', hint: 'One song a day — the same one for everyone' },
  { id: 'personal', label: 'Personal', hint: 'One song a day, picked just for you' },
  { id: 'unlimited', label: 'Unlimited', hint: 'Random songs, play as many as you like' },
]

function formatSeconds(s: number): string {
  const clamped = Math.max(0, s)
  return `0:${String(Math.floor(clamped)).padStart(2, '0')}`
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

/** The listening window: filled = unlocked, the brighter overlay = the
 *  playhead, ticks = where each remaining guess would take you. */
function ProgressBar({ unlocked, elapsed }: { unlocked: number; elapsed: number }) {
  return (
    <div className="relative h-2.5 w-full rounded-full bg-[var(--surface-overlay)] overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 bg-accent/25"
        style={{ width: `${(unlocked / FULL_WINDOW) * 100}%` }}
      />
      <div
        className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-75 ease-linear"
        style={{ width: `${(Math.min(elapsed, unlocked) / FULL_WINDOW) * 100}%` }}
      />
      {STAGE_SECONDS.slice(0, -1).map((s) => (
        <span
          key={s}
          className="absolute top-0 bottom-0 w-px bg-[var(--surface)]/70"
          style={{ left: `${(s / FULL_WINDOW) * 100}%` }}
        />
      ))}
    </div>
  )
}

/** One of the six slots — empty, a skip, a wrong guess, or the winning one.
 *  Only the final guess of a won round is `correct`. */
function GuessRow({ guess, index, correct }: { guess: Guess | undefined; index: number; correct: boolean }) {
  if (!guess) {
    return (
      <div className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)]/40 flex items-center px-3">
        <span className="text-xs text-text-muted">{index + 1}</span>
      </div>
    )
  }
  const skipped = guess.songId === null
  return (
    <div
      className={`h-10 rounded-lg border flex items-center gap-2 px-3 ${
        correct
          ? 'border-accent/50 bg-accent/15 text-text-primary'
          : skipped
            ? 'border-[var(--border)] bg-[var(--surface-raised)]/40 text-text-muted'
            : guess.sameEra
              ? 'border-amber-500/40 bg-amber-500/10 text-text-primary'
              : 'border-[var(--border)] bg-[var(--surface-raised)] text-text-primary'
      }`}
    >
      {correct
        ? <Check size={14} className="shrink-0 text-accent" />
        : skipped
          ? <SkipForward size={14} className="shrink-0" />
          : <X size={14} className="shrink-0 text-red-400" />}
      <span className="text-sm truncate">{skipped ? 'Skipped' : guess.label}</span>
      {!correct && !skipped && guess.sameEra && (
        <span className="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-widest text-amber-400">
          Same era
        </span>
      )}
    </div>
  )
}

/** Streaks are per-mode, so the panel is too — it reads straight from storage
 *  on open rather than mirroring the round's state. */
function StatsPanel({ initialMode, onClose }: { initialMode: DailyMode; onClose: () => void }) {
  const [tab, setTab] = useState<DailyMode>(initialMode)
  const stats: Stats = useMemo(() => loadStats(tab), [tab])
  const max = Math.max(1, ...stats.distribution)
  const winRate = stats.played ? Math.round((stats.won / stats.played) * 100) : 0
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 size={16} className="text-accent" />
          <h2 className="text-text-primary font-bold">Statistics</h2>
          <button onClick={onClose} className="ml-auto p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden mb-4">
          {(['daily', 'personal'] as DailyMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setTab(m)}
              className={`flex-1 px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                tab === m ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-2 mb-5 text-center">
          {[
            { label: 'Played', value: stats.played },
            { label: 'Win %', value: winRate },
            { label: 'Streak', value: stats.currentStreak },
            { label: 'Best', value: stats.maxStreak },
          ].map((s) => (
            <div key={s.label}>
              <div className="text-text-primary text-xl font-bold">{s.value}</div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          {stats.distribution.map((n, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-3 text-xs text-text-muted">{i + 1}</span>
              <div className="flex-1 h-5 rounded bg-[var(--surface-overlay)] overflow-hidden">
                <div
                  className="h-full bg-accent/70 flex items-center justify-end px-1.5"
                  style={{ width: `${Math.max(6, (n / max) * 100)}%` }}
                >
                  <span className="text-[10px] font-bold text-white">{n}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── View ─────────────────────────────────────────────────────────────────────

export default function HeardleView(): JSX.Element {
  const { setActiveView, playTrack, setIsPlaying, isPlaying, volume } = useStorePick(
    'setActiveView', 'playTrack', 'setIsPlaying', 'isPlaying', 'volume')

  const [mode, setMode] = useState<Mode>('daily')
  const [poolId, setPoolId] = useState<PoolId>('released')
  const [pool, setPool] = useState<HeardleSong[]>([])
  const [poolLoading, setPoolLoading] = useState(true)
  const [poolError, setPoolError] = useState<string | null>(null)

  const [answer, setAnswer] = useState<HeardleSong | null>(null)
  const [guesses, setGuesses] = useState<Guess[]>([])
  const [status, setStatus] = useState<GameStatus>('playing')

  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [audioError, setAudioError] = useState(false)

  const [showStats, setShowStats] = useState(false)
  const [countdown, setCountdown] = useState(() => msUntilNextPuzzle())
  const [copied, setCopied] = useState(false)

  // Both once-a-day modes use the released catalogue: the shared score only
  // means something if the pool is the same, and pinning the personal one to
  // the same pool stops a pool switch from re-rolling the day's song (which
  // would make its streak worthless). The pool picker is unlimited-only.
  const isDaily = mode !== 'unlimited'
  const dailyMode: DailyMode = mode === 'personal' ? 'personal' : 'daily'
  const activePool: PoolId = isDaily ? 'released' : poolId
  const day = useMemo(() => todayKey(), [])
  const finished = status !== 'playing'
  const unlocked = unlockedSeconds(guesses.length, finished)

  const audioRef = useRef<HTMLAudioElement>(null)
  const rafRef = useRef<number | null>(null)
  const limitRef = useRef(unlocked)
  useEffect(() => { limitRef.current = unlocked }, [unlocked])

  // ── Pool ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setPoolLoading(true)
    setPoolError(null)
    loadPool(activePool)
      .then((songs) => { if (!cancelled) { setPool(songs); setPoolLoading(false) } })
      .catch((err: Error) => { if (!cancelled) { setPoolError(err.message); setPoolLoading(false) } })
    return () => { cancelled = true }
  }, [activePool])

  // ── Round setup ────────────────────────────────────────────────────────────
  // Daily restores whatever was already guessed today; unlimited always starts
  // a fresh random round when the pool (or the mode) changes.
  useEffect(() => {
    if (pool.length === 0) return
    if (isDaily) {
      const song = dailyMode === 'personal'
        ? pickPersonalSong(pool, day, playerSeed())
        : pickDailySong(pool, day)
      if (!song) return
      setAnswer(song)
      const saved = loadRound(dailyMode, day, song.id)
      setGuesses(saved?.guesses ?? [])
      setStatus(saved?.status ?? 'playing')
    } else {
      setAnswer(pickRandomSong(pool))
      setGuesses([])
      setStatus('playing')
    }
    setQuery('')
    setElapsed(0)
  }, [pool, isDaily, dailyMode, day])

  // Persist the round after every guess.
  useEffect(() => {
    if (!isDaily || !answer) return
    saveRound(dailyMode, { day, answerId: answer.id, guesses, status })
  }, [isDaily, dailyMode, answer, day, guesses, status])

  // Fold a finished round into that mode's stats (once — see recordResult's
  // lastDay guard).
  useEffect(() => {
    if (!isDaily || status === 'playing') return
    recordResult(dailyMode, day, status === 'won', guesses.length)
  }, [isDaily, dailyMode, status, day, guesses.length])

  useEffect(() => {
    if (!finished) return
    const id = setInterval(() => setCountdown(msUntilNextPuzzle()), 1000)
    return () => clearInterval(id)
  }, [finished])

  // ── Playback ───────────────────────────────────────────────────────────────
  // A dedicated element rather than the app's player: this has to start at 0,
  // cut off mid-song, and never touch the queue or what the user was listening
  // to. It's deliberately outside the Web Audio effects chain too — the EQ
  // shouldn't colour the clue.
  const stopPlayback = useCallback((): void => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    const audio = audioRef.current
    if (audio) { audio.pause(); audio.currentTime = 0 }
    setPlaying(false)
    setElapsed(0)
  }, [])

  const tick = useCallback((): void => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.currentTime >= limitRef.current) { stopPlayback(); return }
    setElapsed(audio.currentTime)
    rafRef.current = requestAnimationFrame(tick)
  }, [stopPlayback])

  const startPlayback = useCallback((): void => {
    const audio = audioRef.current
    if (!audio) return
    // Two things playing at once makes the clue unlistenable — yield the room.
    if (isPlaying) setIsPlaying(false)
    setAudioError(false)
    audio.volume = volume
    audio.currentTime = 0
    audio.play()
      .then(() => { setPlaying(true); rafRef.current = requestAnimationFrame(tick) })
      .catch(() => { setAudioError(true); setPlaying(false) })
  }, [isPlaying, setIsPlaying, volume, tick])

  // New answer → new source, and never carry playback across rounds.
  useEffect(() => {
    stopPlayback()
    const audio = audioRef.current
    if (audio && answer) audio.src = buildStreamUrl(answer.path)
    setAudioError(false)
  }, [answer, stopPlayback])

  useEffect(() => stopPlayback, [stopPlayback])

  // ── Guessing ───────────────────────────────────────────────────────────────
  const suggestions = useMemo(
    () => (query.trim() ? searchPool(pool, query, 50) : []),
    [pool, query])

  useEffect(() => { setHighlighted(0) }, [query])

  const commitGuess = (guess: Guess): void => {
    stopPlayback()
    const next = [...guesses, guess]
    setGuesses(next)
    if (next.length >= MAX_GUESSES) setStatus('lost')
    setQuery('')
    setDropdownOpen(false)
  }

  const submitGuess = (song: HeardleSong): void => {
    if (!answer || finished) return
    if (isCorrectGuess(song, answer)) {
      stopPlayback()
      setGuesses((prev) => [...prev, { songId: song.id, label: song.name, era: song.era, sameEra: false }])
      setStatus('won')
      setQuery('')
      setDropdownOpen(false)
      return
    }
    commitGuess({
      songId: song.id,
      label: song.name,
      era: song.era,
      sameEra: !!song.era && song.era === answer.era,
    })
  }

  const skip = (): void => {
    if (!answer || finished) return
    commitGuess({ songId: null, label: 'Skipped', era: null, sameEra: false })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((i) => Math.min(i + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const s = suggestions[highlighted]; if (s) submitGuess(s) }
    else if (e.key === 'Escape') { setDropdownOpen(false) }
  }

  // ── Reveal actions ─────────────────────────────────────────────────────────
  // The pool is slimmed down, so hand the player the real song object (user
  // renames, preferred version, cover overrides all live on it).
  const playFullSong = async (): Promise<void> => {
    if (!answer) return
    stopPlayback()
    try {
      const song = await apiFetch<JWApiSong>(`/songs/${answer.id}/`)
      playTrack(songToTrack(song))
    } catch {
      setAudioError(true)
    }
  }

  const share = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(shareText(dailyMode, day, guesses, status))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const newRound = (): void => {
    stopPlayback()
    setAnswer(pickRandomSong(pool))
    setGuesses([])
    setStatus('playing')
    setQuery('')
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--surface)]">
      <audio ref={audioRef} preload="auto" onError={() => setAudioError(true)} />

      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveView('wrld')}
            title="Back"
            className="p-1 -ml-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors shrink-0"
          >
            <ChevronLeft size={18} />
          </button>
          <h1 className="text-text-primary text-xl font-bold">Heardle</h1>
          {mode === 'daily' && (
            <span className="text-xs text-text-muted font-semibold">#{puzzleNumber(day)}</span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <div className="flex rounded-lg border border-[var(--border)] overflow-hidden mr-1">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  title={m.hint}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                    mode === m.id ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowStats(true)}
              title="Statistics"
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors"
            >
              <BarChart3 size={16} />
            </button>
          </div>
        </div>
        {/* The three modes are easy to confuse at a glance, so say which one
            you're in rather than leaving it to the button labels. */}
        {isDaily && (
          <p className="text-xs text-text-muted mt-2">{MODES.find((m) => m.id === mode)?.hint}</p>
        )}
        {mode === 'unlimited' && (
          <div className="flex items-center gap-1 mt-3">
            {(Object.keys(POOL_LABELS) as PoolId[]).map((p) => (
              <button
                key={p}
                onClick={() => setPoolId(p)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  poolId === p
                    ? 'border-accent/50 bg-accent/15 text-accent'
                    : 'border-[var(--border)] text-text-muted hover:text-text-primary'
                }`}
              >
                {POOL_LABELS[p]}
              </button>
            ))}
            <button
              onClick={newRound}
              disabled={pool.length === 0}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border border-[var(--border)] text-text-muted hover:text-text-primary transition-colors disabled:opacity-40"
            >
              <RefreshCw size={12} /> New song
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto w-full max-w-xl">
          {poolLoading ? (
            <div className="flex flex-col items-center gap-3 py-24 text-text-muted">
              <Loader2 size={20} className="animate-spin" />
              <p className="text-sm">Loading the {POOL_LABELS[activePool].toLowerCase()} catalogue…</p>
            </div>
          ) : poolError ? (
            <div className="flex flex-col items-center gap-3 py-24 text-center">
              <AlertCircle size={22} className="text-red-400" />
              <p className="text-sm text-text-secondary">Couldn't load the catalogue — {poolError}</p>
            </div>
          ) : !answer ? (
            <div className="py-24 text-center text-sm text-text-muted">No playable songs in this pool.</div>
          ) : (
            <>
              {/* Artwork slot — a placeholder until the answer is known, so the
                  era art can't give the round away. */}
              <div className="flex justify-center mb-6">
                <div className="w-40 h-40 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] overflow-hidden flex items-center justify-center">
                  {finished && answer.imageUrl
                    ? <img src={answer.imageUrl} alt="" className="w-full h-full object-cover" />
                    : <Music2 size={44} className={`text-text-muted ${playing ? 'animate-pulse' : ''}`} />}
                </div>
              </div>

              {/* Player */}
              <div className="mb-6">
                <ProgressBar unlocked={unlocked} elapsed={elapsed} />
                <div className="flex items-center justify-between mt-2 text-[11px] text-text-muted font-medium">
                  <span>{formatSeconds(elapsed)}</span>
                  <span>{formatSeconds(unlocked)}{finished ? '' : ` / ${formatSeconds(FULL_WINDOW)}`}</span>
                </div>
                <div className="flex justify-center mt-4">
                  <button
                    onClick={() => (playing ? stopPlayback() : startPlayback())}
                    className="w-14 h-14 rounded-full bg-accent text-white flex items-center justify-center hover:opacity-90 transition-opacity"
                    title={playing ? 'Stop' : `Play the first ${unlocked}s`}
                  >
                    {playing ? <Pause size={22} /> : <Play size={22} className="ml-0.5" />}
                  </button>
                </div>
                {audioError && (
                  <p className="text-center text-xs text-red-400 mt-3">
                    Couldn't stream this one. {mode === 'unlimited' ? 'Try a new song.' : 'Check your connection.'}
                  </p>
                )}
              </div>

              {/* Guesses */}
              <div className="space-y-1.5 mb-4">
                {Array.from({ length: MAX_GUESSES }, (_, i) => (
                  <GuessRow
                    key={i}
                    guess={guesses[i]}
                    index={i}
                    correct={status === 'won' && i === guesses.length - 1}
                  />
                ))}
              </div>

              {finished ? (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
                  <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${status === 'won' ? 'text-accent' : 'text-red-400'}`}>
                    {status === 'won'
                      ? `Got it in ${guesses.length} ${guesses.length === 1 ? 'try' : 'tries'}`
                      : 'Out of guesses'}
                  </p>
                  <h2 className="text-text-primary text-lg font-bold leading-snug">{answer.name}</h2>
                  <p className="text-sm text-text-secondary mt-0.5">
                    {[answer.era, CATEGORY_LABELS[answer.category] ?? answer.category, answer.length]
                      .filter(Boolean).join(' · ')}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-4">
                    <button
                      onClick={playFullSong}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-accent text-white hover:opacity-90 transition-opacity"
                    >
                      <Volume2 size={15} /> Play full song
                    </button>
                    {isDaily ? (
                      <button
                        onClick={share}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border border-[var(--border)] text-text-secondary hover:text-text-primary transition-colors"
                      >
                        <Share2 size={15} /> {copied ? 'Copied!' : 'Share'}
                      </button>
                    ) : (
                      <button
                        onClick={newRound}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border border-[var(--border)] text-text-secondary hover:text-text-primary transition-colors"
                      >
                        <RefreshCw size={15} /> Next song
                      </button>
                    )}
                    {isDaily && (
                      <span className="ml-auto text-xs text-text-muted tabular-nums">
                        Next {mode === 'personal' ? 'song' : 'puzzle'} in {formatCountdown(countdown)}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {/* Guess input */}
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                    <input
                      value={query}
                      onChange={(e) => { setQuery(e.target.value); setDropdownOpen(true) }}
                      onFocus={() => setDropdownOpen(true)}
                      onKeyDown={handleKeyDown}
                      placeholder="Know it? Start typing a title…"
                      className="w-full h-11 pl-9 pr-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50"
                    />
                    {dropdownOpen && suggestions.length > 0 && (
                      <div className="absolute bottom-full mb-1 left-0 right-0 max-h-64 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] shadow-xl z-20">
                        {suggestions.map((s, i) => (
                          <button
                            key={s.id}
                            onMouseEnter={() => setHighlighted(i)}
                            onClick={() => submitGuess(s)}
                            className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                              i === highlighted ? 'bg-accent/15' : 'hover:bg-surface-overlay'
                            }`}
                          >
                            <span className="text-sm text-text-primary truncate">{s.name}</span>
                            {s.era && <span className="ml-auto shrink-0 text-[10px] text-text-muted uppercase tracking-wider">{s.era}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={skip}
                      className="px-4 py-2 rounded-lg text-sm font-semibold border border-[var(--border)] text-text-secondary hover:text-text-primary transition-colors"
                    >
                      Skip
                      {guesses.length < MAX_GUESSES - 1 && (
                        <span className="text-text-muted"> (+{STAGE_SECONDS[guesses.length + 1] - STAGE_SECONDS[guesses.length]}s)</span>
                      )}
                    </button>
                    <button
                      onClick={() => { const s = suggestions[highlighted]; if (s) submitGuess(s) }}
                      disabled={suggestions.length === 0}
                      className="ml-auto px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-white hover:opacity-90 transition-opacity disabled:opacity-40"
                    >
                      Submit
                    </button>
                  </div>
                  <p className="text-xs text-text-muted mt-3">
                    {MAX_GUESSES - guesses.length} {MAX_GUESSES - guesses.length === 1 ? 'guess' : 'guesses'} left ·
                    {' '}each miss unlocks more of the intro.
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {showStats && <StatsPanel initialMode={dailyMode} onClose={() => setShowStats(false)} />}
    </div>
  )
}
