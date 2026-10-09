import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getAPIUrl } from '@services/config/config'
import { linkUsersToUserGroup, unlinkUsersFromUserGroup } from '@services/usergroups/usergroups'
import { swrFetcher } from '@services/utils/ts/requests'
import LaunchLMSSpinner from '@components/Objects/Loaders/LaunchLMSSpinner'
import { Search, Check, Plus, Minus, ChevronLeft, ChevronRight, Users, ArrowLeft } from 'lucide-react'
import React, { useState, useMemo, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import useSWR, { mutate } from 'swr'
import { useTranslation } from 'react-i18next'
import { Checkbox } from '@components/ui/checkbox'
import { Badge } from '@components/ui/badge'
import UserAvatar from '@components/Objects/UserAvatar'

const ITEMS_PER_PAGE = 20

type ManageUsersProps = {
  usergroup_id: any
  embedded?: boolean
}

function ManageUsers(props: ManageUsersProps) {
  const { t } = useTranslation()
  const org = useOrg() as any
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token

  const [searchValue, setSearchValue] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showAddUsers, setShowAddUsers] = useState(false)
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set())
  const [page, setPage] = useState(1)

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchValue)
      setPage(1) // Reset to first page on search
    }, 300)
    return () => clearTimeout(timer)
  }, [searchValue])

  // Build query for paginated org users with server-side usergroup filtering
  const buildQuery = useCallback(() => {
    const params = new URLSearchParams()
    params.append('page', page.toString())
    params.append('limit', ITEMS_PER_PAGE.toString())
    if (debouncedSearch) {
      params.append('search', debouncedSearch)
    }
    // Always pass usergroup_id so we get in_group_total in the response
    if (props.usergroup_id) {
      params.append('usergroup_id', props.usergroup_id.toString())
    }
    params.append('usergroup_filter', showAddUsers ? 'not_in_group' : 'in_group')
    return params.toString()
  }, [page, debouncedSearch, showAddUsers, props.usergroup_id])

  const usersUrl = org && access_token ? `${getAPIUrl()}orgs/${org?.id}/users?${buildQuery()}` : null
  const { data: usersData, isValidating } = useSWR(
    usersUrl,
    (url) => swrFetcher(url, access_token),
    { keepPreviousData: true }
  )

  const orgUsers = useMemo(() => usersData?.items || [], [usersData?.items])
  const total = usersData?.total || 0
  const isInitialLoading = !usersData && isValidating
  const isPageTransitioning = !!usersData && isValidating

  // Determine if a user is in the group from the user's usergroups data
  const isUserPartOfGroup = useCallback((user: any) => {
    if (!user.usergroups) return false
    return user.usergroups.some((ug: any) => ug.id === props.usergroup_id)
  }, [props.usergroup_id])

  // Handle selection
  const toggleUserSelection = (userId: number) => {
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

  const selectAllVisible = () => {
    const visibleIds = orgUsers.map((user: any) => user.user.id)
    setSelectedUserIds((prev) => {
      const next = new Set(prev)
      visibleIds.forEach((id: number) => next.add(id))
      return next
    })
  }

  const clearSelection = () => {
    setSelectedUserIds(new Set())
  }

  const isAllVisibleSelected = useMemo(() => {
    if (orgUsers.length === 0) return false
    return orgUsers.every((user: any) => selectedUserIds.has(user.user.id))
  }, [orgUsers, selectedUserIds])

  // Get selected users that are in/not in group (from currently visible users)
  const selectedIds = Array.from(selectedUserIds)

  // Revalidate all tabs' SWR cache after mutations
  const invalidateCache = () => {
    const baseUrl = `${getAPIUrl()}orgs/${org?.id}/users`
    mutate((key: string) => typeof key === 'string' && key.startsWith(baseUrl))
  }

  // Bulk actions
  const handleBulkAdd = async () => {
    if (selectedIds.length === 0) return
    const toastId = toast.loading(t('dashboard.users.usergroups.modals.manage_users.toasts.bulk_adding'))
    try {
      const res = await linkUsersToUserGroup(props.usergroup_id, selectedIds, org.id, access_token)
      if (res.status === 200) {
        toast.success(
          t('dashboard.users.usergroups.modals.manage_users.toasts.bulk_add_success', { count: selectedIds.length }),
          { id: toastId }
        )
        invalidateCache()
        clearSelection()
      } else {
        toast.error(t('dashboard.users.usergroups.modals.manage_users.toasts.error', { status: res.status, detail: res.data.detail }), { id: toastId })
      }
    } catch {
      toast.error(t('dashboard.users.usergroups.modals.manage_users.toasts.bulk_error'), { id: toastId })
    }
  }

  const handleBulkRemove = async () => {
    if (selectedIds.length === 0) return
    const toastId = toast.loading(t('dashboard.users.usergroups.modals.manage_users.toasts.bulk_removing'))
    try {
      const res = await unlinkUsersFromUserGroup(props.usergroup_id, selectedIds, org.id, access_token)
      if (res.status === 200) {
        toast.success(
          t('dashboard.users.usergroups.modals.manage_users.toasts.bulk_remove_success', { count: selectedIds.length }),
          { id: toastId }
        )
        invalidateCache()
        clearSelection()
      } else {
        toast.error(t('dashboard.users.usergroups.modals.manage_users.toasts.error', { status: res.status, detail: res.data.detail }), { id: toastId })
      }
    } catch {
      toast.error(t('dashboard.users.usergroups.modals.manage_users.toasts.bulk_error'), { id: toastId })
    }
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    setSelectedUserIds(new Set()) // Clear selection on page change
  }

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE)

  return (
    <div className="space-y-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">{showAddUsers ? 'Add users' : 'Group users'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{showAddUsers ? 'Search organization users who are not yet in this group.' : `${total} user${total === 1 ? '' : 's'} in this group.`}</p>
        </div>
        <button
          onClick={() => { setShowAddUsers((current) => !current); setSearchValue(''); setDebouncedSearch(''); setPage(1); clearSelection() }}
          className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2.5 text-xs font-bold text-white"
        >
          {showAddUsers ? <ArrowLeft className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showAddUsers ? 'Back to group users' : 'Add users'}
        </button>
      </div>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          placeholder={t('dashboard.users.usergroups.modals.manage_users.search_placeholder')}
          className="pl-10 pr-4 py-2 w-full border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
        />
      </div>

      {/* Selection Bar */}
      {selectedUserIds.size > 0 && (
        <div className="flex items-center justify-between bg-indigo-50 px-4 py-2 rounded-lg">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-indigo-700">
              {t('dashboard.users.usergroups.modals.manage_users.selection.count', { count: selectedUserIds.size })}
            </span>
            <button
              onClick={clearSelection}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              {t('dashboard.users.usergroups.modals.manage_users.selection.clear')}
            </button>
          </div>
          <div className="flex items-center gap-2">
            {showAddUsers && (
              <button
                onClick={handleBulkAdd}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 text-white text-sm font-medium rounded-md hover:bg-cyan-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t('dashboard.users.usergroups.modals.manage_users.selection.add_selected', { count: selectedIds.length })}
              </button>
            )}
            {!showAddUsers && (
              <button
                onClick={handleBulkRemove}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-600 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors"
              >
                <Minus className="w-4 h-4" />
                {t('dashboard.users.usergroups.modals.manage_users.selection.remove_selected', { count: selectedIds.length })}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Select All Checkbox */}
      {orgUsers.length > 0 && (
        <div className="flex items-center gap-2 px-2">
          <Checkbox
            id="select-all"
            checked={isAllVisibleSelected}
            onCheckedChange={(checked) => {
              if (checked) {
                selectAllVisible()
              } else {
                clearSelection()
              }
            }}
          />
          <label htmlFor="select-all" className="text-sm text-muted-foreground cursor-pointer">
            {t('dashboard.users.usergroups.modals.manage_users.selection.select_all_visible')}
          </label>
        </div>
      )}

      {/* Users List */}
      <div className={`space-y-1 overflow-y-auto relative ${props.embedded ? '' : 'max-h-[400px]'}`}>
        {isInitialLoading ? (
          <div className="py-16 flex justify-center">
            <LaunchLMSSpinner size={32} />
          </div>
        ) : orgUsers.length === 0 ? (
          <div className="py-12 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="bg-muted p-4 rounded-full">
                <Users className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm font-medium">
                {debouncedSearch
                  ? t('dashboard.users.usergroups.modals.manage_users.no_results')
                  : showAddUsers
                    ? 'Everyone in this organization is already in the group.'
                    : 'There are no users in this group yet.'
                }
              </p>
            </div>
          </div>
        ) : (
          <>
          {isPageTransitioning && (
            <div className="absolute inset-0 bg-white/60 z-10 flex items-center justify-center rounded-lg">
              <LaunchLMSSpinner size={24} />
            </div>
          )}
          {orgUsers.map((user: any) => {
            const inGroup = isUserPartOfGroup(user)
            const isSelected = selectedUserIds.has(user.user.id)
            return (
              <div
                key={user.user.id}
                className={`group flex items-center justify-between p-3 hover:bg-muted rounded-lg transition-all duration-200 ${isSelected ? 'bg-indigo-50/50' : ''}`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleUserSelection(user.user.id)}
                  />
                  <UserAvatar
                    width={36}
                    userId={user.user.id?.toString()}
                    rounded="rounded-full"
                    showProfilePopup={false}
                  />
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground text-sm truncate">
                        {user.user.first_name + ' ' + user.user.last_name}
                      </span>
                      <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground font-medium">
                        @{user.user.username}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="ml-4">
                  {inGroup ? (
                    <Badge variant="default" className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">
                      <Check className="w-3 h-3 mr-1" />
                      {t('dashboard.users.usergroups.modals.manage_users.status.in_group')}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-muted text-muted-foreground">
                      {t('dashboard.users.usergroups.modals.manage_users.status.not_in_group')}
                    </Badge>
                  )}
                </div>
              </div>
            )
          })}
          </>
        )}
      </div>

      {/* Pagination */}
      {total > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-between px-2 pt-3 border-t border-border">
          <div className="text-xs text-muted-foreground font-medium">
            {t('dashboard.users.usergroups.modals.manage_users.pagination.showing', {
              start: (page - 1) * ITEMS_PER_PAGE + 1,
              end: Math.min(page * ITEMS_PER_PAGE, total),
              total
            })}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 1}
              className="p-1.5 rounded-md border border-border bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            </button>
            <span className="text-xs text-muted-foreground font-medium min-w-[60px] text-center">
              {t('dashboard.users.usergroups.modals.manage_users.pagination.page', { current: page, total: totalPages })}
            </span>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages}
              className="p-1.5 rounded-md border border-border bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ManageUsers
