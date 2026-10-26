'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Plus } from 'lucide-react'
import { SectionHeader } from '@components/Plans/library/PlanCards'
import { primaryActionClass } from '@components/Plans/shared/actions'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { resourceKeys, resourcesApi, type Workspace } from '@services/resources/workspace'
import { cn } from '@/lib/utils'
import LibraryTab from './LibraryTab'
import { Loading, SearchBox, TypeChips, useResourceFilter } from './listing'
import { NewChannelModal, ResourceModal } from './modals'
import { ChannelTile, NewChannelTile, ResourceListRow, listClass, useResourcesContext } from './pieces'

type Tab = 'mine' | 'library'

/** Resources: the title and Add resource, then Your resources and the Library as tabs. */
export default function ResourcesHome({ tab }: { tab: Tab }) {
  const { orgId, orgslug, token, ready } = useResourcesContext()
  const { data: workspace } = useSWR(ready ? resourceKeys.workspace(orgId) : null, () => resourcesApi.workspace(orgId, token))
  const [adding, setAdding] = React.useState(false)
  const tabs: Array<{ id: Tab; label: string; href: string; count?: number }> = [
    { id: 'mine', label: 'Your resources', href: routePaths.org.admin.resources.root(), count: workspace?.resources.length },
    { id: 'library', label: 'Library', href: routePaths.org.admin.resources.library() },
  ]
  return <div className="min-h-full w-full bg-[#f8f8f8]">
    <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-7 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[32px] font-extrabold leading-tight tracking-tight">Resources</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">Links your team shares with learners, and an open library of more.</p>
        </div>
        <button type="button" onClick={() => setAdding(true)} className={primaryActionClass}><Plus size={16} aria-hidden="true" />Add resource</button>
      </header>
      <nav aria-label="Resources pages" className="mt-5 flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]">
        {tabs.map(({ id, label, href, count }) => <Link key={id} href={getUriWithOrg(orgslug, href)} aria-current={tab === id ? 'page' : undefined}
          className={cn('-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-[3px] px-3.5 py-2.5 text-sm font-bold transition-colors',
            tab === id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          {label}{count ? <span className="rounded-full bg-muted px-[7px] py-px text-[11px]">{count}</span> : null}
        </Link>)}
      </nav>
      <div className="pt-7">
        {tab === 'library' ? <LibraryTab /> : workspace ? <YourResources workspace={workspace} onAdd={() => setAdding(true)} /> : <Loading />}
      </div>
    </div>
    <ResourceModal open={adding} setOpen={setAdding} channels={workspace?.channels || []} />
  </div>
}

/** Your resources: the org's channels and the Library channels it saved, then every resource in them. */
function YourResources({ workspace, onAdd }: { workspace: Workspace; onAdd: () => void }) {
  const { orgslug } = useResourcesContext()
  const [newChannel, setNewChannel] = React.useState(false)
  const filter = useResourceFilter(workspace.resources)
  return <div>
    <section aria-labelledby="channels-title">
      <SectionHeader id="channels-title" title="Channels" count={workspace.channels.length} className="mt-0" />
      <div className="-mx-1 flex snap-x snap-proximity gap-3.5 overflow-x-auto px-1 pb-3 pt-1 [scrollbar-width:thin]">
        {workspace.channels.map((channel) => <ChannelTile key={channel.channel_uuid} orgslug={orgslug} channel={channel} />)}
        <NewChannelTile onClick={() => setNewChannel(true)} />
      </div>
    </section>
    <section aria-labelledby="all-resources-title">
      <SectionHeader id="all-resources-title" title="All resources" count={workspace.resources.length}>
        {workspace.resources.length ? <SearchBox value={filter.query} onChange={filter.setQuery} label="Search your resources" /> : null}
      </SectionHeader>
      <TypeChips types={filter.types} value={filter.type} onChange={filter.setType} />
      {workspace.resources.length ? filter.shown.length ? <ul className={listClass}>
        {filter.shown.map((resource) => <ResourceListRow key={resource.resource_uuid} orgslug={orgslug} resource={resource} showOwner={resource.is_shared_from_other_org} />)}
      </ul> : <p className="rounded-[22px] border-[1.5px] border-dashed border-border px-5 py-8 text-center text-muted-foreground">Nothing matches.</p>
        : <div className="flex flex-col items-center gap-2.5 rounded-[22px] border-[1.5px] border-dashed border-border px-6 py-12 text-center">
          <h2 className="text-[20px] font-bold tracking-tight">No resources yet</h2>
          <p className="max-w-[420px] leading-normal text-muted-foreground">Add the links your team sends learners, or save channels and resources from the Library.</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={onAdd} className={primaryActionClass}><Plus size={16} aria-hidden="true" />Add resource</button>
            <Link href={getUriWithOrg(orgslug, routePaths.org.admin.resources.library())} className="inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold hover:bg-muted">Browse the Library</Link>
          </div>
        </div>}
    </section>
    <NewChannelModal open={newChannel} setOpen={setNewChannel} />
  </div>
}
