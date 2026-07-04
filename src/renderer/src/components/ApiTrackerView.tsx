import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react'
import {
  Search, Play, Loader2, Music2, X, Check,
  LayoutList, LayoutGrid, Info, ListPlus, PanelLeft,
  ChevronUp, ChevronDown, MoreHorizontal, Plus, ListMusic, PackageOpen,
  CheckSquare2, Square, Link2, Layers,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { AlbumArtThumbnail } from './AlbumArtThumbnail'
import SongInfoModal from './SongInfoModal'
import SongContextMenu from './SongContextMenu'
import { CompactGroupRow, useExpandedGroups } from './CompactGroupRow'
import {
  apiFetch, songToTrack, parseDuration, CATEGORY_LABELS, JWAPI_BASE,
  JWApiSong, JWApiPaginatedResponse, JWApiStats, JWApiEra,
} from '../lib/juicewrldApi'
import { fisherYates } from '../store/queueSlice'
import { Track } from '../types'
import * as userApi from '../lib/userApi'
import { versionsEnabled, linkSongVersion, getOwnVersionMeta, setGroupVersionTitle } from '../lib/versionsApi'
import type { SongVersionMeta } from '../lib/versionsApi'
import { fetchAllCompactGroups, filterCompactGroups } from '../lib/compactGroups'
import type { CompactGroup } from '../lib/compactGroups'

type Category = 'released' | 'unreleased' | 'unsurfaced' | 'recording_session' | ''
type ViewMode = 'list' | 'grid'

const CATEGORY_COLORS: Record<string, string> = {
  released:          'text-emerald-400 bg-emerald-400/10 border-emerald-400/25',
  unreleased:        'text-blue-400   bg-blue-400/10   border-blue-400/25',
  unsurfaced:        'text-amber-400  bg-amber-400/10  border-amber-400/25',
  recording_session: 'text-purple-400 bg-purple-400/10 border-purple-400/25',
}

// A compact-view group bundles several versions of one song, each of which
// can sit in a different category — the group as a whole is labeled by
// whichever category ranks highest here (a released version anywhere in the
// group makes the whole group "Released", even if other versions are
// unreleased/session/unsurfaced; same logic cascades down the list).
const GROUP_CATEGORY_PRIORITY: Category[] = ['released', 'unreleased', 'recording_session', 'unsurfaced']
function groupCategory(members: { item: JWApiSong }[]): Category {
  const present = new Set(members.map(m => m.item.category as Category))
  return GROUP_CATEGORY_PRIORITY.find(c => present.has(c)) ?? 'unsurfaced'
}

const PAGE_SIZE = 50
const LS_TRACKER_VIEW = 'api-tracker:viewMode'
const LS_TRACKER_SIDEBAR = 'api-tracker:showSidebar'
const LS_TRACKER_SEARCH  = 'api-tracker:search'

function formatDur(secs: number): string {
  if (!secs) return '--:--'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ─── Stats bar ────────────────────────────────────────────────────────────────
function StatsBar({ stats }: { stats: JWApiStats | null }): JSX.Element {
  if (!stats) return <div className="h-8 bg-surface-raised animate-pulse rounded-xl mb-3" />
  const cats: [string, number][] = [
    ['Released', stats.category_stats.released],
    ['Unreleased', stats.category_stats.unreleased],
    ['Unsurfaced', stats.category_stats.unsurfaced],
    ['Sessions', stats.category_stats.recording_session],
  ]
  return (
    <div className="flex items-center gap-3 mb-3 px-1 overflow-x-auto no-scrollbar">
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-text-primary font-bold text-base">{stats.total_songs.toLocaleString()}</span>
        <span className="text-text-muted text-xs">songs</span>
      </div>
      <div className="w-px h-4 bg-[var(--border)] shrink-0" />
      {cats.map(([label, count]) => (
        <div key={label} className="flex items-center gap-1 shrink-0">
          <span className="text-text-muted text-xs">{label}</span>
          <span className="text-text-secondary text-xs font-medium">{count.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Category sidebar ─────────────────────────────────────────────────────────
const CAT_SIDEBAR = [
  { key: '' as Category,                label: 'All' },
  { key: 'released' as Category,        label: 'Released' },
  { key: 'unreleased' as Category,      label: 'Unreleased' },
  { key: 'unsurfaced' as Category,      label: 'Unsurfaced' },
  { key: 'recording_session' as Category, label: 'Sessions' },
]

function CategorySidebar({
  stats, eras, selectedCategory, selectedEra, onCategory, onEra,
}: {
  stats: JWApiStats | null
  eras: JWApiEra[]
  selectedCategory: Category
  selectedEra: string
  onCategory: (c: Category) => void
  onEra: (e: string) => void
}): JSX.Element {
  const counts: Record<string, number | undefined> = {
    '':                stats?.total_songs,
    released:          stats?.category_stats.released,
    unreleased:        stats?.category_stats.unreleased,
    unsurfaced:        stats?.category_stats.unsurfaced,
    recording_session: stats?.category_stats.recording_session,
  }

  return (
    <div className="w-44 shrink-0 border-r border-[var(--border)] overflow-y-auto flex flex-col py-2">
      <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted px-3 pt-1 pb-2">Category</p>
      {CAT_SIDEBAR.map((cat) => (
        <button
          key={cat.key}
          onClick={() => onCategory(cat.key)}
          className={`flex items-center justify-between px-3 py-1.5 text-sm transition-colors text-left ${
            selectedCategory === cat.key
              ? 'text-accent font-semibold bg-accent/5'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised'
          }`}
        >
          <span className="truncate">{cat.label}</span>
          {counts[cat.key] !== undefined && (
            <span className="text-text-muted text-[10px] tabular-nums ml-1">{counts[cat.key]!.toLocaleString()}</span>
          )}
        </button>
      ))}

      {eras.length > 0 && (
        <>
          <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted px-3 pt-4 pb-2">Era</p>
          <button
            onClick={() => onEra('')}
            className={`flex items-center px-3 py-1.5 text-sm transition-colors text-left ${
              !selectedEra ? 'text-accent font-semibold bg-accent/5' : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised'
            }`}
          >
            All eras
          </button>
          {eras.map((era) => (
            <button
              key={era.id}
              onClick={() => onEra(era.name)}
              className={`flex items-center px-3 py-1.5 text-sm transition-colors text-left ${
                selectedEra === era.name ? 'text-accent font-semibold bg-accent/5' : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised'
              }`}
            >
              <span className="truncate">{era.name}</span>
            </button>
          ))}
        </>
      )}
    </div>
  )
}

// ─── Context menu ─────────────────────────────────────────────────────────────
// Per-song right-click menu lives in SongContextMenu.tsx (shared across every
// place a song can be right-clicked — Tracker, Liked Songs, Playlists, the
// Player bar, WRLD). Only the bulk multi-select menu below is local to the
// Tracker, since bulk actions don't apply anywhere else.
interface BulkContextMenuState {
  x: number
  y: number
  showPlaylists: boolean
}

// Hoisted to module scope — defining this inside SongContextMenu's render body
// would give it a new function identity every render, causing React to
// unmount/remount every menu item button (and flicker any :hover state) on
// each re-render rather than just updating it.
function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }): JSX.Element {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors"
    >
      {icon}
      {label}
    </button>
  )
}

function BulkContextMenu({
  state,
  onClose,
  count,
  onAddToQueue,
  onDownloadZip,
  onTogglePlaylists,
  playlists,
  account,
  onAddToPlaylist,
  onLogin,
  canLinkVersions,
  onLinkVersions,
  canAddToPlaylist,
  excludedCount,
  contained,
}: {
  state: BulkContextMenuState
  onClose: () => void
  count: number
  onAddToQueue: () => void
  onDownloadZip: () => void
  onTogglePlaylists: () => void
  playlists: userApi.PlaylistSummary[]
  account: userApi.AccountUser | null
  onAddToPlaylist: (id: number) => void
  onLogin: () => void
  canLinkVersions: boolean
  onLinkVersions: () => void
  /** False when every selected song is a session/unsurfaced (playlists
   *  don't support those) — hides "Add to playlist" entirely. */
  canAddToPlaylist: boolean
  /** How many selected songs are session/unsurfaced and get skipped. */
  excludedCount: number
  /** Playlist ids that already contain every eligible selected song. */
  contained: Set<number>
}): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handle = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handle)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handle)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const menuWidth = 208
  const menuHeight = state.showPlaylists ? 320 : 160
  const top = Math.max(8, Math.min(state.y, window.innerHeight - menuHeight - 8))
  const left = Math.max(8, Math.min(state.x, window.innerWidth - menuWidth - 8))

  return (
    <div
      ref={menuRef}
      style={{ position: 'fixed', zIndex: 9999, top, left }}
      className="w-52 bg-surface border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden py-1"
    >
      <div className="px-3 py-2 border-b border-[var(--border)] mb-1">
        <p className="text-text-primary text-xs font-semibold truncate">{count} {count === 1 ? 'song' : 'songs'} selected</p>
      </div>

      {state.showPlaylists ? (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); onTogglePlaylists() }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            <ChevronDown size={12} className="rotate-90" /> Back
          </button>
          {excludedCount > 0 && (
            <p className="px-3 pb-1.5 text-[11px] text-text-muted">
              {excludedCount} session/unsurfaced song{excludedCount === 1 ? '' : 's'} excluded
            </p>
          )}
          {!account ? (
            <div className="px-3 pb-2">
              <p className="text-xs text-text-muted mb-2">Log in to save to playlists.</p>
              <button
                onClick={(e) => { e.stopPropagation(); onLogin() }}
                className="w-full py-1.5 rounded-lg bg-accent/15 text-accent text-xs font-semibold"
              >
                Log in
              </button>
            </div>
          ) : (
            <div className="max-h-44 overflow-y-auto">
              {playlists.length === 0 && (
                <p className="px-3 py-2 text-xs text-text-muted">No playlists yet.</p>
              )}
              {playlists.map((p) => {
                const allIn = contained.has(p.id)
                return (
                  <button
                    key={p.id}
                    onClick={(e) => { e.stopPropagation(); onAddToPlaylist(p.id) }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors"
                  >
                    <ListMusic size={13} className={`shrink-0 ${allIn ? 'text-accent' : 'text-text-muted'}`} />
                    <span className="flex-1 truncate text-xs">{p.name}</span>
                    {allIn && <Check size={12} className="text-accent shrink-0" />}
                  </button>
                )
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <MenuItem icon={<ListPlus size={14} />} label="Add to queue" onClick={onAddToQueue} />
          {canAddToPlaylist && (
            <MenuItem icon={<Plus size={14} />} label="Add to playlist" onClick={onTogglePlaylists} />
          )}
          {canLinkVersions && (
            <MenuItem icon={<Link2 size={14} />} label="Link versions" onClick={onLinkVersions} />
          )}
          <div className="my-1 border-t border-[var(--border)]" />
          <MenuItem icon={<PackageOpen size={14} />} label="Download ZIP" onClick={onDownloadZip} />
        </>
      )}
    </div>
  )
}

// ─── Action buttons (shared) ──────────────────────────────────────────────────
function SongActions({
  onInfo, onContextMenu, size = 14,
}: {
  onInfo: () => void
  onContextMenu: (e: React.MouseEvent) => void
  size?: number
}): JSX.Element {
  return (
    <>
      <button
        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-surface-raised text-text-muted hover:text-text-primary transition-all shrink-0"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onInfo() }}
        title="Song info"
      >
        <Info size={size} />
      </button>
      <button
        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-surface-raised text-text-muted hover:text-text-primary transition-all shrink-0"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onContextMenu(e) }}
        title="More options"
      >
        <MoreHorizontal size={size} />
      </button>
    </>
  )
}

// ─── Song row (list mode) ─────────────────────────────────────────────────────
const SongRow = memo(function SongRow({
  song, onPlay, onCategoryClick, onEraClick, onInfo, onContextMenu,
  selectMode, selected, onToggleSelect, versionLabel,
}: {
  song: JWApiSong
  onPlay: (song: JWApiSong) => void
  onCategoryClick: (cat: Category) => void
  onEraClick: (era: string) => void
  onInfo: (song: JWApiSong) => void
  onContextMenu: (song: JWApiSong, e: React.MouseEvent) => void
  selectMode: boolean
  selected: boolean
  onToggleSelect: (song: JWApiSong) => void
  /** Shown next to the title when this row is a member of a compact-view
   *  group (e.g. "v1", "TV Mix") — this song's own label within the group. */
  versionLabel?: string | null
}): JSX.Element {
  const track = songToTrack(song)
  const title = song.name
  const altTitles = song.track_titles ?? []
  const canPlay = !!song.path

  return (
    <div
      className={`group flex items-center gap-3 px-3 py-2.5 md:py-2 hover:bg-surface-overlay active:bg-surface-overlay rounded-lg transition-colors cursor-default ${selected ? 'bg-accent/10' : ''}`}
      onClick={() => onToggleSelect(song)}
      onDoubleClick={() => { if (!selectMode) onInfo(song) }}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(song, e) }}
    >
      {selectMode && (
        <div className="shrink-0">
          {selected
            ? <CheckSquare2 size={17} className="text-accent" />
            : <Square size={17} className="text-text-muted opacity-50" />}
        </div>
      )}

      {/* Cover art */}
      <div className="relative shrink-0 w-10 h-10 md:w-9 md:h-9 rounded overflow-hidden bg-surface-overlay">
        <AlbumArtThumbnail track={track} size={36} shimmer={false} />
        {canPlay && !selectMode && (
          <button
            className="absolute inset-0 items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex"
            onClick={(e) => { e.stopPropagation(); onPlay(song) }}
            title="Play"
          >
            <Play size={14} fill="white" className="text-white ml-0.5" />
          </button>
        )}
      </div>

      {/* Title */}
      <div className="flex-1 min-w-[100px]">
        <p className="text-text-primary text-sm font-medium truncate">
          {title}
          {versionLabel && <span className="text-text-muted font-normal"> ({versionLabel})</span>}
        </p>
        <p className="md:hidden text-text-muted text-xs truncate mt-0.5">
          {song.credited_artists || 'Juice WRLD'}
          {song.era?.name ? ` · ${song.era.name}` : ''}
        </p>
        {altTitles.length > 0 && (
          <p className="hidden md:block text-text-muted text-xs truncate">{altTitles.join(' · ')}</p>
        )}
      </div>

      {/* Desktop-only columns */}
      <span className="hidden md:block text-text-muted text-xs truncate w-32 shrink-0">{song.credited_artists || 'Juice WRLD'}</span>
      {song.era?.name ? (
        selectMode ? (
          <span className="hidden md:block text-text-muted text-xs truncate w-36 shrink-0">{song.era.name}</span>
        ) : (
          <button
            onClick={() => onEraClick(song.era!.name)}
            className="hidden md:block text-text-muted text-xs truncate w-36 shrink-0 text-left hover:text-accent transition-colors"
            title={`Filter by era: ${song.era.name}`}
          >
            {song.era.name}
          </button>
        )
      ) : (
        <span className="hidden md:block text-text-muted text-xs truncate w-36 shrink-0">—</span>
      )}
      {selectMode ? (
        <span className={`hidden md:block text-xs px-1.5 py-0.5 rounded border shrink-0 w-24 text-center ${CATEGORY_COLORS[song.category] ?? 'text-text-muted bg-surface border-[var(--border)]'}`}>
          {CATEGORY_LABELS[song.category] ?? song.category}
        </span>
      ) : (
        <button
          onClick={() => onCategoryClick(song.category as Category)}
          className={`hidden md:block text-xs px-1.5 py-0.5 rounded border shrink-0 w-24 text-center transition-colors hover:opacity-80 ${CATEGORY_COLORS[song.category] ?? 'text-text-muted bg-surface border-[var(--border)]'}`}
          title="Filter by category"
        >
          {CATEGORY_LABELS[song.category] ?? song.category}
        </button>
      )}
      <span className="hidden md:block text-text-muted text-xs w-12 text-right shrink-0 tabular-nums">{formatDur(parseDuration(song.length))}</span>

      {/* Desktop action buttons */}
      {!selectMode && (
        <div className="hidden md:flex items-center gap-0.5 shrink-0">
          <SongActions onInfo={() => onInfo(song)} onContextMenu={(e) => onContextMenu(song, e)} />
        </div>
      )}

      {/* Mobile: more + play */}
      {!selectMode && (
        <div className="md:hidden flex items-center shrink-0">
          <button
            className="p-2 text-text-muted active:text-accent transition-colors"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onContextMenu(song, e) }}
            title="More options"
          >
            <MoreHorizontal size={16} />
          </button>
          {canPlay && (
            <button
              className="p-2 text-text-muted active:text-accent transition-colors"
              onClick={() => onPlay(song)}
              title="Play"
            >
              <Play size={17} />
            </button>
          )}
        </div>
      )}
    </div>
  )
})
// Memoized so toggling one selection only re-renders that row, not every
// rendered row. This depends on all the callbacks passed in (onPlay, onInfo,
// onContextMenu, onCategoryClick, onEraClick, onToggleSelect) being stable
// (useCallback) — otherwise the default shallow prop compare never matches and
// the memo is a no-op. Without it, compact view froze when selecting songs
// across many expanded groups.

// ─── Version title prompt (shown after linking, if the group has no title yet) ─
function VersionTitlePromptModal({
  saving, onSave, onSkip,
}: {
  saving: boolean
  onSave: (title: string) => void
  onSkip: () => void
}): JSX.Element {
  const [value, setValue] = useState('')
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onSkip() }}
    >
      <div className="bg-surface border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-sm p-5">
        <h3 className="text-text-primary text-sm font-semibold mb-1">Name this version group</h3>
        <p className="text-text-muted text-xs mb-3">
          These songs are now linked as versions of each other, but the group has no title yet (e.g. "TV Mix", "Alternate").
        </p>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && value.trim() && !saving) onSave(value.trim()) }}
          placeholder="Version title"
          className="w-full bg-surface-overlay border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none mb-3"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onSkip} disabled={saving} className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors disabled:opacity-50">
            Skip
          </button>
          <button
            onClick={() => value.trim() && onSave(value.trim())}
            disabled={!value.trim() || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium disabled:opacity-50"
          >
            {saving && <Loader2 size={12} className="animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Song card (grid mode) ────────────────────────────────────────────────────
function SongCard({
  song, onPlay, onCategoryClick, onEraClick, onInfo, onContextMenu,
  selectMode, selected, onToggleSelect,
}: {
  song: JWApiSong
  onPlay: (song: JWApiSong) => void
  onCategoryClick: (cat: Category) => void
  onEraClick: (era: string) => void
  onInfo: (song: JWApiSong) => void
  onContextMenu: (song: JWApiSong, e: React.MouseEvent) => void
  selectMode: boolean
  selected: boolean
  onToggleSelect: (song: JWApiSong) => void
}): JSX.Element {
  const track = songToTrack(song)
  const title = song.name
  const canPlay = !!song.path

  return (
    <div
      className={`group flex flex-col rounded-xl overflow-hidden bg-surface-overlay hover:bg-surface-raised transition-colors cursor-default ${selected ? 'ring-2 ring-accent' : ''}`}
      onClick={() => onToggleSelect(song)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(song, e) }}
    >
      <div className="relative w-full aspect-square bg-surface-raised">
        <AlbumArtThumbnail track={track} size={160} shimmer={false} />
        {selectMode && (
          <div className="absolute top-1.5 left-1.5 z-10">
            {selected
              ? <CheckSquare2 size={18} className="text-accent drop-shadow" />
              : <Square size={18} className="text-white/70 drop-shadow" />}
          </div>
        )}
        {canPlay && !selectMode && (
          <button
            className="absolute inset-0 items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex"
            onClick={(e) => { e.stopPropagation(); onPlay(song) }}
            title="Play"
          >
            <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center shadow-lg">
              <Play size={18} fill="black" className="text-black ml-0.5" />
            </div>
          </button>
        )}
        {canPlay && !selectMode && (
          <button
            className="md:hidden absolute bottom-1.5 right-1.5 w-8 h-8 rounded-full bg-accent flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            onClick={(e) => { e.stopPropagation(); onPlay(song) }}
          >
            <Play size={14} fill="black" className="text-black ml-0.5" />
          </button>
        )}
        {!selectMode && (
          <button
            className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 md:flex hidden transition-opacity"
            onClick={(e) => { e.stopPropagation(); onContextMenu(song, e) }}
            title="More options"
          >
            <MoreHorizontal size={13} className="text-white" />
          </button>
        )}
      </div>

      <div className="p-2.5 flex flex-col gap-1 min-w-0">
        <p className="text-text-primary text-xs font-semibold truncate leading-tight">{title}</p>
        <p className="text-text-muted text-[10px] truncate">{song.credited_artists || 'Juice WRLD'}</p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {song.era?.name && (
            <button
              onClick={(e) => { e.stopPropagation(); if (!selectMode) onEraClick(song.era!.name) }}
              className="text-[9px] uppercase tracking-wide text-text-muted bg-surface px-1.5 py-0.5 rounded border border-[var(--border)] truncate max-w-full hover:text-accent hover:border-accent/40 transition-colors"
              title={`Filter by era: ${song.era.name}`}
            >
              {song.era.name}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); if (!selectMode) onCategoryClick(song.category as Category) }}
            className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 transition-colors hover:opacity-80 ${CATEGORY_COLORS[song.category] ?? 'text-accent/80 bg-accent/10 border-accent/20'}`}
          >
            {CATEGORY_LABELS[song.category] ?? song.category}
          </button>
          {!selectMode && (
          <div className="ml-auto flex items-center gap-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); onInfo(song) }}
              className="p-1 rounded hover:bg-surface-raised text-text-muted hover:text-text-primary transition-colors"
              title="Song info"
            >
              <Info size={11} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onContextMenu(song, e) }}
              className="p-1 rounded hover:bg-surface-raised text-text-muted hover:text-text-primary transition-colors"
              title="More options"
            >
              <MoreHorizontal size={11} />
            </button>
          </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────
export default function ApiTrackerView(): JSX.Element {
  const {
    playTrack, startRadio, addToQueue, account, shuffle,
    apiTrackerCategory, setApiTrackerCategory,
    apiTrackerEra, setApiTrackerEra,
    setActiveView, setApiFilesPath, setPendingEditorSongId,
    playlists, refreshPlaylists, setShowUserAuth,
  } = useStore(useShallow(s => ({
    playTrack: s.playTrack, startRadio: s.startRadio, addToQueue: s.addToQueue,
    account: s.account, shuffle: s.shuffle,
    apiTrackerCategory: s.apiTrackerCategory, setApiTrackerCategory: s.setApiTrackerCategory,
    apiTrackerEra: s.apiTrackerEra, setApiTrackerEra: s.setApiTrackerEra,
    setActiveView: s.setActiveView, setApiFilesPath: s.setApiFilesPath,
    setPendingEditorSongId: s.setPendingEditorSongId,
    playlists: s.playlists, refreshPlaylists: s.refreshPlaylists, setShowUserAuth: s.setShowUserAuth,
  })))

  const canEdit = !!(account?.is_editor || account?.is_administrator)

  const [selectedSong, setSelectedSong] = useState<JWApiSong | null>(null)
  const [contextMenu, setContextMenu] = useState<{ song: JWApiSong; x: number; y: number } | null>(null)
  const [bulkContextMenu, setBulkContextMenu] = useState<BulkContextMenuState | null>(null)

  // Multi-select — mirrors the same pattern used in ApiFilesView's bulk select.
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Map<number, JWApiSong>>(new Map())
  const [bulkZipStatus, setBulkZipStatus] = useState<'idle' | 'zipping' | 'done' | 'error'>('idle')
  const [showBulkPlaylists, setShowBulkPlaylists] = useState(false)
  const [bulkLinkStatus, setBulkLinkStatus] = useState<'idle' | 'linking' | 'done' | 'error'>('idle')
  // Shown after a link completes if the resulting group still has no
  // version_title — untitled groups are functionally useless in compact
  // view (see getAllVersionGroups, which only surfaces titled groups).
  const [titlePromptGroupId, setTitlePromptGroupId] = useState<number | null>(null)
  const [savingTitlePrompt, setSavingTitlePrompt] = useState(false)

  // useCallback so SongRow's memo isn't defeated — a fresh identity here would
  // re-render every row on each selection toggle (functional setState keeps it
  // dependency-free and stable).
  const toggleSelect = useCallback((song: JWApiSong): void => {
    setSelectMode(true)
    setSelected(prev => {
      const next = new Map(prev)
      if (next.has(song.id)) next.delete(song.id)
      else next.set(song.id, song)
      return next
    })
  }, [])

  const exitSelectMode = (): void => {
    setSelectMode(false)
    setSelected(new Map())
    setBulkZipStatus('idle')
    setShowBulkPlaylists(false)
  }

  // Deselecting the last song (via row/card click, "Clear", context menu
  // unlink, etc.) turns select mode back off on its own, so there's no
  // separate "Cancel" affordance needed once you're in it — Escape still
  // works too (see the effect below).
  useEffect(() => {
    if (selectMode && selected.size === 0) setSelectMode(false)
  }, [selectMode, selected])

  // Compact view — shows only songs grouped into a titled version group,
  // collapsed to one row per group; expanding it reveals the individual
  // songs ("versions") nested underneath. Deliberately fetched independently
  // of the Tracker's own paginated `songs` list (see fetchAllCompactGroups)
  // — tying it to sortedSongs previously meant a group's members could be
  // missed if they hadn't scrolled into view yet, and re-querying on every
  // page load compounded into serious lag as more pages loaded.
  const [compactView, setCompactView] = useState(false)
  const [compactGroups, setCompactGroups] = useState<CompactGroup<JWApiSong>[]>([])
  const [loadingCompact, setLoadingCompact] = useState(false)
  // How compact-view groups are ordered — driven by clicking the "Name" /
  // "Versions" column headers (like the normal list's sortable headers), not
  // a separate control. field null keeps the fetch order (group_id asc).
  type CompactSortField = 'name' | 'versions'
  const [compactSort, setCompactSort] = useState<{ field: CompactSortField | null; dir: 'asc' | 'desc' }>({ field: null, dir: 'asc' })

  // Click cycles: first click sorts by that field (Versions starts most-first,
  // Name starts A–Z), second click flips direction, third click clears back
  // to default order — mirroring the flat list's SortBtn.
  const handleCompactSort = (field: CompactSortField): void => {
    const firstDir: 'asc' | 'desc' = field === 'versions' ? 'desc' : 'asc'
    setCompactSort(prev => {
      if (prev.field !== field) return { field, dir: firstDir }
      if (prev.dir === firstDir) return { field, dir: firstDir === 'asc' ? 'desc' : 'asc' }
      return { field: null, dir: 'asc' }
    })
  }
  const { expanded: expandedGroups, toggle: toggleGroupExpanded, clear: clearExpandedGroups } = useExpandedGroups()

  useEffect(() => {
    if (!compactView || !versionsEnabled) { setCompactGroups([]); return }
    let cancelled = false
    setLoadingCompact(true)
    fetchAllCompactGroups().then(groups => {
      if (!cancelled) { setCompactGroups(groups); setLoadingCompact(false) }
    })
    return () => { cancelled = true }
  }, [compactView])

  const [stats, setStats] = useState<JWApiStats | null>(null)
  const [eras, setEras] = useState<JWApiEra[]>([])
  const [songs, setSongs] = useState<JWApiSong[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const sentinelRef = useRef<HTMLDivElement>(null)
  // Refs for scroll logic — avoids stale closure issues in observer callback
  const hasMoreRef = useRef(false)
  const loadingRef = useRef(true)
  const sentinelVisibleRef = useRef(false)
  // Compact view renders far less content than the underlying song list, so
  // the sentinel stays permanently visible and would otherwise auto-page
  // through the entire library in the background — pause that while active.
  const compactViewRef = useRef(false)
  useEffect(() => { compactViewRef.current = compactView }, [compactView])

  const [viewMode, setViewModeState] = useState<ViewMode>(
    () => (localStorage.getItem(LS_TRACKER_VIEW) as ViewMode) || 'list'
  )
  const [showSidebar, setShowSidebarState] = useState<boolean>(
    () => localStorage.getItem(LS_TRACKER_SIDEBAR) !== 'false'
  )

  const setViewMode = (v: ViewMode): void => { setViewModeState(v); localStorage.setItem(LS_TRACKER_VIEW, v) }
  const setShowSidebar = (v: boolean): void => { setShowSidebarState(v); localStorage.setItem(LS_TRACKER_SIDEBAR, String(v)) }

  type OrderField = 'name' | 'credited_artists' | 'era__name' | 'category' | 'length'
  const [orderField, setOrderField] = useState<OrderField | null>(null)
  const [orderDir, setOrderDir] = useState<'asc' | 'desc'>('asc')

  // Reset accumulated songs and go back to page 1
  const resetSongs = useCallback((): void => {
    setSongs([])
    setPage(1)
  }, [])

  const handleSort = (field: OrderField): void => {
    if (orderField === field) {
      if (orderDir === 'desc') {
        // Third click: clear sort, go back to infinite scroll
        setOrderField(null); setOrderDir('asc'); resetSongs()
      } else {
        setOrderDir('desc')
      }
    } else {
      setOrderField(field); setOrderDir('asc')
    }
  }

  const [search, setSearch] = useState(() => localStorage.getItem(LS_TRACKER_SEARCH) || '')
  const [debouncedSearch, setDebouncedSearch] = useState(() => localStorage.getItem(LS_TRACKER_SEARCH) || '')
  const [category, setCategory] = useState<Category>('')
  const [era, setEra] = useState('')

  useEffect(() => {
    if (apiTrackerCategory) { setCategory(apiTrackerCategory as Category); setApiTrackerCategory('') }
    if (apiTrackerEra) { setEra(apiTrackerEra); setApiTrackerEra('') }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCategoryClick = useCallback((cat: Category) => { setCategory(cat); resetSongs() }, [resetSongs])
  const handleEraClick = useCallback((eraName: string) => { setEra(eraName); resetSongs() }, [resetSongs])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstDebounce = useRef(true)

  useEffect(() => { localStorage.setItem(LS_TRACKER_SEARCH, search) }, [search])

  useEffect(() => {
    apiFetch<JWApiStats>('/stats/').then(setStats).catch(console.error)
    apiFetch<JWApiEra[] | { results: JWApiEra[] }>('/eras/')
      .then((data) => setEras(Array.isArray(data) ? data : (data as { results: JWApiEra[] }).results ?? []))
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search)
      // Skip resetSongs on initial mount — only reset when user actually types
      if (isFirstDebounce.current) { isFirstDebounce.current = false; return }
      resetSongs()
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search, resetSongs])

  // ── SORT MODE: load the entire library sequentially, sort client-side ──────────
  // The API has no ordering param, so we fetch all pages and sort in memory.
  useEffect(() => {
    if (!orderField) return
    let cancelled = false
    loadingRef.current = true
    setLoading(true); setError(null); setSongs([]); setHasMore(false); setCount(0)
    ;(async () => {
      const all: JWApiSong[] = []
      let p = 1
      try {
        while (!cancelled) {
          const data = await apiFetch<JWApiPaginatedResponse>('/songs/', {
            searchall: debouncedSearch || undefined,
            category: category || undefined,
            era: era || undefined,
            page: p,
            page_size: 200, // bigger batches to reduce round-trips
          })
          if (cancelled) return
          all.push(...data.results)
          setSongs([...all]) // progressive display while loading
          setCount(data.count)
          if (!data.next) break
          p++
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) { loadingRef.current = false; setLoading(false) }
      }
    })()
    return () => { cancelled = true }
  }, [orderField, debouncedSearch, category, era])

  // ── SCROLL MODE: infinite scroll, accumulates pages ──────────────────────────
  useEffect(() => {
    if (orderField) return // sort mode handles fetching
    let cancelled = false
    loadingRef.current = true
    setLoading(true); setError(null)
    apiFetch<JWApiPaginatedResponse>('/songs/', {
      searchall: debouncedSearch || undefined,
      category: category || undefined,
      era: era || undefined,
      page,
      page_size: PAGE_SIZE,
    })
      .then((data) => {
        if (!cancelled) {
          setSongs((prev) => page === 1 ? data.results : [...prev, ...data.results])
          setCount(data.count)
          const more = data.next !== null
          setHasMore(more)
          hasMoreRef.current = more
        }
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => {
        if (!cancelled) {
          loadingRef.current = false
          setLoading(false)
          if (sentinelVisibleRef.current && hasMoreRef.current && !compactViewRef.current) {
            setPage((p) => p + 1)
          }
        }
      })
    return () => { cancelled = true }
  }, [debouncedSearch, category, era, page, orderField])

  // Observe sentinel for infinite scroll
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      sentinelVisibleRef.current = entry.isIntersecting
      // User scrolled to sentinel while we weren't loading
      if (entry.isIntersecting && hasMoreRef.current && !loadingRef.current && !compactViewRef.current) {
        setPage((p) => p + 1)
      }
    }, { threshold: 0.1 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Client-side sort applied over accumulated songs (sort mode only)
  const sortedSongs = useMemo(() => {
    if (!orderField) return songs
    return [...songs].sort((a, b) => {
      let av: string | number, bv: string | number
      switch (orderField) {
        case 'name':
          av = (a.track_titles?.[0] || a.name).toLowerCase()
          bv = (b.track_titles?.[0] || b.name).toLowerCase()
          break
        case 'credited_artists':
          av = (a.credited_artists || '').toLowerCase()
          bv = (b.credited_artists || '').toLowerCase()
          break
        case 'era__name':
          av = (a.era?.name || '').toLowerCase()
          bv = (b.era?.name || '').toLowerCase()
          break
        case 'category':
          av = a.category; bv = b.category
          break
        case 'length':
          av = parseDuration(a.length); bv = parseDuration(b.length)
          break
        default: return 0
      }
      const cmp = typeof av === 'number' ? av - (bv as number) : (av as string).localeCompare(bv as string)
      return orderDir === 'desc' ? -cmp : cmp
    })
  }, [songs, orderField, orderDir])

  // fetchAllCompactGroups is independent of the search box (it has to fetch
  // every group app-wide regardless), so the search query has to be applied
  // client-side afterward or typing while compact view is active would do
  // nothing.
  // Mirrors as much of the normal list's server-side `searchall` field
  // coverage as this client-side filter reasonably can — matching only
  // title/artist here made legitimate searches (e.g. by producer) come up
  // empty even though the normal (non-compact) list found them fine.
  const filteredCompactGroups = useMemo(() => {
    const filtered = filterCompactGroups(compactGroups, debouncedSearch, s => [
      s.track_titles?.join(' '), s.name, s.credited_artists, s.producers, s.engineers,
      s.era?.name, s.notes, s.additional_information, s.session_titles, s.original_key,
    ].filter(Boolean).join(' '))
    if (!compactSort.field) return filtered
    // Copy before sorting — filterCompactGroups may return the input array.
    const sorted = [...filtered]
    const dir = compactSort.dir === 'asc' ? 1 : -1
    if (compactSort.field === 'name') {
      sorted.sort((a, b) => a.title.localeCompare(b.title) * dir)
    } else {
      // Title tiebreak so equal-count groups keep a stable, readable order.
      sorted.sort((a, b) => (a.members.length - b.members.length) * dir || a.title.localeCompare(b.title))
    }
    return sorted
  }, [compactGroups, debouncedSearch, compactSort])

  const handlePlay = useCallback((song: JWApiSong) => {
    const track = songToTrack(song)
    // If shuffle is already on, start radio mode from this track instead of
    // loading the visible page into the queue.
    if (shuffle) {
      const rf = (!orderField && hasMore)
        ? { category, era, search: debouncedSearch, total: count }
        : null
      startRadio(track, rf)
      return
    }
    const playable = sortedSongs.filter((s) => !!s.path)
    const context = playable.map(songToTrack)
    const needsLazy = !orderField && hasMore
    playTrack(track, context.length > 0 ? context : [track], needsLazy ? {
      category, era, search: debouncedSearch,
      page: page + 1, hasMore: true, total: count,
    } : null, 'tracker')
  }, [playTrack, startRadio, shuffle, sortedSongs, category, era, debouncedSearch, count, hasMore, orderField, page])

  const handleInfo = useCallback((song: JWApiSong) => { setSelectedSong(song) }, [])
  const handleQueue = useCallback((track: Track) => { addToQueue(track) }, [addToQueue])

  const handleContextMenu = useCallback((song: JWApiSong, e: React.MouseEvent): void => {
    if (selectMode) {
      setSelected(prev => prev.has(song.id) ? prev : new Map(prev).set(song.id, song))
      setBulkContextMenu({ x: e.clientX, y: e.clientY, showPlaylists: false })
      return
    }
    setContextMenu({ song, x: e.clientX, y: e.clientY })
  }, [selectMode])

  // Right-clicking a compact-view group ("folder") acts on all its versions
  // at once — selects every member and opens the bulk menu (Add to queue /
  // playlist, Download ZIP, Link versions), the same menu you'd get from
  // multi-selecting those songs by hand.
  const handleGroupContextMenu = useCallback((group: CompactGroup<JWApiSong>, e: React.MouseEvent): void => {
    e.preventDefault()
    setSelected(new Map(group.members.map(m => [m.item.id, m.item])))
    setSelectMode(true)
    setBulkContextMenu({ x: e.clientX, y: e.clientY, showPlaylists: false })
  }, [])

  // ESC exits select mode
  useEffect(() => {
    if (!selectMode) return
    const onKeyDown = (e: KeyboardEvent): void => { if (e.key === 'Escape') exitSelectMode() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectMode])

  const selectedSongs = useMemo(() => [...selected.values()], [selected])
  // Sessions/unsurfaced songs can't go in playlists — same rule the
  // single-song menu already enforces (see canAddToPlaylist in
  // SongContextMenu.tsx). "Add to playlist" should reflect that instead of
  // silently dropping them during the actual add.
  const bulkEligibleSongs = useMemo(
    () => selectedSongs.filter(s => !['recording_session', 'unsurfaced'].includes(s.category)),
    [selectedSongs]
  )
  const canBulkAddToPlaylist = bulkEligibleSongs.length > 0

  // Which playlists already contain *every* eligible selected song — shown
  // as a checkmark so re-adding to a playlist the whole selection is
  // already in isn't a silent no-op.
  const [bulkContained, setBulkContained] = useState<Set<number>>(new Set())
  useEffect(() => {
    if (!account || !canBulkAddToPlaylist || playlists.length === 0 || !(showBulkPlaylists || bulkContextMenu?.showPlaylists)) {
      setBulkContained(new Set())
      return
    }
    const ids = bulkEligibleSongs.map(s => s.id)
    Promise.all(
      playlists.map(p =>
        userApi.getPlaylist(p.id)
          .then(d => {
            const memberIds = new Set((d.items ?? []).map(it => it.song.id))
            return { id: p.id, allIn: ids.every(id => memberIds.has(id)) }
          })
          .catch(() => ({ id: p.id, allIn: false }))
      )
    ).then(results => setBulkContained(new Set(results.filter(r => r.allIn).map(r => r.id))))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlists, account, bulkEligibleSongs, showBulkPlaylists, bulkContextMenu?.showPlaylists])

  const bulkAddToQueue = (): void => {
    // Skip unplayable songs (sessions/unsurfaced) — same rule as bulk playlist
    // add and the single-song menu.
    bulkEligibleSongs.filter(s => s.path).forEach(s => addToQueue(songToTrack(s)))
    exitSelectMode()
  }

  const bulkAddToPlaylist = async (playlistId: number): Promise<void> => {
    await Promise.all(bulkEligibleSongs.map(s => userApi.addToPlaylist(playlistId, s.id).catch(() => {})))
    await refreshPlaylists()
    exitSelectMode()
  }

  const bulkDownloadZip = async (): Promise<void> => {
    const paths = selectedSongs.map(s => s.path).filter(Boolean) as string[]
    if (paths.length === 0) return
    setBulkZipStatus('zipping')
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
        const a = document.createElement('a'); a.href = url; a.download = 'songs.zip'; a.click()
        URL.revokeObjectURL(url)
      } else {
        const data = await res.json()
        if (data.download_url) { const a = document.createElement('a'); a.href = data.download_url; a.download = 'songs.zip'; a.click() }
      }
      setBulkZipStatus('done')
    } catch {
      setBulkZipStatus('error')
    }
    setTimeout(() => setBulkZipStatus('idle'), 3000)
  }

  // Links every selected song together as versions of one another — pairing
  // each against the first selected song merges all of their groups (see
  // linkSongVersion's group-merge logic in versionsApi.ts). If none of them
  // already had a version_title, the merged group ends up untitled — prompt
  // for one rather than leaving a silently untitled (and in compact view,
  // invisible) group.
  const bulkLinkVersions = async (): Promise<void> => {
    const ids = selectedSongs.map(s => s.id)
    if (ids.length < 2) return
    setBulkLinkStatus('linking')
    try {
      const [first, ...rest] = ids
      for (const id of rest) await linkSongVersion(first, id, account?.display_name ?? null)
      const meta = await getOwnVersionMeta(first)
      if (meta && !meta.versionTitle) setTitlePromptGroupId(meta.groupId)
      setBulkLinkStatus('done')
    } catch {
      setBulkLinkStatus('error')
    }
    setTimeout(() => setBulkLinkStatus('idle'), 3000)
  }

  const handleShowInFiles = useCallback((song: JWApiSong): void => {
    if (!song.path) return
    const parts = song.path.split('/')
    const folderPath = parts.slice(0, -1).join('/')
    setApiFilesPath(folderPath)
    setActiveView('api-files')
  }, [setApiFilesPath, setActiveView])

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="px-4 md:px-5 pt-4 md:pt-5 pb-3 shrink-0">
        <h1 className="text-text-primary text-xl font-bold mb-1">Tracker</h1>
        <StatsBar stats={stats} />

        <div className="flex flex-col gap-2">
          {/* Search — uses searchall to include producers */}
          <div className="relative w-full">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Search songs, artists, producers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-surface-overlay text-text-primary text-sm pl-8 pr-8 py-2.5 md:py-2 rounded-lg outline-none focus:ring-1 ring-accent border border-transparent focus:border-accent/40 placeholder:text-text-muted"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Second row */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className={`hidden md:flex items-center gap-1.5 px-2.5 py-2.5 md:py-2 rounded-lg text-xs transition-colors shrink-0 ${
                showSidebar
                  ? 'bg-accent/15 text-accent border border-accent/30'
                  : 'bg-surface-overlay text-text-muted hover:text-text-secondary border border-transparent'
              }`}
              title="Toggle search settings"
            >
              <PanelLeft size={13} />
              <span className="hidden sm:inline">Search Settings</span>
            </button>

            <select
              value={category}
              onChange={(e) => { setCategory(e.target.value as Category); resetSongs() }}
              className="md:hidden flex-1 min-w-0 bg-surface-overlay text-text-primary text-sm px-3 py-2.5 rounded-lg outline-none border border-transparent focus:ring-1 ring-accent focus:border-accent/40 cursor-pointer"
            >
              <option value="">All categories</option>
              <option value="released">Released</option>
              <option value="unreleased">Unreleased</option>
              <option value="unsurfaced">Unsurfaced</option>
              <option value="recording_session">Sessions</option>
            </select>

            {versionsEnabled && (
              <button
                onClick={() => { setCompactView(v => !v); clearExpandedGroups() }}
                className={`flex items-center gap-1.5 px-2.5 py-2.5 md:py-2 rounded-lg text-xs transition-colors shrink-0 ${
                  compactView
                    ? 'bg-accent/15 text-accent border border-accent/30'
                    : 'bg-surface-overlay text-text-muted hover:text-text-secondary border border-transparent'
                }`}
                title="Collapse songs into their version groups"
              >
                <Layers size={13} />
                <span className="hidden sm:inline">Compact</span>
              </button>
            )}

            {!compactView && (
              <div className="flex items-center bg-surface-overlay rounded-lg p-0.5 shrink-0 ml-auto">
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 md:p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-surface-raised text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}
                  title="List view"
                >
                  <LayoutList size={16} />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 md:p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-surface-raised text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}
                  title="Grid view"
                >
                  <LayoutGrid size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Active filter chips */}
          {(category || era) && (
            <div className="flex gap-1.5 flex-wrap">
              {category && (
                <button
                  onClick={() => { setCategory(''); resetSongs() }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/15 text-accent text-xs font-medium"
                >
                  {CATEGORY_LABELS[category] ?? category}
                  <X size={10} />
                </button>
              )}
              {era && (
                <button
                  onClick={() => { setEra(''); resetSongs() }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/15 text-accent text-xs font-medium"
                >
                  {era}
                  <X size={10} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {showSidebar && (
          <div className="hidden md:flex min-h-0">
            <CategorySidebar
              stats={stats}
              eras={eras}
              selectedCategory={category}
              selectedEra={era}
              onCategory={(c) => { setCategory(c); resetSongs() }}
              onEra={(e) => { setEra(e); resetSongs() }}
            />
          </div>
        )}

        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Column headers — hidden in compact view: these sort the flat song
              list (handleSort), which has no effect on the grouped compact
              rows and just misleads. Compact view sorts via its own dropdown. */}
          {viewMode === 'list' && !compactView && (
            <div className="hidden md:block px-5 pb-1 shrink-0">
              {(() => {
                const SortBtn = ({ field, label, className }: { field: OrderField; label: string; className?: string }): JSX.Element => {
                  const active = orderField === field
                  return (
                    <button
                      onClick={() => handleSort(field)}
                      className={`flex items-center gap-0.5 text-xs font-medium uppercase tracking-wider transition-colors ${active ? 'text-accent' : 'text-text-muted hover:text-text-secondary'} ${className ?? ''}`}
                    >
                      {label}
                      {active
                        ? orderDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />
                        : <span className="w-2.5" />}
                    </button>
                  )
                }
                return (
                  <div className="flex items-center gap-3 px-3 py-1">
                    <div className="w-9 shrink-0" />
                    <SortBtn field="name" label="Title" className="flex-1" />
                    <SortBtn field="credited_artists" label="Artist" className="w-32 shrink-0" />
                    <SortBtn field="era__name" label="Era" className="w-36 shrink-0" />
                    <SortBtn field="category" label="Category" className="w-24 shrink-0 justify-center" />
                    <SortBtn field="length" label="Time" className="w-12 shrink-0 justify-end" />
                    <div className="w-14 shrink-0" />
                  </div>
                )
              })()}
            </div>
          )}

          {/* Song list / grid */}
          <div className="flex-1 overflow-y-auto px-3 md:px-5 pb-4">
            {compactView ? loadingCompact ? (
              <div className="flex items-center justify-center h-40 gap-2 text-text-muted">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">Loading version groups…</span>
              </div>
            ) : filteredCompactGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <Layers size={32} className="text-text-muted opacity-30" />
                <p className="text-text-muted text-sm">
                  {compactGroups.length === 0 ? 'No version groups yet' : `No version groups match "${debouncedSearch}"`}
                </p>
              </div>
            ) : (
              <>
              {/* Sortable headers — click "Name" or "Versions" to sort (cycles
                  asc → desc → default), aligned over CompactGroupRow's title
                  and count. */}
              <div className="hidden md:flex items-center gap-2.5 px-3 pb-1.5">
                <span className="w-3.5 shrink-0" />
                <span className="w-10 md:w-9 shrink-0" />
                <button
                  onClick={() => handleCompactSort('name')}
                  className={`flex-1 flex items-center gap-0.5 text-xs font-medium uppercase tracking-wider transition-colors ${compactSort.field === 'name' ? 'text-accent' : 'text-text-muted hover:text-text-secondary'}`}
                >
                  Name
                  {compactSort.field === 'name'
                    ? compactSort.dir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />
                    : <span className="w-2.5" />}
                </button>
                <button
                  onClick={() => handleCompactSort('versions')}
                  className={`flex items-center gap-0.5 text-xs font-medium uppercase tracking-wider transition-colors ${compactSort.field === 'versions' ? 'text-accent' : 'text-text-muted hover:text-text-secondary'}`}
                >
                  Versions
                  {compactSort.field === 'versions'
                    ? compactSort.dir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />
                    : <span className="w-2.5" />}
                </button>
              </div>
              <div className="space-y-0.5">
                {filteredCompactGroups.map((group) => {
                  const cat = groupCategory(group.members)
                  return (
                  <div key={group.groupId}>
                    <CompactGroupRow
                      coverTrack={songToTrack(group.members[0].item)}
                      title={group.title}
                      count={group.members.length}
                      expanded={expandedGroups.has(group.groupId)}
                      onToggle={() => toggleGroupExpanded(group.groupId)}
                      onContextMenu={(e) => handleGroupContextMenu(group, e)}
                      categoryLabel={CATEGORY_LABELS[cat] ?? cat}
                      categoryClassName={CATEGORY_COLORS[cat]}
                    />
                    {expandedGroups.has(group.groupId) && (
                      <div className="ml-4 pl-4 border-l border-[var(--border)] space-y-0.5">
                        {group.members.map(({ item: member, meta }) => (
                          <SongRow
                            key={member.id}
                            song={member}
                            onPlay={handlePlay}
                            onCategoryClick={handleCategoryClick}
                            onEraClick={handleEraClick}
                            onInfo={handleInfo}
                            onContextMenu={handleContextMenu}
                            selectMode={selectMode}
                            selected={selected.has(member.id)}
                            onToggleSelect={toggleSelect}
                            versionLabel={meta.version}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  )
                })}
              </div>
              </>
            ) : loading && sortedSongs.length === 0 ? (
              <div className="flex items-center justify-center h-40 gap-2 text-text-muted">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">{orderField ? 'Loading full library for sorting…' : 'Loading…'}</span>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-center">
                <p className="text-text-muted text-sm">Failed to load: {error}</p>
                <button onClick={resetSongs} className="text-accent text-sm underline">Retry</button>
              </div>
            ) : sortedSongs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <Music2 size={32} className="text-text-muted opacity-30" />
                <p className="text-text-muted text-sm">No songs found</p>
              </div>
            ) : viewMode === 'list' ? (
              <div className="space-y-0.5">
                {sortedSongs.map((song) => (
                  <SongRow
                    key={song.id}
                    song={song}
                    onPlay={handlePlay}
                    onCategoryClick={handleCategoryClick}
                    onEraClick={handleEraClick}
                    onInfo={handleInfo}
                    onContextMenu={handleContextMenu}
                    selectMode={selectMode}
                    selected={selected.has(song.id)}
                    onToggleSelect={toggleSelect}
                  />
                ))}
              </div>
            ) : (
              <div className="grid gap-3 pt-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                {sortedSongs.map((song) => (
                  <SongCard
                    key={song.id}
                    song={song}
                    onPlay={handlePlay}
                    onCategoryClick={handleCategoryClick}
                    onEraClick={handleEraClick}
                    onInfo={handleInfo}
                    onContextMenu={handleContextMenu}
                    selectMode={selectMode}
                    selected={selected.has(song.id)}
                    onToggleSelect={toggleSelect}
                  />
                ))}
              </div>
            )}
            {/* Sentinel always in DOM so IntersectionObserver is set up from mount */}
            <div ref={sentinelRef} className="h-4" />
            {loading && sortedSongs.length > 0 && (
              <div className="flex items-center justify-center gap-2 py-4 text-text-muted">
                <Loader2 size={16} className="animate-spin" />
                {orderField && <span className="text-xs">{sortedSongs.length.toLocaleString()} / {count.toLocaleString()} loaded</span>}
              </div>
            )}
            {!loading && !hasMore && sortedSongs.length > 0 && (
              <p className="text-center text-text-muted text-xs py-4">{count.toLocaleString()} songs total</p>
            )}
          </div>
        </div>
      </div>

      {/* Bulk selection action bar */}
      {selectMode && (
        <div className="shrink-0 border-t border-[var(--border)] bg-surface px-4 py-2.5 flex items-center gap-2 relative">
          <span className="text-sm text-text-primary font-medium flex-1">
            {selected.size} {selected.size === 1 ? 'song' : 'songs'} selected
          </span>
          <button
            onClick={() => setSelected(new Map(sortedSongs.map(s => [s.id, s])))}
            className="text-xs text-text-muted hover:text-text-primary px-2 py-1 rounded transition-colors"
          >
            Select all
          </button>
          <button
            onClick={() => setSelected(new Map())}
            className="text-xs text-text-muted hover:text-text-primary px-2 py-1 rounded transition-colors"
          >
            Clear
          </button>
          <button
            onClick={bulkAddToQueue}
            disabled={selected.size === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-overlay hover:bg-surface-raised text-text-primary rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
          >
            <ListPlus size={13} /> Add to queue
          </button>
          <div className="relative">
            <button
              onClick={() => setShowBulkPlaylists(v => !v)}
              disabled={selected.size === 0 || !canBulkAddToPlaylist}
              title={!canBulkAddToPlaylist ? "Sessions/unsurfaced songs can't be added to playlists" : undefined}
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
                    {bulkEligibleSongs.length !== selectedSongs.length && (
                      <span className="block normal-case tracking-normal font-normal text-text-muted/80 mt-0.5">
                        {selectedSongs.length - bulkEligibleSongs.length} session/unsurfaced song{selectedSongs.length - bulkEligibleSongs.length === 1 ? '' : 's'} excluded
                      </span>
                    )}
                  </div>
                  {!account ? (
                    <div className="p-3">
                      <p className="text-xs text-text-muted mb-2">Log in to save to playlists.</p>
                      <button
                        onClick={() => { setShowUserAuth(true); setShowBulkPlaylists(false) }}
                        className="w-full py-1.5 rounded-lg bg-accent/15 text-accent text-xs font-semibold"
                      >
                        Log in
                      </button>
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto py-1">
                      {playlists.length === 0 && (
                        <p className="px-3 py-2 text-xs text-text-muted">No playlists yet.</p>
                      )}
                      {playlists.map(p => {
                        const allIn = bulkContained.has(p.id)
                        return (
                          <button
                            key={p.id}
                            onClick={() => { bulkAddToPlaylist(p.id); setShowBulkPlaylists(false) }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors"
                          >
                            <ListMusic size={14} className={`shrink-0 ${allIn ? 'text-accent' : 'text-text-muted'}`} />
                            <span className="flex-1 truncate">{p.name}</span>
                            {allIn && <Check size={12} className="text-accent shrink-0" />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          {versionsEnabled && canEdit && (
            <button
              onClick={bulkLinkVersions}
              disabled={selected.size < 2 || bulkLinkStatus === 'linking'}
              title={selected.size < 2 ? 'Select 2 or more songs to link' : 'Link selected songs as versions of each other'}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-overlay hover:bg-surface-raised text-text-primary rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
            >
              {bulkLinkStatus === 'linking' ? (
                <><Loader2 size={13} className="animate-spin" /> Linking…</>
              ) : bulkLinkStatus === 'done' ? (
                <><Check size={13} /> Linked</>
              ) : bulkLinkStatus === 'error' ? (
                <><X size={13} /> Error</>
              ) : (
                <><Link2 size={13} /> Link versions</>
              )}
            </button>
          )}
          <button
            onClick={bulkDownloadZip}
            disabled={selected.size === 0 || bulkZipStatus === 'zipping'}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-medium disabled:opacity-50 transition-opacity hover:opacity-90"
          >
            {bulkZipStatus === 'zipping' ? (
              <><Loader2 size={13} className="animate-spin" /> Zipping…</>
            ) : bulkZipStatus === 'done' ? (
              <><Check size={13} /> Done</>
            ) : bulkZipStatus === 'error' ? (
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

      {selectedSong && (
        <SongInfoModal
          song={selectedSong}
          onClose={() => setSelectedSong(null)}
          onEdit={canEdit ? (songId) => {
            setSelectedSong(null)
            setPendingEditorSongId(songId)
            setActiveView('editor')
          } : undefined}
        />
      )}

      {contextMenu && (
        <SongContextMenu
          state={{ track: songToTrack(contextMenu.song), songId: contextMenu.song.id, x: contextMenu.x, y: contextMenu.y }}
          song={contextMenu.song}
          onClose={() => setContextMenu(null)}
          onInfo={() => handleInfo(contextMenu.song)}
          onAddToQueue={() => handleQueue(songToTrack(contextMenu.song))}
          onShowInFiles={() => handleShowInFiles(contextMenu.song)}
          canEdit={canEdit}
          onSelect={() => toggleSelect(contextMenu.song)}
        />
      )}

      {bulkContextMenu && (
        <BulkContextMenu
          state={bulkContextMenu}
          onClose={() => setBulkContextMenu(null)}
          count={selected.size}
          onAddToQueue={() => { bulkAddToQueue(); setBulkContextMenu(null) }}
          onDownloadZip={() => { bulkDownloadZip(); setBulkContextMenu(null) }}
          onTogglePlaylists={() => setBulkContextMenu((prev) => prev ? { ...prev, showPlaylists: !prev.showPlaylists } : null)}
          playlists={playlists}
          account={account}
          onAddToPlaylist={(id) => { bulkAddToPlaylist(id); setBulkContextMenu(null) }}
          onLogin={() => { setShowUserAuth(true); setBulkContextMenu(null) }}
          canLinkVersions={versionsEnabled && canEdit && selected.size >= 2}
          onLinkVersions={() => { bulkLinkVersions(); setBulkContextMenu(null) }}
          canAddToPlaylist={canBulkAddToPlaylist}
          excludedCount={selectedSongs.length - bulkEligibleSongs.length}
          contained={bulkContained}
        />
      )}

      {titlePromptGroupId !== null && (
        <VersionTitlePromptModal
          saving={savingTitlePrompt}
          onSkip={() => setTitlePromptGroupId(null)}
          onSave={async (title) => {
            setSavingTitlePrompt(true)
            try {
              await setGroupVersionTitle(titlePromptGroupId, title)
            } finally {
              setSavingTitlePrompt(false)
              setTitlePromptGroupId(null)
            }
          }}
        />
      )}
    </div>
  )
}
