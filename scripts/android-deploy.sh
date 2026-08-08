#!/usr/bin/env bash
# Build the web app, sync it into the Android project, compile the debug APK,
# then (unless --skip-install) install it on whatever device/emulator adb
# sees and launch it. Run this after any code change you want to check on
# the emulator — a build alone isn't enough (Gradle happily bundles a stale
# `android/app/src/main/assets/public` if `cap sync` didn't run first), and
# `gradlew` needs the `./` prefix under Git Bash or it won't be found in the
# current directory.
#
# --skip-install: stop after compiling the APK. For contexts with no
# device/emulator attached (e.g. release_android.py running unattended) —
# without this flag, a missing device fails the whole script since adb
# commands are not optional steps.
set -euo pipefail
cd "$(dirname "$0")/.."

SKIP_INSTALL=0
for arg in "$@"; do
  case "$arg" in
    --skip-install) SKIP_INSTALL=1 ;;
  esac
done

echo "==> Building web app"
npm run build

echo "==> Syncing into Android project"
npx cap sync android

echo "==> Compiling debug APK"
(cd android && ./gradlew.bat assembleDebug)

if [ "$SKIP_INSTALL" -eq 1 ]; then
  echo "Done (--skip-install: not installed or launched)."
  exit 0
fi

# adb usually isn't on PATH in Git Bash even when it's on Windows PATH —
# fall back to the standard Android SDK location if the bare command is missing.
ADB=adb
if ! command -v adb >/dev/null 2>&1; then
  ADB="$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
fi

APK="android/app/build/outputs/apk/debug/app-debug.apk"

echo "==> Installing on device"
"$ADB" install -r "$APK"

echo "==> Launching"
"$ADB" shell am start -n com.juicewrldapi.player/.MainActivity

echo "Done."
