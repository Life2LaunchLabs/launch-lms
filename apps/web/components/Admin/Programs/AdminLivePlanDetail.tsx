'use client'

import React from 'react'
import Link from 'next/link'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import {
  AlertTriangle, Archive, ArrowLeft, CalendarDays, Check, CheckCircle2,
  ChevronRight, Circle, ClipboardCheck, Clock3, FileText, FolderOpen as FolderPaperclip, Gauge,
  History, Loader2, MessageSquareText, Paperclip,
  Plus, RefreshCcw, Send, Settings, Shield, Target, Trash2, Users,
} from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { ActivityAggregateGradeForm } from '@components/Admin/Programs/CohortProgramAdmin'
import { planningApi } from '@services/planning/planning'
import { gradeLearningResponse } from '@services/learning/learning'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { cn } from '@/lib/utils'

export type LivePlanSubpage = 'overview' | 'objectives' | 'reviews' | 'people' | 'activity' | 'settings'

const tabs = [
  { id: 'overview' as const, label: 'Overview', icon: Gauge },
  { id: 'objectives' as const, label: 'Objectives', icon: Target },
  { id: 'reviews' as const, label: 'Reviews', icon: ClipboardCheck },
  { id: 'people' as const, label: 'People & roles', icon: Users },
  { id: 'activity' as const, label: 'Activity & files', icon: History },
  { id: 'settings' as const, label: 'Settings', icon: Settings },
]

const planKey = (identifier: string) => `${getAPIUrl()}planning/plans/${encodeURIComponent(identifier)}`

