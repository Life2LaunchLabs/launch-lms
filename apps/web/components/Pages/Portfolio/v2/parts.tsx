'use client'

import Link from 'next/link'
import type { ComponentType, ReactNode } from 'react'
import { ChevronRight, Plus } from 'lucide-react'

// Pieces the new portfolio front page shares: tile colors, generated covers, the tile frame and empty prompts.

/** Face, edge and soft tint for each tile color. */
export const PALETTE = {
  amber: ['#F5A524', '#B86E12', '#FFE7BD'],
  teal: ['#13B3A4', '#0B7D73', '#C9F2EE'],
  pink: ['#EC4F9A', '#B42C6F', '#FFD3E8'],
  blue: ['#4C8DFF', '#2F66D6', '#D6E5FF'],
  violet: ['#8B5CF6', '#6539D8', '#E4DAFF'],
  orange: ['#E8642C', '#A9431A', '#FFDCCB'],
  lime: ['#7CC423', '#548A12', '#E2F5C6'],
  sky: ['#2CB5E0', '#1A82A6', '#CDEFFA'],
} as const
export type TileColor = keyof typeof PALETTE
const COLORS = Object.keys(PALETTE) as TileColor[]

export function colorFor(seed: string): TileColor {
  let hash = 7
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 100000
  return COLORS[hash % COLORS.length]
}

/** A picture, or a colored stand-in when there isn't one, so every card has the same shape. */
export function Cover({ url, seed, label, className = '' }: { url?: string; seed: string; label?: string; className?: string }) {
  const [face, edge] = PALETTE[colorFor(seed)]
  if (url) return <img src={url} alt="" className={`h-full w-full object-cover ${className}`} />
  return <div aria-hidden="true" className={`relative flex h-full w-full items-end overflow-hidden p-2 ${className}`} style={{ background: `linear-gradient(135deg, ${face}, ${edge})` }}>
    <span className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/15" />
    <span className="absolute -bottom-8 left-4 h-16 w-16 rounded-full bg-black/10" />
    {label ? <span className="relative line-clamp-2 text-[11px] font-extrabold leading-tight text-white/90">{label}</span> : null}
  </div>
}

/** One section of the front page: a colored icon, the title and count, then a preview of what's inside. */
export function Tile({ color, icon: Icon, title, count, href, wide = false, children, label }: { color: TileColor; icon: ComponentType<{ className?: string }>; title: string; count?: number | null; href?: string; wide?: boolean; children: ReactNode; label?: string }) {
  const [face, edge] = PALETTE[color]
  const heading = <div className="flex items-center gap-2.5">
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-white" style={{ background: face, boxShadow: `0 3px 0 ${edge}` }}><Icon className="h-[17px] w-[17px]" /></span>
    <h2 className="min-w-0 flex-1 truncate text-[17px] font-extrabold">{href ? <Link href={href} className="outline-none after:absolute after:inset-0 after:rounded-3xl focus-visible:underline">{title}</Link> : title}</h2>
    {count ? <span className="text-[13px] font-bold tabular-nums text-muted-foreground">{count}</span> : null}
    {href ? <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" /> : null}
  </div>
  return <section aria-label={label || title} data-tile data-wide={wide || undefined} className="group relative flex min-w-0 flex-col gap-3.5 rounded-3xl border-2 border-border bg-card p-[18px] shadow-[0_4px_0_hsl(var(--border))] transition hover:-translate-y-0.5" style={{ ['--tile' as string]: face }}>
    {heading}
    {/* Links and buttons inside sit above the tile's own link. */}
    <div className="relative z-[1] flex min-w-0 flex-col gap-3.5 [&_a]:relative [&_button]:relative">{children}</div>
  </section>
}

/** What an owner sees where a section is empty: one dashed row that starts it. */
export function EmptyAdd({ title, hint, href, onClick }: { title: string; hint: string; href?: string; onClick?: () => void }) {
  const body = <><span className="grid h-10 w-10 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--org-primary-color)_14%,transparent)] text-[var(--org-primary-color)]"><Plus className="h-5 w-5" /></span><span className="min-w-0"><b className="block text-[14.5px] font-extrabold">{title}</b><small className="block text-[12.5px] font-semibold text-muted-foreground">{hint}</small></span></>
  const className = 'grid w-full grid-cols-[40px_minmax(0,1fr)] items-center gap-3 rounded-2xl border-2 border-dashed border-border p-3.5 text-left transition hover:border-[var(--org-primary-color)]'
  return href ? <Link href={href} className={className}>{body}</Link> : <button type="button" onClick={onClick} className={className}>{body}</button>
}

/** Opens or closes a dialog. */
// eslint-disable-next-line no-unused-vars
export type OpenChange = (open: boolean) => void

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?'
}

/** A round initial for someone without a photo, colored from their name. */
export function PersonDot({ name, className = 'h-8 w-8 text-[11px]' }: { name: string; className?: string }) {
  return <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full font-extrabold text-white ${className}`} style={{ background: PALETTE[colorFor(name)][1] }}>{initials(name)}</span>
}
