import React, { useEffect, Suspense, lazy } from 'react'
import { useStore, useStorePick } from './store/useStore'
import { setToken, getToken } from './lib/userApi'
import { ViewType } from './types'

function getViewFromPath(pathname: string): ViewType {
  if (pathname === '/' || pathname === '/tracker') return 'api-tracker'
  if (pathname.startsWith('/files')) return 'api-files'
  if (pathname === '/categories') return 'api-categories'
  if (pathname === '/editor') return 'editor'
  if (pathname === '/admin') return 'admin'
  if (pathname === '/liked') return 'liked'
  if (pathname === '/playlists') return 'playlists'
  if (pathname === '/docs') return 'docs'
  if (pathname === '/wrld') return 'wrld'
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
import DiscordRpcSync from './components/DiscordRpcSync'
import UserAuthModal from './components/UserAuthModal'
import Player from './components/Player'
import NowPlaying from './components/NowPlaying'
import QueuePanel from './components/QueuePanel'
import DownloadManager from './components/DownloadManager'
import LibraryTab from './components/LibraryTab'
import ErrorBoundary from './components/ErrorBoundary'

// Rarely-visited views load on first navigation instead of inflating the
// startup bundle. Suspense fallback is null: these chunks are local (Electron)
// or small (web), so a spinner would just flash.
const ApiCategoryView = lazy(() => import('./components/ApiCategoryView'))
const EditorPage = lazy(() => import('./components/EditorPage'))
const AdminPage = lazy(() => import('./components/AdminPage'))
const SharedPlaylistView = lazy(() => import('./components/SharedPlaylistView'))
const EditorProfileView = lazy(() => import('./components/EditorProfileView'))
const NotFoundView = lazy(() => import('./components/NotFoundView'))
const DocsPage = lazy(() => import('./components/DocsPage'))
const WrldView = lazy(() => import('./components/WrldView'))
const AlbumsAdminView = lazy(() => import('./components/AlbumsAdminView'))
const LocalEditorPage = lazy(() => import('./components/LocalEditorPage'))
const Settings = lazy(() => import('./components/Settings'))
const DiagnosticsModal = lazy(() => import('./components/DiagnosticsModal'))

function hexToRgb(hex: string): [number, number, number] {
  const num = parseInt(hex.replace('#', ''), 16)
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff]
}

function lightenHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `#${Math.min(255, r + amount).toString(16).padStart(2, '0')}${Math.min(255, g + amount).toString(16).padStart(2, '0')}${Math.min(255, b + amount).toString(16).padStart(2, '0')}`
}

function WindowControls(): JSX.Element {
  const [maximized, setMaximized] = React.useState(false)
  const el = (window as any).electron

  React.useEffect(() => {
    el?.isMaximized().then((v: boolean) => setMaximized(v))
  }, [])

  const btn = "flex items-center justify-center w-11 h-7 text-text-muted hover:text-text-primary transition-colors"
  return (
    <div className="fixed top-0 right-0 z-[10000] flex" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
      <button className={btn} onClick={() => el?.minimizeWindow()} title="Minimize">
        <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor"><rect width="10" height="1"/></svg>
      </button>
      <button className={btn} onClick={async () => { await el?.maximizeWindow(); el?.isMaximized().then((v: boolean) => setMaximized(v)) }} title={maximized ? "Restore" : "Maximize"}>
        {maximized
          ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><path d="M2.5 0.5H9.5V7.5"/><rect x="0.5" y="2.5" width="7" height="7"/></svg>
          : <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="9" height="9"/></svg>}
      </button>
      <button className={`${btn} hover:bg-red-600 hover:text-white`} onClick={() => el?.closeWindow()} title="Close">
        <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2"><line x1="0" y1="0" x2="10" y2="10"/><line x1="10" y1="0" x2="0" y2="10"/></svg>
      </button>
    </div>
  )
}

