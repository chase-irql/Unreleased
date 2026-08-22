const assert = require('node:assert/strict')
const test = require('node:test')
const {
  LINUX_DESKTOP_NAME,
  appendCommaSeparatedSwitch,
  configureRuntime,
  detectDisplayServer,
} = require('./platform')

function fakeCommandLine(initial = {}) {
  const switches = new Map(Object.entries(initial))
  return {
    appendSwitch(name, value = '') { switches.set(name, String(value)) },
    getSwitchValue(name) { return switches.get(name) || '' },
    hasSwitch(name) { return switches.has(name) },
    switches,
  }
}

test('detects Windows without consulting Linux session variables', () => {
  assert.equal(detectDisplayServer({ platform: 'win32', env: { XDG_SESSION_TYPE: 'wayland' } }), 'windows')
})

test('explicit Ozone backend overrides the desktop session', () => {
  assert.equal(detectDisplayServer({
    platform: 'linux',
    env: { XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-1' },
    commandLine: fakeCommandLine({ 'ozone-platform': 'x11' }),
  }), 'x11')
  assert.equal(detectDisplayServer({
    platform: 'linux',
    env: { XDG_SESSION_TYPE: 'x11', DISPLAY: ':0' },
    commandLine: fakeCommandLine({ 'ozone-platform': 'wayland' }),
  }), 'wayland')
})

test('detects Wayland and X11 from their session environments', () => {
  assert.equal(detectDisplayServer({ platform: 'linux', env: { WAYLAND_DISPLAY: 'wayland-0' }, commandLine: fakeCommandLine() }), 'wayland')
  assert.equal(detectDisplayServer({ platform: 'linux', env: { DISPLAY: ':99' }, commandLine: fakeCommandLine() }), 'x11')
  assert.equal(detectDisplayServer({
    platform: 'linux', env: { XDG_SESSION_TYPE: 'x11', WAYLAND_DISPLAY: 'stale', DISPLAY: ':0' }, commandLine: fakeCommandLine(),
  }), 'x11')
})

test('comma-separated switches preserve user values and avoid duplicates', () => {
  const commandLine = fakeCommandLine({ 'disable-features': 'Foo,Bar' })
  appendCommaSeparatedSwitch(commandLine, 'disable-features', 'Vulkan')
  appendCommaSeparatedSwitch(commandLine, 'disable-features', 'vulkan')
  assert.equal(commandLine.getSwitchValue('disable-features'), 'Foo,Bar,Vulkan')
})

test('Linux runtime auto-selects Ozone and scopes Vulkan workaround to Wayland', () => {
  const wayland = fakeCommandLine({ 'disable-features': 'Foo' })
  let desktopName = null
  const info = configureRuntime({ commandLine: wayland, setDesktopName: (value) => { desktopName = value } }, {
    platform: 'linux', env: { XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0' },
  })
  assert.equal(wayland.getSwitchValue('ozone-platform-hint'), 'auto')
  assert.equal(wayland.getSwitchValue('disable-features'), 'Foo,Vulkan')
  assert.equal(info.nativeWayland, true)
  assert.equal(desktopName, LINUX_DESKTOP_NAME)

  const x11 = fakeCommandLine()
  configureRuntime({ commandLine: x11 }, { platform: 'linux', env: { XDG_SESSION_TYPE: 'x11', DISPLAY: ':0' } })
  assert.equal(x11.getSwitchValue('ozone-platform-hint'), 'auto')
  assert.equal(x11.hasSwitch('disable-features'), false)
})

test('Linux runtime preserves an explicitly selected backend', () => {
  const commandLine = fakeCommandLine({ 'ozone-platform': 'x11' })
  const info = configureRuntime({ commandLine }, {
    platform: 'linux', env: { XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0' },
  })
  assert.equal(commandLine.hasSwitch('ozone-platform-hint'), false)
  assert.equal(commandLine.hasSwitch('disable-features'), false)
  assert.equal(info.displayServer, 'x11')
})

test('packaging gives Wayland portals and Linux launchers one stable identity', () => {
  const pkg = require('../package.json')
  assert.equal(pkg.desktopName, LINUX_DESKTOP_NAME)
  assert.equal(pkg.build.linux.syncDesktopName, true)
})
