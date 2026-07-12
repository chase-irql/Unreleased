const { app, BrowserWindow, shell, dialog, Menu, Tray, ipcMain, nativeImage, protocol, net } = require('electron')
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
  startupView: 'api-tracker',
  discordRpcEnabled: true,
  offlineLibraryPath: path.join(app.getPath('userData'), 'offline-audio'),
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

const iconPath = process.platform === 'linux'
  ? path.join(__dirname, '..', 'resources', 'icon-512.png')
  : path.join(__dirname, 'icon.ico')
const preloadPath = path.join(__dirname, 'preload.js')

let mainWindow = null
let tray = null
let isQuitting = false

// ── Tray ──────────────────────────────────────────────────────────────────────
function createTray() {
  try {
    tray = new Tray(iconPath)
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open Unreleased', click: () => mainWindow?.show() },
      { type: 'separator' },
      { label: 'Quit', click: () => { isQuitting = true; app.quit() } },
    ])
    tray.setToolTip('Unreleased')
    tray.setContextMenu(contextMenu)
    tray.on('click', () => mainWindow?.show())
  } catch (e) {
    log('Tray creation failed:', e.message)
  }
}

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
    if (!isQuitting && appSettings.minimizeToTray && tray) {
      e.preventDefault()
      mainWindow.hide()
    }
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
      mainWindow?.webContents.send('update-status', { type: 'error', message: err.message })
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
    mainWindow?.webContents.send('update-status', { type: 'checking' })
    const release = await fetchJson('https://api.github.com/repos/leanwrldd/unreleased/releases/latest')
    const assetSuffix = process.platform === 'win32' ? '.exe' : process.platform === 'darwin' ? '.dmg' : '.AppImage'
    const asset = release.assets.find(a => a.name.endsWith(assetSuffix))
    if (!asset) throw new Error('No installer found in latest release')

    const tmpPath = path.join(app.getPath('temp'), asset.name)
    log('Force-downloading installer:', asset.name, 'to', tmpPath)
    mainWindow?.webContents.send('update-status', { type: 'downloading', percent: 0, version: release.tag_name.replace(/^v/, '') })

    await downloadFile(asset.browser_download_url, tmpPath, (percent) => {
      mainWindow?.webContents.send('update-status', { type: 'downloading', percent, version: release.tag_name.replace(/^v/, '') })
    })

    log('Force update installer ready:', tmpPath)
    mainWindow?.webContents.send('update-status', { type: 'downloaded', version: release.tag_name.replace(/^v/, '') })

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
    mainWindow?.webContents.send('update-status', { type: 'error', message: err.message })
    throw err
  }
})

ipcMain.handle('check-for-updates', () => {
  log('Manual update check triggered')
  return autoUpdater.checkForUpdatesAndNotify()
})
ipcMain.handle('minimize-window', () => mainWindow?.minimize())
ipcMain.handle('maximize-window', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.handle('close-window', () => {
  if (!appSettings.minimizeToTray || !tray) isQuitting = true
  mainWindow?.close()
})
ipcMain.handle('is-maximized', () => mainWindow?.isMaximized() ?? false)
ipcMain.handle('set-fullscreen', (_, value) => mainWindow?.setFullScreen(!!value))
ipcMain.handle('is-fullscreen', () => mainWindow?.isFullScreen() ?? false)

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

ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select folder',
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('open-path', (_, p) => shell.openPath(p))

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

  const tracks = []
  const errors = []

  async function scanDir(dirPath) {
    let entries
    try { entries = fs.readdirSync(dirPath, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        await scanDir(fullPath)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (!AUDIO_EXTS.has(ext)) continue
        const prev = prevByPath.get(fullPath)
        if (prev) {
          try {
            const stat = fs.statSync(fullPath)
            if (prev.fileSize === stat.size && prev.lastModified === stat.mtimeMs) {
              tracks.push(prev)
              continue
            }
          } catch {}
        }
        try {
          const metadata = await mm.parseFile(fullPath, { duration: true, skipCovers: true })
          const common = metadata.common
          const format = metadata.format
          const stat = fs.statSync(fullPath)
          tracks.push({
            id: 'local-' + fullPath,
            filePath: fullPath,
            ext: ext.slice(1),
            title: common.title || entry.name.replace(/\.[^.]+$/, ''),
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
            addedAt: Date.now(),
            // Not included: albumArt base64 (loaded on-demand), lyrics
          })
        } catch(e) {
          errors.push({ path: fullPath, error: e.message })
        }
      }
    }
  }

  for (const folder of folders) {
    await scanDir(folder)
  }

  return { tracks, errors }
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

ipcMain.handle('read-album-art', async (_, filePath, maxSize = 256) => {
  let mm
  try { mm = require('music-metadata') } catch { return null }
  try {
    const metadata = await mm.parseFile(filePath, { skipCovers: false, duration: false })
    const pic = metadata.common.picture?.[0]
    if (!pic) return null
    return coverToThumbDataUri(Buffer.from(pic.data), pic.format, maxSize)
  } catch { return null }
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

app.on('before-quit', () => { isQuitting = true; discordRpc.setEnabled(false) })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── Auto-updater events ───────────────────────────────────────────────────────
autoUpdater.on('checking-for-update', () => {
  log('Checking for update...')
  mainWindow?.webContents.send('update-status', { type: 'checking' })
})

autoUpdater.on('update-available', (info) => {
  log('Update available:', info.version)
  mainWindow?.webContents.send('update-status', { type: 'available', version: info.version })
})

autoUpdater.on('update-not-available', (info) => {
  log('Up to date:', info.version)
  mainWindow?.webContents.send('update-status', { type: 'not-available', version: info.version })
})

autoUpdater.on('download-progress', (p) => {
  log(`Downloading update: ${Math.round(p.percent)}%`)
  mainWindow?.webContents.send('update-status', {
    type: 'downloading',
    percent: Math.round(p.percent),
    bytesPerSecond: Math.round(p.bytesPerSecond),
  })
})

autoUpdater.on('update-downloaded', (info) => {
  log('Update downloaded:', info.version)
  mainWindow?.webContents.send('update-status', { type: 'downloaded', version: info.version })
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update ready',
    message: `Unreleased ${info.version} has been downloaded.`,
    detail: 'Restart the app to apply the update.',
    buttons: ['Restart now', 'Later'],
    defaultId: 0,
  }).then(({ response }) => {
    if (response === 0) autoUpdater.quitAndInstall()
  })
})

autoUpdater.on('error', (err) => {
  log('Auto-updater error:', err.message)
  mainWindow?.webContents.send('update-status', { type: 'error', message: err.message })
})
