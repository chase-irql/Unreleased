export interface Track {
  id: string
  path: string
  title: string
  artist: string
  album: string
  albumArtist: string
  year: number | null
  trackNumber: number | null
  duration: number
  genre: string
  hasAlbumArt: boolean
  // API-sourced tracks
  streamUrl?: string  // if set, Player streams this URL instead of the local `path` (via toFileUrl)
  imageUrl?: string   // if set, AlbumArtThumbnail uses this instead of getAlbumArt IPC
}

export interface FullTrack extends Track {
  albumArt: string | null
  lyrics: string | null
  syncedLyrics: string | null
  producer: string | null
  notes: string | null
  ext: string
  error?: string
  // File technical info
  sampleRate?: number
  bitrate?: number
  bitsPerSample?: number
  channels?: number
  fileSize?: number
}


export interface LibraryTrack {
  id: string                  // 'local-' + filePath
  filePath: string
  ext: string                 // 'mp3', 'flac', etc.
  title: string
  artist: string
  album: string
  albumArtist: string
  year: number | null
  trackNumber: number | null
  discNumber: number | null
  composer: string
  genre: string
  duration: number
  bitrate: number | null
  sampleRate: number | null
  fileSize: number
  lastModified: number
  hasAlbumArt: boolean
  addedAt: number
  // Loaded on demand
  albumArt?: string | null    // base64 data URL
}

export interface LocalPlaylist {
  id: string
  name: string
  trackIds: string[]          // LibraryTrack ids
  createdAt: number
  coverImage?: string | null  // base64 data URL or null
}

export interface Playlist {
  id: string
  name: string
  trackIds: string[]
  createdAt: number
  pinned?: boolean
  folderId?: string
}

export interface PlaylistFolder {
  id: string
  name: string
  createdAt: number
  parentId?: string
}

// ─── Offline playlist sync (Electron only) ─────────────────────────────────
// A downloaded API song, kept fully playable without network — the audio
// file plus a snapshot of the song's own metadata at download time.
export interface OfflineTrackMeta {
  path: string                // API song.path — changing this means the audio itself changed
  title: string
  artist: string
  album: string
  imageUrl: string | null
  lyrics: string | null
  syncedLyrics: string | null
  duration: number
  localPath: string
  ext: string
  downloadedAt: number
}

export interface OfflinePlaylistEntry {
  songIds: string[]           // track ids, e.g. "jw-123"
  name: string
  updatedAt: number
}

export interface SyncedLyricLine {
  time: number // seconds
  text: string
}

export type ViewType = 'api-tracker' | 'api-files' | 'api-categories' | 'editor' | 'local-editor' | 'admin' | 'liked' | 'playlists' | 'shared-playlist' | 'editor-profile' | 'docs' | 'wrld' | 'library' | 'albums-admin' | 'not-found'

export type SortField = 'default' | 'title' | 'artist' | 'album' | 'year' | 'genre' | 'duration'
export type SortDir = 'asc' | 'desc'
export interface Cols {
  art: boolean
  artist: boolean
  album: boolean
  year: boolean
  genre: boolean
  duration: boolean
}
