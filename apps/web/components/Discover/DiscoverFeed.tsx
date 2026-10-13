'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { ArrowRight } from 'lucide-react'
import DiscoverHero from './DiscoverHero'
import ResourceShelves from './ResourceShelves'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { badgeDiscoverApi, type BadgeCard } from '@services/learning/badgeDiscover'
import { BadgeSticker, BadgeTile, CollectedPill, SectionTitle, Shelf, collectionHref, tileColor } from '@components/Badges/discover/BadgeArt'

function KeepGoing({ cards, orgslug }: { cards: BadgeCard[]; orgslug: string }) {
  if (!cards.length) return null
  return <section aria-label="Keep going" className="flex flex-col gap-3.5">
    <SectionTitle>Keep going</SectionTitle>
    <Shelf label="Badges you’re earning">
      {cards.map((card) => {
        const percent = card.plan?.total ? Math.round((card.plan.done * 100) / card.plan.total) : 0
        return <Link key={card.badge_uuid} href={getUriWithOrg(orgslug, routePaths.org.plan(card.plan!.slug))} aria-label={`${card.name}: Continue plan`}
          className="group flex w-[min(340px,80vw)] shrink-0 items-center gap-3 rounded-2xl border-2 border-border bg-card p-3 text-foreground no-underline shadow-[0_4px_0_hsl(var(--edge))]">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: tileColor(card.badge_uuid) }}><BadgeSticker src={card.thumbnail_image} name={card.name} size={48} /></span>
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="truncate text-base font-extrabold">{card.name}</span>
            <span className="text-[13px] text-muted-foreground">{card.plan!.done} of {card.plan!.total} steps done</span>
            <span className="block h-2.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-[var(--org-primary-color)]" style={{ width: `${percent}%` }} /></span>
          </span>
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--org-primary-color)] text-[var(--org-on-primary-color)] transition group-hover:scale-105"><ArrowRight size={16} /></span>
        </Link>
      })}
    </Shelf>
  </section>
}

function Skeleton() {
  return <div className="flex flex-col gap-11" aria-busy="true" aria-label="Loading badges">
    <div className="h-[360px] animate-pulse rounded-3xl bg-muted md:h-[420px]" />
    <div className="flex gap-[18px] overflow-hidden">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-[250px] w-[196px] shrink-0 animate-pulse rounded-[18px] bg-muted" />)}</div>
  </div>
}

/** The Discover feed, shared with search so both read the same cached badges. */
export function useBadgeFeed(enabled = true) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  return useSWR(enabled ? ['badge-discover', org?.id, token || 'public'] : null, () => badgeDiscoverApi.discover(token, undefined, org?.id))
}

/**
 * Discover's front page: featured stories, badges you're earning, badges to start and the
 * series they belong to, then resources shelved by type.
 */
export default function DiscoverFeed({ orgslug, showBadges = true, showResources = true }: { orgslug: string; showBadges?: boolean; showResources?: boolean }) {
  const { data: feed, error } = useBadgeFeed(showBadges)
  if (!showBadges) return <div className="flex flex-col gap-9 text-foreground"><ResourceShelves orgslug={orgslug} /></div>
  if (error) return <p className="rounded-2xl bg-card p-6 text-sm font-medium text-muted-foreground">Badges couldn’t load. Refresh to try again.</p>
  if (!feed) return <Skeleton />
  const startable = feed.badges.filter((card) => !card.collection && !card.plan).sort((a, b) => Number(a.status === 'coming_soon') - Number(b.status === 'coming_soon'))
  return <div className="flex flex-col gap-9 text-foreground">
    <DiscoverHero slides={feed.hero_slides} orgslug={orgslug} />
    <KeepGoing cards={feed.keep_going} orgslug={orgslug} />
    {startable.length ? <section aria-label="Explore badges" className="flex flex-col gap-3.5">
      <SectionTitle>Explore badges</SectionTitle>
      <Shelf label="Explore badges">{startable.slice(0, 12).map((card) => <BadgeTile key={card.badge_uuid} card={card} orgslug={orgslug} />)}</Shelf>
    </section> : null}
    {feed.collections.map((collection) => <section key={collection.collection_uuid} aria-label={collection.name} className="flex flex-col gap-3.5">
      <SectionTitle href={collectionHref(orgslug, collection.collection_uuid)} aside={<CollectedPill cards={collection.badges} />}>{collection.name}</SectionTitle>
      <Shelf label={collection.name}>{collection.badges.map((card) => <BadgeTile key={card.badge_uuid} card={card} orgslug={orgslug} />)}</Shelf>
    </section>)}
    {showResources ? <ResourceShelves orgslug={orgslug} /> : null}
    {!feed.badges.length && !feed.keep_going.length && !showResources ? <p className="rounded-2xl bg-card p-6 text-sm font-medium text-muted-foreground">{feed.earned_count ? 'You’ve earned every badge here. New ones land soon.' : 'No badges to earn yet. Check back soon.'}</p> : null}
  </div>
}
