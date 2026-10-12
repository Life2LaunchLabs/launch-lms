'use client'

import React from 'react'
import Link from 'next/link'
import { Award } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { BadgeCard } from '@services/learning/badgeDiscover'

/** Soft tile colors behind badge art, picked per badge so a row reads as a colorful shelf. */
const TILES = ['#DDF1E8', '#DCE6FB', '#FCEBCB', '#FBDDE2', '#EEE3FC', '#F1F8D0', '#F7EED6']

export function tileColor(key: string): string {
  let hash = 0
  for (let index = 0; index < key.length; index += 1) hash = (hash * 31 + key.charCodeAt(index)) >>> 0
  return TILES[hash % TILES.length]
}

export const badgeHref = (orgslug: string, badgeUuid: string) => getUriWithOrg(orgslug, routePaths.org.badgeDetail(badgeUuid.replace(/^badge_/, '')))
export const collectionHref = (orgslug: string, collectionUuid: string) => getUriWithOrg(orgslug, `/badges/collections/${collectionUuid.replace(/^badge_collection_/, '')}`)

/** The chunky lime call to action from the learner designs. */
export const CHUNKY = 'inline-flex items-center justify-center gap-2 rounded-2xl bg-[#D7F25C] px-7 font-black text-[#111318] shadow-[0_5px_0_#8BA42C] transition active:translate-y-[3px] active:shadow-[0_2px_0_#8BA42C] disabled:opacity-60'
export const CHUNKY_DARK = 'inline-flex items-center justify-center gap-2 rounded-2xl bg-[#111318] px-6 font-black text-white shadow-[0_5px_0_#000] transition active:translate-y-[3px] active:shadow-[0_2px_0_#000]'

/** Badge artwork as a die-cut sticker; badges without art get a medal. */
export function BadgeSticker({ src, name, size = 136, className }: { src?: string; name: string; size?: number; className?: string }) {
  if (src) {
    return <img src={src} alt="" width={size} height={size} className={cn('badge-sticker-image object-contain', className)} style={{ width: size, height: size }} />
  }
  return <span aria-hidden="true" className={cn('badge-sticker-image flex items-center justify-center rounded-full border-[3px] border-[#111318] bg-[#3E74DB] text-white', className)} style={{ width: size * 0.8, height: size * 0.8 }}>
    <Award size={size * 0.4} strokeWidth={2.2} />
    <span className="sr-only">{name}</span>
  </span>
}

function Tag({ card }: { card: BadgeCard }) {
  const [label, style] = card.earned ? ['Earned', 'bg-[#D7F25C] text-[#111318]']
    : card.plan ? ['In progress', 'bg-[#2B5FD9] text-white']
    : card.status === 'coming_soon' ? ['Soon', 'bg-[#111318] text-white'] : [null, '']
  if (!label) return null
  return <span className={cn('absolute left-2.5 top-2.5 rounded-full px-2 py-1 text-[11px] font-black uppercase tracking-wide', style)}>{label}</span>
}

/** A badge on a shelf: big art on a colored tile, its name underneath. */
export function BadgeTile({ card, orgslug, width = 196, fill = false }: { card: BadgeCard; orgslug: string; width?: number; fill?: boolean }) {
  const percent = card.plan?.total ? Math.round((card.plan.done * 100) / card.plan.total) : 0
  return <Link href={badgeHref(orgslug, card.badge_uuid)} className={cn('group flex flex-col gap-2.5 text-[#111318] no-underline', fill ? 'w-full' : 'shrink-0')} style={fill ? undefined : { width }}>
    <span className="relative flex h-[220px] items-center justify-center rounded-[18px] transition-transform duration-200 group-hover:-translate-y-[3px]" style={{ backgroundColor: tileColor(card.badge_uuid) }}>
      <span className="transition-transform duration-300 group-hover:-rotate-[5deg] group-hover:scale-105"><BadgeSticker src={card.thumbnail_image} name={card.name} /></span>
      <Tag card={card} />
      {card.plan ? <span className="absolute inset-x-3.5 bottom-3 block h-2 overflow-hidden rounded-full bg-white/80"><span className="block h-full rounded-full bg-[#2B5FD9]" style={{ width: `${percent}%` }} /></span> : null}
    </span>
    <span className="px-0.5 text-base font-black leading-tight">{card.name}</span>
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
    <h2 className="m-0 text-2xl font-black tracking-tight text-[#111318]">{href ? <Link href={href} className="text-[#111318] no-underline hover:underline">{children} →</Link> : children}</h2>
    {aside}
  </div>
}

export function CollectedPill({ cards }: { cards: BadgeCard[] }) {
  const earned = cards.filter((card) => card.earned).length
  return <span className="rounded-full bg-[#E5ECFC] px-2.5 py-1 text-[13px] font-black text-[#2B5FD9]">{earned} of {cards.length} collected</span>
}
