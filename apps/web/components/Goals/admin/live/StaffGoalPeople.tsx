'use client'

import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Check, ChevronRight, Loader2, Plus, Send, Shield, Trash2 } from 'lucide-react'
import { goalSharingApi, peopleKey, type GoalPeople, type GoalRole } from '@services/goals/sharing'
import type { Goal } from '@services/goals/types'
import { cn } from '@/lib/utils'
import { humanize, PageLoader, PersonAvatar, SectionCard } from './ui'

const CAPABILITY_LABELS: Record<string, string> = {
  view_plan: 'View the goal', comment: 'Comment', contribute_fields: 'Work on steps', update_progress: 'Mark steps done',
  request_collaborators: 'Ask for more helpers', contribute_restricted_fields: 'Fill in staff-only parts', complete_restricted_objectives: 'Review and sign off steps',
  review_badge_submissions: 'Review badge work', edit_plan_details: 'Edit goal details', edit_structure: 'Edit stages and steps', edit_schedule: 'Change dates',
  complete_plan: 'Finish the goal', archive_plan: 'Archive the goal', manage_collaborators: 'Manage people', manage_roles: 'Manage roles',
}

/** Who works on this goal and with which role; roles and invitations for those who manage them. */
export default function StaffGoalPeople({ goal, token }: { goal: Goal; token?: string }) {
  const key = token ? peopleKey(goal.goal_uuid) : null
  const { data, mutate } = useSWR(key, () => goalSharingApi.people(goal.goal_uuid, token), { revalidateOnFocus: false })
  const [email, setEmail] = React.useState('')
  const [inviteRole, setInviteRole] = React.useState('')
  if (!data) return <PageLoader />
  const refresh = async () => { await mutate() }
  const manage = data.capabilities.includes('manage_collaborators')
  const grantable = data.roles.filter((role) => role.key !== 'plan_admin' && role.key !== 'subject')
  const act = async (change: () => Promise<unknown>, done: string) => {
    try { await change(); await refresh(); toast.success(done) } catch (error: any) { toast.error(error?.message || 'That didn’t work.') }
  }
  const invite = () => act(async () => { await goalSharingApi.invite(goal.goal_uuid, { email: email.trim(), role_key: inviteRole || grantable[0]?.key, kind: 'collaborator' }, token); setEmail('') }, 'Invitation sent.')
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
    <section className="overflow-hidden rounded-xl border border-gray-100 bg-white nice-shadow">
      <div className="border-b border-gray-100 px-5 py-4"><h2 className="font-black">People</h2><p className="mt-1 text-xs text-gray-500">The learner is fixed. What everyone can do comes from their role.</p></div>
      <div className="divide-y divide-gray-100">{data.collaborators.map((item, index) => <div key={item.collaborator_uuid || `owner-${index}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <PersonAvatar person={item.user} size={36} />
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-black">{item.user?.name || 'Unknown user'}</p>{item.is_subject ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-black uppercase text-blue-700">Learner</span> : null}{item.is_owner ? <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[9px] font-black uppercase text-purple-700">Owner</span> : null}</div><p className="mt-1 text-xs text-gray-500">Role: {item.role.name}</p></div>
        {manage && !item.is_owner && item.collaborator_uuid ? <>
          <select aria-label={`Role for ${item.user?.name}`} value={item.role.key} onChange={(event) => void act(() => goalSharingApi.updateCollaborator(goal.goal_uuid, item.collaborator_uuid!, event.target.value, token), 'Role updated.')} className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs font-bold">{data.roles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}</select>
          {!item.is_subject ? <button type="button" aria-label={`Remove ${item.user?.name}`} onClick={() => { if (window.confirm(`Remove ${item.user?.name} from this goal?`)) void act(() => goalSharingApi.removeCollaborator(goal.goal_uuid, item.collaborator_uuid!, token), 'Removed.') }} className="rounded-lg border border-red-200 p-2 text-red-700"><Trash2 size={15} /></button> : null}
        </> : null}
      </div>)}</div>
    </section>
    <aside className="space-y-5">
      <Roles goal={goal} people={data} token={token} refresh={refresh} />
      {manage ? <SectionCard title="Invite someone">
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" aria-label="Email address" className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" />
        <div className="mt-2 flex gap-2"><select aria-label="Role" value={inviteRole || grantable[0]?.key || ''} onChange={(event) => setInviteRole(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-xs font-bold">{grantable.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}</select><button type="button" aria-label="Send invitation" disabled={!email.trim() || !grantable.length} onClick={() => void invite()} className="rounded-lg bg-black px-4 text-xs font-black text-white disabled:opacity-40"><Send size={14} /></button></div>
      </SectionCard> : null}
      {data.invitations.length ? <SectionCard title="Invitations"><div className="space-y-2">{data.invitations.map((item) => <div key={item.invitation_uuid} className="flex items-center gap-2 rounded-lg bg-gray-50 p-3"><div className="min-w-0 flex-1"><p className="truncate text-xs font-black">{item.email}</p><p className="mt-1 text-[10px] capitalize text-gray-500">{item.role?.name || item.kind} · {item.status}</p></div>{manage && item.status === 'pending' ? <button type="button" onClick={() => void act(() => goalSharingApi.revokeInvitation(goal.goal_uuid, item.invitation_uuid, token), 'Invitation withdrawn.')} className="text-[11px] font-bold text-red-700">Withdraw</button> : null}</div>)}</div></SectionCard> : null}
    </aside>
  </div>
}

function Roles({ goal, people, token, refresh }: { goal: Goal; people: GoalPeople; token?: string; refresh: () => Promise<void> }) {
  const [open, setOpen] = React.useState<GoalRole | 'new' | null>(null)
  return <SectionCard title="Roles" action={people.can_manage_organization_roles ? <button type="button" onClick={() => setOpen(open === 'new' ? null : 'new')} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-black"><Plus size={13} />New role</button> : null}>
    <div className="space-y-2">
      {open === 'new' ? <RoleForm goal={goal} people={people} token={token} onDone={async () => { setOpen(null); await refresh() }} /> : null}
      {people.roles.map((role) => <div key={role.role_uuid}>
        <button type="button" aria-expanded={open !== 'new' && open?.role_uuid === role.role_uuid} onClick={() => setOpen(open !== 'new' && open?.role_uuid === role.role_uuid ? null : role)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 text-left hover:border-blue-300">
          <span className="min-w-0"><span className="block truncate text-sm font-black">{role.name}</span><span className="mt-1 block text-[10px] font-semibold text-gray-500">{role.capabilities.length} permission{role.capabilities.length === 1 ? '' : 's'}</span></span>
          <span className="flex items-center gap-2">{role.locked ? <Shield size={14} className="text-gray-400" /> : null}<ChevronRight size={15} className="text-gray-300" /></span>
        </button>
        {open !== 'new' && open?.role_uuid === role.role_uuid ? <RoleForm goal={goal} people={people} role={role} token={token} onDone={async () => { setOpen(null); await refresh() }} /> : null}
      </div>)}
    </div>
  </SectionCard>
}

function RoleForm({ goal, people, role, token, onDone }: { goal: Goal; people: GoalPeople; role?: GoalRole; token?: string; onDone: () => Promise<void> }) {
  const [name, setName] = React.useState(role?.name || '')
  const [capabilities, setCapabilities] = React.useState<string[]>(role?.capabilities || ['view_plan'])
  const [saving, setSaving] = React.useState(false)
  const editable = !role || (!role.locked && people.capabilities.includes('manage_roles'))
  const save = async () => {
    setSaving(true)
    try {
      if (!role) await goalSharingApi.createOrganizationRole(goal.goal_uuid, { name: name.trim(), capabilities }, token)
      else if (role.organization_role_uuid) await goalSharingApi.updateOrganizationRole(goal.goal_uuid, role.organization_role_uuid, { name, capabilities }, token)
      else await goalSharingApi.updateRole(goal.goal_uuid, role.role_uuid, { name, capabilities }, token)
      toast.success(role ? 'Role saved.' : 'Role created.')
      await onDone()
    } catch (error: any) { toast.error(error?.message || 'Could not save the role.') } finally { setSaving(false) }
  }
  const remove = async () => {
    if (!role?.organization_role_uuid || !window.confirm(`Delete ${role.name} across this organization?`)) return
    try { await goalSharingApi.deleteOrganizationRole(goal.goal_uuid, role.organization_role_uuid, token); await onDone() } catch (error: any) { toast.error(error?.message || 'Could not delete the role.') }
  }
  return <div className="mt-2 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
    {role?.locked ? <p className="text-xs text-gray-500">The goal admin role always has every permission.</p> : null}
    <label className="block text-xs font-black">Role name<input value={name} disabled={!editable} onChange={(event) => setName(event.target.value)} className="mt-1.5 h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm disabled:bg-gray-100" placeholder="Coach" /></label>
    <fieldset className="grid gap-1.5"><legend className="mb-1 text-xs font-black">Permissions</legend>
      {people.available_capabilities.map((capability) => <label key={capability} className={cn('flex items-center gap-2 text-xs', !editable && 'opacity-60')}><input type="checkbox" disabled={!editable} checked={capabilities.includes(capability)} onChange={(event) => setCapabilities(event.target.checked ? [...capabilities, capability] : capabilities.filter((item) => item !== capability))} />{CAPABILITY_LABELS[capability] || humanize(capability)}</label>)}
    </fieldset>
    {editable ? <div className="flex justify-between gap-2">
      {role?.organization_role_uuid ? <button type="button" aria-label="Delete role" onClick={() => void remove()} className="rounded-lg border border-red-200 px-3 text-red-700"><Trash2 size={14} /></button> : <span />}
      <button type="button" disabled={saving || !name.trim()} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-xs font-black text-white disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}{role ? 'Save role' : 'Create role'}</button>
    </div> : null}
  </div>
}
