import { SyncedLyricLine } from '../types'
import { saveFile } from './fileSave'

/**
 * Parse LRC format into timed lines.
 * Handles: [mm:ss.xx] or [mm:ss:xx] timestamps
 */
export function parseLrc(lrc: string): SyncedLyricLine[] {
  const lines: SyncedLyricLine[] = []
  const timeRegex = /\[(\d{1,2}):(\d{2})[.:](\d{2,3})\]/g

  for (const rawLine of lrc.split(/\r?\n/)) {
    const matches = [...rawLine.matchAll(timeRegex)]
    if (matches.length === 0) continue

    const text = rawLine.replace(timeRegex, '').trim()

    for (const match of matches) {
      const min = parseInt(match[1])
      const sec = parseInt(match[2])
      const ms = parseInt(match[3].padEnd(3, '0'))
      lines.push({ time: min * 60 + sec + ms / 1000, text })
    }
  }

  return lines.sort((a, b) => a.time - b.time)
}

/**
 * Check if a string contains LRC timestamps
 */
export function isLrcFormat(text: string): boolean {
  return /\[\d{1,2}:\d{2}[.:]\d{2}/.test(text)
}

/**
 * Find current lyric line index for given time
 */
export function getCurrentLineIndex(lines: SyncedLyricLine[], currentTime: number): number {
  if (lines.length === 0) return -1

  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= currentTime) {
      idx = i
    } else {
      break
    }
  }
  return idx
}

/**
 * Save a synced (LRC) lyrics string as a local .lrc file — a plain client-side
 * Blob save, not a server fetch, since the lyrics text is already in memory
 * (loaded with the track). Goes through lib/fileSave so it actually reaches
 * the Downloads folder on Android too, not just desktop/web.
 */
export function downloadSyncedLyrics(title: string, artist: string, lrcContent: string): void {
  // Strip characters that are invalid in filenames on Windows/macOS.
  const safeName = `${title} - ${artist}`.replace(/[/\\?%*:|"<>]/g, '').trim() || 'lyrics'
  const blob = new Blob([lrcContent], { type: 'text/plain' })
  void saveFile(`${safeName}.lrc`, blob)
}
