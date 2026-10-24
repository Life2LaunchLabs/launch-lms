'use client'

import React from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { Check, Compass, ListFilter, Loader2, Search } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { secondaryActionClass } from '@components/Plans/shared/actions'
import { useCanEditPlans } from '@components/Plans/shared/useCanEditPlans'
import NewPlanModal from '@components/Plans/create/NewPlanModal'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { collectionKeys, collectionsApi, type PlanCollection } from '@services/goals/collections'
import { addedAsListItems, discoverApi, discoverKeys } from '@services/goals/discover'
import { templateKeys, templatesApi, type TemplateListItem } from '@services/goals/templates'
import { CollectionCard, NewCollectionCard, NewCollectionModal, PlanCard, SectionHeader, planGridClass } from './PlanCards'

export type PlanLibraryData = { plans: TemplateListItem[]; collections: PlanCollection[] }

/**
 * Every plan the org has: its own, and other organizations' plans it runs or asked for (from Discover
 * or by the owner's invitation). `null` while loading.
 */
export function usePlanLibrary(orgId: number, token?: string): PlanLibraryData | null {
  const ready = Boolean(orgId && token)
  const { data: plans } = useSWR(ready ? templateKeys.list(orgId) : null, () => templatesApi.list(orgId, token))
  const { data: collectionList } = useSWR(ready ? collectionKeys.list(orgId) : null, () => collectionsApi.list(orgId, token))
  const { data: added } = useSWR(ready ? discoverKeys.added(orgId) : null, () => discoverApi.added(orgId, token).catch(() => []))
  if (!plans || !collectionList) return null
  return { plans: [...plans.filter((plan) => !plan.system_type), ...addedAsListItems(added || [])], collections: collectionList.collections }
}

export function LibraryLoading() {
  return <div className="flex min-h-[320px] items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
}

type Filter = 'all' | 'badge' | 'published' | 'others' | 'requested' | 'draft'
const FILTERS: Array<[Filter, string]> = [['all', 'All plans'], ['badge', 'Earns a badge'], ['published', 'Published'], ['others', 'From other organizations'], ['requested', 'Requested'], ['draft', 'Drafts']]

const matches = (plan: TemplateListItem, filter: Filter, orgId: number) => {
  const live = !!plan.live_version || !!plan.published_version
  return filter === 'all' ? true
    : filter === 'badge' ? !!plan.badge
      : filter === 'published' ? !!plan.listed
        : filter === 'others' ? Number(plan.org_id) !== orgId
          : filter === 'requested' ? !!plan.requested
            : !plan.requested && (!live || !!plan.draft)
}

/** The Plans tab: collections (most recently opened first) in a row, then every plan with search and a filter. */
export default function PlanLibrary({ orgslug, orgId, token, library }: { orgslug: string; orgId: number; token?: string; library: PlanLibraryData }) {
  const canEdit = useCanEditPlans() === true
  const [query, setQuery] = React.useState('')
  const [filter, setFilter] = React.useState<Filter>('all')
  const [newCollection, setNewCollection] = React.useState(false)
  const { plans, collections } = library
  const showCollections = !!collections.length || canEdit
  const needle = query.trim().toLowerCase()
  const shown = plans.filter((plan) => matches(plan, filter, orgId) && (!needle || `${plan.title} ${plan.description}`.toLowerCase().includes(needle)))

  return <div>
    {showCollections ? <section aria-labelledby="collections-title">
      <SectionHeader id="collections-title" title="Collections" count={collections.length} className="mt-0" />
      <div className="-mx-1 flex snap-x snap-proximity gap-3.5 overflow-x-auto px-1 pb-3 pt-1 [scrollbar-width:thin]" data-testid="collections-row">
        {collections.map((collection) => <CollectionCard key={collection.collection_uuid} orgslug={orgslug} collection={collection} />)}
        {canEdit ? <NewCollectionCard onClick={() => setNewCollection(true)} /> : null}
      </div>
    </section> : null}
    <section aria-labelledby="all-plans-title">
      {plans.length ? <>
        <SectionHeader id="all-plans-title" title="All plans" count={plans.length} className={showCollections ? undefined : 'mt-0'}>
          <label className="flex h-9 w-[150px] items-center gap-1.5 rounded-full border border-border bg-card px-3 text-muted-foreground sm:w-[210px]">
            <Search size={16} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search plans" aria-label="Search plans" autoComplete="off"
              className="min-w-0 flex-1 border-0 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground" />
          </label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Filter plans" className="relative grid h-9 w-9 place-items-center rounded-full border border-border bg-card hover:bg-muted">
                <ListFilter size={17} aria-hidden="true" />
                {filter !== 'all' ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full border-2 border-card bg-brand box-content" /> : null}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[232px] rounded-[14px] p-1.5">
              <DropdownMenuLabel className="px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[.06em] text-muted-foreground">Show</DropdownMenuLabel>
              {FILTERS.map(([value, label]) => <DropdownMenuItem key={value} onSelect={() => setFilter(value)} className="font-semibold">
                <span className="flex-1">{label}</span>{filter === value ? <Check size={15} className="text-brand" aria-label="Selected" /> : null}
              </DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </SectionHeader>
        {filter !== 'all' ? <p className="-mt-1.5 mb-3.5 flex items-center gap-2 text-[13px] text-muted-foreground">
          Showing: {FILTERS.find(([value]) => value === filter)?.[1]}
          <button type="button" onClick={() => setFilter('all')} className="font-bold text-foreground underline-offset-2 hover:underline">Clear</button>
        </p> : null}
        {shown.length ? <ul className={planGridClass}>
          {shown.map((plan) => <li key={plan.template_uuid} className="min-w-0"><PlanCard orgslug={orgslug} plan={plan} collections={collections} canEdit={canEdit && (!plan.read_only || plan.requested !== undefined)} orgId={orgId} token={token} /></li>)}
        </ul> : <p className="rounded-[22px] border-[1.5px] border-dashed border-border px-5 py-8 text-center text-muted-foreground">No plans match{needle ? ` “${query.trim()}”` : ''}.</p>}
      </> : <NoPlans orgslug={orgslug} canEdit={canEdit} />}
    </section>
    <NewCollectionModal open={newCollection} setOpen={setNewCollection} orgId={orgId} token={token} />
  </div>
}

/** No plans yet (the org has collections, or the welcome would show instead). */
function NoPlans({ orgslug, canEdit }: { orgslug: string; canEdit: boolean }) {
  return <div className="mt-[30px] flex flex-col items-center gap-2.5 rounded-[22px] border-[1.5px] border-dashed border-border px-6 py-14 text-center">
    <img src="/images/plans/nextstep.webp" alt="" className="w-[170px]" />
    <h2 className="text-[22px] font-bold tracking-tight">No plans yet</h2>
    <p className="max-w-[380px] leading-normal text-muted-foreground">Start one from a blank page or a starter, or add a ready-made plan from Discover.</p>
    <div className="mt-2 flex flex-wrap justify-center gap-2">
      {canEdit ? <NewPlanModal orgslug={orgslug} /> : null}
      <Link href={getUriWithOrg(orgslug, routePaths.org.admin.discover())} className={secondaryActionClass}><Compass size={16} aria-hidden="true" />Browse Discover</Link>
    </div>
  </div>
}
