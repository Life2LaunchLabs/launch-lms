'use client'

import { Dispatch, SetStateAction, useEffect, useMemo, useRef, useState } from 'react'
import { Star } from 'lucide-react'
import { toast } from 'react-hot-toast'
import useSWR from 'swr'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import UserAvatar from '@components/Objects/UserAvatar'
import { Button } from '@components/ui/button'
import { Textarea } from '@components/ui/textarea'
import { getUserAvatarMediaDirectory } from '@services/media/media'
import {
  createResourceReview,
  deleteResourceReview,
  getResourceReviews,
  ResourceComment,
  updateResourceReview,
} from '@services/resources/resources'

function avatarUrl(review: ResourceComment) {
  if (!review.author?.avatar_image || !review.author?.user_uuid) return undefined
  if (review.author.avatar_image.startsWith('http')) return review.author.avatar_image
  return getUserAvatarMediaDirectory(review.author.user_uuid, review.author.avatar_image)
}

function RatingPicker({ value, onChange, label, compact = false }: { value: number; onChange: Dispatch<SetStateAction<number>>; label: string; compact?: boolean }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((rating) => (
        <button
          key={rating}
          type="button"
          role="radio"
          aria-checked={value === rating}
          aria-label={`${rating} star${rating === 1 ? '' : 's'}`}
          className="rounded-sm p-0.5 text-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onChange(rating)}
        >
          <Star size={compact ? 16 : 20} className={rating <= value ? 'fill-current' : 'text-muted-foreground/40'} />
        </button>
      ))}
    </div>
  )
}

function RatingDisplay({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-xs text-muted-foreground">Legacy review · unrated</span>
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} size={14} className={star <= rating ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/30'} />
      ))}
    </div>
  )
}

