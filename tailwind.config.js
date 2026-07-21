/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}', './src/renderer/index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: 'var(--surface)',
          raised: 'var(--surface-raised)',
          overlay: 'var(--surface-overlay)',
          highest: 'var(--surface-highest)',
        },
        sidebar: 'var(--sidebar)',
        titlebar: 'var(--titlebar)',
        accent: {
          DEFAULT: 'rgb(var(--accent-rgb) / <alpha-value>)',
          hover: 'rgb(var(--accent-hover-rgb) / <alpha-value>)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)'
        }
      },
      fontFamily: {
        // Resolves to the user's chosen app font (lib/fonts.ts), written onto
        // <html> by useThemeEffects. index.css seeds the same system stack as
        // the :root default, so first paint matches the old hardcoded value.
        sans: 'var(--font-app)'
      }
    }
  },
  plugins: []
}
