'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ContentPageHeader from '@components/Objects/StyledElements/Headers/ContentPageHeader'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { DiscoverPlanCollection } from '@services/goals/planJoining'
import { usePlanFeed } from './DiscoverFeed'
import { CHUNKY, CollectedPill, PlanArt, PlanTile, planHref } from './PlanArt'
import { cn } from '@/lib/utils'

const FAN = ['left-[8%] top-[110px] -rotate-[14deg]', 'left-[26%] top-[30px] -rotate-6', 'left-[38%] top-[100px] rotate-[4deg]', 'left-[64%] top-[20px] rotate-[10deg]', 'left-[70%] top-[150px] rotate-[16deg]']

/** A collection of plans: its story, what's next for the learner and every plan in it. */
export default function CollectionPage({ orgslug, initialCollection }: { orgslug: string; initialCollection: DiscoverPlanCollection }) {
  const router = useRouter()
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const { data: feed } = usePlanFeed(Boolean(token))
  const collection = feed?.collections.find((item) => item.collection_uuid === initialCollection.collection_uuid) || initialCollection
  const next = collection.plans.find((card) => card.state === 'joined') || collection.plans.find((card) => card.state === 'none')
  return <div className="min-h-screen bg-background text-[15px] leading-[1.45] text-foreground">
    <div className="mx-auto max-w-[1056px] px-6"><ContentPageHeader orgslug={orgslug} backLabel="Discover" onBack={() => router.push(getUriWithOrg(orgslug, routePaths.org.discover()))} noBottomMargin noHorizontalBleed /></div>
    <section className="relative overflow-hidden bg-muted">
      <div className="absolute inset-0 bg-[url('/landing/cta.png')] bg-cover bg-center opacity-50" aria-hidden="true" />
      <div className="relative mx-auto max-w-[1056px] px-4 pb-14 pt-6 sm:px-6">
        <div className="mt-2 flex flex-wrap-reverse items-center gap-8">
          <div className="flex min-w-0 flex-[999_1_440px] flex-col gap-4">
            <span className="self-start rounded-full bg-[#2B5FD9] px-3 py-1.5 text-xs font-black uppercase tracking-[.08em] text-white">Collection · {collection.plans.length} plan{collection.plans.length === 1 ? '' : 's'}</span>
            <h1 className="m-0 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{collection.name}</h1>
            {collection.description ? <p className="m-0 max-w-[540px] text-[21px] leading-snug text-[#3A4152]">{collection.description}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              {collection.org ? <span className="rounded-full bg-card px-2.5 py-1 text-xs font-bold">By {collection.org.name}</span> : null}
              {token ? <CollectedPill cards={collection.plans} /> : null}
            </div>
          </div>
          <div className="relative hidden h-[320px] flex-[1_1_380px] md:block" aria-hidden="true">
            {collection.plans.slice(0, 5).map((card, index) => <span key={card.template_uuid} className={cn('absolute', FAN[index])}><PlanArt card={card} size={index === 2 ? 170 : 125} /></span>)}
          </div>
        </div>
      </div>
    </section>
    <main className="mx-auto flex max-w-[1056px] flex-col gap-12 px-4 pb-24 pt-11 sm:px-6">
      {next && token ? <section aria-label="Up next in this collection" className="flex flex-wrap items-center gap-6 rounded-3xl bg-[#111318] px-7 py-6 text-white">
        <PlanArt card={next} size={96} />
        <div className="flex flex-[1_1_260px] flex-col gap-0.5">
          <span className="text-xs font-black uppercase tracking-[.08em] text-[#D7F25C]">Up next</span>
          <strong className="text-[28px] font-black">{next.title}</strong>
          <span className="text-[#C6CAD6]">{next.goal ? `${next.goal.done} of ${next.goal.total} steps done.` : next.description || 'Ready when you are.'}</span>
        </div>
        <Link href={next.goal ? getUriWithOrg(orgslug, routePaths.org.plan(next.goal.goal_uuid)) : planHref(orgslug, next.template_uuid)} className={cn(CHUNKY, 'h-[54px] text-[17px] no-underline')}>{next.goal ? 'Keep going' : 'Take a look'}</Link>
      </section> : null}
      <section aria-labelledby="all-plans" className="flex flex-col gap-[18px]">
        <h2 id="all-plans" className="m-0 text-3xl font-black">Every plan in it</h2>
        <div className="grid gap-x-[18px] gap-y-[22px] [grid-template-columns:repeat(auto-fill,minmax(176px,1fr))]">
          {collection.plans.map((card) => <PlanTile key={card.template_uuid} card={card} orgslug={orgslug} fill />)}
        </div>
      </section>
    </main>
  </div>
}
