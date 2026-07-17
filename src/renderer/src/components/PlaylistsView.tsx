import React, { useEffect, useState, useCallback, useRef, useMemo, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  ListMusic, Play, Loader2, Plus, Trash2, Pencil, ArrowLeft,
  X, Check, Heart, Shuffle, Music2, Clock, GripVertical,
  ListPlus, Download, Archive, Info, FolderInput, MoreHorizontal,
  Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ImageOff, Globe, Lock, Link, ListEnd, HardDrive, CircleArrowDown, Layers,
  CheckSquare2, Square,
} from 'lucide-react'
import { useStore, useStorePick } from '../store/useStore'
import * as userApi from '../lib/userApi'
import type { PlaylistDetail, PlaylistSummary } from '../lib/userApi'
import { Track, LocalPlaylist, LibraryTrack } from '../types'
import { AlbumArtThumbnail } from './AlbumArtThumbnail'
import { buildImageUrl, buildStreamUrl, JWAPI_BASE, apiFetch, JWApiSong, playlistCoverUrl } from '../lib/juicewrldApi'
import { toFileUrl, libraryTrackToTrack as libTrackToTrack } from '../lib/fileTypes'
import { formatDuration, formatTotalDuration } from '../lib/format'
import { fisherYates } from '../store/queueSlice'
import LikedSongsView from './LikedSongsView'
import { AlbumArtThumb } from './LibraryTab'
import SongInfoModal from './SongInfoModal'
import SongContextMenu, { SongContextMenuState } from './SongContextMenu'
import { CompactGroupRow, CompactEmptyIcon, useExpandedGroups } from './CompactGroupRow'
import { groupItemsByVersion, filterCompactGroups } from '../lib/compactGroups'
import type { CompactGroup } from '../lib/compactGroups'
import { versionsEnabled } from '../lib/versionsApi'
import { useVirtualWindowEl } from '../hooks/useVirtualWindow'
import PlaylistCard from './PlaylistCard'
import { allFolderedKeys, folderOfPlaylist, parsePlaylistKey } from '../lib/playlistFolders'
import type { PlaylistFolder } from '../lib/playlistFolders'
import { Folder, FolderPlus, FolderOpen, FolderMinus } from 'lucide-react'

// ── PlaylistMosaic ────────────────────────────────────────────────────────────

function PlaylistMosaic({ tracks, className = '' }: { tracks: Track[]; className?: string }): JSX.Element {
  const artUrls = tracks.slice(0, 4).map(t => t.imageUrl).filter(Boolean) as string[]
  if (artUrls.length === 0) {
    return (
      <div className={`bg-gradient-to-br from-accent/40 to-accent/10 flex items-center justify-center ${className}`}>
        <Music2 size={48} className="text-accent/50" />
      </div>
    )
  }
  if (artUrls.length < 4) return <img src={artUrls[0]} alt="" className={`object-cover ${className}`} />
  return (
    <div className={`grid grid-cols-2 ${className}`} style={{ overflow: 'hidden', transform: 'translateZ(0)' }}>
      {artUrls.map((url, i) => (
        <img key={i} src={url} alt="" className="w-full h-full object-cover" style={{ aspectRatio: '1' }} />
      ))}
    </div>
  )
}

// ── HeroBackdrop — Apple Music-style full-bleed blurred cover art behind the
// playlist header, instead of a faint corner blob. Fades into the page's own
// background at the bottom so the track list below sits on ordinary bg.
function HeroBackdrop({ src }: { src?: string | null }): JSX.Element {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
      {src && (
        <img
          src={src}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter: 'blur(50px) saturate(1.7) brightness(0.5)', transform: 'scale(1.3)' }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/5 to-[var(--surface)]" />
    </div>
  )
}

// ── HeroPlayButton / HeroShuffleButton — Apple Music-style circular icon
// controls, replacing the pill-shaped "Play"/"Shuffle" text buttons.
function HeroPlayButton({ onClick }: { onClick: () => void }): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center w-14 h-14 rounded-full bg-accent text-black shadow-lg hover:scale-105 active:scale-95 transition-transform"
      title="Play"
    >
      <Play size={22} fill="currentColor" className="ml-0.5" />
    </button>
  )
}
function HeroShuffleButton({ onClick }: { onClick: () => void }): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center w-11 h-11 rounded-full bg-surface-overlay hover:bg-surface-raised text-text-primary border border-[var(--border)] transition-colors"
      title="Shuffle"
    >
      <Shuffle size={17} />
    </button>
  )
}

// (The per-tile hover play button lives in PlaylistCard now — every grid,
// including the logged-out one, renders tiles through it.)

function totalDurationLabel(tracks: Track[]): string {
  const secs = tracks.reduce((acc, t) => acc + (t.duration ?? 0), 0)
  if (secs === 0) return ''
  return formatTotalDuration(secs)
}

