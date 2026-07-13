import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import {
  Folder, Music2, ChevronRight, ArrowLeft, Home, Play, Loader2,
  FolderOpen, HardDrive, LayoutList, LayoutGrid, ImageIcon, Video,
  Download, ArrowUpDown, ArrowUp, ArrowDown, Link, Check, Info, ListPlus, Heart,
  X, Pencil, PackageOpen, CheckSquare2, Square, MonitorSmartphone, Globe, Search,
} from 'lucide-react'
import { useStore, useStorePick } from '../store/useStore'
import {
  apiFetch,
  apiPeek,
  buildStreamUrl,
  buildCoverArtUrl,
  apiFileTrackId,
  apiFilePathToTrack,
  JWApiFileEntry,
  JWApiBrowseResponse,
  JWApiSong,
  JWApiPaginatedResponse,
  JWAPI_BASE,
} from '../lib/juicewrldApi'
import { getFileExt, getMediaType, toFileUrl } from '../lib/fileTypes'
import { Track } from '../types'
import MediaLightbox, { LightboxItem } from './MediaLightbox'
import SongInfoModal from './SongInfoModal'

type ViewMode = 'list' | 'grid'
type SortBy = 'name' | 'type' | 'size'
type SortDir = 'asc' | 'desc'
type ZipStatus = 'idle' | 'starting' | 'zipping' | 'done' | 'error'

const LS_SORT_BY = 'api-files:sortBy'
const LS_SORT_DIR = 'api-files:sortDir'
const LS_VIEW_MODE = 'api-files:viewMode'

function parseEntries(data: JWApiBrowseResponse): JWApiFileEntry[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object' && 'items' in data && Array.isArray(data.items)) return data.items
  return []
}

function breadcrumbs(path: string): { label: string; path: string }[] {
  if (!path) return []
  const parts = path.split('/').filter(Boolean)
  return parts.map((label, i) => ({ label, path: parts.slice(0, i + 1).join('/') }))
}

function parentFolder(path: string): string {
  const i = path.lastIndexOf('/')
  return i > 0 ? path.slice(0, i) : ''
}

function fileToTrack(entry: JWApiFileEntry): Track {
  return apiFilePathToTrack(entry.path, entry.name)
}

function localFileToTrack(entry: { name: string; path: string; size: number | null }): Track {
  const title = entry.name.replace(/\.[^.]+$/, '')
  const fileUrl = toFileUrl(entry.path)
  return {
    id: `local-${entry.path}`,
    path: entry.path,
    streamUrl: fileUrl,
    imageUrl: '',
    title,
    artist: '',
    album: '',
    albumArtist: '',
    year: null,
    trackNumber: null,
    duration: 0,
    genre: '',
    hasAlbumArt: false,
  }
}

function ApiCoverThumb({ path, size = 36 }: { path: string; size?: number }): JSX.Element {
  const [errored, setErrored] = useState(false)
  if (errored) {
    return (
      <div className="flex items-center justify-center bg-surface-overlay rounded" style={{ width: size, height: size }}>
        <Music2 size={size * 0.5} className="text-text-muted opacity-40" />
      </div>
    )
  }
  return (
    <img
      src={buildCoverArtUrl(path)}
      alt=""
      className="rounded object-cover"
      style={{ width: size, height: size }}
      onError={() => setErrored(true)}
    />
  )
}

function ApiImageThumb({ path, size = 36 }: { path: string; size?: number }): JSX.Element {
  const [errored, setErrored] = useState(false)
  if (errored) {
    return (
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <ImageIcon size={size * 0.5} className="text-text-muted opacity-40" />
      </div>
    )
  }
  return (
    <img
      src={buildStreamUrl(path)}
      alt=""
      className="rounded object-cover"
      style={{ width: size, height: size }}
      onError={() => setErrored(true)}
    />
  )
}

function sortEntries(entries: JWApiFileEntry[], by: SortBy, dir: SortDir): JWApiFileEntry[] {
  return [...entries].sort((a, b) => {
    // Dirs always first
    const aDir = a.type === 'directory'
    const bDir = b.type === 'directory'
    if (aDir !== bDir) return aDir ? -1 : 1

    let cmp = 0
    if (by === 'name') {
      cmp = a.name.localeCompare(b.name)
    } else if (by === 'type') {
      const aExt = getFileExt(a.name)
      const bExt = getFileExt(b.name)
      cmp = aExt.localeCompare(bExt) || a.name.localeCompare(b.name)
    } else if (by === 'size') {
      cmp = (a.size ?? 0) - (b.size ?? 0)
    }
    return dir === 'asc' ? cmp : -cmp
  })
}

function pathToUrl(folderPath: string): string {
  if (!folderPath) return '/files'
  return '/files/' + folderPath.split('/').map(encodeURIComponent).join('/')
}

function urlToPath(pathname: string): string {
  if (!pathname.startsWith('/files/')) return ''
  return decodeURIComponent(pathname.slice('/files/'.length))
}

