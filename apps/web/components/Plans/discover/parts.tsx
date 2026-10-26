'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { ArrowRight, Check, Clock, Layers, Loader2, Lock, Medal, Plus, Star } from 'lucide-react'
import { useCanEditPlans } from '@components/Plans/shared/useCanEditPlans'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { isCollectionsKey } from '@services/goals/collections'
import { discoverApi, isDiscoverKey, type DiscoverCollection, type DiscoverPlan } from '@services/goals/discover'
import { isTemplatesKey } from '@services/goals/templates'
import { cn } from '@/lib/utils'
import { collectionHref, planHref } from '@components/Plans/library/PlanCards'
import { CoverGrid, PlanCover } from '@components/Plans/shared/PlanCover'
import { OrgMark } from '@components/Plans/shared/OrgMark'
import { primaryActionClass, smallGhostClass } from '@components/Plans/shared/actions'
import { AsideCard } from '@components/Plans/plan/AsideCard'
import { plural } from '@components/Plans/plan/planVersions'

export const discoverPlanHref = (orgslug: string, uuid: string) => getUriWithOrg(orgslug, routePaths.org.admin.discoverPlan(uuid))
export const discoverCollectionHref = (orgslug: string, uuid: string) => getUriWithOrg(orgslug, routePaths.org.admin.discoverCollection(uuid))
export const discoverHref = (orgslug: string) => getUriWithOrg(orgslug, routePaths.org.admin.discover())

/** The organization, its token, and whether this person may add plans. */
export function useDiscoverContext() {
  const org = useOrg() as { id?: number; slug?: string } | null
  const session = useLHSession() as { data?: { tokens?: { access_token?: string } } }
  const token = session?.data?.tokens?.access_token
  const orgId = Number(org?.id)
  return { orgId, token, ready: Boolean(orgId && token), canAdd: useCanEditPlans() === true }
}

export const refreshDiscover = () => Promise.all([mutate(isDiscoverKey), mutate(isTemplatesKey), mutate(isCollectionsKey)])

/** The organization's mark and name, with a Partner tag. */
export function ByLine({ org, partner }: { org: DiscoverPlan['creator_org']; partner?: boolean }) {
  return <>
    <span className="inline-flex min-w-0 items-center gap-[7px] text-[13.5px] text-muted-foreground"><OrgMark org={org || {}} className="h-[18px] w-[18px] rounded-[5px]" /><span className="truncate">{org?.name || 'another organization'}</span></span>
    {partner ? <span className="inline-flex items-center gap-[5px] rounded-full bg-[hsl(16_85%_93%)] px-2 py-[3px] text-[11.5px] font-bold text-[hsl(14_70%_36%)]"><Star size={12} aria-hidden="true" />Partner</span> : null}
  </>
}

/** A plan in Discover: the square cover (Added or Requested in the corner), the title, then steps, a collection it's in and a medal when it earns a badge. */
export function DiscoverPlanCard({ orgslug, plan, tag, className, coversOf }: { orgslug: string; plan: DiscoverPlan; tag?: string; className?: string; coversOf?: number }) {
  const state = plan.status === 'added' ? { icon: Check, label: 'Added' } : plan.status === 'own' ? { icon: Check, label: 'Yours' } : plan.status === 'requested' ? { icon: Clock, label: 'Requested' } : null
  return <Link href={discoverPlanHref(orgslug, plan.template_uuid)} className={cn('group block min-w-0 rounded-2xl outline-offset-4', className)} data-testid="discover-plan-card">
    <PlanCover plan={plan} iconSize={46} className="aspect-square w-full rounded-2xl transition group-hover:-translate-y-0.5 group-hover:shadow-[0_1px_2px_hsl(200_30%_10%/.06),0_8px_28px_hsl(200_30%_10%/.08)]">
      {state ? <span className="absolute bottom-2 left-2 z-[2] inline-flex items-center gap-1.5 rounded-full bg-[hsl(200_30%_10%/.8)] py-1 pl-[7px] pr-[9px] text-[11.5px] font-bold text-white backdrop-blur-sm">
        <state.icon size={13} aria-hidden="true" />{state.label}
      </span> : null}
    </PlanCover>
    <span className="mt-2.5 block truncate text-[14.5px] font-bold">{plan.title}</span>
    <span className="mt-1 flex h-5 min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground">
      <span className="shrink-0 whitespace-nowrap">{plural(plan.step_count, 'step')}</span>
      {tag ? <span className="min-w-0 truncate rounded-full bg-muted px-2 py-0.5 text-[11.5px] font-semibold">{tag}</span> : null}
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {plan.mode === 'locked' ? <Lock size={13} aria-label="Locked: runs as its creator publishes it" /> : null}
        {plan.badge ? <Medal size={18} className="text-[hsl(38_85%_42%)]" aria-label={`Earns ${plan.badge.name}`} /> : null}
      </span>
    </span>
    {coversOf && plan.covers?.length ? <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11.5px] font-semibold text-emerald-700" data-testid="discover-plan-covers">
      <Check size={12} aria-hidden="true" />Covers {plan.covers.length} of {coversOf}
    </span> : null}
  </Link>
}

