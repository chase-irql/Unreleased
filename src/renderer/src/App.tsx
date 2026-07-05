import React, { useEffect } from 'react'
import { useStore } from './store/useStore'
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
import ApiCategoryView from './components/ApiCategoryView'
import EditorPage from './components/EditorPage'
import AdminPage from './components/AdminPage'
import LikedSongsView from './components/LikedSongsView'
import PlaylistsView from './components/PlaylistsView'
import SharedPlaylistView from './components/SharedPlaylistView'
import EditorProfileView from './components/EditorProfileView'
import NotFoundView from './components/NotFoundView'
import DocsPage from './components/DocsPage'
import RadioFmPlayer from './components/RadioFmPlayer'
import DiscordRpcSync from './components/DiscordRpcSync'
import WrldView from './components/WrldView'
import AlbumsAdminView from './components/AlbumsAdminView'
import UserAuthModal from './components/UserAuthModal'
import Player from './components/Player'
import NowPlaying from './components/NowPlaying'
import QueuePanel from './components/QueuePanel'
import Settings from './components/Settings'
import DownloadManager from './components/DownloadManager'
import LibraryTab from './components/LibraryTab'
import ErrorBoundary from './components/ErrorBoundary'

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
          ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="2" y="0" width="8" height="8"/><rect x="0" y="2" width="8" height="8" fill="var(--surface)"/><rect x="0" y="2" width="8" height="8"/></svg>
          : <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="9" height="9"/></svg>}
      </button>
      <button className={`${btn} hover:bg-red-600 hover:text-white`} onClick={() => el?.closeWindow()} title="Close">
        <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2"><line x1="0" y1="0" x2="10" y2="10"/><line x1="10" y1="0" x2="0" y2="10"/></svg>
      </button>
    </div>
  )
}

export default function App(): JSX.Element {
  const { showNowPlaying, showQueue, showSettings, activeView, theme, accentColor, loadAccount, completeDiscordLogin, showUserAuth, setShowUserAuth, loadLibrary, wrldFullscreen } = useStore()
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
              className="absolute top-0 left-0 right-0 h-7 z-20 select-none mr-[132px]"
              style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
            />
          )}
          <div className="flex-1 overflow-hidden flex">
            <ErrorBoundary>
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
: activeView === 'albums-admin' ? <AlbumsAdminView />
              : activeView === 'not-found' ? <NotFoundView />
              : <ApiTrackerView />}
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
      {showSettings && <Settings />}
      {showUserAuth && <UserAuthModal onClose={() => setShowUserAuth(false)} />}
      <DownloadManager />
    </div>
  )
}
