import React, { useState, useEffect } from 'react'
import { Settings, ShieldCheck, LogIn, LogOut, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Download, Info } from 'lucide-react'
import logo from '../assets/logo.png'
import { useStore, useStorePick } from '../store/useStore'
import { ViewType } from '../types'
import { orderedNavItems } from '../lib/navItems'
import PlaylistContextMenu, { PlaylistContextMenuState } from './PlaylistContextMenu'

const LS_COLLAPSED = 'sidebar:collapsed'
const LS_PLAYLISTS_EXPANDED = 'sidebar:playlistsExpanded'

export default function Sidebar(): JSX.Element {
  const { activeView, setActiveView, setShowSettings, setShowDiagnostics, developerMode, account, logoutAccount, setShowUserAuth, playlists, setPendingPlaylistId, sidebarPosition, navOrder } = useStorePick('activeView', 'setActiveView', 'setShowSettings', 'setShowDiagnostics', 'developerMode', 'account', 'logoutAccount', 'setShowUserAuth', 'playlists', 'setPendingPlaylistId', 'sidebarPosition', 'navOrder')
  const isElectron = navigator.userAgent.includes('Electron')
  const isAdmin = !!account?.is_administrator

  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem(LS_COLLAPSED) === 'true'
  )
  // showExpanded trails collapsed: hides immediately on collapse, appears
  // after ~120ms on expand so content doesn't pop in before the sidebar widens.
  const [showExpanded, setShowExpanded] = useState<boolean>(!collapsed)

  useEffect(() => {
    if (collapsed) {
      setShowExpanded(false)
    } else {
      const t = setTimeout(() => setShowExpanded(true), 120)
      return () => clearTimeout(t)
    }
  }, [collapsed])

  const toggle = (): void => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(LS_COLLAPSED, String(next))
  }

  const [playlistsExpanded, setPlaylistsExpanded] = useState<boolean>(
    () => localStorage.getItem(LS_PLAYLISTS_EXPANDED) === 'true'
  )
  const togglePlaylistsExpanded = (): void => {
    const next = !playlistsExpanded
    setPlaylistsExpanded(next)
    localStorage.setItem(LS_PLAYLISTS_EXPANDED, String(next))
  }

  const openPlaylist = (id: number): void => {
    setPendingPlaylistId(id)
    setActiveView('playlists')
  }

  const [playlistMenu, setPlaylistMenu] = useState<PlaylistContextMenuState | null>(null)

  // Order comes from Settings → Appearance → Menu order (drag-to-reorder);
  // orderedNavItems sanitizes the saved list and drops web-hidden destinations.
  const items = orderedNavItems(navOrder).filter((i) => isElectron || !i.electronOnly)

  const navClick = (view: ViewType): void => {
    if (activeView === view && view === 'playlists') {
      window.dispatchEvent(new CustomEvent('playlists:back'))
    } else {
      setActiveView(view)
    }
  }

  // ── Horizontal bar (Settings → Appearance → Navigation position: top/bottom).
  // Nav items keep icon+label; the account/admin/settings cluster goes
  // icon-only, and the collapse toggle + inline playlist tree don't apply.
  if (sidebarPosition === 'top' || sidebarPosition === 'bottom') {
    const iconBtn = 'flex items-center justify-center w-8 h-8 rounded text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors shrink-0'
    return (
      <aside className={`hidden md:flex flex-col w-full bg-sidebar shrink-0 border-[var(--border)] ${sidebarPosition === 'top' ? 'border-b' : 'border-t'}`}>
        {/* Bar touches the frameless window's top edge, so it carries the
            drag strip that main's overlay provides in the other layouts.
            mr-[188px] keeps the strip clear of the min/max/close buttons
            (132px) plus the fixed downloads trigger next to them (right:
            144px + 36px wide — see DownloadManager) — a drag rect under
            them would win the draggable-region ordering and swallow their
            clicks (see WindowControls in App.tsx). */}
        {isElectron && sidebarPosition === 'top' && (
          <div className="shrink-0 h-7 mr-[188px] select-none" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
        )}
        <div className="flex items-center gap-1 px-3 py-1.5 min-w-0">
          <nav className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
            {items.map(({ icon, label, view }) => (
              <button
                key={view}
                onClick={() => navClick(view)}
                className={`flex items-center gap-2 pl-2 pr-3 py-1.5 rounded text-sm font-medium whitespace-nowrap transition-colors ${
                  activeView === view
                    ? 'bg-surface-raised text-text-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised'
                }`}
              >
                <span className="w-6 h-6 shrink-0 flex items-center justify-center">{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-1 shrink-0">
            {account ? (
              <>
                <button
                  onClick={() => setActiveView('editor-profile')}
                  title={account.display_name || account.discord_username}
                  className={`${iconBtn} hover:bg-transparent hover:opacity-80`}
                >
                  {account.discord_avatar ? (
                    <img src={account.discord_avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-[10px] font-semibold">
                      {(account.display_name || account.discord_username || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                </button>
                <button onClick={() => logoutAccount()} title="Log out" className={iconBtn}>
                  <LogOut size={16} />
                </button>
              </>
            ) : (
              <button onClick={() => setShowUserAuth(true)} title="Log in" className={iconBtn}>
                <LogIn size={18} />
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => setActiveView('admin')}
                title="Admin"
                className={`${iconBtn} ${activeView === 'admin' ? 'bg-surface-raised !text-text-primary' : ''}`}
              >
                <ShieldCheck size={18} />
              </button>
            )}
            {!isElectron && (
              <a
                href="https://github.com/leanwrldd/unreleased/releases/latest"
                target="_blank"
                rel="noopener noreferrer"
                title="Download desktop app"
                className={iconBtn}
              >
                <Download size={18} />
              </a>
            )}
            {developerMode && (
              <button onClick={() => setShowDiagnostics(true)} title="Diagnostics" className={iconBtn}>
                <Info size={18} />
              </button>
            )}
            <button onClick={() => setShowSettings(true)} title="Settings" className={iconBtn}>
              <Settings size={18} />
            </button>
          </div>
        </div>
      </aside>
    )
  }

  return (
    <aside
      className={`hidden md:flex flex-col h-full bg-sidebar shrink-0 ${sidebarPosition === 'right' ? 'border-l' : 'border-r'} border-[var(--border)] transition-[width] duration-200 ${collapsed ? 'w-16' : 'w-60'}`}
    >
      {/* On the right, the sidebar's top edge sits under the window buttons
          (132px) and the fixed downloads trigger next to them (right: 144px
          + 36px wide — see DownloadManager) — keep the drag strip out of
          their 188px corner (same ordering pitfall as the top-bar strip
          above), and give the first nav item real clearance below them so
          it doesn't visually run into the buttons when the sidebar is wide
          enough to sit under them (expanded width, or any width once
          collapsed still tucks under the min/max/close cluster). */}
      {isElectron && (
        <div
          className={`shrink-0 select-none ${sidebarPosition === 'right' ? 'h-9 mr-[188px]' : 'h-7'}`}
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        />
      )}
      {/* Logo — collapses to zero height (redundant with the WRLD tab icon) */}
      <div
        className="flex flex-col items-center gap-1 shrink-0 px-5 overflow-hidden transition-[max-height,opacity] duration-200 ease-in-out"
        style={{ maxHeight: collapsed ? '0px' : '200px', opacity: collapsed ? 0 : 1 }}
      >
        <div className="pt-5 pb-4 flex flex-col items-center gap-1">
          <img src={logo} alt="unreleased" className="object-contain h-32 w-auto" />
          <span
            className="text-text-primary text-sm uppercase select-none whitespace-nowrap"
            style={{ fontFamily: "'Josefin Sans', sans-serif", fontWeight: 300, letterSpacing: '0.35em' }}
          >
            unreleased
          </span>
        </div>
      </div>

      {/* Nav items */}
      <nav className="space-y-1 flex-1 min-h-0 overflow-y-auto px-3">
        {items.map(({ icon, label, view }) => (
          <div key={view}>
            <div
              className={`flex items-center w-full rounded text-sm font-medium transition-colors ${
                activeView === view
                  ? 'bg-surface-raised text-text-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised'
              }`}
            >
              <button
                onClick={() => navClick(view)}
                title={collapsed ? label : undefined}
                className="flex items-center flex-1 min-w-0 py-2 pl-2 gap-3"
              >
                <span className="w-6 h-6 shrink-0 flex items-center justify-center">{icon}</span>
                <span
                  aria-hidden={collapsed}
                  className={`text-left truncate transition-opacity duration-200 ${collapsed ? 'w-0 flex-none opacity-0 pointer-events-none' : 'flex-1 opacity-100'}`}
                >
                  {label}
                </span>
              </button>
              {view === 'playlists' && showExpanded && playlists.length > 0 && (
                <button
                  onClick={togglePlaylistsExpanded}
                  title={playlistsExpanded ? 'Hide playlists' : 'Show playlists'}
                  className="p-2 pr-3 text-text-muted hover:text-text-primary transition-colors shrink-0"
                >
                  {playlistsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              )}
            </div>

            {view === 'playlists' && showExpanded && playlistsExpanded && playlists.length > 0 && (
              <div className="mt-0.5 ml-[26px] space-y-0.5 border-l border-[var(--border)] pl-2 max-h-64 overflow-y-auto">
                {playlists.map((pl) => (
                  <button
                    key={pl.id}
                    onClick={() => openPlaylist(pl.id)}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setPlaylistMenu({ playlist: pl, x: e.clientX, y: e.clientY }) }}
                    title={pl.name}
                    className="flex items-center w-full py-1.5 px-2 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors truncate"
                  >
                    <span className="truncate">{pl.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="pb-4 space-y-1 px-2">
        {account ? (
          <div className="flex items-center gap-3 py-2 rounded text-sm px-3">
            <button
              onClick={() => setActiveView('editor-profile')}
              title={collapsed ? (account.display_name || account.discord_username) : undefined}
              className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer hover:opacity-80 transition-opacity"
            >
              {account.discord_avatar ? (
                <img src={account.discord_avatar} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-[10px] font-semibold shrink-0">
                  {(account.display_name || account.discord_username || '?').charAt(0).toUpperCase()}
                </div>
              )}
              {showExpanded && (
                <span className="min-w-0 truncate text-text-secondary text-sm font-medium">{account.display_name || account.discord_username}</span>
              )}
            </button>
            {showExpanded && (
              <button onClick={() => logoutAccount()} title="Log out" className="text-text-muted hover:text-text-primary transition-colors shrink-0">
                <LogOut size={16} />
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={() => setShowUserAuth(true)}
            title={collapsed ? 'Log in' : undefined}
            className="flex items-center w-full py-2 rounded text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors gap-3 px-3"
          >
            <span className="w-6 h-6 flex items-center justify-center shrink-0"><LogIn size={18} /></span>
            <span aria-hidden={collapsed} className={`truncate transition-opacity duration-200 ${collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>Log in</span>
          </button>
        )}
        {isAdmin && (
          <button
            onClick={() => setActiveView('admin')}
            title={collapsed ? 'Admin' : undefined}
            className={`flex items-center w-full py-2 rounded text-sm font-medium transition-colors gap-3 px-3 ${
              activeView === 'admin'
                ? 'bg-surface-raised text-text-primary'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised'
            }`}
          >
            <span className="w-6 h-6 flex items-center justify-center shrink-0"><ShieldCheck size={18} /></span>
            <span aria-hidden={collapsed} className={`truncate transition-opacity duration-200 ${collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>Admin</span>
          </button>
        )}
        {/* Only on the web build — Electron users already have the app. */}
        {!isElectron && (
          <a
            href="https://github.com/leanwrldd/unreleased/releases/latest"
            target="_blank"
            rel="noopener noreferrer"
            title={collapsed ? 'Download desktop app' : undefined}
            className="flex items-center w-full py-2 rounded text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors gap-3 px-3"
          >
            <span className="w-6 h-6 flex items-center justify-center shrink-0"><Download size={18} /></span>
            <span aria-hidden={collapsed} className={`truncate transition-opacity duration-200 ${collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>Download app</span>
          </a>
        )}
        {developerMode && (
          <button
            onClick={() => setShowDiagnostics(true)}
            title={collapsed ? 'Diagnostics' : undefined}
            className="flex items-center w-full py-2 rounded text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors gap-3 px-3"
          >
            <span className="w-6 h-6 flex items-center justify-center shrink-0"><Info size={18} /></span>
            <span aria-hidden={collapsed} className={`truncate transition-opacity duration-200 ${collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>Diagnostics</span>
          </button>
        )}
        <button
          onClick={() => setShowSettings(true)}
          title={collapsed ? 'Settings' : undefined}
          className="flex items-center w-full py-2 rounded text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors gap-3 px-3"
        >
          <span className="w-6 h-6 flex items-center justify-center shrink-0"><Settings size={18} /></span>
          <span aria-hidden={collapsed} className={`truncate transition-opacity duration-200 ${collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>Settings</span>
        </button>

        {/* Collapse toggle */}
        <button
          onClick={toggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex items-center w-full py-2 rounded text-sm font-medium text-text-muted hover:text-text-primary hover:bg-surface-raised transition-colors gap-3 px-3"
        >
          {/* Chevron points where the edge will move — mirrored when the
              sidebar sits on the right. */}
          <span className="w-6 h-6 flex items-center justify-center shrink-0">
            {collapsed !== (sidebarPosition === 'right') ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </span>
          <span aria-hidden={collapsed} className={`truncate transition-opacity duration-200 ${collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>Collapse</span>
        </button>
      </div>

      {playlistMenu && (
        <PlaylistContextMenu state={playlistMenu} onClose={() => setPlaylistMenu(null)} />
      )}
    </aside>
  )
}
