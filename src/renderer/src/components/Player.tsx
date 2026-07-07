import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Maximize2,
  ListOrdered,
  Heart,
  ChevronUp,
  Check,
  MoreHorizontal,
  Radio,
  Info,
  Loader2,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { formatDuration } from '../lib/lyrics'
import { apiFetch, JWApiSong } from '../lib/juicewrldApi'
import { trackIdToSongId } from '../lib/userApi'
import { toFileUrl } from '../lib/fileTypes'
import { FullTrack } from '../types'
import SongInfoModal from './SongInfoModal'
import SongContextMenu from './SongContextMenu'
import { LibraryTrack } from '../types'

// Downloaded-for-offline audio always wins over streaming — same track id,
// just playing from local disk instead of the API.
function resolvePlaybackUrl(track: { id: string; streamUrl?: string; path: string }): string {
  const offline = useStore.getState().offlineTracks[track.id]
  if (offline) return toFileUrl(offline.localPath)
  return track.streamUrl ?? toFileUrl(track.path)
}

let _seek: ((t: number) => void) | null = null
let _getAudioDuration: (() => number) | null = null
let _getAudioCurrentTime: (() => number) | null = null
export function seekAudio(t: number): void { _seek?.(t) }
export function getAudioDuration(): number { return _getAudioDuration?.() ?? 0 }
// Live audio.currentTime, not the Zustand-stored value (which only updates on
// the native 'timeupdate' event, ~4x/sec) — used to drive smooth per-frame
// synced-lyrics highlighting instead of choppy ~250ms jumps.
export function getAudioCurrentTime(): number { return _getAudioCurrentTime?.() ?? 0 }

// Session cache of the API-derived lyrics for tracker songs, keyed by numeric
// song id. The metadata-load effect runs on every track change; without this,
// replaying or revisiting a song re-hits `/songs/{id}/` every single time.
// Cached per session — cleared on reload, which is fine since lyrics rarely
// change mid-session.
const lyricsCache = new Map<number, { lyrics: string | null; syncedLyrics: string | null }>()
export function invalidateLyricsCache(songId: number): void { lyricsCache.delete(songId) }

