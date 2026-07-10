import { useEffect, useLayoutEffect, useRef, useMemo, useState, memo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Music, Radio, Search, SkipForward, ThumbsUp, ThumbsDown, X, ChevronDown, ChevronLeft, Play, Pause, SkipBack, SkipForward as SkipFwd, Shuffle, Repeat, Repeat1, Volume2, VolumeX, MoreHorizontal, Info, Heart, Maximize2, Minimize2, ListMusic, GripVertical, Trash2, Check, Download } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { parseLrc, getCurrentLineIndex, isLrcFormat, formatDuration, downloadSyncedLyrics } from '../lib/lyrics'
import { seekAudio, getAudioDuration, getAudioCurrentTime } from './Player'
import { buildImageUrl, apiFetch, songToTrack, JWAPI_BASE, playlistCoverUrl } from '../lib/juicewrldApi'
import { getActiveRadioClient } from '../lib/radioSocketService'
import { getVersionGroup } from '../lib/versionsApi'
import type { JWApiSong } from '../lib/juicewrldApi'
import * as userApi from '../lib/userApi'
import SongInfoModal from './SongInfoModal'
import { AlbumArtThumbnail } from './AlbumArtThumbnail'
import SongContextMenu from './SongContextMenu'

// ── WrldData types ────────────────────────────────────────────────────────────

interface WrldSong { name: string; id: number }
interface WrldVersion { name: string; year: number; cover_url: string; songs: WrldSong[] }
interface WrldAlbum { id: number; name: string; versions: WrldVersion[] }