export default function ApiFilesView(): JSX.Element {
  const { playTrack, addToQueue, apiFilesPath, setApiFilesPath, apiFilesLastPath, setApiFilesLastPath, account, setActiveView, setPendingEditorSongId, likedTrackIds, toggleLike } = useStorePick('playTrack', 'addToQueue', 'apiFilesPath', 'setApiFilesPath', 'apiFilesLastPath', 'setApiFilesLastPath', 'account', 'setActiveView', 'setPendingEditorSongId', 'likedTrackIds', 'toggleLike')
  const canEdit = !!(account?.is_editor || account?.is_administrator)
  // Set lookup for the per-row liked check — .includes on the array made the
  // listing O(rows × likes).
  const likedSet = useMemo(() => new Set(likedTrackIds), [likedTrackIds])

  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState<JWApiFileEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const [playing, setPlaying] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [lightboxItems, setLightboxItems] = useState<LightboxItem[]>([])
  const [lightboxIndex, setLightboxIndex] = useState(-1)
  const [copiedPath, setCopiedPath] = useState<string | null>(null)
  const [infoSong, setInfoSong] = useState<JWApiSong | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ entry: JWApiFileEntry; x: number; y: number } | null>(null)
  // Whether a right-clicked audio file actually has a matching song in the
  // Tracker — resolved lazily per path on menu-open (not for every row up
  // front) so "Find in Tracker" can be hidden for files with no match instead
  // of opening the info modal on nothing. undefined = not looked up yet,
  // null = looked up, no match.
  const [trackerMatches, setTrackerMatches] = useState<Map<string, number | null>>(new Map())
  // Clamped against the actual rendered size (not a static guess) — the
  // menu's height varies with the entry type and canEdit, so a fixed guess
  // undershoots near the screen edges and spills the menu off-screen.
  // useLayoutEffect runs before paint, so there's no visible flash at (0,0).
  const ctxMenuRef = useRef<HTMLDivElement>(null)
  const [ctxMenuPos, setCtxMenuPos] = useState({ left: 0, top: 0 })
  useLayoutEffect(() => {
    const el = ctxMenuRef.current
    if (!el || !ctxMenu) return
    const rect = el.getBoundingClientRect()
    const top = Math.max(8, Math.min(ctxMenu.y, window.innerHeight - rect.height - 8))
    const left = Math.max(8, Math.min(ctxMenu.x, window.innerWidth - rect.width - 8))
    setCtxMenuPos({ top, left })
  }, [ctxMenu])

  // Search — recursive across the whole file tree via /files/browse/'s
  // `search` param (same endpoint findSessionZips uses), not scoped to the
  // current folder. Results replace the browsed folder's entries while
  // active rather than living in a separate list, so sorting/select-mode/
  // context menus all keep working on it unchanged.
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [searchResults, setSearchResults] = useState<JWApiFileEntry[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const isSearching = debouncedSearch.trim().length > 0

  // Multi-select state
  const [selectMode, setSelectMode] = useState(false)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [zipStatus, setZipStatus] = useState<ZipStatus>('idle')
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Local files mode (Electron only)
  const isElectron = navigator.userAgent.includes('Electron')
  const [localMode, setLocalMode] = useState(false)
  const [localPath, setLocalPath] = useState('')
  const [localEntries, setLocalEntries] = useState<Array<{ name: string; path: string; type: 'file' | 'directory'; size: number | null }>>([])
  const [localLoading, setLocalLoading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const browseLocal = async (dirPath: string): Promise<void> => {
    const el = (window as any).electron
    if (!el) return
    setLocalLoading(true)
    setLocalError(null)
    try {
      const result = await el.browseLocal(dirPath)
      if (result.error) { setLocalError(result.error); return }
      setLocalPath(result.path)
      setLocalEntries(result.entries)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to browse')
    } finally {
      setLocalLoading(false)
    }
  }

  const openLocalFile = async (filePath: string): Promise<void> => {
    const el = (window as any).electron
    if (!el) return
    await el.openPath(filePath)
  }

  const handleLocalPlay = (entry: { name: string; path: string; type: string; size: number | null }): void => {
    const track = localFileToTrack(entry)
    const queue = localEntries
      .filter(e => e.type === 'file' && getMediaType(e.name) === 'audio')
      .map(localFileToTrack)
    playTrack(track, queue.length > 0 ? queue : [track])
  }

  const openLocalLightbox = (entry: { name: string; path: string; type: string; size: number | null }): void => {
    const mediaEntries = localEntries.filter(e => {
      const mt = getMediaType(e.name)
      return e.type === 'file' && (mt === 'image' || mt === 'video')
    })
    const items: LightboxItem[] = mediaEntries.map(e => ({
      url: toFileUrl(e.path),
      type: getMediaType(e.name) as 'image' | 'video',
      name: e.name,
    }))
    const idx = mediaEntries.findIndex(e => e.path === entry.path)
    setLightboxItems(items)
    setLightboxIndex(idx >= 0 ? idx : 0)
  }

  const pickLocalFolder = async (): Promise<void> => {
    const el = (window as any).electron
    if (!el) return
    const picked = await el.pickFolder()
    if (picked) browseLocal(picked)
  }

  // Init local browse when switching to local mode
  useEffect(() => {
    if (localMode && localEntries.length === 0) {
      browseLocal('')
    }
  }, [localMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Persisted view settings
  const [viewMode, setViewModeState] = useState<ViewMode>(
    () => (localStorage.getItem(LS_VIEW_MODE) as ViewMode) || 'list'
  )
  const [sortBy, setSortByState] = useState<SortBy>(
    () => (localStorage.getItem(LS_SORT_BY) as SortBy) || 'name'
  )
  const [sortDir, setSortDirState] = useState<SortDir>(
    () => (localStorage.getItem(LS_SORT_DIR) as SortDir) || 'asc'
  )

  const setViewMode = (v: ViewMode): void => { setViewModeState(v); localStorage.setItem(LS_VIEW_MODE, v) }
  const setSortBy = (v: SortBy): void => { setSortByState(v); localStorage.setItem(LS_SORT_BY, v) }
  const setSortDir = (v: SortDir): void => { setSortDirState(v); localStorage.setItem(LS_SORT_DIR, v) }

  const toggleSort = (by: SortBy): void => {
    if (sortBy === by) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(by)
      setSortDir('asc')
    }
  }

  const navigate = useCallback(async (path: string, pushHistory = true) => {
    // Navigating to a folder (including clicking a directory result while
    // searching) always exits search mode and lands in normal browsing.
    setSearch(''); setDebouncedSearch('')
    // Stale-while-revalidate: if this folder is already in the offline cache,
    // paint it instantly (no spinner) and refresh silently in the background.
    // Only show the loading state when there's nothing cached to fall back on.
    const cached = apiPeek<JWApiBrowseResponse>('/files/browse/', path ? { path } : {})
    if (cached) {
      setEntries(parseEntries(cached))
      setCurrentPath(path)
      setError(null)
      setLoading(false)
    } else {
      setLoading(true)
      setError(null)
    }
    try {
      const data = await apiFetch<JWApiBrowseResponse>('/files/browse/', path ? { path } : {})
      const items = parseEntries(data)
      if (pushHistory) {
        setHistory((h) => [...h, currentPath])
        window.history.pushState({ view: 'api-files', folderPath: path }, '', pathToUrl(path))
      }
      setCurrentPath(path)
      setEntries(items)
    } catch (err) {
      // Keep the cached listing visible on a network failure — only surface the
      // error when we had nothing to show in the first place.
      if (!cached) setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [currentPath])

  // Keep a ref to navigate so popstate listener always has the latest version
  const navigateRef = useRef(navigate)
  useEffect(() => { navigateRef.current = navigate }, [navigate])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    if (!isSearching) { setSearchResults([]); return }
    let cancelled = false
    setSearchLoading(true)
    apiFetch<JWApiBrowseResponse>('/files/browse/', { search: debouncedSearch.trim() })
      .then(data => { if (!cancelled) setSearchResults(parseEntries(data)) })
      .catch(() => { if (!cancelled) setSearchResults([]) })
      .finally(() => { if (!cancelled) setSearchLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, isSearching])

  // Remember the browsed folder in the store so switching to another tab and
  // back restores it — the component unmounts on tab switch, so local state
  // alone doesn't survive that round trip.
  useEffect(() => {
    setApiFilesLastPath(currentPath)
  }, [currentPath]) // eslint-disable-line react-hooks/exhaustive-deps

  // On mount: read path from URL, or an explicit deep-link (apiFilesPath), or
  // fall back to wherever the user last browsed to (apiFilesLastPath).
  useEffect(() => {
    const urlPath = urlToPath(window.location.pathname)
    const initialPath = apiFilesPath || urlPath || apiFilesLastPath
    if (apiFilesPath) setApiFilesPath('')  // consume it
    navigateRef.current(initialPath, false)

    const handlePopstate = (): void => {
      const p = window.location.pathname
      if (p.startsWith('/files')) {
        const fp = urlToPath(p)
        setHistory([])
        navigateRef.current(fp, false)
      }
    }
    window.addEventListener('popstate', handlePopstate)
    return () => window.removeEventListener('popstate', handlePopstate)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ESC exits select mode
  useEffect(() => {
    if (!selectMode) return
    const handleKeyDown = (e: KeyboardEvent): void => { if (e.key === 'Escape') exitSelectMode() }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectMode]) // eslint-disable-line react-hooks/exhaustive-deps

  const goBack = (): void => {
    if (history.length > 0) {
      const prev = history[history.length - 1]
      setHistory((h) => h.slice(0, -1))
      navigate(prev, false)
    } else if (currentPath) {
      navigate(parentFolder(currentPath), false)
    }
  }

  const goHome = (): void => { setHistory([]); navigate('', true) }

  const openSongInfo = async (entry: JWApiFileEntry): Promise<void> => {
    const title = entry.name.replace(/\.[^.]+$/, '')
    try {
      const data = await apiFetch<JWApiPaginatedResponse>('/songs/', { search: title, page_size: 5 })
      const match = data.results[0] ?? null
      setInfoSong(match)
    } catch {
      setInfoSong(null)
    }
  }

  // Resolves (and caches) whether an audio file has a matching Tracker entry,
  // so the context menu can hide "Find in Tracker" when there isn't one.
  const resolveTrackerMatch = (entry: JWApiFileEntry): void => {
    if (getMediaType(entry.name) !== 'audio' || trackerMatches.has(entry.path)) return
    const title = entry.name.replace(/\.[^.]+$/, '')
    apiFetch<JWApiPaginatedResponse>('/songs/', { search: title, page_size: 1 })
      .then((data) => {
        const id = data.results[0]?.id ?? null
        setTrackerMatches((prev) => new Map(prev).set(entry.path, id))
      })
      .catch(() => setTrackerMatches((prev) => new Map(prev).set(entry.path, null)))
  }

  const openContextMenu = (entry: JWApiFileEntry, x: number, y: number): void => {
    setCtxMenu({ entry, x, y })
    resolveTrackerMatch(entry)
  }

  const copyLink = (entry: JWApiFileEntry): void => {
    const url = entry.type === 'file'
      ? buildStreamUrl(entry.path)
      : window.location.origin + pathToUrl(entry.path)
    navigator.clipboard.writeText(url).then(() => {
      setCopiedPath(entry.path)
      setTimeout(() => setCopiedPath(null), 1800)
    })
  }

  const handlePlay = async (entry: JWApiFileEntry): Promise<void> => {
    if (playing === entry.path) return
    setPlaying(entry.path)
    try {
      const track = fileToTrack(entry)
      const queue = entries
        .filter((e) => e.type === 'file' && getMediaType(e.name) === 'audio')
        .map(fileToTrack)
      playTrack(track, queue.length > 0 ? queue : [track])
    } finally {
      setPlaying(null)
    }
  }

  const handleDownload = (entry: JWApiFileEntry): void => {
    const url = buildStreamUrl(entry.path)
    const a = document.createElement('a')
    a.href = url
    a.download = entry.name
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const openLightbox = (entry: JWApiFileEntry): void => {
    const mediaEntries = entries.filter((e) => {
      const mt = getMediaType(e.name)
      return e.type === 'file' && (mt === 'image' || mt === 'video')
    })
    const items: LightboxItem[] = mediaEntries.map((e) => ({
      url: buildStreamUrl(e.path),
      type: getMediaType(e.name) as 'image' | 'video',
      name: e.name,
    }))
    const idx = mediaEntries.findIndex((e) => e.path === entry.path)
    setLightboxItems(items)
    setLightboxIndex(idx >= 0 ? idx : 0)
  }

  // ── Selection helpers ──────────────────────────────────────────────────────

  const enterSelectMode = (entry: JWApiFileEntry): void => {
    setSelectMode(true)
    setSelectedPaths(new Set([entry.path]))
    setCtxMenu(null)
  }

  const toggleSelect = (path: string): void => {
    setSelectedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const exitSelectMode = (): void => {
    setSelectMode(false)
    setSelectedPaths(new Set())
    setZipStatus('idle')
  }

  const handleLongPressStart = (entry: JWApiFileEntry): void => {
    longPressTimer.current = setTimeout(() => enterSelectMode(entry), 500)
  }

  const handleLongPressEnd = (): void => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }

  const downloadZip = async (): Promise<void> => {
    if (selectedPaths.size === 0) return
    setZipStatus('starting')
    try {
      const res = await fetch(`${JWAPI_BASE}/start-zip-job/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: [...selectedPaths] }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { job_id } = await res.json() as { job_id: string }
      setZipStatus('zipping')
      const poll = async (): Promise<void> => {
        const st = await apiFetch<{ status: string; download_url?: string; error?: string }>(`/zip-job-status/${job_id}/`)
        if (st.status === 'completed' && st.download_url) {
          const a = document.createElement('a')
          a.href = st.download_url
          a.download = 'selection.zip'
          a.target = '_blank'
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          setZipStatus('done')
          setTimeout(() => setZipStatus('idle'), 3000)
        } else if (st.status === 'failed') {
          throw new Error(st.error || 'ZIP job failed')
        } else {
          setTimeout(() => { poll().catch(() => { setZipStatus('error'); setTimeout(() => setZipStatus('idle'), 3000) }) }, 1500)
        }
      }
      await poll()
    } catch {
      setZipStatus('error')
      setTimeout(() => setZipStatus('idle'), 3000)
    }
  }

  // ── Sorted entries ─────────────────────────────────────────────────────────

  const sortedEntries = useMemo(
    () => sortEntries(isSearching ? searchResults : entries, sortBy, sortDir),
    [isSearching, searchResults, entries, sortBy, sortDir]
  )

  const crumbs = breadcrumbs(currentPath)

  const SortIcon = ({ by }: { by: SortBy }): JSX.Element => {
    if (sortBy !== by) return <ArrowUpDown size={11} className="opacity-40" />
    return sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
  }

  return (
    <>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Header */}
        <div className={`px-5 pb-3 shrink-0 ${isElectron ? 'pt-9' : 'pt-5'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <HardDrive size={18} className="text-text-muted" />
              <h1 className="text-text-primary text-xl font-bold">API Files</h1>
            </div>
            <div className="flex items-center gap-3">
              {/* Sort controls */}
              <div className="flex items-center gap-1 text-text-muted">
                {(['name', 'type', 'size'] as SortBy[]).map((by) => (
                  <button
                    key={by}
                    onClick={() => toggleSort(by)}
                    className={`flex items-center gap-0.5 text-xs px-2 py-1 rounded-md transition-colors capitalize ${
                      sortBy === by
                        ? 'bg-surface-raised text-text-primary'
                        : 'hover:text-text-secondary hover:bg-surface-overlay'
                    }`}
                    title={`Sort by ${by}`}
                  >
                    {by}
                    <SortIcon by={by} />
                  </button>
                ))}
              </div>
              {/* View toggle */}
              <div className="flex items-center bg-surface-overlay rounded-lg p-1 gap-0.5">
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-surface-raised text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}
                  title="List view"
                ><LayoutList size={15} /></button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-surface-raised text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}
                  title="Grid view"
                ><LayoutGrid size={15} /></button>
              </div>
              {/* API / Local toggle (Electron only) */}
              {isElectron && (
                <div className="flex items-center bg-surface-overlay rounded-lg p-1 gap-1">
                  <button
                    onClick={() => setLocalMode(false)}
                    className={`flex items-center gap-1.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${!localMode ? 'bg-surface-raised text-text-primary shadow-sm' : 'text-text-muted hover:text-text-primary'}`}
                    title="Browse API files"
                  ><Globe size={12} /> API</button>
                  <button
                    onClick={() => setLocalMode(true)}
                    className={`flex items-center gap-1.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${localMode ? 'bg-surface-raised text-text-primary shadow-sm' : 'text-text-muted hover:text-text-primary'}`}
                    title="Browse local files"
                  ><MonitorSmartphone size={12} /> Local</button>
                </div>
              )}
            </div>
          </div>

          {/* Search — API mode. Recursive across the whole file tree (same
              /files/browse/ `search` param the session-ZIP lookup uses),
              not scoped to the current folder. */}
          {!localMode && (
            <div className="relative mb-2">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search files…"
                className="w-full bg-surface-overlay border border-[var(--border)] rounded-lg pl-8 pr-8 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/40"
              />
              {search && (
                <button
                  onClick={() => { setSearch(''); setDebouncedSearch('') }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          {/* Nav bar — API mode */}
          {!localMode && (
            isSearching ? (
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                {searchLoading
                  ? <><Loader2 size={12} className="animate-spin" /> Searching…</>
                  : <>{searchResults.length} result{searchResults.length === 1 ? '' : 's'} for "{debouncedSearch.trim()}"</>}
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button onClick={goBack} disabled={history.length === 0 && !currentPath}
                  className="p-1.5 rounded-lg hover:bg-surface-overlay disabled:opacity-30 disabled:pointer-events-none transition-colors" title="Back">
                  <ArrowLeft size={15} className="text-text-muted" />
                </button>
                <button onClick={goHome} className="p-1.5 rounded-lg hover:bg-surface-overlay transition-colors" title="Root">
                  <Home size={15} className="text-text-muted" />
                </button>
                <div className="flex items-center gap-0.5 overflow-hidden ml-1 flex-1 min-w-0">
                  <button
                    onClick={goHome}
                    className={`text-xs px-1.5 py-0.5 rounded transition-colors shrink-0 ${
                      crumbs.length === 0 ? 'text-text-primary font-medium' : 'text-text-muted hover:text-text-primary hover:bg-surface-overlay'
                    }`}
                  >Root</button>
                  {crumbs.map((crumb, i) => (
                    <div key={crumb.path} className="flex items-center gap-0.5 min-w-0 shrink-0">
                      <ChevronRight size={12} className="text-text-muted shrink-0" />
                      <button
                        onClick={() => navigate(crumb.path)}
                        className={`text-xs px-1.5 py-0.5 rounded transition-colors truncate max-w-[140px] ${
                          i === crumbs.length - 1 ? 'text-text-primary font-medium' : 'text-text-muted hover:text-text-primary hover:bg-surface-overlay'
                        }`}
                        title={crumb.path}
                      >{crumb.label}</button>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>

        {/* Local files browser */}
        {localMode && (
          <div className="flex-1 overflow-y-auto px-5 pb-4">
            {/* Local nav bar */}
            <div className="flex items-center gap-1.5 mb-3">
              <button
                onClick={pickLocalFolder}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-overlay hover:bg-surface-raised border border-[var(--border)] text-text-secondary text-xs font-medium transition-colors"
              ><FolderOpen size={13} /> Change folder</button>
              {localPath && (
                <span className="text-text-muted text-xs truncate flex-1" title={localPath}>{localPath}</span>
              )}
            </div>
            {localLoading ? (
              <div className="flex items-center justify-center h-40 gap-2 text-text-muted">
                <Loader2 size={18} className="animate-spin" /><span className="text-sm">Loading…</span>
              </div>
            ) : localError ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <p className="text-text-muted text-sm">{localError}</p>
                <button onClick={() => browseLocal(localPath)} className="text-accent text-sm underline">Retry</button>
              </div>
            ) : localEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <MonitorSmartphone size={32} className="text-text-muted opacity-30" />
                <p className="text-text-muted text-sm">No files found</p>
                <button onClick={pickLocalFolder} className="text-accent text-sm underline">Pick a folder</button>
              </div>
            ) : viewMode === 'list' ? (
              <div className="space-y-0.5">
                {localPath && (
                  <button
                    onClick={() => {
                      const parent = localPath.replace(/[/\\][^/\\]+$/, '')
                      if (parent && parent !== localPath) browseLocal(parent)
                    }}
                    className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-surface-overlay transition-colors text-left"
                  >
                    <div className="w-9 h-9 flex items-center justify-center shrink-0"><FolderOpen size={18} className="text-text-muted" /></div>
                    <span className="text-text-muted text-sm">..</span>
                  </button>
                )}
                {localEntries.map((entry) => {
                  const isDir = entry.type === 'directory'
                  const mt = isDir ? 'folder' : getMediaType(entry.name)
                  const ext = getFileExt(entry.name).slice(1).toUpperCase()
                  return (
                    <div
                      key={entry.path}
                      className="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-overlay transition-colors cursor-default"
                      onClick={() => {
                        if (isDir) browseLocal(entry.path)
                        else if (mt === 'audio') handleLocalPlay(entry)
                        else if (mt === 'image' || mt === 'video') openLocalLightbox(entry)
                      }}
                    >
                      <div className="w-9 h-9 flex items-center justify-center shrink-0">
                        {isDir
                          ? <FolderOpen size={18} className="text-text-muted" />
                          : mt === 'audio' ? <Music2 size={18} className="text-text-muted opacity-40" /> : mt === 'video' ? <Video size={18} className="text-text-muted" /> : mt === 'image' ? <ImageIcon size={18} className="text-text-muted" /> : <Music2 size={18} className="text-text-muted opacity-20" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-text-primary text-sm truncate">{entry.name}</p>
                        {entry.size != null && !isDir && (
                          <p className="text-text-muted text-xs">{(entry.size / 1_048_576).toFixed(1)} MB</p>
                        )}
                      </div>
                      {mt === 'audio' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleLocalPlay(entry) }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full hover:bg-accent/15 text-accent transition-all"
                          title="Play"
                        ><Play size={14} /></button>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="grid gap-3 pt-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                {localPath && (
                  <button
                    onClick={() => {
                      const parent = localPath.replace(/[/\\][^/\\]+$/, '')
                      if (parent && parent !== localPath) browseLocal(parent)
                    }}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl bg-surface-overlay hover:bg-surface-raised transition-colors"
                  >
                    <div className="w-full aspect-square flex items-center justify-center"><FolderOpen size={40} className="text-text-muted" /></div>
                    <span className="text-text-muted text-xs">..</span>
                  </button>
                )}
                {localEntries.map((entry) => {
                  const isDir = entry.type === 'directory'
                  const mt = isDir ? 'folder' : getMediaType(entry.name)
                  const ext = getFileExt(entry.name).slice(1).toUpperCase()
                  return (
                    <div
                      key={entry.path}
                      className="group flex flex-col rounded-xl overflow-hidden transition-colors cursor-default bg-surface-overlay hover:bg-surface-raised"
                      onClick={() => {
                        if (isDir) browseLocal(entry.path)
                        else if (mt === 'audio') handleLocalPlay(entry)
                        else if (mt === 'image' || mt === 'video') openLocalLightbox(entry)
                      }}
                    >
                      <div className="relative w-full aspect-square bg-surface-raised flex items-center justify-center overflow-hidden">
                        {isDir
                          ? <Folder size={40} className="text-text-secondary group-hover:text-accent transition-colors" />
                          : mt === 'audio' ? (
                            <>
                              <Music2 size={36} className="text-text-muted opacity-30" />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Play size={24} fill="white" className="text-white ml-0.5" />
                              </div>
                            </>
                          ) : mt === 'image' ? (
                            <ImageIcon size={36} className="text-text-muted" />
                          ) : mt === 'video' ? (
                            <Video size={36} className="text-text-muted" />
                          ) : (
                            <span className="text-xs uppercase text-text-muted">{ext}</span>
                          )}
                      </div>
                      <div className="px-2 py-2">
                        <p className="text-text-primary text-xs font-medium truncate">{entry.name}</p>
                        {!isDir && <p className="text-text-muted text-[10px] uppercase tracking-wide mt-0.5">{ext}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
        {/* Content */}
        {!localMode && <div className="flex-1 overflow-y-auto px-5 pb-4">
          {(isSearching ? searchLoading : loading) ? (
            <div className="flex items-center justify-center h-40 gap-2 text-text-muted">
              <Loader2 size={18} className="animate-spin" /><span className="text-sm">{isSearching ? 'Searching…' : 'Loading…'}</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <p className="text-text-muted text-sm">{error}</p>
              <button onClick={() => navigate(currentPath, false)} className="text-accent text-sm underline">Retry</button>
            </div>
          ) : sortedEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <Music2 size={32} className="text-text-muted opacity-30" />
              <p className="text-text-muted text-sm">{isSearching ? `No files match "${debouncedSearch.trim()}"` : 'Nothing here'}</p>
            </div>
          ) : viewMode === 'list' ? (
            /* ── List view ────────────────────────────────────────────────────── */
            <div className="space-y-0.5">
              {currentPath && !isSearching && (
                <button onClick={goBack} className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-surface-overlay transition-colors text-left">
                  <div className="w-9 h-9 flex items-center justify-center shrink-0"><FolderOpen size={18} className="text-text-muted" /></div>
                  <span className="text-text-muted text-sm">..</span>
                </button>
              )}
              {sortedEntries.map((entry) => {
                const isDir = entry.type === 'directory'
                const mt = isDir ? 'folder' : getMediaType(entry.name)
                const ext = getFileExt(entry.name).slice(1).toUpperCase()
                const isMedia = mt === 'image' || mt === 'video'
                const isSelected = selectedPaths.has(entry.path)
                const isLiked = mt === 'audio' && likedSet.has(apiFileTrackId(entry.path))
                return (
                  <div key={entry.path}
                    className={`group flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-default ${
                      isSelected ? 'bg-accent/10 hover:bg-accent/15' : 'hover:bg-surface-overlay'
                    }`}
                    onClick={(e) => {
                      if (e.ctrlKey || e.metaKey) {
                        if (!selectMode) setSelectMode(true)
                        toggleSelect(entry.path)
                        return
                      }
                      if (selectMode) { toggleSelect(entry.path); return }
                      if (isDir) navigate(entry.path)
                      else if (isMedia) openLightbox(entry)
                    }}
                    onDoubleClick={() => { if (!selectMode && mt === 'audio') handlePlay(entry) }}
                    onContextMenu={e => { e.preventDefault(); openContextMenu(entry, e.clientX, e.clientY) }}
                    onTouchStart={() => handleLongPressStart(entry)}
                    onTouchEnd={handleLongPressEnd}
                  >
                    {/* Checkbox (select mode) */}
                    {selectMode && (
                      <div className="shrink-0 w-5 flex items-center justify-center">
                        {isSelected
                          ? <CheckSquare2 size={16} className="text-accent" />
                          : <Square size={16} className="text-text-muted opacity-50" />}
                      </div>
                    )}
                    {/* Icon / thumbnail */}
                    <div className="relative shrink-0 w-9 h-9">
                      {isDir ? (
                        <div className="w-9 h-9 flex items-center justify-center">
                          <Folder size={20} className={`transition-colors ${isSelected ? 'text-accent' : 'text-text-secondary group-hover:text-accent'}`} />
                        </div>
                      ) : mt === 'audio' ? (
                        <button
                          className="relative w-9 h-9 rounded overflow-hidden"
                          onClick={(e) => { e.stopPropagation(); if (!selectMode) handlePlay(entry) }}
                          title="Play"
                        >
                          <ApiCoverThumb path={entry.path} size={36} />
                          {!selectMode && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded">
                              {playing === entry.path ? <Loader2 size={14} className="text-white animate-spin" /> : <Play size={14} fill="white" className="text-white ml-0.5" />}
                            </div>
                          )}
                        </button>
                      ) : mt === 'image' ? (
                        <div className="w-9 h-9"><ApiImageThumb path={entry.path} size={36} /></div>
                      ) : mt === 'video' ? (
                        <div className="w-9 h-9 flex items-center justify-center"><Video size={18} className="text-text-muted" /></div>
                      ) : (
                        <div className="w-9 h-9 flex items-center justify-center"><Music2 size={18} className="text-text-muted opacity-40" /></div>
                      )}
                    </div>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-sm truncate ${isDir ? 'text-text-primary font-medium cursor-pointer' : 'text-text-secondary'}`}>{entry.name}</span>
                      {isSearching && parentFolder(entry.path) && (
                        <span className="block text-text-muted text-[10px] truncate">{parentFolder(entry.path)}</span>
                      )}
                    </span>
                    {isLiked && (
                      <button
                        className="shrink-0 p-1 text-accent"
                        onClick={(e) => { e.stopPropagation(); toggleLike(apiFileTrackId(entry.path)) }}
                        title="Unlike"
                      >
                        <Heart size={13} fill="currentColor" />
                      </button>
                    )}
                    {!isDir && entry.size != null && (
                      <span className="hidden md:inline-block text-text-muted text-xs shrink-0 w-14 text-right">{(entry.size / 1_048_576).toFixed(1)} MB</span>
                    )}
                    {!isDir && <span className="hidden md:inline-block text-center text-[10px] uppercase tracking-wide text-text-muted bg-surface-overlay px-1.5 py-0.5 rounded shrink-0 w-12">{ext}</span>}
                  </div>
                )
              })}
            </div>
          ) : (
            /* ── Grid view ────────────────────────────────────────────────────── */
            <div className="grid gap-3 pt-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              {currentPath && !isSearching && (
                <button onClick={goBack} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-surface-overlay hover:bg-surface-raised transition-colors">
                  <div className="w-full aspect-square flex items-center justify-center"><FolderOpen size={40} className="text-text-muted" /></div>
                  <span className="text-text-muted text-xs">..</span>
                </button>
              )}
              {sortedEntries.map((entry) => {
                const isDir = entry.type === 'directory'
                const mt = isDir ? 'folder' : getMediaType(entry.name)
                const ext = getFileExt(entry.name).slice(1).toUpperCase()
                const isMedia = mt === 'image' || mt === 'video'
                const isSelected = selectedPaths.has(entry.path)
                const isLiked = mt === 'audio' && likedSet.has(apiFileTrackId(entry.path))
                return (
                  <div key={entry.path}
                    className={`group flex flex-col rounded-xl overflow-hidden transition-colors cursor-default ${
                      isSelected ? 'bg-accent/10 ring-2 ring-accent/40' : 'bg-surface-overlay hover:bg-surface-raised'
                    }`}
                    onClick={(e) => {
                      if (e.ctrlKey || e.metaKey) {
                        if (!selectMode) setSelectMode(true)
                        toggleSelect(entry.path)
                        return
                      }
                      if (selectMode) { toggleSelect(entry.path); return }
                      if (isDir) navigate(entry.path)
                      else if (isMedia) openLightbox(entry)
                      else if (mt === 'audio') handlePlay(entry)
                    }}
                    onContextMenu={e => { e.preventDefault(); openContextMenu(entry, e.clientX, e.clientY) }}
                    onTouchStart={() => handleLongPressStart(entry)}
                    onTouchEnd={handleLongPressEnd}
                  >
                    {/* Thumb */}
                    <div className="relative w-full aspect-square bg-surface-raised flex items-center justify-center overflow-hidden">
                      {isDir ? (
                        <Folder size={40} className={`transition-colors ${isSelected ? 'text-accent' : 'text-text-secondary group-hover:text-accent'}`} />
                      ) : mt === 'audio' ? (
                        <>
                          <img src={buildCoverArtUrl(entry.path)} alt="" className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          {!selectMode && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                              {playing === entry.path
                                ? <Loader2 size={24} className="text-white animate-spin" />
                                : <Play size={24} fill="white" className="text-white ml-0.5" />}
                            </div>
                          )}
                        </>
                      ) : mt === 'image' ? (
                        <>
                          <img src={buildStreamUrl(entry.path)} alt={entry.name} className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          {!selectMode && (
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <div className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                                <ImageIcon size={16} className="text-white" />
                              </div>
                            </div>
                          )}
                        </>
                      ) : mt === 'video' ? (
                        <>
                          <Video size={36} className="text-text-muted" />
                          {!selectMode && (
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <div className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                                <Play size={16} fill="white" className="text-white ml-0.5" />
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-xs uppercase text-text-muted">{ext}</span>
                      )}
                      {/* Checkbox overlay (select mode) */}
                      {selectMode && (
                        <div className="absolute top-1.5 left-1.5 z-10">
                          {isSelected
                            ? <CheckSquare2 size={18} className="text-accent drop-shadow" />
                            : <Square size={18} className="text-white/70 drop-shadow" />}
                        </div>
                      )}
                      {/* Liked indicator */}
                      {isLiked && (
                        <button
                          className="absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center"
                          onClick={(e) => { e.stopPropagation(); toggleLike(apiFileTrackId(entry.path)) }}
                          title="Unlike"
                        >
                          <Heart size={12} fill="currentColor" className="text-accent" />
                        </button>
                      )}
                    </div>
                    {/* Label */}
                    <div className="px-2 py-2">
                      <p className="text-text-primary text-xs font-medium truncate">{entry.name}</p>
                      {!isDir && <p className="text-text-muted text-[10px] uppercase tracking-wide mt-0.5">{ext}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>}

        {/* Selection action bar */}
        {selectMode && (
          <div className="shrink-0 border-t border-[var(--border)] bg-surface px-4 py-2.5 flex items-center gap-2">
            <span className="text-sm text-text-primary font-medium flex-1">
              {selectedPaths.size} {selectedPaths.size === 1 ? 'item' : 'items'} selected
            </span>
            <button
              onClick={() => setSelectedPaths(new Set(sortedEntries.map(e => e.path)))}
              className="text-xs text-text-muted hover:text-text-primary px-2 py-1 rounded transition-colors"
            >
              Select all
            </button>
            <button
              onClick={() => setSelectedPaths(new Set())}
              className="text-xs text-text-muted hover:text-text-primary px-2 py-1 rounded transition-colors"
            >
              Clear
            </button>
            <button
              onClick={downloadZip}
              disabled={selectedPaths.size === 0 || zipStatus === 'starting' || zipStatus === 'zipping'}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-medium disabled:opacity-50 transition-opacity hover:opacity-90"
            >
              {zipStatus === 'starting' || zipStatus === 'zipping' ? (
                <><Loader2 size={13} className="animate-spin" /> {zipStatus === 'starting' ? 'Starting…' : 'Zipping…'}</>
              ) : zipStatus === 'done' ? (
                <><Check size={13} /> Done</>
              ) : zipStatus === 'error' ? (
                <><X size={13} /> Error</>
              ) : (
                <><PackageOpen size={13} /> Download ZIP</>
              )}
            </button>
            <button
              onClick={exitSelectMode}
              className="p-1.5 rounded-lg hover:bg-surface-overlay transition-colors"
              title="Exit selection"
            >
              <X size={15} className="text-text-muted" />
            </button>
          </div>
        )}
      </div>

      {lightboxIndex >= 0 && lightboxItems.length > 0 && (
        <MediaLightbox
          items={lightboxItems}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(-1)}
          onNav={setLightboxIndex}
        />
      )}

      {!localMode && ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} />
          <div
            ref={ctxMenuRef}
            className="fixed z-50 bg-surface border border-[var(--border)] rounded-xl shadow-2xl py-1 min-w-[180px]"
            style={{ left: ctxMenuPos.left, top: ctxMenuPos.top }}
            onClick={e => e.stopPropagation()}
          >
            {getMediaType(ctxMenu.entry.name) === 'audio' && (
              <>
                <button onClick={() => { handlePlay(ctxMenu.entry); setCtxMenu(null) }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-text-primary hover:bg-surface-overlay transition-colors">
                  <Play size={14} className="text-text-muted" /> Play
                </button>
                <button onClick={() => { addToQueue(fileToTrack(ctxMenu.entry)); setCtxMenu(null) }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-text-primary hover:bg-surface-overlay transition-colors">
                  <ListPlus size={14} className="text-text-muted" /> Add to queue
                </button>
                <button onClick={() => { toggleLike(apiFileTrackId(ctxMenu.entry.path)); setCtxMenu(null) }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-text-primary hover:bg-surface-overlay transition-colors">
                  <Heart size={14} fill={likedTrackIds.includes(apiFileTrackId(ctxMenu.entry.path)) ? 'currentColor' : 'none'}
                    className={likedTrackIds.includes(apiFileTrackId(ctxMenu.entry.path)) ? 'text-accent' : 'text-text-muted'} />
                  {likedTrackIds.includes(apiFileTrackId(ctxMenu.entry.path)) ? 'Unlike' : 'Like'}
                </button>
                {trackerMatches.get(ctxMenu.entry.path) != null && (
                  <button onClick={() => { openSongInfo(ctxMenu.entry); setCtxMenu(null) }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-text-primary hover:bg-surface-overlay transition-colors">
                    <Info size={14} className="text-text-muted" /> Find in Tracker
                  </button>
                )}
                {canEdit && (
                  <button onClick={async () => {
                    const title = ctxMenu.entry.name.replace(/\.[^.]+$/, '')
                    setCtxMenu(null)
                    try {
                      const data = await apiFetch<JWApiPaginatedResponse>('/songs/', { search: title, page_size: 1 })
                      const id = data.results[0]?.id
                      if (id) { setPendingEditorSongId(id); setActiveView('editor') }
                    } catch {}
                  }} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-text-primary hover:bg-surface-overlay transition-colors">
                    <Pencil size={14} className="text-text-muted" /> Edit
                  </button>
                )}
                <div className="border-t border-[var(--border)] my-1" />
              </>
            )}
            <button onClick={() => enterSelectMode(ctxMenu.entry)}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-text-primary hover:bg-surface-overlay transition-colors">
              <CheckSquare2 size={14} className="text-text-muted" /> Select
            </button>
            <button onClick={() => { copyLink(ctxMenu.entry); setCtxMenu(null) }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-text-primary hover:bg-surface-overlay transition-colors">
              <Link size={14} className="text-text-muted" /> Copy link
            </button>
            {ctxMenu.entry.type !== 'directory' && (
              <button onClick={() => { handleDownload(ctxMenu.entry); setCtxMenu(null) }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-text-primary hover:bg-surface-overlay transition-colors">
                <Download size={14} className="text-text-muted" /> Download
              </button>
            )}
          </div>
        </>
      )}
      {infoSong && (
        <SongInfoModal
          song={infoSong}
          onClose={() => setInfoSong(null)}
          onEdit={canEdit ? (songId) => {
            setInfoSong(null)
            setPendingEditorSongId(songId)
            setActiveView('editor')
          } : undefined}
        />
      )}
    </>
  )
}
