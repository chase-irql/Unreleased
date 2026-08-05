import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft, Play, Pause, SkipForward, Search, X, Check, Music2,
  BarChart3, Share2, RefreshCw, AlertCircle, Loader2, Volume2, SlidersHorizontal, RotateCcw, Trophy,
} from 'lucide-react'
import { useStorePick } from '../store/useStore'
import { Avatar } from './adminShared'
import { apiFetch, songToTrack, buildStreamUrl, smallCoverUrl, CATEGORY_LABELS } from '../lib/juicewrldApi'
import type { JWApiSong } from '../lib/juicewrldApi'
import { eraFullName, loadEraFullNames } from '../lib/eras'
import {
  MIN_TRIES, MAX_TRIES, POOL_LABELS, DEFAULT_SETTINGS,
  loadPools, loadVersionGroups, filterByEra, poolEras,
  pickDailySong, pickPersonalSong, pickRandomSong, playerSeed, clipStart,
  searchPool, matchedAlias, isCorrectGuess, stageLadder, settingsForMode, clampTries,
  todayKey, puzzleNumber, msUntilNextPuzzle, unlockedSeconds,
  loadRound, saveRound, loadStats, recordResult, shareText,
  loadSettings, saveSettings,
} from '../lib/heardle'
import type {
  HeardleSong, Guess, GameStatus, PoolId, Stats, DailyMode, VersionMap, HeardleSettings,
} from '../lib/heardle'
import {
  HEARDLE_LEADERBOARD_ENABLED, fetchLeaderboard, submitResult, flushResults, outboxSize,
  startPuzzle, submitGuess as apiSubmitGuess, skipGuess as apiSkipGuess, absoluteClipUrl,
} from '../lib/heardleApi'
import type { LeaderboardBoard, LeaderboardEntry, PuzzleResponse } from '../lib/heardleApi'
import HeardleVersusPanel from './HeardleVersusPanel'

type Mode = DailyMode | 'unlimited' | 'versus'

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'daily', label: 'Daily', hint: 'One song a day — the same one for everyone' },
  { id: 'personal', label: 'Personal', hint: 'One song a day, picked just for you' },
  { id: 'versus', label: '1v1', hint: 'Real-time match against another player' },
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

