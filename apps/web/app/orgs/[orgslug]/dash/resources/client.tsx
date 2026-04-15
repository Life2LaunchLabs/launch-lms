'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { FolderOpen, Plus } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import FeatureDisabledView from '@components/Dashboard/Shared/FeatureDisabled/FeatureDisabledView'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import ResourceChannelCard from '@components/Resources/ResourceChannelCard'
import { getUriWithOrg } from '@services/config/config'
import {
  createResourceChannel,
  getResourceChannels,
} from '@services/resources/resources'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import { Switch } from '@components/ui/switch'
import { toast } from 'react-hot-toast'

function CreateResourceChannelForm({
  accessToken,
  orgId,
  onCreated,
  onClose,
}: {
  accessToken?: string
  orgId?: number
  onCreated: () => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim() || !accessToken || !orgId || isSubmitting) return

    setIsSubmitting(true)
    try {
      const result = await createResourceChannel(
        orgId,
        {
          name: name.trim(),
          description: description.trim() || null,
          public: isPublic,
          is_starred: false,
        },
        accessToken
      )

      if (result.success) {
        toast.success('Channel created')
        onCreated()
        onClose()
        return
      }

      toast.error('Failed to create channel')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create channel')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-gray-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">New Resource Channel</h3>
        <p className="text-sm text-gray-500">
          Create a channel to group related resources with its own cover image, access rules,
          and curated resource list.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="channel-name">Name</Label>
        <Input
          id="channel-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          placeholder="Leadership essentials"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="channel-description">Description</Label>
        <Textarea
          id="channel-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          placeholder="A curated set of articles, videos, and tools for new managers."
          className="min-h-[120px]"
        />
      </div>

      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-4">
        <div className="space-y-1">
          <Label className="text-base">Public channel</Label>
          <p className="text-sm text-gray-500">
            Public channels are visible to everyone with access to your organization.
          </p>
        </div>
        <Switch checked={isPublic} onCheckedChange={setIsPublic} />
      </div>

      <div className="flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={!name.trim() || !accessToken || !orgId || isSubmitting}
          className="bg-black text-white hover:bg-black/90"
        >
          <Plus size={16} />
          {isSubmitting ? 'Creating…' : 'Create Channel'}
        </Button>
      </div>
    </div>
  )
}

export default function ResourcesDashClient({ orgslug }: { orgslug: string }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  const { data, mutate } = useSWR(
    org?.id ? ['dash-resource-channels', org.id, accessToken] : null,
    () => getResourceChannels(org.id, accessToken, true)
  )

  const channels = data?.channels || []

  return (
    <FeatureDisabledView featureName="resources" orgslug={orgslug} context="dashboard">
      <div className="h-full w-full bg-[#f8f8f8] px-10">
        <div className="mb-6 pt-6">
          <Breadcrumbs
            items={[{ label: 'Resources', href: '/dash/resources', icon: <FolderOpen size={14} /> }]}
          />
          <div className="mt-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center space-x-4">
              <h1 className="text-3xl font-bold">Resources</h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => setIsCreateModalOpen(true)}
                className="rounded-lg bg-black px-5 py-2 text-xs font-bold text-white nice-shadow hover:scale-105"
              >
                <Plus className="h-4 w-4" />
                Add Channel
              </Button>
            </div>
          </div>
          <div className="mt-4 flex gap-1 border-b border-gray-200">
            <Link
              href={getUriWithOrg(orgslug, '/dash/resources')}
              className="border-b-2 border-black px-1 py-2 text-sm font-semibold text-gray-900"
            >
              Channels
            </Link>
            <Link
              href={getUriWithOrg(orgslug, '/dash/resources/tags')}
              className="border-b-2 border-transparent px-1 py-2 text-sm font-semibold text-gray-400 transition-colors hover:text-gray-700"
            >
              Tags
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {channels.map((channel) => (
            <ResourceChannelCard
              key={channel.channel_uuid}
              channel={channel}
              orgslug={orgslug}
              onDelete={async () => {
                await mutate()
              }}
            />
          ))}

          {channels.length === 0 && (
            <div className="col-span-full flex items-center justify-center py-8">
              <div className="text-center">
                <div className="mb-4">
                  <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gray-100">
                    <FolderOpen size={48} className="text-gray-300" />
                  </div>
                </div>
                <h2 className="mb-2 text-2xl font-bold text-gray-600">No resource channels yet</h2>
                <p className="text-lg text-gray-400">
                  Create your first channel to organize resources into focused destinations.
                </p>
                <div className="mt-6 flex justify-center">
                  <Button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="rounded-lg bg-black px-5 py-2 text-xs font-bold text-white nice-shadow hover:scale-105"
                  >
                    <Plus className="h-4 w-4" />
                    Add Channel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <Modal
          isDialogOpen={isCreateModalOpen}
          onOpenChange={setIsCreateModalOpen}
          minWidth="sm"
          minHeight="no-min"
          dialogTitle="Create Resource Channel"
          dialogDescription="Start a new channel and then customize its thumbnail, access, and curated resource list."
          dialogContent={
            <CreateResourceChannelForm
              accessToken={accessToken}
              orgId={org?.id}
              onCreated={() => mutate()}
              onClose={() => setIsCreateModalOpen(false)}
            />
          }
        />
      </div>
    </FeatureDisabledView>
  )
}
