'use client'

import { createElement, type ComponentType } from 'react'
import {
  Briefcase, Calculator, ChefHat, ClipboardList, CodeXml, Compass, DraftingCompass, Factory, FlaskConical, GraduationCap, Hammer, HandHeart,
  HeartPulse, Medal, Palette, Scale, Scissors, Shield, ShoppingBag, SprayCan, Stethoscope, TreePine, Truck, Wrench,
} from 'lucide-react'

// One career as a small tile: a square cover in the color of its strongest interest type, with an icon and how
// well it matches, then its title and "$104k · 4-year degree". Shared by the interest quiz's matches and the
// career explorer, so a career looks the same everywhere.

/** Each RIASEC type's fixed color and everyday name. */
export const CAREER_TYPES: Record<string, { color: string; name: string }> = {
  R: { color: '#e8742a', name: 'Building' }, I: { color: '#3b7bf0', name: 'Thinking' }, A: { color: '#d9468f', name: 'Creating' },
  S: { color: '#22a06b', name: 'Helping' }, E: { color: '#8b5cf6', name: 'Leading' }, C: { color: '#0e9aab', name: 'Organizing' },
}

/** O*NET job zones, said in a few words. */
export const TRAINING: Record<number, string> = { 1: 'Little or no prep', 2: 'High school + training', 3: 'Certificate or 2-year', 4: '4-year degree', 5: 'Grad school' }

/** How well a career's interest profile lines up with someone's (the correlation /life/careers/match returns). */
export const matchLabel = (match: number) => match >= 0.7 ? 'Strong match' : match >= 0.4 ? 'Good match' : 'Something different'

// An icon for each SOC major group (the first two digits of the code).
const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  '11': Briefcase, '13': Calculator, '15': CodeXml, '17': DraftingCompass, '19': FlaskConical, '21': HandHeart, '23': Scale, '25': GraduationCap,
  '27': Palette, '29': Stethoscope, '31': HeartPulse, '33': Shield, '35': ChefHat, '37': SprayCan, '39': Scissors, '41': ShoppingBag,
  '43': ClipboardList, '45': TreePine, '47': Hammer, '49': Wrench, '51': Factory, '53': Truck, '55': Medal,
}

/** The icon for a career's SOC major group. */
export function CareerIcon({ code, className }: { code: string; className?: string }) {
  return createElement(ICONS[code.slice(0, 2)] || Compass, { className })
}

const money = (value: number) => `$${Math.round(value / 1000)}k`

export type CareerTileCareer = { code: string; title: string; top_interests: string; job_zone?: number | null; match?: number | null; pay?: { yearly: number } | null }

export function CareerTile({ career, href, onOpen }: { career: CareerTileCareer; href?: string; onOpen?: () => void }) {
  const type = CAREER_TYPES[career.top_interests?.[0]] || CAREER_TYPES.E
  const line = [career.pay ? money(career.pay.yearly) : '', career.job_zone ? TRAINING[career.job_zone] : ''].filter(Boolean).join(' · ')
  const body = <>
    <span className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-[20px] text-white shadow-[0_4px_0_rgba(0,0,0,0.18)] transition-transform group-hover:-translate-y-0.5 group-active:translate-y-[3px]" style={{ background: type.color }}>
      <CareerIcon code={career.code} className="h-14 w-14 opacity-95" />
      {career.match != null ? <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10.5px] font-extrabold">{matchLabel(career.match)}</span> : null}
    </span>
    <b className="mt-2 line-clamp-2 text-[14px] font-extrabold leading-snug">{career.title}</b>
    {line ? <small className="block text-[12px] font-bold text-muted-foreground">{line}</small> : null}
  </>
  const className = 'group block w-[150px] shrink-0 snap-start text-left'
  if (href) return <a href={href} target="_blank" rel="noreferrer" className={className} aria-label={`${career.title}, ${type.name}`}>{body}</a>
  // Inside a link of its own (Discover's shelf), the tile is just its picture and words.
  return onOpen ? <button type="button" onClick={onOpen} className={className}>{body}</button> : <span className={className}>{body}</span>
}
