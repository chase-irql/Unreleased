import { useEffect, useMemo, useState } from 'react'
import { Check, X, ImageIcon, RotateCcw, Star, Music2, Play, Sparkles } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { JWApiSong, resolvePrefCoverUrl } from '../lib/juicewrldApi'
import { getOwnVersionMeta, SongVersionMeta } from '../lib/versionsApi'

// The "Personalize" editor shown inside SongInfoModal — the one place a user
// sets the per-song overrides in lib/songPrefs (custom name, custom cover,
// preferred version) and sees their playcount. Everything here writes through
// the store's song-preference actions, which are local-first, so it works
// logged out; the changes propagate to every surface that builds a Track from
// this song (player, queue, lists) on the next render.

interface VersionEntry { song: JWApiSong; meta: SongVersionMeta }

function GroupLabel({ children }: { children: string }): JSX.Element {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted pt-4 pb-1.5">
      {children}
    </p>
  )
}

export default function SongPrefsSection({
  songId, apiTitle, apiImageUrl, ownImageRaw, versions,
}: {
  songId: number
  /** The song's own primary title — the placeholder/reset target for the name. */
  apiTitle: string
  /** The song's own cover, resolved — the reset target and default swatch. */
  apiImageUrl?: string
  /** The song's own raw image_url (as the API returned it), stored verbatim
   *  when the user picks "this song's cover" so the value matches the backend's
   *  own pointer shape rather than an app-resolved absolute URL. */
  ownImageRaw: string | null
  /** Linked version siblings, already fetched by the modal. */
  versions: VersionEntry[]
}): JSX.Element {
  const { pref, setSongName, setSongCover, setSongDefaultVersion, clearSongPref, account } = useStore(
    useShallow((s) => ({
      pref: s.songPrefs[songId],
      setSongName: s.setSongName,
      setSongCover: s.setSongCover,
      setSongDefaultVersion: s.setSongDefaultVersion,
      clearSongPref: s.clearSongPref,
      account: s.account,
    }))
  )

  // ── Name ──────────────────────────────────────────────────────────────────
  const [nameDraft, setNameDraft] = useState(pref?.name ?? '')
  // Re-seed when switching songs, or when the stored name changes underneath us
  // (another window edited it, or a save rolled back).
  useEffect(() => { setNameDraft(pref?.name ?? '') }, [pref?.name, songId])
  const commitName = (): void => {
    const next = nameDraft.trim() || null
    if (next !== (pref?.name ?? null)) setSongName(songId, next)
  }

  // ── Own version label ─────────────────────────────────────────────────────
  // The modal hands us the siblings but not the song's own row, so fetch it —
  // needed both to offer "this song" as a default-version choice and to show
  // which label is currently preferred.
  const [ownMeta, setOwnMeta] = useState<SongVersionMeta | null>(null)
  useEffect(() => {
    let alive = true
    getOwnVersionMeta(songId).then((m) => { if (alive) setOwnMeta(m) }).catch(() => {})
    return () => { alive = false }
  }, [songId])

  // ── Default-version choices ───────────────────────────────────────────────
  // One entry per distinct version label across the whole group (this song +
  // siblings). Storing the label (not a song id) is what lets a default set
  // here govern the group no matter which member is played — see queueSlice's
  // groupDefaultVersion.
  const versionChoices = useMemo(() => {
    const out: { label: string; title: string }[] = []
    const seen = new Set<string>()
    const push = (v: string | null | undefined, title: string): void => {
      const label = v?.trim()
      if (!label || seen.has(label.toLowerCase())) return
      seen.add(label.toLowerCase())
      out.push({ label, title })
    }
    push(ownMeta?.version, apiTitle)
    for (const v of versions) push(v.meta.version, v.song.track_titles?.[0] || v.song.name)
    return out
  }, [ownMeta, versions, apiTitle])

  // ── Cover choices ─────────────────────────────────────────────────────────
  const [coverOpen, setCoverOpen] = useState(false)
  const [coverDraft, setCoverDraft] = useState('')
  const coverChoices = useMemo(() => {
    const out: { raw: string; url: string; title: string }[] = []
    const seen = new Set<string>()
    const push = (raw: string | null | undefined, title: string): void => {
      if (!raw) return
      const url = resolvePrefCoverUrl(raw)
      if (!url || seen.has(url)) return
      seen.add(url)
      out.push({ raw, url, title })
    }
    push(ownImageRaw, apiTitle)
    for (const v of versions) push(v.song.image_url, v.song.track_titles?.[0] || v.song.name)
    return out
  }, [ownImageRaw, versions, apiTitle])

  const effectiveCover = resolvePrefCoverUrl(pref?.cover_url) ?? apiImageUrl
  const coverDraftPreview = resolvePrefCoverUrl(coverDraft.trim())
  const nameOverridden = !!pref?.name
  const coverOverridden = !!pref?.cover_url
  const hasOverrides = nameOverridden || coverOverridden || !!pref?.default_version
  const playcount = pref?.playcount ?? 0

  const applyCover = (raw: string | null): void => {
    setSongCover(songId, raw)
    setCoverOpen(false)
    setCoverDraft('')
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-surface-overlay/40 px-3.5 py-3 mt-1">
      <div className="flex items-center gap-2">
        <Sparkles size={13} className="text-accent" />
        <span className="text-xs font-semibold text-text-primary">Personalize</span>
        {hasOverrides && (
          <button
            onClick={() => clearSongPref(songId)}
            className="ml-auto flex items-center gap-1 text-[10px] text-text-muted hover:text-red-400 transition-colors"
            title="Remove all personalizations for this song"
          >
            <RotateCcw size={11} /> Reset all
          </button>
        )}
      </div>

      {/* ── Name ── */}
      <GroupLabel>Custom name</GroupLabel>
      <div className="flex items-center gap-1.5">
        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.currentTarget.blur() }
            if (e.key === 'Escape') { setNameDraft(pref?.name ?? ''); e.currentTarget.blur() }
          }}
          placeholder={apiTitle}
          className="flex-1 min-w-0 bg-surface border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-accent/50"
        />
        {nameOverridden && (
          <button
            onClick={() => { setNameDraft(''); setSongName(songId, null) }}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-red-400 hover:bg-surface transition-colors"
            title="Use the original name"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* ── Cover ── */}
      <GroupLabel>Custom cover</GroupLabel>
      <div className="flex items-center gap-2.5">
        <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-surface-overlay flex items-center justify-center">
          {effectiveCover ? (
            <img src={effectiveCover} alt="" className="w-full h-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
          ) : (
            <Music2 size={18} className="text-text-muted opacity-30" />
          )}
        </div>
        <button
          onClick={() => setCoverOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary px-2.5 py-1.5 rounded-lg border border-[var(--border)] hover:bg-surface transition-colors"
        >
          <ImageIcon size={13} /> {coverOverridden ? 'Change cover' : 'Choose cover'}
        </button>
        {coverOverridden && (
          <button
            onClick={() => applyCover(null)}
            className="text-[10px] text-text-muted hover:text-red-400 transition-colors"
            title="Use the original cover"
          >
            Reset
          </button>
        )}
      </div>

      {coverOpen && (
        <div className="mt-2.5 rounded-lg border border-[var(--border)] bg-surface p-2.5 space-y-2.5">
          {coverChoices.length > 0 && (
            <>
              <p className="text-[10px] text-text-muted">From this song's versions</p>
              <div className="grid grid-cols-5 gap-1.5">
                {coverChoices.map((c) => {
                  const active = pref?.cover_url === c.raw
                  return (
                    <button
                      key={c.url}
                      onClick={() => applyCover(c.raw)}
                      title={c.title}
                      className={`relative aspect-square rounded-md overflow-hidden bg-surface-overlay border transition-colors ${active ? 'border-accent' : 'border-transparent hover:border-[var(--border)]'}`}
                    >
                      <img src={c.url} alt={c.title} className="w-full h-full object-cover"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }} />
                      {active && (
                        <span className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full bg-accent flex items-center justify-center">
                          <Check size={10} className="text-white" />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          <div>
            <p className="text-[10px] text-text-muted mb-1.5">Or paste an image URL / storage path</p>
            <div className="flex items-center gap-1.5">
              <div className="shrink-0 w-8 h-8 rounded-md overflow-hidden bg-surface-overlay flex items-center justify-center">
                {coverDraftPreview ? (
                  <img src={coverDraftPreview} alt="" className="w-full h-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                ) : (
                  <ImageIcon size={12} className="text-text-muted opacity-40" />
                )}
              </div>
              <input
                value={coverDraft}
                onChange={(e) => setCoverDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && coverDraft.trim()) applyCover(coverDraft.trim()) }}
                placeholder="https://…  or  Covers/song.jpg"
                className="flex-1 min-w-0 bg-surface-overlay border border-[var(--border)] rounded-md px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50"
              />
              <button
                onClick={() => coverDraft.trim() && applyCover(coverDraft.trim())}
                disabled={!coverDraft.trim()}
                className="shrink-0 px-2.5 py-1.5 rounded-md bg-accent/15 text-accent text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Use
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Default version ── */}
      {versionChoices.length > 0 && (
        <>
          <GroupLabel>Default version</GroupLabel>
          <p className="text-[10px] text-text-muted -mt-1 mb-1.5">
            Play this version whenever you pick any version of this song.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSongDefaultVersion(songId, null)}
              className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${!pref?.default_version
                ? 'bg-accent/15 text-accent border-accent/40'
                : 'text-text-secondary border-[var(--border)] hover:bg-surface'}`}
            >
              As selected
            </button>
            {versionChoices.map((c) => {
              const active = pref?.default_version?.toLowerCase() === c.label.toLowerCase()
              return (
                <button
                  key={c.label}
                  onClick={() => setSongDefaultVersion(songId, active ? null : c.label)}
                  title={c.title}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-colors ${active
                    ? 'bg-accent/15 text-accent border-accent/40'
                    : 'text-text-secondary border-[var(--border)] hover:bg-surface'}`}
                >
                  <Star size={11} fill={active ? 'currentColor' : 'none'} /> {c.label}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* ── Playcount ── */}
      <GroupLabel>Your plays</GroupLabel>
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <Play size={12} className="text-text-muted" fill="currentColor" />
        {playcount > 0
          ? <span>Played <span className="text-text-primary font-semibold">{playcount.toLocaleString()}</span> {playcount === 1 ? 'time' : 'times'}</span>
          : <span className="text-text-muted">Not played yet</span>}
      </div>

      {!account && hasOverrides && (
        <p className="text-[10px] text-text-muted/70 mt-3 leading-relaxed">
          Saved on this device. Log in to sync your personalizations across devices.
        </p>
      )}
    </div>
  )
}
