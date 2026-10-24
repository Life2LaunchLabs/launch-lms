'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { ArrowRight } from 'lucide-react'
import DiscoverHero from './DiscoverHero'
import ResourceShelves from './ResourceShelves'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { DISCOVER_FEED_KEY, planJoiningApi, type PlanOfferCard } from '@services/goals/planJoining'
import { CollectedPill, PlanArt, PlanTile, SectionTitle, Shelf, collectionHref, tileColor } from './PlanArt'

function KeepGoing({ cards, orgslug }: { cards: PlanOfferCard[]; orgslug: string }) {
  if (!cards.length) return null
  return <section aria-label="Keep going" className="flex flex-col gap-3.5">
    <SectionTitle>Keep going</SectionTitle>
    <Shelf label="Plans you’re working on">
      {cards.map((card) => {
        const percent = card.goal?.total ? Math.round((card.goal.done * 100) / card.goal.total) : 0
        return <Link key={card.template_uuid} href={getUriWithOrg(orgslug, routePaths.org.plan(card.goal!.goal_uuid))} aria-label={`${card.title}: Keep going`}
          className="group flex w-[min(340px,80vw)] shrink-0 items-center gap-3 rounded-2xl border-2 border-border bg-card p-3 text-foreground no-underline shadow-[0_4px_0_hsl(var(--edge))]">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: tileColor(card.template_uuid) }}><PlanArt card={card} size={44} /></span>
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="truncate text-base font-extrabold">{card.title}</span>
            <span className="text-[13px] text-muted-foreground">{card.goal!.done} of {card.goal!.total} steps done</span>
            <span className="block h-2.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-[var(--org-primary-color)]" style={{ width: `${percent}%` }} /></span>
          </span>
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--org-primary-color)] text-[var(--org-on-primary-color)] transition group-hover:scale-105"><ArrowRight size={16} /></span>
        </Link>
      })}
    </Shelf>
  </section>
}

function Skeleton() {
  return <div className="flex flex-col gap-11" aria-busy="true" aria-label="Loading plans">
    <div className="h-[360px] animate-pulse rounded-3xl bg-muted md:h-[420px]" />
    <div className="flex gap-[18px] overflow-hidden">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-[250px] w-[196px] shrink-0 animate-pulse rounded-[18px] bg-muted" />)}</div>
  </div>
}

/** The Discover feed, shared with search, collections and plan pages so all read the same cached plans. */
export function usePlanFeed(enabled = true) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  return useSWR(enabled ? [DISCOVER_FEED_KEY, org?.id, token || 'public'] : null, () => planJoiningApi.discover(token, undefined, org?.id))
}

/**
 * Discover's front page: featured stories, plans you're working on, plans to join (many earn a
 * badge) and the collections they belong to, then resources shelved by type.
 */
export default function DiscoverFeed({ orgslug, showPlans = true, showResources = true }: { orgslug: string; showPlans?: boolean; showResources?: boolean }) {
  const { data: feed, error } = usePlanFeed(showPlans)
  if (!showPlans) return <div className="flex flex-col gap-9 text-foreground"><ResourceShelves orgslug={orgslug} /></div>
  if (error) return <p className="rounded-2xl bg-card p-6 text-sm font-medium text-muted-foreground">Plans couldn’t load. Refresh to try again.</p>
  if (!feed) return <Skeleton />
  const collected = new Set(feed.collections.flatMap((collection) => collection.plans.map((card) => card.template_uuid)))
  const loose = feed.plans.filter((card) => !collected.has(card.template_uuid))
  return <div className="flex flex-col gap-9 text-foreground">
    <DiscoverHero slides={feed.hero_slides} orgslug={orgslug} />
    <KeepGoing cards={feed.keep_going} orgslug={orgslug} />
    {loose.length ? <section aria-label="Explore plans" className="flex flex-col gap-3.5">
      <SectionTitle>Explore plans</SectionTitle>
      <Shelf label="Explore plans">{loose.slice(0, 12).map((card) => <PlanTile key={card.template_uuid} card={card} orgslug={orgslug} />)}</Shelf>
    </section> : null}
    {feed.collections.map((collection) => <section key={collection.collection_uuid} aria-label={collection.name} className="flex flex-col gap-3.5">
      <SectionTitle href={collectionHref(orgslug, collection.collection_uuid)} aside={<CollectedPill cards={collection.plans} />}>{collection.name}</SectionTitle>
      <Shelf label={collection.name}>{collection.plans.map((card) => <PlanTile key={card.template_uuid} card={card} orgslug={orgslug} />)}</Shelf>
    </section>)}
    {showResources ? <ResourceShelves orgslug={orgslug} /> : null}
    {!feed.plans.length && !feed.keep_going.length && !showResources ? <p className="rounded-2xl bg-card p-6 text-sm font-medium text-muted-foreground">{feed.earned_count ? 'You’ve done every plan here. New ones land soon.' : 'No plans to join yet. Check back soon.'}</p> : null}
  </div>
}
