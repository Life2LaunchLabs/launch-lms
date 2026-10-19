'use client'

import React from 'react'
import useSWR, { useSWRConfig } from 'swr'
import toast from 'react-hot-toast'
import { Archive, Check, CheckCircle2, ChevronRight, ClipboardCheck, FileText, FolderOpen, History, Loader2, MessageSquareText, Paperclip, Trash2 } from 'lucide-react'
import { ActivityAggregateGradeForm } from '@components/Goals/admin/live/ActivityGrading'
import { useGoalMutation } from '@components/Goals/useGoalActions'
import { goalActivityKey, goalAdminApi, goalAttachmentsKey, goalLogApi, goalReviewsKey, type ActivityReview, type StepReview } from '@services/goals/admin'
import { goalsApi, goalUrl, isGoalsKey } from '@services/goals/goals'
import { goalSharingApi, peopleKey } from '@services/goals/sharing'
import type { Goal } from '@services/goals/types'
import { cn } from '@/lib/utils'
import ReviewEvidence from './ReviewEvidence'
import { StaffNotes } from './StaffGoalPath'
import { dateTime, EmptyState, gradeActivityReview, humanize, PageLoader, PersonAvatar, pendingScores, personName, SectionCard, timeAgo } from './ui'

/** Everything on this goal waiting on a reviewer: handed-in steps and activity answers to grade. */
export function GoalReviews({ goal, orgId, token }: { goal: Goal; orgId: number; token?: string }) {
  const { mutate } = useSWRConfig()
  const key = token && orgId ? goalReviewsKey(goal.goal_uuid, orgId) : null
  const { data, isLoading, mutate: refresh } = useSWR(key, () => goalAdminApi.goalReviews(orgId, goal.goal_uuid, token), { revalidateOnFocus: false })
  const [open, setOpen] = React.useState<string | null>(null)
  if (isLoading || !data) return <PageLoader />
  const done = async () => { setOpen(null); await Promise.all([refresh(), mutate(goalUrl(goal.goal_uuid))]) }
  const rows = [...data.step_reviews.map((item) => ({ id: item.step_uuid, item })), ...data.activity_reviews.map((item) => ({ id: item.review_id, item }))]
  return <div className="mx-auto max-w-4xl">
    <div className="mb-5"><h2 className="text-lg font-black text-gray-950">Reviews</h2><p className="mt-1 text-sm text-gray-500">Handed-in steps and activity answers on this goal only.</p></div>
    {rows.length ? <div className="space-y-3">{rows.map(({ id, item }) => {
      const activity = item.review_type === 'activity'
      const title = activity ? (item as ActivityReview).activity?.title || 'Activity' : (item as StepReview).step.title
      return <div key={id} className="overflow-hidden rounded-xl border border-gray-100 bg-white nice-shadow">
        <button type="button" aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)} className="flex w-full items-center gap-4 p-5 text-left hover:bg-gray-50">
          <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl', activity ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700')}>{activity ? <FileText size={20} /> : <ClipboardCheck size={20} />}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{title}</span><span className="mt-1 block text-xs text-gray-500">{activity ? 'Answers to grade' : `Handed in ${timeAgo((item as StepReview).submitted_at)} · attempt ${(item as StepReview).attempt}`}</span></span>
          <span className={cn('rounded-full px-3 py-1 text-xs font-black', activity ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800')}>{activity ? 'Grade' : 'Review'}</span>
          <ChevronRight size={17} className={cn('text-gray-300 transition', open === id && 'rotate-90')} />
        </button>
        {open === id ? <div className="border-t border-gray-100">{activity ? <GradeActivity review={item as ActivityReview} token={token} onDone={done} /> : <DecideStep goal={goal} review={item as StepReview} orgId={orgId} token={token} onDone={done} />}</div> : null}
      </div>
    })}</div> : <EmptyState icon={<CheckCircle2 size={36} />} title="No reviews waiting" detail="New hand-ins on this goal will appear here." />}
  </div>
}

