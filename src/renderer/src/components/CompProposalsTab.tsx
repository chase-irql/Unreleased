import { useEffect, useMemo, useState } from 'react'
import {
  Loader2, CheckCircle, XCircle, RotateCcw, Download, Calendar, Hash, AlertCircle,
} from 'lucide-react'
import * as userApi from '../lib/userApi'
import type { CompFileProposal, ProposalStatus } from '../lib/userApi'
import { getToken } from '../lib/userApi'
import { relativeTime, shortDate, StatusChip, Empty, QueueSearch, matchesQuery } from './adminShared'

export default function CompProposalsTab({ embedded = false, onChanged }: { embedded?: boolean; onChanged?: () => void }): JSX.Element {
  const [status, setStatus] = useState<ProposalStatus | ''>('pending')
  const [proposals, setProposals] = useState<CompFileProposal[]>([])
  const [selected, setSelected] = useState<CompFileProposal | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<number | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  // Searchable: both sides of a move, who filed it, the staged file's name,
  // the change type as it's labelled on screen ("New file", not "create"), and
  // the raw id so a proposal referenced by number elsewhere can be pulled up.
  const visible = useMemo(() => proposals.filter(p => matchesQuery(
    query, p.file_path, p.destination_path, p.contributor_username,
    p.staging_filename, userApi.compChangeTypeLabel(p.change_type), p.id,
  )), [proposals, query])

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

  // Searching can filter the selected proposal out from under the detail pane,
  // which would otherwise leave Approve/Reject pointed at a row no longer in
  // the list. Fall through to the first match, resetting the notes box with it
  // for the same reason the fetch above does.
  useEffect(() => {
    if (selected && visible.some(v => v.id === selected.id)) return
    setSelected(visible[0] ?? null)
    setReviewNotes('')
    setError(null)
  }, [visible, selected])

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

  return (
    <div className={`flex-1 min-w-0 h-full flex overflow-hidden ${embedded ? '' : 'bg-[var(--surface)]'}`}>
      <div className="w-72 shrink-0 border-r border-[var(--border)] flex flex-col">
        <div className="shrink-0 p-3 border-b border-[var(--border)] flex flex-col gap-2">
          <div className="flex gap-2">
            {(['pending', 'approved', 'rejected', 'reversed', ''] as const).map(s => (
              <button key={s || 'all'} onClick={() => setStatus(s)}
                className={`px-2 py-1 rounded text-[10px] font-semibold capitalize ${status === s ? 'bg-accent/15 text-accent' : 'text-text-muted'}`}>
                {s || 'all'}
              </button>
            ))}
          </div>
          <QueueSearch value={query} onChange={setQuery} placeholder="Search path, contributor…"
            matches={visible.length} total={proposals.length} />
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-text-muted" size={18} /></div>}
          {!loading && proposals.length === 0 && <Empty label="No comp proposals" />}
          {!loading && proposals.length > 0 && visible.length === 0 && <Empty label="No matches" />}
          {visible.map(item => (
            <button key={item.id} onClick={() => { setSelected(item); setReviewNotes(''); setError(null) }}
              className={`w-full text-left px-3 py-3 border-b border-[var(--border)] transition-colors ${selected?.id === item.id ? 'bg-accent/10' : 'hover:bg-surface-raised'}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <StatusChip status={item.status} />
                <span className="text-[9px] text-text-muted bg-surface-raised px-1.5 py-0.5 rounded">{userApi.compChangeTypeLabel(item.change_type)}</span>
              </div>
              <p className="text-[11px] font-mono text-text-primary truncate">{item.file_path}</p>
              {item.change_type === 'move' && item.destination_path && (
                <p className="text-[10px] font-mono text-text-muted truncate">→ {item.destination_path}</p>
              )}
              <p className="text-[10px] text-text-muted truncate">{item.contributor_username} · {relativeTime(item.created_at)}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {!p ? (
          <Empty label="Select a comp proposal" />
        ) : (
          <>
            <div className="shrink-0 px-6 py-4 border-b border-[var(--border)]">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <StatusChip status={p.status} />
                    <span className="text-[10px] text-text-muted bg-surface-raised px-2 py-0.5 rounded">{userApi.compChangeTypeLabel(p.change_type)}</span>
                  </div>
                  <h2 className="text-text-primary font-bold text-base font-mono break-all">{p.file_path}</h2>
                  {p.change_type === 'move' && p.destination_path && (
                    <p className="text-text-muted font-mono text-sm break-all mt-1">→ {p.destination_path}</p>
                  )}
                  <div className="flex items-center gap-4 mt-1.5 text-[11px] text-text-muted flex-wrap">
                    <span>by {p.contributor_username}</span>
                    <span className="flex items-center gap-1"><Calendar size={10} />{shortDate(p.created_at)}</span>
                    {p.applied_commit_id && <span className="flex items-center gap-1"><Hash size={10} />{p.applied_commit_id}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {p.staging_filename && p.status === 'pending' && (
                    <button onClick={() => downloadStaging(p)} className="px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary border border-[var(--border)] flex items-center gap-1.5">
                      <Download size={13} /> Staged file
                    </button>
                  )}
                  {p.status === 'pending' && (
                    actionId === p.id ? <Loader2 size={14} className="animate-spin text-text-muted" /> : (
                      <>
                        <button onClick={() => doReview(p.id, 'reject')} className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-semibold flex items-center gap-1.5">
                          <XCircle size={13} /> Reject
                        </button>
                        <button onClick={() => doReview(p.id, 'approve')} className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-semibold flex items-center gap-1.5">
                          <CheckCircle size={13} /> Approve
                        </button>
                      </>
                    )
                  )}
                  {p.status === 'approved' && (
                    <button onClick={() => doReverse(p.id)} disabled={actionId === p.id}
                      className="px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-amber-400 flex items-center gap-1.5">
                      {actionId === p.id ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Reverse
                    </button>
                  )}
                </div>
              </div>
              <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={2} placeholder="Review notes (optional)"
                className="mt-3 w-full rounded-lg border border-[var(--border)] bg-surface-overlay px-3 py-2 text-xs text-text-primary focus:outline-none resize-none" />
              {error && (
                <p className="mt-2 text-xs text-red-400 flex items-center gap-1.5"><AlertCircle size={12} />{error}</p>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-sm">
              {p.contributor_notes && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">Contributor notes</p>
                  <p className="text-text-secondary whitespace-pre-wrap">{p.contributor_notes}</p>
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
                  <p className="text-text-secondary whitespace-pre-wrap">{p.review_notes}</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
