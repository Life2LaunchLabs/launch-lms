'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Upload } from 'lucide-react'
import { toast } from 'react-hot-toast'
import useSWR from 'swr'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import ResourceComments from '@components/Resources/ResourceComments'
import {
  getResource,
  saveResource,
  unsaveResource,
  uploadOutcomeFile,
} from '@services/resources/resources'
import {
  getResourceOutcomeMediaDirectory,
  getResourceThumbnailMediaDirectory,
} from '@services/media/media'

export default function ResourceDetailClient({ resourceUuid }: { resourceUuid: string }) {
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

  const handleSave = async () => {
    if (!accessToken) return
    try {
      if (resource.is_saved) {
        await unsaveResource(resource.resource_uuid, accessToken)
      } else {
        await saveResource(resource.resource_uuid, {
          notes: notesDraft ?? resource.user_state?.notes ?? '',
          outcome_text: outcomeTextDraft ?? resource.user_state?.outcome_text ?? '',
          outcome_link: outcomeLinkDraft ?? resource.user_state?.outcome_link ?? '',
        }, accessToken)
      }
      mutate()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update saved state')
    }
  }

  const handleUpdatePrivate = async () => {
    if (!accessToken) return
    try {
      await saveResource(resource.resource_uuid, {
        notes: notesDraft ?? resource.user_state?.notes ?? '',
        outcome_text: outcomeTextDraft ?? resource.user_state?.outcome_text ?? '',
        outcome_link: outcomeLinkDraft ?? resource.user_state?.outcome_link ?? '',
      }, accessToken)
      mutate()
      toast.success('Private details saved')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save private details')
    }
  }

  const handleOpenResource = async () => {
    if (accessToken) {
      try {
        await saveResource(resource.resource_uuid, { open_count_increment: 1 }, accessToken)
      } catch {
        // Best effort only.
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
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="overflow-hidden rounded-3xl bg-white nice-shadow">
          <div className="grid lg:grid-cols-[1.2fr,0.8fr]">
            <div className="min-h-[300px] bg-gray-100">
              <img src={imageSrc} alt={resource.title} className="h-full w-full object-cover" />
            </div>
            <div className="p-6">
              <div className="text-xs uppercase tracking-wide text-gray-400">{resource.resource_type}{resource.provider_name ? ` · ${resource.provider_name}` : ''}</div>
              <h1 className="mt-2 text-3xl font-bold text-gray-900">{resource.title}</h1>
              {resource.description && <p className="mt-4 text-gray-600">{resource.description}</p>}
              <div className="mt-6 flex flex-wrap gap-3">
                <button className="rounded-xl bg-black px-4 py-3 text-sm font-medium text-white" onClick={handleOpenResource}>
                  <span className="flex items-center gap-2"><ExternalLink size={16} />Open resource</span>
                </button>
                <button className={`rounded-xl px-4 py-3 text-sm font-medium ${resource.is_saved ? 'border border-black text-black' : 'border border-gray-200 text-gray-700'}`} onClick={handleSave}>
                  {resource.is_saved ? 'Saved' : 'Save'}
                </button>
              </div>
              <div className="mt-6 grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-2xl bg-gray-50 p-3"><div className="text-gray-400">Saves</div><div className="mt-1 text-lg font-semibold">{resource.save_count}</div></div>
                <div className="rounded-2xl bg-gray-50 p-3"><div className="text-gray-400">Comments</div><div className="mt-1 text-lg font-semibold">{resource.comment_count}</div></div>
                <div className="rounded-2xl bg-gray-50 p-3"><div className="text-gray-400">Opens</div><div className="mt-1 text-lg font-semibold">{resource.user_state?.open_count || 0}</div></div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr,340px]">
          <div className="overflow-hidden rounded-3xl bg-white nice-shadow">
            <ResourceComments resourceUuid={resource.resource_uuid} />
          </div>
          <div className="rounded-3xl bg-white nice-shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900">Your notes and outcomes</h2>
            {accessToken ? (
              <div className="mt-4 space-y-4">
                <textarea value={notesDraft ?? resource.user_state?.notes ?? ''} onChange={(e) => setNotesDraft(e.target.value)} rows={4} className="w-full rounded-xl border border-gray-200 p-3 text-sm" placeholder="Private notes" />
                <textarea value={outcomeTextDraft ?? resource.user_state?.outcome_text ?? ''} onChange={(e) => setOutcomeTextDraft(e.target.value)} rows={4} className="w-full rounded-xl border border-gray-200 p-3 text-sm" placeholder="Outcome details" />
                <input value={outcomeLinkDraft ?? resource.user_state?.outcome_link ?? ''} onChange={(e) => setOutcomeLinkDraft(e.target.value)} className="w-full rounded-xl border border-gray-200 p-3 text-sm" placeholder="Outcome link" />
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-600">
                  <Upload size={16} />
                  Upload outcome file
                  <input type="file" className="hidden" onChange={(e) => handleOutcomeUpload(e.target.files?.[0])} />
                </label>
                {outcomeFileUrl && (
                  <a className="block text-sm text-blue-600 underline" href={outcomeFileUrl} target="_blank" rel="noreferrer">
                    View uploaded outcome file
                  </a>
                )}
                <button className="w-full rounded-xl bg-black px-4 py-3 text-sm font-medium text-white" onClick={handleUpdatePrivate}>
                  Save private details
                </button>
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-500">Sign in to save this resource and store your outcomes.</p>
            )}
          </div>
        </div>
      </div>

      {showReturnPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 nice-shadow">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Add outcome details?</h2>
                <p className="mt-2 text-sm text-gray-500">You just returned from this resource. Add any notes, results, or a link while it’s fresh.</p>
              </div>
              <button className="rounded-lg border border-gray-200 px-3 py-2 text-sm" onClick={() => setShowReturnPrompt(false)}>X</button>
            </div>
            <div className="mt-4 space-y-3">
              <textarea value={outcomeTextDraft ?? resource.user_state?.outcome_text ?? ''} onChange={(e) => setOutcomeTextDraft(e.target.value)} rows={4} className="w-full rounded-xl border border-gray-200 p-3 text-sm" placeholder="Outcome details" />
              <input value={outcomeLinkDraft ?? resource.user_state?.outcome_link ?? ''} onChange={(e) => setOutcomeLinkDraft(e.target.value)} className="w-full rounded-xl border border-gray-200 p-3 text-sm" placeholder="Outcome link" />
              <button className="rounded-xl bg-black px-4 py-3 text-sm font-medium text-white" onClick={async () => {
                await handleUpdatePrivate()
                setShowReturnPrompt(false)
              }}>
                Add outcome data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
