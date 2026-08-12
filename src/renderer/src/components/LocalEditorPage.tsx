import { useState, useEffect } from 'react'
import { Loader2, Check, AlertCircle, ArrowLeft, Music2, Upload, Trash2, ImageIcon } from 'lucide-react'
import { useStore, useStorePick } from '../store/useStore'
import { LibraryTrack } from '../types'
import { Card, FieldGrid, FieldRow, TextareaRow } from './EditorPage'
import FilePickerModal from './FilePickerModal'

/* ══════════════════════════════════════════════════════════════════════════════
   Local-file metadata editor — the same grouped-card layout the API editor
   (EditorPage) uses, but with the ID3-tag fields a local file actually has
   (title/artist/album/credits/numbers/lyrics + embedded art) instead of the
   API's era/category/proposal machinery. Reached from the library's context
   menu → "Edit metadata"; writes tags to disk via writeTrackMetadata (MP3) and
   mirrors the change into the in-memory library so the UI updates immediately.
   ══════════════════════════════════════════════════════════════════════════════ */

type LyricsTab = 'lyrics' | 'synced'

interface MetaFields {
  title: string
  artist: string
  album: string
  albumArtist: string
  year: string
  trackNumber: string
  discNumber: string
  composer: string
  genre: string
  bpm: string
  // Additional ID3 text frames — not tracked in the in-memory library index, so
  // they're always seeded empty and populated from what's read off disk.
  conductor: string
  publisher: string
  remixArtist: string
  originalArtist: string
  copyright: string
  grouping: string
  subtitle: string
  initialKey: string
  isrc: string
  mood: string
  encodedBy: string
  comment: string
  lyrics: string
  syncedLyrics: string
  albumArt: string | null
}

const emptyFields = (t: LibraryTrack): MetaFields => ({
  title: t.title, artist: t.artist, album: t.album, albumArtist: t.albumArtist,
  year: t.year ? String(t.year) : '',
  trackNumber: t.trackNumber ? String(t.trackNumber) : '',
  discNumber: t.discNumber ? String(t.discNumber) : '',
  composer: t.composer, genre: t.genre,
  bpm: '', conductor: '', publisher: '', remixArtist: '', originalArtist: '',
  copyright: '', grouping: '', subtitle: '', initialKey: '', isrc: '',
  mood: '', encodedBy: '', comment: '',
  lyrics: '', syncedLyrics: '', albumArt: t.albumArt ?? null,
})

