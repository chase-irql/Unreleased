/**
 * queueSlice.ts — all queue and playback logic in one place.
 *
 * Responsibilities:
 *  - Queue state (tracks, index, shuffle, repeat)
 *  - Playback state (currentTrack, isPlaying, progress, currentTime)
 *  - Lazy loading (background page fetching, triggered by nextTrack)
 *  - Shuffle with random insertion so newly fetched tracks land at random
 *    positions in the upcoming list instead of piling up at the end
 *  - Radio mode: when shuffle is active from the Tracker, uses /radio/random/
 *    instead of a pre-built queue. Queue stays empty (only history is kept).
 */

import type { StateCreator } from 'zustand'
import type { Track } from '../types'
import { apiFetch, songToTrack } from '../lib/juicewrldApi'
import type { JWApiPaginatedResponse, JWApiSong } from '../lib/juicewrldApi'
import { getOwnVersionMeta, getVersionGroup } from '../lib/versionsApi'
import type { SongVersionMeta } from '../lib/versionsApi'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QueueFilter {
  /** Empty string = no filter (full catalog). */
  category: string
  era: string
  search: string
  /** Next page number to fetch. */
  page: number
  hasMore: boolean
  total: number
}

interface RadioResponse {
  title: string
  path: string
  song: JWApiSong
  size: number
  hash: string
}

export interface QueueSlice {
  // Playback
  queue: Track[]
  queueIndex: number
  currentTrack: Track | null
  isPlaying: boolean
  progress: number
  currentTime: number
  shuffle: boolean
  repeat: 'none' | 'all' | 'one'

  // Lazy loading (non-radio mode)
  queueFilter: QueueFilter | null
  /** True while a background page fetch is in flight. */
  queueLoadingMore: boolean
  /** Where the current queue came from — used to activate radio on shuffle. */
  queueSource: 'tracker' | 'playlist' | null

  /**
   * Radio mode: enabled when the user clicks a track from the Tracker with
   * shuffle on. Uses /radio/random/ to fetch each next song — no pre-built
   * queue. History of played tracks is kept in `queue` (capped at 30).
   */
  radioMode: boolean
  /** Pre-fetched next radio track, null while the fetch is in flight. */
  radioNext: Track | null
  /** True when nextTrack() was called but radioNext wasn't ready yet. */
  _radioWaiting: boolean
  radioFilter: { category: string; era: string; search: string; total: number } | null

  // ── Actions ──────────────────────────────────────────────────────────────

  /**
   * Start playing `track` with a known context list.
   * `filter` enables lazy loading beyond the initial context.
   * Does NOT activate radio mode — use `startRadio` for that.
   */
  playTrack: (track: Track, context?: Track[], filter?: QueueFilter | null, source?: 'tracker' | 'playlist' | null) => void

  /**
   * Start radio mode. The queue is seeded with `track` only;
   * subsequent songs come from /radio/random/ one at a time.
   */
  startRadio: (track: Track, filter?: { category: string; era: string; search: string; total: number } | null) => void
  /** Exit radio mode, keep current track playing. */
  stopRadio: () => void

  /** Advance to the next track. Returns the track, or null if playback stops. */
  nextTrack: () => Track | null

  /** Go back one track (or restart if >3 s in). */
  prevTrack: () => Track | null

  /**
   * Jump to a specific track in the queue without touching radioMode.
   * Used when clicking history items during radio.
   */
  jumpToTrack: (track: Track) => void

  toggleShuffle: () => void
  toggleRepeat: () => void

  setIsPlaying: (playing: boolean) => void
  setProgress: (progress: number) => void
  setCurrentTime: (time: number) => void

  // Queue editing
  addToQueue: (track: Track) => void
  playNext: (track: Track) => void
  removeFromQueue: (absoluteIndex: number) => void
  clearQueue: () => void
  reorderQueue: (fromIdx: number, toIdx: number) => void

