// The app version, read from the `__APP_VERSION__` build-time define in
// vite.config.ts.
//
// Always import this instead of referencing `__APP_VERSION__` directly. A bare
// identifier is a hard ReferenceError in any context where the define hasn't
// been applied (a dev server started from a checkout with an older vite config,
// a bundler that doesn't share our `define`, tests), and because it's evaluated
// during render that error takes down whatever component touched it — which is
// how Settings → About whited out the whole window.
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
