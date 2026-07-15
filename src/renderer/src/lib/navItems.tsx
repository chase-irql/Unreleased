import { SearchCode, HardDrive, Library, ListMusic } from 'lucide-react'
import type { ReactNode } from 'react'
import logo from '../assets/logo.png'
import type { ViewType } from '../types'

// The reorderable primary nav destinations shown in the desktop side menu
// (Sidebar). `view` doubles as the stable id persisted in the saved order —
// don't rename these. `electronOnly` items (Files, Library) are hidden on the
// web build. The mobile BottomNav uses its own curated set and is unaffected.
export interface NavItemDef {
  view: ViewType
  label: string
  icon: ReactNode
  electronOnly?: boolean
}

export const NAV_ITEMS: NavItemDef[] = [
  { view: 'wrld', label: 'WRLD', icon: <img src={logo} alt="WRLD" className="w-[24px] h-[24px] object-contain" /> },
  { view: 'api-tracker', label: 'Tracker', icon: <SearchCode size={18} /> },
  { view: 'api-files', label: 'Files', icon: <HardDrive size={18} />, electronOnly: true },
  { view: 'library', label: 'Library', icon: <Library size={18} />, electronOnly: true },
  { view: 'playlists', label: 'Playlists', icon: <ListMusic size={18} /> },
]

export const DEFAULT_NAV_ORDER: ViewType[] = NAV_ITEMS.map((i) => i.view)

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
