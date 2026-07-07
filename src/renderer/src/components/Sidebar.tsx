import React, { useState, useEffect } from 'react'
import { SearchCode, HardDrive, Settings, ShieldCheck, ListMusic, Library, LogIn, LogOut, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Download } from 'lucide-react'
import logo from '../assets/logo.png'
import { useStore } from '../store/useStore'
import { ViewType } from '../types'
import PlaylistContextMenu, { PlaylistContextMenuState } from './PlaylistContextMenu'

const LS_COLLAPSED = 'sidebar:collapsed'
const LS_PLAYLISTS_EXPANDED = 'sidebar:playlistsExpanded'

export default function Sidebar(): JSX.Element {
  const { activeView, setActiveView, setShowSettings, account, logoutAccount, setShowUserAuth, playlists, setPendingPlaylistId } = useStore()
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

  const items: { icon: React.ReactNode; label: string; view: ViewType }[] = [
    { icon: <img src={logo} alt="WRLD" className="w-[22px] h-[22px] object-contain" />, label: 'WRLD', view: 'wrld' },
    { icon: <SearchCode size={18} />, label: 'Tracker', view: 'api-tracker' },
    { icon: <HardDrive size={18} />, label: 'Files', view: 'api-files' },
    ...(isElectron ? [{ icon: <Library size={18} />, label: 'Library', view: 'library' as const }] : []),
    { icon: <ListMusic size={18} />, label: 'Playlists', view: 'playlists' },
  ]

  return (
    <aside
      className={`hidden md:flex flex-col h-full bg-sidebar shrink-0 border-r border-[var(--border)] transition-[width] duration-200 ${collapsed ? 'w-16' : 'w-60'}`}
    >
      {isElectron && (
        <div className="shrink-0 h-7 w-full select-none" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
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
                onClick={() => {
                  if (activeView === view && view === 'playlists') {
                    window.dispatchEvent(new CustomEvent('playlists:back'))
                  } else {
                    setActiveView(view)
                  }
                }}
                title={collapsed ? label : undefined}
                className={`flex items-center flex-1 min-w-0 py-2 transition-[padding-left,gap] duration-200 ${collapsed ? 'pl-3 gap-0' : 'pl-0 gap-3'}`}
              >
                <span className="shrink-0 flex items-center justify-center">{icon}</span>
                <span
                  aria-hidden={collapsed}
                  className={`flex-1 text-left truncate transition-opacity duration-200 ${collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
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
          <span className="w-6 h-6 flex items-center justify-center shrink-0">{collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}</span>
          <span aria-hidden={collapsed} className={`truncate transition-opacity duration-200 ${collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>Collapse</span>
        </button>
      </div>

      {playlistMenu && (
        <PlaylistContextMenu state={playlistMenu} onClose={() => setPlaylistMenu(null)} />
      )}
    </aside>
  )
}
