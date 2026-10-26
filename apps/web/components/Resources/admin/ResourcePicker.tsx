'use client'

import React from 'react'
import useSWR from 'swr'
import { Bookmark, Check, Globe } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { plural } from '@components/Plans/plan/planVersions'
import { primaryActionClass } from '@components/Plans/shared/actions'
import { resourceKeys, resourcesApi, type ResourceRow } from '@services/resources/workspace'
import { cn } from '@/lib/utils'
import { Loading, SearchBox } from './listing'
import { OrgChip, TypeTile, resourceMeta, useResourcesContext } from './pieces'

type Source = 'mine' | 'library'

/**
 * Pick resources for a plan step, a thread or a swap: the org's own and saved ones, or anything in the
 * Library. `libraryOnly` offers only Library resources (what other organizations can open).
 */
export function ResourcePickerModal({ open, setOpen, title = 'Add resources', action = 'Add', multiple = true, libraryOnly = false, exclude = [], onPick }: {
  open: boolean; setOpen: React.Dispatch<boolean>; title?: string; action?: string; multiple?: boolean; libraryOnly?: boolean; exclude?: string[]
  onPick: React.Dispatch<ResourceRow[]>
}) {
  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="md" dialogTitle={title}
    dialogContent={<Picker action={action} multiple={multiple} libraryOnly={libraryOnly} exclude={exclude} onPick={(rows) => { onPick(rows); setOpen(false) }} />} />
}

function Picker({ action, multiple, libraryOnly, exclude, onPick }: { action: string; multiple: boolean; libraryOnly: boolean; exclude: string[]; onPick: React.Dispatch<ResourceRow[]> }) {
  const { orgId, token, ready } = useResourcesContext()
  const [source, setSource] = React.useState<Source>(libraryOnly ? 'library' : 'mine')
  const [input, setInput] = React.useState('')
  const [query, setQuery] = React.useState('')
  const [picked, setPicked] = React.useState<ResourceRow[]>([])
  React.useEffect(() => { const timer = setTimeout(() => setQuery(input.trim()), 300); return () => clearTimeout(timer) }, [input])
  const { data: workspace } = useSWR(ready && source === 'mine' ? resourceKeys.workspace(orgId) : null, () => resourcesApi.workspace(orgId, token))
  const { data: library } = useSWR(ready && source === 'library' ? resourceKeys.library(orgId, query) : null, () => resourcesApi.library(orgId, query, '', token), { keepPreviousData: true })
  const needle = input.trim().toLowerCase()
  const mine = (workspace?.resources || []).filter((row) => !needle || `${row.title} ${row.description || ''} ${row.provider_name || ''}`.toLowerCase().includes(needle))
  const loaded = source === 'mine' ? workspace : library
  const rows = (source === 'mine' ? mine : library?.resources || []).filter((row) => !exclude.includes(row.resource_uuid) && (!libraryOnly || row.in_library))
  const toggle = (row: ResourceRow) => {
    if (!multiple) return onPick([row])
    setPicked((current) => current.some((item) => item.resource_uuid === row.resource_uuid) ? current.filter((item) => item.resource_uuid !== row.resource_uuid) : [...current, row])
  }
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      {!libraryOnly ? <div className="inline-flex rounded-full bg-muted p-1" role="tablist" aria-label="Where from">
        {([['mine', 'Yours and saved', Bookmark], ['library', 'Library', Globe]] as const).map(([id, label, Icon]) => <button key={id} type="button" role="tab" aria-selected={source === id} onClick={() => setSource(id)}
          className={cn('inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold', source === id ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}><Icon size={14} aria-hidden="true" />{label}</button>)}
      </div> : <p className="text-[13px] text-muted-foreground">Only resources in the Library, so other organizations can open them.</p>}
      <span className="flex-1" />
      <SearchBox value={input} onChange={setInput} label={source === 'mine' ? 'Search your resources' : 'Search the Library'} />
    </div>
    {!loaded ? <Loading /> : rows.length ? <ul className="max-h-[50vh] overflow-y-auto rounded-2xl border border-border">{rows.map((row) => {
      const on = picked.some((item) => item.resource_uuid === row.resource_uuid)
      return <li key={row.resource_uuid} className="border-b border-border last:border-b-0">
        <button type="button" aria-pressed={multiple ? on : undefined} onClick={() => toggle(row)} className={cn('flex w-full items-center gap-3 px-3.5 py-2.5 text-left', on ? 'bg-muted/70' : 'hover:bg-muted/40')}>
          {multiple ? <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-md border-2', on ? 'border-foreground bg-foreground text-background' : 'border-border')}>{on ? <Check size={13} aria-hidden="true" /> : null}</span> : null}
          <TypeTile type={row.resource_type} className="h-9 w-9 rounded-lg [&_svg]:size-4" />
          <span className="min-w-0 flex-1"><b className="block truncate text-sm">{row.title}</b><span className="block truncate text-xs text-muted-foreground">{resourceMeta(row)}</span></span>
          {row.is_shared_from_other_org ? <OrgChip name={row.owner_org_name} className="hidden max-w-[140px] sm:inline-flex" /> : null}
        </button>
      </li>
    })}</ul> : <p className="rounded-2xl border-[1.5px] border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
      {query || input ? 'Nothing matches.' : source === 'mine' ? 'No resources yet. Add some on the Resources page, or pick from the Library.' : 'Nothing in the Library yet.'}
    </p>}
    {multiple ? <div className="flex justify-end"><button type="button" disabled={!picked.length} onClick={() => onPick(picked)} className={primaryActionClass}>{action} {picked.length ? plural(picked.length, 'resource') : ''}</button></div> : null}
  </div>
}
