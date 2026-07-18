const { app, BrowserWindow, shell, dialog, Menu, Tray, ipcMain, nativeImage, protocol, net, globalShortcut, screen } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const fs = require('fs')
const https = require('https')
const { pathToFileURL } = require('url')
const { Readable } = require('stream')
const discordRpc = require('./discordRpc')

// Response() only accepts web ReadableStreams, not Node streams
const webStreamFromNode = (stream) => Readable.toWeb(stream)

const isDev = !app.isPackaged || process.env.NODE_ENV === 'development'

app.setAppUserModelId('Unreleased')
Menu.setApplicationMenu(null)

// Only one instance may run at a time — launching a second copy (e.g. double-
// clicking the exe again, or a shortcut) just focuses the existing window
// instead of spinning up a competing process against the same userData files.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

// Dev mode loads the renderer from http://localhost:3018 (see electron:dev
// script), and Chromium blocks <audio>/<img>/<video> loading a `file://`
// resource from a non-file-origin page ("Not allowed to load local resource").
// A custom scheme sidesteps that restriction in both dev and the packaged
// (file://) build, and — with `stream: true` below — still supports Range
// requests so audio/video seeking works.
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true } },
])

// ── Settings persistence ──────────────────────────────────────────────────────
const settingsPath = path.join(app.getPath('userData'), 'app-settings.json')
let appSettings = {
  downloadPath: app.getPath('downloads'),
  autoDownload: true,
  minimizeToTray: false,
  // 'taskbar' | 'tray' | 'notification' — where minimizing sends the window.
  // Both 'tray' and 'notification' hide the window to the tray icon;
  // 'notification' additionally tries to keep that icon pinned/always-visible
  // in the notification area instead of letting Windows auto-collapse it into
  // the overflow chevron (see pinTrayIcon()).
  minimizeTo: 'taskbar',
  startupView: 'api-tracker',
  discordRpcEnabled: true,
  offlineLibraryPath: path.join(app.getPath('userData'), 'offline-audio'),
  // When on, opening the mini player hides every other window (main + other
  // pop-outs); they're restored when the mini player closes.
  miniPlayerHidesWindows: false,
  // Prompt "a song is still playing — quit?" when a close would fully exit the
  // app (not a minimize-to-tray) while audio is playing. Guards only the direct
  // window close (X button / Alt+F4); deliberate quits skip it (see
  // skipCloseConfirm + the before-quit handler).
  confirmCloseWhilePlaying: true,
}
try {
  const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
  appSettings = { ...appSettings, ...saved }
} catch {}

function saveSettings() {
  try { fs.writeFileSync(settingsPath, JSON.stringify(appSettings, null, 2)) } catch {}
}

// ── Logging ───────────────────────────────────────────────────────────────────
const logFile = path.join(app.getPath('userData'), 'updater.log')
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`
  fs.appendFileSync(logFile, line)
  if (isDev) console.log(...args)
}

// ── Run / crash logging ─────────────────────────────────────────────────────
// A rolling log of the current run. At startup the previous run's log is kept
// as `previous-run.log` so that after a hang/crash (or a plain restart) we can
// still read what the app was doing right before it died — even when the app
// never showed an error. Renderer-side breadcrumbs are forwarded here over IPC
// (see 'run-log' handler + preload logRun), so a browser-side freeze like the
// tracker's "sort by name" full-library load leaves a trail too.
const runLogPath = path.join(app.getPath('userData'), 'current-run.log')
const prevRunLogPath = path.join(app.getPath('userData'), 'previous-run.log')
try {
  if (fs.existsSync(runLogPath)) fs.renameSync(runLogPath, prevRunLogPath)
} catch {}

function runLog(scope, ...args) {
  const msg = args
    .map((a) => (typeof a === 'string' ? a : (() => { try { return JSON.stringify(a) } catch { return String(a) } })()))
    .join(' ')
  const line = `[${new Date().toISOString()}] [${scope}] ${msg}\n`
  try { fs.appendFileSync(runLogPath, line) } catch {}
  if (isDev) console.log(`[${scope}]`, ...args)
}

function memSnapshot() {
  try {
    const m = process.memoryUsage()
    const mb = (n) => Math.round(n / 1024 / 1024)
    return `rss=${mb(m.rss)}MB heapUsed=${mb(m.heapUsed)}MB`
  } catch { return '' }
}

runLog('main', `=== app start === v${app.getVersion?.() || '?'} pid=${process.pid} ${memSnapshot()}`)

// Main-process crashes: log them (and to updater.log) before the app dies.
process.on('uncaughtException', (err) => {
  runLog('main', 'UNCAUGHT EXCEPTION:', err?.stack || String(err))
  log('Uncaught exception:', err?.stack || String(err))
})
process.on('unhandledRejection', (reason) => {
  runLog('main', 'UNHANDLED REJECTION:', reason?.stack || String(reason))
})

// ── Shared file download helper (used by force-update + offline library) ──────
// Writes to a `.part` temp file and renames into place only after the byte
// count checks out against Content-Length. Writing straight to `dest` meant a
// dropped connection could leave a truncated file that later passed the
// offline library's "already downloaded" existence check — or, on a
// re-download of a changed track, destroy the old good copy with partial data.
function downloadFile(url, dest, onProgress) {
  const tmp = dest + '.part'
  return new Promise((resolve, reject) => {
    function doGet(u) {
      const opts = new URL(u)
      https.get({ hostname: opts.hostname, path: opts.pathname + opts.search, headers: { 'User-Agent': 'Unreleased-App' } }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) return doGet(res.headers.location)
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`))
        const total = parseInt(res.headers['content-length'] || '0', 10)
        let received = 0
        const out = fs.createWriteStream(tmp)
        const fail = (err) => {
          out.destroy()
          try { fs.unlinkSync(tmp) } catch {}
          reject(err)
        }
        res.on('data', chunk => {
          received += chunk.length
          if (onProgress) onProgress(total > 0 ? Math.round(received / total * 100) : 0, received, total)
        })
        res.pipe(out)
        out.on('finish', () => {
          if (total > 0 && received !== total) return fail(new Error(`Truncated download: got ${received} of ${total} bytes`))
          try { fs.renameSync(tmp, dest) } catch (e) { return fail(e) }
          resolve()
        })
        out.on('error', fail)
        res.on('error', fail)
      }).on('error', reject)
    }
    doGet(url)
  })
}

// ── Auto-updater setup ────────────────────────────────────────────────────────
autoUpdater.logger = { info: log, warn: log, error: log, debug: () => {} }
autoUpdater.autoDownload = appSettings.autoDownload
autoUpdater.autoInstallOnAppQuit = true
// Beta channel — gated server-side by juicewrldapi.com, not by anything
// baked into this app (see build/fetch-releases.ps1 for the full endpoint
// contract). The marker file holds the *validated code itself*, used as a
// bearer credential on every update check, not just a yes/no flag. It's
// dropped by the Windows installer's options page (build/installer.nsh) on
// a valid code, or by the beta-join handler below when joined from Settings.
const BETA_API_BASE = 'https://juicewrldapi.com/beta'
const betaMarkerPath = path.join(app.getPath('userData'), 'beta-access')

function readBetaCode() {
  try { return fs.readFileSync(betaMarkerPath, 'utf-8').trim() || null } catch { return null }
}

// Switches the updater between the normal stable (GitHub) feed and the
// gated beta feed. electron-updater allows re-pointing the feed at runtime,
// so join/leave take effect immediately, no restart needed.
function applyUpdateFeed(code) {
  if (code) {
    autoUpdater.setFeedURL({ provider: 'generic', url: `${BETA_API_BASE}/update-feed`, channel: 'latest' })
    autoUpdater.requestHeaders = { 'X-Beta-Code': code }
    autoUpdater.allowPrerelease = true
  } else {
    autoUpdater.setFeedURL({ provider: 'github', owner: 'leanwrldd', repo: 'unreleased' })
    autoUpdater.requestHeaders = null
    autoUpdater.allowPrerelease = false
  }
}

const initialBetaCode = readBetaCode()
applyUpdateFeed(initialBetaCode)
if (initialBetaCode) log('Beta access marker present — gated beta update feed enabled')

const iconPath = process.platform === 'linux'
  ? path.join(__dirname, '..', 'resources', 'icon-512.png')
  : path.join(__dirname, 'icon.ico')
const preloadPath = path.join(__dirname, 'preload.js')

let mainWindow = null
let tray = null
let isQuitting = false
// Deliberate/programmatic quits (tray "Quit", restart, update install, OS
// shutdown) all route through app.quit() → 'before-quit', which sets this
// before any window 'close' fires. A direct window close (X button, Alt+F4)
// does not, so that's the only path the "song still playing" prompt guards.
let skipCloseConfirm = false