export default function LocalEditorPage(): JSX.Element {
  const el = (window as any).electron
  const { pendingLocalEditTrack: track, setPendingLocalEditTrack, updateLibraryTrack, setActiveView, previousView } = useStorePick('pendingLocalEditTrack', 'setPendingLocalEditTrack', 'updateLibraryTrack', 'setActiveView', 'previousView')
  // "Edit metadata" can be triggered from anywhere a local track shows up
  // (library, now playing, mini player) — return to wherever that was rather
  // than always dumping the user back in the library.
  const backView = previousView && previousView !== 'local-editor' ? previousView : 'library'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [lyricsTab, setLyricsTab] = useState<LyricsTab>('lyrics')
  const [original, setOriginal] = useState<MetaFields | null>(null)
  const [fields, setFields]     = useState<MetaFields | null>(null)
  const [showCoverPicker, setShowCoverPicker] = useState(false)
  const [artLoading, setArtLoading] = useState(false)

  const goBack = (): void => {
    setPendingLocalEditTrack(null)
    setActiveView(backView)
  }

  // Load the full tag set off disk (embedded art, lyrics — things the library
  // index doesn't keep in memory) once the target track is known.
  useEffect(() => {
    if (!track) return
    const seed = emptyFields(track)
    setOriginal(seed)
    setFields(seed)
    setLoading(true)
    setError(null)
    if (!el) { setLoading(false); return }
    el.readTrackMetadata(track.filePath).then((meta: Record<string, any> | null) => {
      if (meta && !meta.error) {
        const loaded: MetaFields = {
          title: meta.title || track.title,
          artist: meta.artist || track.artist,
          album: meta.album || track.album,
          albumArtist: meta.albumArtist || track.albumArtist,
          year: meta.year ? String(meta.year) : (track.year ? String(track.year) : ''),
          trackNumber: meta.trackNumber ? String(meta.trackNumber) : (track.trackNumber ? String(track.trackNumber) : ''),
          discNumber: meta.discNumber ? String(meta.discNumber) : (track.discNumber ? String(track.discNumber) : ''),
          composer: meta.composer || track.composer,
          genre: meta.genre || track.genre,
          bpm: meta.bpm || '',
          conductor: meta.conductor || '',
          publisher: meta.publisher || '',
          remixArtist: meta.remixArtist || '',
          originalArtist: meta.originalArtist || '',
          copyright: meta.copyright || '',
          grouping: meta.grouping || '',
          subtitle: meta.subtitle || '',
          initialKey: meta.initialKey || '',
          isrc: meta.isrc || '',
          mood: meta.mood || '',
          encodedBy: meta.encodedBy || '',
          comment: meta.comment || '',
          lyrics: meta.lyrics || '',
          syncedLyrics: meta.syncedLyrics || '',
          albumArt: meta.albumArt || track.albumArt || null,
        }
        setOriginal(loaded)
        setFields(loaded)
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [track?.filePath])

  // Landed here with nothing to edit — send the user back where they came from.
  useEffect(() => {
    if (!track) setActiveView(backView)
  }, [track, setActiveView, backView])

  if (!track || !fields || !original) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-text-muted" />
      </div>
    )
  }

  const set = (key: keyof MetaFields, val: string | null): void =>
    setFields(f => (f ? { ...f, [key]: val as any } : f))

  const changed = (key: keyof MetaFields): boolean =>
    fields[key] !== original[key] && !(fields[key] === '' && original[key] === '')

  const changedCount = (Object.keys(fields) as (keyof MetaFields)[]).filter(changed).length

  const pickArt = async (): Promise<void> => {
    if (!el) return
    const dataUrl = await el.selectImageFile()
    if (dataUrl) set('albumArt', dataUrl)
  }

  // FilePickerModal hands back an absolute API image URL; the main process
  // downloads it and returns an embeddable JPEG data URL (dodging renderer CORS
  // and capping the size). Fetching remotely can be slow/fail, so it drives a
  // spinner over the art and surfaces any error rather than silently no-op'ing.
  const useApiCover = async (url: string): Promise<void> => {
    setShowCoverPicker(false)
    if (!el?.fetchImageAsDataUrl) return
    setArtLoading(true)
    setError(null)
    try {
      const res = await el.fetchImageAsDataUrl(url)
      if (res?.dataUrl) set('albumArt', res.dataUrl)
      else setError(res?.error || 'Failed to load cover from API')
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load cover from API')
    } finally {
      setArtLoading(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    if (!el || changedCount === 0) return
    // What's on screen is a 512px preview of the embedded cover, not the cover
    // itself (see read-track-metadata's coverToThumbDataUri). Writing it back
    // unconditionally would re-encode the file's full-resolution art down to
    // that preview — and again, a little smaller, on every later save. So the
    // art only travels when the user actually changed it; leaving
    // albumArtBase64 out entirely tells the handler to keep the existing frame.
    const artChanged = fields.albumArt !== original.albumArt
    const common = {
      title: fields.title, artist: fields.artist, album: fields.album,
      albumArtist: fields.albumArtist,
      year: fields.year ? parseInt(fields.year) : null,
      trackNumber: fields.trackNumber ? parseInt(fields.trackNumber) : null,
      discNumber: fields.discNumber ? parseInt(fields.discNumber) : null,
      composer: fields.composer, genre: fields.genre,
      // Same reasoning for the in-memory mirror: updateLibraryTrack treats any
      // albumArt key as an art change and re-keys libraryArt, the queue and the
      // current track off it, so don't hand it one when nothing changed.
      ...(artChanged ? { albumArt: fields.albumArt, hasAlbumArt: !!fields.albumArt } : {}),
    }

    // Tag writing is only implemented for MP3 — for other formats keep the edit
    // in the in-memory index so the UI reflects it, but warn it wasn't persisted.
    if (track.ext !== 'mp3') {
      updateLibraryTrack(track.id, common)
      setError('Metadata writing is only supported for MP3 files. The change is shown here but was not written to disk.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const result = await el.writeTrackMetadata(track.filePath, {
        title: fields.title, artist: fields.artist, album: fields.album,
        albumArtist: fields.albumArtist,
        year: fields.year ? parseInt(fields.year) : null,
        trackNumber: fields.trackNumber ? parseInt(fields.trackNumber) : null,
        composer: fields.composer, genre: fields.genre,
        bpm: fields.bpm,
        conductor: fields.conductor, publisher: fields.publisher,
        remixArtist: fields.remixArtist, originalArtist: fields.originalArtist,
        copyright: fields.copyright, grouping: fields.grouping,
        subtitle: fields.subtitle, initialKey: fields.initialKey,
        isrc: fields.isrc, mood: fields.mood, encodedBy: fields.encodedBy,
        comment: fields.comment,
        lyrics: fields.lyrics,
        syncedLyrics: fields.syncedLyrics,
        albumArtBase64: fields.albumArt,
      })
      if (result.error) { setError(result.error); return }
      const updates = { ...common, hasAlbumArt: !!fields.albumArt }
      updateLibraryTrack(track.id, updates)
      goBack()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save metadata')
    } finally {
      setSaving(false)
    }
  }

  const fileName = track.filePath.split(/[/\\]/).pop()

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* App bar — matches EditorPage's / Settings' header shape */}
      <div className="shrink-0 flex items-center gap-1 px-2">
        <button onClick={goBack} aria-label="Back"
          className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full text-text-primary active:bg-surface-overlay">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0 px-0.5">
          <h1 className="text-text-primary text-[20px] font-bold leading-tight truncate">Edit metadata</h1>
          <p className="text-text-muted text-xs truncate">
            {track.ext.toUpperCase()}{track.bitrate ? ` · ${track.bitrate}k` : ''}
            {changedCount > 0 ? ` · ${changedCount} change${changedCount !== 1 ? 's' : ''}` : ''}
          </p>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto overscroll-contain min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={18} className="animate-spin text-text-muted" />
          </div>
        ) : (
          <div className="px-3.5 pt-3 pb-5">

            {/* ── Art + identity hero ── */}
            <Card>
              <div className="flex items-center gap-3">
                <button onClick={pickArt} title="Change album art" disabled={artLoading}
                  className="w-14 h-14 rounded-xl overflow-hidden shrink-0 shadow-lg ring-1 ring-white/10 relative bg-surface-raised flex items-center justify-center">
                  {fields.albumArt
                    ? <img src={fields.albumArt} alt="" className="w-full h-full object-cover" />
                    : <Music2 size={20} className="text-text-muted" />}
                  {artLoading ? (
                    <span className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <Loader2 size={16} className="text-white animate-spin" />
                    </span>
                  ) : (
                    <span className="absolute inset-0 bg-black/45 opacity-0 active:opacity-100 transition-opacity flex items-center justify-center">
                      <Upload size={16} className="text-white" />
                    </span>
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-text-primary font-bold text-[15px] leading-snug truncate">
                    {fields.title || track.title || 'Untitled'}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {fields.genre && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-raised text-text-muted">
                        {fields.genre}
                      </span>
                    )}
                    {fields.album && <span className="text-text-muted opacity-75 text-[11px] truncate">{fields.album}</span>}
                  </div>
                  <p className="text-text-muted opacity-40 text-[11px] truncate mt-0.5">{fileName}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 pt-0.5">
                <button onClick={() => setShowCoverPicker(true)} disabled={artLoading}
                  className="inline-flex items-center gap-1 text-[11px] text-text-muted opacity-70 active:opacity-100 active:text-accent transition-colors disabled:opacity-30">
                  <ImageIcon size={12} /> From API
                </button>
                {fields.albumArt && (
                  <button onClick={() => set('albumArt', null)} disabled={artLoading}
                    className="inline-flex items-center gap-1 text-[11px] text-text-muted opacity-70 active:opacity-100 active:text-red-400 transition-colors disabled:opacity-30">
                    <Trash2 size={12} /> Remove art
                  </button>
                )}
              </div>
            </Card>

            {!error && track.ext !== 'mp3' && (
              <p className="px-1 -mt-2 mb-3.5 text-text-muted opacity-65 text-[11px]">Note: tag writing is only supported for MP3 files.</p>
            )}

            <Card title="Identity">
              <FieldRow label="Title"       value={fields.title}       original={original.title}       onChange={v => set('title', v)} />
              <FieldRow label="Artist"      value={fields.artist}      original={original.artist}      onChange={v => set('artist', v)} />
              <FieldRow label="Album"       value={fields.album}       original={original.album}       onChange={v => set('album', v)} />
              <FieldRow label="Album Artist" value={fields.albumArtist} original={original.albumArtist} onChange={v => set('albumArtist', v)} />
            </Card>

            <Card title="Credits">
              <FieldGrid>
                <FieldRow label="Composer"        value={fields.composer}       original={original.composer}       onChange={v => set('composer', v)} />
                <FieldRow label="Genre"           value={fields.genre}          original={original.genre}          onChange={v => set('genre', v)} />
                <FieldRow label="Conductor"       value={fields.conductor}      original={original.conductor}      onChange={v => set('conductor', v)} />
                <FieldRow label="Publisher"       value={fields.publisher}      original={original.publisher}      onChange={v => set('publisher', v)} />
                <FieldRow label="Remix Artist"    value={fields.remixArtist}    original={original.remixArtist}    onChange={v => set('remixArtist', v)} />
                <FieldRow label="Original Artist" value={fields.originalArtist} original={original.originalArtist} onChange={v => set('originalArtist', v)} />
              </FieldGrid>
            </Card>

            <Card title="Numbers">
              <FieldGrid>
                <FieldRow label="Year"    value={fields.year}        original={original.year}        onChange={v => set('year', v)}        placeholder="2019" mono />
                <FieldRow label="Track #" value={fields.trackNumber} original={original.trackNumber} onChange={v => set('trackNumber', v)} placeholder="1" mono />
                <FieldRow label="Disc #"  value={fields.discNumber}  original={original.discNumber}  onChange={v => set('discNumber', v)}  placeholder="1" mono />
                <FieldRow label="BPM"     value={fields.bpm}         original={original.bpm}         onChange={v => set('bpm', v)}         placeholder="120" mono />
                <FieldRow label="Key"     value={fields.initialKey}  original={original.initialKey}  onChange={v => set('initialKey', v)}  placeholder="A Minor" />
                <FieldRow label="ISRC"    value={fields.isrc}        original={original.isrc}        onChange={v => set('isrc', v)}        placeholder="US-XXX-00-00000" mono />
              </FieldGrid>
            </Card>

            <Card title="Details">
              <FieldGrid>
                <FieldRow label="Grouping"  value={fields.grouping}  original={original.grouping}  onChange={v => set('grouping', v)} />
                <FieldRow label="Mood"      value={fields.mood}      original={original.mood}      onChange={v => set('mood', v)} />
              </FieldGrid>
              <FieldRow label="Subtitle"    value={fields.subtitle}  original={original.subtitle}  onChange={v => set('subtitle', v)} />
              <FieldRow label="Copyright"   value={fields.copyright} original={original.copyright} onChange={v => set('copyright', v)} />
              <FieldRow label="Encoded By"  value={fields.encodedBy} original={original.encodedBy} onChange={v => set('encodedBy', v)} />
              <TextareaRow label="Comment" value={fields.comment} original={original.comment} onChange={v => set('comment', v)} rows={3} placeholder="Free-form comment…" />
            </Card>

            <Card
              title="Lyrics"
              action={
                <div className="flex items-center gap-0.5">
                  {(['lyrics', 'synced'] as LyricsTab[]).map(tab => {
                    const active = lyricsTab === tab
                    const dirty = tab === 'lyrics' ? changed('lyrics') : changed('syncedLyrics')
                    return (
                      <button key={tab} onClick={() => setLyricsTab(tab)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                          active ? 'bg-surface-raised text-text-primary' : 'text-text-muted opacity-75'
                        }`}>
                        {tab === 'lyrics' ? 'Lyrics' : 'Synced'}
                        {dirty && <span className="w-1 h-1 rounded-full bg-accent inline-block" />}
                      </button>
                    )
                  })}
                </div>
              }
            >
              {lyricsTab === 'lyrics' ? (
                <textarea
                  rows={12} value={fields.lyrics} onChange={e => set('lyrics', e.target.value)}
                  placeholder="Full lyrics…"
                  className={`w-full bg-surface-raised/70 rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none resize-none placeholder:text-text-muted placeholder:opacity-25 border transition-colors leading-relaxed ${
                    changed('lyrics') ? 'border-accent/40' : 'border-[var(--border)] focus:border-accent/40'
                  }`}
                />
              ) : (
                <textarea
                  rows={12} value={fields.syncedLyrics} onChange={e => set('syncedLyrics', e.target.value)}
                  placeholder={'[00:00.00] Line one\n[00:05.20] Line two\n…'}
                  className={`w-full bg-surface-raised/70 rounded-xl px-3 py-2.5 text-sm font-mono text-text-primary focus:outline-none resize-none placeholder:text-text-muted placeholder:opacity-25 border transition-colors ${
                    changed('syncedLyrics') ? 'border-accent/40' : 'border-[var(--border)] focus:border-accent/40'
                  }`}
                />
              )}
            </Card>
          </div>
        )}
      </div>

      {/* Sticky footer actions */}
      {!loading && (
        <div className="shrink-0 border-t border-[var(--border)] px-3.5 pt-2.5 pb-3 space-y-2">
          {error && (
            <div className="flex items-center gap-2 text-amber-400 text-xs">
              <AlertCircle size={12} className="shrink-0" /> <span className="min-w-0">{error}</span>
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={saving || loading || changedCount === 0}
            className={`w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
              changedCount === 0 ? 'bg-surface-overlay text-text-muted opacity-30'
                : 'bg-accent text-white active:bg-accent/90 shadow-lg shadow-accent/20'
            }`}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button onClick={goBack}
            className="w-full py-2 rounded-xl text-xs font-semibold text-text-muted active:text-text-primary active:bg-surface-overlay transition-colors">
            Cancel
          </button>
        </div>
      )}

      {showCoverPicker && (
        <FilePickerModal
          songTitle={fields.title || track.title}
          onSelect={useApiCover}
          onClose={() => setShowCoverPicker(false)}
        />
      )}
    </div>
  )
}
