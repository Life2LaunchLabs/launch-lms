'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Play } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { badgeDiscoverApi, type BadgeCard, type BadgeCollectionPage, type DiscoverFeed as Feed } from '@services/learning/badgeDiscover'
import { BadgeSticker, BadgeTile, CHUNKY, CHUNKY_DARK, CollectedPill, SectionTitle, Shelf, badgeHref, collectionHref, tileColor } from './BadgeArt'

type Slide =
  | { kind: 'badge'; key: string; title: string; sub: string; card: BadgeCard }
  | { kind: 'collection'; key: string; title: string; sub: string; collection: BadgeCollectionPage }
  | { kind: 'challenges'; key: string; title: string; sub: string }

const ROTATE_MS = 7000

function slidesFor(feed: Feed): Slide[] {
  const badges: Slide[] = feed.featured.slice(0, 2).map((card) => ({ kind: 'badge', key: card.badge_uuid, title: card.name, sub: card.subtitle || 'New badge', card }))
  const series: Slide[] = feed.collections.filter((item) => item.badges.length > 1).slice(0, 1).map((collection) => ({ kind: 'collection', key: collection.collection_uuid, title: collection.name, sub: `Collect all ${collection.badges.length}`, collection }))
  return [...badges, ...series, { kind: 'challenges', key: 'challenges', title: 'Monthly challenges', sub: 'Coming soon' }]
}

function BadgeSlide({ card, orgslug }: { card: BadgeCard; orgslug: string }) {
  return <div className="absolute inset-0 bg-[#2E62C9] bg-[url('/rough_blue_background.png')] bg-cover bg-center">
    <div className="absolute inset-0 bg-[url('/landing/cta.png')] bg-contain bg-right bg-no-repeat opacity-30" aria-hidden="true" />
    <div className="absolute right-6 top-1/2 hidden -translate-y-1/2 -rotate-[8deg] sm:block lg:right-16"><BadgeSticker src={card.thumbnail_image} name={card.name} size={280} /></div>
    <div className="absolute right-5 top-14 -rotate-[8deg] sm:hidden"><BadgeSticker src={card.thumbnail_image} name={card.name} size={140} /></div>
    <div className="relative flex h-full max-w-[480px] flex-col justify-end gap-3.5 p-7 sm:p-11">
      <span className="self-start rounded-full bg-white px-2.5 py-1 text-xs font-black uppercase tracking-[.08em] text-[#111318]">{card.collection?.name || 'New badge'}</span>
      <h2 className="m-0 text-5xl font-black leading-none tracking-tight text-white sm:text-6xl">{card.name}</h2>
      {card.subtitle || card.description ? <p className="m-0 line-clamp-3 text-lg text-[#E4ECFF]">{card.subtitle || card.description}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <Link href={badgeHref(orgslug, card.badge_uuid)} className={cn(CHUNKY, 'h-[52px] text-base no-underline')}>Start earning</Link>
        {card.time_label ? <span className="text-sm font-semibold text-[#E4ECFF]">{card.time_label}</span> : null}
      </div>
    </div>
  </div>
}

function Fan({ cards, size = 130 }: { cards: BadgeCard[]; size?: number }) {
  const spots = ['left-[6%] top-[110px] -rotate-[14deg]', 'left-[24%] top-[30px] -rotate-6', 'left-[38%] top-[100px] rotate-[4deg]', 'left-[62%] top-[20px] rotate-[10deg]', 'left-[68%] top-[150px] rotate-[16deg]']
  return <div className="relative h-[320px] w-full" aria-hidden="true">
    {cards.slice(0, 5).map((card, index) => <span key={card.badge_uuid} className={cn('absolute', spots[index])}><BadgeSticker src={card.thumbnail_image} name={card.name} size={index === 2 ? size * 1.3 : size} /></span>)}
  </div>
}

function CollectionSlide({ collection, orgslug }: { collection: BadgeCollectionPage; orgslug: string }) {
  return <div className="absolute inset-0 bg-[#E9EEFB]">
    <div className="absolute inset-0 bg-[url('/landing/cta.png')] bg-cover bg-center opacity-40" aria-hidden="true" />
    <div className="absolute right-0 top-4 hidden w-[52%] md:block"><Fan cards={collection.badges} /></div>
    <div className="relative flex h-full max-w-[470px] flex-col justify-end gap-3.5 p-7 sm:p-11">
      <span className="self-start rounded-full bg-[#2B5FD9] px-2.5 py-1 text-xs font-black uppercase tracking-[.08em] text-white">Badge series</span>
      <h2 className="m-0 text-4xl font-black leading-[1.02] tracking-tight text-[#111318] sm:text-5xl">{collection.name}: collect all {collection.badges.length}</h2>
      {collection.description ? <p className="m-0 line-clamp-3 text-lg text-[#3A4152]">{collection.description}</p> : null}
      <div className="mt-2"><Link href={collectionHref(orgslug, collection.collection_uuid)} className={cn(CHUNKY_DARK, 'h-[52px] text-base no-underline')}>See the series</Link></div>
    </div>
  </div>
}

function ChallengesArt({ compact = false }: { compact?: boolean }) {
  return <>
    <img src="/jungle_landscape.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-[70%_50%]" />
    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(14,10,36,.96)_30%,rgba(14,10,36,.1)_75%)]" aria-hidden="true" />
    <div className={cn('relative flex h-full max-w-[520px] flex-col justify-end gap-3', compact ? 'p-8 sm:p-11' : 'p-7 sm:p-11')}>
      <span className="self-start rounded-full bg-[#D7F25C] px-2.5 py-1 text-xs font-black uppercase tracking-[.08em] text-[#0E0A24]">Challenges · coming soon</span>
      <h2 className="m-0 text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-[44px]">One month. One challenge. One badge you can’t get later.</h2>
      <p className="m-0 text-lg text-[#D9D3F5]">A new challenge every month. Beat it before the month ends and the badge is yours for good.</p>
    </div>
  </>
}

