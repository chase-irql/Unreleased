import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Music, Play, Pause, Shuffle, Search, MoreHorizontal,
  ChevronLeft, LayoutGrid, List, Sparkles, User,
  FolderOpen, Clock, Loader2, GripVertical, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useStore, useStorePick } from '../store/useStore'
import { LibraryTrack } from '../types'
import { libraryTrackToTrack as toQueueTrack } from '../lib/fileTypes'
import { fisherYates } from '../store/queueSlice'
import * as userApi from '../lib/userApi'
import SongContextMenu, { SongContextMenuState } from './SongContextMenu'
import { useVirtualWindow } from '../hooks/useVirtualWindow'
import { formatDuration, formatTotalDuration } from '../lib/format'

/* ══════════════════════════════════════════════════════════════════════════════
   Library — local-file browser styled like the rest of the app (solid surfaces,
   standard tokens). An in-view rail on the left (Library sections) drives a
   contextual main pane. Album grids and the song list are windowed so a
   multi-thousand-track library stays light.
   ══════════════════════════════════════════════════════════════════════════════ */

// Windowing geometry — kept in sync with the row/card markup below.
const SONG_ROW_H = 56       // one SongRow incl. padding
const GRID_PAD = 20         // grid outer padding, px
const GRID_GAP = 20         // gap between cards, px
const CARD_MIN = 150        // min card column width, px
const CARD_TEXT_H = 60      // fixed text block beneath square art, px

// ─── helpers ────────────────────────────────────────────────────────────────

const byTrackNo = (a: LibraryTrack, b: LibraryTrack) => (a.trackNumber ?? 999) - (b.trackNumber ?? 999)
const shuffled = fisherYates

// ─── album / artist models ───────────────────────────────────────────────────

interface Album {
  key: string
  name: string
  artist: string
  year: number | null
  addedAt: number
  tracks: LibraryTrack[]
  coverTrack: LibraryTrack
}

interface Artist {
  name: string
  tracks: LibraryTrack[]
  albums: number
  coverTrack: LibraryTrack
}

// ─── lazy album-art loading hook ──────────────────────────────────────────────
// A track carries `albumArt: undefined` until its cover has been read off disk.
// This kicks off that read once and lets the store fan the result out to every
// component showing the same track.

// The same track can be visible in several places at once (song list, album
// grid, playlist mosaic) — without this, each thumbnail fired its own
// readAlbumArt parse before the first result landed in the store.
const inflightArt = new Set<string>()

function useTrackArt(track: LibraryTrack): string | null | undefined {
  const el = (window as any).electron
  const { applyLibraryArt } = useStorePick('applyLibraryArt')
  useEffect(() => {
    if (!el || track.albumArt !== undefined) return
    // The scan already read this file's tags and found no embedded art —
    // don't pay a full metadata parse just to learn null again.
    if (!track.hasAlbumArt) { applyLibraryArt(track.id, null); return }
    if (inflightArt.has(track.id)) return
    inflightArt.add(track.id)
    el.readAlbumArt(track.filePath)
      .then((a: string | null) => applyLibraryArt(track.id, a ?? null))
      .catch(() => {})
      .finally(() => inflightArt.delete(track.id))
  }, [track.id, track.albumArt])
  return track.albumArt
}

/** Small square thumbnail. Exported — PlaylistsView reuses it. */
export function AlbumArtThumb({ track, size = 48 }: { track: LibraryTrack; size?: number }): JSX.Element {
  const art = useTrackArt(track)
  if (art) return <img src={art} alt="" className="object-cover" style={{ width: size, height: size }} />
  return (
    <div className="flex items-center justify-center bg-surface-overlay text-text-muted" style={{ width: size, height: size }}>
      <Music size={size * 0.4} />
    </div>
  )
}

// ─── song row ─────────────────────────────────────────────────────────────────