export default function WrldView(): JSX.Element {
  const {
    currentTrack, currentTrackFull, account, theme,
    radioFmActive, setRadioFmActive, radioFmIsLive, radioFmNowPlaying,
    radioFmVote, radioFmUpNext, radioFmQueuePreview,
    radioFmMatchedSong,
    playlists,
    playTrack,
    isPlaying, setIsPlaying, volume, setVolume,
    shuffle, repeat, toggleShuffle, toggleRepeat,
    nextTrack, prevTrack,
    showQueue, setShowQueue,
    audioOutput, setAudioOutput,
  } = useStore(useShallow(s => ({
    currentTrack: s.currentTrack,
    currentTrackFull: s.currentTrackFull,
    account: s.account,
    theme: s.theme,
    radioFmActive: s.radioFmActive,
    setRadioFmActive: s.setRadioFmActive,
    radioFmIsLive: s.radioFmIsLive,
    radioFmNowPlaying: s.radioFmNowPlaying,
    radioFmVote: s.radioFmVote,
    radioFmUpNext: s.radioFmUpNext,
    radioFmQueuePreview: s.radioFmQueuePreview,
    radioFmMatchedSong: s.radioFmMatchedSong,
    playlists: s.playlists,
    playTrack: s.playTrack,
    isPlaying: s.isPlaying,
    setIsPlaying: s.setIsPlaying,
    volume: s.volume,
    setVolume: s.setVolume,
    shuffle: s.shuffle,
    repeat: s.repeat,
    toggleShuffle: s.toggleShuffle,
    toggleRepeat: s.toggleRepeat,
    nextTrack: s.nextTrack,
    prevTrack: s.prevTrack,
    showQueue: s.showQueue,
    setShowQueue: s.setShowQueue,
    audioOutput: s.audioOutput,
    setAudioOutput: s.setAudioOutput,
  })))

  const containerRef = useRef<HTMLDivElement>(null)
  const activeRef    = useRef<HTMLDivElement>(null)
  const [artError, setArtError] = useState(false)

  // Remember the volume before muting so unmuting restores it, instead of
  // jumping to a hardcoded level (mirrors the Player bar's toggleMute).
  const prevVolumeRef = useRef(volume || 0.8)
  useEffect(() => { if (volume > 0) prevVolumeRef.current = volume }, [volume])
  const toggleMute = (): void => setVolume(volume === 0 ? (prevVolumeRef.current || 0.8) : 0)

  // Audio output device picker — mirrors the Player bar's (the bottom bar is
  // hidden on this page, so WRLD needs its own copy of this control instead
  // of inheriting it for free).
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
  }, [])

  const openOutputPicker = (): void => {
    if (!outputBtnRef.current) return
    const r = outputBtnRef.current.getBoundingClientRect()
    setPickerPos({ bottom: window.innerHeight - r.top + 8, right: window.innerWidth - r.right })
    setShowOutputPicker((v) => !v)
  }

  const [fmTab, setFmTab] = useState<'radio' | 'lyrics'>('radio')
  // Fullscreen renders the page through a portal (covers the sidebar/other
  // chrome) AND requests real OS/browser-level fullscreen — the portal alone
  // only fills the app window, not the actual screen.
  const [fullscreen, setFullscreen] = useState(false)
  const fullscreenRef = useRef(false)
  fullscreenRef.current = fullscreen
  const isElectronApp = navigator.userAgent.includes('Electron')
  const elFullscreen = (window as any).electron

  const enterFullscreen = (): void => {
    if (isElectronApp) elFullscreen?.setFullscreen?.(true)
    else document.documentElement.requestFullscreen?.().catch(() => {})
    setFullscreen(true)
  }
  const exitFullscreen = (): void => {
    if (isElectronApp) elFullscreen?.setFullscreen?.(false)
    else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    setFullscreen(false)
  }

  // Keep React state in sync when fullscreen is entered/exited by something
  // other than our own button — F11 (Electron, see main.js), OS window-manager
  // gestures, or the browser's native Escape-exits-fullscreen behavior (web).
  useEffect(() => {
    if (isElectronApp) {
      const off = elFullscreen?.onFullscreenChange?.((v: boolean) => setFullscreen(v))
      return off
    }
    const onChange = (): void => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [isElectronApp])

  // The web Fullscreen API exits on Escape by itself (caught by the listener
  // above). Electron's setFullScreen has no built-in Escape binding though,
  // so handle it ourselves there.
  useEffect(() => {
    if (!fullscreen || !isElectronApp) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') exitFullscreen() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen, isElectronApp])

  // If this page unmounts (navigating away) while still fullscreen, leave
  // real OS/browser fullscreen too — otherwise the window would be stuck
  // fullscreen with no obvious way back once the WRLD-specific toggle is gone.
  useEffect(() => () => {
    if (!fullscreenRef.current) return
    if (isElectronApp) elFullscreen?.setFullscreen?.(false)
    else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  }, [])

  // Mirror fullscreen into the global store so App.tsx can hide the
  // frameless-window title bar controls (minimize/maximize/close) — they'd
  // otherwise float over this immersive view regardless of how fullscreen
  // was entered/exited (button, F11, Escape, or unmount).
  const setWrldFullscreen = useStore(s => s.setWrldFullscreen)
  useEffect(() => {
    setWrldFullscreen(fullscreen)
    return () => setWrldFullscreen(false)
  }, [fullscreen, setWrldFullscreen])

  const [suggestQuery, setSuggestQuery]     = useState('')
  const [suggestResults, setSuggestResults] = useState<JWApiSong[]>([])
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [voteDismissed, setVoteDismissed]    = useState(false)
  const [myVote, setMyVote]                 = useState<'yes' | 'no' | null>(null)
  const [localSecondsLeft, setLocalSecondsLeft] = useState<number | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [proposed, setProposed]             = useState<string | null>(null)
  const [textIsDark, setTextIsDark]          = useState(false)
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const proposeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Albums state ─────────────────────────────────────────────────────────────
  const [wrldAlbums, setWrldAlbums] = useState<WrldAlbum[]>([])
  const [selectedAlbumId, setSelectedAlbumId] = useState<number | null>(null)
  const [selectedVersionIdx, setSelectedVersionIdx] = useState(0)
  const [playingAlbumSongId, setPlayingAlbumSongId] = useState<number | null>(null)

  useEffect(() => {
    fetch('/wrlddata.json')
      .then(r => r.json())
      .then(d => setWrldAlbums(d.albums ?? []))
      .catch(() => {})
  }, [])

  const handlePlayAlbumSong = async (songId: number) => {
    setPlayingAlbumSongId(songId)
    try {
      const res = await fetch(`${JWAPI_BASE}/songs/${songId}/`)
      if (res.ok) {
        const song: JWApiSong = await res.json()
        playTrack(songToTrack(song))
      }
    } catch {}
    setPlayingAlbumSongId(null)
  }

  // ─────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current)
    if (!suggestQuery.trim()) { setSuggestResults([]); setSuggestLoading(false); return }
    setSuggestLoading(true)
    suggestTimer.current = setTimeout(async () => {
      try {
        const data = await apiFetch<{ results: JWApiSong[] }>('/songs/', { search: suggestQuery, page_size: 5 })
        setSuggestResults(data.results ?? [])
      } catch { setSuggestResults([]) }
      setSuggestLoading(false)
    }, 400)
    return () => { if (suggestTimer.current) clearTimeout(suggestTimer.current) }
  }, [suggestQuery])

  const handlePropose = (song: JWApiSong) => {
    getActiveRadioClient()?.proposeQueue(String(song.id))
    const name = song.track_titles?.[0] || song.name
    setProposed(name)
    setSuggestQuery('')
    setSuggestResults([])
    if (proposeTimer.current) clearTimeout(proposeTimer.current)
    proposeTimer.current = setTimeout(() => setProposed(null), 4000)
  }

  const artSrc = radioFmActive
    ? (radioFmMatchedSong?.imageUrl ?? buildImageUrl(radioFmNowPlaying?.image_url) ?? null)
    : (buildImageUrl(currentTrackFull?.albumArt ?? currentTrack?.imageUrl ?? null) ?? null)

  useEffect(() => { setArtError(false) }, [artSrc])

  // Sibling versions of the currently playing song (v1/v2/TV Mix/etc, linked
  // via juicewrldapi's /versions/ table — see versionsApi.ts), shown as
  // small bookmark tabs peeking out of the cover art's right edge.
  const [songVersions, setSongVersions] = useState<{ songId: number; label: string | null }[]>([])
  // Collapsed, these merge into a single small notch — hovering anywhere on
  // it fans all of them out at once, rather than each tab reacting to its
  // own hover independently.
  const [bookmarksHovered, setBookmarksHovered] = useState(false)
  useEffect(() => {
    if (radioFmActive || !currentTrack?.id) { setSongVersions([]); return }
    const numericId = parseInt(currentTrack.id.replace('jw-', ''), 10)
    if (isNaN(numericId)) { setSongVersions([]); return }
    let cancelled = false
    getVersionGroup(numericId).then(async metas => {
      if (cancelled) return
      // A version linked in the /versions/ table isn't necessarily playable —
      // recording-session songs (and some unsurfaced ones) have no `path`,
      // same gate used for bulk queue/playlist adds elsewhere in the app.
      const withPaths = await Promise.all(metas.map(async m => {
        try {
          const song = await apiFetch<JWApiSong>(`/songs/${m.songId}/`)
          return song.path ? m : null
        } catch { return null }
      }))
      if (cancelled) return
      setSongVersions(
        withPaths
          .filter((m): m is NonNullable<typeof m> => !!m)
          .map(m => ({ songId: m.songId, label: m.version ?? m.versionTitle }))
      )
    })
    return () => { cancelled = true }
  }, [currentTrack?.id, radioFmActive])

  const handlePlayVersion = async (songId: number): Promise<void> => {
    try {
      const song = await apiFetch<JWApiSong>(`/songs/${songId}/`)
      playTrack(songToTrack(song))
    } catch {}
  }

  useEffect(() => {
    if (!artSrc || artError) {
      setTextIsDark(theme === 'light' && !radioFmActive)
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 50; canvas.height = 50
        const ctx = canvas.getContext('2d')
        if (!ctx) { setTextIsDark(false); return }
        ctx.drawImage(img, 0, 0, 50, 50)
        const data = ctx.getImageData(0, 0, 50, 50).data
        let sum = 0
        for (let i = 0; i < data.length; i += 4)
          sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        const avg = sum / (data.length / 4)
        const factor = theme === 'dark' ? 0.22 : 0.45
        setTextIsDark(avg * factor > 90)
      } catch { setTextIsDark(false) }
    }
    img.onerror = () => setTextIsDark(false)
    img.src = artSrc
  }, [artSrc, artError, theme, radioFmActive])

  const rawLyrics = radioFmActive
    ? (radioFmMatchedSong?.syncedLyrics || radioFmMatchedSong?.lyrics || null)
    : (currentTrackFull?.syncedLyrics || currentTrackFull?.lyrics || null)
  const isSynced  = rawLyrics ? isLrcFormat(rawLyrics) : false
  const isEditor  = account?.is_editor || account?.is_administrator

  const txtPri   = textIsDark ? 'rgba(0,0,0,0.85)'  : 'rgba(255,255,255,1)'
  const txtSec   = textIsDark ? 'rgba(0,0,0,0.5)'   : 'rgba(255,255,255,0.5)'
  const txtTer   = textIsDark ? 'rgba(0,0,0,0.35)'  : 'rgba(255,255,255,0.3)'
  const txtFaint = textIsDark ? 'rgba(0,0,0,0.22)'  : 'rgba(255,255,255,0.2)'

  const handleAddToPlaylist = async (playlistId: number) => {
    if (!currentTrack?.id) return
    const numericId = parseInt(currentTrack.id.replace('jw-', ''), 10)
    if (isNaN(numericId)) return
    try { await userApi.addToPlaylist(playlistId, numericId) } catch { /* silent */ }
  }

  const syncedLines = useMemo(() => {
    if (rawLyrics && isSynced) return parseLrc(rawLyrics)
    return []
  }, [rawLyrics, isSynced])

  type NotchCategory = 'albums' | 'mixtapes' | 'unreleased' | 'playlists'
  const [notchCategory, setNotchCategory] = useState<NotchCategory>('albums')
  const [notchDropdownOpen, setNotchDropdownOpen] = useState(false)
  const NOTCH_LABELS: Record<NotchCategory, string> = { albums: 'Released Albums', mixtapes: 'Mixtapes & Singles', unreleased: 'Unreleased', playlists: 'Playlists' }
  const NOTCH_OPTIONS: { value: NotchCategory; label: string }[] = [
    { value: 'albums', label: 'Released Albums' },
    { value: 'mixtapes', label: 'Mixtapes & Singles' },
    { value: 'unreleased', label: 'Unreleased' },
    { value: 'playlists', label: 'Playlists' },
  ]
  // A "new vote" is detected by active rising edge (false/absent -> true),
  // NOT by track/kind equality — those can stay identical across repeated
  // metadata broadcasts for the SAME ongoing vote, but using them as the
  // reset trigger also means a stale/unrelated broadcast can spuriously
  // reset your vote selection (un-highlighting Yes/No) and a brand new vote
  // on the same track right after the last one never reopens the dismissed
  // popup. Rising edge of `active` is the only reliable "vote just started" signal.
  const wasVoteActiveRef = useRef(false)
  useEffect(() => {
    const isActive = !!radioFmVote?.active
    if (isActive && !wasVoteActiveRef.current) {
      setVoteDismissed(false)
      setMyVote(null)
    }
    wasVoteActiveRef.current = isActive
  }, [radioFmVote?.active])

  // Locally tick the countdown once per second, independent of how often
  // server metadata broadcasts arrive. The interval is created once per vote
  // and only re-synced (not torn down/recreated) on each server update —
  // recreating it on every broadcast meant it could be cleared before ever
  // reaching its own 1000ms tick if broadcasts arrived more often than that,
  // making the displayed countdown look static.
  useEffect(() => {
    if (!radioFmVote?.active || radioFmVote.seconds_left == null) {
      if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
      setLocalSecondsLeft(null)
      return
    }
    setLocalSecondsLeft(radioFmVote.seconds_left)
    if (!countdownRef.current) {
      countdownRef.current = setInterval(() => {
        setLocalSecondsLeft(s => (s != null && s > 0) ? s - 1 : 0)
      }, 1000)
    }
  }, [radioFmVote?.active, radioFmVote?.seconds_left])

  // Unmount-only cleanup for the countdown interval
  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current) }, [])

  const fmLabel    = radioFmActive
    ? (radioFmIsLive ? '999 FM · LIVE' : '999 FM · OFF')
    : radioFmIsLive === false ? '999 FM · OFF' : '999 FM'
  const fmDisabled = radioFmIsLive === false && !radioFmActive

  const displayTitle  = radioFmActive && radioFmNowPlaying ? radioFmNowPlaying.title  : currentTrack?.title
  const displayArtist = radioFmActive && radioFmNowPlaying ? radioFmNowPlaying.artist : currentTrack?.artist
  const displayAlbum  = radioFmActive && radioFmNowPlaying ? radioFmNowPlaying.album  : currentTrack?.album

  // Nothing to control — gray out and disable the transport so it doesn't
  // look interactive when there's no track loaded (and FM isn't filling in).
  const noTrack = !radioFmActive && !currentTrack

  const ArtBox = ({ mobile }: { mobile: boolean }) => (
    <div
      className={mobile
        ? 'w-14 h-14 rounded-xl overflow-hidden shrink-0 shadow-lg'
        : 'rounded-3xl overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.8)] w-full'}
      style={mobile ? {} : { aspectRatio: '1' }}
    >
      {artSrc && !artError ? (
        <img src={artSrc} alt="Album art" className="w-full h-full object-cover" onError={() => setArtError(true)} />
      ) : radioFmActive ? (
        <div className="w-full h-full bg-gradient-to-br from-red-900/60 to-black flex flex-col items-center justify-center gap-2">
          <Radio className={`text-red-400 opacity-70 ${mobile ? 'w-6 h-6' : 'w-16 h-16'}`} />
          {!mobile && <span className="text-red-300/70 text-2xl font-bold tracking-widest">999 FM</span>}
        </div>
      ) : (
        <div className="w-full h-full bg-white/10 flex items-center justify-center">
          <Music className={`text-white/20 ${mobile ? 'w-6 h-6' : 'w-16 h-16'}`} />
        </div>
      )}
    </div>
  )

  const FmRadioPanel = () => (
    <div className="flex-1 overflow-y-auto pb-8 px-4 md:px-6 flex flex-col gap-4 md:gap-5" style={{ scrollbarWidth: 'none' }}>
      {/* Vote */}
      {radioFmVote?.active && !voteDismissed ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-white/50 text-[11px] font-semibold uppercase tracking-widest">
              {radioFmVote.kind === 'skip' ? 'Vote to Skip' : 'Vote to Queue'}
            </p>
            <div className="flex items-center gap-2">
              {localSecondsLeft != null && (
                <span className={`text-xs tabular-nums font-mono transition-colors ${localSecondsLeft <= 5 ? 'text-red-400/70' : 'text-white/30'}`}>
                  {localSecondsLeft}s
                </span>
              )}
              <button onClick={() => setVoteDismissed(true)} className="text-white/20 hover:text-white/60 transition-colors">
                <X size={13} />
              </button>
            </div>
          </div>
          {radioFmVote.track && <p className="text-white/80 text-sm font-medium">{radioFmVote.track}</p>}
          <p className="text-white/30 text-xs">
            {radioFmVote.yes ?? 0} yes · {radioFmVote.no ?? 0} no
            {radioFmVote.votes_needed != null && <span> · need {radioFmVote.votes_needed}</span>}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => { setMyVote('yes'); getActiveRadioClient()?.castVote('yes') }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium transition-all ${
                myVote === 'yes'
                  ? 'bg-green-600/40 text-green-300 ring-1 ring-green-500/50'
                  : 'bg-green-600/15 hover:bg-green-600/30 text-green-400'
              }`}>
              <ThumbsUp size={13} /> Yes
            </button>
            <button
              onClick={() => { setMyVote('no'); getActiveRadioClient()?.castVote('no') }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium transition-all ${
                myVote === 'no'
                  ? 'bg-red-600/40 text-red-300 ring-1 ring-red-500/50'
                  : 'bg-red-900/15 hover:bg-red-900/30 text-red-400'
              }`}>
              <ThumbsDown size={13} /> No
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => { setVoteDismissed(false); getActiveRadioClient()?.proposeSkip() }}
          className="flex items-center gap-2 text-sm text-white/30 hover:text-white/65 transition-colors self-start">
          <SkipForward size={14} /> Vote to skip
        </button>
      )}

      {/* Suggest */}
      <div className="flex flex-col gap-2">
        <p className="text-white/40 text-[11px] font-semibold uppercase tracking-widest">Suggest next song</p>
        {proposed ? (
          <div className="flex items-center justify-between bg-green-900/20 border border-green-500/20 rounded-xl px-3 py-2">
            <div className="flex items-center gap-2 text-green-400 text-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0 animate-pulse" />
              Proposed: <span className="text-green-300 font-medium">{proposed}</span>
            </div>
            <button onClick={() => { setProposed(null); if (proposeTimer.current) clearTimeout(proposeTimer.current) }}
              className="text-green-500/50 hover:text-green-400 transition-colors ml-2 shrink-0">
              <X size={13} />
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
              <input
                type="text" value={suggestQuery}
                onChange={(e) => setSuggestQuery(e.target.value)}
                placeholder="Search songs…"
                className="w-full bg-white/5 text-white/80 text-sm rounded-xl py-2 pl-8 pr-3 border border-white/10 focus:outline-none focus:border-white/25 transition-colors"
                style={{ colorScheme: 'dark' }}
              />
            </div>
            {suggestLoading && <p className="text-white/25 text-xs pl-1">Searching…</p>}
            {suggestResults.length > 0 && (
              <div className="flex flex-col -mx-1">
                {suggestResults.map(song => (
                  <button key={song.id} onClick={() => handlePropose(song)}
                    className="text-left px-3 py-2 rounded-xl hover:bg-white/10 transition-colors group">
                    <p className="text-white/70 text-sm truncate group-hover:text-white/90 transition-colors">
                      {song.track_titles?.[0] || song.name}
                    </p>
                    <p className="text-white/35 text-xs truncate">{song.credited_artists}</p>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Up next */}
      {radioFmUpNext && (
        <div className="flex flex-col gap-2">
          <p className="text-white/40 text-[11px] font-semibold uppercase tracking-widest">Up next</p>
          <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
            <p className="text-white/80 text-sm font-medium truncate">{radioFmUpNext.title}</p>
            {radioFmUpNext.artist && <p className="text-white/40 text-xs mt-0.5">{radioFmUpNext.artist}</p>}
          </div>
        </div>
      )}

      {/* Queue preview */}
      {radioFmQueuePreview.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-white/40 text-[11px] font-semibold uppercase tracking-widest">Coming up</p>
          <div className="flex flex-col">
            {radioFmQueuePreview.map((title, i) => (
              <div key={i} className="flex items-center gap-3 px-1 py-1.5 rounded-lg">
                <span className="text-white/20 text-xs w-4 text-right shrink-0">{i + 1}</span>
                <p className="text-white/50 text-sm truncate">{title}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  // LyricsPanel is now a module-level component (see below WrldView) — call via JSX.

  // ── Albums notch content ──────────────────────────────────────────────────────

  const AlbumsGrid = () => (
    <div className="grid grid-cols-2 gap-2.5 pb-2">
      {wrldAlbums.map(album => {
        const primaryVersion = album.versions[0]
        return (
          <button
            key={album.id}
            onClick={() => { setSelectedAlbumId(album.id); setSelectedVersionIdx(0) }}
            className="flex flex-col gap-1.5 text-left group/album"
          >
            <div className="relative w-full aspect-square rounded-xl overflow-hidden shadow-lg ring-1 ring-white/[0.06] group-hover/album:ring-white/25 transition-all duration-200">
              <img
                src={primaryVersion.cover_url}
                alt={album.name}
                className="w-full h-full object-cover transition-transform duration-300 group-hover/album:scale-[1.04]"
              />
              {/* Play overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover/album:bg-black/30 transition-colors duration-200 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full bg-white/0 group-hover/album:bg-white flex items-center justify-center transition-all duration-200 opacity-0 group-hover/album:opacity-100 shadow-xl translate-y-1 group-hover/album:translate-y-0">
                  <Play size={10} className="text-black ml-0.5" fill="black" />
                </div>
              </div>
            </div>
            <div className="px-0.5">
              <p className="text-white/85 text-[10px] font-semibold leading-tight line-clamp-2">{album.name}</p>
              <p className="text-white/35 text-[9px] mt-0.5 tabular-nums">{primaryVersion.year}</p>
            </div>
          </button>
        )
      })}
    </div>
  )

  const AlbumDetail = ({ albumId }: { albumId: number }) => {
    const album = wrldAlbums.find(a => a.id === albumId)
    if (!album) return null
    const version = album.versions[selectedVersionIdx] ?? album.versions[0]

    return (
      <div className="flex flex-col gap-3">
        {/* Back button */}
        <button
          onClick={() => setSelectedAlbumId(null)}
          className="flex items-center gap-1.5 text-[10px] text-white/40 hover:text-white/75 transition-colors -ml-0.5 self-start"
        >
          <ChevronLeft size={11} />
          <span>Albums</span>
        </button>

        {/* Cover art */}
        <div className="w-full aspect-square rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10">
          <img src={version.cover_url} alt={album.name} className="w-full h-full object-cover" />
        </div>

        {/* Album info */}
        <div>
          <p className="text-white/95 text-xs font-bold leading-snug">{album.name}</p>
          <p className="text-white/40 text-[10px] mt-0.5">Juice WRLD · {version.year}</p>
        </div>

        {/* Version tabs */}
        {album.versions.length > 1 && (
          <div className="flex gap-1.5">
            {album.versions.map((v, i) => (
              <button
                key={i}
                onClick={() => setSelectedVersionIdx(i)}
                className={`px-2.5 py-1 rounded-lg text-[9px] font-semibold transition-all duration-150 ${
                  selectedVersionIdx === i
                    ? 'bg-white/15 text-white/95 ring-1 ring-white/20'
                    : 'bg-white/[0.04] text-white/35 hover:bg-white/10 hover:text-white/65'
                }`}
              >
                {v.name.includes('Deluxe') ? 'Deluxe' : 'Standard'}
              </button>
            ))}
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-white/[0.07]" />

        {/* Track list */}
        <div className="flex flex-col -mx-1.5">
          {version.songs.map((song, idx) => {
            const isActive = currentTrack?.id === `jw-${song.id}`
            const isLoading = playingAlbumSongId === song.id

            return (
              <button
                key={`${song.id}-${idx}`}
                onClick={() => handlePlayAlbumSong(song.id)}
                className="flex items-center gap-2 px-2 py-[5px] rounded-lg hover:bg-white/[0.07] active:bg-white/10 transition-colors group/song text-left"
              >
                {/* Track number / playing indicator */}
                <div className="w-5 shrink-0 flex items-center justify-center">
                  {isLoading ? (
                    <div className="w-2.5 h-2.5 rounded-full border border-white/30 border-t-white/80 animate-spin" />
                  ) : isActive ? (
                    <span className="text-[var(--accent)] text-[9px]">▶</span>
                  ) : (
                    <>
                      <span className="text-white/25 text-[10px] tabular-nums group-hover/song:hidden">{idx + 1}</span>
                      <Play size={9} className="text-white/50 hidden group-hover/song:block" fill="currentColor" />
                    </>
                  )}
                </div>

                {/* Song name */}
                <span
                  className={`text-[11px] truncate transition-colors leading-tight ${
                    isActive
                      ? 'text-[var(--accent)] font-semibold'
                      : 'text-white/70 group-hover/song:text-white/95'
                  }`}
                >
                  {song.name}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const inner = (
    <div className="relative flex flex-col md:flex-row flex-1 h-full w-full overflow-hidden">

      {/* Lets the OS window be dragged from the top of the fullscreen overlay,
          since it now covers the normal draggable title-bar strip underneath. */}
      {fullscreen && isElectronApp && (
        <div className="absolute top-0 left-0 right-0 h-7 z-20 select-none mr-[132px]" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
      )}

      {/* Fullscreen toggle. App.tsx only hides the Electron window-control
          buttons (minimize/maximize/close, 132px wide, rendered `fixed
          top-0 right-0`) once wrldFullscreen is true — which mirrors
          `fullscreen` below, so it's only true *after* this button has
          already been clicked to enter fullscreen. Before that, those
          controls are still showing in the same corner, so this button
          needs its own `fixed` positioning (not `absolute` within this
          view's container, which sits at a different vertical offset and
          was throwing the two out of alignment), sitting directly under
          the close button (right-2 lines up with close's own center)
          rather than off to the side of minimize. Once fullscreen is
          entered the controls disappear and this can sit flush at the
          corner instead. */}
      <button
        onClick={() => (fullscreen ? exitFullscreen() : enterFullscreen())}
        className={`z-30 flex items-center justify-center rounded-full transition-all border
          ${isElectronApp
            ? (fullscreen ? 'fixed top-1 right-2 w-8 h-8' : 'fixed top-9 right-2 w-7 h-7')
            : 'absolute top-2 md:top-3 right-12 md:right-3 w-8 h-8'}
          bg-white/60 dark:bg-black/25 border-black/10 dark:border-white/10 text-black/70 dark:text-white/50 hover:text-black dark:hover:text-white/90 hover:bg-white/80 dark:hover:bg-black/50 backdrop-blur-sm shadow-sm`}
        title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      >
        {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={13} />}
      </button>

      {/* 999 FM toggle */}
      <button
        onClick={() => setRadioFmActive(!radioFmActive)}
        disabled={fmDisabled}
        className={`absolute z-30 flex items-center gap-2 text-xs font-medium rounded-full px-3 py-1.5 transition-all disabled:opacity-40
          top-3 right-3 md:top-4 md:left-4 md:right-auto
          ${radioFmActive && radioFmIsLive
            ? 'bg-red-600/80 text-white backdrop-blur-sm ring-1 ring-red-400/50'
            : radioFmActive
            ? 'bg-white/10 text-white/50 backdrop-blur-sm'
            : 'bg-white/60 dark:bg-black/25 border border-black/10 dark:border-white/10 text-black/70 dark:text-white/50 hover:text-black dark:hover:text-white/90 hover:bg-white/80 dark:hover:bg-black/50 backdrop-blur-sm shadow-sm'}`}
        title={radioFmActive ? 'Turn off 999 FM' : 'Turn on 999 FM'}
      >
        <Radio size={13} className={radioFmActive && radioFmIsLive ? 'animate-pulse' : ''} />
        <span>{fmLabel}</span>
      </button>

      <>
          {/* Blurred background */}
          <div className="absolute inset-0 overflow-hidden">
            {artSrc && !artError ? (
              <img src={artSrc} alt=""
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: `blur(60px) brightness(${theme === 'dark' ? 0.22 : 0.45}) saturate(${theme === 'dark' ? 2.4 : 1.8})`, transform: 'scale(1.2)' }}
                onError={() => setArtError(true)}
              />
            ) : (
              <div className={`absolute inset-0 ${radioFmActive ? 'bg-gradient-to-br from-red-950/60 to-black dark:from-red-950/60 dark:to-black' : 'bg-gradient-to-br from-gray-200 to-gray-100 dark:from-gray-900 dark:to-black'}`} />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/20 dark:from-black/40 dark:via-transparent dark:to-black/70" />
          </div>

          {/* Mobile layout */}
          <div className="md:hidden relative z-10 flex flex-col h-full min-h-0">

            {/* Header: art + title */}
            <div className="flex items-center gap-3 px-4 pt-12 pb-3 shrink-0">
              <ArtBox mobile />
              <div className="flex-1 min-w-0">
                {displayTitle  && <p className="font-bold text-sm leading-tight truncate" style={{ color: txtPri }}>{displayTitle}</p>}
                {displayArtist && <p className="text-xs mt-0.5 truncate" style={{ color: txtSec }}>{displayArtist}</p>}
                {displayAlbum  && <p className="text-xs mt-0.5 truncate" style={{ color: txtTer }}>{displayAlbum}</p>}
                {radioFmActive && !radioFmNowPlaying && <p className="text-xs mt-0.5" style={{ color: txtTer }}>Tuning in…</p>}
              </div>
              {!radioFmActive && (
                <button
                  onClick={() => setShowQueue(!showQueue)}
                  title="Playing Next"
                  className="p-1.5 rounded-full transition-colors hover:bg-white/10"
                  style={{ color: showQueue ? 'var(--accent)' : (textIsDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.55)') }}
                >
                  <ListMusic size={18} />
                </button>
              )}
              <SongMenu light={textIsDark} />
            </div>

            {/* Tab bar (FM mode) or divider line */}
            {radioFmActive ? (
              <div className="flex items-center gap-1 px-4 pb-2 shrink-0 border-b border-white/5">
                {(['radio', 'lyrics'] as const).map(tab => (
                  <button key={tab} onClick={() => setFmTab(tab)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                      fmTab === tab ? 'bg-white/10 text-white/90' : 'text-white/35 hover:text-white/65 hover:bg-white/5'
                    }`}>
                    {tab === 'radio' ? 'Radio' : 'Lyrics'}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mx-4 h-px bg-white/10 shrink-0" />
            )}

            {/* Content */}
            {radioFmActive
              ? (fmTab === 'radio' ? FmRadioPanel() : <LyricsPanel rawLyrics={rawLyrics} isSynced={isSynced} syncedLines={syncedLines} radioFmActive={radioFmActive} currentTrack={currentTrack} isEditor={isEditor} txtPri={txtPri} txtSec={txtSec} txtTer={txtTer} txtFaint={txtFaint} />)
              : <LyricsPanel rawLyrics={rawLyrics} isSynced={isSynced} syncedLines={syncedLines} radioFmActive={radioFmActive} currentTrack={currentTrack} isEditor={isEditor} txtPri={txtPri} txtSec={txtSec} txtTer={txtTer} txtFaint={txtFaint} />
            }

            {/* Mobile playback bar — the bottom Player bar is hidden on this
                page, and the mobile layout never had its own controls, so
                this is the only way to control playback here. FM has no
                local play/pause/seek, so that mode is volume-only. */}
            <div className="shrink-0 px-4 pt-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}>
              {radioFmActive && <FmProgressBar txtPri={txtPri} txtTer={txtTer} />}
              {!radioFmActive && (
                <>
                  <ProgressBar txtPri={txtPri} txtTer={txtTer} />
                  <div className={`flex items-center justify-between mt-2 mb-1 transition-opacity ${noTrack ? 'opacity-35 pointer-events-none' : ''}`}>
                    <button
                      onClick={toggleShuffle}
                      disabled={noTrack}
                      title={shuffle ? 'Shuffle on' : 'Shuffle off'}
                      className="p-2 rounded-full transition-colors"
                      style={{ color: shuffle ? txtPri : txtTer, opacity: shuffle ? 1 : 0.6 }}
                    >
                      <Shuffle size={16} />
                    </button>
                    <button
                      onClick={() => prevTrack()}
                      disabled={noTrack}
                      className="p-2 rounded-full transition-opacity hover:opacity-70"
                      style={{ color: txtPri }}
                      title="Previous"
                    >
                      <SkipBack size={24} fill="currentColor" />
                    </button>
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      disabled={noTrack}
                      className="w-12 h-12 rounded-full flex items-center justify-center shadow-xl transition-opacity hover:opacity-80 active:scale-95"
                      style={{ background: txtPri, color: textIsDark ? 'white' : 'black' }}
                    >
                      {isPlaying
                        ? <Pause size={20} fill="currentColor" />
                        : <Play  size={20} fill="currentColor" className="ml-0.5" />}
                    </button>
                    <button
                      onClick={() => nextTrack()}
                      disabled={noTrack}
                      className="p-2 rounded-full transition-opacity hover:opacity-70"
                      style={{ color: txtPri }}
                      title="Next"
                    >
                      <SkipFwd size={24} fill="currentColor" />
                    </button>
                    <button
                      onClick={toggleRepeat}
                      disabled={noTrack}
                      title={repeat === 'none' ? 'No repeat' : repeat === 'all' ? 'Repeat all' : 'Repeat one'}
                      className="p-2 rounded-full transition-colors"
                      style={{ color: repeat !== 'none' ? txtPri : txtTer, opacity: repeat !== 'none' ? 1 : 0.6 }}
                    >
                      {repeat === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
                    </button>
                  </div>
                </>
              )}
              <div className="flex items-center gap-2.5">
                <button
                  onClick={toggleMute}
                  className="shrink-0 transition-opacity hover:opacity-70"
                  style={{ color: txtTer }}
                >
                  {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <div className="relative flex-1 h-1 rounded-full cursor-pointer group/vol"
                  style={{ background: 'rgba(255,255,255,0.18)' }}
                  onMouseDown={e => {
                    const track = e.currentTarget
                    const compute = (clientX: number) => {
                      const rect = track.getBoundingClientRect()
                      setVolume(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)))
                    }
                    compute(e.clientX)
                    const onMove = (ev: MouseEvent) => compute(ev.clientX)
                    const onUp = () => {
                      document.removeEventListener('mousemove', onMove)
                      document.removeEventListener('mouseup', onUp)
                    }
                    document.addEventListener('mousemove', onMove)
                    document.addEventListener('mouseup', onUp)
                  }}
                  onTouchStart={e => {
                    const track = e.currentTarget
                    const compute = (clientX: number) => {
                      const rect = track.getBoundingClientRect()
                      setVolume(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)))
                    }
                    compute(e.touches[0].clientX)
                    const onMove = (ev: TouchEvent) => compute(ev.touches[0].clientX)
                    const onEnd = () => {
                      document.removeEventListener('touchmove', onMove)
                      document.removeEventListener('touchend', onEnd)
                    }
                    document.addEventListener('touchmove', onMove)
                    document.addEventListener('touchend', onEnd)
                  }}
                >
                  <div className="h-full rounded-full" style={{ width: `${volume * 100}%`, background: txtTer }} />
                  <div
                    className="absolute top-1/2 w-3 h-3 rounded-full shadow-lg opacity-0 group-hover/vol:opacity-100 transition-opacity pointer-events-none"
                    style={{ left: `${volume * 100}%`, transform: 'translate(-50%, -50%)', background: txtPri }}
                  />
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums w-10 text-right" style={{ color: txtTer }}>
                  {Math.round(volume * 100)}%
                </span>
              </div>
            </div>
          </div>

          {/* Desktop layout */}
          <div className="hidden md:flex relative z-10 flex-1 h-full overflow-hidden">

            {/* Left column — Apple Music style. A true 50/50 split with the
                lyrics column, not a narrow fixed-width sidebar next to a huge
                mostly-empty lyrics pane. */}
            {/* overflow-x-hidden is required here, not just tidy: per the CSS
                overflow spec, when one axis is 'auto' the other's computed
                value is promoted from 'visible' to 'auto' too — so without
                this, a bookmark tab expanding past this column's edge on
                hover was making the browser grow a horizontal scrollbar,
                which shifted the whole column up by its height. */}
            <div className="relative flex flex-col items-center justify-center shrink-0 px-8 xl:px-12 gap-5 overflow-y-auto overflow-x-hidden"
              style={{ width: '50%', minWidth: 320 }}>

              {/* Album art */}
              <div className="relative w-full" style={{ maxWidth: 320 }}>
                <ArtBox mobile={false} />
                {!radioFmActive && songVersions.length > 0 && (
                  <div
                    className="wrld-bookmarks absolute right-full flex flex-col items-end z-20 overflow-y-auto"
                    onMouseEnter={() => setBookmarksHovered(true)}
                    onMouseLeave={() => setBookmarksHovered(false)}
                    style={{
                      scrollbarWidth: 'none',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      maxHeight: 'calc(100% - 16px)',
                      gap: bookmarksHovered ? 8 : 0,
                      padding: bookmarksHovered ? '8px 0' : 0,
                      // Fades the edges instead of hard-clipping mid-tab —
                      // without this, whichever tab landed on the scroll
                      // boundary got chopped in half, which read as broken
                      // rather than "there's more, scroll".
                      WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, black 14px, black calc(100% - 14px), transparent 100%)',
                      maskImage: 'linear-gradient(to bottom, transparent 0, black 14px, black calc(100% - 14px), transparent 100%)',
                    } as React.CSSProperties}
                  >
                    <style>{`.wrld-bookmarks::-webkit-scrollbar { display: none; }`}</style>
                    {songVersions.map((v, i) => {
                      const labelText = v.label ?? `Version ${i + 1}`
                      // Sized to the label instead of a fixed width — a
                      // short "v1" popping out to the same 150px as a full
                      // version title looked absurdly long for no reason.
                      const expandedWidth = Math.min(150, Math.max(46, labelText.length * 6.5 + 28))
                      return (
                        <button
                          key={v.songId}
                          onClick={() => handlePlayVersion(v.songId)}
                          title={labelText}
                          className={`h-6 shrink-0 flex items-center justify-end overflow-hidden transition-all duration-200 ease-out bg-white/15 dark:bg-white/[0.08] backdrop-blur-xl backdrop-saturate-150 ${
                            bookmarksHovered
                              ? 'rounded-l-full shadow-lg opacity-100 border border-white/40 dark:border-white/15'
                              : 'rounded-l-full opacity-60 border border-transparent'
                          }`}
                          style={{ width: bookmarksHovered ? `${expandedWidth}px` : '5px' }}
                        >
                          <span className={`pl-3.5 pr-2 text-[10px] font-semibold text-white whitespace-nowrap transition-opacity duration-150 ${bookmarksHovered ? 'opacity-100' : 'opacity-0'}`}>
                            {labelText}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Title + artist */}
              <div className="w-full px-1" style={{ maxWidth: 320 }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {displayTitle  && <p className="font-bold text-xl leading-tight truncate" style={{ color: txtPri }}>{displayTitle}</p>}
                    {displayArtist && <p className="text-sm mt-0.5 truncate" style={{ color: txtSec }}>{displayArtist}</p>}
                    {radioFmActive && !radioFmNowPlaying && <p className="text-sm mt-0.5" style={{ color: txtTer }}>Tuning in…</p>}
                  </div>
                  {!radioFmActive && (
                    <button
                      onClick={() => setShowQueue(!showQueue)}
                      title="Playing Next"
                      className="p-1.5 rounded-full transition-colors hover:bg-white/10"
                      style={{ color: showQueue ? 'var(--accent)' : (textIsDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.55)') }}
                    >
                      <ListMusic size={18} />
                    </button>
                  )}
                  <SongMenu light={textIsDark} />
                </div>
              </div>

              {/* Progress bar — FM gets a read-only version (no scrubbing on live radio) */}
              <div className="w-full" style={{ maxWidth: 320 }}>
                {radioFmActive
                  ? <FmProgressBar txtPri={txtPri} txtTer={txtTer} />
                  : <ProgressBar txtPri={txtPri} txtTer={txtTer} />}
              </div>

              {/* Playback controls */}
              <div className="w-full flex flex-col gap-4" style={{ maxWidth: 320 }}>
                {/* Main controls row — hidden during 999FM; it's a live stream,
                    nothing here to locally play/pause/seek. Voting to skip
                    lives in the FM panel itself instead of a repurposed button. */}
                {!radioFmActive && (
                <div className={`flex items-center justify-between transition-opacity ${noTrack ? 'opacity-35 pointer-events-none' : ''}`}>
                  {/* Shuffle */}
                  <button
                    onClick={toggleShuffle}
                    disabled={noTrack}
                    title={shuffle ? 'Shuffle on' : 'Shuffle off'}
                    className="p-2 rounded-full transition-colors"
                    style={{ color: shuffle ? txtPri : txtTer, opacity: shuffle ? 1 : 0.6 }}
                  >
                    <Shuffle size={16} />
                  </button>

                  {/* Prev */}
                  <button
                    onClick={() => prevTrack()}
                    disabled={noTrack}
                    className="p-2 rounded-full transition-opacity hover:opacity-70"
                    style={{ color: txtPri }}
                    title="Previous"
                  >
                    <SkipBack size={26} fill="currentColor" />
                  </button>

                  {/* Play / Pause */}
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    disabled={noTrack}
                    className="w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-opacity hover:opacity-80 active:scale-95"
                    style={{ background: txtPri, color: textIsDark ? 'white' : 'black' }}
                  >
                    {isPlaying
                      ? <Pause size={24} fill="currentColor" />
                      : <Play  size={24} fill="currentColor" className="ml-0.5" />}
                  </button>

                  {/* Next */}
                  <button
                    onClick={() => nextTrack()}
                    disabled={noTrack}
                    className="p-2 rounded-full transition-opacity hover:opacity-70"
                    style={{ color: txtPri }}
                    title="Next"
                  >
                    <SkipFwd size={26} fill="currentColor" />
                  </button>

                  {/* Repeat */}
                  <button
                    onClick={toggleRepeat}
                    disabled={noTrack}
                    title={repeat === 'none' ? 'No repeat' : repeat === 'all' ? 'Repeat all' : 'Repeat one'}
                    className="p-2 rounded-full transition-colors"
                    style={{ color: repeat !== 'none' ? txtPri : txtTer, opacity: repeat !== 'none' ? 1 : 0.6 }}
                  >
                    {repeat === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
                  </button>
                </div>
                )}

                {/* Volume row */}
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={toggleMute}
                    className="shrink-0 transition-opacity hover:opacity-70"
                    style={{ color: txtTer }}
                  >
                    {volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  </button>
                  <div className="relative flex-1 h-1 rounded-full cursor-pointer group/vol"
                    style={{ background: 'rgba(255,255,255,0.18)' }}
                    onMouseDown={e => {
                      const track = e.currentTarget
                      const compute = (clientX: number) => {
                        const rect = track.getBoundingClientRect()
                        setVolume(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)))
                      }
                      compute(e.clientX)
                      const onMove = (ev: MouseEvent) => compute(ev.clientX)
                      const onUp = () => {
                        document.removeEventListener('mousemove', onMove)
                        document.removeEventListener('mouseup', onUp)
                      }
                      document.addEventListener('mousemove', onMove)
                      document.addEventListener('mouseup', onUp)
                    }}
                  >
                    <div className="h-full rounded-full" style={{ width: `${volume * 100}%`, background: txtTer }} />
                    <div
                      className="absolute top-1/2 w-2.5 h-2.5 rounded-full opacity-0 group-hover/vol:opacity-100 transition-opacity pointer-events-none"
                      style={{ left: `${volume * 100}%`, transform: 'translate(-50%, -50%)', background: txtPri }}
                    />
                    <span
                      className="absolute -top-9 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-black/80 text-white text-sm font-semibold tabular-nums opacity-0 group-hover/vol:opacity-100 transition-opacity pointer-events-none"
                      style={{ left: `${volume * 100}%` }}
                    >
                      {Math.round(volume * 100)}%
                    </span>
                  </div>
                  {outputDevices.length > 1 && (
                    <button
                      ref={outputBtnRef}
                      onClick={openOutputPicker}
                      title="Audio output"
                      className="shrink-0 transition-opacity hover:opacity-70"
                      style={{ color: audioOutput ? 'var(--accent)' : txtTer }}
                    >
                      <Volume2 size={14} />
                    </button>
                  )}
                </div>
              </div>

            </div>

            {/* Output device popover — portaled so it isn't clipped by the
                (overflow-hidden) column it's anchored to. */}
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

            {/* Divider — FM only */}
            {radioFmActive && <div className="w-px bg-white/10 shrink-0 my-10" />}

            {/* Right column — swaps to the queue when toggled (replacing
                lyrics entirely, rather than floating a queue popup over the
                left column) so it gets the full column's height instead of
                a cramped 300px-capped overlay. */}
            <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
              {showQueue && !radioFmActive ? (
                <div className="h-full flex items-center justify-center">
                  <div className="w-[65%] max-w-[420px] min-w-[260px] h-[75%]">
                    <WrldQueuePanel variant="panel" onClose={() => setShowQueue(false)} />
                  </div>
                </div>
              ) : radioFmActive ? (
                <>
                  <div className="flex items-center gap-1 px-6 pt-5 pb-3 shrink-0">
                    {(['radio', 'lyrics'] as const).map(tab => (
                      <button key={tab} onClick={() => setFmTab(tab)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                          fmTab === tab ? 'bg-white/10 text-white/90' : 'text-white/35 hover:text-white/65 hover:bg-white/5'
                        }`}>
                        {tab === 'radio' ? 'Radio' : 'Lyrics'}
                      </button>
                    ))}
                  </div>
                  {fmTab === 'radio' ? FmRadioPanel() : <LyricsPanel padded rawLyrics={rawLyrics} isSynced={isSynced} syncedLines={syncedLines} radioFmActive={radioFmActive} currentTrack={currentTrack} isEditor={isEditor} txtPri={txtPri} txtSec={txtSec} txtTer={txtTer} txtFaint={txtFaint} />}
                </>
              ) : (
                <LyricsPanel padded rawLyrics={rawLyrics} isSynced={isSynced} syncedLines={syncedLines} radioFmActive={radioFmActive} currentTrack={currentTrack} isEditor={isEditor} txtPri={txtPri} txtSec={txtSec} txtTer={txtTer} txtFaint={txtFaint} />
              )}
            </div>
          </div>

      </>

      {/* ── Notch menu ── */}
      <div className="group absolute right-0 top-0 bottom-0 z-20 flex items-center">

        {/* Expanded panel — slides in on hover */}
        <div className="overflow-hidden max-w-0 group-hover:max-w-[272px] transition-[max-width] duration-200 ease-out">
          <div
            className="w-64 opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75
              bg-black/85 backdrop-blur-2xl rounded-l-2xl border-l border-t border-b border-white/[0.07]
              flex flex-col overflow-hidden"
            style={{ height: 'calc(100vh - 180px)', maxHeight: 560 }}
          >

            {/* Category selector */}
            <div className="relative px-3 pt-3 pb-2 shrink-0">
              <button
                onClick={() => setNotchDropdownOpen(o => !o)}
                className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] transition-colors"
              >
                <span className="text-white/60 text-[10px] font-semibold tracking-wide truncate leading-none">
                  {NOTCH_LABELS[notchCategory]}
                </span>
                <ChevronDown size={10} className={`text-white/30 shrink-0 transition-transform duration-150 ${notchDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {notchDropdownOpen && (
                <div className="absolute top-full left-3 right-3 mt-1 z-10 bg-black/95 backdrop-blur-xl rounded-xl border border-white/10 overflow-hidden py-1 shadow-2xl">
                  {(account ? NOTCH_OPTIONS : NOTCH_OPTIONS.filter(o => o.value !== 'playlists')).map(opt => (
                    <button key={opt.value}
                      onClick={() => {
                        setNotchCategory(opt.value)
                        setNotchDropdownOpen(false)
                        setSelectedAlbumId(null)
                      }}
                      className={`w-full px-3 py-2 text-left text-[10px] font-medium transition-colors ${
                        notchCategory === opt.value
                          ? 'text-white/90 bg-white/[0.08]'
                          : 'text-white/45 hover:text-white/80 hover:bg-white/[0.05]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Thin separator */}
            <div className="h-px bg-white/[0.06] mx-3 shrink-0" />

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-3 py-3" style={{ scrollbarWidth: 'none' }}>

              {/* ── Albums ── */}
              {notchCategory === 'albums' ? (
                selectedAlbumId !== null
                  ? <AlbumDetail albumId={selectedAlbumId} />
                  : <AlbumsGrid />

              /* ── Playlists ── */
              ) : notchCategory === 'playlists' && account && playlists.length > 0 ? (
                <div className="grid grid-cols-2 gap-2.5">
                  {playlists.slice(0, 6).map(pl => (
                    <button key={pl.id} onClick={() => handleAddToPlaylist(pl.id)} title={pl.name}
                      className="flex flex-col gap-1.5 text-left group/pl">
                      <div className="w-full aspect-square rounded-xl overflow-hidden ring-1 ring-white/[0.06] group-hover/pl:ring-white/25 transition-all shadow-md">
                        {playlistCoverUrl(pl)
                          ? <img src={playlistCoverUrl(pl)} className="w-full h-full object-cover" />
                          : <div className="w-full h-full bg-white/[0.06] flex items-center justify-center">
                              <Music size={18} className="text-white/15" />
                            </div>}
                      </div>
                      <p className="text-white/55 text-[9px] font-medium truncate px-0.5">{pl.name}</p>
                    </button>
                  ))}
                </div>

              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-2 py-8">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center">
                    <Music size={16} className="text-white/15" />
                  </div>
                  <p className="text-white/20 text-[10px] text-center">Coming soon</p>
                </div>
              )}

            </div>
          </div>
        </div>

        {/* Notch handle — pill tab */}
        <div className="w-[5px] group-hover:w-[3px] h-16 group-hover:h-24 rounded-l-full bg-white/20 group-hover:bg-white/50 transition-all duration-200 ease-out shrink-0" />
      </div>

      {/* Mobile queue — full-screen sheet (there's no side-by-side room for
          an inline drawer like the desktop layout gets). Hidden during 999FM,
          a live stream with nothing to queue/reorder. */}
      {showQueue && !radioFmActive && (
        <div className="md:hidden">
          <WrldQueuePanel variant="sheet" onClose={() => setShowQueue(false)} />
        </div>
      )}
    </div>
  )

  if (fullscreen) {
    // Portaled above everything except the OS window-control buttons
    // (z-[10000]), so it covers the sidebar/nav instead of being squeezed
    // into the normal content column.
    return createPortal(
      <div className="fixed inset-0 z-[150] bg-black">{inner}</div>,
      document.body,
    )
  }
  return inner
}

// ── ProgressBar — module-level so currentTime ticks don't re-render WrldView ──

import { memo as _memo2, useRef as _useRef2, useCallback as _cb2 } from 'react'
// (re-exports already imported above; using same imports)

// Apple Music-style "···" context menu for the current track. Module-level
// (like LyricsPanel/FmProgressBar) so it reads the store directly instead of
// drilling props from WrldView.
const SongMenu = memo(function SongMenu({ light }: { light: boolean }): JSX.Element {
  const { currentTrack, radioFmActive, radioFmNowPlaying, radioFmMatchedSong, likedTrackIds, toggleLike, account, setActiveView, setPendingEditorSongId } = useStore(useShallow(s => ({
    currentTrack: s.currentTrack,
    radioFmActive: s.radioFmActive,
    radioFmNowPlaying: s.radioFmNowPlaying,
    radioFmMatchedSong: s.radioFmMatchedSong,
    likedTrackIds: s.likedTrackIds,
    toggleLike: s.toggleLike,
    account: s.account,
    setActiveView: s.setActiveView,
    setPendingEditorSongId: s.setPendingEditorSongId,
  })))
  const canEdit = !!(account?.is_editor || account?.is_administrator)

  const [open, setOpen] = useState(false)
  const [showSongInfo, setShowSongInfo] = useState(false)
  const [songInfoData, setSongInfoData] = useState<JWApiSong | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const currentSongId = !radioFmActive && currentTrack ? userApi.trackIdToSongId(currentTrack.id) : null
  // Stream metadata's song_id is sometimes missing; RadioFmPlayer's title-search
  // fallback resolves the actual song separately, so fall back to that match.
  const fmSongId = radioFmActive ? (radioFmNowPlaying?.song_id ?? radioFmMatchedSong?.songId ?? null) : null
  const hasTarget = radioFmActive ? fmSongId != null : !!currentTrack

  const openInfo = (songId: number): void => {
    setOpen(false)
    setSongInfoData(null)
    setShowSongInfo(true)
    apiFetch<JWApiSong>(`/songs/${songId}/`)
      .then(song => setSongInfoData(song))
      .catch(() => setShowSongInfo(false))
  }

  if (!hasTarget) return <></>

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        // Stop the mousedown from reaching SongContextMenu's document-level
        // outside-click listener — otherwise clicking this button while the
        // menu is open closes it (mousedown) and then reopens it (click),
        // so it never appears to toggle shut.
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => setOpen(v => !v)}
        title="More options"
        className="p-1.5 rounded-full transition-colors hover:bg-white/10"
        style={{ color: light ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.55)' }}
      >
        <MoreHorizontal size={18} />
      </button>

      {/* FM radio is server-driven — Play/Play next/Add to queue/version
          switching don't make sense mid-broadcast, so those are left off,
          but Song info and Add to playlist still apply to the now-playing
          track. Synthesize a minimal Track since FM only gives us title/
          artist/album, not a full local/API track object. */}
      {open && radioFmActive && fmSongId != null && createPortal(
        <SongContextMenu
          state={{
            track: {
              id: `fm-${fmSongId}`,
              path: '',
              title: radioFmNowPlaying?.title ?? '',
              artist: radioFmNowPlaying?.artist ?? '',
              album: radioFmNowPlaying?.album ?? '',
              albumArtist: '',
              year: null,
              trackNumber: null,
              duration: 0,
              genre: '',
              hasAlbumArt: false,
            },
            songId: fmSongId,
            x: (btnRef.current?.getBoundingClientRect().right ?? 208) - 208,
            y: (btnRef.current?.getBoundingClientRect().bottom ?? 0) + 6,
          }}
          onClose={() => setOpen(false)}
          canEdit={canEdit}
          onInfo={() => openInfo(fmSongId)}
          disableChangeVersion
        />,
        document.body
      )}

      {open && !radioFmActive && currentTrack && createPortal(
        <SongContextMenu
          state={{
            track: currentTrack,
            songId: currentSongId,
            x: (btnRef.current?.getBoundingClientRect().right ?? 208) - 208,
            y: (btnRef.current?.getBoundingClientRect().bottom ?? 0) + 6,
          }}
          onClose={() => setOpen(false)}
          canEdit={canEdit}
          onInfo={() => currentSongId != null && openInfo(currentSongId)}
          liked={likedTrackIds.includes(currentTrack.id)}
          onToggleLike={() => toggleLike(currentTrack.id)}
        />,
        document.body
      )}

      {showSongInfo && createPortal(
        <SongInfoModal
          song={songInfoData}
          onClose={() => { setShowSongInfo(false); setSongInfoData(null) }}
          onEdit={canEdit ? (songId) => {
            setShowSongInfo(false); setSongInfoData(null)
            setPendingEditorSongId(songId)
            setActiveView('editor')
          } : undefined}
        />,
        document.body
      )}
    </div>
  )
})

// Apple Music-style "Up Next" queue panel for the WRLD tab — a dark glass
// panel matching the rest of the page instead of the app-wide QueuePanel's
// light theme (which App.tsx suppresses while this page is active, mirroring
// how it already suppresses the standalone NowPlaying panel here).
const WrldQueuePanel = memo(function WrldQueuePanel({ onClose, variant }: {
  onClose: () => void
  // 'inline' pops up directly under the interface column on desktop (the
  // Apple Music behavior this is modeled on); 'sheet' is a full-screen
  // overlay, used on mobile where there's no side-by-side room for it;
  // 'panel' fills the desktop right column in place of the lyrics view.
  variant: 'inline' | 'sheet' | 'panel'
}): JSX.Element {
  const { queue, queueIndex, currentTrack, isPlaying, shuffle, playTrack, removeFromQueue, clearQueue, reorderQueue } = useStore(useShallow(s => ({
    queue: s.queue,
    queueIndex: s.queueIndex,
    currentTrack: s.currentTrack,
    isPlaying: s.isPlaying,
    shuffle: s.shuffle,
    playTrack: s.playTrack,
    removeFromQueue: s.removeFromQueue,
    clearQueue: s.clearQueue,
    reorderQueue: s.reorderQueue,
  })))

  const upcoming = queue.slice(queueIndex + 1)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  const handleDrop = (idx: number): void => {
    if (dragIdx !== null && dragIdx !== idx) reorderQueue(dragIdx, idx)
    setDragIdx(null); setDragOverIdx(null)
  }

  return (
    <div
      className={`relative flex flex-col overflow-hidden ${
        variant === 'sheet' ? 'fixed inset-0 z-40'
          : variant === 'panel' ? 'w-full h-full rounded-2xl shadow-2xl'
          : 'w-full mt-2 rounded-2xl shadow-2xl'
      }`}
      style={variant === 'inline' ? { maxHeight: 300 } : undefined}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Glassy frosted panel — blurs and lifts whatever's actually behind it
          (brightness/saturate on the backdrop-filter itself, not a flat black
          tint) so it reads as a distinct elevated card. A plain blur() alone
          over this page's already-dark art background just looked like more
          flat black with no glass effect. */}
      <div
        className="absolute inset-0"
        style={{ backdropFilter: 'blur(40px) saturate(1.8) brightness(1.4)', WebkitBackdropFilter: 'blur(40px) saturate(1.8) brightness(1.4)' }}
      />
      <div className="absolute inset-0 bg-white/[0.06]" />

      <div className="relative z-10 flex items-center justify-between px-4 pt-4 pb-3 shrink-0 border-b border-white/10">
        <div className="flex items-center gap-2">
          <ListMusic size={14} className="text-white/60" />
          <h2 className="text-white/90 font-semibold text-xs uppercase tracking-widest">Playing Next</h2>
        </div>
        <div className="flex items-center gap-3">
          {upcoming.length > 0 && (
            <button onClick={clearQueue} className="text-white/60 hover:text-red-400 transition-colors text-xs flex items-center gap-1">
              <Trash2 size={12} /> Clear
            </button>
          )}
          <button onClick={onClose} className="text-white/60 hover:text-white/90 transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto wrld-queue-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.2) transparent' }}>
        <style>{`
          .wrld-queue-scroll::-webkit-scrollbar { width: 6px; }
          .wrld-queue-scroll::-webkit-scrollbar-track { background: transparent; }
          .wrld-queue-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
          .wrld-queue-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.35); }
        `}</style>
        {currentTrack ? (
          <div className="px-3 py-3">
            <p className="text-white/50 text-[10px] uppercase tracking-widest px-1 mb-2 font-semibold">Now Playing</p>
            <WrldQueueRow track={currentTrack} isActive isPlaying={isPlaying} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-center px-8">
            <ListMusic className="text-white/30 w-8 h-8" />
            <p className="text-white/60 text-sm">Queue is empty</p>
          </div>
        )}

        {currentTrack && <div className="mx-3 border-t border-white/10" />}

        {upcoming.length > 0 ? (
          <div className="px-3 pt-3 pb-6">
            <p className="text-white/50 text-[10px] uppercase tracking-widest px-1 mb-2 font-semibold">
              {shuffle ? 'Shuffle' : 'Up Next'} · {upcoming.length}
            </p>
            {upcoming.map((track, i) => (
              <div
                key={`${track.id}-${queueIndex + 1 + i}`}
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragOver={(e) => { e.preventDefault(); setDragOverIdx(i) }}
                onDrop={() => handleDrop(i)}
                onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
                className={`transition-transform ${dragOverIdx === i && dragIdx !== i ? 'translate-y-0.5 opacity-70' : ''} ${dragIdx === i ? 'opacity-30' : ''}`}
              >
                <WrldQueueRow
                  track={track}
                  isActive={false}
                  isPlaying={false}
                  showDrag
                  onPlay={() => playTrack(track, queue.slice(queueIndex + 1 + i))}
                  onRemove={() => removeFromQueue(queueIndex + 1 + i)}
                />
              </div>
            ))}
          </div>
        ) : currentTrack ? (
          <p className="text-white/50 text-xs text-center py-4">Nothing up next</p>
        ) : null}
      </div>
    </div>
  )
})

function WrldQueueRow({ track, isActive, isPlaying, showDrag, onPlay, onRemove }: {
  track: Track
  isActive: boolean
  isPlaying: boolean
  showDrag?: boolean
  onPlay?: () => void
  onRemove?: () => void
}): JSX.Element {
  return (
    <div
      className={`flex items-center gap-2 px-1 py-1.5 rounded-lg group transition-colors ${isActive ? 'bg-white/10' : 'hover:bg-white/[0.06]'} ${onPlay && !isActive ? 'cursor-pointer' : ''}`}
      onDoubleClick={onPlay}
    >
      {showDrag ? (
        <div className="text-white/40 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing shrink-0 transition-opacity">
          <GripVertical size={13} />
        </div>
      ) : (
        <div className="w-3.5 shrink-0" />
      )}
      <div className="w-9 h-9 rounded shrink-0 overflow-hidden bg-white/[0.06]">
        <AlbumArtThumbnail track={track} size={36} className="w-full h-full" shimmer={false} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium truncate leading-tight ${isActive ? 'text-accent' : 'text-white/85'}`}>{track.title}</p>
        <p className="text-[10px] text-white/40 truncate mt-0.5">{track.artist}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {!isPlaying && (
          <span className="text-white/40 text-[10px] tabular-nums">{track.duration ? formatDuration(track.duration) : ''}</span>
        )}
        {isPlaying && (
          <span className="flex gap-0.5 items-end h-3">
            {[0.4, 0.7, 1, 0.6].map((h, i) => (
              <span key={i} className="w-0.5 bg-accent rounded-full animate-pulse" style={{ height: `${h * 100}%`, animationDelay: `${i * 0.15}s` }} />
            ))}
          </span>
        )}
        {onRemove && (
          <button onClick={(e) => { e.stopPropagation(); onRemove() }} className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-red-400 transition-all ml-1 p-0.5">
            <X size={11} />
          </button>
        )}
      </div>
    </div>
  )
}

// Read-only playback bar for 999FM — it's a live stream, so no scrubbing,
// but elapsed/duration are still known (from the radio WS) and ticked
// locally between updates the same way the bottom Player bar does.
const FmProgressBar = memo(function FmProgressBar({ txtPri, txtTer }: { txtPri: string; txtTer: string }) {
  const radioFmNowPlaying = useStore(s => s.radioFmNowPlaying)
  const [elapsedMs, setElapsedMs] = useState(0)
  const baseRef = useRef<{ elapsed: number; at: number }>({ elapsed: 0, at: 0 })

  useEffect(() => {
    if (!radioFmNowPlaying?.elapsed_ms) { setElapsedMs(0); return }
    baseRef.current = { elapsed: radioFmNowPlaying.elapsed_ms, at: Date.now() }
    setElapsedMs(radioFmNowPlaying.elapsed_ms)
    const t = setInterval(() => {
      const { elapsed, at } = baseRef.current
      setElapsedMs(elapsed + (Date.now() - at))
    }, 500)
    return () => clearInterval(t)
  }, [radioFmNowPlaying])

  const fmt = (s: number) => {
    if (!isFinite(s) || isNaN(s) || s < 0) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const durationMs = radioFmNowPlaying?.duration_ms ?? 0
  const pct = durationMs > 0 ? Math.min(100, (elapsedMs / durationMs) * 100) : 0

  return (
    <div className="w-full flex flex-col gap-1.5 select-none">
      <div className="relative h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.18)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: txtPri }} />
      </div>
      <div className="flex justify-between">
        <span className="text-[10px] tabular-nums" style={{ color: txtTer }}>{fmt(elapsedMs / 1000)}</span>
        <span className="text-[10px] tabular-nums" style={{ color: txtTer }}>{durationMs > 0 ? fmt(durationMs / 1000) : '-∞'}</span>
      </div>
    </div>
  )
})

const ProgressBar = memo(function ProgressBar({ txtPri, txtTer }: { txtPri: string; txtTer: string }) {
  const { progress, currentTime } = useStore(useShallow(s => ({ progress: s.progress, currentTime: s.currentTime })))
  const barRef = useRef<HTMLDivElement>(null)
  // Buffer the scrub position visually while dragging — only call seekAudio
  // on release, since seeking on every mousemove makes playback glitch/stutter.
  const [dragPct, setDragPct] = useState<number | null>(null)

  const fmt = (s: number) => {
    if (!isFinite(s) || isNaN(s) || s < 0) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const pctFromClientX = useCallback((clientX: number): number | null => {
    const bar = barRef.current
    if (!bar) return null
    const rect = bar.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }, [])

  const duration    = getAudioDuration()
  const displayTime = dragPct !== null && duration > 0 ? dragPct * duration : currentTime
  const remaining   = duration > 0 ? duration - displayTime : 0
  const pct         = Math.min(100, (dragPct !== null ? dragPct : (progress || 0)) * 100)

  return (
    <div className="w-full flex flex-col gap-1.5 select-none">
      <div
        ref={barRef}
        className="relative h-1 rounded-full cursor-pointer group/bar"
        style={{ background: 'rgba(255,255,255,0.18)' }}
        onMouseDown={e => {
          const startPct = pctFromClientX(e.clientX)
          if (startPct !== null) setDragPct(startPct)
          const onMove = (ev: MouseEvent) => {
            const p = pctFromClientX(ev.clientX)
            if (p !== null) setDragPct(p)
          }
          const onUp = (ev: MouseEvent) => {
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
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: txtPri }} />
        <div
          className="absolute top-1/2 w-3 h-3 rounded-full shadow-lg opacity-0 group-hover/bar:opacity-100 transition-opacity pointer-events-none"
          style={{ left: `${pct}%`, transform: 'translate(-50%, -50%)', background: txtPri }}
        />
      </div>
      <div className="flex justify-between">
        <span className="text-[10px] tabular-nums" style={{ color: txtTer }}>{fmt(displayTime)}</span>
        <span className="text-[10px] tabular-nums" style={{ color: txtTer }}>{duration > 0 ? `-${fmt(remaining)}` : '-∞'}</span>
      </div>
    </div>
  )
})

// ── LyricsPanel — module-level component so it has its own Zustand selector ──

import type { SyncedLyricLine, Track } from '../types'

interface LyricsPanelProps {
  rawLyrics: string | null
  isSynced: boolean
  syncedLines: SyncedLyricLine[]
  padded?: boolean
  radioFmActive: boolean
  currentTrack: Track | null
  isEditor: boolean | null | undefined
  txtPri: string; txtSec: string; txtTer: string; txtFaint: string
}

const LyricsPanel = memo(function LyricsPanel({
  rawLyrics, isSynced, syncedLines, padded,
  radioFmActive, currentTrack, isEditor,
  txtPri, txtSec, txtTer,
}: LyricsPanelProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const linesRef    = useRef<HTMLDivElement>(null)
  const activeRef   = useRef<HTMLDivElement>(null)
  const lyricsOffset = useStore(s => s.lyricsOffset)

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

  // Center the active line by translating the whole lyric column rather than
  // using native `scrollIntoView({behavior:'smooth'})`. Native smooth-scroll
  // steps in discrete chunks and visibly fights the active line's font-size
  // reflow, which read as a choppy, low-fps animation. A GPU-composited
  // transform with a CSS transition glides at the display's full refresh rate.
  const [translateY, setTranslateY] = useState(0)
  const [vpHalf, setVpHalf] = useState(0)

  // Manual-scroll override — the lyric column isn't a native scroll container
  // (its position is driven by a `transform`, not `scrollTop`), so a plain
  // wheel/touch drag would otherwise do nothing. When the user scrolls
  // manually we take over `translateY` here and stop auto-centering the
  // active line until they opt back in via the "Resume" button.
  const [autoFollow, setAutoFollow] = useState(true)
  const [manualTranslateY, setManualTranslateY] = useState(0)
  const dragRef = useRef<{ startY: number; startTranslate: number } | null>(null)

  const clampTranslate = (v: number): number => {
    const vp = viewportRef.current
    const lines = linesRef.current
    if (!vp || !lines) return Math.max(v, 0)
    const max = Math.max(0, lines.scrollHeight - vp.clientHeight)
    return Math.min(Math.max(v, 0), max)
  }

  const handleWheel = (e: React.WheelEvent): void => {
    if (!isSynced || syncedLines.length === 0) return
    e.preventDefault()
    const base = autoFollow ? translateY : manualTranslateY
    setManualTranslateY(clampTranslate(base + e.deltaY))
    if (autoFollow) setAutoFollow(false)
  }

  const handleTouchStart = (e: React.TouchEvent): void => {
    if (!isSynced || syncedLines.length === 0) return
    dragRef.current = { startY: e.touches[0].clientY, startTranslate: autoFollow ? translateY : manualTranslateY }
  }

  const handleTouchMove = (e: React.TouchEvent): void => {
    if (!dragRef.current) return
    const dy = dragRef.current.startY - e.touches[0].clientY
    setManualTranslateY(clampTranslate(dragRef.current.startTranslate + dy))
    if (autoFollow) setAutoFollow(false)
  }

  const handleTouchEnd = (): void => { dragRef.current = null }

  useLayoutEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const measure = (): void => setVpHalf(vp.clientHeight / 2)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(vp)
    return () => ro.disconnect()
  }, [isSynced, syncedLines.length])

  useLayoutEffect(() => {
    if (currentLineIdx < 0) { setTranslateY(0); return }
    const active = activeRef.current
    if (!active) return
    // offsetTop is relative to linesRef (position: relative), unaffected by the
    // transform — so this stays correct mid-animation.
    setTranslateY(active.offsetTop + active.offsetHeight / 2 - vpHalf)
  }, [currentLineIdx, vpHalf])

  // Right-click → "Download synced lyrics" — only offered for LRC-format
  // lyrics (the .lrc file needs the timestamps; plain unsynced text has
  // nothing worth exporting in that format).
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (!menuPos) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setMenuPos(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuPos])
  const handleContextMenu = (e: React.MouseEvent): void => {
    if (!isSynced || !rawLyrics) return
    e.preventDefault()
    setMenuPos({ x: e.clientX, y: e.clientY })
  }
  const downloadMenu = menuPos && rawLyrics && createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={() => setMenuPos(null)} onContextMenu={(e) => { e.preventDefault(); setMenuPos(null) }} />
      <div
        className="fixed z-50 bg-surface border border-[var(--border)] rounded-xl shadow-2xl py-1 min-w-[200px]"
        style={{ top: menuPos.y, left: menuPos.x }}
      >
        <button
          onClick={() => {
            downloadSyncedLyrics(currentTrack?.title ?? 'lyrics', currentTrack?.artist ?? '', rawLyrics)
            setMenuPos(null)
          }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-text-primary hover:bg-surface-overlay transition-colors"
        >
          <Download size={14} className="text-text-muted" /> Download synced lyrics
        </button>
      </div>
    </>,
    document.body
  )

  if (!rawLyrics) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8">
        {!radioFmActive && !currentTrack
          ? <p className="text-sm text-center" style={{ color: txtTer }}>No track playing</p>
          : radioFmActive
            ? <p className="text-sm text-center" style={{ color: txtTer }}>No lyrics found for this track</p>
            : <>
                <div className="text-5xl opacity-10">♪</div>
                <p className="text-sm text-center" style={{ color: txtTer }}>No lyrics available</p>
                {isEditor && <p className="text-xs text-center mt-1" style={{ color: txtTer }}>Open the editor to add lyrics</p>}
              </>
        }
      </div>
    )
  }

  if (isSynced && syncedLines.length > 0) {
    // Edge fade is done with a mask on the lines themselves, not an opaque
    // overlay — painting flat rgba(0,0,0,0.55) bands on top added darkness
    // confined to this panel's box, creating a visible "aura" rectangle that
    // didn't match the rest of the tab's background. A mask instead fades the
    // text to transparent, letting the page's own blurred-art background
    // show through underneath, exactly like the rest of the tab.
    const edgeMask = 'linear-gradient(to bottom, transparent, black 80px, black calc(100% - 80px), transparent)'
    const displayTranslateY = autoFollow ? translateY : manualTranslateY
    return (
      <div
        ref={viewportRef}
        className="relative flex-1 min-h-0 overflow-hidden"
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onContextMenu={handleContextMenu}
      >
        <div
          ref={linesRef}
          className={`relative flex flex-col ${padded ? 'gap-5 px-10' : 'gap-4 px-5 md:px-8'}`}
          style={{
            transform: `translateY(${-displayTranslateY}px)`,
            transition: autoFollow ? 'transform 0.6s cubic-bezier(0.22,1,0.36,1)' : 'none',
            willChange: 'transform',
            WebkitMaskImage: edgeMask,
            maskImage: edgeMask,
          }}
        >
          {/* Half-viewport spacers so the first and last lines can sit at center. */}
          <div style={{ height: vpHalf }} />
          {syncedLines.map((line, i) => {
            if (!line.text) return <div key={i} className="h-3" />
            const isActive = i === currentLineIdx
            const isPast   = i < currentLineIdx
            const dist     = Math.abs(i - currentLineIdx)
            // The active line grows via `transform: scale()`, not a literal
            // font-size change. font-size is a layout property — animating it
            // keeps reflowing this line's box (and shifting every line below
            // it) for the whole 0.4s, which raced the translateY centering
            // calculation above: that math runs once off the pre-growth
            // offsetTop/offsetHeight, so the line kept growing for a few more
            // frames after the scroll settled, reading as a sudden late pop.
            // A transform never affects layout/offsetHeight, so the centering
            // stays correct for the whole transition with no second jump.
            const baseFontSize = padded ? '1.4rem' : '1.15rem'
            const scale = isActive ? (padded ? 1.25 : 1.217) : 1
            return (
              <div
                key={i}
                ref={isActive ? activeRef : undefined}
                onClick={() => seekAudio(line.time)}
                className="cursor-pointer select-none origin-left"
                style={{
                  // The active line grows via `scale()`, anchored at its left
                  // edge (`origin-left`) so it doesn't jump around — but scale
                  // is purely visual and doesn't reflow layout, so a line
                  // already near the container's full width would have its
                  // right edge pushed past the viewport once scaled up, and
                  // get clipped by this panel's overflow-hidden. Capping each
                  // line's own width to 1/maxScale leaves enough headroom
                  // that even the largest growth (the active state) still
                  // fits.
                  maxWidth:   padded ? '80%' : '82%',
                  fontSize:   baseFontSize,
                  // Bold weight is the active line's CSS class only — not
                  // animated. Most fonts (including this app's system-font
                  // stack) aren't variable fonts, so `font-weight` can't
                  // actually interpolate between steps like 400→800; the
                  // browser just snaps partway through the transition,
                  // reading as the text suddenly going bold once the (truly
                  // smooth) scale/opacity/color animation appears to settle.
                  fontWeight: isActive ? 800 : 500,
                  lineHeight: 1.25,
                  color:      isActive ? txtPri : txtSec,
                  opacity:    isActive ? 1 : dist === 1 ? 0.55 : dist === 2 ? 0.35 : 0.2,
                  filter:     (!isActive && !isPast && dist >= 2) ? 'blur(0.6px)' : 'none',
                  transform:  `scale(${scale})`,
                  transition: 'opacity 0.4s cubic-bezier(0.4,0,0.2,1), color 0.4s cubic-bezier(0.4,0,0.2,1), transform 0.4s cubic-bezier(0.4,0,0.2,1), filter 0.4s cubic-bezier(0.4,0,0.2,1)',
                  textShadow: isActive ? '0 0 30px rgba(255,255,255,0.12)' : 'none',
                }}
              >
                {line.text}
              </div>
            )
          })}
          <div style={{ height: vpHalf }} />
        </div>

        {!autoFollow && (
          <button
            onClick={() => setAutoFollow(true)}
            className="absolute left-1/2 -translate-x-1/2 bottom-4 z-10 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-white/85 text-xs font-medium hover:bg-black/75 transition-colors"
          >
            <ChevronDown size={13} />
            Resume
          </button>
        )}
        {downloadMenu}
      </div>
    )
  }

  return (
    <div className={`flex-1 min-h-0 overflow-y-auto ${padded ? 'py-16 pr-16 pl-8' : 'py-4 px-4 md:py-8 md:pr-12 md:pl-6'}`} style={{ scrollbarWidth: 'none' }}>
      <pre className="text-xs md:text-sm leading-6 md:leading-7 whitespace-pre-wrap font-sans" style={{ color: txtSec }}>{rawLyrics}</pre>
    </div>
  )
})
