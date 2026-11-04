'use client'

import Link from 'next/link'
import type { ComponentType, ReactNode } from 'react'
import { ChevronRight, GripVertical, Pencil, Plus } from 'lucide-react'
import type { SectionType } from '@services/portfolio/records'
import { useSection } from './stack/SectionStack'

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

/**
 * One section of the front page: a colored icon, the title and count, then a preview of what's inside.
 * In the section stack it takes its title from the stack (the learner's name for it, or the look's), and in
 * edit mode its header row turns into the section's controls: a grip, the title to rename, and the rest.
 */
export function Tile({ color, icon: Icon, title, count, href, wide = false, children, label, spot, section }: { color: TileColor; icon: ComponentType<{ className?: string }>; title: string; count?: number | null; href?: string; wide?: boolean; children: ReactNode; label?: string; spot?: string; section?: SectionType }) {
  const [face, edge] = PALETTE[color]
  const ctx = useSection(section)
  const editing = Boolean(ctx?.editing)
  const shown = ctx?.title || title
  const heading = <div className="flex min-w-0 items-center gap-2.5" data-tile-head>
    {editing ? <GripVertical className="-ml-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
    <span data-tile-icon className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-white" style={{ background: face, boxShadow: `0 3px 0 ${edge}` }}><Icon className="h-[17px] w-[17px]" /></span>
    <h2 data-tile-title className="min-w-0 truncate text-[17px] font-extrabold">{editing && ctx?.rename ? <EditableTitle value={shown} onSave={ctx.rename} />
      : href && !editing ? <Link href={href} className="outline-none after:absolute after:inset-0 after:rounded-3xl focus-visible:underline">{shown}</Link> : shown}</h2>
    {!editing && ctx?.edit ? <EditButton label={shown} onClick={ctx.edit} /> : null}
    <span className="flex-1" />
    {editing ? ctx?.controls : <>
      {count ? <span data-tile-count className="text-[13px] font-bold tabular-nums text-muted-foreground">{count}</span> : null}
      {href ? <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" /> : null}
    </>}
  </div>
  return <section aria-label={label || title} data-tile data-spot={spot ? "" : undefined} data-wide={wide || undefined} className={`@container group relative flex min-w-0 flex-col gap-3.5 rounded-3xl border-2 bg-card p-[18px] shadow-[0_4px_0_hsl(var(--border))] transition ${editing ? '' : 'hover:-translate-y-0.5'} ${spot ? SPOT_RING : 'border-border'}`} style={{ ['--tile' as string]: face }}>
    {spot ? <SpotTip label={spot} /> : null}
    {heading}
    {/* Links and buttons inside sit above the tile's own link. In a section with a set height, what doesn't fit is hidden. */}
    <div data-fit-box className={`relative z-[1] flex min-w-0 flex-col gap-3.5 [&_a]:relative [&_button]:relative ${ctx?.fixed ? 'min-h-0 flex-1 overflow-hidden' : ''}`}>{children}</div>
  </section>
}

/** The pencil beside a section's title that opens what edits it. It shows on hover (always on touch screens). */
export function EditButton({ label, onClick, className = '' }: { label: string; onClick: () => void; className?: string }) {
  return <button type="button" data-section-edit onClick={(event) => { event.preventDefault(); event.stopPropagation(); onClick() }} aria-label={`Edit ${label}`} title={`Edit ${label}`}
    className={`relative z-[2] grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 transition hover:bg-raised hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 group-hover/sec:opacity-100 [@media(hover:none)]:opacity-100 ${className}`}><Pencil className="h-4 w-4" /></button>
}

/** The edit pencil for a section with no title row (highlights, featured): top left, over the section. */
export function CornerEdit({ section, label }: { section: SectionType; label: string }) {
  const ctx = useSection(section)
  if (!ctx?.edit || ctx.editing) return null
  return <EditButton label={label} onClick={ctx.edit} className="absolute left-2 top-2 z-[4] border border-border bg-card shadow-sm" />
}

/** A section title renamed in place: click, type, Enter or click away to keep it, Escape to leave it. */
export function EditableTitle({ value, onSave }: { value: string; onSave: (next: string) => void }) { // eslint-disable-line no-unused-vars
  return <span data-edit-control contentEditable suppressContentEditableWarning spellCheck={false} role="textbox" aria-label="Section title" title="Click to rename"
    className="cursor-text rounded-md px-1 outline-none ring-[var(--org-primary-color)] decoration-dashed decoration-2 underline-offset-4 hover:underline focus:ring-2"
    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); (event.target as HTMLElement).blur() } else if (event.key === 'Escape') { (event.target as HTMLElement).textContent = value; (event.target as HTMLElement).blur() } }}
    onBlur={(event) => { const next = (event.target.textContent || '').trim(); if (next !== value) onSave(next) }}>{value}</span>
}

