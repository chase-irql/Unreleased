import { useState } from 'react'
import { Check, Send, CheckCircle2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import {
  FEEDBACK_CATEGORIES, FEEDBACK_CATEGORY_LABELS,
  SONG_ISSUE_TYPES, SONG_ISSUE_LABELS,
  FeedbackCategory, SongIssueType,
} from '../lib/reports'

// The one form behind both report entry points: general feedback (Settings →
// Feedback) and a per-song issue report (ReportModal, opened from a song's
// context menu / info panel). It writes through the store's report actions,
// which queue locally and deliver when the endpoints exist — so submitting
// always "succeeds" from the user's side even before the backend is live.

export type ReportMode =
  | { kind: 'feedback' }
  | { kind: 'song'; songId: number; songName: string }

export default function ReportForm({ mode, onDone }: {
  mode: ReportMode
  /** Called shortly after a successful submit — the modal uses it to close.
   *  When absent (inline in Settings) the form shows a "send another" reset. */
  onDone?: () => void
}): JSX.Element {
  const submitFeedback = useStore((s) => s.submitFeedback)
  const reportSong = useStore((s) => s.reportSong)

  const [category, setCategory] = useState<FeedbackCategory>('bug')
  const [issues, setIssues] = useState<SongIssueType[]>([])
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const toggleIssue = (t: SongIssueType): void =>
    setIssues((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))

  // Feedback needs a written message; a song report needs at least one flagged
  // issue (the message is optional detail there).
  const canSubmit = mode.kind === 'feedback'
    ? message.trim().length > 0
    : issues.length > 0 || message.trim().length > 0

  const submit = (): void => {
    if (!canSubmit) return
    if (mode.kind === 'feedback') submitFeedback(category, message, contact)
    else reportSong(mode.songId, mode.songName, issues, message, contact)
    setSubmitted(true)
    if (onDone) setTimeout(onDone, 1200)
  }

  const reset = (): void => {
    setSubmitted(false)
    setMessage('')
    setContact('')
    setIssues([])
    setCategory('bug')
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center text-center py-6 px-2">
        <CheckCircle2 size={34} className="text-accent mb-3" />
        <p className="text-text-primary text-sm font-semibold">Thanks — your report was received.</p>
        <p className="text-text-muted text-xs mt-1 max-w-xs leading-relaxed">
          It's saved and will be sent to the team. You don't need to do anything else.
        </p>
        {!onDone && (
          <button
            onClick={reset}
            className="mt-4 text-xs text-accent hover:underline"
          >
            Send another
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3.5">
      {mode.kind === 'song' && (
        <p className="text-xs text-text-muted">
          Reporting <span className="text-text-secondary font-medium">{mode.songName}</span>
        </p>
      )}

      {mode.kind === 'feedback' ? (
        <div>
          <p className="text-[11px] font-medium text-text-secondary mb-1.5">Type</p>
          <div className="flex flex-wrap gap-1.5">
            {FEEDBACK_CATEGORIES.map((c) => {
              const active = category === c
              return (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${active
                    ? 'bg-accent/15 text-accent border-accent/40'
                    : 'text-text-secondary border-[var(--border)] hover:bg-surface-raised'}`}
                >
                  {FEEDBACK_CATEGORY_LABELS[c]}
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div>
          <p className="text-[11px] font-medium text-text-secondary mb-1.5">What's wrong?</p>
          <div className="grid grid-cols-2 gap-1.5">
            {SONG_ISSUE_TYPES.map((t) => {
              const active = issues.includes(t)
              return (
                <button
                  key={t}
                  onClick={() => toggleIssue(t)}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs border text-left transition-colors ${active
                    ? 'bg-accent/10 text-text-primary border-accent/40'
                    : 'text-text-secondary border-[var(--border)] hover:bg-surface-raised'}`}
                >
                  <span className={`shrink-0 w-4 h-4 rounded flex items-center justify-center border ${active ? 'bg-accent border-accent' : 'border-[var(--border)]'}`}>
                    {active && <Check size={11} className="text-white" />}
                  </span>
                  {SONG_ISSUE_LABELS[t]}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={mode.kind === 'feedback' ? 5 : 4}
          maxLength={2000}
          placeholder={mode.kind === 'feedback'
            ? "What's on your mind? Bugs, ideas, anything…"
            : 'Add details — the correct info, or what the lyrics should say (optional)'}
          className="w-full resize-none bg-surface border border-[var(--border)] rounded-lg px-3 py-2.5 text-xs text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-accent/50 leading-relaxed"
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-text-muted/60">{message.length}/2000</span>
        </div>
      </div>

      {/* The endpoints accept an optional contact string. Logged-in users can
          leave it blank — their Discord username rides along automatically. */}
      <input
        value={contact}
        onChange={(e) => setContact(e.target.value)}
        maxLength={200}
        placeholder="How can we reach you? (optional — Discord, email…)"
        className="w-full bg-surface border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-accent/50"
      />

      <button
        onClick={submit}
        disabled={!canSubmit}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
      >
        <Send size={14} /> {mode.kind === 'feedback' ? 'Send feedback' : 'Submit report'}
      </button>
    </div>
  )
}
