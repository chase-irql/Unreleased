import React, { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronRight, ChevronDown, Menu, Check, RefreshCw, AlertTriangle } from 'lucide-react'
import { useStorePick } from '../store/useStore'
import { effectiveBinding, comboTokens, runHotkeyAction } from '../lib/hotkeys'
import { trackIdToSongId } from '../lib/userApi'
import { placeFlyout } from '../lib/menuFlyout'

// MusicBee-style application menu: a button that drops down the top-level menus
// (File, Edit, View…), each opening its own submenu flyout. Desktop only — the
// web build has no frameless title strip and no `window.electron`.
//
// `variant` decides where it lives (Settings → Appearance → Menu button):
//   'bar'     — floating pill pinned to the window's title strip (top-left).
//   'sidebar' — a normal row rendered inside the Sidebar (App.tsx skips the
//               floating one). Avoids overlapping whatever sits in the content
//               area's top-left corner (radio widget, WRLD controls…).
// The dropdown itself anchors to the trigger button's measured position either
// way, so it opens in the right spot wherever the button is placed.
//
// Entries that mirror a keyboard shortcut dispatch by hotkey id through
// runHotkeyAction rather than reimplementing the behavior, so a menu click and
// its shortcut always run the identical handler (and the combo shown on the
// right stays truthful even after the user rebinds it in Settings).

type Entry =
  | { kind: 'sep' }
  | {
      kind: 'item'
      label: string
      onClick: () => void
      /** Hotkey action id — dispatches the action and shows its bound combo. */
      hotkey?: string
      /** Overrides the combo shown when the entry isn't hotkey-driven. */
      combo?: string
      checked?: boolean
      disabled?: boolean
      /** Right-aligned status adornment (e.g. the update-check spinner). Shown
       *  in place of a combo. */
      trailing?: ReactNode
    }

interface MenuDef { id: string; label: string; entries: Entry[] }

