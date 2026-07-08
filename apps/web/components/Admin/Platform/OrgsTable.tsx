'use client'
import React, { useMemo, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { getAPIUrl, getUriWithOrg } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { createPlatformOrg } from '@services/platform/platform'
import {
  EmptyState,
  FilterSelect,
  LoadingRows,
  OrgLogo,
  Pagination,
  PlanBadge,
  SearchInput,
  SortableTh,
  useDebounced,
  useListParams,
  formatDate,
} from './shared'
import { Buildings, Plus } from '@phosphor-icons/react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog'

const PAGE_SIZE = 20

const LIST_DEFAULTS = {
  page: '1',
  sort: 'id',
  search: '',
  plan: 'all',
}

const PLAN_OPTIONS = [
  { value: 'all', label: 'All plans' },
  { value: 'free', label: 'Free' },
  { value: 'full', label: 'Full' },
  { value: 'enterprise', label: 'Enterprise' },
]

interface OrgRow {
  id: number
  org_uuid: string
  name: string
  slug: string
  email: string
  logo_image?: string | null
  plan: string
  user_count: number
  badge_count: number
  course_count: number
  pending_request_count: number
  custom_domains: string[]
  admin_users: { username: string }[]
  creation_date: string
  update_date: string
}

interface VisitRow {
  org_id: number
  date: string
  views: number
}

function Sparkline({ values, max }: { values: number[]; max: number }) {
  if (!values || values.every((v) => v === 0)) {
    return <span className="text-xs text-gray-300">—</span>
  }
  const localMax = Math.max(max, 1)
  return (
    <div className="flex items-end gap-[2px] h-5" title={`${values.reduce((a, b) => a + b, 0)} views this week`}>
      {values.map((v, i) => (
        <div
          key={i}
          className="w-[5px] rounded-sm bg-blue-400/70"
          style={{ height: `${Math.max(8, (v / localMax) * 100)}%`, opacity: v === 0 ? 0.2 : 1 }}
        />
      ))}
    </div>
  )
}

export default function OrgsTable() {
  const session = useLHSession() as any
  const org = useOrg() as any
  const accessToken = session?.data?.tokens?.access_token

  const { get, update } = useListParams(LIST_DEFAULTS)
  const page = Number(get('page')) || 1
  const sort = get('sort')
  const planFilter = get('plan')

  const [search, setSearch] = useState(get('search'))
  const debouncedSearch = useDebounced(search)
  const [showCreate, setShowCreate] = useState(false)

  const queryParams = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      sort,
    })
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (planFilter !== 'all') params.set('plan', planFilter)
    return params.toString()
  }, [page, sort, debouncedSearch, planFilter])

  const { data, isLoading, mutate } = useSWR(
    accessToken ? `${getAPIUrl()}superadmin/organizations?${queryParams}` : null,
    (url: string) => swrFetcher(url, accessToken),
    { revalidateOnFocus: true, keepPreviousData: true }
  )

  const { data: visitsData } = useSWR<{ data: VisitRow[] }>(
    accessToken ? `${getAPIUrl()}superadmin/organizations/visits` : null,
    (url: string) => swrFetcher(url, accessToken),
    { revalidateOnFocus: false }
  )

  const visitsByOrg = useMemo(() => {
    const map: Record<number, number[]> = {}
    let globalMax = 0
    if (!visitsData?.data) return { map, globalMax }

    const raw: Record<number, Record<string, number>> = {}
    for (const row of visitsData.data) {
      if (!raw[row.org_id]) raw[row.org_id] = {}
      raw[row.org_id][row.date] = row.views
    }
    const today = new Date()
    const dates: string[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      dates.push(d.toISOString().slice(0, 10))
    }
    for (const [orgIdStr, dateMap] of Object.entries(raw)) {
      const orgId = Number(orgIdStr)
      map[orgId] = dates.map((d) => dateMap[d] || 0)
      const mx = Math.max(...map[orgId])
      if (mx > globalMax) globalMax = mx
    }
    return { map, globalMax }
  }, [visitsData])

  const orgs: OrgRow[] = data?.items || []
  const totalCount = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const orgHref = (id: number) => getUriWithOrg(org?.slug, `/admin/platform/orgs/${id}`)

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value)
              update({ search: value, page: 1 })
            }}
            placeholder="Search organizations..."
          />
          <FilterSelect
            label="Plan"
            value={planFilter}
            options={PLAN_OPTIONS}
            onChange={(value) => update({ plan: value, page: 1 })}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            {totalCount} org{totalCount !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 text-white px-3 py-1.5 text-[13px] font-medium hover:bg-gray-700 transition-colors"
          >
            <Plus size={14} weight="bold" />
            New organization
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-100 rounded-xl nice-shadow overflow-hidden">
        {isLoading ? (
          <LoadingRows />
        ) : orgs.length === 0 ? (
          <EmptyState
            icon={<Buildings size={40} weight="fill" />}
            message="No organizations found"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <SortableTh label="Organization" currentSort={sort} onSort={(s) => update({ sort: s, page: 1 })} />
                    <SortableTh label="Plan" currentSort={sort} onSort={() => {}} />
                    <SortableTh
                      label="Users"
                      ascKey="users_asc"
                      descKey="users_desc"
                      currentSort={sort}
                      onSort={(s) => update({ sort: s, page: 1 })}
                    />
                    <SortableTh
                      label="Badges"
                      descKey="badges_desc"
                      currentSort={sort}
                      onSort={(s) => update({ sort: s, page: 1 })}
                    />
                    <SortableTh label="7d visits" currentSort={sort} onSort={() => {}} />
                    <SortableTh label="Requests" currentSort={sort} onSort={() => {}} />
                    <SortableTh
                      label="Created"
                      ascKey="oldest"
                      descKey="newest"
                      currentSort={sort}
                      onSort={(s) => update({ sort: s, page: 1 })}
                    />
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Link href={orgHref(row.id)} className="flex items-center gap-3 group">
                          <OrgLogo orgUuid={row.org_uuid} logoImage={row.logo_image} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 group-hover:underline truncate">
                              {row.name}
                            </p>
                            <p className="text-xs text-gray-400 font-mono truncate">
                              {row.slug}
                              {row.custom_domains.length > 0 && (
                                <span className="ml-2 text-emerald-600">
                                  {row.custom_domains[0]}
                                  {row.custom_domains.length > 1 &&
                                    ` +${row.custom_domains.length - 1}`}
                                </span>
                              )}
                            </p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <PlanBadge plan={row.plan} />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{row.user_count}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{row.badge_count ?? row.course_count}</td>
                      <td className="px-4 py-3">
                        <Sparkline
                          values={visitsByOrg.map[row.id]}
                          max={visitsByOrg.globalMax}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {row.pending_request_count > 0 ? (
                          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                            {row.pending_request_count}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-400">
                          {formatDate(row.creation_date)}
                        </span>
                      </td>
                    </tr>
                  ))}
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
      </div>

      {showCreate && (
        <CreateOrgModal
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
// Create org modal
// ============================================================================

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function CreateOrgModal({
  accessToken,
  onClose,
  onCreated,
}: {
  accessToken: string
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState({ name: '', slug: '', email: '', description: '' })
  const [slugTouched, setSlugTouched] = useState(false)
  const [busy, setBusy] = useState(false)

  const inputClass =
    'mt-1 w-full bg-white border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-gray-400'

  const submit = async () => {
    setBusy(true)
    const res = await createPlatformOrg(
      {
        name: form.name.trim(),
        slug: slugify(form.slug || form.name),
        email: form.email.trim(),
        description: form.description.trim(),
      },
      accessToken
    )
    setBusy(false)
    if (res.status === 201 || res.status === 200) {
      toast.success(`Organization ${form.name} created`)
      onCreated()
    } else {
      toast.error(res.data?.detail || 'Failed to create organization')
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create organization</DialogTitle>
          <DialogDescription>
            You are added as an org admin automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm text-gray-600">
              Name *
              <input
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    name: e.target.value,
                    slug: slugTouched ? f.slug : slugify(e.target.value),
                  }))
                }
                placeholder="Acme Academy"
                className={inputClass}
              />
            </label>
            <label className="block text-sm text-gray-600">
              Slug *
              <input
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true)
                  setForm((f) => ({ ...f, slug: slugify(e.target.value) }))
                }}
                placeholder="acme-academy"
                className={`${inputClass} font-mono`}
              />
            </label>
          </div>
          <label className="block text-sm text-gray-600">
            Contact email *
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="team@acme.dev"
              className={inputClass}
            />
          </label>
          <label className="block text-sm text-gray-600">
            Description
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Short internal note for this org"
              className={inputClass}
            />
          </label>
        </div>
        <DialogFooter>
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            disabled={busy || !form.name || !form.email}
            onClick={submit}
            className="rounded-lg bg-gray-900 text-white px-3 py-1.5 text-sm font-medium hover:bg-gray-700 disabled:opacity-40"
          >
            {busy ? 'Creating...' : 'Create organization'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
