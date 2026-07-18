import { useEffect, useState, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Loader2, Trophy, FileEdit, ChevronLeft, Pencil, Trash2, RefreshCw, Plus, X, Check, AlertCircle, ChevronDown, ChevronUp, Search, Flag } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getMyProposals, getLeaderboard, withdrawProposal, createProposal, resubmitProposal, SongEditProposal, ProposalStatus } from '../lib/userApi'
import { apiFetch, JWApiEra } from '../lib/juicewrldApi'
import * as reportsApi from '../lib/reportsApi'
import type { SongReportRow, SongReportStatus } from '../lib/reportsApi'
import ReportsTab from './ReportsTab'

const CATEGORIES = [
  { value: 'released', label: 'Released' },
  { value: 'unreleased', label: 'Unreleased' },
  { value: 'unsurfaced', label: 'Unsurfaced' },
  { value: 'recording_session', label: 'Session' },
]
const CAT_PILL: Record<string, string> = {
  released: 'bg-emerald-500 text-white',
  unreleased: 'bg-accent text-white',
  unsurfaced: 'bg-yellow-500 text-black',
  recording_session: 'bg-zinc-500 text-white',
}

// Defined outside AddSongModal so its reference is stable across re-renders.
// If defined inside, React sees a new component type every render and unmounts/remounts
// the input DOM nodes, destroying focus.
function Field({ label, value, onChange, placeholder, mono = false }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean
}): JSX.Element {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-x-3 items-baseline px-4 py-[7px] border-l-2 transition-all border-transparent hover:bg-white/[0.04]">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted opacity-60 select-none truncate pt-px">{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || '—'}
        className={`flex-1 bg-transparent text-sm text-text-primary focus:outline-none placeholder:text-text-muted placeholder:opacity-25 min-w-0 border-b border-[var(--border)] pb-px focus:border-accent transition-colors ${mono ? 'font-mono' : ''}`} />
    </div>
  )
}

