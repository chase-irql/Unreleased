import { Suspense, lazy, useEffect, useState, CSSProperties } from 'react'
import { useStore, useStorePick } from './store/useStore'
import { useThemeEffects } from './lib/themeEffects'
import { apiFetch, JWApiSong } from './lib/juicewrldApi'

const Settings = lazy(() => import('./components/Settings'))
const EditorPage = lazy(() => import('./components/EditorPage'))
const MiniPlayer = lazy(() => import('./components/MiniPlayer'))
// Not lazy: every list view already imports the info modal statically, so
// it lives in the main chunk regardless — a dynamic import here would just
// trigger Vite's mixed-import warning without splitting anything.
import SongInfoModal from './components/SongInfoModal'
import ReportModal from './components/ReportModal'
import ConvertFormatModal from './components/ConvertFormatModal'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const el = (window as any).electron

function initialParam(key: string): string | null {
  return new URLSearchParams(window.location.search).get(key)
}

// Drag strip + window buttons for pop-outs that render a full view (Settings
// and song-info have modal chrome of their own that doubles as the handle).
// Mirrors App's WindowControls but through the sender-scoped *Self IPC —
// the plain variants would minimize/close the MAIN window.
function FloatTitleBar(): JSX.Element {
  const [maximized, setMaximized] = useState(false)
  const btn = 'flex items-center justify-center w-11 h-7 text-text-muted hover:text-text-primary transition-colors'
  return (
    <div className="shrink-0 flex h-7 border-b border-[var(--border)]">
      <div className="flex-1 select-none" style={{ WebkitAppRegion: 'drag' } as CSSProperties} />
      <div className="flex" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
        <button className={btn} onClick={() => el?.minimizeSelf()} title="Minimize">
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor"><rect width="10" height="1"/></svg>
        </button>
        <button className={btn} onClick={async () => setMaximized(!!(await el?.maximizeSelf()))} title={maximized ? 'Restore' : 'Maximize'}>
          {maximized
            ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><path d="M2.5 0.5H9.5V7.5"/><rect x="0.5" y="2.5" width="7" height="7"/></svg>
            : <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="9" height="9"/></svg>}
        </button>
        <button className={`${btn} hover:bg-red-600 hover:text-white`} onClick={() => el?.closeSelf()} title="Close">
          <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2"><line x1="0" y1="0" x2="10" y2="10"/><line x1="10" y1="0" x2="0" y2="10"/></svg>
        </button>
      </div>
    </div>
  )
}

function FloatSongInfo(): JSX.Element | null {
  const { account } = useStorePick('account')
  const [songId, setSongId] = useState<number | null>(() => {
    const raw = initialParam('songId')
    return raw ? Number(raw) : null
  })
  const [song, setSong] = useState<JWApiSong | null>(null)

  // "Info" clicked on another song while this window is open — swap content.
  useEffect(() => el?.onFloatParams?.((p: Record<string, string>) => {
    if (p?.songId) setSongId(Number(p.songId))
  }), [])

  useEffect(() => {
    if (!songId) return
    let stale = false
    apiFetch<JWApiSong>(`/songs/${songId}/`).then((s) => { if (!stale) setSong(s) }).catch(() => {})
    return () => { stale = true }
  }, [songId])

  const canEdit = !!account && (account.is_editor || account.is_administrator)
  if (!song) return null
  return (
    <SongInfoModal
      floating
      song={song}
      onClose={() => el?.closeSelf?.()}
      onEdit={canEdit ? (id) => useStore.getState().openSongEditor(id) : undefined}
    />
  )
}

function FloatEditor(): JSX.Element {
  // EditorPage picks its song up from pendingEditorSongId, exactly like an
  // in-app navigation would have set it. Seed it from the boot URL, and keep
  // following float-params so "Edit" on another song retargets this window.
  useEffect(() => {
    const raw = initialParam('songId')
    if (raw) useStore.setState({ pendingEditorSongId: Number(raw) })
    return el?.onFloatParams?.((p: Record<string, string>) => {
      if (p?.songId) useStore.setState({ pendingEditorSongId: Number(p.songId) })
    })
  }, [])

  return (
    <div className="flex-1 min-h-0 overflow-hidden flex">
      <EditorPage />
    </div>
  )
}

// Shell for floating pop-out windows: main.js createFloatWindow opens a second
// frameless BrowserWindow on the same bundle with ?float=<view> (+ params),
// and main.tsx mounts this instead of <App/> — a single view filling the whole
// window, with store state mirrored to the main window by lib/windowSync.
export default function FloatApp({ view }: { view: string }): JSX.Element {
  useThemeEffects()

  // The library track list is too big to mirror through the sync channel —
  // load it from disk so Settings → Library shows real track counts.
  useEffect(() => {
    if (view === 'settings') useStore.getState().loadLibrary()
  }, [view])

  return (
    <div className="h-dvh bg-surface overflow-hidden flex flex-col">
      {view === 'editor' && <FloatTitleBar />}
      <Suspense fallback={null}>
        {view === 'settings' ? <Settings floating />
          : view === 'song-info' ? <FloatSongInfo />
          : view === 'editor' ? <FloatEditor />
          : view === 'mini-player' ? <MiniPlayer />
          : null}
      </Suspense>
      {/* Report dialog opened from a pop-out (Settings feedback, or a song
          info report) — reportModal is per-window state, so the pop-out mounts
          its own instance rather than routing to the main window. */}
      <ReportModal />
      <ConvertFormatModal />
    </div>
  )
}
