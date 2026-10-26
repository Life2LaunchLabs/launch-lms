'use client'

import React from 'react'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { AlertCircle, Check, Download, FileSpreadsheet, Info, Loader2, Upload } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { Input } from '@components/ui/input'
import { plural } from '@components/Plans/plan/planVersions'
import { primaryActionClass } from '@components/Plans/shared/actions'
import { IMPORT_FIELDS, TEMPLATE_CSV, importApi, mapRows, type ImportDestination, type ImportField, type ImportResult, type SheetRead } from '@services/resources/importer'
import { isResourcesKey, typeLabel } from '@services/resources/workspace'
import { cn } from '@/lib/utils'
import { useResourcesContext } from './pieces'

type Channel = { channel_uuid: string; name: string }
const ghostClass = 'inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50'
const SHOWN_ROWS = 8

/** Bring in a long list of links from a .csv or .xlsx: choose the file, match its columns, review, import. */
export function ImportModal({ open, setOpen, channel }: { open: boolean; setOpen: React.Dispatch<boolean>; channel?: Channel }) {
  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="lg" dialogTitle="Import a spreadsheet"
    dialogDescription="One row per resource. Nothing is added until you press Import."
    dialogContent={<ImportFlow channel={channel} close={() => setOpen(false)} />} />
}

function ImportFlow({ channel, close }: { channel?: Channel; close: () => void }) {
  const { orgId, token } = useResourcesContext()
  const [sheet, setSheet] = React.useState<SheetRead | null>(null)
  const [fields, setFields] = React.useState<ImportField[]>([])
  const [reviewing, setReviewing] = React.useState(false)
  const [reading, setReading] = React.useState(false)
  const read = async (file: File) => {
    setReading(true)
    try {
      const result = await importApi.read(orgId, file, token)
      setSheet(result)
      setFields(result.columns.map((column) => column.field))
    } catch (failure: any) { toast.error(failure?.message || 'Could not read that file.') } finally { setReading(false) }
  }
  if (!sheet) return <ChooseFile reading={reading} onFile={(file) => void read(file)} />
  if (!reviewing) return <MatchColumns sheet={sheet} fields={fields} setFields={setFields} onBack={() => setSheet(null)} onNext={() => setReviewing(true)} />
  return <Review sheet={sheet} fields={fields} channel={channel} onBack={() => setReviewing(false)} close={close} orgId={orgId} token={token} />
}

function ChooseFile({ reading, onFile }: { reading: boolean; onFile: React.Dispatch<File> }) {
  const input = React.useRef<HTMLInputElement>(null)
  const [over, setOver] = React.useState(false)
  const template = () => {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([TEMPLATE_CSV], { type: 'text/csv' }))
    link.download = 'resources-template.csv'
    link.click()
    URL.revokeObjectURL(link.href)
  }
  return <div className="space-y-3">
    <div onDragOver={(event) => { event.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
      onDrop={(event) => { event.preventDefault(); setOver(false); const file = event.dataTransfer.files[0]; if (file) onFile(file) }}
      className={cn('flex flex-col items-center gap-2.5 rounded-[20px] border-2 border-dashed px-5 py-8 text-center', over ? 'border-foreground bg-muted' : 'border-border bg-muted/40')}>
      <span className="grid h-[52px] w-[52px] place-items-center rounded-2xl bg-[#1E7A46] text-white"><FileSpreadsheet size={26} aria-hidden="true" /></span>
      <b className="text-base">Drop a .csv or .xlsx file here</b>
      <span className="max-w-[440px] text-[13.5px] leading-normal text-muted-foreground">A <b>link</b> column is all you need. Title, description, type, provider, minutes, channel and tags are optional, and pictures fill in from each link.</span>
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        <button type="button" disabled={reading} onClick={() => input.current?.click()} className={primaryActionClass}>{reading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}Choose a file</button>
        <button type="button" onClick={template} className={ghostClass}><Download size={16} aria-hidden="true" />Download the template</button>
      </div>
      <input ref={input} type="file" accept=".csv,.tsv,.txt,.xlsx,.xlsm" className="sr-only" aria-label="Spreadsheet file" onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = '' }} />
    </div>
    <p className="flex items-start gap-2 rounded-2xl bg-muted/60 px-4 py-3 text-[13px] text-muted-foreground"><Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />Have it in Google Sheets? File › Download › CSV, then drop it here.</p>
  </div>
}

