import { useEffect, useState } from 'react'
import { Loader2, Music2, Unlock, EyeOff, Mic, Clock } from 'lucide-react'
import { useStore, useStorePick } from '../store/useStore'
import { apiFetch, JWApiStats, JWApiEra } from '../lib/juicewrldApi'

interface CategoryCard {
  key: 'released' | 'unreleased' | 'unsurfaced' | 'recording_session'
  label: string
  description: string
  icon: JSX.Element
  gradient: string
  textColor: string
}

const CATEGORIES: CategoryCard[] = [
  {
    key: 'released',
    label: 'Released',
    description: 'Official albums, singles, and features',
    icon: <Music2 size={28} />,
    gradient: 'from-green-500/20 to-green-600/5',
    textColor: 'text-green-400',
  },
  {
    key: 'unreleased',
    label: 'Unreleased',
    description: 'Leaked tracks and unfinished recordings',
    icon: <Unlock size={28} />,
    gradient: 'from-blue-500/20 to-blue-600/5',
    textColor: 'text-blue-400',
  },
  {
    key: 'unsurfaced',
    label: 'Unsurfaced',
    description: 'Known but unheard recordings',
    icon: <EyeOff size={28} />,
    gradient: 'from-purple-500/20 to-purple-600/5',
    textColor: 'text-purple-400',
  },
  {
    key: 'recording_session',
    label: 'Sessions',
    description: 'Raw studio session recordings',
    icon: <Mic size={28} />,
    gradient: 'from-orange-500/20 to-orange-600/5',
    textColor: 'text-orange-400',
  },
]

export default function ApiCategoryView(): JSX.Element {
  const { setActiveView, setApiTrackerCategory, setApiTrackerEra } = useStorePick('setActiveView', 'setApiTrackerCategory', 'setApiTrackerEra')
  const [stats, setStats] = useState<JWApiStats | null>(null)
  const [eras, setEras] = useState<JWApiEra[]>([])
  const [loadingStats, setLoadingStats] = useState(true)
  const [loadingEras, setLoadingEras] = useState(true)

  useEffect(() => {
    apiFetch<JWApiStats>('/stats/')
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoadingStats(false))

    apiFetch<JWApiEra[] | { results: JWApiEra[] }>('/eras/')
      .then((data) => setEras(Array.isArray(data) ? data : (data as { results: JWApiEra[] }).results ?? []))
      .catch(console.error)
      .finally(() => setLoadingEras(false))
  }, [])

  const handleCategoryClick = (key: string): void => {
    setApiTrackerCategory(key)
    setActiveView('api-tracker')
  }

  const handleEraClick = (eraName: string): void => {
    setApiTrackerEra(eraName)
    setActiveView('api-tracker')
  }

  const counts = stats?.category_stats

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <div className="px-5 pt-5 pb-8">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <h1 className="text-text-primary text-xl font-bold mb-1">Categories</h1>
        <p className="text-text-muted text-sm mb-5">Browse songs by release status or era</p>

        {/* ── Category cards ───────────────────────────────────────────── */}
        {loadingStats ? (
          <div className="flex items-center gap-2 text-text-muted h-40 justify-center">
            <Loader2 size={18} className="animate-spin" /><span className="text-sm">Loading…</span>
          </div>
        ) : (
          <div className="grid gap-3 mb-8" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {CATEGORIES.map((cat) => {
              const count = counts?.[cat.key] ?? null
              return (
                <button
                  key={cat.key}
                  onClick={() => handleCategoryClick(cat.key)}
                  className={`group relative flex flex-col gap-2.5 p-4 rounded-2xl bg-gradient-to-br ${cat.gradient} bg-surface-overlay border border-[var(--border)] hover:border-[var(--accent)] transition-all duration-200 text-left cursor-pointer hover:scale-[1.02] active:scale-[0.98]`}
                >
                  <div className={`${cat.textColor} opacity-80 group-hover:opacity-100 transition-opacity`}>
                    {cat.icon}
                  </div>
                  <div>
                    <p className="text-text-primary font-semibold text-sm">{cat.label}</p>
                    <p className="text-text-muted text-[11px] mt-0.5 leading-relaxed">{cat.description}</p>
                  </div>
                  {count !== null && (
                    <div className={`mt-0.5 text-xl font-bold ${cat.textColor}`}>
                      {count.toLocaleString()}
                      <span className="text-text-muted text-xs font-normal ml-1">songs</span>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* ── Eras section ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-4">
          <Clock size={14} className="text-text-muted" />
          <h2 className="text-text-secondary text-sm font-semibold uppercase tracking-wider">Eras</h2>
          {!loadingEras && eras.length > 0 && (
            <span className="text-text-muted text-xs">{eras.length} eras</span>
          )}
        </div>

        {loadingEras ? (
          <div className="flex items-center gap-2 text-text-muted">
            <Loader2 size={16} className="animate-spin" /><span className="text-sm">Loading eras…</span>
          </div>
        ) : eras.length === 0 ? (
          <p className="text-text-muted text-sm">No eras found</p>
        ) : (
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {eras.map((era) => (
              <EraCard key={era.id} era={era} stats={stats} onClick={() => handleEraClick(era.name)} />
            ))}
          </div>
        )}

        {stats && (
          <div className="mt-6 flex items-center gap-2 text-text-muted text-sm">
            <span className="font-semibold text-text-secondary">{stats.total_songs.toLocaleString()}</span>
            <span>songs total</span>
          </div>
        )}
      </div>
    </div>
  )
}

function EraCard({ era, stats, onClick }: { era: JWApiEra; stats: JWApiStats | null; onClick: () => void }): JSX.Element {
  const songCount = stats?.era_stats?.[era.name] ?? null
  return (
    <button
      onClick={onClick}
      className="group flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-surface-overlay border border-transparent hover:border-[var(--accent)] hover:bg-surface-raised transition-all text-left cursor-pointer"
    >
      <div className="min-w-0">
        <p className="text-text-primary text-sm font-medium truncate group-hover:text-accent transition-colors">{era.name}</p>
        {era.time_frame && (
          <p className="text-text-muted text-[11px] truncate mt-0.5">{era.time_frame}</p>
        )}
      </div>
      {songCount !== null && (
        <span className="text-text-muted text-xs shrink-0 tabular-nums">{songCount.toLocaleString()}</span>
      )}
    </button>
  )
}
