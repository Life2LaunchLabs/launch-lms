'use client'

import React from 'react'
import useSWR from 'swr'
import { FolderPlus, Loader2, Search } from 'lucide-react'
import { Input } from '@components/ui/input'
import { secondaryActionClass } from '@components/Plans/shared/actions'
import { useCanEditPlans } from '@components/Plans/shared/useCanEditPlans'
import { Segmented } from '@components/Goals/admin/live/ui'
import { collectionKeys, collectionsApi, type PlanCollection } from '@services/goals/collections'
import { addedAsListItems, discoverApi, discoverKeys } from '@services/goals/discover'
import { templateKeys, templatesApi, type TemplateListItem } from '@services/goals/templates'
import { CollectionCard, NewCollectionModal, PlanCard } from './PlanCards'

type Filter = 'all' | 'live' | 'draft' | 'badge'
const FILTERS: { value: Filter; label: string }[] = [{ value: 'all', label: 'All' }, { value: 'live', label: 'Live' }, { value: 'draft', label: 'Not live' }, { value: 'badge', label: 'Earns a badge' }]

const matches = (plan: TemplateListItem, filter: Filter) => filter === 'all' ? true
  : filter === 'live' ? !!plan.published_version && !plan.requested
    : filter === 'draft' ? !plan.published_version || !!plan.requested
      : !!plan.badges?.length

export type PlanLibraryData = { plans: TemplateListItem[]; collections: PlanCollection[] }

/**
 * Every plan the org has: its own, other organizations' badge plans it runs, and plans added (or
 * requested) from Discover. `null` while loading.
 */
export function usePlanLibrary(orgId: number, token?: string): PlanLibraryData | null {
  const ready = Boolean(orgId && token)
  const { data: plans } = useSWR(ready ? templateKeys.list(orgId) : null, () => templatesApi.list(orgId, token))
  const { data: collectionList } = useSWR(ready ? collectionKeys.list(orgId) : null, () => collectionsApi.list(orgId, token))
  const { data: routes } = useSWR(ready ? templateKeys.badgeRoutes(orgId) : null, () => templatesApi.badgeRoutes(orgId, token))
  const { data: added } = useSWR(ready ? discoverKeys.added(orgId) : null, () => discoverApi.added(orgId, token).catch(() => []))
  if (!plans || !collectionList) return null
  const runs: TemplateListItem[] = (routes || []).filter((route, index, all) => all.findIndex((other) => other.template.template_uuid === route.template.template_uuid) === index)
    .map((route) => ({ ...route.template, thumbnail_image: route.template.thumbnail_image || '', org_id: route.badge.owner_org?.id ?? 0, status: 'active', system_type: null, etag: '',
      has_unpublished_changes: false, update_date: '', read_only: true, badges: [route.badge] } as TemplateListItem))
  const fromOthers = addedAsListItems(added || []).filter((plan) => !runs.some((run) => run.template_uuid === plan.template_uuid))
  return { plans: [...plans.filter((plan) => !plan.system_type), ...runs, ...fromOthers], collections: collectionList.collections }
}

export function LibraryLoading() {
  return <div className="flex min-h-[320px] items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
}

/** The Plans tab: collections (most recently opened first) as a carousel, then every plan with search and a filter. */
export default function PlanLibrary({ orgslug, orgId, token, library }: { orgslug: string; orgId: number; token?: string; library: PlanLibraryData }) {
  const canEdit = useCanEditPlans() === true
  const [query, setQuery] = React.useState('')
  const [filter, setFilter] = React.useState<Filter>('all')
  const [newCollection, setNewCollection] = React.useState(false)
  const { plans: own, collections } = library
  const needle = query.trim().toLowerCase()
  const shown = own.filter((plan) => matches(plan, filter) && (!needle || `${plan.title} ${plan.description}`.toLowerCase().includes(needle)))

  return <div className="space-y-10">
    <section aria-labelledby="collections-title">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="collections-title" className="text-xl font-black">Collections</h2>
        {canEdit ? <button type="button" onClick={() => setNewCollection(true)} className={secondaryActionClass}><FolderPlus size={16} />New collection</button> : null}
      </div>
      {collections.length ? <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:mx-0 sm:px-0">
        {collections.map((collection) => <CollectionCard key={collection.collection_uuid} orgslug={orgslug} collection={collection} />)}
      </div> : <p className="rounded-2xl border border-dashed border-border px-5 py-6 text-sm text-muted-foreground">Group plans into collections: a term, a program, a pathway. A plan can be in as many as you like.</p>}
    </section>
    <section aria-labelledby="all-plans-title">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 id="all-plans-title" className="mr-auto text-xl font-black">All plans</h2>
        <label className="relative"><span className="sr-only">Search plans</span>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search plans" className="h-10 w-48 rounded-full pl-9 sm:w-60" />
        </label>
        <Segmented label="Filter plans" value={filter} options={FILTERS} onChange={setFilter} />
      </div>
      {shown.length ? <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((plan) => <li key={plan.template_uuid}><PlanCard orgslug={orgslug} plan={plan} collections={collections} canEdit={canEdit && (!plan.read_only || plan.requested !== undefined)} orgId={orgId} token={token} /></li>)}
      </ul> : <p className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">No plans match.</p>}
    </section>
    <NewCollectionModal open={newCollection} setOpen={setNewCollection} orgId={orgId} token={token} />
  </div>
}