/** A shared collection: a 2×2 grid of its plans' covers, "<org> · N plans", then its name. */
export function DiscoverCollectionCard({ orgslug, collection }: { orgslug: string; collection: DiscoverCollection }) {
  const state = collection.status === 'requested' ? ' · Requested' : collection.status === 'added' ? ' · Added' : ''
  return <Link href={discoverCollectionHref(orgslug, collection.collection_uuid)} data-testid="discover-collection-card"
    className="block w-[176px] shrink-0 snap-start rounded-[20px] border border-border bg-card px-2.5 pb-3.5 pt-2.5 text-left transition hover:-translate-y-0.5 hover:shadow-[0_1px_2px_hsl(200_30%_10%/.06),0_8px_28px_hsl(200_30%_10%/.08)] sm:w-[220px]">
    <CoverGrid plans={collection.thumbs} />
    <span className="mx-1 mb-0.5 mt-3 block truncate text-[12.5px] font-medium text-muted-foreground">{collection.creator_org?.name || 'Another organization'} · {plural(collection.plan_count, 'plan')}{state}</span>
    <b className="mx-1 block truncate text-base font-bold tracking-tight">{collection.name}</b>
  </Link>
}

/** Who made a plan or collection, its version, and what adding it lets you do. */
export function OwnerCard({ org, locked, open, detail }: { org: DiscoverPlan['creator_org']; locked: boolean; open: boolean; detail: string }) {
  const by = org?.name || 'Its creator'
  return <AsideCard icon={<Layers size={16} />} title="Owner and version">
    <div className="mt-3 flex items-center gap-2.5">
      <OrgMark org={org || {}} className="h-9 w-9 rounded-[10px] text-[11px]" />
      <span className="min-w-0 flex-1"><b className="block truncate text-sm">Created by {by}</b><span className="block text-[12.5px] text-muted-foreground">{detail}</span></span>
      {locked ? <span title={`Locked by ${by}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"><Lock size={15} aria-label={`Locked by ${by}`} /></span> : null}
    </div>
    <p className="mt-2 text-[13.5px] leading-[1.45] text-muted-foreground">{locked ? `${by} keeps this locked. Once it’s yours you can assign it and review work, but not change the steps.`
      : open ? `${by} lets you change it however you like. Adding it makes your own copy.` : `Use it as is. Only ${by} can change it.`}</p>
    {locked ? <p className="mt-2 text-[12.5px] leading-[1.45] text-muted-foreground">When {by} publishes a new version, you’ll see it on the plan and can compare before you update.</p> : null}
  </AsideCard>
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
    return <button type="button" className={primaryActionClass} onClick={() => router.push(planHref(orgslug, plan.local_template_uuid!))}><ArrowRight size={16} />Open in my plans</button>
  }
  if (plan.status === 'requested') {
    return <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex h-10 items-center gap-1.5 rounded-full bg-amber-50 px-3.5 text-[13.5px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200"><Clock size={14} />Requested · waiting on {plan.creator_org?.name || 'its creator'}</span>
      {canAdd ? <button type="button" className={smallGhostClass + ' h-10 px-4 text-sm'} disabled={busy} onClick={() => void cancel()}>Cancel request</button> : null}
    </div>
  }
  if (!canAdd) return <span className="text-sm text-muted-foreground">Only admins can add plans.</span>
  const asks = plan.access === 'request'
  return <button type="button" className={primaryActionClass} disabled={busy} onClick={() => void add()}>
    {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}{asks ? 'Request to add' : 'Add to my plans'}
  </button>
}

export function CollectionAction({ orgslug, collection }: { orgslug: string; collection: DiscoverCollection }) {
  const router = useRouter()
  const { orgId, token, canAdd } = useDiscoverContext()
  const [busy, setBusy] = React.useState(false)
  if (collection.status === 'own') return <span className="text-sm font-bold text-emerald-700">Yours</span>
  if (collection.status === 'added' && collection.local_collection_uuid) {
    return <button type="button" className={primaryActionClass} onClick={() => router.push(collectionHref(orgslug, collection.local_collection_uuid!))}><ArrowRight size={16} />Open in my plans</button>
  }
  if (collection.status === 'requested') return <span className="inline-flex h-10 items-center gap-1.5 rounded-full bg-amber-50 px-3.5 text-[13.5px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200"><Clock size={14} />Requested · waiting on {collection.creator_org?.name || 'its creator'}</span>
  if (!canAdd) return <span className="text-sm text-muted-foreground">Only admins can add plans.</span>
  const add = async () => {
    setBusy(true)
    try {
      const result = await discoverApi.addCollection(orgId, collection.collection_uuid, token)
      await refreshDiscover()
      toast.success(result.plans.some((plan) => plan.status === 'requested') ? `Request sent to ${collection.creator_org?.name || 'its creator'}. The collection is in your Plans.` : `Added ${collection.name} and its plans.`)
    } catch (error: any) { toast.error(error?.message || 'Could not add the collection.') } finally { setBusy(false) }
  }
  return <button type="button" className={primaryActionClass} disabled={busy} onClick={() => void add()}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}{collection.access === 'request' ? 'Request to add' : 'Add collection'}</button>
}

/** A horizontal row that scrolls on small screens. */
export function Row({ children }: { children: React.ReactNode }) {
  return <div className="-mx-1 flex snap-x snap-proximity gap-3.5 overflow-x-auto px-1 pb-3 pt-1 [scrollbar-width:thin]">{children}</div>
}
