// Network layer for per-song user preferences. See songPrefs.ts for the data
// shape and the read-side cache, and the store's `songPrefs` for the writes.
//
// The live backend stores preferences as ONE JSON array (`user_preferences`)
// on the user profile — GET/PATCH /accounts/account/me/ — not as per-song
// rows. So there is no per-song save, no delete, and no server-side playcount
// increment: the client owns the whole array and PATCHes it in full. The
// store debounces those pushes (a burst of edits collapses into one PATCH)
// and merges the profile's copy back in on login (see syncSongPrefs, which
// takes max() of playcounts so plays made offline are never lost).
//
// The item shape matches SongPreference exactly:
//   { song, cover_url, name, default_version, playcount }
// capped at SERVER_PREFS_LIMIT rows by the backend validator — capSongPrefs
// picks which rows go when the local map outgrows that.
import { JWAPI_BASE } from './juicewrldApi'
import { getToken } from './userApi'
import { apiRequest } from './apiClient'
import { capSongPrefs } from './songPrefs'
import type { SongPreference } from './songPrefs'

/** Live since the profile-blob fields shipped (2026-07-17). */
export const preferencesApiEnabled = true

const ME_URL = `${JWAPI_BASE}/accounts/account/me/`

/** Replaces the profile's `user_preferences` with this device's array.
 *  No-op when signed out — preferences are local-first and stay usable. */
export async function pushPreferences(prefs: SongPreference[]): Promise<void> {
  if (!preferencesApiEnabled) return
  const token = getToken()
  if (!token) return
  await apiRequest<unknown>(ME_URL, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Token ${token}` },
    body: JSON.stringify({ user_preferences: capSongPrefs(prefs) }),
  })
}
