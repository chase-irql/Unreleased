import { useState, memo } from 'react'
import { ChevronUp, ChevronDown, Layers } from 'lucide-react'
import { AlbumArtThumbnail } from './AlbumArtThumbnail'
import { Track } from '../types'

/** Tracks which compact-view groups are expanded — shared so the Tracker and
 *  Playlists don't each carry their own copy of this Set-toggle boilerplate. */
export function useExpandedGroups(): { expanded: Set<number>; toggle: (groupId: number) => void; clear: () => void } {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const toggle = (groupId: number): void => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }
  const clear = (): void => setExpanded(new Set())
  return { expanded, toggle, clear }
}

/** Collapsed row representing a version group — cover art of one member,
 *  the shared title, and a member count. Expanding it is the caller's job
 *  (each view renders its own member rows below, since Tracker/Playlists
 *  have different row layouts). */
export const CompactGroupRow = memo(function CompactGroupRow({
  coverTrack, title, count, expanded, onToggle, onContextMenu,
  categoryLabel, categoryClassName,
}: {
  coverTrack: Track
  title: string
  count: number
  expanded: boolean
  onToggle: () => void
  /** Right-click (or long-press) the whole group — e.g. to act on all its
   *  versions at once. Left-click still expands/collapses. */
  onContextMenu?: (e: React.MouseEvent) => void
  /** Optional category badge for the group as a whole (the Tracker's compact
   *  view only — Playlists doesn't pass these, so the badge is omitted
   *  there). */
  categoryLabel?: string
  categoryClassName?: string
}): JSX.Element {
  return (
    <button
      onClick={onToggle}
      onContextMenu={onContextMenu}
      className="w-full flex items-center gap-3 px-3 py-2.5 md:py-2 hover:bg-surface-overlay rounded-lg transition-colors text-left"
    >
      <div className="shrink-0 w-10 h-10 md:w-9 md:h-9 rounded overflow-hidden bg-surface-overlay">
        <AlbumArtThumbnail track={coverTrack} size={36} shimmer={false} />
      </div>
      <span className="flex-1 min-w-0 text-text-primary text-sm font-medium truncate">{title}</span>
      {categoryLabel && (
        <span className={`hidden md:block text-xs px-1.5 py-0.5 rounded border shrink-0 w-24 text-center ${categoryClassName ?? 'text-text-muted bg-surface border-[var(--border)]'}`}>
          {categoryLabel}
        </span>
      )}
      {/* Fixed width so the category badges (and the count itself) line up
          in a column regardless of how wide "N versions" renders. */}
      <span className="text-text-muted text-xs shrink-0 w-20 text-right">{count} version{count === 1 ? '' : 's'}</span>
      {expanded ? <ChevronUp size={14} className="text-text-muted shrink-0" /> : <ChevronDown size={14} className="text-text-muted shrink-0" />}
    </button>
  )
}, (prev, next) =>
  // Compare by value, not reference — callers pass a freshly-built coverTrack
  // and inline onToggle/onContextMenu closures every render, so without this
  // every group header re-rendered whenever anything in the parent changed
  // (e.g. toggling a selection), freezing large compact lists. The closures
  // capture only stable state setters + this group's own id, so ignoring their
  // identity is safe.
  prev.coverTrack.id === next.coverTrack.id &&
  prev.title === next.title &&
  prev.count === next.count &&
  prev.expanded === next.expanded &&
  prev.categoryLabel === next.categoryLabel &&
  prev.categoryClassName === next.categoryClassName
)

/** Empty-state icon for compact view — re-exported so callers don't need
 *  their own lucide-react import just for this one icon. */
export { Layers as CompactEmptyIcon }
