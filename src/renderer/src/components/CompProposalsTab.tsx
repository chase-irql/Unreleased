import { useEffect, useState } from 'react'
import {
  Loader2, CheckCircle, XCircle, RotateCcw, Download, Calendar, Hash, AlertCircle, ChevronLeft,
} from 'lucide-react'
import * as userApi from '../lib/userApi'
import type { CompFileProposal, ProposalStatus } from '../lib/userApi'
import { getToken } from '../lib/userApi'
import { relativeTime, shortDate, StatusChip, Empty } from './adminShared'
import { useBackToClose } from '../hooks/useBackToClose'

export default function CompProposalsTab({ embedded = false, onChanged }: { embedded?: boolean; onChanged?: () => void }): JSX.Element {
  const [status, setStatus] = useState<ProposalStatus | ''>('pending')
  const [proposals, setProposals] = useState<CompFileProposal[]>([])
  const [selected, setSelected] = useState<CompFileProposal | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<number | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    userApi.adminListCompProposals(status || undefined)
      .then(rows => {
        setProposals(rows)
        // Reviewing a proposal reloads the list and moves the selection, so
        // the notes box has to reset with it — otherwise the text typed for
        // the proposal just approved rides along into the next Approve.
        setSelected(rows[0] ?? null)
        setReviewNotes('')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [status, refreshKey])

  const reload = (): void => {
    setRefreshKey(k => k + 1)
    onChanged?.()
  }

  const doReview = async (id: number, action: 'approve' | 'reject'): Promise<void> => {
    setActionId(id)
    setError(null)
    try {
      await userApi.adminReviewCompProposal(id, { action, review_notes: reviewNotes })
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not ${action} this proposal`)
    } finally {
      setActionId(null)
    }
  }

  const doReverse = async (id: number): Promise<void> => {
    setActionId(id)
    setError(null)
    try {
      await userApi.adminReverseCompProposal(id)
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reverse this proposal')
    } finally {
      setActionId(null)
    }
  }

  const downloadStaging = (p: CompFileProposal): void => {
    const token = getToken()
    const url = userApi.adminCompProposalStagingUrl(p.id)
    fetch(url, { headers: token ? { Authorization: `Token ${token}` } : {} })
      .then(r => r.blob())
      .then(blob => {
        const href = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = href
        a.download = p.staging_filename || 'staged-file'
        // Anchor has to be in the document for the click to count in some
        // browsers, and the object URL has to outlive the click — revoking it
        // on the same tick cancels the download before it starts.
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(href), 60_000)
      })
      .catch(() => {})
  }

  const p = selected

  useBackToClose(() => setSelected(null), p != null)

  if (p) return (
    <div className={`flex-1 min-w-0 h-full flex flex-col overflow-hidden ${embedded ? '' : 'bg-[var(--surface)]'}`}>
      <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-[var(--border)]">
        <button onClick={() => setSelected(null)}
          className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full text-text-primary active:bg-surface-overlay transition-colors">
          <ChevronLeft size={20} />
        </button>
        <h2 className="flex-1 min-w-0 truncate text-text-primary text-[14px] font-bold font-mono">{p.file_path}</h2>
        <StatusChip status={p.status} />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-text-muted bg-surface-overlay px-2 py-0.5 rounded font-semibold">{p.change_type}</span>
          <span className="text-xs text-text-muted">by {p.contributor_username}</span>
          <span className="flex items-center gap-1 text-xs text-text-muted"><Calendar size={10} />{shortDate(p.created_at)}</span>
          {p.applied_commit_id && <span className="flex items-center gap-1 text-xs text-text-muted"><Hash size={10} />{p.applied_commit_id}</span>}
        </div>

        {p.change_type === 'move' && p.destination_path && (
          <p className="text-text-muted font-mono text-sm break-all">→ {p.destination_path}</p>
        )}

        {p.staging_filename && p.status === 'pending' && (
          <button onClick={() => downloadStaging(p)}
            className="w-full h-10 rounded-lg text-sm text-text-secondary active:bg-surface-raised border border-[var(--border)] flex items-center justify-center gap-1.5">
            <Download size={14} /> Staged file
          </button>
        )}

        {p.contributor_notes && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">Contributor notes</p>
            <p className="text-text-secondary text-sm whitespace-pre-wrap">{p.contributor_notes}</p>
          </div>
        )}
        {Object.keys(p.original_snapshot || {}).length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">Original snapshot</p>
            <pre className="text-xs font-mono text-text-muted bg-surface-overlay rounded-lg p-3 overflow-x-auto">{JSON.stringify(p.original_snapshot, null, 2)}</pre>
          </div>
        )}
        {p.review_notes && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">Review notes</p>
            <p className="text-text-secondary text-sm whitespace-pre-wrap">{p.review_notes}</p>
          </div>
        )}

        {p.status === 'pending' && (
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Review note</label>
            <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={3} placeholder="Optional…"
              className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-surface-overlay px-3 py-2.5 text-sm text-text-primary focus:outline-none resize-none" />
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400 flex items-center gap-1.5"><AlertCircle size={12} />{error}</p>
        )}
      </div>

      <div className="shrink-0 p-3 border-t border-[var(--border)] flex items-center gap-2">
        {actionId === p.id ? (
          <div className="flex-1 flex justify-center py-2.5"><Loader2 size={16} className="animate-spin text-text-muted" /></div>
        ) : p.status === 'pending' ? (
          <>
            <button onClick={() => doReview(p.id, 'reject')}
              className="flex-1 h-11 rounded-xl bg-red-500/10 active:bg-red-500/20 text-red-400 text-sm font-semibold flex items-center justify-center gap-1.5">
              <XCircle size={15} /> Reject
            </button>
            <button onClick={() => doReview(p.id, 'approve')}
              className="flex-1 h-11 rounded-xl bg-emerald-500/15 active:bg-emerald-500/25 text-emerald-400 text-sm font-semibold flex items-center justify-center gap-1.5">
              <CheckCircle size={15} /> Approve
            </button>
          </>
        ) : p.status === 'approved' ? (
          <button onClick={() => doReverse(p.id)} disabled={actionId === p.id}
            className="w-full h-11 rounded-xl text-sm text-text-muted active:text-amber-400 active:bg-amber-500/10 flex items-center justify-center gap-1.5">
            <RotateCcw size={15} /> Reverse
          </button>
        ) : null}
      </div>
    </div>
  )

  return (
    <div className={`flex-1 min-w-0 h-full flex flex-col overflow-hidden ${embedded ? '' : 'bg-[var(--surface)]'}`}>
      <div className="shrink-0 p-3 border-b border-[var(--border)] flex gap-2 overflow-x-auto scrollbar-none">
        {(['pending', 'approved', 'rejected', 'reversed', ''] as const).map(s => (
          <button key={s || 'all'} onClick={() => setStatus(s)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors ${status === s ? 'bg-accent/15 text-accent' : 'text-text-muted bg-surface-overlay'}`}>
            {s || 'all'}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-text-muted" size={18} /></div>}
        {!loading && proposals.length === 0 && <Empty label="No comp proposals" />}
        {proposals.map(item => (
          <button key={item.id} onClick={() => { setSelected(item); setReviewNotes(''); setError(null) }}
            className="w-full text-left px-3 py-3 border-b border-[var(--border)] transition-colors active:bg-surface-raised">
            <div className="flex items-center gap-1.5 mb-1">
              <StatusChip status={item.status} />
              <span className="text-[9px] text-text-muted bg-surface-raised px-1.5 py-0.5 rounded">{item.change_type}</span>
            </div>
            <p className="text-[12px] font-mono text-text-primary truncate">{item.file_path}</p>
            {item.change_type === 'move' && item.destination_path && (
              <p className="text-[10px] font-mono text-text-muted truncate">→ {item.destination_path}</p>
            )}
            <p className="text-[10px] text-text-muted truncate">{item.contributor_username} · {relativeTime(item.created_at)}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
