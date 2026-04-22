'use client'

import { Dispatch, ReactNode, SetStateAction, use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { motion } from 'motion/react'
import {
  BookCopy,
  Pencil,
  FolderOpen,
  Image as ImageIcon,
  LibraryBig,
  Loader2,
  LucideIcon,
  Plus,
  Shield,
  TextIcon,
  Trash2,
  Upload,
  Users,
} from 'lucide-react'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import ConfirmationModal from '@components/Objects/StyledElements/ConfirmationModal/ConfirmationModal'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import ChipMultiSelect from '@components/Resources/ChipMultiSelect'
import { getUriWithOrg, routePaths } from '@services/config/config'
import {
  addResourceToChannel,
  createResource,
  deleteResource,
  getChannelResources,
  getResourceChannels,
  getResourceComments,
  getResourceTags,
  getResourceUrlPreview,
  Resource,
  ResourceChannel,
  ResourceComment,
  ResourceTag,
  ResourceType,
  importResourcesCsv,
  updateResource,
  updateResourceChannel,
  uploadResourceChannelThumbnail,
} from '@services/resources/resources'
import {
  getResourceChannelThumbnailMediaDirectory,
  getResourceThumbnailMediaDirectory,
} from '@services/media/media'
import {
  getUserGroups,
  linkResourcesToUserGroup,
  unLinkResourcesToUserGroup,
} from '@services/usergroups/usergroups'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Switch } from '@components/ui/switch'
import { Textarea } from '@components/ui/textarea'
import { toast } from 'react-hot-toast'

export type ResourceChannelParams = {
  subpage: string
  orgslug: string
  channeluuid: string
}

interface TabItem {
  id: string
  label: string
  icon: LucideIcon
}

const SETTING_TABS: TabItem[] = [
  { id: 'general', label: 'General', icon: TextIcon },
  { id: 'thumbnail', label: 'Cover Photo', icon: ImageIcon },
  { id: 'access', label: 'Access', icon: Users },
  { id: 'resources', label: 'Resources', icon: BookCopy },
  { id: 'moderation', label: 'Moderation', icon: Shield },
]

const SUBPAGE_TITLES: Record<string, { h1: string; h2: string }> = {
  general: {
    h1: 'General Settings',
    h2: 'Update the channel name, description, and visibility.',
  },
  thumbnail: {
    h1: 'Cover Photo',
    h2: 'Upload a cover image so this channel matches the rest of the dashboard.',
  },
  access: {
    h1: 'Access Control',
    h2: 'Control guest visibility, org-only access, and whether the channel is shared across org sites.',
  },
  resources: {
    h1: 'Resources',
    h2: 'Add, remove, and curate the resources included in this channel.',
  },
  moderation: {
    h1: 'Moderation',
    h2: 'Review comments across the resources assigned to this channel.',
  },
}

const RESOURCE_TYPE_OPTIONS: ResourceType[] = [
  'other',
  'assessment',
  'video',
  'article',
  'tool',
  'guide',
  'course',
]

function TabLink({
  tab,
  isActive,
  orgslug,
  channeluuid,
}: {
  tab: TabItem
  isActive: boolean
  orgslug: string
  channeluuid: string
}) {
  return (
    <Link href={getUriWithOrg(orgslug, routePaths.org.dash.resourceChannelSettings(channeluuid, tab.id))}>
      <div
        className={`w-fit cursor-pointer border-black py-2 text-center transition-all ease-linear ${
          isActive ? 'border-b-4' : 'opacity-50'
        }`}
      >
        <div className="mx-2.5 flex items-center space-x-2.5">
          <tab.icon size={16} />
          <div className="flex items-center">{tab.label}</div>
        </div>
      </div>
    </Link>
  )
}

