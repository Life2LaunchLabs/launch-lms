'use client'

import React from 'react'
import { FileText, Film, Image as ImageIcon, Link2, Plus, Upload as UploadIcon, X } from 'lucide-react'
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import { cn } from '@/lib/utils'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { normalizeMediaUrl } from '@services/media/media'
import type { MediaType } from '@services/media/library'
import type { Step, StepEntry, UploadSlot } from '@services/goals/types'
import type { ConfigPanelProps, StepCardProps, StepDefinition } from './registry'
import { Feedback, FinishControls, StepIntro } from './shared'

const KIND_ICON = { image: ImageIcon, video: Film, document: FileText, link: Link2 }
const filled = (step: Step<'upload'>, slot: UploadSlot) => step.entries.find((entry) => entry.slot === slot.key && (entry.kind === 'file' || entry.kind === 'link'))

function Thumb({ entry, slot }: { entry?: StepEntry; slot: UploadSlot }) {
  const Icon = entry?.kind === 'link' ? Link2 : KIND_ICON[slot.kinds[0]] || FileText
  const image = entry && entry.kind === 'file' && /\.(png|jpe?g|gif|webp)(\?|$)/i.test(entry.url)
  if (image) return <img src={normalizeMediaUrl(entry!.url)} alt="" className="h-14 w-14 rounded-xl object-cover" />
  return <span className="grid h-14 w-14 place-items-center rounded-xl border-2 border-dashed bg-background text-muted-foreground">{entry ? <Icon size={20} className="text-[var(--plan-accent)]" /> : <Plus size={18} />}</span>
}

function UploadRow({ step }: { step: Step<'upload'> }) {
  const files = step.config.slots.map((slot) => filled(step, slot)).filter(Boolean) as StepEntry[]
  if (!files.length) return null
  return <div className="mt-1.5 flex gap-1.5">
    {step.config.slots.map((slot) => { const entry = filled(step, slot); return entry ? <Thumb key={slot.key} entry={entry} slot={slot} /> : null })}
  </div>
}

function UploadCard({ step, actions, canWork, staff, token, viewerUserId }: StepCardProps<'upload'>) {
  const [picking, setPicking] = React.useState<{ slot: UploadSlot; type: MediaType } | null>(null)
  const [linkSlot, setLinkSlot] = React.useState<UploadSlot | null>(null)
  const [link, setLink] = React.useState('')
  const open = canWork && !step.locked && step.status !== 'completed' && step.status !== 'submitted'
  const missing = step.config.slots.filter((slot) => !filled(step, slot))
  // Mirrors the API: required slots first; when every slot is optional, any one file will do.
  const required = missing.find((slot) => !slot.optional)
  const blocker = required ? `Add ${required.label} first` : missing.length === step.config.slots.length ? 'Add a file first' : null
  const choose = (slot: UploadSlot) => {
    const media = slot.kinds.filter((kind) => kind !== 'link') as MediaType[]
    if (!media.length) return setLinkSlot(slot)
    setPicking({ slot, type: media[0] })
  }
  return <div className="flex flex-col gap-3">
    <StepIntro step={step} />
    <Feedback step={step} />
    <ul className="flex flex-col gap-2">
      {step.config.slots.map((slot) => {
        const entry = filled(step, slot)
        return <li key={slot.key} className="flex items-center gap-3 rounded-xl border bg-background p-2">
          <button type="button" disabled={!open || !!entry} onClick={() => choose(slot)} aria-label={`Add ${slot.label}`}><Thumb entry={entry} slot={slot} /></button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{slot.label}</p>
            {entry ? <a href={normalizeMediaUrl(entry.url)} target="_blank" rel="noreferrer" className="block truncate text-xs font-semibold text-[var(--plan-accent)] hover:underline">{entry.title || 'Open'}</a>
              : <p className="text-xs font-semibold text-muted-foreground">{kindText(slot)}{slot.optional ? ' · optional' : ''}</p>}
          </div>
          {open && entry ? <button type="button" aria-label="Remove" onClick={() => actions.deleteEntry(entry.entry_uuid)} className="p-1 text-muted-foreground hover:text-foreground"><X size={15} /></button> : null}
          {open && !entry && slot.kinds.includes('link') && slot.kinds.length > 1 ? <button type="button" onClick={() => setLinkSlot(slot)} className="text-xs font-bold text-[var(--plan-accent)]">Add a link</button> : null}
        </li>
      })}
    </ul>
    {linkSlot ? <form className="flex gap-2" onSubmit={async (event) => { event.preventDefault(); if (!link.trim()) return; await actions.addEntry({ kind: 'link', slot: linkSlot.key, url: link.trim(), title: link.trim() }); setLink(''); setLinkSlot(null) }}>
      <Input autoFocus value={link} onChange={(event) => setLink(event.target.value)} placeholder={`Link for ${linkSlot.label}`} />
      <button type="submit" className="rounded-xl border-2 px-3 text-xs font-bold">Add</button>
    </form> : null}
    <FinishControls step={step} actions={actions} canWork={canWork} staff={staff} blocker={blocker} />
    {picking && viewerUserId ? <MediaPickerDialog open onOpenChange={(next) => { if (!next) setPicking(null) }} title={`Add ${picking.slot.label}`} description="Upload something new or choose it from your media library." owner={{ type: 'user', id: viewerUserId }} mediaType={picking.type} accessToken={token}
      onSave={async (asset) => { await actions.addEntry({ kind: 'file', slot: picking.slot.key, asset_uuid: asset.asset_uuid, url: asset.url, title: asset.title || asset.filename || '' }); setPicking(null) }} /> : null}
  </div>
}

