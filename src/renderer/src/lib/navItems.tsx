import { SearchCode, HardDrive, Library, ListMusic, Heart, BookOpen } from 'lucide-react'
import type { ReactNode } from 'react'
import logo from '../assets/logo.png'
import type { ViewType } from '../types'

// The primary nav destinations available to the desktop side menu (Sidebar).
// `view` doubles as the stable id persisted in the saved order/visibility —
// don't rename these. `electronOnly` items (Library) are hidden on the web
// build. `defaultHidden` items ship off — they're the extras the user can add
// to the menu from Settings. The mobile BottomNav uses its own curated set and
// is unaffected.
export interface NavItemDef {
  view: ViewType
  label: string
  icon: ReactNode
  electronOnly?: boolean
  defaultHidden?: boolean
}

export const NAV_ITEMS: NavItemDef[] = [
  { view: 'wrld', label: 'WRLD', icon: <img src={logo} alt="WRLD" className="w-[24px] h-[24px] object-contain" /> },
  { view: 'api-tracker', label: 'Tracker', icon: <SearchCode size={18} /> },
  { view: 'api-files', label: 'Files', icon: <HardDrive size={18} /> },
  { view: 'library', label: 'Library', icon: <Library size={18} />, electronOnly: true },
  { view: 'playlists', label: 'Playlists', icon: <ListMusic size={18} /> },
  // Extras — off by default, addable from Settings → Appearance → Menu items.
  { view: 'liked', label: 'Liked Songs', icon: <Heart size={18} />, defaultHidden: true },
  { view: 'docs', label: 'API Docs', icon: <BookOpen size={18} />, defaultHidden: true },
]

export const DEFAULT_NAV_ORDER: ViewType[] = NAV_ITEMS.map((i) => i.view)

// Default visibility per item, keyed by view. Persisted overrides are merged
// onto this (see the store), so an item added in a newer version picks up its
// own default automatically instead of a stale saved map deciding for it.
export const DEFAULT_NAV_VISIBILITY: Record<string, boolean> = Object.fromEntries(
  NAV_ITEMS.map((i) => [i.view, !i.defaultHidden]),
)

// Reorder NAV_ITEMS by a saved list of view ids. Ids in `order` that no longer
// exist are skipped; items missing from `order` (e.g. a destination added in a
// newer version than the saved order) keep their canonical position, appended
// after the saved ones — so a stale persisted order never hides a new tab.
export function orderedNavItems(order: ViewType[]): NavItemDef[] {
  const byView = new Map(NAV_ITEMS.map((i) => [i.view, i]))
  const seen = new Set<ViewType>()
  const out: NavItemDef[] = []
  for (const view of order) {
    const item = byView.get(view)
    if (item && !seen.has(view)) { out.push(item); seen.add(view) }
  }
  for (const item of NAV_ITEMS) if (!seen.has(item.view)) out.push(item)
  return out
}

// True when an item should render in the side menu: platform-eligible and not
// toggled off. `visibility` is the merged map (defaults + user overrides).
export function isNavItemVisible(item: NavItemDef, visibility: Record<string, boolean>, isElectron: boolean): boolean {
  if (item.electronOnly && !isElectron) return false
  return visibility[item.view] ?? !item.defaultHidden
}
