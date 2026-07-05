import { SearchCode, Settings, ShieldCheck, ListMusic, Disc } from 'lucide-react'
import logo from '../assets/logo.png'
import { useStore } from '../store/useStore'
import { ViewType } from '../types'

export default function BottomNav(): JSX.Element {
  const { activeView, setActiveView, setShowSettings, account } = useStore()
  const isAdmin = !!account?.is_administrator

  const items: { icon: React.ReactNode; label: string; view: ViewType }[] = [
    { icon: <img src={logo} alt="WRLD" className="w-8 h-8 object-contain" />, label: 'WRLD', view: 'wrld' },
    { icon: <SearchCode size={24} />, label: 'Tracker', view: 'api-tracker' },
    { icon: <ListMusic size={24} />, label: 'Playlists', view: 'playlists' },
    { icon: <Disc size={24} />, label: 'Albums', view: 'albums-admin' },
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
      {isAdmin && (
        <button
          onClick={() => setActiveView('admin')}
          className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-1 transition-colors overflow-hidden relative ${activeView === 'admin' ? 'text-accent' : 'text-text-muted'}`}
        >
          {activeView === 'admin' && (
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full" style={{ background: 'var(--accent)' }} />
          )}
          <ShieldCheck size={24} />
          <span className="text-[10px] font-semibold leading-none w-full text-center truncate px-0.5">Admin</span>
        </button>
      )}
      <button
        onClick={() => setShowSettings(true)}
        className="flex-1 flex flex-col items-center justify-center py-2.5 gap-1 text-text-muted transition-colors overflow-hidden"
      >
        <Settings size={24} />
        <span className="text-[10px] font-semibold leading-none w-full text-center truncate px-0.5">Settings</span>
      </button>
    </nav>
  )
}