export default function App(): JSX.Element {
  const { showNowPlaying, showQueue, showSettings, showDiagnostics, activeView, theme, accentColor, loadAccount, completeDiscordLogin, showUserAuth, setShowUserAuth, loadLibrary, wrldFullscreen, loadOfflineLibrary, syncOfflinePlaylists, libraryAutoRefresh, libraryFolders, scanLibrary, prefetchApiData } = useStorePick(
    'showNowPlaying', 'showQueue', 'showSettings', 'showDiagnostics', 'activeView', 'theme', 'accentColor', 'loadAccount', 'completeDiscordLogin', 'showUserAuth', 'setShowUserAuth', 'loadLibrary', 'wrldFullscreen', 'loadOfflineLibrary', 'syncOfflinePlaylists', 'libraryAutoRefresh', 'libraryFolders', 'scanLibrary', 'prefetchApiData')
  // Seed auth token from env in local dev only — import.meta.env.DEV is false in production
  // builds, so this never runs for real users even if the token is baked into the bundle.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const devToken = import.meta.env.VITE_AUTH_TOKEN as string | undefined
    if (devToken) { setToken(devToken); loadAccount() }
  }, [])

  // Sync view from URL on mount + handle back/forward
  useEffect(() => {
    // In Electron (file:// protocol) skip URL routing — always start on tracker
    if (window.location.protocol === 'file:') {
      useStore.setState({ activeView: 'api-tracker' })
      return
    }
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

  // Load the offline-downloaded playlist cache, then refresh it against the
  // live API in the background — keeps downloaded songs' metadata/audio in
  // sync without blocking anything on the network round-trip. Re-run on
  // window focus (catches "edited on the site, alt-tabbed back") and on an
  // interval as a fallback for long-lived sessions, since the app doesn't
  // otherwise learn about API-side edits while it's already running.
  useEffect(() => {
    if (!(window as any).electron) return
    loadOfflineLibrary().then(() => syncOfflinePlaylists())
    const onFocus = (): void => { syncOfflinePlaylists() }
    window.addEventListener('focus', onFocus)
    const interval = setInterval(() => syncOfflinePlaylists(), 15 * 60 * 1000)
    return () => { window.removeEventListener('focus', onFocus); clearInterval(interval) }
  }, [loadOfflineLibrary, syncOfflinePlaylists])

  // "Auto-refresh changed files" (Settings → Library) — opt-in background
  // rescan so tags edited in an external tool (Mp3tag, etc.) show up without
  // an explicit "Scan Now". scanLibrary skips re-parsing anything whose
  // size/mtime hasn't changed, so this stays cheap even on a large library.
  useEffect(() => {
    if (!(window as any).electron) return
    if (!libraryAutoRefresh || libraryFolders.length === 0) return
    loadLibrary().then(() => scanLibrary())
    const onFocus = (): void => { scanLibrary() }
    window.addEventListener('focus', onFocus)
    const interval = setInterval(() => scanLibrary(), 15 * 60 * 1000)
    return () => { window.removeEventListener('focus', onFocus); clearInterval(interval) }
  }, [libraryAutoRefresh, libraryFolders, loadLibrary, scanLibrary])

  // Warm the Tracker/Files offline cache on startup (public data — no auth
  // needed), so those views are ready before the user first opens them.
  useEffect(() => { prefetchApiData() }, [prefetchApiData])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    const [r, g, b] = hexToRgb(accentColor)
    const hover = lightenHex(accentColor, 20)
    const [hr, hg, hb] = hexToRgb(hover)
    document.documentElement.style.setProperty('--accent', accentColor)
    document.documentElement.style.setProperty('--accent-rgb', `${r} ${g} ${b}`)
    document.documentElement.style.setProperty('--accent-hover', hover)
    document.documentElement.style.setProperty('--accent-hover-rgb', `${hr} ${hg} ${hb}`)
  }, [accentColor])

  const isElectron = navigator.userAgent.includes("Electron")

  return (
    <div className="flex flex-col h-dvh bg-surface overflow-hidden">
      {isElectron && !wrldFullscreen && <WindowControls />}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden flex flex-col relative">
          {isElectron && (
            <div
              className="absolute top-0 left-0 right-0 h-7 z-20 select-none mr-[132px] pointer-events-none"
              style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
            />
          )}
          <div className="flex-1 overflow-hidden flex">
            <ErrorBoundary>
            <Suspense fallback={null}>
            {activeView === 'api-tracker' ? <ApiTrackerView />
              : activeView === 'api-files' ? <ApiFilesView />
              : activeView === 'api-categories' ? <ApiCategoryView />
              : activeView === 'editor' ? <EditorPage />
              : activeView === 'admin' ? <AdminPage />
              : activeView === 'liked' ? <LikedSongsView />
              : activeView === 'playlists' ? <PlaylistsView />
              : activeView === 'shared-playlist' ? <SharedPlaylistView />
              : activeView === 'editor-profile' ? <EditorProfileView />
              : activeView === 'docs' ? <DocsPage />
              : activeView === 'wrld' ? <WrldView />
              : activeView === 'library' ? <LibraryTab />
              : activeView === 'local-editor' ? <LocalEditorPage />
              : activeView === 'albums-admin' ? <AlbumsAdminView />
              : activeView === 'not-found' ? <NotFoundView />
              : <ApiTrackerView />}
            </Suspense>
          </ErrorBoundary>
            {showNowPlaying && activeView !== 'wrld' && <ErrorBoundary><NowPlaying /></ErrorBoundary>}
            {showQueue && activeView !== 'wrld' && <ErrorBoundary><QueuePanel /></ErrorBoundary>}
          </div>
        </main>
      </div>
      <Player />
      <RadioFmPlayer />
      <DiscordRpcSync />
      <BottomNav />
      {showSettings && <Suspense fallback={null}><Settings /></Suspense>}
      {showDiagnostics && <Suspense fallback={null}><DiagnosticsModal /></Suspense>}
      {showUserAuth && <UserAuthModal onClose={() => setShowUserAuth(false)} />}
      <DownloadManager />
    </div>
  )
}
