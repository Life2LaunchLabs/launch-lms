'use client'

import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Loader2, Lock, Trash2 } from 'lucide-react'
import { chatTime } from '@components/Connect/ConnectView'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { schoolApi, schoolKeys, type StaffNote } from '@services/school/school'

/** A learner's school team, the staff on their groups, and the staff-only notes about them. */
export default function LearnerTeam({ orgId, userId, token }: { orgId: number; userId: number; token?: string }) {
  const { data, mutate } = useSWR(orgId && token ? schoolKeys.student(orgId, userId) : null, () => schoolApi.student(orgId, userId, token),
    { revalidateOnFocus: false, shouldRetryOnError: false })
  if (!data) return null
  return <>
    <section className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow">
      <h2 className="text-sm font-bold text-gray-900">School team</h2>
      {data.team.length ? <ul className="mt-3 space-y-3">{data.team.map((member) => <li key={member.user.id} className="flex items-center gap-3">
        <PersonAvatar user={member.user as any} size="md" />
        <div className="min-w-0"><p className="truncate text-sm font-semibold">{member.user.name}</p><p className="truncate text-xs text-gray-500">{member.groups.map((group) => `${group.role} · ${group.name}`).join(', ')}</p></div>
      </li>)}</ul> : <p className="mt-2 text-xs text-gray-500">Nobody yet. Add staff to one of their groups.</p>}
    </section>
    <StaffNotes orgId={orgId} userId={userId} token={token} notes={data.notes} onChange={(notes) => mutate((current) => current ? { ...current, notes } : current, false)} />
  </>
}

function StaffNotes({ orgId, userId, token, notes, onChange }: {
  orgId: number; userId: number; token?: string; notes: StaffNote[]
  onChange: (notes: StaffNote[]) => void // eslint-disable-line no-unused-vars
}) {
  const [draft, setDraft] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const add = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft.trim() || saving) return
    setSaving(true)
    try {
      onChange(await schoolApi.addNote(orgId, userId, draft.trim(), token))
      setDraft('')
    } catch (problem: any) {
      toast.error(problem?.message || 'Could not save the note.')
    } finally {
      setSaving(false)
    }
  }
  const remove = async (noteUuid: string) => {
    if (!confirm('Delete this note?')) return
    try {
      onChange(await schoolApi.deleteNote(orgId, userId, noteUuid, token))
    } catch (problem: any) {
      toast.error(problem?.message || 'Could not delete the note.')
    }
  }
  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow">
      <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900"><Lock size={14} />Staff notes</h2>
      <p className="mt-1 text-xs text-gray-500">Only staff can read these. The learner never sees them.</p>
      <form onSubmit={add} className="mt-3 space-y-2">
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} maxLength={5000} aria-label="New staff note" placeholder="Write a note for the team"
          className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--org-primary-color)]" />
        <button type="submit" disabled={!draft.trim() || saving} className="ml-auto flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Add note</button>
      </form>
      {notes.length ? <ul className="mt-4 space-y-3">{notes.map((note) => <li key={note.note_uuid} className="rounded-lg bg-gray-50 p-3">
        <p className="whitespace-pre-wrap text-sm text-gray-800">{note.body}</p>
        <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
          <span>{note.author?.name || 'Former staff'} · {chatTime(note.creation_date)}</span>
          {note.can_delete ? <button type="button" onClick={() => void remove(note.note_uuid)} aria-label="Delete note" className="rounded p-1 hover:bg-gray-200 hover:text-gray-900"><Trash2 size={13} /></button> : null}
        </div>
      </li>)}</ul> : null}
    </section>
  )
}
