import { SearchCode, Settings, ShieldCheck, ListMusic, Disc, Music4 } from 'lucide-react'
import logo from '../assets/logo.png'
import { useStore, useStorePick } from '../store/useStore'
import { ViewType } from '../types'
import { CONTRIBUTOR_ENABLED } from '../lib/userApi'

export default function BottomNav(): JSX.Element {
  const { activeView, setActiveView, toggleSettings, account, navVisibility } = useStorePick('activeView', 'setActiveView', 'toggleSettings', 'account', 'navVisibility')
  const isAdmin = !!account?.is_administrator
  const isEditor = !!account?.is_editor
  const isContributor = CONTRIBUTOR_ENABLED && !!account?.is_contributor
  const profileView = isContributor && !isEditor ? 'contributor-profile' : 'editor-profile'

  // Album (albums-admin) and the Editor/Admin profile tab are editor/admin-only
  // extras. They're hideable from Settings → Appearance → Menu items — the
  // toggle is stored in the shared navVisibility map under the view id, so
  // `?? true` keeps them on until the user turns them off. (These are the only
  // mobile tabs wired to that toggle; the rest are the fixed core set.)
  const navShown = (view: ViewType): boolean => navVisibility[view] ?? true
  const showAlbums = (isAdmin || isEditor) && navShown('albums-admin')
  const showEditorTab = (isAdmin || isEditor) && navShown('editor-profile')

  const items: { icon: React.ReactNode; label: string; view: ViewType }[] = [
    { icon: <img src={logo} alt="WRLD" className="w-8 h-8 object-contain" />, label: 'WRLD', view: 'wrld' },
    { icon: <SearchCode size={24} />, label: 'Tracker', view: 'api-tracker' },
    { icon: <ListMusic size={24} />, label: 'Playlists', view: 'playlists' },
    { icon: <Music4 size={24} />, label: 'Heardle', view: 'heardle' },
    ...(showAlbums
      ? [{ icon: <Disc size={24} />, label: 'Albums', view: 'albums-admin' as ViewType }]
      : []),
  ]

  return (
    <nav className="md:hidden flex items-stretch bg-sidebar shrink-0" style={{ borderTop: '1px solid var(--border)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {items.map(({ icon, label, view }) => {
        const active = activeView === view
        return (
          <button
            key={view}
            onClick={() => {
              if (activeView === view && view === 'playlists') {
                window.dispatchEvent(new CustomEvent('playlists:back'))
              } else {
                setActiveView(view)
              }
            }}
            className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-1 transition-colors relative overflow-hidden ${active ? 'text-accent' : 'text-text-muted'}`}
          >
            {active && (
              <span
                className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
                style={{ background: 'var(--accent)' }}
              />
            )}
            {icon}
            <span className="text-[10px] font-semibold leading-none w-full text-center truncate px-0.5">
              {label}
            </span>
          </button>
        )
      })}
      {/* Admin review tools live inside the editor profile page (Admin tab)
          now — one profile entry for both roles instead of a separate Admin
          view in the nav. Hideable via Settings (see showEditorTab). */}
      {((isAdmin || isEditor || isContributor) && (
        isContributor && !isEditor ? (navVisibility['contributor-profile'] ?? true) : showEditorTab
      )) && (
        <button
          onClick={() => setActiveView(profileView)}
          className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-1 transition-colors overflow-hidden relative ${activeView === profileView ? 'text-accent' : 'text-text-muted'}`}
        >
          {activeView === profileView && (
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full" style={{ background: 'var(--accent)' }} />
          )}
          <ShieldCheck size={24} />
          <span className="text-[10px] font-semibold leading-none w-full text-center truncate px-0.5">
            {isAdmin ? 'Admin' : isEditor && isContributor ? 'Staff' : isEditor ? 'Editor' : 'Contributor'}
          </span>
        </button>
      )}
      <button
        onClick={() => toggleSettings()}
        className="flex-1 flex flex-col items-center justify-center py-2.5 gap-1 text-text-muted transition-colors overflow-hidden"
      >
        <Settings size={24} />
        <span className="text-[10px] font-semibold leading-none w-full text-center truncate px-0.5">Settings</span>
      </button>
    </nav>
  )
}
