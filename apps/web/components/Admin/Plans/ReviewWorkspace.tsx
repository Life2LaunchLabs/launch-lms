'use client'

import React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import useSWR, { mutate as mutateGlobal } from 'swr'
import toast from 'react-hot-toast'
import DOMPurify from 'dompurify'
import { ArrowLeft, Award, CheckCircle2, ChevronLeft, ChevronRight, Download, ExternalLink, FileText, Loader2, Lock, Square, SquareCheckBig } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { ActivityAggregateGradeForm } from '@components/Admin/Programs/ActivityGrading'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { gradeLearningResponse } from '@services/learning/learning'
import { planInboxApi, programsApi } from '@services/programs/programs'
import { cn } from '@/lib/utils'
import { inboxKey } from './PlansInbox'
import { EmptyState, PageLoader, PersonAvatar, personName, StatusPill, timeAgo } from './shared'

type Decision = 'confirm' | 'flag'

export default function ReviewWorkspace({ orgslug }: { orgslug: string }) {
  const params = useSearchParams()
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const orgId = Number(org?.id)
  const assignment = params.get('assignment') || ''
  const activity = params.get('activity')
  const backHref = getUriWithOrg(orgslug, routePaths.org.dash.plans())
  if (!assignment) return <div className="p-10"><EmptyState title="Nothing to review" detail="Open a review from the Inbox." /></div>
  if (activity) return <ActivityGrading orgId={orgId} token={token} assignment={assignment} activity={activity} backHref={backHref} orgslug={orgslug} />
  return <SubmissionReview orgId={orgId} token={token} assignment={assignment} objective={params.get('objective')} step={params.get('step')} focus={params.get('focus')} backHref={backHref} orgslug={orgslug} />
}

