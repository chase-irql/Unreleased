import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { ViewType, FullTrack, LibraryTrack, LocalPlaylist, OfflineTrackMeta, OfflinePlaylistEntry } from '../types'
import * as userApi from '../lib/userApi'
import type { AccountUser, PlaylistSummary } from '../lib/userApi'
import { apiFetch, buildStreamUrl, buildImageUrl, parseDuration } from '../lib/juicewrldApi'
import type { JWApiSong } from '../lib/juicewrldApi'
import { createQueueSlice, QueueSlice } from './queueSlice'
import { getSkin, type SkinId } from '../lib/skins'
import { HOTKEY_ACTIONS, effectiveBinding } from '../lib/hotkeys'

// Key used to track songs downloaded individually (song context menu →
// "Download offline"), rather than through a synced playlist. It's just
// another entry in `offlinePlaylists`/main's `lib.playlists`, so a song
// downloaded this way survives the same-name pruning that offline-set-playlist
// runs after every real playlist sync — without this, an individually-
// downloaded track would look "unreferenced" the next time any playlist
// resyncs and get deleted out from under the user.
const INDIVIDUAL_DOWNLOADS_KEY = 'individual-downloads'

// Lightweight localStorage persistence helper
const ls = {
  get: <T>(key: string): T | null => {
    try {
      const v = localStorage.getItem(`unreleased:${key}`)
      return v ? (JSON.parse(v) as T) : null
    } catch {
      return null
    }
  },
  set: <T>(key: string, value: T): void => {
    try {
      localStorage.setItem(`unreleased:${key}`, JSON.stringify(value))
    } catch {}
  },
}

// ─── Download item (in-session, Electron only) ────────────────────────────────

export interface DownloadItem {
  id: string
  filename: string
  type: 'file' | 'zip' | 'update' | 'playlist'
  state: 'downloading' | 'done' | 'error' | 'cancelled'
  percent: number
  received?: number
  total?: number
  savePath?: string
  error?: string
  // Byte-level size/throughput info, shown alongside the track-count or
  // percent progress above — `bytesReceived` is cumulative bytes actually
  // written to disk so far (across every file, for multi-file downloads),
  // `speedBps` is a live bytes/sec sample (undefined between samples/when idle).
  bytesReceived?: number
  speedBps?: number
}

// Where the desktop nav menu sits — classic left sidebar, mirrored right, or a
// horizontal bar above/below the content. Mobile always uses the bottom tab bar.
export type SidebarPosition = 'left' | 'right' | 'top' | 'bottom'

// ─── Non-queue state ──────────────────────────────────────────────────────────

interface AppState {
  // Playback extras (not queue-managed)
  currentTrackFull: FullTrack | null
  volume: number
  playbackSpeed: number
  // Seconds added to the lookup time when matching synced (LRC) lyric lines —
  // positive shifts lyrics later (delays them), negative shifts them earlier,
  // compensating for lyric files that aren't quite in step with the audio.
  lyricsOffset: number

  // UI
  activeView: ViewType
  showNowPlaying: boolean
  showSettings: boolean
  showDiagnostics: boolean
  showQueue: boolean
  // True while the WRLD tab's own in-page fullscreen (album-art focus mode)
  // is active — lets App.tsx hide the frameless-window title bar controls,
  // which would otherwise float over the immersive view.
  wrldFullscreen: boolean
  radioFmActive: boolean
  radioFmIsLive: boolean | null  // null = unknown (not yet checked)
  radioFmNowPlaying: import('../lib/radioLive').RadioTrack | null
  radioFmVote: import('../lib/radioLive').RadioVote | null
  radioFmUpNext: import('../lib/radioLive').RadioTrack | null
  radioFmQueuePreview: string[]
  radioFmMatchedSong: { songId: number | null; imageUrl: string | null; path: string | null; lyrics: string | null; syncedLyrics: string | null; era: string | null } | null
  theme: SkinId
  sidebarPosition: SidebarPosition

  // Settings
  crossfadeEnabled: boolean
  crossfadeDuration: number
  // Ramp volume down briefly on pause (and back up on resume) instead of
  // cutting the audio off instantly.
  pauseFadeEnabled: boolean
  sleepTimerEnd: number | null
  audioOutput: string
  accentColor: string
  // When enabled, if a track has a linked "OG" version (same song, grouped via
  // the versions system, labeled e.g. "OG"/"OG File"), play that version's
  // file instead of the currently selected one.
  preferOgVersion: boolean

  // Keyboard shortcuts. `hotkeyBindings` holds only user *overrides* of the
  // defaults in lib/hotkeys.ts (actionId → combo; an explicit '' means the
  // user cleared that shortcut). `hotkeySeekSeconds` is the jump size for the
  // skip-forward / skip-backward shortcuts.
  hotkeyBindings: Record<string, string>
  hotkeySeekSeconds: number
  // When on (desktop only), eligible shortcuts (those with a modifier or a
  // media key) are also registered OS-wide so they work while the app is in
  // the background. See lib/hotkeys isGloballyRegistrable.
  globalHotkeysEnabled: boolean

  // Liked songs
  likedTrackIds: string[]

  // API tracker extras
  apiTrackerCategory: string
  apiTrackerEra: string
  apiFilesPath: string
  apiFilesLastPath: string

  // Account
  account: AccountUser | null
  playlists: PlaylistSummary[]
  showUserAuth: boolean

  // Sidebar → PlaylistsView: open a specific playlist without needing a URL
  // round-trip (works whether PlaylistsView is already mounted or not).
  pendingPlaylistId: number | null

  // Which playlist (API-backed or local) PlaylistsView currently has open —
  // lives here rather than as local component state because App.tsx unmounts
  // PlaylistsView whenever you switch to another tab, which would otherwise
  // silently drop back to the playlist list every time you navigate away and
  // back. Cleared by the "playlists:back" event (tapping the tab again).
  playlistsSelectedId: number | null
  playlistsSelectedLocalId: string | null

  // Editor
  pendingEditorSongId: number | null
  pendingEditProposal: { id: number; songId: number | null; proposedData: Record<string, unknown>; editorNotes: string } | null
  // Local-file metadata editor — the track being edited on the 'local-editor' view
  pendingLocalEditTrack: LibraryTrack | null


  // Library (Electron only)
  libraryTracks: LibraryTrack[]
  libraryFolders: string[]
  libraryScanning: boolean
  libraryLastScanned: number | null
  // When enabled, periodically re-checks library files against their cached
  // size/mtime and reloads tags for any that changed on disk (e.g. edited in
  // an external tag editor) without a full manual "Scan Now".
  libraryAutoRefresh: boolean
  // Reveals the Developer tab in Settings (cache/diagnostics tools normal
  // users don't need cluttering the main App tab).
  developerMode: boolean
  localPlaylists: LocalPlaylist[]
  activeLocalPlaylistId: string | null

