import { useEffect, Suspense } from 'react'
import { lazyView as lazy } from './lib/lazyView'
import { useStore, useStorePick } from './store/useStore'
import { setToken, getToken } from './lib/userApi'
import { useThemeEffects } from './lib/themeEffects'
import { useAndroidBackButton } from './hooks/useAndroidBackButton'
import { runWhenIdle } from './lib/platform'
import { ViewType } from './types'

function getViewFromPath(pathname: string): ViewType {
  if (pathname === '/' || pathname === '/tracker') return 'api-tracker'
  if (pathname.startsWith('/files')) return 'api-files'
  if (pathname === '/editor') return 'editor'
  if (pathname === '/contributor') return 'contributor'
  if (pathname === '/admin') return 'admin'
  if (pathname === '/liked') return 'liked'
  if (pathname === '/playlists') return 'playlists'
  if (pathname === '/docs') return 'docs'
  if (pathname === '/wrld') return 'wrld'
  if (pathname === '/news') return 'news'
  if (pathname === '/heardle') return 'heardle'
  if (pathname === '/wordle') return 'wordle'
  if (pathname === '/tierlist') return 'tierlist'
  if (pathname === '/stats') return 'stats'
  if (pathname.startsWith('/shared/')) return 'shared-playlist'
  if (pathname === '/library') return 'library'
  if (pathname === '/auth/discord/callback') return 'api-tracker'
  return 'not-found'
}

import Sidebar from './components/Sidebar'
import BottomNav from './components/BottomNav'
import ApiTrackerView from './components/ApiTrackerView'
import ApiFilesView from './components/ApiFilesView'
import LikedSongsView from './components/LikedSongsView'
import PlaylistsView from './components/PlaylistsView'
import RadioFmPlayer from './components/RadioFmPlayer'
import RadioVotePopup from './components/RadioVotePopup'
import DiscordRpcSync from './components/DiscordRpcSync'
import LastfmScrobbler from './components/LastfmScrobbler'
import NewsNotifier from './components/NewsNotifier'
import UserAuthModal from './components/UserAuthModal'
import ReportModal from './components/ReportModal'
import ConvertFormatModal from './components/ConvertFormatModal'
import BulkEditModal from './components/BulkEditModal'
import UrlImportModal from './components/UrlImportModal'
import CookieNotice from './components/CookieNotice'
import { GlobalSongInfoHost } from './components/SongInfoModal'
import Player from './components/Player'
import QueuePanel from './components/QueuePanel'
import DownloadManager from './components/DownloadManager'
import LibraryTab from './components/LibraryTab'
import ErrorBoundary from './components/ErrorBoundary'

// Rarely-visited views load on first navigation instead of inflating the
// startup bundle. Suspense fallback is null: these chunks are small, so a
// spinner would just flash.
const EditorPage = lazy(() => import('./components/EditorPage'))
const AdminPage = lazy(() => import('./components/AdminPage'))
const SharedPlaylistView = lazy(() => import('./components/SharedPlaylistView'))
const EditorProfileView = lazy(() => import('./components/EditorProfileView'))
const NotFoundView = lazy(() => import('./components/NotFoundView'))
const DocsPage = lazy(() => import('./components/DocsPage'))
const WrldView = lazy(() => import('./components/WrldView'))
const NewsView = lazy(() => import('./components/NewsView'))
const HeardleView = lazy(() => import('./components/HeardleView'))
const WordleView = lazy(() => import('./components/WordleView'))
const TierlistView = lazy(() => import('./components/TierlistView'))
const StatsView = lazy(() => import('./components/StatsView'))
const LocalEditorPage = lazy(() => import('./components/LocalEditorPage'))
const ContributorPage = lazy(() => import('./components/ContributorPage'))
const ContributorProfileView = lazy(() => import('./components/ContributorProfileView'))
const Settings = lazy(() => import('./components/Settings'))
const DiagnosticsModal = lazy(() => import('./components/DiagnosticsModal'))