  // Internal
  _loadMore: () => void
  _prefetchRadioTrack: () => void
  /** If "prefer OG version" is enabled, asynchronously swaps `track` for its
   *  linked OG sibling (if one exists) once it becomes the current track. */
  _maybeSwapToOg: (track: Track) => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Fisher-Yates shuffle — returns a new array, does not mutate. */
export function fisherYates<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Insert `items` at uniformly-random positions within `base`.
 * Returns a new array; does not mutate inputs.
 */
function insertRandom<T>(base: T[], items: T[]): T[] {
  const result = [...base]
  for (const item of items) {
    result.splice(Math.floor(Math.random() * (result.length + 1)), 0, item)
  }
  return result
}

const RADIO_HISTORY_LIMIT = 30

/** Matches version labels like "OG", "OG File", "OG Quality" (not "Original Key",
 *  which is an unrelated field) — the community convention for the raw/leaked
 *  file as opposed to a snippet, CDQ rip, TV mix, etc. */
const isOgVersion = (meta: SongVersionMeta | null | undefined): boolean =>
  !!meta && /\bog\b/i.test(`${meta.version ?? ''} ${meta.versionTitle ?? ''}`)

/** Given an API-sourced track, looks up its linked version group and — if an
 *  "OG" sibling exists and this track isn't already it — returns a Track for
 *  that sibling. Returns null if there's nothing to swap to. */
async function findOgTrack(track: Track): Promise<Track | null> {
  if (!track.id.startsWith('jw-')) return null
  const songId = Number(track.id.slice(3))
  if (!Number.isFinite(songId)) return null

  const [own, group] = await Promise.all([getOwnVersionMeta(songId), getVersionGroup(songId)])
  if (isOgVersion(own)) return null
  const ogSibling = group.find(isOgVersion)
  if (!ogSibling) return null

  const song = await apiFetch<JWApiSong>(`/songs/${ogSibling.songId}/`)
  return songToTrack(song)
}

// ─── Slice factory ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createQueueSlice: StateCreator<any, [], [], QueueSlice> = (set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  queue: [],
  queueIndex: -1,
  currentTrack: null,
  isPlaying: false,
  progress: 0,
  currentTime: 0,
  shuffle: false,
  repeat: 'none',
  queueFilter: null,
  queueLoadingMore: false,
  queueSource: null,
  radioMode: false,
  radioNext: null,
  _radioWaiting: false,
  radioFilter: null,

  // ── Simple setters ─────────────────────────────────────────────────────────
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setProgress: (progress) => set({ progress }),
  setCurrentTime: (currentTime) => set({ currentTime }),

  // ── playTrack ──────────────────────────────────────────────────────────────
  playTrack: (track, context?, filter = null, source = null) => {
    const tracks: Track[] = context ?? (get().queue as Track[])
    let idx = tracks.findIndex((t: Track) => t.id === track.id)
    if (idx < 0) idx = 0

    const { shuffle } = get()
    let finalQueue = tracks
    if (shuffle && source !== 'tracker') {
      const played = tracks.slice(0, idx + 1)
      const upcoming = fisherYates(tracks.slice(idx + 1))
      finalQueue = [...played, ...upcoming]
    }

    set({
      queue: finalQueue,
      queueIndex: idx,
      currentTrack: track,
      currentTrackFull: null,
      isPlaying: true,
      queueFilter: filter,
      queueSource: source,
      radioMode: false,
      radioNext: null,
      _radioWaiting: false,
      radioFmActive: false,
      progress: 0,
      currentTime: 0,
    })
    if (filter?.hasMore) get()._loadMore()
    get()._maybeSwapToOg(track)
  },

  // ── stopRadio ──────────────────────────────────────────────────────────────
  stopRadio: () => {
    set({ radioMode: false, radioNext: null, _radioWaiting: false })
  },

  // ── startRadio ─────────────────────────────────────────────────────────────
  startRadio: (track, filter = null) => {
    set({
      queue: [track],
      queueIndex: 0,
      currentTrack: track,
      currentTrackFull: null,
      isPlaying: true,
      queueFilter: null,
      queueLoadingMore: false,
      radioMode: true,
      radioFilter: filter,
      radioNext: null,
      _radioWaiting: false,
      radioFmActive: false,
      progress: 0,
      currentTime: 0,
    })
    get()._prefetchRadioTrack()
    get()._maybeSwapToOg(track)
  },

