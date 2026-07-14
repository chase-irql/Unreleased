import { useStore, type AppStore } from '../store/useStore'
import type { ViewType } from '../types'

// State mirrored between the main window and pop-out windows (see FloatApp).
// Each window runs its own renderer process with its own store instance, so
// anything a pop-out can read or change has to be relayed over IPC (the main
// process fans 'window-sync' messages out to every other window). Only plain
// serializable keys belong here — per-window UI state (activeView,
// showSettings, the queue, downloads…) stays local to each window, and the
// library track list is deliberately absent: it's reloaded from disk instead
// (see the libraryLastScanned handling below).
const SYNC_KEYS = [
  'theme', 'accentColor', 'sidebarPosition',
  'crossfadeEnabled', 'crossfadeDuration', 'pauseFadeEnabled', 'preferOgVersion',
  'playbackSpeed', 'lyricsOffset', 'audioOutput', 'sleepTimerEnd',
  'likedTrackIds', 'account', 'playlists',
  'libraryFolders', 'libraryAutoRefresh', 'libraryScanning', 'libraryLastScanned',
  'developerMode', 'updateStatus',
] as const satisfies readonly (keyof AppStore)[]

type SyncKey = (typeof SYNC_KEYS)[number]
type SyncPatch = Partial<Pick<AppStore, SyncKey>>

type SyncMessage =
  | { type: 'patch'; payload: SyncPatch }
  | { type: 'snapshot'; payload: SyncPatch }
  | { type: 'request' }
  | { type: 'navigate'; view: ViewType }

// True while applying a remote patch, so the store subscription below doesn't
// echo it straight back and ping-pong between windows forever.
let applyingRemote = false

function snapshot(): SyncPatch {
  const state = useStore.getState()
  const out: Record<string, unknown> = {}
  for (const key of SYNC_KEYS) out[key] = state[key]
  return out as SyncPatch
}

export function initWindowSync(isFloat: boolean): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const el = (window as any).electron
  if (!el?.onWindowSync) return

  useStore.subscribe((state, prev) => {
    if (applyingRemote) return
    const patch: Record<string, unknown> = {}
    for (const key of SYNC_KEYS) {
      if (state[key] !== prev[key]) patch[key] = state[key]
    }
    if (Object.keys(patch).length > 0) el.windowSyncSend({ type: 'patch', payload: patch })
  })

  el.onWindowSync((msg: SyncMessage) => {
    if (msg.type === 'patch' || msg.type === 'snapshot') {
      applyingRemote = true
      try { useStore.setState(msg.payload) } finally { applyingRemote = false }
      // A scan finishing in the other window just saved library-data.json —
      // reload it so this window's track list isn't stale (the tracks
      // themselves are far too big to ship through the sync channel).
      if ('libraryLastScanned' in msg.payload) useStore.getState().loadLibrary()
    } else if (msg.type === 'request') {
      // Pop-outs boot with localStorage-persisted values only; the main
      // window answers with the live session state (account, update status…).
      if (!isFloat) el.windowSyncSend({ type: 'snapshot', payload: snapshot() })
    } else if (msg.type === 'navigate') {
      if (!isFloat) useStore.getState().setActiveView(msg.view)
    }
  })

  if (isFloat) el.windowSyncSend({ type: 'request' })
}

// Ask the main window to switch views (e.g. the pop-out Settings' "API Docs"
// button) — a pop-out renders a single view and can't navigate itself.
export function navigateMainWindow(view: ViewType): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const el = (window as any).electron
  el?.windowSyncSend?.({ type: 'navigate', view })
  el?.focusMainWindow?.()
}
