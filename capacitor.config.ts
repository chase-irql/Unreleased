import type { CapacitorConfig } from '@capacitor/cli'

// Android wrap of the web build (see also electron/ for desktop). The webview
// serves dist/ from https://localhost, which juicewrldapi.com's wildcard CORS
// already permits — the same invariant the EQ chain needs (crossorigin
// anonymous audio), so don't swap androidScheme without rechecking audio.
const config: CapacitorConfig = {
  appId: 'com.juicewrldapi.player',
  appName: 'Unreleased',
  webDir: 'dist',
  android: {
    // The renderer is one bundle for web/desktop/mobile; nothing here should
    // fork it. Platform checks in-app use Capacitor's injected globals.
    allowMixedContent: false,
  },
}

export default config