function ResourceChannelGeneralTab({
  channel,
  accessToken,
  onUpdated,
}: {
  channel: ResourceChannel
  accessToken?: string
  onUpdated: () => void
}) {
  const [name, setName] = useState(channel.name)
  const [description, setDescription] = useState(channel.description || '')
  const [isPublic, setIsPublic] = useState(channel.public)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!accessToken || isSubmitting) return

    setIsSubmitting(true)
    try {
      const result = await updateResourceChannel(
        channel.channel_uuid,
        {
          name: name.trim(),
          description: description.trim() || null,
          public: isPublic,
        },
        accessToken
      )

      if (result.success) {
        toast.success('Channel updated')
        onUpdated()
        return
      }

      toast.error('Failed to update channel')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update channel')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl nice-shadow sm:mx-10 mx-0">
        <div className="flex flex-col gap-0">
          <div className="mx-3 my-3 flex flex-col rounded-md bg-gray-50 px-5 py-3">
            <h1 className="text-xl font-bold text-gray-800">General Settings</h1>
            <h2 className="text-md text-gray-500">
              Update the name, description, and visibility of this channel.
            </h2>
          </div>

          <div className="mx-5 my-5 flex flex-col gap-6">
            <div className="space-y-2">
              <Label htmlFor="resource-channel-name">Name</Label>
              <Input
                id="resource-channel-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                placeholder="Resource channel name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="resource-channel-description">Description</Label>
              <Textarea
                id="resource-channel-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                className="min-h-[120px]"
                placeholder="Describe what belongs in this channel…"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg bg-gray-50/50 p-4 nice-shadow">
              <div className="space-y-0.5">
                <Label className="text-base">Public</Label>
                <p className="text-sm text-gray-500">
                  Public channels are visible to all users. Restricted channels only appear
                  for linked user groups.
                </p>
              </div>
              <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            </div>
          </div>

          <div className="mx-5 mb-5 flex flex-row-reverse">
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !name.trim()}
              className="bg-black text-white hover:bg-black/90"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ResourceChannelThumbnailTab({
  channel,
  orgUUID,
  accessToken,
  onUpdated,
}: {
  channel: ResourceChannel
  orgUUID?: string
  accessToken?: string
  onUpdated: () => void
}) {
  const thumbnailSrc =
    channel.thumbnail_image && orgUUID
      ? getResourceChannelThumbnailMediaDirectory(
          orgUUID,
          channel.channel_uuid,
          channel.thumbnail_image
        )
      : null

  const handleUpload = async (file?: File) => {
    if (!file || !accessToken) return

    const formData = new FormData()
    formData.append('thumbnail', file)

    try {
      const result = await uploadResourceChannelThumbnail(
        channel.channel_uuid,
        formData,
        accessToken
      )
      if (result.success) {
        toast.success('Thumbnail updated')
        onUpdated()
        return
      }
      toast.error('Failed to upload thumbnail')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to upload thumbnail')
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl nice-shadow sm:mx-10 mx-0">
        <div className="mx-3 my-3 flex flex-col rounded-md bg-gray-50 px-5 py-3">
          <h1 className="text-xl font-bold text-gray-800">Cover Photo</h1>
          <h2 className="text-md text-gray-500">
            Upload a cover image that appears on the channel card and detail page.
          </h2>
        </div>

        <div className="mx-5 my-5 space-y-5">
          <div className="aspect-[4/2.3] overflow-hidden rounded-2xl bg-gray-100">
            {thumbnailSrc ? (
              <img
                src={thumbnailSrc}
                alt={channel.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-400">
                <div className="flex flex-col items-center gap-2">
                  <ImageIcon size={36} />
                  <span className="text-sm">No thumbnail uploaded yet</span>
                </div>
              </div>
            )}
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
            <ImageIcon size={16} />
            Upload Cover Photo
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleUpload(e.target.files?.[0])}
            />
          </label>
        </div>
      </div>
    </div>
  )
}

function ResourceChannelAccessTab({
  channel,
  orgId,
  accessToken,
  usergroups,
  onUpdated,
}: {
  channel: ResourceChannel
  orgId?: number
  accessToken?: string
  usergroups: any[]
  onUpdated: () => void
}) {
  const [isSaving, setIsSaving] = useState(false)

  const handleSetPublic = async (value: boolean) => {
    if (!accessToken || isSaving) return

    setIsSaving(true)
    try {
      const result = await updateResourceChannel(
        channel.channel_uuid,
        { public: value },
        accessToken
      )
      if (result.success) {
        toast.success('Access updated')
        onUpdated()
        return
      }
      toast.error('Failed to update access')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update access')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSetShared = async (value: boolean) => {
    if (!accessToken || isSaving) return

    setIsSaving(true)
    try {
      const result = await updateResourceChannel(
        channel.channel_uuid,
        { shared: value },
        accessToken
      )
      if (result.success) {
        toast.success('Sharing updated')
        onUpdated()
        return
      }
      toast.error('Failed to update sharing')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update sharing')
    } finally {
      setIsSaving(false)
    }
  }

  const toggleUsergroup = async (usergroupId: number, linked: boolean) => {
    if (!accessToken || !orgId) return

    try {
      if (linked) {
        await unLinkResourcesToUserGroup(usergroupId, channel.channel_uuid, orgId, accessToken)
        toast.success('User group unlinked')
      } else {
        await linkResourcesToUserGroup(usergroupId, channel.channel_uuid, orgId, accessToken)
        toast.success('User group linked')
      }
      onUpdated()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update user group access')
    }
  }

  return (
    <div>
      <div className="h-6" />
      <div className="mx-4 rounded-xl bg-white px-4 py-4 shadow-xs sm:mx-10">
        <div className="mb-3 flex flex-col rounded-md bg-gray-50 px-3 py-3 sm:px-5">
          <h1 className="text-lg font-bold text-gray-800 sm:text-xl">Access Control</h1>
          <h2 className="text-xs text-gray-500 sm:text-sm">
            Control who can view this channel.
          </h2>
        </div>

        <div
          className={`mx-auto mb-3 flex flex-col space-y-2 sm:flex-row sm:space-x-2 sm:space-y-0 ${
            isSaving ? 'pointer-events-none opacity-50' : ''
          }`}
        >
          <ConfirmationModal
            confirmationButtonText="Make Public"
            confirmationMessage="This will make the channel visible to everyone who can access your organization."
            dialogTitle="Make Channel Public?"
            dialogTrigger={
              <div className="h-[200px] w-full cursor-pointer rounded-lg bg-slate-100 transition-all hover:bg-slate-200">
                {channel.public && (
                  <div className="absolute mx-3 my-3 w-fit rounded-lg bg-green-200 px-3 py-1 text-sm font-bold text-green-600">
                    Active
                  </div>
                )}
                <div className="flex h-full flex-col items-center justify-center space-y-1 p-4">
                  <FolderOpen className="text-slate-400" size={32} />
                  <div className="text-2xl font-bold text-slate-700">Public</div>
                  <div className="text-center text-sm leading-5 text-gray-400">
                    Anyone in the organization can discover and view this channel.
                  </div>
                </div>
              </div>
            }
            functionToExecute={() => handleSetPublic(true)}
            status="info"
          />

          <ConfirmationModal
            confirmationButtonText="Make Restricted"
            confirmationMessage="Only users in linked user groups will be able to access this channel."
            dialogTitle="Make Channel Restricted?"
            dialogTrigger={
              <div className="h-[200px] w-full cursor-pointer rounded-lg bg-slate-100 transition-all hover:bg-slate-200">
                {!channel.public && (
                  <div className="absolute mx-3 my-3 w-fit rounded-lg bg-green-200 px-3 py-1 text-sm font-bold text-green-600">
                    Active
                  </div>
                )}
                <div className="flex h-full flex-col items-center justify-center space-y-1 p-4">
                  <Users className="text-slate-400" size={32} />
                  <div className="text-2xl font-bold text-slate-700">Restricted</div>
                  <div className="text-center text-sm leading-5 text-gray-400">
                    Only users in linked user groups can access this channel.
                  </div>
                </div>
              </div>
            }
            functionToExecute={() => handleSetPublic(false)}
            status="info"
          />
        </div>

        {!channel.public && (
          <>
            <div className="mb-3 flex flex-col rounded-md bg-gray-50 px-3 py-3 sm:px-5">
              <h1 className="text-lg font-bold text-gray-800 sm:text-xl">User Groups</h1>
              <h2 className="text-xs text-gray-500 sm:text-sm">
                Link user groups to grant them access to this channel.
              </h2>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {usergroups.map((usergroup: any) => {
                const linked = (channel.usergroup_ids || []).includes(usergroup.id)
                return (
                  <div
                    key={usergroup.id}
                    className="flex items-center justify-between rounded-xl border border-gray-200 p-4"
                  >
                    <div>
                      <div className="font-medium text-gray-900">{usergroup.name}</div>
                      <div className="text-sm text-gray-500">
                        {linked ? 'Linked to this channel' : 'Not linked'}
                      </div>
                    </div>

                    <Button
                      variant={linked ? 'outline' : 'default'}
                      className={
                        linked
                          ? 'border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700'
                          : 'bg-black text-white hover:bg-black/90'
                      }
                      onClick={() => toggleUsergroup(usergroup.id, linked)}
                    >
                      {linked ? 'Unlink' : 'Link'}
                    </Button>
                  </div>
                )
              })}

              {usergroups.length === 0 && (
                <div className="col-span-full rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
                  No user groups are available yet.
                </div>
              )}
            </div>
          </>
        )}

        <div className={`mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 ${isSaving ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-800">Shared across organizations</h3>
              <p className="mt-1 text-sm text-slate-500">
                Let signed-in users from other org sites discover resources from this channel, save them, and comment while ownership stays with this org.
              </p>
            </div>
            <label className="inline-flex items-center gap-3">
              <input
                type="checkbox"
                checked={channel.shared}
                onChange={(e) => handleSetShared(e.target.checked)}
              />
              <span className="text-sm font-medium text-slate-700">
                {channel.shared ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}

function ResourceListItem({
  resource,
  orgUUID,
  action,
}: {
  resource: Resource
  orgUUID?: string
  action?: ReactNode
}) {
  const thumbnailSrc =
    resource.thumbnail_image && orgUUID
      ? getResourceThumbnailMediaDirectory(orgUUID, resource.resource_uuid, resource.thumbnail_image)
      : resource.cover_image_url || null

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
      <div className="flex items-center gap-3">
        <div className="h-12 w-16 shrink-0 overflow-hidden rounded-md bg-gray-200">
          {thumbnailSrc ? (
            <img src={thumbnailSrc} alt={resource.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-400">
              <LibraryBig size={18} />
            </div>
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">{resource.title}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {resource.resource_type}
            {resource.provider_name ? ` • ${resource.provider_name}` : ''}
          </p>
          {resource.description && (
            <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{resource.description}</p>
          )}
        </div>
      </div>
      {action}
    </div>
  )
}

function AddResourceModal({
  isOpen,
  onOpenChange,
  orgslug,
  channelUuid,
  orgId,
  resourceTags,
  accessToken,
  onCreated,
  existingResource,
}: {
  isOpen: boolean
  onOpenChange: Dispatch<SetStateAction<boolean>>
  orgslug: string
  channelUuid: string
  orgId?: number
  resourceTags: ResourceTag[]
  accessToken?: string
  onCreated: () => void
  existingResource?: Resource | null
}) {
  const [resourceUrl, setResourceUrl] = useState('')
  const [resourceType, setResourceType] = useState<ResourceType | ''>('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [coverImageUrl, setCoverImageUrl] = useState('')
  const [selectedTagUuids, setSelectedTagUuids] = useState<string[]>([])
  const [isExpanded, setIsExpanded] = useState(false)
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [helperMessage, setHelperMessage] = useState<string | null>(null)
  const [helperTone, setHelperTone] = useState<'muted' | 'error'>('muted')
  const isEditing = !!existingResource

  useEffect(() => {
    if (!isOpen) return
    if (existingResource) {
      setResourceUrl(existingResource.external_url || '')
      setResourceType(existingResource.resource_type || '')
      setTitle(existingResource.title || '')
      setDescription(existingResource.description || '')
      setCoverImageUrl(existingResource.cover_image_url || '')
      setSelectedTagUuids(existingResource.tags.map((tag) => tag.tag_uuid))
      setIsExpanded(true)
      setHelperMessage(null)
      setHelperTone('muted')
      setIsDiscovering(false)
      setIsSubmitting(false)
      return
    }
    resetModal()
  }, [isOpen, existingResource])

  const resetModal = () => {
    setResourceUrl('')
    setResourceType('')
    setTitle('')
    setDescription('')
    setCoverImageUrl('')
    setSelectedTagUuids([])
    setIsExpanded(false)
    setIsDiscovering(false)
    setIsSubmitting(false)
    setHelperMessage(null)
    setHelperTone('muted')
  }

  const handleOpenChange = (open: boolean) => {
    onOpenChange(open)
    if (!open) resetModal()
  }

  const handleDiscover = async () => {
    if (!resourceUrl.trim() || !resourceType || isDiscovering) return

    setIsExpanded(true)
    setIsDiscovering(true)
    setHelperTone('muted')
    setHelperMessage('Trying to pull the title, description, and image from that page…')

    try {
      const preview = await Promise.race([
        getResourceUrlPreview(resourceUrl.trim(), accessToken),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 8000)
        ),
      ])

      let foundAnyMetadata = false

      if (preview.title?.trim()) {
        foundAnyMetadata = true
        setTitle((current) => current || preview.title?.trim() || '')
      }
      if (preview.description?.trim()) {
        foundAnyMetadata = true
        setDescription((current) => current || preview.description?.trim() || '')
      }
      if (preview.og_image?.trim()) {
        foundAnyMetadata = true
        setCoverImageUrl((current) => current || preview.og_image?.trim() || '')
      }

      if (foundAnyMetadata) {
        setHelperTone('muted')
        setHelperMessage('Autofill complete. Review the details below before adding.')
      } else {
        setHelperTone('error')
        setHelperMessage(
          'We could not find much metadata for this page. You can still fill in the details manually.'
        )
      }
    } catch (error: any) {
      setHelperTone('error')
      setHelperMessage(
        error?.message === 'timeout'
          ? 'We timed out while trying to read that page. You can still fill in the details manually.'
          : 'We could not access metadata for that page. You can still fill in the details manually.'
      )
    } finally {
      setIsDiscovering(false)
    }
  }

  const handleSubmit = async () => {
    if (
      !accessToken ||
      !orgId ||
      !resourceUrl.trim() ||
      !resourceType ||
      !title.trim() ||
      isSubmitting ||
      isDiscovering
    ) {
      return
    }

    setIsSubmitting(true)
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        resource_type: resourceType as ResourceType,
        external_url: resourceUrl.trim(),
        cover_image_url: coverImageUrl.trim() || null,
        tag_uuids: selectedTagUuids,
      }

      if (isEditing && existingResource) {
        const updated = await updateResource(existingResource.resource_uuid, payload, accessToken)
        if (!updated.success) {
          toast.error(updated.data?.detail || 'Failed to update resource')
          return
        }
        toast.success('Resource updated')
      } else {
        const created = await createResource(orgId, payload, accessToken)

        if (!created.success) {
          toast.error('Failed to create resource')
          return
        }

        const linked = await addResourceToChannel(
          channelUuid,
          created.data.resource_uuid,
          accessToken,
          0
        )

        if (!linked.success) {
          toast.error(linked.data?.detail || 'Resource was created, but could not be added to this channel')
          return
        }

        toast.success('Resource created and added')
      }
      onCreated()
      handleOpenChange(false)
    } catch (error: any) {
      toast.error(error?.message || `Failed to ${isEditing ? 'update' : 'create'} resource`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const canContinue = resourceUrl.trim().length > 0 && !!resourceType
  const canAdd =
    !!resourceUrl.trim() &&
    !!resourceType &&
    !!title.trim() &&
    !isDiscovering &&
    !isSubmitting

  const resourceTagOptions = useMemo(
    () =>
      resourceTags.map((tag) => ({
        value: tag.tag_uuid,
        label: tag.name,
      })),
    [resourceTags]
  )

  return (
    <Modal
      isDialogOpen={isOpen}
      onOpenChange={handleOpenChange}
      minWidth="sm"
      minHeight="no-min"
      dialogTitle={isEditing ? 'Edit Resource' : 'Add Resource'}
      dialogDescription={
        isEditing
          ? 'Update this resource using the same details view used after link discovery.'
          : 'Paste a link first, then review the autofilled details before adding it to this channel.'
      }
      dialogContent={
        <div className="space-y-5">
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="new-resource-url">Link</Label>
              <Input
                id="new-resource-url"
                value={resourceUrl}
                onChange={(e) => setResourceUrl(e.target.value)}
                placeholder="https://example.com/article"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-resource-type">Resource Type</Label>
              <select
                id="new-resource-type"
                value={resourceType}
                onChange={(e) => setResourceType(e.target.value as ResourceType | '')}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              >
                <option value="">Select a type</option>
                {RESOURCE_TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isExpanded && (
            <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="space-y-2">
                <Label htmlFor="new-resource-title">Title</Label>
                <Input
                  id="new-resource-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={isDiscovering ? 'Loading title…' : 'Resource title'}
                  disabled={isDiscovering}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-resource-description">Description</Label>
                <Textarea
                  id="new-resource-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={isDiscovering ? 'Loading description…' : 'Short description'}
                  className="min-h-[110px]"
                  disabled={isDiscovering}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-resource-image">Cover Image URL</Label>
                <Input
                  id="new-resource-image"
                  value={coverImageUrl}
                  onChange={(e) => setCoverImageUrl(e.target.value)}
                  placeholder={isDiscovering ? 'Loading image…' : 'https://example.com/image.jpg'}
                  disabled={isDiscovering}
                />
              </div>

              <div className="space-y-2">
                <Label>Tags</Label>
                <ChipMultiSelect
                  options={resourceTagOptions}
                  selectedValues={selectedTagUuids}
                  onChange={setSelectedTagUuids}
                  placeholder="Select tags"
                  searchPlaceholder="Filter tags"
                  emptyMessage="No tags yet."
                  disabled={isDiscovering || isSubmitting}
                />
                <Link
                  href={getUriWithOrg(orgslug, routePaths.org.dash.resourceTags())}
                  className="text-xs font-medium text-gray-500 underline-offset-4 hover:text-gray-800 hover:underline"
                >
                  Manage tags in the resources tags tab
                </Link>
              </div>

              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <div className="aspect-[4/2.1] bg-gray-100">
                  {isDiscovering ? (
                    <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-gray-500">
                      <Loader2 size={16} className="animate-spin" />
                      Loading preview…
                    </div>
                  ) : coverImageUrl ? (
                    <img
                      src={coverImageUrl}
                      alt={title || 'Resource preview'}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">
                      No image found yet
                    </div>
                  )}
                </div>
              </div>

              {helperMessage && (
                <p
                  className={`text-sm ${
                    helperTone === 'error' ? 'text-amber-700' : 'text-gray-500'
                  }`}
                >
                  {helperMessage}
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            {!isExpanded && !isEditing ? (
              <Button
                onClick={handleDiscover}
                disabled={!canContinue}
                className="bg-black text-white hover:bg-black/90"
              >
                Next
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={!canAdd}
                className="bg-black text-white hover:bg-black/90"
              >
                {isSubmitting ? (isEditing ? 'Saving…' : 'Adding…') : isEditing ? 'Save' : 'Add'}
              </Button>
            )}
          </div>
        </div>
      }
    />
  )
}

function ResourceChannelResourcesTab({
  orgslug,
  channel,
  channelResources,
  orgId,
  orgUUID,
  resourceTags,
  accessToken,
  onUpdated,
}: {
  orgslug: string
  channel: ResourceChannel
  channelResources: Resource[]
  orgId?: number
  orgUUID?: string
  resourceTags: ResourceTag[]
  accessToken?: string
  onUpdated: () => void
}) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingResource, setEditingResource] = useState<Resource | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  const handleDelete = async (resourceUuid: string) => {
    if (!accessToken) return
    try {
      await deleteResource(resourceUuid, accessToken)
      toast.success('Resource deleted')
      onUpdated()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete resource')
    }
  }

  const handleImport = async (file?: File) => {
    if (!file || !accessToken || !orgId || isImporting) return
    const formData = new FormData()
    formData.append('file', file)

    setIsImporting(true)
    try {
      const result = await importResourcesCsv(orgId, formData, accessToken, channel.channel_uuid)
      if (!result.success) {
        toast.error(result.data?.detail || 'CSV import failed')
        return
      }
      toast.success(`Imported resources (${result.data.created} created, ${result.data.updated} updated)`)
      onUpdated()
    } catch (error: any) {
      toast.error(error?.message || 'CSV import failed')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="space-y-6 sm:mx-10 mx-0">
      <div className="rounded-xl bg-white nice-shadow">
        <div className="mx-3 my-3 flex items-start justify-between gap-3 rounded-md bg-gray-50 px-5 py-3">
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-gray-800">Resources in Channel</h1>
            <h2 className="text-md text-gray-500">
              {channelResources.length} {channelResources.length === 1 ? 'resource' : 'resources'} currently in
              this channel.
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
              <Upload size={14} />
              {isImporting ? 'Importing…' : 'Import CSV'}
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                disabled={isImporting}
                onChange={(e) => {
                  handleImport(e.target.files?.[0])
                  e.currentTarget.value = ''
                }}
              />
            </label>
            <Button
              onClick={() => {
                setEditingResource(null)
                setIsCreateModalOpen(true)
              }}
              className="bg-black text-white hover:bg-black/90"
            >
              <Plus size={14} />
              Add
            </Button>
          </div>
        </div>

        <div className="mx-5 my-5">
          {channelResources.length === 0 ? (
            <div className="py-8 text-center text-gray-400">
              <LibraryBig size={32} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No resources in this channel yet. Use the add button to create one.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {channelResources.map((resource) => (
                <ResourceListItem
                  key={resource.resource_uuid}
                  resource={resource}
                  orgUUID={orgUUID}
                  action={
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingResource(resource)
                          setIsCreateModalOpen(true)
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900"
                        aria-label={`Edit ${resource.title}`}
                      >
                        <Pencil size={14} />
                      </button>
                      <ConfirmationModal
                        confirmationButtonText="Delete Resource"
                        confirmationMessage={`Delete "${resource.title}" entirely? This removes it from the organization, not just this channel.`}
                        dialogTitle="Delete Resource?"
                        dialogTrigger={
                          <button
                            type="button"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 transition-colors hover:border-red-300 hover:text-red-700"
                            aria-label={`Delete ${resource.title}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        }
                        functionToExecute={() => handleDelete(resource.resource_uuid)}
                        status="warning"
                      />
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </div>

        <AddResourceModal
          isOpen={isCreateModalOpen}
          onOpenChange={setIsCreateModalOpen}
          orgslug={orgslug}
          channelUuid={channel.channel_uuid}
          orgId={orgId}
          resourceTags={resourceTags}
          accessToken={accessToken}
          onCreated={onUpdated}
          existingResource={editingResource}
        />
      </div>
    </div>
  )
}

function ChannelModerationSection({
  resource,
  accessToken,
}: {
  resource: Resource
  accessToken: string
}) {
  const { data: comments = [] } = useSWR<ResourceComment[]>(
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
            <div className="mt-2 text-xs text-gray-400">
              {comment.author?.username || 'Unknown'} •{' '}
              {new Date(comment.creation_date).toLocaleString()}
            </div>
          </div>
        ))}
        {comments.length === 0 && <div className="text-sm text-gray-400">No comments yet.</div>}
      </div>
    </div>
  )
}

