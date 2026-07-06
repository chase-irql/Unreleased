import { useEffect, useRef } from 'react'
import { Download, X, CheckCircle2, AlertCircle, Loader2, RefreshCw, FolderOpen, ArrowDownToLine } from 'lucide-react'
import { useStore, DownloadItem } from '../store/useStore'

export default function DownloadManager(): JSX.Element | null {
  const { downloads, showDownloadManager, setShowDownloadManager, addDownload, updateDownload, clearCompletedDownloads, setUpdateStatus, wrldFullscreen } = useStore()
  const el = (window as any).electron
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!el) return
    const offStarted = el.onDownloadStarted((d: { filename: string; savePath: string; total: number }) => {
      addDownload({ id: `file-${d.filename}-${Date.now()}`, filename: d.filename, type: 'file', state: 'downloading', percent: 0, total: d.total, savePath: d.savePath })
      setShowDownloadManager(true)
    })
    const offProgress = el.onDownloadProgress((d: { filename: string; received: number; total: number; percent: number }) => {
      const { downloads: cur } = useStore.getState()
      const match = [...cur].reverse().find((x) => x.filename === d.filename && x.state === 'downloading')
      if (match) updateDownload(match.id, { percent: d.percent, received: d.received, total: d.total })
    })
    const offDone = el.onDownloadDone((d: { filename: string; state: string; savePath: string }) => {
      const { downloads: cur } = useStore.getState()
      const match = [...cur].reverse().find((x) => x.filename === d.filename && x.state === 'downloading')
      if (match) updateDownload(match.id, { state: d.state === 'completed' ? 'done' : d.state === 'cancelled' ? 'cancelled' : 'error', percent: d.state === 'completed' ? 100 : match.percent, savePath: d.savePath })
    })
    const offUpdate = el.onUpdateStatus((d: { type: string; version?: string; percent?: number; message?: string }) => {
      setUpdateStatus(d)
      if (d.type === 'downloading') {
        const { downloads: cur } = useStore.getState()
        const existing = cur.find((x) => x.type === 'update')
        if (existing) updateDownload(existing.id, { percent: d.percent ?? 0, state: 'downloading' })
        else { addDownload({ id: 'update', filename: `Update${d.version ? ` v${d.version}` : ''}`, type: 'update', state: 'downloading', percent: d.percent ?? 0 }); setShowDownloadManager(true) }
      } else if (d.type === 'downloaded') {
        const existing = useStore.getState().downloads.find((x) => x.type === 'update')
        if (existing) updateDownload(existing.id, { state: 'done', percent: 100, filename: `Update v${d.version ?? ''} ready` })
      } else if (d.type === 'error') {
        const existing = useStore.getState().downloads.find((x) => x.type === 'update' && x.state === 'downloading')
        if (existing) updateDownload(existing.id, { state: 'error', error: d.message })
      }
    })
    return () => { offStarted?.(); offProgress?.(); offDone?.(); offUpdate?.() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close panel on outside click
  useEffect(() => {
    if (!showDownloadManager) return
    const handler = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setShowDownloadManager(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showDownloadManager])

  if (!el) return null
  // WRLD's immersive fullscreen hides the window-control buttons this
  // trigger is anchored next to (see App.tsx / WrldView.tsx) — with no
  // corner reference left, it just floats awkwardly, so hide it too.
  if (wrldFullscreen) return null

  const active = downloads.filter((d) => d.state === 'downloading').length
  const hasDownloads = downloads.length > 0

  return (
    <div ref={panelRef} className="fixed top-0 z-[9990]" style={{ right: '132px' }}>
      {/* Trigger icon */}
      <button
        onClick={() => setShowDownloadManager(!showDownloadManager)}
        className={`flex items-center justify-center w-9 h-7 transition-colors ${
          active > 0 ? 'text-[var(--accent)]' : hasDownloads ? 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
        }`}
        title="Downloads"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div className="relative">
          <ArrowDownToLine size={14} className={active > 0 ? 'animate-pulse' : ''} />
          {active > 0 && (
            <span className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] rounded-full bg-[var(--accent)] text-white text-[9px] font-bold flex items-center justify-center px-0.5 leading-none">
              {active}
            </span>
          )}
        </div>
      </button>

      {/* Dropdown panel */}
      {showDownloadManager && (
        <div className="absolute top-full right-0 mt-1 w-[320px] rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2.5 bg-[var(--surface-overlay)] border-b border-[var(--border)]">
            <Download size={13} className="text-[var(--accent)] shrink-0" />
            <span className="text-[var(--text-primary)] text-xs font-semibold flex-1">
              Downloads
              {active > 0
                ? <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] text-[10px] font-medium">{active} active</span>
                : downloads.length > 0
                  ? <span className="ml-1 text-[var(--text-muted)] font-normal text-[10px]">· {downloads.length}</span>
                  : null}
            </span>
            {downloads.some(d => d.state !== 'downloading') && (
              <button onClick={clearCompletedDownloads} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors px-1 rounded">
                Clear
              </button>
            )}
            <button onClick={() => setShowDownloadManager(false)} className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
              <X size={13} />
            </button>
          </div>
          {/* List */}
          <div className="max-h-72 overflow-y-auto">
            {downloads.length === 0 ? (
              <p className="text-[var(--text-muted)] text-xs text-center py-6">No downloads</p>
            ) : (
              <div className="divide-y divide-[var(--border)]/40">
                {downloads.map((item) => <DownloadRow key={item.id} item={item} />)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DownloadRow({ item }: { item: DownloadItem }): JSX.Element {
  const el = (window as any).electron
  const isDone = item.state === 'done'
  const isError = item.state === 'error' || item.state === 'cancelled'
  const isActive = item.state === 'downloading'

  const sizeLabel = item.type === 'playlist'
    ? (item.total ? `${item.received ?? 0} / ${item.total} tracks` : null)
    : item.total && item.total > 0
      ? `${fmtBytes(item.received ?? 0)} / ${fmtBytes(item.total)}`
      : item.received ? fmtBytes(item.received) : null

  return (
    <div className="px-3 py-2.5 hover:bg-[var(--surface-overlay)] transition-colors">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0">
          {isDone ? <CheckCircle2 size={13} className="text-emerald-400" />
            : isError ? <AlertCircle size={13} className="text-red-400" />
            : item.type === 'update' ? <RefreshCw size={13} className="text-[var(--accent)] animate-spin" />
            : <Loader2 size={13} className="text-[var(--accent)] animate-spin" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[var(--text-primary)] text-xs truncate leading-snug" title={item.filename}>{item.filename}</p>
          {isActive && sizeLabel && <p className="text-[var(--text-muted)] text-[10px] mt-0.5">{sizeLabel}</p>}
          {isDone && item.savePath && <p className="text-[var(--text-muted)] text-[10px] mt-0.5 truncate" title={item.savePath}>{item.savePath.split(/[/\\]/).pop()}</p>}
          {isError && item.error && <p className="text-red-400 text-[10px] mt-0.5 truncate">{item.error}</p>}
          {isActive && (
            <div className="mt-1.5 h-1 bg-[var(--surface-overlay)] rounded-full overflow-hidden">
              <div className="h-full bg-[var(--accent)] rounded-full transition-all duration-200" style={{ width: `${item.percent}%` }} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isActive && <span className="text-[var(--text-muted)] text-[10px]">{item.percent}%</span>}
          {isDone && item.savePath && el?.openPath && (
            <button onClick={() => el.openPath(item.savePath!)} title="Show in folder" className="p-1 rounded hover:bg-[var(--surface-raised)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
              <FolderOpen size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`
  return `${(b / 1073741824).toFixed(2)} GB`
}
