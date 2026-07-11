import { useEffect, useState, useCallback } from 'react'
import { Heart, Play, Loader2, MoreHorizontal } from 'lucide-react'
import { useStore } from '../store/useStore'
import * as userApi from '../lib/userApi'
import { Track, LibraryTrack } from '../types'
import { toFileUrl } from '../lib/fileTypes'
import { AlbumArtThumbnail } from './AlbumArtThumbnail'
import { apiFetch, JWApiSong, apiFileIdToPath, apiFilePathToTrack } from '../lib/juicewrldApi'
import SongInfoModal from './SongInfoModal'
import SongContextMenu, { SongContextMenuState } from './SongContextMenu'

function libraryTrackToTrack(t: LibraryTrack): Track {
  return {
    id: t.id,
    path: t.filePath,
    streamUrl: toFileUrl(t.filePath),
    imageUrl: t.albumArt || '',
    title: t.title,
    artist: t.artist,
    album: t.album,
    albumArtist: t.albumArtist,
    year: t.year,
    trackNumber: t.trackNumber,
    duration: t.duration,
    genre: t.genre,
    hasAlbumArt: t.hasAlbumArt,
  }
}

function formatDuration(seconds: number): string {
  if (!seconds) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function LikedSongsView(): JSX.Element {
  const { account, playTrack, playNext, toggleLike, setShowUserAuth, setActiveView, setPendingEditorSongId, libraryTracks, likedTrackIds } = useStore()
  const canEdit = !!(account?.is_editor || account?.is_administrator)
  const [apiTracks, setApiTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [ctxMenu, setCtxMenu] = useState<SongContextMenuState | null>(null)
  const [infoSong, setInfoSong] = useState<JWApiSong | null>(null)

  const load = useCallback(async () => {
    if (!account) { setLoading(false); return }
    setLoading(true)
    try {
      const favorites = await userApi.getFavorites()
      setApiTracks(favorites.map((f) => userApi.liteSongToTrack(f.song)))
    } catch {
      setApiTracks([])
    } finally {
      setLoading(false)
    }
  }, [account])

  useEffect(() => { load() }, [load])

  const openSongInfo = async (songId: number): Promise<void> => {
    try { setInfoSong(await apiFetch<JWApiSong>(`/songs/${songId}/`)) } catch {}
  }

  // Local-file likes live in the store (libraryTracks/likedTrackIds), so
  // unliking one just needs toggleLike — the `visible` list above recomputes
  // from the store automatically. API favorites were snapshotted into
  // apiTracks at load time, though, so those need an explicit local removal
  // too or they'd linger until the next full reload.
  const removeLiked = (track: Track): void => {
    if (userApi.trackIdToSongId(track.id) != null) {
      setApiTracks(prev => prev.filter(t => t.id !== track.id))
    }
    toggleLike(track.id)
  }

  // Liked local files never go through the API (toggleLike stores them purely
  // in localStorage for ids that don't resolve to a numeric song id), so they
  // have to be pulled in from the scanned library here rather than getFavorites().
  const localLikedTracks = libraryTracks
    .filter((t) => likedTrackIds.includes(t.id))
    .map(libraryTrackToTrack)

  // Liked files from the API file browser (ApiFilesView) also skip the
  // favorites API — same as local files, their id just encodes the path
  // instead of pointing at a scanned library entry, so rebuild the track
  // straight from the id rather than needing the folder they came from.
  const likedApiFileTracks = likedTrackIds
    .map((id) => { const path = apiFileIdToPath(id); return path ? apiFilePathToTrack(path) : null })
    .filter((t): t is Track => t != null)

  const visible = [...apiTracks, ...localLikedTracks, ...likedApiFileTracks]

  if (!account && localLikedTracks.length === 0 && likedApiFileTracks.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <Heart size={40} className="text-text-muted mb-4" />
        <h2 className="text-text-primary text-lg font-semibold mb-1">Liked Songs</h2>
        <p className="text-text-muted text-sm mb-5 max-w-xs">Log in to save your favorite tracks and access them on any device.</p>
        <button
          onClick={() => setShowUserAuth(true)}
          className="px-5 py-2.5 rounded-xl bg-accent/15 hover:bg-accent/25 text-accent text-sm font-semibold transition-colors"
        >
          Log in
        </button>
      </div>
    )
  }

  return (
    <>
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <div className="px-5 pt-5 pb-8">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent/40 to-accent/10 flex items-center justify-center shrink-0">
            <Heart size={32} className="text-accent" fill="currentColor" />
          </div>
          <div className="min-w-0">
            <h1 className="text-text-primary text-2xl font-bold">Liked Songs</h1>
            <p className="text-text-muted text-sm mt-1">{visible.length} {visible.length === 1 ? 'track' : 'tracks'}</p>
          </div>
          {visible.length > 0 && (
            <button
              onClick={() => playTrack(visible[0], visible)}
              className="ml-auto flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent text-black text-sm font-semibold hover:scale-105 transition-transform"
            >
              <Play size={16} fill="currentColor" /> Play
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-text-muted h-40 justify-center">
            <Loader2 size={18} className="animate-spin" /><span className="text-sm">Loading…</span>
          </div>
        ) : visible.length === 0 ? (
          <p className="text-text-muted text-sm">No liked songs yet. Tap the heart on any track to save it here.</p>
        ) : (
          <div className="space-y-0.5">
            {visible.map((track, i) => {
              const songId = userApi.trackIdToSongId(track.id)
              return (
                <div
                  key={track.id}
                  className="group flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-surface-raised transition-colors"
                  onContextMenu={e => { e.preventDefault(); setCtxMenu({ track, songId, x: e.clientX, y: e.clientY }) }}
                >
                  <span className="w-6 text-center text-xs text-text-muted tabular-nums shrink-0">{i + 1}</span>
                  <button onClick={() => playTrack(track, visible)} className="relative shrink-0">
                    <AlbumArtThumbnail track={track} size={40} className="rounded-md" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 rounded-md transition-opacity">
                      <Play size={16} className="text-white" fill="currentColor" />
                    </span>
                  </button>
                  <div className="min-w-0 flex-1 cursor-pointer" onClick={() => playTrack(track, visible)}>
                    <p className="text-text-primary text-sm font-medium truncate">{track.title}</p>
                    <p className="text-text-muted text-xs truncate">{track.artist}{track.album ? ` · ${track.album}` : ''}</p>
                  </div>
                  <span className="text-text-muted text-xs tabular-nums shrink-0 hidden sm:block">{formatDuration(track.duration)}</span>
                  <button
                    onClick={e => { e.stopPropagation(); setCtxMenu(prev => prev?.track.id === track.id ? null : { track, songId, x: e.clientX, y: e.clientY }) }}
                    className="p-1.5 text-text-muted hover:text-text-primary opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    title="More options"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  <button
                    onClick={() => removeLiked(track)}
                    className="p-1.5 text-accent shrink-0"
                    title="Remove from Liked Songs"
                  >
                    <Heart size={16} fill="currentColor" />
                  </button>
                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>

    {ctxMenu && (
      <SongContextMenu
        state={ctxMenu}
        onClose={() => setCtxMenu(null)}
        canEdit={canEdit}
        onInfo={() => ctxMenu.songId != null && openSongInfo(ctxMenu.songId)}
        onPlay={() => playTrack(ctxMenu.track, visible)}
        onPlayNext={() => playNext(ctxMenu.track)}
        removeAction={{ label: 'Unlike', onClick: () => removeLiked(ctxMenu.track) }}
      />
    )}
    <SongInfoModal
      song={infoSong}
      onClose={() => setInfoSong(null)}
      onEdit={canEdit ? (songId) => { setInfoSong(null); setPendingEditorSongId(songId); setActiveView('editor') } : undefined}
    />
    </>
  )
}
