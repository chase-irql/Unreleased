import { useEffect, useState, useRef } from 'react'
import {
  Loader2, Check, AlertCircle, LogIn, Clock, X, Upload, Replace, Trash2,
  FolderOpen, ChevronLeft, RefreshCw, FileUp, ArrowRight,
} from 'lucide-react'
import { useStore, useStorePick } from '../store/useStore'
import * as userApi from '../lib/userApi'
import type { CompFileProposal, CompProposalChangeType, EditorApplication } from '../lib/userApi'
import { StatusChip, relativeTime } from './adminShared'

type SubmitState = 'idle' | 'submitting' | 'submitted' | 'error'
type FilterTab = 'all' | 'pending' | 'approved' | 'rejected'

const CHANGE_OPTIONS: { value: CompProposalChangeType; label: string; icon: typeof Upload }[] = [
  { value: 'upload', label: 'Upload', icon: Upload },
  { value: 'replace', label: 'Replace', icon: Replace },
  { value: 'move', label: 'Move', icon: ArrowRight },
  { value: 'delete', label: 'Delete', icon: Trash2 },
]

function ApplyPanel({ onSubmitted }: { onSubmitted: () => void }): JSX.Element {
  const [motivation, setMotivation] = useState('')
  const [contact, setContact] = useState('')
  const [experience, setExperience] = useState('')
  const [areas, setAreas] = useState('')
  const [state, setState] = useState<SubmitState>('idle')
  const [error, setError] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    if (motivation.trim().length < 20 || state === 'submitting') return
    setState('submitting')
    setError(null)
    try {
      await userApi.submitApplication({
        motivation: motivation.trim(),
        contact,
        experience,
        areas,
        application_type: 'contributor',
      })
      setState('submitted')
      setTimeout(onSubmitted, 1200)
    } catch (e) {
      setState('error')
      setError(e instanceof Error ? e.message : 'Application failed')
      setTimeout(() => setState('idle'), 4000)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-12">
      <div className="rounded-2xl border border-[var(--border)] bg-surface-raised/50 p-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Apply as contributor</h1>
          <p className="text-sm text-text-muted mt-1">Propose uploads, replacements, and deletions for comp files. Admins review before changes go live.</p>
        </div>
        <textarea value={motivation} onChange={e => setMotivation(e.target.value)} rows={4} placeholder="Why do you want to contribute comp files? (min 20 chars)"
          className="w-full rounded-xl border border-[var(--border)] bg-surface-overlay px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent resize-none" />
        <input value={contact} onChange={e => setContact(e.target.value)} placeholder="Contact (optional)"
          className="w-full rounded-xl border border-[var(--border)] bg-surface-overlay px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent" />
        <textarea value={experience} onChange={e => setExperience(e.target.value)} rows={2} placeholder="Experience (optional)"
          className="w-full rounded-xl border border-[var(--border)] bg-surface-overlay px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent resize-none" />
        <input value={areas} onChange={e => setAreas(e.target.value)} placeholder="Areas you can help with (optional)"
          className="w-full rounded-xl border border-[var(--border)] bg-surface-overlay px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent" />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button onClick={submit} disabled={state === 'submitting' || motivation.trim().length < 20}
          className="w-full py-3 rounded-xl bg-accent text-white font-semibold text-sm disabled:opacity-40 flex items-center justify-center gap-2">
          {state === 'submitting' ? <Loader2 size={16} className="animate-spin" /> : state === 'submitted' ? <Check size={16} /> : <LogIn size={16} />}
          {state === 'submitted' ? 'Application submitted' : 'Submit application'}
        </button>
      </div>
    </div>
  )
}

