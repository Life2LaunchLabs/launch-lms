'use client'

import { use, useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import {
  addResourceToChannel,
  createResource,
  deleteResource,
  getChannelResources,
  getResourceChannels,
  getResourceComments,
  getResources,
  removeResourceFromChannel,
  Resource,
  ResourceChannel,
  updateResourceChannel,
  uploadResourceChannelThumbnail,
} from '@services/resources/resources'
import { getResourceChannelThumbnailMediaDirectory } from '@services/media/media'
import { getUserGroups, linkResourcesToUserGroup, unLinkResourcesToUserGroup } from '@services/usergroups/usergroups'
import { toast } from 'react-hot-toast'

const TABS = ['general', 'thumbnail', 'access', 'resources', 'moderation'] as const

export default function ResourceChannelSettingsPage(props: { params: Promise<{ orgslug: string; channeluuid: string; subpage: string }> }) {
  const params = use(props.params)
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const orgId = org?.id

  const { data: channelsData, mutate: mutateChannels } = useSWR(
    orgId ? ['resource-channel-settings', orgId, accessToken] : null,
    () => getResourceChannels(orgId, accessToken, true)
  )
  const channel = (channelsData?.channels || []).find((item: ResourceChannel) => item.channel_uuid === params.channeluuid)

  const { data: channelResources = [], mutate: mutateChannelResources } = useSWR(
    channel ? ['resource-channel-resources', channel.channel_uuid, accessToken] : null,
    () => getChannelResources(channel.channel_uuid, accessToken, true)
  )
  const { data: allResources = [], mutate: mutateAllResources } = useSWR(
    orgId ? ['all-org-resources', orgId, accessToken] : null,
    () => getResources(orgId, { include_private: true }, accessToken)
  )
  const { data: usergroupsData } = useSWR(
    orgId && accessToken ? ['resource-channel-usergroups', orgId, accessToken] : null,
    () => getUserGroups(orgId, accessToken)
  )

  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [descriptionDraft, setDescriptionDraft] = useState<string | null>(null)
  const [publicDraft, setPublicDraft] = useState<boolean | null>(null)
  const [newResourceTitle, setNewResourceTitle] = useState('')
  const [newResourceUrl, setNewResourceUrl] = useState('')
  const [newResourceType, setNewResourceType] = useState('other')

  const availableResources = useMemo(
    () => allResources.filter((resource: Resource) => !channelResources.some((linked) => linked.resource_uuid === resource.resource_uuid)),
    [allResources, channelResources]
  )

  if (!channel) return <div className="p-6">Loading channel…</div>

  const saveGeneral = async () => {
    if (!accessToken) return
    try {
      await updateResourceChannel(channel.channel_uuid, {
        name: nameDraft ?? channel.name,
        description: descriptionDraft ?? channel.description,
        public: publicDraft ?? channel.public,
      }, accessToken)
      mutateChannels()
      toast.success('Channel updated')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update channel')
    }
  }

  const uploadThumb = async (file?: File) => {
    if (!file || !accessToken) return
    const formData = new FormData()
    formData.append('thumbnail', file)
    try {
      await uploadResourceChannelThumbnail(channel.channel_uuid, formData, accessToken)
      mutateChannels()
      toast.success('Thumbnail updated')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to upload thumbnail')
    }
  }

  const createAndAddResource = async () => {
    if (!accessToken || !orgId || !newResourceTitle.trim() || !newResourceUrl.trim()) return
    try {
      const created = await createResource(orgId, {
        title: newResourceTitle.trim(),
        description: null,
        resource_type: newResourceType,
        external_url: newResourceUrl.trim(),
      }, accessToken)
      if (created.success) {
        await addResourceToChannel(channel.channel_uuid, created.data.resource_uuid, accessToken)
        setNewResourceTitle('')
        setNewResourceUrl('')
        setNewResourceType('other')
        mutateChannelResources()
        mutateAllResources()
        toast.success('Resource created and added')
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create resource')
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#f8f8f8] px-4 py-6 sm:px-10">
      <div className="rounded-3xl bg-white nice-shadow">
        <div className="border-b border-gray-100 p-6">
          <div className="text-sm text-gray-400">Resources / {channel.name}</div>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">{channel.name}</h1>
          <div className="mt-4 flex gap-5 text-sm">
            {TABS.map((tab) => (
              <Link
                key={tab}
                href={`/dash/resources/${channel.channel_uuid}/${tab}`}
                className={`pb-2 capitalize ${params.subpage === tab ? 'border-b-2 border-black text-black' : 'text-gray-400'}`}
              >
                {tab}
              </Link>
            ))}
          </div>
        </div>

        <div className="p-6">
          {params.subpage === 'general' && (
            <div className="grid gap-4 lg:max-w-2xl">
              <input value={nameDraft ?? channel.name ?? ''} onChange={(e) => setNameDraft(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-3" placeholder="Channel name" />
              <textarea value={descriptionDraft ?? channel.description ?? ''} onChange={(e) => setDescriptionDraft(e.target.value)} rows={4} className="rounded-xl border border-gray-200 px-3 py-3" placeholder="Description" />
              <label className="flex items-center gap-3 text-sm">
                <input type="checkbox" checked={publicDraft ?? channel.public ?? true} onChange={(e) => setPublicDraft(e.target.checked)} />
                Public channel
              </label>
              <button className="w-fit rounded-xl bg-black px-4 py-3 text-sm font-medium text-white" onClick={saveGeneral}>Save channel</button>
            </div>
          )}

          {params.subpage === 'thumbnail' && (
            <div className="space-y-4 lg:max-w-xl">
              <div className="aspect-[4/2.3] overflow-hidden rounded-2xl bg-gray-100">
                {channel.thumbnail_image && org?.org_uuid ? (
                  <img src={getResourceChannelThumbnailMediaDirectory(org.org_uuid, channel.channel_uuid, channel.thumbnail_image)} alt={channel.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-400">No thumbnail yet</div>
                )}
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm">
                Upload thumbnail
                <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadThumb(e.target.files?.[0])} />
              </label>
            </div>
          )}

          {params.subpage === 'access' && (
            <div className="space-y-5 lg:max-w-3xl">
              <div className="rounded-2xl bg-gray-50 p-4">
                <div className="font-medium text-gray-900">Usergroup access</div>
                <p className="mt-1 text-sm text-gray-500">Link this channel to one or more usergroups. Users will need one of those memberships when the channel is not public.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {(usergroupsData?.data || []).map((usergroup: any) => {
                  const linked = (channel.usergroup_ids || []).includes(usergroup.id)
                  return (
                    <div key={usergroup.id} className="flex items-center justify-between rounded-2xl border border-gray-200 p-4">
                      <div>
                        <div className="font-medium text-gray-900">{usergroup.name}</div>
                        <div className="text-sm text-gray-500">{linked ? 'Linked' : 'Not linked'}</div>
                      </div>
                      <button
                        className={`rounded-lg px-3 py-2 text-sm ${linked ? 'border border-red-200 text-red-600' : 'border border-gray-200 text-gray-700'}`}
                        onClick={async () => {
                          if (!accessToken) return
                          if (linked) await unLinkResourcesToUserGroup(usergroup.id, channel.channel_uuid, orgId, accessToken)
                          else await linkResourcesToUserGroup(usergroup.id, channel.channel_uuid, orgId, accessToken)
                          mutateChannels()
                        }}
                      >
                        {linked ? 'Unlink' : 'Link'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {params.subpage === 'resources' && (
            <div className="space-y-6">
              <div className="grid gap-3 rounded-2xl bg-gray-50 p-4 lg:grid-cols-[1fr,1fr,180px,auto]">
                <input value={newResourceTitle} onChange={(e) => setNewResourceTitle(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" placeholder="Resource title" />
                <input value={newResourceUrl} onChange={(e) => setNewResourceUrl(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" placeholder="External URL" />
                <select value={newResourceType} onChange={(e) => setNewResourceType(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                  <option value="other">Other</option>
                  <option value="assessment">Assessment</option>
                  <option value="video">Video</option>
                  <option value="article">Article</option>
                  <option value="tool">Tool</option>
                  <option value="guide">Guide</option>
                  <option value="course">Course</option>
                </select>
                <button className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white" onClick={createAndAddResource}>Create resource</button>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-gray-900">Resources in this channel</h2>
                <div className="mt-3 space-y-3">
                  {channelResources.map((resource) => (
                    <div key={resource.resource_uuid} className="flex flex-col gap-3 rounded-2xl border border-gray-200 p-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="font-medium text-gray-900">{resource.title}</div>
                        <div className="text-sm text-gray-500">{resource.resource_type} · {resource.provider_name || 'Provider pending'}</div>
                      </div>
                      <div className="flex gap-2">
                        <button className="rounded-lg border border-gray-200 px-3 py-2 text-sm" onClick={() => removeResourceFromChannel(channel.channel_uuid, resource.resource_uuid, accessToken).then(() => mutateChannelResources())}>Remove</button>
                        <button className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600" onClick={() => deleteResource(resource.resource_uuid, accessToken).then(() => {
                          mutateChannelResources()
                          mutateAllResources()
                        })}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-gray-900">Available resources</h2>
                <div className="mt-3 space-y-3">
                  {availableResources.map((resource) => (
                    <div key={resource.resource_uuid} className="flex items-center justify-between rounded-2xl border border-gray-200 p-4">
                      <div>
                        <div className="font-medium text-gray-900">{resource.title}</div>
                        <div className="text-sm text-gray-500">{resource.resource_type}</div>
                      </div>
                      <button className="rounded-lg border border-gray-200 px-3 py-2 text-sm" onClick={() => addResourceToChannel(channel.channel_uuid, resource.resource_uuid, accessToken).then(() => mutateChannelResources())}>Add to channel</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {params.subpage === 'moderation' && (
            <div className="space-y-5">
              <p className="text-sm text-gray-500">Moderate comments across resources in this channel.</p>
              {channelResources.map((resource) => (
                <ChannelModerationSection key={resource.resource_uuid} resource={resource} accessToken={accessToken} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ChannelModerationSection({ resource, accessToken }: { resource: Resource; accessToken: string }) {
  const { data: comments = [] } = useSWR(
    ['resource-moderation-comments', resource.resource_uuid, accessToken],
    () => getResourceComments(resource.resource_uuid, accessToken)
  )
  return (
    <div className="rounded-2xl border border-gray-200 p-4">
      <div className="font-medium text-gray-900">{resource.title}</div>
      <div className="mt-3 space-y-3">
        {comments.map((comment) => (
          <div key={comment.comment_uuid} className="rounded-xl bg-gray-50 p-3">
            <div className="text-sm text-gray-700">{comment.content}</div>
            <div className="mt-2 text-xs text-gray-400">{comment.author?.username || 'Unknown'} · {new Date(comment.creation_date).toLocaleString()}</div>
          </div>
        ))}
        {comments.length === 0 && <div className="text-sm text-gray-400">No comments yet.</div>}
      </div>
    </div>
  )
}
