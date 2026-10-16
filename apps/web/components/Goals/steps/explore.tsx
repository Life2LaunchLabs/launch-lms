'use client'

import React from 'react'
import Link from 'next/link'
import { BookOpen, Compass, ExternalLink, FileText, Link2, NotebookPen, Plus, Search, X } from 'lucide-react'
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import { cn } from '@/lib/utils'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { normalizeMediaUrl } from '@services/media/media'
import { getResources, type Resource } from '@services/resources/resources'
import type { Step, StepEntry } from '@services/goals/types'
import type { ConfigPanelProps, StepCardProps, StepDefinition } from './registry'
import { CardNote, Feedback, FinishControls, StepIntro } from './shared'

type Evidence = 'resource' | 'link' | 'file' | 'note'
const EVIDENCE: Evidence[] = ['resource', 'link', 'file', 'note']
const KIND = { resource: { icon: BookOpen, label: 'Resource' }, link: { icon: Link2, label: 'Link' }, file: { icon: FileText, label: 'File or photo' }, note: { icon: NotebookPen, label: 'Note' } }
const evidenceOf = (step: Step<'explore'>) => step.entries.filter((entry) => (EVIDENCE as string[]).includes(entry.kind))
const imageOf = (entry: StepEntry) => String(entry.data?.image || '') || (entry.kind === 'file' && /\.(png|jpe?g|gif|webp)(\?|$)/i.test(entry.url) ? normalizeMediaUrl(entry.url) : '')

/** Where an entry opens: library resources inside the app, everything else in a new tab. */
function openHref(entry: { kind: string; url: string; resource_uuid?: string | null }, orgslug: string) {
  if (entry.kind === 'resource' && entry.resource_uuid) return getUriWithOrg(orgslug, routePaths.org.resource(entry.resource_uuid))
  return entry.kind === 'file' ? normalizeMediaUrl(entry.url) : entry.url
}

function Tile({ title, image, kind, suggested, selected, onClick }: { title: string; image: string; kind: Evidence | 'add'; suggested?: boolean; selected?: boolean; onClick: () => void }) {
  const Icon = kind === 'add' ? Plus : KIND[kind].icon
  return <button type="button" onClick={onClick} aria-pressed={selected} className={cn('flex w-28 shrink-0 snap-start flex-col overflow-hidden rounded-xl border-2 bg-background text-left',
    suggested || kind === 'add' ? 'border-dashed' : '', selected ? 'border-[var(--plan-face)]' : 'border-border', suggested && 'opacity-70')}>
    {image ? <img src={image} alt="" className="h-16 w-full object-cover" /> : <span className="grid h-16 w-full place-items-center bg-[color-mix(in_srgb,var(--plan-face)_10%,hsl(var(--card)))] text-[var(--plan-accent)]"><Icon size={20} aria-hidden="true" /></span>}
    <span className="line-clamp-2 px-2 py-1.5 text-xs font-bold leading-snug">{suggested ? <span className="block text-[10px] font-extrabold uppercase text-muted-foreground">Suggested</span> : null}{title}</span>
  </button>
}

// eslint-disable-next-line no-unused-vars
function ResourceSearch({ orgId, token, onPick }: { orgId: number; token?: string; onPick: (resource: Resource) => void }) {
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<Resource[]>([])
  React.useEffect(() => {
    const text = query.trim()
    if (text.length < 2) return setResults([])
    const timer = setTimeout(() => { getResources(orgId, { query: text, limit: 6 }, token).then(setResults).catch(() => setResults([])) }, 250)
    return () => clearTimeout(timer)
  }, [query, orgId, token])
  return <div className="flex flex-col gap-1.5">
    <div className="relative"><Search size={15} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <Input autoFocus className="pl-8" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the library" aria-label="Search the library" /></div>
    {results.map((resource) => <button key={resource.resource_uuid} type="button" onClick={() => onPick(resource)} className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-left text-sm font-semibold hover:border-[var(--plan-face)]">
      <BookOpen size={15} aria-hidden="true" className="shrink-0 text-[var(--plan-accent)]" /><span className="truncate">{resource.title}</span>
    </button>)}
  </div>
}

