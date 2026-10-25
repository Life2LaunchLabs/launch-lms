'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSWRConfig } from 'swr'
import toast from 'react-hot-toast'
import { Loader2, SlidersHorizontal, Trash2, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import EditSheet from '@components/Goals/edit/EditSheet'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { useFeatures } from '@components/Hooks/useFeatures'
import { JoinLinkPanel } from '@components/Dashboard/Pages/Users/OrgUsersAdd/InviteUsersDialog'
import { GroupPeople } from '@components/Admin/People/GroupPeople'
import GroupWork from '@components/Admin/People/GroupWork'
import { RoleTag } from '@components/Admin/People/RoleTag'
import { useGroupDetail, useOrgGroups, usePeopleContext, useRefreshPeople } from '@components/Admin/People/usePeople'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { deleteUserGroup, updateUserGroup } from '@services/usergroups/usergroups'
import { peopleKeys, type GroupDetail } from '@services/school/people'
import { setGroupStatus, type MemberStatus } from '@services/organizations/membership'
import type { GroupView } from '@services/routing/paths'
import { Card, ProfileFrame, ThreadButton, useOpenThread } from './ProfileFrame'

const people = routePaths.org.admin.people
type GroupTab = 'people' | 'plans' | 'join'

/** A group's profile under Threads: People (staff first), Plans (one assignment's learners at a time) and its Join link. */
export default function GroupProfile({ orgslug, groupId, view, compact }: { orgslug: string; groupId: number; view?: GroupView; compact?: boolean }) {
  const { org, token, isAdmin } = usePeopleContext()
  const { data: group, error, mutate } = useGroupDetail(groupId)
  const features = useFeatures()
  const openThread = useOpenThread(orgslug)
  const refreshList = useRefreshPeople()
  const [managing, setManaging] = React.useState(false)
  const [shown, setShown] = React.useState<GroupTab>(view === 'plans' || view === 'join' ? view : 'people')
  React.useEffect(() => setShown(view === 'plans' || view === 'join' ? view : 'people'), [view])
  const canManage = Boolean(group?.can_manage || isAdmin)
  const tabs: GroupTab[] = canManage ? ['people', 'plans', 'join'] : ['people', 'plans']
  const current = tabs.includes(shown) ? shown : 'people'
  const labels: Record<GroupTab, string> = { people: `People${group ? ` · ${group.people.length}` : ''}`, plans: 'Plans', join: 'Join link' }
  const refresh = async () => { await Promise.all([mutate(), refreshList()]) }

  if (error && !group) return <div className="m-auto max-w-sm p-8 text-center text-sm text-muted-foreground">{error.message || 'This group didn’t load.'}</div>
  if (!group) return <div className="m-auto p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  const learners = group.learner_count
  return <ProfileFrame orgslug={orgslug} compact={compact} title={group.name}
    art={<span className={cn('grid shrink-0 place-items-center rounded-2xl bg-muted text-foreground', compact ? 'h-12 w-12' : 'h-20 w-20')}><Users size={compact ? 22 : 34} /></span>}
    sub={`${learners} ${learners === 1 ? 'learner' : 'learners'}${group.alumni_count ? ` (${group.alumni_count} alumni)` : ''} · ${group.staff_count} staff`}
    actions={compact ? null : <>
      <ThreadButton primary onClick={() => openThread({ kind: 'group', groupId })} label="Group thread" />
      {canManage ? <button type="button" onClick={() => setManaging(true)} aria-haspopup="dialog" aria-label="Manage group" title="Rename or delete"
        className="grid h-10 w-10 place-items-center rounded-full border border-border hover:bg-muted"><SlidersHorizontal size={16} /></button> : null}
    </>}
    tabs={tabs.map((key) => ({ key, label: labels[key], href: getUriWithOrg(orgslug, people.group(groupId, key === 'people' ? undefined : key)) }))}
    tab={current} onTab={compact ? (key) => setShown(key as GroupTab) : undefined}>
    {current === 'people' ? <>
      {canManage ? <Card><GroupPeople groupId={groupId} onChanged={refresh} /></Card> : <PeopleCard orgslug={orgslug} group={group} />}
      {canManage ? <GroupStatus groupId={groupId} onChanged={refresh} /> : null}
    </>
      : current === 'plans' ? <GroupWork orgslug={orgslug} groupId={groupId} bare />
      : <Card title="Join link">
        <p className="-mt-1 mb-4 text-sm text-muted-foreground">Learners who use a link made here join the organization and this group.</p>
        <JoinLinkPanel org={org} accessToken={token || ''} usergroups={[]} groupsEnabled={features.has('groups')} bulkInvites={features.has('bulk_invites')} fixedGroupId={groupId} />
      </Card>}
    {canManage ? <ManageGroup orgslug={orgslug} groupId={groupId} open={managing} onOpenChange={setManaging} /> : null}
  </ProfileFrame>
}

/** The group's people for staff who can't change them: staff first, each opening their profile. */
function PeopleCard({ orgslug, group }: { orgslug: string; group: GroupDetail }) {
  return <Card title="People">
    {group.people.length ? <ul className="divide-y divide-border">{group.people.map((item) => <li key={`${item.as}-${item.user.id}`}>
      <Link href={getUriWithOrg(orgslug, people.user(item.user.username))} className="flex items-center gap-3 py-2.5 hover:opacity-80">
        <PersonAvatar user={item.user as any} size="md" />
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{item.user.name}</span><span className="block truncate text-xs text-muted-foreground">@{item.user.username}{item.status === 'alumni' ? ' · Alumni' : ''}</span></span>
        {item.as === 'staff' ? <RoleTag role="staff" /> : null}
      </Link>
    </li>)}</ul> : <p className="text-sm text-muted-foreground">Nobody in this group yet.</p>}
  </Card>
}

/* eslint-disable no-unused-vars */
function ManageGroup({ orgslug, groupId, open, onOpenChange }: { orgslug: string; groupId: number; open: boolean; onOpenChange: (open: boolean) => void }) {
/* eslint-enable no-unused-vars */
  const { orgId, token } = usePeopleContext()
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const refreshList = useRefreshPeople()
  const { data: groups, mutate: refreshGroups } = useOrgGroups()
  const group = groups?.find((item) => item.id === groupId)
  const [name, setName] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => { if (group) setName(group.name) }, [group])

  const refresh = async () => {
    await Promise.all([refreshGroups(), refreshList(), mutate(peopleKeys.group(orgId, groupId)), mutate(`${getAPIUrl()}usergroups/org/${orgId}/overview`)])
  }
  const rename = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!token || !name.trim() || name.trim() === group?.name) return
    setBusy(true)
    const response = await updateUserGroup(groupId, orgId, token, { name: name.trim() })
    setBusy(false)
    if (!response.success) return void toast.error(response.data?.detail || 'The name didn’t save')
    toast.success('Group renamed')
    await refresh()
  }
  const remove = async () => {
    if (!token || busy || !confirm(`Delete "${group?.name || 'this group'}"? Its people stay in the organization; its thread goes.`)) return
    setBusy(true)
    const response = await deleteUserGroup(groupId, orgId, token)
    setBusy(false)
    if (!response.success) return void toast.error(response.data?.detail || 'The group wasn’t deleted')
    toast.success('Group deleted')
    onOpenChange(false)
    await refresh()
    router.push(getUriWithOrg(orgslug, people.root()))
  }

  return <EditSheet open={open} onOpenChange={onOpenChange} color="#7cc4ff" title={group?.name || 'Group'} description="Rename the group, or delete it. Its people are on the People tab.">
    <form onSubmit={rename} className="flex items-end gap-2">
      <label className="flex-1 text-xs font-bold uppercase tracking-wide text-gray-500">Name
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm font-medium normal-case text-gray-900" />
      </label>
      <button type="submit" disabled={busy || !name.trim() || name.trim() === group?.name} className="h-10 rounded-lg bg-black px-4 text-xs font-bold text-white disabled:opacity-50">Rename</button>
    </form>
    <button type="button" onClick={() => void remove()} disabled={busy} className="inline-flex items-center gap-2 self-start rounded-lg border border-red-200 px-4 py-2 text-xs font-bold text-red-700 disabled:opacity-50"><Trash2 size={14} />Delete group</button>
  </EditSheet>
}