function SubmissionReview({ orgId, token, assignment, objective, step, focus, backHref, orgslug }: { orgId: number; token?: string; assignment: string; objective: string | null; step: string | null; focus: string | null; backHref: string; orgslug: string }) {
  const key = orgId && token ? ['plans-review-queue', orgId, assignment, objective, step] : null
  // The queue is loaded once and kept stable while reviewing; decisions are tracked locally.
  const { data, isLoading, error, mutate } = useSWR(key, () => planInboxApi.queue(orgId, { assignment, objective, step }, token), { revalidateOnFocus: false, revalidateIfStale: false })
  const [current, setCurrent] = React.useState<string | null>(focus)
  const [decided, setDecided] = React.useState<Record<string, Decision>>({})
  const [feedback, setFeedback] = React.useState('')
  const [staffNote, setStaffNote] = React.useState('')
  const [notes, setNotes] = React.useState<Record<string, any[]>>({})
  const [checks, setChecks] = React.useState<Record<string, boolean>>({})
  const [saving, setSaving] = React.useState<'decide' | 'note' | null>(null)

  const items: any[] = React.useMemo(() => data?.items || [], [data])
  const index = Math.max(0, items.findIndex((item) => item.plan_objective_uuid === current))
  const item = items[index]
  React.useEffect(() => { setFeedback(''); setStaffNote(''); setChecks({}) }, [item?.plan_objective_uuid])

  if (isLoading) return <PageLoader />
  if (error || !data) return <div className="p-10"><EmptyState title="This review is unavailable" detail={error?.message || 'You may not be on this plan’s review team.'} /></div>

  const confirmOnly = data.objective.confirm_only
  const done = Object.keys(decided).length
  const nextOpen = (from: number) => items.slice(from + 1).find((entry) => !decided[entry.plan_objective_uuid]) || items.find((entry) => !decided[entry.plan_objective_uuid])
  const go = (offset: number) => { const target = items[index + offset]; if (target) setCurrent(target.plan_objective_uuid) }
  const guidance = String(data.objective.reviewer_guidance || '').split('\n').map((line: string) => line.replace(/^[-*•]\s*/, '').trim()).filter(Boolean)

  const decide = async (action: Decision) => {
    if (!item || saving) return
    if (action === 'flag' && !feedback.trim()) { toast.error('Tell them what to change.'); return }
    setSaving('decide')
    try {
      await planInboxApi.decide(orgId, item.plan_objective_uuid, action, feedback, token)
      const nextDecided: Record<string, Decision> = { ...decided, [item.plan_objective_uuid]: action }
      setDecided(nextDecided)
      const next = items.slice(index + 1).find((entry) => !nextDecided[entry.plan_objective_uuid]) || items.find((entry) => !nextDecided[entry.plan_objective_uuid])
      if (next) setCurrent(next.plan_objective_uuid)
      void mutateGlobal(inboxKey(orgId))
      toast.success(action === 'confirm' ? `${personName(item.user)} approved.` : `Sent back to ${personName(item.user)}.`)
    } catch (decisionError: any) {
      toast.error(decisionError?.message || 'Could not save this review.')
      if (String(decisionError?.message || '').includes('no longer waiting')) void mutate()
    } finally { setSaving(null) }
  }
  const saveNote = async () => {
    if (!item || !staffNote.trim()) return
    setSaving('note')
    try {
      const result = await planInboxApi.addStaffNote(orgId, item.plan_objective_uuid, staffNote, token)
      setNotes({ ...notes, [item.plan_objective_uuid]: result.staff_notes })
      setStaffNote('')
    } catch (noteError: any) { toast.error(noteError?.message || 'Could not save the note.') } finally { setSaving(null) }
  }

  const header = <div className="flex min-h-14 flex-wrap items-center gap-3 border-b border-gray-100 bg-white px-6 py-2 nice-shadow">
    <Link href={backHref} className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-black"><ArrowLeft size={14} />Inbox</Link>
    <span className="h-5 w-px bg-gray-200" />
    <span className="min-w-0"><span className="block truncate text-sm font-black text-gray-950">{data.objective.title}</span><span className="block truncate text-xs text-gray-500">{[data.template?.name, data.objective.phase_name, data.group?.name].filter(Boolean).join(' · ')}</span></span>
    <span className="flex-1" />
    {items.length ? <>
      <span className="text-xs text-gray-600">{index + 1} of {items.length}</span>
      <button type="button" aria-label="Previous submission" onClick={() => go(-1)} disabled={index === 0} className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white disabled:opacity-40"><ChevronLeft size={15} /></button>
      <button type="button" aria-label="Next submission" onClick={() => go(1)} disabled={index >= items.length - 1} className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white disabled:opacity-40"><ChevronRight size={15} /></button>
    </> : null}
  </div>

  if (!items.length || !item) return <div className="min-h-full w-full bg-[#f8f8f8]">{header}<div className="p-10"><EmptyState icon={<CheckCircle2 size={36} className="text-green-500" />} title="All caught up" detail="Nothing in this step is waiting on review." /></div></div>
  const allDone = done === items.length
  const staffNotes = notes[item.plan_objective_uuid] || item.staff_notes || []
  const recordHref = item.user?.username ? getUriWithOrg(orgslug, routePaths.org.dash.users.userPage(item.user.username, 'overview')) : null

  return <div className="flex h-full min-h-screen w-full flex-col bg-[#f8f8f8]">
    {header}
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <nav aria-label="Submissions" className="shrink-0 border-b border-gray-100 bg-white p-2 lg:w-56 lg:border-b-0 lg:border-r">
        <p className="px-2.5 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{done} of {items.length} done</p>
        <div className="flex gap-1 overflow-x-auto lg:flex-col">
          {items.map((entry) => {
            const state = decided[entry.plan_objective_uuid]
            return <button key={entry.plan_objective_uuid} type="button" onClick={() => setCurrent(entry.plan_objective_uuid)} className={cn('flex min-h-9 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px]', entry.plan_objective_uuid === item.plan_objective_uuid ? 'bg-gray-100 font-bold' : 'font-medium hover:bg-gray-50')}>
              <span className={cn('h-2 w-2 shrink-0 rounded-full', state === 'confirm' ? 'bg-green-600' : state === 'flag' ? 'bg-amber-500' : 'bg-gray-300')} />
              <span className="min-w-0 flex-1 truncate">{personName(entry.user)}</span>
              {state ? <span className="text-[10px] text-gray-500">{state === 'confirm' ? 'Approved' : 'Changes'}</span> : null}
            </button>
          })}
        </div>
      </nav>

      <section aria-label="Submission" className="min-h-[420px] min-w-0 flex-1 bg-gray-100">
        <Evidence key={item.plan_objective_uuid} item={item} confirmOnly={confirmOnly} />
      </section>

      <aside aria-label="Review" className="flex shrink-0 flex-col border-t border-gray-100 bg-white lg:w-[340px] lg:border-l lg:border-t-0">
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="flex items-center gap-3">
            <PersonAvatar person={item.user} size={36} />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-gray-950">{personName(item.user)}</p><p className="text-xs text-gray-500">Attempt {item.attempt} · submitted {timeAgo(item.submitted_at)}</p></div>
            {recordHref ? <Link href={recordHref} className="text-xs font-bold text-gray-900 hover:text-blue-700">Record</Link> : null}
          </div>
          {decided[item.plan_objective_uuid] ? <StatusPill tone={decided[item.plan_objective_uuid] === 'confirm' ? 'green' : 'amber'}>{decided[item.plan_objective_uuid] === 'confirm' ? 'Approved' : 'Sent back'}</StatusPill> : null}
          {item.learner_note ? <Block title="From the learner"><p className="whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2.5 text-sm leading-6 text-gray-800">{item.learner_note}</p></Block> : null}
          {guidance.length ? <Block title="What to look for">
            <ul className="space-y-1.5">{guidance.map((line, lineIndex) => <li key={lineIndex}><button type="button" onClick={() => setChecks({ ...checks, [lineIndex]: !checks[lineIndex] })} className="flex w-full items-start gap-2.5 text-left text-sm text-gray-800">{checks[lineIndex] ? <SquareCheckBig size={16} className="mt-0.5 shrink-0 text-green-700" /> : <Square size={16} className="mt-0.5 shrink-0 text-gray-400" />}<span>{line}</span></button></li>)}</ul>
          </Block> : null}
          {data.objective.requirements?.length ? <div className="flex flex-wrap gap-1.5">{data.objective.requirements.map((node: any) => <span key={node.node_uuid} title={node.framework_name} className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-700">{[node.code, node.title].filter(Boolean).join(' ')}</span>)}</div> : null}
          {item.feedback_history?.length ? <Block title="Earlier feedback"><div className="space-y-1.5">{item.feedback_history.map((entry: any, entryIndex: number) => <p key={entryIndex} className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">{entry.message}</p>)}</div></Block> : null}
          <label className="block text-xs font-bold text-gray-700">Feedback to {personName(item.user).split(' ')[0]}{confirmOnly ? <span className="font-normal text-gray-500"> (optional)</span> : null}
            <textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} rows={3} className="mt-1.5 w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal outline-none focus:border-gray-400" placeholder="Needed if you send it back" />
          </label>
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-amber-900"><Lock size={12} />Staff notes · learners never see these</p>
            {staffNotes.map((note: any) => <p key={note.note_uuid} className="text-xs leading-5 text-gray-900"><strong>{personName(note.author)}:</strong> {note.message}</p>)}
            <div className="flex gap-1.5">
              <label className="sr-only" htmlFor="staff-note">Add a staff note</label>
              <input id="staff-note" value={staffNote} onChange={(event) => setStaffNote(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void saveNote() }} placeholder="Add a staff note" className="h-8 min-w-0 flex-1 rounded-md border border-amber-200 bg-white px-2 text-xs" />
              <button type="button" onClick={() => void saveNote()} disabled={!staffNote.trim() || saving === 'note'} className="h-8 rounded-md bg-amber-900 px-2.5 text-xs font-bold text-white disabled:opacity-40">{saving === 'note' ? <Loader2 size={12} className="animate-spin" /> : 'Add'}</button>
            </div>
          </div>
        </div>
        <div className="flex gap-2 border-t border-gray-100 p-4">
          {allDone ? <Link href={backHref} className="inline-flex h-10 flex-1 items-center justify-center rounded-full bg-black text-sm font-semibold text-white">All done · back to Inbox</Link> : <>
            <button type="button" onClick={() => void decide('flag')} disabled={Boolean(saving) || Boolean(decided[item.plan_objective_uuid])} className="h-10 flex-1 rounded-full border border-gray-200 bg-white text-sm font-semibold disabled:opacity-40">Request changes</button>
            <button type="button" onClick={() => void decide('confirm')} disabled={Boolean(saving) || Boolean(decided[item.plan_objective_uuid])} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-black text-sm font-semibold text-white disabled:opacity-40">{saving === 'decide' ? <Loader2 size={14} className="animate-spin" /> : null}{confirmOnly ? 'Confirm' : 'Approve'} &amp; next</button>
          </>}
        </div>
        {!allDone && decided[item.plan_objective_uuid] && nextOpen(index) ? <button type="button" onClick={() => setCurrent(nextOpen(index)!.plan_objective_uuid)} className="mx-4 mb-4 text-xs font-bold text-gray-700">Go to the next one waiting</button> : null}
      </aside>
    </div>
  </div>
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{title}</p>{children}</div>
}

function isPdf(asset: any) {
  return String(asset?.mime_type || '').includes('pdf') || /\.pdf($|\?)/i.test(String(asset?.url || asset?.filename || ''))
}
function isImage(asset: any) {
  return String(asset?.mime_type || asset?.media_type || '').startsWith('image') || /\.(png|jpe?g|gif|webp|avif)($|\?)/i.test(String(asset?.url || ''))
}
function isVideo(asset: any) {
  return String(asset?.mime_type || asset?.media_type || '').startsWith('video') || /\.(mp4|webm|mov)($|\?)/i.test(String(asset?.url || ''))
}

/** Shows what the learner handed in, one step at a time. */
function Evidence({ item, confirmOnly }: { item: any; confirmOnly: boolean }) {
  const fields: any[] = (item.fields || []).filter((field: any) => !field.restricted || item.field_values?.[field.field_uuid] !== undefined)
  const [active, setActive] = React.useState(0)
  const [assetIndex, setAssetIndex] = React.useState(0)
  if (confirmOnly || !fields.length) return <div className="flex h-full items-center justify-center p-8"><div className="max-w-sm rounded-xl bg-white p-6 text-center"><CheckCircle2 className="mx-auto text-gray-300" size={32} /><p className="mt-3 text-sm font-black text-gray-900">Nothing to hand in</p><p className="mt-1 text-xs leading-5 text-gray-500">{personName(item.user)} marked this done. Confirm it if they did it.</p></div></div>
  const field = fields[Math.min(active, fields.length - 1)]
  const value = item.field_values?.[field.field_uuid]
  const assets: any[] = field.type === 'media' ? (Array.isArray(value) ? value : value ? [value] : []) : []
  const asset = assets[Math.min(assetIndex, Math.max(0, assets.length - 1))]
  return <div className="flex h-full min-h-[480px] flex-col">
    <div className="flex min-h-11 flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-3 py-1.5 text-xs">
      {fields.length > 1 ? fields.map((entry, fieldIndex) => <button key={entry.field_uuid} type="button" onClick={() => { setActive(fieldIndex); setAssetIndex(0) }} className={cn('rounded-md px-2.5 py-1.5 font-semibold', fieldIndex === active ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100')}>{entry.title}</button>) : <span className="px-1 font-bold text-gray-900">{field.title}</span>}
      <span className="flex-1" />
      {assets.length > 1 ? assets.map((entry, entryIndex) => <button key={entry.asset_uuid || entry.url || entryIndex} type="button" onClick={() => setAssetIndex(entryIndex)} className={cn('max-w-40 truncate rounded-md px-2 py-1', entryIndex === assetIndex ? 'bg-gray-100 font-bold' : 'text-gray-600')}>{entry.title || entry.filename || `File ${entryIndex + 1}`}</button>) : null}
      {asset?.url ? <a href={asset.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-gray-900 hover:text-blue-700"><Download size={13} />Open</a> : null}
    </div>
    <div className="min-h-0 flex-1 overflow-auto p-4">
      {field.type === 'media' ? !asset ? <Missing /> : isPdf(asset) ? <iframe title={asset.title || asset.filename || 'Submitted document'} src={asset.url} className="h-full min-h-[560px] w-full rounded-md bg-white shadow" /> : isImage(asset) ? <img src={asset.url} alt={asset.title || 'Submitted image'} className="mx-auto max-h-[75vh] rounded-md bg-white object-contain shadow" /> : isVideo(asset) ? <video src={asset.url} controls className="mx-auto max-h-[75vh] w-full rounded-md bg-black" /> : <div className="mx-auto max-w-md rounded-xl bg-white p-6 text-center"><FileText className="mx-auto text-gray-400" size={30} /><p className="mt-2 text-sm font-bold">{asset.title || asset.filename || 'Submitted file'}</p><a href={asset.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-700"><Download size={13} />Download</a></div>
        : field.type === 'text' ? value ? <article className="mx-auto max-w-2xl rounded-xl bg-white p-7 text-[15px] leading-7 text-gray-900">{String(value).includes('<') ? <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(String(value)) }} /> : <p className="whitespace-pre-wrap">{String(value)}</p>}</article> : <Missing />
        : field.type === 'link' ? (Array.isArray(value) ? value : value ? [value] : []).length ? <ul className="mx-auto max-w-2xl space-y-2">{(Array.isArray(value) ? value : [value]).map((link: any, linkIndex: number) => { const url = typeof link === 'string' ? link : link?.url; return <li key={linkIndex}><a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl bg-white p-4 text-sm font-bold text-blue-700"><ExternalLink size={14} /><span className="truncate">{url}</span></a></li> })}</ul> : <Missing />
        : field.type === 'checkbox' ? <div className="mx-auto max-w-md rounded-xl bg-white p-6 text-center text-sm font-bold">{value ? 'Checked' : 'Not checked yet'}</div>
        : field.type === 'badge' ? <div className="mx-auto max-w-md rounded-xl bg-white p-6 text-center"><Award className="mx-auto text-gray-400" size={30} /><p className="mt-2 text-sm font-bold">{field.title}</p><p className="mt-1 text-xs text-gray-500">{Number(value?.progress_percent || 0) >= 100 ? 'Badge earned' : `${Number(value?.progress_percent || 0)}% through the badge`}</p></div>
        : <pre className="whitespace-pre-wrap rounded-xl bg-white p-4 text-xs">{JSON.stringify(value, null, 2)}</pre>}
    </div>
  </div>
}

function Missing() {
  return <div className="mx-auto max-w-md rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-xs text-gray-500">Nothing handed in for this step.</div>
}

function ActivityGrading({ orgId, token, assignment, activity, backHref, orgslug }: { orgId: number; token?: string; assignment: string; activity: string; backHref: string; orgslug: string }) {
  const key = orgId && token ? ['plans-activity-reviews', orgId, assignment] : null
  const { data, isLoading, mutate } = useSWR(key, () => programsApi.reviews(orgId, assignment, token), { revalidateOnFocus: false })
  const reviews: any[] = (data?.activity_reviews || []).filter((item: any) => item.activity?.activity_uuid === activity)
  const [current, setCurrent] = React.useState<string | null>(null)
  const [scores, setScores] = React.useState<Record<string, string>>({})
  const [feedback, setFeedback] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const review = reviews.find((item) => item.review_id === current) || reviews[0]
  React.useEffect(() => {
    if (!review) return
    const pending: Record<string, string> = {}
    ;(review.attempts || []).forEach((attempt: any) => Object.entries(attempt.result?.questions || {}).forEach(([id, result]: any) => { if (result?.grading_status === 'pending') pending[`${attempt.attempt_uuid}:${id}`] = '' }))
    setScores(pending); setFeedback('')
  }, [review?.review_id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (isLoading) return <PageLoader />
  const grade = async (questionFeedback: Record<string, string>) => {
    if (!review || saving) return
    if (Object.values(scores).some((value) => value === '')) { toast.error('Enter every manual score.'); return }
    setSaving(true)
    try {
      await Promise.all((review.attempts || []).filter((attempt: any) => attempt.result?.grading_status === 'pending').map((attempt: any) => {
        const questionScores = Object.fromEntries(Object.entries(scores).filter(([scoreKey]) => scoreKey.startsWith(`${attempt.attempt_uuid}:`)).map(([scoreKey, value]) => [scoreKey.slice(attempt.attempt_uuid.length + 1), Number(value)]))
        const total = Object.entries(attempt.result?.questions || {}).reduce((sum: number, [id, result]: any) => sum + (result.grading_status === 'pending' ? Number(questionScores[id] || 0) : Number(result.score || 0)), 0)
        const notes = Object.fromEntries(Object.entries(questionFeedback).filter(([noteKey, value]) => noteKey.startsWith(`${attempt.attempt_uuid}:`) && value.trim()).map(([noteKey, value]) => [noteKey.slice(attempt.attempt_uuid.length + 1), value.trim()]))
        return gradeLearningResponse(attempt.attempt_uuid, { score: total, question_scores: questionScores, question_feedback: notes, feedback }, token)
      }))
      const remaining = reviews.filter((item) => item.review_id !== review.review_id)
      setCurrent(remaining[0]?.review_id || null)
      await mutate()
      void mutateGlobal(inboxKey(orgId))
      toast.success(`${personName(review.user)} graded.`)
    } catch (gradeError: any) { toast.error(gradeError?.message || 'Could not save these grades.') } finally { setSaving(false) }
  }
  return <div className="min-h-screen w-full bg-[#f8f8f8]">
    <div className="flex min-h-14 flex-wrap items-center gap-3 border-b border-gray-100 bg-white px-6 py-2 nice-shadow">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-black"><ArrowLeft size={14} />Inbox</Link>
      <span className="h-5 w-px bg-gray-200" />
      <span className="text-sm font-black text-gray-950">{review?.activity?.title || 'Badge activity'}</span>
      <span className="text-xs text-gray-500">{review?.badge?.name}</span>
      <span className="flex-1" />
      <span className="text-xs text-gray-600">{reviews.length} waiting</span>
    </div>
    {!review ? <div className="p-10"><EmptyState icon={<CheckCircle2 size={36} className="text-green-500" />} title="All graded" /></div> : <div className="flex flex-col lg:flex-row">
      <nav aria-label="Learners" className="shrink-0 border-b border-gray-100 bg-white p-2 lg:min-h-[calc(100vh-56px)] lg:w-56 lg:border-b-0 lg:border-r">
        {reviews.map((item) => <button key={item.review_id} type="button" onClick={() => setCurrent(item.review_id)} className={cn('flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px]', item.review_id === review.review_id ? 'bg-gray-100 font-bold' : 'font-medium hover:bg-gray-50')}><span className="h-2 w-2 rounded-full bg-gray-300" />{personName(item.user)}</button>)}
      </nav>
      <section className="min-w-0 flex-1 p-6">
        <div className="mb-4 flex items-center gap-3"><PersonAvatar person={review.user} size={32} /><p className="text-sm font-black">{personName(review.user)}</p>{review.user?.username ? <Link href={getUriWithOrg(orgslug, routePaths.org.dash.users.userPage(review.user.username, 'overview'))} className="text-xs font-bold text-gray-700">Record</Link> : null}</div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 nice-shadow"><ActivityAggregateGradeForm review={review} scores={scores} setScores={setScores} feedback={feedback} setFeedback={setFeedback} saving={saving} onConfirm={(notes: Record<string, string>) => void grade(notes)} /></div>
      </section>
    </div>}
  </div>
}
