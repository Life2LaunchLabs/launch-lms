'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { CaretRight, ListBullets, Plus, Storefront } from '@phosphor-icons/react'
import FilterBar from '@components/Admin/Filters/FilterBar'
import { useFilters } from '@components/Admin/Filters/useFilters'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { frameworksCoverageKey, requirementsApi, type FrameworkListItem } from '@services/goals/requirements'
import { isOn, matchesSearch, type FilterSpec } from '@/lib/admin/filters'
import { cn } from '@/lib/utils'
import { CreateFramework } from '../insights/RequirementFrameworkEditor'
import { EmptyState, PageLoader } from '../live/ui'
import SourceChip from './SourceChip'

const FILTERS: FilterSpec[] = [
  { key: 'pub', label: 'Published by', options: [{ value: '', label: 'Anyone' }, { value: 'mine', label: 'Your org' }, { value: 'others', label: 'Other publishers' }] },
  { key: 'gaps', label: 'Has gaps', bool: true },
]

// Role ids the API treats as organization admins (admin and maintainer), as in security/org_auth.py.
const ADMIN_ROLE_IDS = new Set([1, 2])

/** Whether the viewer is one of the org's admins, who create and change frameworks (staff only read them). */
function useIsOrgAdmin(orgId: number) {
  const session = useLHSession() as any
  const membership = (session?.data?.roles || []).find((item: any) => Number(item?.org?.id) === orgId)
  return session?.data?.user?.is_superadmin === true || ADMIN_ROLE_IDS.has(Number(membership?.role?.id))
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * Plans › Requirements: the org's requirement frameworks, each with who publishes it and how much of it
 * the org's published templates cover. A row opens the framework's coverage by plan.
 */
export default function FrameworkList({ orgslug, orgId, token }: { orgslug: string; orgId: number; token?: string }) {
  const router = useRouter()
  const filters = useFilters(FILTERS)
  const isAdmin = useIsOrgAdmin(orgId)
  const key = orgId && token ? frameworksCoverageKey(orgId) : null
  const { data, isLoading, error, mutate } = useSWR(key, () => requirementsApi.listWithCoverage(orgId, token), { revalidateOnFocus: false })
  const frameworks = data || []
  const shown = frameworks.filter((item) => {
    if (!matchesSearch(filters.query, item.name, item.description, item.publisher?.name)) return false
    if (filters.values.pub === 'mine' && !item.publisher?.yours) return false
    if (filters.values.pub === 'others' && item.publisher?.yours) return false
    if (isOn(filters.values, 'gaps') && !item.coverage?.gaps) return false
    return true
  })
  const open = (uuid: string, subpage: 'plans' | 'spec' = 'plans') => router.push(getUriWithOrg(orgslug, routePaths.org.admin.requirementFrameworkPlans(uuid, subpage)))
  const actions = <>
    {isAdmin ? <CreateFramework orgId={orgId} token={token} refresh={() => mutate()} onCreated={(uuid: string) => open(uuid, 'spec')} trigger={<button type="button" className="inline-flex h-10 items-center gap-2 rounded-full bg-black px-4 text-sm font-medium text-white hover:bg-black/85"><Plus size={16} weight="bold" aria-hidden="true" />Create framework</button>} /> : null}
    <Link href={getUriWithOrg(orgslug, routePaths.org.admin.marketplace({ type: 'frameworks' }))} className="inline-flex h-10 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:border-gray-300"><Storefront size={16} aria-hidden="true" />Add from marketplace</Link>
  </>
  const hidden = frameworks.length - shown.length
  const summary = data ? <>{plural(shown.length, 'framework')}{hidden ? ` · ${hidden} hidden by filters` : ''} · steps in your templates map to these, so you can see what your plans cover</> : null

  return <div className="px-4 pb-10 pt-6 sm:px-6 lg:px-10"><div className="mx-auto max-w-5xl space-y-4">
    <FilterBar filters={filters} placeholder="Search frameworks" actions={actions} summary={summary} />
    {isLoading && !data ? <PageLoader />
      : error ? <EmptyState icon={<ListBullets size={36} />} title="Requirement frameworks unavailable" detail={error?.message || 'Try again in a moment.'} />
      : !frameworks.length ? <EmptyState icon={<ListBullets size={36} />} title="No requirement frameworks yet" detail="Add a published framework (like your state’s graduation requirements) from the marketplace, or write your own. Steps in your templates map to its requirements." />
      : !shown.length ? <p className="rounded-xl border border-gray-100 bg-white p-6 text-center text-sm text-gray-500 nice-shadow">No frameworks match. <button type="button" onClick={filters.clearAll} className="font-semibold text-violet-700 underline underline-offset-2">Clear filters</button></p>
      : <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-100 bg-white nice-shadow" aria-label="Requirement frameworks">
        {shown.map((item) => <li key={item.framework_uuid}><FrameworkRow item={item} href={getUriWithOrg(orgslug, routePaths.org.admin.requirementFrameworkPlans(item.framework_uuid, 'plans'))} /></li>)}
      </ul>}
  </div></div>
}

function FrameworkRow({ item, href }: { item: FrameworkListItem; href: string }) {
  const coverage = item.coverage
  const total = coverage?.total ?? 0
  return <Link href={href} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 hover:bg-gray-50 sm:flex-nowrap sm:px-5">
    <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700 sm:grid" aria-hidden="true"><ListBullets size={18} /></span>
    <span className="min-w-0 flex-[1_1_220px]">
      <b className="block truncate text-[15px] text-gray-900">{item.name}</b>
      <span className="block text-[13px] text-gray-500">{item.publisher?.name || 'Your org'} · {plural(total, 'requirement')} · version {item.version}{item.status !== 'published' ? ' · draft' : ''}</span>
      <span className="mt-1.5 flex flex-wrap gap-1.5"><SourceChip item={item} /></span>
    </span>
    <span className="flex min-w-0 flex-[1_1_220px] items-center gap-3 sm:max-w-[360px] sm:flex-none">
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[13px] text-gray-700">{coverage ? `${coverage.covered} of ${total} covered by ${plural(coverage.template_count, 'template')}` : 'Coverage unavailable'}</span>
        <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100 sm:w-[240px]" role="img" aria-label={`${coverage?.percent ?? 0}% of requirements covered`}><span className="bg-violet-500" style={{ width: `${coverage?.percent ?? 0}%` }} /></span>
      </span>
      {coverage ? <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold', coverage.gaps ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700')}>{coverage.gaps ? plural(coverage.gaps, 'gap') : 'No gaps'}</span> : null}
      <CaretRight size={16} className="shrink-0 text-gray-400" aria-hidden="true" />
    </span>
  </Link>
}
