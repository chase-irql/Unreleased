import { Settings, ShieldCheck, Disc } from 'lucide-react'
import { useStorePick } from '../store/useStore'
import { ViewType } from '../types'
import { CONTRIBUTOR_ENABLED } from '../lib/userApi'
import { orderedNavItems, isNavItemVisible } from '../lib/navItems'

// The mobile nav bar — the counterpart to the desktop Sidebar, which it now
// shares its destination list with. It used to hardcode its own four tabs,
// which meant Settings → Appearance → "Menu items" (order + show/hide) silently
// did nothing on a phone; the same maps drive both surfaces here.
//
// Placement follows the same `sidebarPosition` setting: only top/bottom are
// offered on mobile (a vertical rail doesn't fit a phone — see Settings), and
// `atTop` flips the border, the safe-area inset, and the active marker to the
// opposite edge.
export default function BottomNav(): JSX.Element {
  const { activeView, setActiveView, toggleSettings, account, navVisibility, navOrder, sidebarPosition } =
    useStorePick('activeView', 'setActiveView', 'toggleSettings', 'account', 'navVisibility', 'navOrder', 'sidebarPosition')
  const isElectron = navigator.userAgent.includes('Electron')
  const isAdmin = !!account?.is_administrator
  const isEditor = !!account?.is_editor
  const isContributor = CONTRIBUTOR_ENABLED && !!account?.is_contributor
  const profileView = isContributor && !isEditor ? 'contributor-profile' : 'editor-profile'
  const atTop = sidebarPosition === 'top'

  // Shared with the side menu: orderedNavItems sanitizes the saved order,
  // isNavItemVisible drops desktop-only tabs and anything toggled off.
  const items = orderedNavItems(navOrder).filter((i) => isNavItemVisible(i, navVisibility, isElectron))

  // Albums and the staff profile aren't in NAV_ITEMS (they're role-gated extras
  // with no desktop side-menu row), so they stay special-cased here and read
  // their toggle out of the same map under their view id.
  const navShown = (view: ViewType): boolean => navVisibility[view] ?? true
  const showAlbums = (isAdmin || isEditor) && navShown('albums-admin')
  const showProfile = (isAdmin || isEditor || isContributor)
    && (isContributor && !isEditor ? navShown('contributor-profile') : navShown('editor-profile'))

  // Tabs share the width when they fit and scroll horizontally once they don't,
  // so enabling every destination degrades into a scroller rather than
  // squeezing each tab down to an unreadable sliver.
  const tabCls = (active: boolean): string =>
    `flex-1 min-w-[64px] flex flex-col items-center justify-center py-2.5 gap-1 transition-colors relative overflow-hidden ${
      active ? 'text-accent' : 'text-text-muted'
    }`
  const labelCls = 'text-[10px] font-semibold leading-none w-full text-center truncate px-0.5'
  const marker = (active: boolean): JSX.Element | null => active ? (
    <span
      className={`absolute ${atTop ? 'bottom-0' : 'top-0'} left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full`}
      style={{ background: 'var(--accent)' }}
    />
  ) : null

  return (
    <nav
      className="md:hidden flex items-stretch bg-sidebar shrink-0 overflow-x-auto"
      style={atTop
        ? { borderBottom: '1px solid var(--border)', paddingTop: 'env(safe-area-inset-top, 0px)' }
        : { borderTop: '1px solid var(--border)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {items.map((item) => {
        const active = activeView === item.view
        return (
          <button
            key={item.view}
            onClick={() => {
              if (activeView === item.view && item.view === 'playlists') {
                window.dispatchEvent(new CustomEvent('playlists:back'))
              } else {
                setActiveView(item.view)
              }
            }}
            className={tabCls(active)}
          >
            {marker(active)}
            {/* NAV_ITEMS icons are sized for the 18px side menu; scale them up
                to a touch-appropriate 24 without forking the definitions. */}
            <span className="[&_svg]:w-6 [&_svg]:h-6 [&_img]:w-7 [&_img]:h-7 flex items-center justify-center">
              {item.icon}
            </span>
            <span className={labelCls}>{item.label}</span>
          </button>
        )
      })}

      {showAlbums && (
        <button onClick={() => setActiveView('albums-admin')} className={tabCls(activeView === 'albums-admin')}>
          {marker(activeView === 'albums-admin')}
          <Disc size={24} />
          <span className={labelCls}>Albums</span>
        </button>
      )}

      {/* Admin review tools live inside the editor profile page (Admin tab) —
          one profile entry for both roles instead of a separate Admin view. */}
      {showProfile && (
        <button onClick={() => setActiveView(profileView)} className={tabCls(activeView === profileView)}>
          {marker(activeView === profileView)}
          <ShieldCheck size={24} />
          <span className={labelCls}>
            {isAdmin ? 'Admin' : isEditor && isContributor ? 'Staff' : isEditor ? 'Editor' : 'Contributor'}
          </span>
        </button>
      )}

      {/* Never hideable: on mobile this is the only route into Settings, so it
          isn't wired to the nav-control visibility map the side menu uses. */}
      <button onClick={() => toggleSettings()} className={tabCls(false)}>
        <Settings size={24} />
        <span className={labelCls}>Settings</span>
      </button>
    </nav>
  )
}