// ── Floating pop-out windows ──────────────────────────────────────────────────
// Each entry is a second frameless BrowserWindow booting the same renderer
// bundle with ?float=<view> (+ any params, e.g. songId) — the renderer sees
// that param and mounts just that one view (see src/renderer/src/FloatApp.tsx)
// instead of the full app. One window per view: reopening focuses the existing
// one and hands it the new params over 'float-params' (so "Info" on a second
// song swaps the open info window's content rather than stacking windows).
// Store state is mirrored between windows by the 'window-sync' relay below.
const FLOAT_SIZES = {
  settings:      { width: 860,  height: 640, minWidth: 520, minHeight: 420 },
  'song-info':   { width: 540,  height: 760, minWidth: 420, minHeight: 480 },
  editor:        { width: 1000, height: 760, minWidth: 700, minHeight: 520 },
  // Compact bar height — must match MiniPlayer.tsx's h-[192px]. The window
  // stays height-locked at this until the lyrics/queue panel expands it
  // (see 'mini-player-set-expanded' below).
  'mini-player': { width: 480,  height: 192, minWidth: 420, minHeight: 192 },
}
// Extra per-view BrowserWindow options on top of FLOAT_SIZES. The mini
// player floats above other apps by default (its pin button toggles this).
const FLOAT_OPTIONS = {
  'mini-player': { alwaysOnTop: true, maximizable: false, fullscreenable: false },
}
const floatWindows = new Map()

// Renderer-supplied params ride the URL / float-params events — keep them to
// plain string/number/boolean values.
function sanitizeFloatParams(params) {
  const out = {}
  if (params && typeof params === 'object') {
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = String(v)
    }
  }
  return out
}

// A new BrowserWindow with no x/y lands centered on the PRIMARY display, so a
// pop-out opened while the app sits on a second monitor would jump to the main
// screen. Center it on whichever display currently holds the app instead —
// preferring the focused window (the pop-out could be opened from another
// pop-out), falling back to the main window.
function centerOnActiveDisplay(view) {
  const ref = BrowserWindow.getFocusedWindow() || mainWindow
  if (!ref || ref.isDestroyed()) return {}
  const { width, height } = FLOAT_SIZES[view]
  const { workArea } = screen.getDisplayMatching(ref.getBounds())
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
  }
}

function createFloatWindow(view, params) {
  const query = { float: view, ...sanitizeFloatParams(params) }
  const existing = floatWindows.get(view)
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore()
    existing.show()
    existing.focus()
    existing.webContents.send('float-params', query)
    if (view === 'mini-player' && appSettings.miniPlayerHidesWindows) hideWindowsForMiniPlayer()
    return
  }
  const win = new BrowserWindow({
    ...FLOAT_SIZES[view],
    ...centerOnActiveDisplay(view),
    ...(FLOAT_OPTIONS[view] || {}),
    backgroundColor: '#0a0a0a', icon: iconPath, frame: false,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true, webSecurity: true, preload: preloadPath,
    },
    show: false,
  })
  floatWindows.set(view, win)
  win.once('ready-to-show', () => {
    win.show()
    // Hide the other windows only once the mini player is actually on screen,
    // so there's never a moment with no visible window.
    if (view === 'mini-player' && appSettings.miniPlayerHidesWindows) hideWindowsForMiniPlayer()
  })
  win.on('closed', () => {
    if (floatWindows.get(view) === win) floatWindows.delete(view)
    // Always restore on close (even if the setting was turned off meanwhile) so
    // hidden windows can never be stranded.
    if (view === 'mini-player') restoreWindowsAfterMiniPlayer()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  if (isDev) {
    win.loadURL(`http://localhost:3018/?${new URLSearchParams(query)}`)
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'), { query })
  }
}

function closeAllFloatWindows() {
  for (const win of floatWindows.values()) {
    if (!win.isDestroyed()) win.close()
  }
  floatWindows.clear()
}

// ── Mini-player "solo" mode (setting: miniPlayerHidesWindows) ─────────────────
// When enabled, opening the mini player hides every other currently-visible
// window (the main window + any other pop-outs), leaving just the compact bar;
// closing the mini player brings them back. Only windows that were actually
// visible are remembered, so a window the user had already hidden (e.g. to the
// tray) isn't force-revealed on restore.
let miniPlayerHiddenWindows = []

function hideWindowsForMiniPlayer() {
  const mini = floatWindows.get('mini-player')
  miniPlayerHiddenWindows = []
  for (const win of BrowserWindow.getAllWindows()) {
    if (win === mini || win.isDestroyed() || !win.isVisible()) continue
    miniPlayerHiddenWindows.push(win)
    win.hide()
  }
}

function restoreWindowsAfterMiniPlayer() {
  for (const win of miniPlayerHiddenWindows) {
    if (win && !win.isDestroyed()) win.show()
  }
  miniPlayerHiddenWindows = []
}

// Send to every window (main + floats). Used for events any window might be
// showing UI for — e.g. update-status feeds the Settings header, which can
// live in a pop-out.
function broadcastToWindows(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

// ── Tray ──────────────────────────────────────────────────────────────────────
// Playback state mirrored from the renderer (via 'tray-playback-state') so the
// tray menu can show now-playing info and offer media controls. The renderer
// owns the actual audio element; tray buttons just send commands back to it.
let trayPlayback = { hasTrack: false, isPlaying: false, title: '', artist: '', liked: false }

function sendTrayCommand(cmd) {
  mainWindow?.webContents.send('tray-command', cmd)
}

function buildTrayMenu() {
  // `hasTrack` gates the controls (false during FM radio, matching the in-app
  // buttons), but the now-playing label follows `title` so FM still shows
  // what's on air.
  const { hasTrack, isPlaying, title, artist, liked } = trayPlayback
  const nowPlaying = title
    ? `${title}${artist ? ` — ${artist}` : ''}`
    : 'Nothing playing'
  return Menu.buildFromTemplate([
    { label: nowPlaying.length > 60 ? nowPlaying.slice(0, 57) + '…' : nowPlaying, enabled: false },
    { type: 'separator' },
    { label: isPlaying ? 'Pause' : 'Play', enabled: hasTrack, click: () => sendTrayCommand('play-pause') },
    { label: 'Next track', enabled: hasTrack, click: () => sendTrayCommand('next') },
    { label: 'Previous track', enabled: hasTrack, click: () => sendTrayCommand('previous') },
    { label: liked ? 'Unlike song' : 'Like song', enabled: hasTrack, click: () => sendTrayCommand('toggle-like') },
    { type: 'separator' },
    { label: 'Open Unreleased', click: () => showMainWindow() },
    { label: 'Open mini player', click: () => createFloatWindow('mini-player') },
    { label: 'Quit', click: () => { isQuitting = true; app.quit() } },
  ])
}

function showMainWindow() {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function hideWindowToTray() {
  mainWindow?.hide()
}

// Windows only, best-effort: there's no public Electron/Win32 API to mark a
// tray icon "always show" — that's a per-icon preference Explorer keeps for
// itself under this registry key. Flipping IsPromoted here is what Explorer's
// own "always show" toggle does under the hood, but Explorer only reads it
// when an icon is (re-)added via Shell_NotifyIcon — so after writing the
// flag, applyTrayPin() below destroys and recreates just OUR tray icon
// (recreateTrayIcon) to force that re-add. That's enough; it does NOT require
// restarting Explorer itself.
//
// All reg.exe calls here use the async execFile, not execFileSync — a sync
// child-process call blocks Electron's single-threaded main process, which
// freezes every window and all IPC in the app for as long as reg.exe runs.
const { execFile } = require('child_process')
function execFileAsync(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, opts, (err, stdout) => (err ? reject(err) : resolve(stdout)))
  })
}

async function readNotifyIconEntries() {
  const rootKey = 'HKCU\\Control Panel\\NotifyIconSettings'
  let dump
  try {
    dump = await execFileAsync('reg', ['query', rootKey, '/s'], { encoding: 'utf-8', windowsHide: true })
  } catch {
    return []
  }
  const exePath = process.execPath.toLowerCase()
  const entries = []
  let currentKey = null
  let currentExe = null
  let currentPromoted = null
  const flush = () => {
    if (currentKey && currentExe === exePath) entries.push({ key: currentKey, isPromoted: currentPromoted })
  }
  for (const rawLine of dump.split(/\r?\n/)) {
    if (rawLine.startsWith('HKEY_CURRENT_USER')) {
      flush()
      currentKey = rawLine.trim()
      currentExe = null
      currentPromoted = null
      continue
    }
    const exeMatch = /^\s+ExecutablePath\s+REG_SZ\s+(.+)$/.exec(rawLine)
    if (exeMatch) currentExe = exeMatch[1].trim().toLowerCase()
    const promotedMatch = /^\s+IsPromoted\s+REG_DWORD\s+0x([0-9a-f]+)$/i.exec(rawLine)
    if (promotedMatch) currentPromoted = parseInt(promotedMatch[1], 16)
  }
  flush()
  return entries
}

// Returns { found, applied }: `found` is false if Windows hasn't created a
// NotifyIconSettings entry for this exe yet (nothing to pin — happens if the
// tray icon hasn't appeared long enough for Explorer to register it);
// `applied` is true only if an entry existed and needed (and got) flipping.
async function pinTrayIcon() {
  if (process.platform !== 'win32') return { found: false, applied: false }
  try {
    const entries = await readNotifyIconEntries()
    const needsUpdate = entries.filter((e) => e.isPromoted !== 1)
    for (const e of needsUpdate) {
      await execFileAsync('reg', ['add', e.key, '/v', 'IsPromoted', '/t', 'REG_DWORD', '/d', '1', '/f'], { windowsHide: true })
    }
    runLog('main', `pinTrayIcon: ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} found, ${needsUpdate.length} updated`)
    return { found: entries.length > 0, applied: needsUpdate.length > 0 }
  } catch (e) {
    runLog('main', 'pinTrayIcon failed:', e.message)
    return { found: false, applied: false }
  }
}