export default function ContributorPage(): JSX.Element {
  const { account, setActiveView } = useStorePick('account', 'setActiveView')
  const [application, setApplication] = useState<EditorApplication | null | undefined>(undefined)
  const [proposals, setProposals] = useState<CompFileProposal[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterTab>('all')
  const [filePath, setFilePath] = useState('')
  const [destinationPath, setDestinationPath] = useState('')
  const [changeType, setChangeType] = useState<CompProposalChangeType>('upload')
  const [notes, setNotes] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [withdrawingId, setWithdrawingId] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isContributor = !!(account?.is_contributor || account?.is_administrator)

  const reload = (): void => {
    if (!isContributor) return
    setLoading(true)
    userApi.getMyCompProposals().then(setProposals).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!account) {
      setApplication(undefined)
      setLoading(false)
      return
    }
    userApi.getMyApplication().then(r => setApplication(r.application)).catch(() => setApplication(null))
    if (isContributor) reload()
    else setLoading(false)
  }, [account, isContributor])

  const filtered = filter === 'all' ? proposals : proposals.filter(p => p.status === filter)

  const submitProposal = async (): Promise<void> => {
    if (!filePath.trim() || submitState === 'submitting') return
    if (changeType === 'move' && !destinationPath.trim()) {
      setSubmitError('Enter a destination path for move proposals.')
      return
    }
    if (changeType !== 'delete' && changeType !== 'move' && !selectedFile) {
      setSubmitError('Select a file for upload or replace proposals.')
      return
    }
    setSubmitState('submitting')
    setSubmitError(null)
    const form = new FormData()
    form.append('file_path', filePath.trim())
    if (changeType === 'move') form.append('destination_path', destinationPath.trim())
    form.append('change_type', changeType)
    form.append('contributor_notes', notes)
    if (selectedFile) form.append('file', selectedFile)
    try {
      await userApi.createCompProposal(form)
      setSubmitState('submitted')
      setSelectedFile(null)
      setNotes('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      reload()
      setTimeout(() => setSubmitState('idle'), 2000)
    } catch (e) {
      setSubmitState('error')
      setSubmitError(e instanceof Error ? e.message : 'Submission failed')
      setTimeout(() => setSubmitState('idle'), 4000)
    }
  }

  const withdraw = async (id: number): Promise<void> => {
    setWithdrawingId(id)
    try {
      await userApi.withdrawCompProposal(id)
      setProposals(prev => prev.filter(p => p.id !== id))
    } finally {
      setWithdrawingId(null)
    }
  }

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-text-muted">
        <LogIn size={32} className="opacity-40" />
        <p className="text-sm">Sign in with Discord to contribute comp files.</p>
      </div>
    )
  }

  if (!isContributor) {
    if (application === undefined) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-text-muted" /></div>
    if (application?.status === 'pending') {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-text-muted px-6 text-center">
          <Clock size={32} className="opacity-40" />
          <p className="text-sm font-medium text-text-primary">Contributor application pending</p>
          <p className="text-xs opacity-70">An admin will review your application soon.</p>
        </div>
      )
    }
    return <ApplyPanel onSubmitted={() => userApi.getMyApplication().then(r => setApplication(r.application))} />
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 flex items-center gap-3 px-5 py-4 border-b border-[var(--border)]">
        <button onClick={() => setActiveView('contributor-profile')} className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-raised transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-text-primary">Comp file proposals</h1>
          <p className="text-xs text-text-muted">Upload, replace, or delete files in comp/</p>
        </div>
        <button onClick={() => setActiveView('api-files')} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-accent bg-accent/10 hover:bg-accent/15 transition-colors flex items-center gap-1.5">
          <FolderOpen size={14} /> Browse files
        </button>
        <button onClick={reload} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-raised transition-colors">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-5 py-6 space-y-6">
          <section className="rounded-2xl border border-[var(--border)] bg-surface-raised/50 p-5 space-y-4">
            <h2 className="text-sm font-bold text-text-primary">New proposal</h2>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                {changeType === 'move' ? 'Source path (relative to comp/)' : 'Target path (relative to comp/)'}
              </label>
              <input value={filePath} onChange={e => setFilePath(e.target.value)} placeholder="Compilation/My Song.mp3"
                className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-surface-overlay px-4 py-2.5 text-sm font-mono text-text-primary focus:outline-none focus:border-accent" />
            </div>
            {changeType === 'move' && (
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Destination path (relative to comp/)</label>
                <input value={destinationPath} onChange={e => setDestinationPath(e.target.value)} placeholder="Compilation/Renamed Song.mp3"
                  className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-surface-overlay px-4 py-2.5 text-sm font-mono text-text-primary focus:outline-none focus:border-accent" />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {CHANGE_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setChangeType(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${changeType === opt.value ? 'bg-accent text-white' : 'bg-surface-overlay text-text-muted hover:text-text-primary'}`}>
                  <opt.icon size={13} /> {opt.label}
                </button>
              ))}
            </div>
            {changeType !== 'delete' && changeType !== 'move' && (
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">File</label>
                <div className="mt-1.5 flex items-center gap-3">
                  <input ref={fileInputRef} type="file" onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
                    className="text-sm text-text-muted file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-accent/15 file:text-accent file:text-xs file:font-semibold" />
                  {selectedFile && <span className="text-xs text-text-muted truncate">{selectedFile.name}</span>}
                </div>
              </div>
            )}
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Notes for reviewers (optional)"
              className="w-full rounded-xl border border-[var(--border)] bg-surface-overlay px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent resize-none" />
            {submitError && <p className="text-sm text-red-400 flex items-center gap-1.5"><AlertCircle size={14} />{submitError}</p>}
            <button onClick={submitProposal} disabled={submitState === 'submitting' || !filePath.trim() || (changeType === 'move' && !destinationPath.trim())}
              className="px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold disabled:opacity-40 flex items-center gap-2">
              {submitState === 'submitting' ? <Loader2 size={15} className="animate-spin" /> : submitState === 'submitted' ? <Check size={15} /> : <FileUp size={15} />}
              {submitState === 'submitted' ? 'Submitted' : 'Submit proposal'}
            </button>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {(['all', 'pending', 'approved', 'rejected'] as FilterTab[]).map(key => (
                <button key={key} onClick={() => setFilter(key)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-colors ${filter === key ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-primary'}`}>
                  {key}
                </button>
              ))}
            </div>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin text-text-muted" /></div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-8">No proposals yet.</p>
            ) : (
              <div className="space-y-2">
                {filtered.map(p => (
                  <div key={p.id} className="rounded-xl border border-[var(--border)] bg-surface-raised/40 px-4 py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <StatusChip status={p.status} />
                        <span className="text-[10px] uppercase font-bold text-text-muted bg-surface-overlay px-1.5 py-0.5 rounded">{p.change_type}</span>
                      </div>
                      <p className="text-sm font-mono text-text-primary truncate">{p.file_path}</p>
                      {p.change_type === 'move' && p.destination_path && (
                        <p className="text-xs font-mono text-text-muted truncate mt-0.5">→ {p.destination_path}</p>
                      )}
                      <p className="text-[11px] text-text-muted mt-1">{relativeTime(p.created_at)}{p.edit_count ? ` · ${p.edit_count} edit(s)` : ''}</p>
                    </div>
                    {p.status === 'pending' && (
                      <button onClick={() => withdraw(p.id)} disabled={withdrawingId === p.id}
                        className="p-2 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0">
                        {withdrawingId === p.id ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
