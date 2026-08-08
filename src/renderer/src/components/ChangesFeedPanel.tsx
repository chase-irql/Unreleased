import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, AlertCircle, Folder } from 'lucide-react'
import { useStorePick } from '../store/useStore'
import {
  fetchTrackerChanges, fetchCompChanges,
  type TrackerChange, type CompChange,
} from '../lib/changesApi'

type FeedTab = 'tracker' | 'comp'

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (isNaN(t)) return ''
  const s = Math.floor((Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}

function humanSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const ACTION_STYLES: Record<string, string> = {
  create: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  upload: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  update: 'bg-sky-500/15 text-sky-400 border-sky-500/25',
  replace: 'bg-sky-500/15 text-sky-400 border-sky-500/25',
  move: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  delete: 'bg-red-500/15 text-red-400 border-red-500/25',
  create_folder: 'bg-violet-500/15 text-violet-400 border-violet-500/25',
}

const ACTION_LABELS: Record<string, string> = {
  create_folder: 'new folder',
}

function ActionBadge({ action }: { action: string }): JSX.Element {
  const cls = ACTION_STYLES[action] || 'bg-[var(--surface-overlay)] text-text-secondary border-[var(--border)]'
  return (
    <span className={`inline-block shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}>
      {ACTION_LABELS[action] ?? action}
    </span>
  )
}

function CompRow({ item, onOpen }: { item: CompChange; onOpen: (i: CompChange) => void }): JSX.Element {
  return (
    <button
      onClick={() => onOpen(item)}
      className="w-full text-left flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] hover:border-accent/40 transition-colors p-3"
    >
      <ActionBadge action={item.action} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-text-primary truncate flex items-center gap-1.5">
          {item.is_folder && <Folder size={13} className="shrink-0 text-text-muted" />}
          <span className="truncate">{item.name}</span>
        </div>
        <div className="text-xs text-text-muted truncate">{item.folder || '/'}</div>
        {item.action === 'move' && item.source_path && (
          <div className="text-[11px] text-text-muted truncate mt-0.5">from {item.source_path}</div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <div className="text-xs text-text-secondary truncate max-w-[9rem]">{item.user}</div>
        <div className="text-[11px] text-text-muted">{timeAgo(item.timestamp)}</div>
        {/* Folders carry no meaningful byte count — the server sends 0 for them
            and a "0 B" line next to a new folder just reads like a failure. */}
        {!item.is_folder && humanSize(item.size) && <div className="text-[11px] text-text-muted">{humanSize(item.size)}</div>}
      </div>
    </button>
  )
}

function TrackerRow({ item, onOpen }: { item: TrackerChange; onOpen: (i: TrackerChange) => void }): JSX.Element {
  const clickable = item.song_id != null
  return (
    <button
      onClick={() => clickable && onOpen(item)}
      className={`w-full text-left flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3 transition-colors ${
        clickable ? 'hover:border-accent/40 cursor-pointer' : 'cursor-default'
      }`}
    >
      <ActionBadge action={item.action} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-text-primary truncate">{item.name}</div>
        {item.fields.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {item.fields.slice(0, 6).map((f) => (
              <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-overlay)] text-text-muted">{f}</span>
            ))}
            {item.fields.length > 6 && <span className="text-[10px] text-text-muted self-center">+{item.fields.length - 6}</span>}
          </div>
        )}
        {item.notes && <div className="text-[11px] text-text-muted truncate mt-1">{item.notes}</div>}
      </div>
      <div className="shrink-0 text-right">
        <div className="text-xs text-text-secondary truncate max-w-[9rem]">{item.user}</div>
        <div className="text-[11px] text-text-muted">{timeAgo(item.timestamp)}</div>
      </div>
    </button>
  )
}

export default function ChangesFeedPanel(): JSX.Element {
  const { setActiveView, setApiFilesPath, setInfoSongId } = useStorePick('setActiveView', 'setApiFilesPath', 'setInfoSongId')
  const [tab, setTab] = useState<FeedTab>('tracker')
  const [tracker, setTracker] = useState<TrackerChange[]>([])
  const [comp, setComp] = useState<CompChange[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (which: FeedTab) => {
    setLoading(true)
    setError(null)
    try {
      if (which === 'tracker') setTracker(await fetchTrackerChanges())
      else setComp(await fetchCompChanges())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load changes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(tab) }, [tab, load])

  const openComp = (item: CompChange): void => {
    setApiFilesPath(item.folder || '')
    setActiveView('api-files')
  }
  const openTracker = (item: TrackerChange): void => {
    if (item.song_id != null) setInfoSongId(item.song_id)
  }

  const rows = tab === 'tracker' ? tracker : comp
  const empty = !loading && !error && rows.length === 0

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex gap-0.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] p-0.5">
          {(['tracker', 'comp'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                tab === t ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {t === 'tracker' ? 'Tracker edits' : 'Comp files'}
            </button>
          ))}
        </div>
        <button
          onClick={() => load(tab)}
          disabled={loading}
          title="Refresh"
          className="ml-auto p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center text-center py-20 px-6">
          <AlertCircle size={26} className="text-red-400 mb-3" />
          <p className="text-sm text-text-secondary mb-4">{error}</p>
          <button
            onClick={() => load(tab)}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--surface-raised)] border border-[var(--border)] text-text-primary hover:border-accent/40 transition-colors"
          >
            Try again
          </button>
        </div>
      ) : empty ? (
        <div className="text-center py-20 text-sm text-text-muted">No changes yet.</div>
      ) : (
        <div className="space-y-2">
          {tab === 'tracker'
            ? tracker.map((item) => <TrackerRow key={item.id} item={item} onOpen={openTracker} />)
            : comp.map((item) => <CompRow key={item.id} item={item} onOpen={openComp} />)}
        </div>
      )}
    </div>
  )
}
