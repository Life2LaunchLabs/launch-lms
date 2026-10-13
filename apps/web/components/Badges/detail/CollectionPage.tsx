'use client'

import React from 'react'
import ContentPageHeader from '@components/Objects/StyledElements/Headers/ContentPageHeader'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import { cn } from '@/lib/utils'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { badgeDiscoverApi, type BadgeCollectionPage } from '@services/learning/badgeDiscover'
import { BadgeSticker, BadgeTile, CHUNKY } from '@components/Badges/discover/BadgeArt'
import { Endorsements } from './Endorsements'

const FAN = ['left-[8%] top-[110px] -rotate-[14deg]', 'left-[26%] top-[30px] -rotate-6', 'left-[38%] top-[100px] rotate-[4deg]', 'left-[64%] top-[20px] rotate-[10deg]', 'left-[70%] top-[150px] rotate-[16deg]']

/** A badge set: its story, how much of it you've collected, what's next and every badge in it. */
export default function CollectionPage({ orgslug, initialCollection }: { orgslug: string; initialCollection: BadgeCollectionPage }) {
  const router = useRouter()
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const { data: collection = initialCollection } = useSWR(['badge-collection', initialCollection.collection_uuid, token || 'public'], () => badgeDiscoverApi.collection(initialCollection.collection_uuid, token), { fallbackData: initialCollection, revalidateOnMount: Boolean(token) })
  const earned = collection.badges.filter((card) => card.earned).length
  const percent = collection.badges.length ? Math.round((earned * 100) / collection.badges.length) : 0
  const next = collection.badges.find((card) => card.plan) || collection.badges.find((card) => !card.earned && card.status === 'published')
  return <div className="min-h-screen bg-background text-[15px] leading-[1.45] text-foreground">
    <div className="mx-auto max-w-[1056px] px-6"><ContentPageHeader orgslug={orgslug} backLabel="Discover" onBack={() => router.push(getUriWithOrg(orgslug, routePaths.org.discover()))} noBottomMargin noHorizontalBleed /></div>
    <section className="relative overflow-hidden bg-muted">
      <div className="absolute inset-0 bg-[url('/landing/cta.png')] bg-cover bg-center opacity-50" aria-hidden="true" />
      <div className="relative mx-auto max-w-[1056px] px-4 pb-14 pt-6 sm:px-6">
        <div className="mt-2 flex flex-wrap-reverse items-center gap-8">
          <div className="flex min-w-0 flex-[999_1_440px] flex-col gap-4">
            <span className="self-start rounded-full bg-[#2B5FD9] px-3 py-1.5 text-xs font-black uppercase tracking-[.08em] text-white">Badge series · {collection.badges.length} badges</span>
            <h1 className="m-0 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{collection.name}</h1>
            {collection.description ? <p className="m-0 max-w-[540px] text-[21px] leading-snug text-[#3A4152]">{collection.description}</p> : null}
            {token ? <div className="mt-1.5 flex max-w-[420px] flex-col gap-2">
              <div className="flex justify-between text-[15px] font-black"><span>Your collection</span><span>{earned} of {collection.badges.length}</span></div>
              <span className="block h-3.5 overflow-hidden rounded-full bg-card shadow-[inset_0_0_0_2px_#D5DDF3]"><span className="block h-full rounded-full bg-[#2B5FD9]" style={{ width: `${percent}%` }} /></span>
            </div> : null}
          </div>
          <div className="relative hidden h-[320px] flex-[1_1_380px] md:block" aria-hidden="true">
            {collection.badges.slice(0, 5).map((card, index) => <span key={card.badge_uuid} className={cn('absolute', FAN[index])}><BadgeSticker src={card.thumbnail_image} name={card.name} size={index === 2 ? 170 : 125} /></span>)}
          </div>
        </div>
      </div>
    </section>
    <main className="mx-auto flex max-w-[1056px] flex-col gap-12 px-4 pb-24 pt-11 sm:px-6">
      {next && token ? <section aria-label="Up next in this series" className="flex flex-wrap items-center gap-6 rounded-3xl bg-[#111318] px-7 py-6 text-white">
        <BadgeSticker src={next.thumbnail_image} name={next.name} size={96} />
        <div className="flex flex-[1_1_260px] flex-col gap-0.5">
          <span className="text-xs font-black uppercase tracking-[.08em] text-[#D7F25C]">Your next badge</span>
          <strong className="text-[28px] font-black">{next.name}</strong>
          <span className="text-[#C6CAD6]">{next.plan ? `${next.plan.done} of ${next.plan.total} steps done.` : next.subtitle || 'Ready when you are.'}</span>
        </div>
        <Link href={next.plan ? getUriWithOrg(orgslug, routePaths.org.plan(next.plan.slug)) : getUriWithOrg(orgslug, routePaths.org.badgeDetail(next.badge_uuid.replace(/^badge_/, '')))} className={cn(CHUNKY, 'h-[54px] text-[17px] no-underline')}>{next.plan ? 'Keep going' : 'Start it'}</Link>
      </section> : null}
      <section aria-labelledby="all-badges" className="flex flex-col gap-[18px]">
        <h2 id="all-badges" className="m-0 text-3xl font-black">All {collection.badges.length} badges</h2>
        <div className="grid gap-x-[18px] gap-y-[22px] [grid-template-columns:repeat(auto-fill,minmax(176px,1fr))]">
          {collection.badges.map((card) => <BadgeTile key={card.badge_uuid} card={card} orgslug={orgslug} fill />)}
        </div>
      </section>
      <Endorsements collection={collection} creator={collection.creator} orgslug={orgslug} linkToSet={false} />
    </main>
  </div>
}