function AddSongModal({ onClose, onSubmitted }: { onClose: () => void; onSubmitted: () => void }): JSX.Element {
  const [name,    setName]    = useState('')
  const [artists, setArtists] = useState('')
  const [cat,     setCat]     = useState('')
  const [album,   setAlbum]   = useState('')
  const [eraId,   setEraId]   = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [altNames, setAltNames] = useState('')
  const [lyrics,   setLyrics]   = useState('')
  const [syncedLyrics, setSyncedLyrics] = useState('')
  const [prod,     setProd]     = useState('')
  const [engineer, setEngineer] = useState('')
  const [location, setLocation] = useState('')
  const [filePath, setFilePath] = useState('')
  const [previewDate, setPreviewDate] = useState('')
  const [leakType, setLeakType] = useState('')
  const [recDate,  setRecDate]  = useState('')
  const [relDate,  setRelDate]  = useState('')
  const [instrumentals,     setInstrumentals]     = useState('')
  const [instrumentalNames, setInstrumentalNames] = useState('')
  const [addInfo,  setAddInfo]  = useState('')
  const [notes,    setNotes]    = useState('')
  const [edNotes, setEdNotes] = useState('')
  const [showMore, setShowMore] = useState(false)
  const [eras, setEras] = useState<JWApiEra[]>([])
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'submitted' | 'error'>('idle')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    apiFetch<JWApiEra[] | { results: JWApiEra[] }>('/eras/')
      .then(d => setEras(Array.isArray(d) ? d : (d as { results: JWApiEra[] }).results ?? []))
      .catch(() => undefined)
  }, [])

  const proposed: Record<string, unknown> = {}
  if (name)    proposed.name                = name
  if (artists) proposed.credited_artists    = artists
  if (album)   proposed.album              = album
  if (cat)     proposed.category           = cat
  if (eraId)   proposed.era_id             = Number(eraId)
  if (imageUrl) proposed.image_url = imageUrl
  if (altNames) proposed.track_titles = altNames.split('\n').map(s => s.trim()).filter(Boolean)
  if (lyrics) proposed.lyrics = lyrics
  if (syncedLyrics) proposed.synced_lyrics = syncedLyrics
  if (prod)     proposed.producers           = prod
  if (engineer) proposed.engineers           = engineer
  if (location) proposed.recording_locations = location
  if (filePath) proposed.path                = filePath
  if (leakType) proposed.leak_type     = leakType
  if (recDate)  proposed.record_dates  = recDate
  if (relDate) proposed.release_date        = relDate
  if (previewDate) proposed.preview_date    = previewDate
  if (instrumentals)     proposed.instrumentals      = instrumentals
  if (instrumentalNames) proposed.instrumental_names = instrumentalNames
  // "Additional info" maps to additional_information — distinct from `notes`,
  // which previously had this textarea's value submitted under the wrong key.
  if (addInfo) proposed.additional_information = addInfo
  if (notes)   proposed.notes                  = notes

  const handleSubmit = async (): Promise<void> => {
    if (!name.trim() || submitState === 'submitting') return
    setSubmitState('submitting'); setSubmitError(null)
    try {
      await createProposal({ song: null, change_type: 'create', title: name.trim(), proposed_data: proposed, editor_notes: edNotes })
      setSubmitState('submitted')
      setTimeout(() => { onSubmitted(); onClose() }, 1200)
    } catch (e) {
      setSubmitState('error')
      setSubmitError(e instanceof Error ? e.message : 'Submission failed')
      setTimeout(() => setSubmitState('idle'), 4000)
    }
  }

  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-end justify-center" onClick={e => { if (e.target === overlayRef.current) onClose() }}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[var(--surface)] rounded-t-2xl shadow-2xl border border-[var(--border)] border-b-0 animate-slide-up flex flex-col max-h-[88dvh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-[var(--border)] shrink-0">
          <div className="w-8 h-8 rounded-xl bg-accent/15 border border-accent/20 flex items-center justify-center shrink-0">
            <Plus size={15} className="text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-text-primary font-bold text-sm">Propose new song</p>
            <p className="text-text-muted text-xs opacity-60 mt-0.5">Admins review and add it to the database</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-[var(--surface-overlay)] transition-colors shrink-0">
            <X size={15} />
          </button>
        </div>

        {/* Scrollable fields */}
        <div className="flex-1 overflow-y-auto min-h-0 py-2">
          <Field label="Title *" value={name} onChange={setName} placeholder="Song title" />
          <Field label="Artists" value={artists} onChange={setArtists} placeholder="Juice WRLD ft. …" />
          <Field label="Album" value={album} onChange={setAlbum} placeholder="Album name" />
          <Field label="Cover URL" value={imageUrl} onChange={setImageUrl} placeholder="https://…" mono />
          <div className="px-4 py-2 border-l-2 border-transparent">
            <div className="grid grid-cols-[80px_1fr] gap-x-3 items-start">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted opacity-60 select-none pt-1.5">Alt names</span>
              <textarea rows={2} value={altNames} onChange={e => setAltNames(e.target.value)} placeholder="One name per line"
                className="w-full bg-transparent text-sm text-text-primary focus:outline-none placeholder:text-text-muted placeholder:opacity-25 min-w-0 border-b border-[var(--border)] pb-px focus:border-accent transition-colors resize-none" />
            </div>
          </div>

          {/* Category pills */}
          <div className="px-4 py-2 border-l-2 border-transparent">
            <div className="grid grid-cols-[80px_1fr] gap-x-3 items-start">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted opacity-60 select-none pt-1.5">Category</span>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {CATEGORIES.map(c => (
                  <button key={c.value} onClick={() => setCat(prev => prev === c.value ? '' : c.value)}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all ${
                      cat === c.value ? CAT_PILL[c.value] : 'bg-[var(--surface-overlay)] text-text-muted hover:text-text-primary border border-[var(--border)]'
                    }`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Era select */}
          {eras.length > 0 && (
            <div className="grid grid-cols-[80px_1fr] gap-x-3 items-baseline px-4 py-[7px] border-l-2 border-transparent">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted opacity-60 select-none truncate pt-px">Era</span>
              <select value={eraId} onChange={e => setEraId(e.target.value)}
                className="flex-1 text-sm focus:outline-none appearance-none cursor-pointer min-w-0 border-b border-[var(--border)] pb-px"
                style={{ background: 'var(--surface)', color: 'var(--text-primary)' }}>
                <option value="" style={{ background: 'var(--surface)', color: 'var(--text-primary)' }}>—</option>
                {eras.map(e => <option key={e.id} value={String(e.id)} style={{ background: 'var(--surface)', color: 'var(--text-primary)' }}>{e.name}</option>)}
              </select>
            </div>
          )}

          <button onClick={() => setShowMore(v => !v)}
            className="flex items-center gap-1.5 w-full px-4 pt-3 pb-1 text-[11px] text-text-muted opacity-60 hover:opacity-80 transition-colors select-none">
            {showMore ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            {showMore ? 'Fewer fields' : 'More fields'}
          </button>

          {showMore && (
            <>
              <Field label="Producers" value={prod}     onChange={setProd}     placeholder="Producer names" />
              <Field label="Engineer"  value={engineer} onChange={setEngineer} placeholder="Engineer name" />
              <Field label="Location"  value={location} onChange={setLocation} placeholder="Recording location" />
              <Field label="File URL"  value={filePath} onChange={setFilePath} placeholder="Path/URL to the audio file" mono />
              <Field label="Leak type" value={leakType} onChange={setLeakType} placeholder="e.g. Stem, Master, Video…" />
              <Field label="Recorded"  value={recDate}  onChange={setRecDate}  placeholder="YYYY-MM-DD" mono />
              <Field label="Released"  value={relDate}  onChange={setRelDate}  placeholder="YYYY-MM-DD" mono />
              <Field label="Preview"   value={previewDate} onChange={setPreviewDate} placeholder="YYYY-MM-DD" mono />
              <Field label="Instrumentals" value={instrumentals} onChange={setInstrumentals} placeholder="Instrumental versions available" />
              <Field label="Inst. names" value={instrumentalNames} onChange={setInstrumentalNames} placeholder="Instrumental file names" />
              <div className="px-4 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted opacity-60 mb-1.5">Lyrics</p>
                <textarea rows={4} value={lyrics} onChange={e => setLyrics(e.target.value)} placeholder="Plain lyrics…"
                  className="w-full bg-[var(--surface-overlay)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none resize-none placeholder:text-text-muted placeholder:opacity-25 font-mono" />
              </div>
              <div className="px-4 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted opacity-60 mb-1.5">Synced lyrics</p>
                <textarea rows={4} value={syncedLyrics} onChange={e => setSyncedLyrics(e.target.value)} placeholder="[mm:ss.xx] line…"
                  className="w-full bg-[var(--surface-overlay)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none resize-none placeholder:text-text-muted placeholder:opacity-25 font-mono" />
              </div>
              <div className="px-4 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted opacity-60 mb-1.5">Additional info</p>
                <textarea rows={3} value={addInfo} onChange={e => setAddInfo(e.target.value)} placeholder="Any other info…"
                  className="w-full bg-[var(--surface-overlay)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none resize-none placeholder:text-text-muted placeholder:opacity-25" />
              </div>
              <div className="px-4 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted opacity-60 mb-1.5">Notes</p>
                <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes…"
                  className="w-full bg-[var(--surface-overlay)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none resize-none placeholder:text-text-muted placeholder:opacity-25" />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[var(--border)] px-5 py-4 space-y-3">
          <input value={edNotes} onChange={e => setEdNotes(e.target.value)} placeholder="Editor notes (optional)…"
            className="w-full bg-[var(--surface-overlay)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs text-text-primary placeholder:text-text-muted placeholder:opacity-30 focus:outline-none focus:border-accent/40 transition-colors" />
          {submitError && (
            <div className="flex items-center gap-2 text-red-400 text-xs">
              <AlertCircle size={12} className="shrink-0" /> {submitError}
            </div>
          )}
          <button onClick={handleSubmit} disabled={!name.trim() || submitState === 'submitting' || submitState === 'submitted'}
            className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              submitState === 'submitted' ? 'bg-emerald-500/20 text-emerald-400' :
              submitState === 'error'     ? 'bg-red-500/20 text-red-400' :
              !name.trim()                ? 'bg-[var(--surface-overlay)] text-text-muted opacity-40 cursor-not-allowed' :
              'bg-accent text-white hover:bg-accent/90 shadow-lg shadow-accent/20'
            }`}>
            {submitState === 'submitting' && <Loader2 size={14} className="animate-spin" />}
            {submitState === 'submitted'  && <Check size={14} />}
            {submitState === 'error'      && <AlertCircle size={14} />}
            {submitState === 'idle'       && 'Submit proposal'}
            {submitState === 'submitting' && 'Submitting…'}
            {submitState === 'submitted'  && 'Submitted!'}
            {submitState === 'error'      && 'Try again'}
          </button>
        </div>
      </div>
    </div>
  )
}