function MatchColumns({ sheet, fields, setFields, onBack, onNext }: { sheet: SheetRead; fields: ImportField[]; setFields: React.Dispatch<ImportField[]>; onBack: () => void; onNext: () => void }) {
  const hasLink = fields.includes('link')
  return <div className="space-y-4">
    <p className="text-[13.5px] text-muted-foreground"><b className="text-foreground">{sheet.file_name}</b> · {plural(sheet.rows.length, 'row')}{sheet.truncated ? ' (the first ones; split the rest into another file)' : ''}. We matched these from the header names; change any that are wrong.</p>
    <div className="max-h-[50vh] overflow-auto rounded-2xl border border-border">
      <table className="w-full text-left text-[13.5px]">
        <thead className="sticky top-0 bg-muted text-[11.5px] font-bold uppercase tracking-[.05em] text-muted-foreground"><tr><th className="px-3 py-2">Your column</th><th className="px-3 py-2">Example</th><th className="px-3 py-2">Imports as</th></tr></thead>
        <tbody>{sheet.columns.map((column, index) => <tr key={index} className="border-t border-border">
          <td className="px-3 py-2 font-semibold">{column.name}</td>
          <td className="max-w-[200px] truncate px-3 py-2 text-muted-foreground">{column.example}</td>
          <td className="px-3 py-2"><select aria-label={`${column.name} imports as`} value={fields[index]} onChange={(event) => setFields(fields.map((field, at) => at === index ? event.target.value as ImportField : field))}
            className="h-9 w-full min-w-[140px] rounded-xl border border-border bg-card px-2 text-[13.5px]">
            {IMPORT_FIELDS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={onBack} className={ghostClass}>Back</button>
      <span className="flex-1" />
      {!hasLink ? <small className="text-[12.5px] font-semibold text-amber-700">Match one column to Link</small> : null}
      <button type="button" disabled={!hasLink} onClick={onNext} className={primaryActionClass}>Review {plural(sheet.rows.length, 'row')}</button>
    </div>
  </div>
}

function Review({ sheet, fields, channel, onBack, close, orgId, token }: { sheet: SheetRead; fields: ImportField[]; channel?: Channel; onBack: () => void; close: () => void; orgId: number; token?: string }) {
  const rows = React.useMemo(() => mapRows(sheet, fields), [sheet, fields])
  const channelColumn = sheet.columns[fields.indexOf('channel')]?.name
  const [where, setWhere] = React.useState<ImportDestination>(() => channel ? { destination: 'one', channel_uuid: channel.channel_uuid }
    : channelColumn ? { destination: 'column' } : { destination: 'one', channel_name: sheet.file_name.replace(/\.[^.]+$/, '') })
  const [check, setCheck] = React.useState<ImportResult | null>(null)
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    if (where.destination === 'one' && !where.channel_uuid && !where.channel_name?.trim()) return
    let live = true
    const timer = window.setTimeout(() => {
      importApi.run(orgId, rows, where, true, token).then((result) => { if (live) setCheck(result) })
        .catch((failure: any) => { if (live) toast.error(failure?.message || 'Could not check the rows.') })
    }, where.channel_name === undefined ? 0 : 350)
    return () => { live = false; window.clearTimeout(timer) }
  }, [orgId, rows, where, token])
  const run = async () => {
    setBusy(true)
    try {
      const result = await importApi.run(orgId, rows, where, false, token)
      await mutate(isResourcesKey)
      toast.success(`Imported ${plural(result.created, 'resource')}${where.destination === 'column' && result.channel_count > 1 ? ` into ${plural(result.channel_count, 'channel')}` : ''}. Pictures are filling in.`)
      close()
    } catch (failure: any) { toast.error(failure?.message || 'Could not import them.') } finally { setBusy(false) }
  }
  const options: Array<{ key: string; value: ImportDestination; title: string; detail: React.ReactNode }> = []
  if (channel) options.push({ key: 'here', value: { destination: 'one', channel_uuid: channel.channel_uuid }, title: `Put them all in ${channel.name}`, detail: 'The channel you’re importing from.' })
  if (channelColumn) options.push({ key: 'column', value: { destination: 'column' }, title: `Make a channel for each ${channelColumn}`,
    detail: check && where.destination === 'column' ? `${plural(check.channel_count, 'channel')}${check.new_channels.length ? `, ${check.new_channels.length} new` : ''}. Channels with the same name are reused.` : 'From the column you matched to Channel. Channels with the same name are reused.' })
  if (!channel) options.push({ key: 'one', value: { destination: 'one', channel_name: where.channel_name ?? sheet.file_name.replace(/\.[^.]+$/, '') }, title: 'Put them all in one channel',
    detail: where.destination === 'one' ? <Input aria-label="Channel name" value={where.channel_name || ''} onChange={(event) => setWhere({ destination: 'one', channel_name: event.target.value })} onClick={(event) => event.stopPropagation()} className="mt-1.5 h-9 bg-card" /> : 'Named after your file; you can change it.' })
  options.push({ key: 'none', value: { destination: 'none' }, title: 'Don’t put them in a channel', detail: 'They go in Your resources, where only your staff see them until you add them to a channel.' })
  const chosen = (value: ImportDestination) => value.destination === where.destination && (value.destination !== 'one' || Boolean(value.channel_uuid) === Boolean(where.channel_uuid))
  const status = (row: ImportResult['rows'][number]) => row.status === 'ready' ? <span className="inline-flex items-center gap-1 rounded-full bg-[#e6f3f1] px-2 py-px text-[11.5px] font-bold text-[#0B5F58]"><Check size={11} aria-hidden="true" />Ready</span>
    : row.status === 'invalid' ? <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-px text-[11.5px] font-bold text-red-800"><AlertCircle size={11} aria-hidden="true" />{row.error}</span>
      : <span className="rounded-full bg-amber-100 px-2 py-px text-[11.5px] font-bold text-amber-900">{row.status === 'repeat' ? 'Twice in the file' : 'Already added'}</span>
  const shown = check ? [...check.rows.filter((row) => row.status !== 'ready'), ...check.rows.filter((row) => row.status === 'ready')].slice(0, SHOWN_ROWS) : []
  return <div className="space-y-4">
    {!check ? <div className="grid place-items-center py-10"><Loader2 className="animate-spin text-muted-foreground" aria-label="Checking the rows" /></div> : <>
      <div className="grid gap-2.5 sm:grid-cols-3">
        {([[check.ready, 'ready to import', 'bg-[#e6f3f1] text-[#0B5F58]'], [check.duplicates, 'already in your resources, skipped', 'bg-amber-50 text-amber-900'], [check.invalid, 'without a usable link, skipped', 'bg-red-50 text-red-900']] as const).map(([count, label, tone]) =>
          <div key={label} className={cn('rounded-2xl px-4 py-3', tone)}><b className="block text-[22px] leading-tight">{count}</b><span className="text-[13px]">{label}</span></div>)}
      </div>
      <div className="max-h-[32vh] overflow-auto rounded-2xl border border-border">
        <table className="w-full text-left text-[13.5px]">
          <thead className="sticky top-0 bg-muted text-[11.5px] font-bold uppercase tracking-[.05em] text-muted-foreground"><tr><th className="px-3 py-2">Title</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Channel</th><th className="px-3 py-2"><span className="sr-only">Status</span></th></tr></thead>
          <tbody>{shown.map((row) => <tr key={row.row} className="border-t border-border">
            <td className="max-w-[220px] truncate px-3 py-2 font-semibold" title={row.link}>{row.title || row.link || `Row ${row.row}`}</td>
            <td className="px-3 py-2 text-muted-foreground">{typeLabel(row.type)}</td>
            <td className="max-w-[160px] truncate px-3 py-2 text-muted-foreground">{row.channels.join(', ') || '—'}</td>
            <td className="px-3 py-2 text-right">{status(row)}</td>
          </tr>)}
          {check.rows.length > shown.length ? <tr className="border-t border-border"><td colSpan={4} className="px-3 py-2 text-muted-foreground">and {check.rows.length - shown.length} more</td></tr> : null}</tbody>
        </table>
      </div>
    </>}
    <fieldset className="space-y-2">
      <legend className="mb-2 text-[13px] font-bold">Where they go</legend>
      {options.map((option) => <div key={option.key} role="radio" aria-checked={chosen(option.value)} tabIndex={0} onClick={() => { if (!chosen(option.value)) setWhere(option.value) }}
        onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) { event.preventDefault(); setWhere(option.value) } }}
        className={cn('flex cursor-pointer gap-3 rounded-2xl border px-4 py-3', chosen(option.value) ? 'border-foreground bg-muted/50' : 'border-border hover:bg-muted/30')}>
        <span className={cn('mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2', chosen(option.value) ? 'border-foreground' : 'border-border')}>{chosen(option.value) ? <span className="h-2 w-2 rounded-full bg-foreground" /> : null}</span>
        <span className="min-w-0 flex-1"><b className="block text-sm">{option.title}</b><span className="block text-[13px] text-muted-foreground">{option.detail}</span></span>
      </div>)}
    </fieldset>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={onBack} className={ghostClass}>Back</button>
      <span className="flex-1" />
      <small className="text-xs text-muted-foreground">Pictures and missing titles fill in after import.</small>
      <button type="button" disabled={busy || !check?.ready || (where.destination === 'one' && !where.channel_uuid && !where.channel_name?.trim())} onClick={() => void run()} className={primaryActionClass}>
        {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}Import {check ? plural(check.ready, 'resource') : ''}
      </button>
    </div>
  </div>
}