export default function AdminLivePlanDetail({ orgslug, planUuid, activeSubpage = 'overview' }: { orgslug: string; planUuid: string; activeSubpage?: LivePlanSubpage }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const key = token ? planKey(planUuid) : null
  const { data: plan, isLoading, error } = useSWR(key, (url) => swrFetcher(url, token), { revalidateOnFocus: false })
  const refresh = async () => { if (key) await mutate(key) }

  if (isLoading) return <PageLoader />
  if (error || !plan) return <main className="flex min-h-[70vh] items-center justify-center bg-[#f8f8f8]"><div className="rounded-xl border border-gray-200 bg-white p-10 text-center"><Shield className="mx-auto text-gray-300" size={38} /><h1 className="mt-3 text-lg font-black">Plan unavailable</h1><p className="mt-1 text-sm text-gray-500">You need explicit plan access to view this workspace.</p><Link href={getUriWithOrg(orgslug, routePaths.org.dash.planAssignments())} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-blue-700"><ArrowLeft size={14} />Back to assignments</Link></div></main>

  const reviewCount = plan.objectives.filter((objective: any) => objective.progress?.status === 'submitted').length
  const attention = attentionReasons(plan)
  const source = plan.source_assignment
  return <main className="min-h-full w-full bg-[#f8f8f8]">
    <header className="relative z-10 bg-[#fcfbfc] px-6 tracking-tight nice-shadow lg:px-10">
      <div className="pb-4 pt-6"><Breadcrumbs items={[{ label: 'Plans', href: getUriWithOrg(orgslug, routePaths.org.dash.programs()) }, { label: 'Assignments', href: getUriWithOrg(orgslug, routePaths.org.dash.planAssignments()) }, ...(source?.type === 'group' ? [{ label: source.group?.name || source.program?.name || 'Batch', href: getUriWithOrg(orgslug, routePaths.org.dash.planAssignment(source.assignment_uuid)) }] : []), { label: plan.subject?.name || plan.name }]} /></div>
      <div className="flex flex-col gap-5 pb-5 lg:flex-row lg:items-center lg:justify-between"><div className="flex min-w-0 items-center gap-4"><Avatar user={plan.subject} size="lg" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-2xl font-black text-gray-950">{plan.subject?.name || 'External learner'}</h1><LifecycleBadge status={plan.status} /></div><p className="mt-1 truncate text-sm font-bold text-gray-700">{plan.name}</p><p className="mt-1 text-xs text-gray-500">{source?.group?.name ? `${source.group.name} · ` : ''}Owner: {plan.owner?.name || 'Unassigned'}{plan.due_date ? ` · Due ${formatDate(plan.due_date)}` : ' · Self-paced'}</p></div></div><PlanLifecycleActions plan={plan} token={token} refresh={refresh} /></div>
      <nav className="flex overflow-x-auto text-sm font-black" aria-label="Live plan administration">{tabs.filter((tab) => tab.id !== 'reviews' || plan.capabilities.includes('complete_restricted_objectives')).map((tab) => { const Icon = tab.icon; return <Link key={tab.id} href={getUriWithOrg(orgslug, routePaths.org.dash.livePlan(plan.plan_uuid, tab.id))} className={cn('flex shrink-0 items-center gap-2 border-black px-3 py-2 transition', activeSubpage === tab.id ? 'border-b-4' : 'opacity-50 hover:opacity-75')}><Icon size={16} />{tab.label}{tab.id === 'reviews' && reviewCount ? <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">{reviewCount}</span> : null}</Link> })}</nav>
    </header>
    <div className="mx-auto max-w-[1500px] px-5 py-6 lg:px-8">
      {activeSubpage === 'overview' ? <Overview plan={plan} orgslug={orgslug} attention={attention} token={token} refresh={refresh} /> : null}
      {activeSubpage === 'objectives' ? <Objectives plan={plan} token={token} refresh={refresh} /> : null}
      {activeSubpage === 'reviews' ? <Reviews plan={plan} token={token} refresh={refresh} /> : null}
      {activeSubpage === 'people' ? <People plan={plan} token={token} refresh={refresh} /> : null}
      {activeSubpage === 'activity' ? <ActivityAndFiles plan={plan} token={token} /> : null}
      {activeSubpage === 'settings' ? <PlanSettings plan={plan} token={token} refresh={refresh} /> : null}
    </div>
  </main>
}

function Overview({ plan, orgslug, attention, token, refresh }: any) {
  const incomplete = plan.objectives.filter((objective: any) => !['completed', 'canceled'].includes(objective.progress?.status))
  const upcoming = [...incomplete].filter((objective: any) => objective.due_date).sort((a: any, b: any) => String(a.due_date).localeCompare(String(b.due_date))).slice(0, 5)
  const waiting = plan.objectives.filter((objective: any) => objective.progress?.status === 'submitted')
  const next = upcoming[0] || incomplete[0]
  return <div className="space-y-5"><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={<Gauge size={17} />} label="Progress" value={`${plan.progress_percent}%`} detail={`${plan.completed_objective_count} of ${plan.objective_count} complete`} tone="blue" /><Metric icon={<ClipboardCheck size={17} />} label="Reviews waiting" value={String(waiting.length)} detail={waiting.length ? 'Submission decisions needed' : 'Nothing waiting'} tone={waiting.length ? 'amber' : 'green'} /><Metric icon={<AlertTriangle size={17} />} label="Needs attention" value={String(attention.length)} detail={attention[0] || 'On track'} tone={attention.length ? 'amber' : 'green'} /><Metric icon={<CalendarDays size={17} />} label="Next deadline" value={next?.due_date ? formatDate(next.due_date, true) : 'Open-ended'} detail={next?.title || 'Plan complete'} /></section>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.7fr)]"><section className="rounded-xl border border-gray-100 bg-white nice-shadow"><div className="flex items-center justify-between border-b border-gray-100 px-5 py-4"><div><h2 className="font-black text-gray-900">What’s coming next</h2><p className="mt-1 text-xs text-gray-500">The next actionable objectives in this learner’s plan.</p></div><Link href={getUriWithOrg(orgslug, routePaths.org.dash.livePlan(plan.plan_uuid, 'objectives'))} className="text-xs font-black text-blue-700">View all</Link></div><div className="divide-y divide-gray-100">{(upcoming.length ? upcoming : incomplete.slice(0, 5)).map((objective: any) => <ObjectiveSummary key={objective.objective_uuid} objective={objective} plan={plan} token={token} refresh={refresh} />)}{!incomplete.length ? <Empty icon={<CheckCircle2 size={34} />} title="Every objective is complete" detail="This plan can be completed when you are ready." /> : null}</div></section><aside className="space-y-5"><section className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow"><h2 className="font-black text-gray-900">Plan context</h2><dl className="mt-4 space-y-4"><Detail label="Subject" value={plan.subject?.name || 'External learner'} /><Detail label="Owner" value={plan.owner?.name || 'Unassigned'} /><Detail label="Assignment" value={plan.source_assignment?.program?.name || 'Independent plan'} /><Detail label="Group" value={plan.source_assignment?.group?.name || 'Direct assignment'} /><Detail label="Schedule" value={plan.due_date ? `${formatDate(plan.start_date)} – ${formatDate(plan.due_date)}` : 'Self-paced'} /></dl></section>{attention.length ? <section className="rounded-xl border border-amber-200 bg-amber-50 p-5"><h2 className="flex items-center gap-2 font-black text-amber-950"><AlertTriangle size={17} />Needs attention</h2><ul className="mt-3 space-y-2 text-sm text-amber-900">{attention.map((reason: string) => <li key={reason}>• {reason}</li>)}</ul></section> : null}</aside></div>
  </div>
}

function ObjectiveSummary({ objective, plan, token, refresh }: any) {
  const [saving, setSaving] = React.useState(false)
  const canComplete = objective.can_complete && (plan.capabilities.includes('complete_restricted_objectives') || plan.capabilities.includes('update_progress'))
  const complete = async () => { setSaving(true); try { await planningApi.updateProgress(plan.plan_uuid, objective.objective_uuid, { status: 'completed', note: 'Completed by staff.' }, token); await refresh(); toast.success('Objective completed.') } catch (error: any) { toast.error(error?.message || 'Could not complete objective.') } finally { setSaving(false) } }
  return <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><StatusIcon status={objective.progress?.status} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-gray-900">{objective.title}</p><div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-gray-500"><StatusText status={objective.progress?.status} />{objective.due_date ? <span className={isOverdue(objective) ? 'text-red-700' : ''}>{isOverdue(objective) ? 'Overdue · ' : ''}{formatDate(objective.due_date)}</span> : <span>No deadline</span>}{objective.blocked ? <span className="text-amber-700">Blocked</span> : null}</div></div>{canComplete && objective.progress?.status !== 'completed' ? <button disabled={saving} onClick={() => void complete()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-black hover:bg-gray-50 disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />}Mark complete</button> : null}</div>
}

function Objectives({ plan, token, refresh }: any) {
  const [selected, setSelected] = React.useState<any>(null)
  return <div className="space-y-5"><div><h2 className="text-lg font-black text-gray-950">Objectives</h2><p className="mt-1 text-sm text-gray-500">Plan-specific requirements, evidence, dates and review state.</p></div>{plan.phases.map((phase: any) => <section key={phase.phase_uuid} className="overflow-hidden rounded-xl border border-gray-100 bg-white nice-shadow"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/60 px-5 py-4"><div><h3 className="font-black text-gray-900">{phase.name}</h3><p className="mt-1 text-xs text-gray-500">{phase.description || `${phase.objectives.length} objective${phase.objectives.length === 1 ? '' : 's'}`}</p></div>{phase.due_date ? <span className="text-xs font-bold text-gray-500">Due {formatDate(phase.due_date)}</span> : null}</div><div className="divide-y divide-gray-100">{phase.objectives.map((objective: any) => <button key={objective.objective_uuid} onClick={() => setSelected(objective)} className="grid w-full gap-3 p-4 text-left transition hover:bg-gray-50 sm:grid-cols-[28px_minmax(0,1fr)_130px_120px_24px] sm:items-center"><StatusIcon status={objective.progress?.status} /><div className="min-w-0"><p className="truncate text-sm font-black text-gray-900">{objective.title}</p><p className="mt-1 line-clamp-1 text-xs text-gray-500">{objective.description || (objective.source_objective_id ? 'Inherited objective' : 'Personal objective')}</p></div><StatusText status={objective.progress?.status} /><span className={cn('text-xs font-semibold text-gray-500', isOverdue(objective) && 'text-red-700')}>{objective.due_date ? formatDate(objective.due_date) : 'No deadline'}</span><ChevronRight size={16} className="hidden text-gray-300 sm:block" /></button>)}</div></section>)}<ObjectiveModal objective={selected} setObjective={setSelected} plan={plan} token={token} refresh={refresh} /></div>
}

function ObjectiveModal({ objective, setObjective, plan, token, refresh }: any) {
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [completionRestricted, setCompletionRestricted] = React.useState(false)
  const [restrictedFields, setRestrictedFields] = React.useState<Record<string, boolean>>({})
  React.useEffect(() => {
    setNote(objective?.progress?.reviewer_note || '')
    setCompletionRestricted(Boolean(objective?.completion_restricted))
    setRestrictedFields(Object.fromEntries((objective?.fields || []).map((field: any) => {
      const key = String(field.field_uuid || field.key || '')
      const legacyLane = String(field.access || field.lane || 'contributor')
      return [key, Boolean(field.restricted ?? ['reviewer', 'staff'].includes(legacyLane))]
    })))
  }, [objective])
  if (!objective) return null
  const canReview = plan.capabilities.includes('complete_restricted_objectives')
  const canUpdate = plan.capabilities.includes('update_progress')
  const canEditRestrictions = plan.capabilities.includes('edit_structure')
  const act = async (status: string) => {
    setSaving(true)
    try {
      await planningApi.updateProgress(plan.plan_uuid, objective.objective_uuid, { status, note }, token)
      await refresh()
      setObjective(null)
      toast.success(status === 'completed' ? 'Objective completed.' : status === 'changes_requested' ? 'Changes requested.' : 'Objective updated.')
    } catch (error: any) { toast.error(error?.message || 'Could not update objective.') } finally { setSaving(false) }
  }
  const saveRestrictions = async () => {
    setSaving(true)
    try {
      const fields = (objective.fields || []).map((field: any) => ({
        ...field,
        restricted: Boolean(restrictedFields[String(field.field_uuid || field.key || '')]),
      }))
      await planningApi.updateObjective(plan.plan_uuid, objective.objective_uuid, { completion_restricted: completionRestricted, fields }, token)
      await refresh()
      setObjective(null)
      toast.success('Objective restrictions updated.')
    } catch (error: any) { toast.error(error?.message || 'Could not update objective restrictions.') } finally { setSaving(false) }
  }
  const values = Object.entries(objective.progress?.field_values || {})
  return <Modal isDialogOpen onOpenChange={(open) => !open && setObjective(null)} minHeight="no-min" minWidth="md" dialogTitle={objective.title} dialogDescription={`${statusLabel(objective.progress?.status)}${objective.due_date ? ` · Due ${formatDate(objective.due_date)}` : ''}`} dialogContent={<div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-3"><SmallDetail label="Status" value={statusLabel(objective.progress?.status)} /><SmallDetail label="Start" value={formatDate(objective.start_date)} /><SmallDetail label="Due" value={formatDate(objective.due_date)} /></div>
    {objective.description ? <p className="rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-700">{objective.description}</p> : null}
    {canEditRestrictions ? <section className="rounded-xl border border-gray-200 p-4"><h3 className="text-xs font-black uppercase tracking-wide text-gray-500">Restrictions</h3><p className="mt-1 text-xs leading-5 text-gray-500">Restricted actions require the matching role permission.</p><div className="mt-3 space-y-2"><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={completionRestricted} onChange={(event) => setCompletionRestricted(event.target.checked)} />Completion is restricted</label>{(objective.fields || []).map((field: any) => { const key = String(field.field_uuid || field.key || ''); return <label key={key} className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={Boolean(restrictedFields[key])} onChange={(event) => setRestrictedFields({ ...restrictedFields, [key]: event.target.checked })} />{field.title || key} is a restricted field</label> })}</div><button disabled={saving} onClick={() => void saveRestrictions()} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-black disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />}Save restrictions</button></section> : null}
    {objective.progress?.subject_note ? <section><h3 className="text-xs font-black uppercase tracking-wide text-gray-400">Learner note</h3><p className="mt-2 whitespace-pre-wrap rounded-xl border border-gray-200 p-4 text-sm leading-6">{objective.progress.subject_note}</p></section> : null}
    {values.length ? <section><h3 className="text-xs font-black uppercase tracking-wide text-gray-400">Submitted evidence</h3><div className="mt-2 grid gap-2">{values.map(([key, value]: any) => <Evidence key={key} label={key} value={value} />)}</div></section> : null}
    {(canReview || canUpdate) && objective.progress?.status !== 'completed' ? <><label className="block text-xs font-black text-gray-600">Staff note<textarea value={note} onChange={(event) => setNote(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-gray-200 p-3 text-sm" placeholder="Optional context for the learner" /></label><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{canReview && objective.progress?.status === 'submitted' ? <button disabled={saving || !note.trim()} onClick={() => void act('changes_requested')} className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-black text-amber-800 disabled:opacity-40">Request changes</button> : null}{objective.can_complete ? <button disabled={saving} onClick={() => void act('completed')} className="inline-flex items-center justify-center gap-2 rounded-lg bg-black px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={15} /> : <CheckCircle2 size={15} />}Mark complete</button> : null}</div></> : null}
  </div>} />
}

function Reviews({ plan, token, refresh }: any) {
  const key = token ? `${getAPIUrl()}planning/plans/${encodeURIComponent(plan.plan_uuid)}/reviews` : null
  const { data, isLoading, mutate: refreshReviews } = useSWR(key, (url) => swrFetcher(url, token), { revalidateOnFocus: false })
  const [selected, setSelected] = React.useState<any>(null)
  const objectiveReviews = data?.objective_reviews || []
  const activityReviews = data?.activity_reviews || []
  if (isLoading) return <PageLoader compact />
  return <div><div className="mb-5"><h2 className="text-lg font-black text-gray-950">Review queue</h2><p className="mt-1 text-sm text-gray-500">Evidence and learning activity submissions for this plan only.</p></div>{objectiveReviews.length || activityReviews.length ? <div className="space-y-3">{objectiveReviews.map((item: any) => <button key={item.objective_uuid} onClick={() => setSelected({ ...item, review_type: 'objective' })} className="flex w-full items-center gap-4 rounded-xl border border-gray-100 bg-white p-5 text-left nice-shadow hover:border-blue-300"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><ClipboardCheck size={20} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{item.title}</span><span className="mt-1 block text-xs text-gray-500">Objective submission · {item.progress?.field_values ? Object.keys(item.progress.field_values).length : 0} evidence fields</span></span><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">Review</span><ChevronRight size={17} className="text-gray-300" /></button>)}{activityReviews.map((item: any) => <button key={item.review_id} onClick={() => setSelected(item)} className="flex w-full items-center gap-4 rounded-xl border border-gray-100 bg-white p-5 text-left nice-shadow hover:border-blue-300"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><FileText size={20} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{item.activity?.title || item.badge?.name || 'Learning activity'}</span><span className="mt-1 block text-xs text-gray-500">Manual grading required</span></span><span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-800">Grade</span><ChevronRight size={17} className="text-gray-300" /></button>)}</div> : <Empty icon={<CheckCircle2 size={36} />} title="No reviews waiting" detail="New submissions for this plan will appear here." />}<ReviewModal item={selected} setItem={setSelected} plan={plan} token={token} refresh={async () => { await Promise.all([refreshReviews(), refresh()]) }} /></div>
}

function ReviewModal({ item, setItem, plan, token, refresh }: any) {
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [scores, setScores] = React.useState<Record<string, string>>({})
  React.useEffect(() => { setNote(''); const next: Record<string, string> = {}; (item?.attempts || []).forEach((attempt: any) => Object.entries(attempt.result?.questions || {}).forEach(([id, result]: any) => { if (result?.grading_status === 'pending') next[`${attempt.attempt_uuid}:${id}`] = '' })); setScores(next) }, [item])
  if (!item) return null
  if (item.review_type === 'activity') {
    const grade = async (questionFeedback: Record<string, string>) => { setSaving(true); try { await Promise.all((item.attempts || []).filter((attempt: any) => attempt.result?.grading_status === 'pending').map((attempt: any) => { const questionScores = Object.fromEntries(Object.entries(scores).filter(([key]) => key.startsWith(`${attempt.attempt_uuid}:`)).map(([key, value]) => [key.slice(attempt.attempt_uuid.length + 1), Number(value)])); const total = Object.entries(attempt.result?.questions || {}).reduce((sum: number, [id, result]: any) => sum + (result.grading_status === 'pending' ? Number(questionScores[id] || 0) : Number(result.score || 0)), 0); const notes = Object.fromEntries(Object.entries(questionFeedback).filter(([key, value]) => key.startsWith(`${attempt.attempt_uuid}:`) && value.trim()).map(([key, value]) => [key.slice(attempt.attempt_uuid.length + 1), value.trim()])); return gradeLearningResponse(attempt.attempt_uuid, { score: total, question_scores: questionScores, question_feedback: notes, feedback: note }, token) })); await refresh(); setItem(null); toast.success('Activity graded.') } catch (error: any) { toast.error(error?.message || 'Could not save grading.') } finally { setSaving(false) } }
    return <Modal isDialogOpen onOpenChange={(open) => !open && setItem(null)} minHeight="no-min" minWidth="lg" dialogTitle={item.activity?.title || 'Grade activity'} dialogDescription={item.badge?.name || plan.name} dialogContent={<ActivityAggregateGradeForm review={item} scores={scores} setScores={setScores} feedback={note} setFeedback={setNote} saving={saving} onConfirm={(notes: Record<string, string>) => void grade(notes)} />} />
  }
  const decide = async (status: 'completed' | 'changes_requested') => { setSaving(true); try { await planningApi.updateProgress(plan.plan_uuid, item.objective_uuid, { status, note }, token); await refresh(); setItem(null); toast.success(status === 'completed' ? 'Submission approved.' : 'Changes requested.') } catch (error: any) { toast.error(error?.message || 'Could not save review.') } finally { setSaving(false) } }
  return <Modal isDialogOpen onOpenChange={(open) => !open && setItem(null)} minHeight="no-min" minWidth="md" dialogTitle={item.title} dialogDescription="Review learner evidence" dialogContent={<div className="space-y-5">{item.progress?.subject_note ? <p className="rounded-xl bg-gray-50 p-4 text-sm leading-6">{item.progress.subject_note}</p> : null}<div className="grid gap-2">{Object.entries(item.progress?.field_values || {}).map(([key, value]: any) => <Evidence key={key} label={key} value={value} />)}</div><label className="block text-xs font-black">Feedback<textarea value={note} onChange={(event) => setNote(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-gray-200 p-3 text-sm" /></label><div className="flex justify-end gap-2"><button disabled={saving || !note.trim()} onClick={() => void decide('changes_requested')} className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-black text-amber-800 disabled:opacity-40">Request changes</button><button disabled={saving} onClick={() => void decide('completed')} className="rounded-lg bg-black px-5 py-2.5 text-sm font-black text-white">Approve</button></div></div>} />
}

function People({ plan, token, refresh }: any) {
  const canManageCollaborators = plan.capabilities.includes('manage_collaborators')
  const [email, setEmail] = React.useState('')
  const [inviteRole, setInviteRole] = React.useState('reviewer')
  const invite = async () => {
    if (!email.trim()) return
    try {
      await planningApi.invite(plan.plan_uuid, { email: email.trim(), role_key: inviteRole, kind: 'collaborator' }, token)
      setEmail('')
      await refresh()
      toast.success('Invitation sent.')
    } catch (error: any) { toast.error(error?.message || 'Could not invite collaborator.') }
  }
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
    <section className="overflow-hidden rounded-xl border border-gray-100 bg-white nice-shadow">
      <div className="border-b border-gray-100 px-5 py-4"><h2 className="font-black">People</h2><p className="mt-1 text-xs text-gray-500">The subject is fixed. Their permissions come from the role assigned below.</p></div>
      <div className="divide-y divide-gray-100">{plan.collaborators.map((item: any) => {
        const isSubject = Number(item.user?.id) === Number(plan.subject?.id)
        return <div key={item.collaborator_uuid} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><Avatar user={item.user} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-black">{item.user?.name || 'Unknown user'}</p>{isSubject ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-black uppercase text-blue-700">Subject</span> : null}{item.is_owner ? <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[9px] font-black uppercase text-purple-700">Owner</span> : null}</div><p className="mt-1 text-xs text-gray-500">Role: {item.is_owner ? 'Plan admin' : item.role.name}</p></div>{canManageCollaborators && !item.is_owner ? <><select aria-label={`Role for ${item.user?.name}`} value={item.role.key} onChange={async (event) => { try { await planningApi.updateCollaborator(plan.plan_uuid, item.collaborator_uuid, event.target.value, token); await refresh(); toast.success('Role updated.') } catch (error: any) { toast.error(error?.message || 'Could not update role.') } }} className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs font-bold">{plan.roles.map((role: any) => <option key={role.key} value={role.key}>{role.name}</option>)}</select>{!isSubject ? <button aria-label={`Remove ${item.user?.name}`} onClick={async () => { if (!window.confirm(`Remove ${item.user?.name} from this plan?`)) return; try { await planningApi.removeCollaborator(plan.plan_uuid, item.collaborator_uuid, token); await refresh() } catch (error: any) { toast.error(error?.message || 'Could not remove collaborator.') } }} className="rounded-lg border border-red-200 p-2 text-red-700"><Trash2 size={15} /></button> : null}</> : <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-black">{item.is_owner ? 'Plan admin' : item.role.name}</span>}</div>
      })}</div>
    </section>
    <aside className="space-y-5">
      <RoleStack plan={plan} token={token} refresh={refresh} />
      {canManageCollaborators ? <section className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow"><h2 className="font-black">Invite collaborator</h2><p className="mt-1 text-xs text-gray-500">Invite someone with one of the roles above.</p><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" className="mt-4 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" /><div className="mt-2 flex gap-2"><select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-xs font-bold">{plan.roles.filter((role: any) => role.key !== 'plan_admin').map((role: any) => <option key={role.key} value={role.key}>{role.name}</option>)}</select><button disabled={!email.trim()} onClick={() => void invite()} className="rounded-lg bg-black px-4 text-xs font-black text-white disabled:opacity-40"><Send size={14} /></button></div></section> : null}
      {plan.invitations?.length ? <section className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow"><h2 className="font-black">Invitations</h2><div className="mt-3 space-y-2">{plan.invitations.map((item: any) => <div key={item.invitation_uuid} className="rounded-lg bg-gray-50 p-3"><p className="truncate text-xs font-black">{item.email}</p><p className="mt-1 text-[10px] capitalize text-gray-500">{item.role?.name || item.kind} · {item.status}</p></div>)}</div></section> : null}
    </aside>
  </div>
}

function RoleStack({ plan, token, refresh }: any) {
  const canEdit = plan.capabilities.includes('manage_roles')
  const [selected, setSelected] = React.useState<any>(null)
  const [creating, setCreating] = React.useState(false)
  return <section className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow"><div className="flex items-center justify-between gap-3"><div><h2 className="font-black">Roles</h2><p className="mt-1 text-xs text-gray-500">Permissions used across this plan.</p></div>{plan.can_manage_organization_roles ? <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-black"><Plus size={13} />New role</button> : null}</div><div className="mt-4 space-y-2">{plan.roles.map((role: any) => <button key={role.key} onClick={() => setSelected(role)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/30"><span className="min-w-0"><span className="block truncate text-sm font-black">{role.name}</span><span className="mt-1 block text-[10px] font-semibold text-gray-500">{role.capabilities.length} permission{role.capabilities.length === 1 ? '' : 's'}</span></span><span className="flex items-center gap-2">{role.locked ? <Shield size={14} className="text-gray-400" /> : null}<ChevronRight size={15} className="text-gray-300" /></span></button>)}</div><RoleEditor role={selected} setRole={setSelected} plan={plan} token={token} refresh={refresh} editable={canEdit} /><CreateRoleModal open={creating} setOpen={setCreating} plan={plan} token={token} refresh={refresh} /></section>
}

const permissionGroups = [
  { label: 'Access & communication', items: ['view_plan', 'comment'] },
  { label: 'Objectives & evidence', items: ['update_progress', 'contribute_fields', 'contribute_restricted_fields', 'complete_restricted_objectives', 'review_badge_submissions'] },
  { label: 'Plan editing', items: ['edit_plan_details', 'edit_structure', 'edit_schedule', 'complete_plan', 'archive_plan'] },
  { label: 'People & roles', items: ['request_collaborators', 'manage_collaborators', 'manage_roles'] },
]

function PermissionChecklist({ capabilities, setCapabilities, available, disabled }: { capabilities: string[]; setCapabilities: React.Dispatch<React.SetStateAction<string[]>>; available: string[]; disabled: boolean }) {
  const selected = new Set(capabilities)
  const known = new Set(permissionGroups.flatMap((group) => group.items))
  const groups = [...permissionGroups, { label: 'Other', items: available.filter((item) => !known.has(item)) }]
  return <div className="space-y-5">{groups.map((group) => {
    const items = group.items.filter((item) => available.includes(item))
    if (!items.length) return null
    return <fieldset key={group.label}><legend className="mb-2 text-[10px] font-black uppercase tracking-wider text-gray-400">{group.label}</legend><div className="grid gap-2 sm:grid-cols-2">{items.map((capability) => <label key={capability} className={cn('flex items-start gap-2 rounded-lg border border-gray-200 p-3 text-xs font-bold', disabled ? 'cursor-not-allowed bg-gray-50 text-gray-500' : 'cursor-pointer hover:border-blue-300')}><input type="checkbox" checked={selected.has(capability)} disabled={disabled} onChange={(event) => setCapabilities(event.target.checked ? [...capabilities, capability] : capabilities.filter((item) => item !== capability))} className="mt-0.5" /><span>{humanize(capability)}</span></label>)}</div></fieldset>
  })}</div>
}

function RoleEditor({ role, setRole, plan, token, refresh, editable }: any) {
  const [name, setName] = React.useState('')
  const [capabilities, setCapabilities] = React.useState<string[]>([])
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => { setName(role?.name || ''); setCapabilities(role?.capabilities || []) }, [role])
  if (!role) return null
  const locked = Boolean(role.locked)
  const canChange = editable && !locked
  const save = async () => { setSaving(true); try { if (role.organization_role_uuid) await planningApi.updateOrganizationRole(plan.plan_uuid, role.organization_role_uuid, { name, capabilities }, token); else await planningApi.updateRole(plan.plan_uuid, role.role_uuid, { name, capabilities }, token); await refresh(); setRole(null); toast.success(role.organization_role_uuid ? 'Organization role updated across plans.' : 'Plan role updated.') } catch (error: any) { toast.error(error?.message || 'Could not update role.') } finally { setSaving(false) } }
  const remove = async () => { if (!role.organization_role_uuid || !window.confirm(`Delete ${role.name} across this organization?`)) return; setSaving(true); try { await planningApi.removeOrganizationRole(plan.plan_uuid, role.organization_role_uuid, token); await refresh(); setRole(null); toast.success('Organization role deleted.') } catch (error: any) { toast.error(error?.message || 'Could not delete role.') } finally { setSaving(false) } }
  return <Modal isDialogOpen onOpenChange={(open) => !open && setRole(null)} minHeight="no-min" minWidth="md" dialogTitle={role.name} dialogDescription={locked ? 'Plan admin is locked with every plan permission.' : canChange ? role.organization_role_uuid ? 'Changes apply to this role across organization-managed plans.' : 'Changes apply to this plan role.' : 'You can inspect this role, but cannot edit it.'} dialogContent={<div className="space-y-5"><label className="block text-xs font-black">Role name<input value={name} disabled={!canChange} onChange={(event) => setName(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm disabled:bg-gray-50" /></label><div><p className="mb-2 text-xs font-black">Permissions</p><PermissionChecklist capabilities={capabilities} setCapabilities={setCapabilities} available={plan.available_capabilities || []} disabled={!canChange} /></div>{canChange ? <div className="flex justify-between gap-2">{role.organization_role_uuid ? <button disabled={saving} onClick={() => void remove()} className="rounded-lg border border-red-200 px-4 py-2.5 text-xs font-black text-red-700"><Trash2 size={14} /></button> : <span />}<button disabled={saving || !name.trim()} onClick={() => void save()} className="ml-auto inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2.5 text-xs font-black text-white disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}Save role</button></div> : null}</div>} />
}

function CreateRoleModal({ open, setOpen, plan, token, refresh }: any) {
  const [name, setName] = React.useState('')
  const [capabilities, setCapabilities] = React.useState<string[]>(['view_plan'])
  const [saving, setSaving] = React.useState(false)
  const create = async () => { if (!name.trim()) return; setSaving(true); try { await planningApi.createOrganizationRole(plan.plan_uuid, { name: name.trim(), capabilities }, token); await refresh(); setOpen(false); setName(''); setCapabilities(['view_plan']); toast.success('Organization role created and added to managed plans.') } catch (error: any) { toast.error(error?.message || 'Could not create role.') } finally { setSaving(false) } }
  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="md" dialogTitle="New organization role" dialogDescription="This role can be assigned on this organization’s other managed plans." dialogContent={<div className="space-y-5"><label className="block text-xs font-black">Role name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" placeholder="Coach" /></label><div><p className="mb-2 text-xs font-black">Permissions</p><PermissionChecklist capabilities={capabilities} setCapabilities={setCapabilities} available={plan.available_capabilities || []} disabled={false} /></div><button disabled={saving || !name.trim()} onClick={() => void create()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-black px-5 py-3 text-sm font-black text-white disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}Create role</button></div>} />
}

function ActivityAndFiles({ plan, token }: any) {
  const activityKey = token ? `${getAPIUrl()}planning/plans/${encodeURIComponent(plan.plan_uuid)}/activity` : null
  const attachmentKey = token ? `${getAPIUrl()}planning/plans/${encodeURIComponent(plan.plan_uuid)}/attachments` : null
  const { data: activity = [], mutate: refreshActivity } = useSWR(activityKey, (url) => swrFetcher(url, token))
  const { data: attachments = [], mutate: refreshAttachments } = useSWR(attachmentKey, (url) => swrFetcher(url, token))
  const [comment, setComment] = React.useState('')
  const post = async () => { if (!comment.trim()) return; try { await planningApi.comment(plan.plan_uuid, comment.trim(), token); setComment(''); await refreshActivity(); toast.success('Comment added.') } catch (error: any) { toast.error(error?.message || 'Could not add comment.') } }
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]"><section className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow"><h2 className="font-black">Activity history</h2><p className="mt-1 text-xs text-gray-500">Comments and an audit trail of plan changes.</p>{plan.capabilities.includes('comment') ? <div className="mt-4 flex gap-2"><input value={comment} onChange={(event) => setComment(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void post() }} placeholder="Add a staff comment" className="h-10 min-w-0 flex-1 rounded-lg border border-gray-200 px-3 text-sm" /><button disabled={!comment.trim()} onClick={() => void post()} className="rounded-lg bg-black px-4 text-white disabled:opacity-40"><MessageSquareText size={15} /></button></div> : null}<div className="mt-5 space-y-3">{activity.map((item: any) => <div key={item.activity_uuid} className="flex gap-3 border-b border-gray-100 pb-3"><Avatar user={item.actor} /><div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><p className="truncate text-xs font-black">{item.actor?.name || 'System'}</p><span className="shrink-0 text-[10px] text-gray-400">{formatDateTime(item.creation_date)}</span></div><p className="mt-1 text-sm leading-5 text-gray-600">{item.action === 'comment.added' ? item.payload?.body : humanize(item.action)}</p></div></div>)}{!activity.length ? <Empty icon={<History size={32} />} title="No activity yet" detail="Plan events will be recorded here." compact /> : null}</div></section><aside className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow"><h2 className="flex items-center gap-2 font-black"><FolderPaperclip size={17} />Files</h2><p className="mt-1 text-xs text-gray-500">Images, videos and PDFs attached to this plan.</p><div className="mt-4 space-y-2">{attachments.map((item: any) => <div key={item.asset_uuid} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3"><Paperclip size={15} className="text-gray-400" /><a href={item.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-xs font-black text-blue-700">{item.title || item.filename || 'Attachment'}</a>{plan.capabilities.includes('edit_plan_details') ? <button aria-label={`Remove ${item.title || item.filename}`} onClick={async () => { await planningApi.removeAttachment(plan.plan_uuid, item.asset_uuid, token); await refreshAttachments() }} className="text-red-600"><Trash2 size={13} /></button> : null}</div>)}{!attachments.length ? <Empty icon={<Paperclip size={28} />} title="No files" detail="No files are attached to this plan." compact /> : null}</div></aside></div>
}

function PlanSettings({ plan, token, refresh }: any) {
  const [draft, setDraft] = React.useState({ name: plan.name, description: plan.description || '', priority: plan.priority, start_date: plan.start_date || '', due_date: plan.due_date || '' })
  const [saving, setSaving] = React.useState(false)
  const canEdit = plan.capabilities.includes('edit_plan_details')
  const canSchedule = plan.capabilities.includes('edit_schedule')
  const save = async () => { setSaving(true); try { await planningApi.update(plan.plan_uuid, { ...(canEdit ? { name: draft.name, description: draft.description, priority: Number(draft.priority) } : {}), ...(canSchedule ? { start_date: draft.start_date || null, due_date: draft.due_date || null } : {}) }, token); await refresh(); toast.success('Plan settings saved.') } catch (error: any) { toast.error(error?.message || 'Could not save plan.') } finally { setSaving(false) } }
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.6fr)]"><section className="rounded-xl border border-gray-100 bg-white p-6 nice-shadow"><h2 className="font-black">Plan details and schedule</h2><div className="mt-5 space-y-4"><label className="block text-xs font-black">Plan name<input value={draft.name} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="mt-2 h-11 w-full rounded-lg border border-gray-200 px-3 text-sm disabled:bg-gray-50" /></label><label className="block text-xs font-black">Description<textarea value={draft.description} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="mt-2 min-h-28 w-full rounded-lg border border-gray-200 p-3 text-sm disabled:bg-gray-50" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-black">Start date<input type="date" value={draft.start_date} disabled={!canSchedule} onChange={(event) => setDraft({ ...draft, start_date: event.target.value })} className="mt-2 h-11 w-full rounded-lg border border-gray-200 px-3 text-sm disabled:bg-gray-50" /></label><label className="text-xs font-black">Due date<input type="date" value={draft.due_date} disabled={!canSchedule} onChange={(event) => setDraft({ ...draft, due_date: event.target.value })} className="mt-2 h-11 w-full rounded-lg border border-gray-200 px-3 text-sm disabled:bg-gray-50" /></label></div>{canEdit || canSchedule ? <button disabled={saving || !draft.name.trim()} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}Save changes</button> : null}</div></section><aside className="space-y-5"><section className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow"><h2 className="font-black">Ownership</h2><div className="mt-4 flex items-center gap-3"><Avatar user={plan.owner} /><div><p className="text-sm font-black">{plan.owner?.name || 'Unassigned'}</p><p className="text-xs text-gray-500">Current plan owner</p></div></div>{plan.capabilities.includes('transfer_ownership') ? <select defaultValue="" onChange={async (event) => { if (!event.target.value) return; await planningApi.transferOwnership(plan.plan_uuid, Number(event.target.value), token); await refresh(); toast.success('Ownership transferred.') }} className="mt-4 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs font-bold"><option value="">Transfer ownership…</option>{plan.collaborators.filter((item: any) => !item.is_owner).map((item: any) => <option key={item.user?.id} value={item.user?.id}>{item.user?.name}</option>)}</select> : null}</section><section className="rounded-xl border border-red-100 bg-white p-5 nice-shadow"><h2 className="font-black text-red-900">Lifecycle</h2><p className="mt-1 text-xs leading-5 text-gray-500">Complete, reopen or archive this plan without changing its template or batch peers.</p><div className="mt-4"><PlanLifecycleActions plan={plan} token={token} refresh={refresh} full /></div></section></aside></div>
}

function PlanLifecycleActions({ plan, token, refresh, full = false }: any) {
  const [saving, setSaving] = React.useState(false)
  const canComplete = plan.capabilities.includes('complete_plan')
  const canArchive = plan.capabilities.includes('archive_plan')
  if (!canComplete && !canArchive) return null
  const act = async (action: 'complete' | 'reopen' | 'archive') => { if (action === 'archive' && !window.confirm('Archive this plan?')) return; setSaving(true); try { await planningApi.status(plan.plan_uuid, action, token); await refresh(); toast.success(action === 'reopen' ? 'Plan reopened.' : action === 'complete' ? 'Plan completed.' : 'Plan archived.') } catch (error: any) { toast.error(error?.message || 'Could not update plan lifecycle.') } finally { setSaving(false) } }
  if (full) return <div className="grid gap-2">{plan.status === 'completed' ? <button disabled={saving || !canComplete} onClick={() => void act('reopen')} className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-xs font-black"><RefreshCcw size={14} />Reopen plan</button> : <button disabled={saving || !canComplete} onClick={() => void act('complete')} className="inline-flex items-center justify-center gap-2 rounded-lg bg-black px-4 py-2.5 text-xs font-black text-white"><CheckCircle2 size={14} />Complete plan</button>}{canArchive ? <button disabled={saving} onClick={() => void act('archive')} className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-xs font-black text-red-700"><Archive size={14} />Archive plan</button> : null}</div>
  return plan.status === 'completed' ? <button disabled={saving} onClick={() => void act('reopen')} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-xs font-black"><RefreshCcw size={14} />Reopen plan</button> : <button disabled={saving} onClick={() => void act('complete')} className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2.5 text-xs font-black text-white"><CheckCircle2 size={14} />Complete plan</button>
}

function Metric({ icon, label, value, detail, tone }: any) { return <div className="rounded-xl border border-gray-100 bg-white p-4 nice-shadow"><div className="flex items-center gap-2 text-xs font-semibold text-gray-500">{icon}{label}</div><p className={cn('mt-3 text-xl font-black', tone === 'blue' ? 'text-blue-600' : tone === 'amber' ? 'text-amber-700' : tone === 'green' ? 'text-green-700' : 'text-gray-900')}>{value}</p><p className="mt-1 truncate text-[11px] text-gray-400">{detail}</p></div> }
function Avatar({ user, size }: { user: any; size?: 'lg' }) { const initials = String(user?.name || user?.username || '?').split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase(); const classes = size === 'lg' ? 'h-14 w-14 text-sm' : 'h-9 w-9 text-xs'; return user?.avatar_image ? <img src={user.avatar_image} alt="" className={cn('shrink-0 rounded-full object-cover', classes)} /> : <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-gray-900 font-black text-white', classes)}>{initials}</span> }
function LifecycleBadge({ status }: { status: string }) { return <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-black uppercase', status === 'active' ? 'bg-green-50 text-green-700' : status === 'completed' ? 'bg-blue-50 text-blue-700' : status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600')}>{status}</span> }
function StatusIcon({ status }: { status: string }) { return status === 'completed' ? <CheckCircle2 className="text-green-600" size={20} /> : status === 'submitted' ? <ClipboardCheck className="text-blue-600" size={20} /> : status === 'changes_requested' ? <AlertTriangle className="text-amber-600" size={20} /> : status === 'in_progress' ? <Clock3 className="text-amber-600" size={20} /> : <Circle className="text-gray-300" size={19} /> }
function StatusText({ status }: { status: string }) { return <span className={cn('text-xs font-bold', status === 'completed' ? 'text-green-700' : status === 'submitted' ? 'text-blue-700' : status === 'changes_requested' ? 'text-amber-700' : 'text-gray-500')}>{statusLabel(status)}</span> }
function statusLabel(status?: string) { return String(status || 'not_started').replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()) }
function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-[10px] font-black uppercase tracking-wide text-gray-400">{label}</dt><dd className="mt-1 text-sm font-semibold text-gray-800">{value}</dd></div> }
function SmallDetail({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-gray-50 p-3"><p className="text-[10px] font-black uppercase text-gray-400">{label}</p><p className="mt-1 text-xs font-bold text-gray-800">{value}</p></div> }
function Evidence({ label, value }: { label: string; value: any }) { const display = typeof value === 'string' ? value : JSON.stringify(value); const isUrl = typeof value === 'string' && /^https?:\/\//.test(value); return <div className="rounded-lg border border-gray-200 p-3"><p className="text-[10px] font-black uppercase text-gray-400">{humanize(label)}</p>{isUrl ? <a href={value} target="_blank" rel="noreferrer" className="mt-1 block break-all text-sm font-bold text-blue-700">Open evidence</a> : <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-700">{display}</p>}</div> }
function Empty({ icon, title, detail, compact = false }: { icon: React.ReactNode; title: string; detail: string; compact?: boolean }) { return <div className={cn('text-center text-gray-400', compact ? 'py-8' : 'rounded-xl border border-dashed border-gray-200 bg-white py-20')}><span className="mx-auto flex justify-center text-gray-300">{icon}</span><p className="mt-3 text-sm font-black text-gray-700">{title}</p><p className="mt-1 text-xs text-gray-500">{detail}</p></div> }
function PageLoader({ compact = false }: { compact?: boolean }) { return <div className={cn('flex items-center justify-center', compact ? 'py-24' : 'min-h-[70vh] bg-[#f8f8f8]')}><Loader2 className="animate-spin text-gray-400" size={24} /></div> }
function formatDate(value?: string | null, short = false) { if (!value) return '—'; return new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, short ? { month: 'short', day: 'numeric' } : { dateStyle: 'medium' }) }
function formatDateTime(value?: string | null) { return value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—' }
function humanize(value: string) { return String(value).replaceAll('.', ' ').replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()) }
function isOverdue(objective: any) { return Boolean(objective.due_date && new Date(`${objective.due_date}T23:59:59`).getTime() < Date.now() && !['completed', 'canceled'].includes(objective.progress?.status)) }
function attentionReasons(plan: any) { const reasons: string[] = []; const overdue = plan.objectives.filter(isOverdue).length; const blocked = plan.objectives.filter((item: any) => item.blocked && !['completed', 'canceled'].includes(item.progress?.status)).length; const changes = plan.objectives.filter((item: any) => item.progress?.status === 'changes_requested').length; if (overdue) reasons.push(`${overdue} overdue objective${overdue === 1 ? '' : 's'}`); if (blocked) reasons.push(`${blocked} blocked objective${blocked === 1 ? '' : 's'}`); if (changes) reasons.push(`${changes} objective${changes === 1 ? '' : 's'} need learner changes`); return reasons }