// Destroys and recreates just our own tray icon — a fresh Shell_NotifyIcon
// add — so Explorer re-checks NotifyIconSettings for it. Only our one icon
// blinks off and back on; nothing else on the taskbar is touched.
function recreateTrayIcon() {
  if (!tray) return
  try { tray.destroy() } catch {}
  tray = null
  createTray()
}

// Writes the pin flag, then — only if it actually changed something —
// recreates the tray icon so it shows pinned immediately instead of waiting
// for Explorer's next restart/sign-in.
async function applyTrayPin() {
  const result = await pinTrayIcon()
  if (result.applied) recreateTrayIcon()
  return result
}

function updateTray() {
  if (!tray) return
  const { isPlaying, title, artist } = trayPlayback
  tray.setToolTip(title
    ? `Unreleased — ${isPlaying ? 'Playing' : 'Paused'}: ${title}${artist ? ` — ${artist}` : ''}`
    : 'Unreleased')
  tray.setContextMenu(buildTrayMenu())
}

function createTray() {
  try {
    tray = new Tray(iconPath)
    updateTray()
    tray.on('click', () => showMainWindow())
    // Windows only, but harmless elsewhere: double-click also restores.
    tray.on('double-click', () => showMainWindow())
  } catch (e) {
    log('Tray creation failed:', e.message)
  }
}

ipcMain.on('tray-playback-state', (_, state) => {
  if (!state || typeof state !== 'object') return
  trayPlayback = {
    hasTrack: !!state.hasTrack,
    isPlaying: !!state.isPlaying,
    title: typeof state.title === 'string' ? state.title : '',
    artist: typeof state.artist === 'string' ? state.artist : '',
    liked: !!state.liked,
  }
  updateTray()
})

// ── Window creation ───────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 960, minHeight: 600,
    backgroundColor: '#0a0a0a', icon: iconPath, frame: false,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true, webSecurity: true, preload: preloadPath,
    },
    show: false,
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  // Renderer crash / freeze diagnostics. `render-process-gone` fires when the
  // renderer dies (crash, OOM-kill) even though the main process — and thus the
  // app window frame — may survive; `unresponsive` fires when the renderer is
  // frozen (e.g. a synchronous blowup like sorting/rendering a huge list), which
  // is the classic "nearly crashed my PC" hang. Both land in the run log.
  mainWindow.webContents.on('render-process-gone', (_, details) => {
    runLog('renderer', `PROCESS GONE reason=${details.reason} exitCode=${details.exitCode}`)
  })
  mainWindow.webContents.on('unresponsive', () => {
    runLog('renderer', `UNRESPONSIVE (renderer frozen) ${memSnapshot()}`)
  })
  mainWindow.webContents.on('responsive', () => {
    runLog('renderer', 'responsive again')
  })

  mainWindow.on('close', (e) => {
    // Minimize-to-tray close: hide instead of quitting. The app (and playback)
    // keeps running, so there's nothing to confirm.
    if (!isQuitting && appSettings.minimizeToTray && tray) {
      e.preventDefault()
      mainWindow.hide()
      return
    }
    // Otherwise the window is really closing and the app will exit — which stops
    // playback. If a song is playing, confirm first. macOS keeps running after a
    // window close (window-all-closed doesn't quit there), so nothing is
    // interrupted and there's no prompt; deliberate quits skip it too.
    if (
      !skipCloseConfirm &&
      process.platform !== 'darwin' &&
      appSettings.confirmCloseWhilePlaying &&
      trayPlayback.isPlaying
    ) {
      e.preventDefault()
      dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['Quit', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
        title: 'Quit Unreleased?',
        message: 'A song is still playing.',
        detail: 'Quit anyway? Playback will stop.',
        checkboxLabel: "Don't ask me again",
        checkboxChecked: false,
      }).then(({ response, checkboxChecked }) => {
        if (checkboxChecked) {
          appSettings.confirmCloseWhilePlaying = false
          saveSettings()
        }
        if (response === 0) {
          // Confirmed — re-issue the close, this time past the guard.
          skipCloseConfirm = true
          mainWindow?.close()
        } else {
          // Cancelled — drop back to the normal state so a later close still
          // honors the minimize-to-tray setting instead of force-quitting.
          isQuitting = false
        }
      })
    }
  })

  // The titlebar button goes through the 'minimize-window' IPC handler, but
  // the window can also be minimized natively (Win+Down, clicking the taskbar
  // preview, shake gestures) — catch those too so "minimize to tray" holds no
  // matter how the minimize happened. preventDefault stops the native
  // minimize where supported; where it doesn't, hiding a minimized window
  // still works, and showMainWindow() restores from either state.
  mainWindow.on('minimize', (e) => {
    if ((appSettings.minimizeTo === 'tray' || appSettings.minimizeTo === 'notification') && tray) {
      e.preventDefault()
      hideWindowToTray()
    }
  })

  // Pop-outs can't outlive the main window — leaving one open would keep the
  // app running headless (window-all-closed never fires) with handlers still
  // pointed at a destroyed mainWindow.
  mainWindow.on('closed', () => {
    mainWindow = null
    closeAllFloatWindows()
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:3018')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Frameless windows don't get the browser's native F11-toggles-fullscreen
  // behavior for free — wire it up so it behaves like users expect.
  mainWindow.webContents.on('before-input-event', (_, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen())
    }
  })

  // Let the renderer react when fullscreen is entered/exited by any means
  // (F11 above, OS window-manager gestures, etc.) so UI like the WRLD tab's
  // fullscreen toggle button can stay in sync instead of just tracking its
  // own click state.
  mainWindow.on('enter-full-screen', () => mainWindow.webContents.send('fullscreen-changed', true))
  mainWindow.on('leave-full-screen', () => mainWindow.webContents.send('fullscreen-changed', false))

  // Track file downloads via session
  mainWindow.webContents.session.on('will-download', (event, item) => {
    const filename = item.getFilename()
    const savePath = path.join(appSettings.downloadPath, filename)
    item.setSavePath(savePath)

    // The window can be destroyed while a download is still running (quit
    // during a transfer) — sending on destroyed webContents throws in main.
    const send = (channel, payload) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
    }

    send('download-started', {
      filename,
      savePath,
      total: item.getTotalBytes(),
    })

    item.on('updated', (_, state) => {
      if (state === 'progressing') {
        const total = item.getTotalBytes()
        send('download-progress', {
          filename,
          received: item.getReceivedBytes(),
          total,
          percent: total > 0 ? Math.round((item.getReceivedBytes() / total) * 100) : 0,
        })
      }
    })

    item.once('done', (_, state) => {
      send('download-done', {
        filename,
        state,
        savePath: item.getSavePath(),
      })
    })
  })
}

// ── IPC: window controls ──────────────────────────────────────────────────────

ipcMain.handle('force-update', async () => {
  const https = require('https')
  log('Force update requested')

  // Linux: hand off to electron-updater. Its AppImageUpdater replaces the
  // installed AppImage in place on quitAndInstall — the manual flow below
  // would just run the freshly downloaded AppImage once from temp and leave
  // the installed copy outdated (unlike Windows, where the downloaded .exe
  // is an installer). Status updates and the restart dialog come from the
  // shared autoUpdater event handlers at the bottom of this file.
  if (process.platform === 'linux') {
    try {
      const result = await autoUpdater.checkForUpdates()
      if (result?.downloadPromise) await result.downloadPromise
      else if (result?.updateInfo && result.updateInfo.version !== app.getVersion()) await autoUpdater.downloadUpdate()
      return
    } catch (err) {
      log('Force update error:', err.message)
      broadcastToWindows('update-status', { type: 'error', message: err.message })
      throw err
    }
  }

  function fetchJson(url) {
    return new Promise((resolve, reject) => {
      const opts = new URL(url)
      https.get({ hostname: opts.hostname, path: opts.pathname + opts.search, headers: { 'User-Agent': 'Unreleased-App', 'Accept': 'application/vnd.github+json' } }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) return fetchJson(res.headers.location).then(resolve).catch(reject)
        // A 403 (rate limit) still returns parseable JSON — without this check
        // it flowed through and died later on `release.assets` being undefined,
        // surfacing a cryptic TypeError instead of the real cause.
        if (res.statusCode !== 200) { res.resume(); return reject(new Error(`GitHub API HTTP ${res.statusCode}`)) }
        let data = ''
        res.on('data', d => data += d)
        res.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } })
      }).on('error', reject)
    })
  }

  try {
    broadcastToWindows('update-status', { type: 'checking' })
    const release = await fetchJson('https://api.github.com/repos/leanwrldd/unreleased/releases/latest')
    const assetSuffix = process.platform === 'win32' ? '.exe' : process.platform === 'darwin' ? '.dmg' : '.AppImage'
    const asset = release.assets.find(a => a.name.endsWith(assetSuffix))
    if (!asset) throw new Error('No installer found in latest release')

    const tmpPath = path.join(app.getPath('temp'), asset.name)
    log('Force-downloading installer:', asset.name, 'to', tmpPath)
    broadcastToWindows('update-status', { type: 'downloading', percent: 0, version: release.tag_name.replace(/^v/, '') })

    await downloadFile(asset.browser_download_url, tmpPath, (percent) => {
      broadcastToWindows('update-status', { type: 'downloading', percent, version: release.tag_name.replace(/^v/, '') })
    })

    log('Force update installer ready:', tmpPath)
    broadcastToWindows('update-status', { type: 'downloaded', version: release.tag_name.replace(/^v/, '') })

    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Restart & Install', 'Later'],
      defaultId: 0,
      title: 'Update ready',
      message: `Version ${release.tag_name} is ready to install.`,
      detail: 'The app will restart and reinstall.',
    })
    if (response === 0) {
      if (process.platform === 'linux') fs.chmodSync(tmpPath, 0o755)
      shell.openPath(tmpPath)
      app.quit()
    }
  } catch (err) {
    log('Force update error:', err.message)
    broadcastToWindows('update-status', { type: 'error', message: err.message })
    throw err
  }
})

