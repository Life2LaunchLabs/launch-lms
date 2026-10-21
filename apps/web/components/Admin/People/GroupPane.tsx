'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { useSWRConfig } from 'swr'
import toast from 'react-hot-toast'
import { ArrowLeft, Layers3, Loader2, MessageCircle, SlidersHorizontal, Trash2, Users } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import ChatPane from '@components/Connect/ChatPane'
import EditSheet from '@components/Goals/edit/EditSheet'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { deleteUserGroup, updateUserGroup } from '@services/usergroups/usergroups'
import { cohortKey, goalAdminApi } from '@services/goals/admin'
import { peopleApi, peopleKeys, type GroupDetail } from '@services/school/people'
import { setGroupStatus, type MemberStatus } from '@services/organizations/membership'
import type { GroupView } from '@services/routing/paths'
import { GroupPeople } from './GroupPeople'
import GroupWork from './GroupWork'
import { useGroupDetail, useOrgGroups, usePeopleContext, useRefreshPeople } from './usePeople'

const people = routePaths.org.admin.people
const MAX_FACES = 12

/**
 * A group in People, laid out like a person: its name and people (staff first) with Manage for
 * admins, then its chat with its staff (Message) and the plans handed to it (Plans).
 */
export default function GroupPane({ orgslug, groupId, view }: { orgslug: string; groupId: number; view?: GroupView }) {
  const { orgId, token, isAdmin } = usePeopleContext()
  const { data: group, error } = useGroupDetail(groupId)
  const [managing, setManaging] = React.useState(false)
  const { data: cohort } = useSWR(orgId && token ? cohortKey(groupId, orgId) : null, () => goalAdminApi.cohort(orgId, groupId, token), { revalidateOnFocus: false, shouldRetryOnError: false })
  const planCount = cohort ? cohort.assignments.length + cohort.completed_assignments.length : null
  const canManage = Boolean(group?.can_manage || isAdmin)
  const listHref = getUriWithOrg(orgslug, people.root())
  const plans = view === 'plans'

  return <div className="flex min-h-0 flex-1 flex-col">
    <header className="shrink-0 border-b border-border bg-background px-4 pt-4 md:px-6">
      <div className="flex items-start gap-3">
        <Link href={listHref} aria-label="Back to People" className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl hover:bg-muted md:hidden"><ArrowLeft size={18} /></Link>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"><Users size={22} /></span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-black tracking-tight">{group?.name || (error ? 'Group' : '…')}</h1>
          {group ? <p className="truncate text-sm text-muted-foreground">Group · {group.learner_count} {group.learner_count === 1 ? 'learner' : 'learners'}{group.alumni_count ? ` (${group.alumni_count} alumni)` : ''} · {group.staff_count} staff</p>
            : error ? <p className="truncate text-sm text-muted-foreground">{error.message || 'This group didn’t load.'}</p> : null}
          {group?.people.length ? <Faces group={group} orgslug={orgslug} /> : null}
        </div>
        {canManage ? <button type="button" onClick={() => setManaging(true)} aria-haspopup="dialog" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-muted">
          <SlidersHorizontal size={15} /><span className="hidden sm:inline">Manage</span><span className="sr-only sm:hidden">Manage group</span>
        </button> : null}
      </div>
      <nav aria-label="Group" className="mt-3 flex gap-1">
        <TabLink href={getUriWithOrg(orgslug, people.group(groupId))} current={!plans} icon={<MessageCircle size={15} />}>Message</TabLink>
        <TabLink href={getUriWithOrg(orgslug, people.group(groupId, 'plans'))} current={plans} icon={<Layers3 size={15} />}>Plans{planCount === null ? '' : ` · ${planCount}`}</TabLink>
      </nav>
    </header>
    {plans ? <GroupWork orgslug={orgslug} groupId={groupId} /> : <GroupChat orgslug={orgslug} groupId={groupId} onManage={canManage ? () => setManaging(true) : undefined} />}
    {canManage ? <ManageGroup orgslug={orgslug} groupId={groupId} open={managing} onOpenChange={setManaging} /> : null}
  </div>
}

