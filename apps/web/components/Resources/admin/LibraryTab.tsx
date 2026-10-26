'use client'

import React from 'react'
import Link from 'next/link'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { Search } from 'lucide-react'
import { SectionHeader } from '@components/Plans/library/PlanCards'
import { plural } from '@components/Plans/plan/planVersions'
import { isResourcesKey, resourceKeys, resourcesApi, type ChannelCard, type ResourceRow } from '@services/resources/workspace'
import { Loading, TypeChips, useResourceFilter } from './listing'
import { ChannelCover, ChannelTile, OrgChip, ResourceListRow, SaveButton, channelHref, listClass, useResourcesContext } from './pieces'

/** Save or unsave a Library channel or resource for the org, then refresh every Resources list. */
export function useLibrarySave() {
  const { orgId, token } = useResourcesContext()
  const [busy, setBusy] = React.useState<string | null>(null)
  const toggle = async (kind: 'channel' | 'resource', uuid: string, saved: boolean) => {
    setBusy(uuid)
    try {
      await (kind === 'channel' ? resourcesApi.saveChannel : resourcesApi.saveResource)(orgId, uuid, !saved, token)
      await mutate(isResourcesKey)
      toast.success(saved ? 'Removed from your resources' : 'Saved to your resources')
    } catch (failure: any) { toast.error(failure?.message || 'Could not save it.') } finally { setBusy(null) }
  }
  return { busy, toggle }
}

/** The Library: channels and resources every org can browse and save, from Life2Launch and resource partners. */
export default function LibraryTab() {
  const { orgId, orgslug, token, ready } = useResourcesContext()
  const [input, setInput] = React.useState('')
  const [query, setQuery] = React.useState('')
  React.useEffect(() => { const timer = setTimeout(() => setQuery(input.trim()), 300); return () => clearTimeout(timer) }, [input])
  const { data } = useSWR(ready ? resourceKeys.library(orgId, query) : null, () => resourcesApi.library(orgId, query, '', token), { keepPreviousData: true })
  const save = useLibrarySave()
  const filter = useResourceFilter(data?.resources || [])

  const saveAction = (resource: ResourceRow) => !resource.is_shared_from_other_org
    ? <span className="rounded-full bg-muted px-2.5 py-1 text-[12px] font-semibold text-muted-foreground">Yours</span>
    : resource.saved && !resource.saved_directly ? <span className="rounded-full bg-muted px-2.5 py-1 text-[12px] font-semibold text-muted-foreground" title="Its channel is saved">Saved</span>
    : <SaveButton compact saved={resource.saved} label={resource.title} busy={save.busy === resource.resource_uuid} onClick={() => void save.toggle('resource', resource.resource_uuid, resource.saved_directly)} />
  const channelAction = (channel: ChannelCard) => channel.is_shared_from_other_org
    ? <SaveButton compact saved={channel.saved} label={channel.name} busy={save.busy === channel.channel_uuid} onClick={() => void save.toggle('channel', channel.channel_uuid, channel.saved)} />
    : null

  const [featured, ...others] = data?.channels || []
  return <div>
    <label className="flex h-12 max-w-[640px] items-center gap-2 rounded-full border border-border bg-card px-4 text-muted-foreground focus-within:border-foreground/40">
      <Search size={18} aria-hidden="true" />
      <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Search the Library for links, videos, tools…" aria-label="Search the Library" autoComplete="off"
        className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground" />
    </label>
    {!data ? <Loading /> : <>
      {featured && !query ? <FeaturedChannel channel={featured} action={channelAction(featured)} orgslug={orgslug} /> : null}
      {(query ? data.channels : others).length ? <section aria-labelledby="library-channels-title">
        <SectionHeader id="library-channels-title" title={query ? 'Channels' : 'More channels'} count={(query ? data.channels : others).length} />
        <div className="-mx-1 flex snap-x snap-proximity gap-3.5 overflow-x-auto px-1 pb-3 pt-1 [scrollbar-width:thin]">
          {(query ? data.channels : others).map((channel) => <ChannelTile key={channel.channel_uuid} orgslug={orgslug} channel={channel} action={channelAction(channel)} />)}
        </div>
      </section> : null}
      <section aria-labelledby="library-resources-title">
        <SectionHeader id="library-resources-title" title={query ? 'Resources' : 'Popular'} count={query ? data.resources.length : undefined} />
        <TypeChips types={filter.types} value={filter.type} onChange={filter.setType} />
        {filter.shown.length ? <ul className={listClass}>
          {filter.shown.map((resource) => <ResourceListRow key={resource.resource_uuid} orgslug={orgslug} resource={resource} showOwner actions={saveAction(resource)} />)}
        </ul> : <p className="rounded-[22px] border-[1.5px] border-dashed border-border px-5 py-8 text-center text-muted-foreground">
          {query ? `Nothing in the Library matches “${query}”.` : 'The Library is empty for now. Resource partners list their channels here.'}
        </p>}
      </section>
    </>}
  </div>
}

/** The most-saved channel, large, with Save. */
function FeaturedChannel({ channel, action, orgslug }: { channel: ChannelCard; action: React.ReactNode; orgslug: string }) {
  return <section aria-label="Featured channel" className="mt-6 grid overflow-hidden rounded-[24px] bg-[#16212a] text-white md:grid-cols-[1.1fr_1fr]">
    <div className="flex flex-col justify-center gap-3 p-6 sm:p-8">
      <span className="text-[11.5px] font-bold uppercase tracking-[.14em] text-white/70">Featured channel</span>
      <Link href={channelHref(orgslug, channel.channel_uuid)} className="text-[clamp(24px,3vw,32px)] font-extrabold leading-tight tracking-tight hover:underline">{channel.name}</Link>
      {channel.description ? <p className="line-clamp-3 max-w-[460px] text-[15px] leading-normal text-white/80">{channel.description}</p> : null}
      <OrgChip name={channel.owner_org_name} className="text-white/80" />
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {action}
        <span className="rounded-full bg-white/10 px-3 py-1.5 text-[13px] font-semibold">{plural(channel.resource_count, 'resource')}</span>
        {channel.save_count ? <span className="text-[13px] text-white/70">Saved by {plural(channel.save_count, 'org')}</span> : null}
      </div>
    </div>
    <ChannelCover channel={channel} className="min-h-[180px]" />
  </section>
}