ipcMain.handle('check-for-updates', () => {
  log('Manual update check triggered')
  return autoUpdater.checkForUpdatesAndNotify()
})
ipcMain.handle('minimize-window', () => {
  if ((appSettings.minimizeTo === 'tray' || appSettings.minimizeTo === 'notification') && tray) {
    hideWindowToTray()
  } else {
    mainWindow?.minimize()
  }
})
ipcMain.handle('maximize-window', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.handle('close-window', () => {
  if (!appSettings.minimizeToTray || !tray) isQuitting = true
  mainWindow?.close()
})
// Full app restart (backs the "restart app" shortcut). relaunch() queues a
// fresh instance to spawn once this one exits; isQuitting bypasses the
// minimize-to-tray-on-close guard so exit() actually terminates.
ipcMain.handle('relaunch-app', () => {
  isQuitting = true
  app.relaunch()
  app.exit(0)
})
ipcMain.handle('is-maximized', () => mainWindow?.isMaximized() ?? false)
ipcMain.handle('set-fullscreen', (_, value) => mainWindow?.setFullScreen(!!value))
ipcMain.handle('is-fullscreen', () => mainWindow?.isFullScreen() ?? false)
// Toggles DevTools on whichever window asked (main or a pop-out), not always
// mainWindow — lets a float window's own Diagnostics/hotkey inspect itself.
ipcMain.handle('toggle-devtools', (event) => event.sender.toggleDevTools())

// ── IPC: floating pop-out windows ─────────────────────────────────────────────
ipcMain.handle('open-float-window', (_, view, params) => {
  if (Object.prototype.hasOwnProperty.call(FLOAT_SIZES, view)) createFloatWindow(view, params)
})

// Closes every pop-out (mini player, settings, editor, …) but leaves the main
// window alone — backs the "close all pop-out windows" shortcut.
ipcMain.handle('close-float-windows', () => closeAllFloatWindows())

// ── OS-global shortcuts ──────────────────────────────────────────────────────
// The renderer owns which accelerators map to which action; main just registers
// them and relays a fire back to the main window's hotkey dispatcher. Each
// register call replaces the whole set (unregisterAll first), so toggling the
// feature off is just registerGlobalShortcuts([]).
ipcMain.handle('register-global-shortcuts', (_, entries) => {
  globalShortcut.unregisterAll()
  const failed = []
  for (const { accelerator, id } of entries || []) {
    if (!accelerator || !id) continue
    try {
      // register returns false when the OS/another app already owns the combo.
      const ok = globalShortcut.register(accelerator, () => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('global-shortcut', id)
      })
      if (!ok) failed.push(accelerator)
    } catch {
      failed.push(accelerator)
    }
  }
  return { failed }
})

// Pop-outs are frameless and render their own window buttons; the
// 'close/minimize/maximize-window' handlers target the MAIN window
// specifically, so they need sender-scoped variants.
ipcMain.handle('close-self', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})
ipcMain.handle('minimize-self', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
})
// Toggles and returns the new state so the caller's restore/maximize icon
// can track it without a second round-trip.
ipcMain.handle('maximize-self', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return false
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
  return win.isMaximized()
})

ipcMain.handle('focus-main-window', () => showMainWindow())

// Mini-player panel toggle. Compact mode locks the window height (only the
// width resizes); expanding for the lyrics/queue panel frees vertical
// resizing and grows the window if it's still at compact height. 100000
// stands in for "unbounded" — Electron has no documented way to clear a
// maximum once set.
const MINI_EXPANDED_MIN_HEIGHT = 440
const MINI_EXPANDED_HEIGHT = 540
ipcMain.handle('mini-player-set-expanded', (event, expanded) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || win.isDestroyed()) return
  const { minWidth, height: compactHeight } = FLOAT_SIZES['mini-player']
  const [w, h] = win.getSize()
  if (expanded) {
    win.setMaximumSize(100000, 100000)
    win.setMinimumSize(minWidth, MINI_EXPANDED_MIN_HEIGHT)
    if (h < MINI_EXPANDED_HEIGHT) win.setSize(w, MINI_EXPANDED_HEIGHT)
  } else {
    win.setMinimumSize(minWidth, compactHeight)
    win.setSize(w, compactHeight)
    win.setMaximumSize(100000, compactHeight)
  }
})

// Pin toggle for the mini player — returns the new state so the button's
// icon can track it without a second round-trip.
ipcMain.handle('toggle-always-on-top-self', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return false
  win.setAlwaysOnTop(!win.isAlwaysOnTop())
  return win.isAlwaysOnTop()
})

// "Solo" button on the mini player — get every other window off the screen
// AND out of the taskbar. Other pop-outs are closed for real. The main
// window can't be: it owns the audio, and its 'closed' handler tears down
// every pop-out (mini included) and quits the app — so it's hidden instead,
// which drops its taskbar entry while playback keeps running. It's recorded
// in miniPlayerHiddenWindows so closing the mini player restores it (see
// restoreWindowsAfterMiniPlayer); the "Show full app" button brings it back
// sooner. A main window already hidden (e.g. to the tray) is left as-is so
// restore semantics match the solo-mode setting.
ipcMain.handle('hide-other-windows', (event) => {
  const sender = BrowserWindow.fromWebContents(event.sender)
  for (const win of BrowserWindow.getAllWindows()) {
    if (win === sender || win.isDestroyed()) continue
    if (win === mainWindow) {
      if (win.isVisible() || win.isMinimized()) {
        if (!miniPlayerHiddenWindows.includes(win)) miniPlayerHiddenWindows.push(win)
        win.hide()
      }
    } else {
      win.close()
    }
  }
})

// Store-sync relay: a renderer broadcasts a state patch and every OTHER
// window receives it (each window runs its own store instance — see
// src/renderer/src/lib/windowSync.ts for what gets mirrored and why).
ipcMain.on('window-sync', (event, msg) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && win.webContents.id !== event.sender.id) {
      win.webContents.send('window-sync', msg)
    }
  }
})

// ── IPC: local file browsing ──────────────────────────────────────────────────
ipcMain.handle('browse-local', async (_, dirPath) => {
  try {
    const target = dirPath || app.getPath('home')
    const st = fs.statSync(target)
    if (!st.isDirectory()) return { error: 'Not a directory', path: target, entries: [] }
    const names = fs.readdirSync(target)
    const entries = []
    for (const name of names) {
      if (name.startsWith('.')) continue
      try {
        const fullPath = path.join(target, name)
        const s = fs.statSync(fullPath)
        entries.push({
          name,
          path: fullPath,
          type: s.isDirectory() ? 'directory' : 'file',
          size: s.isFile() ? s.size : null,
        })
      } catch {}
    }
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return { path: target, entries }
  } catch (err) {
    return { error: err.message, path: dirPath || '', entries: [] }
  }
})

