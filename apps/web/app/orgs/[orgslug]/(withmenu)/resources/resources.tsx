'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Filter, FolderOpen, Layers, Plus, Search, X } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import ResourceCard from '@components/Resources/ResourceCard'
import ChipMultiSelect from '@components/Resources/ChipMultiSelect'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import { Button } from '@components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import {
  createUserResourceChannel,
  getResourceChannels,
  getResources,
  getResourceTags,
  ResourceChannel,
  ResourceTag,
  UserResourceChannel,
} from '@services/resources/resources'
import { getResourceChannelThumbnailMediaDirectory } from '@services/media/media'
import { toast } from 'react-hot-toast'

function ActiveFilterChip({
  label,
  onRemove,
}: {
  label: string
  onRemove: () => void
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
      <span className="whitespace-nowrap">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="flex h-4 w-4 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
        aria-label={`Remove ${label}`}
      >
        <X size={11} />
      </button>
    </span>
  )
}

function ChannelTile({
  title,
  description,
  thumbnail,
  active,
  onClick,
}: {
  title: string
  description?: string | null
  thumbnail?: string | null
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${active ? 'border-black bg-gray-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
    >
      <div className="h-10 w-10 rounded-lg bg-gray-100 overflow-hidden shrink-0">
        {thumbnail ? (
          <img src={thumbnail} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-400">
            <FolderOpen size={16} />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate font-medium text-gray-900">{title}</div>
        {description && <div className="truncate text-sm text-gray-500">{description}</div>}
      </div>
    </button>
  )
}

export default function ResourcesClient({ orgslug }: { orgslug: string }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const orgId = org?.id
  const orgUUID = org?.org_uuid
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeChannel, setActiveChannel] = useState<string>('all')
  const [activeUserChannel, setActiveUserChannel] = useState<string>('')
  const [search, setSearch] = useState('')
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [resourceTypes, setResourceTypes] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [accessMode, setAccessMode] = useState('')
  const [provider, setProvider] = useState('')
  const [newChannelModalOpen, setNewChannelModalOpen] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelDescription, setNewChannelDescription] = useState('')

  const { data: channelData, mutate: mutateChannels } = useSWR(
    orgId ? ['resource-channels', orgId, accessToken || 'anon'] : null,
    () => getResourceChannels(orgId, accessToken)
  )

  const { data: resourceTags = [] } = useSWR(
    orgId ? ['resource-tags', orgId, accessToken || 'anon'] : null,
    () => getResourceTags(orgId, accessToken)
  )

  const resourceParams = useMemo(() => ({
    channel_uuid: activeChannel !== 'all' ? activeChannel : undefined,
    user_channel_uuid: activeUserChannel || undefined,
    query: search || undefined,
    resource_types: resourceTypes.length > 0 ? resourceTypes.join(',') : undefined,
    tags: selectedTags.length > 0
      ? resourceTags
          .filter((tag) => selectedTags.includes(tag.tag_uuid))
          .map((tag) => tag.name)
          .join(',')
      : undefined,
    access: accessMode || undefined,
    provider: provider || undefined,
  }), [activeChannel, activeUserChannel, search, resourceTypes, selectedTags, resourceTags, accessMode, provider])

  const { data: resources = [] } = useSWR(
    orgId ? ['resources', orgId, resourceParams, accessToken || 'anon'] : null,
    () => getResources(orgId, resourceParams, accessToken)
  )

  const channels = channelData?.channels || []
  const userChannels = channelData?.user_channels || []
  const activeChannelData = channels.find((channel: ResourceChannel) => channel.channel_uuid === activeChannel)
  const activeUserChannelData = userChannels.find((channel: UserResourceChannel) => channel.user_channel_uuid === activeUserChannel)

  const createSavedChannel = async () => {
    if (!newChannelName.trim() || !accessToken || !orgId) return
    try {
      await createUserResourceChannel(
        orgId,
        { name: newChannelName.trim(), description: newChannelDescription.trim() || null },
        accessToken
      )
      setNewChannelName('')
      setNewChannelDescription('')
      setNewChannelModalOpen(false)
      mutateChannels()
      toast.success('Channel created')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create channel')
    }
  }

  const activeThumb = activeChannelData?.thumbnail_image && orgUUID
    ? getResourceChannelThumbnailMediaDirectory(orgUUID, activeChannelData.channel_uuid, activeChannelData.thumbnail_image)
    : null

  const activeChannelName = activeUserChannelData?.name || activeChannelData?.name || 'All Resources'
  const resourceTypeOptions = useMemo(
    () => [
      { value: 'assessment', label: 'Assessment' },
      { value: 'video', label: 'Video' },
      { value: 'article', label: 'Article' },
      { value: 'tool', label: 'Tool' },
      { value: 'guide', label: 'Guide' },
      { value: 'course', label: 'Course' },
      { value: 'other', label: 'Other' },
    ],
    []
  )
  const resourceTagOptions = useMemo(
    () =>
      resourceTags.map((tag: ResourceTag) => ({
        value: tag.tag_uuid,
        label: tag.name,
      })),
    [resourceTags]
  )
  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = []

    if (search.trim()) {
      chips.push({
        key: `search-${search}`,
        label: `Search: ${search.trim()}`,
        onRemove: () => setSearch(''),
      })
    }

    resourceTypes.forEach((value) => {
      const option = resourceTypeOptions.find((item) => item.value === value)
      if (!option) return
      chips.push({
        key: `type-${value}`,
        label: `Type: ${option.label}`,
        onRemove: () => setResourceTypes((current) => current.filter((item) => item !== value)),
      })
    })

    selectedTags.forEach((value) => {
      const option = resourceTagOptions.find((item) => item.value === value)
      if (!option) return
      chips.push({
        key: `tag-${value}`,
        label: `Tag: ${option.label}`,
        onRemove: () => setSelectedTags((current) => current.filter((item) => item !== value)),
      })
    })

    if (accessMode) {
      chips.push({
        key: `access-${accessMode}`,
        label: `Access: ${accessMode.charAt(0).toUpperCase()}${accessMode.slice(1)}`,
        onRemove: () => setAccessMode(''),
      })
    }

    if (provider.trim()) {
      chips.push({
        key: `provider-${provider}`,
        label: `Provider: ${provider.trim()}`,
        onRemove: () => setProvider(''),
      })
    }

    return chips
  }, [search, resourceTypes, selectedTags, accessMode, provider, resourceTypeOptions, resourceTagOptions])
  const clearAllFilters = () => {
    setSearch('')
    setResourceTypes([])
    setSelectedTags([])
    setAccessMode('')
    setProvider('')
  }

  return (
    <GeneralWrapperStyled>
      {/* Page header */}
      <div className="flex items-center gap-2.5 my-4">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white nice-shadow">
          <Layers size={16} className="text-black" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Resources</h1>
      </div>

      {/* Channel switcher */}
      <button
        onClick={() => setDrawerOpen(true)}
        className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="h-9 w-9 rounded-lg bg-gray-100 overflow-hidden shrink-0">
          {activeThumb ? (
            <img src={activeThumb} alt={activeChannelName} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-400">
              <FolderOpen size={16} />
            </div>
          )}
        </div>
        <h2 className="text-lg font-semibold text-gray-900">{activeChannelName}</h2>
      </button>

      <div className="mt-4 flex items-center gap-2 overflow-hidden rounded-2xl border border-gray-200 bg-white px-2 py-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-xl border-gray-200">
              <Filter size={16} />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="z-[120] w-[340px] rounded-2xl border-gray-200 p-0 shadow-2xl">
            <div className="border-b border-gray-100 px-4 py-3">
              <div className="text-sm font-semibold text-gray-900">Filters</div>
              <div className="text-xs text-gray-500">Refine resources without crowding the page.</div>
            </div>
            <div className="space-y-4 px-4 py-4">
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Types</div>
                <ChipMultiSelect
                  options={resourceTypeOptions}
                  selectedValues={resourceTypes}
                  onChange={setResourceTypes}
                  placeholder="All types"
                  searchPlaceholder="Filter types"
                  emptyMessage="No resource types found."
                  displayMode="summary"
                />
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Tags</div>
                <ChipMultiSelect
                  options={resourceTagOptions}
                  selectedValues={selectedTags}
                  onChange={setSelectedTags}
                  placeholder="All tags"
                  searchPlaceholder="Filter tags"
                  emptyMessage="No tags yet."
                  displayMode="summary"
                />
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Access</div>
                <select
                  value={accessMode}
                  onChange={(e) => setAccessMode(e.target.value)}
                  className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
                >
                  <option value="">All access</option>
                  <option value="free">Free</option>
                  <option value="paid">Paid</option>
                  <option value="restricted">Restricted</option>
                </select>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Provider</div>
                <input
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400"
                  placeholder="Provider"
                />
              </div>

              {activeFilterChips.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={clearAllFilters}
                  className="w-full justify-center rounded-xl text-sm text-slate-600 hover:bg-slate-50"
                >
                  Clear all filters
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <div
          className={`flex shrink-0 items-center rounded-xl border border-gray-200 bg-gray-50 transition-all ${
            searchExpanded || search.trim() ? 'w-[240px] px-3' : 'w-10 justify-center'
          }`}
        >
          <button
            type="button"
            onClick={() => setSearchExpanded(true)}
            className="flex h-10 shrink-0 items-center justify-center text-gray-400"
            aria-label="Search resources"
          >
            <Search size={16} />
          </button>
          {(searchExpanded || search.trim()) && (
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onBlur={() => {
                if (!search.trim()) setSearchExpanded(false)
              }}
              className="h-10 w-full bg-transparent text-sm outline-none"
              placeholder="Search resources"
              autoFocus={searchExpanded && !search.trim()}
            />
          )}
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex min-h-10 items-center gap-2 whitespace-nowrap">
            {activeFilterChips.length > 0 ? (
              activeFilterChips.map((chip) => (
                <ActiveFilterChip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
              ))
            ) : (
              <span className="text-sm text-gray-400">No active filters</span>
            )}
          </div>
        </div>
      </div>

      {/* Resources grid */}
      <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-1">
        {resources.map((resource) => (
          <ResourceCard key={resource.resource_uuid} resource={resource} orgslug={orgslug} orgUUID={orgUUID} />
        ))}
        {resources.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center text-gray-500">
            No resources match this view yet.
          </div>
        )}
      </div>

      {/* Channel drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="relative h-full w-full max-w-md bg-white p-5 shadow-2xl overflow-y-auto">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Channels</h2>
              <button className="rounded-lg border border-gray-200 px-3 py-2 text-sm" onClick={() => setDrawerOpen(false)}>
                Close
              </button>
            </div>

            {/* Your channels */}
            {accessToken && (
              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Your channels</span>
                  <button
                    onClick={() => setNewChannelModalOpen(true)}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-gray-100 hover:bg-gray-200 transition-colors"
                    title="New channel"
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <div className="space-y-2">
                  {userChannels.map((channel: UserResourceChannel) => (
                    <ChannelTile
                      key={channel.user_channel_uuid}
                      title={channel.name}
                      description={`${channel.resource_count} saved`}
                      active={activeUserChannel === channel.user_channel_uuid}
                      onClick={() => {
                        setActiveUserChannel(channel.user_channel_uuid)
                        setActiveChannel('all')
                        setDrawerOpen(false)
                      }}
                    />
                  ))}
                  {userChannels.length === 0 && (
                    <p className="py-1 text-sm text-gray-400">No channels yet</p>
                  )}
                </div>
              </div>
            )}

            {/* All channels */}
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">All channels</div>
              <div className="space-y-2">
                <ChannelTile
                  title="All"
                  description="Browse across every accessible channel"
                  active={activeChannel === 'all' && !activeUserChannel}
                  onClick={() => {
                    setActiveChannel('all')
                    setActiveUserChannel('')
                    setDrawerOpen(false)
                  }}
                />
                {channels.map((channel: ResourceChannel) => {
                  const thumb = channel.thumbnail_image && orgUUID
                    ? getResourceChannelThumbnailMediaDirectory(orgUUID, channel.channel_uuid, channel.thumbnail_image)
                    : null
                  return (
                    <ChannelTile
                      key={channel.channel_uuid}
                      title={channel.name}
                      description={`${channel.resource_count} resources`}
                      thumbnail={thumb}
                      active={activeChannel === channel.channel_uuid}
                      onClick={() => {
                        setActiveChannel(channel.channel_uuid)
                        setActiveUserChannel('')
                        setDrawerOpen(false)
                      }}
                    />
                  )
                })}
              </div>
            </div>
          </div>
          <button className="flex-1 bg-black/25" onClick={() => setDrawerOpen(false)} aria-label="Close drawer" />
        </div>
      )}

      {/* New channel modal */}
      {newChannelModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-md rounded-3xl bg-white nice-shadow p-6">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">New channel</h3>
              <button
                onClick={() => setNewChannelModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
                <input
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createSavedChannel()}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                  placeholder="Channel name"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={newChannelDescription}
                  onChange={(e) => setNewChannelDescription(e.target.value)}
                  className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                  placeholder="Optional description"
                  rows={3}
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setNewChannelModalOpen(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createSavedChannel}
                disabled={!newChannelName.trim()}
                className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-40 transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </GeneralWrapperStyled>
  )
}
