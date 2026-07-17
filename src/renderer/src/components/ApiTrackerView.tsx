import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react'
import {
  Search, Play, Loader2, Music2, X, Check,
  LayoutList, Rows3, Info, ListPlus, PanelLeft,
  ChevronUp, ChevronDown, MoreHorizontal, Plus, ListMusic, PackageOpen,
  CheckSquare2, Square, Link2, Layers, Mic2, CalendarDays, ChevronLeft, ChevronRight, Users,
  AlertTriangle,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { AlbumArtThumbnail } from './AlbumArtThumbnail'
import SongInfoModal from './SongInfoModal'
import SongContextMenu from './SongContextMenu'
import { CompactGroupRow, useExpandedGroups } from './CompactGroupRow'
import {
  apiFetch, apiPeek, songToTrack, parseDuration, CATEGORY_LABELS, JWAPI_BASE,
  JWApiSong, JWApiPaginatedResponse, JWApiStats, JWApiEra,
} from '../lib/juicewrldApi'
import { fisherYates } from '../store/queueSlice'
import { Track } from '../types'
import * as userApi from '../lib/userApi'
import { versionsEnabled, linkSongVersion, getOwnVersionMeta, setGroupVersionTitle } from '../lib/versionsApi'
import type { SongVersionMeta } from '../lib/versionsApi'
import { fetchAllCompactGroups, filterCompactGroups, invalidateCompactGroupsCache } from '../lib/compactGroups'
import type { CompactGroup } from '../lib/compactGroups'
import { useVirtualWindow } from '../hooks/useVirtualWindow'
import { runLog } from '../lib/runLog'
import { formatDuration } from '../lib/format'

type Category = 'released' | 'unreleased' | 'unsurfaced' | 'recording_session' | ''
type ViewMode = 'list' | 'detail'
type TrackerTab = 'songs' | 'lyrics' | 'calendar' | 'producers'

const CATEGORY_COLORS: Record<string, string> = {
  released:          'text-emerald-400 bg-emerald-400/10 border-emerald-400/25',
  unreleased:        'text-blue-400   bg-blue-400/10   border-blue-400/25',
  unsurfaced:        'text-amber-400  bg-amber-400/10  border-amber-400/25',
  recording_session: 'text-purple-400 bg-purple-400/10 border-purple-400/25',
}

// ─── Era color palette (Calendar tab) ─────────────────────────────────────────
// Eras are dynamic (fetched from the API, not a fixed enum), so colors are
// assigned by index rather than hardcoded per name — same era always gets the
// same color as long as `eras` keeps returning them in the same order.
// Written as literal class names (not template-built) so Tailwind's static
// scanner picks them all up.
interface EraColor { text: string; bg: string; border: string; dot: string }
const ERA_COLOR_PALETTE: EraColor[] = [
  { text: 'text-rose-400',     bg: 'bg-rose-400/10',     border: 'border-rose-400/25',     dot: 'bg-rose-400' },
  { text: 'text-orange-400',   bg: 'bg-orange-400/10',   border: 'border-orange-400/25',   dot: 'bg-orange-400' },
  { text: 'text-amber-400',    bg: 'bg-amber-400/10',    border: 'border-amber-400/25',    dot: 'bg-amber-400' },
  { text: 'text-lime-400',     bg: 'bg-lime-400/10',     border: 'border-lime-400/25',      dot: 'bg-lime-400' },
  { text: 'text-emerald-400',  bg: 'bg-emerald-400/10',  border: 'border-emerald-400/25',  dot: 'bg-emerald-400' },
  { text: 'text-teal-400',     bg: 'bg-teal-400/10',     border: 'border-teal-400/25',     dot: 'bg-teal-400' },
  { text: 'text-cyan-400',     bg: 'bg-cyan-400/10',     border: 'border-cyan-400/25',     dot: 'bg-cyan-400' },
  { text: 'text-blue-400',     bg: 'bg-blue-400/10',     border: 'border-blue-400/25',     dot: 'bg-blue-400' },
  { text: 'text-indigo-400',   bg: 'bg-indigo-400/10',   border: 'border-indigo-400/25',   dot: 'bg-indigo-400' },
  { text: 'text-violet-400',   bg: 'bg-violet-400/10',   border: 'border-violet-400/25',   dot: 'bg-violet-400' },
  { text: 'text-fuchsia-400',  bg: 'bg-fuchsia-400/10',  border: 'border-fuchsia-400/25',  dot: 'bg-fuchsia-400' },
  { text: 'text-pink-400',     bg: 'bg-pink-400/10',     border: 'border-pink-400/25',     dot: 'bg-pink-400' },
]
const DEFAULT_ERA_COLOR: EraColor = { text: 'text-text-muted', bg: 'bg-surface-overlay', border: 'border-[var(--border)]', dot: 'bg-text-muted' }

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
const LS_TRACKER_CALENDAR_MONTH = 'api-tracker:calendarMonth'

// record_dates is free-text and occasionally yields a technically-valid but
// implausible match (e.g. a stray "1/2/03" fragment that isn't really a
// date). Juice WRLD's earliest known recordings are from the mid-2010s, so
// anything before this is almost certainly a parsing false-positive rather
// than a real recording date — treat it as invalid.
const MIN_PLAUSIBLE_RECORD_YEAR = 2010

// The `q` URL param takes priority over the saved localStorage query so that
// following/reloading a link with a search in it (or navigating back to one)
// shows that search rather than whatever was last typed. Electron's file://
// protocol has no meaningful URL routing (see App.tsx), so it's skipped there.
function getInitialSearch(): string {
  if (window.location.protocol !== 'file:') {
    const q = new URLSearchParams(window.location.search).get('q')
    if (q) return q
  }
  return localStorage.getItem(LS_TRACKER_SEARCH) || ''
}

type OrderField = 'name' | 'credited_artists' | 'era__name' | 'category' | 'length'

// Defined at module scope (not inline in render) so React keeps a stable
// component identity across re-renders — an inline definition gets recreated
// every render, which makes React unmount/remount the buttons on every
// state update (e.g. every page loaded while sorting), causing a visible
// flicker instead of a smooth active/inactive toggle.
const SortBtn = ({ field, label, className, orderField, orderDir, onClick }: {
  field: OrderField
  label: string
  className?: string
  orderField: OrderField | null
  orderDir: 'asc' | 'desc'
  onClick: (field: OrderField) => void
}): JSX.Element => {
  const active = orderField === field
  return (
    <button
      onClick={() => onClick(field)}
      className={`flex items-center gap-0.5 text-xs font-medium uppercase tracking-wider transition-colors ${active ? 'text-accent' : 'text-text-muted hover:text-text-secondary'} ${className ?? ''}`}
    >
      {label}
      {active
        ? orderDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />
        : <span className="w-2.5" />}
    </button>
  )
}

const SNIPPET_CONTEXT_CHARS = 70
// Finds where `query` occurs in `lyrics` and returns the surrounding text
// split into before/match/after so the caller can highlight just the match.
// The API's lyrics search may be more lenient than a plain substring match
// (e.g. punctuation/case normalization), so this falls back to locating just
// the first query word if the full phrase isn't found verbatim — better to
// show an approximate snippet than none at all.
function getLyricSnippet(lyrics: string | null, query: string): { before: string; match: string; after: string } | null {
  const q = query.trim()
  if (!lyrics || !q) return null
  const lower = lyrics.toLowerCase()
  let idx = lower.indexOf(q.toLowerCase())
  let matchLen = q.length
  if (idx === -1) {
    const firstWord = q.split(/\s+/)[0]
    idx = firstWord ? lower.indexOf(firstWord.toLowerCase()) : -1
    matchLen = firstWord.length
  }
  if (idx === -1) return null
  const start = Math.max(0, idx - SNIPPET_CONTEXT_CHARS)
  const end = Math.min(lyrics.length, idx + matchLen + SNIPPET_CONTEXT_CHARS)
  const clean = (s: string): string => s.replace(/\s+/g, ' ').trim()
  return {
    before: (start > 0 ? '…' : '') + clean(lyrics.slice(start, idx)),
    match: lyrics.slice(idx, idx + matchLen),
    after: clean(lyrics.slice(idx + matchLen, end)) + (end < lyrics.length ? '…' : ''),
  }
}

// ─── Recording-date parsing (Calendar tab) ────────────────────────────────────
// `record_dates` is free-text (e.g. "5/5/18", "May 5, 2018", sometimes several
// dates for one song, sometimes just a year/season with no day at all) —
// there's no structured date field to key a calendar off of. These helpers
// pull out every exact (year, month, day) triple found in the text and
// silently drop anything too vague to place on a specific day, rather than
// guessing.
const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4,
  jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
}
const MONTH_NAME_RE = new RegExp(
  `\\b(${Object.keys(MONTH_MAP).join('|')})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'gi'
)

function normalizeYear(y: number): number {
  if (y >= 100) return y
  return y <= 30 ? 2000 + y : 1900 + y
}

function isValidYMD(y: number, m: number, d: number): boolean {
  if (y < MIN_PLAUSIBLE_RECORD_YEAR || y > new Date().getFullYear()) return false
  if (m < 0 || m > 11 || d < 1 || d > 31) return false
  const dt = new Date(y, m, d)
  return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d
}

function dateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function extractDateKeys(text: string | null | undefined): string[] {
  if (!text) return []
  const keys = new Set<string>()

  for (const m of text.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    const y = +m[1], mo = +m[2] - 1, d = +m[3]
    if (isValidYMD(y, mo, d)) keys.add(dateKey(y, mo, d))
  }
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g)) {
    const mo = +m[1] - 1, d = +m[2], y = normalizeYear(+m[3])
    if (isValidYMD(y, mo, d)) keys.add(dateKey(y, mo, d))
  }
  for (const m of text.matchAll(MONTH_NAME_RE)) {
    const mo = MONTH_MAP[m[1].toLowerCase()]
    const d = +m[2], y = +m[3]
    if (mo !== undefined && isValidYMD(y, mo, d)) keys.add(dateKey(y, mo, d))
  }

  return [...keys]
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// One 7-wide grid of the given month, padded with nulls so every week is a
// full row (including leading/trailing days from adjacent months).
function buildMonthGrid(year: number, month: number): (Date | null)[][] {
  const startDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = Array(startDow).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (Date | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
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
// Category/era are checkbox multi-selects (OR'd within each group) rather
// than the old radio-style single pick — "All" / "All eras" just clears the
// respective set instead of being one more option inside it.
const CAT_SIDEBAR: { key: Exclude<Category, ''>; label: string }[] = [
  { key: 'released',          label: 'Released' },
  { key: 'unreleased',        label: 'Unreleased' },
  { key: 'unsurfaced',        label: 'Unsurfaced' },
  { key: 'recording_session', label: 'Sessions' },
]

function SidebarCheckRow({ label, count, checked, onClick }: {
  label: string
  count?: number
  checked: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 text-sm transition-colors text-left ${
        checked ? 'text-accent font-semibold bg-accent/5' : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised'
      }`}
    >
      {checked
        ? <CheckSquare2 size={13} className="text-accent shrink-0" />
        : <Square size={13} className="text-text-muted opacity-50 shrink-0" />}
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span className="text-text-muted text-[10px] tabular-nums ml-1">{count.toLocaleString()}</span>
      )}
    </button>
  )
}