type LeaderboardEntry = {
  rank: number
  user_id: number
  username: string
  discord_username: string
  discord_avatar: string
  approved_count: number
  badges: Array<{ slug: string; name: string; icon: string; description: string; category: string; note: string; awarded_at: string; awarded_by_username: string | null }>
}

const STATUS_STYLES: Record<ProposalStatus, { label: string; bar: string; badge: string }> = {
  pending:  { label: 'Pending',  bar: 'bg-yellow-400',  badge: 'bg-yellow-500/15 text-yellow-400' },
  approved: { label: 'Approved', bar: 'bg-green-400',   badge: 'bg-green-500/15 text-green-400' },
  rejected: { label: 'Rejected', bar: 'bg-red-400',     badge: 'bg-red-500/15 text-red-400' },
  reversed: { label: 'Reversed', bar: 'bg-surface-overlay', badge: 'bg-surface-overlay text-text-muted' },
}

const RANK_STYLES: Record<number, { num: string; badge: string }> = {
  1: { num: 'text-yellow-400 font-black', badge: 'bg-yellow-500/15 ring-1 ring-yellow-500/30' },
  2: { num: 'text-slate-300 font-black',  badge: 'bg-slate-500/15 ring-1 ring-slate-400/30' },
  3: { num: 'text-amber-600 font-black',  badge: 'bg-amber-700/15 ring-1 ring-amber-600/30' },
}