const KINDS = [['image', 'Photo'], ['video', 'Video'], ['document', 'Document'], ['link', 'Link']] as const
const kindText = (slot: UploadSlot) => slot.kinds.map((kind) => KINDS.find(([key]) => key === kind)?.[1] || kind).join(' or ')
const chip = (on: boolean) => cn('rounded-full border-[1.5px] px-2.5 py-1 text-xs font-bold transition', on ? 'border-[var(--plan-face)] bg-[color-mix(in_srgb,var(--plan-face)_15%,hsl(var(--card)))]' : 'text-muted-foreground hover:border-[var(--plan-face)]')

/** The items to add, each laid out the way it shows on the step: its slot, its name and what it takes. */
function UploadConfigPanel({ config, onChange }: ConfigPanelProps<'upload'>) {
  const slots = config.slots || []
  const update = (index: number, slot: UploadSlot) => onChange({ slots: slots.map((item, at) => at === index ? slot : item) })
  return <div className="flex flex-col gap-2">
    <Label>Items</Label>
    <ul className="flex flex-col gap-2">
      {slots.map((slot, index) => <li key={index} className="flex items-start gap-3 rounded-xl border bg-background p-2">
        <Thumb slot={slot} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-1">
            <Input className="h-8 border-0 bg-transparent px-0 font-bold shadow-none focus-visible:ring-0" value={slot.label} onChange={(event) => update(index, { ...slot, label: event.target.value })} placeholder="A photo of your work" aria-label={`Item ${index + 1}`} />
            {slots.length > 1 ? <button type="button" aria-label={`Remove item ${index + 1}`} onClick={() => onChange({ slots: slots.filter((_, at) => at !== index) })} className="p-1 text-muted-foreground hover:text-foreground"><X size={15} /></button> : null}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="What it takes">
            {KINDS.map(([kind, label]) => { const on = slot.kinds.includes(kind); return <button key={kind} type="button" aria-pressed={on} className={chip(on)}
              onClick={() => { const kinds = on ? slot.kinds.filter((item) => item !== kind) : [...slot.kinds, kind]; if (kinds.length) update(index, { ...slot, kinds }) }}>{label}</button> })}
            <button type="button" aria-pressed={!!slot.optional} className={chip(!!slot.optional)} onClick={() => update(index, { ...slot, optional: !slot.optional })}>Optional</button>
          </div>
        </div>
      </li>)}
    </ul>
    <button type="button" onClick={() => onChange({ slots: [...slots, { key: `slot_${Date.now().toString(36)}`, label: '', kinds: ['image', 'document'] }] })} className="self-start text-xs font-bold text-[var(--plan-accent)]">Add an item</button>
  </div>
}

export const upload: StepDefinition<'upload'> = {
  type: 'upload',
  label: 'Upload',
  color: '#1A86AE',
  hint: 'Add files, photos or links, one item each',
  icon: UploadIcon,
  statusLine: (step) => step.config.slots.length > 1 ? `${step.config.slots.filter((slot) => filled(step, slot)).length} of ${step.config.slots.length} added` : null,
  RowResult: UploadRow,
  CardBody: UploadCard,
  ConfigPanel: UploadConfigPanel,
  cleanConfig: (config) => ({ slots: config.slots.map((slot, index) => ({ ...slot, label: slot.label.trim() || `Item ${index + 1}` })) }),
  defaultConfig: () => ({ slots: [{ key: 'slot_1', label: 'Your file', kinds: ['image', 'document'] }] }),
}