function openExternal(url: string): void {
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// 'bar' — floating title-strip pill · 'sidebar' — full-width row for the
// vertical side menu · 'sidebar-icon' — compact icon button for the collapsed
// side menu and the horizontal top/bottom bar.
type AppMenuVariant = 'bar' | 'sidebar' | 'sidebar-icon'

export default function AppMenu({ variant = 'bar', collapsed = false }: { variant?: AppMenuVariant; collapsed?: boolean } = {}): JSX.Element | null {
  const {
    account, logoutAccount, setShowUserAuth,
    openSettings, openConvert,
    setActiveView, setShowDownloadManager, clearCompletedDownloads,
    showQueue, showNowPlaying, setShowNowPlaying,
    playerCollapsed, setPlayerCollapsed,
    showEqPanel, shuffle, repeat, isPlaying, currentTrack,
    sleepTimerEnd, crossfadeEnabled, crossfadeDuration, setCrossfade,
    preferOgVersion, pauseFadeEnabled,
    playbackSpeed, setPlaybackSpeed,
    eqEnabled, setEqEnabled, eqMono, setEqMono,
    skipSilence, setSkipSilence, reverbEnabled, setReverbEnabled,
    pitchShift, setPitchShift,
    sidebarPosition, setSidebarPosition,
    lastfmEnabled, setLastfmEnabled,
    globalHotkeysEnabled, setGlobalHotkeysEnabled,
    developerMode, setDeveloperMode,
    addLibraryFolder, libraryScanning, libraryAutoRefresh, setLibraryAutoRefresh,
    syncOfflinePlaylists, openReport,
    hotkeyBindings,
  } = useStorePick(
    'account', 'logoutAccount', 'setShowUserAuth',
    'openSettings', 'openConvert',
    'setActiveView', 'setShowDownloadManager', 'clearCompletedDownloads',
    'showQueue', 'showNowPlaying', 'setShowNowPlaying',
    'playerCollapsed', 'setPlayerCollapsed',
    'showEqPanel', 'shuffle', 'repeat', 'isPlaying', 'currentTrack',
    'sleepTimerEnd', 'crossfadeEnabled', 'crossfadeDuration', 'setCrossfade',
    'preferOgVersion', 'pauseFadeEnabled',
    'playbackSpeed', 'setPlaybackSpeed',
    'eqEnabled', 'setEqEnabled', 'eqMono', 'setEqMono',
    'skipSilence', 'setSkipSilence', 'reverbEnabled', 'setReverbEnabled',
    'pitchShift', 'setPitchShift',
    'sidebarPosition', 'setSidebarPosition',
    'lastfmEnabled', 'setLastfmEnabled',
    'globalHotkeysEnabled', 'setGlobalHotkeysEnabled',
    'developerMode', 'setDeveloperMode',
    'addLibraryFolder', 'libraryScanning', 'libraryAutoRefresh', 'setLibraryAutoRefresh',
    'syncOfflinePlaylists', 'openReport',
    'hotkeyBindings',
  )

  const [open, setOpen] = useState(false)
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [subPos, setSubPos] = useState({ top: 0, left: 0 })
  const [panelPos, setPanelPos] = useState({ top: 28, left: 4 })
  // Whether the panel opened above the trigger instead of below (bottom bar) —
  // drives the grow-from-bottom origin so the pop animation feels right.
  const [flipUp, setFlipUp] = useState(false)
  // In-menu updater status so "Check for updates" gives feedback in place
  // rather than silently closing the menu (mirrors Settings' own state machine).
  const [updateState, setUpdateState] = useState<'idle' | 'checking' | 'available' | 'latest' | 'downloading' | 'downloaded' | 'error'>('idle')
  const [updatePercent, setUpdatePercent] = useState(0)
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const subRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const el = (window as any).electron
  const PANEL_W = 176 // w-44

  // Close on outside click / Escape, and reset the open submenu with it.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) { setOpen(false); setActiveMenu(null) }
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { setOpen(false); setActiveMenu(null) }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Follow updater progress so the "Check for updates" row reflects it live
  // (available → downloading% → ready). Auto-updates fired elsewhere land here
  // too, so the row is accurate even if the user didn't start the check.
  useEffect(() => {
    if (!el?.onUpdateStatus) return
    return el.onUpdateStatus((d: { type: string; version?: string; percent?: number }) => {
      if (d.type === 'checking') { setUpdateState('checking'); setUpdateVersion(null) }
      else if (d.type === 'available') { setUpdateState('available'); setUpdateVersion(d.version ?? null) }
      else if (d.type === 'not-available') { setUpdateState('latest'); setTimeout(() => setUpdateState('idle'), 5000) }
      else if (d.type === 'downloading') { setUpdateState('downloading'); setUpdatePercent(d.percent ?? 0) }
      else if (d.type === 'downloaded') { setUpdateState('downloaded'); setUpdateVersion(d.version ?? null) }
      else if (d.type === 'error') { setUpdateState('error'); setTimeout(() => setUpdateState('idle'), 5000) }
    })
  }, [el])

  // Kicks off a check (or installs a ready download). Deliberately does NOT
  // close the menu — the row updates in place instead.
  const checkForUpdates = async (): Promise<void> => {
    if (updateState === 'downloaded') { el?.installUpdate?.(); return }
    if (updateState === 'checking' || updateState === 'downloading') return
    setUpdateState('checking')
    try {
      await el?.checkForUpdates?.()
      // If nothing came back through onUpdateStatus, assume up to date.
      setUpdateState((s) => (s === 'checking' ? 'latest' : s))
      setTimeout(() => setUpdateState((s) => (s === 'latest' ? 'idle' : s)), 4000)
    } catch {
      setUpdateState('error')
      setTimeout(() => setUpdateState('idle'), 4000)
    }
  }

  const updateLabel = updateState === 'checking' ? 'Checking for updates…'
    : updateState === 'downloading' ? `Downloading update… ${updatePercent}%`
    : updateState === 'downloaded' ? 'Restart to update'
    : updateState === 'available' ? `Update available${updateVersion ? ` (v${updateVersion})` : ''}`
    : updateState === 'latest' ? 'Up to date'
    : updateState === 'error' ? 'Update check failed'
    : 'Check for updates'
  const updateTrailing: ReactNode =
    updateState === 'checking' || updateState === 'downloading' ? <RefreshCw size={12} className="animate-spin text-text-muted" />
    : updateState === 'downloaded' ? <RefreshCw size={12} className="text-emerald-400" />
    : updateState === 'latest' ? <Check size={12} className="text-emerald-400" />
    : updateState === 'available' ? <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
    : updateState === 'error' ? <AlertTriangle size={12} className="text-red-400" />
    : null

  // Local library files have no backing API song, so song-scoped entries
  // (report) stay disabled for them.
  const currentSongId = currentTrack ? trackIdToSongId(currentTrack.id) : null
  // Convert only works on an on-disk local file (it transcodes the source);
  // API/stream tracks have no local path to read.
  const canConvert = !!currentTrack?.path && currentTrack.id.startsWith('local-')

  const close = (): void => { setOpen(false); setActiveMenu(null) }
  // Wraps an entry's action so every click also dismisses the menu.
  const run = (fn: () => void) => (): void => { fn(); close() }
  const hk = (id: string) => (): void => { runHotkeyAction(id); close() }

  const pickLibraryFolder = async (): Promise<void> => {
    const picked = await el?.pickFolder()
    if (picked) addLibraryFolder(picked)
  }

  // Main sets the flag; there's no mirrored store field, so read the live
  // window state rather than tracking a copy that could drift (F11, the OS
  // window buttons and WRLD's focus mode all change it behind our back).
  const toggleFullscreen = async (): Promise<void> => {
    const on = await el?.isFullscreen?.()
    await el?.setFullscreen?.(!on)
  }

  const menus: MenuDef[] = [
    {
      id: 'file', label: 'File',
      entries: [
        { kind: 'item', label: 'Add folder to library…', onClick: run(pickLibraryFolder) },
        { kind: 'item', label: libraryScanning ? 'Scanning library…' : 'Rescan library', hotkey: 'rescan-library', onClick: hk('rescan-library'), disabled: libraryScanning },
        { kind: 'item', label: 'Auto-refresh library', onClick: run(() => setLibraryAutoRefresh(!libraryAutoRefresh)), checked: libraryAutoRefresh },
        { kind: 'sep' },
        { kind: 'item', label: 'Downloads', onClick: run(() => setShowDownloadManager(true)) },
        { kind: 'item', label: 'Clear finished downloads', onClick: run(() => clearCompletedDownloads()) },
        { kind: 'item', label: 'Sync offline playlists', onClick: run(() => syncOfflinePlaylists()) },
        { kind: 'sep' },
        account
          ? { kind: 'item', label: `Log out (${account.display_name || account.discord_username})`, onClick: run(() => logoutAccount()) }
          : { kind: 'item', label: 'Log in…', onClick: run(() => setShowUserAuth(true)) },
        { kind: 'sep' },
        { kind: 'item', label: 'Minimize', onClick: run(() => el?.minimizeWindow?.()) },
        { kind: 'item', label: 'Exit', onClick: run(() => el?.closeWindow?.()) },
      ],
    },
    {
      id: 'edit', label: 'Edit',
      entries: [
        { kind: 'item', label: 'Song info', hotkey: 'song-info', onClick: hk('song-info'), disabled: !currentTrack },
        { kind: 'item', label: 'Edit current song', hotkey: 'edit-song', onClick: hk('edit-song'), disabled: !currentTrack },
        { kind: 'item', label: 'Like current song', hotkey: 'like', onClick: hk('like'), disabled: !currentTrack },
        { kind: 'sep' },
        { kind: 'item', label: 'Report an issue with this song', onClick: run(() => { if (currentSongId != null) openReport({ kind: 'song', songId: currentSongId, songName: currentTrack?.title ?? '' }) }), disabled: currentSongId == null },
        { kind: 'sep' },
        { kind: 'item', label: 'Focus search', hotkey: 'focus-search', onClick: hk('focus-search') },
        { kind: 'item', label: 'Clear queue', hotkey: 'clear-queue', onClick: hk('clear-queue') },
        { kind: 'sep' },
        { kind: 'item', label: 'Preferences…', hotkey: 'open-settings', onClick: hk('open-settings') },
      ],
    },
    {
      id: 'view', label: 'View',
      entries: [
        { kind: 'item', label: 'Tracker', hotkey: 'view-tracker', onClick: hk('view-tracker') },
        { kind: 'item', label: 'Files', onClick: run(() => setActiveView('api-files')) },
        { kind: 'item', label: 'Library', hotkey: 'view-library', onClick: hk('view-library') },
        { kind: 'item', label: 'Playlists', hotkey: 'view-playlists', onClick: hk('view-playlists') },
        { kind: 'item', label: 'Liked songs', onClick: run(() => setActiveView('liked')) },
        { kind: 'item', label: 'WRLD', hotkey: 'view-wrld', onClick: hk('view-wrld') },
        { kind: 'sep' },
        { kind: 'item', label: 'Queue panel', hotkey: 'toggle-queue', onClick: hk('toggle-queue'), checked: showQueue },
        { kind: 'item', label: 'Now playing', onClick: run(() => setShowNowPlaying(!showNowPlaying)), checked: showNowPlaying },
        { kind: 'item', label: 'Equalizer panel', hotkey: 'equalizer', onClick: hk('equalizer'), checked: showEqPanel },
        { kind: 'item', label: 'Collapse player', onClick: run(() => setPlayerCollapsed(!playerCollapsed)), checked: playerCollapsed },
        { kind: 'sep' },
        // Mirrors Settings → Appearance → Navigation position.
        { kind: 'item', label: 'Menu on the left', onClick: run(() => setSidebarPosition('left')), checked: sidebarPosition === 'left' },
        { kind: 'item', label: 'Menu on the right', onClick: run(() => setSidebarPosition('right')), checked: sidebarPosition === 'right' },
        { kind: 'item', label: 'Menu on top', onClick: run(() => setSidebarPosition('top')), checked: sidebarPosition === 'top' },
        { kind: 'item', label: 'Menu on bottom', onClick: run(() => setSidebarPosition('bottom')), checked: sidebarPosition === 'bottom' },
        { kind: 'sep' },
        { kind: 'item', label: 'Full screen', onClick: run(toggleFullscreen) },
      ],
    },
    {
      id: 'controls', label: 'Controls',
      entries: [
        { kind: 'item', label: isPlaying ? 'Pause' : 'Play', hotkey: 'play-pause', onClick: hk('play-pause'), disabled: !currentTrack },
        { kind: 'item', label: 'Next track', hotkey: 'next', onClick: hk('next'), disabled: !currentTrack },
        { kind: 'item', label: 'Previous track', hotkey: 'previous', onClick: hk('previous'), disabled: !currentTrack },
        { kind: 'sep' },
        { kind: 'item', label: 'Skip forward', hotkey: 'seek-forward', onClick: hk('seek-forward'), disabled: !currentTrack },
        { kind: 'item', label: 'Skip backward', hotkey: 'seek-backward', onClick: hk('seek-backward'), disabled: !currentTrack },
        { kind: 'sep' },
        { kind: 'item', label: 'Shuffle', hotkey: 'shuffle', onClick: hk('shuffle'), checked: shuffle },
        {
          kind: 'item',
          label: repeat === 'one' ? 'Repeat one' : repeat === 'all' ? 'Repeat all' : 'Repeat',
          hotkey: 'loop', onClick: hk('loop'), checked: repeat !== 'none',
        },
        { kind: 'sep' },
        { kind: 'item', label: 'Volume up', hotkey: 'volume-up', onClick: hk('volume-up') },
        { kind: 'item', label: 'Volume down', hotkey: 'volume-down', onClick: hk('volume-down') },
        { kind: 'item', label: 'Mute', hotkey: 'mute', onClick: hk('mute') },
        { kind: 'sep' },
        { kind: 'item', label: 'Increase speed', hotkey: 'speed-up', onClick: hk('speed-up') },
        { kind: 'item', label: 'Decrease speed', hotkey: 'speed-down', onClick: hk('speed-down') },
        { kind: 'item', label: `Reset speed (${playbackSpeed.toFixed(2)}x)`, onClick: run(() => setPlaybackSpeed(1)), disabled: playbackSpeed === 1 },
        { kind: 'sep' },
        { kind: 'item', label: 'Crossfade', hotkey: 'crossfade', onClick: hk('crossfade'), checked: crossfadeEnabled },
        { kind: 'item', label: `Crossfade ${crossfadeDuration}s`, onClick: run(() => setCrossfade(true, crossfadeDuration >= 12 ? 1 : crossfadeDuration + 1)), disabled: !crossfadeEnabled },
        { kind: 'item', label: 'Smooth pause fade', hotkey: 'smooth-playback', onClick: hk('smooth-playback'), checked: pauseFadeEnabled },
        { kind: 'item', label: 'Prefer OG version', hotkey: 'prefer-og', onClick: hk('prefer-og'), checked: preferOgVersion },
        { kind: 'sep' },
        // Web Audio effect chain — same switches as the EQ panel.
        { kind: 'item', label: 'Equalizer', onClick: run(() => setEqEnabled(!eqEnabled)), checked: eqEnabled },
        { kind: 'item', label: 'Mono output', onClick: run(() => setEqMono(!eqMono)), checked: eqMono },
        { kind: 'item', label: 'Skip silence', onClick: run(() => setSkipSilence(!skipSilence)), checked: skipSilence },
        { kind: 'item', label: 'Reverb', onClick: run(() => setReverbEnabled(!reverbEnabled)), checked: reverbEnabled },
        { kind: 'item', label: 'Pitch shift', onClick: run(() => setPitchShift(!pitchShift)), checked: pitchShift },
        { kind: 'sep' },
        { kind: 'item', label: 'Sleep timer', hotkey: 'sleep-timer', onClick: hk('sleep-timer'), checked: !!sleepTimerEnd },
      ],
    },
    {
      id: 'tools', label: 'Tools',
      entries: [
        { kind: 'item', label: 'Convert current song…', onClick: run(() => { if (canConvert && currentTrack) openConvert({ id: currentTrack.id, path: currentTrack.path, title: currentTrack.title }) }), disabled: !canConvert },
        { kind: 'sep' },
        { kind: 'item', label: 'Mini player', hotkey: 'mini-player', onClick: hk('mini-player') },
        { kind: 'item', label: 'Close pop-out windows', hotkey: 'close-float-windows', onClick: hk('close-float-windows') },
        { kind: 'sep' },
        { kind: 'item', label: 'Discord status', hotkey: 'discord-status', onClick: hk('discord-status') },
        { kind: 'item', label: 'Last.fm scrobbling', onClick: run(() => setLastfmEnabled(!lastfmEnabled)), checked: lastfmEnabled },
        { kind: 'item', label: 'Global shortcuts', onClick: run(() => setGlobalHotkeysEnabled(!globalHotkeysEnabled)), checked: globalHotkeysEnabled },
        { kind: 'sep' },
        { kind: 'item', label: 'Developer mode', onClick: run(() => setDeveloperMode(!developerMode)), checked: developerMode },
        { kind: 'item', label: 'Diagnostics', hotkey: 'open-diagnostics', onClick: hk('open-diagnostics') },
        { kind: 'item', label: 'Open logs folder', onClick: run(() => el?.openLogsFolder?.()) },
        { kind: 'item', label: 'Clear image cache', onClick: run(() => el?.clearImageCache?.()) },
        ...(developerMode
          ? [{ kind: 'item' as const, label: 'Toggle DevTools', hotkey: 'toggle-devtools', onClick: hk('toggle-devtools') }]
          : []),
        { kind: 'sep' },
        { kind: 'item', label: 'Restart app', hotkey: 'restart-app', onClick: hk('restart-app') },
      ],
    },
    {
      id: 'help', label: 'Help',
      entries: [
        { kind: 'item', label: 'API docs', onClick: run(() => setActiveView('docs')) },
        { kind: 'item', label: 'Keyboard shortcuts', onClick: run(() => openSettings('shortcuts')) },
        { kind: 'item', label: 'Send feedback…', onClick: run(() => openReport({ kind: 'feedback' })) },
        { kind: 'sep' },
        // No `run` wrapper — keeps the menu open so the row can report progress.
        { kind: 'item', label: updateLabel, trailing: updateTrailing, onClick: () => { void checkForUpdates() } },
        { kind: 'item', label: 'Reinstall latest release', onClick: run(() => el?.forceUpdate?.()) },
        { kind: 'sep' },
        { kind: 'item', label: 'GitHub', onClick: run(() => openExternal('https://github.com/leanwrldd/unreleased')) },
        { kind: 'item', label: 'Discord', onClick: run(() => openExternal('https://discord.gg/jwa')) },
        { kind: 'item', label: 'Juice WRLD API', onClick: run(() => openExternal('https://juicewrldapi.com')) },
        { kind: 'sep' },
        { kind: 'item', label: `Version ${__APP_VERSION__}`, onClick: run(() => openSettings('about')) },
      ],
    },
  ]

  // Anchor the dropdown to the trigger button wherever it sits: below it by
  // default, but flipped above when it wouldn't fit (the menu button in a
  // bottom nav bar), and left-aligned but clamped off the right edge (the
  // sidebar on the right). Uses the panel's measured height, so it only lands
  // right once the panel exists — hence keying off `open` and its content.
  useLayoutEffect(() => {
    if (!open) return
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r) return
    const panelH = panelRef.current?.offsetHeight ?? 0
    const left = Math.max(4, Math.min(r.left, window.innerWidth - PANEL_W - 8))
    const below = r.bottom + 2
    const up = below + panelH > window.innerHeight - 8 && r.top - panelH - 2 >= 4
    const top = up ? r.top - panelH - 2 : Math.min(below, window.innerHeight - panelH - 8)
    setFlipUp(up)
    setPanelPos((prev) => (prev.top === top && prev.left === left ? prev : { top, left }))
  }, [open, variant, sidebarPosition])

  // Place the open submenu beside the panel, level with its row — the same
  // flyout placement the song context menu's submenus use.
  useLayoutEffect(() => {
    if (!activeMenu) return
    const row = rowRefs.current[activeMenu]
    if (!row || !panelRef.current || !subRef.current) return
    const { top, left } = placeFlyout(row, panelRef.current, subRef.current)
    setSubPos((prev) => (prev.top === top && prev.left === left ? prev : { top, left }))
  }, [activeMenu])

  if (!el) return null

  const activeEntries = menus.find((m) => m.id === activeMenu)?.entries ?? []

  const active = open ? 'bg-surface-raised text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised'
  const btnClass = variant === 'bar'
    ? `flex items-center gap-1.5 h-7 pl-2 pr-2 text-xs font-medium transition-colors ${active}`
    : variant === 'sidebar-icon'
      ? `flex items-center justify-center w-8 h-8 rounded transition-colors shrink-0 ${active}`
      : `flex items-center w-full py-2 rounded text-sm font-medium transition-colors gap-3 pl-2 pr-3 ${active}`

  return (
    <div
      ref={rootRef}
      className={variant === 'bar' ? 'fixed top-0 left-0 z-[10000] flex items-center h-7' : variant === 'sidebar' ? 'w-full' : 'shrink-0'}
      style={variant === 'bar' ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) : undefined}
    >
      <button
        ref={triggerRef}
        onClick={() => { setOpen((o) => !o); setActiveMenu(null) }}
        title="Menu"
        className={btnClass}
      >
        <span className={variant === 'bar' ? 'shrink-0' : variant === 'sidebar-icon' ? 'flex items-center justify-center' : 'w-6 h-6 flex items-center justify-center shrink-0'}>
          <Menu size={variant === 'bar' ? 14 : 18} />
        </span>
        {variant !== 'sidebar-icon' && (
          <>
            <span
              aria-hidden={collapsed}
              className={`whitespace-nowrap truncate transition-opacity duration-200 ${variant === 'sidebar' ? 'flex-1 text-left' : ''} ${collapsed ? 'w-0 flex-none opacity-0 pointer-events-none' : 'opacity-100'}`}
            >
              Menu
            </span>
            {!collapsed && <ChevronDown size={12} className={`shrink-0 transition-transform ${variant === 'sidebar' ? 'ml-auto' : ''} ${open ? 'rotate-180' : ''}`} />}
          </>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          // Hovering a row opens its submenu and closes any other, the way a
          // native menu bar behaves.
          onMouseOver={(e) => {
            const hovered = menus.find((m) => rowRefs.current[m.id]?.contains(e.target as Node))
            if (hovered) setActiveMenu(hovered.id)
          }}
          style={{ position: 'fixed', zIndex: 10000, top: panelPos.top, left: panelPos.left, transformOrigin: flipUp ? 'bottom left' : 'top left', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="w-44 bg-surface border border-[var(--border)] rounded-xl shadow-2xl py-1 animate-menu-pop"
        >
          {menus.map((m) => (
            <button
              key={m.id}
              ref={(node) => { rowRefs.current[m.id] = node }}
              onClick={(e) => { e.stopPropagation(); setActiveMenu((cur) => (cur === m.id ? null : m.id)) }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                activeMenu === m.id
                  ? 'bg-surface-raised text-text-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised'
              }`}
            >
              {m.label}
              <ChevronRight size={13} className="ml-auto text-text-muted shrink-0" />
            </button>
          ))}

          {activeMenu && (
            <div
              key={activeMenu}
              ref={subRef}
              onClick={(e) => e.stopPropagation()}
              style={{ position: 'fixed', zIndex: 10001, top: subPos.top, left: subPos.left, maxHeight: window.innerHeight - 16 }}
              className="w-60 bg-surface border border-[var(--border)] rounded-xl shadow-2xl py-1 overflow-y-auto overflow-x-hidden animate-menu-pop"
            >
              {activeEntries.map((entry, i) =>
                entry.kind === 'sep' ? (
                  <div key={`sep-${i}`} className="my-1 border-t border-[var(--border)]" />
                ) : (
                  <button
                    key={entry.label}
                    onClick={(e) => { e.stopPropagation(); if (!entry.disabled) entry.onClick() }}
                    disabled={entry.disabled}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors text-text-secondary hover:text-text-primary hover:bg-surface-raised disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <span className="w-3.5 shrink-0 flex items-center justify-center">
                      {entry.checked && <Check size={12} className="text-accent" />}
                    </span>
                    <span className="flex-1 truncate">{entry.label}</span>
                    <span className="ml-auto flex items-center gap-1 shrink-0">
                      {entry.trailing}
                      {comboTokens(entry.combo ?? (entry.hotkey ? effectiveBinding(entry.hotkey, hotkeyBindings) : '')).map((t, ti) => (
                        <kbd
                          key={ti}
                          className="px-1.5 py-0.5 rounded bg-[var(--surface-highest)] text-text-muted text-[10px] font-semibold leading-none border border-[var(--border)] tabular-nums"
                        >
                          {t}
                        </kbd>
                      ))}
                    </span>
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
