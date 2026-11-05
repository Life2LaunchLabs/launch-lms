'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { Download, Loader2 } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { primaryActionClass } from '@components/Plans/shared/actions'
import { NO_CHANNEL, exportApi, type ExportDetail, type ExportFormat } from '@services/resources/exporter'
import type { ResourceType } from '@services/resources/resources'
import { RESOURCE_TYPES, type ChannelCard } from '@services/resources/workspace'
import { cn } from '@/lib/utils'
import { useResourcesContext } from './pieces'

const chipClass = (on: boolean) => cn('rounded-full border px-3 py-1 text-[13px] font-semibold', on ? 'border-foreground bg-foreground text-background' : 'border-border bg-card hover:bg-muted')

const DETAILS: Array<{ value: ExportDetail; title: string; detail: string }> = [
  { value: 'simple', title: 'Simple', detail: 'Title, link, description, type, provider, minutes, channels and tags. Edit it and import it back.' },
  { value: 'full', title: 'Full', detail: 'Everything in Simple, plus cost, cover image, featured and live, ids, dates, and how learners use each one: saves, opens, reviews and rating.' },
]

/** Download the org's resources as a spreadsheet: simple or full, all of them or some channels and types. */
export function ExportModal({ open, setOpen, channels }: { open: boolean; setOpen: React.Dispatch<boolean>; channels: ChannelCard[] }) {
  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="lg" dialogTitle="Export to a spreadsheet"
    dialogDescription="Your resources, one row each. Opens in Excel, Google Sheets or Numbers."
    dialogContent={<ExportForm channels={channels} close={() => setOpen(false)} />} />
}

/** Several picks from a set, where none picked means all of them. */
function Picks<T extends string>({ label, options, value, onChange }: { label: string; options: Array<{ value: T; label: string }>; value: T[]; onChange: React.Dispatch<T[]> }) {
  const toggle = (item: T) => onChange(value.includes(item) ? value.filter((other) => other !== item) : [...value, item])
  return <fieldset>
    <legend className="mb-2 text-[13px] font-bold">{label}</legend>
    <div className="flex flex-wrap gap-1.5">
      <button type="button" aria-pressed={!value.length} onClick={() => onChange([])} className={chipClass(!value.length)}>All</button>
      {options.map((option) => <button key={option.value} type="button" aria-pressed={value.includes(option.value)} onClick={() => toggle(option.value)} className={chipClass(value.includes(option.value))}>{option.label}</button>)}
    </div>
  </fieldset>
}

function ExportForm({ channels, close }: { channels: ChannelCard[]; close: () => void }) {
  const { orgId, token } = useResourcesContext()
  const [detail, setDetail] = React.useState<ExportDetail>('simple')
  const [format, setFormat] = React.useState<ExportFormat>('xlsx')
  const [picked, setPicked] = React.useState<string[]>([])
  const [types, setTypes] = React.useState<ResourceType[]>([])
  const [busy, setBusy] = React.useState(false)
  const channelOptions = [
    ...channels.map((channel) => ({ value: channel.channel_uuid, label: channel.is_shared_from_other_org ? `${channel.name} (Library)` : channel.name })),
    { value: NO_CHANNEL, label: 'Not in a channel' },
  ]
  const run = async () => {
    setBusy(true)
    try {
      await exportApi.download(orgId, { detail, format, channels: picked, types }, token)
      close()
    } catch (failure: any) { toast.error(failure?.message || 'Could not export them. Try again.') } finally { setBusy(false) }
  }
  return <div className="space-y-5">
    <fieldset className="space-y-2">
      <legend className="mb-2 text-[13px] font-bold">What’s in it</legend>
      {DETAILS.map((option) => {
        const on = detail === option.value
        return <button key={option.value} type="button" role="radio" aria-checked={on} onClick={() => setDetail(option.value)}
          className={cn('flex w-full gap-3 rounded-2xl border px-4 py-3 text-left', on ? 'border-foreground bg-muted/50' : 'border-border hover:bg-muted/30')}>
          <span className={cn('mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2', on ? 'border-foreground' : 'border-border')}>{on ? <span className="h-2 w-2 rounded-full bg-foreground" /> : null}</span>
          <span className="min-w-0 flex-1"><b className="block text-sm">{option.title}</b><span className="block text-[13px] text-muted-foreground">{option.detail}</span></span>
        </button>
      })}
    </fieldset>
    <Picks label="Channels" options={channelOptions} value={picked} onChange={setPicked} />
    <Picks label="Types" options={RESOURCE_TYPES.map((type) => ({ value: type.value, label: type.plural }))} value={types} onChange={setTypes} />
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] font-bold">File</span>
      {(['xlsx', 'csv'] as const).map((value) => <button key={value} type="button" aria-pressed={format === value} onClick={() => setFormat(value)} className={chipClass(format === value)}>{value === 'xlsx' ? 'Excel (.xlsx)' : 'CSV'}</button>)}
      <span className="flex-1" />
      <button type="button" disabled={busy || !orgId} onClick={() => void run()} className={primaryActionClass}>
        {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}Download
      </button>
    </div>
  </div>
}
