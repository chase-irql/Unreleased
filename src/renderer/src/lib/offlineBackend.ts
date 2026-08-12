// Offline-download backend selection — desktop gets it from the Electron
// preload bridge (window.electron.offline*); Android has its own Capacitor
// plugin (OfflinePlugin.java) with the same shape but no such bridge to speak
// of. Everything in useStore.ts that does offline work goes through
// getOfflineApi() instead of reaching for window.electron directly, so
// neither platform's code has to know the other exists — and the plain web
// build (neither present) gets null, same as it always has.

import type { OfflineTrackMeta, OfflinePlaylistEntry } from '../types'

/** What downloadTrack's caller actually has on hand before a download
 *  exists — the parts of OfflineTrackMeta that come from the API, not from
 *  the download itself (localPath/ext/downloadedAt are the result; path is
 *  passed alongside separately since the backend needs it as its own arg
 *  too). */
export type OfflineTrackFields = Omit<OfflineTrackMeta, 'path' | 'localPath' | 'ext' | 'downloadedAt'>

export interface OfflineLibrary {
  tracks: Record<string, OfflineTrackMeta>
  playlists: Record<string, OfflinePlaylistEntry>
}

export interface OfflineDownloadResult {
  localPath: string
  size?: number
  skipped?: boolean
  error?: string
}

export interface OfflineDownloadProgress {
  id: string
  percent: number
  received?: number
  total?: number
}

export interface OfflineApi {
  getLibrary(): Promise<OfflineLibrary>
  downloadTrack(args: { id: string; url: string; ext: string; path: string; meta: OfflineTrackFields }): Promise<OfflineDownloadResult>
  setPlaylist(key: string, trackIds: string[], name: string): Promise<void>
  removePlaylist(key: string): Promise<void>
  removeTrack(id: string): Promise<void>
  /** MUST be awaited before starting the download it's meant to watch — see
   *  the Android implementation's own comment on why a fire-and-forget
   *  registration can silently miss an entire fast download's progress. */
  onDownloadProgress(fn: (p: OfflineDownloadProgress) => void): Promise<() => void>
}

interface ElectronOfflineBridge {
  offlineGetLibrary(): Promise<OfflineLibrary>
  offlineDownloadTrack(args: { id: string; url: string; ext: string; path: string; meta: OfflineTrackFields }): Promise<OfflineDownloadResult>
  offlineSetPlaylist(key: string, trackIds: string[], name: string): Promise<void>
  offlineRemovePlaylist(key: string): Promise<void>
  offlineRemoveTrack(id: string): Promise<void>
  onOfflineDownloadProgress?: (fn: (p: OfflineDownloadProgress) => void) => (() => void) | undefined
}

interface AndroidOfflinePlugin {
  getLibrary(): Promise<{ json: string }>
  downloadTrack(opts: { id: string; url: string; ext: string; path: string; meta: string }): Promise<{ localPath?: string; size?: number; error?: string }>
  setPlaylist(opts: { key: string; trackIds: string[]; name: string }): Promise<void>
  removePlaylist(opts: { key: string }): Promise<void>
  removeTrack(opts: { id: string }): Promise<void>
  addListener(event: 'offlineDownloadProgress', fn: (p: OfflineDownloadProgress) => void): Promise<{ remove: () => void }>
}

interface CapacitorGlobal {
  Plugins?: { Offline?: AndroidOfflinePlugin }
}

function androidPlugin(): AndroidOfflinePlugin | null {
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor?.Plugins?.Offline ?? null
}

function androidBackend(plugin: AndroidOfflinePlugin): OfflineApi {
  return {
    async getLibrary() {
      const { json } = await plugin.getLibrary()
      try {
        const parsed = JSON.parse(json)
        return {
          tracks: parsed?.tracks && typeof parsed.tracks === 'object' ? parsed.tracks : {},
          playlists: parsed?.playlists && typeof parsed.playlists === 'object' ? parsed.playlists : {},
        }
      } catch {
        return { tracks: {}, playlists: {} }
      }
    },
    async downloadTrack({ id, url, ext, path, meta }) {
      const res = await plugin.downloadTrack({ id, url, ext, path, meta: JSON.stringify(meta) })
      if (res.error) return { error: res.error, localPath: '' }
      return { localPath: res.localPath ?? '', size: res.size }
    },
    setPlaylist: (key, trackIds, name) => plugin.setPlaylist({ key, trackIds, name }),
    removePlaylist: (key) => plugin.removePlaylist({ key }),
    removeTrack: (id) => plugin.removeTrack({ id }),
    async onDownloadProgress(fn) {
      const handle = await plugin.addListener('offlineDownloadProgress', fn)
      return () => handle.remove()
    },
  }
}

function electronBackend(el: ElectronOfflineBridge): OfflineApi {
  return {
    getLibrary: () => el.offlineGetLibrary(),
    downloadTrack: (args) => el.offlineDownloadTrack(args),
    setPlaylist: (key, trackIds, name) => el.offlineSetPlaylist(key, trackIds, name),
    removePlaylist: (key) => el.offlineRemovePlaylist(key),
    removeTrack: (id) => el.offlineRemoveTrack(id),
    // Electron's bridge already subscribes synchronously (no bridge
    // round-trip to await) — wrapped in a resolved promise purely so callers
    // don't need to branch on which backend they got.
    onDownloadProgress: (fn) => Promise.resolve(el.onOfflineDownloadProgress?.(fn) ?? (() => undefined)),
  }
}

let cached: OfflineApi | null | undefined

/** Null on the plain web build (neither backend present) — every caller
 *  already treats that as "offline downloads aren't supported here". */
export function getOfflineApi(): OfflineApi | null {
  if (cached !== undefined) return cached
  const el = (window as unknown as { electron?: ElectronOfflineBridge }).electron
  const plugin = androidPlugin()
  cached = el ? electronBackend(el) : plugin ? androidBackend(plugin) : null
  return cached
}