function TabLink({ href, current, icon, children }: { href: string; current: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return <Link href={href} aria-current={current ? 'page' : undefined}
    className={cn('-mb-px inline-flex h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-semibold', current ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
    {icon}{children}
  </Link>
}

/** The group's people as faces, staff first, each opening their page. */
function Faces({ group, orgslug }: { group: GroupDetail; orgslug: string }) {
  const shown = group.people.slice(0, MAX_FACES)
  const more = group.people.length - shown.length
  return <div className="mt-2 flex items-center gap-2">
    <ul aria-label="People in this group, staff first" className="flex -space-x-1.5">
      {shown.map((item) => <li key={`${item.as}-${item.user.id}`}>
        <Link href={getUriWithOrg(orgslug, people.user(item.user.username))} title={`${item.user.name}${item.as === 'staff' ? ' (staff)' : ''}`} aria-label={item.user.name}
          className={cn('block rounded-full ring-2 ring-background', item.role === 'learner' && item.as === 'member' && 'opacity-80')}>
          <PersonAvatar user={item.user as any} size="sm" />
        </Link>
      </li>)}
    </ul>
    {more > 0 ? <span className="text-xs font-semibold text-muted-foreground">+{more}</span> : null}
    <span className="text-xs text-muted-foreground">Staff first</span>
  </div>
}

function GroupChat({ orgslug, groupId, onManage }: { orgslug: string; groupId: number; onManage?: () => void }) {
  const { orgId, token } = usePeopleContext()
  const refreshList = useRefreshPeople()
  const { data: chat, error, isLoading } = useSWR(orgId && token ? `${peopleKeys.chats(orgId)}#group-${groupId}` : null,
    () => peopleApi.groupChat(orgId, groupId, token), { revalidateOnFocus: false, shouldRetryOnError: false })
  const listHref = getUriWithOrg(orgslug, people.root())
  const personHref = React.useCallback((person: { username: string }) => getUriWithOrg(orgslug, people.user(person.username)), [orgslug])

  if (isLoading) return <div className="m-auto"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (error || !chat) return <div className="m-auto max-w-sm p-8 text-center">
    <p className="text-sm text-muted-foreground">{error?.message || 'This group’s chat didn’t open.'}</p>
    {onManage ? <button type="button" onClick={onManage} className="mt-4 rounded-lg bg-black px-4 py-2 text-xs font-bold text-white">Manage group</button> : null}
  </div>
  return <ChatPane bare orgslug={orgslug} chatUuid={chat.conversation_uuid} listHref={listHref} personHref={personHref} onChanged={() => void refreshList()} />
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
    await Promise.all([refreshGroups(), refreshList(), mutate(peopleKeys.group(orgId, groupId)), mutate(`${peopleKeys.chats(orgId)}#group-${groupId}`), mutate(`${getAPIUrl()}usergroups/org/${orgId}/overview`)])
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
    if (!token || busy || !confirm(`Delete "${group?.name || 'this group'}"? Its people stay in the organization; its chat goes.`)) return
    setBusy(true)
    const response = await deleteUserGroup(groupId, orgId, token)
    setBusy(false)
    if (!response.success) return void toast.error(response.data?.detail || 'The group wasn’t deleted')
    toast.success('Group deleted')
    onOpenChange(false)
    await refresh()
    router.push(getUriWithOrg(orgslug, people.root()))
  }

  return <EditSheet open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) void refresh() }} color="#7cc4ff" title={group?.name || 'Group'} description="Its name and its people: staff first, then learners.">
    <form onSubmit={rename} className="flex items-end gap-2">
      <label className="flex-1 text-xs font-bold uppercase tracking-wide text-gray-500">Name
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm font-medium normal-case text-gray-900" />
      </label>
      <button type="submit" disabled={busy || !name.trim() || name.trim() === group?.name} className="h-10 rounded-lg bg-black px-4 text-xs font-bold text-white disabled:opacity-50">Rename</button>
    </form>
    <GroupPeople groupId={groupId} onChanged={refresh} />
    <GroupStatus groupId={groupId} onChanged={refresh} />
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
  return <section className="space-y-2">
    <h3 className="text-sm font-bold">Status</h3>
    <p className="text-xs text-gray-500">{active} active · {group.alumni_count} alumni. Only active learners count toward your learner limit.</p>
    <div className="flex flex-wrap gap-2">
      {active ? <button type="button" onClick={() => void mark('alumni')} disabled={busy} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold disabled:opacity-50">Mark all alumni</button> : null}
      {group.alumni_count ? <button type="button" onClick={() => void mark('active')} disabled={busy} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold disabled:opacity-50">Make all active</button> : null}
    </div>
  </section>
}
