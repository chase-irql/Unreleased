// Shared platform / environment detection. One source of truth for the audio
// code's background-playback guard and anything else that has to fork on the
// host WebView.

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''

// iOS / iPadOS — every browser there is WebKit. Always false in the Android
// wrap; kept because the renderer is still shared with the iOS WebView build.
export const IS_IOS =
  typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1))

export const IS_ANDROID = /Android/i.test(ua)

// Coarse "is this a phone/tablet" check — used to gate mobile-only behavior
// (the audio effects chain's lazy-attach; see audioEffects.ts).
export const IS_MOBILE = IS_IOS || IS_ANDROID

/** Runs `fn` once the browser is idle, or after `timeoutMs` at the latest.
 *  Returns a canceller.
 *
 *  For background warm-up work only. Anything scheduled here gives up its
 *  slice of the startup network/CPU budget to whatever the user is actually
 *  looking at — the point is that a prefetch must never race the visible
 *  view's own first request. requestIdleCallback isn't in Safari <16.4, hence
 *  the timeout fallback. */
export function runWhenIdle(fn: () => void, timeoutMs = 2000): () => void {
  const w = window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    cancelIdleCallback?: (id: number) => void
  }
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout: timeoutMs })
    return () => w.cancelIdleCallback?.(id)
  }
  const id = window.setTimeout(fn, timeoutMs)
  return () => clearTimeout(id)
}
