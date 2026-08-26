'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Activity, ArrowRight, ChevronDown, ChevronUp, Plus, Search, UserPlus, Users, X } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import OrgUsers, { OrgUsersOverviewFilters } from '@components/Dashboard/Pages/Users/OrgUsers/OrgUsers'
import { Switch } from '@components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import AddUserGroup from '@components/Objects/Modals/Dash/OrgUserGroups/AddUserGroup'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import InviteUsersDialog from '@components/Dashboard/Pages/Users/OrgUsersAdd/InviteUsersDialog'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'

type GroupOverview = {
  id: number
  name: string
  description?: string
  member_count: number
  active: boolean
  assigned_to_current_user: boolean
}

export default function UsersOverview({ hasUserGroups }: { hasUserGroups: boolean }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const membership = session?.data?.roles?.find((item: any) => String(item?.org?.id) === String(org?.id))
  const isAdmin = session?.data?.user?.is_superadmin === true
    || membership?.role?.role_uuid === 'role_global_admin'
    || membership?.role?.id === 1

  const [showGroups, setShowGroups] = useState(hasUserGroups)
  const [showUsers, setShowUsers] = useState(true)
  const [search, setSearch] = useState('')
  const [roleOverride, setRoleOverride] = useState<string | null>(null)
  const [groupActive, setGroupActive] = useState<OrgUsersOverviewFilters['active']>('active')
  const [userActive, setUserActive] = useState<OrgUsersOverviewFilters['active']>('active')
  const [verified, setVerified] = useState<OrgUsersOverviewFilters['verified']>('all')
  const [groupsAssignedToMe, setGroupsAssignedToMe] = useState(!isAdmin)
  const [usersAssignedToMe, setUsersAssignedToMe] = useState(!isAdmin)
  const [createGroupOpen, setCreateGroupOpen] = useState(false)
  const [inviteUsersOpen, setInviteUsersOpen] = useState(false)

  const { data: roles } = useSWR(
    org && token ? `${getAPIUrl()}roles/org/${org.id}` : null,
    (url) => swrFetcher(url, token),
    { revalidateOnFocus: false }
  )
  const { data: groups, isLoading: groupsLoading } = useSWR(
    org && token && hasUserGroups ? `${getAPIUrl()}usergroups/org/${org.id}/overview` : null,
    (url) => swrFetcher(url, token),
    { revalidateOnFocus: false }
  )

  const defaultRoleId = !isAdmin
    ? String(roles?.find((role: any) => role.role_uuid === 'role_global_user' || role.name?.toLowerCase() === 'user')?.id || '')
    : ''
  const roleId = roleOverride ?? defaultRoleId

  const visibleGroups = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return ((groups || []) as GroupOverview[]).filter((group) => {
      if (normalizedSearch && !`${group.name} ${group.description || ''}`.toLowerCase().includes(normalizedSearch)) return false
      if (groupActive === 'active' && !group.active) return false
      if (groupActive === 'inactive' && group.active) return false
      if (groupsAssignedToMe && !group.assigned_to_current_user) return false
      return true
    })
  }, [groups, search, groupActive, groupsAssignedToMe])

  const userFilters = useMemo<OrgUsersOverviewFilters>(() => ({
    search,
    roleId,
    verified,
    active: userActive,
    assignedToMe: usersAssignedToMe,
  }), [search, roleId, verified, userActive, usersAssignedToMe])
  const userCountQuery = useMemo(() => {
    const params = new URLSearchParams({ page: '1', limit: '1' })
    if (search) params.set('search', search)
    if (roleId) params.set('role_id', roleId)
    if (verified !== 'all') params.set('status', verified)
    if (userActive !== 'all') params.set('active', String(userActive === 'active'))
    if (usersAssignedToMe) params.set('assigned_to_me', 'true')
    return params.toString()
  }, [search, roleId, verified, userActive, usersAssignedToMe])
  const { data: filteredUserCount } = useSWR(
    org && token ? `${getAPIUrl()}orgs/${org.id}/users?${userCountQuery}` : null,
    (url) => swrFetcher(url, token),
    { revalidateOnFocus: false }
  )
  const { data: totalUserCount } = useSWR(
    org && token ? `${getAPIUrl()}orgs/${org.id}/users?page=1&limit=1` : null,
    (url) => swrFetcher(url, token),
    { revalidateOnFocus: false }
  )
  const { data: invitations } = useSWR(
    org && token ? `${getAPIUrl()}orgs/${org.id}/invites/users` : null,
    (url) => swrFetcher(url, token),
    { revalidateOnFocus: false }
  )
  const pendingInvitationTotal = (invitations || []).length
  const filteredPendingInvitationTotal = (invitations || []).filter((invite: any) => {
    if (search && !String(invite.email).toLowerCase().includes(search.trim().toLowerCase())) return false
    if (roleId && String(invite.role?.id) !== roleId) return false
    if (verified !== 'all' || usersAssignedToMe) return false
    return true
  }).length
  const groupTotal = (groups || []).length
  const userFilteredTotal = (filteredUserCount?.total || 0) + filteredPendingInvitationTotal
  const userTotal = (totalUserCount?.total || 0) + pendingInvitationTotal

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-8 px-8 py-6">
      <section className="rounded-xl border border-border bg-card p-4 nice-shadow">
        <div>
          <label className="relative block w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <span className="sr-only">Search groups and users</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search groups and users..."
              className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-10 text-sm outline-none transition focus:border-foreground/30 focus:ring-2 focus:ring-ring/20"
            />
            {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>}
          </label>
        </div>
      </section>

      {hasUserGroups && (
        <section className="overflow-hidden rounded-xl border border-gray-100 bg-white nice-shadow">
          <div onClick={sectionHeaderToggle(setShowGroups)} className={`flex cursor-pointer items-center justify-between gap-4 px-5 py-4 ${showGroups ? 'border-b border-gray-100' : ''}`}>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-gray-900">Groups</h2>
              {!showGroups && <CollapsedCount count={visibleGroups.length} />}
            </div>
            <div className="flex items-center gap-3">
              {showGroups && <Modal
                isDialogOpen={createGroupOpen}
                onOpenChange={setCreateGroupOpen}
                minHeight="no-min"
                dialogTitle="Create group"
                dialogDescription="Create a group for users who share programs and assignments."
                dialogContent={<AddUserGroup setCreateUserGroupModal={setCreateGroupOpen} />}
                dialogTrigger={<button className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-gray-700"><Plus className="h-3.5 w-3.5" />Create group</button>}
              />}
              <CollapseButton label="Groups" expanded={showGroups} onClick={() => setShowGroups((current) => !current)} />
            </div>
          </div>
          {showGroups && <><div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/20 px-5 py-3">
            <ChipSelect
              ariaLabel="Filter groups by active assignment"
              value={groupActive}
              options={activityOptions}
              onChange={(value) => setGroupActive(value as OrgUsersOverviewFilters['active'])}
            />
            <FilterToggle label="Assigned to me" checked={groupsAssignedToMe} onCheckedChange={setGroupsAssignedToMe} />
            <div className="ml-auto"><CompactCount filtered={visibleGroups.length} total={groupTotal} /></div>
          </div><div className="p-5">{groupsLoading ? (
            <div className="rounded-xl border border-gray-100 bg-white p-8 text-sm text-gray-400 nice-shadow">Loading groups…</div>
          ) : visibleGroups.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleGroups.map((group) => (
                <Link
                  key={group.id}
                  href={getUriWithOrg(org.slug, routePaths.org.dash.users.group(group.id))}
                  className="group rounded-xl border border-gray-100 bg-white p-5 nice-shadow transition hover:-translate-y-0.5 hover:border-indigo-200"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><Users className="h-5 w-5" /></div>
                    <ArrowRight className="h-4 w-4 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-600" />
                  </div>
                  <h3 className="mt-4 font-bold text-gray-900">{group.name}</h3>
                  <p className="mt-1 line-clamp-2 min-h-10 text-sm text-gray-500">{group.description || 'No description'}</p>
                  <div className="mt-4 flex items-center justify-between text-xs">
                    <span className="text-gray-500">{group.member_count} member{group.member_count === 1 ? '' : 's'}</span>
                    <span className={group.active ? 'inline-flex items-center gap-1 text-emerald-600' : 'text-gray-400'}>
                      {group.active && <Activity className="h-3.5 w-3.5" />}{group.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-400">No groups match these filters.</div>
          )}</div></>}
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-gray-100 bg-white nice-shadow">
          <div onClick={sectionHeaderToggle(setShowUsers)} className={`flex cursor-pointer items-center justify-between gap-4 px-5 py-4 ${showUsers ? 'border-b border-gray-100' : ''}`}>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-gray-900">Users</h2>
              {!showUsers && <CollapsedCount count={userFilteredTotal} />}
            </div>
            <div className="flex items-center gap-3">
              {showUsers && <button onClick={() => setInviteUsersOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-gray-700"><UserPlus className="h-3.5 w-3.5" />Add users</button>}
              <CollapseButton label="Users" expanded={showUsers} onClick={() => setShowUsers((current) => !current)} />
            </div>
          </div>
          {showUsers && <><div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/20 px-5 py-3">
            <ChipSelect
              ariaLabel="Filter users by role"
              value={roleId || 'all'}
              options={[{ value: 'all', label: 'All roles' }, ...(roles || []).map((role: any) => ({ value: String(role.id), label: role.name }))]}
              onChange={(value) => setRoleOverride(value === 'all' ? '' : value)}
            />
            <ChipSelect
              ariaLabel="Filter users by active assignment"
              value={userActive}
              options={activityOptions}
              onChange={(value) => setUserActive(value as OrgUsersOverviewFilters['active'])}
            />
            <ChipSelect
              ariaLabel="Filter users by verification"
              value={verified}
              options={verificationOptions}
              onChange={(value) => setVerified(value as OrgUsersOverviewFilters['verified'])}
            />
            <FilterToggle label="Assigned to me" checked={usersAssignedToMe} onCheckedChange={setUsersAssignedToMe} />
            <div className="ml-auto"><CompactCount filtered={userFilteredTotal} total={userTotal} /></div>
          </div><div className="p-5"><OrgUsers overviewFilters={userFilters} /></div></>}
      </section>
      <InviteUsersDialog open={inviteUsersOpen} onOpenChange={setInviteUsersOpen} />
    </div>
  )
}

const activityOptions = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'all', label: 'All activity' },
]

const verificationOptions = [
  { value: 'all', label: 'All verification' },
  { value: 'verified', label: 'Verified' },
  { value: 'unverified', label: 'Unverified' },
]

// eslint-disable-next-line no-unused-vars
function FilterToggle({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (nextChecked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 px-1 text-sm font-semibold text-foreground">
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
      {label}
    </label>
  )
}

// eslint-disable-next-line no-unused-vars
function ChipSelect({ ariaLabel, value, options, onChange }: { ariaLabel: string; value: string; options: { value: string; label: string }[]; onChange: (nextValue: string) => void }) {
  return <Select value={value} onValueChange={onChange}>
    <SelectTrigger aria-label={ariaLabel} className="h-9 w-auto min-w-32 rounded-full border-border bg-background px-4 text-sm font-semibold text-foreground shadow-none">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
    </SelectContent>
  </Select>
}

function CollapseButton({ label, expanded, onClick }: { label: string; expanded: boolean; onClick: () => void }) {
  const Icon = expanded ? ChevronUp : ChevronDown
  return <button type="button" onClick={onClick} aria-expanded={expanded} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"><Icon className="h-4 w-4" /></button>
}

function CompactCount({ filtered, total }: { filtered: number; total: number }) {
  return <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">Showing {filtered} of {total} total</span>
}

function CollapsedCount({ count }: { count: number }) {
  return <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{count}</span>
}

function sectionHeaderToggle(setExpanded: React.Dispatch<React.SetStateAction<boolean>>) {
  return (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button, a, [role="button"]')) return
    setExpanded((current) => !current)
  }
}