/** Adding one piece of evidence: a library resource, a link, a file or photo, or a note. */
function AddEvidence({ step, actions, orgId, token, viewerUserId, onDone }: { step: Step<'explore'>; actions: StepCardProps<'explore'>['actions']; orgId: number | null; token?: string; viewerUserId?: number; onDone: () => void }) {
  const [kind, setKind] = React.useState<Evidence>(orgId ? 'resource' : 'link')
  const [url, setUrl] = React.useState('')
  const [text, setText] = React.useState('')
  const [picking, setPicking] = React.useState(false)
  const add = async (data: Parameters<typeof actions.addEntry>[0]) => { await actions.addEntry(data); onDone() }
  return <div className="flex flex-col gap-2 rounded-xl border bg-background p-3">
    <div className="flex flex-wrap gap-1.5">
      {EVIDENCE.filter((item) => item !== 'resource' || orgId).map((item) => { const Icon = KIND[item].icon; return <button key={item} type="button" onClick={() => setKind(item)} aria-pressed={kind === item}
        className={cn('flex items-center gap-1 rounded-full border-[1.5px] px-2.5 py-1 text-xs font-bold', kind === item ? 'border-[var(--plan-face)] bg-[color-mix(in_srgb,var(--plan-face)_15%,hsl(var(--card)))]' : 'text-muted-foreground')}><Icon size={13} aria-hidden="true" />{KIND[item].label}</button> })}
    </div>
    {kind === 'resource' && orgId ? <ResourceSearch orgId={orgId} token={token} onPick={(resource) => add({ kind: 'resource', resource_uuid: resource.resource_uuid })} /> : null}
    {kind === 'link' ? <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (url.trim()) add({ kind: 'link', url: url.trim(), title: text.trim() || url.trim() }) }}>
      <Input autoFocus value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Paste a link" aria-label="Link" />
      <Button type="submit" variant="surface" disabled={actions.busy || !url.trim()}>Add</Button>
    </form> : null}
    {kind === 'file' ? <Button type="button" variant="surface" className="self-start" disabled={!viewerUserId} onClick={() => setPicking(true)}>Choose a file or photo</Button> : null}
    {kind === 'note' ? <form className="flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); if (text.trim()) add({ kind: 'note', note: text.trim() }) }}>
      <Textarea autoFocus rows={2} value={text} onChange={(event) => setText(event.target.value)} placeholder="Something you heard, read or noticed" aria-label="Note" />
      <Button type="submit" variant="surface" className="self-start" disabled={actions.busy || !text.trim()}>Add note</Button>
    </form> : null}
    {picking && viewerUserId ? <MediaPickerDialog open onOpenChange={(next) => { if (!next) setPicking(false) }} title="Add a file or photo" description="Upload something new or choose it from your media library."
      owner={{ type: 'user', id: viewerUserId }} mediaType="image" accessToken={token}
      onSave={async (asset) => { setPicking(false); await add({ kind: 'file', asset_uuid: asset.asset_uuid, url: asset.url, title: asset.title || asset.filename || step.title }) }} /> : null}
  </div>
}

