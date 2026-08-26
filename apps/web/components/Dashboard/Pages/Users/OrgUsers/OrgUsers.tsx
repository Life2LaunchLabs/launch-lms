'use client'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import LaunchLMSSpinner from '@components/Objects/Loaders/LaunchLMSSpinner'
import ConfirmationModal from '@components/Objects/StyledElements/ConfirmationModal/ConfirmationModal'
import Toast from '@components/Objects/StyledElements/Toast/Toast'
import UserAvatar from '@components/Objects/UserAvatar'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import Link from 'next/link'
import AdminDataTable from '@components/Admin/AdminDataTable'
import { Pagination } from '@components/Admin/Platform/shared'
import { removeUserFromOrg, removeUsersFromOrg, updateUserRole } from '@services/organizations/orgs'
import { revokeUserInvitation } from '@services/organizations/invites'
import { swrFetcher } from '@services/utils/ts/requests'
import { LogOut, Shield, User, Crown, Users, CheckCircle2, XCircle, Mail, Globe, ArrowUp, ArrowDown, X, UserPlus } from 'lucide-react'
import React, { useState, useRef } from 'react'
import toast from 'react-hot-toast'
import useSWR, { mutate } from 'swr'
import { useTranslation } from 'react-i18next'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@components/ui/select'
import InviteUsersDialog from '@components/Dashboard/Pages/Users/OrgUsersAdd/InviteUsersDialog'
import { usePlan } from '@components/Hooks/usePlan'
import { planMeetsRequirement } from '@services/plans/plans'

const ITEMS_PER_PAGE = 10

export type OrgUsersOverviewFilters = {
  search: string
  roleId: string
  verified: 'all' | 'verified' | 'unverified'
  active: 'all' | 'active' | 'inactive'
  assignedToMe: boolean
}

function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return '—'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return '—'
  }
}

// Probabilistic revalidateOnFocus — revalidate ~50% of the time
function shouldRevalidate() {
  return Math.random() < 0.5
}

