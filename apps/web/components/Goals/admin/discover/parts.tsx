'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { ArrowRight, Award, Clock, Loader2, Lock, Plus, Star } from 'lucide-react'
import { Button } from '@components/ui/button'
import { useCanEditPlans } from '@components/Admin/Plans/useCanEditPlans'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { isCollectionsKey } from '@services/goals/collections'
import { discoverApi, isDiscoverKey, type DiscoverCollection, type DiscoverPlan } from '@services/goals/discover'
import { isTemplatesKey } from '@services/goals/templates'
import { cn } from '@/lib/utils'
import { PlanThumb, collectionHref, planHref } from '../plan/PlanCards'
import { plural } from '../plan/planVersions'

export const discoverPlanHref = (orgslug: string, uuid: string) => getUriWithOrg(orgslug, routePaths.org.admin.discoverPlan(uuid))
export const discoverCollectionHref = (orgslug: string, uuid: string) => getUriWithOrg(orgslug, routePaths.org.admin.discoverCollection(uuid))
export const discoverHref = (orgslug: string) => getUriWithOrg(orgslug, routePaths.org.admin.marketplace())

/** The organization, its token, and whether this person may add plans. */
export function useDiscoverContext() {
  const org = useOrg() as { id?: number; slug?: string } | null
  const session = useLHSession() as { data?: { tokens?: { access_token?: string } } }
  const token = session?.data?.tokens?.access_token
  const orgId = Number(org?.id)
  return { orgId, token, ready: Boolean(orgId && token), canAdd: useCanEditPlans() === true }
}

export const refreshDiscover = () => Promise.all([mutate(isDiscoverKey), mutate(isTemplatesKey), mutate(isCollectionsKey)])

