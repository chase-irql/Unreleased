const fs = require('fs')

/** @typedef {{ tracks: Record<string, any>, playlists: Record<string, any> }} OfflineLibrary */

/**
 * @param {string} dataPath
 * @returns {OfflineLibrary}
 */
function loadOfflineLibraryFile(dataPath) {
  try {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
    return { tracks: data.tracks || {}, playlists: data.playlists || {} }
  } catch {
    return { tracks: {}, playlists: {} }
  }
}

/**
 * Reload and mutate the offline index without yielding to the event loop.
 * Async work must finish before calling this function so every writer starts
 * from the latest version on disk instead of saving a stale pre-await copy.
 *
 * @param {string} dataPath
 * @param {(library: OfflineLibrary) => void} mutate
 * @param {(error: unknown) => void} [onSaveError]
 * @returns {OfflineLibrary}
 */
function updateOfflineLibraryFile(dataPath, mutate, onSaveError) {
  const library = loadOfflineLibraryFile(dataPath)
  mutate(library)
  try {
    fs.writeFileSync(dataPath, JSON.stringify(library))
  } catch (error) {
    onSaveError?.(error)
  }
  return library
}

module.exports = { loadOfflineLibraryFile, updateOfflineLibraryFile }
