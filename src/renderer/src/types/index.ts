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
  era?: string        // API era abbreviation (e.g. "WOD") — shown on Discord RPC instead of album
  // The song's own title and cover as the API returns them. `title`/`imageUrl`
  // above may be a user's per-song override (see lib/songPrefs), and a Track
  // outlives the conversion that built it — it sits in the queue until the
  // user moves on — so the originals are kept here to let an override be
  // applied, changed, or removed in place without refetching the song. Only
  // set for API-sourced tracks; treat an absent value as "same as title".
  apiTitle?: string
  apiImageUrl?: string
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
  // Cover art is NOT stored here — it lives in the store's `libraryArt` map
  // (keyed by track id) so a streaming cover never mutates this list. This
  // optional field is only a transient seed some callers still read; treat the
  // map as the source of truth.
  albumArt?: string | null    // base64 data URL
}

// The local file a "Convert format" dialog is working on. Deliberately just the
// three fields the dialog needs (rather than a whole Track/LibraryTrack) so it
// round-trips through pop-out window URL params as plain strings.
export interface ConvertTarget {
  id: string        // LibraryTrack id ('local-' + filePath)
  path: string      // absolute filesystem path of the source file
  title: string
}

export interface LocalPlaylist {
  id: string
  name: string
  trackIds: string[]          // LibraryTrack ids
  createdAt: number
  coverImage?: string | null  // base64 data URL or null
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

export type ViewType = 'api-tracker' | 'api-files' | 'editor' | 'local-editor' | 'admin' | 'liked' | 'playlists' | 'shared-playlist' | 'editor-profile' | 'docs' | 'wrld' | 'library' | 'albums-admin' | 'news' | 'not-found'
