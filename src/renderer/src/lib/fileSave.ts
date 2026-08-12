// Saves a Blob the user asked to "download" — a playlist ZIP, a synced-
// lyrics export, a bulk track — to wherever that means on the current
// platform.
//
// Desktop/web: a plain `<a download>` click on a blob: URL, same as it's
// always been. Android: that technique silently no-ops in this WebView (it
// isn't a real browser and doesn't wire `download` up to an actual save), so
// every download in the app quietly did nothing there — this routes through
// DownloadsPlugin.java instead, which writes into the real Downloads folder.

import { isAndroidApp } from './androidUpdate'

interface DownloadsPlugin {
  save(opts: { filename: string; base64: string; mimeType: string }): Promise<{ filename: string }>
}

function androidPlugin(): DownloadsPlugin | null {
  const cap = (window as unknown as { Capacitor?: { Plugins?: { Downloads?: DownloadsPlugin } } }).Capacitor
  return cap?.Plugins?.Downloads ?? null
}

/** Blob → base64 payload (no data: URI prefix), off the main-thread-blocking
 *  path — FileReader is async even though the blob is already in memory. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // "data:<mime>;base64,<payload>" — only the payload goes over the bridge.
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Saves `blob` as `filename`. Resolves once the save has actually happened —
 *  callers that show a "Saved" state should wait for this, not fire-and-forget. */
export async function saveFile(filename: string, blob: Blob): Promise<void> {
  if (isAndroidApp()) {
    const plugin = androidPlugin()
    if (!plugin) throw new Error('Downloads plugin unavailable')
    const base64 = await blobToBase64(blob)
    await plugin.save({ filename, base64, mimeType: blob.type || 'application/octet-stream' })
    return
  }
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}