/** Seconds for a button label: "1S", "2.5S". */
function secLabel(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(1)}S`
}

/** Seconds as a position in a song: "1:23". */
function formatClock(s: number): string {
  const total = Math.max(0, Math.floor(s))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

// ─── Scope ────────────────────────────────────────────────────────────────────

const WAVE_BARS = 56

/** Bar heights for the scope. Deterministic from the song id so a round always
 *  looks the same (and a reload doesn't reshuffle it mid-guess) — this is a
 *  decorative readout, not analysis of the actual audio, which would mean
 *  decoding the file we're deliberately only streaming 16 seconds of. */
function barHeights(seed: number, count: number): number[] {
  const out: number[] = []
  let x = (seed || 1) >>> 0
  for (let i = 0; i < count; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0
    out.push(0.16 + (x / 0x1_0000_0000) * 0.84)
  }
  return out
}

/** The clip as a scope: solid up to the playhead, dim out to what's unlocked,
 *  barely there beyond it — so the bars carry the same information the old
 *  progress bar did, plus a sense of how much song is still locked. */
function Waveform({ seed, unlocked, elapsed, ladder, playing, startAt }: {
  seed: number; unlocked: number; elapsed: number; ladder: number[]; playing: boolean; startAt: number
}) {
  const full = ladder[ladder.length - 1]
  const heights = useMemo(() => barHeights(seed, WAVE_BARS), [seed])
  return (
    <div className="relative h-24 rounded-xl border border-[var(--border)] bg-[var(--surface-overlay)]/40 px-3 pb-3 pt-6 overflow-hidden">
      {/* Where in the song this clip was cut from. Harmless to show — it says
          nothing about which song it is — and without it a timestamp start
          just looks like the audio is broken. */}
      <span className="absolute top-2 left-3 text-[9px] font-mono uppercase tracking-[0.2em] text-text-muted">
        {startAt > 0 ? `@ ${formatClock(startAt + elapsed)}` : 'From the top'}
      </span>
      <span className="absolute top-2 right-3 flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.2em] text-text-muted">
        <span className={`w-1.5 h-1.5 rounded-full bg-accent ${playing ? 'animate-pulse' : 'opacity-40'}`} />
        Rec
      </span>
      <div className="flex items-end justify-between gap-px h-full">
        {heights.map((h, i) => {
          const at = ((i + 0.5) / WAVE_BARS) * full
          const state = at <= elapsed ? 'played' : at <= unlocked ? 'unlocked' : 'locked'
          return (
            <span
              key={i}
              className={`flex-1 rounded-sm transition-colors duration-100 ${
                state === 'played' ? 'bg-accent'
                  : state === 'unlocked' ? 'bg-accent/30'
                    : 'bg-[var(--text-muted)]/15'
              }`}
              style={{ height: `${h * 100}%` }}
            />
          )
        })}
      </div>
    </div>
  )
}

/** The guess slots, left to right — the round's progress at a glance. The one
 *  you're on glows; finished ones carry their result's colour. */
function SlotRow({ ladder, guesses, status, showEraHint }: {
  ladder: number[]; guesses: Guess[]; status: GameStatus; showEraHint: boolean
}) {
  return (
    <div className="flex gap-1.5 sm:gap-2">
      {ladder.map((secs, i) => {
        const guess = guesses[i]
        const won = status === 'won' && i === guesses.length - 1
        const active = !guess && i === guesses.length && status === 'playing'
        const tone = won ? 'border-accent bg-accent/20'
          : !guess ? (active
            ? 'border-accent bg-accent/10 shadow-[0_0_18px_-6px_var(--accent)]'
            : 'border-[var(--border)] bg-[var(--surface-overlay)]/30')
            : guess.songId === null ? 'border-[var(--border)] bg-[var(--surface-overlay)]/60'
              : guess.sameEra && showEraHint ? 'border-amber-500/50 bg-amber-500/10'
                : 'border-red-500/40 bg-red-500/10'
        return (
          <div
            key={i}
            title={guess ? (guess.songId === null ? 'Skipped' : guess.label) : `${secLabel(secs)} unlocked`}
            className={`flex-1 h-11 sm:h-12 rounded-xl border transition-all duration-200 ${tone}`}
          />
        )
      })}
    </div>
  )
}

/** One of the six slots — empty, a skip, a wrong guess, or the winning one.
 *  Only the final guess of a won round is `correct`. */
function GuessRow({ guess, index, correct, showEraHint }: {
  guess: Guess | undefined; index: number; correct: boolean; showEraHint: boolean
}) {
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
            : guess.sameEra && showEraHint
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
      {!correct && !skipped && guess.sameEra && showEraHint && (
        <span className="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-widest text-amber-400">
          Same era
        </span>
      )}
    </div>
  )
}

// ─── Settings panel ───────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="py-3 border-b border-[var(--border)] last:border-b-0">
      <div className="flex items-center gap-3">
        <div className="min-w-0">
          <div className="text-sm text-text-primary font-medium">{label}</div>
          {hint && <div className="text-xs text-text-muted mt-0.5">{hint}</div>}
        </div>
        <div className="ml-auto shrink-0">{children}</div>
      </div>
    </div>
  )
}

function Segmented<T extends string>({ options, value, onChange }: {
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`px-2.5 py-1 text-xs font-semibold transition-colors ${
            value === o.id ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const numberInput = 'w-16 h-8 px-2 rounded-lg bg-[var(--surface-overlay)] border border-[var(--border)] text-sm text-text-primary text-right focus:outline-none focus:border-accent/50'

/** Game rules for Unlimited. The daily modes ignore all of them (see
 *  settingsForMode), so the panel says which mode it's editing rather than
 *  presenting live-looking controls that silently do nothing. */
function SettingsPanel({ settings, onChange, eras, mode, onClose }: {
  settings: HeardleSettings
  onChange: (s: HeardleSettings) => void
  eras: { era: string; count: number }[]
  mode: Mode
  onClose: () => void
}) {
  const set = <K extends keyof HeardleSettings>(key: K, value: HeardleSettings[K]): void =>
    onChange({ ...settings, [key]: value })

  const ladder = stageLadder(settings)
  const toggleEra = (era: string): void =>
    set('eras', settings.eras.includes(era) ? settings.eras.filter((e) => e !== era) : [...settings.eras, era])
  const toggleCategory = (cat: PoolId): void => {
    const next = settings.categories.includes(cat)
      ? settings.categories.filter((c) => c !== cat)
      : [...settings.categories, cat]
    // Never leave nothing to draw from.
    if (next.length > 0) set('categories', next)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-1">
          <SlidersHorizontal size={16} className="text-accent" />
          <h2 className="text-text-primary font-bold">Game settings</h2>
          <button
            onClick={() => onChange({ ...DEFAULT_SETTINGS })}
            title="Reset to defaults"
            className="ml-auto p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors"
          >
            <RotateCcw size={14} />
          </button>
          <button onClick={onClose} className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-text-muted mb-3">
          These apply to <span className="text-text-secondary font-semibold">Unlimited</span> only. Daily and
          Personal always run the standard rules — their results are headed for a leaderboard, and a
          six-try round and a ten-try round aren't the same achievement.
        </p>
        {mode !== 'unlimited' && (
          <p className="text-xs text-accent bg-accent/10 border border-accent/25 rounded-lg px-3 py-2 mb-4">
            You're playing {mode === 'personal' ? 'Personal' : 'Daily'} right now — nothing here changes
            that round. Switch to Unlimited to play by these.
          </p>
        )}

        <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1">Difficulty</h3>
        <Field label="Tries" hint={`${MIN_TRIES}–${MAX_TRIES} guesses per song`}>
          <input
            type="number"
            min={MIN_TRIES}
            max={MAX_TRIES}
            value={settings.tries}
            onChange={(e) => set('tries', clampTries(Number(e.target.value)))}
            className={numberInput}
          />
        </Field>
        <Field label="Snippet lengths" hint={settings.ladder === 'classic' ? 'Gaps grow each miss' : 'Same amount each miss'}>
          <Segmented
            options={[{ id: 'classic', label: 'Classic' }, { id: 'linear', label: 'Even' }]}
            value={settings.ladder}
            onChange={(v) => set('ladder', v)}
          />
        </Field>
        {settings.ladder === 'linear' && (
          <>
            <Field label="First snippet" hint="Seconds you hear before guessing">
              <input
                type="number" min={0.5} max={30} step={0.5}
                value={settings.startSeconds}
                onChange={(e) => set('startSeconds', Math.max(0.5, Number(e.target.value)))}
                className={numberInput}
              />
            </Field>
            <Field label="Added per miss" hint="Seconds unlocked by each wrong guess">
              <input
                type="number" min={0.5} max={30} step={0.5}
                value={settings.stepSeconds}
                onChange={(e) => set('stepSeconds', Math.max(0.5, Number(e.target.value)))}
                className={numberInput}
              />
            </Field>
          </>
        )}
        <Field
          label="Clip starts at"
          hint={settings.startPoint === 'intro'
            ? "The song's opening seconds"
            : 'A timestamp somewhere inside the song'}
        >
          <Segmented
            options={[{ id: 'timestamp', label: 'Timestamp' }, { id: 'intro', label: 'Intro' }]}
            value={settings.startPoint}
            onChange={(v) => set('startPoint', v)}
          />
        </Field>
        <Field label="Era hint" hint="Flag wrong guesses from the answer's era">
          <Segmented
            options={[{ id: 'on', label: 'On' }, { id: 'off', label: 'Off' }]}
            value={settings.eraHint ? 'on' : 'off'}
            onChange={(v) => set('eraHint', v === 'on')}
          />
        </Field>
        <p className="text-xs text-text-muted py-3">
          Ladder: {ladder.map((s) => `${s}s`).join(' → ')}
        </p>

        <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted mt-4 mb-1">Song pool</h3>
        <div className="py-3 border-b border-[var(--border)]">
          <div className="text-sm text-text-primary font-medium mb-2">Catalogues</div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(POOL_LABELS) as PoolId[]).map((c) => (
              <button
                key={c}
                onClick={() => toggleCategory(c)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  settings.categories.includes(c)
                    ? 'border-accent/50 bg-accent/15 text-accent'
                    : 'border-[var(--border)] text-text-muted hover:text-text-primary'
                }`}
              >
                {POOL_LABELS[c]}
              </button>
            ))}
          </div>
        </div>
        <div className="py-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="text-sm text-text-primary font-medium">Eras</div>
            <span className="text-xs text-text-muted">
              {settings.eras.length === 0 ? 'All' : `${settings.eras.length} selected`}
            </span>
            {settings.eras.length > 0 && (
              <button onClick={() => set('eras', [])} className="ml-auto text-xs text-accent hover:underline">
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {eras.map(({ era, count }) => (
              <button
                key={era}
                onClick={() => toggleEra(era)}
                title={eraFullName(era) ?? era}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  settings.eras.includes(era)
                    ? 'border-accent/50 bg-accent/15 text-accent'
                    : 'border-[var(--border)] text-text-muted hover:text-text-primary'
                }`}
              >
                {era} <span className="opacity-60">{count}</span>
              </button>
            ))}
            {eras.length === 0 && <span className="text-xs text-text-muted">Loading…</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

/** One past the deepest guess-count that's ever won a round. */
function lastUsedBucket(stats: Stats): number {
  for (let i = stats.distribution.length - 1; i >= 0; i--) {
    if (stats.distribution[i] > 0) return i + 1
  }
  return 0
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
        {/* The distribution is stored at the maximum width, but showing ten
            empty rows to someone playing six-try rounds is noise — trim to the
            deepest bucket that's actually been used. */}
        <div className="space-y-1.5">
          {stats.distribution.slice(0, Math.max(DEFAULT_SETTINGS.tries, lastUsedBucket(stats))).map((n, i) => (
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

// ─── Leaderboard ──────────────────────────────────────────────────────────────

/** Standings for the two once-a-day modes. Both run fixed rules (see
 *  settingsForMode), which is what makes a ranking mean anything.
 *
 *  The endpoint doesn't exist yet — see lib/heardleApi. Until it does this
 *  shows what's waiting to be sent rather than pretending to be empty. */
function LeaderboardPanel({ initialMode, signedIn, onClose }: {
  initialMode: DailyMode
  signedIn: boolean
  onClose: () => void
}) {
  const [board, setBoard] = useState<LeaderboardBoard>('today')
  const [mode, setMode] = useState<DailyMode>(initialMode)
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [me, setMe] = useState<LeaderboardEntry | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const day = useMemo(() => todayKey(), [])
  const pending = useMemo(() => outboxSize(), [])

  useEffect(() => {
    if (!HEARDLE_LEADERBOARD_ENABLED) return
    if (board !== 'versus' && !signedIn) return
    let cancelled = false
    setLoading(true)
    setError(null)
    const fetchMode = board === 'versus' ? 'versus' : mode
    fetchLeaderboard(board, fetchMode, day)
      .then((res) => {
        if (cancelled) return
        setEntries(res.entries ?? [])
        setMe(res.me ?? null)
      })
      .catch((err: Error) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [board, mode, day, signedIn])

  const score = (e: LeaderboardEntry): string => {
    if (board === 'versus') return `${e.won ?? 0}W · ${e.win_rate ?? 0}%`
    if (board === 'streak') return `${e.current_streak ?? 0}`
    if (e.won === false || e.guesses == null) return '—'
    return `${e.guesses}`
  }

  const row = (e: LeaderboardEntry, isMe: boolean): JSX.Element => (
    <div
      key={`${e.user_id}-${e.rank}`}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
        isMe ? 'bg-accent/15 border border-accent/30' : ''
      }`}
    >
      <span className="w-6 shrink-0 text-xs font-bold tabular-nums text-text-muted text-right">{e.rank}</span>
      <Avatar src={e.discord_avatar ?? undefined} name={e.display_name} size={7} />
      <span className="min-w-0 flex-1 text-sm text-text-primary truncate">{e.display_name}</span>
      {board === 'streak' && e.max_streak != null && (
        <span className="shrink-0 text-[10px] text-text-muted">best {e.max_streak}</span>
      )}
      <span className="shrink-0 text-sm font-bold tabular-nums text-text-primary">{score(e)}</span>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <Trophy size={16} className="text-accent" />
          <h2 className="text-text-primary font-bold">Leaderboard</h2>
          <button onClick={onClose} className="ml-auto p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
            {([['today', 'Today'], ['streak', 'Streaks'], ['versus', '1v1']] as [LeaderboardBoard, string][]).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setBoard(id)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  board === id ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={`flex rounded-lg border border-[var(--border)] overflow-hidden ml-auto ${board === 'versus' ? 'opacity-40 pointer-events-none' : ''}`}>
            {(['daily', 'personal'] as DailyMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                  mode === m ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {!HEARDLE_LEADERBOARD_ENABLED ? (
          <div className="py-8 text-center">
            <Trophy size={24} className="mx-auto text-text-muted mb-3" />
            <p className="text-sm text-text-secondary">Leaderboards aren't live yet.</p>
            <p className="text-xs text-text-muted mt-2 leading-relaxed">
              The API has no endpoint for them — nothing to rank against until it does. Your finished
              Daily and Personal rounds are being saved{pending > 0 ? ` (${pending} waiting)` : ''} and
              will be sent the moment it ships, so you won't start from zero.
            </p>
          </div>
        ) : !signedIn ? (
          <p className="py-8 text-center text-sm text-text-muted">Sign in to appear on the leaderboard.</p>
        ) : loading ? (
          <div className="py-8 flex justify-center"><Loader2 size={20} className="animate-spin text-text-muted" /></div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-red-400">{error}</p>
        ) : entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">
            {board === 'today' ? "Nobody's finished today's round yet." : 'No streaks going yet.'}
          </p>
        ) : (
          <>
            <div className="space-y-0.5">
              {entries.map((e) => row(e, e.user_id === me?.user_id))}
            </div>
            {/* Your own row again when you placed outside the page. */}
            {me && !entries.some((e) => e.user_id === me.user_id) && (
              <div className="mt-2 pt-2 border-t border-[var(--border)]">{row(me, true)}</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── View ─────────────────────────────────────────────────────────────────────

export default function HeardleView(): JSX.Element {
  const { setActiveView, playTrack, setIsPlaying, isPlaying, volume, setVolume, account } = useStorePick(
    'setActiveView', 'playTrack', 'setIsPlaying', 'isPlaying', 'volume', 'setVolume', 'account')

  const [mode, setMode] = useState<Mode>('daily')
  const [settings, setSettings] = useState<HeardleSettings>(() => loadSettings())
  const [pool, setPool] = useState<HeardleSong[]>([])
  const [poolLoading, setPoolLoading] = useState(true)
  const [poolError, setPoolError] = useState<string | null>(null)
  const [versions, setVersions] = useState<VersionMap>(() => new Map())

  const [answer, setAnswer] = useState<HeardleSong | null>(null)
  const [guesses, setGuesses] = useState<Guess[]>([])
  const [status, setStatus] = useState<GameStatus>('playing')

  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const [playing, setPlaying] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [audioError, setAudioError] = useState(false)

  const [showStats, setShowStats] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [countdown, setCountdown] = useState(() => msUntilNextPuzzle())
  const [copied, setCopied] = useState(false)
  const [startAt, setStartAt] = useState(0)
  const [roundToken, setRoundToken] = useState<string | null>(null)
  const [serverClipUrl, setServerClipUrl] = useState<string | null>(null)
  const [waveSeed, setWaveSeed] = useState(1)

  const isDaily = mode !== 'unlimited' && mode !== 'versus'
  const useServerRound = isDaily && !!account
  const dailyMode: DailyMode = mode === 'personal' ? 'personal' : 'daily'
  const day = useMemo(() => todayKey(), [])

  // Which settings actually apply here — Daily ignores all of them, Personal
  // takes the difficulty half. Everything below reads `rules`, never
  // `settings`, so the mode rules live in exactly one place.
  const rules = useMemo(
    () => settingsForMode(settings, mode === 'personal' ? 'personal' : mode === 'unlimited' ? 'unlimited' : 'daily'),
    [settings, mode],
  )
  const ladder = useMemo(() => stageLadder(rules), [rules])
  const categories = rules.categories

  const finished = status !== 'playing'
  const unlocked = unlockedSeconds(guesses.length, finished, ladder)

  const audioRef = useRef<HTMLAudioElement>(null)
  const rafRef = useRef<number | null>(null)
  const limitRef = useRef(unlocked)
  const startRef = useRef(startAt)
  useEffect(() => { limitRef.current = unlocked }, [unlocked])
  useEffect(() => { startRef.current = startAt }, [startAt])

  useEffect(() => { saveSettings(settings) }, [settings])
  useEffect(() => { loadEraFullNames().catch(() => undefined) }, [])

  // ── Pool ───────────────────────────────────────────────────────────────────
  // `categories` is an array in state, so key the effect on its contents — a
  // fresh array every render would otherwise refetch (and re-roll) endlessly.
  const categoryKey = categories.join(',')
  useEffect(() => {
    let cancelled = false
    setPoolLoading(true)
    setPoolError(null)
    loadPools(categoryKey.split(',') as PoolId[])
      .then((songs) => { if (!cancelled) { setPool(songs); setPoolLoading(false) } })
      .catch((err: Error) => { if (!cancelled) { setPoolError(err.message); setPoolLoading(false) } })
    return () => { cancelled = true }
  }, [categoryKey])

  // The era filter narrows what's already loaded — no refetch, and the guess
  // dropdown narrows with it, which is the point: a Goodbye & Good Riddance
  // round shouldn't autocomplete songs that can't be the answer.
  const eraKey = rules.eras.join(',')
  const playablePool = useMemo(
    () => filterByEra(pool, eraKey ? eraKey.split(',') : []),
    [pool, eraKey])
  const availableEras = useMemo(() => poolEras(pool), [pool])

  // Version links load behind the pool — a round is playable without them,
  // they only widen what counts as correct. Empty on failure.
  useEffect(() => {
    if (pool.length === 0) return
    let cancelled = false
    loadVersionGroups(pool)
      .then((map) => { if (!cancelled) setVersions(map) })
      .catch(() => { if (!cancelled) setVersions(new Map()) })
    return () => { cancelled = true }
  }, [pool])

  // ── Round setup ────────────────────────────────────────────────────────────
  // The daily modes restore whatever was already guessed today; unlimited
  // starts fresh whenever the pool (or the mode) changes.
  //
  // Deliberately not keyed on the difficulty settings: changing tries or the
  // ladder mid-round must not re-roll a once-a-day song. A tries cut that
  // strands a round over the new limit is settled below instead.
  const fullWindow = ladder[ladder.length - 1]

  const applyServerPuzzle = useCallback((res: PuzzleResponse) => {
    setRoundToken(res.round_token)
    setServerClipUrl(absoluteClipUrl(res.clip_url))
    setStartAt(res.clip_start ?? 0)
    setGuesses(res.guesses ?? [])
    setStatus(res.status)
    setWaveSeed(res.round_token.split('').reduce((a, c) => a + c.charCodeAt(0), 0))
    if (res.reveal) setAnswer(res.reveal)
    else if (res.status !== 'playing') setAnswer(res.reveal ?? null)
    else setAnswer(null)
  }, [])

  useEffect(() => {
    if (!useServerRound) return
    let cancelled = false
    startPuzzle(dailyMode, day)
      .then((res) => { if (!cancelled) applyServerPuzzle(res) })
      .catch((err: Error) => { if (!cancelled) setPoolError(err.message) })
    return () => { cancelled = true }
  }, [useServerRound, dailyMode, day, applyServerPuzzle])

  useEffect(() => {
    if (playablePool.length === 0 || useServerRound) return
    const seed = playerSeed()
    if (isDaily) {
      const song = dailyMode === 'personal'
        ? pickPersonalSong(playablePool, day, seed)
        : pickDailySong(playablePool, day)
      if (!song) return
      setAnswer(song)
      const saved = loadRound(dailyMode, day, song.id)
      setGuesses(saved?.guesses ?? [])
      setStatus(saved?.status ?? 'playing')
      // Same seed every load, so a refresh can't shop for a kinder offset.
      setStartAt(clipStart(song, fullWindow, rules.startPoint, `${seed}-${dailyMode}-${day}`))
    } else {
      const song = pickRandomSong(playablePool)
      setAnswer(song)
      setGuesses([])
      setStatus('playing')
      setStartAt(song ? clipStart(song, fullWindow, rules.startPoint, null) : 0)
    }
    setQuery('')
    setElapsed(0)
    // fullWindow/startPoint are read, not depended on: they only decide where a
    // freshly-picked song starts, and re-running this on a settings change
    // would re-roll the round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playablePool, isDaily, dailyMode, day])

  // A tries cut can leave a saved round already at or past the new limit.
  // Settle it as a loss rather than showing a round that can't be played on.
  useEffect(() => {
    if (status === 'playing' && guesses.length >= ladder.length) setStatus('lost')
  }, [status, guesses.length, ladder.length])

  // Persist the round after every guess.
  useEffect(() => {
    if (!isDaily || useServerRound || !answer) return
    saveRound(dailyMode, { day, answerId: answer.id, guesses, status })
  }, [isDaily, useServerRound, dailyMode, answer, day, guesses, status])

  // Fold a finished round into that mode's stats (once — see recordResult's
  // lastDay guard) and hand it to the leaderboard. submitResult queues rather
  // than throwing while the endpoint is missing or the user is signed out, so
  // rounds played today still count once it's live.
  useEffect(() => {
    if (!isDaily || status === 'playing') return
    if (!useServerRound && !answer) return
    if (!useServerRound) recordResult(dailyMode, day, status === 'won', guesses.length)
    else if (answer) {
      submitResult({
        day,
        mode: dailyMode,
        song_id: answer.id,
        guesses: guesses.length,
        won: status === 'won',
        guess_song_ids: guesses.map((g) => g.songId),
      })
    }
  }, [isDaily, useServerRound, dailyMode, status, day, guesses.length, answer])

  // Deliver anything queued in an earlier session.
  useEffect(() => { flushResults() }, [account])

  useEffect(() => {
    if (!finished) return
    const id = setInterval(() => setCountdown(msUntilNextPuzzle()), 1000)
    return () => clearInterval(id)
  }, [finished])

  // ── Playback ───────────────────────────────────────────────────────────────
  // A dedicated element rather than the app's player: this has to start at a
  // fixed point, cut off mid-song, and never touch the queue or what the user
  // was listening to. It's deliberately outside the Web Audio effects chain
  // too — the EQ shouldn't colour the clue.
  //
  // Positions are tracked relative to `startAt`, since a "random" clip start
  // means the element's currentTime is offset from what the player sees.
  // Every start claims a token. Anything that ends playback bumps it, so the
  // async continuations below (waiting on metadata, on a seek, on play()) can
  // tell they've been superseded — a start that was still loading when the
  // view went away would otherwise land on a detached element and play the
  // song through, unsupervised. Refs survive unmount; audioRef.current doesn't.
  const playTokenRef = useRef(0)

  const stopPlayback = useCallback((): void => {
    playTokenRef.current++
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    const audio = audioRef.current
    if (audio) { audio.pause(); audio.currentTime = startRef.current }
    setPlaying(false)
    setPreparing(false)
    setElapsed(0)
  }, [])

  const tick = useCallback((): void => {
    const audio = audioRef.current
    if (!audio) return
    const played = audio.currentTime - startRef.current
    if (played >= limitRef.current) { stopPlayback(); return }
    setElapsed(played)
    rafRef.current = requestAnimationFrame(tick)
  }, [stopPlayback])

  /** The authoritative cutoff. requestAnimationFrame drives the readout, but
   *  it stops firing while the page is hidden, so it cannot be what enforces
   *  the limit — this rides the media element's own timeupdate, which keeps
   *  firing as long as audio is being decoded. */
  const enforceLimit = useCallback((): void => {
    const audio = audioRef.current
    if (!audio || audio.paused) return
    if (audio.currentTime - startRef.current >= limitRef.current) stopPlayback()
  }, [stopPlayback])

  const startPlayback = useCallback((): void => {
    const audio = audioRef.current
    if (!audio) return
    // Two things playing at once makes the clue unlistenable — yield the room.
    if (isPlaying) setIsPlaying(false)
    setAudioError(false)
    setPreparing(true)
    audio.volume = volume

    const token = ++playTokenRef.current
    const live = (): boolean => playTokenRef.current === token && !!audioRef.current

    // Seeking before the element knows the song's duration is silently
    // dropped, which put the clip back at 0:00 for every timestamp start —
    // wait for metadata (and the seek itself) before playing. Nothing to wait
    // for when the clip starts at the beginning.
    const begin = (): void => {
      if (!live()) { audio.pause(); return }
      audio.play()
        .then(() => {
          // play() resolves asynchronously too — the round can have ended, or
          // the view gone, in the meantime.
          if (!live()) { audio.pause(); return }
          setPreparing(false); setPlaying(true)
          rafRef.current = requestAnimationFrame(tick)
        })
        .catch(() => {
          if (!live()) return
          setPreparing(false); setAudioError(true); setPlaying(false)
        })
    }
    const seekThenPlay = (): void => {
      if (!live()) { audio.pause(); return }
      if (startRef.current <= 0 || Math.abs(audio.currentTime - startRef.current) < 0.25) { begin(); return }
      audio.addEventListener('seeked', begin, { once: true })
      audio.currentTime = startRef.current
    }
    if (audio.readyState >= 1 /* HAVE_METADATA */) seekThenPlay()
    else audio.addEventListener('loadedmetadata', seekThenPlay, { once: true })
  }, [isPlaying, setIsPlaying, volume, tick])

  // Leaving the page stops the clip. Without this you could start a snippet,
  // switch away, and let the song run on underneath — the whole track for
  // free, on the first guess. Covers a backgrounded tab and a minimised
  // desktop window; navigating to another view unmounts this component, which
  // stops it through the cleanup below.
  useEffect(() => {
    const onVisibility = (): void => { if (document.hidden) stopPlayback() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [stopPlayback])

  // New answer → new source, and never carry playback across rounds.
  useEffect(() => {
    stopPlayback()
    const audio = audioRef.current
    if (audio && useServerRound && serverClipUrl) audio.src = serverClipUrl
    else if (audio && answer) audio.src = buildStreamUrl(answer.path)
    setAudioError(false)
  }, [answer, serverClipUrl, useServerRound, stopPlayback])

  // Teardown. The element is captured on mount rather than read from the ref
  // in the cleanup: React detaches refs before passive cleanups run, so
  // audioRef.current can already be null here — and a paused-by-nobody element
  // keeps playing after the view is gone.
  useEffect(() => {
    const audio = audioRef.current
    return () => {
      playTokenRef.current++
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      audio?.pause()
    }
  }, [])

  // ── Guessing ───────────────────────────────────────────────────────────────
  // Suggestions come from the filtered pool: under an era filter, songs that
  // can't be the answer shouldn't be offered as guesses.
  const suggestions = useMemo(
    () => (query.trim() ? searchPool(playablePool, query, 50) : []),
    [playablePool, query])

  useEffect(() => { setHighlighted(0) }, [query])

  const commitGuess = (guess: Guess): void => {
    stopPlayback()
    const next = [...guesses, guess]
    setGuesses(next)
    if (next.length >= ladder.length) setStatus('lost')
    setQuery('')
    setDropdownOpen(false)
  }

  const submitGuess = (song: HeardleSong): void => {
    if (finished) return
    if (useServerRound && roundToken) {
      stopPlayback()
      apiSubmitGuess(roundToken, song.id)
        .then(applyServerPuzzle)
        .catch((err: Error) => setPoolError(err.message))
      setQuery('')
      setDropdownOpen(false)
      return
    }
    if (!answer) return
    if (isCorrectGuess(song, answer, versions)) {
      stopPlayback()
      setGuesses((prev) => [...prev, {
        songId: song.id,
        label: song.name,
        era: song.era,
        sameEra: false,
        viaVersion: song.id !== answer.id,
      }])
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
    if (finished) return
    if (useServerRound && roundToken) {
      stopPlayback()
      apiSkipGuess(roundToken).then(applyServerPuzzle).catch((err: Error) => setPoolError(err.message))
      return
    }
    if (!answer) return
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
      await navigator.clipboard.writeText(shareText(dailyMode, day, guesses, status, ladder.length))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const newRound = (): void => {
    stopPlayback()
    const song = pickRandomSong(playablePool)
    setAnswer(song)
    setStartAt(song ? clipStart(song, fullWindow, rules.startPoint, null) : 0)
    setGuesses([])
    setStatus('playing')
    setQuery('')
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden bg-[var(--surface)]">
      {/* Starfield + a wash of the accent behind the card. Built from
          gradients rather than an image so it inherits whatever skin is
          active instead of fighting it. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-[0.5]"
        style={{
          backgroundImage: [
            'radial-gradient(1px 1px at 18% 24%, var(--text-muted), transparent)',
            'radial-gradient(1px 1px at 73% 12%, var(--text-muted), transparent)',
            'radial-gradient(1px 1px at 41% 67%, var(--text-muted), transparent)',
            'radial-gradient(1px 1px at 89% 58%, var(--text-muted), transparent)',
            'radial-gradient(1px 1px at 8% 82%, var(--text-muted), transparent)',
            'radial-gradient(1px 1px at 57% 91%, var(--text-muted), transparent)',
          ].join(','),
          backgroundSize: '220px 220px',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-80 pointer-events-none"
        style={{ background: 'radial-gradient(60% 100% at 50% 0%, color-mix(in srgb, var(--accent) 14%, transparent), transparent)' }}
      />
      <audio
        ref={audioRef}
        preload="auto"
        onTimeUpdate={enforceLimit}
        onError={() => setAudioError(true)}
      />

      {/* Corner controls — the hero owns the middle, so navigation and the
          panels sit out of its way.
          z-20 (over the scroll container's z-10): the scroll container fills
          the whole view and comes later in the DOM, so at equal z it took every
          click in these corners and left the buttons visible but dead.
          no-drag: in Electron the frameless window's drag strip runs along the
          top of this pane, and an app-region rect swallows mouse events no
          matter what pointer-events says. */}
      <div
        className="absolute top-4 left-4 z-20"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={() => setActiveView('wrld')}
          title="Back"
          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
      </div>
      <div
        className="absolute top-4 right-4 z-20 flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={() => setShowSettings(true)}
          title="Game settings"
          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors"
        >
          <SlidersHorizontal size={16} />
        </button>
        <button
          onClick={() => setShowLeaderboard(true)}
          title="Leaderboard"
          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors"
        >
          <Trophy size={16} />
        </button>
        <button
          onClick={() => setShowStats(true)}
          title="Statistics"
          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors"
        >
          <BarChart3 size={16} />
        </button>
      </div>

      {/* z-10: the backdrop layers above are absolutely positioned, so content
          has to be positioned too or they paint over it. */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 sm:px-6 py-10">
        <div className="mx-auto w-full max-w-xl">
          {/* Hero */}
          <div className="text-center mb-6">
            <h1 className="text-text-primary text-4xl sm:text-5xl font-black tracking-tight inline-flex items-start gap-1">
              Juice WRLD Heardle
              <span className="text-accent text-sm font-mono font-bold mt-1">999</span>
            </h1>
            <p className="mt-2 text-[11px] font-mono lowercase tracking-[0.18em] text-text-muted">
              name the song from its opening seconds
            </p>
          </div>

          {/* Mode tabs */}
          <div className="flex items-center justify-center gap-6 mb-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                title={m.hint}
                className={`pb-1.5 text-xs font-bold uppercase tracking-[0.2em] border-b-2 transition-colors ${
                  mode === m.id
                    ? 'text-text-primary border-accent'
                    : 'text-text-muted border-transparent hover:text-text-secondary'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* The three modes are easy to confuse at a glance, so spell out what
              you're playing rather than leaving it to the tab labels. */}
          <p className="text-center text-[10px] font-mono tracking-wider text-text-muted mb-3">
            {mode === 'daily' && `#${puzzleNumber(day)} · `}
            {MODES.find((m) => m.id === mode)?.hint.toLowerCase()}
            {mode !== 'versus' && ` · ${ladder.length} tries · up to ${formatSeconds(fullWindow)}`}
            {mode !== 'versus' && rules.startPoint === 'timestamp' ? ' · from a timestamp' : mode !== 'versus' ? ' · from the intro' : ''}
            {mode === 'unlimited' && rules.eras.length > 0 && ` · ${rules.eras.join(', ')}`}
          </p>

          {/* Reroll — practice rounds aren't scored, so being stuck with a
              song you have no chance on is just a dead end. Only here: the
              daily modes get one song a day, and a reroll would be the whole
              point of them undone. */}
          <div className="flex justify-center mb-6">
            {mode === 'unlimited' ? (
              <button
                onClick={newRound}
                disabled={playablePool.length === 0}
                title="Skip this song and draw another"
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[var(--border)] hover:border-accent/40 text-text-muted hover:text-text-primary text-[10px] font-bold uppercase tracking-[0.18em] transition-colors disabled:opacity-40"
              >
                <RefreshCw size={12} /> Reroll
              </button>
            ) : (
              <div className="h-[30px]" aria-hidden />
            )}
          </div>

          {mode === 'versus' ? (
            <HeardleVersusPanel embedded onClose={() => setMode('daily')} />
          ) : poolLoading ? (
            <div className="flex flex-col items-center gap-3 py-24 text-text-muted">
              <Loader2 size={20} className="animate-spin" />
              <p className="text-sm">
                Loading the {categories.map((c) => POOL_LABELS[c].toLowerCase()).join(' + ')} catalogue…
              </p>
            </div>
          ) : poolError ? (
            <div className="flex flex-col items-center gap-3 py-24 text-center">
              <AlertCircle size={22} className="text-red-400" />
              <p className="text-sm text-text-secondary">Couldn't load the catalogue — {poolError}</p>
            </div>
          ) : !answer && !(useServerRound && serverClipUrl) ? (
            <div className="flex flex-col items-center gap-3 py-24 text-center">
              <p className="text-sm text-text-muted">
                {rules.eras.length > 0
                  ? 'No songs match the eras you picked.'
                  : 'No playable songs in this pool.'}
              </p>
              {rules.eras.length > 0 && (
                <button
                  onClick={() => setSettings((s) => ({ ...s, eras: [] }))}
                  className="text-xs font-semibold text-accent hover:underline"
                >
                  Clear era filter
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Play card */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)]/60 p-4 sm:p-5 space-y-4">
                <SlotRow ladder={ladder} guesses={guesses} status={status} showEraHint={rules.eraHint} />

                <Waveform
                  seed={answer?.id ?? waveSeed}
                  unlocked={unlocked}
                  elapsed={elapsed}
                  ladder={ladder}
                  playing={playing}
                  startAt={startAt}
                />

                <div>
                  <button
                    onClick={() => (playing ? stopPlayback() : startPlayback())}
                    title={playing ? 'Stop' : `Play ${unlocked}s${startAt > 0 ? ' from the clip start' : ' from the beginning'}`}
                    className="w-full h-12 rounded-xl border border-accent/40 bg-accent/10 hover:bg-accent/20 text-text-primary text-sm font-bold uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-colors"
                  >
                    {preparing
                      ? <><Loader2 size={16} className="animate-spin" /> Loading</>
                      : playing
                        ? <><Pause size={16} className="fill-current" /> Stop</>
                        : <><Play size={16} className="fill-current" /> Play ({secLabel(unlocked)})</>}
                  </button>
                  {/* Thin readout under the button — the scope shows the same
                      thing, this just gives it an exact edge to read against. */}
                  <div className="mt-2 h-1 w-full rounded-full bg-[var(--surface-overlay)] overflow-hidden">
                    <div
                      className="h-full bg-accent/30"
                      style={{ width: `${(unlocked / fullWindow) * 100}%` }}
                    />
                    <div
                      className="h-full bg-accent -mt-1 transition-[width] duration-75 ease-linear"
                      style={{ width: `${(Math.min(elapsed, unlocked) / fullWindow) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Volume is the app's own — the game plays through it, so a
                    slider that only moved a private copy would be a lie. */}
                <div className="flex items-center gap-3">
                  <Volume2 size={14} className="text-text-muted shrink-0" />
                  <input
                    type="range" min={0} max={1} step={0.01}
                    value={volume}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      setVolume(v)
                      if (audioRef.current) audioRef.current.volume = v
                    }}
                    className="flex-1 h-1 accent-[var(--accent)] cursor-pointer"
                  />
                </div>

                {audioError && (
                  <p className="text-center text-xs text-red-400">
                    Couldn't stream this one. {mode === 'unlimited' ? 'Try a new song.' : 'Check your connection.'}
                  </p>
                )}

                {!finished && (
                  <>
                    {/* Guess input */}
                    <div className="relative">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                      <input
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setDropdownOpen(true) }}
                        onFocus={() => setDropdownOpen(true)}
                        onKeyDown={handleKeyDown}
                        placeholder="guess the track…"
                        className="w-full h-12 pl-9 pr-3 rounded-xl bg-[var(--surface-overlay)]/50 border border-[var(--border)] text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50"
                      />
                      {dropdownOpen && suggestions.length > 0 && (
                        <div className="absolute bottom-full mb-1 left-0 right-0 max-h-64 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] shadow-xl z-20">
                          {suggestions.map((s, i) => {
                            const alias = matchedAlias(s, query)
                            return (
                              <button
                                key={s.id}
                                onMouseEnter={() => setHighlighted(i)}
                                onClick={() => submitGuess(s)}
                                className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                                  i === highlighted ? 'bg-accent/15' : 'hover:bg-surface-overlay'
                                }`}
                              >
                                <span className="min-w-0">
                                  <span className="block text-sm text-text-primary truncate">{s.name}</span>
                                  {/* Why this row is here when the name doesn't
                                      match what was typed. */}
                                  {alias && (
                                    <span className="block text-[10px] text-text-muted truncate">aka {alias}</span>
                                  )}
                                </span>
                                {s.era && <span className="ml-auto shrink-0 text-[10px] text-text-muted uppercase tracking-wider">{s.era}</span>}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                      <button
                        onClick={skip}
                        className="h-12 rounded-xl border border-[var(--border)] hover:border-accent/40 text-text-secondary hover:text-text-primary text-xs font-bold uppercase tracking-[0.18em] transition-colors"
                      >
                        Skip
                        {guesses.length < ladder.length - 1 &&
                          ` (+${secLabel(Math.round((ladder[guesses.length + 1] - ladder[guesses.length]) * 10) / 10)})`}
                      </button>
                      <button
                        onClick={() => { const s = suggestions[highlighted]; if (s) submitGuess(s) }}
                        disabled={suggestions.length === 0}
                        className="h-12 rounded-xl border border-accent/40 bg-accent/10 hover:bg-accent/20 text-text-primary text-xs font-bold uppercase tracking-[0.18em] transition-colors disabled:opacity-40 disabled:hover:bg-accent/10"
                      >
                        Submit
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* What's been guessed so far. The slots above carry the shape of
                  the round; this is the part you actually have to read. */}
              {guesses.length > 0 && (
                <div className="space-y-1.5 mt-4">
                  {guesses.map((guess, i) => (
                    <GuessRow
                      key={i}
                      guess={guess}
                      index={i}
                      correct={status === 'won' && i === guesses.length - 1}
                      showEraHint={rules.eraHint}
                    />
                  ))}
                </div>
              )}

              {finished && answer && (
                <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
                  <div className="flex gap-4">
                    {/* Art stays hidden until the round is over — era covers are
                        shared, so showing one early would narrow the field. */}
                    <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-xl border border-[var(--border)] bg-[var(--surface-overlay)] overflow-hidden flex items-center justify-center">
                      {answer.imageUrl
                        ? <img src={smallCoverUrl(answer.imageUrl)} alt="" className="w-full h-full object-cover" />
                        : <Music2 size={28} className="text-text-muted" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-[10px] font-bold uppercase tracking-[0.2em] mb-1 ${status === 'won' ? 'text-accent' : 'text-red-400'}`}>
                        {status === 'won'
                          ? `Got it in ${guesses.length} ${guesses.length === 1 ? 'try' : 'tries'}`
                          : 'Out of guesses'}
                      </p>
                      <h2 className="text-text-primary text-lg font-bold leading-snug">{answer.name}</h2>
                      <p className="text-sm text-text-secondary mt-0.5">
                        {[answer.era, CATEGORY_LABELS[answer.category] ?? answer.category, answer.length,
                          versions.get(answer.id)?.version]
                          .filter(Boolean).join(' · ')}
                      </p>
                      {/* Won on a different row — say why it counted, or it looks
                          like the game accepted a song you didn't guess. */}
                      {status === 'won' && guesses[guesses.length - 1]?.viaVersion && (
                        <p className="text-xs text-text-muted mt-1.5">
                          Counted “{guesses[guesses.length - 1].label}” — same song, different version.
                        </p>
                      )}
                    </div>
                  </div>
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
                      <button
                        onClick={() => setShowLeaderboard(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border border-[var(--border)] text-text-secondary hover:text-text-primary transition-colors"
                      >
                        <Trophy size={15} /> Leaderboard
                      </button>
                    )}
                    {isDaily && (
                      <span className="ml-auto text-xs text-text-muted tabular-nums">
                        Next {mode === 'personal' ? 'song' : 'puzzle'} in {formatCountdown(countdown)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {!finished && (
                <p className="text-center text-[10px] font-mono tracking-wider text-text-muted mt-4">
                  {ladder.length - guesses.length} {ladder.length - guesses.length === 1 ? 'guess' : 'guesses'} left ·
                  {' '}each miss unlocks more of the {startAt > 0 ? 'clip' : 'intro'}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {showStats && <StatsPanel initialMode={dailyMode} onClose={() => setShowStats(false)} />}
      {showLeaderboard && (
        <LeaderboardPanel
          initialMode={dailyMode}
          signedIn={!!account}
          onClose={() => setShowLeaderboard(false)}
        />
      )}
      {showSettings && (
        <SettingsPanel
          settings={settings}
          onChange={setSettings}
          eras={availableEras}
          mode={mode}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
