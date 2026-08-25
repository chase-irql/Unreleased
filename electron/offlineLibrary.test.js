const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { loadOfflineLibraryFile, updateOfflineLibraryFile } = require('./offlineLibrary')

test('download completions merge into the latest offline library index', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unreleased-offline-library-'))
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }))
  const dataPath = path.join(tempDir, 'offline-library.json')

  updateOfflineLibraryFile(dataPath, (library) => {
    library.playlists.favorites = { songIds: ['jw-existing'], name: 'Favorites' }
  })

  const finishDownload = async (id, delay) => {
    await new Promise((resolve) => setTimeout(resolve, delay))
    updateOfflineLibraryFile(dataPath, (library) => {
      library.tracks[id] = { localPath: path.join(tempDir, `${id}.mp3`) }
    })
  }

  await Promise.all([
    finishDownload('jw-first', 20),
    finishDownload('jw-second', 0),
  ])

  const library = loadOfflineLibraryFile(dataPath)
  assert.deepEqual(Object.keys(library.tracks).sort(), ['jw-first', 'jw-second'])
  assert.deepEqual(library.playlists.favorites.songIds, ['jw-existing'])
})