export default function App(): JSX.Element {
  const { showQueue, showSettings, setShowSettings, showDiagnostics, setShowDiagnostics, activeView, sidebarPosition, loadAccount, completeDiscordLogin, showUserAuth, setShowUserAuth, prefetchApiData, loadLibrary, scanLibrary, libraryAutoRefresh, libraryFolders, refreshPlaylists, loadOfflineLibrary, heroBleedTop } = useStorePick(
    'showQueue', 'showSettings', 'setShowSettings', 'showDiagnostics', 'setShowDiagnostics', 'activeView', 'sidebarPosition', 'loadAccount', 'completeDiscordLogin', 'showUserAuth', 'setShowUserAuth', 'prefetchApiData', 'loadLibrary', 'scanLibrary', 'libraryAutoRefresh', 'libraryFolders', 'refreshPlaylists', 'loadOfflineLibrary', 'heroBleedTop')
  useThemeEffects()
  // Android hardware back → close the topmost overlay / step back a view.
  // No-op off native.
  useAndroidBackButton()
  // Seed auth token from env in local dev only — import.meta.env.DEV is false in production
  // builds, so this never runs for real users even if the token is baked into the bundle.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const devToken = import.meta.env.VITE_AUTH_TOKEN as string | undefined
    if (devToken) { setToken(devToken); loadAccount() }
  }, [])

  // Sync view from URL on mount + handle back/forward
  useEffect(() => {
    const syncFromPath = (): void => {
      useStore.setState({ activeView: getViewFromPath(window.location.pathname) })
    }
    syncFromPath()
    window.addEventListener('popstate', syncFromPath)
    return () => window.removeEventListener('popstate', syncFromPath)
  }, [])

  // Complete Discord OAuth redirect, then load the public account
  useEffect(() => {
    if (window.location.pathname === '/auth/discord/callback') {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const state = params.get('state')
      const finish = (): void => {
        window.history.replaceState({}, '', '/tracker')
        useStore.setState({ activeView: 'api-tracker' })
      }
      if (code && state) {
        completeDiscordLogin(code, state).catch(() => undefined).finally(finish)
      } else {
        finish()
      }
      return
    }
    loadAccount()
  }, [loadAccount, completeDiscordLogin])

  // Warm the Tracker/Files offline cache on startup (public data — no auth
  // needed), so those views are ready before the user first opens them.
  // Deferred to idle: none of it is needed to paint, and running it in the
  // mount commit put four requests in front of the ones the visible view was
  // making at that same moment. Overlap with those is still free — apiRequest
  // dedupes identical in-flight GETs.
  useEffect(() => runWhenIdle(() => { prefetchApiData() }), [prefetchApiData])

  // Read the saved local library (metadata only — covers stream in per row)
  // during idle after boot, so the first Library/Playlists open is instant
  // instead of waiting on a file read plus a bridge round trip. loadLibrary
  // is idempotent, so this never double-reads with a tab-mount call.
  useEffect(() => runWhenIdle(() => { loadLibrary() }), [loadLibrary])

  // Offline-downloaded playlists/tracks are disk truth, not persisted store
  // state — every mutation (download/remove) re-reads and overwrites this,
  // but nothing populated it on a fresh launch at all, so a relaunch showed a
  // playlist that's genuinely offline as not-offline until the next edit.
  // getOfflineApi() is null on the plain web build, so this is a no-op there.
  useEffect(() => runWhenIdle(() => { loadOfflineLibrary() }), [loadOfflineLibrary])

  // "Auto-refresh" (Settings → Library) — opt-in background rescan so files
  // added or re-tagged outside the app show up without an explicit "Scan now".
  // The scan skips anything whose size and date are unchanged, so this stays
  // cheap. Also runs when the app comes back to the foreground, which is when
  // a change made in a file manager is most likely to have just happened.
  useEffect(() => {
    if (!libraryAutoRefresh || libraryFolders.length === 0) return
    loadLibrary().then(() => scanLibrary())
    const onVisible = (): void => { if (document.visibilityState === 'visible') scanLibrary() }
    document.addEventListener('visibilitychange', onVisible)
    const interval = setInterval(() => scanLibrary(), 15 * 60 * 1000)
    return () => { document.removeEventListener('visibilitychange', onVisible); clearInterval(interval) }
  }, [libraryAutoRefresh, libraryFolders, loadLibrary, scanLibrary])

  // Re-fetch playlists whenever the app comes back to the foreground. Playlist
  // edits (e.g. saving a shared playlist from the web) happen out-of-band from
  // whatever session this device has open, so without this the list only ever
  // updates on next full app start. refreshPlaylists() is a no-op while signed
  // out. Covers both the Android wrap (backgrounded, not killed) and a
  // desktop/browser tab left open and refocused.
  useEffect(() => {
    const onVisible = (): void => { if (document.visibilityState === 'visible') refreshPlaylists() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refreshPlaylists])

  // Deliver any reports queued in a previous session. loadAccount also flushes
  // after login (to attach the token), but this covers a signed-out user whose
  // loadAccount returns early. No-op until the reporting endpoints exist.
  useEffect(() => { useStore.getState()._flushReports() }, [])

  return (
    <div className="app-shell flex flex-col h-dvh bg-surface overflow-hidden">
      {/* Mobile nav parked above the content when Menu position = Top. It's
          md:hidden either way, so this branch is invisible on desktop (where
          the same setting moves the Sidebar instead). */}
      {sidebarPosition === 'top' && <ErrorBoundary fallback={null}><BottomNav /></ErrorBoundary>}
      {/* Sidebar stays first in the DOM; reverse variants place it visually
          on the right/bottom without reordering focus/tab order. */}
      <div className={`flex flex-1 overflow-hidden ${
        sidebarPosition === 'right' ? 'flex-row-reverse'
          : sidebarPosition === 'top' ? 'flex-col'
          : sidebarPosition === 'bottom' ? 'flex-col-reverse'
          : 'flex-row'
      }`}>
        <Sidebar />
        {/* Android runs the WebView edge-to-edge (viewport-fit=cover), so the
            CSS viewport starts behind the status bar / notch. Every view in
            here opens with a flat pt-5-ish header, which physically lands
            under the cutout — so the inset is absorbed once, here, instead of
            each view remembering to. The one case that opts out: anything
            position:fixed (QueuePanel, Settings, sheets) escapes
            this box entirely and owns its own inset.
            Skipped when the nav sits on top, since BottomNav already pads
            itself by the same amount and content flows below it. */}
        <main
          className="flex-1 overflow-hidden flex flex-col relative"
          // WRLD, and any view that's raised heroBleedTop (Playlists' detail
          // screen, while it has a hero cover to bleed), want a full-bleed
          // backdrop under the status bar and pad their own header to
          // compensate instead (see WRLD's and PlaylistsView's own comments)
          // — giving them padding here too would just reserve blank space
          // this box clips before their content could ever paint into it (a
          // negative-margin trick on a child's own root can't reach past this
          // overflow-hidden ancestor either, which is why that was tried and
          // didn't work). Every other view keeps the shared inset.
          style={sidebarPosition !== 'top' && !((activeView === 'wrld' || heroBleedTop) && !showSettings)
            ? { paddingTop: 'env(safe-area-inset-top, 0px)' } : undefined}
        >
          <div className="flex-1 overflow-hidden flex">
            <ErrorBoundary>
            <Suspense fallback={null}>
            {/* Settings is a page, not an overlay. It used to render as a
                fixed layer below, on top of everything including the player
                bar — so opening it hid what was playing. Rendering it in the
                content slot keeps the player and nav where they are, and it
                sits ahead of the view switch because `showSettings` is its own
                flag rather than an activeView (every setShowSettings caller in
                the app keeps working, and activeView still remembers the view
                underneath to return to). */}
            {showSettings ? <Settings />
              : activeView === 'api-tracker' ? <ApiTrackerView />
              : activeView === 'api-files' ? <ApiFilesView />
              : activeView === 'editor' ? <EditorPage />
              : activeView === 'contributor' ? <ContributorPage />
              : activeView === 'contributor-profile' ? <ContributorProfileView />
              : activeView === 'admin' ? <AdminPage />
              : activeView === 'liked' ? <LikedSongsView />
              : activeView === 'playlists' ? <PlaylistsView />
              : activeView === 'shared-playlist' ? <SharedPlaylistView />
              : activeView === 'editor-profile' ? <EditorProfileView />
              : activeView === 'docs' ? <DocsPage />
              : activeView === 'wrld' ? <WrldView />
              : activeView === 'news' ? <NewsView />
              : activeView === 'heardle' ? <HeardleView />
              : activeView === 'wordle' ? <WordleView />
              : activeView === 'tierlist' ? <TierlistView />
              : activeView === 'stats' ? <StatsView />
              : activeView === 'library' ? <LibraryTab />
              : activeView === 'local-editor' ? <LocalEditorPage />
              : activeView === 'not-found' ? <NotFoundView />
              : <ApiTrackerView />}
            </Suspense>
          </ErrorBoundary>
            {showQueue && activeView !== 'wrld' && <ErrorBoundary><QueuePanel /></ErrorBoundary>}
          </div>
        </main>
      </div>
      {/* Everything below is a loose sibling of the main content rather than a
          child of the pane boundary above, so an uncaught render error here
          used to unmount the entire app (a blank window). Each gets its own
          boundary: the chrome keeps a compact inline notice, the invisible
          background workers fail silently, and the modals/overlays show a
          centered, dismissible card. */}
      <ErrorBoundary fallback={<div className="h-20 shrink-0 border-t border-[var(--border)] flex items-center justify-center text-text-muted text-xs">Player crashed — reload the app to restore playback controls.</div>}>
        <Player />
      </ErrorBoundary>
      <ErrorBoundary fallback={null}><RadioFmPlayer /></ErrorBoundary>
      <ErrorBoundary fallback={null}><RadioVotePopup /></ErrorBoundary>
      <ErrorBoundary fallback={null}><DiscordRpcSync /></ErrorBoundary>
      <ErrorBoundary fallback={null}><LastfmScrobbler /></ErrorBoundary>
      <ErrorBoundary fallback={null}><NewsNotifier /></ErrorBoundary>
      {sidebarPosition !== 'top' && <ErrorBoundary fallback={null}><BottomNav /></ErrorBoundary>}
      {showDiagnostics && (
        <ErrorBoundary variant="overlay" onDismiss={() => setShowDiagnostics(false)}>
          <Suspense fallback={null}><DiagnosticsModal /></Suspense>
        </ErrorBoundary>
      )}
      {showUserAuth && (
        <ErrorBoundary variant="overlay" onDismiss={() => setShowUserAuth(false)}>
          <UserAuthModal onClose={() => setShowUserAuth(false)} />
        </ErrorBoundary>
      )}
      <ErrorBoundary variant="overlay"><ReportModal /></ErrorBoundary>
      <ErrorBoundary variant="overlay"><ConvertFormatModal /></ErrorBoundary>
      <ErrorBoundary variant="overlay"><BulkEditModal /></ErrorBoundary>
      <ErrorBoundary variant="overlay"><UrlImportModal /></ErrorBoundary>
      <ErrorBoundary fallback={null}><CookieNotice /></ErrorBoundary>
      <ErrorBoundary variant="overlay"><GlobalSongInfoHost /></ErrorBoundary>
      <ErrorBoundary fallback={null}><DownloadManager /></ErrorBoundary>
    </div>
  )
}
