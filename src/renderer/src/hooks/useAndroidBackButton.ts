import { useEffect } from 'react'
import { useStore } from '../store/useStore'
import { runBackHandlers } from '../lib/backHandlers'
import type { ViewType } from '../types'

// Android's hardware/gesture back, wired to the same thing it means everywhere
// else: undo the last step. Without this the WebView falls back to browser
// history — which this SPA never pushes to — so back closed the app from
// anywhere, even with a modal open and music playing.
//
// Resolution order, first match wins:
//   1. a locally-registered handler (Settings' drill-down — see backHandlers)
//   2. the topmost open overlay, innermost first
//   3. the previously visited view
//   4. nothing left → minimize rather than exit, so playback survives
//
// Desktop/web are untouched: the listener only attaches on a native platform.
const HOME_VIEW: ViewType = 'api-tracker'
const MAX_HISTORY = 30

export function useAndroidBackButton(): void {
  useEffect(() => {
    if (!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) return

    // Views visited this session. setActiveView is called from all over the
    // app, so rather than thread a router through everything, mirror its
    // changes here; `navigatingBack` keeps our own pops from re-pushing.
    const history: ViewType[] = [useStore.getState().activeView]
    let navigatingBack = false

    const unsubscribe = useStore.subscribe((state, prev) => {
      if (state.activeView === prev.activeView) return
      if (navigatingBack) { navigatingBack = false; return }
      history.push(state.activeView)
      if (history.length > MAX_HISTORY) history.shift()
    })

    const goBack = (): void => {
      if (runBackHandlers()) return

      // Innermost first: transient modals sit above the panels, which sit
      // above the page. Each closer is a no-op when that layer isn't open.
      const s = useStore.getState()
      if (s.reportModal)    { s.closeReport(); return }
      if (s.convertModal)   { s.closeConvert(); return }
      if (s.urlImportModal) { s.closeUrlImport(); return }
      if (s.showUserAuth)   { s.setShowUserAuth(false); return }
      if (s.showEqPanel)    { s.setShowEqPanel(false); return }
      if (s.showDiagnostics) { s.setShowDiagnostics(false); return }
      if (s.showSettings)   { s.setShowSettings(false); return }
      if (s.showQueue)      { s.setShowQueue(false); return }
      if (s.showNowPlaying) { s.setShowNowPlaying(false); return }

      if (history.length > 1) {
        history.pop()
        navigatingBack = true
        s.setActiveView(history[history.length - 1])
        return
      }
      if (s.activeView !== HOME_VIEW) {
        navigatingBack = true
        s.setActiveView(HOME_VIEW)
        return
      }
      // Nothing left to undo. Minimize instead of exitApp(): this is a music
      // player, and killing the process would stop playback outright.
      void import('@capacitor/app').then(({ App }) => App.minimizeApp())
    }

    let detach: (() => void) | null = null
    let disposed = false
    void import('@capacitor/app').then(async ({ App }) => {
      const handle = await App.addListener('backButton', goBack)
      if (disposed) void handle.remove()
      else detach = () => { void handle.remove() }
    })

    return () => {
      disposed = true
      detach?.()
      unsubscribe()
    }
  }, [])
}
