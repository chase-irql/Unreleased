import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { readFileSync } from 'fs'

// package.json's own "version" isn't kept current on this branch —
// scripts/python/release_ios.py only bumps ios/App/App.xcodeproj/
// project.pbxproj's MARKETING_VERSION, so reading pkg.version here would show
// a stale desktop-era number in things like feedback reports.
// MARKETING_VERSION is the one source of truth the release script actually
// updates.
const pbxproj = readFileSync(resolve(__dirname, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf-8')
const marketingVersionMatch = pbxproj.match(/MARKETING_VERSION\s*=\s*([^;]+);/)
if (!marketingVersionMatch) throw new Error('Could not find MARKETING_VERSION in ios/App/App.xcodeproj/project.pbxproj')
const appVersion = marketingVersionMatch[1].trim()

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/renderer'),
  envDir: resolve(__dirname, '.'),
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port: 3018,
    strictPort: true,
    host: true,
    allowedHosts: ['.juicewrldapi.com', 'player.juicewrldapi.com', 'localhost', '127.0.0.1'],
  },
  preview: {
    port: 3018,
    strictPort: true,
    host: true,
    allowedHosts: ['.juicewrldapi.com', 'player.juicewrldapi.com', 'localhost', '127.0.0.1'],
  },
})
