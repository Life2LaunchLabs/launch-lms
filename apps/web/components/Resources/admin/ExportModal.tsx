'use client'

import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Download, Loader2, Star } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { primaryActionClass } from '@components/Plans/shared/actions'
import { NO_CHANNEL, exportApi, exportCountsKey, type ExportDetail, type ExportFormat } from '@services/resources/exporter'
import type { ResourceType } from '@services/resources/resources'
import { RESOURCE_TYPES, type ChannelCard } from '@services/resources/workspace'
import { cn } from '@/lib/utils'
import { useResourcesContext } from './pieces'

const chipClass = (on: boolean, empty = false) => cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-semibold',
  on ? 'border-foreground bg-foreground text-background' : 'border-border bg-card hover:bg-muted', empty && !on ? 'text-muted-foreground' : null)

/** The number of rows a chip gives, inside it. */
function Count({ value, on }: { value?: number; on: boolean }) {
  if (value === undefined) return null
  return <span className={cn('min-w-[1.25rem] rounded-full px-1.5 text-center text-[11.5px] font-bold tabular-nums', on ? 'bg-background/20' : 'bg-muted')}>{value}</span>
}

const DETAILS: Array<{ value: ExportDetail; title: string; detail: string }> = [
  { value: 'simple', title: 'Simple', detail: 'Title, link, description, type, provider, minutes, channels, tags, starred and its ID. Edit it and import it back to update them.' },
  { value: 'full', title: 'Full', detail: 'Everything in Simple, plus cost, cover image, live, provider site, dates, and how learners use each one: saves, opens, reviews and rating.' },
]

/** Download the org's resources as a spreadsheet: simple or full, all of them or some channels and types. */
export function ExportModal({ open, setOpen, channels }: { open: boolean; setOpen: React.Dispatch<boolean>; channels: ChannelCard[] }) {
  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="lg" dialogTitle="Export to a spreadsheet"
    dialogDescription="Your resources, one row each. Opens in Excel, Google Sheets or Numbers."
    dialogContent={<ExportForm channels={channels} close={() => setOpen(false)} />} />
}

/** Several picks from a set, where none picked means all of them. */
function Picks<T extends string>({ label, options, value, onChange, counts, allCount }: {
  label: string; options: Array<{ value: T; label: string }>; value: T[]; onChange: React.Dispatch<T[]>; counts?: Partial<Record<T, number>>; allCount?: number
}) {
  const toggle = (item: T) => onChange(value.includes(item) ? value.filter((other) => other !== item) : [...value, item])
  const count = (item: T) => counts ? counts[item] ?? 0 : undefined
  return <fieldset>
    <legend className="mb-2 text-[13px] font-bold">{label} <span className="font-normal text-muted-foreground">· pick any</span></legend>
    <div className="flex flex-wrap gap-1.5">
      <button type="button" aria-pressed={!value.length} onClick={() => onChange([])} className={chipClass(!value.length)}>All<Count value={allCount} on={!value.length} /></button>
      {options.map((option) => {
        const on = value.includes(option.value)
        return <button key={option.value} type="button" aria-pressed={on} onClick={() => toggle(option.value)} className={chipClass(on, count(option.value) === 0)}>{option.label}<Count value={count(option.value)} on={on} /></button>
      })}
    </div>
  </fieldset>
}

function ExportForm({ channels, close }: { channels: ChannelCard[]; close: () => void }) {
  const { orgId, token } = useResourcesContext()
  const [detail, setDetail] = React.useState<ExportDetail>('simple')
  const [format, setFormat] = React.useState<ExportFormat>('xlsx')
  const [picked, setPicked] = React.useState<string[]>([])
  const [types, setTypes] = React.useState<ResourceType[]>([])
  const [starred, setStarred] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const filter = { channels: picked, types, starred }
  const { data: counts } = useSWR(orgId && token ? exportCountsKey(orgId, filter) : null, () => exportApi.counts(orgId, filter, token), { keepPreviousData: true })
  const typeCounts = counts?.types
  const allTypes = typeCounts ? Object.values(typeCounts).reduce((sum, value) => sum + (value || 0), 0) : undefined
  const channelOptions = [
    ...channels.map((channel) => ({ value: channel.channel_uuid, label: channel.is_shared_from_other_org ? `${channel.name} (Library)` : channel.name })),
    { value: NO_CHANNEL, label: 'Not in a channel' },
  ]
  const run = async () => {
    setBusy(true)
    try {
      await exportApi.download(orgId, { detail, format, ...filter }, token)
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
    <Picks label="Channels" options={channelOptions} value={picked} onChange={setPicked} counts={counts?.channels} allCount={counts?.any} />
    <Picks label="Types" options={RESOURCE_TYPES.map((type) => ({ value: type.value, label: type.plural }))} value={types} onChange={setTypes} counts={typeCounts} allCount={allTypes} />
    <fieldset>
      <legend className="mb-2 text-[13px] font-bold">Which ones</legend>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={!starred} onClick={() => setStarred(false)} className={chipClass(!starred)}>All<Count value={counts?.all} on={!starred} /></button>
        <button type="button" aria-pressed={starred} onClick={() => setStarred(true)} className={chipClass(starred, counts?.starred === 0)}><Star size={13} className={starred ? 'fill-current' : 'fill-amber-400 text-amber-500'} aria-hidden="true" />Starred only<Count value={counts?.starred} on={starred} /></button>
      </div>
    </fieldset>
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] font-bold">File</span>
      {(['xlsx', 'csv'] as const).map((value) => <button key={value} type="button" aria-pressed={format === value} onClick={() => setFormat(value)} className={chipClass(format === value)}>{value === 'xlsx' ? 'Excel (.xlsx)' : 'CSV'}</button>)}
      <span className="flex-1" />
      <button type="button" disabled={busy || !orgId || counts?.total === 0} onClick={() => void run()} className={primaryActionClass}>
        {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
        {counts ? counts.total === 0 ? 'Nothing to download' : `Download ${counts.total === 1 ? '1 resource' : `${counts.total} resources`}` : 'Download'}
      </button>
    </div>
  </div>
}
