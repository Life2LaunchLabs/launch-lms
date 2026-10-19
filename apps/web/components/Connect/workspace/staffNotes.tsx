'use client'

import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Loader2, Lock, Send, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@components/ui/button'
import type { ChatMessage } from '@services/connect/connect'
import { schoolApi, schoolKeys, type StaffNote } from '@services/school/school'

/** Whose staff notes a learner's feed shows: the learner, in one organization. */
export type StaffNotesTarget = { orgId: number; userId: number }

/**
 * Staff notes about a learner, for their feed: staff read them between the messages and write
 * them from the composer. Learners never see them. Off when the viewer isn't on the learner's
 * team (the API refuses), so only staff ever get the toggle.
 */
export function useStaffNotes(target: StaffNotesTarget | undefined, token?: string) {
  const { data, error, mutate } = useSWR(target && token ? schoolKeys.student(target.orgId, target.userId) : null,
    () => schoolApi.student(target!.orgId, target!.userId, token), { revalidateOnFocus: false, shouldRetryOnError: false })
  const notes = React.useMemo(() => data?.notes || [], [data])
  const set = (next: StaffNote[]) => mutate((current) => current ? { ...current, notes: next } : current, false)
  return {
    available: Boolean(target && data && !error),
    notes,
    add: async (body: string) => { if (target) await set(await schoolApi.addNote(target.orgId, target.userId, body, token)) },
    remove: async (noteUuid: string) => { if (target) await set(await schoolApi.deleteNote(target.orgId, target.userId, noteUuid, token)) },
  }
}

const stamp = (value: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`).getTime() || 0

/** A feed's messages and staff notes in the order they were written. */
export function feedEntries(messages: ChatMessage[], notes: StaffNote[]) {
  type Entry = { kind: 'message'; message: ChatMessage; index: number; at: number } | { kind: 'note'; note: StaffNote; at: number }
  const entries: Entry[] = [
    ...messages.map((message, index) => ({ kind: 'message' as const, message, index, at: stamp(message.creation_date) })),
    ...notes.map((note) => ({ kind: 'note' as const, note, at: stamp(note.creation_date) })),
  ]
  // Stable, so messages keep their order among themselves.
  return entries.sort((a, b) => a.at - b.at)
}

/** A staff note in the feed: set apart, marked as staff only. */
export function NoteEntry({ note, onRemove }: { note: StaffNote; onRemove: (noteUuid: string) => Promise<void> }) { // eslint-disable-line no-unused-vars
  const time = new Date(stamp(note.creation_date)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const remove = async () => {
    if (!window.confirm('Delete this note?')) return
    try { await onRemove(note.note_uuid) } catch (error: any) { toast.error(error?.message || 'Could not delete the note.') }
  }
  return <li className="my-2 flex justify-center">
    <div className="w-full max-w-[85%] rounded-2xl border border-dashed border-amber-400/70 bg-amber-50 px-4 py-2.5 text-sm leading-6 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
      <span className="flex items-center gap-1.5 text-xs font-bold"><Lock size={11} aria-hidden="true" />Staff note · {note.author?.name || 'Former staff'} · only staff see this
        <span className="ml-auto font-normal opacity-70">{time}</span>
        {note.can_delete ? <button type="button" onClick={() => void remove()} aria-label="Delete note" className="rounded p-0.5 opacity-60 hover:opacity-100"><Trash2 size={12} /></button> : null}
      </span>
      <span className="block whitespace-pre-wrap break-words">{note.body}</span>
    </div>
  </li>
}

export type ComposeMode = 'message' | 'note'

/** Above a learner's feed composer, for staff: write a message everyone on the plan reads, or a note only staff read. */
export function ComposeModeToggle({ mode, onChange }: { mode: ComposeMode; onChange: (mode: ComposeMode) => void }) { // eslint-disable-line no-unused-vars
  const option = (value: ComposeMode, label: string) => <button type="button" aria-pressed={mode === value} onClick={() => onChange(value)}
    className={cn('flex h-7 items-center gap-1 rounded-full px-3 text-xs font-bold transition-colors', mode === value ? value === 'note' ? 'bg-amber-200 text-amber-950' : 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>
    {value === 'note' ? <Lock size={11} aria-hidden="true" /> : null}{label}
  </button>
  return <div className="flex items-center gap-2 px-1 pb-1.5">
    <div role="group" aria-label="Write a" className="flex rounded-full bg-muted p-0.5">{option('message', 'Message')}{option('note', 'Staff note')}</div>
    <span className="truncate text-xs text-muted-foreground">{mode === 'note' ? 'Only staff see this' : 'Everyone on this plan sees this'}</span>
  </div>
}

/** The composer in Staff note mode: plain text, saved as a note about the learner. */
export function NoteComposer({ onAdd }: { onAdd: (body: string) => Promise<void> }) { // eslint-disable-line no-unused-vars
  const [draft, setDraft] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const add = async () => {
    if (!draft.trim() || saving) return
    setSaving(true)
    try { await onAdd(draft.trim()); setDraft('') } catch (error: any) { toast.error(error?.message || 'Could not save the note.') } finally { setSaving(false) }
  }
  return <div className="hub-composer-shell rounded-[1.4rem] bg-amber-50/60 p-2 dark:bg-amber-500/10">
    <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} maxLength={5000} aria-label="Staff note" placeholder="Only staff will see this"
      onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void add() } }}
      className="block max-h-48 min-h-11 w-full resize-none bg-transparent px-3 py-2.5 text-base leading-6 outline-none placeholder:text-muted-foreground" />
    <div className="flex h-9 items-center justify-end">
      <Button type="button" size="sm" className="h-9 rounded-xl" disabled={!draft.trim() || saving} onClick={() => void add()}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Add note
      </Button>
    </div>
  </div>
}
