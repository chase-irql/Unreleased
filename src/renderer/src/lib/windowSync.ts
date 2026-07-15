import { useStore, type AppStore } from '../store/useStore'
import type { ViewType } from '../types'

// State mirrored between the main window and pop-out windows (see FloatApp).
// Each window runs its own renderer process with its own store instance, so
// anything a pop-out can read or change has to be relayed over IPC (the main
// process fans 'window-sync' messages out to every other window). Only plain
// serializable keys belong here — per-window UI state (activeView,
// showSettings, downloads…) stays local to each window, and the library
// track list is deliberately absent: it's reloaded from disk instead
// (see the libraryLastScanned handling below).
const SYNC_KEYS = [
  'theme', 'accentColor', 'sidebarPosition', 'navOrder',
  'crossfadeEnabled', 'crossfadeDuration', 'pauseFadeEnabled', 'preferOgVersion',
  'hotkeyBindings', 'hotkeySeekSeconds', 'globalHotkeysEnabled',
  'playbackSpeed', 'lyricsOffset', 'audioOutput', 'sleepTimerEnd',
  'likedTrackIds', 'account', 'playlists',
  'libraryFolders', 'libraryAutoRefresh', 'libraryScanning', 'libraryLastScanned',
  'developerMode', 'updateStatus',
  // Playback mirror for the mini-player pop-out. The MAIN window owns the
  // audio elements and all queue logic — pop-outs treat these keys as
  // read-only display state and send playback *commands* back instead of
  // mutating them (see sendPlayerCommand below). `volume` is the one
  // exception: the main Player's [volume] effect applies remote changes to
  // the audio element, so pop-outs may call setVolume directly.
  'currentTrack', 'currentTrackFull', 'isPlaying', 'progress', 'currentTime',
  'queue', 'queueIndex', 'shuffle', 'repeat', 'volume',
  'radioMode', 'radioNext', 'queueLoadingMore',
  'radioFmActive', 'radioFmNowPlaying', 'radioFmMatchedSong', 'radioFmUpNext', 'radioFmQueuePreview',
] as const satisfies readonly (keyof AppStore)[]

type SyncKey = (typeof SYNC_KEYS)[number]
type SyncPatch = Partial<Pick<AppStore, SyncKey>>

type SyncMessage =
  | { type: 'patch'; payload: SyncPatch }
  | { type: 'snapshot'; payload: SyncPatch }
  | { type: 'request' }
  | { type: 'navigate'; view: ViewType }
  | { type: 'command'; cmd: string; arg?: unknown }

// Playback commands from pop-outs land here — the main window's Player
// registers its dispatch table (the same one the tray menu uses) so remote
// controls go through the exact same code paths as the on-screen buttons.
let playerCommandHandler: ((cmd: string, arg?: unknown) => void) | null = null

export function registerPlayerCommandHandler(handler: (cmd: string, arg?: unknown) => void): () => void {
  playerCommandHandler = handler
  return () => { if (playerCommandHandler === handler) playerCommandHandler = null }
}

// Ask the main window to perform a playback action (play-pause, next, seek…).
// Pop-outs never drive the queue/audio themselves — the main window executes
// the command and the resulting state syncs back through the patch channel.
export function sendPlayerCommand(cmd: string, arg?: unknown): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const el = (window as any).electron
  el?.windowSyncSend?.({ type: 'command', cmd, arg })
}

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
    } else if (msg.type === 'command') {
      if (!isFloat) playerCommandHandler?.(msg.cmd, msg.arg)
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
