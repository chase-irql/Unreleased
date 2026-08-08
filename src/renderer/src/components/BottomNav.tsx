import { ReactNode, useEffect, useRef } from 'react'
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
//
// Hard-capped at 5 tabs total, Settings always the last of them — a phone-width
// row scrolling to reach a 7th or 8th enabled item (the previous behavior) is
// worse than just not offering that many at once. Whatever's toggled on beyond
// the first 4 (in the user's own saved order) simply doesn't appear here; it's
// still reachable through the desktop side menu.
const MAX_TABS = 5

interface Tab { view: ViewType; icon: ReactNode; label: string }

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
  // NAV_ITEMS icons are sized for the 18px side menu; scale them up to a
  // touch-appropriate 24 without forking the definitions.
  const navItemTabs: Tab[] = orderedNavItems(navOrder)
    .filter((i) => isNavItemVisible(i, navVisibility, isElectron))
    .map((item) => ({
      view: item.view,
      label: item.label,
      icon: <span className="[&_svg]:w-6 [&_svg]:h-6 [&_img]:w-7 [&_img]:h-7 flex items-center justify-center">{item.icon}</span>,
    }))

  // Albums and the staff profile aren't in NAV_ITEMS (they're role-gated extras
  // with no desktop side-menu row), so they stay special-cased here and read
  // their toggle out of the same map under their view id.
  const navShown = (view: ViewType): boolean => navVisibility[view] ?? true
  const extraTabs: Tab[] = []
  if ((isAdmin || isEditor) && navShown('albums-admin')) {
    extraTabs.push({ view: 'albums-admin', icon: <Disc size={24} />, label: 'Albums' })
  }
  if ((isAdmin || isEditor || isContributor)
    && (isContributor && !isEditor ? navShown('contributor-profile') : navShown('editor-profile'))) {
    extraTabs.push({
      view: profileView,
      icon: <ShieldCheck size={24} />,
      label: isAdmin ? 'Admin' : isEditor && isContributor ? 'Staff' : isEditor ? 'Editor' : 'Contributor',
    })
  }

  // Settings has a guaranteed slot (it's the only route into Settings on
  // mobile), so the rest compete for the remaining MAX_TABS - 1 spots.
  const tabs = [...navItemTabs, ...extraTabs].slice(0, MAX_TABS - 1)

  const tabCls = (active: boolean): string =>
    `flex-1 min-w-0 flex flex-col items-center justify-center py-2.5 gap-1 transition-colors relative overflow-hidden ${
      active ? 'text-accent' : 'text-text-muted'
    }`
  const labelCls = 'text-[10px] font-semibold leading-none w-full text-center truncate px-0.5'
  const marker = (active: boolean): JSX.Element | null => active ? (
    <span
      className={`absolute ${atTop ? 'bottom-0' : 'top-0'} left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full`}
      style={{ background: 'var(--accent)' }}
    />
  ) : null

  // Published as a CSS var so other full-screen overlays (mobile Settings)
  // can carve out exactly this much space instead of covering the nav bar —
  // measured rather than hardcoded since it varies with the safe-area inset.
  // Zero on desktop, where this is display:none and the rule is a no-op.
  const navRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = navRef.current
    if (!el) return
    const publish = (): void => {
      document.documentElement.style.setProperty('--bottom-nav-height', `${el.offsetHeight}px`)
    }
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => { ro.disconnect(); document.documentElement.style.setProperty('--bottom-nav-height', '0px') }
  }, [])

  return (
    <nav
      ref={navRef}
      className="md:hidden flex items-stretch bg-sidebar shrink-0"
      style={atTop
        ? { borderBottom: '1px solid var(--border)', paddingTop: 'env(safe-area-inset-top, 0px)' }
        : { borderTop: '1px solid var(--border)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {tabs.map((tab) => {
        const active = activeView === tab.view
        return (
          <button
            key={tab.view}
            onClick={() => {
              if (activeView === tab.view && tab.view === 'playlists') {
                window.dispatchEvent(new CustomEvent('playlists:back'))
              } else {
                setActiveView(tab.view)
              }
            }}
            className={tabCls(active)}
          >
            {marker(active)}
            {tab.icon}
            <span className={labelCls}>{tab.label}</span>
          </button>
        )
      })}

      {/* Never hideable or counted against the cap: on mobile this is the
          only route into Settings. */}
      <button onClick={() => toggleSettings()} className={tabCls(false)}>
        <Settings size={24} />
        <span className={labelCls}>Settings</span>
      </button>
    </nav>
  )
}