function SongRow({ track, index, queue, onContext, showAlbum = true, draggable, onDragStart, onDragOver, onDrop }: {
  track: LibraryTrack
  index: number
  queue: LibraryTrack[]
  onContext: (track: LibraryTrack, queue: LibraryTrack[], x: number, y: number) => void
  showAlbum?: boolean
  draggable?: boolean
  onDragStart?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: () => void
}): JSX.Element {
  const { playTrack, currentTrack, isPlaying, setIsPlaying } = useStorePick('playTrack', 'currentTrack', 'isPlaying', 'setIsPlaying')
  const [hover, setHover] = useState(false)

  const isCurrent = currentTrack?.id === track.id

  const play = () => {
    if (isCurrent) { setIsPlaying(!isPlaying); return }
    playTrack(toQueueTrack(track), queue.map(toQueueTrack))
  }

  return (
    <div className="px-1.5">
      <div
        className={`group flex items-center gap-3 pl-3 pr-2 py-2 rounded-lg transition-colors cursor-pointer ${
          isCurrent ? 'bg-surface-raised' : 'hover:bg-surface-raised'
        } ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onDoubleClick={play}
        onContextMenu={e => { e.preventDefault(); onContext(track, queue, e.clientX, e.clientY) }}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {draggable && <GripVertical size={14} className="text-text-muted opacity-0 group-hover:opacity-100 shrink-0 -ml-1" />}
        <div className="w-5 shrink-0 flex items-center justify-center">
          {hover || isCurrent
            ? <button onClick={play}>
                {isCurrent && isPlaying
                  ? <Pause size={13} fill="currentColor" className="text-accent" />
                  : <Play size={13} fill="currentColor" className={isCurrent ? 'text-accent' : 'text-text-primary'} />}
              </button>
            : <span className="text-text-muted text-xs tabular-nums">{index + 1}</span>}
        </div>
        <div className="w-10 h-10 rounded overflow-hidden shrink-0 bg-surface-overlay">
          <AlbumArtThumb track={track} size={40} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm truncate ${isCurrent ? 'text-accent font-medium' : 'text-text-primary'}`}>{track.title}</p>
          <p className="text-text-muted text-xs truncate">{track.artist || 'Unknown Artist'}</p>
        </div>
        {showAlbum && <span className="text-text-muted text-xs truncate max-w-[180px] hidden lg:block">{track.album}</span>}
        <span className="text-text-muted text-xs shrink-0 tabular-nums">{formatDuration(track.duration, '--:--')}</span>
        <button
          onClick={e => { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); onContext(track, queue, r.right, r.bottom) }}
          className="w-7 h-7 shrink-0 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-all"
        >
          <MoreHorizontal size={15} />
        </button>
      </div>
    </div>
  )
}

// ─── album card ───────────────────────────────────────────────────────────────

function AlbumCard({ album, onOpen, onPlay }: { album: Album; onOpen: () => void; onPlay: () => void }): JSX.Element {
  const [hover, setHover] = useState(false)
  const art = useTrackArt(album.coverTrack)
  return (
    <div className="group cursor-pointer select-none" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onClick={onOpen}>
      <div className="relative aspect-square mb-3">
        <div className="relative rounded-lg overflow-hidden aspect-square bg-surface-overlay border border-[var(--border)] shadow-sm">
          {art === undefined
            ? <div className="w-full h-full art-shimmer" />
            : art
            ? <img src={art} alt={album.name} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-text-muted"><Music size={40} /></div>}
          <div className={`absolute inset-0 flex items-end p-3 transition-opacity duration-200 ${hover ? 'opacity-100' : 'opacity-0'}`}
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.45), transparent 55%)' }}>
            <button onClick={e => { e.stopPropagation(); onPlay() }}
              className="ml-auto w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center shadow-lg hover:bg-accent-hover transition-colors">
              <Play size={16} fill="currentColor" className="ml-0.5" />
            </button>
          </div>
        </div>
      </div>
      <div style={{ height: CARD_TEXT_H }} className="overflow-hidden px-0.5">
        <p className="text-text-primary text-sm font-medium truncate leading-5">{album.name}</p>
        <p className="text-text-secondary text-xs truncate leading-4">{album.artist}{album.year ? ` · ${album.year}` : ''}</p>
        <p className="text-text-muted text-[11px] leading-4">{album.tracks.length} {album.tracks.length === 1 ? 'song' : 'songs'}</p>
      </div>
    </div>
  )
}

// ─── artist card (circular) ───────────────────────────────────────────────────

