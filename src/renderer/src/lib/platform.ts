// Shared platform / environment detection. One source of truth so the audio
// code (background-audio guard) and the PWA install prompt agree on what "iOS"
// means, etc.

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''

// iOS / iPadOS — every browser there is WebKit. iPadOS 13+ reports a desktop
// ("MacIntel") UA, so the touch-point check is what distinguishes it from a
// real Mac (Electron desktop = MacIntel, 0 touch points → NOT flagged).
export const IS_IOS =
  typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1))

export const IS_ANDROID = /Android/i.test(ua)

// Coarse "is this a phone/tablet" check — used to gate mobile-only UI.
export const IS_MOBILE = IS_IOS || IS_ANDROID

// Running inside the Electron desktop shell (it injects window.electron).
export const IS_ELECTRON =
  typeof window !== 'undefined' &&
  !!(window as unknown as { electron?: unknown }).electron

// True when the page is running as an installed PWA (launched from the home
// screen / app icon) rather than in a browser tab.
export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari's non-standard flag for home-screen apps.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}
