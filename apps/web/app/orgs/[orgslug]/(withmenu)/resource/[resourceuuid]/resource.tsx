'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Eye, MessageCircle, Upload, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import ResourceComments from '@components/Resources/ResourceComments'
import SaveDropdown from '@components/Resources/SaveDropdown'
import {
  getResource,
  saveResource,
  uploadOutcomeFile,
} from '@services/resources/resources'
import {
  getResourceOutcomeMediaDirectory,
  getResourceThumbnailMediaDirectory,
} from '@services/media/media'

export default function ResourceDetailClient({ resourceUuid }: { resourceUuid: string }) {
  const router = useRouter()
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const userUUID = session?.data?.user?.user_uuid
  const [notesDraft, setNotesDraft] = useState<string | null>(null)
  const [outcomeTextDraft, setOutcomeTextDraft] = useState<string | null>(null)
  const [outcomeLinkDraft, setOutcomeLinkDraft] = useState<string | null>(null)
  const [showReturnPrompt, setShowReturnPrompt] = useState(false)

  const { data: resource, mutate } = useSWR(
    resourceUuid ? ['resource-detail', resourceUuid, accessToken || 'anon'] : null,
    () => getResource(resourceUuid, accessToken)
  )

  useEffect(() => {
    const key = `resource-return:${resourceUuid}`
    const onFocus = () => {
      if (window.sessionStorage.getItem(key) === 'pending') {
        setShowReturnPrompt(true)
        window.sessionStorage.removeItem(key)
      }
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [resourceUuid])

  if (!resource) return <div className="p-6">Loading resource…</div>

  const imageSrc = resource.thumbnail_image && org?.org_uuid
    ? getResourceThumbnailMediaDirectory(org.org_uuid, resource.resource_uuid, resource.thumbnail_image)
    : resource.cover_image_url || '/placeholder/course-dark.png'

  const handleUpdatePrivate = async () => {
    if (!accessToken) return
    try {
      await saveResource(resource.resource_uuid, {
        notes: notesDraft ?? resource.user_state?.notes ?? '',
        outcome_text: outcomeTextDraft ?? resource.user_state?.outcome_text ?? '',
        outcome_link: outcomeLinkDraft ?? resource.user_state?.outcome_link ?? '',
      }, accessToken)
      mutate()
      toast.success('Outcomes saved')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save outcomes')
    }
  }

  const handleOpenResource = async () => {
    if (accessToken) {
      try {
        await saveResource(resource.resource_uuid, { open_count_increment: 1 }, accessToken)
      } catch {
        // best effort
      }
      window.sessionStorage.setItem(`resource-return:${resourceUuid}`, 'pending')
    }
    window.open(resource.external_url, '_blank', 'noopener,noreferrer')
  }

  const handleOutcomeUpload = async (file?: File) => {
    if (!file || !accessToken) return
    const formData = new FormData()
    formData.append('outcome_file', file)
    try {
      await uploadOutcomeFile(resource.resource_uuid, formData, accessToken)
      mutate()
      toast.success('Outcome file uploaded')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to upload outcome file')
    }
  }

  const outcomeFileUrl = resource.user_state?.outcome_file && userUUID
    ? getResourceOutcomeMediaDirectory(userUUID, resource.resource_uuid, resource.user_state.outcome_file)
    : null

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">

        {/* Close button */}
        <div className="mb-4 flex justify-end">
          <button
            onClick={() => router.back()}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <div className="space-y-5">

          {/* Hero */}
          <div>
            {/* Mobile: full-width image above */}
            <div className="sm:hidden aspect-[4/3] w-full overflow-hidden rounded-2xl bg-gray-100 mb-4">
              <img src={imageSrc} alt={resource.title} className="h-full w-full object-cover" />
            </div>

            {/* Content row */}
            <div className="flex gap-5">
              {/* Desktop square image */}
              <div className="hidden sm:block aspect-square w-44 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                <img src={imageSrc} alt={resource.title} className="h-full w-full object-cover" />
              </div>
              {/* Text */}
              <div className="flex-1 min-w-0">
                <div className="text-xs uppercase tracking-wide text-gray-400 font-medium">
                  {resource.resource_type}{resource.provider_name ? ` · ${resource.provider_name}` : ''}
                </div>
                <h1 className="mt-1.5 text-2xl font-bold text-gray-900 leading-tight">{resource.title}</h1>
                {resource.description && (
                  <p className="mt-3 text-sm text-gray-600 leading-relaxed">{resource.description}</p>
                )}
              </div>
            </div>
          </div>

          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleOpenResource}
              className="flex items-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
            >
              <ExternalLink size={15} />
              Open resource
            </button>

            {/* Save — action + indicator */}
            <SaveDropdown
              resourceUuid={resource.resource_uuid}
              isSaved={resource.is_saved}
              saveCount={resource.save_count}
              savedUserChannelUuids={resource.user_channel_uuids ?? []}
              onSaveChange={() => mutate()}
              variant="detail"
            />

            {/* Comments — scrolls to section */}
            <button
              onClick={() => document.getElementById('resource-comments')?.scrollIntoView({ behavior: 'smooth' })}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-600 hover:border-gray-400 transition-colors"
            >
              <MessageCircle size={14} />
              {resource.comment_count}
            </button>

            {/* Opens — display only */}
            <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-500">
              <Eye size={14} />
              {resource.user_state?.open_count || 0}
            </div>
          </div>

          {/* Outcomes */}
          <div className="rounded-2xl border border-gray-100 bg-white nice-shadow p-5">
            <h2 className="text-base font-semibold text-gray-900">Outcomes</h2>
            {accessToken ? (
              <div className="mt-4 space-y-3">
                <textarea
                  value={notesDraft ?? resource.user_state?.notes ?? ''}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-gray-400"
                  placeholder="Private notes"
                />
                <textarea
                  value={outcomeTextDraft ?? resource.user_state?.outcome_text ?? ''}
                  onChange={(e) => setOutcomeTextDraft(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-gray-400"
                  placeholder="Outcome details"
                />
                <input
                  value={outcomeLinkDraft ?? resource.user_state?.outcome_link ?? ''}
                  onChange={(e) => setOutcomeLinkDraft(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-gray-400"
                  placeholder="Outcome link"
                />
                <div className="flex items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                    <Upload size={14} />
                    Upload file
                    <input type="file" className="hidden" onChange={(e) => handleOutcomeUpload(e.target.files?.[0])} />
                  </label>
                  {outcomeFileUrl && (
                    <a className="text-sm text-blue-600 underline" href={outcomeFileUrl} target="_blank" rel="noreferrer">
                      View file
                    </a>
                  )}
                </div>
                <button
                  className="rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
                  onClick={handleUpdatePrivate}
                >
                  Save
                </button>
              </div>
            ) : (
              <p className="mt-3 text-sm text-gray-500">Sign in to save this resource and track your outcomes.</p>
            )}
          </div>

          {/* Comments */}
          <div id="resource-comments" className="overflow-hidden rounded-2xl bg-white nice-shadow">
            <ResourceComments resourceUuid={resource.resource_uuid} />
          </div>

        </div>
      </div>

      {/* Return prompt */}
      {showReturnPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 nice-shadow">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Add outcome details?</h2>
                <p className="mt-2 text-sm text-gray-500">You just returned from this resource. Add any notes, results, or a link while it's fresh.</p>
              </div>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
                onClick={() => setShowReturnPrompt(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <textarea
                value={outcomeTextDraft ?? resource.user_state?.outcome_text ?? ''}
                onChange={(e) => setOutcomeTextDraft(e.target.value)}
                rows={4}
                className="w-full resize-none rounded-xl border border-gray-200 p-3 text-sm"
                placeholder="Outcome details"
              />
              <input
                value={outcomeLinkDraft ?? resource.user_state?.outcome_link ?? ''}
                onChange={(e) => setOutcomeLinkDraft(e.target.value)}
                className="w-full rounded-xl border border-gray-200 p-3 text-sm"
                placeholder="Outcome link"
              />
              <button
                className="rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
                onClick={async () => {
                  await handleUpdatePrivate()
                  setShowReturnPrompt(false)
                }}
              >
                Save outcomes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
