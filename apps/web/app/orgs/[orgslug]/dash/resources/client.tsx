'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Plus, Upload } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import FeatureDisabledView from '@components/Dashboard/Shared/FeatureDisabled/FeatureDisabledView'
import {
  createResourceChannel,
  getResourceChannels,
  importResourcesCsv,
  ResourceChannel,
} from '@services/resources/resources'
import { getResourceChannelThumbnailMediaDirectory } from '@services/media/media'
import { toast } from 'react-hot-toast'

export default function ResourcesDashClient({ orgslug }: { orgslug: string }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const [createName, setCreateName] = useState('')
  const [createDescription, setCreateDescription] = useState('')

  const { data, mutate } = useSWR(
    org?.id ? ['dash-resource-channels', org.id, accessToken] : null,
    () => getResourceChannels(org.id, accessToken, true)
  )

  const createChannel = async () => {
    if (!createName.trim() || !accessToken || !org?.id) return
    try {
      await createResourceChannel(org.id, { name: createName.trim(), description: createDescription || null, public: true, is_starred: false }, accessToken)
      setCreateName('')
      setCreateDescription('')
      mutate()
      toast.success('Channel created')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create channel')
    }
  }

  const importCsv = async (file?: File) => {
    if (!file || !accessToken || !org?.id) return
    const formData = new FormData()
    formData.append('file', file)
    try {
      const result = await importResourcesCsv(org.id, formData, accessToken)
      if (result.success) {
        toast.success(`Imported resources (${result.data.created} created, ${result.data.updated} updated)`)
      } else {
        toast.error('Import failed')
      }
    } catch (error: any) {
      toast.error(error?.message || 'CSV import failed')
    }
  }

  return (
    <FeatureDisabledView featureName="resources" orgslug={orgslug} context="dashboard">
      <div className="min-h-screen w-full bg-[#f8f8f8] px-4 py-6 sm:px-10">
        <div className="rounded-3xl bg-white p-6 nice-shadow">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Resources</h1>
              <p className="mt-2 text-gray-500">Manage discovery channels, uploads, and moderation for your organization’s resources.</p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700">
              <Upload size={16} />
              Import CSV
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => importCsv(e.target.files?.[0])} />
            </label>
          </div>

          <div className="mt-6 grid gap-3 rounded-2xl bg-gray-50 p-4 lg:grid-cols-[1fr,1fr,auto]">
            <input value={createName} onChange={(e) => setCreateName(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" placeholder="New channel name" />
            <input value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" placeholder="Description" />
            <button className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white" onClick={createChannel}>
              <span className="flex items-center gap-2"><Plus size={16} />Create channel</span>
            </button>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(data?.channels || []).map((channel: ResourceChannel) => {
              const thumb = channel.thumbnail_image && org?.org_uuid
                ? getResourceChannelThumbnailMediaDirectory(org.org_uuid, channel.channel_uuid, channel.thumbnail_image)
                : null
              return (
                <Link
                  key={channel.channel_uuid}
                  href={`/dash/resources/${channel.channel_uuid}/general`}
                  className="group overflow-hidden rounded-2xl bg-gray-50 nice-shadow transition-all hover:-translate-y-0.5"
                >
                  <div className="aspect-[4/2.3] bg-gray-100">
                    {thumb ? (
                    <img src={thumb} alt={channel.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-gray-400">Channel</div>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-lg font-semibold text-gray-900">{channel.name}</h2>
                      {channel.is_starred && <span className="rounded-full bg-black px-2 py-1 text-xs text-white">Starred</span>}
                    </div>
                    {channel.description && <p className="mt-2 text-sm text-gray-500 line-clamp-2">{channel.description}</p>}
                    <div className="mt-3 text-sm text-gray-500">{channel.resource_count} resources</div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </FeatureDisabledView>
  )
}