function DecideStep({ goal, review, orgId, token, onDone }: { goal: Goal; review: StepReview; orgId: number; token?: string; onDone: () => Promise<void> }) {
  const [feedback, setFeedback] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const decide = async (action: 'confirm' | 'flag') => {
    if (action === 'flag' && !feedback.trim()) { toast.error('Tell them what to change.'); return }
    setSaving(true)
    try { await goalAdminApi.decide(orgId, review.step_uuid, action, feedback, token); toast.success(action === 'confirm' ? 'Approved.' : 'Sent back.'); await onDone() } catch (error: any) { toast.error(error?.message || 'Could not save this review.') } finally { setSaving(false) }
  }
  const guidance = review.step.reviewer_guidance
  return <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
    <div className="min-h-[360px] bg-gray-100"><ReviewEvidence item={review} confirmOnly={false} /></div>
    <div className="space-y-4 p-5">
      {review.learner_note ? <p className="whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2.5 text-sm leading-6">{review.learner_note}</p> : null}
      {guidance ? <div><p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">What to look for</p><p className="whitespace-pre-wrap text-sm text-gray-800">{guidance}</p></div> : null}
      {review.feedback_history.length ? <div className="space-y-1.5">{review.feedback_history.map((entry, index) => <p key={index} className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">{entry.message}</p>)}</div> : null}
      <label className="block text-xs font-bold text-gray-700">Feedback<textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} rows={3} className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal" placeholder="Needed if you send it back" /></label>
      <div className="flex gap-2">
        <button type="button" disabled={saving} onClick={() => void decide('flag')} className="h-10 flex-1 rounded-full border border-gray-200 text-sm font-semibold disabled:opacity-40">Send back</button>
        <button type="button" disabled={saving} onClick={() => void decide('confirm')} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-black text-sm font-semibold text-white disabled:opacity-40">{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Approve</button>
      </div>
      <StaffNotes goal={goal} step={{ step_uuid: review.step_uuid, staff_notes: [] }} initial={review.staff_notes} orgId={orgId} token={token} />
    </div>
  </div>
}

/** One learner's activity answers, graded in place. */
export function GradeActivity({ review, token, onDone }: { review: ActivityReview; token?: string; onDone: () => Promise<void> }) {
  const [scores, setScores] = React.useState<Record<string, string>>(() => pendingScores(review))
  const [feedback, setFeedback] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => { setScores(pendingScores(review)); setFeedback('') }, [review])
  const grade = async (questionFeedback: Record<string, string>) => {
    if (Object.values(scores).some((value) => value === '')) { toast.error('Enter every manual score.'); return }
    setSaving(true)
    try { await gradeActivityReview(review, scores, questionFeedback, feedback, token); toast.success(`${personName(review.user)} graded.`); await onDone() } catch (error: any) { toast.error(error?.message || 'Could not save these grades.') } finally { setSaving(false) }
  }
  return <div className="p-4"><ActivityAggregateGradeForm review={review} scores={scores} setScores={setScores} feedback={feedback} setFeedback={setFeedback} saving={saving} onConfirm={(notes: Record<string, string>) => void grade(notes)} /></div>
}

/** Comments, the record of changes, and the files attached to the goal. */
export function GoalActivityAndFiles({ goal, token }: { goal: Goal; token?: string }) {
  const { data: activity = [], mutate: refreshActivity } = useSWR(token ? goalActivityKey(goal.goal_uuid) : null, () => goalLogApi.activity(goal.goal_uuid, token))
  const { data: attachments = [], mutate: refreshAttachments } = useSWR(token ? goalAttachmentsKey(goal.goal_uuid) : null, () => goalLogApi.attachments(goal.goal_uuid, token))
  const [comment, setComment] = React.useState('')
  const post = async () => {
    if (!comment.trim()) return
    try { await goalLogApi.comment(goal.goal_uuid, comment.trim(), token); setComment(''); await refreshActivity(); toast.success('Comment added.') } catch (error: any) { toast.error(error?.message || 'Could not add the comment.') }
  }
  const remove = async (assetUuid: string) => {
    try { await goalLogApi.removeAttachment(goal.goal_uuid, assetUuid, token); await refreshAttachments() } catch (error: any) { toast.error(error?.message || 'Could not remove the file.') }
  }
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
    <SectionCard title="Activity">
      <p className="-mt-3 text-xs text-gray-500">Comments and a record of changes to this goal.</p>
      {goal.capabilities.includes('comment') ? <div className="mt-4 flex gap-2"><input value={comment} onChange={(event) => setComment(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void post() }} placeholder="Add a staff comment" aria-label="Add a staff comment" className="h-10 min-w-0 flex-1 rounded-lg border border-gray-200 px-3 text-sm" /><button type="button" aria-label="Post comment" disabled={!comment.trim()} onClick={() => void post()} className="rounded-lg bg-black px-4 text-white disabled:opacity-40"><MessageSquareText size={15} /></button></div> : null}
      <div className="mt-5 space-y-3">
        {activity.map((item) => <div key={item.activity_uuid} className="flex gap-3 border-b border-gray-100 pb-3"><PersonAvatar person={item.actor} size={36} /><div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><p className="truncate text-xs font-black">{item.actor?.name || 'System'}</p><span className="shrink-0 text-[10px] text-gray-400">{dateTime(item.creation_date)}</span></div><p className="mt-1 text-sm leading-5 text-gray-600">{item.action === 'comment.added' ? item.payload?.body : humanize(item.action)}</p></div></div>)}
        {!activity.length ? <div className="py-8 text-center"><History className="mx-auto text-gray-300" size={32} /><p className="mt-3 text-sm font-black text-gray-700">No activity yet</p></div> : null}
      </div>
    </SectionCard>
    <SectionCard title={<span className="flex items-center gap-2"><FolderOpen size={17} />Files</span>}>
      <div className="space-y-2">
        {attachments.map((item) => <div key={item.asset_uuid} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3"><Paperclip size={15} className="text-gray-400" /><a href={item.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-xs font-black text-blue-700">{item.title || item.filename || 'Attachment'}</a>{goal.capabilities.includes('edit_plan_details') ? <button type="button" aria-label={`Remove ${item.title || item.filename}`} onClick={() => void remove(item.asset_uuid)} className="text-red-600"><Trash2 size={13} /></button> : null}</div>)}
        {!attachments.length ? <p className="py-8 text-center text-xs text-gray-500">No files are attached to this goal.</p> : null}
      </div>
    </SectionCard>
  </div>
}

/** Name, description and target date, plus ownership. */
export function GoalSettings({ goal, token }: { goal: Goal; token?: string }) {
  const { busy, run } = useGoalMutation(goal.goal_uuid)
  const { mutate } = useSWRConfig()
  const [draft, setDraft] = React.useState({ title: goal.title, description: goal.description || '', target_date: goal.target_date || '' })
  React.useEffect(() => { setDraft({ title: goal.title, description: goal.description || '', target_date: goal.target_date || '' }) }, [goal.title, goal.description, goal.target_date])
  const canEdit = goal.capabilities.includes('edit_plan_details')
  const canSchedule = goal.capabilities.includes('edit_schedule')
  const { data: people } = useSWR(token && goal.capabilities.includes('transfer_ownership') ? peopleKey(goal.goal_uuid) : null, () => goalSharingApi.people(goal.goal_uuid, token))
  const save = () => run(() => goalsApi.update(goal.goal_uuid, { ...(canEdit ? { title: draft.title, description: draft.description } : {}), ...(canSchedule ? { target_date: draft.target_date || null } : {}) }, token), 'Goal saved.').catch(() => undefined)
  const transfer = async (userId: number) => {
    try { await goalSharingApi.transferOwnership(goal.goal_uuid, userId, token); await mutate((key) => isGoalsKey(key)); toast.success('Ownership transferred.') } catch (error: any) { toast.error(error?.message || 'Could not transfer ownership.') }
  }
  const input = 'mt-2 h-11 w-full rounded-lg border border-gray-200 px-3 text-sm disabled:bg-gray-50'
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.6fr)]">
    <SectionCard title="Goal details and schedule"><div className="space-y-4">
      <label className="block text-xs font-black">Goal name<input value={draft.title} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={input} /></label>
      <label className="block text-xs font-black">Description<textarea value={draft.description} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="mt-2 min-h-28 w-full rounded-lg border border-gray-200 p-3 text-sm disabled:bg-gray-50" /></label>
      <label className="block text-xs font-black sm:w-1/2">Target date<input type="date" value={draft.target_date} disabled={!canSchedule} onChange={(event) => setDraft({ ...draft, target_date: event.target.value })} className={input} /></label>
      {canEdit || canSchedule ? <button type="button" disabled={busy || !draft.title.trim()} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">{busy ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}Save changes</button> : null}
    </div></SectionCard>
    <aside className="space-y-5">
      <SectionCard title="Ownership">
        <div className="flex items-center gap-3"><PersonAvatar person={goal.owner} size={36} /><div><p className="text-sm font-black">{goal.owner?.name || 'Unassigned'}</p><p className="text-xs text-gray-500">Current goal owner</p></div></div>
        {people ? <select aria-label="Transfer ownership" defaultValue="" onChange={(event) => { if (event.target.value) void transfer(Number(event.target.value)) }} className="mt-4 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs font-bold"><option value="">Transfer ownership…</option>{people.collaborators.filter((item) => !item.is_owner && item.user).map((item) => <option key={item.user!.id} value={item.user!.id}>{item.user!.name}</option>)}</select> : null}
      </SectionCard>
      <SectionCard title="Archive"><p className="mb-4 text-xs leading-5 text-gray-500">Archiving takes this goal off the learner’s list without changing its template or other learners.</p><ArchiveGoalButton goal={goal} token={token} /></SectionCard>
    </aside>
  </div>
}

/** Archives a learner's goal, for staff who may. */
export function ArchiveGoalButton({ goal, token }: { goal: Goal; token?: string }) {
  const { mutate } = useSWRConfig()
  const [saving, setSaving] = React.useState(false)
  if (!goal.capabilities.includes('archive_plan') || goal.status === 'archived') return null
  const archive = async () => {
    if (!window.confirm('Archive this goal?')) return
    setSaving(true)
    try { await goalLogApi.archive(goal.goal_uuid, token); await mutate((key) => isGoalsKey(key)); toast.success('Goal archived.') } catch (error: any) { toast.error(error?.message || 'Could not archive the goal.') } finally { setSaving(false) }
  }
  return <button type="button" disabled={saving} onClick={() => void archive()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-xs font-black text-red-700 disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={14} /> : <Archive size={14} />}Archive goal</button>
}
