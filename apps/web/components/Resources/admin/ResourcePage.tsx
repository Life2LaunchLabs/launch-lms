'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { Check, ExternalLink, FolderOpen, Info, MoreHorizontal, Pencil, Plus, Route, Trash2, X } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { EmptyState } from '@components/Goals/admin/live/ui'
import { plural } from '@components/Plans/plan/planVersions'
import { primaryActionClass, smallActionClass } from '@components/Plans/shared/actions'
import { PlanCover } from '@components/Plans/shared/PlanCover'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { isResourcesKey, resourceKeys, resourcesApi, typeLabel, type ResourceDetail } from '@services/resources/workspace'
import { useLibrarySave } from './LibraryTab'
import { Loading } from './listing'
import { ResourceModal } from './modals'
import { OrgChip, SaveButton, TypeTile, channelHref, domainOf, useResourcesContext } from './pieces'

const cardClass = 'rounded-[20px] border border-border bg-card p-5'
const personName = (person: ResourceDetail['added_by']) => person ? [person.first_name, person.last_name].filter(Boolean).join(' ') || person.username || 'Someone' : null

/** A resource: its header (type, title, description, who added it, open the link), and its channels, plans and details beside. */
export default function ResourcePage({ resourceUuid }: { resourceUuid: string }) {
  const router = useRouter()
  const { orgId, orgslug, token, ready } = useResourcesContext()
  const { data: resource, error } = useSWR(ready ? resourceKeys.resource(orgId, resourceUuid) : null, () => resourcesApi.resource(orgId, resourceUuid, token))
  const { data: workspace } = useSWR(ready ? resourceKeys.workspace(orgId) : null, () => resourcesApi.workspace(orgId, token))
  const [editing, setEditing] = React.useState(false)
  const save = useLibrarySave()

  if (error && !resource) return <div className="p-10"><EmptyState title="Resource not found" detail="It may have been removed, or it isn’t shared with your organization." /></div>
  if (!resource) return <Loading />

  const remove = async () => {
    if (!window.confirm(`Delete “${resource.title}”? It leaves every channel, and plans that link to it lose the link.`)) return
    try {
      await resourcesApi.deleteResource(resourceUuid, token)
      await mutate(isResourcesKey)
      router.push(getUriWithOrg(orgslug, routePaths.org.admin.resources.root()))
    } catch (failure: any) { toast.error(failure?.message || 'Could not delete the resource.') }
  }
  const addedBy = personName(resource.added_by)
  const back = resource.channels[0]
  return <div className="min-h-full w-full bg-[#f8f8f8]"><div className="mx-auto max-w-[1180px] px-4 pb-16 pt-5 sm:px-8 sm:pt-7">
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
      <Link href={getUriWithOrg(orgslug, routePaths.org.admin.resources.root())} className="hover:text-foreground">Resources</Link>
      {back ? <><span aria-hidden="true">/</span><Link href={channelHref(orgslug, back.channel_uuid)} className="hover:text-foreground">{back.name}</Link></> : null}
    </nav>
    <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <header className="flex items-start gap-4 sm:gap-5">
          {resource.cover_image_url
            ? <img src={resource.cover_image_url} alt="" className="aspect-[16/10] w-[96px] shrink-0 rounded-[14px] object-cover sm:w-[130px]" />
            : <TypeTile type={resource.resource_type} className="aspect-[16/10] w-[96px] rounded-[14px] sm:w-[130px] [&_svg]:size-8" />}
          <div className="min-w-0 flex-1">
            <h1 className="text-[clamp(24px,3vw,34px)] font-extrabold leading-[1.15] tracking-[-0.03em]">{resource.title}</h1>
            {resource.description ? <p className="mt-1.5 whitespace-pre-line text-base leading-normal text-muted-foreground">{resource.description}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground">
              <OrgChip name={resource.is_shared_from_other_org ? resource.owner_org_name : addedBy ? `Added by ${addedBy}` : resource.owner_org_name} />
              <span>{[typeLabel(resource.resource_type), resource.estimated_time ? `${resource.estimated_time} min` : null].filter(Boolean).join(' · ')}</span>
              <span className="truncate">{resource.provider_name || domainOf(resource.external_url)}</span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <a href={resource.external_url} target="_blank" rel="noopener noreferrer" className={primaryActionClass}><ExternalLink size={16} aria-hidden="true" />Open link</a>
              {resource.is_shared_from_other_org && !(resource.saved && !resource.saved_directly) ? <SaveButton saved={resource.saved} busy={save.busy === resourceUuid}
                onClick={() => void save.toggle('resource', resourceUuid, resource.saved_directly)} /> : null}
            </div>
          </div>
          {resource.can_edit ? <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" aria-label="Manage resource" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-muted"><MoreHorizontal size={18} /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 rounded-[14px] p-1.5">
              <DropdownMenuItem onSelect={() => setEditing(true)}><Pencil />Edit</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void remove()} className="text-red-700 focus:text-red-700"><Trash2 />Delete resource</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu> : null}
        </header>
      </div>
      <aside className="space-y-4">
        <ChannelsCard resource={resource} channels={workspace?.channels || []} />
        <PlansCard resource={resource} />
        <DetailsCard resource={resource} addedBy={addedBy} />
      </aside>
    </div>
    {resource.can_edit ? <ResourceModal open={editing} setOpen={setEditing} channels={[]} resource={{ ...resource, resource_uuid: resourceUuid }} /> : null}
  </div></div>
}

