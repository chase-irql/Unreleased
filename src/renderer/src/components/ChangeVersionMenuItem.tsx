import { useMemo, useState } from 'react'
import { Layers, ChevronDown, Loader2, Star } from 'lucide-react'
import { getVersionGroup } from '../lib/versionsApi'
import { apiFetch, JWApiSong } from '../lib/juicewrldApi'
import { useStore } from '../store/useStore'
import { useShallow } from 'zustand/react/shallow'

interface Props {
  songId: number
  onChangeVersion: (song: JWApiSong) => void
}

interface VersionOption { song: JWApiSong; label: string | null; version: string | null }

/** "Change version" menu item — dropped into every song context menu in the
 *  app (see ApiTrackerView, LikedSongsView, PlaylistsView, Player, WrldView).
 *  Self-contained (owns its own expand/collapse + fetch state) so it plugs
 *  into any existing menu without touching that menu's own state shape.
 *  Siblings are fetched lazily on first expand rather than eagerly whenever
 *  the parent menu opens — doing that for every song regardless of whether
 *  the user ever clicks this item is exactly the kind of needless-fetch
 *  pattern that made compact view laggy before.
 *
 *  Clicking a sibling's name plays it now (a one-off). The star pins it as the
 *  group's *default* version (lib/songPrefs) so every future play of any
 *  version of this song resolves to it — the persistent counterpart to the
 *  one-off switch, set right where the user is already comparing versions. */
export default function ChangeVersionMenuItem({ songId, onChangeVersion }: Props): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [versions, setVersions] = useState<VersionOption[] | null>(null)
  const { songPrefs, setSongDefaultVersion } = useStore(
    useShallow((s) => ({
      songPrefs: s.songPrefs,
      setSongDefaultVersion: s.setSongDefaultVersion,
    }))
  )

  // Own row wins if set, else the first sibling that has one — mirrors
  // queueSlice's groupDefaultVersion so the star here matches what playback
  // actually resolves to, even when the default was set from a *different*
  // version's own menu rather than this song's.
  const defaultVersion = useMemo(() => {
    const own = songPrefs[songId]?.default_version
    if (own) return own
    for (const v of versions ?? []) {
      const d = songPrefs[v.song.id]?.default_version
      if (d) return d
    }
    return null
  }, [songPrefs, songId, versions])

  const toggle = async (): Promise<void> => {
    if (expanded) { setExpanded(false); return }
    setExpanded(true)
    if (versions != null) return
    setLoading(true)
    try {
      const metas = await getVersionGroup(songId)
      const fetched = await Promise.all(metas.map(m =>
        apiFetch<JWApiSong>(`/songs/${m.songId}/`)
          .then(song => ({
            song,
            version: m.version,
            label: m.version
              ? (m.versionTitle ? `${m.version} — ${m.versionTitle}` : m.version)
              : m.versionTitle,
          }))
          .catch(() => null)
      ))
      // Songs with no `path` (recording sessions, some unsurfaced entries)
      // have nothing to actually play — hidden here since both switching to
      // one and starring it as the group default would break playback.
      setVersions(fetched.filter((v): v is VersionOption => !!v && !!v.song.path))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); toggle() }}
        className="w-full flex items-center justify-between gap-2.5 px-3 py-2 text-sm text-left text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors"
      >
        <span className="flex items-center gap-2.5"><Layers size={14} /> Change version</span>
        <ChevronDown size={12} className={`text-text-muted transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="border-t border-[var(--border)] max-h-44 overflow-y-auto">
          {loading ? (
            <p className="px-3.5 py-2 text-xs text-text-muted flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" /> Loading…
            </p>
          ) : !versions || versions.length === 0 ? (
            <p className="px-3.5 py-2 text-xs text-text-muted">No other versions linked.</p>
          ) : (
            versions.map(({ song, label, version }) => {
              const isDefault = !!version && defaultVersion?.toLowerCase() === version.toLowerCase()
              return (
                <div
                  key={song.id}
                  className="w-full flex items-center gap-1 pr-1.5 hover:bg-surface-overlay transition-colors"
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); onChangeVersion(song) }}
                    className="flex-1 min-w-0 text-left pl-3.5 py-2 text-sm text-text-secondary hover:text-text-primary truncate"
                  >
                    {song.track_titles?.[0] || song.name}
                    {label && <span className="text-text-muted text-xs"> — {label}</span>}
                  </button>
                  {version && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!isDefault) { setSongDefaultVersion(songId, version); return }
                        // Unstarring has to clear wherever the label actually
                        // lives (own row or an inherited sibling's) or the
                        // star would stay lit next render.
                        if (songPrefs[songId]?.default_version?.toLowerCase() === version.toLowerCase()) {
                          setSongDefaultVersion(songId, null)
                        }
                        for (const v of versions ?? []) {
                          if (songPrefs[v.song.id]?.default_version?.toLowerCase() === version.toLowerCase()) {
                            setSongDefaultVersion(v.song.id, null)
                          }
                        }
                      }}
                      title={isDefault ? 'Default version — click to unset' : `Always play "${version}" for this song`}
                      className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-md transition-colors ${isDefault ? 'text-accent' : 'text-text-muted hover:text-text-primary'}`}
                    >
                      <Star size={13} fill={isDefault ? 'currentColor' : 'none'} />
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </>
  )
}