function ArtistCard({ artist, onOpen }: { artist: Artist; onOpen: () => void }): JSX.Element {
  const art = useTrackArt(artist.coverTrack)
  return (
    <button onClick={onOpen} className="group flex flex-col items-center gap-3 select-none">
      <div className="relative w-full aspect-square">
        <div className="relative w-full h-full rounded-full overflow-hidden bg-surface-overlay border border-[var(--border)] shadow-sm">
          {art === undefined
            ? <div className="w-full h-full art-shimmer" />
            : art
            ? <img src={art} alt={artist.name} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-text-muted"><User size={40} /></div>}
        </div>
      </div>
      <div className="text-center px-1 w-full">
        <p className="text-text-primary text-sm font-medium truncate">{artist.name}</p>
        <p className="text-text-muted text-[11px]">{artist.tracks.length} {artist.tracks.length === 1 ? 'song' : 'songs'}</p>
      </div>
    </button>
  )
}

// ─── virtualized card grid (albums & artists) ─────────────────────────────────

function CardGrid({ count, render, circular = false }: {
  count: number
  render: (i: number) => JSX.Element
  circular?: boolean
}): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(1)
  const [colW, setColW] = useState(CARD_MIN)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const compute = () => {
      const w = el.clientWidth - GRID_PAD * 2
      const c = Math.max(1, Math.floor((w + GRID_GAP) / (CARD_MIN + GRID_GAP)))
      setCols(c)
      setColW((w - (c - 1) * GRID_GAP) / c)
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const textH = circular ? 52 : CARD_TEXT_H
  const rowStride = colW + textH + 12 /* mb-3 */ + GRID_GAP
  const rows = Math.ceil(count / cols)
  const { start, end, totalHeight } = useVirtualWindow(scrollRef, contentRef, rows, rowStride)

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto view-enter" style={{ padding: GRID_PAD }}>
      {count === 0 ? (
        <p className="text-text-muted text-sm text-center py-16">Nothing here yet</p>
      ) : (
        <div ref={contentRef} style={{ height: totalHeight, position: 'relative' }}>
          {Array.from({ length: end - start }, (_, r) => {
            const row = start + r
            return (
              <div key={row} style={{
                position: 'absolute', top: row * rowStride, left: 0, right: 0,
                display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: GRID_GAP,
              }}>
                {Array.from({ length: Math.min(cols, count - row * cols) }, (_, c) => render(row * cols + c))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── virtualized song list ────────────────────────────────────────────────────

function SongList({ tracks, header, onContext }: {
  tracks: LibraryTrack[]
  header?: JSX.Element
  onContext: (track: LibraryTrack, queue: LibraryTrack[], x: number, y: number) => void
}): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const { start, end, totalHeight } = useVirtualWindow(scrollRef, contentRef, tracks.length, SONG_ROW_H)
  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto py-3 px-2.5 view-enter">
      {header}
      {tracks.length === 0 ? (
        <p className="text-text-muted text-sm text-center py-16">No songs found</p>
      ) : (
        <div ref={contentRef} style={{ height: totalHeight, position: 'relative' }}>
          {tracks.slice(start, end).map((t, i) => {
            const index = start + i
            return (
              <div key={t.id} style={{ position: 'absolute', top: index * SONG_ROW_H, left: 0, right: 0, height: SONG_ROW_H }}>
                <SongRow track={t} index={index} queue={tracks} onContext={onContext} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── detail header (shared by album & artist) ──────────────────────────────────

function DetailHeader({ art, eyebrow, title, subtitle, meta, round, onBack, onPlay, onShuffle, fallbackIcon }: {
  art?: string | null
  eyebrow: string
  title: string
  subtitle: string
  meta: string
  round?: boolean
  onBack?: () => void
  onPlay: () => void
  onShuffle?: () => void
  fallbackIcon: JSX.Element
}): JSX.Element {
  return (
    <>
      <div className="flex items-end gap-5 p-6 pb-4">
        {onBack && (
          <button onClick={onBack} className="absolute top-3 left-3 w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
            <ChevronLeft size={18} />
          </button>
        )}
        <div className={`w-40 h-40 overflow-hidden shrink-0 bg-surface-overlay border border-[var(--border)] shadow-lg flex items-center justify-center ${round ? 'rounded-full' : 'rounded-xl'}`}>
          {art === undefined ? <div className="w-full h-full art-shimmer" />
            : art ? <img src={art} alt={title} className="w-full h-full object-cover" />
            : fallbackIcon}
        </div>
        <div className="pb-1 min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1">{eyebrow}</p>
          <h1 className="text-text-primary text-3xl font-bold mb-1 truncate">{title}</h1>
          <p className="text-text-secondary text-sm truncate">{subtitle}</p>
          <p className="text-text-muted text-xs mt-1">{meta}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 px-6 pb-4">
        <button onClick={onPlay} className="flex items-center gap-2 px-5 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:bg-accent-hover transition-colors">
          <Play size={16} fill="currentColor" className="ml-0.5" /> Play
        </button>
        {onShuffle && (
          <button onClick={onShuffle} className="flex items-center gap-2 px-5 py-2 bg-surface-overlay border border-[var(--border)] text-text-primary rounded-lg text-sm font-semibold hover:bg-surface-highest transition-colors">
            <Shuffle size={16} /> Shuffle
          </button>
        )}
      </div>
    </>
  )
}

// ─── detail: album ────────────────────────────────────────────────────────────

function AlbumDetail({ album, onBack, onContext }: {
  album: Album; onBack: () => void; onContext: (track: LibraryTrack, queue: LibraryTrack[], x: number, y: number) => void
}): JSX.Element {
  const { playCollection } = useStorePick('playCollection')
  const art = useTrackArt(album.coverTrack)
  const tracks = useMemo(() => [...album.tracks].sort(byTrackNo), [album])
  const total = tracks.reduce((s, t) => s + t.duration, 0)
  const play = (list: LibraryTrack[]) => { const q = list.map(toQueueTrack); if (q.length) playCollection(q) }
  return (
    <div className="flex-1 overflow-y-auto relative view-enter">
      <DetailHeader
        art={art} eyebrow="Album" title={album.name}
        subtitle={`${album.artist}${album.year ? ` · ${album.year}` : ''}`}
        meta={`${tracks.length} songs · ${formatTotalDuration(total)}`}
        onBack={onBack} onPlay={() => play(tracks)} onShuffle={() => play(shuffled(tracks))}
        fallbackIcon={<Music size={48} className="text-text-muted" />}
      />
      <div className="px-3 pb-8">
        {tracks.map((t, i) => <SongRow key={t.id} track={t} index={i} queue={tracks} onContext={onContext} showAlbum={false} />)}
      </div>
    </div>
  )
}

// ─── detail: artist ───────────────────────────────────────────────────────────

function ArtistDetail({ artist, albums, onBack, onOpenAlbum, onContext }: {
  artist: Artist
  albums: Album[]
  onBack: () => void
  onOpenAlbum: (a: Album) => void
  onContext: (track: LibraryTrack, queue: LibraryTrack[], x: number, y: number) => void
}): JSX.Element {
  const { playCollection } = useStorePick('playCollection')
  const art = useTrackArt(artist.coverTrack)
  const allTracks = useMemo(() => [...artist.tracks].sort((a, b) => a.title.localeCompare(b.title)), [artist])
  const total = artist.tracks.reduce((s, t) => s + t.duration, 0)
  const play = (list: LibraryTrack[]) => { const q = list.map(toQueueTrack); if (q.length) playCollection(q) }
  return (
    <div className="flex-1 overflow-y-auto relative view-enter">
      <DetailHeader
        art={art} round eyebrow="Artist" title={artist.name}
        subtitle={`${albums.length} ${albums.length === 1 ? 'album' : 'albums'}`}
        meta={`${artist.tracks.length} songs · ${formatTotalDuration(total)}`}
        onBack={onBack} onPlay={() => play(allTracks)} onShuffle={() => play(shuffled(allTracks))}
        fallbackIcon={<User size={48} className="text-text-muted" />}
      />
      {albums.length > 0 && (
        <div className="px-6 pb-2">
          <h2 className="text-text-primary text-lg font-bold mb-3">Albums</h2>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
            {albums.map(a => <AlbumCard key={a.key} album={a} onOpen={() => onOpenAlbum(a)} onPlay={() => play([...a.tracks].sort(byTrackNo))} />)}
          </div>
        </div>
      )}
      <div className="px-6 pt-4 pb-2">
        <h2 className="text-text-primary text-lg font-bold">Songs</h2>
      </div>
      <div className="px-3 pb-8">
        {allTracks.slice(0, 60).map((t, i) => <SongRow key={t.id} track={t} index={i} queue={allTracks} onContext={onContext} />)}
      </div>
    </div>
  )
}

// ─── empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onOpenSettings }: { onOpenSettings: () => void }): JSX.Element {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="w-20 h-20 rounded-full bg-surface-overlay flex items-center justify-center">
        <Music size={36} className="text-text-muted" />
      </div>
      <div>
        <h2 className="text-text-primary text-xl font-semibold mb-1">Your library is empty</h2>
        <p className="text-text-muted text-sm max-w-xs">Add folders in Settings → Library Folders, then scan to import your music.</p>
      </div>
      <button onClick={onOpenSettings} className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-lg text-sm font-semibold hover:bg-accent-hover transition-colors">
        <FolderOpen size={15} /> Add Folders
      </button>
    </div>
  )
}

// ─── browse rail ──────────────────────────────────────────────────────────────

type LibKey = 'recent' | 'artists' | 'albums' | 'songs'
type Nav = { kind: 'lib'; key: LibKey }

const LIB_SECTIONS: { key: LibKey; label: string; icon: JSX.Element }[] = [
  { key: 'recent', label: 'Recently Added', icon: <Sparkles size={16} /> },
  { key: 'artists', label: 'Artists', icon: <User size={16} /> },
  { key: 'albums', label: 'Albums', icon: <LayoutGrid size={16} /> },
  { key: 'songs', label: 'Songs', icon: <List size={16} /> },
]

function BrowseRail({ nav, onNav, songCount }: { nav: Nav; onNav: (n: Nav) => void; songCount: number }): JSX.Element {
  const row = (active: boolean) =>
    `w-full flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors ${
      active ? 'bg-surface-raised text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised'
    }`

  return (
    <div className="w-52 shrink-0 flex flex-col bg-surface-raised border-r border-[var(--border)] overflow-y-auto">
      <div className="px-4 pt-5 pb-3">
        <h1 className="text-text-primary text-lg font-bold">Library</h1>
      </div>

      <div className="px-2 space-y-1">
        {LIB_SECTIONS.map(s => (
          <button key={s.key} onClick={() => onNav({ kind: 'lib', key: s.key })} className={row(nav.kind === 'lib' && nav.key === s.key)}>
            <span className="shrink-0">{s.icon}</span>
            <span className="truncate flex-1 text-left">{s.label}</span>
            {s.key === 'songs' && <span className="text-[10px] text-text-muted">{songCount}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── main ─────────────────────────────────────────────────────────────────────

export default function LibraryTab(): JSX.Element {
  const { libraryTracks, libraryScanning, scanLibrary, libraryFolders, loadLibrary, setShowSettings, playTrack, playCollection, playNext, addToQueue, account, setActiveView, setPendingLocalEditTrack } = useStorePick('libraryTracks', 'libraryScanning', 'scanLibrary', 'libraryFolders', 'loadLibrary', 'setShowSettings', 'playTrack', 'playCollection', 'playNext', 'addToQueue', 'account', 'setActiveView', 'setPendingLocalEditTrack')

  const [nav, setNav] = useState<Nav>(() => ({ kind: 'lib', key: (localStorage.getItem('library:view') as LibKey) || 'albums' }))
  const [drill, setDrill] = useState<{ kind: 'album'; album: Album } | { kind: 'artist'; name: string } | null>(null)
  const [searchQ, setSearchQ] = useState('')
  // Shared song context menu (same one the Tracker/Playlists/Player use). The
  // queue captured at open-time drives its Play/Play-next/Add-to-queue actions.
  const [ctx, setCtx] = useState<{ track: LibraryTrack; queue: LibraryTrack[]; x: number; y: number } | null>(null)
  const [sortField, setSortField] = useState<'title' | 'album' | 'duration' | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const openCtx = (track: LibraryTrack, queue: LibraryTrack[], x: number, y: number) => setCtx({ track, queue, x, y })

  const navTo = (n: Nav) => {
    setNav(n); setDrill(null)
    if (n.kind === 'lib') localStorage.setItem('library:view', n.key)
  }
  const toggleSort = (f: 'title' | 'album' | 'duration') => {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(f); setSortDir('asc') }
  }

  useEffect(() => { loadLibrary() }, [])
  // Reset drill when switching rail section
  useEffect(() => { setDrill(null) }, [nav])

  // ── derived collections ──
  const albums = useMemo<Album[]>(() => {
    const map = new Map<string, Album>()
    for (const t of libraryTracks) {
      const key = `${t.album || 'Unknown Album'}__${t.albumArtist || t.artist || 'Unknown Artist'}`
      let a = map.get(key)
      if (!a) { a = { key, name: t.album || 'Unknown Album', artist: t.albumArtist || t.artist || 'Unknown Artist', year: t.year, addedAt: 0, tracks: [], coverTrack: t }; map.set(key, a) }
      a.tracks.push(t)
      a.addedAt = Math.max(a.addedAt, t.addedAt || 0)
      if (t.trackNumber === 1 || (!a.coverTrack.hasAlbumArt && t.hasAlbumArt)) a.coverTrack = t
    }
    return [...map.values()]
  }, [libraryTracks])

  const artists = useMemo<Artist[]>(() => {
    const map = new Map<string, Artist>()
    const albumSets = new Map<string, Set<string>>()
    for (const t of libraryTracks) {
      const name = t.albumArtist || t.artist || 'Unknown Artist'
      let a = map.get(name)
      if (!a) { a = { name, tracks: [], albums: 0, coverTrack: t }; map.set(name, a); albumSets.set(name, new Set()) }
      a.tracks.push(t)
      albumSets.get(name)!.add(t.album || 'Unknown Album')
      if (!a.coverTrack.hasAlbumArt && t.hasAlbumArt) a.coverTrack = t
    }
    for (const [name, a] of map) a.albums = albumSets.get(name)!.size
    return [...map.values()].sort((x, y) => x.name.localeCompare(y.name))
  }, [libraryTracks])

  const q = searchQ.trim().toLowerCase()

  const albumsSorted = useMemo(() => {
    const base = nav.kind === 'lib' && nav.key === 'recent'
      ? [...albums].sort((a, b) => b.addedAt - a.addedAt)
      : [...albums].sort((a, b) => a.name.localeCompare(b.name))
    if (!q) return base
    return base.filter(a => a.name.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q))
  }, [albums, nav, q])

  const artistsFiltered = useMemo(() => q ? artists.filter(a => a.name.toLowerCase().includes(q)) : artists, [artists, q])

  const songs = useMemo(() => {
    let list = q ? libraryTracks.filter(t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || t.album.toLowerCase().includes(q)) : libraryTracks
    if (sortField) {
      list = [...list].sort((a, b) => {
        let av: string | number, bv: string | number
        if (sortField === 'title') { av = a.title.toLowerCase(); bv = b.title.toLowerCase() }
        else if (sortField === 'album') { av = (a.album || '').toLowerCase(); bv = (b.album || '').toLowerCase() }
        else { av = a.duration; bv = b.duration }
        return sortDir === 'asc' ? (av < bv ? -1 : av > bv ? 1 : 0) : (av > bv ? -1 : av < bv ? 1 : 0)
      })
    }
    return list
  }, [libraryTracks, q, sortField, sortDir])

  const drillArtist = drill?.kind === 'artist' ? artists.find(a => a.name === drill.name) : undefined
  const drillArtistAlbums = drillArtist ? albums.filter(a => a.artist === drillArtist.name).sort((x, y) => (y.year ?? 0) - (x.year ?? 0)) : []

  const playAll = (list: LibraryTrack[], rnd = false) => { const q2 = (rnd ? shuffled(list) : list).map(toQueueTrack); if (q2.length) playCollection(q2) }
  const playAlbum = (a: Album) => playAll([...a.tracks].sort(byTrackNo))

  const showEmpty = libraryTracks.length === 0 && !libraryScanning
  const showToolbar = !drill && nav.kind === 'lib'

  const title = drill?.kind === 'album' ? drill.album.name
    : drill?.kind === 'artist' ? drill.name
    : LIB_SECTIONS.find(s => s.key === nav.key)?.label ?? 'Library'

  return (
    <div className="flex-1 flex overflow-hidden bg-surface">
      <BrowseRail nav={nav} onNav={navTo} songCount={libraryTracks.length} />

      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Toolbar (grid/list sections only; detail views carry their own header) */}
        {showToolbar && !showEmpty && !libraryScanning && (
          /* The whole bar must NOT be app-region:no-drag — Chromium computes drag
             regions as flat rect math (drag minus no-drag, stacking ignored), so a
             full-width no-drag bar here erased App's titlebar drag strip and made
             the window unmovable on this view. Only the controls punch holes. */
          <div className="shrink-0 flex items-center flex-wrap gap-x-3 gap-y-2 px-5 py-3 border-b border-[var(--border)]" style={{ paddingRight: (window as any).electron ? 188 : undefined }}>
            <h2 className="text-text-primary text-xl font-bold shrink-0">{title}</h2>
            <div className="relative flex-1 min-w-[120px] max-w-xs ml-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search library…"
                className="w-full pl-8 pr-3 py-1.5 bg-surface-overlay border border-[var(--border)] rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors" />
            </div>
            <div className="flex items-center gap-2 ml-auto" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              {libraryTracks.length > 0 && (
                <>
                  <button onClick={() => playAll(songs)} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-medium hover:bg-accent-hover transition-colors">
                    <Play size={12} fill="currentColor" /> Play
                  </button>
                  <button onClick={() => playAll(songs, true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-overlay border border-[var(--border)] text-text-muted rounded-lg text-xs font-medium hover:text-text-primary transition-colors">
                    <Shuffle size={12} /> Shuffle
                  </button>
                </>
              )}
              <button onClick={() => scanLibrary()} disabled={libraryScanning || libraryFolders.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-overlay border border-[var(--border)] text-text-muted rounded-lg text-xs font-medium hover:text-text-primary transition-colors disabled:opacity-40"
                title={libraryFolders.length === 0 ? 'Add folders in Settings first' : 'Scan library'}>
                {libraryScanning ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                {libraryScanning ? 'Scanning…' : 'Scan'}
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        {showEmpty ? (
          <EmptyState onOpenSettings={() => setShowSettings(true)} />
        ) : libraryScanning ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <Loader2 size={32} className="animate-spin text-accent" />
            <p className="text-text-muted text-sm">Scanning your library…</p>
          </div>
        ) : drill?.kind === 'album' ? (
          <AlbumDetail album={drill.album} onBack={() => setDrill(null)} onContext={openCtx} />
        ) : drill?.kind === 'artist' && drillArtist ? (
          <ArtistDetail artist={drillArtist} albums={drillArtistAlbums} onBack={() => setDrill(null)}
            onOpenAlbum={a => setDrill({ kind: 'album', album: a })} onContext={openCtx} />
        ) : nav.kind === 'lib' && nav.key === 'artists' ? (
          <CardGrid circular count={artistsFiltered.length} render={i => {
            const a = artistsFiltered[i]
            return <ArtistCard key={a.name} artist={a} onOpen={() => setDrill({ kind: 'artist', name: a.name })} />
          }} />
        ) : nav.kind === 'lib' && nav.key === 'songs' ? (
          <SongList tracks={songs} onContext={openCtx}
            header={
              <div className="flex items-center gap-3 px-4 py-1.5 mb-1">
                <div className="w-5 text-[10px] text-text-muted uppercase tracking-wider text-center">#</div>
                <div className="w-10 shrink-0" />
                <button onClick={() => toggleSort('title')} className="flex-1 flex items-center gap-1 text-[10px] text-text-muted uppercase tracking-wider hover:text-text-primary transition-colors">
                  Title {sortField === 'title' && (sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
                </button>
                <button onClick={() => toggleSort('album')} className="hidden lg:flex items-center gap-1 w-[180px] text-[10px] text-text-muted uppercase tracking-wider hover:text-text-primary transition-colors">
                  Album {sortField === 'album' && (sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
                </button>
                <button onClick={() => toggleSort('duration')} className="flex items-center gap-1 text-text-muted hover:text-text-primary transition-colors shrink-0">
                  <Clock size={11} /> {sortField === 'duration' && (sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
                </button>
                <div className="w-7" />
              </div>
            } />
        ) : (
          /* albums + recently added */
          <CardGrid count={albumsSorted.length} render={i => {
            const a = albumsSorted[i]
            return <AlbumCard key={a.key} album={a} onOpen={() => setDrill({ kind: 'album', album: a })} onPlay={() => playAlbum(a)} />
          }} />
        )}
      </div>

      {ctx && (
        <SongContextMenu
          state={{ track: toQueueTrack(ctx.track), songId: userApi.trackIdToSongId(ctx.track.id), x: ctx.x, y: ctx.y } as SongContextMenuState}
          onClose={() => setCtx(null)}
          canEdit={!!account?.is_editor}
          onInfo={() => {}}
          onPlay={() => playTrack(toQueueTrack(ctx.track), ctx.queue.map(toQueueTrack))}
          onPlayNext={() => playNext(toQueueTrack(ctx.track))}
          onAddToQueue={() => addToQueue(toQueueTrack(ctx.track))}
          onEditLocalMetadata={() => { setPendingLocalEditTrack(ctx.track); setActiveView('local-editor') }}
        />
      )}
    </div>
  )
}