  // Offline playlist sync (Electron only) — API-backed playlists downloaded
  // for offline playback, kept in sync with the API's song metadata.
  offlineTracks: Record<string, OfflineTrackMeta>
  offlinePlaylists: Record<string, OfflinePlaylistEntry>
  offlineSync: Record<string, { state: 'syncing' | 'done' | 'error'; current: number; total: number }>

  // Downloads (Electron only)
  downloads: DownloadItem[]
  showDownloadManager: boolean
  updateStatus: { type: string; version?: string; percent?: number; bytesPerSecond?: number; message?: string } | null
}

interface AppActions {
  setCurrentTrackFull: (full: FullTrack | null | ((prev: FullTrack | null) => FullTrack | null)) => void
  setVolume: (vol: number) => void
  setPlaybackSpeed: (speed: number) => void
  setLyricsOffset: (offset: number) => void

  setActiveView: (view: ViewType) => void
  setShowNowPlaying: (show: boolean) => void
  setRadioFmActive: (active: boolean) => void
  setRadioFmIsLive: (live: boolean | null) => void
  setRadioFmNowPlaying: (track: import('../lib/radioLive').RadioTrack | null) => void
  setRadioFmVote: (vote: import('../lib/radioLive').RadioVote | null) => void
  setRadioFmUpNext: (track: import('../lib/radioLive').RadioTrack | null) => void
  setRadioFmQueuePreview: (preview: string[]) => void
  setRadioFmMatchedSong: (song: { songId: number | null; imageUrl: string | null; path: string | null; lyrics: string | null; syncedLyrics: string | null; era: string | null } | null) => void
  setShowSettings: (show: boolean) => void
  setShowDiagnostics: (show: boolean) => void
  setShowQueue: (show: boolean) => void
  setWrldFullscreen: (fullscreen: boolean) => void
  setTheme: (theme: SkinId) => void
  setSidebarPosition: (position: SidebarPosition) => void

  setCrossfade: (enabled: boolean, duration: number) => void
  setPauseFade: (enabled: boolean) => void
  setSleepTimer: (endTimestamp: number | null) => void
  setAudioOutput: (deviceId: string) => void
  setAccentColor: (color: string) => void
  setPreferOgVersion: (enabled: boolean) => void
  // Bind (or, with combo === '', clear) a shortcut. Passing a combo already in
  // use elsewhere transfers it — the previous owner is cleared — so bindings
  // stay unique. Resets restore every action to its default.
  setHotkeyBinding: (actionId: string, combo: string) => void
  resetHotkeyBindings: () => void
  setHotkeySeekSeconds: (seconds: number) => void
  setGlobalHotkeysEnabled: (enabled: boolean) => void

  toggleLike: (trackId: string) => void

  setApiTrackerCategory: (cat: string) => void
  setApiTrackerEra: (era: string) => void
  setApiFilesPath: (path: string) => void
  setApiFilesLastPath: (path: string) => void

  setShowUserAuth: (show: boolean) => void
  loadAccount: () => Promise<void>
  loginWithDiscord: () => Promise<void>
  completeDiscordLogin: (code: string, state: string) => Promise<void>
  logoutAccount: () => Promise<void>
  refreshPlaylists: () => Promise<void>
  prefetchPlaylistDetails: () => Promise<void>
  prefetchApiData: () => Promise<void>
  setPendingPlaylistId: (id: number | null) => void
  setPlaylistsSelectedId: (id: number | null) => void
  setPlaylistsSelectedLocalId: (id: string | null) => void

  setPendingEditorSongId: (id: number | null) => void
  // "Edit this song" from anywhere — desktop opens the pop-out editor
  // window, web navigates to the in-app editor view.
  openSongEditor: (songId: number) => void
  setPendingEditProposal: (p: { id: number; songId: number | null; proposedData: Record<string, unknown>; editorNotes: string } | null) => void
  setPendingLocalEditTrack: (track: LibraryTrack | null) => void


  setLibraryTracks: (tracks: LibraryTrack[]) => void
  updateLibraryTrack: (id: string, updates: Partial<LibraryTrack>) => void
  applyLibraryArt: (id: string, art: string | null) => void
  addLibraryFolder: (folder: string) => void
  removeLibraryFolder: (folder: string) => void
  setLibraryLastScanned: (ts: number | null) => void
  setLibraryAutoRefresh: (enabled: boolean) => void
  setDeveloperMode: (enabled: boolean) => void
  scanLibrary: () => Promise<void>

  createLocalPlaylist: (name: string) => void
  deleteLocalPlaylist: (id: string) => void
  renameLocalPlaylist: (id: string, name: string) => void
  updateLocalPlaylist: (id: string, updates: { name?: string; coverImage?: string | null }) => void
  addToLocalPlaylist: (playlistId: string, trackId: string) => void
  removeFromLocalPlaylist: (playlistId: string, trackId: string) => void
  reorderLocalPlaylist: (playlistId: string, trackIds: string[]) => void
  loadLibrary: () => Promise<void>

  loadOfflineLibrary: () => Promise<void>
  downloadPlaylistOffline: (key: string, name: string, songIds: number[], opts?: { silent?: boolean }) => Promise<void>
  removePlaylistOffline: (key: string) => Promise<void>
  downloadTrackOffline: (songId: number) => Promise<void>
  removeOfflineTrack: (trackId: string) => Promise<void>
  syncOfflinePlaylists: () => Promise<void>
  autoDownloadIfOffline: (playlistId: number, addedSongIds: number[]) => Promise<void>

  addDownload: (item: DownloadItem) => void
  updateDownload: (id: string, updates: Partial<DownloadItem>) => void
  removeDownload: (id: string) => void
  clearCompletedDownloads: () => void
  setShowDownloadManager: (show: boolean) => void
  setUpdateStatus: (status: { type: string; version?: string; percent?: number; bytesPerSecond?: number; message?: string } | null) => void
}

export type AppStore = QueueSlice & AppState & AppActions

// ─── Store ────────────────────────────────────────────────────────────────────

// Dedup flag: prevents concurrent /playlists/ fetches
let _playlistsInFlight = false
// Dedup flag: prevents the startup detail/cover prefetch from running twice
// (e.g. loadAccount racing with a later refreshPlaylists on the same session)
let _detailsPrefetchInFlight = false
// Dedup flag: same idea for the Tracker/Files offline-cache warm-up
let _apiPrefetchInFlight = false

