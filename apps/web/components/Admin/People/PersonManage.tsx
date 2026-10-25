'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { useSWRConfig } from 'swr'
import toast from 'react-hot-toast'
import { Loader2, Plus, UserMinus, X } from 'lucide-react'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { removeUserFromOrg, updateUserRole } from '@services/organizations/orgs'
import { linkUserToUserGroup, unLinkUserToUserGroup } from '@services/usergroups/usergroups'
import { swrFetcher } from '@services/utils/ts/requests'
import { peopleKeys, type Profile } from '@services/school/people'
import { STATUS_LABELS, membershipKeys, setMemberStatus, setStaffPermissions, statusLine, type MemberStatus, type StaffPermission, type StaffPermissionInfo } from '@services/organizations/membership'
import { useOrgGroups, usePeopleContext, useRefreshPeople } from './usePeople'

const SELECT = 'h-9 rounded-lg border border-border bg-background px-2.5 text-sm font-medium disabled:opacity-50'

/** What admins change about someone: their role and permissions, their status, their groups, and whether they're in the organization at all. */
export default function PersonManage({ orgslug, profile, refresh }: { orgslug: string; profile: Profile; refresh: () => Promise<unknown> }) {
  const { orgId, token } = usePeopleContext()
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const refreshList = useRefreshPeople()
  const { user, manage } = profile
  const [busy, setBusy] = React.useState(false)
  const { data: roles } = useSWR(manage.change_role && token ? `${getAPIUrl()}roles/org/${orgId}` : null, (url: string) => swrFetcher(url, token), { revalidateOnFocus: false })
  const { data: groups } = useOrgGroups(manage.groups)
  const memberOf = new Set(profile.groups.filter((group) => group.as === 'member').map((group) => group.id))
  const addable = (groups || []).filter((group) => !memberOf.has(group.id))
  const { data: catalog } = useSWR<{ permissions: StaffPermissionInfo[] }>(manage.permissions && token ? membershipKeys.staffPermissions(orgId) : null,
    (url: string) => swrFetcher(url, token), { revalidateOnFocus: false })
  const [adding, setAdding] = React.useState('')
  if (!manage.change_role && !manage.remove && !manage.groups && !manage.status && !manage.permissions) return null

  const refreshAll = async () => {
    await Promise.all([refresh(), refreshList(), mutate((key) => typeof key === 'string' && key.startsWith(peopleKeys.directory(orgId).split('?')[0]))])
  }
  const run = async (work: () => Promise<{ success: boolean; data: any }>, done: string) => {
    if (!token || busy) return false
    setBusy(true)
    try {
      const response = await work()
      if (!response.success) throw new Error(response.data?.detail || 'That didn’t save')
      toast.success(done)
      await refreshAll()
      return true
    } catch (error: any) {
      toast.error(error?.message || 'That didn’t save')
      return false
    } finally {
      setBusy(false)
    }
  }
  const changeRole = (roleUuid: string) => void run(() => updateUserRole(orgId, user.id, roleUuid, token as string), 'Role changed')
  const changeStatus = (status: MemberStatus) => void run(() => setMemberStatus(orgId, user.id, status, token as string),
    status === 'alumni' ? `${user.name} is now alumni` : `${user.name} is active again`)
  const togglePermission = (key: StaffPermission, on: boolean) => {
    const next = on ? [...profile.permissions, key] : profile.permissions.filter((item) => item !== key)
    void run(() => setStaffPermissions(orgId, user.id, next, token as string), 'Permissions saved')
  }
  const addToGroup = async () => {
    if (await run(() => linkUserToUserGroup(Number(adding), user.id, orgId, token as string), 'Added to the group')) setAdding('')
  }
  const leaveGroup = (groupId: number, name: string) => {
    if (confirm(`Take ${user.name} out of ${name}?`)) void run(() => unLinkUserToUserGroup(groupId, user.id, orgId, token as string), 'Taken out of the group')
  }
  const remove = async () => {
    if (!confirm(`Remove ${user.name} from the organization? They leave its groups and chats, and anyone they help loses them on their plans here.`)) return
    if (await run(() => removeUserFromOrg(orgId, user.id, token as string), `${user.name} was removed`)) router.push(getUriWithOrg(orgslug, routePaths.org.admin.people.root()))
  }

  return <section aria-label="Manage" className="space-y-4 rounded-2xl border border-border bg-card p-5">
    <h2 className="text-sm font-bold">Manage</h2>
    {manage.change_role ? <label className="flex items-center justify-between gap-4 text-sm">
      <span className="font-semibold text-foreground">Role</span>
      <select aria-label="Role" className={SELECT} value={profile.org_role?.role_uuid || ''} disabled={busy || !roles} onChange={(event) => changeRole(event.target.value)}>
        {!profile.org_role ? <option value="">—</option> : null}
        {(roles || []).map((role: any) => <option key={role.role_uuid} value={role.role_uuid}>{role.name}</option>)}
      </select>
    </label> : null}
    {manage.permissions ? <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-foreground">What they may do</legend>
      {(catalog?.permissions || []).map((item) => <label key={item.key} className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" className="h-4 w-4" checked={profile.permissions.includes(item.key)} disabled={busy} onChange={(event) => togglePermission(item.key, event.target.checked)} />
        {item.label}
      </label>)}
    </fieldset> : null}
    {manage.status ? <label className="flex items-center justify-between gap-4 text-sm">
      <span>
        <span className="block font-semibold text-foreground">Status</span>
        <span className="block text-xs text-muted-foreground">{profile.status === 'alumni' ? statusLine('alumni', profile.status_since) + '. Alumni don’t count toward your learner limit.' : 'Mark learners who have moved on as alumni to free their place.'}</span>
      </span>
      <select aria-label="Status" className={SELECT} value={profile.status || 'active'} disabled={busy} onChange={(event) => changeStatus(event.target.value as MemberStatus)}>
        {(Object.keys(STATUS_LABELS) as MemberStatus[]).map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
      </select>
    </label> : null}
    {manage.groups ? <div className="space-y-2">
      <p className="text-sm font-semibold text-foreground">Groups</p>
      {profile.groups.length ? <ul className="flex flex-wrap gap-1.5">{profile.groups.map((group) => <li key={`${group.as}-${group.id}`} className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pl-3 pr-1 text-xs font-semibold text-foreground">
        {group.name}{group.as === 'staff' ? <span className="font-normal text-muted-foreground">· staff</span> : null}
        {group.as === 'member' ? <button type="button" onClick={() => leaveGroup(group.id, group.name)} disabled={busy} aria-label={`Take out of ${group.name}`} className="-my-2 flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted md:my-0 md:h-auto md:w-auto md:p-0.5"><X size={12} /></button> : <span className="w-1" />}
      </li>)}</ul> : <p className="text-xs text-muted-foreground">Not in any group.</p>}
      {addable.length ? <div className="flex gap-2">
        <select aria-label="Add to a group" className={`${SELECT} flex-1`} value={adding} onChange={(event) => setAdding(event.target.value)} disabled={busy}>
          <option value="">Add to a group…</option>
          {addable.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
        <button type="button" onClick={() => void addToGroup()} disabled={!adding || busy} aria-label="Add to group" className="flex h-9 w-9 items-center justify-center rounded-lg bg-black text-white disabled:opacity-50"><Plus size={16} /></button>
      </div> : null}
    </div> : null}
    {manage.remove ? <button type="button" onClick={() => void remove()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700 disabled:opacity-50">
      {busy ? <Loader2 size={14} className="animate-spin" /> : <UserMinus size={14} />}Remove from organization
    </button> : null}
  </section>
}
