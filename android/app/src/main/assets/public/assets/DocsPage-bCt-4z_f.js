import{r as h,u as R,j as e,C as O,n as S,X as D,t as G,ab as L}from"./index-CQWK6wHm.js";import{E as C}from"./external-link-BYscuo5c.js";const _=h.createContext({query:"",tab:"",register:()=>{}});function T(i,d){if(!d)return i;const l=i.toLowerCase();let c=l.indexOf(d);if(c===-1)return i;const m=[];let p=0,u=0;for(;c!==-1;)c>p&&m.push(i.slice(p,c)),m.push(e.jsx("mark",{className:"bg-accent/25 text-accent rounded-[3px] px-0.5",children:i.slice(c,c+d.length)},u++)),p=c+d.length,c=l.indexOf(d,p);return p<i.length&&m.push(i.slice(p)),m}function k(i,d){return d?h.Children.map(i,l=>{if(typeof l=="string")return T(l,d);if(!h.isValidElement(l))return l;const c=l.props.children;return c==null?l:h.cloneElement(l,void 0,k(c,d))}):i}function A(){const{query:i}=h.useContext(_);return h.useCallback(d=>T(d,i),[i])}function F(){const{query:i}=h.useContext(_);return h.useCallback(d=>k(d,i),[i])}function g({children:i,color:d="default"}){const l={get:"bg-emerald-500/15 text-emerald-500 border border-emerald-500/25",post:"bg-blue-500/15 text-blue-400 border border-blue-500/25",delete:"bg-red-500/15 text-red-400 border border-red-500/25",patch:"bg-amber-500/15 text-amber-400 border border-amber-500/25",default:"bg-[var(--surface-raised)] text-text-muted border border-[var(--border)]"};return e.jsx("span",{className:`inline-block text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded font-mono ${l[d]}`,children:i})}function t({children:i}){return e.jsx("code",{className:"bg-[var(--surface-raised)] text-accent border border-[var(--border)] text-[11px] font-mono px-1.5 py-0.5 rounded",children:i})}function a({children:i}){return e.jsx("pre",{className:"bg-[var(--surface-raised)] border border-[var(--border)] rounded-xl text-[11px] font-mono text-text-secondary p-4 overflow-x-auto whitespace-pre leading-relaxed",children:i})}function n({headers:i,rows:d}){const l=A(),c=F();return e.jsx("div",{className:"overflow-x-auto rounded-xl border border-[var(--border)]",children:e.jsxs("table",{className:"w-full text-sm",children:[e.jsx("thead",{children:e.jsx("tr",{className:"bg-[var(--surface-raised)] border-b border-[var(--border)]",children:i.map(m=>e.jsx("th",{className:"text-left px-4 py-2.5 text-text-muted text-xs font-semibold uppercase tracking-wide",children:l(m)},m))})}),e.jsx("tbody",{children:d.map((m,p)=>e.jsx("tr",{className:`border-b border-[var(--border)] last:border-0 ${p%2===0?"":"bg-[var(--surface-raised)]/40"}`,children:m.map((u,y)=>e.jsx("td",{className:"px-4 py-2.5 text-text-secondary align-top",children:typeof u=="string"?l(u):c(u)},y))},p))})]})})}function s({title:i,children:d,defaultOpen:l=!0}){const[c,m]=h.useState(l),{query:p,tab:u,register:y}=h.useContext(_),v=h.useRef(null),[j,b]=h.useState("");h.useEffect(()=>{var f;const x=(((f=v.current)==null?void 0:f.textContent)??"").toLowerCase();b(x),y(`${u}:${i}`,u,i,x)},[u,i,y]);const w=!p||i.toLowerCase().includes(p)||j.includes(p),o=p?!0:c;return e.jsxs("div",{className:"border border-[var(--border)] rounded-2xl overflow-hidden",hidden:!w,children:[e.jsxs("button",{onClick:()=>m(x=>!x),className:"w-full flex items-center justify-between px-5 py-4 bg-[var(--surface-raised)] hover:bg-[var(--surface-overlay)] transition-colors text-left",children:[e.jsx("span",{className:"text-text-primary font-semibold text-sm",children:T(i,p)}),o?e.jsx(G,{size:16,className:"text-text-muted"}):e.jsx(L,{size:16,className:"text-text-muted"})]}),e.jsx("div",{ref:v,hidden:!o,className:"p-5 space-y-4 bg-[var(--surface)]",children:k(d,p)})]})}function r({method:i,path:d,description:l}){const c=A();return e.jsxs("div",{className:"flex items-start gap-3 py-2",children:[e.jsx(g,{color:i.toLowerCase(),children:i}),e.jsxs("div",{className:"min-w-0",children:[e.jsx("code",{className:"text-[12px] font-mono text-text-primary",children:c(d)}),e.jsx("p",{className:"text-xs text-text-muted mt-0.5",children:c(l)})]})]})}function M(){return e.jsxs("div",{className:"space-y-6",children:[e.jsxs(s,{title:"Introduction",children:[e.jsx("p",{className:"text-sm text-text-secondary leading-relaxed",children:"The Juice WRLD API provides programmatic access to the most comprehensive Juice WRLD music database — over 2,700 catalogued songs, unreleased tracks, file browsing, and rich metadata. No API key required for public read endpoints."}),e.jsxs("div",{className:"flex items-center gap-2 mt-2",children:[e.jsx("span",{className:"text-xs text-text-muted",children:"Base URL"}),e.jsx(t,{children:"https://juicewrldapi.com/juicewrld"})]}),e.jsxs("a",{href:"https://juicewrldapi.com/api-docs",target:"_blank",rel:"noopener noreferrer",className:"inline-flex items-center gap-1.5 text-xs text-accent hover:underline",children:["Open live API docs ",e.jsx(C,{size:11})]})]}),e.jsx(s,{title:"Endpoint Overview",children:e.jsxs("div",{className:"divide-y divide-[var(--border)]",children:[e.jsx(r,{method:"GET",path:"/songs/",description:"List, filter, search and paginate songs"}),e.jsx(r,{method:"GET",path:"/songs/{id}/",description:"Single song by internal ID"}),e.jsx(r,{method:"GET",path:"/categories/",description:"Available category values with labels"}),e.jsx(r,{method:"GET",path:"/eras/",description:"All eras — paginated (34 total, 20 per page)"}),e.jsx(r,{method:"GET",path:"/stats/",description:"Database-wide counts by category and era"}),e.jsx(r,{method:"GET",path:"/radio/random/",description:"Random playable song with full metadata"}),e.jsx(r,{method:"GET",path:"/radio/live/",description:"Live 999 FM station state — now playing, votes, listeners"}),e.jsx(r,{method:"GET",path:"/radio/stream.mp3",description:"Live radio MP3 stream (WebSocket /ws/radio/ carries the same audio + metadata)"}),e.jsx(r,{method:"GET",path:"/files/browse/",description:"Browse the file system"}),e.jsx(r,{method:"GET",path:"/files/info/",description:"Metadata for a single file"}),e.jsx(r,{method:"GET",path:"/files/cover-art/",description:"Cover art image for an audio file"}),e.jsx(r,{method:"GET",path:"/files/download/",description:"Stream/download audio — supports Range requests"}),e.jsx(r,{method:"GET",path:"/versions/",description:"All song-version rows (bulk mode via ?all=true)"}),e.jsx(r,{method:"GET",path:"/versions/{song_id}/",description:"Version row for one song, if linked"}),e.jsx(r,{method:"POST",path:"/versions/",description:"Link a song into a version group (editor+)"}),e.jsx(r,{method:"PATCH",path:"/versions/{song_id}/",description:"Update a song's version label/title/group (editor+)"}),e.jsx(r,{method:"POST",path:"/playlists/share/",description:"Create a public shared playlist link"}),e.jsx(r,{method:"GET",path:"/playlists/shared/{share_id}/",description:"Fetch a shared playlist by ID"}),e.jsx(r,{method:"POST",path:"/plays/",description:"Record a play event (no auth required)"}),e.jsx(r,{method:"GET",path:"/accounts/account/me/",description:"Current user info (public-facing), incl. per-song preferences + playlist folders"}),e.jsx(r,{method:"PATCH",path:"/accounts/account/me/",description:"Update user_preferences (custom titles, covers, default version, playcounts) and/or playlist_folders"}),e.jsx(r,{method:"GET",path:"/accounts/me/",description:"Current user with role — editor/admin dashboards"}),e.jsx(r,{method:"POST",path:"/feedback/",description:"Submit API feedback (no auth)"}),e.jsx(r,{method:"POST",path:"/reports/",description:"Report wrong info on a song (no auth)"}),e.jsx(r,{method:"GET",path:"/reports/",description:"List song reports (editor+)"}),e.jsx(r,{method:"PATCH",path:"/reports/{id}/",description:"Review a song report (editor+)"}),e.jsx(r,{method:"POST",path:"/accounts/logout/",description:"Invalidate the current token"}),e.jsx(r,{method:"GET",path:"/accounts/application/",description:"Fetch the logged-in user's editor or contributor application"}),e.jsx(r,{method:"POST",path:"/accounts/application/",description:"Apply to become an editor or contributor"}),e.jsx(r,{method:"GET",path:"/accounts/editor/proposals/",description:"List your own edit proposals"}),e.jsx(r,{method:"POST",path:"/accounts/editor/proposals/",description:"Submit an edit proposal (editor+)"}),e.jsx(r,{method:"PATCH",path:"/accounts/editor/proposals/{id}/",description:"Edit a pending proposal"}),e.jsx(r,{method:"DELETE",path:"/accounts/editor/proposals/{id}/",description:"Withdraw a proposal"}),e.jsx(r,{method:"GET",path:"/accounts/editor/leaderboard/",description:"Editor approved-count leaderboard with badges"}),e.jsx(r,{method:"GET",path:"/accounts/contributor/proposals/",description:"List your own comp-file proposals (contributor+)"}),e.jsx(r,{method:"POST",path:"/accounts/contributor/proposals/",description:"Submit a comp-file proposal — multipart (contributor+)"}),e.jsx(r,{method:"PATCH",path:"/accounts/contributor/proposals/{id}/",description:"Edit a pending comp-file proposal — multipart"}),e.jsx(r,{method:"DELETE",path:"/accounts/contributor/proposals/{id}/",description:"Withdraw a comp-file proposal"}),e.jsx(r,{method:"GET",path:"/accounts/admin/comp-proposals/",description:"List all comp-file proposals (admin)"}),e.jsx(r,{method:"POST",path:"/accounts/admin/comp-proposals/{id}/review/",description:"Approve/reject a comp-file proposal (admin)"}),e.jsx(r,{method:"POST",path:"/accounts/admin/comp-proposals/{id}/reverse/",description:"Reverse an approved comp-file proposal (admin)"}),e.jsx(r,{method:"GET",path:"/accounts/admin/comp-proposals/{id}/staging/",description:"Download the staged file for review (admin)"}),e.jsx(r,{method:"GET",path:"/accounts/admin/comp-files/{filepath}/history/",description:"Revision history for a compilation file (admin)"}),e.jsx(r,{method:"GET",path:"/library/favorites/",description:"List personal favorites (any logged-in user)"}),e.jsx(r,{method:"POST",path:"/library/favorites/",description:"Add a favorite"}),e.jsx(r,{method:"DELETE",path:"/library/favorites/{song_id}/",description:"Remove a favorite"}),e.jsx(r,{method:"GET",path:"/library/playlists/",description:"List personal playlists"}),e.jsx(r,{method:"POST",path:"/library/playlists/",description:"Create a personal playlist"}),e.jsx(r,{method:"GET",path:"/library/playlists/{id}/",description:"Get a personal playlist with tracks"}),e.jsx(r,{method:"PATCH",path:"/library/playlists/{id}/",description:"Update name, description, cover, visibility, track order"}),e.jsx(r,{method:"DELETE",path:"/library/playlists/{id}/",description:"Delete a personal playlist"}),e.jsx(r,{method:"POST",path:"/library/playlists/{id}/items/",description:"Add a track to a playlist"}),e.jsx(r,{method:"DELETE",path:"/library/playlists/{id}/items/{song_id}/",description:"Remove a track from a playlist"}),e.jsx(r,{method:"GET",path:"/library/playlists/public/{id}/",description:"Fetch a playlist marked public — no auth required"})]})}),e.jsxs(s,{title:"Songs Object — Full Shape",children:[e.jsx(a,{children:`{
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
}`}),e.jsxs("p",{className:"text-xs text-text-muted",children:[e.jsx(t,{children:"image_url"})," is relative — prepend ",e.jsx(t,{children:"https://juicewrldapi.com"})," before use."]}),e.jsxs("p",{className:"text-xs text-text-muted",children:[e.jsx(t,{children:"version_title"})," / ",e.jsx(t,{children:"versions"})," are omitted unless the request includes ",e.jsx(t,{children:"?versions=true"})," — see the ",e.jsx(t,{children:"/songs/"})," params below."]})]})]})}function I(){return e.jsxs("div",{className:"space-y-6",children:[e.jsxs(s,{title:"GET /songs/ — List & Search",children:[e.jsx("p",{className:"text-sm text-text-secondary",children:"Paginated song list with rich filtering. All params are optional."}),e.jsx(n,{headers:["Param","Type","Description"],rows:[[e.jsx(t,{children:"page"}),"number","Page number (default: 1)"],[e.jsx(t,{children:"page_size"}),"number","Results per page (default: 20)"],[e.jsx(t,{children:"category"}),"string",e.jsxs(e.Fragment,{children:[e.jsx(t,{children:"released"}),", ",e.jsx(t,{children:"unreleased"}),", ",e.jsx(t,{children:"unsurfaced"}),", ",e.jsx(t,{children:"recording_session"})]})],[e.jsx(t,{children:"era"}),"string",'Era abbreviation e.g. "GB&GR", "DRFL", "WOD", "OUT", "POST" — use name from /eras/'],[e.jsx(t,{children:"search"}),"string",`Search names, artists, track titles (normalizes special chars — "dont" matches "don't")`],[e.jsx(t,{children:"searchall"}),"string","Search names, artists, producers, track titles"],[e.jsx(t,{children:"lyrics"}),"string","Full-text search within lyrics content"],[e.jsx(t,{children:"all"}),"string",e.jsxs(e.Fragment,{children:['"true" returns the ',e.jsx("span",{className:"font-semibold text-text-primary",children:"entire catalogue in one response"})," as a plain array — no pagination envelope, and ",e.jsx(t,{children:"page"}),"/",e.jsx(t,{children:"page_size"})," are ignored. It's ~2,500 songs, so use it for whole-dataset work (calendars, grouping, offline seeding), not for lists a user scrolls."]})],[e.jsx(t,{children:"file_names_array"}),"string",'"true" to return file_names as array instead of string'],[e.jsx(t,{children:"versions"}),"string",e.jsxs(e.Fragment,{children:['"true" to add ',e.jsx(t,{children:"version_title"})," and a ",e.jsx(t,{children:"versions"})," array to each song. Collection endpoint only — ",e.jsx(t,{children:"/songs/{id}/"})," ignores it."]})]]}),e.jsx("p",{className:"text-xs text-text-muted font-semibold mt-2",children:"Response shape:"}),e.jsx(a,{children:`{
  "count": 1234,
  "next": "https://juicewrldapi.com/juicewrld/songs/?page=2",
  "previous": null,
  "results": [ /* Song objects */ ]
}`}),e.jsxs("p",{className:"text-xs text-text-muted font-semibold mt-2",children:["With ",e.jsx(t,{children:"?all=true"})," — bare array, no envelope:"]}),e.jsx(a,{children:"[ /* every Song object */ ]"}),e.jsxs("p",{className:"text-xs text-text-muted",children:["Note there is ",e.jsx("span",{className:"font-semibold text-text-primary",children:"no ordering/sort param"}),", and"," ",e.jsx(t,{children:"category"}),"/",e.jsx(t,{children:"era"})," each accept only one value per request — sorting, and any multi-category or multi-era view, has to be assembled client-side."]})]}),e.jsx(s,{title:"GET /songs/{id}/ — Single Song",children:e.jsxs("p",{className:"text-sm text-text-secondary",children:["Returns a full song object by internal ID (",e.jsx(t,{children:"song.id"}),", not ",e.jsx(t,{children:"public_id"}),")."]})}),e.jsx(s,{title:"GET /categories/",children:e.jsx(a,{children:`{
  "categories": [
    { "value": "released",          "label": "Released" },
    { "value": "unreleased",        "label": "Unreleased" },
    { "value": "unsurfaced",        "label": "Unsurfaced" },
    { "value": "recording_session", "label": "Recording Session" }
  ]
}`})}),e.jsxs(s,{title:"GET /eras/",children:[e.jsx("p",{className:"text-sm text-text-secondary",children:"Paginated — same envelope as /songs/. 34 eras total. Era names use short abbreviation strings."}),e.jsx(a,{children:`{
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
}`}),e.jsxs("p",{className:"text-xs text-text-muted mt-1",children:["Pass ",e.jsx(t,{children:"name"})," as the ",e.jsx(t,{children:"era"})," filter param on /songs/ — e.g. ",e.jsx(t,{children:"era=GB%26GR"}),"."]})]}),e.jsxs(s,{title:"GET /stats/",children:[e.jsx(a,{children:`{
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
}`}),e.jsxs("p",{className:"text-xs text-text-muted",children:["Era keys in ",e.jsx(t,{children:"era_stats"})," match the ",e.jsx(t,{children:"name"})," field from ",e.jsx(t,{children:"/eras/"}),"."]})]}),e.jsxs(s,{title:"GET /radio/random/",children:[e.jsx("p",{className:"text-sm text-text-secondary",children:"Returns a random playable song with full metadata and stream path."}),e.jsx(a,{children:`{
  "id": "Compilation/1. Released Discography/.../song.mp3",
  "title": "Song Title",
  "path": "Compilation/1. Released Discography/.../song.mp3",
  "size": 5195736,
  "modified": "2025-10-18T19:19:53.784271",
  "hash": "d199a85e510b32b9ef3c02a29044a41d",
  "song": { /* Full song object */ }
}`})]})]})}function z(){return e.jsxs("div",{className:"space-y-6",children:[e.jsx(s,{title:"GET /files/browse/ — Directory Listing",children:e.jsx(n,{headers:["Param","Required","Description"],rows:[[e.jsx(t,{children:"path"}),"No","Directory path relative to compilation root"],[e.jsx(t,{children:"search"}),"No",'Filter items by name (e.g. ".mp3")']]})}),e.jsx(s,{title:"GET /files/info/ — File Metadata",children:e.jsx(n,{headers:["Param","Required","Description"],rows:[[e.jsx(t,{children:"path"}),"Yes","File path relative to compilation root"]]})}),e.jsxs(s,{title:"GET /files/cover-art/ — Cover Art Image",children:[e.jsx(n,{headers:["Param","Required","Description"],rows:[[e.jsx(t,{children:"path"}),"Yes","Audio file path relative to compilation root"],[e.jsx(t,{children:"small"}),"No",e.jsx(e.Fragment,{children:'"true" — returns a degraded ~128px JPEG instead of the full-size embedded art'})]]}),e.jsxs("p",{className:"text-xs text-text-muted",children:["The original is often a 600×600 PNG around 1 MB. ",e.jsx(t,{children:"small=true"})," serves the same image downscaled to a few KB — use it for anything drawn at thumbnail size, and as a fast first paint before the full-size one loads."]}),e.jsx(a,{children:"GET /files/cover-art/?path=Compilation/…/Lucid Dreams.mp3&small=true"})]}),e.jsxs(s,{title:"GET /files/download/ — Audio Stream",children:[e.jsxs("p",{className:"text-sm text-text-secondary",children:["The primary audio streaming endpoint. Supports HTTP Range requests — the browser"," ",e.jsx(t,{children:"<audio>"})," element handles seeking automatically when you set ",e.jsx(t,{children:"src"}),"."]}),e.jsx(n,{headers:["Param","Required","Description"],rows:[[e.jsx(t,{children:"path"}),"Yes","File path relative to compilation root"],[e.jsx(t,{children:"small"}),"No",e.jsx(e.Fragment,{children:'"true" — for an image path, returns a degraded/downscaled version instead of the original'})]]}),e.jsxs("p",{className:"text-xs text-text-muted",children:[e.jsx(t,{children:"small=true"})," only makes sense when ",e.jsx(t,{children:"path"})," points at an image (e.g. a cover art file) — pass it to shrink a large cover for a thumbnail without fetching the full-size original. For audio, it has no effect."]}),e.jsx(a,{children:"GET /files/download/?path=Compilation/cover.jpg&small=true"}),e.jsx("p",{className:"text-xs text-text-muted font-semibold mt-3",children:"Simple playback:"}),e.jsx(a,{children:"<audio\n  controls\n  src={`https://juicewrldapi.com/juicewrld/files/download/?path=${encodeURIComponent(song.path)}`}\n/>"}),e.jsx("p",{className:"text-xs text-text-muted font-semibold mt-3",children:"Manual Range request (for custom seeking):"}),e.jsx(a,{children:`fetch(
  \`https://juicewrldapi.com/juicewrld/files/download/?path=\${encodeURIComponent(path)}\`,
  { headers: { Range: 'bytes=0-1048575' } }
)
// Returns 206 Partial Content with Content-Range header`}),e.jsxs("p",{className:"text-xs text-text-muted mt-2",children:["Responses: ",e.jsx(t,{children:"200 OK"})," full file · ",e.jsx(t,{children:"206 Partial Content"})," range"]})]}),e.jsx(s,{title:"ZIP Operations",children:e.jsxs("div",{className:"space-y-3",children:[e.jsxs("div",{children:[e.jsxs("div",{className:"flex items-center gap-2 mb-1",children:[e.jsx(g,{color:"post",children:"POST"}),e.jsx("code",{className:"text-xs font-mono text-text-primary",children:"/start-zip-job/"})]}),e.jsxs("p",{className:"text-xs text-text-muted",children:["Start a background ZIP job. Returns a ",e.jsx(t,{children:"job_id"})," for polling."]}),e.jsx(a,{children:'{ "paths": ["Compilation/song1.mp3", "Compilation/song2.mp3"] }'})]}),e.jsxs("div",{children:[e.jsxs("div",{className:"flex items-center gap-2 mb-1",children:[e.jsx(g,{color:"get",children:"GET"}),e.jsxs("code",{className:"text-xs font-mono text-text-primary",children:["/zip-job-status/","{job_id}","/ "]})]}),e.jsx("p",{className:"text-xs text-text-muted",children:"Poll ZIP job progress."})]}),e.jsxs("div",{children:[e.jsxs("div",{className:"flex items-center gap-2 mb-1",children:[e.jsx(g,{color:"post",children:"POST"}),e.jsxs("code",{className:"text-xs font-mono text-text-primary",children:["/cancel-zip-job/","{job_id}","/ "]})]}),e.jsx("p",{className:"text-xs text-text-muted",children:"Cancel an in-progress ZIP job."})]}),e.jsxs("div",{children:[e.jsxs("div",{className:"flex items-center gap-2 mb-1",children:[e.jsx(g,{color:"post",children:"POST"}),e.jsx("code",{className:"text-xs font-mono text-text-primary",children:"/files/zip-selection/"})]}),e.jsx("p",{className:"text-xs text-text-muted",children:"Immediate ZIP stream (not background)."}),e.jsx(a,{children:'{ "paths": ["Compilation/Folder"] }'})]})]})})]})}function U(){return e.jsxs("div",{className:"space-y-6",children:[e.jsxs(s,{title:"Shared Playlists (no auth required)",children:[e.jsx("p",{className:"text-sm text-text-secondary",children:"Public, anonymous-link playlists. Anyone with the share ID can read them."}),e.jsxs("div",{className:"space-y-3",children:[e.jsxs("div",{children:[e.jsxs("div",{className:"flex items-center gap-2 mb-1",children:[e.jsx(g,{color:"post",children:"POST"}),e.jsx("code",{className:"text-xs font-mono text-text-primary",children:"/playlists/share/"})]}),e.jsx(a,{children:`// Request
{ "paths": ["Compilation/song1.mp3", "Compilation/song2.mp3"] }

// Response
{ "share_id": "abc123..." }`})]}),e.jsxs("div",{children:[e.jsxs("div",{className:"flex items-center gap-2 mb-1",children:[e.jsx(g,{color:"get",children:"GET"}),e.jsxs("code",{className:"text-xs font-mono text-text-primary",children:["/playlists/shared/","{share_id}","/ "]})]}),e.jsx("p",{className:"text-xs text-text-muted",children:"Full shared playlist with all track metadata."})]}),e.jsxs("div",{children:[e.jsxs("div",{className:"flex items-center gap-2 mb-1",children:[e.jsx(g,{color:"get",children:"GET"}),e.jsxs("code",{className:"text-xs font-mono text-text-primary",children:["/playlists/shared/","{share_id}","/info/"]})]}),e.jsx("p",{className:"text-xs text-text-muted",children:"Lightweight preview — name + track count without full fetch."})]})]})]}),e.jsxs(s,{title:"Personal Library Playlists (auth required)",children:[e.jsx("p",{className:"text-sm text-text-secondary",children:"Private, account-synced playlists. Any logged-in user (including standard accounts) can use these — does not require editor role."}),e.jsx(n,{headers:["Method","Path","Description"],rows:[["GET","/library/playlists/","List all playlists for logged-in user (supports ?omit_cover_image=true)"],["POST","/library/playlists/","Create a playlist"],["GET","/library/playlists/{id}/","Get playlist with full track list"],["PATCH","/library/playlists/{id}/","Update name, description, cover, visibility, or reorder tracks"],["DELETE","/library/playlists/{id}/","Delete a playlist"],["POST","/library/playlists/{id}/items/","Add a track"],["DELETE","/library/playlists/{id}/items/{song_id}/","Remove a track"]]}),e.jsxs("p",{className:"text-xs text-text-muted mt-2",children:[e.jsx(t,{children:"?omit_cover_image=true"})," drops the (large, base64) ",e.jsx(t,{children:"cover_image"})," field from the response — use it for list views that only need ",e.jsx(t,{children:"cover_image_url"}),"."]}),e.jsx("p",{className:"text-xs text-text-muted font-semibold mt-3",children:"Create:"}),e.jsx(a,{children:`POST /library/playlists/
Authorization: Token <token>

{
  "name": "My Playlist",
  "description": "optional",
  "cover_image": undefined  // optional base64 string
}`}),e.jsx("p",{className:"text-xs text-text-muted font-semibold mt-3",children:"Update (all fields optional, including track reorder):"}),e.jsx(a,{children:`PATCH /library/playlists/{id}/

{
  "name": "New name",
  "description": "New description",
  "cover_image": "",         // base64, or "" to clear
  "is_public": true,         // toggle public sharing (see below)
  "order": [123, 456, 789]  // song IDs in desired order
}`}),e.jsx("p",{className:"text-xs text-text-muted font-semibold mt-3",children:"List response — each item:"}),e.jsx(a,{children:`{
  "id": 1,
  "name": "My Playlist",
  "description": "optional",
  "cover_image": "...",
  "cover_image_url": "...",  // fallback to first track image_url
  "track_count": 12,
  "is_public": false,
  "created_at": "...",
  "updated_at": "..."
}`}),e.jsxs("p",{className:"text-xs text-text-muted font-semibold mt-3",children:["Detail response — same fields plus ",e.jsx(t,{children:"items[]"}),":"]}),e.jsx(a,{children:`{
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
}`}),e.jsxs("p",{className:"text-xs text-text-muted mt-2",children:["The song object in playlist items is a trimmed shape — no ",e.jsx(t,{children:"producers"}),", ",e.jsx(t,{children:"engineers"}),", or ",e.jsx(t,{children:"bitrate"}),"."]})]}),e.jsxs(s,{title:"Public Library Playlists (no auth required)",children:[e.jsxs("p",{className:"text-sm text-text-secondary",children:["A personal library playlist with ",e.jsx(t,{children:"is_public: true"})," can be fetched anonymously by its numeric"," ",e.jsx(t,{children:"id"}),' — distinct from the ephemeral, no-account "Shared Playlists" above. Toggle visibility via'," ",e.jsx(t,{children:"PATCH /library/playlists/{id}/"})," with ",e.jsx(t,{children:'{ "is_public": true }'}),"."]}),e.jsx(n,{headers:["Method","Path","Description"],rows:[["GET","/library/playlists/public/{id}/","Full playlist detail (same shape as the authed detail response)"]]}),e.jsx("p",{className:"text-xs text-text-muted mt-2",children:"Making a playlist public does not change its owner or contents — it only exposes this read-only endpoint."})]}),e.jsx(s,{title:"Favorites (auth required)",children:e.jsx(n,{headers:["Method","Path","Description"],rows:[["GET","/library/favorites/","List favorite tracks"],["POST","/library/favorites/","Add a favorite — body: { song_id }"],["DELETE","/library/favorites/{song_id}/","Remove a favorite"]]})})]})}function q(){return e.jsxs("div",{className:"space-y-6",children:[e.jsxs(s,{title:"Roles",children:[e.jsx(n,{headers:["Role","role string","is_editor","is_administrator","is_contributor"],rows:[["Standard",e.jsx(t,{children:"applicant"}),"—","—","—"],["Editor",e.jsx(t,{children:"editor"}),"✓","—","—"],["Contributor",e.jsx(t,{children:"contributor"}),"—","—","✓"],["Admin",e.jsx(t,{children:"administrator"}),"✓","✓","—"]]}),e.jsxs("p",{className:"text-xs text-text-muted mt-2",children:["New Discord users start as ",e.jsx(t,{children:"applicant"}),". Editors are promoted after application approval. Admins are assigned manually. Admins always have ",e.jsx(t,{children:"is_editor: true"}),"."]}),e.jsxs("p",{className:"text-xs text-text-muted mt-2",children:[e.jsx(t,{children:"contributor"})," is a separate track from editor — it grants access to the comp-file proposal pipeline below (uploading/replacing/moving/deleting files in the compilation), not to song-data edit proposals. A user can hold either role independently of the other. ",e.jsx(t,{children:"is_manager"})," is an optional flag layered on top of admin for reviewing comp-file proposals specifically — treat it as absent unless the account payload actually includes it."]}),e.jsx("p",{className:"text-xs text-text-muted font-semibold mt-3",children:"Attach token to every authenticated request:"}),e.jsx(a,{children:"Authorization: Token YOUR_TOKEN_HERE"})]}),e.jsxs(s,{title:"Discord Login (recommended)",children:[e.jsxs("ol",{className:"space-y-3 text-sm text-text-secondary list-decimal list-inside",children:[e.jsxs("li",{children:[e.jsx("code",{className:"text-accent font-mono text-xs",children:"GET /accounts/auth/discord/url/"})," → returns ",e.jsx(t,{children:"authorize_url"})," and ",e.jsx(t,{children:"state"})]}),e.jsxs("li",{children:["Redirect the user through Discord OAuth using ",e.jsx(t,{children:"authorize_url"})]}),e.jsx("li",{children:"Exchange the code Discord returns:"})]}),e.jsx(a,{children:`POST /accounts/auth/discord/exchange/

{
  "code": "discord_auth_code",
  "state": "state_from_step_1",
  "redirect_uri": "https://your-app.com/callback"
}

// Response includes token + user object`}),e.jsxs("p",{className:"text-xs text-text-muted",children:["Store the token and attach it as ",e.jsx(t,{children:"Authorization: Token <token>"})," on subsequent requests."]})]}),e.jsxs(s,{title:"Logout",children:[e.jsx(a,{children:`POST /accounts/logout/
Authorization: Token <token>`}),e.jsx("p",{className:"text-xs text-text-muted",children:"Invalidates the token server-side. Clear the locally stored token regardless of whether this call succeeds."})]}),e.jsxs(s,{title:"Admin Login",children:[e.jsx("p",{className:"text-sm text-text-secondary",children:"Username/password — administrators only. Not needed for a public music player."}),e.jsx(a,{children:`POST /accounts/login/

{
  "token": "abc123...",
  "profile": { "role": "administrator", "is_editor": true, "is_administrator": true },
  "requires_otp_setup": false
}`})]}),e.jsx(s,{title:"Who Am I — Two Endpoints",children:e.jsxs("div",{className:"space-y-4",children:[e.jsxs("div",{children:[e.jsxs("div",{className:"flex items-center gap-2 mb-1",children:[e.jsx(g,{color:"get",children:"GET"}),e.jsx("code",{className:"text-xs font-mono text-text-primary",children:"/accounts/account/me/"})]}),e.jsxs("p",{className:"text-xs text-text-muted mb-2",children:["Public-facing. No ",e.jsx(t,{children:"role"})," string — booleans only. Use this for music player UI gating."]}),e.jsx(a,{children:`{
  "id": 42,
  "display_name": "someuser",
  "discord_id": "123456789",
  "discord_username": "someuser",
  "discord_avatar": "https://cdn.discordapp.com/avatars/...",
  "is_editor": false,
  "is_administrator": false,
  "is_contributor": false,
  "otp_enabled": false,
  "user_preferences": [
    { "song": 94086, "name": "My title", "cover_url": "/assets/wod.jpg", "default_version": "v1", "playcount": 12 }
  ],
  "playlist_folders": [
    { "id": "f1", "name": "Favorites", "playlist_ids": [12, 34] }
  ],
  "listening_plays": [
    { "song": 94086, "played_at": "2026-08-03T20:14:00Z" }
  ]
}`}),e.jsxs("p",{className:"text-xs text-text-muted mt-2",children:["Also mounted at ",e.jsx(t,{children:"/juicewrld/accounts/account/me/"})," (same handler, different prefix)."]}),e.jsxs("p",{className:"text-xs text-text-muted mt-2",children:[e.jsx(t,{children:"listening_plays"})," and ",e.jsx(t,{children:"is_manager"})," aren't guaranteed present on every account payload yet — read them defensively (optional/undefined, not required)."]})]}),e.jsxs("div",{children:[e.jsxs("div",{className:"flex items-center gap-2 mb-1",children:[e.jsx(g,{color:"patch",children:"PATCH"}),e.jsx("code",{className:"text-xs font-mono text-text-primary",children:"/accounts/account/me/"})]}),e.jsxs("p",{className:"text-xs text-text-muted mb-2",children:["Updates the logged-in user's own ",e.jsx(t,{children:"user_preferences"}),", ",e.jsx(t,{children:"playlist_folders"}),", and/or"," ",e.jsx(t,{children:"listening_plays"})," blobs — see the sections below for what goes in each."]})]}),e.jsxs("div",{children:[e.jsxs("div",{className:"flex items-center gap-2 mb-1",children:[e.jsx(g,{color:"get",children:"GET"}),e.jsx("code",{className:"text-xs font-mono text-text-primary",children:"/accounts/me/"})]}),e.jsxs("p",{className:"text-xs text-text-muted mb-2",children:["Editor/admin dashboards. Includes raw ",e.jsx(t,{children:"role"})," string and extra stats."]}),e.jsx(a,{children:`{
  "username": "discord_123456789",
  "role": "applicant",
  "is_editor": false,
  "is_administrator": false,
  "is_contributor": false,
  "is_superuser": false,
  "otp_enabled": false,
  "discord_id": "123456789",
  "discord_username": "someuser",
  "discord_avatar": "https://cdn.discordapp.com/avatars/...",
  "approved_count": 0,
  "badges": []
}`}),e.jsxs("p",{className:"text-xs text-text-muted mt-2",children:[e.jsx(t,{children:"role"})," is ",e.jsx(t,{children:'"applicant" | "editor" | "contributor" | "administrator"'})," — widened from three values to four with the contributor track. Don't treat it as a strict editor-vs-admin ladder; check the specific boolean (",e.jsx(t,{children:"is_editor"}),"/",e.jsx(t,{children:"is_contributor"}),"/",e.jsx(t,{children:"is_administrator"}),") for the access you actually need."]})]})]})}),e.jsxs(s,{title:"Per-Song Preferences — custom titles, covers, playcounts",children:[e.jsxs("p",{className:"text-sm text-text-secondary leading-relaxed",children:[e.jsx(t,{children:"user_preferences"})," is a per-user, per-song override list carried on the profile: a personal display ",e.jsx("span",{className:"font-semibold text-text-primary",children:"name"}),", a personal"," ",e.jsx("span",{className:"font-semibold text-text-primary",children:"cover"}),", a preferred"," ",e.jsx("span",{className:"font-semibold text-text-primary",children:"version"})," to play within the song's version group, and a ",e.jsx("span",{className:"font-semibold text-text-primary",children:"playcount"}),". These are personal only — they never change the song for anyone else, and editors proposing upstream edits see the API's own untouched values."]}),e.jsx(a,{children:`{
  "song": 94086,              // API song id (song.id, not public_id)
  "name": "My title",         // null = use the song's own title
  "cover_url": "Compilation/.../cover.jpg",
  "default_version": "v1",    // null = no preference
  "playcount": 12
}`}),e.jsx(n,{headers:["Field","Type","Meaning"],rows:[[e.jsx(t,{children:"song"}),"number","Which song this row overrides. The only required field."],[e.jsx(t,{children:"name"}),"string | null","Custom display title. Null falls back to the song's own title."],[e.jsx(t,{children:"cover_url"}),"string | null","Custom cover art. Null falls back to the song's image_url."],[e.jsx(t,{children:"default_version"}),"string | null",e.jsxs(e.Fragment,{children:["Preferred version ",e.jsx("span",{className:"font-semibold text-text-primary",children:"label"})," (e.g. ",e.jsx(t,{children:"v1"}),", ",e.jsx(t,{children:"OG"}),", ",e.jsx(t,{children:"TV Mix"}),") — matched against the ",e.jsx(t,{children:"version"})," field in the ",e.jsx(t,{children:"/versions/"})," table, not a song id, so it survives songs being relinked or groups merging. A default set on any group member governs the whole group."]})],[e.jsx(t,{children:"playcount"}),"number","How many times this user played the song. Client-owned — there is no server-side increment endpoint."]]}),e.jsxs("p",{className:"text-xs text-text-muted font-semibold mt-3",children:["Resolving ",e.jsx(t,{children:"cover_url"}),":"]}),e.jsx(n,{headers:["Form","Example","Resolves to"],rows:[["Absolute URL","https://… / data: / blob:","Used as-is"],["Leading slash","/assets/wod.jpg",e.jsxs(e.Fragment,{children:["Site-relative asset — prepend ",e.jsx(t,{children:"https://juicewrldapi.com"})," (same shape as a song's ",e.jsx(t,{children:"image_url"}),")"]})],["Anything else","Compilation/…/cover.jpg",e.jsxs(e.Fragment,{children:["A path into file storage — fetch via ",e.jsx(t,{children:"/files/cover-art/?path="})]})]]}),e.jsx("p",{className:"text-xs text-text-muted font-semibold mt-3",children:"Write semantics — read this before implementing:"}),e.jsxs("ul",{className:"space-y-2 text-sm text-text-secondary",children:[e.jsxs("li",{className:"flex items-start gap-2",children:[e.jsx("span",{className:"text-accent mt-0.5",children:"•"})," It's ",e.jsx("span",{className:"font-semibold text-text-primary",children:"one JSON blob, not per-song rows"})," — there is no per-song save and no delete. The client owns the whole array and PATCHes it in full; sending a shorter array is how a row gets removed."]}),e.jsxs("li",{className:"flex items-start gap-2",children:[e.jsx("span",{className:"text-accent mt-0.5",children:"•"})," Debounce the pushes. A burst of edits (or plays) should collapse into one PATCH rather than one per change."]}),e.jsxs("li",{className:"flex items-start gap-2",children:[e.jsx("span",{className:"text-accent mt-0.5",children:"•"})," On login, merge the server's copy into the local one taking ",e.jsx(t,{children:"max()"})," of each ",e.jsx(t,{children:"playcount"})," — otherwise plays made while signed out or on another device get overwritten."]}),e.jsxs("li",{className:"flex items-start gap-2",children:[e.jsx("span",{className:"text-accent mt-0.5",children:"•"})," The validator caps the array at ",e.jsx("span",{className:"font-semibold text-text-primary",children:"500 rows"}),". Past that, drop playcount-only rows first — rows carrying a real override (name/cover/version) are the ones worth keeping, since every song played creates a playcount row."]}),e.jsxs("li",{className:"flex items-start gap-2",children:[e.jsx("span",{className:"text-accent mt-0.5",children:"•"})," Normalize cleared text fields to ",e.jsx(t,{children:"null"}),", not ",e.jsx(t,{children:'""'})," — an empty string reads as a real override downstream."]})]})]}),e.jsxs(s,{title:"Playlist Folders",children:[e.jsxs("p",{className:"text-sm text-text-secondary",children:[e.jsx(t,{children:"playlist_folders"})," groups the user's playlists into folders. Same blob mechanics as"," ",e.jsx(t,{children:"user_preferences"})," above — whole-array PATCH on ",e.jsx(t,{children:"/accounts/account/me/"}),", no per-folder route."]}),e.jsx(a,{children:`{
  "id": "f1",
  "name": "Favorites",
  "playlist_ids": [12, 34]
}`}),e.jsx(n,{headers:["Field","Type","Meaning"],rows:[[e.jsx(t,{children:"id"}),"string","Client-generated folder id — round-trips unchanged"],[e.jsx(t,{children:"name"}),"string","Folder display name"],[e.jsx(t,{children:"playlist_ids"}),"number[]","Library playlist IDs in this folder"]]}),e.jsx("p",{className:"text-xs text-text-muted",children:"Limits: max 200 folders, max 500 playlist ids per folder."})]}),e.jsxs(s,{title:"Listening History",children:[e.jsxs("p",{className:"text-sm text-text-secondary",children:[e.jsx(t,{children:"listening_plays"})," is a raw per-play log — one entry per listen, distinct from"," ",e.jsx(t,{children:"user_preferences[].playcount"})," which is just a running total per song. Same blob mechanics: whole-array PATCH on ",e.jsx(t,{children:"/accounts/account/me/"}),", no per-event route."]}),e.jsx(a,{children:`{
  "song": 94086,
  "played_at": "2026-08-03T20:14:00Z"
}`}),e.jsx(n,{headers:["Field","Type","Meaning"],rows:[[e.jsx(t,{children:"song"}),"number","API song id that was played"],[e.jsx(t,{children:"played_at"}),"string","ISO 8601 timestamp of the play"]]}),e.jsxs("p",{className:"text-xs text-text-muted",children:["Capped at ",e.jsx("span",{className:"font-semibold text-text-primary",children:"10,000 events"})," — send the whole array, debounced the same way as ",e.jsx(t,{children:"user_preferences"}),", so a burst of plays collapses into one PATCH rather than one per play."]})]}),e.jsxs(s,{title:"Permission Matrix",children:[e.jsx(n,{headers:["Access Level","Endpoints"],rows:[["No login","Songs, eras, categories, files, radio, stats, shared playlists, play tracking, feedback, report submission"],["Any logged-in user","/account/me/ (incl. PATCH), /application/, /library/*"],["Editor or admin","/me/, /editor/proposals/, /editor/leaderboard/, /badges/, /reports/ (read + review)"],["Contributor","/contributor/proposals/ (comp-file proposals — read/write your own)"],["Admin only","/admin/users/, /admin/proposals/, /admin/applications/, /admin/comp-proposals/, /admin/comp-files/"],["Beta code (X-Beta-Code)","/beta/versions, /beta/download — independent of the token/role system"]]}),e.jsxs("p",{className:"text-xs text-text-muted mt-2",children:["A 403 response means insufficient role — message text is typically"," ",e.jsx(t,{children:'"Editor access required."'})," or ",e.jsx(t,{children:'"Administrator access required."'}),"."]})]}),e.jsxs(s,{title:"Edit Proposals (Editor+)",children:[e.jsx(n,{headers:["Method","Path","Description"],rows:[["GET","/accounts/editor/proposals/","List the logged-in editor's own proposals"],["POST","/accounts/editor/proposals/","Submit a new proposal"],["PATCH","/accounts/editor/proposals/{id}/","Edit a still-pending proposal"],["DELETE","/accounts/editor/proposals/{id}/","Withdraw a proposal"]]}),e.jsxs("p",{className:"text-xs text-text-muted",children:[e.jsx(t,{children:"change_type"})," is ",e.jsx(t,{children:'"create"'}),", ",e.jsx(t,{children:'"update"'}),", or ",e.jsx(t,{children:'"delete"'})," — ",e.jsx(t,{children:'"update"'})," is by far the most common in practice."]}),e.jsx(a,{children:`POST /accounts/editor/proposals/
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
}`}),e.jsx(n,{headers:["Field","Type","Description"],rows:[[e.jsx(t,{children:"change_type"}),"string",'"create" | "update" | "delete"'],[e.jsx(t,{children:"song"}),"number | null",'Internal song ID (song.id, not public_id) — null for a "create" proposal'],[e.jsx(t,{children:"title"}),"string","Song title for display purposes"],[e.jsx(t,{children:"editor_notes"}),"string","Optional notes from the editor"],[e.jsx(t,{children:"proposed_data"}),"object","Only the fields being changed"]]}),e.jsxs("p",{className:"text-xs text-text-muted",children:["To re-submit a stale/stuck pending proposal, ",e.jsx(t,{children:"DELETE"})," it then ",e.jsx(t,{children:"POST"}),` the same data again as a fresh proposal (there's no separate "resubmit" endpoint).`]}),e.jsx("p",{className:"text-xs text-text-muted font-semibold mt-3",children:"Proposal object shape:"}),e.jsx(a,{children:`{
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
}`}),e.jsxs("p",{className:"text-xs text-text-muted",children:[e.jsx(t,{children:"status"})," is one of ",e.jsx(t,{children:"pending"}),", ",e.jsx(t,{children:"approved"}),", ",e.jsx(t,{children:"rejected"}),", ",e.jsx(t,{children:"reversed"}),"."]})]}),e.jsxs(s,{title:"Applications (Editor or Contributor)",children:[e.jsxs("p",{className:"text-sm text-text-secondary",children:["How a standard user applies for either the editor or the contributor track — same endpoint, distinguished by ",e.jsx(t,{children:"application_type"}),"."]}),e.jsx(n,{headers:["Method","Path","Description"],rows:[["GET","/accounts/application/","Fetch the logged-in user's own application (null if none)"],["POST","/accounts/application/","Submit an application"]]}),e.jsx(a,{children:`POST /accounts/application/

{
  "application_type": "editor",  // "editor" | "contributor"
  "display_name": "optional",
  "contact": "optional",
  "experience": "optional",
  "motivation": "required — why you want this access",
  "areas": "optional"
}`}),e.jsxs("p",{className:"text-xs text-text-muted",children:[e.jsx(t,{children:"status"})," on the returned application is ",e.jsx(t,{children:"pending"}),", ",e.jsx(t,{children:"approved"}),", or ",e.jsx(t,{children:"rejected"}),"."]}),e.jsxs("p",{className:"text-xs text-text-muted",children:["Approving a ",e.jsx(t,{children:"contributor"})," application should set ",e.jsx(t,{children:"is_contributor"}),", not"," ",e.jsx(t,{children:"is_editor"})," — the two tracks are separate (see Roles above)."]})]}),e.jsxs(s,{title:"Editor Leaderboard",children:[e.jsxs("div",{className:"flex items-center gap-2 mb-1",children:[e.jsx(g,{color:"get",children:"GET"}),e.jsx("code",{className:"text-xs font-mono text-text-primary",children:"/accounts/editor/leaderboard/"})]}),e.jsx("p",{className:"text-xs text-text-muted mb-2",children:"Ranked by approved proposal count. No auth required to view."}),e.jsx(a,{children:`[
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
]`})]}),e.jsxs(s,{title:"Play Tracking",children:[e.jsx("p",{className:"text-sm text-text-secondary",children:"Record a listen event — no auth required. Call when a track starts (or after e.g. 30 s)."}),e.jsx(a,{children:"POST /juicewrld/plays/"})]}),e.jsxs(s,{title:"Feedback",children:[e.jsxs("div",{className:"flex items-center gap-2 mb-1",children:[e.jsx(g,{color:"post",children:"POST"}),e.jsx("code",{className:"text-xs font-mono text-text-primary",children:"/juicewrld/feedback/"})]}),e.jsx("p",{className:"text-xs text-text-muted mb-2",children:"General API/app feedback. No auth required. Forwards to a webhook + the mod server."}),e.jsx(a,{children:`{
  "message": "required",
  "contact": "optional"
}`}),e.jsxs("p",{className:"text-xs text-text-muted",children:["Throttled at ",e.jsx(t,{children:"10/min"}),"."]})]}),e.jsxs(s,{title:"Song Reports",children:[e.jsx("p",{className:"text-sm text-text-secondary",children:"Public-facing way to flag wrong/missing info on a specific song. Submissions go to the DB and are forwarded to the mod server via webhook; editors triage them from the queue."}),e.jsx(n,{headers:["Method","Path","Access","Description"],rows:[["POST","/juicewrld/reports/","No auth","Submit a report"],["GET","/juicewrld/reports/","Editor+","List reports — filter: ?status=pending|resolved"],["PATCH","/juicewrld/reports/{id}/","Editor+","Set status/review_notes (records reviewer + time)"]]}),e.jsx("p",{className:"text-xs text-text-muted font-semibold mt-3",children:"Create:"}),e.jsx(a,{children:`POST /juicewrld/reports/

{
  "song_id": 94086,     // or "public_id": 163 — one of the two, not both
  "message": "required — what's wrong",
  "contact": "optional"
}`}),e.jsxs("p",{className:"text-xs text-text-muted",children:["Throttled at ",e.jsx(t,{children:"10/min"}),"."]}),e.jsx("p",{className:"text-xs text-text-muted font-semibold mt-3",children:"Report row (from the editor list):"}),e.jsx(a,{children:`{
  "id": 31,
  "song": 94086,
  "song_name": "Maze",
  "message": "Issues: Wrong era\\n\\nSong: Maze\\n\\n— Unreleased v1.18.0",
  "contact": "someuser",
  "status": "pending",
  "review_notes": "",
  "reviewer_username": null,
  "created_at": "...",
  "reviewed_at": null
}`}),e.jsxs("p",{className:"text-xs text-text-muted",children:["Read the list defensively: it may come back as a bare array ",e.jsx("span",{className:"font-semibold text-text-primary",children:"or"})," a DRF ",e.jsx(t,{children:"{ results: [...] }"})," envelope, and the song id has been seen under"," ",e.jsx(t,{children:"song"}),", ",e.jsx(t,{children:"song_id"}),", and ",e.jsx(t,{children:"public_id"})," depending on the serializer. Only"," ",e.jsx(t,{children:"status"}),", ",e.jsx(t,{children:"review_notes"}),", and the reviewer/timestamp fields are guaranteed."]}),e.jsxs("p",{className:"text-xs text-text-muted",children:["There's no structured category/issue field on submit — clients fold those into the"," ",e.jsx(t,{children:"message"})," text, which is why the messages above look pre-formatted."]}),e.jsx("p",{className:"text-xs text-text-muted font-semibold mt-3",children:"Review:"}),e.jsx(a,{children:`PATCH /juicewrld/reports/{id}/
Authorization: Token <token>

{
  "status": "resolved",     // "pending" | "resolved"
  "review_notes": "optional"
}`}),e.jsx("p",{className:"text-xs text-text-muted",children:"The server records the reviewer and review time itself — don't send those. Note there is no idempotency key on submit, so a client retrying a queued report can double-post."})]}),e.jsxs(s,{title:"Beta App (installer gating)",defaultOpen:!1,children:[e.jsxs("p",{className:"text-sm text-text-secondary",children:["Gates access to in-development desktop builds behind a beta code, separate from the public token/role system above — auth here is the ",e.jsx(t,{children:"X-Beta-Code"})," header, not ",e.jsx(t,{children:"Authorization: Token"}),"."]}),e.jsx(n,{headers:["Method","Path","Auth","Description"],rows:[["GET","/beta/unlock?code=X","None",e.jsxs(e.Fragment,{children:["Check a code — returns ",e.jsx(t,{children:'{ "valid": true|false }'})]})],["GET","/beta/versions",e.jsx(t,{children:"X-Beta-Code"}),"List active beta builds (401 if the code is invalid)"],["GET","/beta/download?version=X",e.jsx(t,{children:"X-Beta-Code"}),"Stream the installer for that build (401/404)"]]}),e.jsx(a,{children:`GET /beta/versions
X-Beta-Code: YOUR_CODE`})]}),e.jsxs(s,{title:"Admin: User Lookup",defaultOpen:!1,children:[e.jsx(n,{headers:["Method","Path","Description"],rows:[["GET","/accounts/admin/users/","List all users. Filter: ?role=editor|contributor|administrator|applicant"],["GET","/accounts/admin/users/{user_id}/","Single user detail — role, is_active, Discord info, proposal counts, badges"],["PATCH","/accounts/admin/users/{user_id}/","Update role, is_active, auto_approve_proposals, or contributor flags"]]}),e.jsx(a,{children:`PATCH /accounts/admin/users/{user_id}/

{
  "role": "contributor",            // "editor" | "contributor" | "applicant"
  "is_active": true,
  "auto_approve_proposals": false,
  "contributor_enabled": true,
  "auto_approve_comp_proposals": false
}`}),e.jsx(n,{headers:["Field","Type","Meaning"],rows:[[e.jsx(t,{children:"contributor_enabled"}),"boolean","Whether this user has comp-file proposal access, independent of role string"],[e.jsx(t,{children:"auto_approve_comp_proposals"}),"boolean","Skip manual review and apply this user's comp-file proposals automatically"],[e.jsx(t,{children:"comp_proposal_count"}),"number","Read-only — this user's total comp-file proposal submissions"],[e.jsx(t,{children:"comp_approved_count"}),"number","Read-only — how many of those were approved"]]}),e.jsxs("p",{className:"text-xs text-text-muted",children:["Requires admin token (",e.jsx(t,{children:"is_administrator: true"}),")."]})]}),e.jsxs(s,{title:"Admin: Proposal Review",defaultOpen:!1,children:[e.jsx(n,{headers:["Method","Path","Description"],rows:[["GET","/accounts/admin/proposals/","List all proposals. Filter: ?status=pending|approved|rejected|reversed"],["POST","/accounts/admin/proposals/{id}/review/","Approve, reject, or revise-and-approve a proposal"],["POST","/accounts/admin/proposals/{id}/reverse/","Reverse a previously approved proposal"]]}),e.jsx(a,{children:`POST /accounts/admin/proposals/{id}/review/

{
  "action": "approve",          // "approve" | "reject" | "revise"
  "review_notes": "optional",
  "revised_data": { }           // only for action: "revise" — overrides proposed_data
}`})]}),e.jsxs(s,{title:"Admin: Applications",defaultOpen:!1,children:[e.jsx(n,{headers:["Method","Path","Description"],rows:[["GET","/accounts/admin/applications/","List editor applications. Filter: ?status=pending|approved|rejected"],["POST","/accounts/admin/applications/{id}/review/","Approve or reject an application"]]}),e.jsx(a,{children:`POST /accounts/admin/applications/{id}/review/

{
  "action": "approve",          // "approve" | "reject"
  "review_notes": "optional"
}`}),e.jsxs("p",{className:"text-xs text-text-muted",children:["Approving promotes the applicant to the role matching the application's"," ",e.jsx(t,{children:"application_type"})," — ",e.jsx(t,{children:"editor"})," or ",e.jsx(t,{children:"contributor"}),"."]})]}),e.jsxs(s,{title:"Comp File Proposals — Overview",defaultOpen:!1,children:[e.jsxs("p",{className:"text-sm text-text-secondary leading-relaxed",children:["A second, separate proposal pipeline from song-data Edit Proposals above — this one is for changes to the"," ",e.jsx("span",{className:"font-semibold text-text-primary",children:"compilation's files themselves"})," (uploading a new file, replacing one, moving/renaming, or deleting), submitted by contributors and reviewed by admins. Everything under ",e.jsx(t,{children:"/accounts/contributor/"})," requires ",e.jsx(t,{children:"is_contributor"}),"; everything under ",e.jsx(t,{children:"/accounts/admin/comp-proposals/"})," and ",e.jsx(t,{children:"/accounts/admin/comp-files/"})," requires"," ",e.jsx(t,{children:"is_administrator"}),"."]}),e.jsxs("p",{className:"text-xs text-text-muted mt-2",children:["Backend note: none of this works until the server ships these routes plus the underlying"," ",e.jsx(t,{children:"listening_plays"})," profile field and file staging/archive storage — the client codes against this contract ahead of the backend landing it."]})]}),e.jsxs(s,{title:"Contributor: Comp File Proposals",defaultOpen:!1,children:[e.jsx(n,{headers:["Method","Path","Description"],rows:[["GET","/accounts/contributor/proposals/","List the logged-in contributor's own comp-file proposals"],["POST","/accounts/contributor/proposals/","Submit a new comp-file proposal — multipart"],["PATCH","/accounts/contributor/proposals/{id}/","Edit a still-pending proposal — multipart"],["DELETE","/accounts/contributor/proposals/{id}/","Withdraw a proposal"]]}),e.jsxs("p",{className:"text-xs text-text-muted",children:["The two write endpoints send ",e.jsx(t,{children:"multipart/form-data"}),", not JSON — the request carries the actual file being uploaded/replaced alongside the metadata fields. Send"," ",e.jsx(t,{children:"Authorization: Token <token>"})," and deliberately"," ",e.jsx("span",{className:"font-semibold text-text-primary",children:"omit"})," ",e.jsx(t,{children:"Content-Type"})," so the browser sets the multipart boundary itself — setting it manually breaks the boundary and the server can't parse the body."]}),e.jsx(a,{children:`POST /accounts/contributor/proposals/
Authorization: Token <token>
Content-Type: multipart/form-data; boundary=... (set automatically — do not set this header yourself)

FormData:
  change_type       "upload" | "replace" | "move" | "delete"
  file_path         "Compilation/Unreleased/Song.mp3"     // target path in the compilation
  destination_path  "Compilation/Unreleased/New Name.mp3" // only for "move"
  contributor_notes "optional"
  file              <binary>                              // only for "upload"/"replace"`}),e.jsx("p",{className:"text-xs text-text-muted font-semibold mt-3",children:"Comp file proposal object shape:"}),e.jsx(a,{children:`{
  "id": 55,
  "contributor_username": "someuser",
  "contributor_id": 12,
  "file_path": "Compilation/Unreleased/Song.mp3",
  "destination_path": null,
  "change_type": "replace",
  "staging_filename": "staged-a1b2c3.mp3",
  "original_snapshot": { /* file metadata before this change */ },
  "contributor_notes": "Higher quality rip",
  "status": "pending",
  "reviewer_username": null,
  "review_notes": "",
  "applied_commit_id": null,
  "edit_count": 0,
  "created_at": "...",
  "reviewed_at": null
}`}),e.jsxs("p",{className:"text-xs text-text-muted",children:[e.jsx(t,{children:"status"})," is ",e.jsx(t,{children:"pending"}),", ",e.jsx(t,{children:"approved"}),", ",e.jsx(t,{children:"rejected"}),", or"," ",e.jsx(t,{children:"reversed"}),". ",e.jsx(t,{children:"staging_filename"})," points at the uploaded file sitting in staging until an admin approves it; ",e.jsx(t,{children:"applied_commit_id"})," is set once approval actually lands the change."]})]}),e.jsxs(s,{title:"Admin: Comp File Proposal Review",defaultOpen:!1,children:[e.jsx(n,{headers:["Method","Path","Description"],rows:[["GET","/accounts/admin/comp-proposals/","List all comp-file proposals. Filter: ?status=pending|approved|rejected|reversed"],["POST","/accounts/admin/comp-proposals/{id}/review/","Approve or reject a proposal"],["POST","/accounts/admin/comp-proposals/{id}/reverse/","Reverse a previously approved proposal"],["GET","/accounts/admin/comp-proposals/{id}/staging/","Download the staged file to inspect before approving"]]}),e.jsx(a,{children:`POST /accounts/admin/comp-proposals/{id}/review/

{
  "action": "approve",          // "approve" | "reject"
  "review_notes": "optional"
}`}),e.jsxs("p",{className:"text-xs text-text-muted",children:["Unlike song-data proposals, there is no ",e.jsx(t,{children:'"revise"'})," action here — a comp-file change is either accepted as staged or rejected, since there's no meaningful way to hand-edit a binary file upload."]}),e.jsxs("p",{className:"text-xs text-text-muted",children:[e.jsx(t,{children:"/staging/"})," streams the actual staged file (not JSON) — treat it as a download/preview link, the same way ",e.jsx(t,{children:"/files/download/"})," is used for library audio."]})]}),e.jsxs(s,{title:"Admin: Comp File History",defaultOpen:!1,children:[e.jsx(n,{headers:["Method","Path","Description"],rows:[["GET","/accounts/admin/comp-files/{filepath}/history/","Every revision applied to a given compilation file path"]]}),e.jsx(a,{children:`{
  "filepath": "Compilation/Unreleased/Song.mp3",
  "revisions": [
    {
      "id": 9,
      "filepath": "Compilation/Unreleased/Song.mp3",
      "hash": "d199a85e510b32b9ef3c02a29044a41d",
      "size": 7381244,
      "archive_path": "archive/Compilation/Unreleased/Song.mp3.v9",
      "proposal_id": 55,
      "commit_id": "c_9f2a",
      "is_current": true,
      "created_at": "..."
    }
  ]
}`}),e.jsxs("p",{className:"text-xs text-text-muted",children:["Exactly one revision per file has ",e.jsx(t,{children:"is_current: true"}),". Older revisions stay addressable via"," ",e.jsx(t,{children:"archive_path"})," for rollback/audit, even after a newer one supersedes them."]})]}),e.jsxs(s,{title:"Two-Factor (OTP)",defaultOpen:!1,children:[e.jsx(n,{headers:["Method","Path","Description"],rows:[["GET","/accounts/otp/setup/","Generate a new OTP secret + QR code for enrolling"],["POST","/accounts/otp/setup/","Confirm enrollment with a code from the authenticator app"]]}),e.jsx(a,{children:`// GET response
{
  "otp_enabled": false,
  "account_label": "someuser",
  "otp_secret": "JBSWY3DPEHPK3PXP",
  "provisioning_uri": "otpauth://totp/...",
  "qr_code": "data:image/png;base64,..."
}

// POST request
{ "otp_token": "123456" }
// Response: { "otp_enabled": true }`})]})]})}function H(){return e.jsxs("div",{className:"space-y-6",children:[e.jsxs(s,{title:"What is the Versions API?",children:[e.jsxs("p",{className:"text-sm text-text-secondary leading-relaxed",children:['Groups multiple song rows together as versions of the same underlying track — e.g. a released mix and a leaked earlier take, or several titled variants like "v1", "v2", "TV Mix". Each row links one ',e.jsx(t,{children:"song_id"})," to a shared ",e.jsx(t,{children:"group_id"}),"; every song in a group shares the same ",e.jsx(t,{children:"title"}),` (the display name for the group, e.g. "She's The One"), while each song keeps its own `,e.jsx(t,{children:"version"}),' label (e.g. "v1") distinguishing it from its groupmates.']}),e.jsxs("p",{className:"text-sm text-text-secondary leading-relaxed mt-2",children:["Reads require no auth. Writes (",e.jsx(t,{children:"POST"}),"/",e.jsx(t,{children:"PATCH"}),") require an editor or admin token."]})]}),e.jsxs(s,{title:"Version Row Shape",children:[e.jsx(a,{children:`{
  "id": 501,
  "song_id": 94086,
  "group_id": 94086,
  "version": "v1",
  "title": "She's The One",
  "created_at": "2026-03-04T12:00:00Z",
  "created_by": "freakypallet"
}`}),e.jsxs("p",{className:"text-xs text-text-muted",children:[e.jsx(t,{children:"group_id"})," is just the ",e.jsx(t,{children:"song_id"})," of whichever song originally anchored the group — it has no meaning beyond being a shared key. ",e.jsx(t,{children:"title"})," is ",e.jsx(t,{children:"null"})," until an editor names the group; ",e.jsx(t,{children:"version"})," is ",e.jsx(t,{children:"null"})," until an editor labels that specific song."]})]}),e.jsxs(s,{title:"GET /versions/{song_id}/ — This Song's Row",children:[e.jsx("p",{className:"text-sm text-text-secondary",children:"The one filtered read the API supports server-side. Returns the paginated envelope with 0 or 1 result — empty means the song isn't linked into any group."}),e.jsx(a,{children:`{
  "count": 1,
  "next": null,
  "previous": null,
  "results": [ { "id": 501, "song_id": 94086, "group_id": 94086, "version": "v1", "title": "She's The One", ... } ]
}`})]}),e.jsxs(s,{title:"GET /versions/ — All Rows",children:[e.jsxs("p",{className:"text-sm text-text-secondary",children:["The list endpoint does ",e.jsx("span",{className:"font-semibold text-text-primary",children:"not"})," apply query params (",e.jsx(t,{children:"group_id"}),", ",e.jsx(t,{children:"search"}),", ",e.jsx(t,{children:"title"}),") server-side — any filtering by group or title has to happen client-side. Pass ",e.jsx(t,{children:"?all=true"})," to get every row in one response instead of paging through it (same bulk-mode convention ",e.jsx(t,{children:"/songs/"})," supports)."]}),e.jsx(a,{children:`GET /versions/?all=true

// Response: a plain array (not the paginated envelope)
[
  { "id": 501, "song_id": 94086, "group_id": 94086, "version": "v1",   "title": "She's The One", ... },
  { "id": 502, "song_id": 94112, "group_id": 94086, "version": "v2",   "title": "She's The One", ... },
  { "id": 503, "song_id": 95230, "group_id": 95230, "version": null,   "title": null, ... }
]`})]}),e.jsxs(s,{title:"POST /versions/ — Create a Row (editor+)",children:[e.jsx(a,{children:`POST /versions/
Authorization: Token <token>
Content-Type: application/json

{
  "song_id": 94112,
  "group_id": 94086,
  "version": "v2",
  "title": "She's The One"
}`}),e.jsxs("p",{className:"text-xs text-text-muted",children:["Used both to link a previously-ungrouped song into an existing group and to seed a brand-new group (pass a ",e.jsx(t,{children:"group_id"})," no other row uses yet — the app conventionally uses one of the two songs' own ",e.jsx(t,{children:"song_id"}),")."]})]}),e.jsxs(s,{title:"PATCH /versions/{song_id}/ — Update a Row (editor+)",children:[e.jsx(a,{children:`PATCH /versions/{song_id}/
Authorization: Token <token>
Content-Type: application/json

{ "group_id": 94086, "title": "She's The One" }`}),e.jsxs("p",{className:"text-xs text-text-muted",children:["Any subset of ",e.jsx(t,{children:"group_id"}),", ",e.jsx(t,{children:"version"}),", ",e.jsx(t,{children:"title"})," may be sent. There is no bulk-write endpoint — merging two groups or renaming a group's title means sending one",e.jsx(t,{children:" PATCH"})," per affected song."]})]}),e.jsx(s,{title:"Common Operations (client-side recipes)",children:e.jsxs("ul",{className:"space-y-3 text-sm text-text-secondary",children:[e.jsxs("li",{children:[e.jsx("span",{className:"font-semibold text-text-primary",children:"Link two ungrouped songs:"})," create two rows sharing a new ",e.jsx(t,{children:"group_id"})," (e.g. the lower of the two song IDs)."]}),e.jsxs("li",{children:[e.jsx("span",{className:"font-semibold text-text-primary",children:"Add an ungrouped song to an existing group:"})," ",e.jsx(t,{children:"POST"})," one row with that group's ",e.jsx(t,{children:"group_id"})," and ",e.jsx(t,{children:"title"}),"."]}),e.jsxs("li",{children:[e.jsx("span",{className:"font-semibold text-text-primary",children:"Merge two existing groups:"})," fetch every row in both groups (via ",e.jsx(t,{children:"?all=true"}),"), then ",e.jsx(t,{children:"PATCH"})," every row in the losing group to the surviving ",e.jsx(t,{children:"group_id"})," — and if only one side had a ",e.jsx(t,{children:"title"})," set, ",e.jsx(t,{children:"PATCH"})," ","that title onto every row in the merged group so all members agree."]}),e.jsxs("li",{children:[e.jsx("span",{className:"font-semibold text-text-primary",children:"Rename a group's title:"})," ",e.jsx(t,{children:"PATCH"})," ",e.jsx(t,{children:"{ title }"})," onto every row whose ",e.jsx(t,{children:"group_id"})," matches."]})]})})]})}function B(){return e.jsxs("div",{className:"space-y-6",children:[e.jsxs(s,{title:"Fetch Utility",children:[e.jsx("p",{className:"text-sm text-text-secondary",children:"Always use a utility function — never fetch inline in components."}),e.jsx(a,{children:`// lib/juicewrld.ts
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
}`})]}),e.jsx(s,{title:"React Hook Pattern",children:e.jsx(a,{children:`// hooks/useSongs.ts
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
}`})}),e.jsx(s,{title:"Audio Streaming",children:e.jsx(a,{children:`// Simple — browser handles range/seeking automatically
<audio
  controls
  src={\`https://juicewrldapi.com/juicewrld/files/download/?path=\${encodeURIComponent(song.path)}\`}
/>

// Tier check before rendering play button
{song.path && (
  <button onClick={() => playSong(song)}>▶</button>
)}`})}),e.jsx(s,{title:"Tips",children:e.jsxs("ul",{className:"space-y-2 text-sm text-text-secondary",children:[e.jsxs("li",{className:"flex items-start gap-2",children:[e.jsx("span",{className:"text-accent mt-0.5",children:"•"})," Use ",e.jsx(t,{children:"song.path"})," directly as the stream path — it's already in the right format."]}),e.jsxs("li",{className:"flex items-start gap-2",children:[e.jsx("span",{className:"text-accent mt-0.5",children:"•"})," The browser ",e.jsx(t,{children:"<audio>"})," element handles Range requests automatically — just set ",e.jsx(t,{children:"src"}),"."]}),e.jsxs("li",{className:"flex items-start gap-2",children:[e.jsx("span",{className:"text-accent mt-0.5",children:"•"})," Debounce search inputs 300–500 ms to avoid hammering the API."]}),e.jsxs("li",{className:"flex items-start gap-2",children:[e.jsx("span",{className:"text-accent mt-0.5",children:"•"})," ",e.jsx(t,{children:"track_titles"})," is an array — a song may have multiple alternative titles. Show the first or let users pick."]}),e.jsxs("li",{className:"flex items-start gap-2",children:[e.jsx("span",{className:"text-accent mt-0.5",children:"•"})," Not all songs have a ",e.jsx(t,{children:"path"})," (some are metadata-only). Check before rendering a play button."]}),e.jsxs("li",{className:"flex items-start gap-2",children:[e.jsx("span",{className:"text-accent mt-0.5",children:"•"})," ",e.jsx(t,{children:"image_url"})," is relative — prepend ",e.jsx(t,{children:"https://juicewrldapi.com"}),"."]}),e.jsxs("li",{className:"flex items-start gap-2",children:[e.jsx("span",{className:"text-accent mt-0.5",children:"•"})," Use ",e.jsx(t,{children:"/radio/random/"})," for a shuffle/discover feature — it already returns a playable file."]}),e.jsxs("li",{className:"flex items-start gap-2",children:[e.jsx("span",{className:"text-accent mt-0.5",children:"•"})," Check ",e.jsx(t,{children:"/account/me/"})," first to know the role — don't probe restricted endpoints and handle 403s."]})]})})]})}function W(){return e.jsxs("div",{className:"space-y-6",children:[e.jsxs(s,{title:"What is 999 FM?",children:[e.jsx("p",{className:"text-sm text-text-secondary leading-relaxed",children:"999 FM is the Juice WRLD API radio — a single endpoint that returns a random, fully playable song on every request. Named after Juice WRLD's 999 brand, it's designed for discover or continuous playback features: call it, stream the song, call it again for the next one."}),e.jsx("p",{className:"text-sm text-text-secondary leading-relaxed mt-2",children:"No authentication required. Returns a full song object plus the direct stream path."})]}),e.jsxs(s,{title:"GET /radio/random/",children:[e.jsx("p",{className:"text-sm text-text-secondary",children:"Pick a random song from the full catalogue and return its stream path and metadata."}),e.jsx(a,{children:"GET https://juicewrldapi.com/juicewrld/radio/random/"}),e.jsx("p",{className:"text-xs text-text-muted mt-2",children:"No parameters required. Every call returns a different song."}),e.jsxs("div",{className:"mt-4",children:[e.jsx("p",{className:"text-xs font-semibold text-text-muted uppercase tracking-wide mb-2",children:"Response"}),e.jsx(a,{children:`{
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
}`})]}),e.jsx(n,{headers:["Field","Type","Description"],rows:[[e.jsx(t,{children:"id"}),"string","Internal file path (same as path)"],[e.jsx(t,{children:"title"}),"string","Song title"],[e.jsx(t,{children:"path"}),"string","Stream path — pass to /files/download/?path="],[e.jsx(t,{children:"size"}),"number","File size in bytes"],[e.jsx(t,{children:"modified"}),"string","ISO 8601 last-modified timestamp"],[e.jsx(t,{children:"hash"}),"string","MD5 file hash (use for deduplication or cache-busting)"],[e.jsx(t,{children:"song"}),"object","Full song object — same shape as GET /songs/{id}/"]]})]}),e.jsxs(s,{title:"Streaming the result",children:[e.jsxs("p",{className:"text-sm text-text-secondary",children:["The ",e.jsx(t,{children:"path"})," field maps directly to the ",e.jsx(t,{children:"/files/download/"})," endpoint. Pass it as the stream URL for your audio element."]}),e.jsx(a,{children:`const BASE = 'https://juicewrldapi.com/juicewrld';

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
audioElement.play();`})]}),e.jsx(s,{title:"React hook — useRadio",children:e.jsx(a,{children:`import { useState, useCallback } from 'react';

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
}`})}),e.jsxs(s,{title:"Live Radio — one shared broadcast",children:[e.jsxs("p",{className:"text-sm text-text-secondary leading-relaxed",children:["Separate from ",e.jsx(t,{children:"/radio/random/"})," above. That endpoint hands each client its own random song; this is a single ",e.jsx("span",{className:"font-semibold text-text-primary",children:"shared station"})," — every listener hears the same audio at the same time, with listener counts and community skip/queue votes. No auth required."]}),e.jsx(n,{headers:["Transport","Endpoint","Purpose"],rows:[["REST","GET /radio/live/","One-shot snapshot of station state — now playing, up next, vote, listener counts"],["WebSocket","/ws/radio/","Live metadata pushes, vote participation, and (optionally) the audio itself"],["HTTP","GET /radio/stream.mp3","Plain MP3 stream — the fallback when MediaSource is unavailable"]]}),e.jsxs("p",{className:"text-xs text-text-muted",children:["The websocket URL is the API base with its scheme swapped to ",e.jsx(t,{children:"ws"}),"/",e.jsx(t,{children:"wss"})," and"," ",e.jsx(t,{children:"/ws/radio/"})," appended — e.g. ",e.jsx(t,{children:"wss://juicewrldapi.com/juicewrld/ws/radio/"}),"."]})]}),e.jsxs(s,{title:"GET /radio/live/ — Station State",children:[e.jsx(a,{children:`{
  "is_live": true,
  "station": "999 FM",
  "state": "playing",
  "stream_url": "https://juicewrldapi.com/juicewrld/radio/stream.mp3",
  "now_playing": {
    "title": "Maze",
    "artist": "Juice WRLD",
    "album": "...",
    "display": "Juice WRLD — Maze",
    "elapsed_ms": 41000,
    "duration_ms": 144000,
    "image_url": "/assets/wod.jpg",
    "song_id": 95001
  },
  "up_next": { /* same shape, or null */ },
  "queue_preview": ["Song A", "Song B"],
  "dj_enabled": true,
  "dj_line": "Coming up next…",
  "vote": {
    "active": true,
    "kind": "skip",           // "skip" | "queue"
    "yes": 3,
    "no": 1,
    "votes_needed": 5,
    "total_listeners": 12,
    "seconds_left": 20,
    "track": "Maze"
  },
  "web_listeners": 8,
  "discord_listeners": 4,
  "total_listeners": 12,
  "stale_seconds": null
}`}),e.jsxs("p",{className:"text-xs text-text-muted",children:[e.jsx(t,{children:"song_id"})," on a track is the numeric API song id, so a live track can be looked up via"," ",e.jsx(t,{children:"/songs/{id}/"})," for full metadata, lyrics, or cover art. ",e.jsx(t,{children:"image_url"})," is relative — prepend ",e.jsx(t,{children:"https://juicewrldapi.com"}),". ",e.jsx(t,{children:"vote.active: false"})," means no vote is running and the other vote fields may be absent."]})]}),e.jsxs(s,{title:"WebSocket /ws/radio/",children:[e.jsxs("p",{className:"text-sm text-text-secondary",children:["The socket carries ",e.jsx("span",{className:"font-semibold text-text-primary",children:"both"})," metadata and audio: text frames are JSON station-state objects (same shape as ",e.jsx(t,{children:"/radio/live/"}),"), binary frames are MP3 chunks. Set ",e.jsx(t,{children:"binaryType = 'arraybuffer'"})," and branch on the frame type."]}),e.jsx(a,{children:`const ws = new WebSocket('wss://juicewrldapi.com/juicewrld/ws/radio/')
ws.binaryType = 'arraybuffer'

ws.onmessage = (e) => {
  if (typeof e.data === 'string') {
    const state = JSON.parse(e.data)   // RadioLiveState — update the UI
  } else {
    // MP3 chunk — feed to a MediaSource SourceBuffer('audio/mpeg')
  }
}`}),e.jsx("p",{className:"text-xs text-text-muted font-semibold mt-3",children:"Client → server messages:"}),e.jsx(n,{headers:["Message","Purpose"],rows:[[e.jsx(t,{children:'{ type: "listening", value, audio }'}),e.jsxs(e.Fragment,{children:["Join/leave the listener count. ",e.jsx(t,{children:"audio"})," is ",e.jsx(t,{children:'"ws"'})," or ",e.jsx(t,{children:'"http"'})," depending on which stream you're consuming. Re-send on reconnect if still listening."]})],[e.jsx(t,{children:'{ type: "propose_skip" }'}),"Start a vote to skip the current track"],[e.jsx(t,{children:'{ type: "propose_queue", song_id }'}),e.jsxs(e.Fragment,{children:["Start a vote to queue a song. ",e.jsx(t,{children:"song_id"})," must be the ",e.jsx("span",{className:"font-semibold text-text-primary",children:"number"})," — a stringified id is silently ignored and the vote never starts."]})],[e.jsx(t,{children:'{ type: "vote", value }'}),e.jsxs(e.Fragment,{children:[e.jsx(t,{children:'"yes"'})," or ",e.jsx(t,{children:'"no"'})," on the active vote"]})]]}),e.jsx("p",{className:"text-xs text-text-muted font-semibold mt-3",children:"Playback notes:"}),e.jsxs("ul",{className:"space-y-2 text-sm text-text-secondary",children:[e.jsxs("li",{className:"flex items-start gap-2",children:[e.jsx("span",{className:"text-accent mt-0.5",children:"•"})," Binary frames only make sense with MediaSource (",e.jsx(t,{children:"audio/mpeg"}),"). Where it's unsupported, ignore them and point an ",e.jsx(t,{children:"<audio>"})," element at ",e.jsx(t,{children:"/radio/stream.mp3"})," instead — tell the server which you chose via the ",e.jsx(t,{children:"audio"})," field."]}),e.jsxs("li",{className:"flex items-start gap-2",children:[e.jsx("span",{className:"text-accent mt-0.5",children:"•"})," Because it's a live stream, buffered audio drifts behind. Seek forward when you fall more than a few seconds behind the buffered end, and evict old buffered ranges or the SourceBuffer eventually throws ",e.jsx(t,{children:"QuotaExceededError"}),"."]}),e.jsxs("li",{className:"flex items-start gap-2",children:[e.jsx("span",{className:"text-accent mt-0.5",children:"•"})," Reconnect on close — background tabs get their socket closed and audio paused silently, with no event fired, so a periodic health check is worth having."]})]})]}),e.jsx(s,{title:"Notes",children:e.jsxs("ul",{className:"space-y-2 text-sm text-text-secondary",children:[e.jsxs("li",{className:"flex items-start gap-2",children:[e.jsx("span",{className:"text-accent mt-0.5",children:"•"})," Calls are not seeded — every request is independent. Repeats are possible but rare given the 2,452-song catalogue."]}),e.jsxs("li",{className:"flex items-start gap-2",children:[e.jsx("span",{className:"text-accent mt-0.5",children:"•"})," The ",e.jsx(t,{children:"song"})," object is identical to ",e.jsx(t,{children:"/songs/{id}/"})," — full producers, engineers, lyrics, synced lyrics, and groupbuy info included."]}),e.jsxs("li",{className:"flex items-start gap-2",children:[e.jsx("span",{className:"text-accent mt-0.5",children:"•"})," ",e.jsx(t,{children:"image_url"})," is a relative path (e.g. ",e.jsx(t,{children:"/assets/wod.jpg"}),") — prepend ",e.jsx(t,{children:"https://juicewrldapi.com"})," for use in ",e.jsx(t,{children:"<img>"})," tags."]}),e.jsxs("li",{className:"flex items-start gap-2",children:[e.jsx("span",{className:"text-accent mt-0.5",children:"•"})," The stream endpoint supports HTTP Range requests — the browser ",e.jsx(t,{children:"<audio>"})," element handles seeking automatically."]}),e.jsxs("li",{className:"flex items-start gap-2",children:[e.jsx("span",{className:"text-accent mt-0.5",children:"•"})," No rate limiting on public endpoints, but call once per track end — not on a tight loop."]})]})})]})}const E=[{id:"overview",label:"Overview"},{id:"songs",label:"Songs & Search"},{id:"versions",label:"Versions"},{id:"files",label:"Files & Stream"},{id:"playlists",label:"Playlists"},{id:"radio",label:"999 FM"},{id:"auth",label:"Auth & Accounts"},{id:"patterns",label:"Code Patterns"}],J={overview:M,songs:I,versions:H,files:z,playlists:U,radio:W,auth:q,patterns:B};function $({tab:i,query:d,register:l,visible:c,showLabel:m}){const p=h.useMemo(()=>({query:d,tab:i.id,register:l}),[d,i.id,l]),u=J[i.id];return e.jsx("div",{hidden:!c,children:e.jsxs(_.Provider,{value:p,children:[m&&e.jsx("p",{className:"text-[10px] font-bold uppercase tracking-widest text-text-muted mb-3 mt-2",children:i.label}),e.jsx(u,{})]})})}function Z(){const[i,d]=h.useState("overview"),[l,c]=h.useState(""),{setActiveView:m}=R("setActiveView"),p=h.useRef(new Map),[u,y]=h.useReducer(o=>o+1,0),v=h.useCallback((o,x,f,P)=>{const N=p.current.get(o);N&&N.text===P&&N.title===f||(p.current.set(o,{tab:x,title:f,text:P}),y())},[]),j=l.trim().toLowerCase(),b=h.useMemo(()=>{const o=new Map;if(!j)return o;for(const x of p.current.values())(x.title.toLowerCase().includes(j)||x.text.includes(j))&&o.set(x.tab,(o.get(x.tab)??0)+1);return o},[j,u]),w=h.useMemo(()=>[...b.values()].reduce((o,x)=>o+x,0),[b]);return e.jsxs("div",{className:"flex-1 flex flex-col h-full overflow-hidden bg-[var(--surface)]",children:[e.jsxs("div",{className:"flex-shrink-0 px-6 pt-6 pb-0 border-b border-[var(--border)]",children:[e.jsxs("div",{className:"flex items-baseline gap-3 mb-4",children:[e.jsx("button",{onClick:()=>m("wrld"),title:"Back",className:"p-1 -ml-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors shrink-0 self-center",children:e.jsx(O,{size:18})}),e.jsx("h1",{className:"text-text-primary text-xl font-bold",children:"API Docs"}),e.jsx("span",{className:"text-xs text-text-muted font-mono",children:"juicewrldapi.com"}),e.jsxs("a",{href:"https://juicewrldapi.com/api-docs",target:"_blank",rel:"noopener noreferrer",className:"ml-auto flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors",children:["Open live docs ",e.jsx(C,{size:11})]})]}),e.jsxs("div",{className:"relative mb-3",children:[e.jsx(S,{size:14,className:"absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"}),e.jsx("input",{value:l,onChange:o=>c(o.target.value),onKeyDown:o=>{o.key==="Escape"&&c("")},placeholder:"Search all docs — endpoints, fields, params…",className:"w-full bg-[var(--surface-raised)] border border-[var(--border)] rounded-xl pl-9 pr-16 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 transition-colors"}),l&&e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"absolute right-9 top-1/2 -translate-y-1/2 text-[10px] text-text-muted tabular-nums",children:w}),e.jsx("button",{onClick:()=>c(""),title:"Clear search",className:"absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-text-muted hover:text-text-primary transition-colors",children:e.jsx(D,{size:13})})]})]}),e.jsx("div",{className:"flex gap-1 overflow-x-auto pb-0 scrollbar-none",children:E.map(o=>{const x=b.get(o.id)??0,f=!!j&&x===0;return e.jsxs("button",{onClick:()=>{d(o.id),c("")},className:`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${!j&&i===o.id?"text-accent border-accent":`border-transparent hover:text-text-primary ${f?"text-text-muted/40":"text-text-muted"}`}`,children:[o.label,!!j&&x>0&&e.jsx("span",{className:"text-[10px] tabular-nums bg-accent/15 text-accent rounded px-1 py-0.5",children:x})]},o.id)})})]}),e.jsx("div",{className:"flex-1 overflow-y-auto p-6",children:e.jsxs("div",{className:"max-w-4xl mx-auto space-y-6",children:[j&&w===0&&e.jsxs("div",{className:"text-center py-16",children:[e.jsx(S,{size:28,className:"mx-auto text-text-muted mb-3 opacity-40"}),e.jsxs("p",{className:"text-sm text-text-secondary",children:["No matches for “",l.trim(),"”"]}),e.jsx("p",{className:"text-xs text-text-muted mt-1",children:"Try an endpoint path, a field name, or a parameter."})]}),E.map(o=>e.jsx($,{tab:o,query:j,register:v,visible:j?(b.get(o.id)??0)>0:i===o.id,showLabel:!!j},o.id))]})})]})}export{Z as default};
