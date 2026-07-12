import logo from '../assets/logo.png'
import { useStore, useStorePick } from '../store/useStore'

export default function NotFoundView(): JSX.Element {
  const { setActiveView } = useStorePick('setActiveView')
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center px-6">
      <img src={logo} alt="unreleased" className="w-16 h-16 object-contain opacity-40" />
      <div>
        <p className="text-text-muted text-xs uppercase tracking-widest mb-1 font-semibold">404</p>
        <h1 className="text-text-primary text-2xl font-bold mb-2">Page not found</h1>
        <p className="text-text-muted text-sm">That URL doesn't exist.</p>
      </div>
      <button
        onClick={() => setActiveView('api-tracker')}
        className="px-5 py-2.5 rounded-xl bg-accent/15 hover:bg-accent/25 text-accent text-sm font-semibold transition-colors"
      >
        Back to Tracker
      </button>
    </div>
  )
}
