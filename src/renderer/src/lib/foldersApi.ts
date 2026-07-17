// Network layer for playlist folders. See lib/playlistFolders.ts for the data
// shape and the store's folder slice for the local-first merge logic.
//
// The live backend stores folders as ONE JSON array (`playlist_folders`) on
// the user profile — GET/PATCH /accounts/account/me/ — not as folder rows.
// The client owns the array and PATCHes it in full; the store debounces the
// pushes and merges the profile's copy on login. Only synced playlists reach
// the server (toServerFolders maps each folder to { id, name, playlist_ids })
// — device-local ("local:") members never leave this machine and are
// re-attached after a pull by matching on the round-tripped folder id.
import { JWAPI_BASE } from './juicewrldApi'
import { getToken } from './userApi'
import { apiRequest } from './apiClient'
import { toServerFolders } from './playlistFolders'
import type { PlaylistFolder } from './playlistFolders'

/** Live since the profile-blob fields shipped (2026-07-17). */
export const foldersApiEnabled = true

const ME_URL = `${JWAPI_BASE}/accounts/account/me/`

/** Replaces the profile's `playlist_folders` with this device's folders
 *  (synced-playlist membership only). No-op when signed out. */
export async function pushFolders(folders: PlaylistFolder[]): Promise<void> {
  if (!foldersApiEnabled) return
  const token = getToken()
  if (!token) return
  await apiRequest<unknown>(ME_URL, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Token ${token}` },
    body: JSON.stringify({ playlist_folders: toServerFolders(folders) }),
  })
}