function CategorySidebar({
  stats, eras, selectedCategories, selectedEras, onCategory, onEra, onClearCategories, onClearEras,
}: {
  stats: JWApiStats | null
  eras: JWApiEra[]
  selectedCategories: Set<Category>
  selectedEras: Set<string>
  onCategory: (c: Category) => void
  onEra: (e: string) => void
  onClearCategories: () => void
  onClearEras: () => void
}): JSX.Element {
  const counts: Record<string, number | undefined> = {
    released:          stats?.category_stats.released,
    unreleased:        stats?.category_stats.unreleased,
    unsurfaced:        stats?.category_stats.unsurfaced,
    recording_session: stats?.category_stats.recording_session,
  }

  return (
    <div className="w-44 shrink-0 border-r border-[var(--border)] overflow-y-auto flex flex-col py-2">
      <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted px-3 pt-1 pb-2">Category</p>
      <SidebarCheckRow
        label="All"
        count={stats?.total_songs}
        checked={selectedCategories.size === 0}
        onClick={onClearCategories}
      />
      {CAT_SIDEBAR.map((cat) => (
        <SidebarCheckRow
          key={cat.key}
          label={cat.label}
          count={counts[cat.key]}
          checked={selectedCategories.has(cat.key)}
          onClick={() => onCategory(cat.key)}
        />
      ))}

      {eras.length > 0 && (
        <>
          <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted px-3 pt-4 pb-2">Era</p>
          <SidebarCheckRow label="All eras" checked={selectedEras.size === 0} onClick={onClearEras} />
          {eras.map((era) => (
            <SidebarCheckRow
              key={era.id}
              label={era.name}
              checked={selectedEras.has(era.name)}
              onClick={() => onEra(era.name)}
            />
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
function MenuItem({ icon, label, onClick, disabled, title }: {
  icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; title?: string
}): JSX.Element {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      disabled={disabled}
      title={title}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-text-secondary"
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
  canAddToQueue,
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
  /** False when any selected song is a session/unsurfaced (playlists don't
   *  support those) — hides "Add to playlist" entirely rather than silently
   *  adding only the eligible ones. */
  canAddToPlaylist: boolean
  /** False unless every selected song is both eligible and has a path. */
  canAddToQueue: boolean
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
          <MenuItem
            icon={<ListPlus size={14} />}
            label="Add to queue"
            onClick={onAddToQueue}
            disabled={!canAddToQueue}
            title={!canAddToQueue ? "Sessions/unsurfaced songs can't be queued" : undefined}
          />
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
  selectMode, selected, onToggleSelect, versionLabel, compact,
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
  /** Compact-view member row: hides the Artist/Era columns (the compact
   *  header has no columns for them) so the Category badge lines up under
   *  the same header cell whether the row above it is a collapsed group
   *  or an expanded version. */
  compact?: boolean
}): JSX.Element {
  // This song's personal override, if any. Selecting just this song's row keeps
  // the map's other churn from re-rendering the row, and songToTrack picks up
  // the custom cover from the same source on the render this triggers.
  const pref = useStore((s) => s.songPrefs[song.id])
  const track = songToTrack(song)
  const title = pref?.name || song.name
  const altTitles = song.track_titles ?? []
  const canPlay = !!song.path

  return (
    <div
      className={`group flex items-center gap-3 px-3 py-2.5 md:py-2 hover:bg-surface-overlay active:bg-surface-overlay rounded-lg transition-colors cursor-default ${selected ? 'bg-accent/10' : ''}`}
      onClick={(e) => { if (e.ctrlKey || e.metaKey || selectMode) onToggleSelect(song) }}
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

      {/* Desktop-only columns — omitted in compact view, which has no
          Artist/Era header cells for them to line up under. */}
      {!compact && (
        <>
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
        </>
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
      <span className="hidden md:block text-text-muted text-xs w-12 text-right shrink-0 tabular-nums">{formatDuration(parseDuration(song.length), '--:--')}</span>

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

// ─── Song row (detailed mode) ─────────────────────────────────────────────────
// One labeled metadata cell in the detailed-row field grid. Values are
// single-line truncated (full text on hover via title) so every row keeps
// the fixed height the virtual window depends on.
function DetailField({ label, value, className }: {
  label: string
  value: string | null | undefined
  className?: string
}): JSX.Element {
  const v = value?.trim() || ''
  return (
    <div className={`min-w-0 ${className ?? ''}`}>
      <p className="text-[9px] uppercase tracking-wider text-text-muted/70 leading-tight truncate">{label}</p>
      <p className={`text-xs truncate ${v ? 'text-text-secondary' : 'text-text-muted/50'}`} title={v || undefined}>
        {v || '—'}
      </p>
    </div>
  )
}

// Detailed view trades row density for inline metadata: the fields that
// otherwise only show up in SongInfoModal (producers, engineers, recording
// dates/locations, leak info, file names…) are laid out in a fixed grid on
// every row. The grid is a *fixed* set of cells (empty ones render "—")
// so all rows share one height — required by the virtual window's fixed
// stride. Mobile shows a 2-column subset; md: widens to 4 columns and adds
// the rarer fields.
const DetailedSongRow = memo(function DetailedSongRow({
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
  const pref = useStore((s) => s.songPrefs[song.id])
  const track = songToTrack(song)
  const title = pref?.name || song.name
  const canPlay = !!song.path
  const altTitles = song.track_titles ?? []

  return (
    <div
      className={`group flex gap-3 px-3 py-2 h-full overflow-hidden rounded-lg border border-[var(--border)] hover:bg-surface-overlay active:bg-surface-overlay transition-colors cursor-default ${selected ? 'bg-accent/10' : ''}`}
      onClick={(e) => { if (e.ctrlKey || e.metaKey || selectMode) onToggleSelect(song) }}
      onDoubleClick={() => { if (!selectMode) onInfo(song) }}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(song, e) }}
    >
      {selectMode && (
        <div className="shrink-0 pt-1">
          {selected
            ? <CheckSquare2 size={17} className="text-accent" />
            : <Square size={17} className="text-text-muted opacity-50" />}
        </div>
      )}

      {/* Cover art */}
      <div className="relative shrink-0 w-12 h-12 md:w-14 md:h-14 rounded overflow-hidden bg-surface-overlay">
        <AlbumArtThumbnail track={track} size={56} shimmer={false} />
        {canPlay && !selectMode && (
          <button
            className="absolute inset-0 items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex"
            onClick={(e) => { e.stopPropagation(); onPlay(song) }}
            title="Play"
          >
            <Play size={16} fill="white" className="text-white ml-0.5" />
          </button>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {/* Title row: name + artist + era/category badges + duration + actions */}
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-text-primary text-sm font-medium truncate">{title}</p>
          <span className="hidden md:block text-text-muted text-xs truncate shrink-0 max-w-[160px]">
            {song.credited_artists || 'Juice WRLD'}
          </span>
          {song.era?.name && (
            <button
              onClick={(e) => { e.stopPropagation(); if (!selectMode) onEraClick(song.era!.name) }}
              className="hidden md:block text-text-muted text-[9px] uppercase tracking-wide bg-surface px-1.5 py-0.5 rounded border border-[var(--border)] truncate max-w-[140px] shrink-0 hover:text-accent hover:border-accent/40 transition-colors"
              title={`Filter by era: ${song.era.name}`}
            >
              {song.era.name}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); if (!selectMode) onCategoryClick(song.category as Category) }}
            className={`hidden md:block text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 transition-colors hover:opacity-80 ${CATEGORY_COLORS[song.category] ?? 'text-text-muted bg-surface border-[var(--border)]'}`}
            title="Filter by category"
          >
            {CATEGORY_LABELS[song.category] ?? song.category}
          </button>
          <span className="ml-auto text-text-muted text-xs shrink-0 tabular-nums">{formatDuration(parseDuration(song.length), '--:--')}</span>
          {!selectMode && (
            <div className="hidden md:flex items-center gap-0.5 shrink-0">
              <SongActions onInfo={() => onInfo(song)} onContextMenu={(e) => onContextMenu(song, e)} />
            </div>
          )}
          {!selectMode && (
            <div className="md:hidden flex items-center shrink-0">
              <button
                className="p-1 text-text-muted active:text-accent transition-colors"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onContextMenu(song, e) }}
                title="More options"
              >
                <MoreHorizontal size={16} />
              </button>
              {canPlay && (
                <button
                  className="p-1 text-text-muted active:text-accent transition-colors"
                  onClick={(e) => { e.stopPropagation(); onPlay(song) }}
                  title="Play"
                >
                  <Play size={16} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Mobile subtitle — artist/era/category live here instead of badges */}
        <p className="md:hidden text-text-muted text-xs truncate mt-0.5">
          {song.credited_artists || 'Juice WRLD'}
          {song.era?.name ? ` · ${song.era.name}` : ''}
          {` · ${CATEGORY_LABELS[song.category] ?? song.category}`}
        </p>

        {/* Metadata field grid — fixed cell set so every row is the same height */}
        <div className="mt-1.5 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1">
          <DetailField label="Producers" value={song.producers} />
          <DetailField label="Engineers" value={song.engineers} />
          <DetailField label="Recording Locations" value={song.recording_locations} className="hidden md:block" />
          <DetailField label="Record Dates" value={song.record_dates} />
          <DetailField label="Leak Type" value={song.leak_type} />
          <DetailField label="Date Leaked" value={song.date_leaked} className="hidden md:block" />
          <DetailField label="Bitrate" value={song.bitrate} />
          <DetailField label="Original Key" value={song.original_key} />
          <DetailField label="Release Date" value={song.release_date} className="hidden md:block" />
          <DetailField label="File Names" value={song.file_names} className="hidden md:block" />
          <DetailField label="Session Titles" value={song.session_titles} className="hidden md:block" />
          <DetailField label="Alt Titles" value={altTitles.join(' · ')} className="hidden md:block" />
        </div>
      </div>
    </div>
  )
})

// ─── Virtualized lists ────────────────────────────────────────────────────────
// Row heights in this view are responsive (40px thumb + py-2.5 on mobile,
// 36px + py-2 at md:), so the virtual-window strides below need to know
// which side of the md: breakpoint we're on.
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 768px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const onChange = (e: MediaQueryListEvent): void => setIsDesktop(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return isDesktop
}

// ─── Compact-view group list (virtualized) ────────────────────────────────────
// Compact view renders every titled version group app-wide (1200+ rows, each
// with cover art). Mounted all at once, that's enough DOM that a single
// expand/collapse (one relayout + style recalc across all of it) could hang
// the renderer outright — the same many-rows failure mode useVirtualWindow
// already solves for the local library. Groups and the expanded groups'
// member rows are flattened into one fixed-stride row list so only the
// visible slice is ever mounted.
type CompactListRow =
  | { key: string; kind: 'group'; group: CompactGroup<JWApiSong> }
  | { key: string; kind: 'member'; item: JWApiSong; meta: SongVersionMeta; isLast: boolean }

function CompactGroupList({
  scrollRef, groups, expanded, onToggleGroup, onGroupContextMenu,
  onPlay, onCategoryClick, onEraClick, onInfo, onContextMenu,
  selectMode, selected, onToggleSelect,
}: {
  scrollRef: React.RefObject<HTMLDivElement>
  groups: CompactGroup<JWApiSong>[]
  expanded: Set<number>
  onToggleGroup: (group: CompactGroup<JWApiSong>) => void
  onGroupContextMenu: (group: CompactGroup<JWApiSong>, e: React.MouseEvent) => void
  onPlay: (song: JWApiSong) => void
  onCategoryClick: (cat: Category) => void
  onEraClick: (era: string) => void
  onInfo: (song: JWApiSong) => void
  onContextMenu: (song: JWApiSong, e: React.MouseEvent) => void
  selectMode: boolean
  selected: Map<number, JWApiSong>
  onToggleSelect: (song: JWApiSong) => void
}): JSX.Element {
  const contentRef = useRef<HTMLDivElement>(null)

  // Row stride mirrors CompactGroupRow/SongRow's natural height plus the 2px
  // gap the old space-y-0.5 flow layout provided — absolutely positioned rows
  // have to encode that spacing themselves.
  const isDesktop = useIsDesktop()
  const rowH = isDesktop ? 52 : 60
  const stride = rowH + 2

  const rows = useMemo(() => {
    const out: CompactListRow[] = []
    for (const group of groups) {
      out.push({ key: `g${group.groupId}`, kind: 'group', group })
      if (expanded.has(group.groupId)) {
        group.members.forEach((m, i) => out.push({
          key: `g${group.groupId}-s${m.item.id}`, kind: 'member',
          item: m.item, meta: m.meta, isLast: i === group.members.length - 1,
        }))
      }
    }
    return out
  }, [groups, expanded])

  const { start, end, totalHeight } = useVirtualWindow(scrollRef, contentRef, rows.length, stride)

  return (
    <div ref={contentRef} style={{ height: totalHeight, position: 'relative' }}>
      {rows.slice(start, end).map((row, i) => {
        const top = (start + i) * stride
        if (row.kind === 'group') {
          const cat = groupCategory(row.group.members)
          return (
            <div key={row.key} style={{ position: 'absolute', top, left: 0, right: 0, height: rowH }}>
              <CompactGroupRow
                coverTrack={songToTrack(row.group.members[0].item)}
                title={row.group.title}
                count={row.group.members.length}
                expanded={expanded.has(row.group.groupId)}
                onToggle={() => onToggleGroup(row.group)}
                onContextMenu={(e) => onGroupContextMenu(row.group, e)}
                categoryLabel={CATEGORY_LABELS[cat] ?? cat}
                categoryClassName={CATEGORY_COLORS[cat]}
              />
            </div>
          )
        }
        return (
          <div
            key={row.key}
            className="ml-4 pl-4 border-l border-[var(--border)]"
            // Non-last member wrappers span the full stride so the indent
            // rail stays continuous across the 2px row gap.
            style={{ position: 'absolute', top, left: 0, right: 0, height: row.isLast ? rowH : stride }}
          >
            <SongRow
              song={row.item}
              onPlay={onPlay}
              onCategoryClick={onCategoryClick}
              onEraClick={onEraClick}
              onInfo={onInfo}
              onContextMenu={onContextMenu}
              selectMode={selectMode}
              selected={selected.has(row.item.id)}
              onToggleSelect={onToggleSelect}
              versionLabel={row.meta.version}
              compact
            />
          </div>
        )
      })}
    </div>
  )
}

// ─── Flat song list / grid (virtualized) ──────────────────────────────────────
// The flat views accumulate without bound — infinite scroll appends pages
// forever, and sort mode outright loads the whole ~2500-song catalog (that
// load is what originally hung the renderer hard enough to look like a PC
// freeze; see the tracker-sort runLog breadcrumbs). Windowing caps the
// mounted rows/cards at what's visible regardless of how many songs are
// loaded.
interface VirtualSongsProps {
  scrollRef: React.RefObject<HTMLDivElement>
  songs: JWApiSong[]
  onPlay: (song: JWApiSong) => void
  onCategoryClick: (cat: Category) => void
  onEraClick: (era: string) => void
  onInfo: (song: JWApiSong) => void
  onContextMenu: (song: JWApiSong, e: React.MouseEvent) => void
  selectMode: boolean
  selected: Map<number, JWApiSong>
  onToggleSelect: (song: JWApiSong) => void
}

function VirtualSongList({
  scrollRef, songs, onPlay, onCategoryClick, onEraClick, onInfo, onContextMenu,
  selectMode, selected, onToggleSelect,
}: VirtualSongsProps): JSX.Element {
  const contentRef = useRef<HTMLDivElement>(null)
  const isDesktop = useIsDesktop()
  const rowH = isDesktop ? 52 : 60
  const stride = rowH + 2 // + the old space-y-0.5 gap
  const { start, end, totalHeight } = useVirtualWindow(scrollRef, contentRef, songs.length, stride)
  return (
    <div ref={contentRef} style={{ height: totalHeight, position: 'relative' }}>
      {songs.slice(start, end).map((song, i) => (
        <div key={song.id} style={{ position: 'absolute', top: (start + i) * stride, left: 0, right: 0, height: rowH }}>
          <SongRow
            song={song}
            onPlay={onPlay}
            onCategoryClick={onCategoryClick}
            onEraClick={onEraClick}
            onInfo={onInfo}
            onContextMenu={onContextMenu}
            selectMode={selectMode}
            selected={selected.has(song.id)}
            onToggleSelect={onToggleSelect}
          />
        </div>
      ))}
    </div>
  )
}

// Detailed rows are taller than list rows (title line + a 3-row metadata
// grid — 4 columns at md:, 2 on mobile), but still fixed-height —
// DetailedSongRow clips overflow, so the stride below just has to match its
// natural height with a little headroom.
const DETAIL_ROW_H_DESKTOP = 136
const DETAIL_ROW_H_MOBILE = 152
const DETAIL_ROW_GAP = 6 // bordered card-style rows want more breathing room than the flat list's 2px

function VirtualSongDetailList({
  scrollRef, songs, onPlay, onCategoryClick, onEraClick, onInfo, onContextMenu,
  selectMode, selected, onToggleSelect,
}: VirtualSongsProps): JSX.Element {
  const contentRef = useRef<HTMLDivElement>(null)
  const isDesktop = useIsDesktop()
  const rowH = isDesktop ? DETAIL_ROW_H_DESKTOP : DETAIL_ROW_H_MOBILE
  const stride = rowH + DETAIL_ROW_GAP
  const { start, end, totalHeight } = useVirtualWindow(scrollRef, contentRef, songs.length, stride)
  return (
    <div ref={contentRef} style={{ height: totalHeight, position: 'relative' }}>
      {songs.slice(start, end).map((song, i) => (
        <div key={song.id} style={{ position: 'absolute', top: (start + i) * stride, left: 0, right: 0, height: rowH }}>
          <DetailedSongRow
            song={song}
            onPlay={onPlay}
            onCategoryClick={onCategoryClick}
            onEraClick={onEraClick}
            onInfo={onInfo}
            onContextMenu={onContextMenu}
            selectMode={selectMode}
            selected={selected.has(song.id)}
            onToggleSelect={onToggleSelect}
          />
        </div>
      ))}
    </div>
  )
}

// ─── Lyric search result row ──────────────────────────────────────────────────
// Deliberately its own row type rather than reusing SongRow — the whole point
// of lyric search is surfacing *why* a song matched, so this trades the flat
// list's fixed artist/era/category columns for a quoted lyric snippet with
// the matched text highlighted.
const LyricResultRow = memo(function LyricResultRow({
  song, query, onPlay, onCategoryClick, onEraClick, onInfo, onContextMenu,
  selectMode, selected, onToggleSelect,
}: {
  song: JWApiSong
  query: string
  onPlay: (song: JWApiSong) => void
  onCategoryClick: (cat: Category) => void
  onEraClick: (era: string) => void
  onInfo: (song: JWApiSong) => void
  onContextMenu: (song: JWApiSong, e: React.MouseEvent) => void
  selectMode: boolean
  selected: boolean
  onToggleSelect: (song: JWApiSong) => void
}): JSX.Element {
  const pref = useStore((s) => s.songPrefs[song.id])
  const track = songToTrack(song)
  const title = pref?.name || song.name
  const canPlay = !!song.path
  const snippet = useMemo(() => getLyricSnippet(song.lyrics, query), [song.lyrics, query])

  return (
    <div
      className={`group flex items-start gap-3 px-3 py-3 hover:bg-surface-overlay active:bg-surface-overlay rounded-lg transition-colors cursor-default ${selected ? 'bg-accent/10' : ''}`}
      onClick={(e) => { if (e.ctrlKey || e.metaKey || selectMode) onToggleSelect(song) }}
      onDoubleClick={() => { if (!selectMode) onInfo(song) }}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(song, e) }}
    >
      {selectMode && (
        <div className="shrink-0 pt-1.5">
          {selected
            ? <CheckSquare2 size={17} className="text-accent" />
            : <Square size={17} className="text-text-muted opacity-50" />}
        </div>
      )}

      {/* Cover art */}
      <div className="relative shrink-0 w-11 h-11 rounded overflow-hidden bg-surface-overlay">
        <AlbumArtThumbnail track={track} size={44} shimmer={false} />
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

      <div className="flex-1 min-w-0">
        <div className="hidden md:flex items-center gap-1.5 flex-wrap">
          <p className="text-text-primary text-sm font-medium truncate">{title}</p>
          <span className="text-text-muted text-xs truncate">{song.credited_artists || 'Juice WRLD'}</span>
          {song.era?.name && (
            <button
              onClick={(e) => { e.stopPropagation(); if (!selectMode) onEraClick(song.era!.name) }}
              className="text-text-muted text-[9px] uppercase tracking-wide bg-surface px-1.5 py-0.5 rounded border border-[var(--border)] truncate hover:text-accent hover:border-accent/40 transition-colors"
              title={`Filter by era: ${song.era.name}`}
            >
              {song.era.name}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); if (!selectMode) onCategoryClick(song.category as Category) }}
            className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 transition-colors hover:opacity-80 ${CATEGORY_COLORS[song.category] ?? 'text-text-muted bg-surface border-[var(--border)]'}`}
          >
            {CATEGORY_LABELS[song.category] ?? song.category}
          </button>
        </div>

        {/* Mobile: title + a single compact subtitle line instead of the
            wrapping badge row above, matching SongRow's mobile layout. */}
        <p className="md:hidden text-text-primary text-sm font-medium truncate">{title}</p>
        <p className="md:hidden text-text-muted text-xs truncate mt-0.5">
          {song.credited_artists || 'Juice WRLD'}
          {song.era?.name ? ` · ${song.era.name}` : ''}
          {` · ${CATEGORY_LABELS[song.category] ?? song.category}`}
        </p>

        {/* Lyric snippet — the reason this song matched */}
        {snippet ? (
          <p className="mt-1 text-xs text-text-secondary italic leading-relaxed line-clamp-2">
            {snippet.before}
            <mark className="bg-accent/20 text-accent not-italic rounded px-0.5">{snippet.match}</mark>
            {snippet.after}
          </p>
        ) : (
          <p className="mt-1 text-xs text-text-muted italic">Lyric preview unavailable</p>
        )}
      </div>

      <span className="hidden md:block text-text-muted text-xs w-12 text-right shrink-0 tabular-nums pt-1.5">{formatDuration(parseDuration(song.length), '--:--')}</span>

      {/* Desktop action buttons */}
      {!selectMode && (
        <div className="hidden md:flex items-center gap-0.5 shrink-0 pt-1">
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

  const [trackerTab, setTrackerTab] = useState<TrackerTab>('songs')

  const [selectedSong, setSelectedSong] = useState<JWApiSong | null>(null)
  const [contextMenu, setContextMenu] = useState<{ song: JWApiSong; x: number; y: number } | null>(null)
  const [bulkContextMenu, setBulkContextMenu] = useState<BulkContextMenuState | null>(null)

  // Multi-select — mirrors the same pattern used in ApiFilesView's bulk select.
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Map<number, JWApiSong>>(new Map())
  const [bulkZipStatus, setBulkZipStatus] = useState<'idle' | 'zipping' | 'done' | 'partial' | 'none' | 'error'>('idle')
  const [bulkZipSkipped, setBulkZipSkipped] = useState(0)
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
    setBulkZipSkipped(0)
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

  // Breadcrumb the toggle (same spirit as the tracker-sort breadcrumbs): if a
  // freeze ever lands here again, previous-run.log will name the exact group.
  const handleToggleGroup = (group: CompactGroup<JWApiSong>): void => {
    runLog('compact', `toggle group=${group.groupId} "${group.title}" members=${group.members.length}`)
    toggleGroupExpanded(group.groupId)
  }

  useEffect(() => {
    if (!compactView || !versionsEnabled) { setCompactGroups([]); return }
    let cancelled = false
    setLoadingCompact(true)
    fetchAllCompactGroups().then(groups => {
      if (cancelled) return
      runLog('compact', `loaded ${groups.length} groups (${groups.reduce((n, g) => n + g.members.length, 0)} members)`)
      setCompactGroups(groups)
      setLoadingCompact(false)
    }).catch(e => {
      // Without this, a failed catalog fetch left the "Loading version
      // groups…" spinner up forever (and the rejection unhandled).
      if (cancelled) return
      runLog('compact', 'ERROR loading groups', e as Error)
      setCompactGroups([])
      setLoadingCompact(false)
    })
    return () => { cancelled = true }
  }, [compactView])

  // Stale-while-revalidate: seed from the offline cache synchronously so the
  // list renders instantly on open, then the effects below refetch and replace
  // it in the background. The seeded first-songs page must use the exact same
  // params as the initial scroll-mode fetch (unfiltered: no search from the
  // saved query, no category/era, page 1) or the cache key won't match. Read
  // once via a ref so the per-render path never re-parses localStorage.
  const seedRef = useRef<JWApiPaginatedResponse | undefined>(undefined)
  const seededRef = useRef(false)
  if (!seededRef.current) {
    seededRef.current = true
    const initialSearch = getInitialSearch()
    seedRef.current = apiPeek<JWApiPaginatedResponse>('/songs/', {
      searchall: initialSearch || undefined, category: undefined, era: undefined,
      page: 1, page_size: PAGE_SIZE,
    })
  }
  const cachedFirstPage = seedRef.current
  const [stats, setStats] = useState<JWApiStats | null>(() => apiPeek<JWApiStats>('/stats/') ?? null)
  const [eras, setEras] = useState<JWApiEra[]>(() => {
    const c = apiPeek<JWApiEra[] | { results: JWApiEra[] }>('/eras/')
    return c ? (Array.isArray(c) ? c : c.results ?? []) : []
  })
  const [songs, setSongs] = useState<JWApiSong[]>(() => cachedFirstPage?.results ?? [])
  const [count, setCount] = useState(() => cachedFirstPage?.count ?? 0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(() => cachedFirstPage ? cachedFirstPage.next !== null : false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const sentinelRef = useRef<HTMLDivElement>(null)
  // The song-list scroll container — CompactGroupList windows against it.
  const listScrollRef = useRef<HTMLDivElement>(null)
  // Refs for scroll logic — avoids stale closure issues in observer callback
  const hasMoreRef = useRef(false)
  const loadingRef = useRef(true)
  const sentinelVisibleRef = useRef(false)
  // Compact view renders far less content than the underlying song list, so
  // the sentinel stays permanently visible and would otherwise auto-page
  // through the entire library in the background — pause that while active.
  const compactViewRef = useRef(false)
  useEffect(() => { compactViewRef.current = compactView }, [compactView])

  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    // 'grid' was a removed third view mode — treat any stale stored value as 'list'.
    const stored = localStorage.getItem(LS_TRACKER_VIEW)
    return stored === 'detail' ? 'detail' : 'list'
  })
  const [showSidebar, setShowSidebarState] = useState<boolean>(
    () => localStorage.getItem(LS_TRACKER_SIDEBAR) !== 'false'
  )

  const setViewMode = (v: ViewMode): void => { setViewModeState(v); localStorage.setItem(LS_TRACKER_VIEW, v) }
  const setShowSidebar = (v: boolean): void => { setShowSidebarState(v); localStorage.setItem(LS_TRACKER_SIDEBAR, String(v)) }

  const [orderField, setOrderField] = useState<OrderField | null>(null)
  const [orderDir, setOrderDir] = useState<'asc' | 'desc'>('asc')
  // Whether any column is currently driving sort mode — the fetched song set
  // only depends on this and the search/category/era filters, not on *which*
  // column it'll be sorted by (that's applied client-side), so this is what
  // the fetch effect below keys off instead of orderField itself.
  const sortModeActive = orderField !== null

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

  const [search, setSearch] = useState(getInitialSearch)
  const [debouncedSearch, setDebouncedSearch] = useState(getInitialSearch)
  // Sets rather than single values so "Search Settings" can filter by more
  // than one category/era at once (OR'd within each dimension, AND'd across
  // dimensions). The API itself only accepts one `category`/`era` value per
  // request, so anything beyond a single selection in either dimension has
  // to fall back to fetching everything and filtering client-side — see the
  // fetchAllMode fetch effect below.
  const [categoryFilter, setCategoryFilter] = useState<Set<Category>>(new Set())
  const [eraFilter, setEraFilter] = useState<Set<string>>(new Set())
  const multiFilterActive = categoryFilter.size > 1 || eraFilter.size > 1
  // Single-value form for the fast (server-side-filtered) path — only
  // meaningful when multiFilterActive is false, which is exactly when each
  // set has at most one member.
  const categoryParam: Category = categoryFilter.size === 1 ? [...categoryFilter][0] : ''
  const eraParam = eraFilter.size === 1 ? [...eraFilter][0] : ''

  const toggleCategoryFilter = useCallback((cat: Category) => {
    setCategoryFilter(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }, [])
  const toggleEraFilter = useCallback((eraName: string) => {
    setEraFilter(prev => {
      const next = new Set(prev)
      if (next.has(eraName)) next.delete(eraName)
      else next.add(eraName)
      return next
    })
  }, [])
  const matchesFilters = useCallback((song: JWApiSong): boolean => {
    if (categoryFilter.size > 0 && !categoryFilter.has(song.category as Category)) return false
    if (eraFilter.size > 0 && !(song.era && eraFilter.has(song.era.name))) return false
    return true
  }, [categoryFilter, eraFilter])

  useEffect(() => {
    if (apiTrackerCategory) { setCategoryFilter(new Set([apiTrackerCategory as Category])); setApiTrackerCategory('') }
    if (apiTrackerEra) { setEraFilter(new Set([apiTrackerEra])); setApiTrackerEra('') }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lyric search (separate tab) — its own query/results, independent of
  // the main song list's search/category/era/sort state above.
  const [lyricsQuery, setLyricsQuery] = useState('')
  const [debouncedLyricsQuery, setDebouncedLyricsQuery] = useState('')
  const [lyricsResults, setLyricsResults] = useState<JWApiSong[]>([])
  const [lyricsPage, setLyricsPage] = useState(1)
  const [lyricsCount, setLyricsCount] = useState(0)
  const [lyricsHasMore, setLyricsHasMore] = useState(false)
  const [lyricsLoading, setLyricsLoading] = useState(false)
  const [lyricsError, setLyricsError] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedLyricsQuery(lyricsQuery), 400)
    return () => clearTimeout(t)
  }, [lyricsQuery])

  useEffect(() => {
    if (!debouncedLyricsQuery.trim()) {
      setLyricsResults([]); setLyricsCount(0); setLyricsHasMore(false); setLyricsError(null)
      return
    }
    let cancelled = false
    setLyricsLoading(true); setLyricsError(null)
    apiFetch<JWApiPaginatedResponse>('/songs/', { lyrics: debouncedLyricsQuery, page: 1, page_size: PAGE_SIZE })
      .then((data) => {
        if (cancelled) return
        setLyricsResults(data.results)
        setLyricsCount(data.count)
        setLyricsHasMore(data.next !== null)
        setLyricsPage(1)
      })
      .catch((err) => { if (!cancelled) setLyricsError(err.message) })
      .finally(() => { if (!cancelled) setLyricsLoading(false) })
    return () => { cancelled = true }
  }, [debouncedLyricsQuery])

  const loadMoreLyrics = (): void => {
    if (lyricsLoading || !lyricsHasMore) return
    const nextPage = lyricsPage + 1
    setLyricsLoading(true)
    apiFetch<JWApiPaginatedResponse>('/songs/', { lyrics: debouncedLyricsQuery, page: nextPage, page_size: PAGE_SIZE })
      .then((data) => {
        setLyricsResults((prev) => [...prev, ...data.results])
        setLyricsHasMore(data.next !== null)
        setLyricsPage(nextPage)
      })
      .catch((err) => setLyricsError(err.message))
      .finally(() => setLyricsLoading(false))
  }

  // ── Calendar (separate tab) — songs grouped by recording date ─────────────
  // Fetches the whole catalog once (lazily, on first visiting the tab) since
  // there's no server-side way to filter/group by record_dates — it's parsed
  // out of free text client-side (see extractDateKeys above).
  const [calendarSongs, setCalendarSongs] = useState<JWApiSong[]>([])
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [calendarError, setCalendarError] = useState<string | null>(null)
  const calendarFetchedRef = useRef(false)

  useEffect(() => {
    if ((trackerTab !== 'calendar' && trackerTab !== 'producers') || calendarFetchedRef.current) return
    calendarFetchedRef.current = true
    setCalendarLoading(true)
    apiFetch<JWApiSong[]>('/songs/', { all: 'true' })
      .then(setCalendarSongs)
      .catch((err) => setCalendarError(err.message))
      .finally(() => setCalendarLoading(false))
  }, [trackerTab])

  const calendarByDate = useMemo(() => {
    const map = new Map<string, JWApiSong[]>()
    for (const song of calendarSongs) {
      for (const key of extractDateKeys(song.record_dates)) {
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(song)
      }
    }
    return map
  }, [calendarSongs])

  // `recording_locations` is also free text (e.g. "Record One Studios, Los
  // Angeles") — grouped by the exact trimmed string rather than parsed into
  // parts, since there's no reliable delimiter between studio name and city.
  const calendarByStudio = useMemo(() => {
    const map = new Map<string, JWApiSong[]>()
    for (const song of calendarSongs) {
      const loc = song.recording_locations?.trim()
      if (!loc) continue
      if (!map.has(loc)) map.set(loc, [])
      map.get(loc)!.push(song)
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [calendarSongs])

  // `producers` and `engineers` are both free text, often multiple names
  // separated by commas (e.g. "Nick Mira, Taz Taylor") — split so each
  // person gets their own entry instead of grouping by the exact combined
  // string. Kept as two separate groupings (rather than merged) so a name
  // that appears in both credits still shows up as distinct panels.
  const groupByNameField = (songs: JWApiSong[], field: (s: JWApiSong) => string | null | undefined): [string, JWApiSong[]][] => {
    const map = new Map<string, JWApiSong[]>()
    for (const song of songs) {
      const raw = field(song)
      if (!raw) continue
      for (const part of raw.split(',')) {
        const name = part.trim()
        if (!name) continue
        if (!map.has(name)) map.set(name, [])
        map.get(name)!.push(song)
      }
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
  }

  const producersByName = useMemo(
    () => groupByNameField(calendarSongs, (s) => s.producers),
    [calendarSongs]
  )
  const engineersByName = useMemo(
    () => groupByNameField(calendarSongs, (s) => s.engineers),
    [calendarSongs]
  )

  // Assigns each era a stable color by its position in `eras` (already
  // fetched for the category sidebar) — same era always maps to the same
  // color as long as the API keeps returning eras in the same order.
  const eraColorMap = useMemo(() => {
    const map = new Map<string, EraColor>()
    eras.forEach((era, i) => map.set(era.name, ERA_COLOR_PALETTE[i % ERA_COLOR_PALETTE.length]))
    return map
  }, [eras])

  // Restores the last-viewed month from localStorage (this view unmounts
  // whenever the user switches tabs, so component state alone doesn't
  // survive a round trip). Falls back to May 2018 for first-time visitors.
  const [calendarMonth, setCalendarMonth] = useState<{ year: number; month: number }>(() => {
    const saved = localStorage.getItem(LS_TRACKER_CALENDAR_MONTH)
    if (saved) {
      const [y, m] = saved.split('-').map(Number)
      if (Number.isFinite(y) && Number.isFinite(m)) return { year: y, month: m }
    }
    return { year: 2018, month: 4 }
  })

  useEffect(() => {
    localStorage.setItem(LS_TRACKER_CALENDAR_MONTH, `${calendarMonth.year}-${calendarMonth.month}`)
  }, [calendarMonth])

  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)
  const [selectedStudio, setSelectedStudio] = useState<string | null>(null)
  const [selectedProducer, setSelectedProducer] = useState<string | null>(null)
  const [selectedEngineer, setSelectedEngineer] = useState<string | null>(null)

  const shiftCalendarMonth = (delta: number): void => {
    setCalendarMonth((prev) => {
      const base = prev ?? { year: new Date().getFullYear(), month: new Date().getMonth() }
      let month = base.month + delta
      let year = base.year
      if (month < 0) { month = 11; year -= 1 }
      if (month > 11) { month = 0; year += 1 }
      return { year, month }
    })
  }

  // Clicking a badge on a song row jumps to "just this one" rather than
  // adding to the current multi-select, matching the old single-filter UX.
  const handleCategoryClick = useCallback((cat: Category) => { setCategoryFilter(new Set(cat ? [cat] : [])); resetSongs() }, [resetSongs])
  const handleEraClick = useCallback((eraName: string) => { setEraFilter(new Set(eraName ? [eraName] : [])); resetSongs() }, [resetSongs])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstDebounce = useRef(true)

  useEffect(() => { localStorage.setItem(LS_TRACKER_SEARCH, search) }, [search])

  // Reflect each settled search in the URL (?q=...) via pushState, one history
  // entry per search, so the back button steps through previous searches
  // instead of just leaving the page. Skipped in Electron (see getInitialSearch)
  // and on the very first render, since that value already came from the URL.
  const isFirstUrlSync = useRef(true)
  useEffect(() => {
    if (window.location.protocol === 'file:') return
    if (isFirstUrlSync.current) { isFirstUrlSync.current = false; return }
    const url = new URL(window.location.href)
    if (debouncedSearch) url.searchParams.set('q', debouncedSearch)
    else url.searchParams.delete('q')
    window.history.pushState({}, '', url)
  }, [debouncedSearch])

  // Restore the search box when the user navigates back/forward through
  // those history entries.
  useEffect(() => {
    if (window.location.protocol === 'file:') return
    const onPopState = (): void => {
      const q = new URLSearchParams(window.location.search).get('q') || ''
      isFirstUrlSync.current = true // this sync came from the URL — don't push it again
      setSearch(q)
      setDebouncedSearch(q)
      resetSongs()
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [resetSongs])

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

  // ── FETCH-ALL MODE: load the entire (server-filtered) result set, then sort
  // and/or filter client-side ─────────────────────────────────────────────────
  // The API has no ordering param and only accepts one category/era value per
  // request, so both "sort by column" and "more than one category/era
  // selected" fall back to fetching every matching page up front. category/
  // era are still passed server-side when there's exactly one value selected
  // (categoryParam/eraParam) to shrink the payload — matchesFilters then
  // covers whichever dimension has 2+ values, which the server can't do.
  // Keyed on sortModeActive/multiFilterActive rather than orderField directly
  // — switching which column is active only changes how the already-fetched
  // songs are sorted (see the sortedSongs memo below), so it must not
  // re-trigger this fetch.
  const fetchAllMode = sortModeActive || multiFilterActive
  useEffect(() => {
    if (!fetchAllMode) return
    let cancelled = false
    loadingRef.current = true
    setLoading(true); setError(null); setSongs([]); setHasMore(false); setCount(0)
    const t0 = performance.now()
    const PAGE_SIZE_SORT = 200 // bigger batches to reduce round-trips
    const CONCURRENCY = 6 // fetch several pages in parallel instead of one at a time
    runLog('tracker-sort', `start search=${JSON.stringify(debouncedSearch)} category=${categoryParam || '-'} era=${eraParam || '-'} multi=${multiFilterActive}`)
    const fetchPage = (p: number): Promise<JWApiPaginatedResponse> => apiFetch<JWApiPaginatedResponse>('/songs/', {
      searchall: debouncedSearch || undefined,
      category: categoryParam || undefined,
      era: eraParam || undefined,
      page: p,
      page_size: PAGE_SIZE_SORT,
    })
    ;(async () => {
      try {
        const first = await fetchPage(1)
        if (cancelled) return
        const all: JWApiSong[] = [...first.results]
        setSongs(all.filter(matchesFilters))
        setCount(first.count)
        runLog('tracker-sort', `page 1 loaded, accumulated ${all.length}/${first.count}`)

        const totalPages = Math.ceil(first.count / PAGE_SIZE_SORT)
        let nextPage = 2
        const worker = async (): Promise<void> => {
          while (!cancelled) {
            const p = nextPage++
            if (p > totalPages) return
            const data = await fetchPage(p)
            if (cancelled) return
            all.push(...data.results)
            setSongs(all.filter(matchesFilters)) // progressive display while loading
            runLog('tracker-sort', `page ${p} loaded, accumulated ${all.length}/${first.count}`)
          }
        }
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(totalPages - 1, 0)) }, worker))
        if (!cancelled) {
          // Once everything is in, the real total is however many actually
          // pass the (possibly multi-value) filter, not the server's raw
          // category/era-agnostic-or-partial count.
          setCount(all.filter(matchesFilters).length)
          runLog('tracker-sort', `done ${all.length} songs in ${Math.round(performance.now() - t0)}ms`)
        }
      } catch (e) {
        if (!cancelled) { setError((e as Error).message); runLog('tracker-sort', 'ERROR', e as Error) }
      } finally {
        if (!cancelled) { loadingRef.current = false; setLoading(false) }
      }
    })()
    return () => { cancelled = true }
  }, [fetchAllMode, debouncedSearch, categoryParam, eraParam, matchesFilters])

  // ── SCROLL MODE: infinite scroll, accumulates pages ──────────────────────────
  useEffect(() => {
    if (fetchAllMode) return // fetch-all mode handles fetching
    let cancelled = false
    loadingRef.current = true
    setLoading(true); setError(null)
    apiFetch<JWApiPaginatedResponse>('/songs/', {
      searchall: debouncedSearch || undefined,
      category: categoryParam || undefined,
      era: eraParam || undefined,
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
  }, [debouncedSearch, categoryParam, eraParam, page, fetchAllMode])

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
    let filtered = filterCompactGroups(compactGroups, debouncedSearch, s => [
      s.track_titles?.join(' '), s.name, s.credited_artists, s.producers, s.engineers,
      s.era?.name, s.notes, s.additional_information, s.session_titles, s.original_key,
    ].filter(Boolean).join(' '))
    // Category/era filters aren't sent server-side for compact view (the
    // whole catalog is always fetched — see fetchAllCompactGroups above), so
    // apply them here instead. A group counts as a match if any of its
    // versions does, same as clicking a member's own category/era badge.
    if (categoryFilter.size > 0 || eraFilter.size > 0) {
      filtered = filtered.filter(g => g.members.some(m => matchesFilters(m.item)))
    }
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
  }, [compactGroups, debouncedSearch, compactSort, categoryFilter, eraFilter, matchesFilters])

  const handlePlay = useCallback((song: JWApiSong) => {
    const track = songToTrack(song)
    // If shuffle is already on, start radio mode from this track instead of
    // loading the visible page into the queue.
    if (shuffle) {
      const rf = (!fetchAllMode && hasMore)
        ? { category: categoryParam, era: eraParam, search: debouncedSearch, total: count }
        : null
      startRadio(track, rf)
      return
    }
    const playable = sortedSongs.filter((s) => !!s.path)
    const context = playable.map(songToTrack)
    const needsLazy = !fetchAllMode && hasMore
    playTrack(track, context.length > 0 ? context : [track], needsLazy ? {
      category: categoryParam, era: eraParam, search: debouncedSearch,
      page: page + 1, hasMore: true, total: count,
    } : null, 'tracker')
  }, [playTrack, startRadio, shuffle, sortedSongs, categoryParam, eraParam, debouncedSearch, count, hasMore, fetchAllMode, page])

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
  // Sessions/unsurfaced songs can't go in playlists or the queue — same rule
  // the single-song menu already enforces (see canAddToPlaylist/canQueue in
  // SongContextMenu.tsx). If even one selected song is unplayable, both bulk
  // actions are disabled entirely rather than silently dropping it — a
  // partial add on a selection the user made as one unit is surprising.
  const bulkEligibleSongs = useMemo(
    () => selectedSongs.filter(s => !['recording_session', 'unsurfaced'].includes(s.category)),
    [selectedSongs]
  )
  const canBulkAddToPlaylist = selectedSongs.length > 0 && bulkEligibleSongs.length === selectedSongs.length
  const canBulkAddToQueue = selectedSongs.length > 0
    && bulkEligibleSongs.length === selectedSongs.length
    && bulkEligibleSongs.every(s => s.path)

  // Which playlists already contain *every* eligible selected song — shown
  // as a checkmark so re-adding to a playlist the whole selection is
  // already in isn't a silent no-op.
  const [bulkContained, setBulkContained] = useState<Set<number>>(new Set())
  useEffect(() => {
    if (!account || !canBulkAddToPlaylist || playlists.length === 0 || !(showBulkPlaylists || bulkContextMenu?.showPlaylists)) {
      setBulkContained(new Set())
      return
    }
    const ids = selectedSongs.map(s => s.id)
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
  }, [playlists, account, selectedSongs, showBulkPlaylists, bulkContextMenu?.showPlaylists])

  const bulkAddToQueue = (): void => {
    // Only reachable when canBulkAddToQueue is true, i.e. every selected
    // song is eligible and playable.
    selectedSongs.forEach(s => addToQueue(songToTrack(s)))
    exitSelectMode()
  }

  const bulkAddToPlaylist = async (playlistId: number): Promise<void> => {
    // Only reachable when canBulkAddToPlaylist is true, i.e. every selected
    // song is eligible.
    await Promise.all(selectedSongs.map(s => userApi.addToPlaylist(playlistId, s.id).catch(() => {})))
    await refreshPlaylists()
    useStore.getState().autoDownloadIfOffline(playlistId, selectedSongs.map(s => s.id))
    exitSelectMode()
  }

  const bulkDownloadZip = async (): Promise<void> => {
    const paths = selectedSongs.map(s => s.path).filter(Boolean) as string[]
    const skipped = selectedSongs.length - paths.length
    if (paths.length === 0) {
      setBulkZipSkipped(skipped)
      setBulkZipStatus('none')
      setTimeout(() => setBulkZipStatus('idle'), 4000)
      return
    }
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
      setBulkZipSkipped(skipped)
      setBulkZipStatus(skipped > 0 ? 'partial' : 'done')
    } catch {
      setBulkZipStatus('error')
    }
    setTimeout(() => setBulkZipStatus('idle'), skipped > 0 ? 5000 : 3000)
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
      for (const id of rest) await linkSongVersion(first, id)
      invalidateCompactGroupsCache()
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

        <div className="flex items-center gap-0.5 mb-2.5 w-fit bg-surface-overlay rounded-md p-0.5">
          <button
            onClick={() => setTrackerTab('songs')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
              trackerTab === 'songs'
                ? 'bg-surface-raised text-text-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <Music2 size={11} /> Songs
          </button>
          <button
            onClick={() => setTrackerTab('lyrics')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
              trackerTab === 'lyrics'
                ? 'bg-surface-raised text-text-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <Mic2 size={11} /> Lyrics
          </button>
          <button
            onClick={() => setTrackerTab('calendar')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
              trackerTab === 'calendar'
                ? 'bg-surface-raised text-text-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <CalendarDays size={11} /> Overview
          </button>
          <button
            onClick={() => setTrackerTab('producers')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
              trackerTab === 'producers'
                ? 'bg-surface-raised text-text-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <Users size={11} /> Producers
          </button>
        </div>

        {trackerTab === 'songs' && <StatsBar stats={stats} />}

        {trackerTab === 'songs' && <div className="flex flex-col gap-2">
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
              value={categoryParam}
              onChange={(e) => { setCategoryFilter(new Set(e.target.value ? [e.target.value as Category] : [])); resetSongs() }}
              className="md:hidden flex-1 min-w-0 bg-surface-overlay text-text-primary text-sm px-3 py-2.5 rounded-lg outline-none border border-transparent focus:ring-1 ring-accent focus:border-accent/40 cursor-pointer"
            >
              <option value="">{categoryFilter.size > 1 ? `${categoryFilter.size} categories` : 'All categories'}</option>
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
                  onClick={() => setViewMode('detail')}
                  className={`p-2 md:p-1.5 rounded-md transition-colors ${viewMode === 'detail' ? 'bg-surface-raised text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}
                  title="Detailed view"
                >
                  <Rows3 size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Active filter chips — one per selected category/era, each
              individually removable so multi-select filters can be trimmed
              down one at a time instead of all-or-nothing. */}
          {(categoryFilter.size > 0 || eraFilter.size > 0) && (
            <div className="flex gap-1.5 flex-wrap">
              {[...categoryFilter].map((cat) => (
                <button
                  key={cat}
                  onClick={() => { toggleCategoryFilter(cat); resetSongs() }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/15 text-accent text-xs font-medium"
                >
                  {CATEGORY_LABELS[cat] ?? cat}
                  <X size={10} />
                </button>
              ))}
              {[...eraFilter].map((eraName) => (
                <button
                  key={eraName}
                  onClick={() => { toggleEraFilter(eraName); resetSongs() }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/15 text-accent text-xs font-medium"
                >
                  {eraName}
                  <X size={10} />
                </button>
              ))}
            </div>
          )}
        </div>}

        {trackerTab === 'lyrics' && (
          <div className="relative w-full">
            <Mic2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Search lyrics…"
              value={lyricsQuery}
              onChange={(e) => setLyricsQuery(e.target.value)}
              className="w-full bg-surface-overlay text-text-primary text-sm pl-8 pr-8 py-2.5 md:py-2 rounded-lg outline-none focus:ring-1 ring-accent border border-transparent focus:border-accent/40 placeholder:text-text-muted"
            />
            {lyricsQuery && (
              <button onClick={() => setLyricsQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
                <X size={13} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      {trackerTab === 'lyrics' ? (
        <div className="flex-1 overflow-y-auto px-3 md:px-5 pb-4">
          {!debouncedLyricsQuery.trim() ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <Mic2 size={32} className="text-text-muted opacity-30" />
              <p className="text-text-muted text-sm">Search for a lyric to find matching songs</p>
            </div>
          ) : lyricsLoading && lyricsResults.length === 0 ? (
            <div className="flex items-center justify-center h-40 gap-2 text-text-muted">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">Searching…</span>
            </div>
          ) : lyricsError ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-center">
              <p className="text-text-muted text-sm">Failed to search: {lyricsError}</p>
            </div>
          ) : lyricsResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <Mic2 size={32} className="text-text-muted opacity-30" />
              <p className="text-text-muted text-sm">No songs found with lyrics matching "{debouncedLyricsQuery}"</p>
            </div>
          ) : (
            <>
              <div className="space-y-0.5">
                {lyricsResults.map((song) => (
                  <LyricResultRow
                    key={song.id}
                    song={song}
                    query={debouncedLyricsQuery}
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
              {lyricsHasMore ? (
                <div className="flex items-center justify-center py-4">
                  <button
                    onClick={loadMoreLyrics}
                    disabled={lyricsLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-overlay hover:bg-surface-raised text-text-primary rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
                  >
                    {lyricsLoading && <Loader2 size={13} className="animate-spin" />}
                    Load more
                  </button>
                </div>
              ) : (
                <p className="text-center text-text-muted text-xs py-4">{lyricsCount.toLocaleString()} songs found</p>
              )}
            </>
          )}
        </div>
      ) : trackerTab === 'calendar' ? (
        <div className="flex-1 overflow-y-auto px-3 md:px-5 pb-4">
          {calendarLoading ? (
            <div className="flex items-center justify-center h-40 gap-2 text-text-muted">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">Loading recording dates…</span>
            </div>
          ) : calendarError ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-center">
              <p className="text-text-muted text-sm">Failed to load: {calendarError}</p>
            </div>
          ) : calendarByDate.size === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <CalendarDays size={32} className="text-text-muted opacity-30" />
              <p className="text-text-muted text-sm">No recording dates found</p>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row gap-5 md:gap-6 items-start">
              <div className="w-full md:w-80 shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={() => shiftCalendarMonth(-1)}
                    className="p-2 md:p-1.5 rounded-lg hover:bg-surface-overlay active:bg-surface-overlay text-text-muted hover:text-text-primary transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <p className="text-text-primary text-sm font-semibold">
                    {calendarMonth ? `${MONTH_LABELS[calendarMonth.month]} ${calendarMonth.year}` : ''}
                  </p>
                  <button
                    onClick={() => shiftCalendarMonth(1)}
                    className="p-2 md:p-1.5 rounded-lg hover:bg-surface-overlay active:bg-surface-overlay text-text-muted hover:text-text-primary transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-1">
                  {WEEKDAY_LABELS.map((label) => (
                    <div key={label} className="text-center text-text-muted text-[10px] font-medium uppercase tracking-wide py-1">
                      {label}
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-1">
                  {calendarMonth && buildMonthGrid(calendarMonth.year, calendarMonth.month).map((week, wi) => (
                    <div key={wi} className="grid grid-cols-7 gap-1">
                      {week.map((date, di) => {
                        if (!date) return <div key={di} />
                        const key = dateKey(date.getFullYear(), date.getMonth(), date.getDate())
                        const daySongs = calendarByDate.get(key)
                        const isSelected = selectedDateKey === key
                        const dayEraNames = daySongs
                          ? [...new Set(daySongs.map((s) => s.era?.name).filter((n): n is string => !!n))]
                          : []
                        const soleEraColor = dayEraNames.length === 1 ? eraColorMap.get(dayEraNames[0]) ?? DEFAULT_ERA_COLOR : null
                        return (
                          <button
                            key={di}
                            onClick={() => { if (daySongs) { setSelectedDateKey(key); setSelectedStudio(null) } }}
                            disabled={!daySongs}
                            title={dayEraNames.join(', ') || undefined}
                            className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors border ${
                              isSelected
                                ? 'bg-accent border-accent text-white font-semibold'
                                : !daySongs
                                  ? 'border-transparent text-text-muted opacity-40 cursor-default'
                                  : soleEraColor
                                    ? `${soleEraColor.bg} ${soleEraColor.border} ${soleEraColor.text} font-medium hover:opacity-80 cursor-pointer`
                                    : 'bg-accent/10 border-transparent text-accent font-medium hover:bg-accent/20 cursor-pointer'
                            }`}
                          >
                            <span className="text-xs leading-none">{date.getDate()}</span>
                            {daySongs && (
                              <span className={`text-[9px] leading-none tabular-nums ${isSelected ? 'text-white/80' : 'opacity-70'}`}>
                                {daySongs.length}
                              </span>
                            )}
                            {!isSelected && dayEraNames.length > 1 && (
                              <span className="flex items-center gap-0.5 mt-0.5">
                                {dayEraNames.slice(0, 4).map((name) => (
                                  <span key={name} className={`w-1 h-1 rounded-full ${(eraColorMap.get(name) ?? DEFAULT_ERA_COLOR).dot}`} />
                                ))}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>

                {eras.length > 0 && (
                  <div className="flex flex-wrap gap-x-2.5 gap-y-1 mt-3 pt-3 border-t border-[var(--border)]">
                    {eras.map((era) => (
                      <div key={era.id} className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${(eraColorMap.get(era.name) ?? DEFAULT_ERA_COLOR).dot}`} />
                        <span className="text-text-muted text-[10px] truncate">{era.name}</span>
                      </div>
                    ))}
                  </div>
                )}

                {calendarByStudio.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[var(--border)]">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-1.5">Studios</p>
                    <div className="flex flex-col max-h-64 overflow-y-auto -mx-1">
                      {calendarByStudio.map(([studio, songs]) => (
                        <button
                          key={studio}
                          onClick={() => { setSelectedStudio(studio); setSelectedDateKey(null) }}
                          title={studio}
                          className={`flex items-center justify-between gap-2 px-1 py-1.5 md:py-1 rounded-lg text-left text-xs transition-colors ${
                            selectedStudio === studio
                              ? 'text-accent font-semibold bg-accent/5'
                              : 'text-text-secondary hover:text-text-primary active:bg-surface-overlay hover:bg-surface-overlay'
                          }`}
                        >
                          <span className="truncate">{studio}</span>
                          <span className="text-text-muted text-[10px] tabular-nums shrink-0">{songs.length}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0 w-full">
                {selectedStudio ? (
                  <>
                    <p className="text-text-muted text-[11px] font-semibold uppercase tracking-wide mb-2 truncate" title={selectedStudio}>
                      Recorded at {selectedStudio}
                      {' '}· {(calendarByStudio.find(([s]) => s === selectedStudio)?.[1] ?? []).length}{' '}
                      {(calendarByStudio.find(([s]) => s === selectedStudio)?.[1] ?? []).length === 1 ? 'song' : 'songs'}
                    </p>
                    <div className="space-y-0.5">
                      {(calendarByStudio.find(([s]) => s === selectedStudio)?.[1] ?? []).map((song) => (
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
                  </>
                ) : !selectedDateKey ? (
                  <p className="text-text-muted text-xs py-4">Select a highlighted day, or a studio, to see songs recorded there.</p>
                ) : (
                  <>
                    <p className="text-text-muted text-[11px] font-semibold uppercase tracking-wide mb-2">
                      Recorded {new Date(selectedDateKey + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                      {' '}· {(calendarByDate.get(selectedDateKey) ?? []).length} {(calendarByDate.get(selectedDateKey) ?? []).length === 1 ? 'song' : 'songs'}
                    </p>
                    <div className="space-y-0.5">
                      {(calendarByDate.get(selectedDateKey) ?? []).map((song) => (
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
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      ) : trackerTab === 'producers' ? (
        <div className="flex-1 overflow-y-auto px-3 md:px-5 pb-4">
          {calendarLoading ? (
            <div className="flex items-center justify-center h-40 gap-2 text-text-muted">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">Loading producers…</span>
            </div>
          ) : calendarError ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-center">
              <p className="text-text-muted text-sm">Failed to load: {calendarError}</p>
            </div>
          ) : producersByName.length === 0 && engineersByName.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <Users size={32} className="text-text-muted opacity-30" />
              <p className="text-text-muted text-sm">No producer or engineer credits found</p>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row gap-5 md:gap-6 items-start">
              <div className="w-full md:w-80 shrink-0 flex flex-col gap-4">
                {producersByName.length > 0 && (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-1.5">Producers</p>
                    <div className="flex flex-col max-h-64 overflow-y-auto -mx-1">
                      {producersByName.map(([producer, songs]) => (
                        <button
                          key={producer}
                          onClick={() => { setSelectedProducer(producer); setSelectedEngineer(null) }}
                          title={producer}
                          className={`flex items-center justify-between gap-2 px-1 py-1.5 md:py-1 rounded-lg text-left text-xs transition-colors ${
                            selectedProducer === producer
                              ? 'text-accent font-semibold bg-accent/5'
                              : 'text-text-secondary hover:text-text-primary active:bg-surface-overlay hover:bg-surface-overlay'
                          }`}
                        >
                          <span className="truncate">{producer}</span>
                          <span className="text-text-muted text-[10px] tabular-nums shrink-0">{songs.length}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {engineersByName.length > 0 && (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-1.5">Engineers</p>
                    <div className="flex flex-col max-h-64 overflow-y-auto -mx-1">
                      {engineersByName.map(([engineer, songs]) => (
                        <button
                          key={engineer}
                          onClick={() => { setSelectedEngineer(engineer); setSelectedProducer(null) }}
                          title={engineer}
                          className={`flex items-center justify-between gap-2 px-1 py-1.5 md:py-1 rounded-lg text-left text-xs transition-colors ${
                            selectedEngineer === engineer
                              ? 'text-accent font-semibold bg-accent/5'
                              : 'text-text-secondary hover:text-text-primary active:bg-surface-overlay hover:bg-surface-overlay'
                          }`}
                        >
                          <span className="truncate">{engineer}</span>
                          <span className="text-text-muted text-[10px] tabular-nums shrink-0">{songs.length}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0 w-full">
                {selectedProducer ? (
                  <>
                    <p className="text-text-muted text-[11px] font-semibold uppercase tracking-wide mb-2 truncate" title={selectedProducer}>
                      Produced by {selectedProducer}
                      {' '}· {(producersByName.find(([p]) => p === selectedProducer)?.[1] ?? []).length}{' '}
                      {(producersByName.find(([p]) => p === selectedProducer)?.[1] ?? []).length === 1 ? 'song' : 'songs'}
                    </p>
                    <div className="space-y-0.5">
                      {(producersByName.find(([p]) => p === selectedProducer)?.[1] ?? []).map((song) => (
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
                  </>
                ) : selectedEngineer ? (
                  <>
                    <p className="text-text-muted text-[11px] font-semibold uppercase tracking-wide mb-2 truncate" title={selectedEngineer}>
                      Engineered by {selectedEngineer}
                      {' '}· {(engineersByName.find(([e]) => e === selectedEngineer)?.[1] ?? []).length}{' '}
                      {(engineersByName.find(([e]) => e === selectedEngineer)?.[1] ?? []).length === 1 ? 'song' : 'songs'}
                    </p>
                    <div className="space-y-0.5">
                      {(engineersByName.find(([e]) => e === selectedEngineer)?.[1] ?? []).map((song) => (
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
                  </>
                ) : (
                  <p className="text-text-muted text-xs py-4">Select a producer or engineer to see songs they worked on.</p>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {showSidebar && (
          <div className="hidden md:flex min-h-0">
            <CategorySidebar
              stats={stats}
              eras={eras}
              selectedCategories={categoryFilter}
              selectedEras={eraFilter}
              onCategory={(c) => { toggleCategoryFilter(c); resetSongs() }}
              onEra={(e) => { toggleEraFilter(e); resetSongs() }}
              onClearCategories={() => { setCategoryFilter(new Set()); resetSongs() }}
              onClearEras={() => { setEraFilter(new Set()); resetSongs() }}
            />
          </div>
        )}

        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Column headers. Compact view swaps in its own pair (Title /
              Versions sorting the grouped rows) in the SAME outer slot as the
              flat headers — same wrapper + padding, so the list below starts
              at an identical y-offset and nothing jumps when toggling. */}
          {viewMode === 'list' && (
            <div className="hidden md:block px-5 pb-1 shrink-0">
              <div className="flex items-center gap-3 px-3 py-1">
                <div className="w-9 shrink-0" />
                {compactView ? (
                  <>
                    <button
                      onClick={() => handleCompactSort('name')}
                      className={`flex-1 flex items-center gap-0.5 text-xs font-medium uppercase tracking-wider transition-colors ${compactSort.field === 'name' ? 'text-accent' : 'text-text-muted hover:text-text-secondary'}`}
                    >
                      Title
                      {compactSort.field === 'name'
                        ? compactSort.dir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />
                        : <span className="w-2.5" />}
                    </button>
                    {/* Static label — compact view has no category sort; sits
                        over CompactGroupRow's w-24 category badge column. */}
                    <span className="w-24 shrink-0 text-center text-xs font-medium uppercase tracking-wider text-text-muted">Category</span>
                    <button
                      onClick={() => handleCompactSort('versions')}
                      className={`w-20 shrink-0 justify-end flex items-center gap-0.5 text-xs font-medium uppercase tracking-wider transition-colors ${compactSort.field === 'versions' ? 'text-accent' : 'text-text-muted hover:text-text-secondary'}`}
                    >
                      Versions
                      {compactSort.field === 'versions'
                        ? compactSort.dir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />
                        : <span className="w-2.5" />}
                    </button>
                    {/* Trails the expand chevron CompactGroupRow renders at
                        the row's right edge, keeping "Versions" over the count. */}
                    <span className="shrink-0" style={{ width: 14 }} />
                  </>
                ) : (
                  <>
                    <SortBtn field="name" label="Title" className="flex-1" orderField={orderField} orderDir={orderDir} onClick={handleSort} />
                    <SortBtn field="credited_artists" label="Artist" className="w-32 shrink-0" orderField={orderField} orderDir={orderDir} onClick={handleSort} />
                    <SortBtn field="era__name" label="Era" className="w-36 shrink-0" orderField={orderField} orderDir={orderDir} onClick={handleSort} />
                    <SortBtn field="category" label="Category" className="w-24 shrink-0 justify-center" orderField={orderField} orderDir={orderDir} onClick={handleSort} />
                    <SortBtn field="length" label="Time" className="w-12 shrink-0 justify-end" orderField={orderField} orderDir={orderDir} onClick={handleSort} />
                    <div className="w-14 shrink-0" />
                  </>
                )}
              </div>
            </div>
          )}

          {/* Song list / grid */}
          {/* relative so CompactGroupList's offset math is measured against
              this scroller rather than some higher positioned ancestor. */}
          <div ref={listScrollRef} className="relative flex-1 overflow-y-auto px-3 md:px-5 pb-4">
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
              <CompactGroupList
                scrollRef={listScrollRef}
                groups={filteredCompactGroups}
                expanded={expandedGroups}
                onToggleGroup={handleToggleGroup}
                onGroupContextMenu={handleGroupContextMenu}
                onPlay={handlePlay}
                onCategoryClick={handleCategoryClick}
                onEraClick={handleEraClick}
                onInfo={handleInfo}
                onContextMenu={handleContextMenu}
                selectMode={selectMode}
                selected={selected}
                onToggleSelect={toggleSelect}
              />
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
              <VirtualSongList
                scrollRef={listScrollRef}
                songs={sortedSongs}
                onPlay={handlePlay}
                onCategoryClick={handleCategoryClick}
                onEraClick={handleEraClick}
                onInfo={handleInfo}
                onContextMenu={handleContextMenu}
                selectMode={selectMode}
                selected={selected}
                onToggleSelect={toggleSelect}
              />
            ) : (
              <VirtualSongDetailList
                scrollRef={listScrollRef}
                songs={sortedSongs}
                onPlay={handlePlay}
                onCategoryClick={handleCategoryClick}
                onEraClick={handleEraClick}
                onInfo={handleInfo}
                onContextMenu={handleContextMenu}
                selectMode={selectMode}
                selected={selected}
                onToggleSelect={toggleSelect}
              />
            )}
            {/* Sentinel always in DOM so IntersectionObserver is set up from mount */}
            <div ref={sentinelRef} className="h-4" />
            {loading && sortedSongs.length > 0 && (
              <div className="flex items-center justify-center gap-2 py-4 text-text-muted">
                <Loader2 size={16} className="animate-spin" />
                {fetchAllMode && <span className="text-xs">{sortedSongs.length.toLocaleString()} / {count.toLocaleString()} loaded</span>}
              </div>
            )}
            {!loading && !hasMore && sortedSongs.length > 0 && (
              <p className="text-center text-text-muted text-xs py-4">{count.toLocaleString()} songs total</p>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Bulk selection action bar */}
      {selectMode && (
        <div className="shrink-0 border-t border-[var(--border)] bg-surface relative">
          {(bulkZipStatus === 'partial' || bulkZipStatus === 'none') && (
            <div className="px-4 py-2 flex items-center gap-2 bg-amber-500/10 border-b border-amber-500/30 text-amber-500 text-xs font-medium">
              <AlertTriangle size={14} className="shrink-0" />
              {bulkZipStatus === 'none'
                ? "Couldn't download — none of the selected songs have a file available yet."
                : `${bulkZipSkipped} of ${selected.size} selected song${selected.size === 1 ? '' : 's'} ${bulkZipSkipped === 1 ? "wasn't" : "weren't"} available and ${bulkZipSkipped === 1 ? 'was' : 'were'} left out of the ZIP.`}
            </div>
          )}
          <div className="px-4 py-2.5 flex items-center gap-2">
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
            disabled={selected.size === 0 || !canBulkAddToQueue}
            title={!canBulkAddToQueue && selected.size > 0 ? "Can't queue while a session/unsurfaced song is selected" : undefined}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-overlay hover:bg-surface-raised text-text-primary rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
          >
            <ListPlus size={13} /> Add to queue
          </button>
          <div className="relative">
            <button
              onClick={() => setShowBulkPlaylists(v => !v)}
              disabled={selected.size === 0 || !canBulkAddToPlaylist}
              title={!canBulkAddToPlaylist && selected.size > 0 ? "Can't add to playlist while a session/unsurfaced song is selected" : undefined}
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
            title={
              bulkZipStatus === 'partial'
                ? `${bulkZipSkipped} of ${selected.size} selected song${selected.size === 1 ? '' : 's'} couldn't be included (no file available)`
                : bulkZipStatus === 'none'
                ? 'None of the selected songs have a downloadable file'
                : undefined
            }
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 transition-opacity hover:opacity-90 ${
              bulkZipStatus === 'partial' || bulkZipStatus === 'none' ? 'bg-amber-500 text-white' : 'bg-accent text-white'
            }`}
          >
            {bulkZipStatus === 'zipping' ? (
              <><Loader2 size={13} className="animate-spin" /> Zipping…</>
            ) : bulkZipStatus === 'done' ? (
              <><Check size={13} /> Done</>
            ) : bulkZipStatus === 'partial' ? (
              <><AlertTriangle size={13} /> {bulkZipSkipped} skipped</>
            ) : bulkZipStatus === 'none' ? (
              <><AlertTriangle size={13} /> No files available</>
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
          canAddToQueue={canBulkAddToQueue}
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
              invalidateCompactGroupsCache()
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
