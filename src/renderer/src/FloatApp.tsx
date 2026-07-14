import { Suspense, lazy, useEffect } from 'react'
import { useStore } from './store/useStore'
import { useThemeEffects } from './lib/themeEffects'

const Settings = lazy(() => import('./components/Settings'))

// Shell for floating pop-out windows: main.js createFloatWindow opens a second
// frameless BrowserWindow on the same bundle with ?float=<view>, and main.tsx
// mounts this instead of <App/> — a single view filling the whole window,
// with store state mirrored to the main window by lib/windowSync.
export default function FloatApp({ view }: { view: string }): JSX.Element {
  useThemeEffects()

  // The library track list is too big to mirror through the sync channel —
  // load it from disk so Settings → Library shows real track counts.
  useEffect(() => {
    useStore.getState().loadLibrary()
  }, [])

  return (
    <div className="h-dvh bg-surface overflow-hidden">
      <Suspense fallback={null}>
        {view === 'settings' && <Settings floating />}
      </Suspense>
    </div>
  )
}
