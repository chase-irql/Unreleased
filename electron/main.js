const { app, BrowserWindow, shell, dialog, Menu, Tray, ipcMain, nativeImage } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const fs = require('fs')
const https = require('https')
const discordRpc = require('./discordRpc')

const isDev = !app.isPackaged || process.env.NODE_ENV === 'development'

app.setAppUserModelId('Unreleased')
Menu.setApplicationMenu(null)

// ── Settings persistence ──────────────────────────────────────────────────────
const settingsPath = path.join(app.getPath('userData'), 'app-settings.json')
let appSettings = {
  downloadPath: app.getPath('downloads'),
  autoDownload: true,
  minimizeToTray: false,
  startupView: 'api-tracker',
  discordRpcEnabled: true,
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

// ── Shared file download helper (used by force-update + offline library) ──────
function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    function doGet(u) {
      const opts = new URL(u)
      https.get({ hostname: opts.hostname, path: opts.pathname + opts.search, headers: { 'User-Agent': 'Unreleased-App' } }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) return doGet(res.headers.location)
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`))
        const total = parseInt(res.headers['content-length'] || '0', 10)
        let received = 0
        const out = fs.createWriteStream(dest)
        res.on('data', chunk => {
          received += chunk.length
          if (onProgress) onProgress(total > 0 ? Math.round(received / total * 100) : 0, received, total)
        })
        res.pipe(out)
        out.on('finish', resolve)
        out.on('error', reject)
        res.on('error', reject)
      }).on('error', reject)
    }
    doGet(url)
  })
}

// ── Auto-updater setup ────────────────────────────────────────────────────────
autoUpdater.logger = { info: log, warn: log, error: log, debug: () => {} }
autoUpdater.autoDownload = appSettings.autoDownload
autoUpdater.autoInstallOnAppQuit = true

const iconPath = path.join(__dirname, 'icon.ico')
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

    mainWindow.webContents.send('download-started', {
      filename,
      savePath,
      total: item.getTotalBytes(),
    })

    item.on('updated', (_, state) => {
      if (state === 'progressing') {
        const total = item.getTotalBytes()
        mainWindow.webContents.send('download-progress', {
          filename,
          received: item.getReceivedBytes(),
          total,
          percent: total > 0 ? Math.round((item.getReceivedBytes() / total) * 100) : 0,
        })
      }
    })

    item.once('done', (_, state) => {
      mainWindow.webContents.send('download-done', {
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

  function fetchJson(url) {
    return new Promise((resolve, reject) => {
      const opts = new URL(url)
      https.get({ hostname: opts.hostname, path: opts.pathname + opts.search, headers: { 'User-Agent': 'Unreleased-App', 'Accept': 'application/vnd.github+json' } }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) return fetchJson(res.headers.location).then(resolve).catch(reject)
        let data = ''
        res.on('data', d => data += d)
        res.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } })
      }).on('error', reject)
    })
  }

  try {
    mainWindow?.webContents.send('update-status', { type: 'checking' })
    const release = await fetchJson('https://api.github.com/repos/leanwrldd/unreleased/releases/latest')
    const asset = release.assets.find(a => a.name.endsWith('.exe'))
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
  isQuitting = true
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
const offlineLibraryPath = path.join(app.getPath('userData'), 'offline-library.json')
const offlineAudioDir = path.join(app.getPath('userData'), 'offline-audio')

function loadOfflineLibrary() {
  try {
    const data = JSON.parse(fs.readFileSync(offlineLibraryPath, 'utf-8'))
    return { tracks: data.tracks || {}, playlists: data.playlists || {} }
  } catch { return { tracks: {}, playlists: {} } }
}
function saveOfflineLibrary(data) {
  try { fs.writeFileSync(offlineLibraryPath, JSON.stringify(data)) } catch(e) { log('saveOfflineLibrary error:', e.message) }
}

ipcMain.handle('offline-get-library', () => loadOfflineLibrary())

ipcMain.handle('offline-download-track', async (event, { id, url, ext, path: songPath, meta }) => {
  const lib = loadOfflineLibrary()
  const existing = lib.tracks[id]
  const localPath = path.join(offlineAudioDir, `${id}.${ext || 'mp3'}`)

  // Audio unchanged and still on disk — just refresh the display metadata
  // (title/lyrics/art may have been edited without the file itself moving).
  if (existing && existing.path === songPath && fs.existsSync(existing.localPath)) {
    lib.tracks[id] = { ...existing, ...meta, path: songPath }
    saveOfflineLibrary(lib)
    return { localPath: existing.localPath, skipped: true }
  }

  try { fs.mkdirSync(offlineAudioDir, { recursive: true }) } catch {}
  try {
    await downloadFile(url, localPath, (percent) => {
      mainWindow?.webContents.send('offline-download-progress', { id, percent })
    })
  } catch (e) {
    return { error: 'Download failed: ' + e.message }
  }

  lib.tracks[id] = { ...meta, path: songPath, localPath, ext: ext || 'mp3', downloadedAt: Date.now() }
  saveOfflineLibrary(lib)
  return { localPath }
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

ipcMain.handle('scan-library', async (_, folders) => {
  let mm
  try { mm = require('music-metadata') } catch(e) { return { error: 'music-metadata not installed: ' + e.message, tracks: [] } }

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
  // Determine save folder: Music/JuiceWRLD Library
  const libraryFolder = path.join(app.getPath('music'), 'JuiceWRLD Library')
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
