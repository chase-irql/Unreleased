import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, Check, Trash2, Pencil, Hash } from 'lucide-react'
import { createChannel, updateChannel, deleteChannel, type NewsChannel } from '../lib/newsApi'

interface Props {
  channels: NewsChannel[]
  onClose: () => void
  // Called after any successful change so the parent can refetch the list.
  onChanged: () => void
}

export default function NewsChannelsModal({ channels, onClose, onChanged }: Props): JSX.Element {
  const [newLabel, setNewLabel] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // id currently pending deletion confirmation
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const add = async (): Promise<void> => {
    const label = newLabel.trim()
    if (!label) return
    await run(() => createChannel({ label }))
    setNewLabel('')
  }

  const saveEdit = async (id: string): Promise<void> => {
    const label = editLabel.trim()
    if (!label) return
    await run(() => updateChannel(id, { label }))
    setEditingId(null)
  }

  const remove = async (id: string): Promise<void> => {
    await run(() => deleteChannel(id))
    setConfirmDelete(null)
  }

  const field = 'flex-1 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 transition-colors'
  const iconBtn = 'p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-raised transition-colors disabled:opacity-40'

  return createPortal(
    <div
      className="fixed inset-0 z-[170] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm p-0 md:p-4"
      onClick={(e) => { if (e.currentTarget === e.target && !busy) onClose() }}
    >
      <div className="bg-surface border border-[var(--border)] rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-md max-h-[92svh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] sticky top-0 bg-surface z-10">
          <h2 className="flex items-center gap-2 text-text-primary text-sm font-semibold">
            <Hash size={15} className="text-accent" /> Manage channels
          </h2>
          <button onClick={onClose} disabled={busy} className="text-text-muted hover:text-text-primary transition-colors disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* Existing channels */}
          {channels.length === 0 ? (
            <p className="text-sm text-text-muted py-4 text-center">No channels yet — add one below.</p>
          ) : (
            <ul className="space-y-1.5">
              {channels.map((c) => (
                <li key={c.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2">
                  {editingId === c.id ? (
                    <>
                      <input
                        autoFocus
                        className={field}
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(c.id); if (e.key === 'Escape') setEditingId(null) }}
                        maxLength={40}
                      />
                      <button onClick={() => saveEdit(c.id)} disabled={busy} className={iconBtn} title="Save"><Check size={16} /></button>
                      <button onClick={() => setEditingId(null)} disabled={busy} className={iconBtn} title="Cancel"><X size={16} /></button>
                    </>
                  ) : confirmDelete === c.id ? (
                    <>
                      <span className="flex-1 text-xs text-text-secondary">Delete “{c.label}”? Posts in it may be affected.</span>
                      <button onClick={() => remove(c.id)} disabled={busy} className="px-2.5 py-1 rounded-md text-xs font-semibold bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors" title="Confirm delete">Delete</button>
                      <button onClick={() => setConfirmDelete(null)} disabled={busy} className={iconBtn} title="Cancel"><X size={16} /></button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-text-primary truncate">{c.label}</span>
                      <button onClick={() => { setEditingId(c.id); setEditLabel(c.label) }} disabled={busy} className={iconBtn} title="Rename"><Pencil size={14} /></button>
                      <button onClick={() => setConfirmDelete(c.id)} disabled={busy} className={`${iconBtn} hover:text-red-400`} title="Delete"><Trash2 size={14} /></button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Add new */}
          <div className="flex items-center gap-2 pt-1">
            <input
              className={field}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') add() }}
              placeholder="New channel name"
              maxLength={40}
            />
            <button
              onClick={add}
              disabled={busy || !newLabel.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-accent text-white hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              <Plus size={15} /> Add
            </button>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
