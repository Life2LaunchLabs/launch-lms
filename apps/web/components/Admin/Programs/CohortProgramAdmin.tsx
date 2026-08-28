'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  Eye,
  FileText,
  Filter,
  Flag,
  Gauge,
  Info,
  Layers3,
  Loader2,
  MessageSquareText,
  Pin,
  Sparkles,
  Target,
  Users,
  X,
} from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { programsApi } from '@services/programs/programs'
import { gradeLearningResponse } from '@services/learning/learning'
import { cn } from '@/lib/utils'
import { findQuestionBlocks, getBlockScoring } from '@components/Learning/schema'

type FilterMode = 'all' | 'attention' | 'review'
type AssignmentSubpage = 'progress' | 'review' | 'details' | 'reports'

const assignmentTabs = [
  { id: 'progress' as const, label: 'Progress', icon: Gauge },
  { id: 'review' as const, label: 'Review', icon: ClipboardCheck },
  { id: 'details' as const, label: 'Details', icon: Info },
  { id: 'reports' as const, label: 'Reports', icon: BarChart3 },
]

export function GroupOverview({ orgslug, groupId }: { orgslug: string; groupId: number }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const key = org?.id && token ? `${getAPIUrl()}planning/cohorts/${groupId}?org_id=${org.id}` : null
  const { data, isLoading } = useSWR(key, (url) => swrFetcher(url, token))
  if (isLoading || !data) return <PageLoader />
  const totalReview = data.programs.reduce((sum: number, program: any) => sum + program.ready_for_review_count, 0)
  const overall = data.programs.length ? Math.round(data.programs.reduce((sum: number, program: any) => sum + program.progress_percent, 0) / data.programs.length) : 0

  return (
    <main className="min-h-full w-full bg-[#f8f8f8] px-8 py-7">
      <div className="mx-auto max-w-7xl">
        <Link href={getUriWithOrg(orgslug, routePaths.org.dash.users.usergroups())} className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-black"><ArrowLeft size={15} />All groups</Link>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4"><div><div className="flex items-center gap-2 text-xs font-bold text-blue-600"><Users size={14} />Group overview</div><h1 className="mt-1 text-3xl font-black text-gray-950">{data.cohort.name}</h1><p className="mt-1 text-sm text-gray-500">{data.cohort.description || `${data.learner_count} learners across ${data.programs.length} programs`}</p></div><Link href={getUriWithOrg(orgslug, routePaths.org.dash.programs())} className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2.5 text-sm font-bold text-white"><Layers3 size={16} />Assign a program</Link></div>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Summary icon={<Gauge size={17} />} label="Overall progress" value={`${overall}%`} detail="Across assigned programs" tone="blue" /><Summary icon={<Users size={17} />} label="Learners" value={String(data.learner_count)} detail="Current group roster" /><Summary icon={<FileText size={17} />} label="Ready to review" value={String(totalReview)} detail="Submissions awaiting staff" tone={totalReview ? 'amber' : 'green'} /><Summary icon={<Target size={17} />} label="Programs" value={String(data.programs.length)} detail="Active requirement sets" /></div>
        <section className="mt-7 rounded-xl border border-gray-100 bg-white nice-shadow"><div className="border-b border-gray-100 px-6 py-5"><h2 className="font-black text-gray-900">Assigned programs</h2><p className="mt-0.5 text-xs text-gray-500">Open a program to manage its requirements and learner progress.</p></div><div className="grid gap-4 p-6 lg:grid-cols-2">
          {data.programs.length ? data.programs.map((program: any) => <Link key={program.assignment_uuid} href={getUriWithOrg(orgslug, routePaths.org.dash.users.groupProgram(groupId, program.assignment_uuid))} className="group rounded-xl border border-gray-200 p-5 transition hover:border-blue-300 hover:shadow-sm"><div className="flex items-start justify-between gap-4"><div><p className="text-base font-black text-gray-900 group-hover:text-blue-700">{program.program_name}</p><p className="mt-1 text-xs font-medium text-gray-500">{program.objective_count} requirements · {program.learner_count} learners</p></div><ChevronRight className="text-gray-300 group-hover:text-blue-600" size={18} /></div><div className="mt-5 flex items-center justify-between text-xs font-bold"><span className="text-gray-500">{program.progress_percent}% complete</span><span className={cn(program.ready_for_review_count ? 'text-amber-700' : 'text-green-700')}>{program.ready_for_review_count ? `${program.ready_for_review_count} to review` : 'No reviews waiting'}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${program.progress_percent}%` }} /></div><div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4 text-xs text-gray-500"><span className="inline-flex items-center gap-1.5"><CalendarDays size={13} />{program.due_date ? `Due ${formatDate(program.due_date)}` : 'Self paced'}</span><span className="font-bold text-gray-800">Open matrix</span></div></Link>) : <div className="col-span-full py-16 text-center"><Layers3 className="mx-auto text-gray-300" size={38} /><p className="mt-3 font-bold text-gray-700">No programs assigned yet</p><p className="mt-1 text-sm text-gray-500">Assign a reusable program to start tracking this group.</p></div>}
        </div></section>
      </div>
    </main>
  )
}

export function GroupProgramMatrix({ orgslug, groupId, assignmentUuid, activeSubpage = 'progress' }: { orgslug: string; groupId: number; assignmentUuid: string; activeSubpage?: AssignmentSubpage }) {
  const cohortId = groupId
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const router = useRouter()
  const searchParams = useSearchParams()
  const key = org?.id && token ? `${getAPIUrl()}planning/assignment-batches/${assignmentUuid}/matrix?org_id=${org.id}` : null
  const { data, isLoading } = useSWR(key, (url) => swrFetcher(url, token), { revalidateOnFocus: false })
  const [filter, setFilter] = React.useState<FilterMode>('all')
  const [focusUser, setFocusUser] = React.useState<number | null>(() => Number(searchParams.get('focusUser')) || null)
  const [focusObjective, setFocusObjective] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<Set<number>>(new Set())
  const [completionOpen, setCompletionOpen] = React.useState(false)
  const [completionUsers, setCompletionUsers] = React.useState<number[]>([])
  const [completionObjective, setCompletionObjective] = React.useState<any>(null)
  const [note, setNote] = React.useState('')
  const [completionDate, setCompletionDate] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => { setSelected(new Set()); setFocusObjective(null) }, [assignmentUuid])
  if (isLoading || !data) return <PageLoader />

  const reviewCount = data.learners.filter((learner: any) => Object.values(learner.cells).some((cell: any) => ['submitted', 'ready_for_review'].includes(cell.status))).length
  const canReview = Boolean(session?.data?.user?.is_superadmin || (data.assignment?.staff_user_ids || []).includes(Number(session?.data?.user?.id)))
  const attentionCount = data.learners.filter((learner: any) => completionPercent(learner, data.objectives) < Math.max(0, data.assignment.progress_percent - 20)).length
  const filteredLearners = data.learners.filter((learner: any) => filter === 'all' || (filter === 'review' ? Object.values(learner.cells).some((cell: any) => ['submitted', 'ready_for_review'].includes(cell.status)) : completionPercent(learner, data.objectives) < Math.max(0, data.assignment.progress_percent - 20)))
  const selectedObjective = data.objectives.find((objective: any) => objective.objective_uuid === focusObjective)

  const chooseProgram = (uuid: string) => {
    const target = data.programs.find((program: any) => program.assignment_uuid === uuid)
    if (target) router.push(getUriWithOrg(orgslug, routePaths.org.dash.users.cohortProgram(cohortId, uuid, activeSubpage)))
  }
  const openCompletion = (objective: any, userIds: number[]) => { setCompletionObjective(objective); setCompletionUsers(userIds); setNote(''); setCompletionOpen(true) }
  const confirmCompletion = async () => {
    if (!completionObjective || !completionUsers.length) return
    setSaving(true)
    try {
      await programsApi.updateProgress(Number(org.id), { objective_uuid: completionObjective.objective_uuid, user_ids: completionUsers, status: 'completed', staff_note: note, completion_date: new Date(`${completionDate}T12:00:00`).toISOString() }, token)
      if (key) await mutate(key)
      setCompletionOpen(false); setSelected(new Set())
      toast.success(completionUsers.length === 1 ? 'Objective completed.' : `${completionUsers.length} learners marked complete.`)
    } catch (error: any) { toast.error(error?.message || 'Could not update progress.') } finally { setSaving(false) }
  }
  const selectColumnEligible = (objective: any) => {
    setFocusObjective(objective.objective_uuid)
    const eligible = filteredLearners.filter((learner: any) => learner.cells[objective.objective_uuid]?.status !== 'completed').map((learner: any) => learner.id)
    setSelected(new Set(eligible))
  }
  const inPerson = data.objectives.find((objective: any) => /workshop|in.person|activity/i.test(objective.title)) || data.objectives[0]

  return (
    <main className="min-h-full w-full bg-[#f8f8f8]">
      <div className="relative z-10 bg-[#fcfbfc] px-10 tracking-tight nice-shadow">
        <div className="pb-4 pt-6"><Breadcrumbs items={[{ label: 'Users', href: getUriWithOrg(orgslug, routePaths.org.dash.users.users()) }, { label: data.cohort?.name, href: getUriWithOrg(orgslug, routePaths.org.dash.users.group(groupId)) }, { label: data.program?.name || 'Program assignment' }]} /></div>
        <div className="flex flex-col gap-4 pb-5 md:flex-row md:items-center md:justify-between">
          <div><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-black text-gray-950">{data.program?.name}</h1><span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-500"><Users size={13} />{data.learners.length} learners</span></div><p className="mt-1 text-sm text-gray-500">Assigned to {data.cohort?.name}</p></div>
          <div className="inline-flex max-w-full overflow-x-auto rounded-xl border border-gray-200 bg-white p-1">{data.programs.map((program: any) => <button key={program.assignment_uuid} onClick={() => chooseProgram(program.assignment_uuid)} className={cn('min-w-36 rounded-lg px-3 py-2 text-left transition', program.assignment_uuid === assignmentUuid ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50')}><span className="block truncate text-xs font-black">{program.program_name}</span><span className={cn('block text-[10px] font-semibold', program.assignment_uuid === assignmentUuid ? 'text-blue-100' : 'text-gray-400')}>{program.progress_percent}% complete</span></button>)}</div>
        </div>
        <nav className="flex space-x-1 text-sm font-black" aria-label="Program assignment pages">{assignmentTabs.filter((tab) => tab.id !== 'review' || canReview).map((tab) => { const Icon = tab.icon; const active = activeSubpage === tab.id; return <Link key={tab.id} href={getUriWithOrg(orgslug, routePaths.org.dash.users.groupProgram(groupId, assignmentUuid, tab.id))} className={cn('flex w-fit items-center gap-2 border-black px-3 py-2 transition', active ? 'border-b-4' : 'opacity-50 hover:opacity-75')}><Icon size={16} />{tab.label}{tab.id === 'review' && reviewCount > 0 ? <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">{reviewCount}</span> : null}</Link> })}</nav>
      </div>
      <div className="mx-auto max-w-[1500px] px-6 py-6">
        {activeSubpage === 'progress' ? <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Summary icon={<CalendarDays size={17} />} label="Timeline" value={scheduleLabel(data.assignment.due_date)} detail={data.assignment.due_date ? `Due ${formatDate(data.assignment.due_date)}` : 'No fixed end date'} tone="green" /><Summary icon={<Gauge size={17} />} label="Overall progress" value={`${data.assignment.progress_percent}%`} detail={`${data.assignment.completed_count} objective completions`} tone="blue" /><Summary icon={<AlertTriangle size={17} />} label="Learners falling behind" value={String(attentionCount)} detail="Based on group pace" tone={attentionCount ? 'amber' : 'green'} /><Summary icon={<Flag size={17} />} label="Next milestone" value={nextMilestone(data)} detail={selectedObjective ? 'Selected requirement' : 'First incomplete requirement'} /></div>

        <section className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white nice-shadow">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3"><div className="flex flex-wrap gap-2"><FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>All learners <ChevronDown size={13} /></FilterButton><FilterButton active={filter === 'attention'} tone="amber" onClick={() => setFilter('attention')}>Needs attention <Count>{attentionCount}</Count></FilterButton><FilterButton active={filter === 'review'} tone="blue" onClick={() => setFilter('review')}>Ready to review <Count>{reviewCount}</Count></FilterButton></div><div className="flex items-center gap-2"><button onClick={() => inPerson && openCompletion(inPerson, data.learners.filter((learner: any) => learner.cells[inPerson.objective_uuid]?.status !== 'completed').map((learner: any) => learner.id))} disabled={!inPerson} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-black text-gray-800 hover:bg-gray-50 disabled:opacity-40"><Sparkles size={14} />Mark in-person activity complete</button><button className="rounded-lg border border-gray-200 p-2 text-gray-500"><Filter size={16} /></button></div></div>
          <div className="overflow-auto pb-20"><table className="min-w-[1050px] w-full border-collapse text-left"><thead className="sticky top-0 z-20 bg-white"><tr><th className="sticky left-0 z-30 w-56 min-w-56 border-b border-r border-gray-200 bg-white px-4 py-4 text-xs font-black text-gray-700"><span className="inline-flex items-center gap-2"><Pin size={13} />Learner</span></th>{data.objectives.map((objective: any) => { const focused = focusObjective === objective.objective_uuid; return <th key={objective.objective_uuid} onClick={() => { setFocusObjective(focused ? null : objective.objective_uuid); setSelected(new Set()) }} className={cn('min-w-40 cursor-pointer border-b border-r border-gray-200 px-3 py-3 align-top transition', focused ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : focusObjective ? 'bg-gray-50/70 opacity-60' : 'bg-white hover:bg-gray-50')}><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-black leading-4 text-gray-800">{objective.title}</p><p className="mt-1 text-[10px] font-semibold text-gray-400">{objective.target_days ? `Day ${objective.target_days}` : objective.kind === 'badge' ? `Badge v${objective.badge_major_version || 1}` : objective.evidence_policy !== 'none' ? 'Evidence enabled' : 'Staff confirmation'}</p></div>{focused && <Pin size={13} className="text-blue-600" />}</div>{focused && <button onClick={(event) => { event.stopPropagation(); selectColumnEligible(objective) }} className="mt-2 text-[10px] font-black text-blue-700 hover:underline">Select incomplete</button>}</th>})}</tr></thead><tbody>{filteredLearners.map((learner: any) => { const rowFocused = focusUser === learner.id; return <tr key={learner.id} className={cn('transition', rowFocused ? 'relative z-10 bg-blue-50/70 shadow-[0_4px_14px_rgba(37,99,235,0.12)]' : focusUser ? 'opacity-55' : 'hover:bg-gray-50/50')}><th onClick={() => setFocusUser(rowFocused ? null : learner.id)} className={cn('sticky left-0 z-10 cursor-pointer border-b border-r border-gray-200 px-4 py-3 transition', rowFocused ? 'bg-blue-50' : 'bg-white')}><div className="flex items-center gap-3"><button onClick={(event) => { event.stopPropagation(); const next = new Set(selected); next.has(learner.id) ? next.delete(learner.id) : next.add(learner.id); setSelected(next) }} className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', selected.has(learner.id) ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white')}>{selected.has(learner.id) && <Check size={11} />}</button><Avatar learner={learner} /><div className="min-w-0"><p className="truncate text-xs font-black text-gray-800">{displayName(learner)}</p><p className="mt-0.5 text-[10px] font-semibold text-gray-400">{completionPercent(learner, data.objectives)}% complete</p></div>{rowFocused && <Pin size={13} className="ml-auto text-blue-600" />}</div></th>{data.objectives.map((objective: any) => { const cell = learner.cells[objective.objective_uuid] || { status: 'not_started' }; const colFocused = focusObjective === objective.objective_uuid; const expanded = rowFocused || colFocused; return <td key={objective.objective_uuid} onClick={() => { setFocusUser(learner.id); setFocusObjective(objective.objective_uuid) }} className={cn('cursor-pointer border-b border-r border-gray-200 px-3 py-3 transition', colFocused ? 'bg-blue-50/80 ring-1 ring-inset ring-blue-200' : focusObjective ? 'opacity-55' : '', expanded ? 'h-16' : 'h-14')}><Status status={cell.status} />{expanded && cell.evidence?.length ? <button className="mt-2 inline-flex items-center gap-1 text-[10px] font-black text-blue-700"><Eye size={11} />Preview evidence</button> : null}{rowFocused && colFocused && cell.status !== 'completed' ? <button onClick={(event) => { event.stopPropagation(); openCompletion(objective, [learner.id]) }} className="mt-2 block text-[10px] font-black text-blue-700 hover:underline">Complete objective</button> : null}</td>})}</tr>})}</tbody></table></div>
          {selected.size > 0 && focusObjective ? <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-gray-200 bg-white p-2.5 shadow-xl"><span className="flex items-center gap-2 px-2 text-sm font-black text-gray-800"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white"><Check size={12} /></span>{selected.size} selected</span><button onClick={() => openCompletion(selectedObjective, Array.from(selected))} className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2.5 text-xs font-black text-white"><CheckCircle2 size={15} />Mark complete</button><button onClick={() => { setCompletionObjective(selectedObjective); setCompletionUsers(Array.from(selected)); setCompletionOpen(true) }} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-xs font-black text-gray-700"><MessageSquareText size={14} />Add note</button><button onClick={() => setSelected(new Set())} className="p-2 text-gray-400 hover:text-black"><X size={16} /></button></div> : null}
        </section></> : null}
        {activeSubpage === 'review' ? canReview ? <AssignmentReviewPanel orgId={Number(org.id)} token={token} assignmentUuid={assignmentUuid} matrixKey={key} /> : <div className="rounded-xl border border-dashed border-gray-200 bg-white py-20 text-center"><Flag className="mx-auto text-gray-300" size={36} /><p className="mt-3 font-black text-gray-800">Review access is assigned</p><p className="mt-1 text-sm text-gray-500">Only staff attached to this assignment can clear its reviews.</p></div> : null}
        {activeSubpage === 'details' ? <AssignmentDetails data={data} /> : null}
        {activeSubpage === 'reports' ? <EmptyReports /> : null}
      </div>
      <Modal isDialogOpen={completionOpen} onOpenChange={setCompletionOpen} minHeight="no-min" minWidth="md" dialogTitle="Complete objective" dialogDescription={completionUsers.length === 1 ? 'Confirm this learner’s completion and add context for them.' : `Apply this completion to ${completionUsers.length} learners at once.`} dialogContent={<div className="space-y-5 p-2"><div className="rounded-xl bg-gray-50 p-4"><p className="text-xs font-semibold text-gray-400">Objective</p><p className="mt-1 text-sm font-black text-gray-900">{completionObjective?.title}</p><p className="mt-1 text-xs text-gray-500">{completionUsers.length === 1 ? displayName(data.learners.find((learner: any) => learner.id === completionUsers[0]) || {}) : `${completionUsers.length} selected learners`}</p></div><label className="block text-xs font-bold text-gray-600"><span className="mb-2 block">Completion date</span><input type="date" value={completionDate} onChange={(e) => setCompletionDate(e.target.value)} className="h-11 w-full rounded-lg border border-gray-200 px-3 text-sm" /></label><label className="block text-xs font-bold text-gray-600"><span className="mb-2 block">Staff note <span className="font-medium text-gray-400">(optional)</span></span><textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-28 w-full rounded-lg border border-gray-200 p-3 text-sm outline-none focus:border-blue-400" placeholder={completionUsers.length > 1 ? 'This shared note will be visible on every selected learner’s record.' : 'Add helpful context or feedback.'} /><span className="mt-1 block text-right text-[10px] font-semibold text-gray-400">{note.length}/500</span></label><div className="rounded-lg bg-blue-50 p-3 text-xs font-semibold text-blue-700">Learners will be notified of completion. Their progress will update in every program that reuses this objective.</div><button onClick={() => void confirmCompletion()} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-black px-5 py-3 text-sm font-black text-white disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}Confirm completion</button></div>} />
    </main>
  )
}

function AssignmentReviewPanel({ orgId, token, assignmentUuid, matrixKey }: { orgId: number; token?: string; assignmentUuid: string; matrixKey: string | null }) {
  const reviewKey = orgId && token ? `${getAPIUrl()}planning/assignment-batches/${encodeURIComponent(assignmentUuid)}/reviews?org_id=${orgId}` : null
  const { data, isLoading } = useSWR(reviewKey, (url) => swrFetcher(url, token), { revalidateOnFocus: false })
  const reviews = data?.objective_reviews || []
  const activityReviews = data?.activity_reviews || []
  const grouped = reviews.reduce((result: Record<string, any[]>, item: any) => {
    const id = item.objective.objective_uuid
    result[id] = [...(result[id] || []), item]
    return result
  }, {})
  const [active, setActive] = React.useState<any>(null)
  const [message, setMessage] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [questionScores, setQuestionScores] = React.useState<Record<string, string>>({})

  const open = (item: any) => { setActive(item); setMessage('') }
  const openActivity = (item: any) => {
    const scores: Record<string, string> = {}
    ;(item.attempts || []).forEach((attempt: any) => Object.entries(attempt.result?.questions || {}).forEach(([id, result]: any) => { if (result?.grading_status === 'pending') scores[`${attempt.attempt_uuid}:${id}`] = '' }))
    setQuestionScores(scores); setMessage(''); setActive({ ...item, review_type: 'activity' })
  }
  const decide = async (action: 'confirm' | 'flag') => {
    if (!active || saving || (action === 'flag' && !message.trim())) return
    setSaving(true)
    try {
      await programsApi.reviewObjective(orgId, assignmentUuid, { objective_uuid: active.objective.objective_uuid, user_id: active.user.id, action, message }, token)
      const remaining = reviews.filter((item: any) => item.progress_uuid !== active.progress_uuid)
      await Promise.all([reviewKey ? mutate(reviewKey) : Promise.resolve(), matrixKey ? mutate(matrixKey) : Promise.resolve()])
      const next = remaining.find((item: any) => item.objective.objective_uuid === active.objective.objective_uuid) || remaining[0]
      setActive(next || null); setMessage('')
      toast.success(action === 'confirm' ? 'Objective confirmed.' : 'Feedback sent to learner.')
    } catch (error: any) {
      toast.error(error?.message || 'Could not review this submission.')
    } finally { setSaving(false) }
  }
  const gradeActivity = async (questionFeedback: Record<string, string>) => {
    if (!active || active.review_type !== 'activity' || saving) return
    if (Object.values(questionScores).some((value) => value === '')) return toast.error('Enter a score for every manually reviewed question.')
    setSaving(true)
    try {
      await Promise.all((active.attempts || []).filter((attempt: any) => attempt.result?.grading_status === 'pending').map((attempt: any) => {
        const scores = Object.fromEntries(Object.entries(questionScores).filter(([key]) => key.startsWith(`${attempt.attempt_uuid}:`)).map(([key, value]) => [key.slice(attempt.attempt_uuid.length + 1), Number(value)]))
        const total = Object.entries(attempt.result?.questions || {}).reduce((sum: number, [id, result]: any) => sum + (result.grading_status === 'pending' ? Number(scores[id] || 0) : Number(result.score || 0)), 0)
        const notes = Object.fromEntries(Object.entries(questionFeedback).filter(([key, value]) => key.startsWith(`${attempt.attempt_uuid}:`) && value.trim()).map(([key, value]) => [key.slice(attempt.attempt_uuid.length + 1), value.trim()]))
        return gradeLearningResponse(attempt.attempt_uuid, { score: total, question_scores: scores, question_feedback: notes, feedback: message }, token)
      }))
      if (reviewKey) await mutate(reviewKey)
      setActive(null); setMessage(''); setQuestionScores({})
      toast.success('Activity response graded.')
    } catch (error: any) { toast.error(error?.message || 'Could not save these grades.') } finally { setSaving(false) }
  }

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-gray-400" /></div>
  return <>
    <div className="mb-5"><h2 className="text-lg font-black text-gray-950">Review queue</h2><p className="mt-1 text-sm text-gray-500">Submissions waiting for an assigned staff member.</p></div>
    {reviews.length || activityReviews.length ? <div className="space-y-4">{Object.values(grouped).map((items: any) => {
      const objective = items[0].objective
      return <button key={objective.objective_uuid} onClick={() => open(items[0])} className="flex w-full items-center gap-4 rounded-xl border border-gray-100 bg-white p-5 text-left nice-shadow transition hover:border-blue-300"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><ClipboardCheck size={21} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-black text-gray-900">{objective.title}</span><span className="mt-1 block text-xs text-gray-500">Learner-submitted objective · {items.length} waiting</span></span><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">{items.length}</span><ChevronRight size={18} className="text-gray-300" /></button>
    })}{activityReviews.map((item: any) => <button key={item.attempt_uuid} onClick={() => openActivity(item)} className="flex w-full items-center gap-4 rounded-xl border border-gray-100 bg-white p-5 text-left nice-shadow transition hover:border-blue-300"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><FileText size={21} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-black text-gray-900">{item.badge?.name || 'Badge learning path'}</span><span className="mt-1 block text-xs text-gray-500">{item.activity?.title || 'Learning activity'} · {item.page?.title || 'Response'} · {displayName(item.user)}</span></span><span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-800">Grade</span><ChevronRight size={18} className="text-gray-300" /></button>)}</div> : <div className="rounded-xl border border-dashed border-gray-200 bg-white py-20 text-center"><CheckCircle2 className="mx-auto text-green-500" size={36} /><p className="mt-3 font-black text-gray-800">Everything is reviewed</p><p className="mt-1 text-sm text-gray-500">New objective and activity submissions will appear here.</p></div>}
    <Modal isDialogOpen={Boolean(active)} onOpenChange={(value) => !value && setActive(null)} minHeight="no-min" minWidth="lg" dialogTitle={active?.review_type === 'activity' ? active.activity?.title || 'Grade activity' : active?.objective?.title || 'Review objective'} dialogDescription={active ? `${displayName(active.user)} · submitted ${formatDate(active.submitted_at)}` : ''} dialogContent={active?.review_type === 'activity' ? <ActivityAggregateGradeForm review={active} scores={questionScores} setScores={setQuestionScores} feedback={message} setFeedback={setMessage} saving={saving} onConfirm={(notes: Record<string, string>) => void gradeActivity(notes)} /> : active ? <div className="space-y-5 p-2">
      {active.learner_note ? <div><p className="text-xs font-black uppercase tracking-wide text-gray-400">Learner note</p><p className="mt-2 whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-800">{active.learner_note}</p></div> : null}
      <EvidenceList evidence={active.evidence || []} />
      {active.feedback_history?.length ? <div><p className="text-xs font-black uppercase tracking-wide text-gray-400">Previous feedback</p><div className="mt-2 space-y-2">{active.feedback_history.map((item: any, index: number) => <div key={`${item.created_at}-${index}`} className="rounded-lg border border-amber-100 bg-amber-50 p-3"><p className="text-sm text-amber-950">{item.message}</p><p className="mt-1 text-[10px] font-semibold text-amber-700">{formatDate(item.created_at)}</p></div>)}</div></div> : null}
      <label className="block text-xs font-bold text-gray-600"><span className="mb-2 block">Note or revision request</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} className="min-h-24 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-blue-400" placeholder="Optional when confirming; required when flagging." /></label>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button onClick={() => void decide('flag')} disabled={saving || !message.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-black text-amber-800 disabled:opacity-40"><Flag size={16} />Flag for changes</button><button onClick={() => void decide('confirm')} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-black px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}Confirm and continue</button></div>
    </div> : <div />} />
  </>
}

function EvidenceList({ evidence }: { evidence: any[] }) {
  if (!evidence.length) return null
  return <div><p className="text-xs font-black uppercase tracking-wide text-gray-400">Evidence</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{evidence.map((item, index) => {
    const url = item.url || item.src || item.value
    return url ? <a key={index} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 text-sm font-bold text-blue-700 hover:border-blue-300"><Eye size={15} />{item.title || item.name || `Attachment ${index + 1}`}</a> : <div key={index} className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{item.text || JSON.stringify(item)}</div>
  })}</div></div>
}

export function ActivityGradeForm({ response, scores, setScores, feedback, setFeedback, saving, onConfirm }: { response: any; scores: Record<string, string>; setScores: React.Dispatch<React.SetStateAction<Record<string, string>>>; feedback: string; setFeedback: React.Dispatch<React.SetStateAction<string>>; saving: boolean; onConfirm: () => void }) {
  const questions = findQuestionBlocks(response.page || {}) as any[]
  const results = response.result?.questions || {}
  const pending = questions.filter((question) => results[String(question.id)]?.grading_status === 'pending')
  const autoResults = Object.entries(results).filter(([, item]: any) => item.grading_status !== 'pending')
  const autoScore = autoResults.reduce((sum, [, item]: any) => sum + Number(item.score || 0), 0)
  const autoMax = autoResults.reduce((sum, [, item]: any) => sum + Number(item.max_score ?? item.points ?? 0), 0)
  const manualScore = pending.reduce((sum, question) => sum + Number(scores[String(question.id)] || 0), 0)
  const manualMax = pending.reduce((sum, question) => sum + Number(results[String(question.id)]?.max_score ?? getBlockScoring(response.page, question)?.points ?? 0), 0)
  const total = autoScore + manualScore
  const max = autoMax + manualMax
  const percent = max ? Math.round((total / max) * 1000) / 10 : 100
  const minimum = Number(response.activity?.settings?.grading?.minimum_score_percent ?? 70)
  const pass = percent >= minimum

  return <div className="grid gap-6 p-2 lg:grid-cols-[minmax(0,1fr)_220px]">
    <div className="space-y-5">{pending.map((question, index) => {
      const id = String(question.id)
      const result = results[id] || {}
      const scoring = getBlockScoring(response.page, question) || {}
      const maxScore = Number(result.max_score ?? result.points ?? scoring.points ?? 0)
      const answer = result.inputs || response.answer?.questions?.[id]?.inputs || {}
      return <section key={id} className="rounded-xl border border-gray-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-gray-400">Question {index + 1}</p><h3 className="mt-1 text-sm font-black text-gray-900">{question.content?.label || response.page?.title || 'Manual response'}</h3></div><span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-xs font-black text-gray-600">{maxScore} pts</span></div><div className="mt-4 space-y-2">{Object.entries(answer).map(([inputId, value]: any) => <div key={inputId} className="rounded-lg bg-gray-50 p-3"><p className="text-[10px] font-black uppercase text-gray-400">{question.content?.inputs?.find((input: any) => input.id === inputId)?.label || inputId}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-800">{value?.text || value?.url || 'No response'}</p></div>)}</div><div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3"><p className="text-[10px] font-black uppercase text-blue-600">Rubric</p><p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-blue-950">{scoring.rubric || 'No rubric was provided.'}</p></div><label className="mt-4 block text-xs font-black text-gray-600">Points earned <span className="font-medium text-gray-400">(0–{maxScore})</span><input type="number" min={0} max={maxScore} step="any" value={scores[id] ?? ''} onChange={(event) => { const value = event.target.value; setScores((current) => ({ ...current, [id]: value === '' ? '' : String(Math.max(0, Math.min(maxScore, Number(value)))) })) }} className="mt-2 h-11 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" /></label></section>
    })}<label className="block text-xs font-bold text-gray-600">Instructor note <span className="font-medium text-gray-400">(optional)</span><textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-blue-400" /></label><button onClick={onConfirm} disabled={saving || Object.values(scores).some((value) => value === '')} className="flex w-full items-center justify-center gap-2 rounded-lg bg-black px-5 py-3 text-sm font-black text-white disabled:opacity-40">{saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}Confirm grading</button></div>
    <aside className="h-fit space-y-3 lg:sticky lg:top-4"><Score label="Other questions" value={`${autoScore}/${autoMax}`} /><Score label="Manual grading" value={`${manualScore}/${manualMax}`} /><Score label="Total score" value={`${total}/${max}`} strong /><div className={cn('rounded-xl p-4', pass ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900')}><p className="text-2xl font-black">{percent}%</p><p className="mt-1 text-xs font-bold">{pass ? 'Passing' : 'Below passing'} · {minimum}% required</p></div></aside>
  </div>
}

export function ActivityAggregateGradeForm({ review, scores, setScores, feedback, setFeedback, saving, onConfirm }: { review: any; scores: Record<string, string>; setScores: React.Dispatch<React.SetStateAction<Record<string, string>>>; feedback: string; setFeedback: React.Dispatch<React.SetStateAction<string>>; saving: boolean; onConfirm: CallableFunction }) {
  const attempts = React.useMemo(() => buildAdminActivityAttempts(review), [review])
  const [questionFeedback, setQuestionFeedback] = React.useState<Record<string, string>>({})
  const [selected, setSelected] = React.useState(Math.max(0, attempts.length - 1))
  React.useEffect(() => { setSelected(Math.max(0, attempts.length - 1)); setQuestionFeedback({}) }, [attempts.length, review.review_id])
  const activeAttempt = attempts[selected] || attempts.at(-1)
  const questions = (review.attempts || []).flatMap((attempt: any) => {
    const blocks = findQuestionBlocks(attempt.page || {}) as any[]
    return blocks.filter((question) => attempt.result?.questions?.[String(question.id)]?.grading_status === 'pending').map((question) => ({ attempt, question, result: attempt.result.questions[String(question.id)], key: `${attempt.attempt_uuid}:${question.id}` }))
  })
  const ungradedCount = questions.filter((item: any) => scores[item.key] === '').length
  const manualScore = questions.reduce((sum: number, item: any) => sum + Number(scores[item.key] || 0), 0)
  const total = Number(review.auto_score || 0) + manualScore
  const max = Number(review.max_score || 0)
  const percent = max ? Math.round((total / max) * 1000) / 10 : 100
  const minimum = Number(review.minimum_score_percent ?? 70)
  const pass = percent >= minimum
  const bestIndex = attempts.reduce((best, item, index) => !item.pending && Number(item.percent ?? -1) > Number(attempts[best]?.percent ?? -1) ? index : best, -1)
  return <div className="p-2">
    {attempts.length > 1 ? <div className="mb-5 flex gap-1 overflow-x-auto border-b border-gray-200 pb-3">{attempts.map((attempt: any, index: number) => <button key={attempt.key} type="button" onClick={() => setSelected(index)} className={cn('flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold', selected === index ? 'bg-gray-950 text-white' : 'text-gray-500 hover:bg-gray-100')}><span>Attempt {index + 1}</span><span className={cn('rounded-md px-1.5 py-0.5 text-[10px]', selected === index ? 'bg-white/15' : 'bg-gray-100 text-gray-800', index === bestIndex && 'shadow-[0_0_14px_rgba(132,204,22,0.5)] ring-1 ring-lime-300')}>{attempt.pending ? '?' : `${attempt.percent}%`}</span>{index === bestIndex ? <Sparkles size={11} className="text-lime-500" /> : null}</button>)}</div> : null}
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div>{activeAttempt ? <><p className="mb-4 text-[11px] font-semibold text-gray-400">Submitted {formatReviewDate(activeAttempt.submittedAt)}</p>{activeAttempt.activityNotes?.length ? <div className="mb-4 space-y-2">{activeAttempt.activityNotes.map((note: any, index: number) => <div key={`${note.message}-${index}`} className="rounded-xl border border-blue-100 bg-blue-50 p-4"><p className="text-[10px] font-black uppercase tracking-wide text-blue-700">Activity note{note.grader ? ` · ${note.grader}` : ''}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-blue-950">{note.message}</p></div>)}</div> : null}<div className="space-y-3">{activeAttempt.questions.map((item: any, index: number) => {
        const fullMarks = !item.pending && item.max > 0 && item.score >= item.max
        return <section key={item.key} className={fullMarks ? 'rounded-xl bg-gray-50 px-4 py-3' : 'rounded-xl border border-gray-200 bg-white p-5 shadow-sm'}><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wide text-gray-400">Question {index + 1} · {item.pageTitle}</p><h3 className="mt-1 text-sm font-black text-gray-900">{item.title}</h3></div>{item.pending ? <span className="rounded-lg bg-blue-50 px-2 py-1 text-xs font-black text-blue-700">Needs grading</span> : <span className={cn('rounded-lg px-2 py-1 text-xs font-black', fullMarks ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800')}>{item.score}/{item.max}</span>}</div><AdminAnswerDisplay item={item} fullMarks={fullMarks} />{item.pending ? <><div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3"><p className="text-[10px] font-black uppercase text-blue-600">Rubric</p><p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-blue-950">{item.rubric || 'No rubric was provided.'}</p></div><div className="mt-4 grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]"><label className="block text-xs font-black text-gray-600">Points earned <span className="font-medium text-gray-400">(0–{item.max})</span><input type="number" min={0} max={item.max} step="any" value={scores[item.key] ?? ''} onChange={(event) => { const value = event.target.value; setScores((current) => ({ ...current, [item.key]: value === '' ? '' : String(Math.max(0, Math.min(item.max, Number(value)))) })) }} className="mt-2 h-11 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" /></label><label className="block text-xs font-black text-gray-600">Question note <span className="font-medium text-gray-400">(optional)</span><textarea value={questionFeedback[item.key] ?? ''} onChange={(event) => setQuestionFeedback((current) => ({ ...current, [item.key]: event.target.value }))} className="mt-2 min-h-20 w-full rounded-lg border border-gray-200 p-3 text-sm outline-none focus:border-blue-400" placeholder="Feedback specific to this answer" /></label></div></> : item.feedback ? <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-950"><p className="text-[10px] font-black uppercase tracking-wide text-amber-700">Question note</p><p className="mt-1 whitespace-pre-wrap">{item.feedback}</p></div> : null}</section>
      })}</div></> : <p className="py-12 text-center text-sm text-gray-400">No submission details available.</p>}</div>
      <aside className="h-fit space-y-4 lg:sticky lg:top-4"><div className={cn('rounded-xl border p-4', ungradedCount ? 'border-blue-200 bg-blue-50 text-blue-950' : pass ? 'border-green-200 bg-green-50 text-green-900' : 'border-amber-200 bg-amber-50 text-amber-950')}>{ungradedCount ? <><p className="text-2xl font-black">{ungradedCount}</p><p className="mt-1 text-xs font-bold">question{ungradedCount === 1 ? '' : 's'} need grading</p></> : <><p className="text-xs font-bold">Final score</p><p className="mt-1 text-3xl font-black">{percent}%</p><p className="mt-1 text-xs font-bold">{pass ? 'Passing' : 'Below passing'} · {minimum}% required</p></>}</div><label className="block text-xs font-bold text-gray-600">Activity note <span className="font-medium text-gray-400">(optional)</span><textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} className="mt-2 min-h-28 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-blue-400" placeholder="Feedback about the activity as a whole" /></label><button onClick={() => onConfirm(questionFeedback)} disabled={saving || ungradedCount > 0} className="flex w-full items-center justify-center gap-2 rounded-lg bg-black px-5 py-3 text-sm font-black text-white disabled:opacity-40">{saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}Confirm grading</button></aside>
    </div>
  </div>
}

function buildAdminActivityAttempts(review: any) {
  const history = review.attempt_history?.length ? review.attempt_history : review.attempts || []
  const byPage = new Map<string, any[]>()
  for (const attempt of history) {
    const pageUuid = attempt.page?.page_uuid || String(attempt.page_id)
    const items = byPage.get(pageUuid) || []
    items.push(attempt)
    byPage.set(pageUuid, items)
  }
  for (const items of byPage.values()) items.sort((left, right) => new Date(left.submitted_at).getTime() - new Date(right.submitted_at).getTime())
  const count = Math.max(0, ...Array.from(byPage.values()).map((items) => items.length))
  return Array.from({ length: count }, (_, attemptIndex) => {
    const selected = Array.from(byPage.values()).map((items) => items[Math.min(attemptIndex, items.length - 1)])
    const questions = selected.flatMap((attempt: any) => {
      const blocks = findQuestionBlocks(attempt.page || {}) as any[]
      const results = attempt.result?.questions || {}
      const rows = Object.entries(results).filter(([, result]: any) => ['graded', 'pending'].includes(result?.grading_status)).map(([id, result]: any, index) => {
        const question = blocks.find((block: any) => String(block.id) === String(id))
        const answer = attempt.answer?.questions?.[id] || (blocks.length === 1 ? attempt.answer : {}) || {}
        const scoring = getBlockScoring(attempt.page, question) || {}
        return adminQuestion(attempt, question, result, answer, `${attempt.attempt_uuid}:${id}`, index, scoring)
      })
      if (rows.length) return rows
      if (!Number(attempt.result?.max_score || 0) || !blocks[0]) return []
      return [adminQuestion(attempt, blocks[0], attempt.result, attempt.answer || {}, attempt.attempt_uuid, 0, getBlockScoring(attempt.page, blocks[0]) || {})]
    })
    const pending = questions.some((item: any) => item.pending)
    const score = questions.reduce((total: number, item: any) => total + Number(item.score || 0), 0)
    const max = questions.reduce((total: number, item: any) => total + Number(item.max || 0), 0)
    const submittedAt = selected.reduce((latest, attempt) => new Date(attempt.submitted_at).getTime() > new Date(latest).getTime() ? attempt.submitted_at : latest, selected[0]?.submitted_at || '')
    const activityNotes = uniqueReviewNotes(selected)
    return { key: `attempt-${attemptIndex}`, questions, activityNotes, pending, percent: pending ? null : max ? Math.round((score / max) * 100) : 0, submittedAt }
  })
}

function adminQuestion(attempt: any, question: any, result: any, answer: any, key: string, index: number, scoring: any) {
  return {
    key,
    pageTitle: attempt.page?.title || 'Activity',
    title: question?.content?.label || attempt.page?.title || `Question ${index + 1}`,
    kind: result?.kind || question?.kind,
    pending: result?.grading_status === 'pending',
    score: Number(result?.score || 0),
    max: Number(result?.max_score ?? result?.points ?? scoring?.points ?? 0),
    rubric: scoring?.rubric || '',
    feedback: result?.feedback || '',
    options: adminQuestionOptions(question, answer, result),
    selectedIds: result?.option_ids || result?.selected || answer?.option_ids || (answer?.option_id ? [answer.option_id] : []),
    correctIds: result?.correct_option_ids || [],
    responseText: Object.values(result?.inputs || answer?.inputs || {}).map((value: any) => value?.text ?? value?.value ?? '').filter(Boolean).join('\n\n'),
  }
}

function uniqueReviewNotes(attempts: any[]) {
  const notes = new Map<string, any>()
  for (const attempt of attempts) {
    const message = String(attempt.result?.feedback || '').trim()
    if (!message) continue
    const grader = attempt.result?.graded_by || {}
    const key = `${message}:${grader.user_id || ''}:${grader.org_id || ''}`
    if (!notes.has(key)) notes.set(key, { message, grader: [grader.staff_name, grader.org_name].filter(Boolean).join(' · ') })
  }
  return Array.from(notes.values())
}

function adminQuestionOptions(question: any, answer: any, result: any) {
  const configured = (question?.content?.options || []).map((option: any, index: number) => ({ id: String(option.id ?? option.value ?? index), text: option.text || option.label || `Option ${index + 1}` }))
  const custom = (answer?.custom_options || []).map((option: any, index: number) => ({ id: String(option.id ?? option.value ?? `custom-${index}`), text: option.text || option.label || option.value || `Option ${configured.length + index + 1}` }))
  const options = [...configured, ...custom]
  const known = new Set(options.map((option) => option.id))
  for (const id of [...(result?.option_ids || result?.selected || []), ...(result?.correct_option_ids || [])].map(String)) if (!known.has(id)) options.push({ id, text: id })
  return options
}

function AdminAnswerDisplay({ item, fullMarks }: { item: any; fullMarks: boolean }) {
  const [expanded, setExpanded] = React.useState(false)
  if (item.kind === 'multiple_choice' || item.kind === 'categorized_multi_select') {
    const selected = new Set((item.selectedIds || []).map(String))
    const correct = new Set((item.correctIds || []).map(String))
    return <div className="mt-4 space-y-2">{item.options.map((option: any) => { const chosen = selected.has(String(option.id)); const right = chosen && (correct.size ? correct.has(String(option.id)) : fullMarks); return <div key={option.id} className={cn('flex min-h-11 items-center justify-between rounded-lg border px-3 py-2.5 text-sm', chosen ? item.pending ? '-translate-y-0.5 border-blue-300 bg-white text-gray-900 shadow-sm' : right ? '-translate-y-0.5 border-green-400 bg-white text-green-950 shadow-sm' : '-translate-y-0.5 border-red-400 bg-white text-red-950 shadow-sm' : 'border-transparent bg-gray-50 text-gray-400')}><span>{option.text}</span>{chosen && !item.pending ? <span className={cn('flex h-5 w-5 items-center justify-center rounded-full', right ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>{right ? <Check size={13} /> : <X size={13} />}</span> : null}</div> })}</div>
  }
  if (item.kind === 'text_input' && item.responseText) {
    const long = item.responseText.length > 420
    return <div className="mt-4 rounded-lg bg-gray-50 p-3"><p className={cn('whitespace-pre-wrap text-sm leading-6 text-gray-800', long && !expanded && 'line-clamp-6')}>{item.responseText}</p>{long ? <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-2 text-xs font-bold text-gray-500 hover:text-gray-900">{expanded ? 'Show less' : 'Read full response'}</button> : null}</div>
  }
  return null
}

function formatReviewDate(value: string) { return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }

function Score({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className={cn('rounded-xl border border-gray-200 bg-white p-4', strong && 'border-blue-200 bg-blue-50')}><p className="text-xs font-bold text-gray-500">{label}</p><p className="mt-1 text-xl font-black text-gray-900">{value}</p></div> }

function AssignmentDetails({ data }: { data: any }) {
  const assignment = data.assignment || {}
  return <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]"><section className="rounded-xl border border-gray-100 bg-white p-6 nice-shadow"><h2 className="text-lg font-black text-gray-900">Assignment details</h2><dl className="mt-5 space-y-5"><Detail label="Description" value={data.program?.description || 'No description provided.'} /><Detail label="Welcome message" value={assignment.welcome_message || 'No welcome message.'} /><Detail label="Schedule" value={assignment.due_date ? `${formatDate(assignment.start_date || assignment.initiate_date)} – ${formatDate(assignment.due_date)}` : 'Self paced'} /></dl></section><section className="rounded-xl border border-gray-100 bg-white p-6 nice-shadow"><h2 className="text-lg font-black text-gray-900">Assigned staff</h2><p className="mt-1 text-sm text-gray-500">These staff members can review submissions.</p><div className="mt-4 space-y-2">{(assignment.staff || []).map((staff: any) => <div key={staff.id} className="flex items-center gap-3 rounded-lg bg-gray-50 p-3"><Avatar learner={staff} /><span className="text-sm font-bold text-gray-800">{displayName(staff)}</span></div>)}</div></section></div>
}

function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-black uppercase tracking-wide text-gray-400">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-800">{value}</dd></div> }
function EmptyReports() { return <div className="rounded-xl border border-dashed border-gray-200 bg-white py-24 text-center"><BarChart3 className="mx-auto text-gray-300" size={38} /><p className="mt-3 font-black text-gray-800">Reports are coming next</p><p className="mt-1 text-sm text-gray-500">Assignment exports and performance reporting will live here.</p></div> }

function Summary({ icon, label, value, detail, tone = 'neutral' }: { icon: React.ReactNode; label: string; value: string; detail: string; tone?: string }) { return <div className="rounded-xl border border-gray-100 bg-white p-4 nice-shadow"><div className="flex items-center gap-2 text-xs font-semibold text-gray-500">{icon}{label}</div><p className={cn('mt-3 truncate text-xl font-black', tone === 'blue' ? 'text-blue-600' : tone === 'green' ? 'text-green-700' : tone === 'amber' ? 'text-amber-600' : 'text-gray-900')}>{value}</p><p className="mt-1 truncate text-[11px] font-medium text-gray-400">{detail}</p></div> }
function FilterButton({ active, tone, onClick, children }: { active: boolean; tone?: string; onClick: () => void; children: React.ReactNode }) { return <button onClick={onClick} className={cn('inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition', active ? tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-800' : tone === 'blue' ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-gray-300 bg-gray-100 text-gray-900' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50')}>{children}</button> }
function Count({ children }: { children: React.ReactNode }) { return <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] shadow-sm">{children}</span> }
function Avatar({ learner }: { learner: any }) { const initials = `${learner.first_name?.[0] || learner.username?.[0] || '?'}${learner.last_name?.[0] || ''}`.toUpperCase(); return learner.avatar_image ? <img src={learner.avatar_image} alt="" className="h-8 w-8 rounded-full object-cover" /> : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-[10px] font-black text-white">{initials}</span> }
function Status({ status }: { status: string }) { const map: Record<string, [string, string, React.ReactNode]> = { completed: ['Complete', 'text-green-700', <CheckCircle2 key="c" size={13} />], submitted: ['Submitted', 'text-blue-700', <FileText key="f" size={13} />], ready_for_review: ['Ready to review', 'text-blue-700', <Eye key="e" size={13} />], in_progress: ['In progress', 'text-amber-600', <Clock3 key="t" size={13} />], not_started: ['Not started', 'text-gray-400', <Circle key="o" size={12} />] }; const item = map[status] || map.not_started; return <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-[10px] font-bold', item[1])}>{item[2]}{item[0]}</span> }
function PageLoader() { return <div className="flex min-h-[70vh] w-full items-center justify-center bg-[#f8f8f8]"><Loader2 className="animate-spin text-gray-400" size={24} /></div> }
function displayName(learner: any) { return [learner.first_name, learner.last_name].filter(Boolean).join(' ') || learner.username || 'Learner' }
function completionPercent(learner: any, objectives: any[]) { if (!objectives.length) return 0; const complete = objectives.filter((objective) => learner.cells?.[objective.objective_uuid]?.status === 'completed').length; return Math.round((complete / objectives.length) * 100) }
function formatDate(value: string) { return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) }
function scheduleLabel(dueDate?: string | null) { if (!dueDate) return 'Self paced'; const days = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000); return days >= 0 ? 'On schedule' : 'Past due' }
function nextMilestone(data: any) { const objective = data.objectives.find((item: any) => data.learners.some((learner: any) => learner.cells[item.objective_uuid]?.status !== 'completed')); return objective?.title || 'Program complete' }
