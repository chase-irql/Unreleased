import { useEffect, useState, useCallback } from 'react'
import { ChevronLeft, Newspaper, RefreshCw, AlertCircle } from 'lucide-react'
import { useStorePick } from '../store/useStore'
import { fetchNews, NEWS_CHANNELS, DEFAULT_NEWS_CHANNEL, type NewsItem } from '../lib/newsApi'

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// ─── Cards ────────────────────────────────────────────────────────────────────

function CategoryTag({ label }: { label: string }) {
  return (
    <span className="inline-block text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/25">
      {label}
    </span>
  )
}

function FeaturedCard({ item, onOpen }: { item: NewsItem; onOpen: (item: NewsItem) => void }) {
  return (
    <button
      onClick={() => onOpen(item)}
      className="group w-full text-left rounded-2xl overflow-hidden border border-[var(--border)] bg-[var(--surface-raised)] hover:border-accent/40 transition-colors"
    >
      {item.image_url && (
        <div className="aspect-[16/7] w-full overflow-hidden bg-[var(--surface-overlay)]">
          <img src={item.image_url} alt="" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300" />
        </div>
      )}
      <div className="p-5">
        <div className="flex items-center gap-2 mb-2">
          {item.category && <CategoryTag label={item.category} />}
          <span className="text-xs text-text-muted">{formatDate(item.published_at)}</span>
        </div>
        <h2 className="text-text-primary text-lg font-bold leading-snug mb-1.5">{item.title}</h2>
        <p className="text-sm text-text-secondary leading-relaxed line-clamp-3">{item.summary}</p>
      </div>
    </button>
  )
}

function NewsCard({ item, onOpen }: { item: NewsItem; onOpen: (item: NewsItem) => void }) {
  return (
    <button
      onClick={() => onOpen(item)}
      className="group w-full text-left flex gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] hover:border-accent/40 transition-colors p-3"
    >
      {item.image_url && (
        <div className="w-24 h-24 shrink-0 rounded-lg overflow-hidden bg-[var(--surface-overlay)]">
          <img src={item.image_url} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          {item.category && <CategoryTag label={item.category} />}
          <span className="text-xs text-text-muted">{formatDate(item.published_at)}</span>
        </div>
        <h3 className="text-text-primary text-sm font-semibold leading-snug mb-1 line-clamp-2">{item.title}</h3>
        <p className="text-xs text-text-secondary leading-relaxed line-clamp-2">{item.summary}</p>
      </div>
    </button>
  )
}

// ─── States ───────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="flex gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3 animate-pulse">
      <div className="w-24 h-24 shrink-0 rounded-lg bg-[var(--surface-overlay)]" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-3 w-20 rounded bg-[var(--surface-overlay)]" />
        <div className="h-4 w-3/4 rounded bg-[var(--surface-overlay)]" />
        <div className="h-3 w-full rounded bg-[var(--surface-overlay)]" />
        <div className="h-3 w-2/3 rounded bg-[var(--surface-overlay)]" />
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24 px-6">
      <div className="w-16 h-16 rounded-2xl bg-[var(--surface-raised)] border border-[var(--border)] flex items-center justify-center mb-4">
        <Newspaper size={28} className="text-text-muted" />
      </div>
      <h2 className="text-text-primary font-semibold mb-1">No news yet</h2>
      <p className="text-sm text-text-muted max-w-sm">
        Announcements, releases and leaks will show up here. Check back soon.
      </p>
    </div>
  )
}

// ─── Article detail ───────────────────────────────────────────────────────────

function ArticleDetail({ item, onBack }: { item: NewsItem; onBack: () => void }) {
  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition-colors mb-4"
      >
        <ChevronLeft size={16} /> Back to news
      </button>
      {item.image_url && (
        <div className="aspect-[16/7] w-full overflow-hidden rounded-2xl bg-[var(--surface-overlay)] mb-5">
          <img src={item.image_url} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="flex items-center gap-2 mb-3">
        {item.category && <CategoryTag label={item.category} />}
        <span className="text-xs text-text-muted">{formatDate(item.published_at)}</span>
        {item.author && <span className="text-xs text-text-muted">· {item.author}</span>}
      </div>
      <h1 className="text-text-primary text-2xl font-bold leading-tight mb-4">{item.title}</h1>
      <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{item.body}</div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewsView(): JSX.Element {
  const { setActiveView } = useStorePick('setActiveView')
  const [channel, setChannel] = useState<string>(DEFAULT_NEWS_CHANNEL)
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<NewsItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchNews({ channel })
      setItems(res.results)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load news')
    } finally {
      setLoading(false)
    }
  }, [channel])

  // Reload whenever the channel changes (and on mount). Close any open article
  // so we don't strand the reader on a story from the previous channel.
  useEffect(() => { setSelected(null); load() }, [load])

  const featured = items.find((i) => i.featured) ?? null
  const rest = items.filter((i) => i !== featured)

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--surface)]">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-6 pb-0 border-b border-[var(--border)]">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setActiveView('wrld')}
            title="Back"
            className="p-1 -ml-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors shrink-0"
          >
            <ChevronLeft size={18} />
          </button>
          <h1 className="text-text-primary text-xl font-bold">News</h1>
          <button
            onClick={load}
            disabled={loading}
            title="Refresh"
            className="ml-auto p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        {/* Channels */}
        <div className="flex gap-1 overflow-x-auto scrollbar-none">
          {NEWS_CHANNELS.map((ch) => (
            <button
              key={ch.id}
              onClick={() => setChannel(ch.id)}
              className={`flex-shrink-0 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                channel === ch.id
                  ? 'text-accent border-accent'
                  : 'text-text-muted border-transparent hover:text-text-primary'
              }`}
            >
              {ch.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {selected ? (
          <ArticleDetail item={selected} onBack={() => setSelected(null)} />
        ) : (
          <div className="max-w-4xl mx-auto">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center text-center py-24 px-6">
                <AlertCircle size={28} className="text-red-400 mb-3" />
                <p className="text-sm text-text-secondary mb-4">{error}</p>
                <button
                  onClick={load}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--surface-raised)] border border-[var(--border)] text-text-primary hover:border-accent/40 transition-colors"
                >
                  Try again
                </button>
              </div>
            ) : items.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="space-y-4">
                {featured && <FeaturedCard item={featured} onOpen={setSelected} />}
                <div className="space-y-3">
                  {rest.map((item) => <NewsCard key={item.id} item={item} onOpen={setSelected} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
