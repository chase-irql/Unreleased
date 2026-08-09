import { useEffect, useLayoutEffect, useRef, useMemo, useState, memo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Music, Radio, Search, SkipForward, ThumbsUp, ThumbsDown, X, ChevronDown, Play, Pause, SkipBack, SkipForward as SkipFwd, Shuffle, Repeat, Repeat1, Volume2, VolumeX, MoreHorizontal, Info, Heart, Maximize2, Minimize2, PictureInPicture2, ListMusic, GripVertical, Trash2, Check, Download, History, SlidersHorizontal } from 'lucide-react'
import { useStore, useStorePick } from '../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { parseLrc, getCurrentLineIndex, isLrcFormat, downloadSyncedLyrics } from '../lib/lyrics'
import { formatDuration } from '../lib/format'
import { seekAudio, getAudioDuration, getAudioCurrentTime } from './Player'
import { buildImageUrl, apiFetch, songToTrack, smallCoverUrl } from '../lib/juicewrldApi'
import { getActiveRadioClient } from '../lib/radioSocketService'
import { resumeEffectsContext } from '../lib/audioEffects'
import { getVersionGroup } from '../lib/versionsApi'
import type { JWApiSong } from '../lib/juicewrldApi'
import * as userApi from '../lib/userApi'
import SongInfoModal from './SongInfoModal'
import { AlbumArtThumbnail } from './AlbumArtThumbnail'
import { ProgressiveCover } from './ProgressiveCover'
import SongContextMenu from './SongContextMenu'
import { getSkin } from '../lib/skins'

