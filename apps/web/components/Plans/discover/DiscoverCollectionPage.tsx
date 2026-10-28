'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Loader2, Medal, Route } from 'lucide-react'
import { EmptyState } from '@components/Goals/admin/live/ui'
import { discoverApi, discoverKeys } from '@services/goals/discover'
import { CoverGrid } from '@components/Plans/shared/PlanCover'
import { SectionHeader, planGridClass } from '@components/Plans/library/PlanCards'
import { plural } from '@components/Plans/plan/planVersions'
import { ByLine, CollectionAction, DiscoverPlanCard, OwnerCard, discoverHref, useDiscoverContext } from './parts'

/** A collection another organization shares: its shared plans, and Add (every plan and the collection) or Request. */
export default function DiscoverCollectionPage({ orgslug, collectionUuid }: { orgslug: string; collectionUuid: string }) {
  const { orgId, token, ready } = useDiscoverContext()
  const { data: collection, error } = useSWR(ready ? discoverKeys.collection(orgId, collectionUuid) : null, () => discoverApi.collection(orgId, collectionUuid, token))
  if (error && !collection) return <div className="p-10"><EmptyState title="Not in Discover" detail="Its creator may have stopped sharing it." /></div>
  if (!collection) return <div className="flex min-h-full w-full items-center justify-center bg-[#f8f8f8]"><Loader2 className="animate-spin text-muted-foreground" /></div>
  const by = collection.creator_org?.name || 'Its creator'

  return <div className="min-h-full w-full bg-[#f8f8f8] dark:bg-background"><div className="mx-auto max-w-[1180px] px-4 pb-16 pt-6 sm:px-6 lg:px-10">
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
      <Link href={discoverHref(orgslug)} className="hover:text-foreground">Discover</Link>
      <span aria-hidden="true">/</span>
      <span className="text-muted-foreground">Collections</span>
    </nav>
    <div className="mt-3.5 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <main className="min-w-0">
        <header className="flex items-start gap-3.5 sm:gap-[22px]">
          <CoverGrid plans={collection.thumbs} className="w-[88px] shrink-0 sm:w-[136px]" cellClassName="rounded-lg sm:rounded-[11px]" />
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-[clamp(26px,3vw,36px)] font-extrabold leading-[1.15] tracking-[-0.035em]">{collection.name}</h1>
            {collection.description ? <p className="mt-1.5 text-base leading-normal text-muted-foreground">{collection.description}</p> : null}
            {collection.categories.length ? <div className="mt-3 flex flex-wrap gap-1.5">{collection.categories.map((category) => <span key={category} className="rounded-full bg-brand-soft px-[11px] py-[5px] text-[12.5px] font-semibold text-brand-ink">{category}</span>)}</div> : null}
          </div>
        </header>
        <div className="mt-3 flex flex-wrap items-center gap-3.5 text-[13.5px] text-muted-foreground">
          <ByLine org={collection.creator_org} partner={collection.partner} />
          <span className="inline-flex items-center gap-1.5"><Route size={16} aria-hidden="true" />{plural(collection.plan_count, 'plan')}</span>
          {collection.badge_count ? <span className="inline-flex items-center gap-[5px] rounded-full bg-[hsl(45_95%_90%)] px-2 py-[3px] text-[11.5px] font-bold text-[hsl(35_80%_28%)]"><Medal size={13} aria-hidden="true" />{plural(collection.badge_count, 'badge')}</span> : null}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2"><CollectionAction orgslug={orgslug} collection={collection} /></div>
        {collection.status === 'none' ? <p className="mt-2.5 max-w-xl text-[13px] text-muted-foreground">
          {collection.access === 'request' ? `${by} approves requests. The collection and its plans show in your Plans as requested until then.` : `Adds all ${plural(collection.plan_count, 'plan')} and the collection to your Plans.`}
        </p> : null}
        <SectionHeader title="Plans" count={collection.plans.length} />
        <ul className={planGridClass}>{collection.plans.map((plan) => <li key={plan.template_uuid} className="min-w-0"><DiscoverPlanCard orgslug={orgslug} plan={plan} /></li>)}</ul>
      </main>
      <aside className="flex min-w-0 flex-col gap-3.5 lg:sticky lg:top-5">
        <OwnerCard org={collection.creator_org} locked={collection.locked} open={collection.plans.every((plan) => plan.mode === 'open')} detail={plural(collection.plan_count, 'published plan')} />
      </aside>
    </div>
  </div></div>
}
