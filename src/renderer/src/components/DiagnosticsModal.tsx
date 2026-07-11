import { useRef } from 'react'
import { X, Info, FolderOpen } from 'lucide-react'
import { useStore } from '../store/useStore'
import { cacheStats } from '../lib/apiCache'

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

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-[var(--border)] last:border-b-0">
      <span className="text-text-muted text-xs">{label}</span>
      <span className="text-text-primary text-xs font-mono text-right truncate max-w-[60%]">{value}</span>
    </div>
  )
}

export default function DiagnosticsModal(): JSX.Element {
  const overlayRef = useRef<HTMLDivElement>(null)
  const {
    setShowDiagnostics, activeView, queue, currentTrack,
    libraryTracks, offlineTracks, theme, accentColor, audioOutput,
  } = useStore()
  const isElectron = navigator.userAgent.includes('Electron')
  const el = (window as any).electron

  const cache = cacheStats()
  const offlineCount = Object.keys(offlineTracks).length
  const lsBytes = localStorageBytes()

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) setShowDiagnostics(false) }}
    >
      <div className="bg-surface border border-[var(--border)] rounded-3xl shadow-2xl w-full max-w-[440px] mx-3 max-h-[85vh] flex flex-col overflow-hidden">
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
          <p className="text-text-muted text-[10px] font-semibold uppercase tracking-widest mb-1.5">App</p>
          <div className="mb-4">
            <Row label="Version" value={`v${__APP_VERSION__}`} />
            <Row label="Runtime" value={isElectron ? 'Electron' : 'Web'} />
            <Row label="Platform" value={el?.platform || navigator.platform || 'unknown'} />
            <Row label="Theme" value={`${theme} · ${accentColor}`} />
          </div>

          <p className="text-text-muted text-[10px] font-semibold uppercase tracking-widest mb-1.5">Playback</p>
          <div className="mb-4">
            <Row label="Active view" value={activeView} />
            <Row label="Current track" value={currentTrack ? `${currentTrack.title} (${currentTrack.id})` : 'none'} />
            <Row label="Queue length" value={String(queue.length)} />
            <Row label="Audio output" value={audioOutput || 'default'} />
          </div>

          <p className="text-text-muted text-[10px] font-semibold uppercase tracking-widest mb-1.5">Storage</p>
          <div className="mb-4">
            <Row label="API cache" value={`${cache.count} entries · ${fmtBytes(cache.bytes)}`} />
            <Row label="localStorage" value={fmtBytes(lsBytes)} />
            {isElectron && <Row label="Offline tracks" value={String(offlineCount)} />}
            {isElectron && <Row label="Library tracks" value={String(libraryTracks.length)} />}
          </div>

          <p className="text-text-muted text-[10px] font-semibold uppercase tracking-widest mb-1.5">Environment</p>
          <div className="mb-2">
            <Row label="User agent" value={navigator.userAgent} />
          </div>
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