/** Mark a whole group's learners alumni when they move on (a class that graduated), or active again while there is room. */
function GroupStatus({ groupId, onChanged }: { groupId: number; onChanged: () => Promise<unknown> }) {
  const { orgId, token } = usePeopleContext()
  const { data: group } = useGroupDetail(groupId)
  const [busy, setBusy] = React.useState(false)
  if (!group?.can_set_status || !group.learner_count) return null
  const active = group.learner_count - group.alumni_count
  const mark = async (status: MemberStatus) => {
    const question = status === 'alumni'
      ? `Mark ${group.name}'s ${active} active ${active === 1 ? 'learner' : 'learners'} as alumni? They keep their plans and records and stop counting toward your learner limit.`
      : `Make ${group.name}'s ${group.alumni_count} alumni active again? They count toward your learner limit.`
    if (!token || busy || !confirm(question)) return
    setBusy(true)
    const response = await setGroupStatus(orgId, groupId, status, token)
    setBusy(false)
    if (!response.success) return void toast.error(response.data?.detail || 'That didn’t save')
    toast.success(status === 'alumni' ? 'Marked as alumni' : 'Active again')
    await onChanged()
  }
  return <Card title="Status">
    <p className="-mt-1 text-sm text-muted-foreground">{active} active · {group.alumni_count} alumni. Only active learners count toward your learner limit.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      {active ? <button type="button" onClick={() => void mark('alumni')} disabled={busy} className="h-9 rounded-full border border-border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50">Mark all alumni</button> : null}
      {group.alumni_count ? <button type="button" onClick={() => void mark('active')} disabled={busy} className="h-9 rounded-full border border-border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50">Make all active</button> : null}
    </div>
  </Card>
}