/** "By <org>", with a star for partners. */
export function ByLine({ org, partner }: { org: DiscoverPlan['creator_org']; partner?: boolean }) {
  return <span className="inline-flex min-w-0 items-center gap-1.5 text-sm font-bold">
    By {org?.name || 'another organization'}
    {partner ? <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-700"><Star size={11} aria-hidden="true" />Partner</span> : null}
  </span>
}

/** A plan in Discover: square image, title, who made it, steps, badge and lock. */
export function DiscoverPlanCard({ orgslug, plan, className }: { orgslug: string; plan: DiscoverPlan; className?: string }) {
  return <Link href={discoverPlanHref(orgslug, plan.template_uuid)} className={cn('block rounded-2xl border border-border bg-card p-2 transition hover:shadow-md', className)} data-testid="discover-plan-card">
    <span className="relative block">
      <PlanThumb title={plan.title} image={plan.thumbnail_image} className="aspect-square w-full rounded-xl" />
      {plan.status === 'added' || plan.status === 'own' ? <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-bold text-emerald-700">{plan.status === 'own' ? 'Yours' : 'Added'}</span>
        : plan.status === 'requested' ? <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-bold text-amber-700"><Clock size={11} />Requested</span> : null}
    </span>
    <span className="mt-2 block truncate px-1 text-sm font-black">{plan.title}</span>
    <span className="block truncate px-1 text-xs text-muted-foreground">{plan.creator_org?.name}</span>
    <span className="flex items-center gap-1.5 px-1 pb-1 text-xs text-muted-foreground">
      <span className="shrink-0">{plural(plan.step_count, 'step')}</span>
      <span className="ml-auto flex items-center gap-1">
        {plan.mode === 'locked' ? <Lock size={12} aria-label="Locked: runs as its creator publishes it" /> : null}
        {plan.badges.length ? <Award size={13} className="text-amber-600" aria-label={`Earns ${plan.badges[0].name}`} /> : null}
      </span>
    </span>
  </Link>
}

/** A shared collection: a 2×2 grid of its plans' images, then "N plans" and its name. */
export function DiscoverCollectionCard({ orgslug, collection }: { orgslug: string; collection: DiscoverCollection }) {
  const cells = [0, 1, 2, 3].map((index) => collection.thumbs[index])
  return <Link href={discoverCollectionHref(orgslug, collection.collection_uuid)} className="block w-52 shrink-0 snap-start rounded-2xl border border-border bg-card p-2 transition hover:shadow-md sm:w-60" data-testid="discover-collection-card">
    <span className="grid aspect-square grid-cols-2 gap-1 overflow-hidden rounded-xl bg-muted/50 p-1">
      {cells.map((thumb, index) => thumb ? <PlanThumb key={thumb.template_uuid} title={thumb.title} image={thumb.thumbnail_image} className="rounded-lg" />
        : <span key={index} className="rounded-lg bg-muted/60" />)}
    </span>
    <span className="mt-2 flex items-center gap-1 px-1 text-xs text-muted-foreground">
      {collection.status === 'requested' ? <><Clock size={11} />Requested · </> : collection.status === 'added' ? 'Added · ' : null}{plural(collection.plan_count, 'plan')}
    </span>
    <span className="block truncate px-1 text-sm font-black">{collection.name}</span>
    <span className="block truncate px-1 pb-1 text-xs text-muted-foreground">{collection.creator_org?.name}</span>
  </Link>
}

/** Add, Request to add, Requested (with cancel), or Open in my plans. */
export function PlanAction({ orgslug, plan }: { orgslug: string; plan: DiscoverPlan }) {
  const router = useRouter()
  const { orgId, token, canAdd } = useDiscoverContext()
  const [busy, setBusy] = React.useState(false)
  // Returns what the server says now, or null after showing why it failed.
  const run = async (action: () => Promise<DiscoverPlan>): Promise<DiscoverPlan | null> => {
    setBusy(true)
    try {
      const result = await action()
      await refreshDiscover()
      return result
    } catch (error: any) { toast.error(error?.message || 'Something went wrong.'); return null } finally { setBusy(false) }
  }
  const cancel = async () => { if (await run(() => discoverApi.cancelRequest(orgId, plan.template_uuid, token))) toast.success('Request canceled.') }
  const add = async () => {
    const result = await run(() => discoverApi.addPlan(orgId, plan.template_uuid, token))
    if (!result) return
    toast.success(result.status === 'requested' ? `Request sent to ${plan.creator_org?.name || 'its creator'}. It shows in your Plans as requested.`
      : plan.mode === 'open' ? 'Added. It’s your own copy, ready to assign and change.' : 'Added. You can assign it now.')
  }
  if ((plan.status === 'added' || plan.status === 'own') && plan.local_template_uuid) {
    return <Button className="rounded-full" onClick={() => router.push(planHref(orgslug, plan.local_template_uuid!))}><ArrowRight />Open in my plans</Button>
  }
  if (plan.status === 'requested') {
    return <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-amber-50 px-3 text-sm font-bold text-amber-800 ring-1 ring-amber-200"><Clock size={14} />Requested · waiting on {plan.creator_org?.name || 'its creator'}</span>
      {canAdd ? <Button variant="ghost" className="rounded-full" disabled={busy} onClick={() => void cancel()}>Cancel request</Button> : null}
    </div>
  }
  if (!canAdd) return <span className="text-sm text-muted-foreground">Only admins can add plans.</span>
  const asks = plan.access === 'request'
  return <Button className="rounded-full" disabled={busy} onClick={() => void add()}>
    {busy ? <Loader2 className="animate-spin" /> : <Plus />}{asks ? 'Request to add' : 'Add to my plans'}
  </Button>
}

export function CollectionAction({ orgslug, collection }: { orgslug: string; collection: DiscoverCollection }) {
  const router = useRouter()
  const { orgId, token, canAdd } = useDiscoverContext()
  const [busy, setBusy] = React.useState(false)
  if (collection.status === 'own') return <span className="text-sm font-bold text-emerald-700">Yours</span>
  if (collection.status === 'added' && collection.local_collection_uuid) {
    return <Button className="rounded-full" onClick={() => router.push(collectionHref(orgslug, collection.local_collection_uuid!))}><ArrowRight />Open in my plans</Button>
  }
  if (collection.status === 'requested') return <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-amber-50 px-3 text-sm font-bold text-amber-800 ring-1 ring-amber-200"><Clock size={14} />Requested · waiting on {collection.creator_org?.name || 'its creator'}</span>
  if (!canAdd) return <span className="text-sm text-muted-foreground">Only admins can add plans.</span>
  const add = async () => {
    setBusy(true)
    try {
      const result = await discoverApi.addCollection(orgId, collection.collection_uuid, token)
      await refreshDiscover()
      toast.success(result.plans.some((plan) => plan.status === 'requested') ? `Request sent to ${collection.creator_org?.name || 'its creator'}. The collection is in your Plans.` : `Added ${collection.name} and its plans.`)
    } catch (error: any) { toast.error(error?.message || 'Could not add the collection.') } finally { setBusy(false) }
  }
  return <Button className="rounded-full" disabled={busy} onClick={() => void add()}>{busy ? <Loader2 className="animate-spin" /> : <Plus />}{collection.access === 'request' ? 'Request to add' : 'Add collection'}</Button>
}

/** A horizontal row that scrolls on small screens. */
export function Row({ children }: { children: React.ReactNode }) {
  return <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:mx-0 sm:px-0">{children}</div>
}
