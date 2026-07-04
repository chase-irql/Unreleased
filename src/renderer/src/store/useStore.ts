import { create } from 'zustand'
import { ViewType, SortField, SortDir, Cols, FullTrack, LibraryTrack, LocalPlaylist } from '../types'
import * as userApi from '../lib/userApi'
import type { AccountUser, PlaylistSummary } from '../lib/userApi'
import { createQueueSlice, QueueSlice } from './queueSlice'

type ColumnConfig = Cols

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
  type: 'file' | 'zip' | 'update'
  state: 'downloading' | 'done' | 'error' | 'cancelled'
  percent: number
  received?: number
  total?: number
  savePath?: string
  error?: string
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


  // Library (Electron only)
  libraryTracks: LibraryTrack[]
  libraryFolders: string[]
  libraryScanning: boolean
  libraryLastScanned: number | null
  localPlaylists: LocalPlaylist[]
  activeLocalPlaylistId: string | null

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


  setLibraryTracks: (tracks: LibraryTrack[]) => void
  updateLibraryTrack: (id: string, updates: Partial<LibraryTrack>) => void
  setLibraryFolders: (folders: string[]) => void
  addLibraryFolder: (folder: string) => void
  removeLibraryFolder: (folder: string) => void
  setLibraryScanning: (scanning: boolean) => void
  setLibraryLastScanned: (ts: number | null) => void
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
  setPendingEditorSongId: (pendingEditorSongId) => set({ pendingEditorSongId }),
  setPendingEditProposal: (pendingEditProposal) => set({ pendingEditProposal }),


  // ── Library ───────────────────────────────────────────────────────────────
  libraryTracks: [],
  libraryFolders: ls.get<string[]>('libraryFolders') ?? [],
  libraryScanning: false,
  libraryLastScanned: ls.get<number>('libraryLastScanned') ?? null,
  localPlaylists: [],
  activeLocalPlaylistId: null,

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

  scanLibrary: async () => {
    const el = (window as any).electron
    if (!el) return
    const { libraryFolders } = get()
    if (libraryFolders.length === 0) return
    set({ libraryScanning: true })
    try {
      const result = await el.scanLibrary(libraryFolders)
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
