import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  ChevronLeft, Users, Clock, CheckCircle, XCircle, ShieldCheck, BarChart2,
  Loader2, RefreshCw, FileEdit, KeyRound, Check, AlertCircle, RotateCcw,
  ChevronDown, ChevronUp, Shield, TrendingUp, MessageSquare, Calendar,
  Hash, Minus, Plus, UserCheck, FileCheck, Activity, Pencil, X as XIcon, ChevronDown as ChevronDownIcon,
  Flag, Music2,
} from 'lucide-react'
import { useStore, useStorePick } from '../store/useStore'
import * as userApi from '../lib/userApi'
import type { EditorApplication, SongEditProposal, AdminUser, ProposalStatus } from '../lib/userApi'
import * as reportsApi from '../lib/reportsApi'
import type { SongReportRow, SongReportStatus } from '../lib/reportsApi'
import { apiFetch, buildImageUrl } from '../lib/juicewrldApi'
import type { JWApiSong } from '../lib/juicewrldApi'
import { invalidateLyricsCache } from './Player'

type Tab = 'proposals' | 'applications' | 'reports' | 'users' | 'stats' | 'security'

// ── Utilities ─────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function shortDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function renderValue(v: unknown): string {
  if (v == null || v === '') return '(empty)'
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.length ? v.join('\n') : '(empty)'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return JSON.stringify(v, null, 2)
}

const LONG_KEYS = new Set(['lyrics', 'synced_lyrics', 'description', 'notes', 'additional_information'])
const LONG_THRESHOLD = 200

const STATUS_STYLE: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  pending:  { bg: 'bg-amber-500/10',   text: 'text-amber-400',   dot: 'bg-amber-400',   border: 'border-l-amber-500/60' },
  approved: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400', border: 'border-l-emerald-500/60' },
  resolved: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400', border: 'border-l-emerald-500/60' },
  rejected: { bg: 'bg-red-500/10',     text: 'text-red-400',     dot: 'bg-red-400',     border: 'border-l-red-500/50' },
  reversed: { bg: 'bg-zinc-500/10',    text: 'text-zinc-400',    dot: 'bg-zinc-500',    border: 'border-l-zinc-500/40' },
}

function StatusChip({ status }: { status: string }): JSX.Element {
  const s = STATUS_STYLE[status] ?? { bg: 'bg-surface-raised', text: 'text-text-muted', dot: 'bg-text-muted', border: '' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  )
}

function Avatar({ src, name, size = 8 }: { src?: string; name: string; size?: number }): JSX.Element {
  const cls = `w-${size} h-${size} rounded-full shrink-0`
  return src
    ? <img src={src} alt="" className={`${cls} object-cover`} />
    : <div className={`${cls} bg-accent/20 text-accent flex items-center justify-center text-xs font-bold`}>
        {(name || '?')[0].toUpperCase()}
      </div>
}

function Empty({ label }: { label: string }): JSX.Element {
  return <div className="flex items-center justify-center h-full text-text-muted text-sm">{label}</div>
}

// ── Diff ──────────────────────────────────────────────────────────────────────

