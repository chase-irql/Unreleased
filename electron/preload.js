const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  // Window controls
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  forceUpdate:     () => ipcRenderer.invoke('force-update'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow:    () => ipcRenderer.invoke('close-window'),
  isMaximized:    () => ipcRenderer.invoke('is-maximized'),
  setFullscreen:  (value) => ipcRenderer.invoke('set-fullscreen', value),
  isFullscreen:   ()      => ipcRenderer.invoke('is-fullscreen'),
  onFullscreenChange: (cb) => {
    const fn = (_, v) => cb(v)
    ipcRenderer.on('fullscreen-changed', fn)
    return () => ipcRenderer.removeListener('fullscreen-changed', fn)
  },
  platform: process.platform,

  // Local filesystem
  browseLocal: (dirPath) => ipcRenderer.invoke('browse-local', dirPath),
  pickFolder:  ()        => ipcRenderer.invoke('pick-folder'),
  openPath:    (p)       => ipcRenderer.invoke('open-path', p),
  selectImageFile: ()    => ipcRenderer.invoke('select-image-file'),
  openDiscordLogin: (url) => ipcRenderer.invoke('open-discord-login', url),

  // App settings
  getAppSettings:  ()           => ipcRenderer.invoke('get-app-settings'),
  setAppSetting:   (key, value) => ipcRenderer.invoke('set-app-setting', key, value),

  // Run/crash logging — fire-and-forget breadcrumbs into the run log
  runLog:        (scope, message) => ipcRenderer.send('run-log', scope, message),
  openLogsFolder: ()             => ipcRenderer.invoke('open-logs-folder'),
  getLogPaths:   ()              => ipcRenderer.invoke('get-log-paths'),

  // Tray — playback state up to main, media commands back down
  setTrayPlayback: (state) => ipcRenderer.send('tray-playback-state', state),
  onTrayCommand: (cb) => {
    const fn = (_, cmd) => cb(cmd)
    ipcRenderer.on('tray-command', fn)
    return () => ipcRenderer.removeListener('tray-command', fn)
  },

  // Discord Rich Presence
  discordRpcSetActivity: (activity) => ipcRenderer.invoke('discord-rpc-set-activity', activity),
  discordRpcClearActivity: ()       => ipcRenderer.invoke('discord-rpc-clear-activity'),

  // Library
  loadLibraryData:    ()              => ipcRenderer.invoke('load-library-data'),
  saveLibraryData:    (data)          => ipcRenderer.invoke('save-library-data', data),
  scanLibrary:        (folders, previousTracks) => ipcRenderer.invoke('scan-library', folders, previousTracks),
  readAlbumArt:       (filePath, maxSize) => ipcRenderer.invoke('read-album-art', filePath, maxSize),
  readTrackMetadata:  (filePath)      => ipcRenderer.invoke('read-track-metadata', filePath),
  writeTrackMetadata: (filePath, meta) => ipcRenderer.invoke('write-track-metadata', filePath, meta),

  // Local playlists
  loadLocalPlaylists: ()          => ipcRenderer.invoke('load-local-playlists'),
  saveLocalPlaylists: (playlists) => ipcRenderer.invoke('save-local-playlists', playlists),

  // Offline playlist sync
  offlineGetLibrary:    ()                        => ipcRenderer.invoke('offline-get-library'),
  offlineGetStats:      ()                        => ipcRenderer.invoke('offline-get-stats'),
  offlineDownloadTrack: (payload)                  => ipcRenderer.invoke('offline-download-track', payload),
  offlineRemoveTrack:   (id)                       => ipcRenderer.invoke('offline-remove-track', id),
  offlineSetPlaylist:   (key, songIds, name)        => ipcRenderer.invoke('offline-set-playlist', key, songIds, name),
  offlineRemovePlaylist: (key)                     => ipcRenderer.invoke('offline-remove-playlist', key),
  offlineSetLibraryPath: (newPath)                 => ipcRenderer.invoke('offline-set-library-path', newPath),
  onOfflineDownloadProgress: (cb) => {
    const fn = (_, d) => cb(d)
    ipcRenderer.on('offline-download-progress', fn)
    return () => ipcRenderer.removeListener('offline-download-progress', fn)
  },

  // WrldData (albums JSON)
  loadWrldData: ()       => ipcRenderer.invoke('load-wrlddata'),
  saveWrldData: (data)   => ipcRenderer.invoke('save-wrlddata', data),

  // Update status events (returns cleanup fn)
  onUpdateStatus: (cb) => {
    const fn = (_, d) => cb(d)
    ipcRenderer.on('update-status', fn)
    return () => ipcRenderer.removeListener('update-status', fn)
  },

  // Download events (returns cleanup fn)
  onDownloadStarted: (cb) => {
    const fn = (_, d) => cb(d)
    ipcRenderer.on('download-started', fn)
    return () => ipcRenderer.removeListener('download-started', fn)
  },
  onDownloadProgress: (cb) => {
    const fn = (_, d) => cb(d)
    ipcRenderer.on('download-progress', fn)
    return () => ipcRenderer.removeListener('download-progress', fn)
  },
  onDownloadDone: (cb) => {
    const fn = (_, d) => cb(d)
    ipcRenderer.on('download-done', fn)
    return () => ipcRenderer.removeListener('download-done', fn)
  },
})
