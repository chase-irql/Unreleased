import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, ChevronLeft, Plus, FolderOpen, ShieldCheck } from 'lucide-react'
import { useStore, useStorePick } from '../store/useStore'
import * as userApi from '../lib/userApi'
import type { CompFileProposal } from '../lib/userApi'
import { StatusChip, relativeTime } from './adminShared'
import CompProposalsTab from './CompProposalsTab'

type FilterTab = 'all' | 'pending' | 'approved' | 'rejected'

export default function ContributorProfileView(): JSX.Element {
  const { account, setActiveView } = useStorePick('account', 'setActiveView')
  const [proposals, setProposals] = useState<CompFileProposal[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterTab>('all')
  const [refreshKey, setRefreshKey] = useState(0)
  const [tab, setTab] = useState<'proposals' | 'admin'>('proposals')

  const isContributor = !!(account?.is_contributor || account?.is_administrator)
  const canReview = !!(account?.is_administrator || account?.is_manager)

  useEffect(() => {
    if (!isContributor) {
      setLoading(false)
      return
    }
    setLoading(true)
    userApi.getMyCompProposals().then(setProposals).catch(() => {}).finally(() => setLoading(false))
  }, [isContributor, refreshKey])

  const filtered = filter === 'all' ? proposals : proposals.filter(p => p.status === filter)
  const approvedCount = proposals.filter(p => p.status === 'approved').length

  if (!account) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm">Sign in to view your contributor profile.</div>
    )
  }

  if (!isContributor) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
        <p className="text-sm text-text-muted">You are not a contributor yet.</p>
        <button onClick={() => setActiveView('contributor')} className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-semibold">Apply or submit</button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-5 py-4 border-b border-[var(--border)] flex items-center gap-3">
        <button onClick={() => setActiveView('api-tracker')} className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-raised transition-colors md:hidden">
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-text-primary">{account.display_name || account.discord_username}</h1>
          <p className="text-xs text-text-muted">
            Contributor · {approvedCount} approved
            {account.is_editor ? ' · also editor' : ''}
          </p>
        </div>
        {account.is_editor && (
          <button onClick={() => setActiveView('editor-profile')} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-raised text-text-secondary hover:text-text-primary transition-colors">
            Editor profile
          </button>
        )}
        <button onClick={() => setActiveView('contributor')} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent text-white flex items-center gap-1.5">
          <Plus size={14} /> New proposal
        </button>
        <button onClick={() => setActiveView('api-files')} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-raised transition-colors" title="Browse comp files">
          <FolderOpen size={16} />
        </button>
        <button onClick={() => setRefreshKey(k => k + 1)} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-raised transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      {canReview && (
        <div className="shrink-0 flex gap-1 px-5 pt-3 border-b border-[var(--border)]">
          <button onClick={() => setTab('proposals')} className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${tab === 'proposals' ? 'border-accent text-accent' : 'border-transparent text-text-muted'}`}>My submissions</button>
          <button onClick={() => setTab('admin')} className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${tab === 'admin' ? 'border-accent text-accent' : 'border-transparent text-text-muted'}`}>
            <ShieldCheck size={13} /> Review queue
          </button>
        </div>
      )}

      {tab === 'admin' && canReview ? (
        <div className="flex-1 overflow-hidden">
          <CompProposalsTab embedded onChanged={() => setRefreshKey(k => k + 1)} />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex gap-2 mb-4 flex-wrap">
            {(['all', 'pending', 'approved', 'rejected'] as FilterTab[]).map(key => (
              <button key={key} onClick={() => setFilter(key)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize ${filter === key ? 'bg-accent/15 text-accent' : 'text-text-muted'}`}>
                {key}
              </button>
            ))}
          </div>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-text-muted" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-12">No comp proposals yet.</p>
          ) : (
            <div className="space-y-2 max-w-2xl">
              {filtered.map(p => (
                <button key={p.id} onClick={() => setActiveView('contributor')}
                  className="w-full text-left rounded-xl border border-[var(--border)] bg-surface-raised/40 px-4 py-3 hover:bg-surface-raised transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <StatusChip status={p.status} />
                    <span className="text-[10px] uppercase font-bold text-text-muted">{p.change_type}</span>
                  </div>
                  <p className="text-sm font-mono text-text-primary truncate">{p.file_path}</p>
                  <p className="text-[11px] text-text-muted mt-1">{relativeTime(p.created_at)}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
