'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Filter, FolderOpen, Plus, Search } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import ResourceCard from '@components/Resources/ResourceCard'
import {
  createUserResourceChannel,
  getResourceChannels,
  getResources,
  ResourceChannel,
  UserResourceChannel,
} from '@services/resources/resources'
import { getResourceChannelThumbnailMediaDirectory } from '@services/media/media'
import { toast } from 'react-hot-toast'

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
      className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${active ? 'border-black bg-gray-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
    >
      <div className="h-12 w-12 rounded-lg bg-gray-100 overflow-hidden shrink-0">
        {thumbnail ? (
          <img src={thumbnail} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-400">
            <FolderOpen size={18} />
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
  const [resourceType, setResourceType] = useState('')
  const [accessMode, setAccessMode] = useState('')
  const [provider, setProvider] = useState('')
  const [newChannelName, setNewChannelName] = useState('')

  const { data: channelData, mutate: mutateChannels } = useSWR(
    orgId ? ['resource-channels', orgId, accessToken || 'anon'] : null,
    () => getResourceChannels(orgId, accessToken)
  )

  const resourceParams = useMemo(() => ({
    channel_uuid: activeChannel !== 'all' ? activeChannel : undefined,
    user_channel_uuid: activeUserChannel || undefined,
    query: search || undefined,
    resource_type: resourceType || undefined,
    access: accessMode || undefined,
    provider: provider || undefined,
  }), [activeChannel, activeUserChannel, search, resourceType, accessMode, provider])

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
      await createUserResourceChannel(orgId, { name: newChannelName.trim(), description: null }, accessToken)
      setNewChannelName('')
      mutateChannels()
      toast.success('Saved channel created')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create channel')
    }
  }

  const activeThumb = activeChannelData?.thumbnail_image && orgUUID
    ? getResourceChannelThumbnailMediaDirectory(orgUUID, activeChannelData.channel_uuid, activeChannelData.thumbnail_image)
    : null

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-3xl bg-white nice-shadow p-5">
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex w-full items-center gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-left sm:w-auto sm:min-w-[320px]"
          >
            <div className="h-14 w-14 rounded-xl bg-gray-100 overflow-hidden shrink-0">
              {activeThumb ? (
                <img src={activeThumb} alt={activeChannelData?.name || 'All resources'} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-gray-400">
                  <FolderOpen size={20} />
                </div>
              )}
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-400">Active channel</div>
              <div className="text-lg font-semibold text-gray-900">{activeUserChannelData?.name || activeChannelData?.name || 'All'}</div>
            </div>
          </button>

          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
              <Filter size={16} />
              Filters
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 border border-gray-200">
                <Search size={16} className="text-gray-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Search resources" />
              </label>
              <select value={resourceType} onChange={(e) => setResourceType(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                <option value="">All types</option>
                <option value="assessment">Assessment</option>
                <option value="video">Video</option>
                <option value="article">Article</option>
                <option value="tool">Tool</option>
                <option value="guide">Guide</option>
                <option value="course">Course</option>
              </select>
              <select value={accessMode} onChange={(e) => setAccessMode(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                <option value="">All access</option>
                <option value="free">Free</option>
                <option value="paid">Paid</option>
                <option value="restricted">Restricted</option>
              </select>
              <input value={provider} onChange={(e) => setProvider(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" placeholder="Provider" />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {resources.map((resource) => (
              <ResourceCard key={resource.resource_uuid} resource={resource} orgslug={orgslug} orgUUID={orgUUID} />
            ))}
            {resources.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center text-gray-500">
                No resources match this view yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <button className="flex-1 bg-black/25" onClick={() => setDrawerOpen(false)} aria-label="Close drawer" />
          <div className="relative h-full w-full max-w-md bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Channels</h2>
              <button className="rounded-lg border border-gray-200 px-3 py-2 text-sm" onClick={() => setDrawerOpen(false)}>Close</button>
            </div>
            <div className="mb-4 space-y-3 rounded-2xl bg-gray-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Your saved channels</div>
              <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
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
              </div>
              {accessToken && (
                <div className="flex gap-2">
                  <input
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
                    placeholder="New saved channel"
                  />
                  <button className="rounded-xl bg-black px-3 py-2 text-white" onClick={createSavedChannel}>
                    <Plus size={16} />
                  </button>
                </div>
              )}
            </div>

            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Organization channels</div>
            <div className="mt-3 space-y-2 overflow-y-auto pr-1" style={{ maxHeight: 'calc(100vh - 360px)' }}>
              <ChannelTile title="All" description="Browse across every accessible channel" active={activeChannel === 'all' && !activeUserChannel} onClick={() => {
                setActiveChannel('all')
                setActiveUserChannel('')
                setDrawerOpen(false)
              }} />
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
      )}
    </div>
  )
}