  // ── nextTrack ──────────────────────────────────────────────────────────────
  nextTrack: () => {
    const { queue, queueIndex, shuffle, repeat, radioMode, radioNext } = get()

    // ── Radio mode ──────────────────────────────────────────────────────────
    if (radioMode) {
      if (!radioNext) {
        // Pre-fetch not ready yet — mark as waiting; _prefetchRadioTrack will
        // auto-play when the fetch completes.
        set({ isPlaying: false, _radioWaiting: true })
        return null
      }
      // Advance to the pre-fetched track (roll history, cap at limit)
      const newQueue = [...queue.slice(-(RADIO_HISTORY_LIMIT - 1)), radioNext]
      set({
        queue: newQueue,
        queueIndex: newQueue.length - 1,
        currentTrack: radioNext,
        currentTrackFull: null,
        isPlaying: true,
        radioNext: null,
        _radioWaiting: false,
        progress: 0,
        currentTime: 0,
      })
      get()._prefetchRadioTrack()
      get()._maybeSwapToOg(radioNext)
      return radioNext
    }

    if (queue.length === 0) return null

    // ── Standard queue ──────────────────────────────────────────────────────
    let nextIdx: number

    if (repeat === 'one') {
      nextIdx = queueIndex
    } else if (shuffle) {
      nextIdx = queueIndex + 1
      if (nextIdx >= queue.length) {
        if (repeat === 'all') {
          const reshuffled = fisherYates(queue)
          const first = reshuffled[0]
          set({ queue: reshuffled, queueIndex: 0, currentTrack: first, currentTrackFull: null, isPlaying: true, progress: 0, currentTime: 0 })
          get()._loadMore()
          get()._maybeSwapToOg(first)
          return first
        } else {
          set({ isPlaying: false }); return null
        }
      }
    } else {
      nextIdx = queueIndex + 1
      if (nextIdx >= queue.length) {
        if (repeat === 'all') nextIdx = 0
        else { set({ isPlaying: false }); return null }
      }
    }

    const track = queue[nextIdx]
    set({ queueIndex: nextIdx, currentTrack: track, currentTrackFull: null, isPlaying: true, progress: 0, currentTime: 0 })
    get()._loadMore()
    get()._maybeSwapToOg(track)
    return track
  },

  // ── prevTrack ──────────────────────────────────────────────────────────────
  prevTrack: () => {
    const { queue, queueIndex, currentTime, radioMode } = get()
    if (queue.length === 0) return null

    // In radio mode, only allow restarting the current track
    if (radioMode) {
      set({ currentTime: 0, progress: 0 })
      return get().currentTrack
    }

    if (currentTime > 3) {
      set({ currentTime: 0, progress: 0 })
      return get().currentTrack
    }

    const prevIdx = Math.max(0, queueIndex - 1)
    const track = queue[prevIdx]
    set({ queueIndex: prevIdx, currentTrack: track, currentTrackFull: null, isPlaying: true, progress: 0, currentTime: 0 })
    get()._maybeSwapToOg(track)
    return track
  },

  // ── jumpToTrack ───────────────────────────────────────────────────────────────
  jumpToTrack: (track) => {
    const { queue } = get()
    const idx = queue.findIndex((t: Track) => t.id === track.id)
    if (idx < 0) return
    set({ queueIndex: idx, currentTrack: track, currentTrackFull: null, isPlaying: true, progress: 0, currentTime: 0 })
    get()._maybeSwapToOg(track)
  },

  // ── toggleShuffle ──────────────────────────────────────────────────────────
  toggleShuffle: () => {
    const { shuffle, queue, queueIndex, queueFilter, radioMode, currentTrack, queueSource } = get()
    const newShuffle = !shuffle

    if (!newShuffle) {
      // Turning OFF: exit radio mode if active, resume linear playback
      set({ shuffle: false, radioMode: false, radioNext: null, _radioWaiting: false })
      return
    }

    if (radioMode) {
      // Already in radio mode — no change needed for toggling ON again
      return
    }

    // Turning ON: tracker context → radio mode; otherwise shuffle the queue
    if (queueSource === 'tracker' && currentTrack) {
      set({ shuffle: true })
      const rf = queueFilter
        ? { category: queueFilter.category, era: queueFilter.era, search: queueFilter.search, total: queueFilter.total }
        : null
      get().startRadio(currentTrack, rf)
      return
    }

    // Turning ON (playlist/files/non-tracker): shuffle the upcoming portion
    const played = queue.slice(0, queueIndex + 1)
    const upcoming = fisherYates(queue.slice(queueIndex + 1))
    set({ shuffle: true, queue: [...played, ...upcoming] })
  },

  // ── toggleRepeat ───────────────────────────────────────────────────────────
  toggleRepeat: () =>
    set((s: QueueSlice) => {
      const order: Array<'none' | 'all' | 'one'> = ['none', 'all', 'one']
      return { repeat: order[(order.indexOf(s.repeat) + 1) % 3] }
    }),

  // ── Queue editing ──────────────────────────────────────────────────────────
  addToQueue: (track) => set((s: QueueSlice) => ({ queue: [...s.queue, track] })),

  playNext: (track) =>
    set((s: QueueSlice) => {
      const after = s.queueIndex + 1
      return { queue: [...s.queue.slice(0, after), track, ...s.queue.slice(after)] }
    }),

  removeFromQueue: (index) =>
    set((s: QueueSlice) => {
      const next = s.queue.filter((_, i) => i !== index)
      const newIndex = index <= s.queueIndex ? Math.max(0, s.queueIndex - 1) : s.queueIndex
      return { queue: next, queueIndex: newIndex }
    }),

