'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ChevronRight, Play, Sparkles, Star } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Shelf, SectionTitle } from '@components/Discover/PlanArt'
import { useResourceHref } from '@components/Discover/ResourceShelves'
import { getUriWithOrg } from '@services/config/config'
import { careersApi, exploreKey } from '@services/life/careers'
import { CAREER_TYPES, CareerTile, CareerIcon } from './CareerTile'
import { BATCH, batchProgress, deckKey } from './CareerSwipe'
import UnlockMatches from './UnlockMatches'

/**
 * Careers on Discover: the Career swipe billboard, then the careers closest to the learner's interests. Only for
 * signed-in learners in an organization that has added careers.
 */
export default function DiscoverCareers({ orgslug }: { orgslug: string }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token: string | undefined = session?.data?.tokens?.access_token
  const href = useResourceHref()
  const { data: deck } = useSWR(token && org?.id ? [...deckKey(org.id), token] : null, () => careersApi.deck(org.id, token!, BATCH))
  const { data: explore } = useSWR(token && org?.id ? [...exploreKey(org.id), token] : null, () => careersApi.explore(org.id, token!))
  const [progress, setProgress] = React.useState<{ at: number; of: number } | null>(null)
  React.useEffect(() => setProgress(batchProgress(org?.id)), [org?.id])
  if (!deck?.cards.length) return null
  const swipe = getUriWithOrg(orgslug, '/discover/careers')
  const exploreHref = getUriWithOrg(orgslug, '/discover/explore')
  // Three cards of different colors for the billboard's little stack.
  const icons = deck.cards.filter((card, index, all) => all.findIndex((other) => other.top_interests?.[0] === card.top_interests?.[0]) === index).concat(deck.cards).slice(0, 3)
  const starred = deck.cards.some((card) => card.my_place_pay)

  return <>
    {explore && !explore.quest.complete && token ? <UnlockMatches quest={explore.quest} orgslug={orgslug} orgId={org?.id} token={token} /> : null}
    {explore?.quest.complete ? <Link href={exploreHref} className="flex items-center gap-3 rounded-[20px] border-2 border-[var(--org-primary-color)] bg-card p-4 text-foreground no-underline shadow-[0_4px_0_color-mix(in_srgb,var(--org-primary-color)_35%,transparent)]">
      <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--org-primary-color)] text-[var(--org-on-primary-color)]"><Sparkles size={20} /></span>
      <span className="flex min-w-0 flex-1 flex-col"><span className="text-[17px] font-extrabold leading-tight">Your Explore home</span><span className="text-[13px] text-muted-foreground">Careers that fit you, with pay near home and how long training takes.</span></span>
      <ChevronRight size={20} className="shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link> : null}
    <section aria-label="Career swipe" className="relative isolate grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 overflow-hidden rounded-[22px] bg-[var(--org-primary-color)] p-5 text-[var(--org-on-primary-color)] shadow-[0_5px_0_color-mix(in_srgb,var(--org-primary-color)_68%,#000)]">
      <span aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(90%_120%_at_100%_0%,rgba(255,255,255,.25),transparent_60%)]" />
      <div>
        <small className="text-[11px] font-extrabold uppercase tracking-[0.08em] opacity-85">Discover tool</small>
        <h2 className="m-0 mt-0.5 text-[22px] font-extrabold leading-tight">Career swipe</h2>
        <p className="mb-3 mt-1.5 max-w-[42ch] text-[13.5px] opacity-90">
          {progress ? `You’re ${progress.at} of ${progress.of} in. Pick up where you left off.`
            : `${Math.min(BATCH, deck.total)} careers picked ${deck.has_quiz ? 'for your interests' : 'to start you off'}. Save the ones that catch your eye and say why.`}
        </p>
        <Link href={swipe} className="inline-flex items-center gap-2 rounded-[14px] bg-card px-4 py-2.5 text-sm font-extrabold text-foreground no-underline shadow-[0_3px_0_rgba(0,0,0,.25)]">
          <Play size={15} aria-hidden="true" />{progress ? 'Keep going' : 'Start'}
        </Link>
      </div>
      <div aria-hidden="true" className="relative h-[112px] w-[96px] shrink-0 max-[420px]:h-[86px] max-[420px]:w-[70px]">
        {icons.map((card, index) => {
          return <span key={card.code} className="absolute inset-0 grid place-items-center rounded-2xl text-white shadow-[0_3px_0_rgba(0,0,0,.2)]"
            style={{ backgroundColor: (CAREER_TYPES[card.top_interests?.[0]] || CAREER_TYPES.E).color, transform: [`rotate(-12deg) translateX(-14px)`, 'rotate(-2deg)', 'rotate(10deg) translateX(14px)'][index] }}>
            <CareerIcon code={card.code} className="h-9 w-9" />
          </span>
        })}
      </div>
    </section>
    <section aria-label="Careers for you" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <SectionTitle href={exploreHref}>Careers for you</SectionTitle>
        <p className="m-0 min-w-0 flex-1 text-sm text-muted-foreground">
          {deck.has_quiz ? 'Closest to your interests first.' : 'Take the interest quiz to see your closest matches first.'}
          {starred ? <> <Star size={12} className="inline fill-amber-500 align-[-1px] text-amber-500" aria-hidden="true" /> pay is where your plan goes.</> : null}
        </p>
      </div>
      <Shelf label="Careers for you">
        {deck.cards.map((card) => <Link key={card.code} href={href(card.resource_uuid)} scroll={false} className="text-foreground no-underline">
          <CareerTile career={{ ...card, pay: card.my_place_pay ? { yearly: card.my_place_pay.yearly } : card.pay }} star={Boolean(card.my_place_pay)} />
        </Link>)}
      </Shelf>
    </section>
  </>
}
