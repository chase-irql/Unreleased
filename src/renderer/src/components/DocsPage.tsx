import { useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'

// ─── Small reusable primitives ────────────────────────────────────────────────

function Badge({ children, color = 'default' }: { children: string; color?: 'get' | 'post' | 'delete' | 'patch' | 'default' }) {
  const styles: Record<string, string> = {
    get:     'bg-emerald-500/15 text-emerald-500 border border-emerald-500/25',
    post:    'bg-blue-500/15 text-blue-400 border border-blue-500/25',
    delete:  'bg-red-500/15 text-red-400 border border-red-500/25',
    patch:   'bg-amber-500/15 text-amber-400 border border-amber-500/25',
    default: 'bg-[var(--surface-raised)] text-text-muted border border-[var(--border)]',
  }
  return (
    <span className={`inline-block text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded font-mono ${styles[color]}`}>
      {children}
    </span>
  )
}

function Code({ children }: { children: string }) {
  return (
    <code className="bg-[var(--surface-raised)] text-accent border border-[var(--border)] text-[11px] font-mono px-1.5 py-0.5 rounded">
      {children}
    </code>
  )
}

function Pre({ children }: { children: string }) {
  return (
    <pre className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-xl text-[11px] font-mono text-text-secondary p-4 overflow-x-auto whitespace-pre leading-relaxed">
      {children}
    </pre>
  )
}

function Table({ headers, rows }: { headers: string[]; rows: (string | JSX.Element)[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--surface-raised)] border-b border-[var(--border)]">
            {headers.map(h => (
              <th key={h} className="text-left px-4 py-2.5 text-text-muted text-xs font-semibold uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={`border-b border-[var(--border)] last:border-0 ${i % 2 === 0 ? '' : 'bg-[var(--surface-raised)]/40'}`}>
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-text-secondary align-top">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-[var(--border)] rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 bg-[var(--surface-raised)] hover:bg-[var(--surface-overlay)] transition-colors text-left"
      >
        <span className="text-text-primary font-semibold text-sm">{title}</span>
        {open ? <ChevronDown size={16} className="text-text-muted" /> : <ChevronRight size={16} className="text-text-muted" />}
      </button>
      {open && <div className="p-5 space-y-4 bg-[var(--surface)]">{children}</div>}
    </div>
  )
}

function Endpoint({ method, path, description }: { method: 'GET' | 'POST' | 'DELETE' | 'PATCH'; path: string; description: string }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Badge color={method.toLowerCase() as 'get' | 'post' | 'delete' | 'patch'}>{method}</Badge>
      <div className="min-w-0">
        <code className="text-[12px] font-mono text-text-primary">{path}</code>
        <p className="text-xs text-text-muted mt-0.5">{description}</p>
      </div>
    </div>
  )
}

// ─── Tab content ──────────────────────────────────────────────────────────────

function OverviewTab() {
  return (
    <div className="space-y-6">
      <Section title="Introduction">
        <p className="text-sm text-text-secondary leading-relaxed">
          The Juice WRLD API provides programmatic access to the most comprehensive Juice WRLD music database —
          over 2,700 catalogued songs, unreleased tracks, file browsing, and rich metadata. No API key required
          for public read endpoints.
        </p>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-text-muted">Base URL</span>
          <Code>https://juicewrldapi.com/juicewrld</Code>
        </div>
        <a
          href="https://juicewrldapi.com/api-docs"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
        >
          Open live API docs <ExternalLink size={11} />
        </a>
      </Section>

      <Section title="Endpoint Overview">
        <div className="divide-y divide-[var(--border)]">
          <Endpoint method="GET" path="/songs/" description="List, filter, search and paginate songs" />
          <Endpoint method="GET" path="/songs/{id}/" description="Single song by internal ID" />
          <Endpoint method="GET" path="/categories/" description="Available category values with labels" />
          <Endpoint method="GET" path="/eras/" description="All eras — paginated (34 total, 20 per page)" />
          <Endpoint method="GET" path="/stats/" description="Database-wide counts by category and era" />
          <Endpoint method="GET" path="/radio/random/" description="Random playable song with full metadata" />
          <Endpoint method="GET" path="/files/browse/" description="Browse the file system" />
          <Endpoint method="GET" path="/files/info/" description="Metadata for a single file" />
          <Endpoint method="GET" path="/files/cover-art/" description="Cover art image for an audio file" />
          <Endpoint method="GET" path="/files/download/" description="Stream/download audio — supports Range requests" />
          <Endpoint method="GET" path="/versions/" description="All song-version rows (bulk mode via ?all=true)" />
          <Endpoint method="GET" path="/versions/{song_id}/" description="Version row for one song, if linked" />
          <Endpoint method="POST" path="/versions/" description="Link a song into a version group (editor+)" />
          <Endpoint method="PATCH" path="/versions/{song_id}/" description="Update a song's version label/title/group (editor+)" />
          <Endpoint method="POST" path="/playlists/share/" description="Create a public shared playlist link" />
          <Endpoint method="GET" path="/playlists/shared/{share_id}/" description="Fetch a shared playlist by ID" />
          <Endpoint method="POST" path="/plays/" description="Record a play event (no auth required)" />
          <Endpoint method="GET" path="/accounts/account/me/" description="Current user info (public-facing), incl. user_preferences + playlist_folders" />
          <Endpoint method="PATCH" path="/accounts/account/me/" description="Update user_preferences and/or playlist_folders" />
          <Endpoint method="GET" path="/accounts/me/" description="Current user with role — editor/admin dashboards" />
          <Endpoint method="POST" path="/feedback/" description="Submit API feedback (no auth)" />
          <Endpoint method="POST" path="/reports/" description="Report wrong info on a song (no auth)" />
          <Endpoint method="GET" path="/reports/" description="List song reports (editor+)" />
          <Endpoint method="PATCH" path="/reports/{id}/" description="Review a song report (editor+)" />
          <Endpoint method="POST" path="/accounts/logout/" description="Invalidate the current token" />
          <Endpoint method="GET" path="/accounts/application/" description="Fetch the logged-in user's editor application" />
          <Endpoint method="POST" path="/accounts/application/" description="Apply to become an editor" />
          <Endpoint method="GET" path="/accounts/editor/proposals/" description="List your own edit proposals" />
          <Endpoint method="POST" path="/accounts/editor/proposals/" description="Submit an edit proposal (editor+)" />
          <Endpoint method="PATCH" path="/accounts/editor/proposals/{id}/" description="Edit a pending proposal" />
          <Endpoint method="DELETE" path="/accounts/editor/proposals/{id}/" description="Withdraw a proposal" />
          <Endpoint method="GET" path="/accounts/editor/leaderboard/" description="Editor approved-count leaderboard with badges" />
          <Endpoint method="GET" path="/library/favorites/" description="List personal favorites (any logged-in user)" />
          <Endpoint method="POST" path="/library/favorites/" description="Add a favorite" />
          <Endpoint method="DELETE" path="/library/favorites/{song_id}/" description="Remove a favorite" />
          <Endpoint method="GET" path="/library/playlists/" description="List personal playlists" />
          <Endpoint method="POST" path="/library/playlists/" description="Create a personal playlist" />
          <Endpoint method="GET" path="/library/playlists/{id}/" description="Get a personal playlist with tracks" />
          <Endpoint method="PATCH" path="/library/playlists/{id}/" description="Update name, description, cover, visibility, track order" />
          <Endpoint method="DELETE" path="/library/playlists/{id}/" description="Delete a personal playlist" />
          <Endpoint method="POST" path="/library/playlists/{id}/items/" description="Add a track to a playlist" />
          <Endpoint method="DELETE" path="/library/playlists/{id}/items/{song_id}/" description="Remove a track from a playlist" />
          <Endpoint method="GET" path="/library/playlists/public/{id}/" description="Fetch a playlist marked public — no auth required" />
        </div>
      </Section>

      <Section title="Songs Object — Full Shape">
        <Pre>{`{
  "id": 1,
  "public_id": 123,
  "name": "Song Title",
  "original_key": "Original JSON Key",
  "category": "released|unreleased|unsurfaced|recording_session",
  "path": "Compilation/folder/song.mp3",
  "era": {
    "id": 1,
    "name": "Era Name",
    "description": "Era Description",
    "time_frame": "Time Period",
    "play_count": 0
  },
  "track_titles": ["Title 1", "Title 2"],
  "credited_artists": "Artist Names",
  "producers": "Producer Names",
  "engineers": "Engineer Names",
  "recording_locations": "Studio Locations",
  "record_dates": "Recording Dates",
  "length": "3:59",
  "bitrate": "Bitrate Info",
  "additional_information": "Extra Info",
  "file_names": "File Name(s)",
  "instrumentals": "Instrumental beat name",
  "instrumental_names": "Instrumental track names",
  "preview_date": "Preview Date",
  "release_date": "Release Date",
  "dates": "Additional Dates",
  "session_titles": "Session Titles",
  "session_tracking": "Session Tracking",
  "notes": "Internal notes",
  "groupbuy_info": {
    "additional_info": "",
    "price": "",
    "start_date": "",
    "end_date": "",
    "blind": false,
    "finished": false,
    "surfaced_with_og": false
  },
  "lyrics": "Song Lyrics",
  "synced_lyrics": "Timestamped lyrics (karaoke-style)",
  "album": "Album Name",
  "snippets": [],
  "date_leaked": "Leak Date",
  "leak_type": "Leak Type",
  "image_url": "/assets/era-image.webp",
  "version_title": "Version label (only with ?versions=true on /songs/)",
  "versions": []
}`}</Pre>
        <p className="text-xs text-text-muted">
          <Code>image_url</Code> is relative — prepend <Code>https://juicewrldapi.com</Code> before use.
        </p>
        <p className="text-xs text-text-muted">
          <Code>version_title</Code> / <Code>versions</Code> are omitted unless the request includes <Code>?versions=true</Code> — see the <Code>/songs/</Code> params below.
        </p>
      </Section>
    </div>
  )
}

function SongsTab() {
  return (
    <div className="space-y-6">
      <Section title="GET /songs/ — List & Search">
        <p className="text-sm text-text-secondary">Paginated song list with rich filtering. All params are optional.</p>
        <Table
          headers={['Param', 'Type', 'Description']}
          rows={[
            [<Code>page</Code>, 'number', 'Page number (default: 1)'],
            [<Code>page_size</Code>, 'number', 'Results per page (default: 20)'],
            [<Code>category</Code>, 'string', <><Code>released</Code>, <Code>unreleased</Code>, <Code>unsurfaced</Code>, <Code>recording_session</Code></>],
            [<Code>era</Code>, 'string', 'Era abbreviation e.g. "GB&GR", "DRFL", "WOD", "OUT", "POST" — use name from /eras/'],
            [<Code>search</Code>, 'string', 'Search names, artists, track titles (normalizes special chars — "dont" matches "don\'t")'],
            [<Code>searchall</Code>, 'string', 'Search names, artists, producers, track titles'],
            [<Code>lyrics</Code>, 'string', 'Full-text search within lyrics content'],
            [<Code>file_names_array</Code>, 'string', '"true" to return file_names as array instead of string'],
            [<Code>versions</Code>, 'string', <>"true" to add <Code>version_title</Code> and a <Code>versions</Code> array to each song. Collection endpoint only — <Code>{'/songs/{id}/'}</Code> ignores it.</>],
          ]}
        />
        <p className="text-xs text-text-muted font-semibold mt-2">Response shape:</p>
        <Pre>{`{
  "count": 1234,
  "next": "https://juicewrldapi.com/juicewrld/songs/?page=2",
  "previous": null,
  "results": [ /* Song objects */ ]
}`}</Pre>
      </Section>

      <Section title="GET /songs/{id}/ — Single Song">
        <p className="text-sm text-text-secondary">Returns a full song object by internal ID (<Code>song.id</Code>, not <Code>public_id</Code>).</p>
      </Section>

      <Section title="GET /categories/">
        <Pre>{`{
  "categories": [
    { "value": "released",          "label": "Released" },
    { "value": "unreleased",        "label": "Unreleased" },
    { "value": "unsurfaced",        "label": "Unsurfaced" },
    { "value": "recording_session", "label": "Recording Session" }
  ]
}`}</Pre>
      </Section>

      <Section title="GET /eras/">
        <p className="text-sm text-text-secondary">Paginated — same envelope as /songs/. 34 eras total. Era names use short abbreviation strings.</p>
        <Pre>{`{
  "count": 34,
  "next": "http://juicewrldapi.com/juicewrld/eras/?page=2",
  "previous": null,
  "results": [
    { "id": 101, "name": "jute",        "description": "JUICED UP THE EP era (~2014-February 2017)", "time_frame": "(January 2014-February 2017)", "play_count": 2980 },
    { "id": 103, "name": "afflictions", "description": "Affliction era (February 2017-May 2017)",    "time_frame": "(February 2017-May 2017)",   "play_count": 1398 },
    { "id": 105, "name": "jw 999",      "description": "Juice WRLD 999 era (May 2017-May 2018)",     "time_frame": "(May 2017-May 2018)",        "play_count": 1389 },
    { "id": 108, "name": "GB&GR",       "description": "Goodbye & Good Riddance era",                "time_frame": "(December 2017-May 2018)",   "play_count": 15485 },
    { "id": 109, "name": "WOD",         "description": "WRLD On Drugs era",                          "time_frame": "(August 2018-December 2018)", "play_count": 11228 },
    { "id": 110, "name": "DRFL",        "description": "Death Race For Love era",                    "time_frame": "(May 2018-March 2019)",      "play_count": 11040 },
    { "id": 111, "name": "OUT",         "description": "Outsiders era",                              "time_frame": "(March 2019-December 2019)", "play_count": 13729 },
    { "id": 112, "name": "POST",        "description": "Posthumous era",                             "time_frame": "(December 2019-Present)",    "play_count": 3660 }
    // ... 34 total
  ]
}`}</Pre>
        <p className="text-xs text-text-muted mt-1">
          Pass <Code>name</Code> as the <Code>era</Code> filter param on /songs/ — e.g. <Code>era=GB%26GR</Code>.
        </p>
      </Section>

      <Section title="GET /stats/">
        <Pre>{`{
  "total_songs": 2452,
  "category_stats": {
    "released":          320,
    "unreleased":        1462,
    "unsurfaced":        269,
    "recording_session": 401
  },
  "era_stats": {
    "GB&GR":       574,
    "OUT":         312,
    "POST":        369,
    "WOD":         488,
    "DRFL":        326,
    "Mainstream":  63,
    "jute":        37
    // ... one key per era
  }
}`}</Pre>
        <p className="text-xs text-text-muted">Era keys in <Code>era_stats</Code> match the <Code>name</Code> field from <Code>/eras/</Code>.</p>
      </Section>

      <Section title="GET /radio/random/">
        <p className="text-sm text-text-secondary">Returns a random playable song with full metadata and stream path.</p>
        <Pre>{`{
  "id": "Compilation/1. Released Discography/.../song.mp3",
  "title": "Song Title",
  "path": "Compilation/1. Released Discography/.../song.mp3",
  "size": 5195736,
  "modified": "2025-10-18T19:19:53.784271",
  "hash": "d199a85e510b32b9ef3c02a29044a41d",
  "song": { /* Full song object */ }
}`}</Pre>
      </Section>
    </div>
  )
}

function FilesTab() {
  return (
    <div className="space-y-6">
      <Section title="GET /files/browse/ — Directory Listing">
        <Table
          headers={['Param', 'Required', 'Description']}
          rows={[
            [<Code>path</Code>, 'No', 'Directory path relative to compilation root'],
            [<Code>search</Code>, 'No', 'Filter items by name (e.g. ".mp3")'],
          ]}
        />
      </Section>

      <Section title="GET /files/info/ — File Metadata">
        <Table
          headers={['Param', 'Required', 'Description']}
          rows={[
            [<Code>path</Code>, 'Yes', 'File path relative to compilation root'],
          ]}
        />
      </Section>

      <Section title="GET /files/cover-art/ — Cover Art Image">
        <Table
          headers={['Param', 'Required', 'Description']}
          rows={[
            [<Code>path</Code>, 'Yes', 'Audio file path relative to compilation root'],
          ]}
        />
      </Section>

      <Section title="GET /files/download/ — Audio Stream">
        <p className="text-sm text-text-secondary">
          The primary audio streaming endpoint. Supports HTTP Range requests — the browser{' '}
          <Code>{'<audio>'}</Code> element handles seeking automatically when you set <Code>src</Code>.
        </p>
        <Table
          headers={['Param', 'Required', 'Description']}
          rows={[
            [<Code>path</Code>, 'Yes', 'File path relative to compilation root'],
          ]}
        />
        <p className="text-xs text-text-muted font-semibold mt-3">Simple playback:</p>
        <Pre>{`<audio
  controls
  src={\`https://juicewrldapi.com/juicewrld/files/download/?path=\${encodeURIComponent(song.path)}\`}
/>`}</Pre>
        <p className="text-xs text-text-muted font-semibold mt-3">Manual Range request (for custom seeking):</p>
        <Pre>{`fetch(
  \`https://juicewrldapi.com/juicewrld/files/download/?path=\${encodeURIComponent(path)}\`,
  { headers: { Range: 'bytes=0-1048575' } }
)
// Returns 206 Partial Content with Content-Range header`}</Pre>
        <p className="text-xs text-text-muted mt-2">Responses: <Code>200 OK</Code> full file · <Code>206 Partial Content</Code> range</p>
      </Section>

      <Section title="ZIP Operations">
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-2 mb-1"><Badge color="post">POST</Badge><code className="text-xs font-mono text-text-primary">/start-zip-job/</code></div>
            <p className="text-xs text-text-muted">Start a background ZIP job. Returns a <Code>job_id</Code> for polling.</p>
            <Pre>{`{ "paths": ["Compilation/song1.mp3", "Compilation/song2.mp3"] }`}</Pre>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1"><Badge color="get">GET</Badge><code className="text-xs font-mono text-text-primary">/zip-job-status/{'{job_id}'}/ </code></div>
            <p className="text-xs text-text-muted">Poll ZIP job progress.</p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1"><Badge color="post">POST</Badge><code className="text-xs font-mono text-text-primary">/cancel-zip-job/{'{job_id}'}/ </code></div>
            <p className="text-xs text-text-muted">Cancel an in-progress ZIP job.</p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1"><Badge color="post">POST</Badge><code className="text-xs font-mono text-text-primary">/files/zip-selection/</code></div>
            <p className="text-xs text-text-muted">Immediate ZIP stream (not background).</p>
            <Pre>{`{ "paths": ["Compilation/Folder"] }`}</Pre>
          </div>
        </div>
      </Section>
    </div>
  )
}

function PlaylistsTab() {
  return (
    <div className="space-y-6">
      <Section title="Shared Playlists (no auth required)">
        <p className="text-sm text-text-secondary">
          Public, anonymous-link playlists. Anyone with the share ID can read them.
        </p>
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-2 mb-1"><Badge color="post">POST</Badge><code className="text-xs font-mono text-text-primary">/playlists/share/</code></div>
            <Pre>{`// Request
{ "paths": ["Compilation/song1.mp3", "Compilation/song2.mp3"] }

// Response
{ "share_id": "abc123..." }`}</Pre>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1"><Badge color="get">GET</Badge><code className="text-xs font-mono text-text-primary">/playlists/shared/{'{share_id}'}/ </code></div>
            <p className="text-xs text-text-muted">Full shared playlist with all track metadata.</p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1"><Badge color="get">GET</Badge><code className="text-xs font-mono text-text-primary">/playlists/shared/{'{share_id}'}/info/</code></div>
            <p className="text-xs text-text-muted">Lightweight preview — name + track count without full fetch.</p>
          </div>
        </div>
      </Section>

      <Section title="Personal Library Playlists (auth required)">
        <p className="text-sm text-text-secondary">
          Private, account-synced playlists. Any logged-in user (including standard accounts) can use these — does not require editor role.
        </p>
        <Table
          headers={['Method', 'Path', 'Description']}
          rows={[
            ['GET', '/library/playlists/', 'List all playlists for logged-in user (supports ?omit_cover_image=true)'],
            ['POST', '/library/playlists/', 'Create a playlist'],
            ['GET', '/library/playlists/{id}/', 'Get playlist with full track list'],
            ['PATCH', '/library/playlists/{id}/', 'Update name, description, cover, visibility, or reorder tracks'],
            ['DELETE', '/library/playlists/{id}/', 'Delete a playlist'],
            ['POST', '/library/playlists/{id}/items/', 'Add a track'],
            ['DELETE', '/library/playlists/{id}/items/{song_id}/', 'Remove a track'],
          ]}
        />
        <p className="text-xs text-text-muted mt-2">
          <Code>?omit_cover_image=true</Code> drops the (large, base64) <Code>cover_image</Code> field from the response — use it for
          list views that only need <Code>cover_image_url</Code>.
        </p>
        <p className="text-xs text-text-muted font-semibold mt-3">Create:</p>
        <Pre>{`POST /library/playlists/
Authorization: Token <token>

{
  "name": "My Playlist",
  "description": "optional",
  "cover_image": undefined  // optional base64 string
}`}</Pre>
        <p className="text-xs text-text-muted font-semibold mt-3">Update (all fields optional, including track reorder):</p>
        <Pre>{`PATCH /library/playlists/{id}/

{
  "name": "New name",
  "description": "New description",
  "cover_image": "",         // base64, or "" to clear
  "is_public": true,         // toggle public sharing (see below)
  "order": [123, 456, 789]  // song IDs in desired order
}`}</Pre>
        <p className="text-xs text-text-muted font-semibold mt-3">List response — each item:</p>
        <Pre>{`{
  "id": 1,
  "name": "My Playlist",
  "description": "optional",
  "cover_image": "...",
  "cover_image_url": "...",  // fallback to first track image_url
  "track_count": 12,
  "is_public": false,
  "created_at": "...",
  "updated_at": "..."
}`}</Pre>
        <p className="text-xs text-text-muted font-semibold mt-3">Detail response — same fields plus <Code>items[]</Code>:</p>
        <Pre>{`{
  "id": 1,
  "name": "My Playlist",
  "is_public": false,
  "items": [
    {
      "id": 501,
      "position": 0,
      "added_at": "...",
      "song": {
        "id": 123, "public_id": 163, "name": "Maze",
        "path": "Compilation/.../Maze.mp3",
        "length": "2:24", "credited_artists": "Juice WRLD",
        "category": "released", "album": "...",
        "image_url": "/assets/drfl.png",
        "era": { /* era object */ },
        "lyrics": "...", "synced_lyrics": "..."
      }
    }
  ]
}`}</Pre>
        <p className="text-xs text-text-muted mt-2">The song object in playlist items is a trimmed shape — no <Code>producers</Code>, <Code>engineers</Code>, or <Code>bitrate</Code>.</p>
      </Section>

      <Section title="Public Library Playlists (no auth required)">
        <p className="text-sm text-text-secondary">
          A personal library playlist with <Code>is_public: true</Code> can be fetched anonymously by its numeric{' '}
          <Code>id</Code> — distinct from the ephemeral, no-account "Shared Playlists" above. Toggle visibility via{' '}
          <Code>{'PATCH /library/playlists/{id}/'}</Code> with <Code>{'{ "is_public": true }'}</Code>.
        </p>
        <Table
          headers={['Method', 'Path', 'Description']}
          rows={[
            ['GET', '/library/playlists/public/{id}/', 'Full playlist detail (same shape as the authed detail response)'],
          ]}
        />
        <p className="text-xs text-text-muted mt-2">Making a playlist public does not change its owner or contents — it only exposes this read-only endpoint.</p>
      </Section>

      <Section title="Favorites (auth required)">
        <Table
          headers={['Method', 'Path', 'Description']}
          rows={[
            ['GET', '/library/favorites/', 'List favorite tracks'],
            ['POST', '/library/favorites/', 'Add a favorite — body: { song_id }'],
            ['DELETE', '/library/favorites/{song_id}/', 'Remove a favorite'],
          ]}
        />
      </Section>
    </div>
  )
}

function AuthTab() {
  return (
    <div className="space-y-6">
      <Section title="Roles">
        <Table
          headers={['Role', 'role string', 'is_editor', 'is_administrator']}
          rows={[
            ['Standard', <Code>applicant</Code>, '—', '—'],
            ['Editor', <Code>editor</Code>, '✓', '—'],
            ['Admin', <Code>administrator</Code>, '✓', '✓'],
          ]}
        />
        <p className="text-xs text-text-muted mt-2">
          New Discord users start as <Code>applicant</Code>. Editors are promoted after application approval. Admins are assigned manually.
          Admins always have <Code>is_editor: true</Code>.
        </p>
        <p className="text-xs text-text-muted font-semibold mt-3">Attach token to every authenticated request:</p>
        <Pre>{`Authorization: Token YOUR_TOKEN_HERE`}</Pre>
      </Section>

      <Section title="Discord Login (recommended)">
        <ol className="space-y-3 text-sm text-text-secondary list-decimal list-inside">
          <li><code className="text-accent font-mono text-xs">GET /accounts/auth/discord/url/</code> → returns <Code>authorize_url</Code> and <Code>state</Code></li>
          <li>Redirect the user through Discord OAuth using <Code>authorize_url</Code></li>
          <li>Exchange the code Discord returns:</li>
        </ol>
        <Pre>{`POST /accounts/auth/discord/exchange/

{
  "code": "discord_auth_code",
  "state": "state_from_step_1",
  "redirect_uri": "https://your-app.com/callback"
}

// Response includes token + user object`}</Pre>
        <p className="text-xs text-text-muted">Store the token and attach it as <Code>Authorization: Token &lt;token&gt;</Code> on subsequent requests.</p>
      </Section>

      <Section title="Logout">
        <Pre>{`POST /accounts/logout/
Authorization: Token <token>`}</Pre>
        <p className="text-xs text-text-muted">Invalidates the token server-side. Clear the locally stored token regardless of whether this call succeeds.</p>
      </Section>

      <Section title="Admin Login">
        <p className="text-sm text-text-secondary">Username/password — administrators only. Not needed for a public music player.</p>
        <Pre>{`POST /accounts/login/

{
  "token": "abc123...",
  "profile": { "role": "administrator", "is_editor": true, "is_administrator": true },
  "requires_otp_setup": false
}`}</Pre>
      </Section>

      <Section title="Who Am I — Two Endpoints">
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1"><Badge color="get">GET</Badge><code className="text-xs font-mono text-text-primary">/accounts/account/me/</code></div>
            <p className="text-xs text-text-muted mb-2">Public-facing. No <Code>role</Code> string — booleans only. Use this for music player UI gating.</p>
            <Pre>{`{
  "id": 42,
  "display_name": "someuser",
  "discord_id": "123456789",
  "discord_username": "someuser",
  "discord_avatar": "https://cdn.discordapp.com/avatars/...",
  "is_editor": false,
  "is_administrator": false,
  "otp_enabled": false,
  "user_preferences": [
    { "song": 94086, "cover_url": "https://...", "name": "Custom title", "default_version": "v1", "playcount": 12 }
  ],
  "playlist_folders": [
    { "id": "f1", "name": "Favorites", "playlist_ids": [12, 34] }
  ]
}`}</Pre>
            <p className="text-xs text-text-muted mt-2">
              Also mounted at <Code>/juicewrld/accounts/account/me/</Code> (same handler, different prefix).
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1"><Badge color="patch">PATCH</Badge><code className="text-xs font-mono text-text-primary">/accounts/account/me/</code></div>
            <p className="text-xs text-text-muted mb-2">
              Updates the logged-in user&apos;s own <Code>user_preferences</Code> and/or <Code>playlist_folders</Code> blobs. Send
              the whole array for whichever field you&apos;re updating — this replaces it, it doesn&apos;t merge entries.
            </p>
            <Pre>{`PATCH /accounts/account/me/
Authorization: Token <token>

{
  "user_preferences": [
    { "song": 94086, "cover_url": null, "name": "Custom title", "default_version": null, "playcount": 12 }
  ],
  "playlist_folders": [
    { "id": "f1", "name": "Favorites", "playlist_ids": [12, 34] }
  ]
}`}</Pre>
            <Table
              headers={['Field', 'Limit', 'Description']}
              rows={[
                [<Code>user_preferences</Code>, 'max 500 items', <>Per-song overrides — <Code>song</Code>, <Code>cover_url</Code>, <Code>name</Code>, <Code>default_version</Code>, <Code>playcount</Code>. All fields but <Code>song</Code> are optional/nullable.</>],
                [<Code>playlist_folders</Code>, 'max 200 folders, 500 playlist ids each', <><Code>id</Code>, <Code>name</Code>, <Code>playlist_ids</Code> (array of int playlist IDs).</>],
              ]}
            />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1"><Badge color="get">GET</Badge><code className="text-xs font-mono text-text-primary">/accounts/me/</code></div>
            <p className="text-xs text-text-muted mb-2">Editor/admin dashboards. Includes raw <Code>role</Code> string and extra stats.</p>
            <Pre>{`{
  "username": "discord_123456789",
  "role": "applicant",
  "is_editor": false,
  "is_administrator": false,
  "is_superuser": false,
  "otp_enabled": false,
  "discord_id": "123456789",
  "discord_username": "someuser",
  "discord_avatar": "https://cdn.discordapp.com/avatars/...",
  "approved_count": 0,
  "badges": []
}`}</Pre>
          </div>
        </div>
      </Section>

      <Section title="Permission Matrix">
        <Table
          headers={['Access Level', 'Endpoints']}
          rows={[
            ['No login', 'Songs, eras, categories, files, radio, stats, shared playlists, play tracking, feedback, report submission'],
            ['Any logged-in user', '/account/me/ (incl. PATCH), /application/, /library/*'],
            ['Editor or admin', '/me/, /editor/proposals/, /editor/leaderboard/, /badges/, /reports/ (read + review)'],
            ['Admin only', '/admin/users/, /admin/proposals/, /admin/applications/'],
            ['Beta code (X-Beta-Code)', '/beta/versions, /beta/download — independent of the token/role system'],
          ]}
        />
        <p className="text-xs text-text-muted mt-2">
          A 403 response means insufficient role — message text is typically{' '}
          <Code>"Editor access required."</Code> or <Code>"Administrator access required."</Code>.
        </p>
      </Section>

      <Section title="Edit Proposals (Editor+)">
        <Table
          headers={['Method', 'Path', 'Description']}
          rows={[
            ['GET', '/accounts/editor/proposals/', "List the logged-in editor's own proposals"],
            ['POST', '/accounts/editor/proposals/', 'Submit a new proposal'],
            ['PATCH', '/accounts/editor/proposals/{id}/', 'Edit a still-pending proposal'],
            ['DELETE', '/accounts/editor/proposals/{id}/', 'Withdraw a proposal'],
          ]}
        />
        <p className="text-xs text-text-muted">
          <Code>change_type</Code> is <Code>"create"</Code>, <Code>"update"</Code>, or <Code>"delete"</Code> — <Code>"update"</Code> is by far the most common in practice.
        </p>
        <Pre>{`POST /accounts/editor/proposals/
Authorization: Token <token>
Content-Type: application/json

{
  "change_type": "update",
  "song": 94086,
  "title": "Song Title",
  "editor_notes": "",
  "proposed_data": {
    "lyrics": "..."
  }
}`}</Pre>
        <Table
          headers={['Field', 'Type', 'Description']}
          rows={[
            [<Code>change_type</Code>, 'string', '"create" | "update" | "delete"'],
            [<Code>song</Code>, 'number | null', 'Internal song ID (song.id, not public_id) — null for a "create" proposal'],
            [<Code>title</Code>, 'string', 'Song title for display purposes'],
            [<Code>editor_notes</Code>, 'string', 'Optional notes from the editor'],
            [<Code>proposed_data</Code>, 'object', 'Only the fields being changed'],
          ]}
        />
        <p className="text-xs text-text-muted">
          To re-submit a stale/stuck pending proposal, <Code>DELETE</Code> it then <Code>POST</Code> the same data again as a fresh proposal (there's no separate "resubmit" endpoint).
        </p>
        <p className="text-xs text-text-muted font-semibold mt-3">Proposal object shape:</p>
        <Pre>{`{
  "id": 167,
  "editor_username": "freakypallet",
  "editor_id": 12,
  "song": 94086,
  "song_public_id": 163,
  "change_type": "update",
  "title": "Song Title",
  "proposed_data": { "lyrics": "..." },
  "original_proposed_data": { "lyrics": "..." },
  "applied_data": {},
  "revised_by_admin": false,
  "original_snapshot": { /* Full song fields at time of proposal */ },
  "editor_notes": "",
  "status": "pending",
  "reviewer_username": null,
  "review_notes": "",
  "edit_count": 0,
  "last_edited_at": null,
  "created_at": "2026-06-16T22:07:24.970047Z",
  "reviewed_at": null
}`}</Pre>
        <p className="text-xs text-text-muted"><Code>status</Code> is one of <Code>pending</Code>, <Code>approved</Code>, <Code>rejected</Code>, <Code>reversed</Code>.</p>
      </Section>

      <Section title="Editor Applications">
        <p className="text-sm text-text-secondary">How a standard user applies to become an editor.</p>
        <Table
          headers={['Method', 'Path', 'Description']}
          rows={[
            ['GET', '/accounts/application/', "Fetch the logged-in user's own application (null if none)"],
            ['POST', '/accounts/application/', 'Submit an application'],
          ]}
        />
        <Pre>{`POST /accounts/application/

{
  "display_name": "optional",
  "contact": "optional",
  "experience": "optional",
  "motivation": "required — why you want editor access",
  "areas": "optional"
}`}</Pre>
        <p className="text-xs text-text-muted"><Code>status</Code> on the returned application is <Code>pending</Code>, <Code>approved</Code>, or <Code>rejected</Code>.</p>
      </Section>

      <Section title="Editor Leaderboard">
        <div className="flex items-center gap-2 mb-1"><Badge color="get">GET</Badge><code className="text-xs font-mono text-text-primary">/accounts/editor/leaderboard/</code></div>
        <p className="text-xs text-text-muted mb-2">Ranked by approved proposal count. No auth required to view.</p>
        <Pre>{`[
  {
    "rank": 1,
    "user_id": 12,
    "username": "freakypallet",
    "discord_username": "freakypallet",
    "discord_avatar": "https://cdn.discordapp.com/avatars/...",
    "approved_count": 214,
    "badges": [
      {
        "slug": "hundred-club",
        "name": "100 Club",
        "description": "100 approved edits",
        "icon": "🏅",
        "category": "milestone",
        "note": "",
        "awarded_at": "...",
        "awarded_by_username": null
      }
    ]
  }
]`}</Pre>
      </Section>

      <Section title="Play Tracking">
        <p className="text-sm text-text-secondary">Record a listen event — no auth required. Call when a track starts (or after e.g. 30 s).</p>
        <Pre>{`POST /juicewrld/plays/`}</Pre>
      </Section>

      <Section title="Feedback">
        <div className="flex items-center gap-2 mb-1"><Badge color="post">POST</Badge><code className="text-xs font-mono text-text-primary">/juicewrld/feedback/</code></div>
        <p className="text-xs text-text-muted mb-2">General API/app feedback. No auth required. Forwards to a webhook + the mod server.</p>
        <Pre>{`{
  "message": "required",
  "contact": "optional"
}`}</Pre>
        <p className="text-xs text-text-muted">Throttled at <Code>10/min</Code>.</p>
      </Section>

      <Section title="Song Reports">
        <p className="text-sm text-text-secondary">
          Public-facing way to flag wrong/missing info on a specific song. Submissions go to the DB and are forwarded
          to the mod server via webhook; editors triage them from the queue.
        </p>
        <Table
          headers={['Method', 'Path', 'Access', 'Description']}
          rows={[
            ['POST', '/juicewrld/reports/', 'No auth', 'Submit a report'],
            ['GET', '/juicewrld/reports/', 'Editor+', 'List reports — filter: ?status=pending|resolved'],
            ['PATCH', '/juicewrld/reports/{id}/', 'Editor+', 'Set status/review_notes (records reviewer + time)'],
          ]}
        />
        <p className="text-xs text-text-muted font-semibold mt-3">Create:</p>
        <Pre>{`POST /juicewrld/reports/

{
  "song_id": 94086,     // or "public_id": 163 — one of the two, not both
  "message": "required — what's wrong",
  "contact": "optional"
}`}</Pre>
        <p className="text-xs text-text-muted">Throttled at <Code>10/min</Code>.</p>
        <p className="text-xs text-text-muted font-semibold mt-3">Review:</p>
        <Pre>{`PATCH /juicewrld/reports/{id}/
Authorization: Token <token>

{
  "status": "resolved",     // "pending" | "resolved"
  "review_notes": "optional"
}`}</Pre>
      </Section>

      <Section title="Beta App (installer gating)" defaultOpen={false}>
        <p className="text-sm text-text-secondary">
          Gates access to in-development desktop builds behind a beta code, separate from the public token/role
          system above — auth here is the <Code>X-Beta-Code</Code> header, not <Code>Authorization: Token</Code>.
        </p>
        <Table
          headers={['Method', 'Path', 'Auth', 'Description']}
          rows={[
            ['GET', '/beta/unlock?code=X', 'None', <>Check a code — returns <Code>{'{ "valid": true|false }'}</Code></>],
            ['GET', '/beta/versions', <Code>X-Beta-Code</Code>, 'List active beta builds (401 if the code is invalid)'],
            ['GET', '/beta/download?version=X', <Code>X-Beta-Code</Code>, 'Stream the installer for that build (401/404)'],
          ]}
        />
        <Pre>{`GET /beta/versions
X-Beta-Code: YOUR_CODE`}</Pre>
      </Section>

      <Section title="Admin: User Lookup" defaultOpen={false}>
        <Table
          headers={['Method', 'Path', 'Description']}
          rows={[
            ['GET', '/accounts/admin/users/', 'List all users. Filter: ?role=editor|administrator|applicant'],
            ['GET', '/accounts/admin/users/{user_id}/', 'Single user detail — role, is_active, Discord info, proposal counts, badges'],
            ['PATCH', '/accounts/admin/users/{user_id}/', 'Update role, is_active, or auto_approve_proposals'],
          ]}
        />
        <Pre>{`PATCH /accounts/admin/users/{user_id}/

{
  "role": "editor",             // "editor" | "applicant"
  "is_active": true,
  "auto_approve_proposals": false
}`}</Pre>
        <p className="text-xs text-text-muted">Requires admin token (<Code>is_administrator: true</Code>).</p>
      </Section>

      <Section title="Admin: Proposal Review" defaultOpen={false}>
        <Table
          headers={['Method', 'Path', 'Description']}
          rows={[
            ['GET', '/accounts/admin/proposals/', 'List all proposals. Filter: ?status=pending|approved|rejected|reversed'],
            ['POST', '/accounts/admin/proposals/{id}/review/', 'Approve, reject, or revise-and-approve a proposal'],
            ['POST', '/accounts/admin/proposals/{id}/reverse/', 'Reverse a previously approved proposal'],
          ]}
        />
        <Pre>{`POST /accounts/admin/proposals/{id}/review/

{
  "action": "approve",          // "approve" | "reject" | "revise"
  "review_notes": "optional",
  "revised_data": { }           // only for action: "revise" — overrides proposed_data
}`}</Pre>
      </Section>

      <Section title="Admin: Applications" defaultOpen={false}>
        <Table
          headers={['Method', 'Path', 'Description']}
          rows={[
            ['GET', '/accounts/admin/applications/', 'List editor applications. Filter: ?status=pending|approved|rejected'],
            ['POST', '/accounts/admin/applications/{id}/review/', 'Approve or reject an application'],
          ]}
        />
        <Pre>{`POST /accounts/admin/applications/{id}/review/

{
  "action": "approve",          // "approve" | "reject"
  "review_notes": "optional"
}`}</Pre>
        <p className="text-xs text-text-muted">Approving promotes the applicant to <Code>editor</Code>.</p>
      </Section>

      <Section title="Two-Factor (OTP)" defaultOpen={false}>
        <Table
          headers={['Method', 'Path', 'Description']}
          rows={[
            ['GET', '/accounts/otp/setup/', 'Generate a new OTP secret + QR code for enrolling'],
            ['POST', '/accounts/otp/setup/', 'Confirm enrollment with a code from the authenticator app'],
          ]}
        />
        <Pre>{`// GET response
{
  "otp_enabled": false,
  "account_label": "someuser",
  "otp_secret": "JBSWY3DPEHPK3PXP",
  "provisioning_uri": "otpauth://totp/...",
  "qr_code": "data:image/png;base64,..."
}

// POST request
{ "otp_token": "123456" }
// Response: { "otp_enabled": true }`}</Pre>
      </Section>
    </div>
  )
}

function VersionsTab() {
  return (
    <div className="space-y-6">
      <Section title="What is the Versions API?">
        <p className="text-sm text-text-secondary leading-relaxed">
          Groups multiple song rows together as versions of the same underlying track — e.g. a released mix and a
          leaked earlier take, or several titled variants like &quot;v1&quot;, &quot;v2&quot;, &quot;TV Mix&quot;.
          Each row links one <Code>song_id</Code> to a shared <Code>group_id</Code>; every song in a group shares
          the same <Code>title</Code> (the display name for the group, e.g. &quot;She&apos;s The One&quot;), while
          each song keeps its own <Code>version</Code> label (e.g. &quot;v1&quot;) distinguishing it from its
          groupmates.
        </p>
        <p className="text-sm text-text-secondary leading-relaxed mt-2">
          Reads require no auth. Writes (<Code>POST</Code>/<Code>PATCH</Code>) require an editor or admin token.
        </p>
      </Section>

      <Section title="Version Row Shape">
        <Pre>{`{
  "id": 501,
  "song_id": 94086,
  "group_id": 94086,
  "version": "v1",
  "title": "She's The One",
  "created_at": "2026-03-04T12:00:00Z",
  "created_by": "freakypallet"
}`}</Pre>
        <p className="text-xs text-text-muted">
          <Code>group_id</Code> is just the <Code>song_id</Code> of whichever song originally anchored the group — it
          has no meaning beyond being a shared key. <Code>title</Code> is <Code>null</Code> until an editor names the
          group; <Code>version</Code> is <Code>null</Code> until an editor labels that specific song.
        </p>
      </Section>

      <Section title="GET /versions/{song_id}/ — This Song's Row">
        <p className="text-sm text-text-secondary">
          The one filtered read the API supports server-side. Returns the paginated envelope with 0 or 1 result —
          empty means the song isn&apos;t linked into any group.
        </p>
        <Pre>{`{
  "count": 1,
  "next": null,
  "previous": null,
  "results": [ { "id": 501, "song_id": 94086, "group_id": 94086, "version": "v1", "title": "She's The One", ... } ]
}`}</Pre>
      </Section>

      <Section title="GET /versions/ — All Rows">
        <p className="text-sm text-text-secondary">
          The list endpoint does <span className="font-semibold text-text-primary">not</span> apply query params
          (<Code>group_id</Code>, <Code>search</Code>, <Code>title</Code>) server-side — any filtering by group or
          title has to happen client-side. Pass <Code>?all=true</Code> to get every row in one response instead of
          paging through it (same bulk-mode convention <Code>/songs/</Code> supports).
        </p>
        <Pre>{`GET /versions/?all=true

// Response: a plain array (not the paginated envelope)
[
  { "id": 501, "song_id": 94086, "group_id": 94086, "version": "v1",   "title": "She's The One", ... },
  { "id": 502, "song_id": 94112, "group_id": 94086, "version": "v2",   "title": "She's The One", ... },
  { "id": 503, "song_id": 95230, "group_id": 95230, "version": null,   "title": null, ... }
]`}</Pre>
      </Section>

      <Section title="POST /versions/ — Create a Row (editor+)">
        <Pre>{`POST /versions/
Authorization: Token <token>
Content-Type: application/json

{
  "song_id": 94112,
  "group_id": 94086,
  "version": "v2",
  "title": "She's The One"
}`}</Pre>
        <p className="text-xs text-text-muted">
          Used both to link a previously-ungrouped song into an existing group and to seed a brand-new group
          (pass a <Code>group_id</Code> no other row uses yet — the app conventionally uses one of the two
          songs&apos; own <Code>song_id</Code>).
        </p>
      </Section>

      <Section title="PATCH /versions/{song_id}/ — Update a Row (editor+)">
        <Pre>{`PATCH /versions/{song_id}/
Authorization: Token <token>
Content-Type: application/json

{ "group_id": 94086, "title": "She's The One" }`}</Pre>
        <p className="text-xs text-text-muted">
          Any subset of <Code>group_id</Code>, <Code>version</Code>, <Code>title</Code> may be sent. There is no
          bulk-write endpoint — merging two groups or renaming a group&apos;s title means sending one
          <Code> PATCH</Code> per affected song.
        </p>
      </Section>

      <Section title="Common Operations (client-side recipes)">
        <ul className="space-y-3 text-sm text-text-secondary">
          <li>
            <span className="font-semibold text-text-primary">Link two ungrouped songs:</span> create two rows
            sharing a new <Code>group_id</Code> (e.g. the lower of the two song IDs).
          </li>
          <li>
            <span className="font-semibold text-text-primary">Add an ungrouped song to an existing group:</span>{' '}
            <Code>POST</Code> one row with that group&apos;s <Code>group_id</Code> and <Code>title</Code>.
          </li>
          <li>
            <span className="font-semibold text-text-primary">Merge two existing groups:</span> fetch every row in
            both groups (via <Code>?all=true</Code>), then <Code>PATCH</Code> every row in the losing group to the
            surviving <Code>group_id</Code> — and if only one side had a <Code>title</Code> set, <Code>PATCH</Code>{' '}
            that title onto every row in the merged group so all members agree.
          </li>
          <li>
            <span className="font-semibold text-text-primary">Rename a group&apos;s title:</span> <Code>PATCH</Code>{' '}
            <Code>{'{ title }'}</Code> onto every row whose <Code>group_id</Code> matches.
          </li>
        </ul>
      </Section>
    </div>
  )
}

function FetchPatternTab() {
  return (
    <div className="space-y-6">
      <Section title="Fetch Utility">
        <p className="text-sm text-text-secondary">Always use a utility function — never fetch inline in components.</p>
        <Pre>{`// lib/juicewrld.ts
const BASE = 'https://juicewrldapi.com/juicewrld'

export async function apiFetch(
  path: string,
  params: Record<string, string | number | undefined> = {},
  opts: { method?: string; token?: string; body?: unknown } = {}
) {
  const url = new URL(BASE + path)
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) url.searchParams.set(k, String(v))
  })
  const headers: Record<string, string> = {}
  if (opts.token) headers['Authorization'] = \`Token \${opts.token}\`
  if (opts.body)  headers['Content-Type'] = 'application/json'
  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  if (!res.ok) throw new Error(\`API error \${res.status}\`)
  return res.json()
}`}</Pre>
      </Section>

      <Section title="React Hook Pattern">
        <Pre>{`// hooks/useSongs.ts
import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/juicewrld'

export function useSongs({
  category, era, search, searchall, lyrics,
  page = 1, page_size = 20
} = {}) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    setLoading(true)
    apiFetch('/songs/', { category, era, search, searchall, lyrics, page, page_size })
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [category, era, search, searchall, lyrics, page, page_size])

  return { songs: data?.results ?? [], count: data?.count ?? 0, loading, error }
}`}</Pre>
      </Section>

      <Section title="Audio Streaming">
        <Pre>{`// Simple — browser handles range/seeking automatically
<audio
  controls
  src={\`https://juicewrldapi.com/juicewrld/files/download/?path=\${encodeURIComponent(song.path)}\`}
/>

// Tier check before rendering play button
{song.path && (
  <button onClick={() => playSong(song)}>▶</button>
)}`}</Pre>
      </Section>

      <Section title="Tips">
        <ul className="space-y-2 text-sm text-text-secondary">
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">•</span> Use <Code>song.path</Code> directly as the stream path — it's already in the right format.</li>
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">•</span> The browser <Code>{'<audio>'}</Code> element handles Range requests automatically — just set <Code>src</Code>.</li>
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">•</span> Debounce search inputs 300–500 ms to avoid hammering the API.</li>
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">•</span> <Code>track_titles</Code> is an array — a song may have multiple alternative titles. Show the first or let users pick.</li>
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">•</span> Not all songs have a <Code>path</Code> (some are metadata-only). Check before rendering a play button.</li>
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">•</span> <Code>image_url</Code> is relative — prepend <Code>https://juicewrldapi.com</Code>.</li>
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">•</span> Use <Code>/radio/random/</Code> for a shuffle/discover feature — it already returns a playable file.</li>
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">•</span> Check <Code>/account/me/</Code> first to know the role — don't probe restricted endpoints and handle 403s.</li>
        </ul>
      </Section>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────


// ─── 999 FM Tab ───────────────────────────────────────────────────────────────

function RadioTab() {
  return (
    <div className="space-y-6">
      <Section title="What is 999 FM?">
        <p className="text-sm text-text-secondary leading-relaxed">
          999 FM is the Juice WRLD API radio — a single endpoint that returns a random, fully playable song
          on every request. Named after Juice WRLD&apos;s 999 brand, it&apos;s designed for discover or continuous
          playback features: call it, stream the song, call it again for the next one.
        </p>
        <p className="text-sm text-text-secondary leading-relaxed mt-2">
          No authentication required. Returns a full song object plus the direct stream path.
        </p>
      </Section>

      <Section title="GET /radio/random/">
        <p className="text-sm text-text-secondary">Pick a random song from the full catalogue and return its stream path and metadata.</p>
        <Pre>{`GET https://juicewrldapi.com/juicewrld/radio/random/`}</Pre>
        <p className="text-xs text-text-muted mt-2">No parameters required. Every call returns a different song.</p>
        <div className="mt-4">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Response</p>
          <Pre>{`{
  "id":       "Compilation/2. Unreleased Discography/8. WOD (Sessions)/Maze.mp3",
  "title":    "Maze",
  "path":     "Compilation/2. Unreleased Discography/8. WOD (Sessions)/Maze.mp3",
  "size":     7381244,
  "modified": "2025-10-18T19:19:53.784271",
  "hash":     "d199a85e510b32b9ef3c02a29044a41d",
  "song": {
    "id": 95001,
    "public_id": 2232,
    "name": "Maze",
    "category": "unreleased",
    "era": { "id": 109, "name": "WOD", "description": "WRLD On Drugs era" },
    "path": "Compilation/2. Unreleased Discography/8. WOD (Sessions)/Maze.mp3",
    "credited_artists": "Juice WRLD",
    "length": "2:24",
    "lyrics": "...",
    "synced_lyrics": "...",
    "image_url": "/assets/wod.jpg"
    // ... all standard song fields
  }
}`}</Pre>
        </div>
        <Table
          headers={['Field', 'Type', 'Description']}
          rows={[
            [<Code>id</Code>, 'string', 'Internal file path (same as path)'],
            [<Code>title</Code>, 'string', 'Song title'],
            [<Code>path</Code>, 'string', 'Stream path — pass to /files/download/?path='],
            [<Code>size</Code>, 'number', 'File size in bytes'],
            [<Code>modified</Code>, 'string', 'ISO 8601 last-modified timestamp'],
            [<Code>hash</Code>, 'string', 'MD5 file hash (use for deduplication or cache-busting)'],
            [<Code>song</Code>, 'object', 'Full song object — same shape as GET /songs/{id}/'],
          ]}
        />
      </Section>

      <Section title="Streaming the result">
        <p className="text-sm text-text-secondary">
          The <Code>path</Code> field maps directly to the <Code>/files/download/</Code> endpoint. Pass it as the
          stream URL for your audio element.
        </p>
        <Pre>{`const BASE = 'https://juicewrldapi.com/juicewrld';

async function getRadioSong() {
  const res = await fetch(\`\${BASE}/radio/random/\`);
  const data = await res.json();
  return {
    title:        data.title,
    streamUrl:    \`\${BASE}/files/download/?path=\${encodeURIComponent(data.path)}\`,
    coverUrl:     \`https://juicewrldapi.com\${data.song.image_url}\`,
    artist:       data.song.credited_artists,
    era:          data.song.era?.name,
    lyrics:       data.song.lyrics || null,
    syncedLyrics: data.song.synced_lyrics || null,
  };
}

// Basic usage
const track = await getRadioSong();
audioElement.src = track.streamUrl;
audioElement.play();`}</Pre>
      </Section>

      <Section title="React hook — useRadio">
        <Pre>{`import { useState, useCallback } from 'react';

const BASE = 'https://juicewrldapi.com/juicewrld';

export function useRadio() {
  const [track, setTrack] = useState(null);
  const [loading, setLoading] = useState(false);

  const next = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(\`\${BASE}/radio/random/\`);
      const data = await res.json();
      setTrack({
        title:        data.title,
        streamUrl:    \`\${BASE}/files/download/?path=\${encodeURIComponent(data.path)}\`,
        coverUrl:     \`https://juicewrldapi.com\${data.song.image_url}\`,
        artist:       data.song.credited_artists,
        era:          data.song.era?.name,
        length:       data.song.length,
        lyrics:       data.song.lyrics || null,
        syncedLyrics: data.song.synced_lyrics || null,
        song:         data.song,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  return { track, loading, next };
}

// In your component:
function RadioPlayer() {
  const { track, loading, next } = useRadio();

  return (
    <div>
      {track ? (
        <>
          <img src={track.coverUrl} alt={track.title} />
          <p>{track.title} — {track.artist}</p>
          <audio
            src={track.streamUrl}
            autoPlay
            onEnded={next}
          />
        </>
      ) : (
        <button onClick={next} disabled={loading}>
          {loading ? 'Loading...' : 'Start 999 FM'}
        </button>
      )}
      <button onClick={next} disabled={loading}>Next</button>
    </div>
  );
}`}</Pre>
      </Section>

      <Section title="Notes">
        <ul className="space-y-2 text-sm text-text-secondary">
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">•</span> Calls are not seeded — every request is independent. Repeats are possible but rare given the 2,452-song catalogue.</li>
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">•</span> The <Code>song</Code> object is identical to <Code>{`/songs/{id}/`}</Code> — full producers, engineers, lyrics, synced lyrics, and groupbuy info included.</li>
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">•</span> <Code>image_url</Code> is a relative path (e.g. <Code>/assets/wod.jpg</Code>) — prepend <Code>https://juicewrldapi.com</Code> for use in <Code>&lt;img&gt;</Code> tags.</li>
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">•</span> The stream endpoint supports HTTP Range requests — the browser <Code>&lt;audio&gt;</Code> element handles seeking automatically.</li>
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">•</span> No rate limiting on public endpoints, but call once per track end — not on a tight loop.</li>
        </ul>
      </Section>
    </div>
  )
}

const TABS = [
  { id: 'overview',  label: 'Overview' },
  { id: 'songs',     label: 'Songs & Search' },
  { id: 'versions',  label: 'Versions' },
  { id: 'files',     label: 'Files & Stream' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'radio',     label: '999 FM' },
  { id: 'auth',      label: 'Auth & Accounts' },
  { id: 'patterns',  label: 'Code Patterns' },
] as const

type TabId = typeof TABS[number]['id']

export default function DocsPage(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--surface)]">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-6 pb-0 border-b border-[var(--border)]">
        <div className="flex items-baseline gap-3 mb-4">
          <h1 className="text-text-primary text-xl font-bold">API Docs</h1>
          <span className="text-xs text-text-muted font-mono">juicewrldapi.com</span>
          <a
            href="https://juicewrldapi.com/api-docs"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors"
          >
            Open live docs <ExternalLink size={11} />
          </a>
        </div>
        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-0 scrollbar-none">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-shrink-0 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'text-accent border-accent'
                  : 'text-text-muted border-transparent hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {activeTab === 'overview'  && <OverviewTab />}
          {activeTab === 'songs'     && <SongsTab />}
          {activeTab === 'versions'  && <VersionsTab />}
          {activeTab === 'files'     && <FilesTab />}
          {activeTab === 'playlists' && <PlaylistsTab />}
          {activeTab === 'radio'     && <RadioTab />}
          {activeTab === 'auth'      && <AuthTab />}
          {activeTab === 'patterns'  && <FetchPatternTab />}
        </div>
      </div>
    </div>
  )
}