type FilterTab = 'all' | ProposalStatus

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function changeTypeLabel(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function EditorProfileView(): JSX.Element {
  const isElectron = navigator.userAgent.includes('Electron')
  const { account, setActiveView, setPendingEditorSongId, setPendingEditProposal } = useStore(useShallow(s => ({
    account: s.account,
    setActiveView: s.setActiveView,
    setPendingEditorSongId: s.setPendingEditorSongId,
    setPendingEditProposal: s.setPendingEditProposal,
  })))

  const [proposals, setProposals] = useState<SongEditProposal[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loadingProposals, setLoadingProposals] = useState(true)
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true)
  const [filter, setFilter] = useState<FilterTab>('all')
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [resubmittingId, setResubmittingId] = useState<number | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [showAddSong, setShowAddSong] = useState(false)

  // Reports review (moved out of the Admin sidebar entry for editor-only
  // accounts — it now lives as a tab alongside their own proposals).
  const canReviewReports = !!(account?.is_editor || account?.is_administrator)
  const [profileTab, setProfileTab] = useState<'proposals' | 'reports'>('proposals')
  const [reportStatus, setReportStatus] = useState<SongReportStatus | ''>('pending')
  const [reports, setReports] = useState<SongReportRow[]>([])
  const [loadingReports, setLoadingReports] = useState(false)

  useEffect(() => {
    if (profileTab !== 'reports' || !canReviewReports) return
    setLoadingReports(true)
    reportsApi.listSongReports(reportStatus || undefined)
      .then(setReports)
      .catch(() => {})
      .finally(() => setLoadingReports(false))
  }, [profileTab, reportStatus, refreshKey, canReviewReports])

  const handleDelete = async (id: number): Promise<void> => {
    setDeletingId(id)
    try {
      await withdrawProposal(id)
      setProposals(prev => prev.filter(p => p.id !== id))
    } catch (e) { console.error('withdraw failed:', e) }
    finally { setDeletingId(null) }
  }

  const handleResubmit = async (p: SongEditProposal): Promise<void> => {
    setResubmittingId(p.id)
    try {
      const fresh = await resubmitProposal(p)
      setProposals(prev => [fresh, ...prev.filter(x => x.id !== p.id)])
    } catch (e) { console.error('resubmit failed:', e) }
    finally { setResubmittingId(null) }
  }

  const handleEdit = (p: SongEditProposal): void => {
    // p.song is null for 'create' proposals (new song, no backing record yet) —
    // EditorPage handles that case, so don't block it here.
    setPendingEditProposal({ id: p.id, songId: p.song, proposedData: p.proposed_data, editorNotes: p.editor_notes || '' })
    setPendingEditorSongId(p.song)
    setActiveView('editor')
  }

  useEffect(() => {
    setRefreshing(true)
    Promise.all([
      getMyProposals().then(setProposals).catch(() => {}),
      getLeaderboard().then((data) => setLeaderboard(data as LeaderboardEntry[])).catch(() => {}),
    ]).finally(() => {
      setLoadingProposals(false)
      setLoadingLeaderboard(false)
      setRefreshing(false)
    })
  }, [refreshKey])

  const myEntry = leaderboard.find((e) => e.discord_username === account?.discord_username)

  // Searchable text for a proposal: its title, change type, notes, song id,
  // and any string/number values in the proposed data (name, artists, album,
  // producers, etc.) so a query matches whatever the proposal actually edits.
  const proposalSearchText = (p: SongEditProposal): string => {
    const dataVals = Object.values(p.proposed_data ?? {})
      .filter(v => typeof v === 'string' || typeof v === 'number')
      .join(' ')
    return [p.title, changeTypeLabel(p.change_type), p.editor_notes, p.song != null ? `song #${p.song}` : '', dataVals]
      .filter(Boolean).join(' ').toLowerCase()
  }

  const filteredProposals = useMemo(() => {
    const byStatus = filter === 'all' ? proposals : proposals.filter(p => p.status === filter)
    const q = search.trim().toLowerCase()
    if (!q) return byStatus
    return byStatus.filter(p => proposalSearchText(p).includes(q))
  }, [proposals, filter, search])

  const TABS: { key: FilterTab; label: string }[] = [
    { key: 'all',      label: 'All' },
    { key: 'pending',  label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
  ]

  const tabCount = (tab: FilterTab) => tab === 'all' ? proposals.length : proposals.filter(p => p.status === tab).length

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

      {/* ── Header ── */}
      {/* The "Edit albums"/"New song" buttons are right-aligned here, which in
          Electron sits directly under the fixed window-control buttons
          (minimize/maximize/close, 28px tall) — the app's `main` element
          doesn't otherwise reserve space for them, it just draws a drag
          region behind the content. Extra top padding pushes this row
          below that band instead of overlapping it. */}
      <div className={`px-6 pb-5 border-b border-[var(--border)] shrink-0 ${isElectron ? 'pt-9' : 'pt-5'}`}>
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setActiveView('api-tracker')}
            className="flex items-center gap-1.5 text-text-muted hover:text-text-primary text-xs transition-colors"
          >
            <ChevronLeft size={14} /> Back
          </button>
          <div className="flex items-center gap-1.5">
            {(account?.is_editor || account?.is_administrator) && (
              <>
                <button
                  onClick={() => setActiveView('albums-admin')}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-raised hover:bg-surface-highest text-text-secondary hover:text-text-primary text-xs font-semibold transition-colors"
                  title="Edit albums (wrlddata.json)"
                >
                  Edit albums
                </button>
                <button
                  onClick={() => setShowAddSong(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-accent/15 hover:bg-accent/25 text-accent text-xs font-semibold transition-colors"
                  title="Propose a new song"
                >
                  <Plus size={12} /> New song
                </button>
              </>
            )}
            <button
              onClick={() => setRefreshKey(k => k + 1)}
              disabled={refreshing}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-[var(--surface-raised)] transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {account?.discord_avatar ? (
            <img src={account.discord_avatar} alt="" className="w-14 h-14 rounded-full object-cover shrink-0 ring-2 ring-[var(--border)]" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xl font-bold shrink-0">
              {(account?.display_name || account?.discord_username || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-text-primary text-xl font-bold truncate">
                {account?.display_name || account?.discord_username || 'My Profile'}
              </h1>
              {account?.is_administrator && (
                <span className="px-1.5 py-0.5 rounded bg-accent/15 text-accent text-[10px] font-semibold uppercase tracking-wide shrink-0">Admin</span>
              )}
              {account?.is_editor && !account.is_administrator && (
                <span className="px-1.5 py-0.5 rounded bg-surface-overlay text-text-secondary text-[10px] font-semibold uppercase tracking-wide shrink-0">Editor</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {myEntry && (
                <p className="text-text-muted text-xs flex items-center gap-1.5">
                  <Trophy size={11} className="text-accent" />
                  Rank #{myEntry.rank} · {myEntry.approved_count} approved
                </p>
              )}
              {!loadingProposals && (
                <p className="text-text-muted opacity-60 text-xs">{proposals.length} proposal{proposals.length !== 1 ? 's' : ''} submitted</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      {canReviewReports && (
        <div className="flex items-center gap-1 px-6 pt-3 shrink-0 border-b border-[var(--border)]">
          {([
            { id: 'proposals' as const, label: 'Proposals', icon: <FileEdit size={13} /> },
            { id: 'reports'   as const, label: 'Reports',   icon: <Flag size={13} /> },
          ]).map(t => (
            <button key={t.id} onClick={() => setProfileTab(t.id)}
              className={`relative flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-medium transition-colors border-b-2 ${
                profileTab === t.id
                  ? 'text-accent border-accent'
                  : 'text-text-muted hover:text-text-primary border-transparent'
              }`}>
              <span className={profileTab === t.id ? 'text-accent' : ''}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {profileTab === 'reports' && canReviewReports ? (
        <div className="flex-1 overflow-hidden p-5">
          <div className="h-full rounded-2xl border border-[var(--border)] bg-surface-raised/40 overflow-hidden relative">
            {loadingReports && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--bg)]/60 backdrop-blur-[1px]">
                <Loader2 size={20} className="animate-spin text-text-muted" />
              </div>
            )}
            <ReportsTab
              reports={reports}
              status={reportStatus}
              setStatus={setReportStatus}
              onChanged={() => setRefreshKey(k => k + 1)}
            />
          </div>
        </div>
      ) : (
      <div className="flex-1 flex gap-5 overflow-hidden p-5">

        {/* ── Left: My Proposals ── */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-surface-raised/40">
          {/* Section header */}
          <div className="px-5 pt-4 pb-3 shrink-0 border-b border-[var(--border)]">
            <div className="flex items-center gap-2 mb-3">
              <FileEdit size={13} className="text-text-muted" />
              <h2 className="text-text-secondary text-xs font-semibold uppercase tracking-widest">My Proposals</h2>
              {!loadingProposals && (
                <span className="ml-auto text-text-muted text-xs">{proposals.length} total</span>
              )}
            </div>

            {/* Search */}
            <div className="relative mb-3">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search proposals…"
                className="w-full bg-surface-overlay text-text-primary text-xs pl-7 pr-7 py-2 rounded-lg outline-none border border-transparent focus:ring-1 ring-accent focus:border-accent/40 placeholder:text-text-muted"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1">
              {TABS.map(({ key, label }) => {
                const count = tabCount(key)
                const active = filter === key
                return (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      active ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-primary hover:bg-surface-overlay'
                    }`}
                  >
                    {label}
                    {count > 0 && (
                      <span className={`text-[10px] tabular-nums ${active ? 'text-accent/70' : 'text-text-muted'}`}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Proposals list */}
          <div className="flex-1 overflow-y-auto min-h-0 p-3">
            {loadingProposals ? (
              <div className="flex justify-center py-12">
                <Loader2 size={18} className="animate-spin text-text-muted" />
              </div>
            ) : filteredProposals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-text-muted opacity-50">
                <FileEdit size={28} />
                <p className="text-sm">
                  {search.trim()
                    ? `No proposals match "${search.trim()}"`
                    : filter === 'all' ? 'No proposals yet' : `No ${filter} proposals`}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredProposals.map((p) => {
                  const s = STATUS_STYLES[p.status]
                  return (
                    <div key={p.id} className="flex items-stretch gap-0 rounded-xl overflow-hidden bg-surface/60 border border-[var(--border)] hover:border-accent/30 transition-colors group">
                      {/* Status bar */}
                      <div className={`w-1 shrink-0 ${s.bar}`} />
                      <div className="flex items-center gap-3 px-3.5 py-3 flex-1 min-w-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-text-primary text-sm font-medium truncate">{p.title || `Song #${p.song}`}</p>
                          <p className="text-text-muted text-xs mt-0.5">{changeTypeLabel(p.change_type)} · {formatDate(p.created_at)}</p>
                        </div>
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${s.badge}`}>
                          {s.label}
                        </span>
                        {p.status === 'pending' && (
                          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleEdit(p)}
                              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-raised transition-all"
                              title="Edit proposal"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={() => handleResubmit(p)}
                              disabled={resubmittingId === p.id || deletingId === p.id}
                              className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-all disabled:opacity-40"
                              title="Resubmit proposal (withdraws and re-submits fresh)"
                            >
                              {resubmittingId === p.id
                                ? <Loader2 size={12} className="animate-spin" />
                                : <RefreshCw size={12} />
                              }
                            </button>
                            <button
                              onClick={() => handleDelete(p.id)}
                              disabled={deletingId === p.id || resubmittingId === p.id}
                              className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-40"
                              title="Withdraw proposal"
                            >
                              {deletingId === p.id
                                ? <Loader2 size={12} className="animate-spin" />
                                : <Trash2 size={12} />
                              }
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Leaderboard ── */}
        <div className="w-80 flex flex-col min-h-0 overflow-hidden shrink-0 rounded-2xl border border-[var(--border)] bg-surface-raised/40">
          <div className="px-5 pt-4 pb-3 shrink-0 flex items-center gap-2 border-b border-[var(--border)]">
            <Trophy size={13} className="text-text-muted" />
            <h2 className="text-text-secondary text-xs font-semibold uppercase tracking-widest">Leaderboard</h2>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 p-3">
            {loadingLeaderboard ? (
              <div className="flex justify-center py-12">
                <Loader2 size={18} className="animate-spin text-text-muted" />
              </div>
            ) : leaderboard.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-text-muted opacity-50">
                <Trophy size={28} />
                <p className="text-sm">No data</p>
              </div>
            ) : (
              <div className="space-y-1">
                {leaderboard.map((entry) => {
                  const isMe = entry.discord_username === account?.discord_username
                  const rankStyle = RANK_STYLES[entry.rank]
                  return (
                    <div
                      key={entry.user_id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                        isMe ? 'bg-accent/8 ring-1 ring-accent/20' : 'hover:bg-surface-overlay'
                      }`}
                    >
                      {/* Rank */}
                      <span className={`w-5 shrink-0 flex items-center justify-center`}>
                        <span className={`text-xs tabular-nums rounded-md px-1 py-0.5 ${
                          rankStyle ? `${rankStyle.num} ${rankStyle.badge}` : 'text-text-muted font-medium'
                        }`}>
                          {entry.rank}
                        </span>
                      </span>

                      {/* Avatar */}
                      {entry.discord_avatar ? (
                        <img src={entry.discord_avatar} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-surface-raised flex items-center justify-center text-xs text-text-muted shrink-0">
                          {(entry.discord_username || '?').charAt(0).toUpperCase()}
                        </div>
                      )}

                      {/* Name */}
                      <p className={`flex-1 min-w-0 text-sm truncate ${isMe ? 'text-accent font-semibold' : 'text-text-primary'}`}>
                        {entry.username || entry.discord_username}
                        {isMe && <span className="ml-1.5 text-xs opacity-60 font-normal">you</span>}
                      </p>

                      {/* Approved count */}
                      <span className={`text-xs tabular-nums shrink-0 font-semibold ${isMe ? 'text-accent' : rankStyle ? rankStyle.num : 'text-text-muted'}` }>
                        {entry.approved_count}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {showAddSong && (
        <AddSongModal
          onClose={() => setShowAddSong(false)}
          onSubmitted={() => setRefreshKey(k => k + 1)}
        />
      )}
    </div>
  )
}
