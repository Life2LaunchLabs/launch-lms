'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, ClipboardCheck, Gauge, History, ListChecks, Settings, Shield, Users } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { PathNode } from '@components/Goals/path/PathNode'
import { shortDate, statusLine } from '@components/Goals/path/stepText'
import { stepDefinition } from '@components/Goals/steps'
import { goalsApi, goalUrl } from '@services/goals/goals'
import { goalSteps, type Goal, type Step } from '@services/goals/types'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { cn } from '@/lib/utils'
import StaffGoalPath from './StaffGoalPath'
import { GoalActivityAndFiles, GoalReviews, GoalSettings, ArchiveGoalButton } from './StaffGoalPanels'
import StaffGoalPeople from './StaffGoalPeople'
import { EmptyState, PageLoader, PersonAvatar, personName, REVIEW_CAPABILITY, SectionCard } from './ui'

export type StaffGoalSubpage = 'overview' | 'steps' | 'reviews' | 'people' | 'activity' | 'settings'

const TABS = [
  { id: 'overview' as const, label: 'Overview', icon: Gauge },
  { id: 'steps' as const, label: 'Steps', icon: ListChecks },
  { id: 'reviews' as const, label: 'Reviews', icon: ClipboardCheck },
  { id: 'people' as const, label: 'People & roles', icon: Users },
  { id: 'activity' as const, label: 'Activity & files', icon: History },
  { id: 'settings' as const, label: 'Settings', icon: Settings },
]

const isDone = (step: Step) => step.status === 'completed' || step.status === 'excused'
/** Waiting on staff: a handed-in step, or a staff step not done yet. */
export const waitingOnStaff = (step: Step) => step.status === 'submitted' || (step.completed_by === 'staff' && !isDone(step) && !step.held && !step.locked)
const overdue = (step: Step) => Boolean(step.due_date && !isDone(step) && new Date(`${step.due_date}T23:59:59`).getTime() < Date.now())

function attention(goal: Goal) {
  const steps = goalSteps(goal)
  const reasons: string[] = []
  const late = steps.filter(overdue).length
  const held = steps.filter((step) => step.held && !isDone(step)).length
  const retry = steps.filter((step) => step.status === 'changes_requested').length
  if (late) reasons.push(`${late} overdue step${late === 1 ? '' : 's'}`)
  if (held) reasons.push(`${held} step${held === 1 ? '' : 's'} on hold`)
  if (retry) reasons.push(`${retry} step${retry === 1 ? '' : 's'} sent back to the learner`)
  return reasons
}