function CardTitle({ icon: Icon, children, action }: { icon: typeof Info; children: React.ReactNode; action?: React.ReactNode }) {
  return <div className="mb-3 flex items-center gap-2.5">
    <span className="grid h-8 w-8 place-items-center rounded-lg bg-muted"><Icon size={16} aria-hidden="true" /></span>
    <h2 className="flex-1 text-[15px] font-bold">{children}</h2>{action}
  </div>
}

/** The channels it's in that this org sees, and (for the org's own) putting it in more. */
function ChannelsCard({ resource, channels }: { resource: ResourceDetail; channels: Array<{ channel_uuid: string; name: string; is_shared_from_other_org: boolean }> }) {
  const { orgslug, token } = useResourcesContext()
  const own = channels.filter((channel) => !channel.is_shared_from_other_org)
  const inside = new Set(resource.channels.map((channel) => channel.channel_uuid))
  const toggle = async (uuid: string) => {
    try {
      await (inside.has(uuid) ? resourcesApi.unlink : resourcesApi.link)(uuid, resource.resource_uuid, token)
      await mutate(isResourcesKey)
    } catch (failure: any) { toast.error(failure?.message || 'Could not change its channels.') }
  }
  const canPut = own.length > 0 && !resource.is_shared_from_other_org
  return <section className={cardClass} aria-label="In channels">
    <CardTitle icon={FolderOpen} action={canPut ? <DropdownMenu>
      <DropdownMenuTrigger asChild><button type="button" className={smallActionClass}><Plus aria-hidden="true" />Add</button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 rounded-[14px] p-1.5">
        <DropdownMenuLabel className="px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[.06em] text-muted-foreground">Your channels</DropdownMenuLabel>
        {own.map((channel) => <DropdownMenuItem key={channel.channel_uuid} onSelect={(event) => { event.preventDefault(); void toggle(channel.channel_uuid) }}>
          <span className="flex-1 truncate">{channel.name}</span>{inside.has(channel.channel_uuid) ? <Check size={15} /> : null}
        </DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu> : null}>In channels</CardTitle>
    {resource.channels.length ? <ul className="space-y-1.5">{resource.channels.map((channel) => <li key={channel.channel_uuid} className="flex items-center gap-2">
      <Link href={channelHref(orgslug, channel.channel_uuid)} className="min-w-0 flex-1 truncate rounded-xl border border-border px-3 py-2 text-sm font-semibold hover:bg-muted/50">{channel.name}</Link>
      {canPut && own.some((item) => item.channel_uuid === channel.channel_uuid) ? <button type="button" aria-label={`Remove from ${channel.name}`} onClick={() => void toggle(channel.channel_uuid)} className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted"><X size={14} /></button> : null}
    </li>)}</ul> : <p className="text-[13.5px] text-muted-foreground">Not in a channel yet, so only your staff see it.</p>}
  </section>
}

function PlansCard({ resource }: { resource: ResourceDetail }) {
  const { orgslug } = useResourcesContext()
  return <section className={cardClass} aria-label="Used in plans">
    <CardTitle icon={Route}>Used in plans</CardTitle>
    {resource.used_in.length ? <ul className="space-y-1.5">{resource.used_in.map((plan) => <li key={plan.template_uuid}>
      <Link href={getUriWithOrg(orgslug, routePaths.org.admin.template(plan.template_uuid))} className="flex items-center gap-3 rounded-xl border border-border px-2.5 py-2 hover:bg-muted/50">
        <PlanCover plan={plan} className="h-9 w-9 shrink-0 rounded-lg" />
        <span className="min-w-0"><b className="block truncate text-sm">{plan.title}</b><span className="block truncate text-xs text-muted-foreground">{plan.steps.length === 1 ? plan.steps[0] : plural(plan.steps.length, 'step')}</span></span>
      </Link>
    </li>)}</ul> : <p className="text-[13.5px] text-muted-foreground">Not in any of your plans yet.</p>}
  </section>
}

function DetailsCard({ resource, addedBy }: { resource: ResourceDetail; addedBy: string | null }) {
  const added = new Date(resource.creation_date)
  const rows: Array<[string, React.ReactNode]> = [
    ['Link', <a key="link" href={resource.external_url} target="_blank" rel="noopener noreferrer" className="block truncate underline-offset-2 hover:underline">{resource.external_url}</a>],
    ['From', resource.provider_name || domainOf(resource.external_url)],
    ['Added', `${Number.isNaN(added.getTime()) ? '' : added.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}${addedBy ? ` by ${addedBy}` : ''}`],
    ['Library', resource.in_library ? 'In the Library' : 'Not in the Library'],
  ]
  if (resource.tags.length) rows.push(['Tags', <span key="tags" className="flex flex-wrap gap-1">{resource.tags.map((tag) => <span key={tag.tag_uuid} className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{tag.name}</span>)}</span>])
  return <section className={cardClass} aria-label="Details">
    <CardTitle icon={Info}>Details</CardTitle>
    <dl className="space-y-2 text-[13.5px]">{rows.map(([term, detail]) => <div key={term} className="grid grid-cols-[72px_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">{term}</dt><dd className="min-w-0">{detail}</dd></div>)}</dl>
  </section>
}
