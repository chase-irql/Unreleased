// Copying and saving cover art.
//
// Every cover the app displays is readable from the renderer: the API sends
// Access-Control-Allow-Origin (same as it does for audio — see the CORS notes
// in audioEffects.ts), so a plain fetch() gets the bytes for API covers and
// data:/blob: covers alike.
//
// Saving reuses lib/fileSave's saveFile — the same path track/zip downloads
// already go through, so it honors a user-picked download folder on Android
// (see Settings' "Downloads" section) instead of duplicating that logic here.
// Copying needs its own per-platform split: Android's WebView has no working
// image Clipboard API, so it goes through @capacitor/clipboard instead of
// navigator.clipboard.

import { isAndroidApp } from './androidUpdate'
import { saveFile } from './fileSave'

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
}

interface ClipboardPlugin {
  write(opts: { image?: string; string?: string }): Promise<void>
}

function clipboardPlugin(): ClipboardPlugin | null {
  const cap = (window as unknown as { Capacitor?: { Plugins?: { Clipboard?: ClipboardPlugin } } }).Capacitor
  return cap?.Plugins?.Clipboard ?? null
}

async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Image request failed (${res.status})`)
  const blob = await res.blob()
  if (!blob.size) throw new Error('Image was empty')
  return blob
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image'))
    reader.readAsDataURL(blob)
  })
}

// Both the web Clipboard API and Capacitor's only take PNG reliably — covers
// arrive as JPEG or WebP. Re-encode through a canvas. (Saving keeps the
// original bytes instead, so a saved file isn't bloated by a pointless
// JPEG→PNG round trip.)
async function toPngBlob(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not draw image')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((out) => (out ? resolve(out) : reject(new Error('Could not encode image'))), 'image/png')
  })
}

/** The song title as a filename, with the extension the bytes actually are. */
export function coverFileName(title: string, mime: string): string {
  const base = (title || 'cover')
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'cover'
  return `${base}.${MIME_EXT[mime] ?? 'jpg'}`
}

/** Puts the cover on the clipboard as an image, pasteable into other apps. */
export async function copyCoverImage(url: string): Promise<void> {
  const png = await toPngBlob(await fetchImageBlob(url))
  if (isAndroidApp()) {
    const plugin = clipboardPlugin()
    if (!plugin) throw new Error('Clipboard plugin unavailable')
    await plugin.write({ image: await blobToDataUrl(png) })
    return
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
}

/** Writes the cover to a file — Android's chosen Downloads folder, or a
 *  browser download on the web. */
export async function saveCoverImage(url: string, title: string): Promise<void> {
  const blob = await fetchImageBlob(url)
  await saveFile(coverFileName(title, blob.type), blob)
}