// ── MenuItem helper ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MenuItem({ icon: Icon, label, onClick, destructive = false, disabled = false, trailing }: {
  icon: React.ElementType<any>
  label: string
  onClick: () => void
  destructive?: boolean
  disabled?: boolean
  trailing?: React.ReactNode
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm transition-colors hover:bg-surface-overlay disabled:opacity-40 disabled:cursor-not-allowed ${
        destructive ? 'text-red-400 hover:text-red-300' : 'text-text-primary'
      }`}
    >
      <Icon size={14} className={destructive ? 'text-red-400' : 'text-text-muted'} />
      <span className="flex-1 text-left">{label}</span>
      {trailing}
    </button>
  )
}

type SortField = 'default' | 'title' | 'artist' | 'duration'
interface SortState { field: SortField; dir: 'asc' | 'desc' }

type CardMenuState =
  | { kind: 'api';   playlist: PlaylistSummary; x: number; y: number; showPlaylists: boolean; showFolders?: boolean; renaming?: boolean; renameVal?: string }
  | { kind: 'local'; playlist: LocalPlaylist;   x: number; y: number; showPlaylists: boolean; showFolders?: boolean; renaming?: boolean; renameVal?: string }

// ── Tracklist skeleton ────────────────────────────────────────────────────────

function TrackSkeleton(): JSX.Element {
  return (
    <div className="space-y-1 pt-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="grid items-center gap-3 px-4 py-2" style={{ gridTemplateColumns: '16px 28px 40px 1fr 56px 36px' }}>
          <span />
          <div className="w-4 h-3 rounded bg-surface-overlay animate-pulse" />
          <div className="w-10 h-10 rounded-md bg-surface-overlay animate-pulse" />
          <div className="space-y-1.5">
            <div className={`h-3 rounded bg-surface-overlay animate-pulse`} style={{ width: `${55 + (i * 17) % 35}%` }} />
            <div className="h-2.5 rounded bg-surface-overlay animate-pulse w-1/3" />
          </div>
          <div className="h-3 w-8 rounded bg-surface-overlay animate-pulse mx-auto" />
          <span />
        </div>
      ))}
    </div>
  )
}

// ── Sort header cell ──────────────────────────────────────────────────────────

function SortHeader({ label, field, sort, onSort }: {
  label: string | React.ReactNode
  field: SortField
  sort: SortState
  onSort: (f: SortField) => void
}): JSX.Element {
  const active = sort.field === field
  return (
    <button
      onClick={() => field !== 'default' && onSort(field)}
      className={`flex items-center gap-0.5 transition-colors ${field === 'default' ? 'cursor-default' : 'hover:text-text-primary'} ${active ? 'text-text-primary' : ''}`}
    >
      {label}
      {active && field !== 'default' && (
        sort.dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />
      )}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

// ── Local-library helpers ─────────────────────────────────────────────────────

function LocalPlaylistMosaic({ trackIds, className = '' }: {
  trackIds: string[]; className?: string
}): JSX.Element {
  // Covers live in the store's libraryArt map (keyed by track id), populated as
  // tracks are viewed in the Library tab — read them straight from there.
  const libraryArt = useStore(s => s.libraryArt)
  const covers = trackIds
    .map(id => libraryArt[id])
    .filter((a): a is string => !!a)
    .slice(0, 4)
  if (covers.length === 0) {
    return (
      <div className={`bg-gradient-to-br from-accent/40 to-accent/10 flex items-center justify-center ${className}`}>
        <HardDrive size={32} className="text-accent/50" />
      </div>
    )
  }
  if (covers.length < 4) {
    return <img src={covers[0]} alt="" className={`object-cover ${className}`} />
  }
  return (
    <div className={`grid grid-cols-2 ${className}`} style={{ overflow: 'hidden', transform: 'translateZ(0)' }}>
      {covers.map((src, i) => (
        <img key={i} src={src} alt="" className="w-full h-full object-cover" style={{ aspectRatio: '1' }} />
      ))}
    </div>
  )
}


export default function PlaylistsView(): JSX.Element {
  const { account, playlists, refreshPlaylists, playTrack, playCollection, addToQueue, setShowUserAuth, likedTrackIds, setActiveView, setPendingEditorSongId,
    localPlaylists, libraryTracks, libraryArt, loadLibrary, deleteLocalPlaylist, renameLocalPlaylist, updateLocalPlaylist, addToLocalPlaylist,
    pendingPlaylistId, setPendingPlaylistId,
    playlistsSelectedId: selectedId, setPlaylistsSelectedId: setSelectedId,
    playlistsSelectedLocalId: localSelectedId, setPlaylistsSelectedLocalId: setLocalSelectedId,
    offlinePlaylists, offlineSync, offlineTracks, downloadPlaylistOffline, removePlaylistOffline,
    playlistFolders, createFolder, renameFolder, deleteFolder, movePlaylistsToFolder } = useStorePick('account', 'playlists', 'refreshPlaylists', 'playTrack', 'playCollection', 'addToQueue', 'setShowUserAuth', 'likedTrackIds', 'setActiveView', 'setPendingEditorSongId', 'localPlaylists', 'libraryTracks', 'libraryArt', 'loadLibrary', 'deleteLocalPlaylist', 'renameLocalPlaylist', 'updateLocalPlaylist', 'addToLocalPlaylist', 'pendingPlaylistId', 'setPendingPlaylistId', 'playlistsSelectedId', 'setPlaylistsSelectedId', 'playlistsSelectedLocalId', 'setPlaylistsSelectedLocalId', 'offlinePlaylists', 'offlineSync', 'offlineTracks', 'downloadPlaylistOffline', 'removePlaylistOffline', 'playlistFolders', 'createFolder', 'renameFolder', 'deleteFolder', 'movePlaylistsToFolder')
  const canEdit = !!(account?.is_editor || account?.is_administrator)

  const [showLiked, setShowLiked] = useState(false)
  const [detail, setDetail] = useState<PlaylistDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Create / rename
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')

  // Context menus
  const [trackMenu, setTrackMenu] = useState<SongContextMenuState | null>(null)
  const [cardMenu, setCardMenu] = useState<CardMenuState | null>(null)
  const cardMenuRef = useRef<HTMLDivElement>(null)
  const [cardMenuPos, setCardMenuPos] = useState({ left: 0, top: 0 })

  // Re-clamp the card menu against the actual rendered box each time its
  // content changes size (e.g. the "Add all to playlist" submenu opening) —
  // the initial x/y guess from the click is otherwise stale and the box can
  // render partly off-screen or oddly stretched.
  useLayoutEffect(() => {
    const el = cardMenuRef.current
    if (!cardMenu || !el) return
    const rect = el.getBoundingClientRect()
    const left = Math.max(8, Math.min(cardMenu.x, window.innerWidth - rect.width - 8))
    const top = Math.max(8, Math.min(cardMenu.y, window.innerHeight - rect.height - 8))
    setCardMenuPos(prev => (prev.left === left && prev.top === top ? prev : { left, top }))
  }, [cardMenu])

  // Multi-select of playlists in the library grid — ctrl/cmd-click a card to
  // toggle it, mirroring the file browser's selection model (ApiFilesView).
  // Keyed as "api:<id>" / "local:<id>" since both id spaces are numeric and
  // could otherwise collide.
  const [plSelectMode, setPlSelectMode] = useState(false)
  const [selectedPlaylistKeys, setSelectedPlaylistKeys] = useState<Set<string>>(new Set())
  const [plBulkMenu, setPlBulkMenu] = useState<{ x: number; y: number; showPlaylists?: boolean; showFolders?: boolean } | null>(null)
  const [showPlBulkAddMenu, setShowPlBulkAddMenu] = useState(false)

  // ── Playlist folders ──────────────────────────────────────────────────────
  // Which folders are expanded in the library grid (UI-only, not persisted).
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [folderMenu, setFolderMenu] = useState<{ folder: PlaylistFolder; x: number; y: number; renaming?: boolean; renameVal?: string } | null>(null)
  const toggleFolderExpanded = (id: string): void => setExpandedFolders(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })

  // Multi-select of tracks within an open playlist — mirrors the Tracker's
  // bulk-select (ApiTrackerView). Keyed by track.id (Track has a string id;
  // the numeric songId is derived when needed for playlist/remove ops).
  const [selectMode, setSelectMode] = useState(false)
  const [selectedTracks, setSelectedTracks] = useState<Map<string, Track>>(new Map())
  const [showBulkPlaylists, setShowBulkPlaylists] = useState(false)
  const [bulkRemoving, setBulkRemoving] = useState(false)
  const [localRenaming, setLocalRenaming] = useState(false)
  const [localRenameVal, setLocalRenameVal] = useState('')
  const [showAddAllMenu, setShowAddAllMenu] = useState(false)
  const addAllMenuRef = useRef<HTMLDivElement>(null)
  // The open-playlist hero's "⋯" menu (replaces the old cluster of loose
  // action buttons next to Play/Shuffle).
  const [showHeroMenu, setShowHeroMenu] = useState(false)
  const heroMenuRef = useRef<HTMLDivElement>(null)
  const heroBtnRef = useRef<HTMLButtonElement>(null)

  // Drag-to-reorder
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)

  // Sort + search
  const [sort, setSort] = useState<SortState>({ field: 'default', dir: 'asc' })
  const [search, setSearch] = useState('')

  // Compact view — same grouping as the Tracker's (see lib/compactGroups.ts):
  // collapses tracks sharing a version_title into one row. Uses the
  // playlist-scoped groupItemsByVersion since `tracks` here is already the
  // playlist's full, unpaginated list — no need to ask juicewrldapi's
  // /versions/ table for every group app-wide like the Tracker has to.
  const [compactView, setCompactView] = useState(false)
  const [compactGroups, setCompactGroups] = useState<CompactGroup<Track>[]>([])
  const [loadingCompact, setLoadingCompact] = useState(false)
  const { expanded: expandedGroups, toggle: toggleGroupExpanded, clear: clearExpandedGroups } = useExpandedGroups()

  // Zip / share / bulk-add
  const [zipState, setZipState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [shareCopied, setShareCopied] = useState(false)
  const [togglingPublic, setTogglingPublic] = useState(false)
  const [addingAll, setAddingAll] = useState(false)
  const [isSharedView, setIsSharedView] = useState(false)
  const [importState, setImportState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  // Song info modal
  const [infoSong, setInfoSong] = useState<JWApiSong | null>(null)

  // Cover upload
  const coverInputRef = useRef<HTMLInputElement>(null)
  const [coverUploading, setCoverUploading] = useState(false)
  // Cover is fetched separately so tracks render without waiting for it
  type CoverData = { cover_image?: string | null; cover_image_url?: string | null }
  const [coverData, setCoverData] = useState<CoverData | null>(null)
  const [coverLoading, setCoverLoading] = useState(false)
  const [coverImgError, setCoverImgError] = useState(false)

  // Async cover thumbnails for the grid (keyed by playlist id)
  const [covers, setCovers] = useState<Record<number, string | null>>({})
  const [mosaicImages, setMosaicImages] = useState<Record<number, string[]>>({})
  const coversLoadedRef = useRef<Set<number>>(new Set())

  // Description editing
  const [editingDesc, setEditingDesc] = useState(false)
  const [descValue, setDescValue] = useState('')

  // Playlist membership cache: playlistId → Set<songId>
  const membershipCache = useRef<Map<number, Set<number>>>(new Map())

  // Race-condition guard: each loadDetail call gets a generation ID; stale responses are discarded
  const loadGen = useRef(0)

  // ── Async cover loading for grid ─────────────────────────────────────────
  useEffect(() => {
    const unloaded = playlists.filter(p => !coversLoadedRef.current.has(p.id))
    if (!unloaded.length) return
    unloaded.forEach(p => coversLoadedRef.current.add(p.id))

    const CONCURRENCY = 4
    let idx = 0
    const run = async (): Promise<void> => {
      while (idx < unloaded.length) {
        const p = unloaded[idx++]
        await userApi.getPlaylistCover(p.id)
          .then(c => {
            const url = c.cover_image_url ?? c.cover_image ?? null
            setCovers(prev => ({ ...prev, [p.id]: url }))
            if (c.trackImages.length) setMosaicImages(prev => ({ ...prev, [p.id]: c.trackImages }))
          })
          .catch(() => setCovers(prev => ({ ...prev, [p.id]: null })))
      }
    }
    const workers = Array.from({ length: Math.min(CONCURRENCY, unloaded.length) }, run)
    Promise.all(workers).catch(() => undefined)
  }, [playlists])

  // ── Derived data — ALL hooks at top level, no conditionals ────────────────

  const summary = useMemo(() => playlists.find(p => p.id === selectedId), [playlists, selectedId])
  const tracks: Track[] = useMemo(
    () => detail ? detail.items.map(it => userApi.liteSongToTrack(it.song)) : [],
    [detail]
  )
  const otherPlaylists = useMemo(() => playlists.filter(p => p.id !== selectedId), [playlists, selectedId])
  const dragEnabled = sort.field === 'default' && !search.trim()

  const displayTracks = useMemo(() => {
    let result = tracks
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q))
    }
    if (sort.field !== 'default') {
      result = [...result].sort((a, b) => {
        let cmp = 0
        if (sort.field === 'title') cmp = a.title.localeCompare(b.title)
        else if (sort.field === 'artist') cmp = a.artist.localeCompare(b.artist)
        else if (sort.field === 'duration') cmp = (a.duration || 0) - (b.duration || 0)
        return sort.dir === 'asc' ? cmp : -cmp
      })
    }
    return result
  }, [tracks, search, sort])

  // Identity → original index, replacing the per-row tracks.indexOf() that
  // made rendering the detail list O(n²). displayTracks elements are the same
  // object references as tracks entries, so identity keys are safe.
  const trackIndexOf = useMemo(() => new Map(tracks.map((t, i) => [t, i])), [tracks])

  // ── Detail track-list virtualization ───────────────────────────────────────
  // Large playlists rendered every row (each with decoded album art) at once.
  // Element-state refs (not RefObjects) because the detail view mounts long
  // after this component does — see useVirtualWindowEl.
  const [listScrollEl, setListScrollEl] = useState<HTMLDivElement | null>(null)
  const [listContentEl, setListContentEl] = useState<HTMLDivElement | null>(null)
  const TRACK_ROW_H = 56 // px-4 py-2 row wrapping 40px album art
  const { start: rowStart, end: rowEnd, totalHeight: rowsTotalHeight } =
    useVirtualWindowEl(listScrollEl, listContentEl, displayTracks.length, TRACK_ROW_H)

  // groupItemsByVersion doesn't know about the search box, so without this
  // typing a query while compact view is active would just do nothing.
  const filteredCompactGroups = useMemo(
    () => filterCompactGroups(compactGroups, search, t => `${t.title} ${t.artist}`),
    [compactGroups, search]
  )

  // ── Effects ────────────────────────────────────────────────────────────────

  // Populate membership cache when a detail loads
  useEffect(() => {
    if (detail) {
      membershipCache.current.set(detail.id, new Set(detail.items.map(i => i.song.id)))
    }
  }, [detail])

  useEffect(() => {
    if (!compactView || !versionsEnabled) { setCompactGroups([]); return }
    let cancelled = false
    setLoadingCompact(true)
    groupItemsByVersion(tracks, t => userApi.trackIdToSongId(t.id) ?? -1).then(groups => {
      if (!cancelled) { setCompactGroups(groups); setLoadingCompact(false) }
    })
    return () => { cancelled = true }
  }, [compactView, tracks])

  // Load local library so playlist tracks resolve
  useEffect(() => { loadLibrary() }, [])

  // Listen for sidebar "Playlists" re-click → go back to library
  useEffect(() => {
    const h = () => { setSelectedId(null); setLocalSelectedId(null); setRenaming(false); setSearch(''); setSort({ field: 'default', dir: 'asc' }); setIsSharedView(false) }
    window.addEventListener('playlists:back', h)
    return () => window.removeEventListener('playlists:back', h)
  }, [])

  // Auto-open playlist from URL params (e.g. /playlists?id=123&view=shared)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('id')
    const view = params.get('view')
    if (id) { setSelectedId(Number(id)) }
    if (view === 'shared') { setIsSharedView(true) }
  }, [])

  // Open a playlist requested from the sidebar's expandable playlist list.
  // A store field (not the URL-param effect above) is needed here because it
  // has to work even when this component is already mounted — the URL effect
  // only runs once, on mount.
  useEffect(() => {
    if (pendingPlaylistId == null) return
    setSelectedId(pendingPlaylistId)
    setIsSharedView(false)
    setPendingPlaylistId(null)
  }, [pendingPlaylistId, setPendingPlaylistId])

  // Close menus on outside click
  useEffect(() => {
    if (!trackMenu && !cardMenu && !showAddAllMenu && !plBulkMenu && !folderMenu) return
    const h = () => { setTrackMenu(null); setCardMenu(null); setShowAddAllMenu(false); setPlBulkMenu(null); setFolderMenu(null) }
    setTimeout(() => window.addEventListener('click', h), 0)
    return () => window.removeEventListener('click', h)
  }, [trackMenu, cardMenu, showAddAllMenu, plBulkMenu, folderMenu])


  const loadDetail = useCallback(async (id: number, shared = false) => {
    const gen = ++loadGen.current
    // A cached cover renders immediately (no null/spinner flash) instead of
    // waiting on a network round trip for a playlist we've already opened.
    const cached = userApi.peekPlaylistCover(id)
    if (cached) {
      setCoverImgError(false)
      setCoverData({ cover_image: cached.cover_image, cover_image_url: cached.cover_image_url })
      setCoverLoading(false)
    } else {
      setCoverData(null)
      setCoverLoading(true)
    }
    // A cached detail (tracks + metadata) renders instantly too — then we
    // still refetch in the background to pick up changes made elsewhere,
    // swapping in the fresh result without ever showing a loading spinner.
    const cachedDetail = userApi.peekPlaylistDetail(id)
    if (cachedDetail) {
      setDetail(cachedDetail)
      setLoadingDetail(false)
    } else {
      setLoadingDetail(true)
    }
    try {
      const result = shared ? await userApi.getPublicPlaylist(id) : await userApi.getPlaylist(id)
      if (gen !== loadGen.current) return
      setDetail(result)
      setLoadingDetail(false)
      if (!cached) {
        // Load cover separately so tracks render immediately
        const coverFetch = shared ? userApi.getPublicPlaylistCover(id) : userApi.getPlaylistCover(id)
        coverFetch.then(c => {
          if (gen !== loadGen.current) return
          setCoverImgError(false)
          setCoverData({ cover_image: c.cover_image, cover_image_url: c.cover_image_url })
          setCoverLoading(false)
        }).catch(() => { if (gen === loadGen.current) setCoverLoading(false) })
      }
    } catch {
      if (gen === loadGen.current && !cachedDetail) setDetail(null)
    } finally {
      if (gen === loadGen.current) setLoadingDetail(false)
    }
  }, [])

  useEffect(() => {
    if (selectedId != null) loadDetail(selectedId, isSharedView)
    else setDetail(null)
  }, [selectedId, loadDetail, isSharedView])

  // Reset sort/search/infoSong/editing when switching playlists
  useEffect(() => {
    setSort({ field: 'default', dir: 'asc' })
    setSearch('')
    setInfoSong(null)
    setEditingDesc(false)
    setDescValue('')
    setCoverImgError(false)
    setSelectMode(false)
    setSelectedTracks(new Map())
    setShowBulkPlaylists(false)
    setShowHeroMenu(false)
    setShowAddAllMenu(false)
  }, [selectedId])

  // Deselecting the last track drops out of select mode on its own (same as
  // the Tracker), so there's no separate "Cancel" needed — Escape works too.
  useEffect(() => {
    if (selectMode && selectedTracks.size === 0) setSelectMode(false)
  }, [selectMode, selectedTracks])

  useEffect(() => {
    if (!selectMode) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') { setSelectMode(false); setSelectedTracks(new Map()) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectMode])

  // ── Handlers ───────────────────────────────────────────────────────────────

  const createPlaylist = async () => {
    const name = newName.trim(); if (!name) return
    try { await userApi.createPlaylist(name); setNewName(''); setCreating(false); await refreshPlaylists() } catch {}
  }

  const deleteSelected = async () => {
    if (selectedId == null) return
    try { await userApi.deletePlaylist(selectedId); setSelectedId(null); await refreshPlaylists() } catch {}
  }

  const renameSelected = async () => {
    if (selectedId == null) return
    const name = renameValue.trim(); if (!name) return
    try {
      const u = await userApi.renamePlaylist(selectedId, name)
      setDetail(u)
      setRenaming(false)
      await refreshPlaylists()
    } catch {}
  }

  // Optimistic remove — no loading flash
  const removeTrack = useCallback(async (songId: number) => {
    if (selectedId == null) return
    setDetail(prev => prev ? { ...prev, items: prev.items.filter(i => i.song.id !== songId) } : null)
    membershipCache.current.get(selectedId)?.delete(songId)
    try { await userApi.removeFromPlaylist(selectedId, songId); await refreshPlaylists() }
    catch { await loadDetail(selectedId) }
  }, [selectedId, loadDetail, refreshPlaylists])

  // ── Multi-select bulk actions ─────────────────────────────────────────────
  const toggleTrackSelect = useCallback((track: Track) => {
    setSelectMode(true)
    setSelectedTracks(prev => {
      const next = new Map(prev)
      if (next.has(track.id)) next.delete(track.id)
      else next.set(track.id, track)
      return next
    })
  }, [])

  const exitSelectMode = useCallback(() => {
    setSelectMode(false)
    setSelectedTracks(new Map())
    setShowBulkPlaylists(false)
  }, [])

  const selectedTrackList = useMemo(() => [...selectedTracks.values()], [selectedTracks])

  const bulkAddToQueue = useCallback(() => {
    selectedTrackList.filter(t => t.path).forEach(t => addToQueue(t))
    exitSelectMode()
  }, [selectedTrackList, addToQueue, exitSelectMode])

  const bulkAddToPlaylist = useCallback(async (targetId: number) => {
    const ids = selectedTrackList
      .map(t => (t.id ? userApi.trackIdToSongId(t.id) : null))
      .filter((id): id is number => id != null && id > 0)
    if (!ids.length) return
    setShowBulkPlaylists(false)
    await Promise.all(ids.map(id => userApi.addToPlaylist(targetId, id).catch(() => {})))
    const targetSet = membershipCache.current.get(targetId) ?? new Set<number>()
    ids.forEach(id => targetSet.add(id))
    membershipCache.current.set(targetId, targetSet)
    await refreshPlaylists()
    useStore.getState().autoDownloadIfOffline(targetId, ids)
    exitSelectMode()
  }, [selectedTrackList, refreshPlaylists, exitSelectMode])

  // Remove every selected track in one pass, then refresh once (rather than
  // per-track like removeTrack) — otherwise a large selection fires a refresh
  // storm. Optimistically drops them from the open detail first.
  const bulkRemove = useCallback(async () => {
    if (selectedId == null) return
    const ids = selectedTrackList
      .map(t => (t.id ? userApi.trackIdToSongId(t.id) : null))
      .filter((id): id is number => id != null && id > 0)
    if (!ids.length) return
    setBulkRemoving(true)
    const idSet = new Set(ids)
    setDetail(prev => prev ? { ...prev, items: prev.items.filter(i => !idSet.has(i.song.id)) } : null)
    ids.forEach(id => membershipCache.current.get(selectedId)?.delete(id))
    try {
      await Promise.all(ids.map(id => userApi.removeFromPlaylist(selectedId, id)))
      await refreshPlaylists()
    } catch { await loadDetail(selectedId) }
    setBulkRemoving(false)
    exitSelectMode()
  }, [selectedId, selectedTrackList, refreshPlaylists, loadDetail, exitSelectMode])

  // ── Multi-select of playlists (library grid) ──────────────────────────────
  const togglePlaylistSelect = useCallback((key: string) => {
    setPlSelectMode(true)
    setSelectedPlaylistKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const exitPlaylistSelectMode = useCallback(() => {
    setPlSelectMode(false)
    setSelectedPlaylistKeys(new Set())
    setShowPlBulkAddMenu(false)
  }, [])

  // Deselecting the last playlist drops out of select mode on its own.
  useEffect(() => {
    if (plSelectMode && selectedPlaylistKeys.size === 0) setPlSelectMode(false)
  }, [plSelectMode, selectedPlaylistKeys])

  useEffect(() => {
    if (!plSelectMode) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') exitPlaylistSelectMode() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [plSelectMode, exitPlaylistSelectMode])

  const [bulkDeletingPlaylists, setBulkDeletingPlaylists] = useState(false)

  const bulkDeletePlaylists = useCallback(async () => {
    const keys = [...selectedPlaylistKeys]
    if (!keys.length) return
    setBulkDeletingPlaylists(true)
    const apiIds = keys.filter(k => k.startsWith('api:')).map(k => Number(k.slice(4)))
    const localIds = keys.filter(k => k.startsWith('local:')).map(k => k.slice(6))
    try {
      await Promise.all(apiIds.map(id => userApi.deletePlaylist(id).catch(() => {})))
    } finally {
      localIds.forEach(id => deleteLocalPlaylist(id))
      if (selectedId != null && apiIds.includes(selectedId)) setSelectedId(null)
      if (localSelectedId != null && localIds.includes(localSelectedId)) setLocalSelectedId(null)
      await refreshPlaylists()
      setBulkDeletingPlaylists(false)
      exitPlaylistSelectMode()
    }
  }, [selectedPlaylistKeys, deleteLocalPlaylist, refreshPlaylists, selectedId, localSelectedId, setSelectedId, setLocalSelectedId, exitPlaylistSelectMode])

  // "Add to playlist" only makes sense when every selected playlist is the
  // same kind, since a synced (api) target can't hold local-only tracks and
  // vice versa. Mixed selections simply don't offer the action.
  const selectedPlaylistKind = useMemo(() => {
    const kinds = new Set([...selectedPlaylistKeys].map(k => k.split(':')[0]))
    return kinds.size === 1 ? ([...kinds][0] as 'api' | 'local') : null
  }, [selectedPlaylistKeys])

  const [bulkAddingPlaylists, setBulkAddingPlaylists] = useState(false)

  const bulkAddPlaylistsTo = useCallback(async (target: { kind: 'api'; id: number } | { kind: 'local'; id: string }) => {
    const keys = [...selectedPlaylistKeys]
    setBulkAddingPlaylists(true)
    try {
      if (target.kind === 'api') {
        const srcIds = keys.filter(k => k.startsWith('api:')).map(k => Number(k.slice(4))).filter(id => id !== target.id)
        for (const srcId of srcIds) {
          const srcDetail = await userApi.getPlaylist(srcId).catch(() => null)
          if (!srcDetail) continue
          await Promise.all(srcDetail.items.map(item => userApi.addToPlaylist(target.id, item.song.id).catch(() => {})))
        }
        await refreshPlaylists()
      } else {
        const srcIds = keys.filter(k => k.startsWith('local:')).map(k => k.slice(6)).filter(id => id !== target.id)
        const targetPl = localPlaylists.find(p => p.id === target.id)
        const existing = new Set(targetPl?.trackIds ?? [])
        for (const srcId of srcIds) {
          const src = localPlaylists.find(p => p.id === srcId)
          if (!src) continue
          src.trackIds.filter(id => !existing.has(id)).forEach(id => { existing.add(id); addToLocalPlaylist(target.id, id) })
        }
      }
    } finally {
      setBulkAddingPlaylists(false)
      setShowPlBulkAddMenu(false)
      setPlBulkMenu(null)
      exitPlaylistSelectMode()
    }
  }, [selectedPlaylistKeys, refreshPlaylists, localPlaylists, addToLocalPlaylist, exitPlaylistSelectMode])

  const handleSort = (field: SortField) => {
    setSort(prev => {
      if (prev.field === field) {
        if (prev.dir === 'asc') return { field, dir: 'desc' }
        return { field: 'default', dir: 'asc' }
      }
      return { field, dir: 'asc' }
    })
  }

  const handleDrop = useCallback(async (toIdx: number) => {
    if (dragIdx === null || !detail || selectedId == null) return
    const from = dragIdx
    setDragIdx(null); setDropIdx(null)
    if (from === toIdx) return
    const newItems = [...detail.items]
    const [removed] = newItems.splice(from, 1)
    newItems.splice(toIdx, 0, removed)
    setDetail({ ...detail, items: newItems })
    try {
      const updated = await userApi.reorderPlaylist(selectedId, newItems.map(it => it.song.id))
      setDetail(updated)
    } catch { await loadDetail(selectedId) }
  }, [dragIdx, detail, selectedId, loadDetail])

  const openSongInfo = useCallback(async (songId: number) => {
    try { setInfoSong(await apiFetch<JWApiSong>(`/songs/${songId}/`)) } catch {}
  }, [])

  const handleCoverUpload = useCallback(async (file: File) => {
    if (!selectedId || coverUploading) return
    setCoverUploading(true)
    try {
      const result = await userApi.uploadPlaylistCover(selectedId, file)
      setCoverImgError(false)
      setCoverData({ cover_image: result.cover_image, cover_image_url: result.cover_image_url })
      setCovers(prev => ({ ...prev, [selectedId]: result.cover_image_url ?? result.cover_image ?? null }))
      await refreshPlaylists()
    } catch {}
    setCoverUploading(false)
  }, [selectedId, coverUploading, refreshPlaylists])

  const handleRemoveCover = useCallback(async () => {
    if (!selectedId) return
    setCoverData(null) // optimistic clear
    setCovers(prev => ({ ...prev, [selectedId]: null }))
    try {
      await userApi.removePlaylistCover(selectedId)
      await refreshPlaylists()
    } catch {
      // restore on failure by re-fetching
      const c = await userApi.getPlaylistCover(selectedId).catch(() => null)
      if (c) setCoverData({ cover_image: c.cover_image, cover_image_url: c.cover_image_url })
    }
  }, [selectedId, refreshPlaylists])

  const saveDescription = useCallback(async () => {
    if (!selectedId) return
    setEditingDesc(false)
    try {
      const updated = await userApi.updatePlaylist(selectedId, { description: descValue })
      setDetail(updated)
      await refreshPlaylists()
    } catch {}
  }, [selectedId, descValue, refreshPlaylists])

  const isMember = (playlistId: number, songId: number): boolean | null => {
    const cache = membershipCache.current.get(playlistId)
    if (!cache) return null
    return cache.has(songId)
  }

  const handleZipDownload = useCallback(async (trackList: Track[], name: string) => {
    if (zipState === 'loading') return
    const paths = trackList.map(t => t.path).filter(Boolean)
    if (!paths.length) return
    setZipState('loading')
    try {
      const res = await fetch(`${JWAPI_BASE}/files/zip-selection/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths }),
      })
      if (!res.ok) throw new Error()
      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('zip') || contentType.includes('octet-stream')) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = `${name}.zip`; a.click()
        URL.revokeObjectURL(url)
      } else {
        const data = await res.json()
        if (data.download_url) { const a = document.createElement('a'); a.href = data.download_url; a.download = `${name}.zip`; a.click() }
      }
      setZipState('done')
    } catch { setZipState('error') }
    setTimeout(() => setZipState('idle'), 3000)
  }, [zipState])

  const offlineKey = selectedId != null ? `api-${selectedId}` : null
  const offlineEntry = offlineKey ? offlinePlaylists[offlineKey] : undefined
  const offlineSyncState = offlineKey ? offlineSync[offlineKey] : undefined
  const isOffline = !!offlineEntry

  const handleToggleOffline = useCallback(async () => {
    if (!offlineKey || !detail) return
    if (isOffline) {
      await removePlaylistOffline(offlineKey)
    } else {
      await downloadPlaylistOffline(offlineKey, detail.name, detail.items.map((i) => i.song.id))
    }
  }, [offlineKey, isOffline, detail, downloadPlaylistOffline, removePlaylistOffline])

  const handleTogglePublic = useCallback(async () => {
    if (!selectedId || !detail) return
    setTogglingPublic(true)
    try {
      const updated = await userApi.updatePlaylist(selectedId, { is_public: !detail.is_public })
      setDetail(updated)
    } catch (e) { console.error('toggle public failed', e) }
    finally { setTogglingPublic(false) }
  }, [selectedId, detail])

  const handleShare = useCallback(async () => {
    if (!selectedId || !detail) return
    try {
      // Ensure playlist is public before sharing
      if (!detail.is_public) {
        const updated = await userApi.updatePlaylist(selectedId, { is_public: true })
        setDetail(updated)
      }
      await navigator.clipboard.writeText(`${window.location.origin}/playlists?id=${selectedId}&view=shared`)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2500)
    } catch {}
  }, [selectedId, detail])

  const handleAddAllTo = useCallback(async (targetId: number, srcDetail: PlaylistDetail) => {
    setAddingAll(true)
    const eligible = srcDetail.items.filter(item => !['recording_session', 'unsurfaced'].includes(item.song.category))
    await Promise.all(eligible.map(item => userApi.addToPlaylist(targetId, item.song.id).catch(() => {})))
    const targetSet = membershipCache.current.get(targetId) ?? new Set<number>()
    srcDetail.items.forEach(i => targetSet.add(i.song.id))
    membershipCache.current.set(targetId, targetSet)
    setAddingAll(false)
    await refreshPlaylists()
    useStore.getState().autoDownloadIfOffline(targetId, eligible.map(item => item.song.id))
  }, [refreshPlaylists])

  const handleImportPlaylist = useCallback(async () => {
    if (!detail) return
    setImportState('loading')
    try {
      const allowedIds = detail.items
        .filter(item => !['recording_session', 'unsurfaced'].includes(item.song.category))
        .map(item => item.song.id)

      // Request 1: create playlist with name + description + song_ids in one shot
      const newPl = await userApi.createPlaylist(detail.name, {
        description: detail.description,
        song_ids: allowedIds,
      })

      // Request 2 (optional): cover — use existing base64 directly, or fetch from URL
      const b64 = coverData?.cover_image
      const url = coverData?.cover_image_url
      if (b64) {
        await userApi.setPlaylistCoverBase64(newPl.id, b64)
      } else if (url) {
        try {
          const res = await fetch(url)
          const blob = await res.blob()
          const file = new File([blob], 'cover.jpg', { type: blob.type || 'image/jpeg' })
          await userApi.uploadPlaylistCover(newPl.id, file)
        } catch { /* skip cover on CORS/network failure */ }
      }

      await refreshPlaylists()
      setImportState('done')
      setTimeout(() => setImportState('idle'), 2500)
    } catch {
      setImportState('error')
      setTimeout(() => setImportState('idle'), 2500)
    }
  }, [detail, coverData, refreshPlaylists])

  // ── Playlist card menu (shared by logged-in and logged-out views) ──────────

  // A default name for a folder made straight from a "Move to folder → New
  // folder" action, where there's no name field — unique so two quick creates
  // don't collide. The user can rename via the folder's ⋯ menu.
  const uniqueFolderName = (): string => {
    const taken = new Set(playlistFolders.map(f => f.name.toLowerCase()))
    if (!taken.has('new folder')) return 'New Folder'
    let n = 2
    while (taken.has(`new folder ${n}`)) n++
    return `New Folder ${n}`
  }

  // The "Move to folder" submenu body, shared by the single-card menus and the
  // bulk menu. `keys` is what gets filed; `onDone` closes the parent menu.
  const folderSubmenuItems = (keys: string[], onDone: () => void): JSX.Element => {
    const currentFolderId = keys.length === 1 ? (folderOfPlaylist(playlistFolders, keys[0])?.id ?? null) : null
    return (
      <div className="border-t border-b border-[var(--border)] max-h-44 overflow-y-auto">
        {playlistFolders.map(f => (
          <button
            key={f.id}
            onClick={() => { movePlaylistsToFolder(keys, f.id); onDone() }}
            className="w-full flex items-center gap-2 pl-9 pr-3.5 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-overlay transition-colors"
          >
            <Folder size={13} className="text-text-muted shrink-0" />
            <span className="flex-1 truncate text-left">{f.name}</span>
            {currentFolderId === f.id && <Check size={12} className="text-accent shrink-0" />}
          </button>
        ))}
        {currentFolderId && (
          <button
            onClick={() => { movePlaylistsToFolder(keys, null); onDone() }}
            className="w-full flex items-center gap-2 pl-9 pr-3.5 py-2 text-sm text-text-secondary hover:text-red-400 transition-colors"
          >
            <FolderMinus size={13} className="shrink-0" /> Remove from folder
          </button>
        )}
        <button
          onClick={() => { const id = createFolder(uniqueFolderName(), keys); if (id) setExpandedFolders(prev => new Set(prev).add(id)); onDone() }}
          className="w-full flex items-center gap-2 pl-9 pr-3.5 py-2 text-sm text-accent hover:bg-surface-overlay transition-colors"
        >
          <FolderPlus size={13} className="shrink-0" /> New folder…
        </button>
      </div>
    )
  }

  // The right-click/⋯ card menu, rendered into a body portal. Defined before
  // the early returns because the logged-out local-playlists view sets the
  // same cardMenu state — previously nothing rendered it there, so the menu
  // silently never appeared.
  const renderCardMenu = (): React.ReactNode => cardMenu && createPortal(
    <div
      ref={cardMenuRef}
      className="fixed z-50 bg-surface border border-[var(--border)] rounded-xl shadow-2xl py-1 min-w-[210px]"
      style={{ left: cardMenuPos.left, top: cardMenuPos.top }}
      onClick={e => e.stopPropagation()}
    >
      {cardMenu.renaming ? (
        /* ── Inline rename input (shared by both kinds) ── */
        <div className="px-3 py-2 flex gap-2" onClick={e => e.stopPropagation()}>
          <input
            autoFocus
            value={cardMenu.renameVal ?? cardMenu.playlist.name}
            onChange={e => setCardMenu(prev => prev ? { ...prev, renameVal: e.target.value } : null)}
            onKeyDown={async e => {
              if (e.key === 'Enter') {
                const val = cardMenu.renameVal?.trim() || cardMenu.playlist.name
                if (cardMenu.kind === 'local') {
                  renameLocalPlaylist(cardMenu.playlist.id, val)
                } else {
                  await userApi.renamePlaylist(cardMenu.playlist.id, val)
                  await refreshPlaylists()
                }
                setCardMenu(null)
              } else if (e.key === 'Escape') {
                setCardMenu(prev => prev ? { ...prev, renaming: false } : null)
              }
            }}
            className="flex-1 bg-surface-overlay rounded-lg px-2.5 py-1.5 text-sm text-text-primary focus:outline-none border border-[var(--border)]"
          />
          <button
            onClick={async () => {
              const val = cardMenu.renameVal?.trim() || cardMenu.playlist.name
              if (cardMenu.kind === 'local') {
                renameLocalPlaylist(cardMenu.playlist.id, val)
              } else {
                await userApi.renamePlaylist(cardMenu.playlist.id, val)
                await refreshPlaylists()
              }
              setCardMenu(null)
            }}
            className="px-2.5 py-1.5 rounded-lg bg-accent text-white text-xs font-medium"
          >Save</button>
        </div>
      ) : cardMenu.kind === 'local' ? (
        /* ── Local playlist menu ── */
        <>
          <MenuItem icon={Play} label="Open" onClick={() => { setLocalSelectedId(cardMenu.playlist.id); setCardMenu(null) }} />
          <MenuItem
            icon={Shuffle}
            label="Play all"
            onClick={() => {
              const tracks = cardMenu.playlist.trackIds.map(id => libraryTracks.find(t => t.id === id)).filter(Boolean) as LibraryTrack[]
              const q = tracks.map(libTrackToTrack)
              if (q.length) playCollection(q)
              setCardMenu(null)
            }}
          />
          <MenuItem
            icon={ListEnd}
            label="Add all to queue"
            onClick={() => {
              cardMenu.playlist.trackIds.map(id => libraryTracks.find(t => t.id === id)).filter(Boolean).map(t => libTrackToTrack(t as LibraryTrack)).forEach(t => addToQueue(t))
              setCardMenu(null)
            }}
          />
          <div className="border-t border-[var(--border)] my-1" />
          <MenuItem icon={Pencil} label="Rename" onClick={() => setCardMenu(prev => prev ? { ...prev, renaming: true, renameVal: prev.playlist.name } : null)} />
          <button
            className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2 text-sm text-text-primary transition-colors hover:bg-surface-overlay"
            onClick={e => { e.stopPropagation(); setCardMenu(prev => prev ? { ...prev, showPlaylists: !prev.showPlaylists } : null) }}
          >
            <span className="flex items-center gap-2.5"><FolderInput size={14} className="text-text-muted" />Add all to playlist</span>
            <span className="text-text-muted text-xs">›</span>
          </button>
          {cardMenu.showPlaylists && (
            <div className="border-t border-[var(--border)] max-h-40 overflow-y-auto">
              {localPlaylists.filter(p => p.id !== cardMenu.playlist.id).length === 0 ? (
                <p className="px-3.5 py-2 text-xs text-text-muted">No other playlists</p>
              ) : localPlaylists.filter(p => p.id !== cardMenu.playlist.id).map(p => (
                <button key={p.id} onClick={() => {
                  const src = cardMenu.playlist as LocalPlaylist
                  setCardMenu(null)
                  src.trackIds.filter(id => !p.trackIds.includes(id)).forEach(id => addToLocalPlaylist(p.id, id))
                }} className="w-full text-left px-3.5 py-2 text-sm text-text-primary hover:bg-surface-overlay transition-colors truncate">
                  {p.name}
                </button>
              ))}
            </div>
          )}
          <button
            className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2 text-sm text-text-primary transition-colors hover:bg-surface-overlay"
            onClick={e => { e.stopPropagation(); setCardMenu(prev => prev ? { ...prev, showFolders: !prev.showFolders } : null) }}
          >
            <span className="flex items-center gap-2.5"><Folder size={14} className="text-text-muted" />Move to folder</span>
            <span className="text-text-muted text-xs">›</span>
          </button>
          {cardMenu.showFolders && folderSubmenuItems([`local:${cardMenu.playlist.id}`], () => setCardMenu(null))}
          <div className="border-t border-[var(--border)] my-1" />
          <MenuItem
            icon={Trash2}
            label="Delete playlist"
            destructive
            onClick={() => {
              deleteLocalPlaylist(cardMenu.playlist.id)
              if (localSelectedId === cardMenu.playlist.id) setLocalSelectedId(null)
              setCardMenu(null)
            }}
          />
        </>
      ) : (
        /* ── API playlist menu ── */
        <>
          <MenuItem icon={Play} label="Open" onClick={() => { setSelectedId(cardMenu.playlist.id); setCardMenu(null) }} />
          <MenuItem
            icon={Shuffle}
            label="Play all"
            onClick={async () => {
              const d = await userApi.getPlaylist(cardMenu.playlist.id)
              const tracks = d.items.map(i => userApi.liteSongToTrack(i.song))
              if (tracks.length) playCollection(tracks)
              setCardMenu(null)
            }}
          />
          <MenuItem
            icon={ListEnd}
            label="Add all to queue"
            onClick={async () => {
              const d = await userApi.getPlaylist(cardMenu.playlist.id)
              d.items.forEach(i => addToQueue(userApi.liteSongToTrack(i.song)))
              setCardMenu(null)
            }}
          />
          <MenuItem
            icon={Archive}
            label="Download as ZIP"
            onClick={async () => {
              const name = cardMenu.playlist.name
              const d = await userApi.getPlaylist(cardMenu.playlist.id)
              setCardMenu(null)
              handleZipDownload(d.items.map(i => userApi.liteSongToTrack(i.song)), name)
            }}
          />
          <div className="border-t border-[var(--border)] my-1" />
          <MenuItem
            icon={Link}
            label="Copy share link"
            onClick={async () => {
              try {
                const p = cardMenu.playlist as PlaylistSummary
                if (!p.is_public) { await userApi.updatePlaylist(p.id, { is_public: true }); await refreshPlaylists() }
                await navigator.clipboard.writeText(`${window.location.origin}/playlists?id=${p.id}&view=shared`)
              } catch {}
              setCardMenu(null)
            }}
          />
          <MenuItem
            icon={(cardMenu.playlist as PlaylistSummary).is_public ? Globe : Lock}
            label={(cardMenu.playlist as PlaylistSummary).is_public ? 'Make private' : 'Make public'}
            onClick={async () => {
              const p = cardMenu.playlist as PlaylistSummary
              await userApi.updatePlaylist(p.id, { is_public: !p.is_public })
              await refreshPlaylists()
              setCardMenu(null)
            }}
          />
          <div className="border-t border-[var(--border)] my-1" />
          <MenuItem icon={Pencil} label="Rename" onClick={() => setCardMenu(prev => prev ? { ...prev, renaming: true, renameVal: prev.playlist.name } : null)} />
          <button
            className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2 text-sm text-text-primary transition-colors hover:bg-surface-overlay"
            onClick={e => { e.stopPropagation(); setCardMenu(prev => prev ? { ...prev, showPlaylists: !prev.showPlaylists } : null) }}
          >
            <span className="flex items-center gap-2.5"><FolderInput size={14} className="text-text-muted" />Add all to playlist</span>
            <span className="text-text-muted text-xs">›</span>
          </button>
          {cardMenu.showPlaylists && (
            <div className="border-t border-[var(--border)] max-h-40 overflow-y-auto">
              {playlists.filter(p => p.id !== cardMenu.playlist.id).length === 0 ? (
                <p className="px-3.5 py-2 text-xs text-text-muted">No other playlists</p>
              ) : playlists.filter(p => p.id !== cardMenu.playlist.id).map(p => (
                <button key={p.id} onClick={async () => {
                  const srcId = cardMenu.playlist.id
                  setCardMenu(null)
                  const srcDetail = await userApi.getPlaylist(srcId)
                  await Promise.all(srcDetail.items.map(item => userApi.addToPlaylist(p.id, item.song.id).catch(() => {})))
                  await refreshPlaylists()
                  useStore.getState().autoDownloadIfOffline(p.id, srcDetail.items.map(item => item.song.id))
                }} className="w-full text-left px-3.5 py-2 text-sm text-text-primary hover:bg-surface-overlay transition-colors truncate">
                  {p.name}
                </button>
              ))}
            </div>
          )}
          <button
            className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2 text-sm text-text-primary transition-colors hover:bg-surface-overlay"
            onClick={e => { e.stopPropagation(); setCardMenu(prev => prev ? { ...prev, showFolders: !prev.showFolders } : null) }}
          >
            <span className="flex items-center gap-2.5"><Folder size={14} className="text-text-muted" />Move to folder</span>
            <span className="text-text-muted text-xs">›</span>
          </button>
          {cardMenu.showFolders && folderSubmenuItems([`api:${cardMenu.playlist.id}`], () => setCardMenu(null))}
          <div className="border-t border-[var(--border)] my-1" />
          <MenuItem
            icon={Trash2}
            label="Delete playlist"
            destructive
            onClick={async () => {
              const id = cardMenu.playlist.id
              setCardMenu(null)
              await userApi.deletePlaylist(id)
              if (selectedId === id) setSelectedId(null)
              await refreshPlaylists()
            }}
          />
        </>
      )}
    </div>,
    document.body
  )

  // ── Playlist cards, folders & folder menu (shared by both library views) ──
  // Defined before the early returns so the logged-out local-playlists view
  // renders the same tiles, folder sections, and menus as the main library.

  // Cover node for a card — the exact per-kind cover logic the grids used
  // inline, pulled out so folder members render an identical tile.
  const apiCoverNode = (p: PlaylistSummary): React.ReactNode => (
    covers[p.id] === undefined ? <div className="w-full h-full bg-surface-raised animate-pulse" />
      : covers[p.id] ? <img src={covers[p.id]!} alt={p.name} className="w-full h-full object-cover" onError={() => setCovers(prev => ({ ...prev, [p.id]: null }))} />
        : (() => {
          const imgs = mosaicImages[p.id] ?? []
          if (imgs.length >= 4) return (
            <div className="w-full h-full grid grid-cols-2" style={{ overflow: 'hidden', transform: 'translateZ(0)' }}>
              {imgs.map((url, i) => <img key={i} src={url} alt="" className="w-full h-full object-cover" style={{ aspectRatio: '1' }} />)}
            </div>
          )
          if (imgs.length > 0) return <img src={imgs[0]} alt="" className="w-full h-full object-cover" />
          return (
            <div className="w-full h-full bg-gradient-to-br from-accent/40 to-accent/10 flex items-center justify-center">
              <Music2 size={40} className="text-accent/50" />
            </div>
          )
        })()
  )

  const renderApiCard = (p: PlaylistSummary): JSX.Element => {
    const plKey = `api:${p.id}`
    const plSelected = selectedPlaylistKeys.has(plKey)
    return (
      <PlaylistCard
        key={p.id}
        name={p.name}
        subtitle={`${p.track_count} ${p.track_count === 1 ? 'track' : 'tracks'}`}
        cover={apiCoverNode(p)}
        selected={plSelected}
        selectMode={plSelectMode}
        onClick={e => {
          if (e.ctrlKey || e.metaKey) { togglePlaylistSelect(plKey); return }
          if (plSelectMode) { togglePlaylistSelect(plKey); return }
          setSelectedId(p.id)
        }}
        onContextMenu={e => {
          e.preventDefault(); e.stopPropagation()
          if (plSelectMode) {
            if (!plSelected) setSelectedPlaylistKeys(prev => new Set(prev).add(plKey))
            setPlBulkMenu({ x: e.clientX, y: e.clientY })
          } else {
            setCardMenu({ kind: 'api', playlist: p, x: e.clientX, y: e.clientY, showPlaylists: false })
          }
        }}
        onMenuButton={e => setCardMenu({ kind: 'api', playlist: p, x: e.clientX, y: e.clientY, showPlaylists: false })}
        onPlay={async () => {
          const d = await userApi.getPlaylist(p.id).catch(() => null)
          const trks = d ? d.items.map(i => userApi.liteSongToTrack(i.song)) : []
          if (trks.length) playCollection(trks)
        }}
      />
    )
  }

  const renderLocalCard = (lp: LocalPlaylist): JSX.Element => {
    const plKey = `local:${lp.id}`
    const plSelected = selectedPlaylistKeys.has(plKey)
    return (
      <PlaylistCard
        key={lp.id}
        name={lp.name}
        subtitle={`${lp.trackIds.length} ${lp.trackIds.length === 1 ? 'track' : 'tracks'}`}
        cover={lp.coverImage
          ? <img src={lp.coverImage} alt="" className="w-full h-full object-cover" />
          : <LocalPlaylistMosaic trackIds={lp.trackIds} className="w-full h-full" />}
        badge={<span className="flex items-center gap-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-md"><HardDrive size={9} /> Local</span>}
        selected={plSelected}
        selectMode={plSelectMode}
        onClick={e => {
          if (e.ctrlKey || e.metaKey) { togglePlaylistSelect(plKey); return }
          if (plSelectMode) { togglePlaylistSelect(plKey); return }
          setLocalSelectedId(lp.id)
        }}
        onContextMenu={e => {
          e.preventDefault(); e.stopPropagation()
          if (plSelectMode) {
            if (!plSelected) setSelectedPlaylistKeys(prev => new Set(prev).add(plKey))
            setPlBulkMenu({ x: e.clientX, y: e.clientY })
          } else {
            setCardMenu({ kind: 'local', playlist: lp, x: e.clientX, y: e.clientY, showPlaylists: false })
          }
        }}
        onMenuButton={e => setCardMenu({ kind: 'local', playlist: lp, x: e.clientX, y: e.clientY, showPlaylists: false })}
        onPlay={() => {
          const qt = lp.trackIds.map(id => libraryTracks.find(t => t.id === id)).filter((t): t is LibraryTrack => !!t).map(libTrackToTrack)
          if (qt.length) playCollection(qt)
        }}
      />
    )
  }

  // Folders group both kinds of playlist by their composite key. Resolve each
  // folder's members against the currently-loaded playlists (a member whose
  // playlist was deleted since simply drops out — see the prune-on-read note in
  // lib/playlistFolders) and render them in the folder's own key order. Logged
  // out, `playlists` is empty, so api: members drop out naturally and a folder
  // shows just its device-local playlists — membership itself is unaffected.
  const apiById = new Map(playlists.map(p => [p.id, p]))
  const localById = new Map(localPlaylists.map(lp => [lp.id, lp]))
  const folderMemberCards = (f: PlaylistFolder): JSX.Element[] => {
    const out: JSX.Element[] = []
    for (const key of f.playlistKeys) {
      const parsed = parsePlaylistKey(key)
      if (!parsed) continue
      if (parsed.kind === 'api') { const p = apiById.get(Number(parsed.id)); if (p) out.push(renderApiCard(p)) }
      else { const lp = localById.get(parsed.id); if (lp) out.push(renderLocalCard(lp)) }
    }
    return out
  }

  const foldered = allFolderedKeys(playlistFolders)
  const ungroupedApi = playlists.filter(p => !foldered.has(`api:${p.id}`))
  const ungroupedLocal = localPlaylists.filter(lp => !foldered.has(`local:${lp.id}`))

  /** The expandable Folders section. `onlyWithMembers` hides folders whose
   *  members can't be resolved in the current view — the logged-out library
   *  passes true so folders holding only synced playlists (invisible without
   *  an account) don't render as misleadingly "empty". */
  const renderFoldersSection = (onlyWithMembers: boolean): React.ReactNode => {
    const entries = playlistFolders
      .map(f => ({ f, memberCards: folderMemberCards(f) }))
      .filter(({ memberCards }) => !onlyWithMembers || memberCards.length > 0)
    if (entries.length === 0) return null
    return (
      <div className="mb-9">
        <h2 className="text-text-muted text-xs font-semibold uppercase tracking-widest mb-3">Folders</h2>
        <div className="space-y-3">
          {entries.map(({ f, memberCards }) => {
            const expanded = expandedFolders.has(f.id)
            return (
              <div key={f.id} className="rounded-2xl border border-[var(--border)] bg-surface-overlay/30 overflow-hidden">
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-overlay/60 transition-colors"
                  onClick={() => toggleFolderExpanded(f.id)}
                  onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setFolderMenu({ folder: f, x: e.clientX, y: e.clientY }) }}
                >
                  {expanded ? <FolderOpen size={20} className="text-accent shrink-0" /> : <Folder size={20} className="text-accent shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-text-primary text-sm font-semibold truncate">{f.name}</p>
                    <p className="text-text-muted text-xs">{memberCards.length} {memberCards.length === 1 ? 'playlist' : 'playlists'}</p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setFolderMenu({ folder: f, x: e.clientX, y: e.clientY }) }}
                    className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-raised transition-colors"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {expanded ? <ChevronUp size={16} className="text-text-muted shrink-0" /> : <ChevronDown size={16} className="text-text-muted shrink-0" />}
                </div>
                {expanded && (
                  <div className="px-4 pb-4 pt-1">
                    {memberCards.length === 0 ? (
                      <p className="text-text-muted text-sm py-3">This folder is empty. Right-click a playlist and choose “Move to folder” to add one.</p>
                    ) : (
                      <div className="grid gap-x-4 gap-y-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
                        {memberCards}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  /** Folder context menu (right-click a folder header / its ⋯ button) —
   *  a body portal, so it renders from either library view. */
  const renderFolderMenu = (): React.ReactNode => folderMenu && createPortal(
    <div
      className="fixed z-50 bg-surface border border-[var(--border)] rounded-xl shadow-2xl py-1 min-w-[200px]"
      style={{ left: Math.min(folderMenu.x, window.innerWidth - 220), top: Math.min(folderMenu.y, window.innerHeight - 170) }}
      onClick={e => e.stopPropagation()}
    >
      {folderMenu.renaming ? (
        <div className="px-3 py-2 flex gap-2">
          <input
            autoFocus
            value={folderMenu.renameVal ?? folderMenu.folder.name}
            onChange={e => setFolderMenu(prev => prev ? { ...prev, renameVal: e.target.value } : null)}
            onKeyDown={e => {
              if (e.key === 'Enter') { renameFolder(folderMenu.folder.id, folderMenu.renameVal ?? folderMenu.folder.name); setFolderMenu(null) }
              else if (e.key === 'Escape') setFolderMenu(prev => prev ? { ...prev, renaming: false } : null)
            }}
            className="flex-1 bg-surface-overlay rounded-lg px-2.5 py-1.5 text-sm text-text-primary focus:outline-none border border-[var(--border)]"
          />
          <button
            onClick={() => { renameFolder(folderMenu.folder.id, folderMenu.renameVal ?? folderMenu.folder.name); setFolderMenu(null) }}
            className="px-2.5 py-1.5 rounded-lg bg-accent text-white text-xs font-medium"
          >Save</button>
        </div>
      ) : (
        <>
          <MenuItem icon={Pencil} label="Rename folder" onClick={() => setFolderMenu(prev => prev ? { ...prev, renaming: true, renameVal: prev.folder.name } : null)} />
          <div className="border-t border-[var(--border)] my-1" />
          {/* Deleting a folder only ungroups its playlists — they return to
              the sections above, nothing is removed. */}
          <MenuItem icon={Trash2} label="Delete folder" destructive onClick={() => { deleteFolder(folderMenu.folder.id); setFolderMenu(null) }} />
        </>
      )}
    </div>,
    document.body
  )

  // ── Liked Songs ────────────────────────────────────────────────────────────

  if (showLiked) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-5 pt-4 shrink-0">
          <button onClick={() => setShowLiked(false)} className="flex items-center gap-1.5 text-text-muted hover:text-text-primary text-sm transition-colors">
            <ArrowLeft size={15} /> Playlists
          </button>
        </div>
        <LikedSongsView />
      </div>
    )
  }

  // ── Auth guard ─────────────────────────────────────────────────────────────────────────

  if (!account) {
    // show local playlists + login prompt even when not logged in
    if (localSelectedId !== null) {
      const localPl = localPlaylists.find(p => p.id === localSelectedId)
      if (!localPl) { setLocalSelectedId(null); return <div /> }
      const localTracks = localPl.trackIds.map(id => libraryTracks.find(t => t.id === id)).filter(Boolean) as LibraryTrack[]
      const localQTracks: Track[] = localTracks.map(libTrackToTrack)
      return (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto overflow-x-hidden">
          <div className="relative overflow-hidden px-6 pb-6 shrink-0">
            <HeroBackdrop src={localPl.coverImage ?? localTracks.map(t => libraryArt[t.id]).find(a => !!a) ?? null} />
            <div className="relative z-10 pt-5">
              <button onClick={() => setLocalSelectedId(null)} className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm transition-colors">
                <ArrowLeft size={15} /> Playlists
              </button>
            </div>
            <div className="relative z-10 flex gap-6 items-end pt-6">
              <div className="shrink-0 rounded-xl shadow-2xl overflow-hidden bg-surface-overlay flex items-center justify-center" style={{ width: 180, height: 180 }}>
                {localPl.coverImage
                  ? <img src={localPl.coverImage} alt="" className="w-full h-full object-cover" />
                  : <LocalPlaylistMosaic trackIds={localPl.trackIds} className="w-full h-full" />
                }
              </div>
              <div className="pb-2">
                <p className="text-[11px] font-semibold text-white/60 uppercase tracking-wider mb-1">Local Playlist</p>
                <h1 className="text-white text-3xl font-black mb-1">{localPl.name}</h1>
                <p className="text-white/60 text-sm">{localTracks.length} songs</p>
              </div>
            </div>
            <div className="relative z-10 flex items-center gap-3 mt-5">
              {localQTracks.length > 0 && <HeroPlayButton onClick={() => playCollection(localQTracks)} />}
              {localQTracks.length > 1 && (
                <HeroShuffleButton onClick={() => { const sh = fisherYates(localQTracks); playTrack(sh[0], sh) }} />
              )}
            </div>
          </div>
          <div className="border-t border-[var(--border)] mx-6 mb-3 shrink-0" />
          <div className="px-2 pb-8">
            <div className="grid items-center gap-3 px-4 pb-2 text-text-muted text-xs uppercase tracking-widest" style={{ gridTemplateColumns: '28px 40px 1fr 56px' }}>
              <span className="text-center">#</span><span /><span>Title</span><div className="flex justify-center"><Clock size={12} /></div>
            </div>
            {localTracks.map((lt, i) => {
              const qt = libTrackToTrack(lt)
              return (
                <div key={lt.id} className="group grid items-center gap-3 px-4 py-2 rounded-lg hover:bg-surface-raised transition-colors cursor-default select-none"
                  style={{ gridTemplateColumns: '28px 40px 1fr 56px' }}
                  onDoubleClick={() => playTrack(qt, localQTracks)}
                >
                  <span className="text-center text-xs text-text-muted tabular-nums group-hover:hidden">{i + 1}</span>
                  <button className="hidden group-hover:flex items-center justify-center text-text-primary" onClick={() => playTrack(qt, localQTracks)}><Play size={14} fill="currentColor" /></button>
                  <div className="w-10 h-10 rounded-md overflow-hidden shrink-0">
                    <AlbumArtThumb track={lt} size={40} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-text-primary text-sm font-medium truncate" title={lt.title}>{lt.title}</p>
                    <p className="text-text-muted text-xs truncate">{lt.artist || 'Unknown Artist'}{lt.album ? ` · ${lt.album}` : ''}</p>
                  </div>
                  <span className="text-text-muted text-xs tabular-nums text-center">
                    {formatDuration(lt.duration, '--:--')}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )
    }
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
        <div className="px-5 pt-5 pb-8">
          <h1 className="text-text-primary text-xl font-bold mb-1">Your Library</h1>
          <p className="text-text-muted text-sm mb-6">Local playlists</p>
          {localPlaylists.length === 0 ? (
            <p className="text-text-muted text-sm">No local playlists yet. Add music to your library first.</p>
          ) : (
            <>
              {/* Folders work logged out too — membership is device-local (the
                  API only ever stores synced-playlist ids). Folders holding
                  only synced playlists are hidden here since their members
                  can't render without an account. */}
              {renderFoldersSection(true)}
              <div className="grid gap-4 mb-8" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
                {ungroupedLocal.map(renderLocalCard)}
              </div>
            </>
          )}
          <div className="flex flex-col items-center text-center gap-3 py-6 border-t border-[var(--border)]">
            <p className="text-text-muted text-sm max-w-xs">Log in to create synced playlists and access your full library.</p>
            <button onClick={() => setShowUserAuth(true)} className="px-5 py-2.5 rounded-xl bg-accent/15 hover:bg-accent/25 text-accent text-sm font-semibold transition-colors">
              Log in
            </button>
          </div>
        </div>
        {plSelectMode && (
          <div className="sticky bottom-0 shrink-0 border-t border-[var(--border)] bg-surface px-4 py-2.5 flex items-center gap-2 relative z-30" onClick={e => e.stopPropagation()}>
            <span className="text-sm text-text-primary font-medium flex-1">
              {selectedPlaylistKeys.size} {selectedPlaylistKeys.size === 1 ? 'playlist' : 'playlists'} selected
            </span>
            <button
              onClick={() => setSelectedPlaylistKeys(new Set(localPlaylists.map(lp => `local:${lp.id}`)))}
              className="text-xs text-text-muted hover:text-text-primary px-2 py-1 rounded transition-colors"
            >
              Select all
            </button>
            <button
              onClick={() => setSelectedPlaylistKeys(new Set())}
              className="text-xs text-text-muted hover:text-text-primary px-2 py-1 rounded transition-colors"
            >
              Clear
            </button>
            {selectedPlaylistKind && (
              <div className="relative">
                <button
                  onClick={() => setShowPlBulkAddMenu(v => !v)}
                  disabled={selectedPlaylistKeys.size === 0 || bulkAddingPlaylists}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-overlay hover:bg-surface-raised text-text-primary rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
                >
                  {bulkAddingPlaylists ? <Loader2 size={13} className="animate-spin" /> : <FolderInput size={13} />} Add to playlist
                </button>
                {showPlBulkAddMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowPlBulkAddMenu(false)} />
                    <div className="absolute right-0 bottom-full mb-1 z-50 w-56 bg-surface border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden">
                      <div className="px-3 py-2 border-b border-[var(--border)] text-[11px] uppercase tracking-wider text-text-muted font-semibold">
                        Add to playlist
                      </div>
                      <div className="max-h-56 overflow-y-auto py-1">
                        {localPlaylists.filter(lp => !selectedPlaylistKeys.has(`local:${lp.id}`)).length === 0 ? (
                          <p className="px-3 py-2 text-xs text-text-muted">No other playlists</p>
                        ) : localPlaylists.filter(lp => !selectedPlaylistKeys.has(`local:${lp.id}`)).map(p => (
                          <button
                            key={p.id}
                            onClick={() => bulkAddPlaylistsTo({ kind: 'local', id: p.id })}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors"
                          >
                            <ListMusic size={14} className="shrink-0 text-text-muted" />
                            <span className="flex-1 truncate">{p.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            <button
              onClick={bulkDeletePlaylists}
              disabled={selectedPlaylistKeys.size === 0 || bulkDeletingPlaylists}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-overlay hover:bg-red-500/10 text-red-400 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
            >
              {bulkDeletingPlaylists ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Delete
            </button>
            <button
              onClick={exitPlaylistSelectMode}
              className="p-1.5 rounded-lg hover:bg-surface-overlay transition-colors"
              title="Exit selection"
            >
              <X size={15} className="text-text-muted" />
            </button>
          </div>
        )}
        {plBulkMenu && (
          <div
            className="fixed z-50 bg-surface border border-[var(--border)] rounded-xl shadow-2xl py-1 min-w-[210px]"
            style={{ left: Math.min(plBulkMenu.x, window.innerWidth - 230), top: Math.min(plBulkMenu.y, window.innerHeight - 200) }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-3.5 py-2 text-xs text-text-muted">
              {selectedPlaylistKeys.size} {selectedPlaylistKeys.size === 1 ? 'playlist' : 'playlists'} selected
            </div>
            <div className="border-t border-[var(--border)] my-1" />
            <MenuItem
              icon={CheckSquare2}
              label="Select all"
              onClick={() => { setSelectedPlaylistKeys(new Set(localPlaylists.map(lp => `local:${lp.id}`))); setPlBulkMenu(null) }}
            />
            {selectedPlaylistKind === 'local' && (
              <>
                <button
                  className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2 text-sm text-text-primary transition-colors hover:bg-surface-overlay"
                  onClick={e => { e.stopPropagation(); setPlBulkMenu(prev => prev ? { ...prev, showPlaylists: !prev.showPlaylists } : null) }}
                >
                  <span className="flex items-center gap-2.5"><FolderInput size={14} className="text-text-muted" />Add to playlist</span>
                  <span className="text-text-muted text-xs">›</span>
                </button>
                {plBulkMenu.showPlaylists && (
                  <div className="border-t border-[var(--border)] max-h-40 overflow-y-auto">
                    {localPlaylists.filter(lp => !selectedPlaylistKeys.has(`local:${lp.id}`)).length === 0 ? (
                      <p className="px-3.5 py-2 text-xs text-text-muted">No other playlists</p>
                    ) : localPlaylists.filter(lp => !selectedPlaylistKeys.has(`local:${lp.id}`)).map(p => (
                      <button key={p.id} onClick={() => bulkAddPlaylistsTo({ kind: 'local', id: p.id })} className="w-full text-left px-3.5 py-2 text-sm text-text-primary hover:bg-surface-overlay transition-colors truncate">
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            <MenuItem
              icon={Trash2}
              label="Delete selected"
              destructive
              onClick={() => { setPlBulkMenu(null); bulkDeletePlaylists() }}
            />
            <div className="border-t border-[var(--border)] my-1" />
            <MenuItem icon={X} label="Exit selection" onClick={() => { setPlBulkMenu(null); exitPlaylistSelectMode() }} />
          </div>
        )}
        {renderCardMenu()}
        {renderFolderMenu()}
      </div>
    )
  }

  // ── Playlist detail ────────────────────────────────────────────────────────

  if (selectedId != null) {
    const durLabel = totalDurationLabel(tracks)
    // Extra leading checkbox column while selecting.
    const gridCols = selectMode ? '20px 16px 28px 40px 1fr 56px 36px' : '16px 28px 40px 1fr 56px 36px'

    const playShuffle = () => {
      if (!tracks.length) return
      const shuffled = fisherYates(tracks)
      playTrack(shuffled[0], shuffled)
    }

    return (
      <div ref={setListScrollEl} className="relative flex-1 flex flex-col min-h-0 overflow-y-auto overflow-x-hidden" onClick={() => { setTrackMenu(null); setShowAddAllMenu(false); setShowHeroMenu(false) }}>
        {/* ── Hero (shown immediately using summary data) — the backdrop now
            extends behind the back button too, instead of leaving a plain
            theme-background strip above the gradient. Text in this section
            is fixed to a light palette regardless of app theme, since the
            backdrop is always a dark blurred image — theme-aware text colors
            (which flip to dark-on-light in light mode) were unreadable here. ── */}
        <div className="relative overflow-hidden px-6 pb-6 shrink-0">
          <HeroBackdrop src={playlistCoverUrl(coverData ?? {}) ?? tracks[0]?.imageUrl ?? null} />

          <div className="relative z-10 px-0 pt-5">
            <button onClick={() => {
              setSelectedId(null); setRenaming(false)
              if (isSharedView) { setIsSharedView(false); window.history.pushState({}, '', '/playlists') }
            }} className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm transition-colors">
              <ArrowLeft size={15} /> Playlists
            </button>
          </div>

          {/* Hidden file input */}
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleCoverUpload(f); e.target.value = '' }}
          />

          <div className="relative z-10 flex gap-6 items-end pt-6">
            {/* Cover image — clickable to upload (owner only) */}
            <div className={`shrink-0 self-start group/cover relative rounded-xl shadow-2xl overflow-hidden ${isSharedView ? "cursor-default" : "cursor-pointer"}`} style={{ width: 180, height: 180 }} onClick={() => !isSharedView && coverInputRef.current?.click()}>
              {loadingDetail && tracks.length === 0 ? (
                <div className="w-full h-full bg-surface-overlay animate-pulse" />
              ) : coverLoading ? (
                <div className="w-full h-full bg-surface-overlay flex items-center justify-center">
                  <Loader2 size={28} className="text-text-muted opacity-50 animate-spin" />
                </div>
              ) : playlistCoverUrl(coverData ?? {}) && !coverImgError ? (
                <img
                  src={playlistCoverUrl(coverData ?? {})}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={() => setCoverImgError(true)}
                />
              ) : (
                <PlaylistMosaic tracks={tracks} className="w-full h-full" />
              )}
              {/* Upload overlay (owner only) */}
              <div className={`absolute inset-0 bg-black/50 transition-opacity flex flex-col items-center justify-center gap-2 ${isSharedView ? "opacity-0 pointer-events-none" : "opacity-0 group-hover/cover:opacity-100"}`}>
                {coverUploading ? (
                  <Loader2 size={24} className="text-white animate-spin" />
                ) : (
                  <>
                    <Pencil size={24} className="text-white" />
                    <span className="text-white text-xs font-medium">Change cover</span>
                  </>
                )}
              </div>
              {/* Remove cover button (owner only) */}
              {!isSharedView && (coverData?.cover_image_url || coverData?.cover_image) && !coverImgError && (
                <button
                  className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/60 text-white opacity-0 group-hover/cover:opacity-100 transition-opacity hover:bg-red-500/80"
                  onClick={e => { e.stopPropagation(); handleRemoveCover() }}
                  title="Remove cover"
                >
                  <ImageOff size={12} />
                </button>
              )}
            </div>

            <div className="min-w-0 flex-1 pb-1">
              <p className="text-white/60 text-xs uppercase tracking-widest font-semibold mb-2">Playlist</p>
              {renaming ? (
                <div className="flex items-center gap-2 mb-3">
                  <input value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && renameSelected()} autoFocus className="bg-black/30 border border-white/20 rounded-lg px-3 py-2 text-white text-2xl font-black focus:outline-none focus:border-accent/50 w-full" />
                  <button onClick={renameSelected} className="p-2 rounded-lg bg-accent/15 text-accent shrink-0"><Check size={16} /></button>
                  <button onClick={() => setRenaming(false)} className="p-2 rounded-lg text-white/60 hover:text-white shrink-0"><X size={16} /></button>
                </div>
              ) : (
                <h1 className="text-white text-3xl md:text-4xl font-black truncate mb-2">
                  {detail?.name ?? summary?.name ?? <span className="bg-white/10 rounded animate-pulse text-transparent select-none">Loading…</span>}
                </h1>
              )}
              <div className="flex items-center gap-1.5 text-white/60 text-sm mb-2">
                <span className="font-medium text-white/85">{account.discord_username}</span>
                {!loadingDetail && (
                  <>
                    <span>·</span>
                    <span>{tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}</span>
                    {durLabel && <><span>·</span><span className="flex items-center gap-1"><Clock size={12} />{durLabel}</span></>}
                  </>
                )}
                {loadingDetail && <span className="ml-1 text-xs opacity-50">Loading…</span>}
              </div>

              {/* Description */}
              {editingDesc ? (
                <div className="flex items-start gap-2 mb-3">
                  <textarea
                    value={descValue}
                    onChange={e => setDescValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveDescription() } if (e.key === 'Escape') setEditingDesc(false) }}
                    autoFocus
                    rows={2}
                    placeholder="Add a description…"
                    className="flex-1 bg-black/30 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent/50 resize-none placeholder:text-white/40"
                  />
                  <div className="flex flex-col gap-1 shrink-0">
                    <button onClick={saveDescription} className="p-1.5 rounded-lg bg-accent/15 text-accent"><Check size={14} /></button>
                    <button onClick={() => setEditingDesc(false)} className="p-1.5 rounded-lg text-white/60 hover:text-white"><X size={14} /></button>
                  </div>
                </div>
              ) : isSharedView ? (
                detail?.description ? (
                  <p className="text-white/60 text-sm line-clamp-2 mb-3">{detail.description}</p>
                ) : null
              ) : (
                <button
                  className="text-left mb-3 group/desc flex items-start gap-1.5"
                  onClick={() => { setDescValue(detail?.description ?? ''); setEditingDesc(true) }}
                >
                  {detail?.description ? (
                    <>
                      <p className="text-white/60 text-sm line-clamp-2 group-hover/desc:text-white/80 transition-colors">{detail.description}</p>
                      <Pencil size={11} className="text-white/60 opacity-0 group-hover/desc:opacity-60 transition-opacity shrink-0 mt-1" />
                    </>
                  ) : (
                    <p className="text-white/60 text-sm opacity-40 hover:opacity-70 transition-opacity italic">+ Add description</p>
                  )}
                </button>
              )}

              {/* Action row */}
              <div className="flex items-center gap-2 flex-wrap">
                {tracks.length > 0 && <HeroPlayButton onClick={() => playCollection(tracks)} />}
                {tracks.length > 1 && <HeroShuffleButton onClick={playShuffle} />}

                {/* Shared (not-owned) playlists only get "Save to library" —
                    the owner-only actions below don't apply. */}
                {isSharedView && account && tracks.length > 0 && detail && (
                  <button
                    onClick={handleImportPlaylist}
                    disabled={importState === 'loading' || importState === 'done'}
                    title={importState === 'done' ? 'Saved to library!' : importState === 'error' ? 'Import failed' : 'Save to my library'}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors disabled:opacity-60 ${
                      importState === 'done' ? 'text-accent bg-accent/10' :
                      importState === 'error' ? 'text-red-400 bg-red-400/10' :
                      'text-text-primary bg-surface-raised hover:bg-surface-overlay'
                    }`}
                  >
                    {importState === 'loading' ? <Loader2 size={14} className="animate-spin" /> :
                     importState === 'done' ? <Check size={14} /> :
                     <FolderInput size={14} />}
                    {importState === 'loading' ? 'Saving…' : importState === 'done' ? 'Saved!' : importState === 'error' ? 'Failed' : 'Save to library'}
                  </button>
                )}

                {/* Everything else (download, share, public/private, add-all,
                    rename, delete) lives behind one "⋯" menu instead of a row
                    of loose icon buttons. */}
                {!isSharedView && detail && (
                  <div className="relative" ref={heroMenuRef}>
                    <button
                      ref={heroBtnRef}
                      onClick={e => { e.stopPropagation(); setShowHeroMenu(v => !v); setShowAddAllMenu(false) }}
                      title="More"
                      className={`p-2.5 rounded-full text-sm transition-colors ${showHeroMenu ? 'text-white bg-white/10' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    {/* Portaled to <body> so the hero's overflow-hidden can't
                        clip it, and height-clamped to the viewport so a long
                        "Add all to playlist" list stays fully visible. */}
                    {showHeroMenu && createPortal(
                      <>
                        <div className="fixed inset-0 z-[60]" onClick={() => { setShowHeroMenu(false); setShowAddAllMenu(false) }} />
                        {(() => {
                          const r = heroBtnRef.current?.getBoundingClientRect()
                          const top = r ? r.bottom + 6 : 0
                          const left = r ? Math.min(r.left, window.innerWidth - 218) : 0
                          return (
                            <div
                              className="fixed z-[61] bg-surface border border-[var(--border)] rounded-xl shadow-2xl py-1 min-w-[210px] overflow-y-auto"
                              style={{ top, left, maxHeight: window.innerHeight - top - 8 }}
                              onClick={e => e.stopPropagation()}
                            >
                              <MenuItem
                                icon={zipState === 'loading' ? Loader2 : Archive}
                                label={zipState === 'error' ? 'Download failed' : zipState === 'done' ? 'Download started' : 'Download as ZIP'}
                                disabled={zipState === 'loading' || tracks.length === 0}
                                onClick={() => { handleZipDownload(tracks, detail.name ?? summary?.name ?? 'playlist') }}
                              />
                              {!!(window as any).electron && (
                                <MenuItem
                                  icon={offlineSyncState?.state === 'syncing' ? Loader2 : Download}
                                  label={
                                    offlineSyncState?.state === 'syncing' ? `Downloading… ${offlineSyncState.current}/${offlineSyncState.total}`
                                      : isOffline ? 'Remove offline download' : 'Download for offline'
                                  }
                                  disabled={offlineSyncState?.state === 'syncing' || tracks.length === 0}
                                  onClick={() => { handleToggleOffline() }}
                                />
                              )}
                              <MenuItem
                                icon={shareCopied ? Check : Link}
                                label={shareCopied ? 'Link copied!' : 'Copy share link'}
                                disabled={tracks.length === 0}
                                onClick={() => { handleShare() }}
                              />
                              <MenuItem
                                icon={detail.is_public ? Globe : Lock}
                                label={detail.is_public ? 'Make private' : 'Make public'}
                                disabled={togglingPublic}
                                onClick={() => { handleTogglePublic() }}
                              />
                              {otherPlaylists.length > 0 && tracks.length > 0 && (
                                <>
                                  <MenuItem
                                    icon={FolderInput}
                                    label="Add all to playlist"
                                    disabled={addingAll}
                                    trailing={<span className="text-text-muted text-xs">{showAddAllMenu ? '⌄' : '›'}</span>}
                                    onClick={() => setShowAddAllMenu(v => !v)}
                                  />
                                  {showAddAllMenu && (
                                    <div className="border-t border-b border-[var(--border)] max-h-40 overflow-y-auto">
                                      {otherPlaylists.map(p => (
                                        <button key={p.id} onClick={async () => { setShowAddAllMenu(false); setShowHeroMenu(false); await handleAddAllTo(p.id, detail) }}
                                          className="w-full text-left pl-9 pr-3.5 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-overlay transition-colors truncate">
                                          {p.name}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </>
                              )}
                              <div className="border-t border-[var(--border)] my-1" />
                              {!renaming && (
                                <MenuItem icon={Pencil} label="Rename" onClick={() => { setShowHeroMenu(false); setRenameValue(detail.name); setRenaming(true) }} />
                              )}
                              <MenuItem icon={Trash2} label="Delete playlist" destructive onClick={() => { setShowHeroMenu(false); deleteSelected() }} />
                            </div>
                          )
                        })()}
                      </>,
                      document.body
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--border)] mx-6 mb-3 shrink-0" />

        {/* ── Tracklist ── */}
        {loadingDetail ? (
          <TrackSkeleton />
        ) : tracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-center px-8">
            <Music2 className="text-text-muted opacity-20" size={40} />
            <p className="text-text-muted text-sm">This playlist is empty.</p>
            <p className="text-text-muted text-xs">Add tracks from the Tracker or Liked Songs.</p>
          </div>
        ) : (
          <div className="px-2 pb-8">
            {/* Search + compact view — sticky so scrolled track rows never
                reach the top of the scroll container, where they'd render
                behind the frameless window's fixed min/max/close buttons. */}
            <div
              className="sticky top-0 z-20 -mx-2 px-4 py-2 mb-3 flex items-center gap-2 bg-surface"
              style={{ paddingRight: (window as any).electron ? 188 : undefined }}
            >
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={`Search ${tracks.length} tracks…`}
                  className="w-full bg-surface-overlay border border-[var(--border)] rounded-xl pl-8 pr-4 py-2 text-text-primary text-sm focus:outline-none focus:border-accent/50 placeholder:text-text-muted"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
                    <X size={13} />
                  </button>
                )}
              </div>
              {versionsEnabled && (
                <button
                  onClick={() => { setCompactView(v => !v); clearExpandedGroups() }}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                    compactView
                      ? 'bg-accent/15 text-accent border border-accent/30'
                      : 'bg-surface-overlay text-text-muted hover:text-text-secondary border border-transparent'
                  }`}
                  title="Collapse tracks into their version groups"
                >
                  <Layers size={13} />
                  <span className="hidden sm:inline">Compact</span>
                </button>
              )}
            </div>

            {compactView ? (
              loadingCompact ? (
                <div className="flex items-center justify-center h-40 gap-2 text-text-muted">
                  <Loader2 size={18} className="animate-spin" />
                  <span className="text-sm">Loading version groups…</span>
                </div>
              ) : filteredCompactGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2">
                  <CompactEmptyIcon size={32} className="text-text-muted opacity-30" />
                  <p className="text-text-muted text-sm">
                    {compactGroups.length === 0 ? 'No version groups in this playlist' : `No version groups match "${search}"`}
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filteredCompactGroups.map((group) => (
                    <div key={group.groupId}>
                      <CompactGroupRow
                        coverTrack={group.members[0].item}
                        title={group.title}
                        count={group.members.length}
                        expanded={expandedGroups.has(group.groupId)}
                        onToggle={() => toggleGroupExpanded(group.groupId)}
                      />
                      {expandedGroups.has(group.groupId) && (
                        <div className="ml-4 pl-4 border-l border-[var(--border)] space-y-0.5">
                          {group.members.map(({ item: track, meta }) => {
                            const songId = track.id ? (userApi.trackIdToSongId(track.id) ?? -1) : -1
                            return (
                              <div
                                key={track.id}
                                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setTrackMenu({ track, songId, x: e.clientX, y: e.clientY }) }}
                                className="group flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-surface-raised transition-colors cursor-default"
                                onDoubleClick={() => playTrack(track, group.members.map(m => m.item))}
                              >
                                <AlbumArtThumbnail track={track} size={32} className="rounded-md shrink-0" shimmer={false} />
                                <div className="min-w-0 flex-1">
                                  <p className="text-text-primary text-sm font-medium truncate" title={track.title}>
                                    {track.title}
                                    {meta.version && <span className="text-text-muted"> ({meta.version})</span>}
                                  </p>
                                  <p className="text-text-muted text-xs truncate">{track.album || track.artist}</p>
                                </div>
                                <button
                                  onClick={e => { e.stopPropagation(); setTrackMenu({ track, songId, x: e.clientX, y: e.clientY }) }}
                                  className="p-1.5 text-text-muted hover:text-text-primary rounded-lg hover:bg-surface-overlay transition-colors shrink-0"
                                  title="More options"
                                >
                                  <MoreHorizontal size={13} />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            ) : (
              <>
            {/* Column headers */}
            <div className="grid items-center gap-3 px-4 pb-2 text-text-muted text-xs uppercase tracking-widest" style={{ gridTemplateColumns: gridCols }}>
              {selectMode && (
                <button
                  onClick={() => {
                    const allShown = displayTracks.length > 0 && displayTracks.every(t => selectedTracks.has(t.id))
                    setSelectedTracks(allShown ? new Map() : new Map(displayTracks.map(t => [t.id, t])))
                  }}
                  className="flex items-center justify-center text-text-muted hover:text-text-primary"
                  title="Select all / none"
                >
                  {displayTracks.length > 0 && displayTracks.every(t => selectedTracks.has(t.id))
                    ? <CheckSquare2 size={15} className="text-accent" />
                    : <Square size={15} className="opacity-50" />}
                </button>
              )}
              <span />
              <span className="text-center">#</span>
              <span />
              <SortHeader label="Title" field="title" sort={sort} onSort={handleSort} />
              <div className="flex justify-center">
                <SortHeader label={<Clock size={12} className="inline" />} field="duration" sort={sort} onSort={handleSort} />
              </div>
              <span />
            </div>

            {displayTracks.length === 0 && (
              <p className="text-text-muted text-sm text-center py-8">No tracks match "{search}"</p>
            )}

            {/* Windowed rows — absolutely positioned at displayIdx * TRACK_ROW_H
                inside a container sized to the full list, so only the visible
                slice is mounted (see useVirtualWindowEl). */}
            <div ref={setListContentEl} style={{ height: rowsTotalHeight, position: 'relative' }}>
            {displayTracks.slice(rowStart, rowEnd).map((track, sliceIdx) => {
              const displayIdx = rowStart + sliceIdx
              const originalIdx = trackIndexOf.get(track) ?? -1
              const songId = track.id ? (userApi.trackIdToSongId(track.id) ?? -1) : -1
              const isDragging = dragEnabled && dragIdx === originalIdx
              const isDropTarget = dragEnabled && dropIdx === displayIdx && dragIdx !== null && dragIdx !== displayIdx
              const isSelected = selectedTracks.has(track.id)

              return (
                <div
                  key={track.id}
                  draggable={!isSharedView && dragEnabled && !selectMode}
                  onDragStart={() => !isSharedView && dragEnabled && !selectMode && setDragIdx(originalIdx)}
                  onDragOver={e => { if (!dragEnabled || selectMode) return; e.preventDefault(); setDropIdx(displayIdx) }}
                  onDragEnd={() => { setDragIdx(null); setDropIdx(null) }}
                  onDrop={() => dragEnabled && !selectMode && handleDrop(displayIdx)}
                  onClick={e => { if (e.ctrlKey || e.metaKey || selectMode) toggleTrackSelect(track) }}
                  onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setTrackMenu({ track, songId, x: e.clientX, y: e.clientY }) }}
                  className={`group grid items-center gap-3 px-4 py-2 rounded-lg transition-colors cursor-default select-none ${
                    isDragging ? 'opacity-40 bg-surface-raised' : isDropTarget ? 'border-t-2 border-accent bg-surface-overlay' : isSelected ? 'bg-accent/10' : 'hover:bg-surface-raised'
                  }`}
                  style={{ gridTemplateColumns: gridCols, position: 'absolute', top: displayIdx * TRACK_ROW_H, left: 0, right: 0, height: TRACK_ROW_H }}
                >
                  {selectMode && (
                    <span className="flex items-center justify-center shrink-0">
                      {isSelected ? <CheckSquare2 size={16} className="text-accent" /> : <Square size={16} className="text-text-muted opacity-50" />}
                    </span>
                  )}
                  <span className={`flex items-center justify-center text-text-muted ${!isSharedView && dragEnabled && !selectMode ? 'opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing' : 'opacity-0 pointer-events-none'}`}>
                    <GripVertical size={14} />
                  </span>
                  <span className="text-center text-xs text-text-muted tabular-nums group-hover:hidden">{displayIdx + 1}</span>
                  <button className="hidden group-hover:flex items-center justify-center text-text-primary" onClick={e => { e.stopPropagation(); if (selectMode) toggleTrackSelect(track); else playTrack(track, displayTracks) }}>
                    <Play size={14} fill="currentColor" />
                  </button>
                  <AlbumArtThumbnail track={track} size={40} className="rounded-md" shimmer={false} />
                  <div className="min-w-0" onDoubleClick={() => { if (!selectMode) playTrack(track, displayTracks) }}>
                    <p className="text-text-primary text-sm font-medium truncate" title={track.title}>{track.title}</p>
                    <p className="text-text-muted text-xs truncate flex items-center gap-1">
                      {!!track.id && offlineTracks[track.id] && (
                        <span className="shrink-0 text-emerald-400" title="Downloaded for offline playback">
                          <CircleArrowDown size={11} fill="currentColor" />
                        </span>
                      )}
                      <span className="truncate">{track.artist}{track.album ? ` · ${track.album}` : ''}</span>
                    </p>
                  </div>
                  <span className="text-text-muted text-xs tabular-nums text-center">
                    {formatDuration(track.duration, '--:--')}
                  </span>
                  <div className={`flex items-center justify-end transition-opacity ${selectMode ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100'}`}>
                    <button onClick={e => { e.stopPropagation(); setTrackMenu({ track, songId, x: e.clientX, y: e.clientY }) }}
                      className="p-1.5 text-text-muted hover:text-text-primary rounded-lg hover:bg-surface-overlay transition-colors hidden md:flex" title="More options">
                      <MoreHorizontal size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
            </div>
              </>
            )}
          </div>
        )}

        {/* ── Track context menu ── */}
        {trackMenu && (
          <SongContextMenu
            state={trackMenu}
            onClose={() => setTrackMenu(null)}
            canEdit={canEdit}
            onInfo={() => openSongInfo(trackMenu.songId as number)}
            onPlay={() => playTrack(trackMenu.track, displayTracks)}
            onAddToQueue={() => addToQueue(trackMenu.track)}
            onSelect={() => toggleTrackSelect(trackMenu.track)}
            removeAction={!isSharedView ? { label: 'Remove from playlist', onClick: () => removeTrack(trackMenu.songId as number) } : undefined}
          />
        )}

        {/* ── Bulk selection action bar ── */}
        {selectMode && (
          <div className="sticky bottom-0 shrink-0 border-t border-[var(--border)] bg-surface px-4 py-2.5 flex items-center gap-2 relative z-30" onClick={e => e.stopPropagation()}>
            <span className="text-sm text-text-primary font-medium flex-1">
              {selectedTracks.size} {selectedTracks.size === 1 ? 'track' : 'tracks'} selected
            </span>
            <button
              onClick={() => setSelectedTracks(new Map(displayTracks.map(t => [t.id, t])))}
              className="text-xs text-text-muted hover:text-text-primary px-2 py-1 rounded transition-colors"
            >
              Select all
            </button>
            <button
              onClick={() => setSelectedTracks(new Map())}
              className="text-xs text-text-muted hover:text-text-primary px-2 py-1 rounded transition-colors"
            >
              Clear
            </button>
            <button
              onClick={bulkAddToQueue}
              disabled={selectedTracks.size === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-overlay hover:bg-surface-raised text-text-primary rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
            >
              <ListPlus size={13} /> Add to queue
            </button>
            {otherPlaylists.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowBulkPlaylists(v => !v)}
                  disabled={selectedTracks.size === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-overlay hover:bg-surface-raised text-text-primary rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
                >
                  <Plus size={13} /> Add to playlist
                </button>
                {showBulkPlaylists && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowBulkPlaylists(false)} />
                    <div className="absolute right-0 bottom-full mb-1 z-50 w-56 bg-surface border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden">
                      <div className="px-3 py-2 border-b border-[var(--border)] text-[11px] uppercase tracking-wider text-text-muted font-semibold">
                        Add to playlist
                      </div>
                      <div className="max-h-56 overflow-y-auto py-1">
                        {otherPlaylists.map(p => (
                          <button
                            key={p.id}
                            onClick={() => bulkAddToPlaylist(p.id)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors"
                          >
                            <ListMusic size={14} className="shrink-0 text-text-muted" />
                            <span className="flex-1 truncate">{p.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            {!isSharedView && (
              <button
                onClick={bulkRemove}
                disabled={selectedTracks.size === 0 || bulkRemoving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-overlay hover:bg-red-500/10 text-red-400 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
              >
                {bulkRemoving ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Remove
              </button>
            )}
            <button
              onClick={exitSelectMode}
              className="p-1.5 rounded-lg hover:bg-surface-overlay transition-colors"
              title="Exit selection"
            >
              <X size={15} className="text-text-muted" />
            </button>
          </div>
        )}

        <SongInfoModal
          song={infoSong}
          onClose={() => setInfoSong(null)}
          onEdit={canEdit ? (songId) => { setInfoSong(null); setPendingEditorSongId(songId); setActiveView('editor') } : undefined}
        />
      </div>
    )
  }

  // ── Local playlist detail ─────────────────────────────────────────────────

  if (localSelectedId !== null) {
    const localPl = localPlaylists.find(p => p.id === localSelectedId)
    if (!localPl) { setLocalSelectedId(null); return <div /> }
    const localTracks = localPl.trackIds.map(id => libraryTracks.find(t => t.id === id)).filter(Boolean) as LibraryTrack[]
    const localQTracks: Track[] = localTracks.map(libTrackToTrack)
    const localDurLabel = totalDurationLabel(localQTracks)

    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto overflow-x-hidden">
        {/* Hero */}
        <div className="relative overflow-hidden px-6 pb-6 shrink-0">
          <HeroBackdrop src={localPl.coverImage ?? localTracks.map(t => libraryArt[t.id]).find(a => !!a) ?? null} />
          <div className="relative z-10 pt-5">
            <button onClick={() => setLocalSelectedId(null)} className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm transition-colors">
              <ArrowLeft size={15} /> Playlists
            </button>
          </div>
          <div className="relative z-10 flex gap-6 items-end pt-6">
            <div
              className="shrink-0 rounded-xl shadow-2xl overflow-hidden relative group cursor-pointer"
              style={{ width: 180, height: 180 }}
              onClick={async () => {
                const el = (window as any).electron
                if (!el) return
                const dataUrl = await el.selectImageFile()
                if (dataUrl) updateLocalPlaylist(localPl.id, { coverImage: dataUrl })
              }}
              title="Click to change cover"
            >
              {localPl.coverImage
                ? <img src={localPl.coverImage} alt="" className="w-full h-full object-cover" />
                : <LocalPlaylistMosaic trackIds={localPl.trackIds} className="w-full h-full" />
              }
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                <ImageOff size={22} className="text-white" />
              </div>
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <p className="text-white/60 text-xs uppercase tracking-widest font-semibold mb-2">Local Playlist</p>
              {localRenaming ? (
                <div className="flex items-center gap-2 mb-3">
                  <input value={localRenameVal} onChange={e => setLocalRenameVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { renameLocalPlaylist(localPl.id, localRenameVal.trim() || localPl.name); setLocalRenaming(false) } }}
                    autoFocus className="bg-black/30 border border-white/20 rounded-lg px-3 py-2 text-white text-2xl font-black focus:outline-none focus:border-accent/50 w-full" />
                  <button onClick={() => { renameLocalPlaylist(localPl.id, localRenameVal.trim() || localPl.name); setLocalRenaming(false) }} className="p-2 rounded-lg bg-accent/15 text-accent shrink-0"><Check size={16} /></button>
                  <button onClick={() => setLocalRenaming(false)} className="p-2 rounded-lg text-white/60 hover:text-white shrink-0"><X size={16} /></button>
                </div>
              ) : (
                <h1 className="text-white text-3xl md:text-4xl font-black truncate mb-2">{localPl.name}</h1>
              )}
              <div className="flex items-center gap-1.5 text-white/60 text-sm mb-4">
                <HardDrive size={12} className="shrink-0" />
                <span>Local</span>
                <span>·</span>
                <span>{localTracks.length} {localTracks.length === 1 ? 'track' : 'tracks'}</span>
                {localDurLabel && <><span>·</span><span className="flex items-center gap-1"><Clock size={12} />{localDurLabel}</span></>}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {localQTracks.length > 0 && <HeroPlayButton onClick={() => playCollection(localQTracks)} />}
                {localQTracks.length > 1 && (
                  <HeroShuffleButton onClick={() => { const s = fisherYates(localQTracks); playTrack(s[0], s) }} />
                )}
                {!localRenaming && (
                  <button onClick={() => { setLocalRenameVal(localPl.name); setLocalRenaming(true) }} className="p-2.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 text-sm transition-colors" title="Rename">
                    <Pencil size={15} />
                  </button>
                )}
                {localPl.coverImage && (
                  <button onClick={() => updateLocalPlaylist(localPl.id, { coverImage: null })} className="p-2.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 text-sm transition-colors" title="Remove custom cover">
                    <ImageOff size={15} />
                  </button>
                )}
                <button onClick={() => { deleteLocalPlaylist(localPl.id); setLocalSelectedId(null) }} className="p-2.5 rounded-full text-white/60 hover:text-red-400 hover:bg-red-500/10 text-sm transition-colors" title="Delete playlist">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--border)] mx-6 mb-3 shrink-0" />

        {/* Track list */}
        {localTracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-center px-8">
            <Music2 className="text-text-muted opacity-20" size={40} />
            <p className="text-text-muted text-sm">This playlist is empty.</p>
            <p className="text-text-muted text-xs">Add tracks from the Library tab.</p>
          </div>
        ) : (
          <div className="px-2 pb-8">
            <div className="grid items-center gap-3 px-4 pb-2 text-text-muted text-xs uppercase tracking-widest" style={{ gridTemplateColumns: '28px 40px 1fr 56px' }}>
              <span>#</span>
              <span />
              <span>Title</span>
              <div className="flex justify-center"><Clock size={12} /></div>
            </div>
            {localTracks.map((lt, i) => {
              const qt = libTrackToTrack(lt)
              return (
                <div key={lt.id} className="group grid items-center gap-3 px-4 py-2 rounded-lg hover:bg-surface-raised transition-colors cursor-default select-none"
                  style={{ gridTemplateColumns: '28px 40px 1fr 56px' }}
                  onDoubleClick={() => playTrack(qt, localQTracks)}
                >
                  <span className="text-center text-xs text-text-muted tabular-nums group-hover:hidden">{i + 1}</span>
                  <button className="hidden group-hover:flex items-center justify-center text-text-primary" onClick={() => playTrack(qt, localQTracks)}>
                    <Play size={14} fill="currentColor" />
                  </button>
                  <div className="w-10 h-10 rounded-md overflow-hidden shrink-0">
                    <AlbumArtThumb track={lt} size={40} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-text-primary text-sm font-medium truncate" title={lt.title}>{lt.title}</p>
                    <p className="text-text-muted text-xs truncate">{lt.artist || 'Unknown Artist'}{lt.album ? ` · ${lt.album}` : ''}</p>
                  </div>
                  <span className="text-text-muted text-xs tabular-nums text-center">
                    {formatDuration(lt.duration, '--:--')}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Playlist library ───────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]" onClick={() => { setCardMenu(null); setFolderMenu(null) }}>
      <div className="px-6 pt-6 pb-10">
        <div className="flex items-center justify-between mb-7">
          <div>
            <h1 className="text-text-primary text-3xl font-black tracking-tight">Your Library</h1>
            <p className="text-text-muted text-sm mt-1">Playlists and saved songs</p>
          </div>
          {!creating && !creatingFolder && (
            <div className="flex items-center gap-2">
              <button onClick={() => { setCreatingFolder(true); setNewFolderName('') }} title="New folder" className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-surface-overlay text-text-primary text-sm font-semibold border border-[var(--border)] hover:bg-surface-raised active:scale-[0.97] transition-all">
                <FolderPlus size={16} strokeWidth={2.2} /> New Folder
              </button>
              <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-accent text-black text-sm font-semibold shadow-sm hover:shadow-md hover:brightness-105 active:scale-[0.97] transition-all">
                <Plus size={16} strokeWidth={2.5} /> New Playlist
              </button>
            </div>
          )}
        </div>

        {creating && (
          <div className="flex items-center gap-2 mb-6 max-w-md">
            <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createPlaylist()} placeholder="Playlist name" autoFocus className="flex-1 bg-surface-overlay border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-text-primary text-sm focus:outline-none focus:border-accent/50" />
            <button onClick={createPlaylist} className="px-4 py-2.5 rounded-xl bg-accent text-black text-sm font-semibold">Create</button>
            <button onClick={() => { setCreating(false); setNewName('') }} className="p-2.5 rounded-xl text-text-muted hover:text-text-primary"><X size={16} /></button>
          </div>
        )}

        {creatingFolder && (
          <div className="flex items-center gap-2 mb-6 max-w-md">
            <FolderPlus size={16} className="text-text-muted shrink-0" />
            <input
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newFolderName.trim()) { const id = createFolder(newFolderName); if (id) setExpandedFolders(prev => new Set(prev).add(id)); setCreatingFolder(false); setNewFolderName('') }
                else if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName('') }
              }}
              placeholder="Folder name"
              autoFocus
              className="flex-1 bg-surface-overlay border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-text-primary text-sm focus:outline-none focus:border-accent/50"
            />
            <button onClick={() => { const id = createFolder(newFolderName); if (id) setExpandedFolders(prev => new Set(prev).add(id)); setCreatingFolder(false); setNewFolderName('') }} className="px-4 py-2.5 rounded-xl bg-accent text-black text-sm font-semibold">Create</button>
            <button onClick={() => { setCreatingFolder(false); setNewFolderName('') }} className="p-2.5 rounded-xl text-text-muted hover:text-text-primary"><X size={16} /></button>
          </div>
        )}

        {/* ── Folders section ── */}
        {renderFoldersSection(false)}

        {/* ── Playlists section ── */}
        <h2 className="text-text-muted text-xs font-semibold uppercase tracking-widest mb-3">Playlists</h2>
        <div className="grid gap-x-4 gap-y-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
          <button onClick={() => setShowLiked(true)} className="group text-left cursor-pointer">
            <div className="aspect-square rounded-2xl bg-gradient-to-br from-accent/50 to-accent/10 flex items-center justify-center mb-2.5 shadow-md group-hover:shadow-xl group-hover:-translate-y-1 transition-all duration-200">
              <Heart size={44} className="text-accent" fill="currentColor" />
            </div>
            <p className="text-text-primary text-sm font-semibold truncate">Liked Songs</p>
            <p className="text-text-muted text-xs mt-0.5">{likedTrackIds.length} {likedTrackIds.length === 1 ? 'track' : 'tracks'}</p>
          </button>

          {ungroupedApi.map(renderApiCard)}

          {playlists.length === 0 && (
            <p className="text-text-muted text-sm col-span-full py-2">No synced playlists yet — click "New Playlist" to create one.</p>
          )}
        </div>

        {/* ── On This Device section — separated from synced playlists,
            mirroring Apple Music's split between iCloud and local library. ── */}
        {ungroupedLocal.length > 0 && (
          <>
            <h2 className="text-text-muted text-xs font-semibold uppercase tracking-widest mb-3 mt-9">On This Device</h2>
            <div className="grid gap-x-4 gap-y-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
              {ungroupedLocal.map(renderLocalCard)}
            </div>
          </>
        )}
      </div>

      {/* Bulk playlist-selection action bar */}
      {plSelectMode && (
        <div className="sticky bottom-0 shrink-0 border-t border-[var(--border)] bg-surface px-4 py-2.5 flex items-center gap-2 relative z-30" onClick={e => e.stopPropagation()}>
          <span className="text-sm text-text-primary font-medium flex-1">
            {selectedPlaylistKeys.size} {selectedPlaylistKeys.size === 1 ? 'playlist' : 'playlists'} selected
          </span>
          <button
            onClick={() => setSelectedPlaylistKeys(new Set([
              ...playlists.map(p => `api:${p.id}`),
              ...localPlaylists.map(lp => `local:${lp.id}`),
            ]))}
            className="text-xs text-text-muted hover:text-text-primary px-2 py-1 rounded transition-colors"
          >
            Select all
          </button>
          <button
            onClick={() => setSelectedPlaylistKeys(new Set())}
            className="text-xs text-text-muted hover:text-text-primary px-2 py-1 rounded transition-colors"
          >
            Clear
          </button>
          {selectedPlaylistKind && (
            <div className="relative">
              <button
                onClick={() => setShowPlBulkAddMenu(v => !v)}
                disabled={selectedPlaylistKeys.size === 0 || bulkAddingPlaylists}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-overlay hover:bg-surface-raised text-text-primary rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
              >
                {bulkAddingPlaylists ? <Loader2 size={13} className="animate-spin" /> : <FolderInput size={13} />} Add to playlist
              </button>
              {showPlBulkAddMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowPlBulkAddMenu(false)} />
                  <div className="absolute right-0 bottom-full mb-1 z-50 w-56 bg-surface border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden">
                    <div className="px-3 py-2 border-b border-[var(--border)] text-[11px] uppercase tracking-wider text-text-muted font-semibold">
                      Add to playlist
                    </div>
                    <div className="max-h-56 overflow-y-auto py-1">
                      {(selectedPlaylistKind === 'api'
                        ? playlists.filter(p => !selectedPlaylistKeys.has(`api:${p.id}`))
                        : localPlaylists.filter(lp => !selectedPlaylistKeys.has(`local:${lp.id}`))
                      ).length === 0 ? (
                        <p className="px-3 py-2 text-xs text-text-muted">No other playlists</p>
                      ) : (selectedPlaylistKind === 'api'
                        ? playlists.filter(p => !selectedPlaylistKeys.has(`api:${p.id}`))
                        : localPlaylists.filter(lp => !selectedPlaylistKeys.has(`local:${lp.id}`))
                      ).map(p => (
                        <button
                          key={p.id}
                          onClick={() => bulkAddPlaylistsTo(selectedPlaylistKind === 'api' ? { kind: 'api', id: p.id as number } : { kind: 'local', id: p.id as string })}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors"
                        >
                          <ListMusic size={14} className="shrink-0 text-text-muted" />
                          <span className="flex-1 truncate">{p.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          <button
            onClick={bulkDeletePlaylists}
            disabled={selectedPlaylistKeys.size === 0 || bulkDeletingPlaylists}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-overlay hover:bg-red-500/10 text-red-400 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
          >
            {bulkDeletingPlaylists ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Delete
          </button>
          <button
            onClick={exitPlaylistSelectMode}
            className="p-1.5 rounded-lg hover:bg-surface-overlay transition-colors"
            title="Exit selection"
          >
            <X size={15} className="text-text-muted" />
          </button>
        </div>
      )}

      {/* Bulk context menu — shown when right-clicking a card during playlist multi-select */}
      {plBulkMenu && (
        <div
          className="fixed z-50 bg-surface border border-[var(--border)] rounded-xl shadow-2xl py-1 min-w-[210px]"
          style={{ left: Math.min(plBulkMenu.x, window.innerWidth - 230), top: Math.min(plBulkMenu.y, window.innerHeight - 200) }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3.5 py-2 text-xs text-text-muted">
            {selectedPlaylistKeys.size} {selectedPlaylistKeys.size === 1 ? 'playlist' : 'playlists'} selected
          </div>
          <div className="border-t border-[var(--border)] my-1" />
          <MenuItem
            icon={CheckSquare2}
            label="Select all"
            onClick={() => {
              setSelectedPlaylistKeys(new Set([
                ...playlists.map(p => `api:${p.id}`),
                ...localPlaylists.map(lp => `local:${lp.id}`),
              ]))
              setPlBulkMenu(null)
            }}
          />
          {selectedPlaylistKind && (
            <>
              <button
                className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2 text-sm text-text-primary transition-colors hover:bg-surface-overlay"
                onClick={e => { e.stopPropagation(); setPlBulkMenu(prev => prev ? { ...prev, showPlaylists: !prev.showPlaylists } : null) }}
              >
                <span className="flex items-center gap-2.5"><FolderInput size={14} className="text-text-muted" />Add to playlist</span>
                <span className="text-text-muted text-xs">›</span>
              </button>
              {plBulkMenu.showPlaylists && (
                <div className="border-t border-[var(--border)] max-h-40 overflow-y-auto">
                  {(selectedPlaylistKind === 'api'
                    ? playlists.filter(p => !selectedPlaylistKeys.has(`api:${p.id}`))
                    : localPlaylists.filter(lp => !selectedPlaylistKeys.has(`local:${lp.id}`))
                  ).length === 0 ? (
                    <p className="px-3.5 py-2 text-xs text-text-muted">No other playlists</p>
                  ) : (selectedPlaylistKind === 'api'
                    ? playlists.filter(p => !selectedPlaylistKeys.has(`api:${p.id}`))
                    : localPlaylists.filter(lp => !selectedPlaylistKeys.has(`local:${lp.id}`))
                  ).map(p => (
                    <button
                      key={p.id}
                      onClick={() => bulkAddPlaylistsTo(selectedPlaylistKind === 'api' ? { kind: 'api', id: p.id as number } : { kind: 'local', id: p.id as string })}
                      className="w-full text-left px-3.5 py-2 text-sm text-text-primary hover:bg-surface-overlay transition-colors truncate"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {selectedPlaylistKeys.size > 0 && (
            <>
              <button
                className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2 text-sm text-text-primary transition-colors hover:bg-surface-overlay"
                onClick={e => { e.stopPropagation(); setPlBulkMenu(prev => prev ? { ...prev, showFolders: !prev.showFolders } : null) }}
              >
                <span className="flex items-center gap-2.5"><Folder size={14} className="text-text-muted" />Move to folder</span>
                <span className="text-text-muted text-xs">›</span>
              </button>
              {plBulkMenu.showFolders && folderSubmenuItems([...selectedPlaylistKeys], () => { setPlBulkMenu(null); exitPlaylistSelectMode() })}
            </>
          )}
          <MenuItem
            icon={Trash2}
            label="Delete selected"
            destructive
            onClick={() => { setPlBulkMenu(null); bulkDeletePlaylists() }}
          />
          <div className="border-t border-[var(--border)] my-1" />
          <MenuItem icon={X} label="Exit selection" onClick={() => { setPlBulkMenu(null); exitPlaylistSelectMode() }} />
        </div>
      )}

      {/* Unified playlist card context menu — portaled to <body> and
          re-clamped (see cardMenuPos above) so growing content like the
          "Add all to playlist" submenu can't push it off-screen or get
          clipped/mis-measured by an ancestor. */}
      {renderCardMenu()}

      {renderFolderMenu()}
    </div>
  )
}