export default function Player(): JSX.Element {
  const {
    currentTrack,
    currentTrackFull,
    isPlaying,
    volume,
    progress,
    currentTime,
    shuffle,
    repeat,
    setIsPlaying,
    setVolume,
    setProgress,
    setCurrentTime,
    setCurrentTrackFull,
    toggleShuffle,
    toggleRepeat,
    nextTrack,
    prevTrack,
    setShowNowPlaying,
    showNowPlaying,
    showQueue,
    setShowQueue,
    queue,
    queueIndex,
    crossfadeEnabled,
    crossfadeDuration,
    sleepTimerEnd,
    setSleepTimer,
    audioOutput,
    setAudioOutput,
    playbackSpeed,
    setPlaybackSpeed,
    likedTrackIds,
    toggleLike,
    setActiveView,
    activeView,
    playNext, account, updateLibraryTrack, setPendingEditorSongId } = useStore()
  const canEditSong = !!(account?.is_editor || account?.is_administrator)

  const [showContextMenu, setShowContextMenu] = useState(false)
  const [showSongInfo, setShowSongInfo] = useState(false)
  const [songInfoData, setSongInfoData] = useState<JWApiSong | null>(null)
  const contextMenuBtnRef = useRef<HTMLButtonElement>(null)
  const currentSongId = currentTrack ? trackIdToSongId(currentTrack.id) : null
  const { radioMode, radioNext } = useStore()
  const { radioFmActive, radioFmNowPlaying, radioFmMatchedSong } = useStore()
  const { libraryTracks } = useStore()


  // FM elapsed time — ticks locally between WS updates
  const [fmElapsedMs, setFmElapsedMs] = useState(0)
  const fmBaseRef = useRef<{ elapsed: number; at: number }>({ elapsed: 0, at: 0 })
  useEffect(() => {
    if (!radioFmActive || !radioFmNowPlaying?.elapsed_ms) { setFmElapsedMs(0); return }
    fmBaseRef.current = { elapsed: radioFmNowPlaying.elapsed_ms, at: Date.now() }
    setFmElapsedMs(radioFmNowPlaying.elapsed_ms)
    const t = setInterval(() => {
      const { elapsed, at } = fmBaseRef.current
      setFmElapsedMs(elapsed + (Date.now() - at))
    }, 500)
    return () => clearInterval(t)
  }, [radioFmActive, radioFmNowPlaying])
  const fmDurationMs = radioFmNowPlaying?.duration_ms ?? 0
  const fmProgress = fmDurationMs > 0 ? Math.min(fmElapsedMs / fmDurationMs, 1) : 0
  const openSongInfo = (): void => {
    setShowContextMenu(false)
    if (!currentTrack) return
    const match = currentTrack.id.match(/^jw-(\d+)$/)
    if (!match) return
    setSongInfoData(null)
    setShowSongInfo(true)
    apiFetch<JWApiSong>(`/songs/${match[1]}/`)
      .then((song) => setSongInfoData(song))
      .catch(() => setShowSongInfo(false))
  }

  // Two audio slots — ping-pong between them for crossfade
  const slotA = useRef<HTMLAudioElement>(null)
  const slotB = useRef<HTMLAudioElement>(null)
  const activeSlot = useRef<'A' | 'B'>('A')

  const [prevMute, setPrevMute] = useState(0.8)

  // Seek drag buffering — only commit audio.currentTime on mouse release
  const [seekDrag, setSeekDrag] = useState<number | null>(null)

  // Crossfade state (all refs — no re-renders needed)
  const cfActive     = useRef(false)
  const cfTargetIdx  = useRef(-1)
  const cfIsRadio    = useRef(false)
  const cfOutRaf     = useRef<number | null>(null)
  const cfInRaf      = useRef<number | null>(null)
  const skipNextLoad = useRef(false)

  // Keep a ref of volume so RAF callbacks (created once) always see the latest value
  const volumeRef = useRef(volume)
  useEffect(() => { volumeRef.current = volume }, [volume])

  const getActive = (): HTMLAudioElement | null =>
    activeSlot.current === 'A' ? slotA.current : slotB.current
  const getNext = (): HTMLAudioElement | null =>
    activeSlot.current === 'A' ? slotB.current : slotA.current

  const cancelCF = (): void => {
    if (cfOutRaf.current != null) { cancelAnimationFrame(cfOutRaf.current); cfOutRaf.current = null }
    if (cfInRaf.current  != null) { cancelAnimationFrame(cfInRaf.current);  cfInRaf.current  = null }
    if (cfActive.current) {
      const na = getNext()
      if (na) { na.pause(); na.src = ''; na.volume = 0 }
      cfActive.current = false
      cfTargetIdx.current = -1
      cfIsRadio.current = false
    }
    // Restore current audio to proper volume
    const a = getActive()
    if (a) a.volume = volumeRef.current
  }

  // Compute what the next queue index would be (mirrors store's nextTrack logic, without advancing)
  const computeNextIdx = (): number => {
    if (queue.length === 0) return -1
    if (repeat === 'one') return queueIndex
    if (shuffle && queue.length > 1) {
      let r: number
      do { r = Math.floor(Math.random() * queue.length) } while (r === queueIndex)
      return r
    }
    const next = queueIndex + 1
    if (next >= queue.length) return repeat === 'all' ? 0 : -1
    return next
  }

  // Preload next track into inactive slot (skip shuffle mode — can't predict next)
  useEffect(() => {
    if (!isPlaying || queue.length === 0 || cfActive.current) return
    let nextIdx: number
    if (repeat === 'one') nextIdx = queueIndex
    else if (shuffle) return // random — can't preload
    else {
      nextIdx = queueIndex + 1
      if (nextIdx >= queue.length) {
        if (repeat === 'all') nextIdx = 0
        else return
      }
    }
    const nextTrackData = queue[nextIdx]
    if (!nextTrackData) return
    const url = resolvePlaybackUrl(nextTrackData)
    const na = getNext()
    if (!na || na.src === url) return
    na.src = url
    na.load()
  }, [queueIndex, queue.length, isPlaying, repeat, shuffle])

  // Expose seek and duration to other components
  useEffect(() => {
    _seek = (t) => {
      const audio = getActive()
      if (!audio) return
      cancelCF()
      audio.volume = volumeRef.current
      audio.currentTime = t
      setCurrentTime(t)
      if (audio.duration) setProgress(t / audio.duration)
    }
    _getAudioDuration = () => getActive()?.duration ?? 0
    _getAudioCurrentTime = () => getActive()?.currentTime ?? 0
    return () => { _seek = null; _getAudioDuration = null; _getAudioCurrentTime = null }
  }, []) // stable — only depends on refs

  // Load full metadata when track changes or currentTrackFull is cleared
  useEffect(() => {
    if (!currentTrack) return
    if (currentTrackFull) return  // already populated — skip
    // Guard against stale async responses: if the track changes again before
    // a fetch resolves, that response must not overwrite the new track's
    // metadata (this is what caused a finished song's metadata to bleed
    // into the next one).
    const trackId = currentTrack.id
    const isStale = (): boolean => useStore.getState().currentTrack?.id !== trackId
    // Build synthetic FullTrack immediately so cover art + artist show
    const synthetic: FullTrack = {
      ...currentTrack,
      albumArt: currentTrack.imageUrl ?? null,
      lyrics: null,
      syncedLyrics: null,
      producer: null,
      notes: null,
      ext: '',
    }
    setCurrentTrackFull(synthetic)
    // Fetch lyrics from API if this is a tracker song (id = "jw-{n}")
    const match = currentTrack.id.match(/^jw-(\d+)$/)
    if (match) {
      const songId = Number(match[1])
      // Serve from session cache to avoid re-hitting /songs/ when replaying
      // or revisiting a song.
      const cached = lyricsCache.get(songId)
      if (cached) {
        setCurrentTrackFull({ ...synthetic, lyrics: cached.lyrics, syncedLyrics: cached.syncedLyrics })
      } else {
        // Show the offline-downloaded snapshot immediately (if any) so a
        // synced/downloaded song doesn't sit blank waiting on the network —
        // the live fetch below overwrites it with fresh data when it succeeds.
        const offlineMeta = useStore.getState().offlineTracks[currentTrack.id]
        if (offlineMeta) {
          setCurrentTrackFull({ ...synthetic, albumArt: offlineMeta.imageUrl ?? synthetic.albumArt, lyrics: offlineMeta.lyrics, syncedLyrics: offlineMeta.syncedLyrics })
        }
        apiFetch<JWApiSong>(`/songs/${songId}/`)
          .then((song) => {
            const syncedLyrics = song.synced_lyrics || null
            const lyrics = song.lyrics || null
            lyricsCache.set(songId, { lyrics, syncedLyrics })
            if (isStale()) return
            setCurrentTrackFull({ ...synthetic, lyrics, syncedLyrics })
          })
          .catch(() => {/* no network — offline snapshot (if any) already applied above */})
      }
    } else {
      // Local track — load lyrics + cover art from IPC
      const el = (window as any).electron
      if (el && currentTrack.path) {
        el.readTrackMetadata(currentTrack.path).then((meta: Record<string, any> | null) => {
          if (isStale()) return
          if (meta && !meta.error) {
            setCurrentTrackFull(prev => prev ? { ...prev, lyrics: meta.lyrics || null, syncedLyrics: meta.syncedLyrics || null } : prev)
          }
        }).catch(() => {})
        if (!currentTrack.imageUrl) {
          el.readAlbumArt(currentTrack.path, 512).then((a: string | null) => {
            if (isStale()) return
            if (a) {
              updateLibraryTrack(currentTrack.id, { albumArt: a })
              setCurrentTrackFull(prev => prev ? { ...prev, albumArt: a } : prev)
            }
          }).catch(() => {})
        }
      }
    }
  }, [currentTrack?.id, currentTrackFull])

  // Load audio into active slot when track changes
  useEffect(() => {
    const audio = getActive()
    if (!audio || !currentTrack) return

    if (skipNextLoad.current) {
      // Crossfade just swapped — audio already playing on active slot
      skipNextLoad.current = false
      audio.volume = volumeRef.current
      return
    }

    cancelCF()
    const fileUrl = resolvePlaybackUrl(currentTrack)
    audio.src = fileUrl
    audio.volume = volumeRef.current
    audio.playbackRate = playbackSpeed
    if (isPlaying) audio.play().catch(console.error)
  }, [currentTrack?.id])

  // Play / pause
  useEffect(() => {
    const audio = getActive()
    if (!audio) return
    if (isPlaying) {
      audio.play().catch(console.error)
    } else {
      // Pause must stop BOTH slots. Mid-crossfade the incoming slot is also
      // playing, and a boundary race (the outgoing's `ended` firing around the
      // same tick) can clear cfActive before this effect runs — so relying on
      // cancelCF() alone to stop the incoming element isn't race-proof.
      // Pausing both elements unconditionally guarantees nothing keeps playing.
      if (cfActive.current) cancelCF()
      slotA.current?.pause()
      slotB.current?.pause()
    }
  }, [isPlaying])

  // Mobile background watchdog — browsers can silently pause an audio
  // element (or never finish a play() call) while the tab is hidden, with
  // no event firing to tell the app. Periodically nudge it back, and
  // recheck immediately when the tab regains focus.
  //
  // A locked screen can also suspend JS badly enough that the native
  // 'ended' event dispatch for a track that finished never actually reaches
  // our handler — audio.paused and audio.ended both end up true with
  // playback just stuck there forever ("next song doesn't play"). Calling
  // .play() on an already-ended element only replays it from 0, so that
  // case needs to go through the real advance-to-next-track logic instead.
  useEffect(() => {
    const check = (): void => {
      if (!isPlaying) return
      const audio = getActive()
      if (!audio) return
      if (audio.ended) { onAudioEnded(audio); return }
      if (audio.paused) audio.play().catch(() => {})
    }
    const id = setInterval(check, 8000)
    const onVisible = (): void => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [isPlaying])

  // Volume — only change if not mid-crossfade
  useEffect(() => {
    const audio = getActive()
    if (!audio) return
    if (!cfActive.current) audio.volume = volume
  }, [volume])

  // Playback speed — apply to both audio slots
  useEffect(() => {
    for (const ref of [slotA, slotB]) {
      if (ref.current) ref.current.playbackRate = playbackSpeed
    }
  }, [playbackSpeed])

  // Media Session API — lock screen / notification metadata
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const title  = radioFmActive ? (radioFmNowPlaying?.title  ?? '') : (currentTrack?.title  ?? '')
    const artist = radioFmActive ? (radioFmNowPlaying?.artist ?? '') : (currentTrack?.artist ?? '')
    const rawArt = radioFmActive
      ? radioFmMatchedSong?.imageUrl
      : (currentTrackFull?.albumArt ?? currentTrack?.imageUrl)
    // Only pass HTTP URLs to MediaMetadata — data URIs crash Windows media transport
    const artSrc = rawArt?.startsWith('http') ? rawArt : undefined
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: '',
      artwork: artSrc ? [{ src: artSrc }] : [],
    })
  }, [
    currentTrack?.id,
    currentTrack?.title,
    currentTrack?.artist,
    currentTrack?.imageUrl,
    currentTrackFull?.albumArt,
    radioFmActive,
    radioFmNowPlaying?.title,
    radioFmNowPlaying?.artist,
    radioFmMatchedSong?.imageUrl,
  ])

  // Media Session playback state — mobile browsers (Android Chrome in
  // particular) use this to decide whether the background media session is
  // still "active" and worth keeping alive. Never setting it meant the OS
  // could treat a locked-screen session as stale and tear it down mid-track,
  // which silently stopped playback with no 'ended' event ever firing — so
  // the queue never advanced to the next song.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
  }, [isPlaying])

  // Media Session action handlers — play/pause/skip
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.setActionHandler('play',  () => setIsPlaying(true))
    navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false))
    navigator.mediaSession.setActionHandler('nexttrack',     () => nextTrack())
    navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack())
    return () => {
      navigator.mediaSession.setActionHandler('play',          null)
      navigator.mediaSession.setActionHandler('pause',         null)
      navigator.mediaSession.setActionHandler('nexttrack',     null)
      navigator.mediaSession.setActionHandler('previoustrack', null)
    }
  }, [setIsPlaying, nextTrack, prevTrack])

  // Media Session position state — for lock screen seek bar
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const audio = getActive()
    if (!audio || !audio.duration || isNaN(audio.duration)) return
    try {
      navigator.mediaSession.setPositionState({
        duration:     audio.duration,
        playbackRate: playbackSpeed,
        position:     Math.min(currentTime, audio.duration),
      })
    } catch {/* ignore */}
  }, [currentTime, playbackSpeed])

  // Audio output device
  useEffect(() => {
    const apply = async (): Promise<void> => {
      for (const audio of [slotA.current, slotB.current]) {
        if (!audio) continue
        try {
          // setSinkId is a Web Audio API — available in Electron's Chromium
          await (audio as HTMLAudioElement & { setSinkId(id: string): Promise<void> }).setSinkId(audioOutput || '')
        } catch (e) {
          console.warn('setSinkId failed:', e)
        }
      }
    }
    apply()
  }, [audioOutput])

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLAudioElement>): void => {
    const audio = e.currentTarget
    if (audio !== getActive()) return  // ignore pre-loading slot's events

    if (!audio.duration) return
    setCurrentTime(audio.currentTime)
    setProgress(audio.currentTime / audio.duration)

    // Sleep timer
    if (sleepTimerEnd && Date.now() >= sleepTimerEnd) {
      audio.pause()
      setIsPlaying(false)
      setSleepTimer(null)
      return
    }

    // Start crossfade when approaching end. A queued timeupdate event can
    // still fire right after the user pauses (it was already in flight),
    // so without this guard a crossfade — and the next song's playback —
    // could kick off even though playback was just paused.
    if (crossfadeEnabled && crossfadeDuration > 0 && !cfActive.current && useStore.getState().isPlaying) {
      const remaining = audio.duration - audio.currentTime

      if (remaining > 0 && remaining <= crossfadeDuration) {
        // In radio mode use radioNext; otherwise compute from queue. Compute
        // the index ONCE and reuse it for both the track data (what actually
        // gets loaded into the next audio slot) and nextIdx (what queueIndex
        // becomes once the crossfade completes). With shuffle on, calling
        // computeNextIdx() twice re-rolls a new random pick each time, so the
        // audio that plays and the metadata/queue position that gets set
        // could end up referring to two different tracks.
        const isRadio = useStore.getState().radioMode
        const nextIdx = isRadio ? -1 : computeNextIdx()
        const nextTrackData = isRadio
          ? useStore.getState().radioNext
          : (nextIdx >= 0 && nextIdx < queue.length) ? queue[nextIdx] : null
        const na = getNext()

        if (na && nextTrackData) {
          cfActive.current = true
          cfIsRadio.current = isRadio
          cfTargetIdx.current = nextIdx

          const url = resolvePlaybackUrl(nextTrackData)
          // Only reassign src if not already preloaded
          if (na.src !== url) na.src = url
          na.volume = 0
          na.play().catch(console.error)

          // Fade OUT active audio
          const startVol  = audio.volume
          const startTime = performance.now()
          const fadeDur   = remaining * 1000

          const tickOut = (): void => {
            const a = getActive()
            if (!a) return
            const t = Math.min((performance.now() - startTime) / fadeDur, 1)
            a.volume = startVol * (1 - t)
            if (t < 1) cfOutRaf.current = requestAnimationFrame(tickOut)
            else { a.volume = 0; cfOutRaf.current = null }
          }
          cfOutRaf.current = requestAnimationFrame(tickOut)

          // Fade IN next audio
          const targetVol = volumeRef.current
          const tickIn = (): void => {
            const n = getNext()
            if (!n) return
            const t = Math.min((performance.now() - startTime) / fadeDur, 1)
            n.volume = targetVol * t
            if (t < 1) cfInRaf.current = requestAnimationFrame(tickIn)
            else { n.volume = targetVol; cfInRaf.current = null }
          }
          cfInRaf.current = requestAnimationFrame(tickIn)
        }
      }
    }
  }

  const handleEnded = (e: React.SyntheticEvent<HTMLAudioElement>): void => onAudioEnded(e.currentTarget)

  // Split out from the React event handler so the background watchdog below
  // can invoke the exact same advance-to-next-track logic directly on the
  // audio element, for when the real 'ended' event never reaches JS at all.
  const onAudioEnded = (audio: HTMLAudioElement): void => {
    if (audio !== getActive()) {
      // Pre-loading slot ended (very short next track, or error)
      if (cfActive.current) cancelCF()
      return
    }

    if (cfActive.current) {
      // Crossfade complete — next audio is already playing at full volume
      if (cfOutRaf.current != null) { cancelAnimationFrame(cfOutRaf.current); cfOutRaf.current = null }
      if (cfInRaf.current  != null) { cancelAnimationFrame(cfInRaf.current);  cfInRaf.current  = null }
      cfActive.current = false

      const targetIdx = cfTargetIdx.current
      const wasRadio  = cfIsRadio.current
      cfTargetIdx.current = -1
      cfIsRadio.current   = false

      // Ensure incoming track is at full volume
      const na = getNext()
      if (na) na.volume = volumeRef.current

      // Swap which slot is "active"
      activeSlot.current = activeSlot.current === 'A' ? 'B' : 'A'

      // Tell the load useEffect to skip (audio already playing)
      skipNextLoad.current = true

      // Preserve a pause that raced in right at the crossfade boundary —
      // don't let the queue-advance forcibly resume playback. Since the
      // active slot just swapped, the [isPlaying] effect won't re-fire if
      // the value doesn't change (false -> false), so pause explicitly here.
      const wasPlaying = useStore.getState().isPlaying
      if (!wasPlaying) na?.pause()

      if (wasRadio) {
        // Radio: delegate to nextTrack() which handles queue history + prefetch
        nextTrack()
        if (!wasPlaying) useStore.setState({ isPlaying: false })
      } else if (targetIdx >= 0 && targetIdx < queue.length) {
        // Normal queue: advance store to the crossfaded-into track
        const track = queue[targetIdx]
        const isSameTrack = targetIdx === queueIndex
        useStore.setState({
          queueIndex: targetIdx,
          currentTrack: track,
          currentTrackFull: isSameTrack ? useStore.getState().currentTrackFull : null,
          isPlaying: wasPlaying,
        })
      }
      return
    }

    // Normal (no crossfade) track end.
    // Guard against a paused crossfade boundary race: if the user pauses mid-
    // crossfade, the [isPlaying] effect runs cancelCF() which clears cfActive
    // BEFORE the outgoing element's already-queued `ended` event is handled.
    // That `ended` then lands here instead of the crossfade branch above — and
    // a paused player must never auto-advance into playback.
    if (!useStore.getState().isPlaying) return

    if (repeat === 'one') {
      const a = getActive()
      if (a) { a.currentTime = 0; a.volume = volumeRef.current; a.play().catch(console.error) }
      return
    }
    const prevId = currentTrack?.id
    const next = nextTrack()
    if (!next) {
      setIsPlaying(false)
      return
    }
    if (next.id === prevId) {
      // Same track (single song in queue with repeat-all, or only one option)
      const a = getActive()
      if (a) { a.currentTime = 0; a.volume = volumeRef.current; a.play().catch(console.error) }
    }
  }

  const handlePrev = (): void => {
    const audio = getActive()
    // In radio mode the user can't go back — always restart current song
    if (radioMode) {
      cancelCF()
      if (audio) { audio.currentTime = 0; audio.volume = volumeRef.current }
      setCurrentTime(0)
      setProgress(0)
      return
    }
    if (audio && audio.currentTime > 3) {
      cancelCF()
      audio.currentTime = 0
      audio.volume = volumeRef.current
      setCurrentTime(0)
      setProgress(0)
      return
    }
    cancelCF()
    prevTrack()
  }

  const handleNext = (): void => {
    cancelCF()
    // When on repeat-one, skip = restart the same song
    if (repeat === 'one') {
      const audio = getActive()
      if (audio) {
        audio.currentTime = 0
        audio.volume = volumeRef.current
        if (isPlaying) audio.play().catch(console.error)
      }
      setCurrentTime(0)
      setProgress(0)
      return
    }
    nextTrack()
  }

  // Seek: buffer visually while dragging, only commit on mouse release
  const handleSeekMouseDown = (): void => {
    setSeekDrag(progress)
  }

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const val = parseFloat(e.target.value)
    setSeekDrag(val)
    // Update display time without touching audio
    const audio = getActive()
    if (audio?.duration) setCurrentTime(val * audio.duration)
  }

  const handleSeekCommit = (e: React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>): void => {
    if (seekDrag === null) return
    const audio = getActive()
    if (audio?.duration) {
      cancelCF()
      const time = seekDrag * audio.duration
      audio.currentTime = time
      audio.volume = volumeRef.current
      audio.playbackRate = playbackSpeed
      setCurrentTime(time)
      setProgress(seekDrag)
    }
    setSeekDrag(null)
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const val = parseFloat(e.target.value)
    setVolume(val)
    if (val > 0) setPrevMute(val)
  }

  const toggleMute = (): void => {
    if (isMuted) setVolume(prevMute || 0.8)
    else { setPrevMute(volume); setVolume(0) }
  }

  const isMuted = volume === 0
  const activeDuration = getActive()?.duration
  const duration = (activeDuration && isFinite(activeDuration) ? activeDuration : 0) || currentTrack?.duration || 0

  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]
  const cycleSpeed = (): void => {
    const idx = SPEEDS.indexOf(playbackSpeed)
    setPlaybackSpeed(SPEEDS[(idx + 1) % SPEEDS.length])
  }
  const speedLabel = playbackSpeed === 1 ? '1x' : `${playbackSpeed}x`


  // Spacebar pause/play shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.code !== 'Space' && e.key !== ' ') return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return
      if (!currentTrack || radioFmActive) return
      e.preventDefault()
      setIsPlaying(!isPlaying)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [currentTrack, isPlaying, setIsPlaying, radioFmActive])

  // Cover art error state — reset when track changes
  const [coverArtError, setCoverArtError] = useState(false)
  useEffect(() => { setCoverArtError(false) }, [currentTrack?.id])

  // Output device picker
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([])
  const [showOutputPicker, setShowOutputPicker] = useState(false)
  const outputBtnRef = useRef<HTMLButtonElement>(null)
  const [pickerPos, setPickerPos] = useState({ bottom: 0, right: 0 })

  useEffect(() => {
    const enumerate = async (): Promise<void> => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        setOutputDevices(devices.filter((d) => d.kind === 'audiooutput'))
      } catch { /* ignore */ }
    }
    enumerate()
    navigator.mediaDevices.addEventListener('devicechange', enumerate)
    return () => navigator.mediaDevices.removeEventListener('devicechange', enumerate)
  }, [isPlaying])

  const openOutputPicker = (): void => {
    if (!outputBtnRef.current) return
    const r = outputBtnRef.current.getBoundingClientRect()
    setPickerPos({ bottom: window.innerHeight - r.top + 8, right: window.innerWidth - r.right })
    setShowOutputPicker((v) => !v)
  }

  return (
    <>
      <audio
        ref={slotA}
        preload="none"
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={(e) => console.error('Audio error (slotA):', e)}
      />
      <audio
        ref={slotB}
        preload="none"
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={(e) => console.error('Audio error (slotB):', e)}
      />

      {/* Bottom bar hidden on the WRLD page — it has its own full playback controls.
          Audio elements above stay mounted regardless so playback is unaffected. */}
      {activeView !== 'wrld' && (
      <>
      {/* ── Mobile player ── */}
      <div className="md:hidden bg-surface border-t border-[var(--border)] shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} onContextMenu={(e) => { e.preventDefault(); if (currentTrack) setShowContextMenu(v => !v) }}>
        {/* Thin progress bar */}
        {radioFmActive ? (
          <div className="h-[2px] bg-red-900/40 relative">
            <div className="h-full bg-red-400 absolute left-0 top-0 transition-none" style={{ width: `${fmProgress * 100}%` }} />
          </div>
        ) : (
        <div className="h-[2px] bg-surface-overlay relative">
          <div
            className="h-full bg-accent absolute left-0 top-0 transition-none"
            style={{ width: `${(seekDrag !== null ? seekDrag : progress) * 100}%` }}
          />
        </div>
        )}
        {/* Track row */}
        <div className="flex items-center px-3 py-2 gap-3 h-14">
          <button
            className="w-10 h-10 rounded bg-surface-overlay shrink-0 overflow-hidden"
            onClick={() => radioFmActive ? setActiveView('wrld') : setShowNowPlaying(!showNowPlaying)}
          >
            {radioFmActive ? (
              radioFmMatchedSong?.imageUrl
                ? <img src={radioFmMatchedSong.imageUrl} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full bg-gradient-to-br from-red-900/70 to-black flex items-center justify-center"><Radio size={16} className="text-red-400 opacity-80" /></div>
            ) : (!coverArtError && (currentTrackFull?.albumArt ?? currentTrack?.imageUrl)) ? (
              <img src={currentTrackFull?.albumArt ?? currentTrack?.imageUrl} alt="" className="w-full h-full object-cover" onError={() => setCoverArtError(true)} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-muted">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
              </div>
            )}
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">
              {radioFmActive && radioFmNowPlaying
                ? radioFmNowPlaying.title
                : (currentTrack?.title || 'Not playing')}
            </p>
            <p className="text-xs text-text-muted truncate">
              {radioFmActive && radioFmNowPlaying
                ? radioFmNowPlaying.artist
                : (currentTrack?.artist || '')}
            </p>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            {!radioFmActive && (
              <button onClick={toggleShuffle} className={`p-1.5 transition-colors ${shuffle ? 'text-accent' : 'text-text-secondary hover:text-text-primary'}`}>
                <Shuffle size={15} />
              </button>
            )}
            <button onClick={handlePrev} disabled={radioFmActive} className="p-2 text-text-secondary hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <SkipBack size={18} fill="currentColor" />
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              disabled={!currentTrack || radioFmActive}
              className="w-9 h-9 rounded-full bg-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform disabled:opacity-30"
            >
              {isPlaying
                ? <Pause size={16} fill="#000" className="text-black" />
                : <Play  size={16} fill="#000" className="text-black ml-0.5" />}
            </button>
            <button onClick={handleNext} disabled={radioFmActive} className="p-2 text-text-secondary hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <SkipForward size={18} fill="currentColor" />
            </button>
            {!radioFmActive && (
              <button onClick={toggleRepeat} className={`p-1.5 transition-colors ${repeat !== 'none' ? 'text-accent' : 'text-text-secondary hover:text-text-primary'}`}>
                {repeat === 'one' ? <Repeat1 size={15} /> : <Repeat size={15} />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Desktop player ── */}
      <div className="hidden md:flex h-[90px] bg-surface border-t border-[var(--border)] items-center px-4 gap-4 shrink-0" onContextMenu={(e) => { e.preventDefault(); if (currentTrack) setShowContextMenu(v => !v) }}>
        {/* Track info */}
        <div className="flex items-center gap-3 w-72 min-w-0 shrink-0">
          <button
            className="w-14 h-14 rounded-md bg-surface-overlay shrink-0 overflow-hidden hover:ring-2 ring-accent transition-all"
            onClick={() => radioFmActive ? setActiveView('wrld') : setShowNowPlaying(!showNowPlaying)}
            title={radioFmActive ? '999FM' : 'Now Playing'}
          >
            {radioFmActive ? (
              radioFmMatchedSong?.imageUrl
                ? <img src={radioFmMatchedSong.imageUrl} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full bg-gradient-to-br from-red-900/70 to-black flex items-center justify-center"><Radio size={22} className="text-red-400 opacity-80" /></div>
            ) : (!coverArtError && (currentTrackFull?.albumArt ?? currentTrack?.imageUrl)) ? (
              <img src={currentTrackFull?.albumArt ?? currentTrack?.imageUrl} alt="Album art" className="w-full h-full object-cover" onError={() => setCoverArtError(true)} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-muted">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
              </div>
            )}
          </button>

          <div className="min-w-0 flex-1">
            {/* Title + heart + 3-dot inline */}
            <div className="flex items-center gap-1 min-w-0">
              <p className="text-text-primary text-sm font-medium truncate min-w-0">
                {radioFmActive && radioFmNowPlaying
                  ? radioFmNowPlaying.title
                  : (currentTrack?.title || 'Not playing')}
              </p>
              <div className="flex items-center gap-0 shrink-0">
                {currentSongId != null && (
                  <button
                    className={`p-1 rounded transition-colors ${currentTrack && likedTrackIds.includes(currentTrack.id) ? 'text-accent' : 'text-text-muted hover:text-accent'}`}
                    onClick={() => currentTrack && toggleLike(currentTrack.id)}
                    title="Like"
                  >
                    <Heart size={13} fill={currentTrack && likedTrackIds.includes(currentTrack.id) ? 'currentColor' : 'none'} />
                  </button>
                )}

                <div className="relative">
                  <button
                    ref={contextMenuBtnRef}
                    className="p-1 rounded text-text-muted hover:text-text-primary transition-colors"
                    onClick={() => setShowContextMenu((v) => !v)}
                    title="More options"
                    disabled={!currentTrack && !radioFmActive}
                  >
                    <MoreHorizontal size={13} />
                  </button>

                  {showContextMenu && radioFmActive && radioFmNowPlaying && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowContextMenu(false)} />
                      <div className="absolute bottom-7 left-0 z-50 w-48 bg-surface border border-[var(--border)] rounded-xl shadow-2xl py-1 overflow-hidden">
                        <div className="px-3 py-2 border-b border-[var(--border)] mb-1">
                          <p className="text-text-primary text-xs font-semibold truncate">{radioFmNowPlaying.title}</p>
                          <p className="text-text-muted text-[10px] truncate">{radioFmNowPlaying.artist}</p>
                        </div>
                        {radioFmNowPlaying.song_id != null && (
                          <button
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors"
                            onClick={() => {
                              setShowContextMenu(false)
                              setSongInfoData(null)
                              setShowSongInfo(true)
                              apiFetch<JWApiSong>(`/songs/${radioFmNowPlaying.song_id}/`)
                                .then((song) => setSongInfoData(song))
                                .catch(() => setShowSongInfo(false))
                            }}
                          >
                            <Info size={14} /> Song info
                          </button>
                        )}
                      </div>
                    </>
                  )}

                  {showContextMenu && !radioFmActive && currentTrack && (
                    <SongContextMenu
                      state={{
                        track: currentTrack,
                        songId: currentSongId,
                        x: contextMenuBtnRef.current?.getBoundingClientRect().left ?? 0,
                        y: contextMenuBtnRef.current?.getBoundingClientRect().top ?? 0,
                      }}
                      onClose={() => setShowContextMenu(false)}
                      canEdit={canEditSong}
                      onInfo={openSongInfo}
                      onPlayNext={() => playNext(currentTrack)}
                      onEditLocalMetadata={currentSongId == null && currentTrack.id.startsWith('local-') ? () => {
                        const lt = libraryTracks.find(t => t.id === currentTrack.id)
                        if (lt) { useStore.getState().setPendingLocalEditTrack(lt); setActiveView('local-editor') }
                      } : undefined}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Artist + radio badge */}
            <div className="flex items-center gap-1.5">
              <p className="text-text-muted text-xs truncate">{radioFmActive && radioFmNowPlaying ? radioFmNowPlaying.artist : (currentTrack?.artist || '')}</p>
              {(radioMode || radioFmActive) && (
                <span className={`flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-widest shrink-0 ${radioFmActive ? 'text-red-400' : 'text-accent'}`}>
                  <Radio size={9} /> {radioFmActive ? '999 FM' : 'Random'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center: controls + progress */}
        <div className="flex-1 flex flex-col items-center gap-2">
          <div className="flex items-center gap-5">
            {!radioFmActive && <button onClick={toggleShuffle}
              className={`transition-colors ${shuffle ? 'text-accent' : 'text-text-secondary hover:text-text-primary'}`}>
              <Shuffle size={18} />
            </button>}

            <button onClick={handlePrev} disabled={radioFmActive} className="text-text-secondary hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <SkipBack size={20} fill="currentColor" />
            </button>

            <button
              onClick={() => setIsPlaying(!isPlaying)}
              disabled={!currentTrack || radioFmActive}
              className="w-9 h-9 rounded-full bg-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform disabled:opacity-30"
            >
              {isPlaying
                ? <Pause size={18} fill="#000" className="text-black" />
                : <Play  size={18} fill="#000" className="text-black ml-0.5" />}
            </button>

            <button onClick={handleNext} disabled={radioFmActive} className="text-text-secondary hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <SkipForward size={20} fill="currentColor" />
            </button>

            {!radioFmActive && <button onClick={toggleRepeat}
              className={`transition-colors ${repeat !== 'none' ? 'text-accent' : 'text-text-secondary hover:text-text-primary'}`}>
              {repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
            </button>}
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-2 w-full max-w-xl">
            <span className="text-text-muted text-xs w-10 text-right tabular-nums">
              {radioFmActive
                ? formatDuration(Math.floor(fmElapsedMs / 1000))
                : formatDuration(currentTime)}
            </span>
            <div className="flex-1 progress-track">
              <input
                type="range" min={0} max={1} step={0.001}
                value={radioFmActive ? fmProgress : (seekDrag !== null ? seekDrag : progress)}
                onMouseDown={radioFmActive ? undefined : handleSeekMouseDown}
                onChange={handleSeekChange}
                onMouseUp={radioFmActive ? undefined : handleSeekCommit}
                onTouchEnd={radioFmActive ? undefined : handleSeekCommit}
                disabled={!currentTrack} className="w-full"
                style={{ '--val': `${(radioFmActive ? fmProgress : (seekDrag !== null ? seekDrag : progress)) * 100}%`, ...(radioFmActive ? { pointerEvents: 'none' as const } : {}) } as React.CSSProperties}
              />
            </div>
            <span className="text-text-muted text-xs w-10 tabular-nums">
              {radioFmActive ? formatDuration(Math.floor(fmDurationMs / 1000)) : formatDuration(duration)}
            </span>
          </div>
        </div>

        {/* Right: speed + queue + NP + volume */}
        <div className="flex items-center gap-3 w-56 justify-end">
          {/* Playback speed */}
          {!radioFmActive && (
          <button
            onClick={cycleSpeed}
            title={`Playback speed: ${speedLabel}`}
            className={`text-xs font-semibold tabular-nums min-w-[26px] transition-colors ${
              playbackSpeed !== 1 ? 'text-accent' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {speedLabel}
          </button>
          )}

          {!radioFmActive && <button onClick={() => setShowQueue(!showQueue)}
            className={`relative transition-colors ${showQueue ? 'text-accent' : 'text-text-secondary hover:text-text-primary'}`}
            title="Queue">
            <ListOrdered size={16} />
            {queue.length > queueIndex + 1 && (
              <span className="absolute -top-1.5 -right-1.5 text-[9px] font-bold bg-accent text-black rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                {Math.min(queue.length - queueIndex - 1, 99)}
              </span>
            )}
          </button>}

          {!radioFmActive && <button onClick={() => setShowNowPlaying(!showNowPlaying)}
            className={`transition-colors ${showNowPlaying ? 'text-accent' : 'text-text-secondary hover:text-text-primary'}`}
            title="Now Playing">
            <Maximize2 size={16} />
          </button>}

          {/* Volume: mute + slider + output picker */}
          <div className="flex items-center gap-1.5">
            <button onClick={toggleMute} className="text-text-secondary hover:text-text-primary transition-colors" title="Mute">
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>

            <div className="relative w-20 progress-track flex items-center group/vol">
              <span
                className="absolute -top-8 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-surface-highest border border-[var(--border)] text-text-primary text-sm font-semibold tabular-nums opacity-0 group-hover/vol:opacity-100 transition-opacity pointer-events-none"
              >
                {Math.round(volume * 100)}%
              </span>
              <input type="range" min={0} max={1} step={0.01} value={volume}
                onChange={handleVolumeChange} className="w-full block"
                style={{ '--val': `${volume * 100}%` } as React.CSSProperties} />
            </div>

            {outputDevices.length > 1 && (
              <button
                ref={outputBtnRef}
                onClick={openOutputPicker}
                title="Audio output"
                className={`transition-colors ${audioOutput ? 'text-accent' : 'text-text-muted hover:text-text-primary'}`}
              >
                <Volume2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Song info modal */}
        {showSongInfo && (
          <SongInfoModal
            song={songInfoData}
            onClose={() => { setShowSongInfo(false); setSongInfoData(null) }}
            onEdit={canEditSong ? (songId) => {
              setShowSongInfo(false); setSongInfoData(null)
              setPendingEditorSongId(songId)
              setActiveView('editor')
            } : undefined}
          />
        )}

        {/* Output device popover */}
        {showOutputPicker && createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowOutputPicker(false)} />
            <div
              onMouseDown={(e) => e.stopPropagation()}
              className="fixed z-50 bg-surface-highest border border-[var(--border)] rounded-xl shadow-2xl py-1.5 min-w-[220px]"
              style={{ bottom: pickerPos.bottom, right: pickerPos.right }}
            >
              <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-muted">Audio Output</p>
              <button
                onClick={() => { setAudioOutput(''); setShowOutputPicker(false) }}
                className="flex items-center gap-3 w-full px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-overlay transition-colors"
              >
                <span className="w-4 h-4 flex items-center justify-center shrink-0">
                  {audioOutput === '' && <Check size={12} className="text-accent" />}
                </span>
                System default
              </button>
              {outputDevices.map((d) => (
                <button
                  key={d.deviceId}
                  onClick={() => { setAudioOutput(d.deviceId); setShowOutputPicker(false) }}
                  className="flex items-center gap-3 w-full px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-overlay transition-colors"
                >
                     <span className="w-4 h-4 flex items-center justify-center shrink-0">
                    {audioOutput === d.deviceId && <Check size={12} className="text-accent" />}
                  </span>
                  <span className="truncate">{d.label || `Output ${d.deviceId.slice(0, 8)}`}</span>
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
      </div>
      </>
      )}
    </>
  )
}