function FieldDiff({ fieldKey, before, after }: { fieldKey: string; before: unknown; after: unknown }): JSX.Element {
  const beforeStr = renderValue(before)
  const afterStr  = renderValue(after)
  const unchanged = beforeStr === afterStr
  const isLong    = LONG_KEYS.has(fieldKey) || beforeStr.length > LONG_THRESHOLD || afterStr.length > LONG_THRESHOLD
  // synced_lyrics is LRC — default expanded so content is visible immediately
  const [exp, setExp] = useState(!isLong || fieldKey === 'synced_lyrics')
  const MAX = fieldKey === 'synced_lyrics' ? 60 : 8

  const sliceLong = (s: string) => {
    const lines = s.split('\n')
    if (exp || lines.length <= MAX) return { lines, clipped: false }
    return { lines: lines.slice(0, MAX), clipped: true, total: lines.length }
  }

  const b = sliceLong(beforeStr)
  const a = sliceLong(afterStr)
  const hasBefore = before !== undefined && !unchanged
  const sideBySide = hasBefore && !unchanged

  return (
    <div className="rounded-lg overflow-hidden border border-[var(--border)] text-[11px]">
      {/* Field header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-raised border-b border-[var(--border)]">
        <span className="font-mono text-[10px] text-text-muted tracking-tight">{fieldKey.replace(/_/g, ' ')}</span>
        <div className="flex items-center gap-2">
          {unchanged && <span className="text-[9px] italic text-text-muted">unchanged</span>}
          {isLong && (
            <button onClick={() => setExp(e => !e)} className="text-[10px] text-accent/70 hover:text-accent">
              {exp ? 'collapse' : 'expand'}
            </button>
          )}
        </div>
      </div>

      {/* Side-by-side before / after */}
      {sideBySide && (
        <div className="grid grid-cols-2 divide-x divide-[var(--border)]">
          {/* Before */}
          <div className="bg-red-500/8 min-w-0">
            <div className="flex items-center gap-1.5 px-3 py-1 border-b border-red-500/15">
              <Minus size={9} className="text-red-500 shrink-0" />
              <span className="text-[9px] font-bold uppercase tracking-wide text-red-500">Before</span>
            </div>
            <div className="px-3 py-2">
              {b.lines.map((line, i) => (
                <pre key={i} className="font-mono text-red-500 whitespace-pre-wrap break-words leading-relaxed">{line || ' '}</pre>
              ))}
              {'clipped' in b && b.clipped && (
                <p className="text-[9px] text-red-400 italic mt-1">+{(b as { total?: number }).total! - MAX} more lines</p>
              )}
            </div>
          </div>

          {/* After */}
          <div className="bg-emerald-500/8 min-w-0">
            <div className="flex items-center gap-1.5 px-3 py-1 border-b border-emerald-500/15">
              <Plus size={9} className="text-emerald-600 shrink-0" />
              <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-600">After</span>
            </div>
            <div className="px-3 py-2">
              {a.lines.map((line, i) => (
                <pre key={i} className="font-mono text-emerald-600 whitespace-pre-wrap break-words leading-relaxed">{line || ' '}</pre>
              ))}
              {'clipped' in a && a.clipped && (
                <p className="text-[9px] text-emerald-500 italic mt-1">+{(a as { total?: number }).total! - MAX} more lines</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New value only (no snapshot) */}
      {!unchanged && !hasBefore && (
        <div className="bg-emerald-500/8">
          <div className="flex items-center gap-1.5 px-3 py-1 border-b border-emerald-500/15">
            <Plus size={9} className="text-emerald-600 shrink-0" />
            <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-600">Value</span>
          </div>
          <div className="px-3 py-2">
            {a.lines.map((line, i) => (
              <pre key={i} className="font-mono text-emerald-600 whitespace-pre-wrap break-words leading-relaxed">{line || ' '}</pre>
            ))}
          </div>
        </div>
      )}

      {/* Unchanged */}
      {unchanged && (
        <div className="px-3 py-2">
          <pre className="font-mono text-text-muted whitespace-pre-wrap break-words leading-relaxed">
            {exp ? afterStr : afterStr.slice(0, 120) + (afterStr.length > 120 ? '…' : '')}
          </pre>
        </div>
      )}
    </div>
  )
}

function ProposalDiff({ proposal }: { proposal: SongEditProposal }): JSX.Element {
  const entries = Object.entries(proposal.proposed_data || {})
  if (!entries.length) return <p className="text-text-muted text-xs italic p-4">No field data.</p>
  const snap = proposal.original_snapshot || {}
  return (
    <div className="space-y-2 p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-3">
        Changes · {entries.length} field{entries.length !== 1 ? 's' : ''}
      </p>
      {entries.map(([k, v]) => <FieldDiff key={k} fieldKey={k} before={snap[k]} after={v} />)}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminPage(): JSX.Element {
  const { account, setActiveView, loadAccount, showNowPlaying, showQueue } = useStorePick('account', 'setActiveView', 'loadAccount', 'showNowPlaying', 'showQueue')
  // The header's rightmost controls (refresh + tabs) sit at the same corner
  // as the custom frameless-window buttons (see WindowControls in App.tsx,
  // fixed top-right). Without extra clearance they render underneath them —
  // only needed when this page actually reaches the window's right edge, i.e.
  // no side panel is open to its right (mirrors NowPlaying's same check).
  const isElectron = navigator.userAgent.includes('Electron')
  const needsWindowControlClearance = isElectron && !showNowPlaying && !showQueue
  const isAdmin    = !!account?.is_administrator
  // Editors get the user-reports review tab only — the /reports/ endpoints
  // accept editor tokens, everything else here is admin-scoped.
  const isEditor   = !!account?.is_editor
  const otpEnabled = !!account?.otp_enabled

  const [tab,          setTab]          = useState<Tab>(account?.is_administrator ? 'proposals' : 'reports')
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [refreshKey,   setRefreshKey]   = useState(0)
  const [applications, setApplications] = useState<EditorApplication[]>([])
  const [propStatus,   setPropStatus]   = useState<ProposalStatus | ''>('pending')
  const [proposals,    setProposals]    = useState<SongEditProposal[]>([])
  const [users,        setUsers]        = useState<AdminUser[]>([])
  const [reportStatus, setReportStatus] = useState<SongReportStatus | ''>('pending')
  const [reports,      setReports]      = useState<SongReportRow[]>([])

  const load = useCallback(async () => {
    if (!isAdmin && !isEditor) return
    setLoading(true); setError(null)
    try {
      if (tab === 'proposals') {
        setProposals(await userApi.adminListProposals(propStatus || undefined))
      } else if (tab === 'applications') {
        setApplications(await userApi.adminListApplications())
      } else if (tab === 'reports') {
        setReports(await reportsApi.listSongReports(reportStatus || undefined))
      } else if (tab === 'users' || tab === 'stats') {
        setUsers(await userApi.adminListUsers())
        if (tab === 'stats') {
          setApplications(await userApi.adminListApplications())
          setProposals(await userApi.adminListProposals())
        }
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }, [tab, isAdmin, propStatus, reportStatus])

  useEffect(() => { load() }, [load, refreshKey])

  // An editor-only account can never sit on an admin tab (e.g. state left
  // over from a role change) — snap back to the one tab they can use.
  useEffect(() => {
    if (!isAdmin && isEditor && tab !== 'reports') setTab('reports')
  }, [isAdmin, isEditor, tab])

  if (!isAdmin && !isEditor) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
      <Shield size={28} className="text-text-muted" />
      <p className="text-text-primary font-semibold text-sm">Admins & editors only</p>
      <button onClick={() => setActiveView('api-tracker')} className="text-xs text-accent hover:underline">Go back</button>
    </div>
  )

  // OTP is an admin requirement — editor-only accounts go straight to Reports.
  if (isAdmin && !otpEnabled) return (
    <div className="flex-1 overflow-y-auto flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <OtpSetupPanel onEnabled={async () => { await loadAccount() }} />
      </div>
    </div>
  )

  const pendingApps    = applications.filter(a => a.status === 'pending').length
  const pendingProps   = tab !== 'proposals' ? proposals.filter(p => p.status === 'pending').length : 0
  const pendingReports = tab !== 'reports' ? reports.filter(r => r.status === 'pending').length : 0

  type NavItem = { id: Tab; label: string; icon: React.ReactNode; badge?: number }
  const nav: NavItem[] = isAdmin ? [
    { id: 'proposals',    label: 'Proposals',    icon: <FileEdit size={13} />,   badge: pendingProps || undefined },
    { id: 'applications', label: 'Applications', icon: <Clock size={13} />,      badge: pendingApps || undefined },
    { id: 'reports',      label: 'Reports',      icon: <Flag size={13} />,       badge: pendingReports || undefined },
    { id: 'users',        label: 'Users',        icon: <Users size={13} /> },
    { id: 'stats',        label: 'Stats',        icon: <TrendingUp size={13} /> },
    { id: 'security',     label: 'Security',     icon: <Shield size={13} /> },
  ] : [
    { id: 'reports',      label: 'Reports',      icon: <Flag size={13} /> },
  ]

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-6 pb-0 border-b border-[var(--border)]"
        style={{ paddingTop: needsWindowControlClearance ? 36 : 16, paddingRight: needsWindowControlClearance ? 148 : undefined }}>
        <button onClick={() => setActiveView('api-tracker')}
          className="p-1.5 rounded-lg hover:bg-surface-overlay transition-colors text-text-muted hover:text-text-primary mb-3">
          <ChevronLeft size={16} />
        </button>
        <div className="flex-1 mb-3">
          <span className="text-text-primary font-bold text-sm">{isAdmin ? 'Admin' : 'Reports'}</span>
          {account?.discord_username && (
            <span className="text-text-muted text-xs ml-2">{account.discord_username}</span>
          )}
        </div>
        <button onClick={() => setRefreshKey(k => k + 1)} disabled={loading}
          className="p-1.5 rounded-lg hover:bg-surface-overlay transition-colors text-text-muted hover:text-text-primary mb-3 disabled:opacity-40">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>

        {/* Tabs */}
        <div className="flex items-end gap-0 ml-2">
          {nav.map(n => (
            <button key={n.id} onClick={() => setTab(n.id)}
              className={`relative flex items-center gap-1.5 px-4 py-3 text-[12px] font-medium transition-colors border-b-2 ${
                tab === n.id
                  ? 'text-accent border-accent'
                  : 'text-text-muted hover:text-text-primary border-transparent'
              }`}>
              <span className={tab === n.id ? 'text-accent' : ''}>{n.icon}</span>
              {n.label}
              {n.badge ? (
                <span className="bg-accent text-[var(--bg)] text-[9px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1">
                  {n.badge > 9 ? '9+' : n.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-3 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs shrink-0">
          <AlertCircle size={13} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* The tab body stays mounted through a reload (switching the reports/
          proposals status filter, hitting refresh, etc.) instead of being
          replaced by a spinner — that was unmounting things like the status
          filter chips and each tab's local state (selection, draft notes,
          cached song lookups) on every refetch. A translucent overlay signals
          the load without tearing the UI down. */}
      <div className="flex-1 overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--bg)]/60 backdrop-blur-[1px]">
            <Loader2 size={20} className="animate-spin text-text-muted" />
          </div>
        )}
        {tab === 'proposals'    && <ProposalsTab proposals={proposals} status={propStatus} setStatus={setPropStatus} onChanged={() => setRefreshKey(k => k + 1)} />}
        {tab === 'applications' && <ApplicationsTab applications={applications} onChanged={() => setRefreshKey(k => k + 1)} />}
        {tab === 'reports'      && <ReportsTab reports={reports} status={reportStatus} setStatus={setReportStatus} onChanged={() => setRefreshKey(k => k + 1)} />}
        {tab === 'users'        && <UsersTab users={users} onChanged={() => setRefreshKey(k => k + 1)} currentUserId={account?.id} />}
        {tab === 'stats'        && <StatsTab applications={applications} proposals={proposals} users={users} />}
        {tab === 'security'     && <SecurityTab />}
      </div>
    </div>
  )
}


// ── Revise Panel ──────────────────────────────────────────────────────────────

const TEXTAREA_FIELDS = new Set(['lyrics', 'synced_lyrics', 'notes', 'additional_information', 'description'])
const ALL_SONG_FIELDS = [
  'name','track_titles','credited_artists','producers','engineers',
  'recording_locations','record_dates','length','bitrate','additional_information',
  'file_names','instrumentals','instrumental_names','preview_date','release_date',
  'dates','session_titles','session_tracking','lyrics','synced_lyrics',
  'album','date_leaked','leak_type',
]

function RevisePanel({ proposal, onClose, onDone }: {
  proposal: SongEditProposal
  onClose: () => void
  onDone:  () => void
}): JSX.Element {
  const [fields,  setFields]  = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    Object.entries(proposal.proposed_data || {}).forEach(([k, v]) => {
      init[k] = Array.isArray(v) ? v.join('\n') : (typeof v === 'string' ? v : JSON.stringify(v))
    })
    return init
  })
  const [reviewNote, setReviewNote] = useState('')
  const [addKey,     setAddKey]     = useState('')
  const [saving,     setSaving]     = useState(false)
  const [err,        setErr]        = useState<string | null>(null)

  // Fields that are available to add (in snapshot but not already in the working set)
  const snap = proposal.original_snapshot || {}
  const available = ALL_SONG_FIELDS.filter(k => !(k in fields))

  const addField = (key: string) => {
    if (!key) return
    const snapVal = snap[key]
    const init = Array.isArray(snapVal) ? (snapVal as string[]).join('\n')
                : typeof snapVal === 'string' ? snapVal : ''
    setFields(f => ({ ...f, [key]: init }))
    setAddKey('')
  }

  const removeField = (key: string) => {
    setFields(f => { const n = { ...f }; delete n[key]; return n })
  }

  const submit = async () => {
    setSaving(true); setErr(null)
    try {
      // Convert back — track_titles is array
      const revised_data: Record<string, unknown> = {}
      Object.entries(fields).forEach(([k, v]) => {
        if (k === 'track_titles') {
          revised_data[k] = v.split('\n').map(s => s.trim()).filter(Boolean)
        } else {
          revised_data[k] = v
        }
      })
      await userApi.adminReviewProposal(proposal.id, {
        action: 'revise',
        review_notes: reviewNote,
        revised_data,
      })
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to revise')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden border-l-2 border-accent/30 bg-[var(--surface)]">
      {/* Panel header */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-raised)]">
        <Pencil size={13} className="text-accent" />
        <span className="text-text-primary text-xs font-semibold flex-1">Revise proposal</span>
        <button onClick={onClose} className="p-1 rounded text-text-muted hover:text-text-primary transition-colors">
          <XIcon size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Field editors */}
        {Object.entries(fields).map(([key, val]) => (
          <div key={key} className="rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--surface-raised)] border-b border-[var(--border)]">
              <span className="font-mono text-[10px] text-text-muted flex-1">{key.replace(/_/g, ' ')}</span>
              <button onClick={() => removeField(key)} className="text-[10px] text-red-400 hover:text-red-300 transition-colors">
                remove
              </button>
            </div>
            {TEXTAREA_FIELDS.has(key) ? (
              <textarea
                value={val}
                onChange={e => setFields(f => ({ ...f, [key]: e.target.value }))}
                rows={key === 'lyrics' || key === 'synced_lyrics' ? 10 : 4}
                className="w-full bg-[var(--surface)] text-text-primary text-xs font-mono px-3 py-2.5 resize-none focus:outline-none focus:bg-[var(--surface-raised)] transition-colors"
              />
            ) : (
              <input
                type="text"
                value={val}
                onChange={e => setFields(f => ({ ...f, [key]: e.target.value }))}
                className="w-full bg-[var(--surface)] text-text-primary text-xs px-3 py-2.5 focus:outline-none focus:bg-[var(--surface-raised)] transition-colors"
              />
            )}
          </div>
        ))}

        {/* Add field */}
        <div className="rounded-xl border border-dashed border-[var(--border)] overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--surface-raised)] border-b border-[var(--border)]">
            <Plus size={11} className="text-text-muted" />
            <span className="text-[10px] text-text-muted font-semibold">Add field</span>
          </div>
          <div className="flex gap-2 p-2">
            <select
              value={addKey}
              onChange={e => setAddKey(e.target.value)}
              className="flex-1 bg-[var(--surface)] text-text-primary text-xs px-2 py-1.5 rounded-lg border border-[var(--border)] focus:outline-none focus:border-accent/40"
            >
              <option value="">Choose a field…</option>
              {available.map(k => (
                <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>
              ))}
              {/* Also allow snapshot fields not in the predefined list */}
              {Object.keys(snap).filter(k => !ALL_SONG_FIELDS.includes(k) && !(k in fields)).map(k => (
                <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <button
              onClick={() => addField(addKey)}
              disabled={!addKey}
              className="px-3 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent text-xs font-semibold disabled:opacity-40 transition-colors"
            >
              Add
            </button>
          </div>
        </div>

        {/* Review note */}
        <div className="rounded-xl border border-[var(--border)] overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--surface-raised)] border-b border-[var(--border)]">
            <MessageSquare size={11} className="text-text-muted" />
            <span className="text-[10px] text-text-muted font-semibold">Review note (optional)</span>
          </div>
          <input
            type="text"
            value={reviewNote}
            onChange={e => setReviewNote(e.target.value)}
            placeholder="Explain what you changed…"
            className="w-full bg-[var(--surface)] text-text-primary text-xs px-3 py-2.5 focus:outline-none"
          />
        </div>

        {err && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-xs border border-red-500/20">
            <AlertCircle size={12} />{err}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-t border-[var(--border)] bg-[var(--surface-raised)]">
        <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary transition-colors">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={saving || Object.keys(fields).length === 0}
          className="flex-1 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent/90 text-[var(--bg)] text-xs font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          Save revision
        </button>
      </div>
    </div>
  )
}

// ── Proposals (master-detail) ─────────────────────────────────────────────────

function ProposalsTab({ proposals, status, setStatus, onChanged }: {
  proposals: SongEditProposal[]
  status: ProposalStatus | ''
  setStatus: (s: ProposalStatus | '') => void
  onChanged: () => void
}): JSX.Element {
  const [actionId,    setActionId]    = useState<number | null>(null)
  const [notes,       setNotes]       = useState<Record<number, string>>({})
  const [selected,    setSelected]    = useState<SongEditProposal | null>(null)
  const [revising,    setRevising]    = useState(false)

  // Auto-select first item
  useEffect(() => {
    setSelected(proposals[0] ?? null)
    setRevising(false)
  }, [proposals])

  // Approving/reversing a proposal changes a song's live data — drop its
  // cached lyrics so the next play reflects it.
  const dropCache = (id: number) => {
    const songId = proposals.find(p => p.id === id)?.song
    if (songId != null) invalidateLyricsCache(songId)
  }

  const doReview = async (id: number, action: 'approve' | 'reject') => {
    setActionId(id)
    try { await userApi.adminReviewProposal(id, { action, review_notes: notes[id] || '' }); dropCache(id); onChanged() }
    catch {} finally { setActionId(null) }
  }

  const doReverse = async (id: number) => {
    if (!confirm('Reverse this approval?')) return
    setActionId(id)
    try { await userApi.adminReverseProposal(id); dropCache(id); onChanged() }
    catch {} finally { setActionId(null) }
  }

  const FILTERS: { id: ProposalStatus | ''; label: string }[] = [
    { id: 'pending',  label: 'Pending'  },
    { id: 'approved', label: 'Approved' },
    { id: 'rejected', label: 'Rejected' },
    { id: 'reversed', label: 'Reversed' },
    { id: '',         label: 'All'      },
  ]

  const p = selected

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: list */}
      <div className="w-80 shrink-0 border-r border-[var(--border)] flex flex-col overflow-hidden">
        {/* Filter bar */}
        <div className="shrink-0 flex gap-1 flex-wrap px-3 py-2.5 border-b border-[var(--border)] bg-surface-raised">
          {FILTERS.map(f => (
            <button key={f.id || 'all'} onClick={() => setStatus(f.id)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                status === f.id
                  ? 'bg-accent text-[var(--bg)]'
                  : 'text-text-muted hover:text-text-muted bg-surface-overlay'
              }`}>{f.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {proposals.length === 0 && <Empty label="No proposals" />}
          {proposals.map(item => {
            const ss = STATUS_STYLE[item.status] ?? { border: 'border-l-transparent', text: 'text-text-muted', bg: '', dot: '' }
            const isActive = selected?.id === item.id
            return (
              <button key={item.id} onClick={() => setSelected(item)}
                className={`w-full text-left px-3 py-3 border-b border-[var(--border)] border-l-2 ${ss.border} transition-colors ${
                  isActive ? 'bg-accent/10' : 'hover:bg-surface-raised'
                }`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <StatusChip status={item.status} />
                  <span className="text-[9px] text-text-muted bg-surface-raised px-1.5 py-0.5 rounded font-medium">
                    {item.change_type}
                  </span>
                  {item.song_public_id != null && (
                    <span className="text-[9px] text-text-muted ml-auto flex items-center gap-0.5">
                      <Hash size={8} />{item.song_public_id}
                    </span>
                  )}
                </div>
                <p className={`text-[12px] font-semibold truncate leading-snug mb-0.5 text-text-primary`}>
                  {item.title || `Proposal #${item.id}`}
                </p>
                <p className="text-[10px] text-text-muted truncate">
                  {item.editor_username} · {relativeTime(item.created_at)}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Right: detail */}
      <div className="flex-1 flex overflow-hidden">
        {!p ? (
          <Empty label="Select a proposal" />
        ) : revising ? (
          <RevisePanel
            proposal={p}
            onClose={() => setRevising(false)}
            onDone={() => { setRevising(false); onChanged() }}
          />
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Detail header */}
            <div className="shrink-0 px-6 py-4 border-b border-[var(--border)] bg-surface-raised">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <StatusChip status={p.status} />
                    <span className="text-[10px] text-text-muted bg-surface-raised px-2 py-0.5 rounded font-medium">{p.change_type}</span>
                    {p.song_public_id != null && (
                      <span className="flex items-center gap-0.5 text-[10px] text-text-muted">
                        <Hash size={9} />{p.song_public_id}
                      </span>
                    )}
                  </div>
                  <h2 className="text-text-primary font-bold text-base leading-snug">{p.title || `Proposal #${p.id}`}</h2>
                  <div className="flex items-center gap-4 mt-1.5 text-[11px] text-text-muted flex-wrap">
                    <span>by <span className="text-text-muted font-medium">{p.editor_username}</span></span>
                    <span className="flex items-center gap-1"><Calendar size={10} />{shortDate(p.created_at)}</span>
                    {p.reviewer_username && <span>reviewed by <span className="text-text-muted">{p.reviewer_username}</span></span>}
                    {p.edit_count > 0 && <span>{p.edit_count} edit{p.edit_count !== 1 ? 's' : ''}</span>}
                  </div>
                </div>

                {/* Actions */}
                {p.status === 'pending' && (
                  <div className="flex items-center gap-2 shrink-0">
                    {actionId === p.id ? <Loader2 size={14} className="animate-spin text-text-muted" /> : (
                      <>
                        <button onClick={() => setRevising(true)}
                          className="px-3 py-1.5 rounded-lg bg-[var(--surface-overlay)] hover:bg-[var(--surface-raised)] text-text-secondary text-xs font-semibold transition-colors flex items-center gap-1.5 border border-[var(--border)]">
                          <Pencil size={13} /> Revise
                        </button>
                        <button onClick={() => doReview(p.id, 'reject')}
                          className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold transition-colors flex items-center gap-1.5">
                          <XCircle size={13} /> Reject
                        </button>
                        <button onClick={() => doReview(p.id, 'approve')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-xs font-semibold transition-colors flex items-center gap-1.5">
                          <CheckCircle size={13} /> Approve
                        </button>
                      </>
                    )}
                  </div>
                )}
                {p.status === 'approved' && (
                  <button onClick={() => doReverse(p.id)} disabled={actionId === p.id}
                    className="px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-amber-400 hover:bg-amber-500/10 transition-colors flex items-center gap-1.5 disabled:opacity-40">
                    {actionId === p.id ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Reverse
                  </button>
                )}
              </div>

              {/* Notes */}
              {(p.editor_notes || p.review_notes) && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {p.editor_notes && (
                    <div className="flex items-start gap-1.5 px-3 py-2 bg-surface-overlay rounded-lg text-xs text-text-muted italic border border-[var(--border)] max-w-sm">
                      <MessageSquare size={11} className="text-text-muted shrink-0 mt-0.5" />
                      {p.editor_notes}
                    </div>
                  )}
                  {p.review_notes && (
                    <div className="flex items-start gap-1.5 px-3 py-2 bg-surface-overlay rounded-lg text-xs text-text-muted italic border border-[var(--border)] max-w-sm">
                      <Check size={11} className="text-text-muted shrink-0 mt-0.5" />
                      {p.review_notes}
                    </div>
                  )}
                </div>
              )}

              {/* Review notes input for pending */}
              {p.status === 'pending' && (
                <div className="mt-3">
                  <input
                    type="text"
                    value={notes[p.id] || ''}
                    onChange={e => setNotes(n => ({ ...n, [p.id]: e.target.value }))}
                    placeholder="Add review note (optional)…"
                    className="w-full bg-surface-overlay border border-[var(--border)] rounded-lg px-3 py-2 text-text-primary text-xs focus:outline-none focus:border-accent/40"
                  />
                </div>
              )}
            </div>

            {/* Diff body */}
            <div className="flex-1 overflow-y-auto">
              <ProposalDiff proposal={p} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Applications (master-detail) ──────────────────────────────────────────────

function ApplicationsTab({ applications, onChanged }: { applications: EditorApplication[]; onChanged: () => void }): JSX.Element {
  const [actionId, setActionId] = useState<number | null>(null)
  const [notes,    setNotes]    = useState<Record<number, string>>({})
  const [selected, setSelected] = useState<EditorApplication | null>(null)

  useEffect(() => { setSelected(applications[0] ?? null) }, [applications])

  const doReview = async (id: number, action: 'approve' | 'reject') => {
    setActionId(id)
    try { await userApi.adminReviewApplication(id, { action, review_notes: notes[id] || '' }); onChanged() }
    catch {} finally { setActionId(null) }
  }

  const pending  = applications.filter(a => a.status === 'pending')
  const reviewed = applications.filter(a => a.status !== 'pending')
  const a = selected

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left list */}
      <div className="w-72 shrink-0 border-r border-[var(--border)] flex flex-col overflow-hidden">
        {pending.length > 0 && (
          <div className="shrink-0 px-3 pt-3 pb-1">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Pending · {pending.length}</p>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {applications.length === 0 && <Empty label="No applications" />}
          {pending.map(item => (
            <button key={item.id} onClick={() => setSelected(item)}
              className={`w-full text-left px-3 py-3 border-b border-[var(--border)] border-l-2 border-l-amber-500/60 transition-colors text-text-primary ${selected?.id === item.id ? 'bg-accent/10' : 'hover:bg-surface-raised'}`}>
              <div className="flex items-center gap-2.5">
                <Avatar src={item.discord_avatar} name={item.display_name || item.username} size={8} />
                <div className="min-w-0 flex-1">
                  <p className="text-text-primary text-xs font-semibold truncate">{item.display_name || item.username}</p>
                  <p className="text-text-muted text-[10px] truncate">{item.discord_username} · {relativeTime(item.created_at)}</p>
                </div>
              </div>
            </button>
          ))}

          {reviewed.length > 0 && (
            <div className="px-3 pt-3 pb-1">
              <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Reviewed</p>
            </div>
          )}
          {reviewed.map(item => (
            <button key={item.id} onClick={() => setSelected(item)}
              className={`w-full text-left px-3 py-3 border-b border-[var(--border)] border-l-2 ${STATUS_STYLE[item.status]?.border ?? 'border-l-transparent'} transition-colors text-text-primary opacity-60 ${selected?.id === item.id ? 'bg-accent/10 opacity-100' : 'hover:bg-surface-raised'}`}>
              <div className="flex items-center gap-2.5">
                <Avatar src={item.discord_avatar} name={item.display_name || item.username} size={7} />
                <div className="min-w-0 flex-1">
                  <p className="text-text-primary text-xs font-medium truncate">{item.display_name || item.username}</p>
                  <p className="text-text-muted text-[10px]">{item.status} · {shortDate(item.reviewed_at)}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right detail */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!a ? <Empty label="Select an application" /> : (
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* User info */}
            <div className="flex items-start gap-4">
              <Avatar src={a.discord_avatar} name={a.display_name || a.username} size={14} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap mb-1">
                  <h2 className="text-text-primary text-lg font-bold">{a.display_name || a.username}</h2>
                  <StatusChip status={a.status} />
                </div>
                <div className="flex items-center gap-4 text-xs text-text-muted flex-wrap">
                  {a.discord_username && <span>{a.discord_username}</span>}
                  {a.contact && <span>{a.contact}</span>}
                  <span className="flex items-center gap-1"><Calendar size={10} />{shortDate(a.created_at)}</span>
                  {a.reviewer_username && <span>Reviewed by {a.reviewer_username}</span>}
                </div>
              </div>

              {a.status === 'pending' && (
                <div className="flex items-center gap-2 shrink-0">
                  {actionId === a.id ? <Loader2 size={14} className="animate-spin text-text-muted" /> : (
                    <>
                      <button onClick={() => doReview(a.id, 'reject')}
                        className="px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold transition-colors flex items-center gap-1.5">
                        <XCircle size={13} /> Reject
                      </button>
                      <button onClick={() => doReview(a.id, 'approve')}
                        className="px-3 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-xs font-semibold transition-colors flex items-center gap-1.5">
                        <CheckCircle size={13} /> Approve
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <hr className="border-[var(--border)]" />

            {/* Application fields */}
            <div className="space-y-4">
              {a.areas && <AppSection label="Areas of interest" value={a.areas} />}
              {a.experience && <AppSection label="Experience" value={a.experience} />}
              {a.motivation && <AppSection label="Motivation" value={a.motivation} />}
            </div>

            {/* Review notes */}
            {a.status === 'pending' && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Review note</label>
                <textarea
                  value={notes[a.id] || ''}
                  onChange={e => setNotes(n => ({ ...n, [a.id]: e.target.value }))}
                  placeholder="Optional note for the applicant…"
                  rows={3}
                  className="w-full bg-surface-overlay border border-[var(--border)] rounded-xl px-3 py-2.5 text-text-primary text-sm resize-none focus:outline-none focus:border-accent/40"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function AppSection({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1.5">{label}</p>
      <p className="text-text-primary text-sm leading-relaxed whitespace-pre-wrap">{value}</p>
    </div>
  )
}

// ── Reports ───────────────────────────────────────────────────────────────────
// User-submitted song issue reports (wrong/missing info or lyrics). The app's
// own submit path folds the issue checkboxes into the message text, so the
// message is rendered verbatim; resolving PATCHes status + review_notes and
// the server records who reviewed and when.

function ReportsTab({ reports, status, setStatus, onChanged }: {
  reports: SongReportRow[]
  status: SongReportStatus | ''
  setStatus: (s: SongReportStatus | '') => void
  onChanged: () => void
}): JSX.Element {
  const [actionId, setActionId] = useState<number | null>(null)
  const [notes,    setNotes]    = useState<Record<number, string>>({})
  const [selected, setSelected] = useState<SongReportRow | null>(null)

  useEffect(() => { setSelected(reports[0] ?? null) }, [reports])

  // Song names for rows that only carry an id — one bulk catalog fetch (the
  // same ?all=true mode compact view uses) instead of a request per report.
  const [songsById, setSongsById] = useState<Map<number, JWApiSong>>(new Map())
  useEffect(() => {
    apiFetch<JWApiSong[]>('/songs/', { all: 'true' })
      .then(songs => setSongsById(new Map(songs.map(s => [s.id, s]))))
      .catch(() => {})
  }, [])

  const songLabel = (r: SongReportRow): string => {
    if (r.song_name) return r.song_name
    const id = reportsApi.reportSongId(r)
    if (id == null) return r.public_id != null ? `Song #${r.public_id}` : 'Unknown song'
    return songsById.get(id)?.name ?? `Song id ${id}`
  }

  const doReview = async (r: SongReportRow, newStatus: SongReportStatus) => {
    setActionId(r.id)
    try {
      await reportsApi.reviewSongReport(r.id, { status: newStatus, review_notes: notes[r.id] ?? r.review_notes ?? '' })
      onChanged()
    } catch {} finally { setActionId(null) }
  }

  const FILTERS: { id: SongReportStatus | ''; label: string }[] = [
    { id: 'pending',  label: 'Pending'  },
    { id: 'resolved', label: 'Resolved' },
    { id: '',         label: 'All'      },
  ]

  const r = selected
  const rSong = r ? (reportsApi.reportSongId(r) != null ? songsById.get(reportsApi.reportSongId(r)!) : undefined) : undefined

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: list */}
      <div className="w-80 shrink-0 border-r border-[var(--border)] flex flex-col overflow-hidden">
        <div className="shrink-0 flex gap-1 flex-wrap px-3 py-2.5 border-b border-[var(--border)] bg-surface-raised">
          {FILTERS.map(f => (
            <button key={f.id || 'all'} onClick={() => setStatus(f.id)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                status === f.id ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-primary hover:bg-surface-overlay'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {reports.length === 0 && <Empty label="No reports" />}
          {reports.map(item => (
            <button key={item.id} onClick={() => setSelected(item)}
              className={`w-full text-left px-3 py-3 border-b border-[var(--border)] border-l-2 ${STATUS_STYLE[item.status]?.border ?? 'border-l-transparent'} transition-colors ${
                selected?.id === item.id ? 'bg-accent/10' : 'hover:bg-surface-raised'
              } ${item.status !== 'pending' ? 'opacity-60' : ''}`}>
              <p className="text-text-primary text-xs font-semibold truncate">{songLabel(item)}</p>
              <p className="text-text-muted text-[10px] truncate mt-0.5">{item.message}</p>
              <p className="text-text-muted text-[10px] mt-1">
                {item.status === 'pending'
                  ? relativeTime(item.created_at ?? null)
                  : `resolved · ${shortDate(item.reviewed_at ?? null)}`}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Right: detail */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!r ? <Empty label="Select a report" /> : (
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl bg-surface-overlay flex items-center justify-center shrink-0 overflow-hidden">
                {rSong?.image_url
                  ? <img src={buildImageUrl(rSong.image_url)} alt="" className="w-full h-full object-cover" />
                  : <Music2 size={22} className="text-text-muted opacity-40" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap mb-1">
                  <h2 className="text-text-primary text-lg font-bold truncate">{songLabel(r)}</h2>
                  <StatusChip status={r.status} />
                </div>
                <div className="flex items-center gap-4 text-xs text-text-muted flex-wrap">
                  {reportsApi.reportSongId(r) != null && <span className="flex items-center gap-1"><Hash size={10} />{reportsApi.reportSongId(r)}</span>}
                  {rSong?.era?.name && <span>{rSong.era.name}</span>}
                  <span className="flex items-center gap-1"><Calendar size={10} />{shortDate(r.created_at ?? null)}</span>
                  {r.contact && <span className="flex items-center gap-1"><MessageSquare size={10} />{r.contact}</span>}
                  {r.reviewer_username && <span>Reviewed by {r.reviewer_username}</span>}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {actionId === r.id ? <Loader2 size={14} className="animate-spin text-text-muted" /> : r.status === 'pending' ? (
                  <button onClick={() => doReview(r, 'resolved')}
                    className="px-3 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-xs font-semibold transition-colors flex items-center gap-1.5">
                    <CheckCircle size={13} /> Resolve
                  </button>
                ) : (
                  <button onClick={() => doReview(r, 'pending')}
                    className="px-3 py-2 rounded-lg bg-surface-overlay hover:bg-surface-raised text-text-secondary text-xs font-semibold transition-colors flex items-center gap-1.5">
                    <RotateCcw size={13} /> Reopen
                  </button>
                )}
              </div>
            </div>

            <hr className="border-[var(--border)]" />

            <AppSection label="Report" value={r.message} />

            {r.status !== 'pending' && r.review_notes && (
              <AppSection label="Review notes" value={r.review_notes} />
            )}

            {r.status === 'pending' && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Review note</label>
                <textarea
                  value={notes[r.id] || ''}
                  onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value }))}
                  placeholder="Optional note recorded with the resolution…"
                  rows={3}
                  className="w-full bg-surface-overlay border border-[var(--border)] rounded-xl px-3 py-2.5 text-text-primary text-sm resize-none focus:outline-none focus:border-accent/40"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Users ─────────────────────────────────────────────────────────────────────

function UsersTab({ users, onChanged, currentUserId }: { users: AdminUser[]; onChanged: () => void; currentUserId?: number }): JSX.Element {
  const [actionId, setActionId] = useState<number | null>(null)
  const [filter,   setFilter]   = useState<'all' | 'admins' | 'editors' | 'applicants'>('all')
  const [search,   setSearch]   = useState('')

  const doUpdate = async (uid: number, payload: Parameters<typeof userApi.adminUpdateUser>[1]) => {
    setActionId(uid)
    try { await userApi.adminUpdateUser(uid, payload); onChanged() }
    catch {} finally { setActionId(null) }
  }

  const FILTERS = [
    { id: 'all' as const,        label: 'All',        count: users.length },
    { id: 'admins' as const,     label: 'Admins',     count: users.filter(u => u.role === 'administrator').length },
    { id: 'editors' as const,    label: 'Editors',    count: users.filter(u => u.role === 'editor').length },
    { id: 'applicants' as const, label: 'Applicants', count: users.filter(u => u.role === 'applicant').length },
  ]

  const ROLE = {
    administrator: 'text-accent bg-accent/15 border-accent/20',
    editor:        'text-emerald-400 bg-emerald-500/15 border-emerald-500/20',
    applicant:     'text-text-muted bg-surface-raised border-[var(--border)]',
  } as Record<string, string>

  const visible = useMemo(() => users.filter(u => {
    const ok = filter === 'all' ? true : filter === 'admins' ? u.role === 'administrator' : filter === 'editors' ? u.role === 'editor' : u.role === 'applicant'
    const q = search.toLowerCase()
    return ok && (!q || (u.discord_username || u.username || '').toLowerCase().includes(q))
  }), [users, filter, search])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-3 px-6 py-3 border-b border-[var(--border)] bg-surface-raised">
        <div className="flex gap-1">
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f.id ? 'bg-accent text-[var(--bg)] font-semibold' : 'text-text-muted hover:text-text-muted hover:bg-surface-overlay'
              }`}>
              {f.label}
              <span className={`text-[9px] px-1 rounded ${filter === f.id ? 'bg-white/20' : 'bg-surface-raised'}`}>{f.count}</span>
            </button>
          ))}
        </div>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
          className="ml-auto bg-surface-overlay border border-[var(--border)] rounded-lg px-3 py-1.5 text-text-primary text-xs focus:outline-none focus:border-accent/40 w-52" />
      </div>

      {/* Table header */}
      <div className="shrink-0 grid grid-cols-[auto_1fr_120px_100px_80px_160px] items-center gap-3 px-6 py-2 border-b border-[var(--border)] bg-surface-raised">
        {['', 'User', 'Role', 'Approved', 'Props', 'Actions'].map(h => (
          <p key={h} className="text-[9px] font-bold uppercase tracking-widest text-text-muted">{h}</p>
        ))}
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 && <Empty label="No users" />}
        {visible.map(u => (
          <div key={u.user_id} className="grid grid-cols-[auto_1fr_120px_100px_80px_160px] items-center gap-3 px-6 py-3 border-b border-[var(--border)] hover:bg-surface-raised transition-colors">
            <Avatar src={u.discord_avatar} name={u.discord_username || u.username} size={8} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-text-primary text-sm font-medium truncate">{u.discord_username || u.username}</p>
                {!u.is_active && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded text-red-400 bg-red-500/15">disabled</span>}
                {u.user_id === currentUserId && <span className="text-[9px] text-text-muted italic">you</span>}
              </div>
              <p className="text-text-muted text-[10px]">joined {shortDate(u.date_joined)}</p>
            </div>
            <div>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${ROLE[u.role] ?? 'text-text-muted bg-surface-raised'}`}>
                {u.role}
              </span>
            </div>
            <p className="text-text-primary text-sm font-semibold">{u.approved_count}</p>
            <p className="text-text-muted text-sm">{u.proposal_count}</p>
            <div className="flex items-center gap-1">
              {actionId === u.user_id ? (
                <Loader2 size={13} className="animate-spin text-text-muted" />
              ) : u.user_id !== currentUserId && u.role !== 'administrator' ? (
                <>
                  {u.role === 'editor' && (
                    <label className="flex items-center gap-1 text-[10px] text-text-muted cursor-pointer mr-2 hover:text-text-muted">
                      <input type="checkbox" checked={u.auto_approve_proposals}
                        onChange={e => doUpdate(u.user_id, { auto_approve_proposals: e.target.checked })}
                        className="w-3 h-3 accent-[var(--accent)]" />
                      auto
                    </label>
                  )}
                  {u.role === 'editor' ? (
                    <button onClick={() => doUpdate(u.user_id, { role: 'applicant' })}
                      className="px-2 py-1 rounded text-[10px] text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors font-medium">Demote</button>
                  ) : (
                    <button onClick={() => doUpdate(u.user_id, { role: 'editor' })}
                      className="px-2 py-1 rounded text-[10px] text-emerald-400 hover:bg-emerald-500/10 transition-colors font-medium">Promote</button>
                  )}
                  <button onClick={() => doUpdate(u.user_id, { is_active: !u.is_active })}
                    className="px-2 py-1 rounded text-[10px] text-text-muted hover:text-text-muted hover:bg-surface-raised transition-colors font-medium">
                    {u.is_active ? 'Disable' : 'Enable'}
                  </button>
                </>
              ) : <span className="text-text-muted text-[10px]">—</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function StatsTab({ applications, proposals, users }: {
  applications: EditorApplication[]; proposals: SongEditProposal[]; users: AdminUser[]
}): JSX.Element {
  const approved    = proposals.filter(p => p.status === 'approved').length
  const reviewed    = proposals.filter(p => p.status !== 'pending').length
  const approvalPct = reviewed > 0 ? Math.round(approved / reviewed * 100) : 0
  const editors     = users.filter(u => u.role === 'editor')
  const topEditors  = [...editors].sort((a, b) => b.approved_count - a.approved_count).slice(0, 8)

  const metrics = [
    { label: 'Total users',       value: users.length,                                             color: 'text-accent',        icon: <Users size={16} /> },
    { label: 'Editors',           value: editors.length,                                           color: 'text-emerald-400',   icon: <UserCheck size={16} /> },
    { label: 'Total proposals',   value: proposals.length,                                         color: 'text-blue-400',      icon: <FileEdit size={16} /> },
    { label: 'Approved',          value: approved,                                                  color: 'text-emerald-400',   icon: <FileCheck size={16} /> },
    { label: 'Pending proposals', value: proposals.filter(p => p.status === 'pending').length,     color: 'text-amber-400',     icon: <Clock size={16} /> },
    { label: 'Pending apps',      value: applications.filter(a => a.status === 'pending').length,  color: 'text-amber-400',     icon: <Clock size={16} /> },
    { label: 'Approval rate',     value: `${approvalPct}%`,                                        color: 'text-purple-400',    icon: <Activity size={16} /> },
    { label: 'Applicants',        value: users.filter(u => u.role === 'applicant').length,          color: 'text-text-muted', icon: <Users size={16} /> },
  ]

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="grid grid-cols-4 gap-3 mb-6">
        {metrics.map(m => (
          <div key={m.label} className="bg-surface-overlay border border-[var(--border)] rounded-xl p-4">
            <div className={`mb-2 ${m.color}`}>{m.icon}</div>
            <p className={`text-3xl font-black leading-none ${m.color}`}>{m.value}</p>
            <p className="text-text-muted text-[11px] mt-2">{m.label}</p>
          </div>
        ))}
      </div>

      {topEditors.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-3">Top editors by approvals</p>
          <div className="grid grid-cols-2 gap-2">
            {topEditors.map((u, i) => (
              <div key={u.user_id} className="flex items-center gap-3 px-4 py-3 bg-surface-overlay border border-[var(--border)] rounded-xl">
                <span className={`text-sm font-black w-6 text-center shrink-0 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-amber-700' : 'text-text-muted'}`}>
                  {i + 1}
                </span>
                <Avatar src={u.discord_avatar} name={u.discord_username || u.username} size={8} />
                <div className="flex-1 min-w-0">
                  <p className="text-text-primary text-xs font-semibold truncate">{u.discord_username || u.username}</p>
                  <p className="text-text-muted text-[10px]">{u.proposal_count} total</p>
                </div>
                <div className="text-right">
                  <p className="text-text-primary text-sm font-bold">{u.approved_count}</p>
                  <p className="text-text-muted text-[9px]">approved</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Security ──────────────────────────────────────────────────────────────────

function SecurityTab(): JSX.Element {
  return (
    <div className="p-6 max-w-md">
      <div className="flex items-start gap-4 px-5 py-5 rounded-2xl bg-emerald-500/8 border border-emerald-500/20">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
          <Check size={18} className="text-emerald-400" />
        </div>
        <div>
          <p className="text-text-primary font-semibold">Two-factor authentication enabled</p>
          <p className="text-text-muted text-sm mt-1">Your account is protected with 2FA.</p>
        </div>
      </div>
    </div>
  )
}

// ── OTP Setup ─────────────────────────────────────────────────────────────────

function OtpSetupPanel({ onEnabled }: { onEnabled: () => Promise<void> }): JSX.Element {
  const [setup,      setSetup]      = useState<userApi.OtpSetupPayload | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [code,       setCode]       = useState('')
  const [confirming, setConfirming] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  useEffect(() => {
    userApi.getOtpSetup().then(setSetup).catch(e => setError(e instanceof Error ? e.message : 'Could not load')).finally(() => setLoading(false))
  }, [])

  const confirm = async () => {
    setConfirming(true); setError(null)
    try { await userApi.confirmOtpSetup(code); await onEnabled() }
    catch (e) { setError(e instanceof Error ? e.message : 'Verification failed') }
    finally { setConfirming(false) }
  }

  if (loading) return <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-text-muted" /></div>
  if (!setup) return <p className="text-red-400 text-sm">Could not load OTP setup.</p>

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-text-primary text-base font-bold flex items-center gap-2"><KeyRound size={16} /> Enable 2FA</h2>
        <p className="text-text-muted text-sm mt-1.5 leading-relaxed">Admins must enable two-factor authentication. Scan the QR code with your authenticator app.</p>
      </div>
      {setup.qr_code && (
        <div className="bg-white p-4 rounded-2xl flex items-center justify-center w-fit mx-auto">
          <img src={setup.qr_code} alt="OTP QR code" className="w-40 h-40" />
        </div>
      )}
      {setup.otp_secret && (
        <div>
          <p className="text-text-muted text-[10px] mb-1.5">Manual entry:</p>
          <code className="block bg-surface-overlay border border-[var(--border)] rounded-xl px-3 py-2.5 text-text-primary text-xs font-mono break-all">{setup.otp_secret}</code>
        </div>
      )}
      <div>
        <label className="block text-xs font-semibold text-text-muted mb-1.5">Verification code</label>
        <input type="text" inputMode="numeric" value={code}
          onChange={e => { setCode(e.target.value); setError(null) }}
          onKeyDown={e => e.key === 'Enter' && confirm()} placeholder="123456"
          className="w-full bg-surface-overlay border border-[var(--border)] rounded-xl px-4 py-2.5 text-text-primary text-base focus:outline-none focus:border-accent/50 font-mono tracking-[0.5em] text-center"
        />
      </div>
      {error && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          <AlertCircle size={13} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}
      <button onClick={confirm} disabled={confirming || !code}
        className="w-full py-2.5 rounded-xl bg-accent text-[var(--bg)] text-sm font-semibold hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-40">
        {confirming && <Loader2 size={14} className="animate-spin" />} Verify & enable
      </button>
    </div>
  )
}
