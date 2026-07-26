import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Link2, Loader2, Check, AlertCircle, Folder, Wrench, Download } from 'lucide-react'
import { useStore } from '../store/useStore'
import { broadcastLibraryTrackAdd } from '../lib/windowSync'
import { LibraryTrack } from '../types'

// "Import from URL" dialog. Takes any http(s) link and hands it to the main
// process (`url-import`), which picks one of two modes: a direct audio file
// link is downloaded as-is, anything else goes through the bundled yt-dlp
// (YouTube, SoundCloud, Bandcamp, …). Either way the result is registered into
// the library, landing in Music/JuiceWRLD Library with other local imports.

type FormatId = 'mp3' | 'm4a' | 'opus' | 'ogg' | 'flac' | 'wav'

interface FormatOption {
  id: FormatId
  label: string
  blurb: string
  lossy: boolean
}

const FORMATS: FormatOption[] = [
  { id: 'mp3',  label: 'MP3',  blurb: 'Universal, small files', lossy: true },
  { id: 'm4a',  label: 'M4A',  blurb: 'AAC — efficient',        lossy: true },
  { id: 'opus', label: 'Opus', blurb: 'Best quality per KB',    lossy: true },
  { id: 'flac', label: 'FLAC', blurb: 'Lossless',              lossy: false },
]

const BITRATES = ['320k', '256k', '192k', '128k']

const fileName = (p: string): string => p.split(/[/\\]/).pop() || p

const STAGE_LABEL: Record<string, string> = {
  probe: 'Checking link…',
  download: 'Downloading…',
  extract: 'Extracting audio…',
  finalize: 'Tagging…',
  done: 'Done',
}

// Reason codes from the main process's url-import-status / needsUpdate
// checks, mapped to user-facing copy for the "feature unavailable" page.
const UNAVAILABLE_COPY: Record<string, string> = {
  'missing-ytdlp': 'The downloader component is missing from this install.',
  'missing-ffmpeg': 'The audio converter component is missing from this install.',
  'needs-update': "The site changed something the bundled downloader doesn't support yet.",
}

type AppUpdateState = 'idle' | 'checking' | 'available' | 'latest' | 'downloaded' | 'error'

