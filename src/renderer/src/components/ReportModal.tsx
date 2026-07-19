import { createPortal } from 'react-dom'
import { X, Flag, MessageSquareText } from 'lucide-react'
import { useStore } from '../store/useStore'
import ReportForm from './ReportForm'

// Global report dialog, mounted once at the app root and driven by the store's
// `reportModal` target — opened from a song's context menu / info panel (song
// mode) or anywhere a general feedback prompt is wired (feedback mode).
export default function ReportModal(): JSX.Element | null {
  const target = useStore((s) => s.reportModal)
  const closeReport = useStore((s) => s.closeReport)

  if (!target) return null

  const isSong = target.kind === 'song'
  const title = isSong ? 'Report an issue' : 'Send feedback'
  const Icon = isSong ? Flag : MessageSquareText

  return createPortal(
    <div
      className="fixed inset-0 z-[170] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm p-0 md:p-4"
      onClick={(e) => { if (e.currentTarget === e.target) closeReport() }}
    >
      <div className="bg-surface border border-[var(--border)] rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-md max-h-[92svh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] sticky top-0 bg-surface">
          <h2 className="flex items-center gap-2 text-text-primary text-sm font-semibold">
            <Icon size={15} className="text-accent" /> {title}
          </h2>
          <button onClick={closeReport} className="text-text-muted hover:text-text-primary transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">
          <ReportForm
            mode={isSong ? { kind: 'song', songId: target.songId, songName: target.songName } : { kind: 'feedback' }}
            onDone={closeReport}
          />
        </div>
      </div>
    </div>,
    document.body
  )
}
