import { useRef } from 'react'
import { X, Info, FolderOpen } from 'lucide-react'
import { useStore, useStorePick } from '../store/useStore'
import { cacheStats } from '../lib/apiCache'
import type { Track } from '../types'

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`
  return `${(b / 1073741824).toFixed(2)} GB`
}

function localStorageBytes(): number {
  let bytes = 0
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k) continue
    bytes += (k.length + (localStorage.getItem(k)?.length ?? 0)) * 2
  }
  return bytes
}

// The filename actually being played — local tracks carry a filesystem
// `path`, API/stream tracks only have a `streamUrl` (the "file" is whatever
// the URL's last path segment resolves to).
function filenameOf(track: Track | null): string {
  if (!track) return 'none'
  if (track.path) {
    const parts = track.path.split(/[\\/]/)
    return parts[parts.length - 1] || track.path
  }
  if (track.streamUrl) {
    try {
      const u = new URL(track.streamUrl)
      const parts = u.pathname.split('/')
      return decodeURIComponent(parts[parts.length - 1] || track.streamUrl)
    } catch {
      const parts = track.streamUrl.split('/')
      return parts[parts.length - 1]
    }
  }
  return track.title
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-[var(--border)] last:border-b-0">
      <span className="text-text-muted text-xs shrink-0">{label}</span>
      <span className="text-text-primary text-xs font-mono text-right truncate max-w-[62%]" title={value}>{value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="mb-4">
      <p className="text-text-muted text-[10px] font-semibold uppercase tracking-widest mb-1.5">{title}</p>
      {children}
    </div>
  )
}

export default function DiagnosticsModal(): JSX.Element {
  const overlayRef = useRef<HTMLDivElement>(null)
  const {
    setShowDiagnostics, activeView, queue, queueIndex, currentTrack, currentTrackFull,
    isPlaying, progress, currentTime, shuffle, repeat, volume, playbackSpeed,
    crossfadeEnabled, crossfadeDuration, preferOgVersion, lyricsOffset,
    libraryTracks, libraryFolders, offlineTracks, offlinePlaylists,
    theme, accentColor, audioOutput, radioFmActive,
    account, playlists, likedTrackIds, downloads, updateStatus,
  } = useStorePick('setShowDiagnostics', 'activeView', 'queue', 'queueIndex', 'currentTrack', 'currentTrackFull', 'isPlaying', 'progress', 'currentTime', 'shuffle', 'repeat', 'volume', 'playbackSpeed', 'crossfadeEnabled', 'crossfadeDuration', 'preferOgVersion', 'lyricsOffset', 'libraryTracks', 'libraryFolders', 'offlineTracks', 'offlinePlaylists', 'theme', 'accentColor', 'audioOutput', 'radioFmActive', 'account', 'playlists', 'likedTrackIds', 'downloads', 'updateStatus')
  const isElectron = navigator.userAgent.includes('Electron')
  const el = (window as any).electron

  const cache = cacheStats()
  const offlineCount = Object.keys(offlineTracks).length
  const offlinePlaylistCount = Object.keys(offlinePlaylists).length
  const lsBytes = localStorageBytes()
  const mem = (performance as any).memory as { usedJSHeapSize: number; totalJSHeapSize: number } | undefined

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) setShowDiagnostics(false) }}
    >
      <div className="bg-surface border border-[var(--border)] rounded-3xl shadow-2xl w-full max-w-[480px] mx-3 h-[600px] max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2">
            <Info size={16} className="text-accent" />
            <h2 className="text-text-primary font-black text-lg tracking-tight">Diagnostics</h2>
          </div>
          <button onClick={() => setShowDiagnostics(false)} className="text-text-muted hover:text-text-primary transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <Section title="App">
            <Row label="Version" value={`v${__APP_VERSION__}`} />
            <Row label="Runtime" value={isElectron ? 'Electron' : 'Web'} />
            <Row label="Platform" value={el?.platform || navigator.platform || 'unknown'} />
            <Row label="Theme" value={`${theme} · ${accentColor}`} />
            <Row label="Active view" value={activeView} />
            <Row label="Online" value={navigator.onLine ? 'yes' : 'no'} />
          </Section>

          <Section title="Now playing">
            <Row label="Filename" value={filenameOf(currentTrack)} />
            <Row label="Title" value={currentTrack?.title || 'none'} />
            <Row label="Track ID" value={currentTrack?.id || 'none'} />
            <Row label="Source" value={currentTrack ? (currentTrack.streamUrl ? 'stream' : 'local file') : 'none'} />
            {currentTrack?.streamUrl && <Row label="Stream URL" value={currentTrack.streamUrl} />}
            {currentTrack?.path && <Row label="Path" value={currentTrack.path} />}
            <Row label="Playing" value={isPlaying ? 'yes' : 'no'} />
            <Row label="Position" value={`${currentTime.toFixed(1)}s / ${currentTrack?.duration?.toFixed(1) ?? '?'}s`} />
            <Row label="Progress" value={`${(progress * 100).toFixed(1)}%`} />
            {currentTrackFull && (
              <>
                <Row label="Format" value={currentTrackFull.ext || (currentTrack?.streamUrl ? 'streamed' : 'unknown')} />
                <Row label="Bitrate" value={currentTrackFull.bitrate ? `${currentTrackFull.bitrate} kbps` : (currentTrack?.streamUrl ? 'n/a (streamed)' : 'unknown')} />
                <Row label="Sample rate" value={currentTrackFull.sampleRate ? `${currentTrackFull.sampleRate} Hz` : (currentTrack?.streamUrl ? 'n/a (streamed)' : 'unknown')} />
                <Row label="Bit depth" value={currentTrackFull.bitsPerSample ? `${currentTrackFull.bitsPerSample}-bit` : (currentTrack?.streamUrl ? 'n/a (streamed)' : 'unknown')} />
                <Row label="Channels" value={currentTrackFull.channels ? String(currentTrackFull.channels) : (currentTrack?.streamUrl ? 'n/a (streamed)' : 'unknown')} />
                <Row label="File size" value={currentTrackFull.fileSize ? fmtBytes(currentTrackFull.fileSize) : (currentTrack?.streamUrl ? 'n/a (streamed)' : 'unknown')} />
              </>
            )}
          </Section>

          <Section title="Playback">
            <Row label="Queue length" value={String(queue.length)} />
            <Row label="Queue index" value={String(queueIndex)} />
            <Row label="Shuffle" value={shuffle ? 'on' : 'off'} />
            <Row label="Repeat" value={repeat} />
            <Row label="Volume" value={`${Math.round(volume * 100)}%`} />
            <Row label="Speed" value={`${playbackSpeed.toFixed(2)}x`} />
            <Row label="Crossfade" value={crossfadeEnabled ? `${crossfadeDuration}s` : 'off'} />
            <Row label="Prefer OG version" value={preferOgVersion ? 'on' : 'off'} />
            <Row label="Lyrics offset" value={`${lyricsOffset > 0 ? '+' : ''}${lyricsOffset.toFixed(1)}s`} />
            <Row label="Audio output" value={audioOutput || 'default'} />
            <Row label="Radio FM active" value={radioFmActive ? 'yes' : 'no'} />
          </Section>

          <Section title="Account">
            <Row label="Logged in" value={account ? 'yes' : 'no'} />
            {account && <Row label="User" value={account.display_name || account.discord_username} />}
            {account && <Row label="Role" value={account.is_administrator ? 'administrator' : account.is_editor ? 'editor' : 'standard'} />}
            <Row label="Playlists" value={String(playlists.length)} />
            <Row label="Liked songs" value={String(likedTrackIds.length)} />
          </Section>

          <Section title="Storage">
            <Row label="API cache" value={`${cache.count} entries · ${fmtBytes(cache.bytes)}`} />
            <Row label="localStorage" value={fmtBytes(lsBytes)} />
            {isElectron && <Row label="Library folders" value={String(libraryFolders.length)} />}
            {isElectron && <Row label="Library tracks" value={String(libraryTracks.length)} />}
            {isElectron && <Row label="Offline tracks" value={String(offlineCount)} />}
            {isElectron && <Row label="Offline playlists" value={String(offlinePlaylistCount)} />}
            {mem && <Row label="JS heap" value={`${fmtBytes(mem.usedJSHeapSize)} / ${fmtBytes(mem.totalJSHeapSize)}`} />}
          </Section>

          {isElectron && (
            <Section title="Updates">
              <Row label="Status" value={updateStatus?.type || 'idle'} />
              {updateStatus?.version && <Row label="Version" value={updateStatus.version} />}
              <Row label="Active downloads" value={String(downloads.filter(d => d.state === 'downloading').length)} />
              <Row label="Downloads (session)" value={String(downloads.length)} />
            </Section>
          )}

          <Section title="Environment">
            <Row label="Screen" value={`${window.screen.width}×${window.screen.height}`} />
            <Row label="Viewport" value={`${window.innerWidth}×${window.innerHeight}`} />
            <Row label="Pixel ratio" value={String(window.devicePixelRatio)} />
            <Row label="Language" value={navigator.language} />
            <Row label="User agent" value={navigator.userAgent} />
          </Section>
        </div>

        {isElectron && (
          <div className="px-6 py-3 border-t border-[var(--border)] shrink-0">
            <button
              onClick={() => el?.openLogsFolder?.()}
              className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors px-3 py-1.5 rounded-lg bg-[var(--surface-overlay)] hover:bg-[var(--surface-raised)] border border-[var(--border)]"
            >
              <FolderOpen size={13} />
              Open logs
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