export default function UrlImportModal(): JSX.Element | null {
  const open = useStore((s) => s.urlImportModal)
  const close = useStore((s) => s.closeUrlImport)
  const addLibraryTrack = useStore((s) => s.addLibraryTrack)
  const el = (window as any).electron

  const [url, setUrl] = useState('')
  const [format, setFormat] = useState<FormatId>('mp3')
  const [bitrate, setBitrate] = useState('256k')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState<string>('download')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ outPath: string; title: string } | null>(null)
  // Non-null = show the "feature unavailable" page instead of the form. Set
  // either by the preemptive status check on open (packaging problem — the
  // binaries just aren't there) or reactively when an import attempt reports
  // `needsUpdate` (the binaries are there but yt-dlp's extractor is stale).
  const [unavailable, setUnavailable] = useState<string | null>(null)
  const [appUpdateState, setAppUpdateState] = useState<AppUpdateState>('idle')
  const importId = useRef<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset each time the dialog opens.
  useEffect(() => {
    if (!open) return
    setUrl('')
    setFormat('mp3')
    setBitrate('256k')
    setBusy(false)
    setProgress(0)
    setStage('download')
    setError(null)
    setDone(null)
    setUnavailable(null)
    setAppUpdateState('idle')
    importId.current = null
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  // Preemptive check: are the bundled binaries even present? Catches a broken
  // package (missing asarUnpack entry, etc.) before the user ever hits Import.
  useEffect(() => {
    if (!open || !el?.urlImportStatus) return
    let cancelled = false
    el.urlImportStatus().then((s: { available: boolean; reason?: string }) => {
      if (!cancelled && s && s.available === false) setUnavailable(s.reason || 'missing-ytdlp')
    }).catch(() => {})
    return () => { cancelled = true }
  }, [open, el])

  // Mirrors Settings' app-update flow, scoped to this dialog: gives the
  // "needs an update" page a working "Check for Updates" button, since an app
  // update is what actually refreshes the bundled yt-dlp binary (see
  // scripts/python/release.py refresh_bundled_binaries).
  useEffect(() => {
    if (!open || !el?.onUpdateStatus) return
    const off = el.onUpdateStatus((d: { type: string }) => {
      if (d.type === 'checking') setAppUpdateState('checking')
      else if (d.type === 'available') setAppUpdateState('available')
      else if (d.type === 'not-available') { setAppUpdateState('latest'); setTimeout(() => setAppUpdateState('idle'), 5000) }
      else if (d.type === 'downloading') setAppUpdateState('checking')
      else if (d.type === 'downloaded') setAppUpdateState('downloaded')
      else if (d.type === 'error') { setAppUpdateState('error'); setTimeout(() => setAppUpdateState('idle'), 5000) }
    })
    return () => off?.()
  }, [open, el])

  const checkForAppUpdate = async (): Promise<void> => {
    if (!el?.checkForUpdates || appUpdateState === 'checking') return
    setAppUpdateState('checking')
    try {
      await el.checkForUpdates()
      setAppUpdateState((s: AppUpdateState) => s === 'checking' ? 'latest' : s)
      setTimeout(() => setAppUpdateState((s: AppUpdateState) => s === 'latest' ? 'idle' : s), 5000)
    } catch {
      setAppUpdateState('error')
      setTimeout(() => setAppUpdateState('idle'), 5000)
    }
  }

  // Progress events are keyed by the id we pass into urlImport.
  useEffect(() => {
    if (!el?.onUrlImportProgress) return
    const off = el.onUrlImportProgress((d: { id: string; percent: number; stage: string }) => {
      if (d.id !== importId.current) return
      setProgress(d.percent)
      if (d.stage) setStage(d.stage)
    })
    return off
  }, [el])

  const selected = useMemo(() => FORMATS.find((f) => f.id === format)!, [format])

  if (!open) return null

  const noElectron = !el?.urlImport

  const run = async (): Promise<void> => {
    if (busy || noElectron || !url.trim()) return
    const id = `url:${Date.now()}`
    importId.current = id
    setBusy(true)
    setError(null)
    setProgress(0)
    setStage('download')
    try {
      const result = await el.urlImport({
        id,
        url: url.trim(),
        format,
        bitrate: selected.lossy ? bitrate : undefined,
      })
      if (result?.error) {
        if (result.needsUpdate) { setUnavailable('needs-update'); return }
        setError(result.error)
        return
      }
      if (result?.warning && !result?.track) {
        // File saved but metadata couldn't be read — still a success.
        setProgress(100)
        setDone({ outPath: result.outPath || '', title: fileName(result.outPath || '') })
        return
      }
      if (result?.track) {
        addLibraryTrack(result.track as LibraryTrack)
        broadcastLibraryTrackAdd(result.track as LibraryTrack)
      }
      setProgress(100)
      setDone({ outPath: result?.outPath || '', title: result?.track?.title || fileName(result?.outPath || '') })
    } catch (e: any) {
      setError(e?.message ?? 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  const dismiss = (): void => {
    if (busy) return
    close()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm p-0 md:p-4"
      onClick={(e) => { if (e.currentTarget === e.target) dismiss() }}
    >
      <div className="bg-surface flex flex-col border border-[var(--border)] rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-md max-h-[92svh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] sticky top-0 bg-surface z-10 shrink-0">
          <h2 className="flex items-center gap-2 text-text-primary text-sm font-semibold">
            <Link2 size={15} className="text-accent" /> Import from URL
          </h2>
          <button
            onClick={dismiss}
            disabled={busy}
            className="text-text-muted hover:text-text-primary transition-colors disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {unavailable ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-5 text-sm text-text-primary flex flex-col items-center gap-2 text-center">
              <Wrench size={22} className="text-amber-400" />
              <p className="font-medium">URL import is temporarily unavailable</p>
              <p className="text-text-muted text-xs max-w-[280px]">
                {UNAVAILABLE_COPY[unavailable] || 'This feature needs attention before it can run.'}
              </p>
              {unavailable === 'needs-update' && (
                <p className="text-text-muted text-[11px] max-w-[280px]">
                  This is fixed by the next app update, not by retrying.
                </p>
              )}
              <div className="flex flex-col items-center gap-2 mt-2 w-full">
                {el?.checkForUpdates && (
                  <button
                    onClick={checkForAppUpdate}
                    disabled={appUpdateState === 'checking'}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-60"
                  >
                    {appUpdateState === 'checking'
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Download size={13} />}
                    {appUpdateState === 'checking' ? 'Checking…'
                      : appUpdateState === 'available' ? 'Update available'
                      : appUpdateState === 'downloaded' ? 'Update ready to install'
                      : appUpdateState === 'latest' ? 'Already up to date'
                      : appUpdateState === 'error' ? 'Check failed — try again'
                      : 'Check for updates'}
                  </button>
                )}
                <button
                  onClick={dismiss}
                  className="px-3 py-1.5 text-xs font-semibold text-text-muted hover:text-text-primary transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          ) : done ? (
            <div className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-4 text-sm text-text-primary flex flex-col items-center gap-2 text-center">
              <Check size={22} className="text-accent" />
              <p className="font-medium">Added to your library</p>
              {done.title && <p className="text-text-muted text-xs break-all">{done.title}</p>}
              <div className="flex gap-2 mt-1">
                {done.outPath && el?.openPath && (
                  <button
                    onClick={() => el.openPath(done.outPath.replace(/[/\\][^/\\]+$/, ''))}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-text-secondary hover:text-text-primary bg-surface-overlay hover:bg-surface-raised transition-colors"
                  >
                    <Folder size={13} /> Show folder
                  </button>
                )}
                <button
                  onClick={dismiss}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent/90 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* URL */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">Link</p>
                <input
                  ref={inputRef}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') run() }}
                  disabled={busy}
                  placeholder="Video, track, or direct .mp3 link"
                  className="w-full px-3 py-2 bg-surface-overlay border border-[var(--border)] rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors disabled:opacity-50"
                />
                <p className="text-[10px] text-text-muted opacity-70 mt-1.5">
                  YouTube, SoundCloud, Bandcamp and ~1800 other sites — or a direct file link.
                </p>
              </div>

              {/* Target format */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">Format</p>
                <div className="grid grid-cols-4 gap-2">
                  {FORMATS.map((f) => {
                    const active = f.id === format
                    return (
                      <button
                        key={f.id}
                        disabled={busy}
                        onClick={() => setFormat(f.id)}
                        title={f.blurb}
                        className={`flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2 transition-colors disabled:opacity-50 ${
                          active
                            ? 'border-accent bg-accent/10'
                            : 'border-[var(--border)] bg-surface-overlay/50 hover:bg-surface-overlay'
                        }`}
                      >
                        <span className={`text-sm font-bold ${active ? 'text-accent' : 'text-text-primary'}`}>{f.label}</span>
                      </button>
                    )
                  })}
                </div>
                <p className="text-[10px] text-text-muted opacity-70 mt-1.5">
                  Applies to site links. Direct file links are saved as-is, without re-encoding.
                </p>
              </div>

              {/* Bitrate (lossy only) */}
              {selected.lossy ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">Bitrate</p>
                  <div className="flex gap-2">
                    {BITRATES.map((b) => {
                      const active = b === bitrate
                      return (
                        <button
                          key={b}
                          disabled={busy}
                          onClick={() => setBitrate(b)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
                            active
                              ? 'border-accent bg-accent/10 text-accent'
                              : 'border-[var(--border)] text-text-secondary hover:bg-surface-overlay'
                          }`}
                        >
                          {b.replace('k', '')}<span className="opacity-60"> kbps</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-text-muted opacity-75">
                  {selected.label} is lossless — the source is re-encoded at full quality.
                </p>
              )}

              {noElectron && (
                <div className="flex items-center gap-2 text-amber-400 text-xs">
                  <AlertCircle size={13} className="shrink-0" />
                  <span>URL import is only available in the desktop app.</span>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 text-red-400 text-xs">
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  <span className="min-w-0 break-words">{error}</span>
                </div>
              )}

              {busy && (
                <div className="space-y-1.5">
                  <div className="h-1.5 rounded-full bg-surface-overlay overflow-hidden">
                    <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-[11px] text-text-muted text-center tabular-nums">
                    {STAGE_LABEL[stage] || 'Working…'} {progress > 0 && `${progress}%`}
                  </p>
                </div>
              )}

              <button
                onClick={run}
                disabled={busy || noElectron || !url.trim()}
                className="w-full py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 bg-accent text-white hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
                {busy ? 'Importing…' : 'Import'}
              </button>
              <p className="text-[10px] text-text-muted opacity-60 text-center">
                Saves the audio into your JuiceWRLD Library folder.
              </p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