function Featured({ feed, orgslug }: { feed: Feed; orgslug: string }) {
  const slides = React.useMemo(() => slidesFor(feed), [feed])
  const [active, setActive] = React.useState(0)
  const [paused, setPaused] = React.useState(false)
  const reduceMotion = useReducedMotion()
  React.useEffect(() => {
    if (paused || reduceMotion || slides.length < 2) return
    const timer = window.setTimeout(() => setActive((index) => (index + 1) % slides.length), ROTATE_MS)
    return () => window.clearTimeout(timer)
  }, [active, paused, reduceMotion, slides.length])
  const slide = slides[Math.min(active, slides.length - 1)]
  return <section aria-label="Featured" className="flex flex-wrap gap-4" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
    <div className="relative h-[440px] min-w-0 flex-[999_1_640px] overflow-hidden rounded-[22px] bg-[#0E0A24]" aria-live="polite">
      {slide.kind === 'badge' ? <BadgeSlide card={slide.card} orgslug={orgslug} /> : slide.kind === 'collection' ? <CollectionSlide collection={slide.collection} orgslug={orgslug} /> : <div className="absolute inset-0"><ChallengesArt /></div>}
      <div className="absolute left-5 top-5 flex sm:left-9" role="group" aria-label="Featured slides">
        {slides.map((item, index) => <button key={item.key} type="button" onClick={() => setActive(index)} aria-label={item.title} aria-pressed={index === active} className="flex h-8 items-center px-1">
          <span className={cn('block h-1.5 rounded-full transition-all', index === active ? 'w-7 bg-white' : 'w-1.5 bg-white/50')} />
        </button>)}
      </div>
    </div>
    <div className="hidden min-w-0 flex-[1_1_260px] flex-col gap-1 rounded-[22px] bg-[#111318] p-2.5 sm:flex" role="group" aria-label="Featured">
      {slides.map((item, index) => <button key={item.key} type="button" onClick={() => setActive(index)} aria-pressed={index === active}
        className={cn('flex min-h-[64px] items-center gap-3 rounded-2xl px-3 py-2 text-left transition hover:bg-white/10', index === active && 'bg-white/15')}>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl" style={{ backgroundColor: item.kind === 'challenges' ? '#2A2350' : tileColor(item.key) }} aria-hidden="true">
          {item.kind === 'badge' ? <BadgeSticker src={item.card.thumbnail_image} name={item.title} size={40} /> : item.kind === 'collection' && item.collection.badges[0] ? <BadgeSticker src={item.collection.badges[0].thumbnail_image} name={item.title} size={40} /> : <img src="/jungle_landscape.jpg" alt="" className="h-full w-full object-cover" />}
        </span>
        <span className="flex min-w-0 flex-col"><span className="truncate text-[15px] font-black text-white">{item.title}</span><span className="truncate text-[13px] text-[#A5ABBC]">{item.sub}</span></span>
      </button>)}
    </div>
  </section>
}

