import { useEffect, useRef, useState, CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { X, Music2, Pencil, Flag, PictureInPicture2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { JWApiSong, CATEGORY_LABELS, buildImageUrl, parseDuration, apiFetch, resolvePrefCoverUrl } from '../lib/juicewrldApi'
import { versionsEnabled, getVersionGroup, SongVersionMeta } from '../lib/versionsApi'
import { formatDuration } from '../lib/format'
import SongPrefsSection from './SongPrefsSection'

const CATEGORY_COLORS: Record<string, string> = {
  released:          'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  unreleased:        'bg-blue-500/15 text-blue-400 border-blue-500/25',
  unsurfaced:        'bg-orange-500/15 text-orange-400 border-orange-500/25',
  recording_session: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
}

function Row({ label, value }: { label: string; value: string | null | undefined }): JSX.Element | null {
  if (!value) return null
  return (
    <div className="flex gap-3 py-2.5 border-b border-[var(--border)] last:border-0">
      <span className="text-text-muted text-xs shrink-0 w-28 pt-px">{label}</span>
      <span className="text-text-primary text-xs leading-relaxed whitespace-pre-wrap flex-1">{value}</span>
    </div>
  )
}

function GroupLabel({ children }: { children: string }): JSX.Element {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted pt-4 pb-1 first:pt-0">
      {children}
    </p>
  )
}

interface Props {
  song: JWApiSong | null
  onClose: () => void
  onEdit?: (songId: number) => void
  // Rendered as the sole content of a pop-out BrowserWindow (see FloatApp):
  // the panel fills the window, the hero doubles as the drag handle, and
  // closing closes the OS window (via the caller's onClose).
  floating?: boolean
}

export default function SongInfoModal({ song, onClose, onEdit, floating = false }: Props): JSX.Element | null {
  const overlayRef = useRef<HTMLDivElement>(null)

  // Desktop: song info lives in its own pop-out window — every existing
  // in-app <SongInfoModal> caller redirects there instead of rendering the
  // overlay, unless the user disabled that pop-out. The overlay is the
  // fallback (and the only path on the web build, and for the pop-out itself,
  // which mounts this with floating=true).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const el = (window as any).electron
  const popoutSongInfo = useStore((s) => s.popoutWindows.songInfo)
  const songPrefs = useStore((s) => s.songPrefs)
  const openReport = useStore((s) => s.openReport)
  const redirectToFloat = !floating && !!el?.openFloatWindow && popoutSongInfo
  useEffect(() => {
    if (redirectToFloat && song) {
      el.openFloatWindow('song-info', { songId: song.id })
      onClose()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redirectToFloat, song?.id])

  // Clicking a linked version swaps the displayed song in place, without the
  // caller needing to manage that — falls back to the `song` prop otherwise.
  const [overrideSong, setOverrideSong] = useState<JWApiSong | null>(null)
  useEffect(() => { setOverrideSong(null) }, [song?.id])
  const displaySong = overrideSong ?? song

  // "Other versions" — a separate database from juicewrldapi.com (see
  // lib/versionsApi.ts), since that API has no concept of grouping e.g.
  // "Song (v1)" / "(v2)" / "(TV Mix)" together as the same underlying song.
  // Linking/unlinking only happens from the editor (Edit song → Versions) —
  // this view is read-only.
  const [versions, setVersions] = useState<{ song: JWApiSong; meta: SongVersionMeta }[]>([])
  const [loadingVersions, setLoadingVersions] = useState(false)

  const refreshVersions = (id: number): void => {
    if (!versionsEnabled) return
    setLoadingVersions(true)
    getVersionGroup(id)
      .then(metas => Promise.all(metas.map(meta =>
        apiFetch<JWApiSong>(`/songs/${meta.songId}/`).then(song => ({ song, meta })).catch(() => null)
      )))
      .then(entries => setVersions(entries.filter((e): e is { song: JWApiSong; meta: SongVersionMeta } => !!e)))
      .finally(() => setLoadingVersions(false))
  }

  useEffect(() => {
    if (displaySong) refreshVersions(displaySong.id)
    else setVersions([])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displaySong?.id])

  const handleViewVersion = async (id: number): Promise<void> => {
    try {
      const s = await apiFetch<JWApiSong>(`/songs/${id}/`)
      setOverrideSong(s)
    } catch {}
  }

  if (redirectToFloat || !displaySong) return null

  // The user's per-song override (custom name/cover). Subscribing to the whole
  // map keeps the hero in step when it's edited from the Personalize section
  // below (or another window) — the map's reference only changes on a write,
  // so this modal isn't re-rendering on unrelated store churn.
  const pref = songPrefs[displaySong.id]
  const apiCoverUrl = buildImageUrl(displaySong.image_url)
  const coverUrl = resolvePrefCoverUrl(pref?.cover_url) ?? apiCoverUrl
  const apiPrimaryTitle = displaySong.track_titles?.[0] || displaySong.name
  const primaryTitle = pref?.name || apiPrimaryTitle
  const altTitles = displaySong.track_titles?.slice(1).filter(Boolean) ?? []
  const duration = formatDuration(parseDuration(displaySong.length), '—')
  const catColor = CATEGORY_COLORS[displaySong.category] ?? 'bg-surface-overlay text-text-muted border-[var(--border)]'
  const catLabel = CATEGORY_LABELS[displaySong.category] ?? displaySong.category

  const hasRecording = displaySong.recording_locations || displaySong.record_dates
  const hasImportantDates = displaySong.preview_date || displaySong.release_date || displaySong.dates
  const hasInstrumentals = displaySong.instrumentals || displaySong.instrumental_names
  const hasSession = displaySong.session_titles || displaySong.session_tracking

  let notesDisplay: string | null = null
  if (displaySong.notes) {
    try {
      const parsed = JSON.parse(displaySong.notes)
      if (typeof parsed === 'object' && parsed !== null) {
        notesDisplay = Object.entries(parsed)
          .filter(([, v]) => v)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n')
      } else {
        notesDisplay = String(parsed)
      }
    } catch {
      notesDisplay = displaySong.notes
    }
  }

  // Portal to <body> so the overlay is never trapped inside a caller with a
  // CSS transform/animation/overflow (e.g. NowPlaying's slide-in panel) — a
  // transformed ancestor becomes the containing block for position: fixed,
  // which would otherwise render this "modal" clipped inside that panel.
  return createPortal(
    <div
      ref={overlayRef}
      className={`fixed inset-0 z-50 flex ${floating ? '' : 'items-end md:items-center justify-center bg-black/70 backdrop-blur-sm p-0 md:p-4'}`}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className={`select-text bg-surface flex flex-col overflow-hidden ${floating
        ? 'w-full h-full'
        : 'border border-[var(--border)] rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-lg max-h-[92svh] md:max-h-[86vh]'}`}
      >

        {/* Hero — in a pop-out it doubles as the frameless window's drag
            handle; the buttons opt back out below or they'd be undraggable. */}
        <div
          className="relative shrink-0 overflow-hidden"
          style={floating ? ({ WebkitAppRegion: 'drag' } as CSSProperties) : undefined}
        >
          {coverUrl && (
            <div
              className="absolute inset-0 bg-cover bg-center scale-110"
              style={{ backgroundImage: `url(${coverUrl})`, filter: 'blur(24px) brightness(0.35)' }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-surface" />
          <div
            className="absolute top-3 right-3 z-10 flex items-center gap-1.5"
            style={floating ? ({ WebkitAppRegion: 'no-drag' } as CSSProperties) : undefined}
          >
            {/* Manual pop-out — only when shown in-app on desktop (i.e. the
                Song-info pop-out was turned off); detaches into its own window. */}
            {!floating && el?.openFloatWindow && (
              <button
                onClick={() => { el.openFloatWindow('song-info', { songId: displaySong.id }); onClose() }}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-black/40 text-white/70 hover:text-white transition-colors"
                title="Open in a separate window"
              >
                <PictureInPicture2 size={13} />
              </button>
            )}
            {onEdit && (
              <button
                onClick={() => { onEdit(displaySong.id); onClose() }}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-black/40 text-white/70 hover:text-white transition-colors"
                title="Edit song info"
              >
                <Pencil size={13} />
              </button>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-black/40 text-white/70 hover:text-white transition-colors"
            >
              <X size={15} />
            </button>
          </div>
          <div className="relative flex items-end gap-4 px-5 pt-8 pb-5">
            <div className="shrink-0 w-24 h-24 rounded-xl overflow-hidden shadow-2xl bg-surface-overlay">
              {coverUrl ? (
                <img src={coverUrl} alt={primaryTitle} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music2 size={32} className="text-text-muted opacity-30" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 pb-0.5">
              <h2 className="text-white font-bold text-xl leading-tight">{primaryTitle}</h2>
              {altTitles.length > 0 && (
                <p className="text-white/50 text-xs mt-0.5 truncate italic">aka {altTitles.join(' · ')}</p>
              )}
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${catColor}`}>
                  {catLabel}
                </span>
                {displaySong.era?.name && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/60 border border-white/15">
                    {displaySong.era.name}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable info */}
        <div className="overflow-y-auto flex-1 px-5 py-4">

          <SongPrefsSection
            songId={displaySong.id}
            apiTitle={apiPrimaryTitle}
            apiImageUrl={apiCoverUrl}
            ownImageRaw={displaySong.image_url}
            versions={versions}
            altTitles={altTitles}
          />

          <div>
            <Row label="Artist" value={displaySong.credited_artists || 'Juice WRLD'} />
            <Row label="Duration" value={parseDuration(displaySong.length) ? duration : null} />
            <Row label="Leak type" value={displaySong.leak_type} />
            <Row label="Date leaked" value={displaySong.date_leaked} />
            <Row label="Bitrate" value={displaySong.bitrate} />
          </div>

          {/* Alt names sit right beside Other Versions rather than up in the
              generic row list — both are "other ways this same song shows up",
              and alt titles are also what widens the cover picker's search
              (see SongPrefsSection's altTitles prop). */}
          {altTitles.length > 0 && (
            <>
              <GroupLabel>Also Known As</GroupLabel>
              <p className="text-text-primary text-xs leading-relaxed pb-2.5 border-b border-[var(--border)]">
                {altTitles.join(' · ')}
              </p>
            </>
          )}

          {versionsEnabled && (
            <>
              <GroupLabel>Other Versions</GroupLabel>
              <div className="pb-2.5 border-b border-[var(--border)]">
                {loadingVersions ? (
                  <p className="text-text-muted text-xs py-1">Loading…</p>
                ) : versions.length === 0 ? (
                  <p className="text-text-muted text-xs py-1">No other versions linked.</p>
                ) : (
                  <div className="space-y-1">
                    {versions.map(({ song: v, meta }) => (
                      <button
                        key={v.id}
                        onClick={() => handleViewVersion(v.id)}
                        className="w-full text-left hover:bg-surface-overlay rounded-lg px-1.5 py-1 -mx-1.5 transition-colors"
                      >
                        <span className="text-text-primary text-xs truncate block">
                          {v.track_titles?.[0] || v.name}
                          {meta.version && <span className="text-text-muted"> ({meta.version}{meta.versionTitle ? ` — ${meta.versionTitle}` : ''})</span>}
                          {!meta.version && meta.versionTitle && <span className="text-text-muted"> ({meta.versionTitle})</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {(displaySong.producers || displaySong.engineers) && (
            <>
              <GroupLabel>Credits</GroupLabel>
              <div>
                <Row label="Producers" value={displaySong.producers} />
                <Row label="Engineers" value={displaySong.engineers} />
              </div>
            </>
          )}

          {hasRecording && (
            <>
              <GroupLabel>Recording</GroupLabel>
              <div>
                <Row label="Location" value={displaySong.recording_locations} />
                <Row label="Date" value={displaySong.record_dates} />
              </div>
            </>
          )}

          {hasImportantDates && (
            <>
              <GroupLabel>Dates</GroupLabel>
              <div>
                <Row label="Released" value={displaySong.release_date} />
                <Row label="Preview" value={displaySong.preview_date} />
                <Row label="Other" value={displaySong.dates} />
              </div>
            </>
          )}

          {hasInstrumentals && (
            <>
              <GroupLabel>Instrumentals</GroupLabel>
              <div>
                <Row label="Info" value={displaySong.instrumentals} />
                {displaySong.instrumental_names !== displaySong.instrumentals && (
                  <Row label="Names" value={displaySong.instrumental_names} />
                )}
              </div>
            </>
          )}

          {hasSession && (
            <>
              <GroupLabel>Session</GroupLabel>
              <div>
                <Row label="Titles" value={displaySong.session_titles} />
                <Row label="Tracking" value={displaySong.session_tracking} />
              </div>
            </>
          )}

          {displaySong.file_names && (
            <>
              <GroupLabel>File Names</GroupLabel>
              <p className="text-text-primary text-[11px] font-mono leading-relaxed pb-2.5 border-b border-[var(--border)]">
                {displaySong.file_names}
              </p>
            </>
          )}

          {displaySong.additional_information && (
            <>
              <GroupLabel>Additional Info</GroupLabel>
              <p className="text-text-primary text-xs leading-relaxed pb-2.5 border-b border-[var(--border)] whitespace-pre-wrap">
                {displaySong.additional_information}
              </p>
            </>
          )}

          {notesDisplay && (
            <>
              <GroupLabel>Notes</GroupLabel>
              <p className="text-text-primary text-xs leading-relaxed pb-2.5 border-b border-[var(--border)] whitespace-pre-wrap">
                {notesDisplay}
              </p>
            </>
          )}

          {displaySong.lyrics && (
            <>
              <GroupLabel>Lyrics</GroupLabel>
              <pre className="text-text-secondary text-xs leading-relaxed whitespace-pre-wrap font-sans pb-2">
                {displaySong.lyrics}
              </pre>
            </>
          )}

          <button
            onClick={() => openReport({ kind: 'song', songId: displaySong.id, songName: apiPrimaryTitle })}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-[var(--border)] text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors text-xs"
          >
            <Flag size={13} /> Report wrong or missing info / lyrics
          </button>

        </div>
      </div>
    </div>,
    document.body
  )
}
