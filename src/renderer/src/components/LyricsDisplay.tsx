import React, { useEffect, useRef, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { parseLrc, getCurrentLineIndex, isLrcFormat } from '../lib/lyrics'
import { useStore } from '../store/useStore'
import { seekAudio, getAudioCurrentTime } from './Player'

export default function LyricsDisplay(): JSX.Element {
  const { currentTrackFull, account, lyricsOffset } = useStore(useShallow(s => ({
    currentTrackFull: s.currentTrackFull,
    account: s.account,
    lyricsOffset: s.lyricsOffset,
  })))

  const containerRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLDivElement>(null)

  const lyrics = currentTrackFull?.lyrics
  const syncedLyrics = currentTrackFull?.syncedLyrics

  const rawLyrics = syncedLyrics || lyrics
  const isSynced = rawLyrics ? isLrcFormat(rawLyrics) : false

  const syncedLines = useMemo(() => {
    if (rawLyrics && isSynced) return parseLrc(rawLyrics)
    return []
  }, [rawLyrics, isSynced])

  // Driven by requestAnimationFrame against the LIVE audio.currentTime rather
  // than the Zustand-stored value (which only updates on the native
  // 'timeupdate' event, ~4x/sec) — that throttling is what made the active
  // line snap every ~250ms instead of transitioning smoothly.
  const [currentLineIdx, setCurrentLineIdx] = useState(-1)
  const lineIdxRef = useRef(-1)

  useEffect(() => {
    if (!isSynced || syncedLines.length === 0) {
      setCurrentLineIdx(-1)
      lineIdxRef.current = -1
      return
    }
    let raf = 0
    const tick = (): void => {
      const idx = getCurrentLineIndex(syncedLines, getAudioCurrentTime() - lyricsOffset)
      if (idx !== lineIdxRef.current) {
        lineIdxRef.current = idx
        setCurrentLineIdx(idx)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isSynced, syncedLines, lyricsOffset])

  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [currentLineIdx])

  const isEditor = account?.is_editor || account?.is_administrator

  if (!rawLyrics) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
        <div className="text-5xl opacity-20">♪</div>
        <p className="text-text-muted text-sm">No lyrics available</p>
        {isEditor && (
          <p className="text-text-muted text-xs">
            Right-click a track → "Edit info & lyrics" to add lyrics
          </p>
        )}
      </div>
    )
  }

  if (isSynced && syncedLines.length > 0) {
    return (
      <div
        ref={containerRef}
        className="h-full overflow-y-auto py-16 px-8 space-y-4"
        style={{ scrollbarWidth: 'none' } as React.CSSProperties}
      >
        <style>{`::-webkit-scrollbar { display: none; }`}</style>
        {syncedLines.map((line, i) => {
          const isActive = i === currentLineIdx
          const isPast = i < currentLineIdx

          if (!line.text) {
            return <div key={i} className="h-4" />
          }

          const lineStyle: React.CSSProperties = {
            opacity: isActive ? 1 : isPast ? 0.35 : 0.2,
            color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
            filter: (!isActive && !isPast) ? 'blur(1px)' : 'blur(0px)',
            transition: 'opacity 0.35s ease, color 0.35s ease, filter 0.35s ease',
          }

          return (
            <div
              key={i}
              ref={isActive ? activeRef : undefined}
              onClick={() => seekAudio(line.time)}
              className="lyric-line text-left leading-snug cursor-pointer font-bold text-2xl"
              style={lineStyle}
            >
              {line.text}
            </div>
          )
        })}
        <div className="h-32" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto py-8 px-8">
      <pre className="text-text-secondary text-sm leading-8 whitespace-pre-wrap font-sans">
        {rawLyrics}
      </pre>
    </div>
  )
}