  clearQueue: () =>
    set((s: QueueSlice) => ({
      queue: s.currentTrack ? [s.currentTrack] : [],
      queueIndex: 0,
      radioMode: false,
      radioNext: null,
      _radioWaiting: false,
    })),

  reorderQueue: (fromIdx, toIdx) =>
    set((s: QueueSlice) => {
      const base = s.queueIndex + 1
      const upcoming = [...s.queue.slice(base)]
      const [moved] = upcoming.splice(fromIdx, 1)
      upcoming.splice(toIdx, 0, moved)
      return { queue: [...s.queue.slice(0, base), ...upcoming] }
    }),

  // ── Lazy loading (non-radio) ───────────────────────────────────────────────
  _loadMore: () => {
    const { queue, queueIndex, shuffle, queueFilter, queueLoadingMore, radioMode } = get()
    if (radioMode || !queueFilter?.hasMore || queueLoadingMore) return

    const upcomingCount = queue.length - queueIndex - 1
    const threshold = shuffle ? 40 : 15
    if (upcomingCount >= threshold) return

    set({ queueLoadingMore: true })
    apiFetch<JWApiPaginatedResponse>('/songs/', {
      searchall: queueFilter.search || undefined,
      category: queueFilter.category || undefined,
      era: queueFilter.era || undefined,
      page: queueFilter.page,
      page_size: 50,
    })
      .then((data) => {
        const newTracks = data.results.filter((s) => !!s.path).map(songToTrack)
        const { queue: q, queueIndex: qi, shuffle: isShuffle, queueFilter: qf } = get()
        if (!qf) return

        let nextQueue: Track[]
        if (isShuffle) {
          const played = q.slice(0, qi + 1)
          const upcoming = insertRandom(q.slice(qi + 1), newTracks)
          nextQueue = [...played, ...upcoming]
        } else {
          nextQueue = [...q, ...newTracks]
        }

        set({
          queue: nextQueue,
          queueLoadingMore: false,
          queueFilter: { ...qf, page: qf.page + 1, hasMore: data.next !== null },
        })
      })
      .catch(() => set({ queueLoadingMore: false }))
  },

  // ── Radio pre-fetch ────────────────────────────────────────────────────────────
  _prefetchRadioTrack: () => {
    const { radioFilter } = get()

    const handleTrack = (track: Track): void => {
      if (!get().radioMode) return
      const wasWaiting = get()._radioWaiting
      set({ radioNext: track, _radioWaiting: false })
      if (wasWaiting) {
        const { queue } = get()
        const newQueue = [...queue.slice(-(RADIO_HISTORY_LIMIT - 1)), track]
        set({ queue: newQueue, queueIndex: newQueue.length - 1, currentTrack: track, currentTrackFull: null, isPlaying: true, radioNext: null, progress: 0, currentTime: 0 })
        get()._prefetchRadioTrack()
        get()._maybeSwapToOg(track)
      }
    }

    const handleError = (): void => {
      if (get().radioMode) setTimeout(() => get()._prefetchRadioTrack(), 3000)
    }

    if (radioFilter && (radioFilter.category || radioFilter.era || radioFilter.search)) {
      const pageSize = 50
      const totalPages = Math.max(1, Math.ceil(radioFilter.total / pageSize))
      const randomPage = Math.floor(Math.random() * totalPages) + 1
      apiFetch<JWApiPaginatedResponse>('/songs/', {
        searchall: radioFilter.search || undefined,
        category: radioFilter.category || undefined,
        era: radioFilter.era || undefined,
        page: randomPage,
        page_size: pageSize,
      })
        .then((data) => {
          if (!get().radioMode) return
          const playable = data.results.filter((s: JWApiSong) => !!s.path)
          if (playable.length === 0) { handleError(); return }
          handleTrack(songToTrack(playable[Math.floor(Math.random() * playable.length)]))
        })
        .catch(handleError)
    } else {
      apiFetch<RadioResponse>('/radio/random/')
        .then((data) => handleTrack(songToTrack(data.song)))
        .catch(handleError)
    }
  },

  // ── Prefer-OG swap ─────────────────────────────────────────────────────────
  _maybeSwapToOg: (track) => {
    if (!get().preferOgVersion) return
    findOgTrack(track)
      .then((ogTrack) => {
        if (!ogTrack) return
        const state = get()
        // Bail if the user has since moved on to a different track.
        if (state.currentTrack?.id !== track.id) return
        set({
          currentTrack: ogTrack,
          currentTrackFull: null,
          queue: state.queue.map((t: Track) => (t.id === track.id ? ogTrack : t)),
        })
      })
      .catch(() => {})
  },
})