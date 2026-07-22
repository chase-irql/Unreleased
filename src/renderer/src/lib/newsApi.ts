// News feed data layer. The backend endpoints don't exist yet — this file
// defines the shape the UI codes against and a single fetch function that's
// ready to flip on the moment `/news/` ships. Until then `NEWS_ENABLED` keeps
// NewsView on its empty state instead of spamming 404s at a route that isn't
// there.
import { JWAPI_BASE } from './juicewrldApi'
import { apiRequest } from './apiClient'

// Flip to true once the API exposes GET /news/. Everything below already
// speaks the intended contract, so no other change should be needed.
export const NEWS_ENABLED = false

const NEWS_BASE = `${JWAPI_BASE}/news`

// The feed is split into channels — each is its own stream the user tabs
// between. `id` is the stable value sent to the API as `?channel=`; 'all' is a
// client-side pseudo-channel that omits the filter. Reorder/rename labels
// freely, but keep the ids in sync with whatever the backend accepts.
export interface NewsChannel {
  id: string
  label: string
}

export const NEWS_CHANNELS: NewsChannel[] = [
  { id: 'all', label: 'All' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'releases', label: 'Releases' },
  { id: 'leaks', label: 'Leaks' },
  { id: 'community', label: 'Community' },
]

export const DEFAULT_NEWS_CHANNEL = 'all'

export interface NewsItem {
  id: number
  title: string
  // Short plain-text teaser shown in the list.
  summary: string
  // Full article body (markdown/plain text) — shown when an item is opened.
  body: string
  // Optional lead image.
  image_url: string | null
  // Which channel this item belongs to (one of NEWS_CHANNELS ids, never 'all').
  channel: string
  // Freeform label, e.g. "Release", "Leak", "Announcement".
  category: string | null
  // Marks a hero/pinned story at the top of the feed.
  featured: boolean
  author: string | null
  published_at: string // ISO timestamp
}

export interface NewsListResponse {
  results: NewsItem[]
  count: number
  next: string | null
}

export interface FetchNewsParams {
  // A channel id, or 'all'/undefined for the unfiltered feed.
  channel?: string
  page?: number
  pageSize?: number
}

// Paginated news list. Returns an empty page while the feature is disabled so
// callers can render unconditionally without special-casing the pre-launch
// state themselves.
export async function fetchNews(params: FetchNewsParams = {}): Promise<NewsListResponse> {
  if (!NEWS_ENABLED) return { results: [], count: 0, next: null }

  const qs = new URLSearchParams()
  if (params.channel && params.channel !== 'all') qs.set('channel', params.channel)
  if (params.page) qs.set('page', String(params.page))
  if (params.pageSize) qs.set('page_size', String(params.pageSize))
  const query = qs.toString()

  return apiRequest<NewsListResponse>(`${NEWS_BASE}/${query ? `?${query}` : ''}`, {
    cacheKey: `news:list:${query}`,
  })
}

// Single article by id. Kept alongside the list for when a detail route lands.
export async function fetchNewsItem(id: number): Promise<NewsItem> {
  if (!NEWS_ENABLED) throw new Error('News is not available yet')
  return apiRequest<NewsItem>(`${NEWS_BASE}/${id}/`, { cacheKey: `news:item:${id}` })
}
