'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { Compass, FolderPlus, Hammer, Loader2, Plus, Search } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { primaryActionClass, secondaryActionClass } from '@components/Admin/Plans/PlansActions'
import { useCanEditPlans } from '@components/Admin/Plans/useCanEditPlans'
import { Segmented } from '@components/Goals/admin/live/ui'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { collectionKeys, collectionsApi } from '@services/goals/collections'
import { isTemplatesKey, templateKeys, templatesApi, type TemplateListItem } from '@services/goals/templates'
import { CollectionCard, NewCollectionModal, PlanCard, planHref } from './PlanCards'

type Filter = 'all' | 'live' | 'draft' | 'badge'
const FILTERS: { value: Filter; label: string }[] = [{ value: 'all', label: 'All' }, { value: 'live', label: 'Live' }, { value: 'draft', label: 'Not live' }, { value: 'badge', label: 'Earns a badge' }]

const matches = (plan: TemplateListItem, filter: Filter) => filter === 'all' ? true
  : filter === 'live' ? !!plan.published_version
    : filter === 'draft' ? !plan.published_version
      : !!plan.badges?.length

/**
 * Plans: collections (most recently opened first) as a carousel, then every plan with search and a
 * filter. With no plans yet, a welcome that points at Discover or building one.
 */
export default function PlanLibrary({ orgslug, orgId, token }: { orgslug: string; orgId: number; token?: string }) {
  const canEdit = useCanEditPlans() === true
  const ready = Boolean(orgId && token)
  const { data: plans } = useSWR(ready ? templateKeys.list(orgId) : null, () => templatesApi.list(orgId, token))
  const { data: collectionList } = useSWR(ready ? collectionKeys.list(orgId) : null, () => collectionsApi.list(orgId, token))
  // Other organizations' badge plans this one runs show beside its own.
  const { data: routes } = useSWR(ready ? templateKeys.badgeRoutes(orgId) : null, () => templatesApi.badgeRoutes(orgId, token))
  const [query, setQuery] = React.useState('')
  const [filter, setFilter] = React.useState<Filter>('all')
  const [newCollection, setNewCollection] = React.useState(false)
  if (!plans || !collectionList) return <div className="flex min-h-[320px] items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
  const collections = collectionList.collections
  const runs: TemplateListItem[] = (routes || []).filter((route, index, all) => all.findIndex((other) => other.template.template_uuid === route.template.template_uuid) === index)
    .map((route) => ({ ...route.template, thumbnail_image: route.template.thumbnail_image || '', org_id: route.badge.owner_org?.id ?? 0, status: 'active', system_type: null, etag: '',
      has_unpublished_changes: false, update_date: '', read_only: true, badges: [route.badge] } as TemplateListItem))
  const own = [...plans.filter((plan) => !plan.system_type), ...runs]
  if (!own.length && !collections.length) return <Welcome orgslug={orgslug} orgId={orgId} token={token} canEdit={canEdit} />
  const needle = query.trim().toLowerCase()
  const shown = own.filter((plan) => matches(plan, filter) && (!needle || `${plan.title} ${plan.description}`.toLowerCase().includes(needle)))

  return <div className="mx-auto max-w-6xl space-y-10 px-4 pb-16 pt-6 sm:px-6 lg:px-10">
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
        {canEdit ? <NewPlanModal orgslug={orgslug} orgId={orgId} token={token} /> : null}
      </div>
      {shown.length ? <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((plan) => <li key={plan.template_uuid}><PlanCard orgslug={orgslug} plan={plan} collections={collections} canEdit={canEdit && !plan.read_only} orgId={orgId} token={token} /></li>)}
      </ul> : <p className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">No plans match.</p>}
    </section>
    <NewCollectionModal open={newCollection} setOpen={setNewCollection} orgId={orgId} token={token} />
  </div>
}

/** First visit with no plans: explore what others share, or build one. */
function Welcome({ orgslug, orgId, token, canEdit }: { orgslug: string; orgId: number; token?: string; canEdit: boolean }) {
  const discover = getUriWithOrg(orgslug, routePaths.org.admin.marketplace())
  return <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
    <h1 className="text-4xl font-black tracking-tight">Say hello to Plans</h1>
    <p className="mx-auto mt-3 max-w-xl text-base text-muted-foreground">A plan is a set of steps a learner works through, with a chat feed for each learner and a badge when they finish. Assign it to a group or to one learner.</p>
    <div className="mt-10 grid gap-4 text-left sm:grid-cols-2">
      <Link href={discover} className="rounded-3xl border border-border bg-card p-6 transition hover:shadow-md">
        <Compass size={26} className="text-violet-600" aria-hidden="true" />
        <p className="mt-4 text-lg font-black">Explore Discover</p>
        <p className="mt-1 text-sm text-muted-foreground">Add ready-made plans and collections other organizations share.</p>
      </Link>
      {canEdit ? <NewPlanModal orgslug={orgslug} orgId={orgId} token={token} trigger={<button type="button" className="rounded-3xl border border-border bg-card p-6 text-left transition hover:shadow-md">
        <Hammer size={26} className="text-emerald-600" aria-hidden="true" />
        <p className="mt-4 text-lg font-black">Build your own</p>
        <p className="mt-1 text-sm text-muted-foreground">Start from scratch and add steps one at a time.</p>
      </button>} /> : null}
    </div>
  </div>
}

/** Name a new plan; it opens ready to edit as draft v1.0.0. */
function NewPlanModal({ orgslug, orgId, token, trigger }: { orgslug: string; orgId: number; token?: string; trigger?: React.ReactNode }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const create = async () => {
    setBusy(true)
    try {
      const plan = await templatesApi.create(orgId, { title: title.trim() }, token)
      await mutate(isTemplatesKey)
      setOpen(false)
      router.push(planHref(orgslug, plan.template_uuid))
    } catch (error: any) { toast.error(error?.message || 'Could not create the plan.') } finally { setBusy(false) }
  }
  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="sm" dialogTitle="New plan" dialogDescription="Give it a name. You’ll add steps next."
    dialogTrigger={trigger || <button type="button" className={primaryActionClass}><Plus size={16} aria-hidden="true" />New plan</button>}
    dialogContent={<form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (title.trim() && !busy) void create() }}>
      <Input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Launch Ready" aria-label="Plan name" maxLength={200} />
      <Button type="submit" disabled={busy || !title.trim()} className="ml-auto flex">{busy ? <Loader2 className="animate-spin" /> : null}Create plan</Button>
    </form>} />
}
