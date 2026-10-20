'use client'

import React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import useSWR, { mutate as mutateGlobal } from 'swr'
import toast from 'react-hot-toast'
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Square, SquareCheckBig } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { assignmentReviewsKey, goalAdminApi, inboxKey, type ActivityReview, type StaffNoteView } from '@services/goals/admin'
import { cn } from '@/lib/utils'
import { ActivityAggregateGradeForm } from '@components/Admin/Programs/ActivityGrading'
import ReviewEvidence from './ReviewEvidence'
import { EmptyState, gradeActivityReview, PageLoader, PersonAvatar, pendingScores, personName, StatusPill, timeAgo } from './ui'

type Decision = 'confirm' | 'flag'

/** Where the stack goes back to: the assignment it was opened from, or the Inbox. */
type Back = { href: string; label: string }

/**
 * The grading stack: works one review queue (one step of one assignment, oldest first) or one
 * activity's answers, moving to the next learner after each decision. Opened from an
 * assignment (?from=assignment), it goes back there.
 */
export default function ReviewWorkspace({ orgslug }: { orgslug: string }) {
  const params = useSearchParams()
  const org = useOrg() as any
  const session = useLHSession() as any
  const token: string | undefined = session?.data?.tokens?.access_token
  const orgId = Number(org?.id)
  const assignment = params.get('assignment') || ''
  const activity = params.get('activity')
  const back: Back = params.get('from') === 'assignment' && assignment
    ? { href: getUriWithOrg(orgslug, routePaths.org.dash.planAssignment(assignment)), label: 'Assignment' }
    : { href: getUriWithOrg(orgslug, routePaths.org.dash.plans()), label: 'Inbox' }
  if (!assignment) return <div className="p-10"><EmptyState title="Nothing to review" detail="Open a review from the Inbox." /></div>
  if (activity) return <ActivityGrading orgId={orgId} token={token} assignment={assignment} activity={activity} back={back} orgslug={orgslug} />
  return <StepQueue orgId={orgId} token={token} assignment={assignment} stepKey={params.get('step_key')} stepUuid={params.get('step')} focus={params.get('focus')} back={back} orgslug={orgslug} />
}

function Header({ back, title, detail, children }: { back: Back; title: string; detail?: string; children?: React.ReactNode }) {
  return <div className="flex min-h-14 flex-wrap items-center gap-3 border-b border-gray-100 bg-white px-6 py-2 nice-shadow">
    <Link href={back.href} className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-black"><ArrowLeft size={14} />{back.label}</Link>
    <span className="h-5 w-px bg-gray-200" />
    <span className="min-w-0"><span className="block truncate text-sm font-black text-gray-950">{title}</span>{detail ? <span className="block truncate text-xs text-gray-500">{detail}</span> : null}</span>
    <span className="flex-1" />
    {children}
  </div>
}