// ── Offline-sync concurrency guards ──────────────────────────────────────────
// syncOfflinePlaylists fires from three places (startup, every window focus,
// a 15-min interval) with nothing stopping them from overlapping. Overlapping
// runs each snapshot `offlineTracks` at their start, so both would download
// the same missing songs — two streams writing the same file — and re-announce
// downloads the user already saw ("my playlists redownload on their own").
let _offlineSyncInFlight = false
// Serializes offline writers per playlist key. Without this, a manual download,
// a background resync, and autoDownloadIfOffline can interleave for the same
// playlist; whichever finishes last saves its (possibly stale) song list, and
// offline-set-playlist's prune then deletes freshly-downloaded files that the
// stale list doesn't mention — which the next resync dutifully re-downloads.
const _offlineKeyQueues = new Map<string, Promise<void>>()
// Bumped by removePlaylistOffline. A download that started before the bump
// aborts instead of running offlineSetPlaylist at its end — otherwise removing
// a playlist while a sync was in flight re-registered ("resurrected") it, and
// since removal had already pruned its files, the next background sync
// re-downloaded the entire playlist unprompted.
const _offlineKeyEpochs = new Map<string, number>()

// Pending cover-art results awaiting a batched flush (see applyLibraryArt).
// Covers arrive in bursts — one per visible row — and applying each through
// its own set() meant a full libraryTracks copy and list re-render per cover.
let _pendingArt: Map<string, string | null> | null = null

// Chains `fn` behind any in-flight offline work for `key` so writers for the
// same playlist never interleave.
function enqueueOfflineWork(key: string, fn: () => Promise<void>): Promise<void> {
  const prev = _offlineKeyQueues.get(key) ?? Promise.resolve()
  const run = prev.catch(() => {}).then(fn)
  _offlineKeyQueues.set(key, run)
  run.finally(() => { if (_offlineKeyQueues.get(key) === run) _offlineKeyQueues.delete(key) }).catch(() => {})
  return run
}

