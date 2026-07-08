'use client'
import React, { useMemo, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { getAPIUrl, getUriWithOrg } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import {
  batchPlatformUserAction,
  createPlatformUser,
} from '@services/platform/platform'
import {
  EmptyState,
  LoadingRows,
  Pagination,
  SortableTh,
  StatusBadge,
  UserAvatar,
  formatDate,
  useDebounced,
  useListParams,
} from './shared'
import {
  Buildings,
  LockSimple,
  Plus,
  SealCheck,
  ShieldStar,
  Trash,
  UsersThree,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog'
import { Checkbox } from '@components/ui/checkbox'
import OrgUsers from '@components/Dashboard/Pages/Users/OrgUsers/OrgUsers'
import AdminDataTable from '@components/Admin/AdminDataTable'

export interface OrgMembership {
  id: number
  name: string
  slug: string
  logo_image?: string | null
  org_uuid: string
  role_id: number
  role_name: string
  role_uuid: string
  since?: string
}

export interface GlobalUser {
  id: number
  user_uuid: string
  username: string
  email: string
  first_name: string | null
  last_name: string | null
  avatar_image: string | null
  is_superadmin: boolean
  email_verified: boolean
  is_locked: boolean
  last_login_at: string | null
  org_count: number
  orgs: OrgMembership[]
  creation_date: string
  update_date: string
}

const PAGE_SIZE = 20

const LIST_DEFAULTS = {
  page: '1',
  sort: 'id',
  search: '',
  superadmin: 'all',
  min_orgs: '0',
}

export function useGlobalRoles(accessToken?: string) {
  const { data } = useSWR(
    accessToken ? `${getAPIUrl()}superadmin/roles` : null,
    (url: string) => swrFetcher(url, accessToken),
    { revalidateOnFocus: false }
  )
  return (data as { id: number; name: string }[] | undefined) || []
}

export function useOrgOptions(accessToken?: string) {
  const { data } = useSWR(
    accessToken ? `${getAPIUrl()}superadmin/organizations?limit=200` : null,
    (url: string) => swrFetcher(url, accessToken),
    { revalidateOnFocus: false }
  )
  return (data?.items as { id: number; name: string; slug: string }[] | undefined) || []
}

export default function UsersTable({
  scope = 'platform',
}: {
  scope?: 'platform' | 'organization'
}) {
  if (scope === 'organization') {
    return <OrgUsers />
  }

  return <PlatformUsersTable />
}

function PlatformUsersTable() {
  const session = useLHSession() as any
  const org = useOrg() as any
  const accessToken = session?.data?.tokens?.access_token
  const sessionUserId = session?.data?.user?.id

  const { get, update } = useListParams(LIST_DEFAULTS)
  const page = Number(get('page')) || 1
  const sort = get('sort')
  const superadminFilter = get('superadmin')
  const minOrgs = get('min_orgs')

  const [search, setSearch] = useState(get('search'))
  const debouncedSearch = useDebounced(search)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [showCreate, setShowCreate] = useState(false)

  const queryParams = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      sort,
    })
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (superadminFilter !== 'all') params.set('superadmin', superadminFilter)
    if (minOrgs !== '0') params.set('min_orgs', minOrgs)
    return params.toString()
  }, [page, sort, debouncedSearch, superadminFilter, minOrgs])

  const { data, isLoading, mutate } = useSWR(
    accessToken ? `${getAPIUrl()}superadmin/users?${queryParams}` : null,
    (url: string) => swrFetcher(url, accessToken),
    { revalidateOnFocus: true, keepPreviousData: true }
  )

  const users: GlobalUser[] = data?.items || []
  const totalCount = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const handleSearch = (value: string) => {
    setSearch(value)
    update({ search: value, page: 1 })
  }
  const handleSort = (value: string) => update({ sort: value, page: 1 })

  const allOnPageSelected =
    users.length > 0 && users.every((u) => selected.has(u.id))

  const toggleAll = () => {
    const next = new Set(selected)
    if (allOnPageSelected) {
      users.forEach((u) => next.delete(u.id))
    } else {
      users.forEach((u) => next.add(u.id))
    }
    setSelected(next)
  }

  const toggleOne = (id: number) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const userHref = (username: string) =>
    getUriWithOrg(org?.slug, `/admin/platform/users/${encodeURIComponent(username)}`)

  return (
    <div>
      <AdminDataTable
        search={{ value: search, onChange: handleSearch, placeholder: 'Search users...' }}
        filters={[
          {
            id: 'role',
            label: 'Role',
            value: superadminFilter,
            options: [
              { value: 'all', label: 'All' },
              { value: 'yes', label: 'Superadmin' },
              { value: 'no', label: 'Regular' },
            ],
            onChange: (value) => update({ superadmin: value, page: 1 }),
          },
          {
            id: 'orgs',
            label: 'Orgs',
            value: minOrgs,
            options: [
              { value: '0', label: 'Any' },
              { value: '1', label: '1+' },
              { value: '2', label: '2+' },
              { value: '3', label: '3+' },
              { value: '5', label: '5+' },
            ],
            onChange: (value) => update({ min_orgs: value, page: 1 }),
          },
        ]}
        resultLabel={`${totalCount} user${totalCount !== 1 ? 's' : ''}`}
        actions={<button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 text-white px-3 py-1.5 text-[13px] font-medium hover:bg-gray-700 transition-colors"
          >
            <Plus size={14} weight="bold" />
            New user
          </button>}
      >
        {isLoading ? (
          <LoadingRows />
        ) : users.length === 0 ? (
          <EmptyState
            icon={<UsersThree size={40} weight="fill" />}
            message="No users found"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="pl-4 pr-1 py-2.5 w-8">
                      <Checkbox
                        checked={allOnPageSelected}
                        onCheckedChange={toggleAll}
                        aria-label="Select all"
                      />
                    </th>
                    <SortableTh
                      label="User"
                      ascKey="username"
                      currentSort={sort}
                      onSort={handleSort}
                    />
                    <SortableTh label="Email" currentSort={sort} onSort={handleSort} />
                    <SortableTh
                      label="Organizations"
                      ascKey="orgs_asc"
                      descKey="orgs_desc"
                      currentSort={sort}
                      onSort={handleSort}
                    />
                    <SortableTh label="Role" currentSort={sort} onSort={handleSort} />
                    <SortableTh
                      label="Created"
                      ascKey="oldest"
                      descKey="newest"
                      currentSort={sort}
                      onSort={handleSort}
                    />
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const fullName = [user.first_name, user.last_name]
                      .filter(Boolean)
                      .join(' ')
                    return (
                      <tr
                        key={user.id}
                        className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors"
                      >
                        <td className="pl-4 pr-1 py-3 w-8">
                          <Checkbox
                            checked={selected.has(user.id)}
                            onCheckedChange={() => toggleOne(user.id)}
                            aria-label={`Select ${user.username}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={userHref(user.username)}
                            className="flex items-center gap-3 group"
                          >
                            <UserAvatar
                              userUuid={user.user_uuid}
                              avatarImage={user.avatar_image}
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 group-hover:underline">
                                {user.username}
                              </p>
                              {fullName && (
                                <p className="text-xs text-gray-400 truncate max-w-[200px]">
                                  {fullName}
                                </p>
                              )}
                            </div>
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600 truncate max-w-[220px]">
                              {user.email}
                            </span>
                            {!user.email_verified && (
                              <StatusBadge tone="amber">
                                <WarningCircle size={11} weight="bold" />
                                Unverified
                              </StatusBadge>
                            )}
                            {user.is_locked && (
                              <StatusBadge tone="red">
                                <LockSimple size={11} weight="bold" />
                                Locked
                              </StatusBadge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {user.orgs.length === 0 ? (
                            <span className="text-xs text-gray-300">None</span>
                          ) : (
                            <div className="flex items-center gap-1.5 flex-wrap max-w-[260px]">
                              {user.orgs.slice(0, 2).map((membership) => (
                                <span
                                  key={membership.id}
                                  className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5"
                                  title={`${membership.name} — ${membership.role_name}`}
                                >
                                  <Buildings size={10} weight="fill" className="text-gray-400" />
                                  {membership.name}
                                </span>
                              ))}
                              {user.orgs.length > 2 && (
                                <span className="text-xs text-gray-400">
                                  +{user.orgs.length - 2}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {user.is_superadmin ? (
                            <StatusBadge tone="amber">
                              <ShieldStar size={11} weight="fill" />
                              Superadmin
                            </StatusBadge>
                          ) : (
                            <span className="text-xs text-gray-400">User</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-400">
                            {formatDate(user.creation_date)}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={(p) => update({ page: p })}
            />
          </>
        )}
      </AdminDataTable>

      {selected.size > 0 && (
        <BatchActionBar
          selected={selected}
          sessionUserId={sessionUserId}
          accessToken={accessToken}
          onClear={() => setSelected(new Set())}
          onDone={() => {
            setSelected(new Set())
            mutate()
          }}
        />
      )}

      {showCreate && (
        <CreateUserModal
          accessToken={accessToken}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            mutate()
          }}
        />
      )}
    </div>
  )
}

// ============================================================================
// Batch action bar
// ============================================================================

function BatchActionBar({
  selected,
  sessionUserId,
  accessToken,
  onClear,
  onDone,
}: {
  selected: Set<number>
  sessionUserId?: number
  accessToken: string
  onClear: () => void
  onDone: () => void
}) {
  const [orgModal, setOrgModal] = useState<'add' | 'remove' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  const runAction = async (
    action: 'verify_email' | 'delete',
    extra?: Record<string, any>
  ) => {
    setBusy(true)
    const res = await batchPlatformUserAction(
      { user_ids: Array.from(selected), action, ...extra },
      accessToken
    )
    setBusy(false)
    if (res.status === 200) {
      const { succeeded, failed, results } = res.data
      if (failed > 0) {
        const firstError = results.find((r: any) => !r.success)?.error
        toast.error(`${succeeded} succeeded, ${failed} failed${firstError ? ` — ${firstError}` : ''}`)
      } else {
        toast.success(`${succeeded} user${succeeded !== 1 ? 's' : ''} updated`)
      }
      onDone()
    } else {
      toast.error(res.data?.detail || 'Batch action failed')
    }
  }

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-gray-900 text-white rounded-xl shadow-2xl px-4 py-2.5 flex items-center gap-2">
        <span className="text-sm font-medium pr-2 border-r border-white/20">
          {selected.size} selected
        </span>
        <button
          onClick={() => setOrgModal('add')}
          disabled={busy}
          className="text-[13px] px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-40"
        >
          Add to org
        </button>
        <button
          onClick={() => setOrgModal('remove')}
          disabled={busy}
          className="text-[13px] px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-40"
        >
          Remove from org
        </button>
        <button
          onClick={() => runAction('verify_email')}
          disabled={busy}
          className="text-[13px] px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-40 inline-flex items-center gap-1.5"
        >
          <SealCheck size={13} weight="fill" />
          Verify email
        </button>
        <button
          onClick={() => setConfirmDelete(true)}
          disabled={busy}
          className="text-[13px] px-2.5 py-1.5 rounded-lg text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-40 inline-flex items-center gap-1.5"
        >
          <Trash size={13} weight="bold" />
          Delete
        </button>
        <button
          onClick={onClear}
          className="ml-1 p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          aria-label="Clear selection"
        >
          <X size={14} weight="bold" />
        </button>
      </div>

      {orgModal && (
        <OrgActionModal
          mode={orgModal}
          count={selected.size}
          accessToken={accessToken}
          onClose={() => setOrgModal(null)}
          onSubmit={async (orgId, roleId) => {
            setOrgModal(null)
            setBusy(true)
            const res = await batchPlatformUserAction(
              {
                user_ids: Array.from(selected),
                action: orgModal === 'add' ? 'add_to_org' : 'remove_from_org',
                org_id: orgId,
                role_id: roleId,
              },
              accessToken
            )
            setBusy(false)
            if (res.status === 200) {
              const { succeeded, failed, results } = res.data
              if (failed > 0) {
                const firstError = results.find((r: any) => !r.success)?.error
                toast.error(`${succeeded} succeeded, ${failed} failed${firstError ? ` — ${firstError}` : ''}`)
              } else {
                toast.success(`${succeeded} user${succeeded !== 1 ? 's' : ''} updated`)
              }
              onDone()
            } else {
              toast.error(res.data?.detail || 'Batch action failed')
            }
          }}
        />
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selected.size} user{selected.size !== 1 ? 's' : ''}?</DialogTitle>
            <DialogDescription>
              This permanently deletes the selected accounts and all their data.
              {sessionUserId && selected.has(sessionUserId)
                ? ' Your own account is included in the selection and will be skipped.'
                : ''}{' '}
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setConfirmDelete(false)
                runAction('delete')
              }}
              className="rounded-lg bg-red-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-red-500"
            >
              Delete users
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function OrgActionModal({
  mode,
  count,
  accessToken,
  onClose,
  onSubmit,
}: {
  mode: 'add' | 'remove'
  count: number
  accessToken: string
  onClose: () => void
  onSubmit: (orgId: number, roleId?: number) => void
}) {
  const orgs = useOrgOptions(accessToken)
  const roles = useGlobalRoles(accessToken)
  const [orgId, setOrgId] = useState<string>('')
  const [roleId, setRoleId] = useState<string>('4')

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === 'add' ? 'Add' : 'Remove'} {count} user{count !== 1 ? 's' : ''}{' '}
            {mode === 'add' ? 'to' : 'from'} organization
          </DialogTitle>
          {mode === 'add' && (
            <DialogDescription>
              Users already in the organization will have their role updated.
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-sm text-gray-600">
            Organization
            <select
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              className="mt-1 w-full bg-white border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-gray-400"
            >
              <option value="">Select an organization...</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.slug})
                </option>
              ))}
            </select>
          </label>
          {mode === 'add' && (
            <label className="block text-sm text-gray-600">
              Role
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className="mt-1 w-full bg-white border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-gray-400"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <DialogFooter>
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            disabled={!orgId}
            onClick={() =>
              onSubmit(Number(orgId), mode === 'add' ? Number(roleId) : undefined)
            }
            className="rounded-lg bg-gray-900 text-white px-3 py-1.5 text-sm font-medium hover:bg-gray-700 disabled:opacity-40"
          >
            {mode === 'add' ? 'Add users' : 'Remove users'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Create user modal
// ============================================================================

function CreateUserModal({
  accessToken,
  onClose,
  onCreated,
}: {
  accessToken: string
  onClose: () => void
  onCreated: () => void
}) {
  const orgs = useOrgOptions(accessToken)
  const roles = useGlobalRoles(accessToken)
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    org_id: '',
    role_id: '4',
  })
  const [busy, setBusy] = useState(false)

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async () => {
    setBusy(true)
    const res = await createPlatformUser(
      {
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        org_id: form.org_id ? Number(form.org_id) : null,
        role_id: form.org_id ? Number(form.role_id) : null,
      },
      accessToken
    )
    setBusy(false)
    if (res.status === 201 || res.status === 200) {
      toast.success(`User ${form.username} created`)
      onCreated()
    } else {
      const detail = res.data?.detail
      toast.error(
        typeof detail === 'string' ? detail : detail?.message || 'Failed to create user'
      )
    }
  }

  const inputClass =
    'mt-1 w-full bg-white border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-gray-400'

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>
            The account is created with a verified email. Share the password with the
            user directly — they can change it after logging in.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm text-gray-600">
              Username *
              <input value={form.username} onChange={set('username')} className={inputClass} />
            </label>
            <label className="block text-sm text-gray-600">
              Email *
              <input type="email" value={form.email} onChange={set('email')} className={inputClass} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm text-gray-600">
              First name
              <input value={form.first_name} onChange={set('first_name')} className={inputClass} />
            </label>
            <label className="block text-sm text-gray-600">
              Last name
              <input value={form.last_name} onChange={set('last_name')} className={inputClass} />
            </label>
          </div>
          <label className="block text-sm text-gray-600">
            Password *
            <input
              type="text"
              value={form.password}
              onChange={set('password')}
              className={`${inputClass} font-mono`}
              placeholder="Min 8 chars, upper/lower/number/special"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm text-gray-600">
              Organization
              <select value={form.org_id} onChange={set('org_id')} className={inputClass}>
                <option value="">None</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-gray-600">
              Role
              <select
                value={form.role_id}
                onChange={set('role_id')}
                disabled={!form.org_id}
                className={`${inputClass} disabled:opacity-40`}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            disabled={busy || !form.username || !form.email || !form.password}
            onClick={submit}
            className="rounded-lg bg-gray-900 text-white px-3 py-1.5 text-sm font-medium hover:bg-gray-700 disabled:opacity-40"
          >
            {busy ? 'Creating...' : 'Create user'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
