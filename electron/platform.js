const LINUX_DESKTOP_NAME = 'com.juicewrldapi.player.desktop'

/**
 * @typedef {{
 *   hasSwitch: (name: string) => boolean,
 *   getSwitchValue: (name: string) => string
 * }} ReadCommandLine
 */

/** @param {ReadCommandLine | undefined} commandLine @param {string} name */
function normalizedSwitchValue(commandLine, name) {
  if (!commandLine?.hasSwitch?.(name)) return ''
  return String(commandLine.getSwitchValue(name) || '').trim().toLowerCase()
}

/**
 * Resolve the display backend Electron will most likely use. An explicit
 * Chromium switch always wins over session environment variables so users can
 * reliably force XWayland from a Wayland session (or native Wayland from X11).
 * @param {{ platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv, commandLine?: ReadCommandLine }} [options]
 */
function detectDisplayServer({ platform = process.platform, env = process.env, commandLine } = {}) {
  if (platform === 'win32') return 'windows'
  if (platform === 'darwin') return 'macos'
  if (platform !== 'linux') return 'unknown'

  const requested = normalizedSwitchValue(commandLine, 'ozone-platform')
  const hint = normalizedSwitchValue(commandLine, 'ozone-platform-hint')
  for (const value of [requested, hint]) {
    if (value === 'wayland') return 'wayland'
    if (value === 'x11' || value === 'xwayland') return 'x11'
  }

  const sessionType = String(env.XDG_SESSION_TYPE || '').trim().toLowerCase()
  // XDG_SESSION_TYPE is authoritative when present. Only fall back to socket
  // variables for compositors/sessions that do not publish it.
  if (sessionType === 'wayland') return 'wayland'
  if (sessionType === 'x11') return 'x11'
  if (env.WAYLAND_DISPLAY) return 'wayland'
  if (env.DISPLAY) return 'x11'
  return 'unknown'
}

/**
 * Add one Chromium feature without discarding features supplied by the user.
 * @param {ReadCommandLine & { appendSwitch: (name: string, value?: string) => void }} commandLine
 * @param {string} name
 * @param {string} value
 */
function appendCommaSeparatedSwitch(commandLine, name, value) {
  const current = commandLine.hasSwitch(name)
    ? String(commandLine.getSwitchValue(name) || '')
    : ''
  const values = current.split(',').map((item) => item.trim()).filter(Boolean)
  if (!values.some((item) => item.toLowerCase() === value.toLowerCase())) values.push(value)
  commandLine.appendSwitch(name, values.join(','))
}

/**
 * Configure Linux before Electron's ready event. The returned object is kept
 * by main.js for window-manager-safe behavior and diagnostics.
 * @param {{
 *   commandLine: ReadCommandLine & { appendSwitch: (name: string, value?: string) => void },
 *   setDesktopName?: (name: string) => void
 * }} app
 * @param {{ platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv }} [options]
 */
function configureRuntime(app, { platform = process.platform, env = process.env } = {}) {
  if (platform !== 'linux') {
    return Object.freeze({ platform, displayServer: detectDisplayServer({ platform, env, commandLine: app.commandLine }), nativeWayland: false, desktopName: null })
  }

  // This must match the packaged .desktop filename. Besides correct launcher
  // grouping, Electron 42 uses it as the xdg-desktop-portal identity for
  // global shortcuts on native Wayland.
  app.setDesktopName?.(LINUX_DESKTOP_NAME)

  // Do not replace an explicit --ozone-platform/--ozone-platform-hint. This
  // lets users select native Wayland or XWayland when compositor behavior or
  // graphics drivers make one a better fit.
  if (!app.commandLine.hasSwitch('ozone-platform') && !app.commandLine.hasSwitch('ozone-platform-hint')) {
    app.commandLine.appendSwitch('ozone-platform-hint', 'auto')
  }

  const displayServer = detectDisplayServer({ platform, env, commandLine: app.commandLine })
  if (displayServer === 'wayland') {
    // Vulkan plus native Ozone/Wayland crash-loops on some drivers. Keep the
    // workaround scoped to Wayland so X11 users retain Vulkan acceleration.
    appendCommaSeparatedSwitch(app.commandLine, 'disable-features', 'Vulkan')
  }

  return Object.freeze({ platform, displayServer, nativeWayland: displayServer === 'wayland', desktopName: LINUX_DESKTOP_NAME })
}

module.exports = {
  LINUX_DESKTOP_NAME,
  appendCommaSeparatedSwitch,
  configureRuntime,
  detectDisplayServer,
}
