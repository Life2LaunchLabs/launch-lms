'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { useSWRConfig } from 'swr'
import toast from 'react-hot-toast'
import { ArrowLeft, Loader2, Settings2, Trash2, Users } from 'lucide-react'
import Link from 'next/link'
import ChatPane from '@components/Connect/ChatPane'
import EditSheet from '@components/Goals/edit/EditSheet'
import GroupStaffPanel from '@components/Admin/Users/GroupStaffPanel'
import ManageUsers from '@components/Objects/Modals/Dash/OrgUserGroups/ManageUsers'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { deleteUserGroup, updateUserGroup } from '@services/usergroups/usergroups'
import { peopleApi, peopleKeys } from '@services/school/people'
import type { GroupView } from '@services/routing/paths'
import GroupWork, { GroupTabs } from './GroupWork'
import { useOrgGroups, usePeopleContext } from './usePeople'

const people = routePaths.org.admin.people

/** A group in People: its chat with its staff, its plans and requirements, and for admins, who's in it and its name. */
export default function GroupPane({ orgslug, groupId, view }: { orgslug: string; groupId: number; view?: GroupView }) {
  return <div className="flex min-h-0 flex-1 flex-col">
    <GroupTabs orgslug={orgslug} groupId={groupId} view={view} />
    {view ? <GroupWork orgslug={orgslug} groupId={groupId} view={view} /> : <GroupChat orgslug={orgslug} groupId={groupId} />}
  </div>
}

function GroupChat({ orgslug, groupId }: { orgslug: string; groupId: number }) {
  const { orgId, token, isAdmin } = usePeopleContext()
  const { mutate } = useSWRConfig()
  const [managing, setManaging] = React.useState(false)
  const { data: chat, error, isLoading } = useSWR(orgId && token ? `${peopleKeys.chats(orgId)}#group-${groupId}` : null,
    () => peopleApi.groupChat(orgId, groupId, token), { revalidateOnFocus: false, shouldRetryOnError: false })
  const listHref = getUriWithOrg(orgslug, people.root())
  const personHref = React.useCallback((person: { username: string }) => getUriWithOrg(orgslug, people.user(person.username)), [orgslug])
  const manage = isAdmin ? <button type="button" onClick={() => setManaging(true)} aria-label="Manage group" title="Manage group"
    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"><Settings2 size={18} /></button> : null
  const sheet = isAdmin ? <ManageGroup orgslug={orgslug} groupId={groupId} open={managing} onOpenChange={setManaging} /> : null

  if (isLoading) return <div className="m-auto"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (error || !chat) {
    return <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-3">
        <Link href={listHref} aria-label="Back to People" className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-muted md:hidden"><ArrowLeft size={18} /></Link>
        <Users size={18} className="text-muted-foreground" /><span className="font-bold">Group</span><span className="ml-auto">{manage}</span>
      </div>
      <div className="m-auto max-w-sm p-8 text-center">
        <p className="text-sm text-muted-foreground">{error?.message || 'This group’s chat didn’t open.'}</p>
        {isAdmin ? <button type="button" onClick={() => setManaging(true)} className="mt-4 rounded-lg bg-black px-4 py-2 text-xs font-bold text-white">Manage group</button> : null}
      </div>
      {sheet}
    </div>
  }
  return <>
    <ChatPane orgslug={orgslug} chatUuid={chat.conversation_uuid} listHref={listHref} personHref={personHref} actions={manage}
      onChanged={() => void mutate(peopleKeys.chats(orgId))} />
    {sheet}
  </>
}

/* eslint-disable no-unused-vars */
function ManageGroup({ orgslug, groupId, open, onOpenChange }: { orgslug: string; groupId: number; open: boolean; onOpenChange: (open: boolean) => void }) {
/* eslint-enable no-unused-vars */
  const { orgId, token } = usePeopleContext()
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const { data: groups, mutate: refreshGroups } = useOrgGroups()
  const group = groups?.find((item) => item.id === groupId)
  const [name, setName] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => { if (group) setName(group.name) }, [group])

  const refresh = async () => {
    await Promise.all([refreshGroups(), mutate(peopleKeys.chats(orgId)), mutate(`${peopleKeys.chats(orgId)}#group-${groupId}`), mutate(`${getAPIUrl()}usergroups/org/${orgId}/overview`)])
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

  return <EditSheet open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) void refresh() }} color="#7cc4ff" title={group?.name || 'Group'} description="Its members, the staff who work with them, and its name.">
    <form onSubmit={rename} className="flex items-end gap-2">
      <label className="flex-1 text-xs font-bold uppercase tracking-wide text-gray-500">Name
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm font-medium normal-case text-gray-900" />
      </label>
      <button type="submit" disabled={busy || !name.trim() || name.trim() === group?.name} className="h-10 rounded-lg bg-black px-4 text-xs font-bold text-white disabled:opacity-50">Rename</button>
    </form>
    <GroupStaffPanel orgId={orgId} groupId={groupId} token={token} />
    <section><h3 className="mb-2 text-sm font-bold">Members</h3><ManageUsers usergroup_id={groupId} embedded /></section>
    <button type="button" onClick={() => void remove()} disabled={busy} className="inline-flex items-center gap-2 self-start rounded-lg border border-red-200 px-4 py-2 text-xs font-bold text-red-700 disabled:opacity-50"><Trash2 size={14} />Delete group</button>
  </EditSheet>
}