/** A learner's live goal as staff see it: overview, the path with cards, reviews, people, activity and settings. */
export default function StaffGoalDetail({ orgslug, goalUuid, activeSubpage = 'overview' }: { orgslug: string; goalUuid: string; activeSubpage?: StaffGoalSubpage }) {
  const session = useLHSession() as any
  const org = useOrg() as any
  const token: string | undefined = session?.data?.tokens?.access_token
  const orgId = Number(org?.id)
  const { data: goal, isLoading, error } = useSWR<Goal>(token ? goalUrl(goalUuid) : null, () => goalsApi.get(goalUuid, token), { revalidateOnFocus: false })

  if (isLoading) return <PageLoader tall />
  if (error || !goal) return <main className="flex min-h-[70vh] items-center justify-center bg-[#f8f8f8]"><div className="rounded-xl border border-gray-200 bg-white p-10 text-center"><Shield className="mx-auto text-gray-300" size={38} /><h1 className="mt-3 text-lg font-black">Goal unavailable</h1><p className="mt-1 text-sm text-gray-500">You need access to this goal to view it.</p><Link href={getUriWithOrg(orgslug, routePaths.org.admin.assignments())} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-blue-700"><ArrowLeft size={14} />Back to the Inbox</Link></div></main>

  const reviewer = goal.capabilities.includes(REVIEW_CAPABILITY)
  const waiting = goalSteps(goal).filter(waitingOnStaff).length
  const subject = goal.subject
  const tabs = TABS.filter((tab) => tab.id !== 'reviews' || reviewer)
  return <main className="min-h-full w-full bg-[#f8f8f8]">
    <header className="relative z-10 bg-[#fcfbfc] px-6 tracking-tight nice-shadow lg:px-10">
      <div className="pb-4 pt-6">
        <Breadcrumbs items={[{ label: 'People', href: getUriWithOrg(orgslug, routePaths.org.admin.people.root()) }, ...(subject?.username ? [{ label: subject.name || subject.username, href: getUriWithOrg(orgslug, routePaths.org.admin.people.user(subject.username)) }] : []), { label: goal.title }]} />
        <p className="mt-3 text-[10px] font-black uppercase tracking-[0.14em] text-gray-500">Learner goal · their own progress and changes</p>
      </div>
      <div className="flex flex-col gap-5 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <PersonAvatar person={subject} size={56} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-2xl font-black text-gray-950">{subject?.name || 'Invited learner'}</h1><StatusBadge status={goal.status} /></div>
            <p className="mt-1 truncate text-sm font-bold text-gray-700">{goal.title}</p>
            <p className="mt-1 text-xs text-gray-500">Owner: {goal.owner?.name || 'Unassigned'}{goal.target_date ? ` · Target ${shortDate(goal.target_date)}` : ' · Self-paced'}</p>
          </div>
        </div>
        <ArchiveGoalButton goal={goal} token={token} />
      </div>
      <nav className="flex overflow-x-auto text-sm font-black" aria-label="Goal administration">{tabs.map((tab) => {
        const Icon = tab.icon
        return <Link key={tab.id} href={getUriWithOrg(orgslug, routePaths.org.admin.livePlan(goal.goal_uuid, tab.id))} className={cn('flex shrink-0 items-center gap-2 border-black px-3 py-2 transition', activeSubpage === tab.id ? 'border-b-4' : 'opacity-50 hover:opacity-75')}>
          <Icon size={16} />{tab.label}{tab.id === 'reviews' && waiting ? <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">{waiting}</span> : null}
        </Link>
      })}</nav>
    </header>
    <div className="mx-auto max-w-[1500px] px-5 py-6 lg:px-8">
      {activeSubpage === 'overview' ? <Overview goal={goal} orgslug={orgslug} /> : null}
      {activeSubpage === 'steps' ? <StaffGoalPath goal={goal} orgslug={orgslug} orgId={orgId} token={token} viewerUserId={session?.data?.user?.id} /> : null}
      {activeSubpage === 'reviews' ? reviewer ? <GoalReviews goal={goal} orgId={orgId} token={token} /> : <EmptyState title="You don’t review this goal" /> : null}
      {activeSubpage === 'people' ? <StaffGoalPeople goal={goal} token={token} /> : null}
      {activeSubpage === 'activity' ? <GoalActivityAndFiles goal={goal} token={token} /> : null}
      {activeSubpage === 'settings' ? <GoalSettings goal={goal} token={token} /> : null}
    </div>
  </main>
}

function Overview({ goal, orgslug }: { goal: Goal; orgslug: string }) {
  const steps = goalSteps(goal)
  const open = steps.filter((step) => !isDone(step))
  const upcoming = [...open].filter((step) => step.due_date).sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
  const list = (upcoming.length ? upcoming : open).slice(0, 5)
  const waiting = steps.filter(waitingOnStaff)
  const reasons = attention(goal)
  const next = upcoming[0] || open[0]
  const percent = goal.progress.total ? Math.round(goal.progress.done * 100 / goal.progress.total) : 0
  const stageOf = (step: Step) => goal.stages.find((stage) => stage.stage_uuid === step.stage_uuid)?.title
  return <div className="space-y-5">
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={<Gauge size={17} />} label="Progress" value={`${percent}%`} detail={`${goal.progress.done} of ${goal.progress.total} steps done`} tone="text-blue-600" />
      <Metric icon={<ClipboardCheck size={17} />} label="Waiting on staff" value={String(waiting.length)} detail={waiting.length ? 'Reviews and sign-offs' : 'Nothing waiting'} tone={waiting.length ? 'text-amber-700' : 'text-green-700'} />
      <Metric icon={<AlertTriangle size={17} />} label="Needs attention" value={String(reasons.length)} detail={reasons[0] || 'On track'} tone={reasons.length ? 'text-amber-700' : 'text-green-700'} />
      <Metric icon={<CalendarDays size={17} />} label="Next deadline" value={next?.due_date ? shortDate(next.due_date) : 'Open-ended'} detail={next?.title || 'Every step is done'} />
    </section>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.7fr)]">
      <section className="rounded-xl border border-gray-100 bg-white nice-shadow">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4"><div><h2 className="font-black text-gray-900">What’s coming next</h2><p className="mt-1 text-xs text-gray-500">The next open steps on this learner’s goal.</p></div><Link href={getUriWithOrg(orgslug, routePaths.org.admin.livePlan(goal.goal_uuid, 'steps'))} className="text-xs font-black text-blue-700">All steps</Link></div>
        <div className="divide-y divide-gray-100">
          {list.map((step) => <Link key={step.step_uuid} href={`${getUriWithOrg(orgslug, routePaths.org.admin.livePlan(goal.goal_uuid, 'steps'))}#step-${step.step_uuid}`} className="flex items-center gap-3 p-4 hover:bg-gray-50">
            <PathNode state={step.state} fraction={step.fraction} icon={stepDefinition(step.type).icon} size={34} />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-gray-900">{step.title}</span><span className={cn('mt-0.5 block text-[11px] font-semibold', overdue(step) ? 'text-red-700' : 'text-gray-500')}>{[stageOf(step), overdue(step) ? `Overdue · ${statusLine(step)}` : statusLine(step)].filter(Boolean).join(' · ')}</span></span>
          </Link>)}
          {!open.length ? <div className="py-14 text-center"><CheckCircle2 className="mx-auto text-gray-300" size={34} /><p className="mt-3 text-sm font-black text-gray-700">Every step is done</p></div> : null}
        </div>
      </section>
      <aside className="space-y-5">
        <SectionCard title="Goal context"><dl className="space-y-4">
          <Detail label="Learner" value={personName(goal.subject)} />
          <Detail label="Owner" value={goal.owner?.name || 'Unassigned'} />
          <Detail label="Came from" value={goal.source === 'assignment' ? 'Assigned by the organization' : goal.source === 'badge' ? 'Started from a badge' : goal.ownership === 'personal' ? 'Their own goal' : 'Organization goal'} />
          <Detail label="Schedule" value={goal.target_date ? `${goal.start_date ? `${shortDate(goal.start_date)} – ` : 'Until '}${shortDate(goal.target_date)}` : 'Self-paced'} />
        </dl></SectionCard>
        {reasons.length ? <section className="rounded-xl border border-amber-200 bg-amber-50 p-5"><h2 className="flex items-center gap-2 font-black text-amber-950"><AlertTriangle size={17} />Needs attention</h2><ul className="mt-3 space-y-2 text-sm text-amber-900">{reasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul></section> : null}
      </aside>
    </div>
  </div>
}

function Metric({ icon, label, value, detail, tone = 'text-gray-900' }: { icon: React.ReactNode; label: string; value: string; detail: string; tone?: string }) {
  return <div className="rounded-xl border border-gray-100 bg-white p-4 nice-shadow"><div className="flex items-center gap-2 text-xs font-semibold text-gray-500">{icon}{label}</div><p className={cn('mt-3 text-xl font-black', tone)}>{value}</p><p className="mt-1 truncate text-[11px] text-gray-400">{detail}</p></div>
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[10px] font-black uppercase tracking-wide text-gray-400">{label}</dt><dd className="mt-1 text-sm font-semibold text-gray-800">{value}</dd></div>
}

export function StatusBadge({ status }: { status: Goal['status'] }) {
  return <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-black uppercase', status === 'active' ? 'bg-green-50 text-green-700' : status === 'finished' ? 'bg-blue-50 text-blue-700' : status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600')}>{status === 'pending' ? 'invited' : status}</span>
}
