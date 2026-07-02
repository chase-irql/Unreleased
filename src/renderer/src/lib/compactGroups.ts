// Shared "compact view" grouping logic — collapses items that share a
// version_title into one group. Used by both the Tracker (ApiTrackerView)
// and Playlists (PlaylistsView) so the grouping math only lives once.
//
// There are two different fetch strategies because the two callers start
// from different places:
//   - The Tracker doesn't reliably have every song loaded (paginated,
//     filtered by category/search), so it has to ask Supabase for every
//     titled group app-wide and then fetch the actual song objects.
//   - Playlists already has its full, unpaginated track list in hand, so it
//     only needs version metadata for those specific songs — no need to
//     fetch anything about the songs themselves.
import { apiFetch, JWApiSong } from './juicewrldApi'
import { SongVersionMeta, getAllVersionGroups, getVersionMetaForSongs, versionsEnabled } from './versionsApi'

export interface CompactGroup<T> {
  groupId: number
  title: string
  members: { item: T; meta: SongVersionMeta }[]
}

function buildGroups<T>(metas: SongVersionMeta[], getItem: (songId: number) => T | undefined): CompactGroup<T>[] {
  const byGroup = new Map<number, SongVersionMeta[]>()
  for (const meta of metas) {
    if (!meta.versionTitle) continue
    if (!byGroup.has(meta.groupId)) byGroup.set(meta.groupId, [])
    byGroup.get(meta.groupId)!.push(meta)
  }
  return [...byGroup.entries()]
    .map(([groupId, groupMetas]) => ({
      groupId,
      title: groupMetas.find(m => m.versionTitle)?.versionTitle ?? '',
      members: groupMetas
        .map(m => ({ item: getItem(m.songId), meta: m }))
        .filter((x): x is { item: T; meta: SongVersionMeta } => !!x.item),
    }))
    .filter(g => g.members.length > 0)
}

// Firing one request per song via a single Promise.all works fine for a
// handful of groups, but once most of the catalog is grouped (as happened
// here — thousands of unique song ids), the browser refuses that many
// simultaneous requests outright (net::ERR_INSUFFICIENT_RESOURCES), so most
// fetches fail silently and whole groups vanish for having no members left.
// A small worker pool keeps only a bounded number in flight at once.
async function mapWithConcurrency<T>(items: number[], limit: number, fn: (id: number) => Promise<T | null>): Promise<Map<number, T>> {
  const out = new Map<number, T>()
  let next = 0
  async function worker(): Promise<void> {
    while (next < items.length) {
      const id = items[next++]
      const result = await fn(id)
      if (result != null) out.set(id, result)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/** Every titled version group app-wide, with full song objects fetched for
 *  each member — for callers (the Tracker) that can't rely on their own
 *  song list to contain every group's members. */
export async function fetchAllCompactGroups(): Promise<CompactGroup<JWApiSong>[]> {
  if (!versionsEnabled) return []
  const metas = await getAllVersionGroups()
  const uniqueIds = [...new Set(metas.map(m => m.songId))]
  const songMap = await mapWithConcurrency(uniqueIds, 24, id =>
    apiFetch<JWApiSong>(`/songs/${id}/`).catch(() => null)
  )
  return buildGroups(metas, id => songMap.get(id))
}

/** Titled version groups among a known, already-loaded list of items (e.g. a
 *  playlist's tracks) — `getSongId` extracts each item's song id. */
export async function groupItemsByVersion<T>(items: T[], getSongId: (item: T) => number): Promise<CompactGroup<T>[]> {
  if (!versionsEnabled || items.length === 0) return []
  const metaMap = await getVersionMetaForSongs(items.map(getSongId))
  const itemMap = new Map(items.map(item => [getSongId(item), item]))
  return buildGroups([...metaMap.values()], id => itemMap.get(id))
}

// Plain substring matching is apostrophe-sensitive — searching "wouldnt"
// (as typed on most keyboards without hunting for a curly quote) wouldn't
// match a title like "You Wouldn't Understand" otherwise. The server-side
// searchall the normal list uses is presumably more lenient about this;
// stripping every apostrophe variant from both sides before comparing gets
// this filter to the same place without a full fuzzy-search rewrite.
function stripApostrophes(s: string): string {
  return s.replace(/['’‘]/g, '')
}

/** Client-side search filter for compact groups — both fetch strategies
 *  above are independent of whatever's in each view's search box, so
 *  without this, typing a search query while compact view is active would
 *  silently do nothing. If the query matches the group's title, the whole
 *  group is kept (searching "TV Mix" should show that entire group);
 *  otherwise members are filtered individually via `getSearchText`. */
export function filterCompactGroups<T>(
  groups: CompactGroup<T>[],
  query: string,
  getSearchText: (item: T) => string
): CompactGroup<T>[] {
  const q = stripApostrophes(query.trim().toLowerCase())
  if (!q) return groups
  return groups
    .map(g => {
      const groupMatches = stripApostrophes(g.title.toLowerCase()).includes(q)
      const members = groupMatches ? g.members : g.members.filter(m => stripApostrophes(getSearchText(m.item).toLowerCase()).includes(q))
      return { ...g, members }
    })
    .filter(g => g.members.length > 0)
}