function OrgUsers({ overviewFilters }: { overviewFilters?: OrgUsersOverviewFilters } = {}) {
  const { t } = useTranslation()
  const org = useOrg() as any
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token;
  const currentPlan = usePlan()
  const hasUserGroups = planMeetsRequirement(currentPlan, 'full')
    && (org?.config?.config?.resolved_features?.usergroups?.enabled ?? true)

  const [page, setPage] = useState(1)
  const [searchValue, setSearchValue] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set())
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [filterRole, setFilterRole] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterGroupId, setFilterGroupId] = useState<string>('')
  const [showInviteDialog, setShowInviteDialog] = useState(false)

  React.useEffect(() => {
    if (!overviewFilters) return
    setPage(1)
    setSelectedUserIds(new Set())
  }, [overviewFilters])

  // Track whether revalidation on focus is allowed
  const revalidateRef = useRef(shouldRevalidate)

  const buildQuery = () => {
    const params = new URLSearchParams()
    params.append('page', page.toString())
    params.append('limit', ITEMS_PER_PAGE.toString())
    params.append('sort_order', sortOrder)
    const effectiveSearch = overviewFilters?.search ?? searchValue
    const effectiveRole = overviewFilters?.roleId ?? filterRole
    const effectiveStatus = overviewFilters?.verified === 'all' ? '' : (overviewFilters?.verified ?? filterStatus)
    if (effectiveSearch) params.append('search', effectiveSearch)
    if (effectiveRole) params.append('role_id', effectiveRole)
    if (effectiveStatus) params.append('status', effectiveStatus)
    if (overviewFilters?.active !== undefined && overviewFilters.active !== 'all') {
      params.append('active', String(overviewFilters.active === 'active'))
    }
    if (overviewFilters?.assignedToMe) params.append('assigned_to_me', 'true')
    if (filterGroupId) {
      params.append('usergroup_id', filterGroupId)
      params.append('usergroup_filter', 'in_group')
    }
    return params.toString()
  }

  const usersUrl = org && access_token ? `${getAPIUrl()}orgs/${org?.id}/users?${buildQuery()}` : null
  const { data, isValidating } = useSWR(
    usersUrl,
    (url) => swrFetcher(url, access_token),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      onSuccess: () => {
        // Re-roll the dice for next focus
        revalidateRef.current = shouldRevalidate
      },
    }
  )

  // Manual focus-based revalidation at ~50% rate
  React.useEffect(() => {
    const handleFocus = () => {
      if (revalidateRef.current() && usersUrl) {
        mutate(usersUrl)
      }
      revalidateRef.current = shouldRevalidate
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [usersUrl])

  // Fetch available roles
  const { data: roles } = useSWR(
    org && access_token ? `${getAPIUrl()}roles/org/${org.id}` : null,
    (url) => swrFetcher(url, access_token),
    { revalidateOnFocus: false }
  )

  // Fetch available usergroups for filter dropdown
  const { data: usergroups } = useSWR(
    org && access_token && hasUserGroups ? `${getAPIUrl()}usergroups/org/${org.id}?org_id=${org.id}` : null,
    (url) => swrFetcher(url, access_token),
    { revalidateOnFocus: false }
  )
  const { data: invitedUsers, mutate: mutateInvitedUsers } = useSWR(
    org && access_token ? `${getAPIUrl()}orgs/${org.id}/invites/users` : null,
    (url) => swrFetcher(url, access_token),
    { revalidateOnFocus: false }
  )

  const orgUsers = data?.items || []
  const pendingInvites = (invitedUsers?.filter((invite: any) => invite.pending) || []).filter((invite: any) => {
    const effectiveSearch = (overviewFilters?.search ?? searchValue).trim().toLowerCase()
    const effectiveRole = overviewFilters?.roleId ?? filterRole
    const effectiveStatus = overviewFilters?.verified === 'all' ? '' : (overviewFilters?.verified ?? filterStatus)
    if (effectiveSearch && !String(invite.email).toLowerCase().includes(effectiveSearch)) return false
    if (effectiveRole && String(invite.role?.id) !== effectiveRole) return false
    if (effectiveStatus) return false
    if (overviewFilters?.assignedToMe) return false
    if (filterGroupId && String(invite.usergroup?.id) !== filterGroupId) return false
    return true
  })
  const total = data?.total || 0
  const isInitialLoading = !data && isValidating
  const isPageTransitioning = !!data && isValidating

  const visibleUserIds: number[] = orgUsers.map((u: any) => u.user.id)
  const allVisibleSelected = visibleUserIds.length > 0 && visibleUserIds.every((id: number) => selectedUserIds.has(id))

  const hasActiveFilters = overviewFilters
    ? Boolean(overviewFilters.search || overviewFilters.roleId || overviewFilters.verified !== 'all' || overviewFilters.active !== 'all' || overviewFilters.assignedToMe)
    : Boolean(filterRole || filterStatus || (hasUserGroups && filterGroupId))

  const toggleSelectAll = () => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        visibleUserIds.forEach((id: number) => next.delete(id))
      } else {
        visibleUserIds.forEach((id: number) => next.add(id))
      }
      return next
    })
  }

  const toggleSelectUser = (userId: number) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) {
        next.delete(userId)
      } else {
        next.add(userId)
      }
      return next
    })
  }

  const toggleSortOrder = () => {
    setSortOrder((prev) => prev === 'desc' ? 'asc' : 'desc')
    setPage(1)
    setSelectedUserIds(new Set())
  }

  const resetFilters = () => {
    setFilterRole('')
    setFilterStatus('')
    setFilterGroupId('')
    setPage(1)
    setSelectedUserIds(new Set())
  }

  const handleRoleChange = async (user_id: any, newRoleUuid: string) => {
    const toastId = toast.loading(t('dashboard.users.active_users.actions.updating_role') || 'Updating role...');
    const res = await updateUserRole(org.id, user_id, newRoleUuid, access_token)
    if (res.status === 200) {
      await mutate(usersUrl)
      toast.success(t('dashboard.users.active_users.actions.role_update_success') || 'Role updated successfully', {id:toastId});
    } else {
      toast.error(t('dashboard.users.active_users.actions.role_update_error') || 'Error updating role', {id:toastId});
    }
  }

  const handleRemoveUser = async (user_id: any) => {
    const toastId = toast.loading(t('dashboard.users.active_users.actions.removing'));
    const res = await removeUserFromOrg(org.id, user_id, access_token)
    if (res.status === 200) {
      await mutate(usersUrl)
      toast.success(t('dashboard.users.active_users.actions.remove_success'), {id:toastId});
    } else {
      toast.error(t('dashboard.users.active_users.actions.remove_error'), {id:toastId});
    }
  }

  const handleBatchRemove = async () => {
    const ids = Array.from(selectedUserIds)
    const toastId = toast.loading(`Removing ${ids.length} user(s)...`);
    const res = await removeUsersFromOrg(org.id, ids, access_token)
    if (res.status === 200) {
      setSelectedUserIds(new Set())
      await mutate(usersUrl)
      toast.success(`${ids.length} user(s) removed successfully`, {id:toastId});
    } else {
      toast.error('Error removing users', {id:toastId});
    }
  }

  const handleRevokeInvitation = async (invitationUuid: string) => {
    const toastId = toast.loading('Revoking invitation…')
    const res = await revokeUserInvitation(org.id, invitationUuid, access_token)
    if (res.status === 200) {
      await Promise.all([mutateInvitedUsers(), mutate(usersUrl)])
      toast.success('Invitation revoked and seat released', { id: toastId })
    } else {
      toast.error(res.data?.detail || 'Could not revoke invitation', { id: toastId })
    }
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    setSelectedUserIds(new Set())
  }

  const handleSearchChange = (value: string) => {
    setSearchValue(value)
    setPage(1)
    setSelectedUserIds(new Set())
  }

  const handleFilterChange = (setter: React.Dispatch<React.SetStateAction<string>>) => (value: string) => {
    setter(value === 'all' ? '' : value)
    setPage(1)
    setSelectedUserIds(new Set())
  }

  return (
    <div>
      <Toast></Toast>
      <AdminDataTable
        className={overviewFilters ? '' : 'mx-8 my-6'}
        search={overviewFilters ? undefined : { value: searchValue, onChange: handleSearchChange, placeholder: t('dashboard.users.active_users.search_placeholder') || 'Search users...' }}
        filters={overviewFilters ? [] : [
          { id: 'role', label: 'Role', value: filterRole || 'all', options: [{ value: 'all', label: 'All' }, ...(roles || []).map((role: any) => ({ value: String(role.id), label: role.name }))], onChange: handleFilterChange(setFilterRole) },
          { id: 'status', label: 'Status', value: filterStatus || 'all', options: [{ value: 'all', label: 'All' }, { value: 'verified', label: 'Verified' }, { value: 'unverified', label: 'Unverified' }], onChange: handleFilterChange(setFilterStatus) },
          ...(hasUserGroups ? [{ id: 'group', label: 'Groups', value: filterGroupId || 'all', options: [{ value: 'all', label: 'All' }, ...(usergroups || []).map((group: any) => ({ value: String(group.id), label: group.name }))], onChange: handleFilterChange(setFilterGroupId) }] : []),
        ]}
        resultLabel={`${total + pendingInvites.length} user${total + pendingInvites.length !== 1 ? 's' : ''}`}
        actions={!overviewFilters ? (
          <div className="flex items-center gap-2">
            {hasActiveFilters && <button onClick={resetFilters} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-black"><X className="h-3 w-3" />Clear</button>}
            <button
              onClick={() => setShowInviteDialog(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-gray-700"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Add users
            </button>
          </div>
        ) : undefined}
      >

            {/* Selection Action Bar */}
            {selectedUserIds.size > 0 && (
              <div className="flex items-center justify-between px-6 py-3 bg-indigo-50 border-b border-indigo-100">
                <span className="text-sm font-medium text-indigo-700">
                  {selectedUserIds.size} user{selectedUserIds.size !== 1 ? 's' : ''} selected
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedUserIds(new Set())}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1.5 rounded-md hover:bg-indigo-100 transition-all"
                  >
                    Clear selection
                  </button>
                  <ConfirmationModal
                    confirmationButtonText={`Remove ${selectedUserIds.size} user${selectedUserIds.size !== 1 ? 's' : ''}`}
                    confirmationMessage={`Are you sure you want to remove ${selectedUserIds.size} user${selectedUserIds.size !== 1 ? 's' : ''} from the organization? This action cannot be undone.`}
                    dialogTitle="Remove selected users"
                    dialogTrigger={
                      <button className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 text-white hover:bg-rose-700 rounded-md text-xs font-medium transition-all">
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Remove selected</span>
                      </button>
                    }
                    functionToExecute={handleBatchRemove}
                    status="warning"
                  />
                </div>
              </div>
            )}

            {/* Content */}
            <div className="px-0 relative">
              {isInitialLoading ? (
                <div className="py-20 flex justify-center">
                  <LaunchLMSSpinner size={36} />
                </div>
              ) : orgUsers.length === 0 && pendingInvites.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="bg-gray-100 p-4 rounded-full">
                      <User className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-gray-400 text-sm font-medium">
                      {(overviewFilters?.search ?? searchValue) || hasActiveFilters
                        ? t('dashboard.users.active_users.no_results') || 'No users found matching your filters'
                        : t('dashboard.users.active_users.no_users') || 'No users in this organization yet'
                      }
                    </p>
                    {hasActiveFilters && (
                      <button
                        onClick={resetFilters}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        Clear all filters
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="relative">
                {isPageTransitioning && (
                  <div className="absolute inset-0 bg-white/60 z-10 flex items-center justify-center rounded-lg">
                    <LaunchLMSSpinner size={28} />
                  </div>
                )}
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-6 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">
                        {t('dashboard.users.active_users.table.user') || 'User'}
                      </th>
                      {hasUserGroups && (
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">
                          {t('dashboard.users.active_users.table.groups') || 'Groups'}
                        </th>
                      )}
                      <th
                        className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3 cursor-pointer select-none hover:text-gray-700 transition-colors"
                        onClick={toggleSortOrder}
                      >
                        <div className="inline-flex items-center gap-1">
                          Joined
                          {sortOrder === 'desc' ? (
                            <ArrowDown className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowUp className="w-3.5 h-3.5" />
                          )}
                        </div>
                      </th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">
                        Status
                      </th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">
                        {t('dashboard.users.active_users.table.role') || 'Role'}
                      </th>
                      <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">
                        {t('dashboard.users.active_users.table.actions') || 'Actions'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {page === 1 && pendingInvites.map((invite: any) => (
                      <tr key={invite.invitation_uuid} className="bg-amber-50/30">
                        <td className="w-10 px-6 py-4">
                          <input type="checkbox" disabled className="h-4 w-4 cursor-not-allowed rounded border-gray-200 opacity-40" aria-label={`Invitation for ${invite.email}`} />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                              <Mail className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-gray-800">{invite.email}</div>
                              <div className="text-xs text-gray-400">Invitation pending</div>
                            </div>
                          </div>
                        </td>
                        {hasUserGroups && <td className="px-6 py-4">{invite.usergroup ? <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600"><Users className="h-3 w-3" />{invite.usergroup.name}</span> : <span className="text-xs text-gray-400">—</span>}</td>}
                        <td className="px-6 py-4 text-xs text-gray-500">Invited {formatShortDate(invite.created_at)}</td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                            <Mail className="h-3 w-3" />
                            Pending
                          </span>
                        </td>
                        <td className="px-6 py-4"><span className="inline-flex items-center gap-1.5 rounded-md bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700">{String(invite.role?.name || 'User').toLowerCase().includes('admin') ? <Crown className="h-3.5 w-3.5 text-indigo-600" /> : String(invite.role?.name || '').toLowerCase().match(/maintainer|instructor|staff/) ? <Shield className="h-3.5 w-3.5 text-emerald-600" /> : <User className="h-3.5 w-3.5 text-gray-500" />}{invite.role?.name || 'User'}</span></td>
                        <td className="px-6 py-4 text-right"><ConfirmationModal confirmationButtonText="Revoke invitation" confirmationMessage={`Revoke the invitation for ${invite.email}? The reserved seat will be released.`} dialogTitle="Revoke invitation" dialogTrigger={<button className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white px-3 text-xs font-medium text-gray-600 nice-shadow transition hover:bg-rose-50 hover:text-rose-600"><X className="h-3.5 w-3.5" />Revoke</button>} functionToExecute={() => handleRevokeInvitation(invite.invitation_uuid)} status="warning" /></td>
                      </tr>
                    ))}
                    {orgUsers?.map((user: any) => (
                      <tr
                        key={user.user.id}
                        className={`hover:bg-gray-50 transition-colors ${selectedUserIds.has(user.user.id) ? 'bg-indigo-50/40' : ''}`}
                      >
                        {/* Checkbox */}
                        <td className="px-6 py-4 w-10">
                          <input
                            type="checkbox"
                            checked={selectedUserIds.has(user.user.id)}
                            onChange={() => toggleSelectUser(user.user.id)}
                            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>

                        {/* User Info */}
                        <td className="px-6 py-4">
                          <Link href={getUriWithOrg(org.slug, routePaths.org.dash.users.user(user.user.username))} className="group flex items-center gap-3">
                            <UserAvatar
                              width={40}
                              userId={user.user.id?.toString()}
                              rounded="rounded-full"
                              showProfilePopup={true}
                            />
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-semibold text-gray-800 group-hover:underline">
                                  {user.user.first_name + ' ' + user.user.last_name}
                                </span>
                                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full text-gray-500 font-medium">
                                  @{user.user.username}
                                </span>
                              </div>
                              {user.user.email && (
                                <span className="text-xs text-gray-400 truncate">
                                  {user.user.email}
                                </span>
                              )}
                            </div>
                          </Link>
                        </td>

                        {/* Groups */}
                        {hasUserGroups && <td className="px-6 py-4">
                          {user.usergroups && user.usergroups.length > 0 ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {user.usergroups.map((group: any) => (
                                <span
                                  key={group.id}
                                  className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-md font-medium"
                                  title={group.description}
                                >
                                  <Users className="w-3 h-3" />
                                  {group.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>}

                        {/* Joined */}
                        <td className="px-6 py-4">
                          <span className="text-xs text-gray-500">
                            {formatShortDate(user.joined_at)}
                          </span>
                        </td>

                        {/* Status (Verified + Sign-up method + Last login) */}
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              {user.user.email_verified ? (
                                <span className="inline-flex items-center gap-1 text-xs text-emerald-600" title="Email verified">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Verified</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-amber-600" title="Email not verified">
                                  <XCircle className="w-3.5 h-3.5" />
                                  <span>Unverified</span>
                                </span>
                              )}
                              {user.user.signup_method && (
                                <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium ${
                                  user.user.signup_method !== 'email'
                                    ? 'bg-purple-50 text-purple-600'
                                    : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {user.user.signup_method !== 'email' ? (
                                    <Globe className="w-3 h-3" />
                                  ) : (
                                    <Mail className="w-3 h-3" />
                                  )}
                                  {user.user.signup_method === 'email' ? 'Email' : user.user.signup_method === 'google' ? 'Google' : user.user.signup_method.charAt(0).toUpperCase() + user.user.signup_method.slice(1)}
                                </span>
                              )}
                            </div>
                            {user.user.last_login_at && (
                              <span className="text-xs text-gray-400">
                                Last login: {formatShortDate(user.user.last_login_at)}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Role */}
                        <td className="px-6 py-4">
                          <Select
                            value={user.role.role_uuid}
                            onValueChange={(newRoleUuid) => handleRoleChange(user.user.id, newRoleUuid)}
                            disabled={!roles}
                          >
                            <SelectTrigger className={`h-8 w-fit px-3 text-xs font-semibold rounded-md nice-shadow transition-all border-0 ${
                              user.role.name.toLowerCase().includes('admin')
                                ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                                : user.role.name.toLowerCase().includes('teacher') || user.role.name.toLowerCase().includes('instructor')
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                            }`}>
                              <SelectValue>
                                <div className="flex items-center gap-1.5">
                                  {user.role.name.toLowerCase().includes('admin') ? (
                                    <Crown className="w-3.5 h-3.5" />
                                  ) : user.role.name.toLowerCase().includes('teacher') || user.role.name.toLowerCase().includes('instructor') ? (
                                    <Shield className="w-3.5 h-3.5" />
                                  ) : (
                                    <User className="w-3.5 h-3.5" />
                                  )}
                                  <span>{user.role.name}</span>
                                </div>
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {roles?.map((role: any) => (
                                <SelectItem key={role.id} value={role.role_uuid}>
                                  <div className="flex items-center gap-2">
                                    {role.name.toLowerCase().includes('admin') ? (
                                      <Crown className="w-3.5 h-3.5 text-indigo-600" />
                                    ) : role.name.toLowerCase().includes('teacher') || role.name.toLowerCase().includes('instructor') ? (
                                      <Shield className="w-3.5 h-3.5 text-emerald-600" />
                                    ) : (
                                      <User className="w-3.5 h-3.5 text-gray-500" />
                                    )}
                                    <span>{role.name}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-right">
                          <ConfirmationModal
                            confirmationButtonText={t('dashboard.users.active_users.modals.remove_user.button')}
                            confirmationMessage={t('dashboard.users.active_users.modals.remove_user.message')}
                            dialogTitle={t('dashboard.users.active_users.modals.remove_user.title', { username: user.user.username })}
                            dialogTrigger={
                              <button
                                className="inline-flex items-center gap-1.5 h-8 px-3 bg-white text-gray-600 hover:bg-rose-50 hover:text-rose-600 rounded-md text-xs font-medium nice-shadow transition-all"
                                title={t('dashboard.users.active_users.actions.remove_from_org')}
                              >
                                <LogOut className="w-3.5 h-3.5" />
                                <span>{t('dashboard.users.active_users.actions.remove_from_org')}</span>
                              </button>
                            }
                            functionToExecute={() => {
                              handleRemoveUser(user.user.id)
                            }}
                            status="warning"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>

            <Pagination
              page={page}
              totalPages={Math.max(1, Math.ceil(total / ITEMS_PER_PAGE))}
              onPageChange={handlePageChange}
            />
      </AdminDataTable>
      <InviteUsersDialog
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
        onInvited={() => mutateInvitedUsers()}
      />
    </div>
  )
}

export default OrgUsers
