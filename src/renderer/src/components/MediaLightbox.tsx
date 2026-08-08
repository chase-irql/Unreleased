import { useEffect, useCallback, useState } from 'react'
import { X, ChevronLeft, ChevronRight, AlertCircle, Download } from 'lucide-react'
import { smallCoverUrl } from '../lib/juicewrldApi'
import { useBackToClose } from '../hooks/useBackToClose'

export interface LightboxItem {
  url: string
  type: 'image' | 'video'
  name: string
}

interface Props {
  items: LightboxItem[]
  index: number
  onClose: () => void
  onNav: (index: number) => void
}

export default function MediaLightbox({ items, index, onClose, onNav }: Props): JSX.Element | null {
  useBackToClose(onClose)
  const [videoError, setVideoError] = useState(false)
  const item = items[index]

  // Reset video error when item changes
  useEffect(() => { setVideoError(false) }, [index])

  const goPrev = useCallback(() => {
    if (index > 0) onNav(index - 1)
  }, [index, onNav])

  const goNext = useCallback(() => {
    if (index < items.length - 1) onNav(index + 1)
  }, [index, items.length, onNav])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, goPrev, goNext])

  if (!item) return null

  const hasPrev = index > 0
  const hasNext = index < items.length - 1

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/95"
      onClick={onClose}
    >
      {/* Top bar — filename only. The counter/download/close controls used to
          live here too, right next to the Electron window's own minimize/
          maximize/close buttons — confusing and easy to misclick. They now
          float directly above the media itself instead. */}
      <div
        className="flex items-center px-4 py-3 shrink-0 bg-black/60 backdrop-blur-sm"
        // Fixed overlay, so the app shell's status-bar inset doesn't reach it.
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-white/80 text-sm truncate max-w-[60vw]">{item.name}</span>
      </div>

      {/* Media area */}
      <div
        className="flex-1 flex items-center justify-center relative overflow-hidden"
        onClick={onClose}
      >
        {/* Prev button */}
        {hasPrev && (
          <button
            onClick={(e) => { e.stopPropagation(); goPrev() }}
            className="absolute left-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/80 transition-colors"
            title="Previous (←)"
          >
            <ChevronLeft size={24} />
          </button>
        )}

        {/* Content, with its own controls (counter/download/close) directly above it */}
        <div onClick={(e) => e.stopPropagation()} className="max-w-full max-h-full flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5">
            {items.length > 1 && (
              <span className="text-white/40 text-xs">{index + 1} / {items.length}</span>
            )}
            <a
              href={item.url}
              download={item.name}
              className="p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              title="Download"
            >
              <Download size={16} />
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>
          {item.type === 'image' ? (
            <img
              src={item.url}
              alt={item.name}
              className="max-w-[90vw] max-h-[72vh] object-contain rounded shadow-2xl select-none"
              draggable={false}
            />
          ) : videoError ? (
            <div className="flex flex-col items-center gap-3 text-white/60 p-8">
              <AlertCircle size={40} className="text-white/30" />
              <p className="text-sm">This video format cannot be played in the app.</p>
              <a
                href={item.url}
                download={item.name}
                className="text-accent text-sm underline"
              >
                Download file instead
              </a>
            </div>
          ) : (
            <video
              src={item.url}
              controls
              autoPlay
              className="max-w-[90vw] max-h-[72vh] rounded shadow-2xl"
              onError={() => setVideoError(true)}
            />
          )}
        </div>

        {/* Next button */}
        {hasNext && (
          <button
            onClick={(e) => { e.stopPropagation(); goNext() }}
            className="absolute right-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/80 transition-colors"
            title="Next (→)"
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>

      {/* Filmstrip (if multiple items) */}
      {items.length > 1 && (
        <div
          className="shrink-0 flex items-center gap-1.5 px-4 py-2 overflow-x-auto bg-black/60 backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((it, i) => (
            <button
              key={it.url}
              onClick={() => onNav(i)}
              className={`shrink-0 w-12 h-12 rounded overflow-hidden border-2 transition-all ${
                i === index ? 'border-accent' : 'border-transparent opacity-50 hover:opacity-80'
              }`}
            >
              {it.type === 'image' ? (
                // 48px filmstrip cell — the degraded copy, while the main
                // view above keeps the original.
                <img src={smallCoverUrl(it.url)} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-surface-overlay flex items-center justify-center text-[10px] text-white/60 uppercase">
                  vid
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
