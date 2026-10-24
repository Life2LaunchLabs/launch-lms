'use client'

import React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@components/ui/button'
import { PlanCover } from '@components/Plans/shared/PlanCover'
import { BadgeMedal } from '@components/Badges/BadgeMedal'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { PlanOfferCard } from '@services/goals/planJoining'

/** Tile colors behind plan art, picked per plan so a row reads as a colorful shelf; each theme sets its own shades. */
const TILES = Array.from({ length: 7 }, (_, index) => `var(--badge-tile-${index})`)

export function tileColor(key: string): string {
  let hash = 0
  for (let index = 0; index < key.length; index += 1) hash = (hash * 31 + key.charCodeAt(index)) >>> 0
  return TILES[hash % TILES.length]
}

export const planHref = (orgslug: string, templateUuid: string) => getUriWithOrg(orgslug, routePaths.org.discoverPlan(templateUuid))
export const collectionHref = (orgslug: string, collectionUuid: string) => getUriWithOrg(orgslug, routePaths.org.discoverCollection(collectionUuid))

/** Shared action styles for Discover and a plan's page. */
export const CHUNKY = buttonVariants({ variant: 'brand', size: 'lg' })

/** A plan's art on a shelf: the badge it earns as a medal, else the plan's cover. */
export function PlanArt({ card, size = 120 }: { card: Pick<PlanOfferCard, 'template_uuid' | 'title' | 'thumbnail_image' | 'icon' | 'color' | 'badge'>; size?: number }) {
  if (card.badge) return <BadgeMedal badge={{ ...card.badge, icon: card.badge.icon ?? card.icon, color: card.badge.color ?? card.color }} size={size} />
  return <PlanCover plan={card} className="rounded-[22px] shadow-[0_6px_0_rgba(0,0,0,.12)]" iconSize={size * 0.4}><span className="block" style={{ width: size, height: size }} /></PlanCover>
}

function Tag({ card }: { card: PlanOfferCard }) {
  const [label, style] = card.state === 'earned' ? ['Earned', 'bg-[#D7F25C] text-[#111318]']
    : card.state === 'joined' ? ['In progress', 'bg-[var(--org-primary-color)] text-[var(--org-on-primary-color)]']
    : card.state === 'requested' ? ['Asked', 'bg-shell text-white']
    : card.badge ? ['Badge', 'bg-white/90 text-[#111318]'] : [null, '']
  if (!label) return null
  return <span className={cn('absolute left-2.5 top-2.5 rounded-full px-2 py-1 text-[11px] font-black uppercase tracking-wide', style)}>{label}</span>
}

/** A plan on a shelf: its art on a colored tile, its name and who offers it underneath. */
export function PlanTile({ card, orgslug, width = 196, fill = false }: { card: PlanOfferCard; orgslug: string; width?: number; fill?: boolean }) {
  const percent = card.goal?.total ? Math.round((card.goal.done * 100) / card.goal.total) : 0
  return <Link href={planHref(orgslug, card.template_uuid)} className={cn('group flex flex-col gap-2 text-foreground no-underline', fill ? 'w-full' : 'shrink-0')} style={fill ? undefined : { width }}>
    <span className="relative flex h-[180px] items-center justify-center rounded-[18px] transition-transform duration-200 group-hover:-translate-y-[3px]" style={{ backgroundColor: tileColor(card.template_uuid) }}>
      <span className="transition-transform duration-300 group-hover:-rotate-[5deg] group-hover:scale-105"><PlanArt card={card} /></span>
      <Tag card={card} />
      {card.goal ? <span className="absolute inset-x-3.5 bottom-3 block h-2 overflow-hidden rounded-full bg-white/80"><span className="block h-full rounded-full bg-[var(--org-primary-color)]" style={{ width: `${percent}%` }} /></span> : null}
    </span>
    <span className="px-0.5 text-base font-black leading-tight">{card.title}</span>
    {card.org ? <span className="-mt-1 truncate px-0.5 text-[13px] font-semibold text-muted-foreground">{card.org.name}</span> : null}
  </Link>
}

/** A horizontal shelf that scrolls on its own, without a visible scrollbar. */
export function Shelf({ children, label }: { children: React.ReactNode; label: string }) {
  return <div role="list" aria-label={label} className="-mx-1 flex gap-[18px] overflow-x-auto px-1 pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    {React.Children.map(children, (child) => <div role="listitem" className="contents">{child}</div>)}
  </div>
}

export function SectionTitle({ children, href, aside }: { children: React.ReactNode; href?: string; aside?: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3.5">
    <h2 className="m-0 text-xl font-extrabold tracking-tight text-foreground">{href ? <Link href={href} className="text-foreground no-underline hover:underline">{children} →</Link> : children}</h2>
    {aside}
  </div>
}

/** How many of a collection's badges the learner holds, when any of its plans earns one. */
export function CollectedPill({ cards }: { cards: PlanOfferCard[] }) {
  const badged = cards.filter((card) => card.badge)
  if (!badged.length) return null
  const earned = badged.filter((card) => card.state === 'earned').length
  return <span className="rounded-full bg-raised px-2.5 py-1 text-xs font-bold text-muted-foreground">{earned} of {badged.length} badges earned</span>
}