/** The selected entry: open it, write its one-line takeaway, or remove it. */
function EntryDetail({ entry, actions, open, orgslug }: { entry: StepEntry; actions: StepCardProps<'explore'>['actions']; open: boolean; orgslug: string }) {
  const [takeaway, setTakeaway] = React.useState(entry.note)
  React.useEffect(() => setTakeaway(entry.note), [entry.entry_uuid, entry.note])
  const href = entry.kind === 'note' ? '' : openHref(entry, orgslug)
  return <div className="flex flex-col gap-2 rounded-xl border bg-background p-3">
    <div className="flex items-start gap-2">
      <p className="min-w-0 flex-1 text-sm font-bold">{entry.kind === 'note' ? 'Note' : entry.title || entry.url}</p>
      {href ? (entry.kind === 'resource' ? <Link href={href} className="flex shrink-0 items-center gap-1 text-xs font-bold text-[var(--plan-accent)]">Open<ExternalLink size={12} aria-hidden="true" /></Link>
        : <a href={href} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 text-xs font-bold text-[var(--plan-accent)]">Open<ExternalLink size={12} aria-hidden="true" /></a>) : null}
      {open ? <button type="button" aria-label="Remove" onClick={() => actions.deleteEntry(entry.entry_uuid)} className="text-muted-foreground hover:text-foreground"><X size={15} /></button> : null}
    </div>
    {open ? <Input value={takeaway} onChange={(event) => setTakeaway(event.target.value)} onBlur={() => { if (takeaway !== entry.note) actions.updateEntry(entry.entry_uuid, { note: takeaway }) }}
      placeholder={entry.kind === 'note' ? 'Your note' : 'Your takeaway, in a line'} aria-label="Takeaway" />
      : entry.note ? <p className="whitespace-pre-wrap text-sm text-foreground/80">{entry.note}</p> : null}
  </div>
}

function ExploreRow({ step }: { step: Step<'explore'> }) {
  const result = step.result?.kind === 'explore' ? step.result : null
  if (!result) return null
  if (result.answer) return <p className="mt-1 line-clamp-2 text-sm font-bold text-[var(--plan-accent)]">{result.answer}</p>
  return <div className="mt-1.5 flex gap-1.5">
    {result.thumbs.map((thumb, index) => thumb.image ? <img key={index} src={thumb.image} alt="" className="h-10 w-10 rounded-lg object-cover" />
      : <span key={index} className="grid h-10 w-10 place-items-center rounded-lg border bg-background text-[var(--plan-accent)]">{React.createElement(KIND[thumb.kind as Evidence]?.icon || FileText, { size: 15, 'aria-hidden': true })}</span>)}
  </div>
}

function ExploreCard({ goal, step, actions, canWork, staff, orgslug, token, viewerUserId }: StepCardProps<'explore'>) {
  const entries = evidenceOf(step)
  const added = new Set(entries.map((entry) => entry.resource_uuid).filter(Boolean))
  const suggestions = (step.config.suggestions || []).filter((item) => !added.has(item.resource_uuid))
  const [selected, setSelected] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)
  const [answer, setAnswer] = React.useState(step.answer || '')
  React.useEffect(() => setAnswer(step.answer || ''), [step.answer])
  const open = canWork && !step.locked && step.status !== 'completed' && step.status !== 'submitted'
  const current = entries.find((entry) => entry.entry_uuid === selected)
  const saveAnswer = () => (answer.trim() !== (step.answer || '') ? actions.saveSubmission({ answer: answer.trim() }) : Promise.resolve())
  return <div className="flex flex-col gap-3">
    {step.config.question ? <p className="text-sm font-bold">{step.config.question}</p> : null}
    <StepIntro step={step} />
    <Feedback step={step} />
    {entries.length || suggestions.length || open ? <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="What you found">
      {entries.map((entry) => <Tile key={entry.entry_uuid} title={entry.title || entry.note || entry.url} image={imageOf(entry)} kind={entry.kind as Evidence}
        selected={entry.entry_uuid === selected} onClick={() => { setAdding(false); setSelected(entry.entry_uuid === selected ? null : entry.entry_uuid) }} />)}
      {suggestions.map((item) => <Tile key={item.resource_uuid} title={item.title || 'Resource'} image="" kind="resource" suggested
        onClick={() => { if (open) actions.addEntry({ kind: 'resource', resource_uuid: item.resource_uuid }) }} />)}
      {open ? <Tile title="Add" image="" kind="add" selected={adding} onClick={() => { setSelected(null); setAdding(!adding) }} /> : null}
    </div> : null}
    {suggestions.length && open ? <CardNote>Tap a suggestion to add it, then open it from here.</CardNote> : null}
    {adding && open ? <AddEvidence step={step} actions={actions} orgId={goal.org_id} token={token} viewerUserId={viewerUserId} onDone={() => setAdding(false)} /> : null}
    {current ? <EntryDetail entry={current} actions={actions} open={open} orgslug={orgslug} /> : null}
    {open ? <div className="flex flex-col gap-1"><Label>Your answer</Label>
      <Input value={answer} maxLength={500} onChange={(event) => setAnswer(event.target.value)} onBlur={saveAnswer} placeholder="What you found, in one sentence" /></div>
      : step.answer ? <p className="rounded-xl border-l-4 border-[var(--plan-face)] bg-background px-3 py-2 text-sm font-bold">{step.answer}</p> : null}
    <FinishControls step={step} canWork={canWork} staff={staff} finishLabel="Save my answer" blocker={answer.trim() ? null : 'Write your answer first'}
      actions={{ ...actions, setStatus: async (status, note) => { await saveAnswer(); await actions.setStatus(status, note) } }} />
  </div>
}

function ExploreConfigPanel({ config, onChange, orgId, token }: ConfigPanelProps<'explore'>) {
  const suggestions = config.suggestions || []
  return <div className="flex flex-col gap-3">
    <div className="flex flex-col gap-1"><Label>Question</Label><Input value={config.question || ''} onChange={(event) => onChange({ ...config, question: event.target.value })} placeholder="What do trade schools near me cost?" /></div>
    <div className="flex flex-col gap-1.5">
      <Label>Suggested resources</Label>
      {suggestions.map((item) => <div key={item.resource_uuid} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold">
        <BookOpen size={15} aria-hidden="true" className="text-[var(--plan-accent)]" /><span className="min-w-0 flex-1 truncate">{item.title || item.resource_uuid}</span>
        <button type="button" aria-label="Remove suggestion" onClick={() => onChange({ ...config, suggestions: suggestions.filter((other) => other.resource_uuid !== item.resource_uuid) })} className="text-muted-foreground"><X size={15} /></button>
      </div>)}
      {orgId ? <ResourceSearch orgId={orgId} token={token} onPick={(resource) => {
        if (!suggestions.some((item) => item.resource_uuid === resource.resource_uuid)) onChange({ ...config, suggestions: [...suggestions, { resource_uuid: resource.resource_uuid, title: resource.title }] })
      }} /> : null}
    </div>
  </div>
}

export const explore: StepDefinition<'explore'> = {
  type: 'explore',
  label: 'Explore',
  hint: 'Answer a question by gathering resources, links and notes',
  icon: Compass,
  statusLine: (step) => {
    const count = evidenceOf(step).length
    return step.answer ? null : count ? `${count} found` : null
  },
  RowResult: ExploreRow,
  CardBody: ExploreCard,
  ConfigPanel: ExploreConfigPanel,
  defaultConfig: () => ({ question: '', suggestions: [] }),
}