function ResourceChannelModerationTab({
  channelResources,
  accessToken,
}: {
  channelResources: Resource[]
  accessToken?: string
}) {
  if (!accessToken) return null

  return (
    <div className="space-y-5 sm:mx-10 mx-0">
      <div className="rounded-xl bg-white nice-shadow">
        <div className="mx-3 my-3 flex flex-col rounded-md bg-gray-50 px-5 py-3">
          <h1 className="text-xl font-bold text-gray-800">Channel Moderation</h1>
          <h2 className="text-md text-gray-500">
            Review and moderate comments across resources in this channel.
          </h2>
        </div>

        <div className="mx-5 my-5 space-y-4">
          {channelResources.map((resource) => (
            <ChannelModerationSection
              key={resource.resource_uuid}
              resource={resource}
              accessToken={accessToken}
            />
          ))}

          {channelResources.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
              Add resources to this channel before moderating comments here.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ResourceChannelSettingsContent({ params }: { params: ResourceChannelParams }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const orgId = org?.id
  const orgUUID = org?.org_uuid

  const { data: channelsData, mutate: mutateChannels } = useSWR(
    orgId ? ['resource-channel-settings', orgId, accessToken] : null,
    () => getResourceChannels(orgId, accessToken, true)
  )
  const { data: resourceTags = [] } = useSWR(
    orgId ? ['resource-tags', orgId, accessToken || 'anon'] : null,
    () => getResourceTags(orgId, accessToken)
  )
  const channel = (channelsData?.channels || []).find(
    (item: ResourceChannel) => item.channel_uuid === params.channeluuid
  )

  const { data: channelResources = [], mutate: mutateChannelResources } = useSWR(
    channel ? ['resource-channel-resources', channel.channel_uuid, accessToken] : null,
    () =>
      channel
        ? getChannelResources(channel.channel_uuid, accessToken, true)
        : Promise.resolve([])
  )
  const { data: usergroupsData } = useSWR(
    orgId && accessToken ? ['resource-channel-usergroups', orgId, accessToken] : null,
    () => getUserGroups(orgId, accessToken)
  )

  const labels = SUBPAGE_TITLES[params.subpage] ?? { h1: '', h2: '' }

  const revalidateAll = () => {
    mutateChannels()
    mutateChannelResources()
  }

  if (!channel) {
    return (
      <div className="flex min-h-[320px] items-center justify-center text-gray-500">
        Loading channel…
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col bg-[#f8f8f8]">
      <div className="relative z-10 flex-shrink-0 bg-[#fcfbfc] pl-10 pr-10 tracking-tight nice-shadow">
        <div className="pb-4 pt-6">
          <Breadcrumbs
            items={[
              { label: 'Resources', href: '/dash/resources', icon: <FolderOpen size={14} /> },
              { label: channel.name },
            ]}
          />
        </div>
        <div className="my-2 py-2">
          <div className="flex w-100 flex-col space-y-1">
            <div className="flex pt-3 text-4xl font-bold tracking-tighter">{labels.h1}</div>
            <div className="flex text-md font-medium text-gray-400">{labels.h2}</div>
          </div>
        </div>
        <div className="flex space-x-0.5 text-sm font-black">
          {SETTING_TABS.map((tab) => (
            <TabLink
              key={tab.id}
              tab={tab}
              isActive={params.subpage === tab.id}
              orgslug={params.orgslug}
              channeluuid={params.channeluuid}
            />
          ))}
        </div>
      </div>
      <div className="h-6 flex-shrink-0" />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.1, type: 'spring', stiffness: 80 }}
        className="flex-1 overflow-y-auto"
      >
        {params.subpage === 'general' && (
          <ResourceChannelGeneralTab
            channel={channel}
            accessToken={accessToken}
            onUpdated={mutateChannels}
          />
        )}
        {params.subpage === 'thumbnail' && (
          <ResourceChannelThumbnailTab
            channel={channel}
            orgUUID={orgUUID}
            accessToken={accessToken}
            onUpdated={mutateChannels}
          />
        )}
        {params.subpage === 'access' && (
          <ResourceChannelAccessTab
            channel={channel}
            orgId={orgId}
            accessToken={accessToken}
            usergroups={usergroupsData?.data || []}
            onUpdated={mutateChannels}
          />
        )}
        {params.subpage === 'resources' && (
          <ResourceChannelResourcesTab
            orgslug={params.orgslug}
            channel={channel}
            channelResources={channelResources}
            orgId={orgId}
            orgUUID={orgUUID}
            resourceTags={resourceTags}
            accessToken={accessToken}
            onUpdated={revalidateAll}
          />
        )}
        {params.subpage === 'moderation' && (
          <ResourceChannelModerationTab
            channelResources={channelResources}
            accessToken={accessToken}
          />
        )}
      </motion.div>
    </div>
  )
}

export default function ResourceChannelSettingsPage(props: {
  params: Promise<ResourceChannelParams>
}) {
  const params = use(props.params)

  return <ResourceChannelSettingsContent params={params} />
}
