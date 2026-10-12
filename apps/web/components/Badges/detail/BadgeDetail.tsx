'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { BadgeCheck, ChevronLeft } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { badgeDiscoverApi, type BadgePage } from '@services/learning/badgeDiscover'
import { badgeRoutesApi } from '@services/learning/badgeRoutes'
import { requestIssuerLearnerSupport } from '@services/learning/marketplace'
import { BadgeSticker, CollectedPill, collectionHref, tileColor } from '@components/Badges/discover/BadgeArt'
import EarnWith, { ActionButton, earnOptions, optionKey, type EarnAction, type EarnOption } from './EarnWith'
import { Endorsements } from './Endorsements'

const PROVES_TONES = ['#DDF1E8', '#FCEBCB', '#EEE3FC', '#DCE6FB']

function Hero({ page, orgslug, action, steps }: { page: BadgePage; orgslug: string; action: EarnAction; steps: number }) {
  const chips = [steps ? `${steps} step${steps === 1 ? '' : 's'}` : '', page.time_label, 'Verified badge'].filter(Boolean)
  const position = page.collection ? page.collection.badges.length + 1 : 0
  return <section className="relative overflow-hidden bg-[#2E62C9] bg-[url('/rough_blue_background.png')] bg-cover bg-center">
    <div className="absolute inset-0 bg-[url('/landing/cta.png')] bg-cover bg-center opacity-40" aria-hidden="true" />
    <div className="relative mx-auto max-w-[1280px] px-4 pb-16 pt-6 sm:px-8">
      <Link href={getUriWithOrg(orgslug, routePaths.org.badges())} className="inline-flex min-h-11 items-center gap-1 text-sm font-black text-white no-underline"><ChevronLeft size={16} />Discover</Link>
      <div className="mt-3 flex flex-wrap-reverse items-center gap-10">
        <div className="flex min-w-0 flex-[999_1_460px] flex-col gap-[18px]">
          {page.collection ? <Link href={collectionHref(orgslug, page.collection.collection_uuid)} className="self-start rounded-full bg-white px-3 py-1.5 text-xs font-black uppercase tracking-[.08em] text-[#111318] no-underline">{page.collection.name} · {position} badges</Link> : null}
          <h1 className="m-0 text-6xl font-black leading-[.95] tracking-tight text-white sm:text-[88px]">{page.name}</h1>
          {page.subtitle || page.description ? <p className="m-0 max-w-[520px] text-[22px] leading-snug text-[#EAF0FF]">{page.subtitle || page.description}</p> : null}
          <div className="flex flex-wrap gap-2">{chips.map((chip) => <span key={chip} className="rounded-full border border-white/30 bg-white/15 px-3 py-1.5 text-sm font-bold text-white">{chip}</span>)}</div>
          <div className="mt-2.5 flex flex-wrap items-center gap-[18px]">
            <ActionButton action={action} className="h-[62px] rounded-2xl px-9 text-[19px]" />
            {!page.ways.plan && !page.earned ? <span className="max-w-[220px] text-sm text-[#EAF0FF]">It shows up in My plans as soon as you start.</span> : null}
          </div>
        </div>
        <div className="relative flex min-h-[300px] flex-[1_1_320px] items-center justify-center sm:min-h-[380px]">
          <div aria-hidden="true" className="absolute h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,.38)_0%,rgba(255,255,255,0)_68%)]" />
          <span className="relative -rotate-3"><BadgeSticker src={page.thumbnail_image} name={page.name} size={300} /></span>
        </div>
      </div>
    </div>
  </section>
}

function Proves({ page }: { page: BadgePage }) {
  if (!page.proves.length && !page.about) return null
  return <section aria-labelledby="proves-title" className="flex flex-col gap-5">
    <h2 id="proves-title" className="m-0 text-4xl font-black leading-tight tracking-tight">What it proves you can do</h2>
    {page.proves.length ? <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
      {page.proves.map((item, index) => <div key={`${item.title}-${index}`} className="flex min-h-[170px] flex-col gap-3.5 rounded-[20px] p-6" style={{ backgroundColor: PROVES_TONES[index % PROVES_TONES.length] }}>
        {item.media_url ? <img src={item.media_url} alt="" className="h-16 w-16 rounded-xl object-cover" /> : <BadgeCheck size={40} strokeWidth={2.4} aria-hidden="true" />}
        <strong className="text-[21px] leading-tight">{item.title}</strong>
        {item.body ? <p className="m-0 text-[15px] text-[#3A4152]">{item.body}</p> : null}
      </div>)}
    </div> : <p className="m-0 max-w-3xl text-lg text-[#3A4152]">{page.about}</p>}
  </section>
}

