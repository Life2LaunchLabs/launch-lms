'use client'

import { Dispatch, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Loader2, Star } from 'lucide-react'
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

import { tr } from '@/lib/tr'
function avatarUrl(review: ResourceComment) {
  if (!review.author?.avatar_image || !review.author?.user_uuid) return undefined
  if (review.author.avatar_image.startsWith('http')) return review.author.avatar_image
  return getUserAvatarMediaDirectory(review.author.user_uuid, review.author.avatar_image)
}

function RatingPicker({ value, onChange, label, compact = false }: { value: number; onChange: Dispatch<number>; label: string; compact?: boolean }) {
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
  if (!rating) return <span className="text-xs text-muted-foreground">{tr('resources.resource_comments.legacy_review_unrated', 'Legacy review · unrated')}</span>
  return (
    <div className="flex items-center gap-0.5" aria-label={tr('resources.resource_comments.rating_out_of_5_stars', '{{rating}} out of 5 stars', { rating })}>
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
  // The stars just tapped, shown while the rating saves.
  const [pendingRating, setPendingRating] = useState<number | null>(null)
  const [posting, setPosting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingDraft, setEditingDraft] = useState('')
  const [editingRating, setEditingRating] = useState(0)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const editingRef = useRef<HTMLTextAreaElement>(null)
  const composeHandledRef = useRef(0)

  const swrKey = useMemo(() => (resourceUuid ? ['resource-reviews', resourceUuid, accessToken || 'anon'] : null), [resourceUuid, accessToken])
  const { data: reviewsData, mutate } = useSWR(swrKey, () => getResourceReviews(resourceUuid, accessToken))
  const reviews = reviewsData ?? []
  const ownReview = reviews.find((review) => Number(review.author_id) === currentUserId && review.rating !== null)
  const shownRating = pendingRating ?? ownReview?.rating ?? 0

  // Tapping a star is the whole rating: it saves straight away, and words are optional afterwards.
  const rate = async (value: number) => {
    if (!accessToken || pendingRating !== null) return
    setPendingRating(value)
    try {
      if (ownReview) {
        const updated = await updateResourceReview(ownReview.comment_uuid, { rating: value }, accessToken)
        await mutate(reviews.map((review) => review.comment_uuid === updated.comment_uuid ? updated : review), false)
      } else {
        const created = await createResourceReview(resourceUuid, { content: '', rating: value }, accessToken)
        await mutate([...reviews, created], false)
      }
      onReviewsChange?.()
    } catch (error: any) {
      toast.error(error?.message || tr('resources.resource_comments.couldn_t_save_your_rating', 'Couldn’t save your rating. Try again.'))
    } finally {
      setPendingRating(null)
    }
  }

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
    if (initialRating) void rate(initialRating)
    const frame = window.requestAnimationFrame(() => composerRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [accessToken, composeRequest, currentUserId, initialRating, reviewsData]) // eslint-disable-line react-hooks/exhaustive-deps

  // Words added to the learner's own stars.
  const handleWords = async () => {
    if (!draft.trim() || !ownReview || !accessToken) return
    setPosting(true)
    try {
      const updated = await updateResourceReview(ownReview.comment_uuid, { content: draft.trim() }, accessToken)
      setDraft('')
      await mutate(reviews.map((review) => review.comment_uuid === updated.comment_uuid ? updated : review), false)
      onReviewsChange?.()
    } catch (error: any) {
      toast.error(error?.message || tr('resources.resource_comments.failed_to_post_review', 'Failed to post review'))
    } finally {
      setPosting(false)
    }
  }

  const handleUpdate = async (commentUuid: string) => {
    if (!editingRating || !accessToken) return
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
      toast.error(error?.message || tr('resources.resource_comments.failed_to_update_review', 'Failed to update review'))
    }
  }

  const handleDelete = async (commentUuid: string) => {
    if (!accessToken) return
    try {
      await deleteResourceReview(commentUuid, accessToken)
      mutate(reviews.filter((review) => review.comment_uuid !== commentUuid), false)
      onReviewsChange?.()
    } catch (error: any) {
      toast.error(error?.message || tr('resources.resource_comments.failed_to_delete_review', 'Failed to delete review'))
    }
  }

  return (
    <div className={compact ? 'p-4 sm:p-5' : 'p-6'}>
      {!compact && <h2 className="text-lg font-semibold text-foreground">{tr('resources.resource_comments.reviews', 'Reviews')}</h2>}
      {!compact && <p className="mt-1 text-sm text-muted-foreground">{tr('resources.resource_comments.ratings_and_comments_are_visible', 'Ratings and comments are visible to people with access.')}</p>}
      <div className={compact ? 'max-h-48 space-y-1.5 overflow-y-auto pr-1' : 'mt-5 space-y-4'}>
        {reviews.map((review) => {
          const isAuthor = currentUserId === Number(review.author_id)
          const authorName = review.author
            ? `${review.author.first_name || ''} ${review.author.last_name || ''}`.trim() || review.author.username
            : tr('lit.resource_comments.unknown', 'Unknown')
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
                      {tr('resources.new_user_resource_channel_modal.edit', 'Edit')}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(review.comment_uuid)}>
                      {tr('resources.resource_comments.delete', 'Delete')}
                    </Button>
                  </div>
                )}
              </div>
              {editingId === review.comment_uuid ? (
                <div className="mt-4 space-y-3">
                  <RatingPicker value={editingRating} onChange={setEditingRating} label={tr('resources.resource_comments.edit_your_rating', 'Edit your rating')} compact={compact} />
                  <Textarea ref={editingRef} value={editingDraft} onChange={(event) => setEditingDraft(event.target.value)} rows={compact ? 2 : 3} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleUpdate(review.comment_uuid)}>{tr('resources.resource_comments.save_review', 'Save review')}</Button>
                    <Button size="sm" variant="outline" onClick={() => {
                      setEditingId(null)
                      setEditingDraft('')
                      setEditingRating(0)
                      onCancelDraft?.()
                    }}>{tr('careers.add_to_plans.cancel', 'Cancel')}</Button>
                  </div>
                </div>
              ) : review.content ? (
                <p className={`${compact ? 'mt-1.5 text-xs leading-5' : 'mt-3 text-sm'} whitespace-pre-wrap text-muted-foreground`}>{review.content}</p>
              ) : null}
            </div>
          )
        })}
        {reviews.length === 0 && <p className="text-sm text-muted-foreground">{tr('resources.resource_comments.no_reviews_yet', 'No reviews yet.')}</p>}
      </div>

      {accessToken ? (
        <div className={compact ? 'mt-2 space-y-1.5 border-t border-border pt-2' : 'mt-6 space-y-3 border-t border-border pt-5'}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={compact ? 'text-xs font-bold text-foreground' : 'text-sm font-bold text-foreground'}>{tr('resources.resource_comments.your_rating', 'Your rating')}</span>
            <RatingPicker value={shownRating} onChange={(value: number) => void rate(value)} label={tr('resources.resource_comments.your_rating', 'Your rating')} compact={compact} />
            <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground" role="status">
              {pendingRating !== null ? <><Loader2 size={12} className="animate-spin" aria-hidden="true" />{tr('resources.resource_comments.saving', 'Saving')}</>
                : ownReview ? <><Check size={12} aria-hidden="true" />{tr('resources.resource_comments.saved', 'Saved')}</>
                : tr('resources.resource_comments.tap_a_star_to_rate_it', 'Tap a star to rate it')}
            </span>
          </div>
          {ownReview && !ownReview.content && editingId !== ownReview.comment_uuid ? <>
            <Textarea ref={composerRef} className={compact ? 'min-h-16 resize-none text-xs' : ''} value={draft} onChange={(event) => setDraft(event.target.value)} rows={compact ? 2 : 3} placeholder={tr('resources.resource_comments.add_a_few_words_optional', 'Add a few words for others (optional)')} />
            {draft.trim() ? <div className="flex gap-2">
              <Button size={compact ? 'sm' : 'default'} className={compact ? 'h-7 text-xs' : ''} onClick={() => void handleWords()} disabled={posting}>{tr('resources.resource_comments.post_review', 'Post review')}</Button>
              <Button size={compact ? 'sm' : 'default'} variant="outline" className={compact ? 'h-7 text-xs' : ''} onClick={() => { setDraft(''); onCancelDraft?.() }}>{tr('careers.add_to_plans.cancel', 'Cancel')}</Button>
            </div> : null}
          </> : null}
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">{tr('resources.resource_comments.sign_in_to_review_this', 'Sign in to review this resource.')}</p>
      )}
    </div>
  )
}
