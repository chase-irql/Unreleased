// Skin registry — the single source of truth for every selectable look.
// Each skin owns the full CSS-variable palette that index.css establishes for
// the classic light/dark themes; App.tsx writes `vars` onto <html> whenever
// the active skin changes (inline vars win over the :root/.dark fallbacks,
// which remain only for first paint before React mounts). Adding a skin here
// is all it takes for it to show up in Settings → Appearance.

export type SkinId =
  | 'light'
  | 'dark'
  | 'midnight'
  | 'ocean'
  | 'ember'
  | 'mocha'
  | 'forest'
  | 'blossom'

export interface Skin {
  id: SkinId
  name: string
  // Whether the `.dark` class goes on <html> — drives Tailwind `dark:`
  // variants and the CSS `color-scheme` (native controls, scrollbars).
  dark: boolean
  // Signature accent applied via setAccentColor when the skin is picked.
  // The classic light/dark skins leave it unset so switching between them
  // keeps whatever accent the user already chose.
  accent?: string
  vars: {
    '--surface': string
    '--surface-raised': string
    '--surface-overlay': string
    '--surface-highest': string
    '--sidebar': string
    '--titlebar': string
    '--text-primary': string
    '--text-secondary': string
    '--text-muted': string
    '--border': string
    '--scrollbar': string
  }
}

export const SKINS: Skin[] = [
  {
    id: 'light',
    name: 'Light',
    dark: false,
    vars: {
      '--surface': '#ffffff',
      '--surface-raised': '#f5f5f5',
      '--surface-overlay': '#ebebeb',
      '--surface-highest': '#e0e0e0',
      '--sidebar': '#f0f0f0',
      '--titlebar': '#e8e8e8',
      '--text-primary': '#121212',
      '--text-secondary': '#535353',
      '--text-muted': '#6b6b6b',
      '--border': 'rgba(0, 0, 0, 0.08)',
      '--scrollbar': '#cccccc',
    },
  },
  {
    id: 'dark',
    name: 'Dark',
    dark: true,
    vars: {
      '--surface': '#121212',
      '--surface-raised': '#1a1a1a',
      '--surface-overlay': '#242424',
      '--surface-highest': '#2a2a2a',
      '--sidebar': '#000000',
      '--titlebar': '#000000',
      '--text-primary': '#ffffff',
      '--text-secondary': '#b3b3b3',
      '--text-muted': '#6b6b6b',
      '--border': 'rgba(255, 255, 255, 0.08)',
      '--scrollbar': '#404040',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    dark: true,
    accent: '#f43f5e',
    vars: {
      '--surface': '#000000',
      '--surface-raised': '#0b0b0b',
      '--surface-overlay': '#161616',
      '--surface-highest': '#1f1f1f',
      '--sidebar': '#000000',
      '--titlebar': '#000000',
      '--text-primary': '#ffffff',
      '--text-secondary': '#a3a3a3',
      '--text-muted': '#636363',
      '--border': 'rgba(255, 255, 255, 0.1)',
      '--scrollbar': '#333333',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    dark: true,
    accent: '#38bdf8',
    vars: {
      '--surface': '#0c1425',
      '--surface-raised': '#121d33',
      '--surface-overlay': '#1b2a49',
      '--surface-highest': '#24365c',
      '--sidebar': '#060b16',
      '--titlebar': '#060b16',
      '--text-primary': '#e8eefc',
      '--text-secondary': '#9fb3d1',
      '--text-muted': '#64748b',
      '--border': 'rgba(148, 163, 184, 0.14)',
      '--scrollbar': '#2b3d5f',
    },
  },
  {
    id: 'ember',
    name: 'Ember',
    dark: true,
    accent: '#f97316',
    vars: {
      '--surface': '#1c1210',
      '--surface-raised': '#251a16',
      '--surface-overlay': '#31221c',
      '--surface-highest': '#3d2a22',
      '--sidebar': '#140c0a',
      '--titlebar': '#140c0a',
      '--text-primary': '#fdf2ec',
      '--text-secondary': '#d3b8a8',
      '--text-muted': '#8a6f61',
      '--border': 'rgba(255, 180, 120, 0.12)',
      '--scrollbar': '#4a352b',
    },
  },
  {
    id: 'mocha',
    name: 'Mocha',
    dark: true,
    accent: '#cba6f7',
    vars: {
      '--surface': '#1e1e2e',
      '--surface-raised': '#26263a',
      '--surface-overlay': '#313244',
      '--surface-highest': '#3b3b54',
      '--sidebar': '#161623',
      '--titlebar': '#161623',
      '--text-primary': '#cdd6f4',
      '--text-secondary': '#a6adc8',
      '--text-muted': '#6c7086',
      '--border': 'rgba(205, 214, 244, 0.1)',
      '--scrollbar': '#45475a',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    dark: true,
    accent: '#10b981',
    vars: {
      '--surface': '#0e1613',
      '--surface-raised': '#14201b',
      '--surface-overlay': '#1b2b24',
      '--surface-highest': '#23372e',
      '--sidebar': '#0a110e',
      '--titlebar': '#0a110e',
      '--text-primary': '#e7f3ec',
      '--text-secondary': '#a8c3b4',
      '--text-muted': '#64796d',
      '--border': 'rgba(167, 243, 208, 0.1)',
      '--scrollbar': '#2c4437',
    },
  },
  {
    id: 'blossom',
    name: 'Blossom',
    dark: false,
    accent: '#ec4899',
    vars: {
      '--surface': '#fdf3f6',
      '--surface-raised': '#f9e8ee',
      '--surface-overlay': '#f3dce5',
      '--surface-highest': '#eccfdb',
      '--sidebar': '#f7e5eb',
      '--titlebar': '#f3dee6',
      '--text-primary': '#3b1226',
      '--text-secondary': '#815b6b',
      '--text-muted': '#a17f8d',
      '--border': 'rgba(190, 24, 93, 0.12)',
      '--scrollbar': '#e3bfcd',
    },
  },
]

// Fallback to classic dark for unknown ids (e.g. a persisted value from a
// build where a skin was renamed/removed).
export function getSkin(id: string | null | undefined): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[1]
}
