'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { ArrowDown, ArrowUp, Check, ChevronDown, Globe, Lock, MoreHorizontal, Plus, Trash2, X } from 'lucide-react'
import ImageMediaPicker from '@components/Objects/Media/ImageMediaPicker'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { EmptyState } from '@components/Goals/admin/live/ui'
import { plural } from '@components/Plans/plan/planVersions'
import { primaryActionClass, smallActionClass } from '@components/Plans/shared/actions'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { AUDIENCE_LABELS, isResourcesKey, resourceKeys, resourcesApi, type ChannelAudience, type ChannelDetail } from '@services/resources/workspace'
import { getUserGroups, linkResourcesToUserGroup, unLinkResourcesToUserGroup } from '@services/usergroups/usergroups'
import { cn } from '@/lib/utils'
import { useLibrarySave } from './LibraryTab'
import { Loading, SearchBox, useResourceFilter } from './listing'
import { ChannelComments, NeedsLookCard } from './comments'
import { ResourceModal } from './modals'
import { AudienceIcon, ChannelCover, OrgChip, ResourceListRow, SaveButton, listClass, useResourcesContext } from './pieces'

const chipClass = 'inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[13.5px] font-semibold hover:bg-muted'

/** A channel: its header (cover, name, description, who sees it, the Library) and its resources underneath. */
export default function ChannelPage({ channelUuid }: { channelUuid: string }) {
  const router = useRouter()
  const { orgId, orgslug, orgName, token, ready } = useResourcesContext()
  const { data: channel, error } = useSWR(ready ? resourceKeys.channel(orgId, channelUuid) : null, () => resourcesApi.channel(orgId, channelUuid, token))
  const { data: workspace } = useSWR(ready ? resourceKeys.workspace(orgId) : null, () => resourcesApi.workspace(orgId, token))
  const [adding, setAdding] = React.useState(false)
  const [picking, setPicking] = React.useState(false)
  const [groupsOpen, setGroupsOpen] = React.useState(false)
  const [tab, setTab] = React.useState<'resources' | 'comments'>('resources')
  const filter = useResourceFilter(channel?.resources || [])
  const save = useLibrarySave()

  if (error && !channel) return <div className="p-10"><EmptyState title="Channel not found" detail="It may have been removed, or it isn’t shared with your organization." /></div>
  if (!channel) return <Loading />

  const editable = channel.can_edit
  const update = async (data: Parameters<typeof resourcesApi.updateChannel>[1]) => {
    try {
      await resourcesApi.updateChannel(channelUuid, data, token)
      await mutate(isResourcesKey)
    } catch (failure: any) { toast.error(failure?.message || 'Could not save the channel.') }
  }
  const setAudience = (audience: ChannelAudience) => {
    void update({ audience })
    if (audience === 'groups') setGroupsOpen(true)
  }
  const remove = async () => {
    if (!window.confirm(`Delete the channel “${channel.name}”? Its resources stay in Your resources.`)) return
    try {
      await resourcesApi.deleteChannel(channelUuid, token)
      await mutate(isResourcesKey)
      router.push(getUriWithOrg(orgslug, routePaths.org.admin.resources.root()))
    } catch (failure: any) { toast.error(failure?.message || 'Could not delete the channel.') }
  }
  const order = channel.resources.map((resource) => resource.resource_uuid)
  const move = async (uuid: string, step: number) => {
    const from = order.indexOf(uuid)
    const next = [...order]
    next.splice(from, 1)
    next.splice(from + step, 0, uuid)
    try {
      await resourcesApi.reorder(channelUuid, next, token)
      await mutate(resourceKeys.channel(orgId, channelUuid))
    } catch (failure: any) { toast.error(failure?.message || 'Could not move it.') }
  }
  const unlink = async (uuid: string) => {
    try {
      await resourcesApi.unlink(channelUuid, uuid, token)
      await mutate(isResourcesKey)
    } catch (failure: any) { toast.error(failure?.message || 'Could not remove it.') }
  }

  return <div className="min-h-full w-full bg-[#f8f8f8]"><div className="mx-auto max-w-[1180px] px-4 pb-16 pt-5 sm:px-8 sm:pt-7">
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
      <Link href={getUriWithOrg(orgslug, routePaths.org.admin.resources.root())} className="hover:text-foreground">Resources</Link>
      <span aria-hidden="true">/</span>
      <Link href={getUriWithOrg(orgslug, channel.is_shared_from_other_org ? routePaths.org.admin.resources.library() : routePaths.org.admin.resources.root())} className="hover:text-foreground">
        {channel.is_shared_from_other_org ? 'Library' : 'Your resources'}
      </Link>
    </nav>
    <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <header className="flex flex-wrap items-start gap-4 sm:flex-nowrap sm:gap-5">
          <div className="flex w-[120px] shrink-0 flex-col gap-2 sm:w-[150px]">
            <ChannelCover channel={channel} className="aspect-[16/10] w-full rounded-[14px]" />
            {editable ? <ImageMediaPicker owner={{ type: 'org', id: orgId }} title="Choose a cover" buttonText="Cover" buttonSize="sm" className="h-7 rounded-full text-xs"
              onSelect={(url) => void update({ thumbnail_image: url })} /> : null}
          </div>
          <div className="min-w-0 flex-1">
            <InlineText value={channel.name} editable={editable} label="Channel name" className="text-[clamp(26px,3vw,36px)] font-extrabold leading-[1.15] tracking-[-0.035em]"
              onSave={(name) => name ? update({ name }) : undefined} />
            <InlineText value={channel.description || ''} editable={editable} label="Channel description" placeholder="Add a description (optional)"
              className="mt-1 text-base leading-normal text-muted-foreground focus:text-foreground" onSave={(description) => update({ description })} />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <OrgChip name={`By ${channel.owner_org_name}`} />
              {editable ? <AudienceMenu channel={channel} orgName={orgName} onChange={setAudience} onGroups={() => setGroupsOpen(true)} /> : null}
              {editable && (channel.can_list || channel.listed) ? <LibraryMenu channel={channel} orgName={orgName} onChange={(listed) => void update({ listed })} /> : null}
              {channel.is_shared_from_other_org ? <SaveButton saved={channel.saved} busy={save.busy === channelUuid} onClick={() => void save.toggle('channel', channelUuid, channel.saved)} /> : null}
            </div>
          </div>
          {editable ? <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" aria-label="Manage channel" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-muted"><MoreHorizontal size={18} /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-[14px] p-1.5">
              {channel.thumbnail_image ? <><DropdownMenuItem onSelect={() => void update({ thumbnail_image: null })}><X />Remove cover</DropdownMenuItem><DropdownMenuSeparator /></> : null}
              <DropdownMenuItem onSelect={() => void remove()} className="text-red-700 focus:text-red-700"><Trash2 />Delete channel</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu> : null}
        </header>

        {editable ? <div role="tablist" aria-label="Channel" className="mt-6 flex gap-1 border-b border-border">
          {([['resources', 'Resources', channel.resources.length], ['comments', 'Comments', channel.needs_look]] as const).map(([id, label, count]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cn('-mb-px inline-flex items-center gap-1.5 border-b-[3px] px-3.5 py-2.5 text-sm font-bold', tab === id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {label}{count ? <span className={cn('rounded-full px-[7px] py-px text-[11px]', id === 'comments' ? 'bg-amber-100 text-amber-900' : 'bg-muted')}>{count}</span> : null}
          </button>)}
        </div> : null}
        {editable && tab === 'comments' ? <div className="mt-5"><ChannelComments channel={channel} onUpdate={update} /></div> : <section aria-labelledby="channel-resources-title" className={editable ? 'mt-5' : 'mt-7'}>
          <div className={cn('mb-3.5 flex flex-wrap items-center gap-3', editable ? 'justify-end' : 'justify-between')}>
            <h2 id="channel-resources-title" className={cn('flex items-center gap-2 text-[17px] font-bold tracking-tight', editable && 'sr-only')}>Resources<span className="text-[13px] font-semibold text-muted-foreground">{channel.resources.length}</span></h2>
            <div className="flex flex-wrap items-center gap-2">
              {channel.resources.length > 4 ? <SearchBox value={filter.query} onChange={filter.setQuery} label="Search this channel" /> : null}
              {editable ? <>
                <button type="button" onClick={() => setPicking(true)} className={smallActionClass}><Plus aria-hidden="true" />Add yours</button>
                <button type="button" onClick={() => setAdding(true)} className={cn(primaryActionClass, 'h-8 px-3 text-[13px]')}><Plus size={15} aria-hidden="true" />New resource</button>
              </> : null}
            </div>
          </div>
          {filter.shown.length ? <ul className={listClass}>
            {filter.shown.map((resource, index) => <ResourceListRow key={resource.resource_uuid} orgslug={orgslug} resource={resource} showChannels={false} showOwner={resource.is_shared_from_other_org}
              actions={editable ? <DropdownMenu>
                <DropdownMenuTrigger asChild><button type="button" aria-label={`Manage ${resource.title}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-muted"><MoreHorizontal size={17} /></button></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 rounded-[14px] p-1.5">
                  {!filter.query && index > 0 ? <DropdownMenuItem onSelect={() => void move(resource.resource_uuid, -1)}><ArrowUp />Move up</DropdownMenuItem> : null}
                  {!filter.query && index < channel.resources.length - 1 ? <DropdownMenuItem onSelect={() => void move(resource.resource_uuid, 1)}><ArrowDown />Move down</DropdownMenuItem> : null}
                  <DropdownMenuItem onSelect={() => void unlink(resource.resource_uuid)}><X />Remove from channel</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu> : undefined} />)}
          </ul> : <p className="rounded-[22px] border-[1.5px] border-dashed border-border px-5 py-8 text-center text-muted-foreground">
            {channel.resources.length ? 'Nothing matches.' : editable ? 'No resources here yet. Add a new one, or one you already have.' : 'No resources here yet.'}
          </p>}
        </section>}
      </div>
      <aside className="space-y-4">
        {editable && channel.needs_look && tab !== 'comments' ? <NeedsLookCard count={channel.needs_look} onOpen={() => setTab('comments')} /> : null}
        <AboutCard channel={channel} orgName={orgName} />
      </aside>
    </div>
    {editable ? <>
      <ResourceModal open={adding} setOpen={setAdding} channels={workspace?.channels || []} presetChannel={channelUuid} />
      <PickResourcesModal open={picking} setOpen={setPicking} channel={channel} candidates={(workspace?.resources || []).filter((resource) => !order.includes(resource.resource_uuid))} />
      <GroupsModal open={groupsOpen} setOpen={setGroupsOpen} channel={channel} />
    </> : null}
  </div></div>
}

/** Text edited in place: click, type, and it saves when you leave the field. */
function InlineText({ value, editable, label, placeholder, className, onSave }: { value: string; editable: boolean; label: string; placeholder?: string; className?: string; onSave: React.Dispatch<string> }) {
  const [text, setText] = React.useState(value)
  React.useEffect(() => setText(value), [value])
  if (!editable) return value ? <p className={className}>{value}</p> : null
  return <textarea aria-label={label} value={text} placeholder={placeholder} rows={1} onChange={(event) => setText(event.target.value)}
    onBlur={() => { if (text.trim() !== value) onSave(text.trim()) }}
    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } if (event.key === 'Escape') { setText(value); event.currentTarget.blur() } }}
    className={cn('block w-full resize-none border-0 border-b-2 border-transparent bg-transparent p-0 outline-none [field-sizing:content] hover:border-border focus:border-brand', className)} />
}

function AudienceMenu({ channel, orgName, onChange, onGroups }: { channel: ChannelDetail; orgName: string; onChange: React.Dispatch<ChannelAudience>; onGroups: () => void }) {
  const label = channel.audience === 'org' ? `Everyone at ${orgName}` : channel.audience === 'groups' ? plural(channel.usergroup_ids.length, 'group') : AUDIENCE_LABELS.staff
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button type="button" className={chipClass} aria-label={`Who sees it: ${label}`}><AudienceIcon audience={channel.audience} />{label}<ChevronDown size={14} aria-hidden="true" /></button></DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-64 rounded-[14px] p-1.5">
      <DropdownMenuLabel className="px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[.06em] text-muted-foreground">Who sees it</DropdownMenuLabel>
      {(['org', 'groups', 'staff'] as ChannelAudience[]).map((audience) => <DropdownMenuItem key={audience} onSelect={() => onChange(audience)}>
        <AudienceIcon audience={audience} /><span className="flex-1">{audience === 'org' ? `Everyone at ${orgName}` : AUDIENCE_LABELS[audience]}</span>{channel.audience === audience ? <Check size={15} /> : null}
      </DropdownMenuItem>)}
      {channel.audience === 'groups' ? <><DropdownMenuSeparator /><DropdownMenuItem onSelect={onGroups}>Choose groups…</DropdownMenuItem></> : null}
    </DropdownMenuContent>
  </DropdownMenu>
}

function LibraryMenu({ channel, orgName, onChange }: { channel: ChannelDetail; orgName: string; onChange: React.Dispatch<boolean> }) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button type="button" className={cn(chipClass, channel.listed && 'border-transparent bg-[#0B8077] text-white hover:bg-[#0B8077]/90')}>
      {channel.listed ? <Globe size={14} aria-hidden="true" /> : <Lock size={14} aria-hidden="true" />}{channel.listed ? 'In the Library' : `Only ${orgName}`}<ChevronDown size={14} aria-hidden="true" />
    </button></DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-72 rounded-[14px] p-1.5">
      <DropdownMenuItem onSelect={() => onChange(false)} className="items-start"><Lock className="mt-0.5" /><span className="flex-1"><b className="block font-semibold">Only {orgName}</b><span className="text-xs text-muted-foreground">Who sees it is set above.</span></span>{!channel.listed ? <Check size={15} /> : null}</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onChange(true)} disabled={!channel.can_list} className="items-start"><Globe className="mt-0.5" /><span className="flex-1"><b className="block font-semibold">In the Library</b><span className="text-xs text-muted-foreground">Every organization can find it and save it, and their learners can open it.</span></span>{channel.listed ? <Check size={15} /> : null}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
}

function AboutCard({ channel, orgName }: { channel: ChannelDetail; orgName: string }) {
  const rows: Array<[string, React.ReactNode]> = [
    ['By', channel.owner_org_name],
    ['Who sees it', channel.is_shared_from_other_org ? `Everyone at ${orgName}, once saved` : channel.audience === 'org' ? `Everyone at ${orgName}` : channel.audience === 'groups' ? plural(channel.usergroup_ids.length, 'group') : AUDIENCE_LABELS.staff],
    ['Library', channel.listed ? `Listed${channel.save_count ? `, saved by ${plural(channel.save_count, 'org')}` : ''}` : 'Not listed'],
  ]
  return <section aria-labelledby="channel-about-title" className="rounded-[20px] border border-border bg-card p-5">
    <h2 id="channel-about-title" className="text-[15px] font-bold">About this channel</h2>
    <dl className="mt-3 space-y-2 text-[13.5px]">{rows.map(([term, detail]) => <div key={term} className="grid grid-cols-[96px_1fr] gap-2"><dt className="text-muted-foreground">{term}</dt><dd>{detail}</dd></div>)}</dl>
  </section>
}

/** Put resources the org already has into this channel. */
function PickResourcesModal({ open, setOpen, channel, candidates }: { open: boolean; setOpen: React.Dispatch<boolean>; channel: ChannelDetail; candidates: ChannelDetail['resources'] }) {
  const { token } = useResourcesContext()
  const [picked, setPicked] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState(false)
  const filter = useResourceFilter(candidates)
  React.useEffect(() => { if (open) setPicked([]) }, [open])
  const add = async () => {
    setBusy(true)
    try {
      for (const uuid of picked) await resourcesApi.link(channel.channel_uuid, uuid, token)
      await mutate(isResourcesKey)
      setOpen(false)
    } catch (failure: any) { toast.error(failure?.message || 'Could not add them.') } finally { setBusy(false) }
  }
  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="md" dialogTitle={`Add to ${channel.name}`}
    dialogContent={<div className="space-y-3">
      <SearchBox value={filter.query} onChange={filter.setQuery} label="Search your resources" className="w-full" />
      {filter.shown.length ? <ul className="max-h-80 space-y-1 overflow-y-auto">{filter.shown.map((resource) => {
        const on = picked.includes(resource.resource_uuid)
        return <li key={resource.resource_uuid}><button type="button" aria-pressed={on} onClick={() => setPicked(on ? picked.filter((uuid) => uuid !== resource.resource_uuid) : [...picked, resource.resource_uuid])}
          className={cn('flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left', on ? 'border-foreground bg-muted/60' : 'border-transparent hover:bg-muted/40')}>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{resource.title}</span>{on ? <Check size={16} /> : null}
        </button></li>
      })}</ul> : <p className="text-sm text-muted-foreground">{candidates.length ? 'Nothing matches.' : 'Every one of your resources is already here.'}</p>}
      <button type="button" className={cn(primaryActionClass, 'ml-auto flex')} onClick={() => void add()} disabled={busy || !picked.length}>Add {picked.length ? plural(picked.length, 'resource') : 'resources'}</button>
    </div>} />
}

/** The groups that see a channel set to chosen groups. */
function GroupsModal({ open, setOpen, channel }: { open: boolean; setOpen: React.Dispatch<boolean>; channel: ChannelDetail }) {
  const { orgId, token, ready } = useResourcesContext()
  const { data } = useSWR(open && ready ? ['resource-channel-groups', orgId] : null, () => getUserGroups(orgId, token as string))
  const groups: Array<{ id: number; name: string }> = data?.data || []
  const toggle = async (groupId: number, linked: boolean) => {
    try {
      await (linked ? unLinkResourcesToUserGroup : linkResourcesToUserGroup)(groupId, channel.channel_uuid, orgId, token as string)
      await mutate(isResourcesKey)
    } catch (failure: any) { toast.error(failure?.message || 'Could not change the groups.') }
  }
  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="sm" dialogTitle="Who sees it"
    dialogContent={<div className="space-y-4">
      <ul className="space-y-1">{groups.map((group) => {
        const linked = channel.usergroup_ids.includes(group.id)
        return <li key={group.id}><button type="button" aria-pressed={linked} onClick={() => void toggle(group.id, linked)}
          className={cn('flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm font-semibold', linked ? 'border-foreground bg-muted/60' : 'border-border hover:bg-muted/40')}>
          <span className="flex-1">{group.name}</span>{linked ? <Check size={16} /> : null}
        </button></li>
      })}</ul>
      {data && !groups.length ? <p className="text-sm text-muted-foreground">Your org has no groups yet. Make them in Threads.</p> : null}
      {channel.audience === 'groups' && !channel.usergroup_ids.length ? <p className="text-xs text-amber-700">Pick at least one group, or only your staff will see this channel.</p> : null}
      <p className="text-xs text-muted-foreground">Changes save as you pick.</p>
    </div>} />
}
