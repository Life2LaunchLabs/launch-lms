'use client'

import { useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import UserAvatar from '@components/Objects/UserAvatar'
import { getUserAvatarMediaDirectory } from '@services/media/media'
import {
  createResourceComment,
  deleteResourceComment,
  getResourceComments,
  ResourceComment,
  updateResourceComment,
} from '@services/resources/resources'
import useSWR from 'swr'

function avatarUrl(comment: ResourceComment) {
  if (!comment.author?.avatar_image || !comment.author?.user_uuid) return undefined
  if (comment.author.avatar_image.startsWith('http')) return comment.author.avatar_image
  return getUserAvatarMediaDirectory(comment.author.user_uuid, comment.author.avatar_image)
}

export default function ResourceComments({ resourceUuid }: { resourceUuid: string }) {
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const currentUserId = session?.data?.user?.id
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingDraft, setEditingDraft] = useState('')

  const swrKey = useMemo(() => (resourceUuid ? [`resource-comments`, resourceUuid, accessToken || 'anon'] : null), [resourceUuid, accessToken])
  const { data: comments = [], mutate } = useSWR(
    swrKey,
    () => getResourceComments(resourceUuid, accessToken)
  )

  const handleCreate = async () => {
    if (!draft.trim() || !accessToken) return
    try {
      const created = await createResourceComment(resourceUuid, { content: draft.trim() }, accessToken)
      setDraft('')
      mutate([...(comments || []), created], false)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to post comment')
    }
  }

  const handleUpdate = async (commentUuid: string) => {
    if (!editingDraft.trim() || !accessToken) return
    try {
      const updated = await updateResourceComment(commentUuid, { content: editingDraft.trim() }, accessToken)
      mutate((comments || []).map((comment) => comment.comment_uuid === commentUuid ? updated : comment), false)
      setEditingId(null)
      setEditingDraft('')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update comment')
    }
  }

  const handleDelete = async (commentUuid: string) => {
    if (!accessToken) return
    try {
      await deleteResourceComment(commentUuid, accessToken)
      mutate((comments || []).filter((comment) => comment.comment_uuid !== commentUuid), false)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete comment')
    }
  }

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-gray-900">Comments</h2>
      <div className="mt-4 space-y-4">
        {(comments || []).map((comment) => {
          const isAuthor = currentUserId === comment.author_id
          const authorName = comment.author
            ? `${comment.author.first_name || ''} ${comment.author.last_name || ''}`.trim() || comment.author.username
            : 'Unknown'
          return (
            <div key={comment.comment_uuid} className="rounded-xl border border-gray-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <UserAvatar
                    width={36}
                    rounded="rounded-full"
                    avatar_url={avatarUrl(comment)}
                    predefined_avatar={avatarUrl(comment) ? undefined : 'empty'}
                    shadow="shadow-none"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900">{authorName}</div>
                    <div className="text-xs text-gray-400">{new Date(comment.creation_date).toLocaleString()}</div>
                  </div>
                </div>
                {isAuthor && (
                  <div className="flex gap-2 text-xs">
                    <button
                      className="rounded-md border border-gray-200 px-2 py-1 text-gray-600"
                      onClick={() => {
                        setEditingId(comment.comment_uuid)
                        setEditingDraft(comment.content)
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="rounded-md border border-red-200 px-2 py-1 text-red-600"
                      onClick={() => handleDelete(comment.comment_uuid)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
              {editingId === comment.comment_uuid ? (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={editingDraft}
                    onChange={(e) => setEditingDraft(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 p-3 text-sm"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <button className="rounded-lg bg-black px-3 py-2 text-sm text-white" onClick={() => handleUpdate(comment.comment_uuid)}>
                      Save
                    </button>
                    <button className="rounded-lg border border-gray-200 px-3 py-2 text-sm" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-gray-700 whitespace-pre-wrap">{comment.content}</p>
              )}
            </div>
          )
        })}
      </div>

      {accessToken ? (
        <div className="mt-6 space-y-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-gray-200 p-3 text-sm"
            placeholder="Add a comment"
          />
          <button className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white" onClick={handleCreate}>
            Post comment
          </button>
        </div>
      ) : (
        <p className="mt-6 text-sm text-gray-500">Sign in to comment.</p>
      )}
    </div>
  )
}
