# Changelog (Web)

All notable changes to the web version of unreleased, from v1.10.6 onward. This excludes desktop-only (Electron) features like Discord Rich Presence, the local file library, offline downloads, format conversion, and the system tray/mini player — see [CHANGELOG.md](CHANGELOG.md) for the full project history including those.

> Live at [player.juicewrldapi.com](https://player.juicewrldapi.com) · Source on [GitHub](https://github.com/leanwrldd/unreleased)

---

## [1.18.7] — 2026-08-02

- **New** In-app "Download the app" page — live version and file-size info pulled straight from GitHub Releases, with automatic fallback to the newest release that actually has a macOS build if the latest one hasn't been built for Mac yet
- **Improve** Song info modal redesigned with a cleaner icon-chip layout for its metadata rows

---

## [1.18.4] — 2026-08-01

- **New** Song editor's File URL field gained a Browse button to pick a file straight from the API's file storage
- **Improve** Albums and Editor/Admin tabs can now be hidden from the mobile bottom nav and desktop side menu, like any other nav item
- **Improve** The Wrapped page loads dramatically faster — resolves your play history from one cached bulk fetch instead of a request per song
- **Fix** The collapsed player bar's thin progress line is now click/drag seekable
- **Fix** WRLD view's seek bar now responds to touch drags on mobile — previously only mouse dragging worked

---

## [1.18.3] — 2026-08-01

- **Improve** Heardle's daily clip now skips near-silent intros and song outros when picking where to start, for a fairer guess window

---

## [1.18.2] — 2026-08-01

- **New** Heardle gained **Personal** and **Unlimited** modes alongside Daily — adjustable difficulty (guess count, reveal ladder, start point), and Unlimited can filter by era/category
- **New** Heardle results can be copied to the clipboard to share, Wordle-style

---

## [1.18.1] — 2026-08-01

- **New** Heardle — a daily "name the song from its opening seconds" game, with a shared daily puzzle and a six-guess reveal ladder
- **New** "Wrapped" — an all-time listening stats page built from your play counts: top songs, totals, and more
- **New** API Docs page gained full-text search across every tab
- **Improve** Song editor's synced-lyrics field is now a line-by-line table (timestamp + text) instead of a raw LRC text box
- **Fix** A version-read error could whiteout Settings → About with a blank error screen

---

## [1.18.0] — 2026-07-29

- **Fix** Tracker grid/list rows no longer clip song text when Settings → App text size is scaled up

---

## [1.17.10] — 2026-07-28

- **New** Tracker gained a **Grid view** — a virtualized card layout mirroring juicewrldapi.com's own song cards
- **New** Song editor gained a "Basic" layout — a flat, quick-edit form as an alternative to the full card layout
- **Fix** WRLD view fullscreen no longer swallows the Escape key or blocks other overlays (Settings, equalizer, pickers) from opening on top of it

---

## [1.17.6] — 2026-07-28

- **New** Bulk edit — multi-select songs in the Tracker and edit shared fields (era, category, credits, and more) across all of them at once, with per-field replace/add/remove/append/fill/clear

---

## [1.17.4] — 2026-07-26

- **Fix** Album art now scales with the app text-size setting instead of staying pinned at a fixed size

---

## [1.17.1] — 2026-07-24

- **New** Terms of Service and Privacy Policy pages, linked from Settings → About, plus a one-time notice explaining the app's local storage use

---

## [1.16.10] — 2026-07-22

- **New** News feed — a dedicated News page with channels and article pages (starts empty until the backend feed goes live)
- **New** Skin editor gained an "Advanced" section for overriding the title-bar icon colors, so window controls stay legible on custom title bars
- **New** Mobile install prompt — a one-time nudge showing how to add the app to your home screen (one-tap install on Android, Share → "Add to Home Screen" steps on iOS)

---

## [1.16.9] — 2026-07-22

- **New** Custom skins — build your own theme from any preset, tweak its colors in a live editor, set a signature accent, and import/export skins as files to share
- **New** App-wide 999 FM vote popup — skip/queue votes now float over every view so you don't miss them while browsing another page
- **New** The top-of-sidebar controls (account, settings, info…) can now be reordered and individually hidden, like the nav items
- **New** The web app is now an installable PWA — add it to your home screen or desktop and it keeps working offline via a service worker

---

## [1.16.8] — 2026-07-22

- **New** Nav items can be shown or hidden individually in Settings → Appearance, and Liked Songs, API Docs, and Categories joined the reorderable nav list
- **Change** The standalone Categories page was folded into the nav instead of being a fixed top-level view
- **Improve** Opening Settings from a menu can now jump straight to a specific tab (e.g. Keyboard shortcuts, About)

---

## [1.16.6] — 2026-07-21

- **Improve** "Change version" now opens as a side flyout from the song menu (matching "Add to playlist" and "File actions") instead of expanding inline, and its versions load only when you open it
- **New** "Prefer OG file" toggle added directly to the effects panel
- **Improve** Equalizer band tooltips now show the exact gain in dB

---

## [1.16.5] — 2026-07-21

- **New** Selectable app font in Settings → Appearance — System, Grotesk, Humanist, Wide, Serif, Mono, and Display, each previewing in its own typeface
- **New** Separate lyrics font, so lyric panels can use a different typeface from the rest of the app
- **Improve** Local-file context menu's file actions tidied into their own submenu

---

## [1.16.4] — 2026-07-21

- **New** App text size and lyrics text size are now adjustable separately in Settings → Appearance
- **New** Lyrics alignment option, plus a "blur upcoming lyrics" toggle
- **New** Equalizer panel gained a sleep timer and an audio-output picker, so playback settings live in one place
- **New** "Community edits" section in the equalizer panel — community-made edits (sped-up versions, remixes, mashups) will be playable from here once they go live
- **Improve** Admin tools now render as a tab inside the Editor Profile page instead of a separate top-level page

---

## [1.16.3] — 2026-07-20

- **New** Last.fm scrobbling — connect your account in Settings → Playback and everything you listen to gets scrobbled to your profile

---

## [1.16.2] — 2026-07-20

- **Improve** Effects panel reworked — Reverb and Speed are now independent toggles instead of one combined "slowed + reverb" switch
- **New** "Pitch shift" option makes pitch follow playback speed — slowed below 1×, nightcore above
- **New** Shift+E toggles the equalizer panel (rebindable), and the WRLD view got its own equalizer button
- **Improve** "Skip silence" now jumps over silent stretches near-instantly instead of fast-forwarding through them, without clipping the start of the next sound

---

## [1.16.1] — 2026-07-20

- **New** Equalizer — 10-band EQ with 14 presets (Bass Boost, Vocal, Rock, Hip-Hop, Small Speakers and more), left/right balance, mono, and skip-silence, opened from a new button in the player bar
- **New** Slowed + reverb effect, with adjustable slowdown, reverb mix, and decay
- **Fix** "Change version" no longer lists linked versions that have no playable file

---

## [1.16.0] — 2026-07-19

- **New** The Files tab is now available on the web, not just in the desktop app
- **Fix** Tracker searches on mobile could randomly come back empty while typing
- **Fix** Playlist, folder, and song context menus now always stay fully on-screen and scroll when too tall, instead of getting clipped on short screens
- **Fix** iOS no longer zooms in when you tap a text field

---

## [1.15.14] — 2026-07-19

- **New** Back buttons on the Song editor, API Docs, and shared-playlist pages
- **Improve** Clicking Settings while it's already open now closes it
- **Fix** Song info now opens while 999 FM is playing, instead of doing nothing
- **Fix** Compact (version-group) views in the Tracker and Playlists now refresh immediately after a version edit made elsewhere in the app
- **Fix** Cover-picker search results are now filtered to actual matches for the search term

---

## [1.15.12] — 2026-07-18

- **Improve** A playlist's track search collapsed into an icon that expands when clicked, freeing up the toolbar
- **Improve** The Tracker's compact-view toggle is now remembered between sessions

---

## [1.15.11] — 2026-07-18

- **New** Files tab gained a media-type filter (All/Audio/Images/Videos)
- **New** Custom-cover picker now shows likely matching covers inline as soon as you open it, without needing the full "Browse API files" modal
- **Improve** Theme changes — including the dynamic "Now Playing" theme reacting to a new song — now smoothly cross-fade instead of snapping instantly

---

## [1.15.10] — 2026-07-18

- **New** A "Now Playing" theme option that dynamically colors the app to match the currently playing song's cover art
- **Rename** Editor-only accounts no longer see the Admin page — their tools moved into a new Editor Profile page, which gained a Reports tab
- **New** Song Info now shows a song's alternate titles ("Also Known As"), and the custom-cover search now checks those alt titles too
- **Fix** A song's custom cover now applies across all of its linked versions, so Now Playing shows the right art even when a sibling version is playing

---

## [1.15.9] — 2026-07-18

- **Fix** Browsing API files to pick a custom song cover now correctly selects image files
- **Fix** A song's "default version" star now correctly reflects and clears the version actually in use

---

## [1.15.8] — 2026-07-18

- **Improve** Admin/Reports page no longer wipes filters and selection on refresh — shows a translucent overlay instead of a full-page spinner
- **New** Cover picker now seeds its search with the song's title so relevant covers show up immediately
- **Improve** Feedback/report submissions now show whether they actually reached the server or are just queued locally offline

---

## [1.15.7] — 2026-07-18

- **New** Custom song covers can now be picked by browsing the API's file storage, not just by pasting a URL/path
- **Fix** Changing a song's custom cover now updates the currently playing track's artwork immediately
- **Improve** Playlists view's search bar is now sticky while scrolling a playlist's track list

---

## [1.15.6] — 2026-07-17

- **New** Per-song personalization — set a custom name, cover art, and preferred default version for any song via a new "Personalize" section; tracks your own play count too
- **New** "Report issue" on any song, plus a "Feedback" tab in Settings for general feedback/bug reports
- **New** Admins and editors get a "Reports" tab to review and resolve user-submitted song issue reports
- **New** Playlist folders — organize playlists into folders, including nested folders
- **New** Star a linked song version from the "Change version" menu to make it the one that always plays for that song

---

## [1.15.4] — 2026-07-15

- **New** Side menu order is now customizable — drag to reorder tabs in Settings → Appearance
- **Fix** Right-clicking the player bar now opens the context menu at the cursor instead of always anchoring to the "more options" button
- **Improve** WRLD view's queue panel got a visual refresh — larger panel with a glass sheen effect

---

## [1.15.3] — 2026-07-15

- **New** Keyboard shortcuts are now fully rebindable — a new Settings → Shortcuts tab covers playback, volume, navigation, and app actions, with an adjustable skip-forward/back duration

---

## [1.15.1] — 2026-07-15

- **New** 8 selectable color themes in Settings → Appearance — Light, Dark, Midnight, Ocean, Ember, Mocha, Forest, and Blossom
- **New** Sidebar position is now configurable — left, right, top, or bottom
- **New** Tracker category/era filters are now multi-select, with individually removable filter chips
- **New** "Smooth fade when pausing" setting ramps volume down/up on pause/resume instead of cutting audio off instantly

---

## [1.14.8] — 2026-07-13

- **Fix** Files tab now remembers the last folder you were browsing when you switch tabs and come back
- **Improve** Diagnostics values are now clickable to view the full text in a popup
- **New** Editor page gained Length, Bitrate, and Date Leaked fields
- **Fix** Editors could get a 405 error when linking or updating song versions — now targets the correct API path

---

## [1.14.7] — 2026-07-12

- **Remove** Tracker's grid view removed in favor of the newer detailed row view
- **Improve** Tracker's Producers tab now shows Engineers as a separate list alongside Producers
- **Fix** Bulk ZIP download from the Tracker now warns when some/all selected songs have no downloadable file
- **Fix** "Play" buttons now start from a random track when Shuffle is on, instead of always the first track

---

## [1.14.5] — 2026-07-12

- **New** Tracker gained a "Detailed" view mode — rows expand to show producers, engineers, locations, dates, leak type, bitrate, and more
- **Improve** WRLD view's version-switch notch redesigned as a slim tab/grabber
- **Improve** Editor page's Credits card now shows Producers and Engineers side by side

---

## [1.14.4] — 2026-07-12

- **Improve** App-wide performance overhaul — components only re-render on relevant state changes, reducing lag during playback
- **Improve** Rarely-visited pages (Editor, Admin, Docs, WRLD view, etc.) now load on demand instead of at startup
- **Improve** Editor and local-file metadata editor pages redesigned with a cleaner two-column layout
- **Improve** Large playlists now virtualize their track list, fixing slowdowns
- **Improve** Tracker's Producers tab now also includes engineer credits, without double-counting

---

## [1.14.3] — 2026-07-12

- **New** Editors can now propose a song's deletion from the Editor page, for admin review

---

## [1.14.2] — 2026-07-12

- **New** Tracker gained a "Producers" tab to browse songs by producer credit (Calendar renamed to "Overview")
- **Improve** Diagnostics now shows much more detail — now-playing file info, playback settings, account/playlist stats, update status

---

## [1.14.1] — 2026-07-12

- **New** Diagnostics view (app/playback/storage/cache stats) via a new Developer Options toggle in Settings
- **Improve** Local playlists now show their custom cover image instead of always falling back to a track-art mosaic
- **Improve** WRLD view's "other versions" side tabs replaced with a compact dropdown
- **Improve** 999 FM toggle and fullscreen button grouped together
- **Fix** Lyrics panel no longer flashes to the top before snapping back when entering/exiting fullscreen

---

## [1.14.0] — 2026-07-11

- **Fix** "Find in Tracker" only appears when the file has a matching Tracker entry
- **Fix** Crossfade with Shuffle on could crossfade into an already-played track
- **Fix** Playback could stop dead after a crossfaded advance once the initially loaded queue page ran out
- **Fix** Seek bar could freeze at the wrong position when seeking with arrow keys
- **Fix** Playlist cover art now updates immediately after upload/removal
- **Remove** Quick "remove track" (X) button removed from playlist rows (still in the ⋯ menu)
- **Fix** Clicking a track in the queue's history/upcoming list could wipe your play history and break infinite-scroll loading
- **Improve** WRLD view's album version switcher is now a dropdown instead of tabs
- **Improve** Settings FAQ's documentation link now opens the in-app Docs view
- **Fix** Rapidly restarting Radio no longer leaves duplicate background track-fetch loops running

---

## [1.13.7] — 2026-07-11

- **New** Files in the API file browser can now be liked — liked files show up in Liked Songs
- **New** Tracker's Calendar tab can now also browse songs by recording studio/location
- **Improve** File browser row quick actions moved into the right-click context menu
- **Improve** Clicking the album art in the player bar now always opens the WRLD view
- **New** Multi-selected playlists can now be merged into another playlist
- **Fix** Playlist card context menu could render partly off-screen — now clamped to the viewport

---

## [1.13.6] — 2026-07-11

- **Fix** Clicking a song row outside select mode no longer accidentally toggles selection

---

## [1.13.5] — 2026-07-11

- **New** Playlists can now be multi-selected in the library grid, with a bulk "Delete" action bar
- **New** API Files browser supports ctrl/cmd-click to multi-select files/folders
- **Fix** Tracker's Calendar tab no longer shows implausible recording dates parsed from free text
- **Improve** Tracker's Calendar tab now remembers the last month you were viewing

---

## [1.13.4] — 2026-07-11

- **Fix** Tracker's song list/grid and compact view could hang/freeze with the full catalog loaded — now virtualized
- **Fix** Compact (grouped-versions) view could show the same song listed twice within a group
- **New** WRLD queue panel now has a collapsible "History" section
- **New** Settings has a "Clear cache" button to remove cached API responses used for offline browsing
- **Fix** Caching the full song catalog for offline use could silently fail and wipe the existing offline cache

---

## [1.13.3] — 2026-07-10

- **New** Tracker has a new "Calendar" tab that groups songs by recording date, color-coded by era
- **Improve** Lyric search results now show a highlighted snippet of the matching lyric
- **New** Searching in the Tracker now updates the URL, so back/forward and shared links restore a specific search
- **New** "Prefer OG version" setting — automatically switches to a track's linked OG-quality version when one exists
- **Improve** Seek bar dragging is smoother (only seeks on release, larger drag area)
- **Improve** The 999 FM "···" menu now offers a full context menu (song info, add to playlist)
- **Improve** Tracker's compact (grouped-versions) view loads much faster with a large catalog

---

## [1.13.2] — 2026-07-10

- **New** Tracker has a new "Lyric Search" tab — search songs by lyric content
- **Improve** Sorted views in the Tracker load faster (pages fetch in parallel)

---

## [1.13.1] — 2026-07-08

- **New** Tracker, API Files, and Playlists now load instantly from cache and stay browsable offline
- **Fix** Clicking "Edit" on a song could briefly flash the "My Proposals" screen before the editor loaded

---

## [1.13.0] — 2026-07-08

- **New** The app now stays browsable offline — songs, playlists, favorites, and profile data fall back to the last cached response when the network is unavailable

---

## [1.12.13] — 2026-07-08

- **Fix** Bulk "Add to queue"/"Add to playlist" now require every selected song to be eligible
- **Fix** Seek bar dragging/seeking could break for streams with an unknown duration
- **Fix** Sidebar navigation now scrolls instead of overflowing when there are more items than fit the window

---

## [1.12.11] — 2026-07-07

- **Fix** Admin-only accounts clicking "Edit" were sent to the "apply to be an editor" screen — admins can now edit directly
- **Improve** Sidebar collapse/expand now animates smoothly instead of popping instantly

---

## [1.12.10] — 2026-07-07

- **Fix** Editor's song loader now shows a "Couldn't load song" message with a retry button instead of silently bouncing you to My Proposals
- **Fix** Playback progress bar could get stuck at 0% for streams where the duration isn't known yet

---

## [1.12.9] — 2026-07-07

- **Improve** Reopening a playlist now shows its cached tracks instantly while quietly refreshing in the background

---

## [1.12.8] — 2026-07-07

- **Improve** Editors landing on the editor page with no song selected are now sent to "My Proposals" instead of a blank placeholder

---

## [1.12.6] — 2026-07-07

- **New** Editors can now resubmit a stuck proposal from My Proposals
- **Improve** Songs now display a dedicated album field (when the API provides one) instead of always falling back to the era name

---

## [1.12.5] — 2026-07-05

- **Fix** Native dropdown menus had unreadable option text in dark mode — now consistently dark text on white
- **Fix** API requests now bypass the browser cache, preventing stale data from showing after edits

---

## [1.12.4] — 2026-07-05

- **New** WRLD view now shows a song's other linked versions as peeking "bookmark" tabs on the album art
- **New** Right-click synced lyrics to download them as a .lrc file
- **Improve** Bottom nav and sidebar now list "WRLD" before "Tracker"

---

## [1.12.3] — 2026-07-04

- **Fix** Bulk "Add to queue" is now disabled with an explanatory tooltip when the whole selection is unplayable
- **Improve** Lyrics sync offset now adjusts in finer 0.1s steps

---

## [1.12.2] — 2026-07-04

- **New** Lyrics sync offset setting in Settings — nudge synced lyrics earlier or later
- **New** Sidebar shows a "Download app" link, pointing to the desktop app's latest release

---

## [1.12.1] — 2026-07-04

- **New** WRLD view now has its own audio output device picker
- **New** Tracker's compact view now shows a category badge for each grouped song
- **Fix** Right-click menus now clamp to their actual rendered size instead of a rough guess

---

## [1.12.0] — 2026-07-04

- **Fix** Bulk "Add to queue" now skips unplayable songs
- **Improve** Playlist covers now load instantly from cache when reopening a playlist
- **Improve** Queue panel's "+N more" is now a button — click to reveal more upcoming tracks
- **Fix** Play / Play next / Add to queue are hidden in the context menu for unplayable tracks
- **Improve** WRLD view's fullscreen and 999 FM toggle buttons restyled
- **Improve** WRLD view's queue now takes over the full right column instead of floating as a small overlay

---

## [1.11.11] — 2026-07-03

- **New** Editor profile: proposal list now has a search box
- **Improve** Tracker compact view: sorting moved from a dropdown to clickable column headers
- **Fix** Tracker compact view could freeze when selecting many songs across expanded groups
- **Fix** Playlist header's "⋯" menu could get clipped or overflow the screen
- **Fix** Song context menus could spill off-screen near a window edge

---

## [1.11.10] — 2026-07-03

- **New** Tracker compact view: sort version groups, and right-click a group to bulk-act on all its versions
- **New** Playlists: right-click a playlist for a full context menu — play all, queue all, download ZIP, share, rename, delete
- **New** Multi-select tracks within an open playlist to bulk add to queue/playlist or remove
- **Improve** Playlist header's action buttons are now grouped into a single "⋯" menu
- **Improve** Navigating away from an open playlist and back no longer resets you to the playlist list
- **Improve** WRLD view: mute now restores your previous volume instead of resetting to 50%
- **Fix** Playback could silently get stuck at the end of a track on mobile with the screen locked
- **Fix** Song info modal could render clipped when opened from certain panels
- **Fix** WRLD view: the song "..." menu could fail to close when clicking its own toggle button

---

## [1.11.9] — 2026-07-03

- **Fix** Tracker/Playlists compact view: version groups no longer silently go missing for large catalogs
- **Fix** Tracker compact view search now matches producers, engineers, era, notes, and more; ignores apostrophes

---

## [1.11.8] — 2026-07-02

- **Fix** Tracker/Playlists compact view now respects the search box
- **Fix** WRLD view lyrics: the enlarged active line no longer gets clipped near the panel's edge
- **Improve** Volume percentage tooltip is now larger and easier to read
- **New** Playlists compact view: individual tracks can now be removed from the playlist directly

---

## [1.11.7] — 2026-07-02

- **New** Files view: recursive search across the whole file tree
- **New** Playlists: "Compact" view collapses tracks that share a version group into one row
- **Improve** Tracker: bulk "Add to playlist" now excludes session/unsurfaced songs and marks playlists that already contain the whole selection
- **Fix** WRLD view queue no longer pushes the player controls off-screen on short windows
- **Fix** Native dropdowns now follow the app's light/dark theme instead of the OS's

---

## [1.11.6] — 2026-07-02

- **New** Song context menus everywhere now include "Change version" — jump straight to a linked version
- **Improve** Right-click/options menus for songs are now consistent across every view
- **Improve** Song info modal text can now be selected and copied

---

## [1.11.5] — 2026-07-02

- **Improve** Tracker compact view group rows now show the group's cover art
- **New** Linking songs as versions now prompts you to name the group if it doesn't already have a title
- **Fix** Tracker compact view no longer silently kept loading the entire song library in the background

---

## [1.11.4] — 2026-07-01

- **New** Tracker: "Compact" view collapses songs into their version groups
- **Improve** Multi-select no longer needs a separate "Select" button — click any song row to start selecting
- **New** Editor page: version title field now autocompletes existing titles

---

## [1.11.3] — 2026-07-01

- **Improve** Editor page: song version fields now save via an explicit button instead of auto-saving on blur
- **Remove** Song info modal no longer lets you search and link new versions inline — do this from the editor instead
- **Fix** Light mode: muted/secondary text is now darker for better readability

---

## [1.11.2] — 2026-07-01

- **Improve** Editor page: song version label is now free text instead of a number; version title now applies to every linked version at once

---

## [1.11.1] — 2026-07-01

- **Fix** Editor/Song info: linking or unlinking a song version now shows an error message on failure

---

## [1.11.0] — 2026-07-01

- **New** Tracker bulk-selected songs can now be right-clicked for the same actions, plus a "Link versions" bulk action for editors
- **New** Editor page: link/unlink song versions and set a version number/title without leaving the edit form
- **Improve** Song info modal: linked versions now show their version number/title

---

## [1.10.16] — 2026-07-01

- **New** Tracker: multi-select mode — select multiple songs to add to queue, add to a playlist, or download as a ZIP in bulk

---

## [1.10.14] — 2026-07-01

- **New** Song info modal: link songs together as "Other Versions" (e.g. v1/v2/TV Mix) and jump between them

---

## [1.10.12] — 2026-07-01

- **New** Song info modal now has an Edit button for editors, wired up across every view
- **New** Recording-session songs (Tracker) can now be downloaded as a ZIP from the context menu
- **New** Song info modal now shows a song's alternate names
- **New** WRLD view lyrics: manual scroll to browse the full lyric sheet, with a "Resume" button
- **Fix** Liked Songs: "Play next" now actually plays the track next instead of appending to the end

---

## [1.10.11] — 2026-07-01

- **Improve** Settings redesigned again with a sidebar tab list (Appearance/Playback/Library/App/About)

---

## [1.10.10] — 2026-07-01

- **Improve** Settings redesigned with grouped, iOS-style sections and toggle switches
- **Improve** Library page: playlists are now split into "Playlists" and "On This Device" sections
- **Improve** WRLD view "Playing Next" queue now pops up inline under the player instead of a separate side panel

---

## [1.10.9] — 2026-07-01

- **New** Playlists: full-bleed blurred cover art now sits behind the playlist header (Apple Music style)
- **New** Playlists: circular Play/Shuffle buttons on playlist headers, and a hover play button on playlist grid tiles
- **New** Sidebar: playlists list expands under the "Playlists" nav item for one-click access
- **New** WRLD view: fullscreen now uses real OS/browser fullscreen instead of just an in-app overlay
- **New** WRLD view: "Playing Next" queue panel — view and drag-to-reorder the upcoming queue
- **Improve** Media lightbox: image/video controls now float above the media
- **Fix** WRLD view lyrics: active line no longer appears to snap bold partway through the highlight transition

---

## [1.10.8] — 2026-07-01

- **New** WRLD view: fullscreen toggle button (Escape to exit)
- **Remove** WRLD view song menu: removed the "Play Next" option
- **Fix** WRLD view: active lyric line no longer causes a late "pop" when growing — now animates via a smooth scale transition

---

## [1.10.6] — 2026-07-01

- **New** WRLD view: "···" context menu on the current track (Apple Music-style)
- **New** WRLD view: synced lyrics scroll with a smooth GPU-composited animation instead of choppy native smooth-scroll
- **Fix** Lyrics could leak from one song to another when the API's `?song=` filter was ignored
- **Fix** Shuffle could play a different track than the one shown as "up next" during crossfade
- **Fix** Editor song edits / proposal approvals could be momentarily clobbered by a race with the currently-playing track prefill
- **Improve** Lyrics are now cached per session — fewer redundant API calls on replay