export default function ResourceComments({
  resourceUuid,
  compact = false,
  onReviewsChange,
  composeRequest = 0,
  initialRating = 0,
  onCancelDraft,
}: {
  resourceUuid: string
  compact?: boolean
  onReviewsChange?: () => void
  composeRequest?: number
  initialRating?: number
  onCancelDraft?: () => void
}) {
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const currentUserId = Number(session?.data?.user?.id || 0)
  const [draft, setDraft] = useState('')
  const [rating, setRating] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingDraft, setEditingDraft] = useState('')
  const [editingRating, setEditingRating] = useState(0)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const editingRef = useRef<HTMLTextAreaElement>(null)
  const composeHandledRef = useRef(0)

  const swrKey = useMemo(() => (resourceUuid ? ['resource-reviews', resourceUuid, accessToken || 'anon'] : null), [resourceUuid, accessToken])
  const { data: reviewsData, mutate } = useSWR(swrKey, () => getResourceReviews(resourceUuid, accessToken))
  const reviews = reviewsData ?? []
  const hasReview = reviews.some((review) => Number(review.author_id) === currentUserId && review.rating !== null)

  useEffect(() => {
    if (!composeRequest || composeHandledRef.current === composeRequest || !accessToken || !reviewsData) return
    composeHandledRef.current = composeRequest
    const ownReview = reviewsData.find((review) => Number(review.author_id) === currentUserId && review.rating !== null)
    if (ownReview) {
      const frame = window.requestAnimationFrame(() => {
        setEditingId(ownReview.comment_uuid)
        setEditingDraft(ownReview.content)
        setEditingRating(initialRating || ownReview.rating || 0)
        window.requestAnimationFrame(() => editingRef.current?.focus())
      })
      return () => window.cancelAnimationFrame(frame)
    }
    const frame = window.requestAnimationFrame(() => {
      setRating(initialRating)
      composerRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [accessToken, composeRequest, currentUserId, initialRating, reviewsData])

  const handleCreate = async () => {
    if (!draft.trim() || !rating || !accessToken) return
    try {
      const created = await createResourceReview(resourceUuid, { content: draft.trim(), rating }, accessToken)
      setDraft('')
      setRating(0)
      mutate([...(reviews || []), created], false)
      onReviewsChange?.()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to post review')
    }
  }

  const handleUpdate = async (commentUuid: string) => {
    if (!editingDraft.trim() || !editingRating || !accessToken) return
    try {
      const updated = await updateResourceReview(
        commentUuid,
        { content: editingDraft.trim(), rating: editingRating },
        accessToken
      )
      mutate(reviews.map((review) => review.comment_uuid === commentUuid ? updated : review), false)
      onReviewsChange?.()
      setEditingId(null)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update review')
    }
  }

  const handleDelete = async (commentUuid: string) => {
    if (!accessToken) return
    try {
      await deleteResourceReview(commentUuid, accessToken)
      mutate(reviews.filter((review) => review.comment_uuid !== commentUuid), false)
      onReviewsChange?.()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete review')
    }
  }

  return (
    <div className={compact ? 'p-4 sm:p-5' : 'p-6'}>
      {!compact && <h2 className="text-lg font-semibold text-foreground">Reviews</h2>}
      {!compact && <p className="mt-1 text-sm text-muted-foreground">Ratings and comments are visible to people with access.</p>}
      <div className={compact ? 'max-h-48 space-y-1.5 overflow-y-auto pr-1' : 'mt-5 space-y-4'}>
        {reviews.map((review) => {
          const isAuthor = currentUserId === Number(review.author_id)
          const authorName = review.author
            ? `${review.author.first_name || ''} ${review.author.last_name || ''}`.trim() || review.author.username
            : 'Unknown'
          return (
            <div key={review.comment_uuid} className={compact ? 'rounded-lg border border-border p-2.5' : 'rounded-2xl border border-border p-4'}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <UserAvatar
                    width={compact ? 28 : 36}
                    rounded="rounded-full"
                    avatar_url={avatarUrl(review)}
                    predefined_avatar={avatarUrl(review) ? undefined : 'empty'}
                    shadow="shadow-none"
                  />
                  <div>
                    <div className={compact ? 'text-xs font-medium text-foreground' : 'text-sm font-medium text-foreground'}>{authorName}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      <RatingDisplay rating={review.rating} />
                      <span className="text-xs text-muted-foreground">{new Date(review.creation_date).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                {isAuthor && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(review.comment_uuid)
                        setEditingDraft(review.content)
                        setEditingRating(review.rating || 0)
                      }}
                    >
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(review.comment_uuid)}>
                      Delete
                    </Button>
                  </div>
                )}
              </div>
              {editingId === review.comment_uuid ? (
                <div className="mt-4 space-y-3">
                  <RatingPicker value={editingRating} onChange={setEditingRating} label="Edit your rating" compact={compact} />
                  <Textarea ref={editingRef} value={editingDraft} onChange={(event) => setEditingDraft(event.target.value)} rows={compact ? 2 : 3} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleUpdate(review.comment_uuid)}>Save review</Button>
                    <Button size="sm" variant="outline" onClick={() => {
                      setEditingId(null)
                      setEditingDraft('')
                      setEditingRating(0)
                      onCancelDraft?.()
                    }}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <p className={`${compact ? 'mt-1.5 text-xs leading-5' : 'mt-3 text-sm'} whitespace-pre-wrap text-muted-foreground`}>{review.content}</p>
              )}
            </div>
          )
        })}
        {reviews.length === 0 && <p className="text-sm text-muted-foreground">No reviews yet.</p>}
      </div>

      {accessToken && !hasReview ? (
        <div className={compact ? 'mt-2 space-y-1.5 border-t border-border pt-2' : 'mt-6 space-y-3 border-t border-border pt-5'}>
          <RatingPicker value={rating} onChange={setRating} label="Your rating" compact={compact} />
          <Textarea ref={composerRef} className={compact ? 'min-h-16 resize-none text-xs' : ''} value={draft} onChange={(event) => setDraft(event.target.value)} rows={compact ? 2 : 3} placeholder="Share your experience" />
          <div className="flex gap-2">
            <Button size={compact ? 'sm' : 'default'} className={compact ? 'h-7 text-xs' : ''} onClick={handleCreate} disabled={!draft.trim() || !rating}>Post review</Button>
            {(draft || rating > 0) && (
              <Button
                size={compact ? 'sm' : 'default'}
                variant="outline"
                className={compact ? 'h-7 text-xs' : ''}
                onClick={() => {
                  setDraft('')
                  setRating(0)
                  onCancelDraft?.()
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      ) : accessToken ? (
        <p className="mt-6 text-sm text-muted-foreground">You can edit your review above.</p>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">Sign in to review this resource.</p>
      )}
    </div>
  )
}
