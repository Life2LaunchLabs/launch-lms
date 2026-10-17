'use client'

import React from 'react'
import Link from 'next/link'
import { BookOpen, ExternalLink, FileText, LayoutGrid, Link2, Loader2, Maximize2, NotebookPen, Pin, PinOff, Plus, Rows3, Search, Star, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { Input } from '@components/ui/input'
import { Textarea } from '@components/ui/textarea'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { normalizeMediaUrl } from '@services/media/media'
import type { Step, StepEntry } from '@services/goals/types'
import type { StepActions } from './registry'
import { AddToBoard, useBoardIngest } from './exploreAdd'

export type Evidence = 'resource' | 'link' | 'file' | 'note'
export const EVIDENCE: Evidence[] = ['resource', 'link', 'file', 'note']
export const KIND = { resource: { icon: BookOpen, label: 'Library' }, link: { icon: Link2, label: 'Links' }, file: { icon: FileText, label: 'Files' }, note: { icon: NotebookPen, label: 'Notes' } }
export const evidenceOf = (step: Step<'explore'>) => step.entries.filter((entry) => (EVIDENCE as string[]).includes(entry.kind))
export const pinned = (entry: StepEntry) => Boolean(entry.data?.pinned)
const ratingOf = (entry: StepEntry) => Number(entry.data?.rating) || 0
const imageOf = (entry: StepEntry) => {
  const image = String(entry.data?.image || '')
  if (image) return normalizeMediaUrl(image)
  return entry.kind === 'file' && /\.(png|jpe?g|gif|webp)(\?|$)/i.test(entry.url) ? normalizeMediaUrl(entry.url) : ''
}
const titleOf = (entry: StepEntry) => entry.title || entry.note.split('\n')[0] || entry.url || 'Untitled'

/** Where an entry opens: library resources inside the app, everything else in a new tab. */
function openHref(entry: StepEntry, orgslug: string) {
  if (entry.kind === 'resource' && entry.resource_uuid) return getUriWithOrg(orgslug, routePaths.org.resource(entry.resource_uuid))
  return entry.kind === 'file' ? normalizeMediaUrl(entry.url) : entry.kind === 'note' ? '' : entry.url
}

type Sort = 'newest' | 'oldest' | 'title' | 'rating'
type View = 'grid' | 'stack'
const VIEW_KEY = 'goals.explore.view'

/** The board's square picture: the entry's image, or its kind's icon. */
export function Thumb({ entry, className }: { entry: StepEntry; className?: string }) {
  const image = imageOf(entry)
  const Icon = KIND[entry.kind as Evidence]?.icon || FileText
  return <span className={cn('relative block aspect-square shrink-0 overflow-hidden rounded-xl bg-[color-mix(in_srgb,var(--plan-face)_10%,hsl(var(--card)))]', className)}>
    {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center text-[var(--plan-accent)]"><Icon size={20} aria-hidden="true" /></span>}
    {pinned(entry) ? <span className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--plan-face)] text-[var(--plan-face-ink)]" aria-label="Pinned"><Pin size={11} /></span> : null}
  </span>
}

// eslint-disable-next-line no-unused-vars
function Stars({ value, onChange, size = 14 }: { value: number; onChange?: (value: number) => void; size?: number }) {
  if (!onChange && !value) return null
  return <span className="flex items-center" role={onChange ? 'radiogroup' : undefined} aria-label={onChange ? 'Rating' : `${value} of 5 stars`}>
    {[1, 2, 3, 4, 5].map((star) => {
      const icon = <Star size={size} aria-hidden="true" className={star <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'} />
      return onChange ? <button key={star} type="button" role="radio" aria-checked={value === star} aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`} onClick={() => onChange(value === star ? 0 : star)} className="p-0.5">{icon}</button> : <span key={star}>{icon}</span>
    })}
  </span>
}

type EntryProps = { entry: StepEntry; actions: StepActions; open: boolean; ratings: boolean; orgslug: string; onClose: () => void }

/** A selected entry, full width: its title, notes, rating and pin, all editable while the step is open. */
function EntryEditor({ entry, actions, open, ratings, orgslug, onClose }: EntryProps) {
  const [title, setTitle] = React.useState(entry.title)
  const [note, setNote] = React.useState(entry.note)
  React.useEffect(() => { setTitle(entry.title); setNote(entry.note) }, [entry.entry_uuid, entry.title, entry.note])
  const href = openHref(entry, orgslug)
  const setData = (patch: Record<string, unknown>) => actions.updateEntry(entry.entry_uuid, { data: patch })
  const OpenLink = entry.kind === 'resource' ? Link : 'a'
  return <div className="col-span-full flex flex-col gap-3 rounded-2xl border-2 border-[var(--plan-face)] bg-background p-3 sm:flex-row">
    <Thumb entry={entry} className="w-24 sm:w-32" />
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex items-start gap-1">
        {open ? <Input value={title} onChange={(event) => setTitle(event.target.value)} onBlur={() => { if (title.trim() !== entry.title) void actions.updateEntry(entry.entry_uuid, { title: title.trim() }) }}
          aria-label="Title" placeholder="Title" maxLength={500} className="h-9 font-bold" /> : <p className="min-w-0 flex-1 text-sm font-bold">{titleOf(entry)}</p>}
        <button type="button" aria-label="Close" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><X size={16} /></button>
      </div>
      {open ? <Textarea value={note} rows={3} onChange={(event) => setNote(event.target.value)} onBlur={() => { if (note !== entry.note) void actions.updateEntry(entry.entry_uuid, { note }) }}
        aria-label="Notes" placeholder="Notes: what stood out, what it costs, what to ask" /> : entry.note ? <p className="whitespace-pre-wrap text-sm text-foreground/80">{entry.note}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {ratings ? <Stars value={ratingOf(entry)} onChange={open ? (rating) => void setData({ rating }) : undefined} size={18} /> : null}
        <span className="flex-1" />
        {href ? <Button asChild variant="ghost" size="sm"><OpenLink href={href} {...(entry.kind === 'resource' ? {} : { target: '_blank', rel: 'noreferrer' })}><ExternalLink size={14} aria-hidden="true" />Open</OpenLink></Button> : null}
        {open ? <Button type="button" variant="ghost" size="sm" aria-pressed={pinned(entry)} onClick={() => void setData({ pinned: !pinned(entry) })}>{pinned(entry) ? <><PinOff size={14} aria-hidden="true" />Unpin</> : <><Pin size={14} aria-hidden="true" />Pin</>}</Button> : null}
        {open ? <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => { onClose(); void actions.deleteEntry(entry.entry_uuid) }}><Trash2 size={14} aria-hidden="true" />Remove</Button> : null}
      </div>
    </div>
  </div>
}

/** An entry in the grid (a square with its title) or the stack (a row with its notes). */
function Card({ entry, view, ratings, onSelect }: { entry: StepEntry; view: View; ratings: boolean; onSelect: () => void }) {
  if (view === 'grid') return <button type="button" onClick={onSelect} className="flex min-w-0 flex-col gap-1 rounded-xl p-1 text-left hover:bg-muted" aria-label={`${titleOf(entry)}, edit`}>
    <Thumb entry={entry} className="w-full" />
    <span className="line-clamp-2 px-0.5 text-xs font-bold leading-snug">{titleOf(entry)}</span>
    {ratings ? <span className="px-0.5"><Stars value={ratingOf(entry)} size={11} /></span> : null}
  </button>
  return <button type="button" onClick={onSelect} className="flex w-full min-w-0 items-start gap-3 rounded-xl border bg-background p-2 text-left hover:border-[var(--plan-face)]" aria-label={`${titleOf(entry)}, edit`}>
    <Thumb entry={entry} className="w-16" />
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="truncate text-sm font-bold">{titleOf(entry)}</span>
      {entry.note && entry.kind !== 'note' ? <span className="line-clamp-2 text-xs text-muted-foreground">{entry.note}</span> : entry.url ? <span className="truncate text-xs text-muted-foreground">{entry.url}</span> : null}
      {ratings ? <Stars value={ratingOf(entry)} size={12} /> : null}
    </span>
  </button>
}

const select = 'h-9 rounded-lg border bg-background px-2 text-sm font-semibold'

type BoardProps = {
  step: Step<'explore'>
  actions: StepActions
  /** The learner can add to it and change it. */
  open: boolean
  orgId: number | null
  orgslug: string
  token?: string
  viewerUserId?: number
  /** Shown full size, in the expanded view. */
  full?: boolean
}

/**
 * The Explore board: everything found so far, as a grid of thumbnails or a stack of cards,
 * pinned ones first. Links and files can be dropped or pasted straight onto it, or added with +.
 */
export function ExploreBoard({ step, actions, open, orgId, orgslug, token, viewerUserId, full = false }: BoardProps) {
  const entries = evidenceOf(step)
  const ratings = Boolean(step.config.ratings)
  const added = new Set(entries.map((entry) => entry.resource_uuid).filter(Boolean))
  const suggestions = open ? (step.config.suggestions || []).filter((item) => !added.has(item.resource_uuid)) : []
  const [view, setView] = React.useState<View>('grid')
  React.useEffect(() => { try { if (localStorage.getItem(VIEW_KEY) === 'stack') setView('stack') } catch { /* no storage */ } }, [])
  const pickView = (next: View) => { setView(next); try { localStorage.setItem(VIEW_KEY, next) } catch { /* no storage */ } }
  const [query, setQuery] = React.useState('')
  const [kind, setKind] = React.useState<Evidence | ''>('')
  const [sort, setSort] = React.useState<Sort>('newest')
  const [selected, setSelected] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)
  const [expanded, setExpanded] = React.useState(false)
  const [dropping, setDropping] = React.useState(false)
  const ingest = useBoardIngest(actions, token, viewerUserId)

  const needle = query.trim().toLowerCase()
  const shown = entries
    .filter((entry) => (!kind || entry.kind === kind) && (!needle || `${entry.title} ${entry.note} ${entry.url}`.toLowerCase().includes(needle)))
    .sort((a, b) => Number(pinned(b)) - Number(pinned(a))
      || (sort === 'title' ? titleOf(a).localeCompare(titleOf(b)) : sort === 'rating' ? ratingOf(b) - ratingOf(a) : 0)
      || (sort === 'oldest' ? a.creation_date.localeCompare(b.creation_date) : b.creation_date.localeCompare(a.creation_date)))
  const kinds = EVIDENCE.filter((item) => entries.some((entry) => entry.kind === item))
  const drop = open ? {
    onDragOver: (event: React.DragEvent) => { event.preventDefault(); setDropping(true) },
    onDragLeave: () => setDropping(false),
    onDrop: (event: React.DragEvent) => { event.preventDefault(); setDropping(false); ingest.take(event.dataTransfer) },
    onPaste: (event: React.ClipboardEvent) => { if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) && ingest.take(event.clipboardData)) event.preventDefault() },
  } : {}

  return <div className="flex flex-col gap-2">
    {entries.length ? <div className="flex flex-wrap items-center gap-1.5">
      <div className="relative min-w-36 flex-1"><Search size={14} aria-hidden="true" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" aria-label="Search the board" className="h-9 pl-8" /></div>
      {kinds.length > 1 ? <select aria-label="Type" value={kind} onChange={(event) => setKind(event.target.value as Evidence | '')} className={select}>
        <option value="">All types</option>{kinds.map((item) => <option key={item} value={item}>{KIND[item].label}</option>)}
      </select> : null}
      <select aria-label="Sort" value={sort} onChange={(event) => setSort(event.target.value as Sort)} className={select}>
        <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="title">A–Z</option>{ratings ? <option value="rating">Rating</option> : null}
      </select>
      <div role="radiogroup" aria-label="View" className="flex rounded-lg border p-0.5">
        {([['grid', LayoutGrid, 'Grid'], ['stack', Rows3, 'Stack']] as const).map(([key, Icon, label]) => <button key={key} type="button" role="radio" aria-checked={view === key} aria-label={label} onClick={() => pickView(key)}
          className={cn('grid h-7 w-7 place-items-center rounded-md', view === key ? 'bg-muted text-foreground' : 'text-muted-foreground')}><Icon size={15} /></button>)}
      </div>
      {full ? null : <button type="button" aria-label="Expand the board" onClick={() => setExpanded(true)} className="grid h-9 w-9 place-items-center rounded-lg border text-muted-foreground hover:text-foreground"><Maximize2 size={15} /></button>}
    </div> : null}

    <div tabIndex={open ? 0 : undefined} aria-label={open ? 'Board. Drop or paste links and files here.' : 'Board'} {...drop}
      className={cn('rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--plan-face)]', dropping && 'ring-2 ring-[var(--plan-face)] ring-offset-2')}>
      {shown.length || suggestions.length ? <div className={cn(view === 'grid' ? cn('grid gap-1.5', full ? 'grid-cols-3 sm:grid-cols-6' : 'grid-cols-3 sm:grid-cols-5') : 'flex flex-col gap-1.5')}>
        {shown.map((entry) => entry.entry_uuid === selected
          ? <EntryEditor key={entry.entry_uuid} entry={entry} actions={actions} open={open} ratings={ratings} orgslug={orgslug} onClose={() => setSelected(null)} />
          : <Card key={entry.entry_uuid} entry={entry} view={view} ratings={ratings} onSelect={() => setSelected(entry.entry_uuid)} />)}
        {suggestions.map((item) => <button key={item.resource_uuid} type="button" onClick={() => actions.addEntry({ kind: 'resource', resource_uuid: item.resource_uuid })}
          className={cn('flex min-w-0 gap-2 rounded-xl border-2 border-dashed p-1.5 text-left opacity-75 hover:opacity-100', view === 'grid' ? 'flex-col' : 'items-center')}>
          <span className={cn('grid aspect-square shrink-0 place-items-center rounded-lg bg-muted text-[var(--plan-accent)]', view === 'grid' ? 'w-full' : 'w-16')}><BookOpen size={18} aria-hidden="true" /></span>
          <span className="min-w-0 text-xs font-bold leading-snug"><span className="block text-[10px] font-extrabold uppercase text-muted-foreground">Suggested</span>{item.title || 'Resource'}</span>
        </button>)}
      </div> : entries.length ? <p className="py-4 text-center text-sm text-muted-foreground">Nothing matches.</p>
        : open ? <p className="rounded-2xl border-2 border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Drop links, photos or PDFs here, paste a link, or tap Add.</p> : null}
    </div>

    {open ? <div className="flex items-center gap-2">
      <Button type="button" variant="surface" size="sm" onClick={() => setAdding(true)}><Plus size={15} aria-hidden="true" />Add</Button>
      {ingest.adding ? <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Loader2 size={13} className="animate-spin" />Adding…</span> : null}
    </div> : null}
    <AddToBoard open={adding} onOpenChange={setAdding} actions={actions} ingest={ingest} orgId={orgId} token={token} />
    {expanded ? <Dialog open onOpenChange={setExpanded}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader><DialogTitle>{step.title}</DialogTitle></DialogHeader>
        <ExploreBoard step={step} actions={actions} open={open} orgId={orgId} orgslug={orgslug} token={token} viewerUserId={viewerUserId} full />
      </DialogContent>
    </Dialog> : null}
  </div>
}
