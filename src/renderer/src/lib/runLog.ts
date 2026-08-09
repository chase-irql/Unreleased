// Renderer-side breadcrumb logging — a trail of what the UI was doing, kept
// to the dev console. Fire-and-forget and never throws: logging must not
// itself break the thing it's diagnosing.
export function runLog(scope: string, ...args: unknown[]): void {
  if (import.meta.env?.DEV) console.log(`[${scope}]`, ...args)
}

// Install once at startup: catch otherwise-silent renderer errors and
// unhandled promise rejections and route them into the run log.
export function installGlobalErrorLogging(): void {
  window.addEventListener('error', (e) => {
    runLog('renderer-error', e.message, e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : '', e.error?.stack || '')
  })
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason
    runLog('renderer-rejection', r?.stack || r?.message || String(r))
  })
}
