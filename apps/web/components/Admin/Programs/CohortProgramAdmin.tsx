'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  Eye,
  FileText,
  Filter,
  Flag,
  Gauge,
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
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { programsApi } from '@services/programs/programs'
import { cn } from '@/lib/utils'

type FilterMode = 'all' | 'attention' | 'review'

export function CohortOverview({ orgslug, cohortId }: { orgslug: string; cohortId: number }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const key = org?.id && token ? `${getAPIUrl()}programs/cohorts/${cohortId}?org_id=${org.id}` : null
  const { data, isLoading } = useSWR(key, (url) => swrFetcher(url, token))
  if (isLoading || !data) return <PageLoader />
  const totalReview = data.programs.reduce((sum: number, program: any) => sum + program.ready_for_review_count, 0)
  const overall = data.programs.length ? Math.round(data.programs.reduce((sum: number, program: any) => sum + program.progress_percent, 0) / data.programs.length) : 0

  return (
    <main className="min-h-full w-full bg-[#f8f8f8] px-8 py-7">
      <div className="mx-auto max-w-7xl">
        <Link href={getUriWithOrg(orgslug, routePaths.org.dash.users.usergroups())} className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-black"><ArrowLeft size={15} />All cohorts</Link>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4"><div><div className="flex items-center gap-2 text-xs font-bold text-blue-600"><Users size={14} />Cohort overview</div><h1 className="mt-1 text-3xl font-black text-gray-950">{data.cohort.name}</h1><p className="mt-1 text-sm text-gray-500">{data.cohort.description || `${data.learner_count} learners across ${data.programs.length} programs`}</p></div><Link href={getUriWithOrg(orgslug, routePaths.org.dash.programs())} className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2.5 text-sm font-bold text-white"><Layers3 size={16} />Assign a program</Link></div>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Summary icon={<Gauge size={17} />} label="Overall progress" value={`${overall}%`} detail="Across assigned programs" tone="blue" /><Summary icon={<Users size={17} />} label="Learners" value={String(data.learner_count)} detail="Current cohort roster" /><Summary icon={<FileText size={17} />} label="Ready to review" value={String(totalReview)} detail="Submissions awaiting staff" tone={totalReview ? 'amber' : 'green'} /><Summary icon={<Target size={17} />} label="Programs" value={String(data.programs.length)} detail="Active requirement sets" /></div>
        <section className="mt-7 rounded-xl border border-gray-100 bg-white nice-shadow"><div className="border-b border-gray-100 px-6 py-5"><h2 className="font-black text-gray-900">Assigned programs</h2><p className="mt-0.5 text-xs text-gray-500">Open a program to manage its requirements and learner progress.</p></div><div className="grid gap-4 p-6 lg:grid-cols-2">
          {data.programs.length ? data.programs.map((program: any) => <Link key={program.assignment_uuid} href={getUriWithOrg(orgslug, routePaths.org.dash.users.cohortProgram(cohortId, program.assignment_uuid))} className="group rounded-xl border border-gray-200 p-5 transition hover:border-blue-300 hover:shadow-sm"><div className="flex items-start justify-between gap-4"><div><p className="text-base font-black text-gray-900 group-hover:text-blue-700">{program.program_name}</p><p className="mt-1 text-xs font-medium text-gray-500">{program.objective_count} requirements · {program.learner_count} learners</p></div><ChevronRight className="text-gray-300 group-hover:text-blue-600" size={18} /></div><div className="mt-5 flex items-center justify-between text-xs font-bold"><span className="text-gray-500">{program.progress_percent}% complete</span><span className={cn(program.ready_for_review_count ? 'text-amber-700' : 'text-green-700')}>{program.ready_for_review_count ? `${program.ready_for_review_count} to review` : 'No reviews waiting'}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${program.progress_percent}%` }} /></div><div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4 text-xs text-gray-500"><span className="inline-flex items-center gap-1.5"><CalendarDays size={13} />{program.due_date ? `Due ${formatDate(program.due_date)}` : 'Self paced'}</span><span className="font-bold text-gray-800">Open matrix</span></div></Link>) : <div className="col-span-full py-16 text-center"><Layers3 className="mx-auto text-gray-300" size={38} /><p className="mt-3 font-bold text-gray-700">No programs assigned yet</p><p className="mt-1 text-sm text-gray-500">Assign a reusable program to start tracking this cohort.</p></div>}
        </div></section>
      </div>
    </main>
  )
}

export function CohortProgramMatrix({ orgslug, cohortId, assignmentUuid }: { orgslug: string; cohortId: number; assignmentUuid: string }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const router = useRouter()
  const searchParams = useSearchParams()
  const key = org?.id && token ? `${getAPIUrl()}programs/assignments/${assignmentUuid}/matrix?org_id=${org.id}` : null
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
  const attentionCount = data.learners.filter((learner: any) => completionPercent(learner, data.objectives) < Math.max(0, data.assignment.progress_percent - 20)).length
  const filteredLearners = data.learners.filter((learner: any) => filter === 'all' || (filter === 'review' ? Object.values(learner.cells).some((cell: any) => ['submitted', 'ready_for_review'].includes(cell.status)) : completionPercent(learner, data.objectives) < Math.max(0, data.assignment.progress_percent - 20)))
  const selectedObjective = data.objectives.find((objective: any) => objective.objective_uuid === focusObjective)

  const chooseProgram = (uuid: string) => {
    const target = data.programs.find((program: any) => program.assignment_uuid === uuid)
    if (target) router.push(getUriWithOrg(orgslug, routePaths.org.dash.users.cohortProgram(cohortId, uuid)))
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
    <main className="min-h-full w-full bg-[#f8f8f8] px-6 py-6">
      <div className="mx-auto max-w-[1500px]">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-400"><Link href={getUriWithOrg(orgslug, routePaths.org.dash.users.usergroups())} className="hover:text-black">Users</Link><ChevronRight size={12} /><Link href={getUriWithOrg(orgslug, routePaths.org.dash.users.cohort(cohortId))} className="hover:text-black">{data.cohort?.name}</Link><ChevronRight size={12} /><span className="text-gray-700">{data.program?.name}</span></div>
        <Link href={getUriWithOrg(orgslug, routePaths.org.dash.users.cohort(cohortId))} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-800"><ArrowLeft size={14} />Cohort overview</Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4"><div><div className="flex items-center gap-2"><h1 className="text-3xl font-black text-gray-950">{data.cohort?.name}</h1><span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400"><Users size={13} />{data.learners.length} learners</span></div></div></div>

        <div className="mt-4 inline-flex max-w-full overflow-x-auto rounded-xl border border-gray-200 bg-white p-1 nice-shadow">{data.programs.map((program: any) => <button key={program.assignment_uuid} onClick={() => chooseProgram(program.assignment_uuid)} className={cn('min-w-40 rounded-lg px-4 py-2.5 text-left transition', program.assignment_uuid === assignmentUuid ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50')}><span className="block truncate text-xs font-black">{program.program_name}</span><span className={cn('mt-0.5 block text-[10px] font-semibold', program.assignment_uuid === assignmentUuid ? 'text-blue-100' : 'text-gray-400')}>{program.progress_percent}% complete</span></button>)}</div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Summary icon={<CalendarDays size={17} />} label="Timeline" value={scheduleLabel(data.assignment.due_date)} detail={data.assignment.due_date ? `Due ${formatDate(data.assignment.due_date)}` : 'No fixed end date'} tone="green" /><Summary icon={<Gauge size={17} />} label="Overall progress" value={`${data.assignment.progress_percent}%`} detail={`${data.assignment.completed_count} objective completions`} tone="blue" /><Summary icon={<AlertTriangle size={17} />} label="Learners falling behind" value={String(attentionCount)} detail="Based on cohort pace" tone={attentionCount ? 'amber' : 'green'} /><Summary icon={<Flag size={17} />} label="Next milestone" value={nextMilestone(data)} detail={selectedObjective ? 'Selected requirement' : 'First incomplete requirement'} /></div>

        <section className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white nice-shadow">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3"><div className="flex flex-wrap gap-2"><FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>All learners <ChevronDown size={13} /></FilterButton><FilterButton active={filter === 'attention'} tone="amber" onClick={() => setFilter('attention')}>Needs attention <Count>{attentionCount}</Count></FilterButton><FilterButton active={filter === 'review'} tone="blue" onClick={() => setFilter('review')}>Ready to review <Count>{reviewCount}</Count></FilterButton></div><div className="flex items-center gap-2"><button onClick={() => inPerson && openCompletion(inPerson, data.learners.filter((learner: any) => learner.cells[inPerson.objective_uuid]?.status !== 'completed').map((learner: any) => learner.id))} disabled={!inPerson} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-black text-gray-800 hover:bg-gray-50 disabled:opacity-40"><Sparkles size={14} />Mark in-person activity complete</button><button className="rounded-lg border border-gray-200 p-2 text-gray-500"><Filter size={16} /></button></div></div>
          <div className="overflow-auto pb-20"><table className="min-w-[1050px] w-full border-collapse text-left"><thead className="sticky top-0 z-20 bg-white"><tr><th className="sticky left-0 z-30 w-56 min-w-56 border-b border-r border-gray-200 bg-white px-4 py-4 text-xs font-black text-gray-700"><span className="inline-flex items-center gap-2"><Pin size={13} />Learner</span></th>{data.objectives.map((objective: any) => { const focused = focusObjective === objective.objective_uuid; return <th key={objective.objective_uuid} onClick={() => { setFocusObjective(focused ? null : objective.objective_uuid); setSelected(new Set()) }} className={cn('min-w-40 cursor-pointer border-b border-r border-gray-200 px-3 py-3 align-top transition', focused ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : focusObjective ? 'bg-gray-50/70 opacity-60' : 'bg-white hover:bg-gray-50')}><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-black leading-4 text-gray-800">{objective.title}</p><p className="mt-1 text-[10px] font-semibold text-gray-400">{objective.target_days ? `Day ${objective.target_days}` : objective.kind === 'badge' ? `Badge v${objective.badge_major_version || 1}` : objective.evidence_policy !== 'none' ? 'Evidence enabled' : 'Staff confirmation'}</p></div>{focused && <Pin size={13} className="text-blue-600" />}</div>{focused && <button onClick={(event) => { event.stopPropagation(); selectColumnEligible(objective) }} className="mt-2 text-[10px] font-black text-blue-700 hover:underline">Select incomplete</button>}</th>})}</tr></thead><tbody>{filteredLearners.map((learner: any) => { const rowFocused = focusUser === learner.id; return <tr key={learner.id} className={cn('transition', rowFocused ? 'relative z-10 bg-blue-50/70 shadow-[0_4px_14px_rgba(37,99,235,0.12)]' : focusUser ? 'opacity-55' : 'hover:bg-gray-50/50')}><th onClick={() => setFocusUser(rowFocused ? null : learner.id)} className={cn('sticky left-0 z-10 cursor-pointer border-b border-r border-gray-200 px-4 py-3 transition', rowFocused ? 'bg-blue-50' : 'bg-white')}><div className="flex items-center gap-3"><button onClick={(event) => { event.stopPropagation(); const next = new Set(selected); next.has(learner.id) ? next.delete(learner.id) : next.add(learner.id); setSelected(next) }} className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', selected.has(learner.id) ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white')}>{selected.has(learner.id) && <Check size={11} />}</button><Avatar learner={learner} /><div className="min-w-0"><p className="truncate text-xs font-black text-gray-800">{displayName(learner)}</p><p className="mt-0.5 text-[10px] font-semibold text-gray-400">{completionPercent(learner, data.objectives)}% complete</p></div>{rowFocused && <Pin size={13} className="ml-auto text-blue-600" />}</div></th>{data.objectives.map((objective: any) => { const cell = learner.cells[objective.objective_uuid] || { status: 'not_started' }; const colFocused = focusObjective === objective.objective_uuid; const expanded = rowFocused || colFocused; return <td key={objective.objective_uuid} onClick={() => { setFocusUser(learner.id); setFocusObjective(objective.objective_uuid) }} className={cn('cursor-pointer border-b border-r border-gray-200 px-3 py-3 transition', colFocused ? 'bg-blue-50/80 ring-1 ring-inset ring-blue-200' : focusObjective ? 'opacity-55' : '', expanded ? 'h-16' : 'h-14')}><Status status={cell.status} />{expanded && cell.evidence?.length ? <button className="mt-2 inline-flex items-center gap-1 text-[10px] font-black text-blue-700"><Eye size={11} />Preview evidence</button> : null}{rowFocused && colFocused && cell.status !== 'completed' ? <button onClick={(event) => { event.stopPropagation(); openCompletion(objective, [learner.id]) }} className="mt-2 block text-[10px] font-black text-blue-700 hover:underline">Complete objective</button> : null}</td>})}</tr>})}</tbody></table></div>
          {selected.size > 0 && focusObjective ? <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-gray-200 bg-white p-2.5 shadow-xl"><span className="flex items-center gap-2 px-2 text-sm font-black text-gray-800"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white"><Check size={12} /></span>{selected.size} selected</span><button onClick={() => openCompletion(selectedObjective, Array.from(selected))} className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2.5 text-xs font-black text-white"><CheckCircle2 size={15} />Mark complete</button><button onClick={() => { setCompletionObjective(selectedObjective); setCompletionUsers(Array.from(selected)); setCompletionOpen(true) }} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-xs font-black text-gray-700"><MessageSquareText size={14} />Add note</button><button onClick={() => setSelected(new Set())} className="p-2 text-gray-400 hover:text-black"><X size={16} /></button></div> : null}
        </section>
      </div>
      <Modal isDialogOpen={completionOpen} onOpenChange={setCompletionOpen} minHeight="no-min" minWidth="md" dialogTitle="Complete objective" dialogDescription={completionUsers.length === 1 ? 'Confirm this learner’s completion and add context for them.' : `Apply this completion to ${completionUsers.length} learners at once.`} dialogContent={<div className="space-y-5 p-2"><div className="rounded-xl bg-gray-50 p-4"><p className="text-xs font-semibold text-gray-400">Objective</p><p className="mt-1 text-sm font-black text-gray-900">{completionObjective?.title}</p><p className="mt-1 text-xs text-gray-500">{completionUsers.length === 1 ? displayName(data.learners.find((learner: any) => learner.id === completionUsers[0]) || {}) : `${completionUsers.length} selected learners`}</p></div><label className="block text-xs font-bold text-gray-600"><span className="mb-2 block">Completion date</span><input type="date" value={completionDate} onChange={(e) => setCompletionDate(e.target.value)} className="h-11 w-full rounded-lg border border-gray-200 px-3 text-sm" /></label><label className="block text-xs font-bold text-gray-600"><span className="mb-2 block">Staff note <span className="font-medium text-gray-400">(optional)</span></span><textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-28 w-full rounded-lg border border-gray-200 p-3 text-sm outline-none focus:border-blue-400" placeholder={completionUsers.length > 1 ? 'This shared note will be visible on every selected learner’s record.' : 'Add helpful context or feedback.'} /><span className="mt-1 block text-right text-[10px] font-semibold text-gray-400">{note.length}/500</span></label><div className="rounded-lg bg-blue-50 p-3 text-xs font-semibold text-blue-700">Learners will be notified of completion. Their progress will update in every program that reuses this objective.</div><button onClick={() => void confirmCompletion()} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-black px-5 py-3 text-sm font-black text-white disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}Confirm completion</button></div>} />
    </main>
  )
}

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
