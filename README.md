# unreleased

A music player for Juice WRLD — stream the full catalog of released and unreleased songs in your browser, or install the desktop app for local files, offline playback, and Discord integration. Powered by the [Juice WRLD API](https://juicewrldapi.com).

![Version](https://img.shields.io/badge/version-1.15.0-blue)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-42-47848F?logo=electron&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/jwa)

**▶ Web player:** [player.juicewrldapi.com](https://player.juicewrldapi.com)
**⬇ Desktop app:** [Latest release](https://github.com/leanwrldd/unreleased/releases/latest) — Windows, macOS, Linux

---

## Features

### Browse & discover

- **Tracker** — search the entire catalog (titles, artists, producers), filter by category and era, sort by any column; collapsible category sidebar with era counts; infinite scroll with virtualized lists that stay smooth through thousands of tracks
- **999 FM** — live radio in the WRLD view: real-time metadata over WebSocket, vote to skip, suggest the next song, and preview the upcoming queue
- **Compilation** — Studio Albums & Mixtapes, Unreleased, and Singles laid out as album art grids
- **Files** — navigate the API filesystem directly, stream audio, and download files
- **Song info** — full metadata for every track: titles, artists, producers, engineers, era, recording details, dates, and lyrics
- **Context menus everywhere** — right-click any song, playlist, or the player bar for play, queue, playlist, download, and edit actions

### Playback

- **Gapless playback** — the next track preloads into a second audio slot while the current one plays
- **Radio mode** — 📻 toggle in the player bar plays endless random tracks, pre-fetching the next song and respecting your active category/era filters
- **Queue** — drag to reorder, history and upcoming split, lazy loading for filtered queues
- **Synced lyrics** — karaoke-style highlighting with smooth scrolling, cached per session
- **Fine control** — crossfade (1–12 s), playback speed (0.5×–2×), sleep timer, and audio output device picker
- **Lock screen support** — Media Session integration shows track info and playback controls on mobile lock screens and notification shades

### Playlists & library

- **Playlists** — Spotify-style hero with 2×2 cover mosaic, custom cover upload, descriptions, drag-to-reorder, and zip-download of all tracks
- **Sharing** — share any playlist via public link; anyone can play it without an account
- **Liked songs** — heart in the player bar, synced to your account

### Accounts & community

- **Discord sign-in** — liked songs and playlists sync to the API across devices
- **Editor tools** — submit song edits and propose new songs for admin review, track proposal status, climb the leaderboard, earn badges
- **Admin tools** — review proposals and manage albums, versions, and tracklists

### Desktop app

- **Local library** — point the app at your music folders; it reads tags and cover art, supports synced lyrics, and plays everything alongside the API catalog
- **Metadata editor** — edit tags, cover art, and plain or synced lyrics on your local files
- **Add to Library** — download any API song for offline playback
- **Discord Rich Presence** — show what you're playing (or the 999 FM stream) on your Discord profile with a live progress bar
- **System tray** — now-playing info and media controls in the tray menu, with optional minimize-to-tray
- **Download manager** — live progress and speed for every download
- **Auto-updates** — updates install themselves via GitHub releases; join the beta channel with an access code for pre-release builds
- **Maintenance installer** — re-running the installer offers update, version switch, and uninstall

---

## Download

| Platform | File |
|----------|------|
| Windows | `Unreleased-Setup-x.x.x.exe` (full) or `Unreleased-Setup.exe` (web installer) |
| macOS | `.dmg` — Apple Silicon and Intel |
| Linux | `.AppImage` |

All builds are on the [releases page](https://github.com/leanwrldd/unreleased/releases). Or skip the install entirely and use the [web player](https://player.juicewrldapi.com).

---

## Stack

- **React 18** + **TypeScript 5** — UI
- **Vite 6** — dev server and bundler
- **Zustand** — state management
- **Tailwind CSS** + **lucide-react** — styling and icons
- **Electron 42** + **electron-builder** + **electron-updater** — desktop app, packaging, auto-updates
- **music-metadata** / **node-id3** — local file tag reading and editing
- **[juicewrldapi.com](https://juicewrldapi.com)** — songs, streaming, lyrics, eras, playlists, auth

---

## Development

```bash
# Install dependencies
npm install

# Web dev server (http://localhost:3018)
npm run dev

# Desktop app in dev mode (Vite + Electron)
npm run electron:dev

# Type-check + production build → dist/
npm run build

# Package the desktop app → release/
npm run electron:build
```

### Branches

- **`app`** — desktop/Electron source of truth; all development happens here
- **`web`** — deployed web build, served directly at [player.juicewrldapi.com](https://player.juicewrldapi.com); synced from `app` on release

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for the full version history.

---

## Credits

- **[juicewrldapi.com](https://juicewrldapi.com)** — the API powering everything: song metadata, streaming, lyrics, eras, categories, accounts, and the file browser
- **juicewrldapi** on Discord — for the help and support building the integration
- Built by **freakylatif** — find me on Discord
- Join the **[Discord](https://discord.gg/jwa)** server

---

## License

[MIT](./package.json)
