'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
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
 * In the section stack it takes its title from the stack (the learner's name for it, or the look's). For the
 * owner the header row also carries the section's tools, shown when the section is pointed at: a grip to
 * move it, the title to rename, a pencil to its editor and the button that takes it out.
 */
export function Tile({ color, icon: Icon, title, count, href, wide = false, children, label, spot, section }: { color: TileColor; icon: ComponentType<{ className?: string }>; title: string; count?: number | null; href?: string; wide?: boolean; children: ReactNode; label?: string; spot?: string; section?: SectionType }) {
  const [face, edge] = PALETTE[color]
  const ctx = useSection(section)
  const editing = Boolean(ctx?.editing)
  const shown = ctx?.title || title
  const [renaming, setRenaming] = useState(false)
  const arrow = <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
  // The title (and anywhere in the tile that isn't its own link or button) opens the section's page; the
  // pencil beside it makes the title editable, so renaming never gets in the way of getting there.
  const heading = <div className="relative flex min-w-0 items-center gap-2.5" data-tile-head>
    {/* Out in the margin, so the header doesn't shift when the tools show. */}
    {editing ? <Grip label={shown} className="absolute -left-[19px] top-1/2 !w-4 -translate-y-1/2" /> : null}
    <span data-tile-icon className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-white" style={{ background: face, boxShadow: `0 3px 0 ${edge}` }}><Icon className="h-[17px] w-[17px]" /></span>
    <h2 data-tile-title className={`min-w-0 truncate text-[17px] font-extrabold ${renaming ? 'relative z-[2]' : ''}`}>{renaming && ctx?.rename ? <EditableTitle value={shown} onSave={ctx.rename} autoFocus onDone={() => setRenaming(false)} />
      : href ? <Link href={href} className="outline-none focus-visible:underline">{shown}</Link> : shown}</h2>
    {editing && ctx?.rename && !renaming ? <EditButton label={`the name of ${shown}`} onClick={() => setRenaming(true)} /> : null}
    <span className="flex-1" />
    {count ? <span data-tile-count className="text-[13px] font-bold tabular-nums text-muted-foreground">{count}</span> : null}
    {href ? arrow : null}
    {editing ? ctx?.controls : null}
  </div>
  return <section aria-label={label || title} data-tile data-spot={spot ? "" : undefined} data-wide={wide || undefined} className={`@container group relative flex min-w-0 flex-col gap-3.5 rounded-3xl border-2 bg-card p-[18px] shadow-[0_4px_0_hsl(var(--border))] transition ${href ? 'hover:-translate-y-0.5' : ''} ${spot ? SPOT_RING : 'border-border'}`} style={{ ['--tile' as string]: face }}>
    {/* The whole tile opens the section's page; the title is the same link for keyboards and screen readers. */}
    {href ? <Link href={href} aria-hidden="true" tabIndex={-1} data-tile-link className="absolute inset-0 rounded-3xl" /> : null}
    {spot ? <SpotTip label={spot} /> : null}
    {heading}
    {/* Not positioned itself, so the tile's link covers its empty space; links, buttons and fields inside sit
        above that link. In a section with a set height, what doesn't fit is hidden. */}
    <div data-fit-box className={`flex min-w-0 flex-col gap-3.5 [&_a]:relative [&_button]:relative [&_input]:relative [&_textarea]:relative [&_[contenteditable]]:relative ${ctx?.fixed ? 'min-h-0 flex-1 overflow-hidden' : ''}`}>{children}</div>
  </section>
}

/** The handle a section is moved by. Only it starts a drag, so everything else in the section keeps working. */
export function Grip({ label, className = '-ml-1' }: { label: string; className?: string }) {
  return <button type="button" data-grip data-sec-tool aria-label={`Move ${label}`} title="Drag to move" className={`z-[2] grid h-8 w-5 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground active:cursor-grabbing ${className}`}><GripVertical className="h-4 w-4" /></button>
}

/** The pencil beside a section's title that opens what edits it. It shows on hover (always on touch screens). */
export function EditButton({ label, onClick, className = '' }: { label: string; onClick: () => void; className?: string }) {
  return <button type="button" data-section-edit onClick={(event) => { event.preventDefault(); event.stopPropagation(); onClick() }} aria-label={`Edit ${label}`} title={`Edit ${label}`}
    className={`relative z-[2] grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 transition hover:bg-raised hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 group-hover/sec:opacity-100 [@media(hover:none)]:opacity-100 ${className}`}><Pencil className="h-4 w-4" /></button>
}

/** The owner's tools for a section with no title row (highlights, featured): grip, pencil and take out, top left over it. */
export function SectionTools({ section, label }: { section: SectionType; label: string }) {
  const ctx = useSection(section)
  if (!ctx?.editing) return null
  return <div data-sec-tool className="absolute left-2 top-2 z-[4] flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5 shadow-sm">
    <Grip label={label} className="ml-0.5" />
    {ctx.edit ? <EditButton label={label} onClick={ctx.edit} className="!h-7 !w-7 !opacity-100" /> : null}
    {ctx.controls}
  </div>
}

/** A section title renamed in place: click, type, Enter or click away to keep it, Escape to leave it. */
export function EditableTitle({ value, onSave, autoFocus = false, onDone }: { value: string; onSave: (next: string) => void; autoFocus?: boolean; onDone?: () => void }) { // eslint-disable-line no-unused-vars
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!autoFocus || !node) return
    node.focus()
    const range = document.createRange(); range.selectNodeContents(node)
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range)
  }, [autoFocus])
  return <span ref={ref} data-edit-control contentEditable suppressContentEditableWarning spellCheck={false} role="textbox" aria-label="Section title" title="Click to rename"
    className="cursor-text rounded-md px-1 outline-none ring-[var(--org-primary-color)] decoration-dashed decoration-2 underline-offset-4 hover:underline focus:ring-2"
    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); (event.target as HTMLElement).blur() } else if (event.key === 'Escape') { (event.target as HTMLElement).textContent = value; (event.target as HTMLElement).blur() } }}
    onBlur={(event) => { const next = (event.target.textContent || '').trim(); if (next !== value) onSave(next); onDone?.() }}>{value}</span>
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
