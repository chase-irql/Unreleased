# unreleased — Android

A sideloaded Android build of the Juice WRLD music player — the same catalog, streaming, and most of the features from the web player and desktop app, wrapped natively with [Capacitor](https://capacitorjs.com). Powered by the [Juice WRLD API](https://juicewrldapi.com).

> Not on the Play Store — this app ships `unreleased`-catalog content, so it's distributed as a direct APK download instead. It's built from the same shared UI as the [`app`](https://github.com/leanwrldd/unreleased/tree/app) (desktop) and [`web`](https://github.com/leanwrldd/unreleased/tree/web) branches — see `app`'s README for the full web + desktop feature list.

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Capacitor](https://img.shields.io/badge/Capacitor-native-119EFF?logo=capacitor&logoColor=white)
![Android](https://img.shields.io/badge/Android-7.0%2B-3DDC84?logo=android&logoColor=white)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/jwa)

**⬇ Get the app:** [Android releases](https://github.com/leanwrldd/unreleased/releases?q=android-v&expanded=true) — grab the newest `Unreleased-android-v*.apk`

---

## Install

1. Download the APK from the [releases page](https://github.com/leanwrldd/unreleased/releases?q=android-v&expanded=true) (filter by `android-v*` tags — the app also checks for updates itself once installed, see below).
2. Open it. Android will ask for permission to install from this source the first time — the app walks you to that setting itself if it isn't already granted.
3. Requires **Android 7.0 (API 24)** or newer.

Android releases are marked "pre-release" on GitHub on purpose, so the desktop app's auto-updater (which shares the same repo) never mistakes one for the newest desktop build.

---

## Features

Everything from the web player carries over — Tracker, 999 FM, playlists (including Follow), Heardle/Wordle/Wrapped, skins & fonts, Editor/Contributor/Admin tools, and more. A few things work differently (or better) here than on the web:

- **Local library** — pick a folder via Android's Storage Access Framework; the app scans and plays your own files alongside the API catalog
- **Offline downloads** — download API songs or whole playlists for offline playback
- **Save to Downloads** — playlist ZIPs and lyric exports save straight to your device's Downloads folder
- **Lock screen & notification controls** — track info and playback controls via Android's media notification
- **In-app self-update** — being sideloaded, the app checks GitHub for the newest `android-v*` release itself and hands it to the system installer, instead of relying on a store
- **Back button** — minimizes the app instead of closing it, so playback keeps going in the background

Desktop-only features **not** available here: format conversion, importing from YouTube/URLs, M3U import/export, Discord Rich Presence, and local metadata (tag) editing.

---

## Development

Requires the Android SDK and a JDK — Android Studio's bundled toolchain covers both. Open the `android/` folder there if you want a full IDE, or work from the CLI:

```bash
# Install dependencies
npm install

# Web dev server (shared with the web/desktop UI) — http://localhost:3018
npm run dev

# Build the web bundle and sync it into the Android project
npm run android:sync

# Sync + assemble a debug APK via Gradle
npm run android:apk

# Build, boot/find a device or emulator, install, and launch — start to finish
npm run android:deploy
```

---

## Stack

- **React 18** + **TypeScript 5** — same UI as web/desktop
- **Vite 6** — dev server and bundler
- **Capacitor** — native Android wrapper around the web build
- Custom native plugins (`android/app/src/main/java/com/juicewrldapi/player`) — local library access (SAF), offline storage, saving to Downloads, and APK self-update
- **[juicewrldapi.com](https://juicewrldapi.com)** — songs, streaming, lyrics, eras, playlists, auth

---

## Changelog

This branch's own `CHANGELOG.md` doesn't track Android-specific changes separately and predates most of the shared UI's recent history — see [CHANGELOG.md](https://github.com/leanwrldd/unreleased/blob/app/CHANGELOG.md) on the `app` branch for the full, current version history.

---

## Credits

- **[juicewrldapi.com](https://juicewrldapi.com)** — the API powering everything: song metadata, streaming, lyrics, eras, categories, accounts, and the file browser
- **juicewrldapi** on Discord — for the help and support building the integration
- Built by **freakylatif** — find me on Discord
- Join the **[Discord](https://discord.gg/jwa)** server

---

## License

MIT