function CollectTheSet({ page, orgslug }: { page: BadgePage; orgslug: string }) {
  const collection = page.collection
  if (!collection || !collection.badges.length) return null
  const set = [page, ...collection.badges]
  return <section aria-labelledby="set-title" className="flex flex-col gap-[18px]">
    <div className="flex flex-wrap items-center gap-3.5">
      <h2 id="set-title" className="m-0 text-4xl font-black leading-tight tracking-tight"><Link href={collectionHref(orgslug, collection.collection_uuid)} className="text-[#111318] no-underline hover:underline">Collect the set →</Link></h2>
      <CollectedPill cards={set} />
    </div>
    <div className="-mx-1 flex gap-[22px] overflow-x-auto px-1 pb-3 pt-2 [scrollbar-width:none]">
      {set.map((card) => <Link key={card.badge_uuid} href={getUriWithOrg(orgslug, routePaths.org.badgeDetail(card.badge_uuid.replace(/^badge_/, '')))} aria-current={card.badge_uuid === page.badge_uuid ? 'page' : undefined}
        className="flex w-[104px] shrink-0 flex-col items-center gap-2 text-center text-[#111318] no-underline">
        <span className="flex h-[104px] w-[104px] items-center justify-center rounded-3xl" style={{ backgroundColor: card.badge_uuid === page.badge_uuid ? tileColor(card.badge_uuid) : 'transparent', opacity: card.earned || card.badge_uuid === page.badge_uuid ? 1 : 0.55 }}>
          <BadgeSticker src={card.thumbnail_image} name={card.name} size={88} />
        </span>
        <span className="text-sm font-black leading-tight">{card.name}</span>
      </Link>)}
    </div>
  </section>
}

/** A badge's page: why it's worth earning, how to earn it, and the set it belongs to. */
export default function BadgeDetail({ orgslug, initialPage }: { orgslug: string; initialPage: BadgePage }) {
  const router = useRouter()
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const { data: page = initialPage, mutate } = useSWR(['badge-page', initialPage.badge_uuid, token || 'public'], () => badgeDiscoverApi.badge(initialPage.badge_uuid, token), { fallbackData: initialPage, revalidateOnMount: Boolean(token) })
  const options = React.useMemo(() => earnOptions(page), [page])
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null)
  const selected = options.find((option) => optionKey(option) === selectedKey) || options[0]
  const [busy, setBusy] = React.useState(false)

  const start = async (option: EarnOption) => {
    setBusy(true)
    try {
      const plan = await badgeRoutesApi.start(page.badge_uuid, { program_uuid: option.route.program_uuid, issuer_org_id: option.issuer.org.id }, token)
      toast.success('Added to My plans')
      router.push(getUriWithOrg(orgslug, routePaths.org.plan(plan.slug)))
    } catch (error: any) {
      toast.error(error?.message || 'Could not start this badge.')
      setBusy(false)
    }
  }
  const ask = async (option: EarnOption) => {
    setBusy(true)
    try {
      const link = await requestIssuerLearnerSupport({ badge_uuid: page.badge_uuid, issuer_org_id: option.issuer.org.id }, token)
      toast.success(link?.active ? `${option.issuer.org.name} joined you. You can start now.` : `Request sent to ${option.issuer.org.name}.`)
      await mutate()
    } catch (error: any) {
      toast.error(error?.message || 'Could not send your request.')
    } finally {
      setBusy(false)
    }
  }

  const here = getUriWithOrg(orgslug, routePaths.org.badgeDetail(page.badge_uuid.replace(/^badge_/, '')))
  const action: EarnAction = page.ways.plan ? { label: page.ways.plan.status === 'completed' ? 'See your plan' : 'Keep going', href: getUriWithOrg(orgslug, routePaths.org.plan(page.ways.plan.slug)) }
    : page.earned ? { label: 'You earned this', href: getUriWithOrg(orgslug, routePaths.org.portfolioBadges()) }
    : page.status === 'coming_soon' ? { label: 'Coming soon', disabled: true }
    : !selected ? { label: 'Not open yet', disabled: true }
    : !token ? { label: 'Sign in to start', href: `/login?next=${encodeURIComponent(here)}` }
    : selected.issuer.can_start ? { label: 'Start earning', onClick: () => void start(selected), busy }
    : selected.issuer.request_status === 'pending' ? { label: 'Request sent', disabled: true }
    : selected.issuer.access === 'request' ? { label: `Ask ${selected.issuer.org.name}`, onClick: () => void ask(selected), busy }
    : { label: 'Invite only', disabled: true }

  return <div className="min-h-screen bg-[#F4F5F9] text-[15px] leading-[1.45] text-[#111318]">
    <Hero page={page} orgslug={orgslug} action={action} steps={selected?.route.step_count || 0} />
    <main className="mx-auto flex max-w-[1280px] flex-col gap-[72px] px-4 pb-24 pt-14 sm:px-8">
      <Proves page={page} />
      <Endorsements collection={page.collection} trustLine={page.trust_line} creator={page.creator} orgslug={orgslug} />
      {selected ? <EarnWith page={page} options={options} selected={selected} onSelect={(option) => setSelectedKey(optionKey(option))} action={action} /> : null}
      <CollectTheSet page={page} orgslug={orgslug} />
    </main>
  </div>
}
