import { useState, useEffect, useRef, useCallback } from 'react'
import { useResizablePanel } from '../hooks/useResizablePanel'
import {
  X, Music, ChevronUp, ChevronDown, Pencil, Info,
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1,
} from 'lucide-react'
import { useStore, useStorePick } from '../store/useStore'
import LyricsDisplay from './LyricsDisplay'
import SongInfoModal from './SongInfoModal'
import { apiFetch, smallCoverUrl, JWApiSong } from '../lib/juicewrldApi'
import { ProgressiveCover } from './ProgressiveCover'
import { seekAudio, getAudioDuration } from './Player'
import { formatDuration } from '../lib/format'

// Full transport controls, mobile only. On desktop this panel sits beside the
// player bar, which already owns playback; on a phone the panel IS the player
// and had no way to play/pause, skip, shuffle, loop or seek — everything lived
// in the cramped mini bar. Seek drag mirrors WrldView's ProgressBar: buffer the
// position while scrubbing and only seek on release, since seeking on every
// move makes playback stutter.
function TransportControls(): JSX.Element {
  const {
    isPlaying, setIsPlaying, prevTrack, nextTrack,
    shuffle, toggleShuffle, repeat, toggleRepeat,
    progress, currentTime, radioFmActive,
  } = useStorePick(
    'isPlaying', 'setIsPlaying', 'prevTrack', 'nextTrack',
    'shuffle', 'toggleShuffle', 'repeat', 'toggleRepeat',
    'progress', 'currentTime', 'radioFmActive')

  const barRef = useRef<HTMLDivElement>(null)
  const [dragPct, setDragPct] = useState<number | null>(null)

  const pctFromClientX = useCallback((clientX: number): number | null => {
    const bar = barRef.current
    if (!bar) return null
    const rect = bar.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }, [])

  const duration = getAudioDuration()
  const displayTime = dragPct !== null && duration > 0 ? dragPct * duration : currentTime
  const pct = Math.min(100, (dragPct !== null ? dragPct : (progress || 0)) * 100)

  const iconBtn = 'w-11 h-11 flex items-center justify-center rounded-full transition-colors disabled:opacity-30'

  return (
    <div className="px-6 pt-1 pb-3 shrink-0 select-none">
      {/* Seek bar. touch-none stops the browser claiming the drag as a scroll,
          and the hit area is padded well beyond the 3px line so it's grabbable. */}
      <div
        ref={barRef}
        className={`relative h-[3px] rounded-full bg-[var(--surface-overlay)] py-0 my-3 touch-none ${radioFmActive ? 'opacity-40 pointer-events-none' : 'cursor-pointer'}`}
        style={{ paddingTop: 12, paddingBottom: 12, backgroundClip: 'content-box' }}
        onMouseDown={(e) => {
          const start = pctFromClientX(e.clientX)
          if (start !== null) setDragPct(start)
          const onMove = (ev: MouseEvent): void => {
            const p = pctFromClientX(ev.clientX)
            if (p !== null) setDragPct(p)
          }
          const onUp = (ev: MouseEvent): void => {
            const p = pctFromClientX(ev.clientX)
            const dur = getAudioDuration()
            if (p !== null && dur > 0) seekAudio(p * dur)
            setDragPct(null)
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
          }
          document.addEventListener('mousemove', onMove)
          document.addEventListener('mouseup', onUp)
        }}
        onTouchStart={(e) => {
          const start = pctFromClientX(e.touches[0].clientX)
          if (start !== null) setDragPct(start)
          const onMove = (ev: TouchEvent): void => {
            const p = pctFromClientX(ev.touches[0].clientX)
            if (p !== null) setDragPct(p)
          }
          const onEnd = (ev: TouchEvent): void => {
            const p = pctFromClientX(ev.changedTouches[0]?.clientX ?? 0)
            const dur = getAudioDuration()
            if (p !== null && dur > 0) seekAudio(p * dur)
            setDragPct(null)
            document.removeEventListener('touchmove', onMove)
            document.removeEventListener('touchend', onEnd)
          }
          document.addEventListener('touchmove', onMove, { passive: true })
          document.addEventListener('touchend', onEnd)
        }}
      >
        <div className="h-[3px] rounded-full bg-accent" style={{ width: `${pct}%` }} />
        <div
          className="absolute top-1/2 w-3.5 h-3.5 rounded-full bg-accent shadow pointer-events-none"
          style={{ left: `${pct}%`, transform: 'translate(-50%, -50%)' }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-text-muted tabular-nums -mt-1 mb-1">
        <span>{formatDuration(displayTime)}</span>
        <span>{duration > 0 ? formatDuration(duration) : '--:--'}</span>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={toggleShuffle}
          disabled={radioFmActive}
          aria-label={shuffle ? 'Shuffle on' : 'Shuffle off'}
          className={`${iconBtn} ${shuffle ? 'text-accent' : 'text-text-muted'}`}
        >
          <Shuffle size={18} />
        </button>
        <button
          onClick={() => prevTrack()}
          disabled={radioFmActive}
          aria-label="Previous track"
          className={`${iconBtn} text-text-primary active:opacity-60`}
        >
          <SkipBack size={26} fill="currentColor" />
        </button>
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          disabled={radioFmActive}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="w-14 h-14 rounded-full bg-accent text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform disabled:opacity-30"
        >
          {isPlaying
            ? <Pause size={24} fill="currentColor" />
            : <Play size={24} fill="currentColor" className="ml-0.5" />}
        </button>
        <button
          onClick={() => nextTrack()}
          disabled={radioFmActive}
          aria-label="Next track"
          className={`${iconBtn} text-text-primary active:opacity-60`}
        >
          <SkipForward size={26} fill="currentColor" />
        </button>
        <button
          onClick={toggleRepeat}
          disabled={radioFmActive}
          aria-label={repeat === 'one' ? 'Repeat one' : repeat === 'all' ? 'Repeat all' : 'Repeat off'}
          className={`${iconBtn} ${repeat !== 'none' ? 'text-accent' : 'text-text-muted'}`}
        >
          {repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
        </button>
      </div>
    </div>
  )
}

export default function NowPlaying(): JSX.Element {
  const {
    currentTrack,
    currentTrackFull,
    setShowNowPlaying,
    account,
    setPendingEditorSongId,
    setActiveView,
    showQueue,
  } = useStorePick('currentTrack', 'currentTrackFull', 'setShowNowPlaying', 'account', 'setPendingEditorSongId', 'setActiveView', 'showQueue')

  const [artCollapsed, setArtCollapsed] = useState(false)
  const [panelWidth, dragHandle] = useResizablePanel(360, 280, 520)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const isElectron = navigator.userAgent.includes('Electron')
  // When the Queue panel is also open it sits to the right of this one and
  // is the one that needs to clear the custom window controls (see its own
  // header) — this panel only needs the clearance when it's the rightmost.
  const needsWindowControlClearance = isElectron && !isMobile && !showQueue
  const [infoSong, setInfoSong] = useState<JWApiSong | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(false)

  useEffect(() => {
    const check = (): void => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => { setInfoSong(null) }, [currentTrack?.id])

  const handleInfo = async (): Promise<void> => {
    const jwMatch = currentTrack?.id.match(/^jw-(\d+)$/)
    if (!jwMatch) return
    setLoadingInfo(true)
    try {
      const song = await apiFetch<JWApiSong>(`/songs/${jwMatch[1]}/`)
      setInfoSong(song)
    } catch { /* silently fail */ }
    finally { setLoadingInfo(false) }
  }

  const jwMatch = currentTrack?.id.match(/^jw-(\d+)$/)
  const canEdit = !!account?.is_editor

  return (
    <div
      className="bg-surface-raised flex shrink-0 overflow-hidden animate-slide-in-right"
      style={isMobile
        // Full-screen on a phone, so it owns the gesture-bar inset itself.
        ? { position: 'fixed', inset: 0, zIndex: 50, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }
        : { width: panelWidth, borderLeft: '1px solid var(--border)' }
      }
    >
      {!isMobile && (
        <div className="w-1 shrink-0 relative group/handle" {...dragHandle}>
          <div className="absolute inset-y-0 -left-1 -right-1 group-hover/handle:bg-accent/30 transition-colors rounded-full" />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <div
          className="flex items-center justify-between px-5 pb-3 shrink-0"
          style={{
            // Clears the status bar when running edge-to-edge on Android.
            paddingTop: isMobile ? 'max(20px, env(safe-area-inset-top, 0px))' : (needsWindowControlClearance ? 36 : 20),
            paddingRight: needsWindowControlClearance ? 148 : undefined,
          }}
        >
          <h2 className="text-text-primary font-semibold text-sm uppercase tracking-widest truncate min-w-0">Now Playing</h2>
          <div className="flex items-center gap-2 shrink-0">
            {currentTrack && (
              <button
                onClick={() => setArtCollapsed(!artCollapsed)}
                className="text-text-muted hover:text-text-primary transition-colors"
                title={artCollapsed ? 'Show artwork' : 'Hide artwork'}
              >
                {artCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </button>
            )}
            {jwMatch && (
              <button
                onClick={handleInfo}
                disabled={loadingInfo}
                className="text-text-muted hover:text-text-primary transition-colors disabled:opacity-40"
                title="Song info"
              >
                <Info size={16} />
              </button>
            )}
            {jwMatch && canEdit && (
              <button
                onClick={() => useStore.getState().openSongEditor(parseInt(jwMatch[1]))}
                className="text-text-muted hover:text-text-primary transition-colors"
                title="Edit this song"
              >
                <Pencil size={15} />
              </button>
            )}
            <button
              onClick={() => setShowNowPlaying(false)}
              className="text-text-muted hover:text-text-primary transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {!currentTrack ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8">
            <div className="w-24 h-24 rounded-full bg-surface-overlay flex items-center justify-center">
              <Music className="text-text-muted w-10 h-10" />
            </div>
            <p className="text-text-muted text-sm text-center">Play a track to see it here</p>
          </div>
        ) : (
          <>
            {(() => {
              const artSrc = currentTrackFull?.albumArt ?? currentTrack.imageUrl
              return !artCollapsed && (
                <div className="px-6 shrink-0">
                  <div className={`${isMobile ? 'h-48' : 'aspect-square'} w-full rounded-xl overflow-hidden bg-surface-overlay shadow-2xl`}>
                    {artSrc ? (
                      <ProgressiveCover src={artSrc} alt="Album Art" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music className="text-text-muted w-16 h-16" />
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
            {(() => {
              const artSrc = currentTrackFull?.albumArt ?? currentTrack.imageUrl
              return (
                <div className={`px-6 shrink-0 ${artCollapsed ? 'pt-2 pb-3' : 'py-3'}`}>
                  {artCollapsed && (
                    <div className="flex gap-3 items-center mb-3">
                      {artSrc && <img src={smallCoverUrl(artSrc)} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-text-primary font-bold text-base truncate" title={currentTrack.title}>{currentTrack.title}</p>
                        <p className="text-text-muted text-xs truncate">{currentTrack.artist}</p>
                      </div>
                    </div>
                  )}
                  {!artCollapsed && (
                    <>
                      <p className="text-text-primary font-bold text-lg truncate" title={currentTrack.title}>{currentTrack.title}</p>
                      <p className="text-text-muted text-sm truncate mt-0.5">{currentTrack.artist}</p>
                      <p className="text-text-muted text-xs truncate mt-0.5">{currentTrack.album}</p>
                    </>
                  )}
                </div>
              )
            })()}
            {isMobile && <TransportControls />}
            <div className="flex-1 min-h-0 overflow-hidden">
              <LyricsDisplay />
            </div>
          </>
        )}
      </div>

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
    </div>
  )
}
