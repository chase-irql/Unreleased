import { useState, useEffect } from 'react'
import { Loader2, Check, AlertCircle, ChevronLeft, Music2, Upload, Trash2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { LibraryTrack } from '../types'
import { SectionLabel, FieldRow } from './EditorPage'

/* ══════════════════════════════════════════════════════════════════════════════
   Local-file metadata editor — the same full-page editor layout the API editor
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
  lyrics: '', syncedLyrics: '', albumArt: t.albumArt ?? null,
})

export default function LocalEditorPage(): JSX.Element {
  const el = (window as any).electron
  const { pendingLocalEditTrack: track, setPendingLocalEditTrack, updateLibraryTrack, setActiveView } = useStore()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [lyricsTab, setLyricsTab] = useState<LyricsTab>('lyrics')
  const [original, setOriginal] = useState<MetaFields | null>(null)
  const [fields, setFields]     = useState<MetaFields | null>(null)

  const goBack = (): void => { setPendingLocalEditTrack(null); setActiveView('library') }

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

  // Landed here with nothing to edit — send the user back to the library.
  useEffect(() => {
    if (!track) setActiveView('library')
  }, [track, setActiveView])

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

  const handleSave = async (): Promise<void> => {
    if (!el || changedCount === 0) return
    const common = {
      title: fields.title, artist: fields.artist, album: fields.album,
      albumArtist: fields.albumArtist,
      year: fields.year ? parseInt(fields.year) : null,
      trackNumber: fields.trackNumber ? parseInt(fields.trackNumber) : null,
      discNumber: fields.discNumber ? parseInt(fields.discNumber) : null,
      composer: fields.composer, genre: fields.genre,
      albumArt: fields.albumArt,
    }

    // Tag writing is only implemented for MP3 — for other formats keep the edit
    // in the in-memory index so the UI reflects it, but warn it wasn't persisted.
    if (track.ext !== 'mp3') {
      updateLibraryTrack(track.id, { ...common, hasAlbumArt: !!fields.albumArt })
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
        lyrics: fields.lyrics,
        syncedLyrics: fields.syncedLyrics,
        albumArtBase64: fields.albumArt,
      })
      if (result.error) { setError(result.error); return }
      updateLibraryTrack(track.id, { ...common, hasAlbumArt: !!fields.albumArt })
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

      {/* Top bar */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border)]" style={el ? { paddingRight: '148px' } : undefined}>
        <button onClick={goBack} className="p-1.5 -ml-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors shrink-0">
          <ChevronLeft size={16} />
        </button>
        <span className="flex-1 font-bold text-sm text-text-primary">Edit metadata</span>
        {changedCount > 0 && (
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/20 text-accent shrink-0">
            {changedCount} change{changedCount !== 1 ? 's' : ''}
          </span>
        )}
        <span className="text-text-muted opacity-75 text-[10px] uppercase tracking-wider shrink-0">
          {track.ext.toUpperCase()}{track.bitrate ? ` · ${track.bitrate}k` : ''}
        </span>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={18} className="animate-spin text-text-muted" />
          </div>
        ) : (
          <>
            {/* Song header with blurred art */}
            <div className="relative overflow-hidden shrink-0">
              {fields.albumArt && (
                <img src={fields.albumArt} alt=""
                  className="absolute inset-0 w-full h-full object-cover scale-150 blur-3xl opacity-[0.18] pointer-events-none select-none" />
              )}
              <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent 0%, var(--surface) 100%)' }} />
              <div className="relative flex items-end gap-3.5 px-4 pt-7 pb-4">
                {/* Editable album art */}
                <div className="shrink-0">
                  <button onClick={pickArt} title="Change album art"
                    className="w-[76px] h-[76px] rounded-xl overflow-hidden shadow-xl ring-1 ring-white/10 relative group bg-surface-overlay flex items-center justify-center">
                    {fields.albumArt
                      ? <img src={fields.albumArt} alt="" className="w-full h-full object-cover" />
                      : <Music2 size={26} className="text-text-muted" />}
                    <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Upload size={18} className="text-white" />
                    </span>
                  </button>
                </div>
                <div className="min-w-0 flex-1 pb-0.5">
                  <p className="text-text-primary font-bold text-[15px] leading-snug truncate">
                    {fields.title || track.title || 'Untitled'}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {fields.genre && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-overlay text-text-muted">
                        {fields.genre}
                      </span>
                    )}
                    {fields.album && <span className="text-text-muted opacity-75 text-[11px] truncate">{fields.album}</span>}
                    <span className="text-text-muted opacity-25 text-[11px] truncate max-w-[220px]">{fileName}</span>
                  </div>
                  {fields.albumArt && (
                    <button onClick={() => set('albumArt', null)}
                      className="mt-2 inline-flex items-center gap-1 text-[10px] text-text-muted hover:text-red-400 transition-colors">
                      <Trash2 size={10} /> Remove art
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Field sections */}
            <div className="pb-4">
              <SectionLabel label="Identity" />
              <FieldRow label="Title"       value={fields.title}       original={original.title}       onChange={v => set('title', v)} />
              <FieldRow label="Artist"      value={fields.artist}      original={original.artist}      onChange={v => set('artist', v)} />
              <FieldRow label="Album"       value={fields.album}       original={original.album}       onChange={v => set('album', v)} />
              <FieldRow label="Alb. Artist" value={fields.albumArtist} original={original.albumArtist} onChange={v => set('albumArtist', v)} />

              <SectionLabel label="Credits" />
              <FieldRow label="Composer" value={fields.composer} original={original.composer} onChange={v => set('composer', v)} />
              <FieldRow label="Genre"    value={fields.genre}    original={original.genre}    onChange={v => set('genre', v)} />

              <SectionLabel label="Numbers" />
              <FieldRow label="Year"    value={fields.year}        original={original.year}        onChange={v => set('year', v)}        placeholder="2019" />
              <FieldRow label="Track #" value={fields.trackNumber} original={original.trackNumber} onChange={v => set('trackNumber', v)} placeholder="1" />
              <FieldRow label="Disc #"  value={fields.discNumber}  original={original.discNumber}  onChange={v => set('discNumber', v)}  placeholder="1" />

              <SectionLabel label="Lyrics" />
              <div className="flex items-center gap-1 px-4 pb-2">
                {(['lyrics', 'synced'] as LyricsTab[]).map(tab => {
                  const active = lyricsTab === tab
                  const dirty = tab === 'lyrics' ? changed('lyrics') : changed('syncedLyrics')
                  return (
                    <button key={tab} onClick={() => setLyricsTab(tab)}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                        active ? 'bg-surface-overlay text-text-primary' : 'text-text-muted opacity-75 hover:text-text-muted'
                      }`}>
                      {tab === 'lyrics' ? 'Lyrics' : 'Synced'}
                      {dirty && <span className="w-1 h-1 rounded-full bg-accent inline-block" />}
                    </button>
                  )
                })}
              </div>
              <div className="px-4">
                {lyricsTab === 'lyrics' ? (
                  <textarea
                    rows={14} value={fields.lyrics} onChange={e => set('lyrics', e.target.value)}
                    placeholder="Full lyrics…"
                    className={`w-full bg-surface-overlay rounded-xl px-3.5 py-3 text-sm text-text-primary focus:outline-none resize-none placeholder:text-text-muted placeholder:opacity-25 border transition-colors leading-relaxed ${
                      changed('lyrics') ? 'border-accent/30' : 'border-[var(--border)]'
                    }`}
                  />
                ) : (
                  <textarea
                    rows={14} value={fields.syncedLyrics} onChange={e => set('syncedLyrics', e.target.value)}
                    placeholder={'[00:00.00] Line one\n[00:05.20] Line two\n…'}
                    className={`w-full bg-surface-overlay rounded-xl px-3.5 py-3 text-sm font-mono text-text-primary focus:outline-none resize-none placeholder:text-text-muted placeholder:opacity-25 border transition-colors ${
                      changed('syncedLyrics') ? 'border-accent/30' : 'border-[var(--border)]'
                    }`}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sticky footer */}
      <div className="shrink-0 border-t border-[var(--border)] bg-surface backdrop-blur-sm px-4 py-3 space-y-2.5">
        {error && (
          <div className="flex items-center gap-2 text-amber-400 text-xs">
            <AlertCircle size={12} className="shrink-0" /> <span className="min-w-0">{error}</span>
          </div>
        )}
        {!error && track.ext !== 'mp3' && (
          <p className="text-text-muted opacity-65 text-[11px]">Note: tag writing is only supported for MP3 files.</p>
        )}
        <div className="flex items-center gap-2.5">
          <span className={`text-xs font-bold tabular-nums min-w-[60px] ${changedCount > 0 ? 'text-accent' : 'text-text-muted opacity-30'}`}>
            {changedCount} field{changedCount !== 1 ? 's' : ''}
          </span>
          <button onClick={goBack}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading || changedCount === 0}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              changedCount === 0 ? 'bg-surface-overlay text-text-muted opacity-30 cursor-not-allowed'
                : 'bg-accent text-white hover:bg-accent/90 shadow-lg shadow-accent/20'
            }`}>
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
