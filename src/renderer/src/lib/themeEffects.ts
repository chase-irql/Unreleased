import { useEffect } from 'react'
import { useStorePick } from '../store/useStore'
import { getSkin } from './skins'

function hexToRgb(hex: string): [number, number, number] {
  const num = parseInt(hex.replace('#', ''), 16)
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff]
}

function lightenHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `#${Math.min(255, r + amount).toString(16).padStart(2, '0')}${Math.min(255, g + amount).toString(16).padStart(2, '0')}${Math.min(255, b + amount).toString(16).padStart(2, '0')}`
}

// Applies the active skin's CSS variables and the accent-color variables to
// <html>. Shared by App and the pop-out window shell (FloatApp) so a floating
// window restyles itself exactly like the main one.
export function useThemeEffects(): void {
  const { theme, accentColor } = useStorePick('theme', 'accentColor')

  useEffect(() => {
    const skin = getSkin(theme)
    const root = document.documentElement
    // `.dark` still drives Tailwind dark: variants and color-scheme; the
    // palette itself comes from the skin's vars (inline styles override the
    // :root/.dark fallback blocks in index.css). Every skin sets the same
    // set of keys, so switching skins never leaves stale values behind.
    root.classList.toggle('dark', skin.dark)
    for (const [key, value] of Object.entries(skin.vars)) root.style.setProperty(key, value)
  }, [theme])

  useEffect(() => {
    const [r, g, b] = hexToRgb(accentColor)
    const hover = lightenHex(accentColor, 20)
    const [hr, hg, hb] = hexToRgb(hover)
    document.documentElement.style.setProperty('--accent', accentColor)
    document.documentElement.style.setProperty('--accent-rgb', `${r} ${g} ${b}`)
    document.documentElement.style.setProperty('--accent-hover', hover)
    document.documentElement.style.setProperty('--accent-hover-rgb', `${hr} ${hg} ${hb}`)
  }, [accentColor])
}
