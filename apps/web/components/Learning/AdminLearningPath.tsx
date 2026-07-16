'use client'

import React from 'react'
import Link from 'next/link'
import { Copy, ImageIcon, Loader2, Plus, Trash2 } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg } from '@services/config/config'
import { useOrg } from '@components/Contexts/OrgContext'
import {
  createLearningActivity,
  deleteLearningActivity,
  duplicateLearningActivity,
  updateLearningActivity,
} from '@services/learning/learning'
import toast from 'react-hot-toast'
import { SafeImage } from '@components/Objects/SafeImage'
import ImageMediaPicker from '@components/Objects/Media/ImageMediaPicker'
import { resolveLearningActivityImage } from '@services/learning/launchReadyImages'

function cleanBadgeId(value: string) {
  return String(value || '').replace(/^badge_/, '')
}

function cleanActivityId(value: string) {
  return String(value || '').replace(/^learning_activity_/, '')
}

export default function AdminLearningPath({ orgslug, badgePath }: { orgslug: string; badgePath: any }) {
  const session = useLHSession() as any
  const org = useOrg() as any
  const accessToken = session.data?.tokens?.access_token
  const badge = badgePath.badge
  const [title, setTitle] = React.useState('')
  const [busy, setBusy] = React.useState('')
  const [uploadingCover, setUploadingCover] = React.useState('')
  const [modalOpen, setModalOpen] = React.useState(false)

  const createActivity = async () => {
    if (!title.trim()) return
    setBusy('create')
    try {
      await createLearningActivity({ badge_uuid: badge.badge_uuid, title: title.trim(), published: false }, accessToken)
      toast.success('Activity created')
      setModalOpen(false)
      window.location.reload()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create activity')
    } finally {
      setBusy('')
    }
  }

  const togglePublish = async (activity: any) => {
    setBusy(activity.activity_uuid)
    try {
      await updateLearningActivity(activity.activity_uuid, { published: !activity.published }, accessToken)
      window.location.reload()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update activity')
    } finally {
      setBusy('')
    }
  }

  const duplicateActivity = async (activity: any) => {
    setBusy(activity.activity_uuid)
    try {
      await duplicateLearningActivity(activity.activity_uuid, accessToken)
      window.location.reload()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to duplicate activity')
    } finally {
      setBusy('')
    }
  }

  const removeActivity = async (activity: any) => {
    if (!confirm(`Delete "${activity.title}"?`)) return
    setBusy(activity.activity_uuid)
    try {
      await deleteLearningActivity(activity.activity_uuid, accessToken)
      window.location.reload()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete activity')
    } finally {
      setBusy('')
    }
  }

  const selectCover = async (activity: any, url: string) => {
    if (!accessToken || !org?.id) {
      toast.error('Please sign in to update a cover image.')
      return
    }

    setUploadingCover(activity.activity_uuid)
    try {
      await updateLearningActivity(
        activity.activity_uuid,
        { thumbnail_image: url },
        accessToken
      )
      toast.success('Cover image updated')
      window.location.reload()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to upload cover image.')
    } finally {
      setUploadingCover('')
    }
  }

  return (
    <div className="px-10 pb-10 pt-6">
      <div className="mb-5 flex justify-end">
        <Modal
          isDialogOpen={modalOpen}
          onOpenChange={setModalOpen}
          minHeight="no-min"
          minWidth="md"
          dialogTitle="New Activity"
          dialogDescription="Add an activity module to this badge learning path."
          dialogContent={
            <div className="flex flex-col gap-4 p-2">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Activity title"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              />
              <button
                onClick={createActivity}
                disabled={busy === 'create' || !title.trim()}
                className="ml-auto inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {busy === 'create' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Create Activity
              </button>
            </div>
          }
          dialogTrigger={
            <button className="inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white nice-shadow transition-transform hover:scale-105">
              <Plus className="h-4 w-4" />
              New Activity
            </button>
          }
        />
      </div>

      <div className="space-y-3">
        {(badgePath.activities || []).map((activity: any, index: number) => {
          const locked = activity.settings?.system_required === true
          return (
          <div key={activity.activity_uuid} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-xs">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-lime-100 text-sm font-black text-lime-700">{index + 1}</div>
            <div className="hidden h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted text-muted-foreground sm:flex sm:items-center sm:justify-center">
              {activity.thumbnail_image ? (
                <SafeImage src={resolveLearningActivityImage(activity.thumbnail_image)} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImageIcon size={20} />
              )}
            </div>
            <Link
              href={getUriWithOrg(orgslug, `/admin/badges/badge/${cleanBadgeId(badge.badge_uuid)}/learning-path/activity/${cleanActivityId(activity.activity_uuid)}/editor`)}
              className="min-w-0 flex-1"
            >
              <h2 className="truncate text-base font-bold text-foreground">{activity.title}</h2>
              <p className="text-sm text-muted-foreground">{activity.pages?.length || 0} pages · {activity.published ? 'Published' : 'Draft'}</p>
            </Link>
            <ImageMediaPicker
              owner={{ type: 'org', id: Number(org?.id) }}
              onSelect={(url) => selectCover(activity, url)}
              buttonText="Cover"
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-bold transition hover:bg-muted"
              disabled={uploadingCover === activity.activity_uuid}
            />
            {locked ? <span className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground">Required</span> : <><button onClick={() => togglePublish(activity)} className="rounded-lg border border-border px-3 py-2 text-xs font-bold">{activity.published ? 'Unpublish' : 'Publish'}</button><button onClick={() => duplicateActivity(activity)} className="rounded-lg border border-border p-2"><Copy size={16} /></button><button onClick={() => removeActivity(activity)} className="rounded-lg border border-red-200 p-2 text-red-600"><Trash2 size={16} /></button></>}
          </div>
          )
        })}
        {(badgePath.activities || []).length === 0 ? (
          <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16 text-center">
            <div>
              <p className="text-sm font-semibold text-muted-foreground">No activities yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Create the first activity in this badge learning path.</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
