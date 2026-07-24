# News API — backend spec

The desktop/web client already implements the full News feature against this
contract; it's dormant behind a single `NEWS_ENABLED` flag until these endpoints
exist. Implement the routes below and the client lights up with no further
changes. Source of truth: `src/renderer/src/lib/newsApi.ts` and
`newsNotifications.ts`.

- **Base URL:** `https://juicewrldapi.com/juicewrld/news`
- **Auth:** `Authorization: Token <token>` (same scheme as the rest of the API).
- **Pagination:** same envelope as `/songs/` — `{ results, count, next }`.
- **Roles:** any `is_editor`/`is_administrator` can **create** posts. **Editing
  and deleting a post is owner-only for editors** — an editor may modify only
  their own posts; an admin may modify any. `is_administrator` only for channel
  create/edit/delete. Public read for GETs. Enforce this server-side; the client
  mirrors it via `author_id` (below) but that's UI only.

---

## 1. Posts

### `GET /news/`
Public. Query params:
| param | type | notes |
|-------|------|-------|
| `channel` | string | filter by channel id; omit for the whole feed |
| `ordering` | string | `-published_at` (newest, **default**) or `published_at` (oldest) — DRF-style. The UI has a Newest/Oldest toggle. |
| `page` | int | |
| `page_size` | int | client requests up to 30 for the notification poll |

Response `200`:
```json
{ "results": [ NewsItem, ... ], "count": 123, "next": "…url|null" }
```
Default order is newest-first. The notification poll also assumes a higher `id`
== newer post — please keep ids monotonic with creation, or tell me and I'll
switch the diff to `published_at`.

### `GET /news/{id}/`
Public. Returns a single `NewsItem`.

### `POST /news/`
Editor+. Body = `NewsItemInput`. Returns the created `NewsItem` (`201`).
`author` is set server-side from the token — the client never sends it.

### `PATCH /news/{id}/`
Editor+. Body = partial `NewsItemInput`. Returns the updated `NewsItem`.

### `DELETE /news/{id}/`
Owner (editor) or admin. `204` on success.

> **Ownership rule (decided):** editors may PATCH/DELETE only posts where
> `author_id` == their account id; admins may modify any post. The client
> already hides Edit/Delete accordingly — please enforce it server-side too and
> return `author_id` on every post so the client can gate correctly.

### Types

```ts
NewsItem {
  id: number
  title: string
  summary: string            // short teaser shown in the feed list
  body: string               // Markdown (GFM). Rendered client-side; store as-is.
  image_url: string | null   // hosted URL of the lead/cover image
  channel: string            // a channel id (never "all")
  category: string | null    // freeform tag, e.g. "Release"
  featured: boolean          // hero/pinned at top of feed
  author: string | null      // display name, set server-side
  author_id: number | null   // poster's account id — client gates edit/delete on this
  attachments: NewsAttachment[]
  published_at: string       // ISO 8601
}

NewsItemInput {              // POST/PATCH body
  title: string
  summary: string
  body: string
  channel: string
  category?: string | null
  featured?: boolean
  image_url?: string | null            // inline base64 / hosted URL / null — see §3
  attachments?: NewsAttachment[]       // hosted records (upload via /news/uploads/ first) — see §3
}
```

---

## 2. Channels

The client renders a client-side **"All"** tab itself — do **not** return an
"all" channel from the API. `id` is a stable slug; the client sends it as
`?channel=` and stores it on posts and in subscriptions.

### `GET /news/channels/`
Public. Returns either a bare array **or** a `{ results }` envelope (client
handles both): `[ NewsChannel, ... ]`.

### `POST /news/channels/`
Admin. Body = `ChannelInput`. Server derives the `id` slug from `label`. Returns `NewsChannel`.

### `PATCH /news/channels/{id}/`
Admin. Body = partial `ChannelInput`. Returns `NewsChannel`.

### `DELETE /news/channels/{id}/`
Admin. `204`. (Decide what happens to posts in a deleted channel — cascade
delete vs. reassign vs. block deletion while non-empty. The client just shows a
"posts may be affected" warning.)

### Types

```ts
NewsChannel { id: string; label: string; description?: string | null }
ChannelInput { label: string; description?: string | null }
```

---

## 3. Images & files

Two different mechanisms, by size:

### Cover image — inline base64
`NewsItemInput.image_url` on create/edit may be a base64
`data:image/jpeg;base64,…` string (a newly-picked, client-compressed image,
~≤400 KB), `null` (remove), or an already-hosted URL (unchanged). It's small and
pre-compressed, so it rides inline in the post JSON. Store/host it and always
return a hosted URL in `NewsItem.image_url`.

### Attachments — dedicated upload endpoint
Attachments can be up to **25 MB**, so they do **not** go inline (base64 would
inflate the body ~33% and bloat every request). Instead:

**`POST /news/uploads/`** — Editor+. `multipart/form-data` with a single `file`
field. Hosts the file and returns a `NewsAttachment`:
```json
{ "id": 1, "name": "stems.zip", "url": "https://…", "mime": "application/zip", "size": 8123456 }
```

The client uploads each newly-picked file here first (on publish), then sends the
returned records in `NewsItemInput.attachments` as the **full desired set** —
records with an existing `url` are kept, newly-uploaded ones are added, anything
omitted is removed. So `NewsItemInput.attachments` is just `NewsAttachment[]`.

```ts
NewsAttachment {              // upload response + in NewsItem responses + in post bodies
  id?: number
  name: string
  url: string                 // hosted download URL
  mime: string
  size: number                // bytes
}
```

---

## 4. User subscriptions (for notifications)

Subscriptions ride on the **existing** profile blob route, not a new endpoint —
add one JSON field alongside `user_preferences` / `playlist_folders`:

- **`GET /accounts/account/me/`** → include `news_subscriptions: string[]`
  (array of channel ids the user follows).
- **`PATCH /accounts/account/me/`** → accept `news_subscriptions: string[]` and
  replace the stored array (whole-array replace, same as the other blobs).

The client keeps subscriptions in localStorage as the source of truth and
mirrors them here so they follow the user across devices. Notifications
themselves are delivered **client-side** (OS notifications via a polling
check) — no push infrastructure required on the backend. There is **no**
server-sent/websocket requirement for v1.

---

## Summary of what's new

| Route | Methods | Auth |
|-------|---------|------|
| `/news/` | GET, POST | GET public · POST editor+ |
| `/news/{id}/` | GET, PATCH, DELETE | GET public · PATCH/DELETE owner-or-admin |
| `/news/uploads/` | POST (multipart) | editor+ |
| `/news/channels/` | GET, POST | GET public · POST admin |
| `/news/channels/{id}/` | PATCH, DELETE | admin |
| `/accounts/account/me/` | (existing) | add `news_subscriptions: string[]` field |
