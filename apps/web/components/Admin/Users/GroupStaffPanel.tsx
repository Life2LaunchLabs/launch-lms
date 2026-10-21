'use client'

import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Loader2, Plus, UserCog, X } from 'lucide-react'
import { Checkbox } from '@components/ui/checkbox'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { schoolApi, schoolKeys, type GroupStaff, type GroupStaffMember, type StaffRole } from '@services/school/school'

const SELECT = 'h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-sm font-medium text-gray-900'

/** The group's staff: each one's role on the group's goals, and which goals they cover. Students are listed below it. */
export default function GroupStaffPanel({ orgId, groupId, token }: { orgId: number; groupId: number; token?: string }) {
  const key = orgId && token ? schoolKeys.groupStaff(orgId, groupId) : null
  const { data, error, mutate } = useSWR(key, () => schoolApi.groupStaff(orgId, groupId, token), { revalidateOnFocus: false, shouldRetryOnError: false })
  const [adding, setAdding] = React.useState('')
  const [busy, setBusy] = React.useState<number | null>(null)

  const save = async (userId: number, role_key: StaffRole, assignment_uuids: string[]) => {
    setBusy(userId)
    try {
      await mutate(await schoolApi.setStaff(orgId, groupId, { user_id: userId, role_key, assignment_uuids }, token), false)
    } catch (error: any) {
      toast.error(error?.message || 'Could not save staff.')
    } finally {
      setBusy(null)
    }
  }
  const remove = async (member: GroupStaffMember) => {
    if (!confirm(`Remove ${member.user.name} from this group's staff? They leave its goals and its students' school chats.`)) return
    setBusy(member.user.id)
    try {
      await mutate(await schoolApi.removeStaff(orgId, groupId, member.user.id, token), false)
    } catch (error: any) {
      toast.error(error?.message || 'Could not remove staff.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="rounded-xl bg-card p-6 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold"><UserCog size={18} />Staff</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Staff join every student&rsquo;s school chat and the goals they cover, with the role you pick. Students see who&rsquo;s on their team.</p>
        </div>
        {data?.candidates.length ? <form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); if (adding) void save(Number(adding), 'commenter', []).then(() => setAdding('')) }}>
          <select aria-label="Add staff" value={adding} onChange={(event) => setAdding(event.target.value)} className={SELECT}>
            <option value="">Add staff&hellip;</option>
            {data.candidates.map((person) => <option key={person.id} value={person.id}>{person.name} (@{person.username})</option>)}
          </select>
          <button type="submit" disabled={!adding || busy !== null} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gray-900 px-3 text-[13px] font-medium text-white disabled:opacity-50"><Plus size={14} />Add</button>
        </form> : null}
      </div>
      {error ? <p className="mt-4 text-sm text-muted-foreground">Only admins can change a group&rsquo;s staff.</p>
        : !data ? <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        : data.staff.length ? <ul className="mt-4 divide-y divide-border">
          {data.staff.map((member) => <StaffRow key={member.user.id} member={member} data={data} busy={busy === member.user.id} save={save} remove={remove} />)}
        </ul>
        : <p className="mt-4 rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-muted-foreground">No staff yet. Add a counselor or teacher so students have someone in their school chat.</p>}
    </section>
  )
}

function StaffRow({ member, data, busy, save, remove }: {
  member: GroupStaffMember; data: GroupStaff; busy: boolean
  save: (userId: number, role: StaffRole, goals: string[]) => Promise<void> // eslint-disable-line no-unused-vars
  remove: (member: GroupStaffMember) => Promise<void> // eslint-disable-line no-unused-vars
}) {
  const [picking, setPicking] = React.useState(false)
  const hint = data.choices.find((choice) => choice.key === member.role_key)?.hint
  const scope = member.all_goals ? 'All goals' : `${member.goal_count} of ${data.goals.length} goals`
  const toggle = (uuid: string, on: boolean) => {
    const current = member.all_goals ? data.goals.map((goal) => goal.assignment_uuid) : member.assignment_uuids
    const next = on ? [...current, uuid] : current.filter((item) => item !== uuid)
    if (!next.length) return toast.error('Keep at least one goal, or remove them from the group.')
    void save(member.user.id, member.role_key, next.length === data.goals.length ? [] : next)
  }
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-3">
        <PersonAvatar user={member.user as any} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{member.user.name}</p>
          <p className="truncate text-xs text-muted-foreground">@{member.user.username}{hint ? ` · ${hint}` : ''}</p>
        </div>
        {/* On a phone the name keeps the first line with the remove button; role and goals go on their own line. */}
        <div className="order-last flex w-full flex-wrap gap-2 pl-12 sm:order-none sm:w-auto sm:flex-nowrap sm:gap-3 sm:pl-0">
          <select aria-label={`Role for ${member.user.name}`} value={member.role_key} disabled={busy} onChange={(event) => void save(member.user.id, event.target.value as StaffRole, member.assignment_uuids)} className={SELECT}>
            {data.choices.map((choice) => <option key={choice.key} value={choice.key}>{choice.name}</option>)}
          </select>
          <button type="button" onClick={() => setPicking(!picking)} disabled={!data.goals.length} aria-expanded={picking} className="h-9 rounded-lg border border-gray-200 px-3 text-sm font-medium disabled:opacity-50">{data.goals.length ? scope : 'No goals yet'}</button>
        </div>
        <button type="button" onClick={() => void remove(member)} disabled={busy} aria-label={`Remove ${member.user.name}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground sm:h-9 sm:w-9">{busy ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}</button>
      </div>
      {picking ? <div className="ml-12 mt-3 grid gap-2 rounded-lg bg-muted/40 p-3 sm:grid-cols-2">
        {data.goals.map((goal) => {
          const on = member.all_goals || member.assignment_uuids.includes(goal.assignment_uuid)
          return <label key={goal.assignment_uuid} className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={on} disabled={busy} onCheckedChange={(value) => toggle(goal.assignment_uuid, value === true)} />{goal.title}</label>
        })}
      </div> : null}
    </li>
  )
}
