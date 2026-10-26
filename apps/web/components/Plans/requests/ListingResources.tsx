'use client'

import React from 'react'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { AlertTriangle, ArrowRightLeft, CheckCircle2, Globe, Undo2, X } from 'lucide-react'
import { ResourcePickerModal } from '@components/Resources/admin/ResourcePicker'
import { templateMarketplaceApi, type ListingResource, type TemplateListing } from '@services/learning/marketplace'
import { isResourcesKey, resourcesApi } from '@services/resources/workspace'

const small = 'inline-flex h-7 items-center gap-1 rounded-full border border-border bg-card px-2.5 text-xs font-semibold hover:bg-muted disabled:opacity-50 [&_svg]:size-3.5'
const FIX_LABEL = { swap: 'Swapped for a Library resource', remove: 'Removed for other organizations' } as const

/**
 * Before a plan goes in the marketplace: its resources that aren't in the Library, which other organizations
 * couldn't open. For each, swap it for a Library resource or remove it (for them only; this plan keeps it),
 * or, for a resource partner, list its channel in the Library.
 */
export default function ListingResources({ orgId, token, templateUuid, listing, onChange }: {
  orgId: number; token?: string; templateUuid: string; listing: TemplateListing; onChange: React.Dispatch<TemplateListing>
}) {
  const [busy, setBusy] = React.useState('')
  const [swapping, setSwapping] = React.useState<ListingResource | null>(null)
  const items = listing.private_resources || []
  if (!items.length) return null
  const open = items.filter((item) => !item.fix)
  const run = async (uuid: string, work: () => Promise<TemplateListing | void>) => {
    setBusy(uuid)
    try {
      const next = await work()
      onChange(next || await templateMarketplaceApi.listing(orgId, templateUuid, token))
    } catch (failure: any) { toast.error(failure?.message || 'Could not change it.') } finally { setBusy('') }
  }
  const fix = (item: ListingResource, value: 'swap' | 'remove' | null, replacement: string | null = null) =>
    run(item.resource_uuid, () => templateMarketplaceApi.fixResource(orgId, templateUuid, item.resource_uuid, value, replacement, token))
  const list = (item: ListingResource) => run(item.resource_uuid, async () => {
    await resourcesApi.updateChannel(item.channels[0].channel_uuid, { listed: true }, token)
    await mutate(isResourcesKey)
    toast.success(`${item.channels[0].name} is in the Library now.`)
  })
  return <div className="mt-5 space-y-3" data-testid="listing-resources">
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">{items.map((item) => <li key={item.resource_uuid} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
      <span className="min-w-0 flex-1">
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-semibold hover:underline">{item.title}</a>
        <span className="block truncate text-xs text-muted-foreground">{item.fix === 'swap' && item.swap ? `${FIX_LABEL.swap}: ${item.swap.title}` : item.fix ? FIX_LABEL[item.fix] : item.channels.length ? `In ${item.channels.map((channel) => channel.name).join(', ')}` : 'Not in a channel'}</span>
      </span>
      {item.fix ? <span className="inline-flex items-center gap-2"><CheckCircle2 size={16} className="text-green-700" aria-label="Settled" />
        <button type="button" disabled={busy === item.resource_uuid} onClick={() => void fix(item, null)} className={small}><Undo2 />Undo</button></span>
        : <span className="flex flex-wrap gap-1.5">
          {listing.can_list_resources && item.channels.length ? <button type="button" disabled={busy === item.resource_uuid} onClick={() => void list(item)} className={small}><Globe />List its channel</button> : null}
          <button type="button" disabled={busy === item.resource_uuid} onClick={() => setSwapping(item)} className={small}><ArrowRightLeft />Swap</button>
          <button type="button" disabled={busy === item.resource_uuid} onClick={() => void fix(item, 'remove')} className={small}><X />Remove</button>
        </span>}
    </li>)}</ul>
    {open.length ? <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span><b>{open.length === 1 ? '1 of its resources isn’t' : `${open.length} of its resources aren’t`} in the Library.</b> Other organizations couldn’t open {open.length === 1 ? 'it' : 'them'}, so publishing waits until you {listing.can_list_resources ? 'list the channel in the Library, ' : ''}swap {open.length === 1 ? 'it' : 'them'} for a Library resource, or remove {open.length === 1 ? 'it' : 'them'}. Your own plan keeps {open.length === 1 ? 'it' : 'them'} either way.</span>
    </p> : <p className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900"><CheckCircle2 size={16} aria-hidden="true" />Every resource other organizations get is in the Library.</p>}
    <ResourcePickerModal open={Boolean(swapping)} setOpen={(value) => { if (!value) setSwapping(null) }} title={swapping ? `Swap “${swapping.title}”` : 'Swap'} multiple={false} libraryOnly
      onPick={(rows) => { if (swapping && rows[0]) void fix(swapping, 'swap', rows[0].resource_uuid) }} />
  </div>
}