// Parent the dialog to whichever window asked (Settings can live in a
// pop-out) — falling back to the main window for safety.
ipcMain.handle('pick-folder', async (event) => {
  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender) ?? mainWindow, {
    properties: ['openDirectory'],
    title: 'Select folder',
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('open-path', (_, p) => shell.openPath(p))

// The small web-installer stub ships inside the app (see package.json
// win.extraResources) as an emergency repair/reinstall tool — it works even
// if the app itself is broken, since it's a standalone .exe next to the
// install, not something the app has to run. Prefer that local copy (no
// download needed); fall back to the GitHub download link when it's missing
// (dev builds, non-Windows platforms, or an old install predating this).
ipcMain.handle('open-online-installer', async () => {
  const bundled = app.isPackaged ? path.join(process.resourcesPath, 'Unreleased-Setup.exe') : null
  if (bundled && fs.existsSync(bundled)) {
    const err = await shell.openPath(bundled)
    if (!err) return { source: 'bundled' }
    log('Bundled installer failed to launch, falling back to web:', err)
  }
  shell.openExternal('https://github.com/leanwrldd/unreleased/releases/latest/download/Unreleased-Setup.exe')
  return { source: 'web' }
})

// ── IPC: run logging ──────────────────────────────────────────────────────────
// Renderer breadcrumbs (window errors, unhandled rejections, and explicit
// diagnostic logs like the tracker sort loop) funnel here into the run log.
ipcMain.on('run-log', (_, scope, message) => runLog(scope || 'renderer', message))
ipcMain.handle('open-logs-folder', () => shell.showItemInFolder(runLogPath))
ipcMain.handle('get-log-paths', () => ({ current: runLogPath, previous: prevRunLogPath }))

// ── IPC: app settings ─────────────────────────────────────────────────────────
ipcMain.handle('get-app-settings', () => appSettings)

ipcMain.handle('set-app-setting', (_, key, value) => {
  appSettings[key] = value
  saveSettings()
  if (key === 'autoDownload') autoUpdater.autoDownload = value
  if (key === 'discordRpcEnabled') discordRpc.setEnabled(value)
  if (key === 'minimizeTo' && value === 'notification') applyTrayPin()
  return true
})

// ── IPC: beta channel ─────────────────────────────────────────────────────────
// Validates against the backend itself (GET {BETA_API_BASE}/unlock?code=...
// -> {"valid": true|false}) — see build/fetch-releases.ps1 for the full
// contract shared with the installer. No code/hash is ever baked into the app.
function checkBetaCode(code) {
  return new Promise((resolve, reject) => {
    const url = `${BETA_API_BASE}/unlock?code=${encodeURIComponent(code)}`
    https.get(url, { headers: { 'User-Agent': 'Unreleased-App' } }, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`))
        try { resolve(!!JSON.parse(data).valid) } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

ipcMain.handle('beta-get-status', () => !!readBetaCode())

ipcMain.handle('beta-join', async (_, code) => {
  const trimmed = String(code ?? '').trim()
  if (!trimmed) return false
  try {
    if (!(await checkBetaCode(trimmed))) return false
  } catch (err) {
    log('beta-join: code check failed:', err.message)
    return false
  }
  try {
    fs.writeFileSync(betaMarkerPath, trimmed)
  } catch (err) {
    log('beta-join: marker write failed:', err.message)
    return false
  }
  applyUpdateFeed(trimmed)
  log('Beta access unlocked via Settings')
  return true
})

ipcMain.handle('beta-leave', () => {
  try { fs.rmSync(betaMarkerPath, { force: true }) } catch {}
  applyUpdateFeed(null)
  log('Left beta channel')
  return true
})

// ── IPC: Discord Rich Presence ────────────────────────────────────────────────
ipcMain.handle('discord-rpc-set-activity', (_, nowPlaying) => {
  discordRpc.setNowPlaying(nowPlaying)
  return true
})

ipcMain.handle('discord-rpc-clear-activity', () => {
  discordRpc.clearActivity()
  return true
})


// ── IPC: library management ───────────────────────────────────────────────────

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.aac', '.m4a', '.ogg', '.opus', '.wav', '.wma', '.aiff', '.ape', '.wv'])

const libraryDataPath = path.join(app.getPath('userData'), 'library-data.json')
const localPlaylistsPath = path.join(app.getPath('userData'), 'local-playlists.json')

function loadLibraryData() {
  try { return JSON.parse(fs.readFileSync(libraryDataPath, 'utf-8')) } catch { return { tracks: [], folders: [], lastScanned: null } }
}
function saveLibraryData(data) {
  try { fs.writeFileSync(libraryDataPath, JSON.stringify(data)) } catch(e) { log('saveLibraryData error:', e.message) }
}
function loadLocalPlaylists() {
  try { return JSON.parse(fs.readFileSync(localPlaylistsPath, 'utf-8')) } catch { return [] }
}
function saveLocalPlaylists(playlists) {
  try { fs.writeFileSync(localPlaylistsPath, JSON.stringify(playlists)) } catch(e) { log('saveLocalPlaylists error:', e.message) }
}

ipcMain.handle('load-library-data', () => loadLibraryData())
ipcMain.handle('save-library-data', (_, data) => { saveLibraryData(data); return true })
ipcMain.handle('load-local-playlists', () => loadLocalPlaylists())
ipcMain.handle('save-local-playlists', (_, playlists) => { saveLocalPlaylists(playlists); return true })

// ── IPC: offline playlist sync (download API songs for offline playback) ─────
//
// tracks: keyed by track id ("jw-{songId}") — the audio file plus enough of
// the song's own metadata (title, lyrics, art...) to play fully offline.
// playlists: keyed by "api-{playlistId}" — just the list of track ids that
// playlist wants kept offline, so removing a playlist can tell whether a
// track is still needed by some other synced playlist before deleting it.
const offlineLibraryDataPath = path.join(app.getPath('userData'), 'offline-library.json')
function getOfflineAudioDir() { return appSettings.offlineLibraryPath }

function loadOfflineLibrary() {
  try {
    const data = JSON.parse(fs.readFileSync(offlineLibraryDataPath, 'utf-8'))
    return { tracks: data.tracks || {}, playlists: data.playlists || {} }
  } catch { return { tracks: {}, playlists: {} } }
}
function saveOfflineLibrary(data) {
  try { fs.writeFileSync(offlineLibraryDataPath, JSON.stringify(data)) } catch(e) { log('saveOfflineLibrary error:', e.message) }
}

ipcMain.handle('offline-get-library', () => loadOfflineLibrary())

// Reads actual file sizes off disk (rather than trusting cached metadata)
// so the Settings display stays accurate even for tracks downloaded before
// size tracking existed, or if a file was moved/edited outside the app.
ipcMain.handle('offline-get-stats', () => {
  const lib = loadOfflineLibrary()
  let totalSize = 0
  let count = 0
  for (const track of Object.values(lib.tracks)) {
    try {
      totalSize += fs.statSync(track.localPath).size
      count++
    } catch {}
  }
  return { count, totalSize }
})

ipcMain.handle('offline-download-track', async (event, { id, url, ext, path: songPath, meta }) => {
  const lib = loadOfflineLibrary()
  const existing = lib.tracks[id]
  const localPath = path.join(getOfflineAudioDir(), `${id}.${ext || 'mp3'}`)

  // Audio unchanged and still on disk — just refresh the display metadata
  // (title/lyrics/art may have been edited without the file itself moving).
  if (existing && existing.path === songPath && fs.existsSync(existing.localPath)) {
    lib.tracks[id] = { ...existing, ...meta, path: songPath }
    saveOfflineLibrary(lib)
    let size = 0
    try { size = fs.statSync(existing.localPath).size } catch {}
    return { localPath: existing.localPath, skipped: true, size }
  }

  try { fs.mkdirSync(getOfflineAudioDir(), { recursive: true }) } catch {}
  try {
    await downloadFile(url, localPath, (percent, received, total) => {
      mainWindow?.webContents.send('offline-download-progress', { id, percent, received, total })
    })
  } catch (e) {
    return { error: 'Download failed: ' + e.message }
  }

  lib.tracks[id] = { ...meta, path: songPath, localPath, ext: ext || 'mp3', downloadedAt: Date.now() }
  saveOfflineLibrary(lib)
  let size = 0
  try { size = fs.statSync(localPath).size } catch {}
  return { localPath, size }
})

ipcMain.handle('offline-remove-track', (_, id) => {
  const lib = loadOfflineLibrary()
  const entry = lib.tracks[id]
  if (entry) {
    try { fs.unlinkSync(entry.localPath) } catch {}
    delete lib.tracks[id]
    saveOfflineLibrary(lib)
  }
  return true
})

ipcMain.handle('offline-set-playlist', (_, key, songIds, name) => {
  const lib = loadOfflineLibrary()
  lib.playlists[key] = { songIds, name, updatedAt: Date.now() }
  // Prune any previously-offline track that's no longer referenced by ANY
  // synced playlist (song was removed from the playlist, or the playlist's
  // song list shrank on resync).
  const stillReferenced = new Set(Object.values(lib.playlists).flatMap(p => p.songIds))
  for (const trackId of Object.keys(lib.tracks)) {
    if (!stillReferenced.has(trackId)) {
      try { fs.unlinkSync(lib.tracks[trackId].localPath) } catch {}
      delete lib.tracks[trackId]
    }
  }
  saveOfflineLibrary(lib)
  return true
})

ipcMain.handle('offline-remove-playlist', (_, key) => {
  const lib = loadOfflineLibrary()
  delete lib.playlists[key]
  const stillReferenced = new Set(Object.values(lib.playlists).flatMap(p => p.songIds))
  for (const trackId of Object.keys(lib.tracks)) {
    if (!stillReferenced.has(trackId)) {
      try { fs.unlinkSync(lib.tracks[trackId].localPath) } catch {}
      delete lib.tracks[trackId]
    }
  }
  saveOfflineLibrary(lib)
  return true
})

// Moves every downloaded offline audio file from the old folder into the new
// one and repoints the library's localPath entries, so switching folders
// doesn't orphan (or silently re-download) what's already been saved.
ipcMain.handle('offline-set-library-path', async (_, newPath) => {
  const oldPath = getOfflineAudioDir()
  if (!newPath || newPath === oldPath) return { path: oldPath }

  try { fs.mkdirSync(newPath, { recursive: true }) } catch (e) {
    return { error: 'Could not create folder: ' + e.message }
  }

  const lib = loadOfflineLibrary()
  const failed = []
  for (const trackId of Object.keys(lib.tracks)) {
    const track = lib.tracks[trackId]
    const oldFile = track.localPath
    if (!oldFile || !fs.existsSync(oldFile)) continue
    const newFile = path.join(newPath, path.basename(oldFile))
    try {
      fs.renameSync(oldFile, newFile)
      track.localPath = newFile
    } catch (e) {
      // Cross-device moves can fail with EXDEV — fall back to copy + delete.
      try {
        fs.copyFileSync(oldFile, newFile)
        fs.unlinkSync(oldFile)
        track.localPath = newFile
      } catch (e2) {
        failed.push(trackId)
      }
    }
  }
  saveOfflineLibrary(lib)

  appSettings.offlineLibraryPath = newPath
  saveSettings()

  return failed.length ? { path: newPath, failedCount: failed.length } : { path: newPath }
})

ipcMain.handle('scan-library', async (_, folders, previousTracks) => {
  let mm
  try { mm = require('music-metadata') } catch(e) { return { error: 'music-metadata not installed: ' + e.message, tracks: [] } }

  // Keyed by file path so an unchanged file (same size + mtime as last scan)
  // can be reused as-is instead of re-parsing its tags — makes it cheap
  // enough to re-run automatically (see "Auto-refresh changed files" setting)
  // without reparsing an entire library just to pick up a couple of edits.
  const prevByPath = new Map((previousTracks || []).map((t) => [t.filePath, t]))

  // Walk first (cheap directory listing), parse after with a small worker
  // pool — tag parsing is the expensive part, and strictly one-file-at-a-time
  // left the disk and CPU idling in turns. Results land in indexed slots so
  // the track order still matches the walk order exactly.
  const files = []
  function walk(dirPath) {
    let entries
    try { entries = fs.readdirSync(dirPath, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) walk(fullPath)
      else if (entry.isFile() && AUDIO_EXTS.has(path.extname(entry.name).toLowerCase())) files.push(fullPath)
    }
  }
  for (const folder of folders) walk(folder)

  const tracks = new Array(files.length)
  const errors = []
  let nextIdx = 0
  const SCAN_CONCURRENCY = 4

  async function scanWorker() {
    while (true) {
      const i = nextIdx++
      if (i >= files.length) return
      const fullPath = files[i]
      const ext = path.extname(fullPath).toLowerCase()
      const prev = prevByPath.get(fullPath)
      if (prev) {
        try {
          const stat = fs.statSync(fullPath)
          if (prev.fileSize === stat.size && prev.lastModified === stat.mtimeMs) {
            tracks[i] = prev
            continue
          }
        } catch {}
      }
      try {
        const metadata = await mm.parseFile(fullPath, { duration: true, skipCovers: true })
        const common = metadata.common
        const format = metadata.format
        const stat = fs.statSync(fullPath)
        tracks[i] = {
          id: 'local-' + fullPath,
          filePath: fullPath,
          ext: ext.slice(1),
          title: common.title || path.basename(fullPath).replace(/\.[^.]+$/, ''),
          artist: (common.artists || []).join(', ') || common.artist || '',
          album: common.album || '',
          albumArtist: common.albumartist || '',
          year: common.year || null,
          trackNumber: common.track?.no || null,
          discNumber: common.disk?.no || null,
          composer: (common.composer || []).join(', '),
          genre: (common.genre || []).join(', '),
          duration: format.duration || 0,
          bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : null,
          sampleRate: format.sampleRate || null,
          fileSize: stat.size,
          lastModified: stat.mtimeMs,
          hasAlbumArt: (common.picture && common.picture.length > 0) ? true : false,
          // A re-parsed file is an *edited* file, not a new one — keep its
          // original added date so "recently added" sorting doesn't reshuffle
          // whenever tags change.
          addedAt: prev?.addedAt ?? Date.now(),
          // Not included: albumArt base64 (loaded on-demand), lyrics
        }
      } catch(e) {
        errors.push({ path: fullPath, error: e.message })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, files.length) }, scanWorker))

  return { tracks: tracks.filter(Boolean), errors }
})

// Embedded album art is often full-resolution (1400px+). Returning it raw meant
// the renderer decoded a multi-MB bitmap PER track row and kept it in memory for
// every track — opening the Library tab could pull gigabytes of RAM. Downscale to
// a JPEG thumbnail (longest edge <= maxSize) before handing it to the renderer.
function coverToThumbDataUri(rawBuffer, fallbackFormat, maxSize) {
  try {
    const img = nativeImage.createFromBuffer(rawBuffer)
    if (img.isEmpty()) throw new Error('decode failed')
    const { width, height } = img.getSize()
    const longest = Math.max(width, height)
    const sized = (maxSize && longest > maxSize)
      ? img.resize(width >= height ? { width: maxSize, quality: 'good' } : { height: maxSize, quality: 'good' })
      : img
    return `data:image/jpeg;base64,${sized.toJPEG(82).toString('base64')}`
  } catch {
    // Unsupported format (rare, e.g. webp on some platforms) — fall back to raw.
    return `data:${fallbackFormat};base64,${Buffer.from(rawBuffer).toString('base64')}`
  }
}

// ── Album-art thumbnail cache ────────────────────────────────────────────────
// Extracting a cover means parsing the whole audio file's metadata — far too
// expensive to redo per row per session. Thumbs are cached by
// (path, mtime, size, maxSize): in memory for repeat asks this session, and on
// disk (the finished data-URI string) so covers survive app restarts. An empty
// cache file means "parsed before, no embedded art" so artless files aren't
// re-parsed either. File edits change mtime/size → new key → stale entries are
// simply never read again.
const crypto = require('crypto')
const artCacheDir = path.join(app.getPath('userData'), 'art-thumbs')
const artMemCache = new Map() // key → data URI ('' = known artless); LRU capped
const ART_MEM_MAX = 500

function artMemPut(key, dataUri) {
  artMemCache.delete(key)
  artMemCache.set(key, dataUri)
  if (artMemCache.size > ART_MEM_MAX) artMemCache.delete(artMemCache.keys().next().value)
}

function artCacheGet(key) {
  if (artMemCache.has(key)) {
    const hit = artMemCache.get(key)
    artMemPut(key, hit) // refresh LRU position
    return hit
  }
  try {
    const data = fs.readFileSync(path.join(artCacheDir, key), 'utf-8')
    artMemPut(key, data)
    return data
  } catch { return undefined }
}

function artCachePut(key, dataUri) {
  artMemPut(key, dataUri)
  try {
    fs.mkdirSync(artCacheDir, { recursive: true })
    fs.writeFileSync(path.join(artCacheDir, key), dataUri)
  } catch {}
}

ipcMain.handle('read-album-art', async (_, filePath, maxSize = 256) => {
  let st
  try { st = fs.statSync(filePath) } catch { return null }
  const key = crypto.createHash('sha1').update(`${filePath}|${st.mtimeMs}|${st.size}|${maxSize}`).digest('hex')
  const cached = artCacheGet(key)
  if (cached !== undefined) return cached || null

  let mm
  try { mm = require('music-metadata') } catch { return null }
  try {
    const metadata = await mm.parseFile(filePath, { skipCovers: false, duration: false })
    const pic = metadata.common.picture?.[0]
    const uri = pic ? coverToThumbDataUri(Buffer.from(pic.data), pic.format, maxSize) : null
    artCachePut(key, uri || '')
    return uri
  } catch { return null } // transient read/parse error — don't cache the failure
})

ipcMain.handle('read-track-metadata', async (_, filePath) => {
  let mm
  try { mm = require('music-metadata') } catch { return null }
  try {
    const metadata = await mm.parseFile(filePath, { skipCovers: false, duration: true })
    const common = metadata.common
    const format = metadata.format
    const pic = common.picture?.[0]
    // Larger cap here — this feeds the full Now Playing art, not a list thumbnail.
    const albumArt = pic ? coverToThumbDataUri(Buffer.from(pic.data), pic.format, 512) : null
    let fileSize = null
    try { fileSize = fs.statSync(filePath).size } catch {}
    return {
      title: common.title || '',
      artist: (common.artists || []).join(', ') || common.artist || '',
      album: common.album || '',
      albumArtist: common.albumartist || '',
      year: common.year || null,
      trackNumber: common.track?.no || null,
      discNumber: common.disk?.no || null,
      composer: (common.composer || []).join(', '),
      genre: (common.genre || []).join(', '),
      lyrics: common.lyrics?.[0]?.text || '',
      syncedLyrics: common.lyrics?.find(l => l.syncText)?.syncText?.map(s => `[${formatTime(s.timestamp)}]${s.text}`).join('\n') || '',
      albumArt,
      bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : null,
      sampleRate: format.sampleRate || null,
      bitsPerSample: format.bitsPerSample || null,
      channels: format.numberOfChannels || null,
      fileSize,
      duration: format.duration || 0,
    }
  } catch(e) { return { error: e.message } }
})

function formatTime(ms) {
  const total = Math.floor(ms / 1000)
  const min = Math.floor(total / 60).toString().padStart(2, '0')
  const sec = (total % 60).toString().padStart(2, '0')
  const msRem = (ms % 1000).toString().padStart(3, '0')
  return `${min}:${sec}.${msRem}`
}

// Reverse of the [mm:ss.mmm]text reading above — parses LRC-style text back
// into the {text, timeStamp} list a SYLT (synchronised lyrics) ID3 frame
// needs. Mirrors the renderer's parseLrc() regex (lib/lyrics.ts) so anything
// the app considers valid synced lyrics round-trips through writing too.
function parseLrcToSylt(lrc) {
  const timeRegex = /\[(\d{1,2}):(\d{2})[.:](\d{2,3})\]/g
  const lines = []
  for (const rawLine of lrc.split(/\r?\n/)) {
    const matches = [...rawLine.matchAll(timeRegex)]
    if (matches.length === 0) continue
    const text = rawLine.replace(timeRegex, '').trim()
    for (const match of matches) {
      const min = parseInt(match[1], 10)
      const sec = parseInt(match[2], 10)
      const ms = parseInt(match[3].padEnd(3, '0'), 10)
      lines.push({ text, timeStamp: (min * 60 + sec) * 1000 + ms })
    }
  }
  return lines.sort((a, b) => a.timeStamp - b.timeStamp)
}

ipcMain.handle('write-track-metadata', async (_, filePath, metadata) => {
  const ext = path.extname(filePath).toLowerCase()
  if (ext !== '.mp3') return { error: 'Only MP3 metadata writing is supported currently' }
  let NodeID3
  try { NodeID3 = require('node-id3') } catch { return { error: 'node-id3 not installed' } }
  try {
    const tags = {}
    if (metadata.title !== undefined) tags.title = metadata.title
    if (metadata.artist !== undefined) tags.artist = metadata.artist
    if (metadata.album !== undefined) tags.album = metadata.album
    if (metadata.albumArtist !== undefined) tags.performerInfo = metadata.albumArtist
    if (metadata.year !== undefined) tags.year = metadata.year != null ? String(metadata.year) : ''
    if (metadata.trackNumber !== undefined) tags.trackNumber = metadata.trackNumber != null ? String(metadata.trackNumber) : ''
    if (metadata.composer !== undefined) tags.composer = metadata.composer
    if (metadata.genre !== undefined) tags.genre = metadata.genre
    if (metadata.lyrics !== undefined) tags.unsynchronisedLyrics = { language: 'eng', text: metadata.lyrics }
    if (metadata.syncedLyrics !== undefined) {
      const synced = parseLrcToSylt(metadata.syncedLyrics || '')
      tags.synchronisedLyrics = synced.length ? [{
        language: 'eng',
        timeStampFormat: NodeID3.TagConstants.TimeStampFormat.MILLISECONDS,
        contentType: NodeID3.TagConstants.SynchronisedLyrics.ContentType.LYRICS,
        shortText: 'Synced lyrics',
        synchronisedText: synced,
      }] : []
    }
    if (metadata.albumArtBase64 !== undefined && metadata.albumArtBase64) {
      // albumArtBase64 is a data URL: "data:<mime>;base64,<data>"
      const match = metadata.albumArtBase64.match(/^data:([^;]+);base64,(.+)$/)
      if (match) {
        tags.image = {
          mime: match[1],
          type: { id: 3, name: 'front cover' },
          description: 'Cover',
          imageBuffer: Buffer.from(match[2], 'base64'),
        }
      }
    }
    const result = NodeID3.update(tags, filePath)
    if (result === false) return { error: 'Failed to write tags' }
    return { success: true }
  } catch(e) { return { error: e.message } }
})

ipcMain.handle('load-wrlddata', async () => {
  const filePath = path.join(app.getAppPath(), 'src', 'renderer', 'public', 'wrlddata.json')
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')) } catch { return null }
})

ipcMain.handle('save-wrlddata', async (_, data) => {
  if (app.isPackaged) return { error: 'Read-only in production' }
  const filePath = path.join(app.getAppPath(), 'src', 'renderer', 'public', 'wrlddata.json')
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
  return { ok: true }
})
ipcMain.handle('download-to-library', async (_, { url, songName, artist, songPath }) => {
  // Determine save folder: Music/JuiceWRLD Library. On Linux without
  // xdg-user-dirs configured, getPath('music') throws — fall back to ~/Music.
  let musicDir
  try { musicDir = app.getPath('music') } catch { musicDir = path.join(app.getPath('home'), 'Music') }
  const libraryFolder = path.join(musicDir, 'JuiceWRLD Library')
  try { fs.mkdirSync(libraryFolder, { recursive: true }) } catch {}

  // Build filename from songPath (keeps original extension)
  const ext = path.extname(songPath || '').toLowerCase() || '.mp3'
  const baseName = (songName || 'track').replace(/[/\\:*?"<>|]/g, '_').trim()
  const savePath = path.join(libraryFolder, baseName + ext)

  // Download
  try {
    await downloadFile(url, savePath)
  } catch (e) {
    return { error: 'Download failed: ' + e.message }
  }

  // Parse metadata
  let mm
  try { mm = require('music-metadata') } catch { return { error: 'music-metadata not installed' } }
  let trackMeta = {}
  try {
    const meta = await mm.parseFile(savePath, { duration: true, skipCovers: true })
    const c = meta.common
    const f = meta.format
    const stat = fs.statSync(savePath)
    trackMeta = {
      id: 'local-' + savePath,
      filePath: savePath,
      ext: ext.slice(1),
      title: c.title || songName || baseName,
      artist: (c.artists || []).join(', ') || c.artist || artist || '',
      album: c.album || '',
      albumArtist: c.albumartist || '',
      year: c.year || null,
      trackNumber: c.track?.no || null,
      discNumber: c.disk?.no || null,
      composer: (c.composer || []).join(', '),
      genre: (c.genre || []).join(', '),
      duration: f.duration || 0,
      bitrate: f.bitrate ? Math.round(f.bitrate / 1000) : null,
      sampleRate: f.sampleRate || null,
      fileSize: stat.size,
      lastModified: stat.mtimeMs,
      hasAlbumArt: (c.picture && c.picture.length > 0) ? true : false,
      addedAt: Date.now(),
    }
  } catch (e) {
    return { error: 'Metadata read failed: ' + e.message }
  }

  // Add to library-data.json
  const libData = loadLibraryData()
  const existingIdx = libData.tracks.findIndex(t => t.id === trackMeta.id)
  if (existingIdx >= 0) {
    libData.tracks[existingIdx] = trackMeta
  } else {
    libData.tracks.push(trackMeta)
  }
  saveLibraryData(libData)

  return { track: trackMeta }
})

// ── Audio format conversion (ffmpeg) ─────────────────────────────────────────
// Local library files can be transcoded to another format via the bundled
// ffmpeg-static binary. The output lands next to the source (never overwriting
// it), inherits tags + embedded cover where the target container supports one,
// and is registered into library-data.json so it shows up in the library.

// ffmpeg-static resolves to a path inside node_modules; in a packaged build
// that path lives inside the asar archive, but a native binary can't execute
// from there — electron-builder unpacks it (see package.json asarUnpack), so we
// remap onto the unpacked copy. Returns null if the dependency is missing.
function resolveFfmpegPath() {
  let p
  try { p = require('ffmpeg-static') } catch { return null }
  if (!p) return null
  if (app.isPackaged) p = p.replace('app.asar', 'app.asar.unpacked')
  return fs.existsSync(p) ? p : null
}

// Target format → { file extension, codec-arg builder, whether the container
// can carry an embedded cover }. `bitrate` is only consulted for lossy codecs.
// libvorbis rejects CBR (`-b:a`) on some inputs (e.g. mono) with "encoder setup
// failed" — it wants VBR quality instead, so map the requested bitrate onto a
// vorbis quality level (-q:a 0..10).
const VORBIS_QUALITY = { '320k': 9, '256k': 8, '192k': 6, '128k': 4 }

const CONVERT_FORMATS = {
  mp3:  { ext: 'mp3',  cover: true,  codec: (br) => ['-c:a', 'libmp3lame', '-b:a', br] },
  m4a:  { ext: 'm4a',  cover: true,  codec: (br) => ['-c:a', 'aac', '-b:a', br] },
  flac: { ext: 'flac', cover: true,  codec: ()   => ['-c:a', 'flac'] },
  wav:  { ext: 'wav',  cover: false, codec: ()   => ['-c:a', 'pcm_s16le'] },
  ogg:  { ext: 'ogg',  cover: false, codec: (br) => ['-c:a', 'libvorbis', '-q:a', String(VORBIS_QUALITY[br] ?? 6)] },
  opus: { ext: 'opus', cover: false, codec: (br) => ['-c:a', 'libopus', '-b:a', br] },
}

// Pick an output path next to the source that clobbers neither an existing file
// nor the source itself (matters most for same-format re-encodes, where the
// natural name collides with the input).
function uniqueConvertPath(dir, base, ext, srcPath) {
  const src = path.resolve(srcPath)
  let candidate = path.join(dir, `${base}.${ext}`)
  if (path.resolve(candidate) !== src && !fs.existsSync(candidate)) return candidate
  candidate = path.join(dir, `${base} (converted).${ext}`)
  let n = 1
  while (path.resolve(candidate) === src || fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} (converted ${++n}).${ext}`)
  }
  return candidate
}

ipcMain.handle('convert-audio', async (event, { id, filePath, format, bitrate }) => {
  const spec = CONVERT_FORMATS[format]
  if (!spec) return { error: `Unsupported target format: ${format}` }
  if (!filePath || !fs.existsSync(filePath)) return { error: 'Source file not found' }

  const ffmpegPath = resolveFfmpegPath()
  if (!ffmpegPath) return { error: 'ffmpeg is unavailable — the bundled converter could not be found.' }

  let mm
  try { mm = require('music-metadata') } catch { return { error: 'music-metadata not installed' } }

  // Total duration drives the progress percentage.
  let durationSec = 0
  try {
    const probe = await mm.parseFile(filePath, { duration: true, skipCovers: true })
    durationSec = probe.format.duration || 0
  } catch {}

  const dir = path.dirname(filePath)
  const base = path.basename(filePath, path.extname(filePath))
  const outPath = uniqueConvertPath(dir, base, spec.ext, filePath)

  const br = bitrate || '256k'
  const args = ['-hide_banner', '-nostdin', '-y', '-i', filePath]
  if (spec.cover) {
    // Keep audio + carry the cover (an "attached_pic" video stream) if present;
    // `?` makes the video mapping optional so cover-less files don't fail.
    args.push('-map', '0:a', '-map', '0:v?', '-c:v', 'copy')
  } else {
    args.push('-map', '0:a')
  }
  args.push('-map_metadata', '0', ...spec.codec(br))
  // Machine-readable progress on stdout; keep stderr for the failure message.
  args.push('-progress', 'pipe:1', '-nostats', outPath)

  const { spawn } = require('child_process')

  try {
    await new Promise((resolve, reject) => {
      const ff = spawn(ffmpegPath, args, { windowsHide: true })
      let stderr = ''
      ff.on('error', reject)
      ff.stderr.on('data', (d) => {
        stderr += d.toString()
        if (stderr.length > 8000) stderr = stderr.slice(-8000)
      })
      ff.stdout.on('data', (d) => {
        if (durationSec <= 0) return
        const matches = [...d.toString().matchAll(/out_time_us=(\d+)/g)]
        if (!matches.length) return
        const us = parseInt(matches[matches.length - 1][1], 10)
        const percent = Math.max(1, Math.min(99, Math.round((us / 1e6 / durationSec) * 100)))
        if (!event.sender.isDestroyed()) event.sender.send('convert-progress', { id, percent })
      })
      ff.on('close', (code) => {
        if (code === 0) return resolve()
        const tail = stderr.split('\n').map(l => l.trim()).filter(Boolean).slice(-3).join(' ')
        reject(new Error(tail || `ffmpeg exited with code ${code}`))
      })
    })
  } catch (e) {
    try { fs.unlinkSync(outPath) } catch {} // clean up any partial output
    return { error: 'Conversion failed: ' + e.message }
  }

  // Build a library entry for the new file (mirrors scan-library's shape).
  let trackMeta
  try {
    const meta = await mm.parseFile(outPath, { duration: true, skipCovers: true })
    const c = meta.common
    const f = meta.format
    const stat = fs.statSync(outPath)
    trackMeta = {
      id: 'local-' + outPath,
      filePath: outPath,
      ext: spec.ext,
      title: c.title || base,
      artist: (c.artists || []).join(', ') || c.artist || '',
      album: c.album || '',
      albumArtist: c.albumartist || '',
      year: c.year || null,
      trackNumber: c.track?.no || null,
      discNumber: c.disk?.no || null,
      composer: (c.composer || []).join(', '),
      genre: (c.genre || []).join(', '),
      duration: f.duration || 0,
      bitrate: f.bitrate ? Math.round(f.bitrate / 1000) : null,
      sampleRate: f.sampleRate || null,
      fileSize: stat.size,
      lastModified: stat.mtimeMs,
      hasAlbumArt: !!(c.picture && c.picture.length > 0),
      addedAt: Date.now(),
    }
  } catch (e) {
    // The file converted fine; only the re-read failed. Report success with the
    // path so the UI can still point the user at it.
    return { outPath, warning: 'Converted, but metadata could not be read: ' + e.message }
  }

  const libData = loadLibraryData()
  const existingIdx = libData.tracks.findIndex(t => t.id === trackMeta.id)
  if (existingIdx >= 0) libData.tracks[existingIdx] = trackMeta
  else libData.tracks.push(trackMeta)
  saveLibraryData(libData)

  if (!event.sender.isDestroyed()) event.sender.send('convert-progress', { id, percent: 100 })
  return { track: trackMeta, outPath }
})


ipcMain.handle('open-discord-login', (_, authorizeUrl) => {
  return new Promise((resolve) => {
    const loginWin = new BrowserWindow({
      width: 520, height: 720,
      parent: mainWindow || undefined,
      modal: false,
      title: 'Log in with Discord',
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    })
    loginWin.setMenu(null)
    loginWin.loadURL(authorizeUrl)

    const CALLBACK_HOST = 'player.juicewrldapi.com'
    const CALLBACK_PATH = '/auth/discord/callback'

    const intercept = (_, url) => {
      try {
        const parsed = new URL(url)
        if (parsed.hostname === CALLBACK_HOST && parsed.pathname === CALLBACK_PATH) {
          const code = parsed.searchParams.get('code')
          const state = parsed.searchParams.get('state')
          loginWin.close()
          resolve(code && state ? { code, state } : null)
        }
      } catch {}
    }

    loginWin.webContents.on('will-navigate', intercept)
    loginWin.webContents.on('will-redirect', intercept)
    loginWin.on('closed', () => resolve(null))
  })
})

ipcMain.handle('select-image-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    title: 'Select album art',
  })
  if (result.canceled || !result.filePaths[0]) return null
  try {
    const buf = fs.readFileSync(result.filePaths[0])
    const ext = path.extname(result.filePaths[0]).toLowerCase()
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch { return null }
})

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Sweep partial downloads left by a crash mid-transfer: downloadFile writes
  // to "<file>.part" and renames into place on completion, so any .part still
  // present at startup is abandoned. Runs before the renderer loads, so no
  // download can be mid-write yet.
  try {
    for (const name of fs.readdirSync(getOfflineAudioDir())) {
      if (name.endsWith('.part')) {
        try { fs.unlinkSync(path.join(getOfflineAudioDir(), name)) } catch {}
      }
    }
  } catch {}

  protocol.handle('local-media', (request) => {
    try {
      const filePath = new URL(request.url).searchParams.get('p')
      if (!filePath) return new Response('Missing path', { status: 400 })

      // Serve Range requests ourselves: net.fetch on a file:// URL ignores the
      // Range header entirely, so every seek got the whole file back as a 200
      // and Chromium restarted playback from 0. A real 206 + Content-Range is
      // what makes the <audio> element treat the track as seekable.
      const stat = fs.statSync(filePath)
      const size = stat.size
      const mimeByExt = {
        '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.wav': 'audio/wav',
        '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.aac': 'audio/aac',
        '.opus': 'audio/ogg', '.wma': 'audio/x-ms-wma', '.aiff': 'audio/aiff',
        '.aif': 'audio/aiff', '.caf': 'audio/x-caf',
        '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
        '.m4v': 'video/mp4', '.mkv': 'video/x-matroska',
      }
      const mime = mimeByExt[path.extname(filePath).toLowerCase()] || 'application/octet-stream'

      const rangeHeader = request.headers.get('range')
      const match = rangeHeader && /bytes=(\d*)-(\d*)/.exec(rangeHeader)
      if (match && (match[1] || match[2])) {
        const start = match[1] ? parseInt(match[1], 10) : size - parseInt(match[2], 10)
        const end = match[1] && match[2] ? Math.min(parseInt(match[2], 10), size - 1) : size - 1
        if (start >= size || start < 0 || start > end) {
          return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
        }
        const stream = fs.createReadStream(filePath, { start, end })
        return new Response(webStreamFromNode(stream), {
          status: 206,
          headers: {
            'Content-Type': mime,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(end - start + 1),
            'Content-Range': `bytes ${start}-${end}/${size}`,
          },
        })
      }

      const stream = fs.createReadStream(filePath)
      return new Response(webStreamFromNode(stream), {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(size),
        },
      })
    } catch (e) {
      return new Response('Error: ' + e.message, { status: 500 })
    }
  })

  createWindow()
  createTray()
  if (appSettings.minimizeTo === 'notification') applyTrayPin()
  discordRpc.setEnabled(appSettings.discordRpcEnabled !== false)

  if (!isDev) {
    mainWindow.once('ready-to-show', () => {
      log('Checking for updates on startup...')
      autoUpdater.checkForUpdatesAndNotify().catch(err => log('checkForUpdates error:', err.message))
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

app.on('before-quit', () => { isQuitting = true; skipCloseConfirm = true; discordRpc.setEnabled(false); globalShortcut.unregisterAll() })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── Auto-updater events ───────────────────────────────────────────────────────
autoUpdater.on('checking-for-update', () => {
  log('Checking for update...')
  broadcastToWindows('update-status', { type: 'checking' })
})

autoUpdater.on('update-available', (info) => {
  log('Update available:', info.version)
  broadcastToWindows('update-status', { type: 'available', version: info.version })
})

autoUpdater.on('update-not-available', (info) => {
  log('Up to date:', info.version)
  broadcastToWindows('update-status', { type: 'not-available', version: info.version })
})

autoUpdater.on('download-progress', (p) => {
  log(`Downloading update: ${Math.round(p.percent)}%`)
  broadcastToWindows('update-status', {
    type: 'downloading',
    percent: Math.round(p.percent),
    bytesPerSecond: Math.round(p.bytesPerSecond),
  })
})

autoUpdater.on('update-downloaded', (info) => {
  log('Update downloaded:', info.version)
  broadcastToWindows('update-status', { type: 'downloaded', version: info.version })
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update ready',
    message: `Unreleased ${info.version} has been downloaded.`,
    detail: 'Restart the app to apply the update.',
    buttons: ['Restart now', 'Later'],
    defaultId: 0,
  }).then(({ response }) => {
    // isSilent + isForceRunAfter: install without showing the installer UI and
    // relaunch. The Windows installer is an assisted (wizard) installer now, so
    // a non-silent run here would pop the wizard mid-update.
    if (response === 0) autoUpdater.quitAndInstall(true, true)
  })
})

autoUpdater.on('error', (err) => {
  log('Auto-updater error:', err.message)
  broadcastToWindows('update-status', { type: 'error', message: err.message })
})