export const useStore = create<AppStore>((set, get, store) => ({
  // ── Queue slice (all queue + playback logic) ───────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...createQueueSlice(set, get, store as any),

  // ── Playback extras ───────────────────────────────────────────────────────
  currentTrackFull: null,
  volume: ls.get<number>('volume') ?? 0.8,
  playbackSpeed: ls.get<number>('playbackSpeed') ?? 1,
  lyricsOffset: ls.get<number>('lyricsOffset') ?? 0,

  setCurrentTrackFull: (full) => {
    if (typeof full === 'function') {
      set(state => ({ currentTrackFull: full(state.currentTrackFull) }))
    } else {
      set({ currentTrackFull: full })
    }
  },
  setVolume: (volume) => { set({ volume }); ls.set('volume', volume) },
  setPlaybackSpeed: (speed) => { set({ playbackSpeed: speed }); ls.set('playbackSpeed', speed) },
  setLyricsOffset: (offset) => { set({ lyricsOffset: offset }); ls.set('lyricsOffset', offset) },

  // ── UI ────────────────────────────────────────────────────────────────────
  activeView: 'api-tracker',
  showNowPlaying: false,
  showSettings: false,
  showDiagnostics: false,
  showQueue: false,
  wrldFullscreen: false,
  radioFmActive: false,
  radioFmIsLive: null,
  radioFmNowPlaying: null,
  radioFmVote: null,
  radioFmUpNext: null,
  radioFmQueuePreview: [],
  radioFmMatchedSong: null,
  // getSkin() maps unknown persisted ids (renamed/removed skins) back to dark.
  theme: getSkin(ls.get<string>('theme') ?? 'dark').id,
  sidebarPosition: ls.get<SidebarPosition>('sidebarPosition') ?? 'left',

  setActiveView: (view) => {
    const paths: Partial<Record<ViewType, string>> = {
      'api-categories': '/categories',
      'api-tracker': '/tracker',
      'api-files': '/files',
      'editor': '/editor',
      'admin': '/admin',
      'liked': '/liked',
      'playlists': '/playlists',
      'wrld': '/wrld',
    }
    window.history.pushState({ view }, '', paths[view] ?? '/tracker')
    set({ activeView: view })
  },
  setShowNowPlaying: (showNowPlaying) => set({ showNowPlaying }),
  setRadioFmActive: (radioFmActive) => set({ radioFmActive }),
  setRadioFmIsLive: (radioFmIsLive) => set({ radioFmIsLive }),
  setRadioFmNowPlaying: (radioFmNowPlaying) => set({ radioFmNowPlaying }),
  setRadioFmVote: (radioFmVote) => set({ radioFmVote }),
  setRadioFmUpNext: (radioFmUpNext) => set({ radioFmUpNext }),
  setRadioFmQueuePreview: (radioFmQueuePreview) => set({ radioFmQueuePreview }),
  setRadioFmMatchedSong: (radioFmMatchedSong) => set({ radioFmMatchedSong }),
  setShowSettings: (showSettings) => {
    // Desktop: Settings lives in its own pop-out window (see FloatApp) — every
    // "open settings" path routes there. The in-app overlay remains only for
    // the web build, where there are no extra OS windows.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = (window as any).electron
    if (showSettings && el?.openFloatWindow) {
      el.openFloatWindow('settings')
      return
    }
    set({ showSettings })
  },
  setShowDiagnostics: (showDiagnostics) => set({ showDiagnostics }),
  setShowQueue: (showQueue) => set({ showQueue }),
  setWrldFullscreen: (wrldFullscreen) => set({ wrldFullscreen }),
  setTheme: (theme) => { set({ theme }); ls.set('theme', theme) },
  setSidebarPosition: (sidebarPosition) => { set({ sidebarPosition }); ls.set('sidebarPosition', sidebarPosition) },

  // ── Settings ──────────────────────────────────────────────────────────────
  crossfadeEnabled: ls.get<boolean>('crossfadeEnabled') ?? false,
  crossfadeDuration: ls.get<number>('crossfadeDuration') ?? 5,
  pauseFadeEnabled: ls.get<boolean>('pauseFadeEnabled') ?? false,
  sleepTimerEnd: null,
  audioOutput: ls.get<string>('audioOutput') ?? '',
  accentColor: ls.get<string>('accentColor') ?? '#1db954',
  preferOgVersion: ls.get<boolean>('preferOgVersion') ?? false,
  hotkeyBindings: ls.get<Record<string, string>>('hotkeyBindings') ?? {},
  hotkeySeekSeconds: ls.get<number>('hotkeySeekSeconds') ?? 10,
  globalHotkeysEnabled: ls.get<boolean>('globalHotkeysEnabled') ?? false,

  setCrossfade: (enabled, duration) => {
    set({ crossfadeEnabled: enabled, crossfadeDuration: duration })
    ls.set('crossfadeEnabled', enabled)
    ls.set('crossfadeDuration', duration)
  },
  setPauseFade: (enabled) => { set({ pauseFadeEnabled: enabled }); ls.set('pauseFadeEnabled', enabled) },
  setSleepTimer: (sleepTimerEnd) => set({ sleepTimerEnd }),
  setAudioOutput: (deviceId) => { set({ audioOutput: deviceId }); ls.set('audioOutput', deviceId) },
  setPreferOgVersion: (enabled) => { set({ preferOgVersion: enabled }); ls.set('preferOgVersion', enabled) },
  setAccentColor: (color) => { set({ accentColor: color }); ls.set('accentColor', color) },

  setHotkeyBinding: (actionId, combo) => {
    const current = get().hotkeyBindings
    const next = { ...current }
    // Assigning a combo already bound elsewhere hands it over: clear it from
    // whichever action currently resolves to it, so no two actions share a key.
    if (combo) {
      for (const a of HOTKEY_ACTIONS) {
        if (a.id !== actionId && effectiveBinding(a.id, current) === combo) next[a.id] = ''
      }
    }
    const action = HOTKEY_ACTIONS.find((a) => a.id === actionId)
    // Store an override only when it differs from the default — if the user
    // sets it back to the default (or clears one that had no default), drop the
    // entry entirely so the persisted map stays minimal.
    if (combo === (action?.defaultBinding ?? '')) delete next[actionId]
    else next[actionId] = combo
    set({ hotkeyBindings: next })
    ls.set('hotkeyBindings', next)
  },
  resetHotkeyBindings: () => { set({ hotkeyBindings: {} }); ls.set('hotkeyBindings', {}) },
  setHotkeySeekSeconds: (seconds) => { set({ hotkeySeekSeconds: seconds }); ls.set('hotkeySeekSeconds', seconds) },
  setGlobalHotkeysEnabled: (enabled) => { set({ globalHotkeysEnabled: enabled }); ls.set('globalHotkeysEnabled', enabled) },

  // ── Liked songs ───────────────────────────────────────────────────────────
  likedTrackIds: ls.get<string[]>('likedTrackIds') ?? [],

  toggleLike: (trackId) => {
    const { likedTrackIds, account } = get()
    const wasLiked = likedTrackIds.includes(trackId)
    const next = wasLiked
      ? likedTrackIds.filter((id) => id !== trackId)
      : [...likedTrackIds, trackId]
    set({ likedTrackIds: next })
    ls.set('likedTrackIds', next)

    if (account) {
      const songId = userApi.trackIdToSongId(trackId)
      if (songId != null) {
        const op = wasLiked ? userApi.removeFavorite(songId) : userApi.addFavorite(songId)
        op.catch(() => {
          const current = get().likedTrackIds
          const reverted = wasLiked
            ? [...current, trackId]
            : current.filter((id) => id !== trackId)
          set({ likedTrackIds: reverted })
          ls.set('likedTrackIds', reverted)
        })
      }
    }
  },

  // ── API tracker extras ────────────────────────────────────────────────────
  apiTrackerCategory: '',
  apiTrackerEra: '',
  apiFilesPath: '',
  apiFilesLastPath: '',

  setApiTrackerCategory: (cat) => set({ apiTrackerCategory: cat }),
  setApiTrackerEra: (era) => set({ apiTrackerEra: era }),
  setApiFilesLastPath: (path) => set({ apiFilesLastPath: path }),
  setApiFilesPath: (path) => set({ apiFilesPath: path }),

  // ── Account ───────────────────────────────────────────────────────────────
  account: null,
  playlists: [],
  showUserAuth: false,
  pendingPlaylistId: null,
  setPendingPlaylistId: (id) => set({ pendingPlaylistId: id }),
  playlistsSelectedId: null,
  playlistsSelectedLocalId: null,
  setPlaylistsSelectedId: (id) => set({ playlistsSelectedId: id }),
  setPlaylistsSelectedLocalId: (id) => set({ playlistsSelectedLocalId: id }),

  setShowUserAuth: (showUserAuth) => set({ showUserAuth }),

  loadAccount: async () => {
    if (!userApi.getToken()) return
    try {
      const account = await userApi.getMe()
      set({ account })
    } catch (err) {
      // Only clear token on auth errors — network/server errors should not log the user out
      const msg = String(err)
      if (msg.includes('401') || msg.includes('403') || msg.includes('Unauthorized') || msg.includes('Forbidden')) {
        userApi.clearToken()
        set({ account: null, playlists: [] })
      }
      return
    }
    try {
      const favorites = await userApi.getFavorites()
      const serverIds = favorites.map((f) => `jw-${f.song.id}`)
      const localOnly = get().likedTrackIds.filter((id) => !serverIds.includes(id))
      await Promise.all(
        localOnly
          .map((id) => userApi.trackIdToSongId(id))
          .filter((sid): sid is number => sid != null)
          .map((sid) => userApi.addFavorite(sid).catch(() => undefined)),
      )
      const merged = Array.from(new Set([...serverIds, ...localOnly]))
      set({ likedTrackIds: merged })
      ls.set('likedTrackIds', merged)
    } catch {}
    await get().refreshPlaylists()
    // Fire-and-forget: warm playlist tracks + covers in the background so the
    // Playlists page is ready before the user ever navigates to it.
    get().prefetchPlaylistDetails()
  },

  loginWithDiscord: async () => {
    const redirectUri = userApi.discordRedirectUri()
    const { authorize_url } = await userApi.getDiscordAuthUrl(redirectUri)
    const el = (window as any).electron
    if (el?.openDiscordLogin) {
      // Electron: open a popup BrowserWindow — intercepts the OAuth callback
      const result = await el.openDiscordLogin(authorize_url) as { code: string; state: string } | null
      if (result?.code && result?.state) {
        await get().completeDiscordLogin(result.code, result.state)
      }
    } else {
      // Web: standard redirect
      window.location.href = authorize_url
    }
  },

  completeDiscordLogin: async (code, state) => {
    const redirectUri = userApi.discordRedirectUri()
    const { token, user } = await userApi.exchangeDiscord(code, state, redirectUri)
    userApi.setToken(token)
    set({ account: user })
    await get().loadAccount()
  },

  logoutAccount: async () => {
    await userApi.logout()
    const localLikes = ls.get<string[]>('likedTrackIds') ?? []
    set({ account: null, playlists: [], likedTrackIds: localLikes })
  },

  refreshPlaylists: async () => {
    if (!get().account) return
    if (_playlistsInFlight) return
    _playlistsInFlight = true
    try {
      const playlists = await userApi.getPlaylists()
      set({ playlists })
    } catch {}
    finally { _playlistsInFlight = false }
  },

  // Warm the in-memory (and, via the API layer, localStorage) caches for every
  // playlist's tracks + cover right after the summaries load — so opening the
  // Playlists page and any individual playlist renders instantly instead of
  // showing a spinner while it fetches. Runs in the background off startup;
  // skips playlists already cached, so repeat calls are cheap and it never
  // re-fetches what a prior session-warmed peek already holds. Concurrency is
  // capped so this stays low-priority and doesn't stall foreground requests.
  prefetchPlaylistDetails: async () => {
    if (_detailsPrefetchInFlight) return
    const targets = get().playlists.filter(p => !userApi.peekPlaylistDetail(p.id))
    if (!targets.length) return
    _detailsPrefetchInFlight = true
    try {
      const CONCURRENCY = 3
      let idx = 0
      const run = async (): Promise<void> => {
        while (idx < targets.length) {
          const p = targets[idx++]
          // getPlaylist warms the track/detail cache; getPlaylistCover warms
          // the cover cache (and no-ops if already cached). Failures are
          // swallowed — a prefetch miss just means the normal on-open fetch
          // happens later, so it must never surface as an error.
          await userApi.getPlaylist(p.id).catch(() => undefined)
          await userApi.getPlaylistCover(p.id).catch(() => undefined)
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, run))
    } finally {
      _detailsPrefetchInFlight = false
    }
  },

  // Warm the offline cache for the Tracker and Files views on startup, so those
  // pages are ready — and render instantly when offline — before the user ever
  // navigates to them. These calls go through apiFetch's cacheKey, which is the
  // same offline fallback the views themselves read from on a network failure,
  // and the URLs/params match the views' own first fetches exactly so the cache
  // keys line up (tracker: stats + eras + first unfiltered song page; files:
  // the root folder listing). Fire-and-forget and failure-tolerant — a miss
  // just means the view does its normal fetch later.
  prefetchApiData: async () => {
    if (_apiPrefetchInFlight) return
    _apiPrefetchInFlight = true
    try {
      await Promise.allSettled([
        apiFetch('/stats/'),
        apiFetch('/eras/'),
        apiFetch('/songs/', { page: 1, page_size: 50 }),
        apiFetch('/files/browse/'),
      ])
    } finally {
      _apiPrefetchInFlight = false
    }
  },

  // ── Editor ────────────────────────────────────────────────────────────────
  pendingEditorSongId: null,
  pendingEditProposal: null,
  pendingLocalEditTrack: null,
  setPendingEditorSongId: (pendingEditorSongId) => set({ pendingEditorSongId }),
  openSongEditor: (songId) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = (window as any).electron
    if (el?.openFloatWindow) {
      el.openFloatWindow('editor', { songId })
      return
    }
    set({ pendingEditorSongId: songId })
    get().setActiveView('editor')
  },
  setPendingEditProposal: (pendingEditProposal) => set({ pendingEditProposal }),
  setPendingLocalEditTrack: (pendingLocalEditTrack) => set({ pendingLocalEditTrack }),


  // ── Library ───────────────────────────────────────────────────────────────
  libraryTracks: [],
  libraryFolders: ls.get<string[]>('libraryFolders') ?? [],
  libraryScanning: false,
  libraryLastScanned: ls.get<number>('libraryLastScanned') ?? null,
  // Off by default — periodic disk scans of a large library aren't free, so
  // this is opt-in rather than always re-checking every file's mtime/size.
  libraryAutoRefresh: ls.get<boolean>('libraryAutoRefresh') ?? false,
  developerMode: ls.get<boolean>('developerMode') ?? false,
  localPlaylists: [],
  activeLocalPlaylistId: null,

  // ── Offline playlist sync ────────────────────────────────────────────────
  offlineTracks: {},
  offlinePlaylists: {},
  offlineSync: {},

  setLibraryTracks: (libraryTracks) => set({ libraryTracks }),
  updateLibraryTrack: (id, updates) => set((s) => {
    const newLib = s.libraryTracks.map((t) => t.id === id ? { ...t, ...updates } : t)
    const newQueue = updates.albumArt !== undefined
      ? s.queue.map((t) => t.id === id ? { ...t, imageUrl: (updates.albumArt as string) || '' } : t)
      : s.queue
    const isCurrentTrack = s.currentTrack?.id === id
    const newCurrentTrack = (isCurrentTrack && updates.albumArt !== undefined && s.currentTrack)
      ? { ...s.currentTrack, imageUrl: (updates.albumArt as string) || '' }
      : s.currentTrack
    const newCurrentTrackFull = (isCurrentTrack && updates.albumArt !== undefined && s.currentTrackFull)
      ? { ...s.currentTrackFull, albumArt: updates.albumArt as string | null }
      : s.currentTrackFull
    return { libraryTracks: newLib, queue: newQueue, currentTrack: newCurrentTrack, currentTrackFull: newCurrentTrackFull }
  }),
  // Batched form of updateLibraryTrack(id, { albumArt }) — collects results
  // for a frame's worth of time and applies them in ONE set(), with the same
  // queue/currentTrack art fan-out.
  applyLibraryArt: (id, art) => {
    if (!_pendingArt) {
      _pendingArt = new Map()
      setTimeout(() => {
        const batch = _pendingArt
        _pendingArt = null
        if (!batch || batch.size === 0) return
        set((s) => {
          const libraryTracks = s.libraryTracks.map((t) => batch.has(t.id) ? { ...t, albumArt: batch.get(t.id) } : t)
          const queue = s.queue.map((t) => batch.has(t.id) ? { ...t, imageUrl: batch.get(t.id) || '' } : t)
          const curId = s.currentTrack?.id
          const currentTrack = (curId && batch.has(curId) && s.currentTrack)
            ? { ...s.currentTrack, imageUrl: batch.get(curId) || '' }
            : s.currentTrack
          const currentTrackFull = (curId && batch.has(curId) && s.currentTrackFull)
            ? { ...s.currentTrackFull, albumArt: batch.get(curId) ?? null }
            : s.currentTrackFull
          return { libraryTracks, queue, currentTrack, currentTrackFull }
        })
      }, 40)
    }
    _pendingArt.set(id, art)
  },
  addLibraryFolder: (folder) => {
    const { libraryFolders } = get()
    if (libraryFolders.includes(folder)) return
    const next = [...libraryFolders, folder]
    set({ libraryFolders: next })
    ls.set('libraryFolders', next)
  },
  removeLibraryFolder: (folder) => {
    const next = get().libraryFolders.filter((f) => f !== folder)
    set({ libraryFolders: next })
    ls.set('libraryFolders', next)
  },
  setLibraryLastScanned: (ts) => {
    set({ libraryLastScanned: ts })
    ls.set('libraryLastScanned', ts)
  },
  setLibraryAutoRefresh: (enabled) => {
    set({ libraryAutoRefresh: enabled })
    ls.set('libraryAutoRefresh', enabled)
  },
  setDeveloperMode: (enabled) => {
    set({ developerMode: enabled })
    ls.set('developerMode', enabled)
  },

  scanLibrary: async () => {
    const el = (window as any).electron
    if (!el) return
    const { libraryFolders, libraryTracks } = get()
    if (libraryFolders.length === 0) return
    set({ libraryScanning: true })
    try {
      // Passing the previous scan's tracks lets the main process skip
      // re-parsing tags for files whose size/mtime haven't changed — makes
      // this cheap enough to run automatically (see libraryAutoRefresh)
      // instead of only on an explicit "Scan Now" click.
      const result = await el.scanLibrary(libraryFolders, libraryTracks)
      if (result.error) { console.error('Scan error:', result.error); return }
      const now = Date.now()
      set({ libraryTracks: result.tracks, libraryLastScanned: now })
      ls.set('libraryLastScanned', now)
      // Strip lazily-loaded cover art before persisting: unchanged files come
      // back from the scanner as the same in-memory objects, art included, and
      // saving that would bloat library.json with base64 covers (it's meant to
      // hold metadata only — art is re-read on demand and merged in loadLibrary).
      const diskTracks = (result.tracks as LibraryTrack[]).map((t) =>
        t.albumArt !== undefined ? { ...t, albumArt: undefined } : t,
      )
      await el.saveLibraryData({ tracks: diskTracks, folders: libraryFolders, lastScanned: now })
    } catch(e) { console.error('scanLibrary error:', e) }
    finally { set({ libraryScanning: false }) }
  },

  createLocalPlaylist: (name) => {
    const el = (window as any).electron
    const playlist: LocalPlaylist = { id: `lp-${Date.now()}`, name, trackIds: [], createdAt: Date.now() }
    const next = [...get().localPlaylists, playlist]
    set({ localPlaylists: next, activeLocalPlaylistId: playlist.id })
    el?.saveLocalPlaylists(next)
  },
  deleteLocalPlaylist: (id) => {
    const el = (window as any).electron
    const next = get().localPlaylists.filter((p) => p.id !== id)
    const active = get().activeLocalPlaylistId
    set({ localPlaylists: next, activeLocalPlaylistId: active === id ? null : active })
    el?.saveLocalPlaylists(next)
  },
  renameLocalPlaylist: (id, name) => {
    const el = (window as any).electron
    const next = get().localPlaylists.map((p) => p.id === id ? { ...p, name } : p)
    set({ localPlaylists: next })
    el?.saveLocalPlaylists(next)
  },
  updateLocalPlaylist: (id, updates) => {
    const el = (window as any).electron
    const next = get().localPlaylists.map((p) => p.id === id ? { ...p, ...updates } : p)
    set({ localPlaylists: next })
    el?.saveLocalPlaylists(next)
  },
  addToLocalPlaylist: (playlistId, trackId) => {
    const el = (window as any).electron
    const next = get().localPlaylists.map((p) =>
      p.id === playlistId && !p.trackIds.includes(trackId)
        ? { ...p, trackIds: [...p.trackIds, trackId] } : p
    )
    set({ localPlaylists: next })
    el?.saveLocalPlaylists(next)
  },
  removeFromLocalPlaylist: (playlistId, trackId) => {
    const el = (window as any).electron
    const next = get().localPlaylists.map((p) =>
      p.id === playlistId ? { ...p, trackIds: p.trackIds.filter((id) => id !== trackId) } : p
    )
    set({ localPlaylists: next })
    el?.saveLocalPlaylists(next)
  },
  reorderLocalPlaylist: (playlistId, trackIds) => {
    const el = (window as any).electron
    const next = get().localPlaylists.map((p) => p.id === playlistId ? { ...p, trackIds } : p)
    set({ localPlaylists: next })
    el?.saveLocalPlaylists(next)
  },
  loadLibrary: async () => {
    const el = (window as any).electron
    if (!el) return
    try {
      const [libData, playlists] = await Promise.all([el.loadLibraryData(), el.loadLocalPlaylists()])
      // Carry already-loaded cover art over to the reloaded track list. This
      // runs on every Library tab mount, and the disk snapshot never has
      // albumArt (it's read lazily per-track) — replacing the list wholesale
      // reset every cover to "not loaded yet" and re-read them all from disk
      // each time the tab was opened.
      if (libData?.tracks) {
        set((s) => {
          const artById = new Map(s.libraryTracks.filter((t) => t.albumArt !== undefined).map((t) => [t.id, t.albumArt]))
          const tracks = (libData.tracks as LibraryTrack[]).map((t) =>
            t.albumArt === undefined && artById.has(t.id) ? { ...t, albumArt: artById.get(t.id) } : t,
          )
          return { libraryTracks: tracks }
        })
      }
      if (playlists) set({ localPlaylists: playlists })
    } catch(e) { console.error('loadLibrary error:', e) }
  },

  // ── Offline playlist sync ────────────────────────────────────────────────
  loadOfflineLibrary: async () => {
    const el = (window as any).electron
    if (!el) return
    try {
      const lib = await el.offlineGetLibrary()
      set({ offlineTracks: lib.tracks || {}, offlinePlaylists: lib.playlists || {} })
    } catch (e) { console.error('loadOfflineLibrary error:', e) }
  },

  downloadPlaylistOffline: async (key, name, songIds, opts) => {
    const el = (window as any).electron
    if (!el) return
    await enqueueOfflineWork(key, async () => {
      const silent = !!opts?.silent
      // Background resync queued behind other work for a playlist that was
      // removed while it waited — nothing to sync anymore.
      if (silent && !get().offlinePlaylists[key]) return
      // Removal mid-download bumps the epoch; checked between tracks and before
      // the final offlineSetPlaylist so an aborted run can't re-register the
      // playlist it raced with.
      const epoch = _offlineKeyEpochs.get(key) ?? 0
      const cancelled = (): boolean => (_offlineKeyEpochs.get(key) ?? 0) !== epoch
      const downloadId = `playlist-${key}`
      // Songs already saved locally only need a quiet metadata refresh, not a
      // real download — so the visible progress total is the count of songs
      // actually missing, not the whole playlist. Otherwise re-downloading a
      // playlist that's mostly already offline showed "Downloading 1/40, 2/40…"
      // and looked like the whole thing was being fetched again.
      const offlineTracksNow = get().offlineTracks
      const missingCount = songIds.filter((id) => !offlineTracksNow[`jw-${id}`]).length
      const total = missingCount
      // Background resyncs (startup/focus/15-min interval — see syncOfflinePlaylists)
      // re-run this for every already-synced playlist just to pick up metadata
      // changes; nearly everything is a fast no-op `skipped` hit. Surfacing that
      // as "syncing" — in the Download Manager, or in the playlist/context-menu's
      // "Downloading… x/y" label (both read `offlineSync`) — made it look like
      // the same playlist was re-downloading every time the app loaded or
      // regained focus. Only flip on the visible "syncing" state when something
      // is actually fetched (tracked below) or when the caller isn't silent and
      // there's actually something missing to fetch.
      let announced = false
      const announce = (): void => {
        if (announced) return
        announced = true
        set((s) => ({ offlineSync: { ...s.offlineSync, [key]: { state: 'syncing', current: 0, total } } }))
        if (get().downloads.some((d) => d.id === downloadId)) {
          get().updateDownload(downloadId, { filename: name, state: 'downloading', percent: 0, received: 0, total, error: undefined })
        } else {
          get().addDownload({ id: downloadId, filename: name, type: 'playlist', state: 'downloading', percent: 0, received: 0, total })
        }
        // Only pop the Download Manager open for downloads the user just asked
        // for. Background catch-ups (new song added on the site, a previously
        // failed track retrying) still track progress in the downloads list and
        // `offlineSync`, but the panel appearing out of nowhere on focus read
        // as "the app is redownloading my playlists on its own".
        if (!silent) get().setShowDownloadManager(true)
      }
      if (!silent && total > 0) announce()

      // Byte-level size/speed tracking across the whole playlist — cumulativeBytes
      // is bytes already settled (finished or skipped tracks); the per-track
      // listener below adds the in-flight file's partial bytes on top so the
      // Download Manager can show a live running total + throughput, even
      // though we never know the playlist's full size up front.
      let cumulativeBytes = 0
      let lastSampleTime = Date.now()
      let lastSampleBytes = 0

      const trackIds: string[] = []
      let hadError = false
      let doneCount = 0
      for (let i = 0; i < songIds.length; i++) {
        if (cancelled()) break
        const songId = songIds[i]
        const id = `jw-${songId}`
        trackIds.push(id)
        // Already downloaded — skip the network round-trip entirely instead of
        // still fetching /songs/{id}/ + hitting the IPC layer just to no-op.
        // Looping through every already-cached song's metadata refresh made
        // downloading a mostly-synced playlist with a few new songs feel like
        // the whole thing was being fetched again.
        if (offlineTracksNow[id]) continue
        const offProgress = el.onOfflineDownloadProgress?.((d: { id: string; percent: number; received?: number; total?: number }) => {
          if (d.id !== id || !announced) return
          const totalBytes = cumulativeBytes + (d.received || 0)
          const now = Date.now()
          const dt = (now - lastSampleTime) / 1000
          const updates: { bytesReceived: number; speedBps?: number } = { bytesReceived: totalBytes }
          if (dt >= 0.4) {
            updates.speedBps = Math.max(0, (totalBytes - lastSampleBytes) / dt)
            lastSampleTime = now
            lastSampleBytes = totalBytes
          }
          get().updateDownload(downloadId, updates)
        })
        try {
          const song = await apiFetch<JWApiSong>(`/songs/${songId}/`)
          const ext = (song.path.split('.').pop() || 'mp3').toLowerCase()
          const meta = {
            title: song.track_titles?.[0] || song.name,
            artist: song.credited_artists || 'Juice WRLD',
            album: song.album || song.era?.name || '',
            imageUrl: buildImageUrl(song.image_url) ?? null,
            lyrics: song.lyrics || null,
            syncedLyrics: song.synced_lyrics || null,
            duration: parseDuration(song.length),
          }
          const result = await el.offlineDownloadTrack({ id, url: buildStreamUrl(song.path), ext, path: song.path, meta })
          if (result?.error) throw new Error(result.error)
          if (!result?.skipped) {
            announce()
            doneCount++
          }
          cumulativeBytes += result?.size || 0
          set((s) => ({
            offlineTracks: {
              ...s.offlineTracks,
              [id]: { ...meta, path: song.path, localPath: result.localPath, ext, downloadedAt: Date.now() },
            },
          }))
        } catch (e) {
          hadError = true
          console.error('offline download failed for song', songId, e)
        } finally {
          offProgress?.()
        }
        if (announced) {
          set((s) => ({ offlineSync: { ...s.offlineSync, [key]: { state: 'syncing', current: doneCount, total } } }))
          get().updateDownload(downloadId, { received: doneCount, percent: total ? Math.round((doneCount / total) * 100) : 100, bytesReceived: cumulativeBytes })
        }
      }
      if (announced) get().updateDownload(downloadId, { speedBps: undefined })

      // The playlist was removed while this run was downloading — registering
      // it now would resurrect it and queue every pruned file for re-download
      // on the next background sync. Drop the run's UI traces and stop.
      if (cancelled()) {
        if (announced) get().removeDownload(downloadId)
        set((s) => {
          const nextSync = { ...s.offlineSync }
          delete nextSync[key]
          return { offlineSync: nextSync }
        })
        get().loadOfflineLibrary()
        return
      }

      try {
        await el.offlineSetPlaylist(key, trackIds, name)
        set((s) => ({ offlinePlaylists: { ...s.offlinePlaylists, [key]: { songIds: trackIds, name, updatedAt: Date.now() } } }))
      } catch (e) { console.error('offlineSetPlaylist error:', e) }

      if (announced) set((s) => ({ offlineSync: { ...s.offlineSync, [key]: { state: hadError ? 'error' : 'done', current: total, total } } }))
      if (announced) get().updateDownload(downloadId, { state: hadError ? 'error' : 'done', percent: 100, error: hadError ? 'Some tracks failed to download' : undefined })
      // Refresh from disk truth — pruning may have dropped tracks shared with
      // another playlist that's no longer synced.
      get().loadOfflineLibrary()
    })
  },

  removePlaylistOffline: async (key) => {
    const el = (window as any).electron
    if (!el) return
    // Cancel any in-flight download for this key (epoch bump) and wait for it
    // to notice — it checks between tracks, so this waits at most one file —
    // before pruning. Otherwise the in-flight run would re-register the
    // playlist after removal and the next sync would re-download all of it.
    _offlineKeyEpochs.set(key, (_offlineKeyEpochs.get(key) ?? 0) + 1)
    await (_offlineKeyQueues.get(key) ?? Promise.resolve()).catch(() => {})
    try { await el.offlineRemovePlaylist(key) } catch (e) { console.error('offlineRemovePlaylist error:', e) }
    set((s) => {
      const next = { ...s.offlinePlaylists }
      delete next[key]
      const nextSync = { ...s.offlineSync }
      delete nextSync[key]
      return { offlinePlaylists: next, offlineSync: nextSync }
    })
    get().loadOfflineLibrary()
  },

  // Serialized on the individual-downloads key: two quick downloads used to
  // both read the membership list before either wrote it, so the second
  // offlineSetPlaylist omitted the first song — and the prune deleted its
  // freshly-downloaded file.
  downloadTrackOffline: async (songId) => {
    const el = (window as any).electron
    if (!el) return
    const key = INDIVIDUAL_DOWNLOADS_KEY
    const id = `jw-${songId}`
    await enqueueOfflineWork(key, async () => {
      try {
        const song = await apiFetch<JWApiSong>(`/songs/${songId}/`)
        const ext = (song.path.split('.').pop() || 'mp3').toLowerCase()
        const meta = {
          title: song.track_titles?.[0] || song.name,
          artist: song.credited_artists || 'Juice WRLD',
          album: song.album || song.era?.name || '',
          imageUrl: buildImageUrl(song.image_url) ?? null,
          lyrics: song.lyrics || null,
          syncedLyrics: song.synced_lyrics || null,
          duration: parseDuration(song.length),
        }
        const result = await el.offlineDownloadTrack({ id, url: buildStreamUrl(song.path), ext, path: song.path, meta })
        if (result?.error) throw new Error(result.error)
        set((s) => ({
          offlineTracks: {
            ...s.offlineTracks,
            [id]: { ...meta, path: song.path, localPath: result.localPath, ext, downloadedAt: Date.now() },
          },
        }))
        const existingIds = get().offlinePlaylists[key]?.songIds ?? []
        const nextIds = existingIds.includes(id) ? existingIds : [...existingIds, id]
        await el.offlineSetPlaylist(key, nextIds, 'Downloaded songs')
        set((s) => ({ offlinePlaylists: { ...s.offlinePlaylists, [key]: { songIds: nextIds, name: 'Downloaded songs', updatedAt: Date.now() } } }))
      } catch (e) {
        console.error('downloadTrackOffline error:', e)
      }
    })
  },

  // Deletes a single track's downloaded audio (e.g. from a song's context
  // menu), independent of any playlist it belongs to. If the song is still
  // part of a synced offline playlist, the next background resync will just
  // re-download it — this only clears the local copy, not playlist membership.
  removeOfflineTrack: async (trackId) => {
    const el = (window as any).electron
    if (!el) return
    try { await el.offlineRemoveTrack(trackId) } catch (e) { console.error('offlineRemoveTrack error:', e) }
    set((s) => {
      const next = { ...s.offlineTracks }
      delete next[trackId]
      return { offlineTracks: next }
    })
    // If it was only tracked via the individual-downloads bucket (not a real
    // synced playlist), drop it from there too so it doesn't linger forever.
    const key = INDIVIDUAL_DOWNLOADS_KEY
    const entry = get().offlinePlaylists[key]
    if (entry?.songIds.includes(trackId)) {
      const nextIds = entry.songIds.filter((t) => t !== trackId)
      try { await el.offlineSetPlaylist(key, nextIds, entry.name) } catch (e) { console.error('offlineSetPlaylist error:', e) }
      set((s) => ({ offlinePlaylists: { ...s.offlinePlaylists, [key]: { ...entry, songIds: nextIds, updatedAt: Date.now() } } }))
    }
  },

  syncOfflinePlaylists: async () => {
    // Startup, every window focus, and the 15-min interval all call this;
    // without the guard they overlap, and each run re-downloads the songs the
    // other is mid-flight on (two writers to the same file, plus a second
    // round of "downloading" announcements for work already underway).
    if (_offlineSyncInFlight) return
    _offlineSyncInFlight = true
    try {
      const keys = Object.keys(get().offlinePlaylists)
      for (const key of keys) {
        const match = key.match(/^api-(\d+)$/)
        if (!match) continue
        // Removed from offline while this sync was walking earlier keys —
        // syncing it anyway would re-download and re-register it.
        if (!get().offlinePlaylists[key]) continue
        try {
          const detail = await userApi.getPlaylist(Number(match[1]))
          if (!get().offlinePlaylists[key]) continue
          await get().downloadPlaylistOffline(key, detail.name, detail.items.map((i) => i.song.id), { silent: true })
        } catch {
          // Offline, deleted, or no longer accessible — keep the existing cache as-is.
        }
      }
    } finally {
      _offlineSyncInFlight = false
    }
  },

  // Called after songs are added to an API playlist — if that playlist is
  // synced offline, immediately downloads the newly-added songs instead of
  // waiting for the next background resync (startup/focus/15-min interval).
  autoDownloadIfOffline: async (playlistId, addedSongIds) => {
    if (!addedSongIds.length) return
    const key = `api-${playlistId}`
    if (!get().offlinePlaylists[key]) return
    // Wait out any in-flight download for this key before building the merged
    // list — merging from a snapshot taken mid-sync saved a stale membership
    // list, and the prune then deleted files for songs the sync had just added.
    await (_offlineKeyQueues.get(key) ?? Promise.resolve()).catch(() => {})
    const entry = get().offlinePlaylists[key]
    if (!entry) return
    const existingIds = new Set(entry.songIds.map((id) => Number(id.replace('jw-', ''))))
    const nextSongIds = [...existingIds, ...addedSongIds.filter((id) => !existingIds.has(id))]
    await get().downloadPlaylistOffline(key, entry.name, nextSongIds)
  },

  // ── Downloads ─────────────────────────────────────────────────────────────
  downloads: [],
  showDownloadManager: false,
  updateStatus: null,

  addDownload: (item) => set((s) => ({ downloads: [item, ...s.downloads] })),
  updateDownload: (id, updates) => set((s) => ({
    downloads: s.downloads.map((d) => d.id === id ? { ...d, ...updates } : d),
  })),
  removeDownload: (id) => set((s) => ({ downloads: s.downloads.filter((d) => d.id !== id) })),
  clearCompletedDownloads: () => set((s) => ({
    downloads: s.downloads.filter((d) => d.state === 'downloading'),
  })),
  setShowDownloadManager: (show) => set({ showDownloadManager: show }),
  setUpdateStatus: (updateStatus) => set({ updateStatus }),
}))

// Subscribe to a shallow-compared subset of the store. A bare `useStore()`
// re-renders the component on EVERY store write — including the ~4x/sec
// timeupdate ticks and per-chunk download progress — so components must pick
// only the keys they actually read. Actions are stable references, so
// including them here never causes a re-render on its own.
export function useStorePick<K extends keyof AppStore>(...keys: K[]): Pick<AppStore, K> {
  return useStore(
    useShallow((s: AppStore) => {
      const picked = {} as Pick<AppStore, K>
      for (const k of keys) picked[k] = s[k]
      return picked
    }),
  )
}