function KeepGoing({ cards, orgslug }: { cards: BadgeCard[]; orgslug: string }) {
  if (!cards.length) return null
  return <section aria-label="Keep going" className="flex flex-col gap-3.5">
    <SectionTitle>Keep going</SectionTitle>
    <Shelf label="Badges you’re earning">
      {cards.map((card) => {
        const percent = card.plan?.total ? Math.round((card.plan.done * 100) / card.plan.total) : 0
        return <Link key={card.badge_uuid} href={getUriWithOrg(orgslug, routePaths.org.plan(card.plan!.slug))}
          className="group flex w-[min(380px,85vw)] shrink-0 items-center gap-4 rounded-[18px] bg-white py-3.5 pl-3.5 pr-4 text-[#111318] no-underline shadow-[0_1px_0_#E6E8EF]">
          <span className="flex h-[84px] w-[84px] shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: tileColor(card.badge_uuid) }}><BadgeSticker src={card.thumbnail_image} name={card.name} size={64} /></span>
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="truncate text-base font-black">{card.name}</span>
            <span className="text-[13px] text-[#5B6274]">{card.plan!.done} of {card.plan!.total} steps done</span>
            <span className="block h-2 overflow-hidden rounded-full bg-[#EDEFF5]"><span className="block h-full rounded-full bg-[#2B5FD9]" style={{ width: `${percent}%` }} /></span>
          </span>
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2B5FD9] text-white transition group-hover:scale-105"><Play size={16} fill="currentColor" /></span>
        </Link>
      })}
    </Shelf>
  </section>
}

function Skeleton() {
  return <div className="flex flex-col gap-11" aria-busy="true" aria-label="Loading badges">
    <div className="h-[440px] animate-pulse rounded-[22px] bg-[#E6E8EF]" />
    <div className="flex gap-[18px] overflow-hidden">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-[250px] w-[196px] shrink-0 animate-pulse rounded-[18px] bg-[#E6E8EF]" />)}</div>
  </div>
}

/** Discover: an image-led feed of badges to earn, the ones you're working on, and the sets they belong to. */
export default function DiscoverFeed({ orgslug }: { orgslug: string }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const { data: feed, error } = useSWR(['badge-discover', token || 'public'], () => badgeDiscoverApi.discover(token))
  if (error) return <p className="rounded-2xl bg-white p-6 text-sm font-bold text-[#5B6274]">Badges couldn’t load. Refresh to try again.</p>
  if (!feed) return <Skeleton />
  const loose = feed.badges.filter((card) => !card.collection)
  const startable = [...feed.badges].sort((a, b) => Number(a.status === 'coming_soon') - Number(b.status === 'coming_soon'))
  return <div className="flex flex-col gap-11 text-[#111318]">
    <Featured feed={feed} orgslug={orgslug} />
    <KeepGoing cards={feed.keep_going} orgslug={orgslug} />
    {startable.length ? <section aria-label="Picked for you" className="flex flex-col gap-3.5">
      <SectionTitle>Picked for you</SectionTitle>
      <Shelf label="Picked for you">{startable.slice(0, 12).map((card) => <BadgeTile key={card.badge_uuid} card={card} orgslug={orgslug} />)}</Shelf>
    </section> : null}
    {feed.collections.map((collection) => <section key={collection.collection_uuid} aria-label={collection.name} className="flex flex-col gap-3.5">
      <SectionTitle href={collectionHref(orgslug, collection.collection_uuid)} aside={<CollectedPill cards={collection.badges} />}>{collection.name}</SectionTitle>
      <Shelf label={collection.name}>{collection.badges.map((card) => <BadgeTile key={card.badge_uuid} card={card} orgslug={orgslug} />)}</Shelf>
    </section>)}
    {loose.length && feed.collections.length ? <section aria-label="More badges" className="flex flex-col gap-3.5">
      <SectionTitle>More badges</SectionTitle>
      <Shelf label="More badges">{loose.map((card) => <BadgeTile key={card.badge_uuid} card={card} orgslug={orgslug} />)}</Shelf>
    </section> : null}
    {!feed.badges.length && !feed.keep_going.length ? <p className="rounded-2xl bg-white p-6 text-base font-bold text-[#5B6274]">{feed.earned_count ? 'You’ve earned every badge here. New ones land soon.' : 'No badges to earn yet. Check back soon.'}</p> : null}
    <section aria-label="Challenges" className="relative min-h-[300px] overflow-hidden rounded-[22px] bg-[#0E0A24]"><ChallengesArt compact /></section>
  </div>
}
