# unreleased

A music player for Juice WRLD — stream the full catalog of released and unreleased songs in your browser, or install the desktop app for local files, offline playback, and Discord integration. Powered by the [Juice WRLD API](https://juicewrldapi.com).

![Version](https://img.shields.io/github/v/release/leanwrldd/unreleased?label=version&color=blue)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-42-47848F?logo=electron&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/jwa)

**▶ Web player:** [player.juicewrldapi.com](https://player.juicewrldapi.com) — installable as a PWA for an app-like, offline-capable experience
**⬇ Desktop app:** [Latest release](https://github.com/leanwrldd/unreleased/releases/latest) — Windows, macOS, Linux

---

## Features

### Browse & discover

- **Tracker** — search the entire catalog (titles, artists, producers), filter by category and era, sort by any column; List, Detailed, and virtualized Grid view modes; collapsible category sidebar with era counts; infinite scroll that stays smooth through thousands of tracks
- **999 FM** — live radio in the WRLD view: real-time metadata over WebSocket, vote to skip, suggest the next song, and preview the upcoming queue — the vote prompt surfaces anywhere in the app, not just on the WRLD page
- **Files** — navigate the API filesystem directly, stream audio, and download files
- **Song info** — full metadata for every track: titles, artists, producers, engineers, era, recording details, dates, and lyrics
- **Bulk edit** — multi-select songs in the Tracker and edit shared fields (era, category, credits, and more) across all of them at once, with per-field replace/add/remove/append/fill/clear
- **Changes feed** — a live stream of recent Tracker edits and comp-file changes, in the optional News tab (enable it in Settings → Appearance → Menu items)
- **Context menus everywhere** — right-click any song, playlist, or the player bar for play, queue, playlist, download, and edit actions

### Playback

- **Gapless playback** — the next track preloads into a second audio slot while the current one plays
- **Radio mode** — 📻 toggle in the player bar plays endless random tracks, pre-fetching the next song and respecting your active category/era filters
- **Queue** — drag to reorder, history and upcoming split, lazy loading for filtered queues
- **Synced lyrics** — karaoke-style highlighting with smooth scrolling, cached per session
- **Fine control** — crossfade (1–12 s), playback speed (0.5×–2× with an optional pitch-shift toggle for nightcore/slowed), sleep timer, and audio output device picker
- **10-band equalizer & effects** — 14 genre presets, L/R balance, mono downmix, skip silence, reverb, and a safety limiter, in a panel you can pop out into its own always-on-top window (`Shift+E`)
- **Last.fm scrobbling** — connect your account in Settings to scrobble what you play, on web or desktop
- **Lock screen support** — Media Session integration shows track info and playback controls on mobile lock screens and notification shades

### Playlists & library

- **Playlists** — Spotify-style hero with 2×2 cover mosaic, custom cover upload, descriptions, drag-to-reorder, and zip-download of all tracks
- **Playlist folders** — organize playlists into folders, including folders within folders
- **Sharing** — share any playlist via public link; anyone can play it without an account
- **Liked songs** — heart in the player bar, synced to your account

### Games & stats

- **Heardle** — name the song from its opening seconds. Daily mode shares one puzzle a day with everyone; Personal replays the same rules on demand; Unlimited is fully configurable (guess count, reveal speed, start point, era/category filters); **1v1** matches you live against another player. Live leaderboards for Today, Streaks, and 1v1. Share your result to the clipboard, Wordle-style
- **Wrapped** — a listening summary built from your play counts, filterable by All time / 30 days / 7 days, with a recent-plays timeline

### Personalization

- **Skins** — 9 built-in looks (including a dynamic "Now Playing" skin that recolors the app to match the current cover art), or build your own in a live color editor and import/export skins as files to share
- **Gradient surfaces** — an optional accent-tinted gradient background behind the app, sidebar, and player
- **Fonts** — 7 selectable typefaces for the app, with a separate one for lyrics; independently adjustable text size for each
- **Configurable layout** — sidebar position, a reorderable and hideable side menu (and account-control row), and fully rebindable keyboard shortcuts (with optional global/OS-wide bindings on desktop)
- **Song personalization** — set a custom name, cover art, and preferred version for any song, and track your own play count for it
- **Report & feedback** — flag an issue with any song, or send general feedback, right from the app

### Accounts & community

- **Discord sign-in** — liked songs and playlists sync to the API across devices
- **Editor tools** — submit song edits (a full form or a streamlined Basic layout) and propose new songs for admin review, link song versions, track proposal status, climb the leaderboard, earn badges
- **Contributor role** — apply to contribute file changes (upload, replace, move, delete, new folders) to the compilation; propose right from the Files browser or a dedicated Contributor page, track status from your Contributor Profile, and withdraw a pending proposal any time
- **Admin & Manager tools** — review song-edit and comp-file proposals (searchable, sortable), reports, and applications; manage albums, versions, and tracklists. Managers share the same review powers as Admins, short of full account/security access

### Desktop app

- **Local library** — point the app at your music folders; it reads tags and cover art, supports synced lyrics, and plays everything alongside the API catalog. Multi-select tracks to bulk-edit their tags
- **Metadata editor** — edit tags, cover art, and plain or line-by-line synced lyrics on your local files
- **Import from URL** — paste a link from YouTube, SoundCloud, Bandcamp, a direct audio file, or ~1800 other sites (via yt-dlp, downloaded on first use) to add it straight to your library
- **Convert format** — transcode local files to MP3, M4A, Opus, OGG, FLAC, or WAV using ffmpeg, downloaded on first use
- **M3U playlists & Import Titles** — import an `.m3u`/`.m3u8`, or a plain-text list of song titles matched against the catalog, into a new local playlist — drag the file onto the app window, or use the Import buttons; export any local playlist back out as M3U
- **Add to Library** — download any API song, or an entire playlist, for offline playback
- **Discord Rich Presence** — show what you're playing (or the 999 FM stream) on your Discord profile with a live progress bar and real cover art, even for matching local files
- **Application menu** — File/Edit/View/Playback/Help, dockable to the title bar or the side menu
- **Mini player & pop-out windows** — Settings, Song info, the editor, the equalizer, and a small always-on-top mini player can float as separate windows
- **System tray** — now-playing info and media controls in the tray menu, with optional minimize-to-tray
- **Download manager** — live progress and speed for every download
- **Auto-updates** — updates install themselves via GitHub releases; join the beta channel with an access code for pre-release builds
- **Maintenance installer** — re-running the installer offers update, version switch, and uninstall, plus a standalone repair tool for when the app won't launch at all

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
- **youtube-dl-exec (yt-dlp)** — URL import
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

See [CHANGELOG.md](./CHANGELOG.md) for the full version history, or [CHANGELOG.web.md](./CHANGELOG.web.md) for changes specific to the web player.

---

## Credits

- **[juicewrldapi.com](https://juicewrldapi.com)** — the API powering everything: song metadata, streaming, lyrics, eras, categories, accounts, and the file browser
- **juicewrldapi** on Discord — for the help and support building the integration
- Built by **freakylatif** — find me on Discord
- Join the **[Discord](https://discord.gg/jwa)** server

---

## License

[MIT](./LICENSE)
