import { Music2 } from 'lucide-react'
import { Track } from '../types'

interface Props {
  track: Track
  size?: number
  className?: string
  shimmer?: boolean
  rootMargin?: string
  // Fill the parent instead of taking a fixed size — for callers that wrap the
  // thumbnail in their own sized box (mini player, queue, WRLD tab). Those
  // wrappers are rem-based already, so filling them scales just the same.
  fill?: boolean
}

// Web-only version — API tracks always have imageUrl, no IPC needed.
// `size` is a px design value, but the box is rendered in rem so covers scale
// with the app text-size setting (which drives the root font-size) instead of
// staying pinned while the surrounding rem-based text grows/shrinks around them.
export function AlbumArtThumbnail({ track, size = 40, className = '', fill = false }: Props): JSX.Element {
  const rem = `${size / 16}rem`
  // Inline width/height would outrank a `w-full`/`h-full` className, so in fill
  // mode we drop the inline size and let the class size the box to its parent.
  const sizeStyle = fill ? undefined : { width: rem, height: rem }
  if (track.imageUrl) {
    return (
      <img
        src={track.imageUrl}
        alt={track.title}
        style={sizeStyle}
        className={`object-cover shrink-0 ${className}`}
        loading="lazy"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
      />
    )
  }
  return (
    <div
      className={`flex items-center justify-center bg-surface-overlay text-text-muted shrink-0 ${className}`}
      style={sizeStyle}
    >
      <Music2 size={fill ? '40%' : `${(size * 0.4) / 16}rem`} />
    </div>
  )
}