/** The header row a section without one (highlights, featured) gets in edit mode, for its controls. */
export function SectionBar({ section }: { section: SectionType }) {
  const ctx = useSection(section)
  if (!ctx?.editing) return null
  return <div className="mb-2 flex min-w-0 items-center gap-2.5" data-tile-head>
    <GripVertical className="-ml-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    <h2 className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-muted-foreground">{ctx.rename ? <EditableTitle value={ctx.title} onSave={ctx.rename} /> : ctx.title}</h2>
    {ctx.controls}
  </div>
}

/** What an owner sees where a section is empty: one dashed row that starts it. */
export function EmptyAdd({ title, hint, href, onClick }: { title: string; hint: string; href?: string; onClick?: () => void }) {
  const body = <><span className="grid h-10 w-10 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--org-primary-color)_14%,transparent)] text-[var(--org-primary-color)]"><Plus className="h-5 w-5" /></span><span className="min-w-0"><b className="block text-[14.5px] font-extrabold">{title}</b><small className="block text-[12.5px] font-semibold text-muted-foreground">{hint}</small></span></>
  const className = 'grid w-full grid-cols-[40px_minmax(0,1fr)] items-center gap-3 rounded-2xl border-2 border-dashed border-border p-3.5 text-left transition hover:border-[var(--org-primary-color)]'
  return href ? <Link href={href} data-empty-add className={className}>{body}</Link> : <button type="button" data-empty-add onClick={onClick} className={className}>{body}</button>
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

/** Where a quest item is done: the spot gets this gold outline and a "!" saying what to do there. */
export const SPOT_RING = 'border-[#f29400] ring-4 ring-[#ffc21a]/35'

/** The gold "!" the quest banner and its spots share (a starburst, as in the prototype). */
export function QuestMark({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  const points = Array.from({ length: 24 }, (_, index) => { const r = index % 2 ? 8.6 : 11.5, a = (index * Math.PI) / 12; return `${(12 + r * Math.sin(a)).toFixed(2)},${(12 - r * Math.cos(a)).toFixed(2)}` }).join(' ')
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={`shrink-0 ${className}`}><polygon points={points} fill="#ffc21a" stroke="#f29400" strokeWidth="1.6" strokeLinejoin="round" /><path d="M12 7v6.5M12 16.6v.4" stroke="#4a2a00" strokeWidth="2.6" strokeLinecap="round" /></svg>
}

/**
 * A gold "!" on a spot. What to do there opens out beside it when the pointer is over the spot (or the
 * "!" itself), so the page isn't covered in labels; screen readers always get the words.
 */
export function SpotTip({ label, className = 'absolute -top-3.5 right-4' }: { label: string; className?: string }) {
  const open = 'group-hover:max-w-[260px] group-hover:pl-1 group-hover:pr-2.5 group-hover:opacity-100 group-focus-within:max-w-[260px] group-focus-within:pl-1 group-focus-within:pr-2.5 group-focus-within:opacity-100 [[data-spot-tip]:hover_&]:max-w-[260px] [[data-spot-tip]:hover_&]:pl-1 [[data-spot-tip]:hover_&]:pr-2.5 [[data-spot-tip]:hover_&]:opacity-100'
  return <span data-spot-tip title={label} className={`${className} z-[3] inline-flex max-w-[calc(100%-32px)] items-center rounded-full bg-[#ffc21a] p-[3px] text-[12.5px] font-extrabold text-[#4a2a00] shadow-[0_2px_0_#f29400]`}>
    <QuestMark className="h-5 w-5" />
    <span className={`max-w-0 overflow-hidden truncate whitespace-nowrap opacity-0 transition-all duration-200 ${open}`}>{label}</span>
  </span>
}
