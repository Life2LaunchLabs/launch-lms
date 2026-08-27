'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React from 'react'
import toast from 'react-hot-toast'
import { Award, Check, CheckCircle2, ChevronDown, ChevronRight, Clock3, Circle, MessageSquareText, RotateCcw, Search, Trophy, X } from 'lucide-react'
import { SafeImage } from '@components/Objects/SafeImage'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { findQuestionBlocks } from '@components/Learning/schema'
import { getUriWithOrg } from '@services/config/config'
import { deleteIssuerLearnerLink, requestIssuerLearnerSupport } from '@services/learning/marketplace'

export default function LearningBadgeOverview({ orgslug, badgePath, programAssignmentUuid }: { orgslug: string; badgePath: any; programAssignmentUuid?: string }) {
  const router = useRouter()
  const session = useLHSession() as any
  const badge = badgePath?.badge || {}
  const activities = badgePath?.activities || []
  const completed = Boolean(badgePath?.run?.award || badgePath?.run?.status === 'completed')
  const enrollment = badgePath?.enrollment || {}
  const [issuerSearch, setIssuerSearch] = React.useState('')
  const [requesting, setRequesting] = React.useState<number | null>(null)
  const [removing, setRemoving] = React.useState<string | null>(null)
  const issuers = (enrollment.issuers || []).filter((item: any) => item.org?.name?.toLowerCase().includes(issuerSearch.toLowerCase()))
  const pathBlocked = Boolean(enrollment.requires_cooperating_org && !enrollment.satisfied)

  const requestSupport = async (issuerOrgId: number) => {
    setRequesting(issuerOrgId)
    try {
      await requestIssuerLearnerSupport({ badge_uuid: badge.badge_uuid, issuer_org_id: issuerOrgId }, session.data?.tokens?.access_token)
      toast.success('Request sent. You can start when the organization accepts it.')
      router.refresh()
    } catch (error: any) {
      toast.error(error?.message || 'Could not send your request.')
    } finally {
      setRequesting(null)
    }
  }

  const removeCollaboration = async (linkUuid: string) => {
    setRemoving(linkUuid)
    try {
      await deleteIssuerLearnerLink(linkUuid, session.data?.tokens?.access_token)
      toast.success('Organization removed from this badge. Your progress is preserved.')
      router.refresh()
    } catch (error: any) {
      toast.error(error?.message || 'Could not end this collaboration.')
    } finally {
      setRemoving(null)
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8">
      <section className="overflow-hidden rounded-2xl bg-card shadow-sm">
        <div className="grid gap-8 p-6 md:grid-cols-[260px_1fr] md:p-8">
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-muted text-lime-500">
            {badge.thumbnail_image ? <SafeImage src={badge.thumbnail_image} alt={badge.name || 'Badge'} className="h-full w-full object-cover" /> : <Award size={72} strokeWidth={1.4} />}
          </div>
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Award size={15} /> Learning badge
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-foreground sm:text-4xl">{badge.name}</h1>
            <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">{badge.description || badge.about || 'Complete the learning path to earn this badge.'}</p>
            {completed ? <div className="mt-5 inline-flex w-fit items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-sm font-bold text-green-700"><CheckCircle2 size={17} /> Badge earned</div> : null}
          </div>
        </div>
      </section>
      {(enrollment.collaborations || []).length ? <section className="mt-6 rounded-2xl bg-card p-5 shadow-sm"><h2 className="text-sm font-black uppercase tracking-wider text-muted-foreground">Cooperating organizations</h2><div className="mt-3 space-y-2">{enrollment.collaborations.map((item: any) => <div key={item.org.id} className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3"><div><p className="text-sm font-bold text-foreground">{item.org.name}</p><p className="text-xs text-muted-foreground">{item.source === 'program' ? 'Connected through your program' : 'Direct badge collaboration'}</p></div>{item.link_uuid ? <button type="button" disabled={removing === item.link_uuid} onClick={() => void removeCollaboration(item.link_uuid)} className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted disabled:opacity-50">{removing === item.link_uuid ? 'Removing…' : 'Remove'}</button> : null}</div>)}</div></section> : null}
      {enrollment.requires_cooperating_org && !enrollment.satisfied ? (
        <section className="mt-8 rounded-2xl bg-card p-6 shadow-sm">
          <h2 className="text-xl font-black text-foreground">Choose a cooperating organization</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">This badge includes instructor-graded work. Request support from a recognized issuer before starting.</p>
          <label className="mt-5 flex items-center gap-2 rounded-xl border border-border px-3 py-2">
            <Search size={17} className="text-muted-foreground" />
            <input value={issuerSearch} onChange={(event) => setIssuerSearch(event.target.value)} placeholder="Search organizations" className="w-full bg-transparent text-sm outline-none" />
          </label>
          <div className="mt-3 space-y-2">
            {issuers.map((item: any) => (
              <div key={item.org.id} className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
                <div className="min-w-0"><p className="font-bold text-foreground">{item.org.name}</p><p className="text-xs text-muted-foreground">Recognized issuer</p></div>
                {item.request_status === 'requested' ? <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">Request pending</span> : item.request_status === 'rejected' ? <button type="button" onClick={() => void requestSupport(item.org.id)} disabled={requesting === item.org.id} className="rounded-lg bg-foreground px-4 py-2 text-xs font-bold text-background disabled:opacity-50">Request again</button> : <button type="button" onClick={() => void requestSupport(item.org.id)} disabled={requesting === item.org.id} className="rounded-lg bg-foreground px-4 py-2 text-xs font-bold text-background disabled:opacity-50">{requesting === item.org.id ? 'Sending…' : 'Request to start'}</button>}
              </div>
            ))}
            {!issuers.length ? <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No cooperating organizations are currently open to learner requests.</div> : null}
          </div>
        </section>
      ) : null}
      <section className="mt-8">
        <h2 className="text-xl font-black text-foreground">Learning path</h2>
        {pathBlocked ? <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Your learning path and progress remain visible. Activities are read-only until a cooperating organization joins you on this badge.</p> : null}
        <div className="mt-4 space-y-3">
          {activities.map((activity: any, index: number) => {
            const state = getActivityState(badgePath?.run, activity)
            const StateIcon = state.icon
            const href = getUriWithOrg(orgslug, `/badges/${badge.badge_uuid}/chapter/${activity.activity_uuid}${programAssignmentUuid ? `?assignment=${encodeURIComponent(programAssignmentUuid)}` : ''}`)
            return <div key={activity.activity_uuid} className={`flex items-start gap-4 rounded-xl bg-card p-4 shadow-sm ${pathBlocked ? 'opacity-55 grayscale' : ''}`}>
              <Link aria-disabled={pathBlocked} onClick={pathBlocked ? (event) => event.preventDefault() : undefined} href={href} className={pathBlocked ? 'cursor-not-allowed' : 'transition hover:scale-105'}><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black ${state.tone}`}><StateIcon size={16} />{state.status === 'not_started' ? <span className="sr-only">{index + 1}</span> : null}</span></Link>
              <div className="min-w-0 flex-1"><Link aria-disabled={pathBlocked} onClick={pathBlocked ? (event) => event.preventDefault() : undefined} href={href} className={pathBlocked ? 'cursor-not-allowed' : 'group'}><h3 className="font-bold text-foreground group-hover:underline">{activity.title}</h3><p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{activity.description || `${activity.pages?.length || 0} pages`}</p></Link>{state.status === 'failed' || state.status === 'pending' ? <ActivityResultsButton run={badgePath?.run} activity={activity} /> : null}</div>
              <Link aria-label={`Open ${activity.title}`} aria-disabled={pathBlocked} onClick={pathBlocked ? (event) => event.preventDefault() : undefined} href={href} className={`mt-2 shrink-0 text-muted-foreground ${pathBlocked ? 'cursor-not-allowed' : 'transition hover:translate-x-0.5'}`}><ChevronRight size={20} /></Link>
            </div>
          })}
          {!activities.length ? <div className="rounded-xl border-2 border-dashed border-border p-10 text-center text-sm text-muted-foreground">No learning activities are available yet.</div> : null}
        </div>
      </section>
    </main>
  )
}

function ActivityResultsButton({ run, activity }: { run: any; activity: any }) {
  const [open, setOpen] = React.useState(false)
  const attempts = React.useMemo(() => buildActivityResultAttempts(run, activity), [run, activity])
  const [selected, setSelected] = React.useState(Math.max(0, attempts.length - 1))
  React.useEffect(() => setSelected(Math.max(0, attempts.length - 1)), [attempts.length])
  const active = attempts[selected] || attempts.at(-1)
  const latest = attempts.at(-1)
  const bestIndex = attempts.reduce((best, item, index) => !item.pending && Number(item.percent ?? -1) > Number(attempts[best]?.percent ?? -1) ? index : best, -1)
  const minimum = Number(activity.settings?.grading?.minimum_score_percent ?? 70)
  const maxAttempts = activity.settings?.grading?.max_attempts ?? activity.settings?.max_attempts
  const subtitle = `${minimum}% required${maxAttempts ? ` · ${maxAttempts} attempts maximum` : ''}`

  return <Modal
    isDialogOpen={open}
    onOpenChange={setOpen}
    minWidth="md"
    dialogTitle={`${activity.title} results`}
    dialogDescription={subtitle}
    dialogTrigger={<button type="button" className={`mt-3 rounded-lg border px-3 py-2 text-left transition ${latest?.pending ? 'border-blue-200 bg-blue-50 hover:border-blue-300 hover:bg-blue-100' : 'border-amber-200 bg-amber-50 hover:border-amber-300 hover:bg-amber-100'}`}><span className={`block text-xs font-black ${latest?.pending ? 'text-blue-900' : 'text-amber-900'}`}>Latest attempt: {latest?.pending ? 'awaiting review' : `${latest?.percent ?? 0}%`}</span><span className={`mt-0.5 block text-[10px] font-semibold ${latest?.pending ? 'text-blue-700' : 'text-amber-700'}`}>{latest?.pending && attempts.length > 1 ? `Review ${attempts.length - 1} previous attempt${attempts.length - 1 === 1 ? '' : 's'}` : attempts.length > 1 ? `Review ${attempts.length} attempts` : 'Review'}</span></button>}
    dialogContent={<div>
      {attempts.length > 1 ? <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border pb-3">{attempts.map((attempt, index) => <button key={attempt.key} type="button" onClick={() => setSelected(index)} className={`relative flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition ${selected === index ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}><span>Attempt {index + 1}</span><span className={`relative rounded-md px-1.5 py-0.5 text-[10px] ${selected === index ? 'bg-background/15' : 'bg-muted text-foreground'} ${index === bestIndex ? 'shadow-[0_0_14px_rgba(132,204,22,0.55)] ring-1 ring-lime-300' : ''}`}>{attempt.pending ? '?' : `${attempt.percent}%`}</span>{index === bestIndex ? <Trophy size={11} className="text-lime-500" /> : null}</button>)}</div> : null}
      {active ? <>
        <p className="text-[11px] font-medium text-muted-foreground">Submitted {formatAttemptDate(active.submittedAt)}</p>
        {active.pending ? <p className="mb-4 mt-1 text-xs font-bold text-blue-700">{active.gradedCount}/{active.questionCount} graded · {active.remainingPoints} points remaining · possible score {active.lowPercent}–{active.highPercent}%</p> : <div className="mb-4" />}
        {active.activityNotes?.length ? <div className="mb-4 space-y-2">{active.activityNotes.map((note: any, index: number) => <div key={`${note.message}-${index}`} className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-4"><MessageSquareText size={16} className="mt-0.5 shrink-0 text-blue-700" /><div><p className="text-[10px] font-black uppercase tracking-wide text-blue-700">Activity note{note.grader ? ` · ${note.grader}` : ''}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-blue-950">{note.message}</p></div></div>)}</div> : null}
        <div className="space-y-3">{active.questions.map((question: any, index: number) => {
          const fullMarks = question.max > 0 && question.score >= question.max
          return <article key={question.key} className={question.pending ? 'rounded-xl border border-blue-200 bg-card p-5 shadow-[0_8px_24px_rgba(30,90,150,0.08)]' : fullMarks ? 'rounded-xl border border-transparent bg-muted/35 px-4 py-3' : 'rounded-xl border border-amber-200 bg-card p-5 shadow-[0_8px_24px_rgba(120,90,20,0.10)]'}>
            <div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Question {index + 1}</p><h3 className={`mt-1 font-bold text-foreground ${fullMarks ? 'text-sm' : 'text-base'}`}>{question.title}</h3></div>{question.pending ? <span className="shrink-0 rounded-lg bg-blue-50 px-2 py-1 text-xs font-black text-blue-700">Awaiting review</span> : <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-black ${fullMarks ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'}`}>{question.score}/{question.max}</span>}</div>
            <QuestionResponse question={question} fullMarks={fullMarks} pending={question.pending} />
            {question.feedback ? <div className={`mt-3 flex items-start gap-2 rounded-lg p-3 ${fullMarks ? 'bg-background/60' : 'bg-amber-50'}`}><MessageSquareText size={15} className="mt-0.5 shrink-0 text-muted-foreground" /><div><p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Question note{question.gradedBy ? ` · ${question.gradedBy}` : ''}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">{question.feedback}</p></div></div> : null}
          </article>
        })}</div>
      </> : <p className="py-10 text-center text-sm text-muted-foreground">No graded results are available for this activity yet.</p>}
    </div>}
  />
}

function QuestionResponse({ question, fullMarks, pending = false }: { question: any; fullMarks: boolean; pending?: boolean }) {
  const [expanded, setExpanded] = React.useState(false)
  if (question.kind === 'multiple_choice' || question.kind === 'categorized_multi_select') {
    const selected = new Set((question.selectedIds || []).map(String))
    const correct = new Set((question.correctIds || []).map(String))
    return <div className="mt-4 space-y-2">{question.options.map((option: any) => {
      const isSelected = selected.has(String(option.id))
      const isCorrectSelection = isSelected && (correct.size ? correct.has(String(option.id)) : fullMarks)
      return <div key={option.id} className={`flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm transition ${isSelected ? pending ? '-translate-y-0.5 border-blue-300 bg-card text-foreground shadow-sm' : `-translate-y-0.5 bg-card shadow-sm ${isCorrectSelection ? 'border-green-400 text-green-950' : 'border-red-400 text-red-950'}` : 'border-transparent bg-muted/45 text-muted-foreground opacity-65'}`}><span>{option.text}</span>{isSelected && !pending ? <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${isCorrectSelection ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{isCorrectSelection ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />}</span> : null}</div>
    })}</div>
  }
  if (question.kind === 'text_input' && question.responseText) {
    const long = question.responseText.length > 420
    return <div className="mt-4 rounded-lg bg-muted/45 p-3"><p className={`whitespace-pre-wrap text-sm leading-6 text-foreground ${long && !expanded ? 'line-clamp-6' : ''}`}>{question.responseText}</p>{long ? <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground">{expanded ? 'Show less' : 'Read full response'}<ChevronDown size={13} className={`transition ${expanded ? 'rotate-180' : ''}`} /></button> : null}</div>
  }
  return null
}

function buildActivityResultAttempts(run: any, activity: any) {
  const pages = activity.pages || []
  const pageByUuid = new Map(pages.map((page: any) => [page.page_uuid, page]))
  const attemptsByPage = new Map<string, any[]>()
  for (const attempt of run?.attempts || []) {
    if (!pageByUuid.has(attempt.page_uuid) || !['graded', 'pending'].includes(attempt.result?.grading_status)) continue
    const items = attemptsByPage.get(attempt.page_uuid) || []
    items.push(attempt)
    attemptsByPage.set(attempt.page_uuid, items)
  }
  for (const items of attemptsByPage.values()) items.sort((left, right) => new Date(left.submitted_at).getTime() - new Date(right.submitted_at).getTime())
  const attemptCount = Math.max(0, ...Array.from(attemptsByPage.values()).map((items) => items.length))
  return Array.from({ length: attemptCount }, (_, attemptIndex) => {
    const selected = Array.from(attemptsByPage.entries()).map(([pageUuid, items]) => ({
      page: pageByUuid.get(pageUuid) as any,
      attempt: items[Math.min(attemptIndex, items.length - 1)],
    }))
    const questions = selected.flatMap(({ page, attempt }) => {
      const blocks = findQuestionBlocks(page || {}) as any[]
      const questionResults = attempt.result?.questions || {}
      const rows = Object.entries(questionResults).filter(([, result]: any) => ['graded', 'pending'].includes(result?.grading_status)).map(([questionId, result]: any, questionIndex) => {
        const block = blocks.find((item: any) => String(item.id) === String(questionId))
        const answer = attempt.answer?.questions?.[questionId] || (blocks.length === 1 ? attempt.answer : {}) || {}
        return {
          key: `${attempt.attempt_uuid}:${questionId}`,
          title: block?.content?.label || page?.title || `Question ${questionIndex + 1}`,
          kind: result.kind || block?.kind,
          pending: result.grading_status === 'pending',
          score: Number(result.score ?? 0),
          max: Number(result.max_score ?? result.points ?? 0),
          options: questionOptions(block, answer, result),
          selectedIds: result.option_ids || result.selected || answer.option_ids || (answer.option_id ? [answer.option_id] : []),
          correctIds: result.correct_option_ids || [],
          responseText: textResponse(result.inputs || answer.inputs || {}),
          feedback: result.feedback || '',
          gradedBy: formatGrader(attempt.result?.graded_by),
        }
      })
      if (rows.length) return rows
      const max = Number(attempt.result?.max_score || 0)
      if (!max) return []
      return [{
        key: attempt.attempt_uuid,
        title: blocks[0]?.content?.label || page?.title || 'Question',
        kind: attempt.result?.kind || blocks[0]?.kind,
        pending: attempt.result?.grading_status === 'pending',
        score: Number(attempt.score ?? attempt.result?.score ?? 0),
        max,
        options: questionOptions(blocks[0], attempt.answer || {}, attempt.result || {}),
        selectedIds: attempt.result?.option_ids || attempt.result?.selected || attempt.answer?.option_ids || (attempt.answer?.option_id ? [attempt.answer.option_id] : []),
        correctIds: attempt.result?.correct_option_ids || [],
        responseText: textResponse(attempt.result?.inputs || attempt.answer?.inputs || {}),
        feedback: attempt.result?.question_feedback || '',
        gradedBy: formatGrader(attempt.result?.graded_by),
      }]
    })
    const score = questions.reduce((total: number, question: any) => total + question.score, 0)
    const max = questions.reduce((total: number, question: any) => total + question.max, 0)
    const pendingQuestions = questions.filter((question: any) => question.pending)
    const remainingPoints = pendingQuestions.reduce((total: number, question: any) => total + question.max, 0)
    const pending = pendingQuestions.length > 0
    const gradedCount = questions.length - pendingQuestions.length
    const lowPercent = max ? Math.round((score / max) * 100) : 0
    const highPercent = max ? Math.round(((score + remainingPoints) / max) * 100) : 100
    const submittedAt = selected.reduce((latest, item) => new Date(item.attempt.submitted_at).getTime() > new Date(latest).getTime() ? item.attempt.submitted_at : latest, selected[0]?.attempt.submitted_at || '')
    const activityNotes = uniqueActivityNotes(selected.map((item) => item.attempt))
    return { key: `attempt-${attemptIndex}`, questions, activityNotes, score, max, percent: pending ? null : lowPercent, pending, gradedCount, questionCount: questions.length, remainingPoints, lowPercent, highPercent, submittedAt }
  })
}

function uniqueActivityNotes(attempts: any[]) {
  const notes = new Map<string, any>()
  for (const attempt of attempts) {
    const message = String(attempt.result?.feedback || '').trim()
    if (!message) continue
    const grader = attempt.result?.graded_by || {}
    const key = `${message}:${grader.user_id || ''}:${grader.org_id || ''}`
    if (!notes.has(key)) notes.set(key, { message, grader: formatGrader(grader) })
  }
  return Array.from(notes.values())
}

function questionOptions(block: any, answer: any, result: any) {
  const configured = (block?.content?.options || []).map((option: any, index: number) => ({ id: String(option.id ?? option.value ?? index), text: option.text || option.label || `Option ${index + 1}` }))
  const custom = (answer?.custom_options || []).map((option: any, index: number) => ({ id: String(option.id ?? option.value ?? `custom-${index}`), text: option.text || option.label || option.value || `Option ${configured.length + index + 1}` }))
  const options = [...configured, ...custom]
  const known = new Set(options.map((option) => option.id))
  for (const optionId of [...(result?.option_ids || result?.selected || []), ...(result?.correct_option_ids || [])].map(String)) {
    if (!known.has(optionId)) options.push({ id: optionId, text: optionId })
  }
  return options
}

function textResponse(inputs: any) {
  return Object.values(inputs || {}).map((value: any) => value?.text ?? value?.value ?? '').filter(Boolean).join('\n\n')
}

function formatGrader(gradedBy: any) {
  if (!gradedBy) return ''
  return [gradedBy.staff_name, gradedBy.org_name].filter(Boolean).join(' · ')
}

function formatAttemptDate(value: string) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return 'date unavailable'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function getActivityState(run: any, activity: any) {
  const pageIds = new Set((activity.pages || []).map((page: any) => page.page_uuid))
  const requiredPageIds = new Set((activity.pages || []).filter((page: any) => page.required !== false).map((page: any) => page.page_uuid))
  const attempts = (run?.attempts || []).filter((attempt: any) => pageIds.has(attempt.page_uuid))
  const latestByPage = new Map<string, any>()
  attempts.forEach((attempt: any) => {
    const prior = latestByPage.get(attempt.page_uuid)
    if (!prior || new Date(attempt.submitted_at).getTime() >= new Date(prior.submitted_at).getTime()) latestByPage.set(attempt.page_uuid, attempt)
  })
  const latestAttempts = Array.from(latestByPage.values())
  const progress = (run?.page_progress || []).filter((item: any) => pageIds.has(item.page_uuid))
  const pending = latestAttempts.some((attempt: any) => attempt.result?.grading_status === 'pending')
  const allComplete = Boolean(requiredPageIds.size) && progress.filter((item: any) => item.complete && requiredPageIds.has(item.page_uuid)).length >= requiredPageIds.size
  const scored = latestAttempts.filter((attempt: any) => attempt.result?.grading_status === 'graded' && Number(attempt.result?.max_score || 0) > 0)
  const score = scored.reduce((total: number, attempt: any) => total + Number(attempt.score || attempt.result?.score || 0), 0)
  const max = scored.reduce((total: number, attempt: any) => total + Number(attempt.result?.max_score || 0), 0)
  const percent = max ? Math.round((score / max) * 100) : null
  const minimum = Number(activity.settings?.grading?.minimum_score_percent ?? 70)
  if (pending) return { status: 'pending', detail: 'Your instructor is reviewing this activity.', icon: Clock3, tone: 'bg-blue-100 text-blue-700' }
  if (allComplete && percent !== null && percent < minimum) return { status: 'failed', detail: '', icon: RotateCcw, tone: 'bg-amber-100 text-amber-700' }
  if (allComplete) return { status: 'completed', detail: '', icon: CheckCircle2, tone: 'bg-green-100 text-green-700' }
  if (progress.some((item: any) => item.complete) || attempts.length) return { status: 'in_progress', detail: '', icon: Clock3, tone: 'bg-amber-100 text-amber-700' }
  return { status: 'not_started', detail: '', icon: Circle, tone: 'bg-muted text-muted-foreground' }
}
