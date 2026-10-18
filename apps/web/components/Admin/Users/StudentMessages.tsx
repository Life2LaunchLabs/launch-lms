'use client'

import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Loader2, Lock, Trash2 } from 'lucide-react'
import { chatTime } from '@components/Connect/ConnectView'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import ChatWorkspace from '@components/Connect/workspace/ChatWorkspace'
import { getUriWithOrg } from '@services/config/config'
import { schoolApi, schoolKeys, type StaffNote } from '@services/school/school'

const REFRESH_MS = 30_000

function useStudent(orgId: number, userId: number, token?: string, refresh = false) {
  return useSWR(orgId && token ? schoolKeys.student(orgId, userId) : null, () => schoolApi.student(orgId, userId, token),
    { revalidateOnFocus: false, shouldRetryOnError: false, refreshInterval: refresh ? REFRESH_MS : 0 })
}

/** The student's school team as a row of faces, for the header of their page. */
export function SchoolTeam({ orgId, userId, token }: { orgId: number; userId: number; token?: string }) {
  const { data } = useStudent(orgId, userId, token)
  if (!data?.team.length) return null
  const names = data.team.map((member) => `${member.user.name} (${member.groups.map((group) => `${group.role}, ${group.name}`).join('; ')})`)
  return (
    <div className="ml-auto flex items-center gap-2" title={names.join('\n')}>
      <span className="text-xs font-semibold text-gray-500">School team</span>
      <div className="flex -space-x-2">{data.team.slice(0, 5).map((member) => <span key={member.user.id} className="rounded-full ring-2 ring-white"><PersonAvatar user={member.user as any} size="sm" /></span>)}</div>
      {data.team.length > 5 ? <span className="text-xs text-gray-500">+{data.team.length - 5}</span> : null}
    </div>
  )
}

/** Where a step opens for staff: the learner's plan as staff work it, at that step. */
export const staffStepHref = (orgslug: string) => (goalUuid: string, stepUuid: string) => getUriWithOrg(orgslug, `/admin/plans/live/${encodeURIComponent(goalUuid)}/steps#step-${stepUuid}`)

/** A learner's chat with the organization, filtered by plan and step, next to the staff-only notes about them. */
export default function StudentMessages({ orgId, userId, orgslug, token }: { orgId: number; userId: number; orgslug: string; token?: string }) {
  const { data, error, mutate } = useStudent(orgId, userId, token, true)

  if (error) return <p className="rounded-xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-500 nice-shadow">Only this student&rsquo;s school team and admins can see their messages.</p>
  if (!data) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
      <section className="flex h-[min(76vh,780px)] flex-col overflow-hidden rounded-xl border border-gray-100 bg-white nice-shadow">
        <ChatWorkspace source={{ orgId, userId }} orgslug={orgslug} token={token} stepHref={staffStepHref(orgslug)}
          empty={data.team.length ? 'No messages yet.' : 'Add staff to one of this student’s groups to start their chat.'}
          header={(chat) => <header className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-bold text-gray-900">{chat?.title || 'Messages'}</h2>
            <p className="text-xs text-gray-500">{data.student.name} and everyone on their plans here. {chat && !chat.can_post ? 'You read along as an admin.' : 'Pick a plan or step to see just what’s about it.'}</p>
          </header>} />
      </section>
      <div className="space-y-5">
        <section className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow">
          <h2 className="text-sm font-bold text-gray-900">School team</h2>
          {data.team.length ? <ul className="mt-3 space-y-3">{data.team.map((member) => <li key={member.user.id} className="flex items-center gap-3">
            <PersonAvatar user={member.user as any} size="md" />
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{member.user.name}</p><p className="truncate text-xs text-gray-500">{member.groups.map((group) => `${group.role} · ${group.name}`).join(', ')}</p></div>
          </li>)}</ul> : <p className="mt-2 text-xs text-gray-500">Nobody yet. Staff are added on a group&rsquo;s People tab.</p>}
        </section>
        <StaffNotes orgId={orgId} userId={userId} token={token} notes={data.notes} onChange={(notes) => mutate((current) => current ? { ...current, notes } : current, false)} />
      </div>
    </div>
  )
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
      <p className="mt-1 text-xs text-gray-500">Only staff can read these. The student never sees them.</p>
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