function StepQueue({ orgId, token, assignment, stepKey, stepUuid, focus, back, orgslug }: { orgId: number; token?: string; assignment: string; stepKey: string | null; stepUuid: string | null; focus: string | null; back: Back; orgslug: string }) {
  // The queue loads once and stays put while reviewing; decisions are tracked here.
  const { data, isLoading, error, mutate } = useSWR(orgId && token ? ['goal-review-queue', orgId, assignment, stepKey, stepUuid] : null, () => goalAdminApi.queue(orgId, { assignment, stepKey, stepUuid }, token), { revalidateOnFocus: false, revalidateIfStale: false })
  const [current, setCurrent] = React.useState<string | null>(focus)
  const [decided, setDecided] = React.useState<Record<string, Decision>>({})
  const [feedback, setFeedback] = React.useState('')
  const [staffNote, setStaffNote] = React.useState('')
  const [notes, setNotes] = React.useState<Record<string, StaffNoteView[]>>({})
  const [checks, setChecks] = React.useState<Record<number, boolean>>({})
  const [saving, setSaving] = React.useState<'decide' | 'note' | null>(null)
  const items = React.useMemo(() => data?.items || [], [data])
  const index = Math.max(0, items.findIndex((item) => item.step_uuid === current))
  const item = items[index]
  React.useEffect(() => { setFeedback(''); setStaffNote(''); setChecks({}) }, [item?.step_uuid])

  if (isLoading) return <PageLoader />
  if (error || !data) return <div className="p-10"><EmptyState title="This review is unavailable" detail={error?.message || 'You may not be on this goal’s review team.'} /></div>

  const confirmOnly = data.step.confirm_only
  const done = Object.keys(decided).length
  const nextOpen = (from: number, map = decided) => items.slice(from + 1).find((entry) => !map[entry.step_uuid]) || items.find((entry) => !map[entry.step_uuid])
  const go = (offset: number) => { const target = items[index + offset]; if (target) setCurrent(target.step_uuid) }
  const guidance = String(data.step.reviewer_guidance || '').split('\n').map((line) => line.replace(/^[-*•]\s*/, '').trim()).filter(Boolean)

  const decide = async (action: Decision) => {
    if (!item || saving) return
    if (action === 'flag' && !feedback.trim()) { toast.error('Tell them what to change.'); return }
    setSaving('decide')
    try {
      await goalAdminApi.decide(orgId, item.step_uuid, action, feedback, token)
      const next = { ...decided, [item.step_uuid]: action }
      setDecided(next)
      const following = nextOpen(index, next)
      if (following) setCurrent(following.step_uuid)
      void mutateGlobal(inboxKey(orgId))
      toast.success(action === 'confirm' ? `${personName(item.user)} ${confirmOnly ? 'confirmed' : 'approved'}.` : `Sent back to ${personName(item.user)}.`)
    } catch (decisionError: any) {
      toast.error(decisionError?.message || 'Could not save this review.')
      if (String(decisionError?.message || '').includes('no longer waiting')) void mutate()
    } finally { setSaving(null) }
  }
  const saveNote = async () => {
    if (!item || !staffNote.trim()) return
    setSaving('note')
    try {
      const result = await goalAdminApi.addStaffNote(orgId, item.step_uuid, staffNote, token)
      setNotes({ ...notes, [item.step_uuid]: result.staff_notes })
      setStaffNote('')
    } catch (noteError: any) { toast.error(noteError?.message || 'Could not save the note.') } finally { setSaving(null) }
  }

  const header = <Header back={back} title={data.step.title} detail={[data.template?.title, data.step.stage_title, data.group?.name].filter(Boolean).join(' · ')}>
    {items.length ? <>
      <span className="text-xs text-gray-600">{index + 1} of {items.length}</span>
      <button type="button" aria-label="Previous" onClick={() => go(-1)} disabled={index === 0} className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white disabled:opacity-40"><ChevronLeft size={15} /></button>
      <button type="button" aria-label="Next" onClick={() => go(1)} disabled={index >= items.length - 1} className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white disabled:opacity-40"><ChevronRight size={15} /></button>
    </> : null}
  </Header>
  if (!items.length || !item) return <div className="min-h-full w-full bg-[#f8f8f8]">{header}<div className="p-10"><EmptyState icon={<CheckCircle2 size={36} className="text-green-500" />} title="All caught up" detail="Nothing on this step is waiting on you." /></div></div>
  const allDone = done === items.length
  const staffNotes = notes[item.step_uuid] || item.staff_notes || []
  const state = decided[item.step_uuid]

  return <div className="flex h-full min-h-screen w-full flex-col bg-[#f8f8f8]">
    {header}
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <nav aria-label="Learners" className="shrink-0 border-b border-gray-100 bg-white p-2 lg:w-56 lg:border-b-0 lg:border-r">
        <p className="px-2.5 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{done} of {items.length} done</p>
        <div className="flex gap-1 overflow-x-auto lg:flex-col">{items.map((entry) => {
          const mark = decided[entry.step_uuid]
          return <button key={entry.step_uuid} type="button" onClick={() => setCurrent(entry.step_uuid)} className={cn('flex min-h-9 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px]', entry.step_uuid === item.step_uuid ? 'bg-gray-100 font-bold' : 'font-medium hover:bg-gray-50')}>
            <span className={cn('h-2 w-2 shrink-0 rounded-full', mark === 'confirm' ? 'bg-green-600' : mark === 'flag' ? 'bg-amber-500' : 'bg-gray-300')} />
            <span className="min-w-0 flex-1 truncate">{personName(entry.user)}</span>
            {mark ? <span className="text-[10px] text-gray-500">{mark === 'confirm' ? 'Approved' : 'Sent back'}</span> : null}
          </button>
        })}</div>
      </nav>
      <section aria-label="Hand-in" className="min-h-[420px] min-w-0 flex-1 bg-gray-100"><ReviewEvidence key={item.step_uuid} item={item} confirmOnly={confirmOnly} /></section>
      <aside aria-label="Review" className="flex shrink-0 flex-col border-t border-gray-100 bg-white lg:w-[340px] lg:border-l lg:border-t-0">
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="flex items-center gap-3">
            <PersonAvatar person={item.user} size={36} />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-gray-950">{personName(item.user)}</p><p className="text-xs text-gray-500">Attempt {item.attempt} · {timeAgo(item.submitted_at)}</p></div>
            <Link href={getUriWithOrg(orgslug, routePaths.org.dash.livePlan(item.goal_uuid))} className="-mr-2 inline-flex min-h-10 min-w-10 items-center justify-center px-2 text-xs font-bold text-gray-900 hover:text-blue-700 md:mr-0 md:min-h-0 md:min-w-0 md:px-0">Plan</Link>
          </div>
          {state ? <StatusPill tone={state === 'confirm' ? 'green' : 'amber'}>{state === 'confirm' ? 'Approved' : 'Sent back'}</StatusPill> : null}
          {item.learner_note ? <Block title="From the learner"><p className="whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2.5 text-sm leading-6 text-gray-800">{item.learner_note}</p></Block> : null}
          {guidance.length ? <Block title="What to look for"><ul className="space-y-1.5">{guidance.map((line, lineIndex) => <li key={lineIndex}><button type="button" onClick={() => setChecks({ ...checks, [lineIndex]: !checks[lineIndex] })} className="flex w-full items-start gap-2.5 text-left text-sm text-gray-800">{checks[lineIndex] ? <SquareCheckBig size={16} className="mt-0.5 shrink-0 text-green-700" /> : <Square size={16} className="mt-0.5 shrink-0 text-gray-400" />}<span>{line}</span></button></li>)}</ul></Block> : null}
          {data.step.requirements.length ? <div className="flex flex-wrap gap-1.5">{data.step.requirements.map((node) => <span key={node.node_uuid} title={node.framework_name} className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-700">{[node.code, node.title].filter(Boolean).join(' ')}</span>)}</div> : null}
          {item.feedback_history.length ? <Block title="Earlier feedback"><div className="space-y-1.5">{item.feedback_history.map((entry, entryIndex) => <p key={entryIndex} className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">{entry.message}</p>)}</div></Block> : null}
          <label className="block text-xs font-bold text-gray-700">Note to {personName(item.user).split(' ')[0]} · posts to their feed{confirmOnly ? <span className="font-normal text-gray-500"> (optional)</span> : null}
            <textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} rows={3} className="mt-1.5 w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal outline-none focus:border-gray-400" placeholder={confirmOnly ? 'Optional' : 'Needed if you send it back'} />
          </label>
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-bold text-amber-900">Staff notes · learners never see these</p>
            {staffNotes.map((note, noteIndex) => <p key={note.note_uuid || noteIndex} className="text-xs leading-5 text-gray-900"><strong>{note.author ? personName(note.author) : 'Staff'}:</strong> {note.message}</p>)}
            <div className="flex gap-1.5">
              <label className="sr-only" htmlFor="staff-note">Add a staff note</label>
              <input id="staff-note" value={staffNote} onChange={(event) => setStaffNote(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void saveNote() }} placeholder="Add a staff note" className="h-8 min-w-0 flex-1 rounded-md border border-amber-200 bg-white px-2 text-xs" />
              <button type="button" onClick={() => void saveNote()} disabled={!staffNote.trim() || saving === 'note'} className="h-8 rounded-md bg-amber-900 px-2.5 text-xs font-bold text-white disabled:opacity-40">{saving === 'note' ? <Loader2 size={12} className="animate-spin" /> : 'Add'}</button>
            </div>
          </div>
        </div>
        <div className="flex gap-2 border-t border-gray-100 p-4">
          {allDone ? <Link href={back.href} className="inline-flex h-10 flex-1 items-center justify-center rounded-full bg-black text-sm font-semibold text-white">All done · back to {back.label === 'Inbox' ? 'Inbox' : 'the assignment'}</Link> : <>
            {!confirmOnly ? <button type="button" onClick={() => void decide('flag')} disabled={Boolean(saving) || Boolean(state)} className="h-10 flex-1 rounded-full border border-gray-200 bg-white text-sm font-semibold disabled:opacity-40">Send back</button> : null}
            <button type="button" onClick={() => void decide('confirm')} disabled={Boolean(saving) || Boolean(state)} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-black text-sm font-semibold text-white disabled:opacity-40">{saving === 'decide' ? <Loader2 size={14} className="animate-spin" /> : null}{confirmOnly ? 'Confirm' : 'Approve'} &amp; next</button>
          </>}
        </div>
      </aside>
    </div>
  </div>
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{title}</p>{children}</div>
}

/** Batch grading: every learner in the assignment with answers to this activity waiting on a grade. */
function ActivityGrading({ orgId, token, assignment, activity, back, orgslug }: { orgId: number; token?: string; assignment: string; activity: string; back: Back; orgslug: string }) {
  const { data, isLoading, mutate } = useSWR(orgId && token ? assignmentReviewsKey(assignment, orgId) : null, () => goalAdminApi.assignmentReviews(orgId, assignment, token), { revalidateOnFocus: false })
  const reviews = (data?.activity_reviews || []).filter((item) => item.activity?.activity_uuid === activity)
  const [current, setCurrent] = React.useState<string | null>(null)
  const review = reviews.find((item) => item.review_id === current) || reviews[0]
  if (isLoading) return <PageLoader />
  const done = async () => {
    setCurrent(reviews.find((item) => item.review_id !== review?.review_id)?.review_id || null)
    await mutate()
    void mutateGlobal(inboxKey(orgId))
  }
  return <div className="min-h-screen w-full bg-[#f8f8f8]">
    <Header back={back} title={review?.activity?.title || 'Activity'} detail={review?.badge?.name}><span className="text-xs text-gray-600">{reviews.length} waiting</span></Header>
    {!review ? <div className="p-10"><EmptyState icon={<CheckCircle2 size={36} className="text-green-500" />} title="All graded" detail={<Link href={back.href} className="font-bold text-blue-700">Back to {back.label === 'Inbox' ? 'the Inbox' : 'the assignment'}</Link>} /></div> : <div className="flex flex-col lg:flex-row">
      <nav aria-label="Learners" className="shrink-0 border-b border-gray-100 bg-white p-2 lg:min-h-[calc(100vh-56px)] lg:w-56 lg:border-b-0 lg:border-r">
        {reviews.map((item) => <button key={item.review_id} type="button" onClick={() => setCurrent(item.review_id)} className={cn('flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px]', item.review_id === review.review_id ? 'bg-gray-100 font-bold' : 'font-medium hover:bg-gray-50')}><span className="h-2 w-2 rounded-full bg-gray-300" />{personName(item.user)}</button>)}
      </nav>
      <section className="min-w-0 flex-1 p-6">
        <div className="mb-4 flex items-center gap-3"><PersonAvatar person={review.user} size={32} /><p className="text-sm font-black">{personName(review.user)}</p><Link href={getUriWithOrg(orgslug, routePaths.org.dash.livePlan(review.goal_uuid))} className="inline-flex min-h-10 min-w-10 items-center justify-center text-xs font-bold text-gray-700 md:min-h-0 md:min-w-0">Plan</Link></div>
        <div className="rounded-xl border border-gray-100 bg-white nice-shadow"><GradeActivity key={review.review_id} review={review} token={token} onDone={done} /></div>
      </section>
    </div>}
  </div>
}

/** One learner's activity answers, graded in place; the overall feedback posts to their feed. */
function GradeActivity({ review, token, onDone }: { review: ActivityReview; token?: string; onDone: () => Promise<void> }) {
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
