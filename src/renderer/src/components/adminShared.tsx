// Small UI pieces shared between AdminPage's tabs and ReportsTab (the latter
// is also embedded standalone in EditorProfileView for editor-only accounts).
export function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function shortDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export const STATUS_STYLE: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  pending:  { bg: 'bg-amber-500/10',   text: 'text-amber-400',   dot: 'bg-amber-400',   border: 'border-l-amber-500/60' },
  approved: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400', border: 'border-l-emerald-500/60' },
  resolved: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400', border: 'border-l-emerald-500/60' },
  rejected: { bg: 'bg-red-500/10',     text: 'text-red-400',     dot: 'bg-red-400',     border: 'border-l-red-500/50' },
  reversed: { bg: 'bg-zinc-500/10',    text: 'text-zinc-400',    dot: 'bg-zinc-500',    border: 'border-l-zinc-500/40' },
}

export function StatusChip({ status }: { status: string }): JSX.Element {
  const s = STATUS_STYLE[status] ?? { bg: 'bg-surface-raised', text: 'text-text-muted', dot: 'bg-text-muted', border: '' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  )
}

export function Avatar({ src, name, size = 8 }: { src?: string; name: string; size?: number }): JSX.Element {
  const cls = `w-${size} h-${size} rounded-full shrink-0`
  return src
    ? <img src={src} alt="" className={`${cls} object-cover`} />
    : <div className={`${cls} bg-accent/20 text-accent flex items-center justify-center text-xs font-bold`}>
        {(name || '?')[0].toUpperCase()}
      </div>
}

export function Empty({ label }: { label: string }): JSX.Element {
  return <div className="flex items-center justify-center h-full text-text-muted text-sm">{label}</div>
}

export function AppSection({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1.5">{label}</p>
      <p className="text-text-primary text-sm leading-relaxed whitespace-pre-wrap">{value}</p>
    </div>
  )
}
