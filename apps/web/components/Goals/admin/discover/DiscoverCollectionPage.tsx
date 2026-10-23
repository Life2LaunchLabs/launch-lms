'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Award, Loader2 } from 'lucide-react'
import { CaretRight } from '@phosphor-icons/react'
import { EmptyState } from '@components/Goals/admin/live/ui'
import { discoverApi, discoverKeys } from '@services/goals/discover'
import { PlanThumb } from '../plan/PlanCards'
import { plural } from '../plan/planVersions'
import { ByLine, CollectionAction, DiscoverPlanCard, discoverHref, useDiscoverContext } from './parts'

/** A collection another organization shares: its shared plans, and Add (every plan and the collection) or Request. */
export default function DiscoverCollectionPage({ orgslug, collectionUuid }: { orgslug: string; collectionUuid: string }) {
  const { orgId, token, ready } = useDiscoverContext()
  const { data: collection, error } = useSWR(ready ? discoverKeys.collection(orgId, collectionUuid) : null, () => discoverApi.collection(orgId, collectionUuid, token))
  if (error && !collection) return <div className="p-10"><EmptyState title="Not in Discover" detail="Its creator may have stopped sharing it." /></div>
  if (!collection) return <div className="flex min-h-full w-full items-center justify-center bg-[#f8f8f8]"><Loader2 className="animate-spin text-muted-foreground" /></div>
  const cells = [0, 1, 2, 3].map((index) => collection.thumbs[index])
  const by = collection.creator_org?.name || 'Its creator'

  return <div className="min-h-full w-full bg-[#f8f8f8]"><div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:px-10">
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
      <Link href={discoverHref(orgslug)} className="hover:text-foreground">Discover</Link>
      <CaretRight size={12} aria-hidden="true" />
      <span aria-current="page" className="min-w-0 truncate text-foreground">{collection.name}</span>
    </nav>
    <header className="flex flex-col gap-5 sm:flex-row sm:items-start">
      <span className="grid h-36 w-36 shrink-0 grid-cols-2 gap-1 rounded-2xl bg-muted/50 p-1">
        {cells.map((thumb, index) => thumb ? <PlanThumb key={thumb.template_uuid} title={thumb.title} image={thumb.thumbnail_image} className="rounded-xl" /> : <span key={index} className="rounded-xl bg-muted/60" />)}
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{collection.name}</h1>
        {collection.description ? <p className="mt-1 text-base text-muted-foreground">{collection.description}</p> : null}
        {collection.categories.length ? <div className="mt-3 flex flex-wrap gap-1.5">{collection.categories.map((category) => <span key={category} className="rounded-full bg-muted px-3 py-1 text-xs font-bold">{category}</span>)}</div> : null}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
          <ByLine org={collection.creator_org} partner={collection.partner} />
          <span>{plural(collection.plan_count, 'plan')}</span>
          {collection.badge_count ? <span className="inline-flex items-center gap-1"><Award size={13} className="text-amber-600" />{plural(collection.badge_count, 'badge')}</span> : null}
        </div>
        <div className="mt-5"><CollectionAction orgslug={orgslug} collection={collection} /></div>
        {collection.status === 'none' ? <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          {collection.access === 'request' ? `${by} approves requests. The collection and its plans show in your Plans as requested until then.` : `Adds all ${plural(collection.plan_count, 'plan')} and the collection to your Plans.`}
        </p> : null}
      </div>
    </header>
    <section aria-labelledby="discover-collection-plans" className="mt-8">
      <h2 id="discover-collection-plans" className="mb-3 text-xl font-black">Plans <span className="ml-1 text-sm font-bold text-muted-foreground">{collection.plans.length}</span></h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{collection.plans.map((plan) => <li key={plan.template_uuid}><DiscoverPlanCard orgslug={orgslug} plan={plan} /></li>)}</ul>
    </section>
  </div></div>
}
