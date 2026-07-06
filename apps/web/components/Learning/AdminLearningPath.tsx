'use client'

import React from 'react'
import Link from 'next/link'
import { Copy, Loader2, Plus, Trash2 } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg } from '@services/config/config'
import {
  createLearningActivity,
  deleteLearningActivity,
  duplicateLearningActivity,
  updateLearningActivity,
} from '@services/learning/learning'
import toast from 'react-hot-toast'

function cleanBadgeId(value: string) {
  return String(value || '').replace(/^badge_/, '')
}

function cleanActivityId(value: string) {
  return String(value || '').replace(/^learning_activity_/, '')
}

export default function AdminLearningPath({ orgslug, badgePath }: { orgslug: string; badgePath: any }) {
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const badge = badgePath.badge
  const [title, setTitle] = React.useState('')
  const [busy, setBusy] = React.useState('')
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
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
        {(badgePath.activities || []).map((activity: any, index: number) => (
          <div key={activity.activity_uuid} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-lime-100 text-sm font-black text-lime-700">{index + 1}</div>
            <Link
              href={getUriWithOrg(orgslug, `/admin/badges/badge/${cleanBadgeId(badge.badge_uuid)}/learning-path/activity/${cleanActivityId(activity.activity_uuid)}/editor`)}
              className="min-w-0 flex-1"
            >
              <h2 className="truncate text-base font-bold text-gray-950">{activity.title}</h2>
              <p className="text-sm text-gray-500">{activity.pages?.length || 0} pages · {activity.published ? 'Published' : 'Draft'}</p>
            </Link>
            <button onClick={() => togglePublish(activity)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold">
              {activity.published ? 'Unpublish' : 'Publish'}
            </button>
            <button onClick={() => duplicateActivity(activity)} className="rounded-lg border border-gray-200 p-2"><Copy size={16} /></button>
            <button onClick={() => removeActivity(activity)} className="rounded-lg border border-red-200 p-2 text-red-600"><Trash2 size={16} /></button>
          </div>
        ))}
        {(badgePath.activities || []).length === 0 ? (
          <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-16 text-center">
            <div>
              <p className="text-sm font-semibold text-gray-700">No activities yet</p>
              <p className="mt-1 text-xs text-gray-500">Create the first activity in this badge learning path.</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
