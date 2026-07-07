import { create } from 'zustand'
import { ViewType, SortField, SortDir, Cols, FullTrack, LibraryTrack, LocalPlaylist, OfflineTrackMeta, OfflinePlaylistEntry } from '../types'
import * as userApi from '../lib/userApi'
import type { AccountUser, PlaylistSummary } from '../lib/userApi'
import { apiFetch, buildStreamUrl, buildImageUrl, parseDuration } from '../lib/juicewrldApi'
import type { JWApiSong } from '../lib/juicewrldApi'
import { createQueueSlice, QueueSlice } from './queueSlice'

type ColumnConfig = Cols

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
  radioFmMatchedSong: { imageUrl: string | null; lyrics: string | null; syncedLyrics: string | null } | null
  viewMode: 'list' | 'grid'
  theme: 'dark' | 'light'
  searchQuery: string

  // Sort & columns
  sortField: SortField
  sortDir: SortDir
  columns: ColumnConfig

  // Settings
  crossfadeEnabled: boolean
  crossfadeDuration: number
  sleepTimerEnd: number | null
  audioOutput: string
  accentColor: string

  // Liked songs
  likedTrackIds: string[]

  // API tracker extras
  apiTrackerCategory: string
  apiTrackerEra: string
  apiFilesPath: string

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
  setRadioFmMatchedSong: (song: { imageUrl: string | null; lyrics: string | null; syncedLyrics: string | null } | null) => void
  setShowSettings: (show: boolean) => void
  setShowQueue: (show: boolean) => void
  setWrldFullscreen: (fullscreen: boolean) => void
  setViewMode: (mode: 'list' | 'grid') => void
  setTheme: (theme: 'dark' | 'light') => void
  setSearchQuery: (q: string) => void

  setSort: (field: SortField, dir: SortDir) => void
  toggleColumn: (col: keyof ColumnConfig) => void
  setColumns: (columns: ColumnConfig) => void

  setCrossfade: (enabled: boolean, duration: number) => void
  setSleepTimer: (endTimestamp: number | null) => void
  setAudioOutput: (deviceId: string) => void
  setAccentColor: (color: string) => void

  setLikedTrackIds: (ids: string[]) => void
  toggleLike: (trackId: string) => void

  setApiTrackerCategory: (cat: string) => void
  setApiTrackerEra: (era: string) => void
  setApiFilesPath: (path: string) => void

  setShowUserAuth: (show: boolean) => void
  loadAccount: () => Promise<void>
  loginWithDiscord: () => Promise<void>
  completeDiscordLogin: (code: string, state: string) => Promise<void>
  logoutAccount: () => Promise<void>
  refreshPlaylists: () => Promise<void>
  setPendingPlaylistId: (id: number | null) => void
  setPlaylistsSelectedId: (id: number | null) => void
  setPlaylistsSelectedLocalId: (id: string | null) => void

  setPendingEditorSongId: (id: number | null) => void
  setPendingEditProposal: (p: { id: number; songId: number | null; proposedData: Record<string, unknown>; editorNotes: string } | null) => void
  setPendingLocalEditTrack: (track: LibraryTrack | null) => void


  setLibraryTracks: (tracks: LibraryTrack[]) => void
  updateLibraryTrack: (id: string, updates: Partial<LibraryTrack>) => void
  setLibraryFolders: (folders: string[]) => void
  addLibraryFolder: (folder: string) => void
  removeLibraryFolder: (folder: string) => void
  setLibraryScanning: (scanning: boolean) => void
  setLibraryLastScanned: (ts: number | null) => void
  setLibraryAutoRefresh: (enabled: boolean) => void
  scanLibrary: () => Promise<void>

  setLocalPlaylists: (playlists: LocalPlaylist[]) => void
  createLocalPlaylist: (name: string) => void
  deleteLocalPlaylist: (id: string) => void
  renameLocalPlaylist: (id: string, name: string) => void
  updateLocalPlaylist: (id: string, updates: { name?: string; coverImage?: string | null }) => void
  addToLocalPlaylist: (playlistId: string, trackId: string) => void
  removeFromLocalPlaylist: (playlistId: string, trackId: string) => void
  reorderLocalPlaylist: (playlistId: string, trackIds: string[]) => void
  setActiveLocalPlaylistId: (id: string | null) => void
  loadLibrary: () => Promise<void>

  loadOfflineLibrary: () => Promise<void>
  downloadPlaylistOffline: (key: string, name: string, songIds: number[], opts?: { silent?: boolean }) => Promise<void>
  removePlaylistOffline: (key: string) => Promise<void>
  downloadTrackOffline: (songId: number) => Promise<void>
  removeOfflineTrack: (trackId: string) => Promise<void>
  syncOfflinePlaylists: () => Promise<void>

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
  showQueue: false,
  wrldFullscreen: false,
  radioFmActive: false,
  radioFmIsLive: null,
  radioFmNowPlaying: null,
  radioFmVote: null,
  radioFmUpNext: null,
  radioFmQueuePreview: [],
  radioFmMatchedSong: null,
  viewMode: ls.get<'list' | 'grid'>('viewMode') ?? 'list',
  theme: ls.get<'dark' | 'light'>('theme') ?? 'dark',
  searchQuery: '',

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
  setShowSettings: (showSettings) => set({ showSettings }),
  setShowQueue: (showQueue) => set({ showQueue }),
  setWrldFullscreen: (wrldFullscreen) => set({ wrldFullscreen }),
  setViewMode: (viewMode) => { set({ viewMode }); ls.set('viewMode', viewMode) },
  setTheme: (theme) => { set({ theme }); ls.set('theme', theme) },
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  // ── Sort & columns ────────────────────────────────────────────────────────
  sortField: ls.get<SortField>('sortField') ?? 'default',
  sortDir: ls.get<SortDir>('sortDir') ?? 'asc',
  columns: ls.get<ColumnConfig>('columns') ?? {
    art: true, artist: true, album: true, year: false, genre: false, duration: true,
  },

  setSort: (sortField, sortDir) => {
    set({ sortField, sortDir })
    ls.set('sortField', sortField)
    ls.set('sortDir', sortDir)
  },
  toggleColumn: (col) => {
    set((s) => ({ columns: { ...s.columns, [col]: !s.columns[col] } }))
    ls.set('columns', get().columns)
  },
  setColumns: (columns) => set({ columns }),

  // ── Settings ──────────────────────────────────────────────────────────────
  crossfadeEnabled: ls.get<boolean>('crossfadeEnabled') ?? false,
  crossfadeDuration: ls.get<number>('crossfadeDuration') ?? 5,
  sleepTimerEnd: null,
  audioOutput: ls.get<string>('audioOutput') ?? '',
  accentColor: ls.get<string>('accentColor') ?? '#1db954',

  setCrossfade: (enabled, duration) => {
    set({ crossfadeEnabled: enabled, crossfadeDuration: duration })
    ls.set('crossfadeEnabled', enabled)
    ls.set('crossfadeDuration', duration)
  },
  setSleepTimer: (sleepTimerEnd) => set({ sleepTimerEnd }),
  setAudioOutput: (deviceId) => { set({ audioOutput: deviceId }); ls.set('audioOutput', deviceId) },
  setAccentColor: (color) => { set({ accentColor: color }); ls.set('accentColor', color) },

  // ── Liked songs ───────────────────────────────────────────────────────────
  likedTrackIds: ls.get<string[]>('likedTrackIds') ?? [],

  setLikedTrackIds: (ids) => set({ likedTrackIds: ids }),

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

  setApiTrackerCategory: (cat) => set({ apiTrackerCategory: cat }),
  setApiTrackerEra: (era) => set({ apiTrackerEra: era }),
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

  // ── Editor ────────────────────────────────────────────────────────────────
  pendingEditorSongId: null,
  pendingEditProposal: null,
  pendingLocalEditTrack: null,
  setPendingEditorSongId: (pendingEditorSongId) => set({ pendingEditorSongId }),
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
  setLibraryFolders: (libraryFolders) => {
    set({ libraryFolders })
    ls.set('libraryFolders', libraryFolders)
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
  setLibraryScanning: (libraryScanning) => set({ libraryScanning }),
  setLibraryLastScanned: (ts) => {
    set({ libraryLastScanned: ts })
    ls.set('libraryLastScanned', ts)
  },
  setLibraryAutoRefresh: (enabled) => {
    set({ libraryAutoRefresh: enabled })
    ls.set('libraryAutoRefresh', enabled)
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
      await el.saveLibraryData({ tracks: result.tracks, folders: libraryFolders, lastScanned: now })
    } catch(e) { console.error('scanLibrary error:', e) }
    finally { set({ libraryScanning: false }) }
  },

  setLocalPlaylists: (localPlaylists) => set({ localPlaylists }),
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
  setActiveLocalPlaylistId: (activeLocalPlaylistId) => set({ activeLocalPlaylistId }),

  loadLibrary: async () => {
    const el = (window as any).electron
    if (!el) return
    try {
      const [libData, playlists] = await Promise.all([el.loadLibraryData(), el.loadLocalPlaylists()])
      if (libData?.tracks) set({ libraryTracks: libData.tracks })
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
    const silent = !!opts?.silent
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
      get().setShowDownloadManager(true)
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
      const songId = songIds[i]
      const id = `jw-${songId}`
      trackIds.push(id)
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

    try {
      await el.offlineSetPlaylist(key, trackIds, name)
      set((s) => ({ offlinePlaylists: { ...s.offlinePlaylists, [key]: { songIds: trackIds, name, updatedAt: Date.now() } } }))
    } catch (e) { console.error('offlineSetPlaylist error:', e) }

    if (announced) set((s) => ({ offlineSync: { ...s.offlineSync, [key]: { state: hadError ? 'error' : 'done', current: total, total } } }))
    if (announced) get().updateDownload(downloadId, { state: hadError ? 'error' : 'done', percent: 100, error: hadError ? 'Some tracks failed to download' : undefined })
    // Refresh from disk truth — pruning may have dropped tracks shared with
    // another playlist that's no longer synced.
    get().loadOfflineLibrary()
  },

  removePlaylistOffline: async (key) => {
    const el = (window as any).electron
    if (!el) return
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

  downloadTrackOffline: async (songId) => {
    const el = (window as any).electron
    if (!el) return
    const key = INDIVIDUAL_DOWNLOADS_KEY
    const id = `jw-${songId}`
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
    const keys = Object.keys(get().offlinePlaylists)
    for (const key of keys) {
      const match = key.match(/^api-(\d+)$/)
      if (!match) continue
      try {
        const detail = await userApi.getPlaylist(Number(match[1]))
        await get().downloadPlaylistOffline(key, detail.name, detail.items.map((i) => i.song.id), { silent: true })
      } catch {
        // Offline, deleted, or no longer accessible — keep the existing cache as-is.
      }
    }
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