export default function WrldView(): JSX.Element {
  const {
    currentTrack, currentTrackFull, account, theme,
    radioFmActive, setRadioFmActive, radioFmIsLive, radioFmNowPlaying,
    radioFmVote, radioFmUpNext, radioFmQueuePreview,
    radioFmMatchedSong,
    playTrack,
    isPlaying, setIsPlaying, volume, setVolume,
    shuffle, repeat, toggleShuffle, toggleRepeat,
    nextTrack, prevTrack,
    showQueue, setShowQueue,
    audioOutput, setAudioOutput,
    toggleEqPanel, eqFxActive,
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
    toggleEqPanel: s.toggleEqPanel,
    // Same "anything non-neutral" indicator as the player bar's EQ button.
    eqFxActive: s.eqEnabled || s.playbackSpeed !== 1 || s.eqBalance !== 0 || s.eqMono || s.skipSilence || s.reverbEnabled,
  })))

  // Skins beyond the classic pair mean `theme === 'dark'` no longer covers
  // "is this a dark look" — Ocean, Mocha, etc. need the dark treatment too.
  const isDarkSkin = getSkin(theme).dark

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
  // The portal root, so the Escape handler below can tell "the fullscreen view
  // is the top layer" from "a modal/popover is stacked on top of it".
  const fsOverlayRef = useRef<HTMLDivElement>(null)
  const enterFullscreen = (): void => {
    document.documentElement.requestFullscreen?.().catch(() => {})
    setFullscreen(true)
  }
  const exitFullscreen = (): void => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    setFullscreen(false)
  }

  // Keep React state in sync when fullscreen is entered/exited by something
  // other than our own button — the WebView's own Escape-exits-fullscreen
  // behavior, or an OS gesture.
  useEffect(() => {
    const onChange = (): void => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // If this page unmounts (navigating away) while still fullscreen, leave
  // real OS/browser fullscreen too — otherwise the window would be stuck
  // fullscreen with no obvious way back once the WRLD-specific toggle is gone.
  useEffect(() => () => {
    if (!fullscreenRef.current) return
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
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
  const [proposeError, setProposeError]     = useState<string | null>(null)
  const [textIsDark, setTextIsDark]          = useState(false)
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const proposeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    // Only confirm if the proposal actually went out over the socket — a
    // closed/absent connection used to still flash "Proposed" while nothing
    // was ever sent.
    const sent = getActiveRadioClient()?.proposeQueue(song.id) ?? false
    const name = song.track_titles?.[0] || song.name
    setSuggestQuery('')
    setSuggestResults([])
    if (proposeTimer.current) clearTimeout(proposeTimer.current)
    if (sent) {
      setProposeError(null)
      setProposed(name)
      proposeTimer.current = setTimeout(() => setProposed(null), 4000)
    } else {
      setProposed(null)
      setProposeError('Not connected to 999 FM — try again in a moment')
      proposeTimer.current = setTimeout(() => setProposeError(null), 4000)
    }
  }

  const artSrc = radioFmActive
    ? (radioFmMatchedSong?.imageUrl ?? buildImageUrl(radioFmNowPlaying?.image_url) ?? null)
    : (buildImageUrl(currentTrackFull?.albumArt ?? currentTrack?.imageUrl ?? null) ?? null)

  useEffect(() => { setArtError(false) }, [artSrc])

  // Sibling versions of the currently playing song (v1/v2/TV Mix/etc, linked
  // via juicewrldapi's /versions/ table — see versionsApi.ts), shown as
  // a single notch menu next to the cover art.
  const [songVersions, setSongVersions] = useState<{ songId: number; label: string | null }[]>([])
  const [songVersionMenuOpen, setSongVersionMenuOpen] = useState(false)
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
      setTextIsDark(!isDarkSkin && !radioFmActive)
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
        const factor = isDarkSkin ? 0.22 : 0.45
        setTextIsDark(avg * factor > 90)
      } catch { setTextIsDark(false) }
    }
    img.onerror = () => setTextIsDark(false)
    img.src = artSrc
  }, [artSrc, artError, isDarkSkin, radioFmActive])

  const rawLyrics = radioFmActive
    ? (radioFmMatchedSong?.syncedLyrics || radioFmMatchedSong?.lyrics || null)
    : (currentTrackFull?.syncedLyrics || currentTrackFull?.lyrics || null)
  const isSynced  = rawLyrics ? isLrcFormat(rawLyrics) : false
  const isEditor  = account?.is_editor || account?.is_administrator

  const txtPri   = textIsDark ? 'rgba(0,0,0,0.85)'  : 'rgba(255,255,255,1)'
  const txtSec   = textIsDark ? 'rgba(0,0,0,0.5)'   : 'rgba(255,255,255,0.5)'
  const txtTer   = textIsDark ? 'rgba(0,0,0,0.35)'  : 'rgba(255,255,255,0.3)'
  const txtFaint = textIsDark ? 'rgba(0,0,0,0.22)'  : 'rgba(255,255,255,0.2)'

  const syncedLines = useMemo(() => {
    if (rawLyrics && isSynced) return parseLrc(rawLyrics)
    return []
  }, [rawLyrics, isSynced])

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

  // ArtBox / FmRadioPanel are rendered via plain function calls, NOT <JSX/>
  // element syntax: they're (re)defined on every WrldView render, so as JSX
  // components React would see a brand-new type each time and unmount/
  // remount their whole subtree — album art re-decoded and flickered, and
  // any internal DOM/menu state was lost on every parent re-render. As plain
  // calls they're just part of this component's own tree.
  // (Corollary: they must not contain hooks of their own.)
  const ArtBox = ({ mobile }: { mobile: boolean }) => (
    <div
      className={mobile
        ? 'w-14 h-14 rounded-xl overflow-hidden shrink-0 shadow-lg'
        : 'rounded-3xl overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.8)] w-full'}
      style={mobile ? {} : { aspectRatio: '1' }}
    >
      {artSrc && !artError ? (
        // The mobile box is 56px, so the degraded cover is all it ever needs;
        // the desktop box is the biggest cover in the app and loads the full
        // one behind a degraded first paint.
        mobile
          ? <img src={smallCoverUrl(artSrc)} alt="Album art" className="w-full h-full object-cover" onError={() => setArtError(true)} />
          : <ProgressiveCover src={artSrc} alt="Album art" className="w-full h-full object-cover" onError={() => setArtError(true)} />
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
            {proposeError && (
              <p className="text-red-400/80 text-xs pl-1">{proposeError}</p>
            )}
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
                    <p className="text-white/70 text-sm truncate group-hover:text-white/90 transition-colors" title={song.track_titles?.[0] || song.name}>
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
            <p className="text-white/80 text-sm font-medium truncate" title={radioFmUpNext.title}>{radioFmUpNext.title}</p>
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
                <p className="text-white/50 text-sm truncate" title={title}>{title}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  // LyricsPanel is now a module-level component (see below WrldView) — call via JSX.

  // ── Render ────────────────────────────────────────────────────────────────────

  const inner = (
    <div className="relative flex flex-col md:flex-row flex-1 h-full w-full overflow-hidden">

      {/* 999 FM toggle + fullscreen toggle, grouped together so they move as
          one unit — 999FM sits top-right on mobile, top-left on desktop
          (md:), and fullscreen now rides along right next to it instead of
          living in its own corner. */}
      {/* The status-bar inset is only this component's problem in fullscreen,
          where the portal (fixed inset-0) escapes the app shell and this sits
          at a flat 12px from the CSS viewport's top edge — physically under
          the system status bar, where touches never reach the WebView at all
          (confirmed via a document-level capture listener that never saw the
          pointerdown), not merely overlapping it. In normal (in-flow) mode
          <main> has already absorbed the same inset, so adding it again here
          would push these buttons down by twice the notch height. */}
      <div className={`absolute z-30 flex items-center gap-2 right-3 md:top-4 md:left-4 md:right-auto ${
        fullscreen ? 'top-[max(0.75rem,calc(0.75rem+env(safe-area-inset-top,0px)))]' : 'top-2'
      }`}>
        <button
          onClick={() => {
            const next = !radioFmActive
            if (next) {
              setIsPlaying(false)
              resumeEffectsContext()
              void getActiveRadioClient()?.startListening()?.catch(() => setRadioFmActive(false))
            } else {
              getActiveRadioClient()?.stopListening()
            }
            setRadioFmActive(next)
          }}
          disabled={fmDisabled}
          className={`flex items-center gap-2 text-xs font-medium rounded-full px-3 py-1 md:py-1.5 transition-all disabled:opacity-40
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

        <button
          onClick={() => (fullscreen ? exitFullscreen() : enterFullscreen())}
          className="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center rounded-full transition-all border bg-white/60 dark:bg-black/25 border-black/10 dark:border-white/10 text-black/70 dark:text-white/50 hover:text-black dark:hover:text-white/90 hover:bg-white/80 dark:hover:bg-black/50 backdrop-blur-sm shadow-sm"
          title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={13} />}
        </button>
      </div>

      <>
          {/* Blurred background */}
          <div className="absolute inset-0 overflow-hidden">
            {artSrc && !artError ? (
              // Blurred to 60px, so resolution is meaningless here — always the
              // degraded copy, which also gets the backdrop up on the first frame.
              <img src={smallCoverUrl(artSrc)} alt=""
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: `blur(60px) brightness(${isDarkSkin ? 0.22 : 0.45}) saturate(${isDarkSkin ? 2.4 : 1.8})`, transform: 'scale(1.2)' }}
                onError={() => setArtError(true)}
              />
            ) : (
              <div className={`absolute inset-0 ${radioFmActive ? 'bg-gradient-to-br from-red-950/60 to-black dark:from-red-950/60 dark:to-black' : 'bg-gradient-to-br from-gray-200 to-gray-100 dark:from-gray-900 dark:to-black'}`} />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/20 dark:from-black/40 dark:via-transparent dark:to-black/70" />
          </div>

          {/* Mobile layout */}
          <div className="md:hidden relative z-10 flex flex-col h-full min-h-0">

            {/* Header: art + title. pt-9 clears the pinned 999FM/fullscreen
                buttons above (top-2 + their ~28px height) with a little
                breathing room — it used to be pt-12, sized for a taller
                button pair, which on top of <main>'s own safe-area padding
                left a noticeably dead gap under the status bar. */}
            <div className="flex items-center gap-3 px-4 pt-9 pb-3 shrink-0">
              {ArtBox({ mobile: true })}
              <div className="flex-1 min-w-0">
                {displayTitle  && <p className="font-bold text-sm leading-tight truncate" style={{ color: txtPri }} title={displayTitle}>{displayTitle}</p>}
                {displayArtist && <p className="text-xs mt-0.5 truncate" style={{ color: txtSec }}>{displayArtist}</p>}
                {displayAlbum  && <p className="text-xs mt-0.5 truncate" style={{ color: txtTer }}>{displayAlbum}</p>}
                {radioFmActive && !radioFmNowPlaying && <p className="text-xs mt-0.5" style={{ color: txtTer }}>Tuning in…</p>}
              </div>
              {!radioFmActive && (
                <button
                  onClick={() => setShowQueue(!showQueue)}
                  aria-label="Playing Next"
                  aria-pressed={showQueue}
                  className="rounded-full transition-colors hover:bg-white/10 w-11 h-11 md:w-auto md:h-auto flex items-center justify-center md:p-1.5"
                  style={{ color: showQueue ? 'var(--accent)' : (textIsDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.55)') }}
                >
                  <ListMusic size={18} />
                </button>
              )}
              <FmLikeButton light={textIsDark} />
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
                  onClick={toggleEqPanel}
                  title="Equalizer"
                  className="shrink-0 transition-opacity hover:opacity-70"
                  style={{ color: eqFxActive ? 'var(--accent)' : txtTer }}
                >
                  <SlidersHorizontal size={16} />
                </button>
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
                this, the version menu popping out past this column's edge
                was making the browser grow a horizontal scrollbar, which
                shifted the whole column up by its height. */}
            <div className="relative flex flex-col items-center justify-center shrink-0 px-8 xl:px-12 gap-5 overflow-y-auto overflow-x-hidden"
              style={{ width: '50%', minWidth: 320 }}>

              {/* Album art */}
              <div className="relative w-full" style={{ maxWidth: 320 }}>
                {ArtBox({ mobile: false })}
                {!radioFmActive && songVersions.length > 0 && (
                  <div className="absolute right-full top-1/2 -translate-y-1/2 z-20">
                    {/* Flush against the art's left edge rather than centered
                        on it — only the half that pokes out past the cover is
                        drawn (rounded-l-full, flat edge against the art),
                        instead of a full pill floating half on top of it. */}
                    <button
                      onClick={() => setSongVersionMenuOpen(o => !o)}
                      title="Other versions"
                      className={`w-4 h-9 flex items-center justify-center rounded-l-full bg-white/15 dark:bg-white/[0.08] backdrop-blur-xl backdrop-saturate-150 border-y border-l shadow-lg transition-colors ${
                        songVersionMenuOpen ? 'border-white/40 dark:border-white/15' : 'border-white/20 dark:border-white/10'
                      }`}
                    >
                      <span className="w-[2px] h-4 bg-white/60" />
                    </button>
                    <div className="fixed inset-0 z-10" onClick={() => setSongVersionMenuOpen(false)} style={{ pointerEvents: songVersionMenuOpen ? 'auto' : 'none' }} />
                    <div
                      className={`absolute right-full top-1/2 -translate-y-1/2 mr-3 z-20 min-w-[120px] origin-right bg-black/95 backdrop-blur-xl rounded-lg border border-white/10 overflow-hidden py-1 shadow-2xl transition-all duration-200 ease-out ${
                        songVersionMenuOpen
                          ? 'opacity-100 scale-100 translate-x-0'
                          : 'opacity-0 scale-90 translate-x-2 pointer-events-none'
                      }`}
                    >
                      {songVersions.map((v, i) => (
                        <button
                          key={v.songId}
                          onClick={() => { setSongVersionMenuOpen(false); handlePlayVersion(v.songId) }}
                          className="w-full px-3 py-1.5 text-left text-[10px] font-medium text-white/70 hover:text-white/95 hover:bg-white/[0.08] transition-colors whitespace-nowrap"
                        >
                          {v.label ?? `Version ${i + 1}`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Title + artist */}
              <div className="w-full px-1" style={{ maxWidth: 320 }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {displayTitle  && <p className="font-bold text-xl leading-tight truncate" style={{ color: txtPri }} title={displayTitle}>{displayTitle}</p>}
                    {displayArtist && <p className="text-sm mt-0.5 truncate" style={{ color: txtSec }}>{displayArtist}</p>}
                    {radioFmActive && !radioFmNowPlaying && <p className="text-sm mt-0.5" style={{ color: txtTer }}>Tuning in…</p>}
                  </div>
                  {!radioFmActive && (
                    <button
                      onClick={() => setShowQueue(!showQueue)}
                      aria-label="Playing Next"
                      aria-pressed={showQueue}
                      className="rounded-full transition-colors hover:bg-white/10 w-11 h-11 md:w-auto md:h-auto flex items-center justify-center md:p-1.5"
                      style={{ color: showQueue ? 'var(--accent)' : (textIsDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.55)') }}
                    >
                      <ListMusic size={18} />
                    </button>
                  )}
                  <FmLikeButton light={textIsDark} />
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
                    onClick={toggleEqPanel}
                    title="Equalizer"
                    className="shrink-0 transition-opacity hover:opacity-70"
                    style={{ color: eqFxActive ? 'var(--accent)' : txtTer }}
                  >
                    <SlidersHorizontal size={14} />
                  </button>
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
                <div className="h-full flex items-stretch justify-center px-6 xl:px-10 py-7">
                  <div className="w-full max-w-[440px] h-full animate-wrld-queue-in">
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
    // Portaled to <body> so it covers the sidebar/nav instead of being
    // squeezed into the normal content column. z-30 is deliberately LOW: the
    // portal only has to out-stack the app chrome (nothing there goes above
    // z-20), and every overlay in the app — the EQ popover, Settings,
    // pickers, context menus, modals — sits at z-40 or higher. Parking this
    // at z-[150] like it used to meant all of those opened *behind* the
    // fullscreen view and looked broken. The view's own internal z-indexes
    // are unaffected: the positioned portal root is their stacking context.
    return createPortal(
      <div ref={fsOverlayRef} className="fixed inset-0 z-30 bg-black">{inner}</div>,
      document.body,
    )
  }
  return inner
}

// ── ProgressBar — module-level so currentTime ticks don't re-render WrldView ──

import { memo as _memo2, useRef as _useRef2, useCallback as _cb2 } from 'react'
// (re-exports already imported above; using same imports)

// One-click "like" for the 999 FM now-playing track. FM is server-driven and
// only hands us title/artist, so the likeable target is the resolved song id
// (stream metadata's song_id, or RadioFmPlayer's title-search fallback match).
// Reuses the same `jw-<id>` track id / toggleLike path as every other API song,
// so it lands in Liked Songs identically. Rendered in the WRLD header next to
// SongMenu; self-hides off FM or until the broadcast resolves to a known song.
const FmLikeButton = memo(function FmLikeButton({ light }: { light: boolean }): JSX.Element {
  const { radioFmActive, radioFmNowPlaying, radioFmMatchedSong, likedTrackIds, toggleLike } = useStore(useShallow(s => ({
    radioFmActive: s.radioFmActive,
    radioFmNowPlaying: s.radioFmNowPlaying,
    radioFmMatchedSong: s.radioFmMatchedSong,
    likedTrackIds: s.likedTrackIds,
    toggleLike: s.toggleLike,
  })))

  const fmSongId = radioFmActive ? (radioFmNowPlaying?.song_id ?? radioFmMatchedSong?.songId ?? null) : null
  if (fmSongId == null) return <></>

  const liked = likedTrackIds.includes(`jw-${fmSongId}`)
  return (
    <button
      onClick={() => toggleLike(`jw-${fmSongId}`)}
      title={liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
      aria-label={liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
      aria-pressed={liked}
      className="rounded-full transition-colors hover:bg-white/10 shrink-0 w-11 h-11 md:w-auto md:h-auto flex items-center justify-center md:p-1.5"
      style={{ color: liked ? 'var(--accent)' : (light ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.55)') }}
    >
      <Heart size={18} fill={liked ? 'currentColor' : 'none'} />
    </button>
  )
})

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
        aria-label="More options"
        className="rounded-full transition-colors hover:bg-white/10 w-11 h-11 md:w-auto md:h-auto flex items-center justify-center md:p-1.5"
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
          liked={likedTrackIds.includes(`jw-${fmSongId}`)}
          onToggleLike={() => toggleLike(`jw-${fmSongId}`)}
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
const WRLD_MAX_HISTORY_SHOWN = 10 // matches QueuePanel's MAX_HISTORY_SHOWN
const WrldQueuePanel = memo(function WrldQueuePanel({ onClose, variant }: {
  onClose: () => void
  // 'inline' pops up directly under the interface column on desktop (the
  // Apple Music behavior this is modeled on); 'sheet' is a full-screen
  // overlay, used on mobile where there's no side-by-side room for it;
  // 'panel' fills the desktop right column in place of the lyrics view.
  variant: 'inline' | 'sheet' | 'panel'
}): JSX.Element {
  const { queue, queueIndex, currentTrack, isPlaying, shuffle, radioMode, playTrack, jumpToTrack, removeFromQueue, clearQueue, reorderQueue } = useStore(useShallow(s => ({
    queue: s.queue,
    queueIndex: s.queueIndex,
    currentTrack: s.currentTrack,
    isPlaying: s.isPlaying,
    shuffle: s.shuffle,
    radioMode: s.radioMode,
    playTrack: s.playTrack,
    jumpToTrack: s.jumpToTrack,
    removeFromQueue: s.removeFromQueue,
    clearQueue: s.clearQueue,
    reorderQueue: s.reorderQueue,
  })))

  const history = queue.slice(0, queueIndex) // played tracks, oldest first
  const upcoming = queue.slice(queueIndex + 1)
  const [historyOpen, setHistoryOpen] = useState(false)
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
          : variant === 'panel' ? 'w-full h-full rounded-2xl ring-1 ring-white/[0.09] shadow-[0_28px_80px_-12px_rgba(0,0,0,0.7)]'
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
      {/* Soft top sheen — reads as light catching the top edge of the glass. */}
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/[0.07] to-transparent pointer-events-none" />

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
        {/* ── History ── (collapsible, above now playing — same behavior as
            the app-wide QueuePanel's history section, restyled for this
            panel's glass theme). During radio the queue holds *only* played
            history, so without this the panel looked empty in radio mode. */}
        {history.length > 0 && (
          <div className="px-3 pt-3 pb-1">
            <button
              onClick={() => setHistoryOpen((o) => !o)}
              className="flex items-center gap-1.5 px-1 mb-1 text-white/50 hover:text-white/80 transition-colors w-full text-left"
            >
              <History size={11} />
              <span className="text-[10px] uppercase tracking-widest flex-1 font-semibold">
                History · {history.length}
              </span>
              <ChevronDown size={12} className={`transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
            </button>
            {historyOpen && (
              <div className="opacity-60">
                {[...history].reverse().slice(0, WRLD_MAX_HISTORY_SHOWN).map((track, i) => (
                  <WrldQueueRow
                    key={`hist-${track.id}-${i}`}
                    track={track}
                    isActive={false}
                    isPlaying={false}
                    onPlay={() => radioMode ? jumpToTrack(track) : playTrack(track)}
                  />
                ))}
                {history.length > WRLD_MAX_HISTORY_SHOWN && (
                  <p className="text-white/40 text-[10px] text-center py-1">
                    +{history.length - WRLD_MAX_HISTORY_SHOWN} older
                  </p>
                )}
              </div>
            )}
          </div>
        )}

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
                className={`wrld-q-row transition-transform ${dragOverIdx === i && dragIdx !== i ? 'translate-y-0.5 opacity-70' : ''} ${dragIdx === i ? 'opacity-30' : ''}`}
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
      // This row is shared by the mobile queue sheet (WrldQueuePanel
      // variant="sheet", reachable via the queue-toggle button) as well as
      // the desktop panel/inline variants — double-click has no touch
      // equivalent, so tap-to-play is needed for the mobile case.
      onClick={() => { if (window.matchMedia('(max-width: 767px)').matches && onPlay && !isActive) onPlay() }}
    >
      {showDrag ? (
        <div className="text-white/40 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing shrink-0 transition-opacity">
          <GripVertical size={13} />
        </div>
      ) : (
        <div className="w-3.5 shrink-0" />
      )}
      <div className="w-9 h-9 rounded shrink-0 overflow-hidden bg-white/[0.06]">
        <AlbumArtThumbnail track={track} size={36} fill className="w-full h-full" shimmer={false} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium truncate leading-tight ${isActive ? 'text-accent' : 'text-white/85'}`} title={track.title}>{track.title}</p>
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
          // Was opacity-0 group-hover:opacity-100 with no touch equivalent —
          // invisible in the mobile queue sheet, not just the desktop panel.
          <button
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            aria-label="Remove from queue"
            className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-white/40 hover:text-red-400 transition-all ml-1 w-8 h-8 md:w-auto md:h-auto flex items-center justify-center md:p-0.5"
          >
            <X size={14} className="md:w-[11px] md:h-[11px]" />
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

  const durationMs = radioFmNowPlaying?.duration_ms ?? 0
  const pct = durationMs > 0 ? Math.min(100, (elapsedMs / durationMs) * 100) : 0

  return (
    <div className="w-full flex flex-col gap-1.5 select-none">
      <div className="relative h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.18)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: txtPri }} />
      </div>
      <div className="flex justify-between">
        <span className="text-[10px] tabular-nums" style={{ color: txtTer }}>{formatDuration(elapsedMs / 1000)}</span>
        <span className="text-[10px] tabular-nums" style={{ color: txtTer }}>{durationMs > 0 ? formatDuration(durationMs / 1000) : '-∞'}</span>
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
        // touch-none: without touch-action:none the browser claims the drag as
        // a scroll/pan gesture and the bar never gets to scrub (why dragging to
        // seek did nothing on mobile). Paired with the onTouchStart handler.
        className="relative h-1 rounded-full cursor-pointer group/bar touch-none"
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
        onTouchStart={e => {
          const startPct = pctFromClientX(e.touches[0].clientX)
          if (startPct !== null) setDragPct(startPct)
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
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: txtPri }} />
        <div
          className="absolute top-1/2 w-3 h-3 rounded-full shadow-lg opacity-0 group-hover/bar:opacity-100 transition-opacity pointer-events-none"
          style={{ left: `${pct}%`, transform: 'translate(-50%, -50%)', background: txtPri }}
        />
      </div>
      <div className="flex justify-between">
        <span className="text-[10px] tabular-nums" style={{ color: txtTer }}>{formatDuration(displayTime)}</span>
        <span className="text-[10px] tabular-nums" style={{ color: txtTer }}>{duration > 0 ? `-${formatDuration(remaining)}` : '-∞'}</span>
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
  const { lyricsScale, lyricsAlign, lyricsBlur } = useStorePick('lyricsScale', 'lyricsAlign', 'lyricsBlur')

  // Driven by requestAnimationFrame against the LIVE audio.currentTime rather
  // than the Zustand-stored value (which only updates on the native
  // 'timeupdate' event, ~4x/sec) — that throttling is what made the active
  // line snap every ~250ms instead of transitioning smoothly.
  // Lazily computed from the live audio position (not just -1) so that a
  // remount — e.g. entering/exiting fullscreen re-parents this panel through
  // a portal, which fully unmounts and remounts it — doesn't momentarily
  // render with no active line (translateY snaps to 0 / the first line)
  // before the next rAf tick corrects it. That produced a visible "jump to
  // the top, then glide back down" flash on every fullscreen toggle.
  const [currentLineIdx, setCurrentLineIdx] = useState(() =>
    isSynced && syncedLines.length > 0
      ? getCurrentLineIndex(syncedLines, getAudioCurrentTime() - lyricsOffset)
      : -1
  )
  const lineIdxRef = useRef(currentLineIdx)

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
    // transform — so this stays correct mid-animation. lyricsScale is a dep
    // because changing the text size reflows every line's offsetTop.
    setTranslateY(active.offsetTop + active.offsetHeight / 2 - vpHalf)
  }, [currentLineIdx, vpHalf, lyricsScale])

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
            const baseFontSize = `${(padded ? 1.4 : 1.15) * lyricsScale}rem`
            const scale = isActive ? (padded ? 1.25 : 1.217) : 1
            return (
              <div
                key={i}
                ref={isActive ? activeRef : undefined}
                onClick={() => seekAudio(line.time)}
                className={`cursor-pointer select-none ${lyricsAlign === 'center' ? 'origin-center mx-auto text-center' : 'origin-left'}`}
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
                  fontFamily: 'var(--font-lyrics)',
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
                  filter:     (!isActive && !isPast && dist >= 2 && lyricsBlur) ? 'blur(0.6px)' : 'none',
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
      <pre
        className="text-xs md:text-sm leading-6 md:leading-7 whitespace-pre-wrap"
        style={{
          color: txtSec,
          fontFamily: 'var(--font-lyrics)',
          textAlign: lyricsAlign,
          // Only override the responsive size classes when the user actually
          // changed the size; unitless line-height keeps spacing proportional.
          ...(lyricsScale !== 1 ? { fontSize: `${0.875 * lyricsScale}rem`, lineHeight: 1.9 } : {}),
        }}
      >{rawLyrics}</pre>
    </div>
  )
})
