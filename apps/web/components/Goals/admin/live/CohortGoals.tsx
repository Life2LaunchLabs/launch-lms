'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { CalendarDays, ChevronRight, Layers3, Plus } from 'lucide-react'
import GoalAssignmentModal from '@components/Goals/admin/templates/GoalAssignmentModal'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { AssignmentSummary, Cohort, ManagedUser } from '@services/goals/admin'
import { cn } from '@/lib/utils'
import CohortMatrix from './CohortMatrix'
import { PersonAvatar, personName } from './ui'

/** A group's goal templates as chips, with the chosen one's learner × step matrix. */
export function CohortGoals({ orgslug, orgId, token, groupId, cohort, refresh }: { orgslug: string; orgId: number; token?: string; groupId: number; cohort: Cohort; refresh: () => Promise<unknown> }) {
  const router = useRouter()
  const params = useSearchParams()
  const all = [...cohort.assignments, ...cohort.completed_assignments]
  const requested = params.get('assignment')
  const current = all.find((item) => item.assignment_uuid === requested) || cohort.assignments[0] || cohort.completed_assignments[0]
  const choose = (uuid: string) => router.replace(getUriWithOrg(orgslug, routePaths.org.admin.people.group(groupId, 'plans', uuid)))
  const assign = <GoalAssignmentModal initialGroupIds={[groupId]} onAssigned={() => void refresh()} trigger={<button type="button" className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-sm font-medium hover:bg-gray-50"><Plus size={15} />Assign a goal template</button>} />
  if (!current) return <div className="px-10 pb-10"><div className="rounded-xl border-2 border-dashed border-border bg-card py-16 text-center"><Layers3 className="mx-auto h-9 w-9 text-gray-300" /><p className="mt-3 text-sm text-muted-foreground">No goal templates are assigned to this group yet.</p><div className="mt-4 flex justify-center">{assign}</div></div></div>
  return <div className="space-y-4 px-10 pb-10">
    <div className="flex flex-wrap items-center gap-2">
      {all.map((item) => <button key={item.assignment_uuid} type="button" onClick={() => choose(item.assignment_uuid)} aria-pressed={item.assignment_uuid === current.assignment_uuid} className={cn('inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-semibold', item.assignment_uuid === current.assignment_uuid ? 'border-black bg-black text-white' : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50')}>{item.template_title}{item.status === 'ended' ? <span className="text-[10px] font-bold uppercase opacity-70">ended</span> : <span className={cn('text-xs', item.assignment_uuid === current.assignment_uuid ? 'text-white/70' : 'text-gray-500')}>{item.progress_percent}%</span>}</button>)}
      <span className="flex-1" />
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-500"><CalendarDays size={13} />{current.due_date ? `${current.status !== 'ended' ? 'Ends' : 'Ended'} ${new Date(current.due_date).toLocaleDateString()}` : 'Self paced'}{current.staff?.length ? ` · Staff: ${current.staff.map((person) => personName(person)).join(', ')}` : ''}</span>
      {assign}
    </div>
    <CohortMatrix orgslug={orgslug} orgId={orgId} token={token} assignmentUuid={current.assignment_uuid} />
  </div>
}

const hrefFor = (orgslug: string, item: AssignmentSummary & { goal: { goal_uuid: string } }) => getUriWithOrg(orgslug, item.cohort ? routePaths.org.admin.people.group(item.cohort.id, 'plans', item.assignment_uuid) : routePaths.org.admin.livePlan(item.goal.goal_uuid))

/** One learner's goals for staff: the templates handed to them, and other goals staff can see. */
export function ManagedUserGoals({ orgslug, userId, data, refresh, compact = false }: { orgslug: string; userId: number; data?: ManagedUser; refresh: () => Promise<unknown>; compact?: boolean }) {
  const assigned = data?.assignments || []
  const assignedGoals = new Set(assigned.map((item) => item.goal.goal_uuid))
  const others = (data?.goals || []).filter((goal) => !assignedGoals.has(goal.goal_uuid))
  const rows = [
    ...assigned.map((item) => ({ key: item.goal.goal_uuid, href: hrefFor(orgslug, item), title: item.template_title, detail: item.cohort?.name ? `Through ${item.cohort.name}` : 'Assigned directly', progress: item.goal.progress, people: item.goal.people || [] })),
    ...others.map((goal) => ({ key: goal.goal_uuid, href: getUriWithOrg(orgslug, routePaths.org.admin.livePlan(goal.goal_uuid)), title: goal.title, detail: goal.status === 'finished' ? 'Finished' : 'Shared with staff', progress: goal.progress, people: goal.people || [] })),
  ]
  return <section className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow">
    <div className="flex items-center justify-between gap-4">
      <div><h2 className="flex items-center gap-2 text-sm font-bold text-gray-900"><Layers3 size={17} />Goals</h2><p className="mt-1 text-xs text-gray-500">Goal templates handed to them directly or through a group. Their own goals stay private unless they share them.</p></div>
      <GoalAssignmentModal initialUserIds={[userId]} onAssigned={() => void refresh()} trigger={<button type="button" className="inline-flex items-center gap-1.5 rounded-lg bg-black px-3 py-2 text-xs font-bold text-white"><Plus size={14} />Assign a goal template</button>} />
    </div>
    {rows.length ? <div className={cn('mt-4 grid gap-3', !compact && 'md:grid-cols-2')}>{rows.map((row) => {
      const percent = row.progress.total ? Math.round(row.progress.done * 100 / row.progress.total) : 0
      return <Link key={row.key} href={row.href} className="group rounded-lg border border-gray-200 p-4 transition hover:border-blue-300">
        <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-gray-900 group-hover:text-blue-700">{row.title}</p><p className="mt-1 text-xs text-gray-500">{row.detail}</p></div><ChevronRight size={16} className="text-gray-300 group-hover:text-blue-600" /></div>
        <div className="mt-3 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${percent}%` }} /></div><span className="text-[10px] font-black text-gray-500">{percent}%</span></div>
        {row.people.length ? <div className="mt-3 flex items-center gap-2" title={row.people.map((item) => `${personName(item)}, ${item.role}`).join('\n')}>
          <div className="flex -space-x-1.5">{row.people.slice(0, 4).map((item) => <span key={item.id} className="rounded-full ring-2 ring-white"><PersonAvatar person={item} size={22} /></span>)}</div>
          <span className="truncate text-[11px] text-gray-500">{row.people.length === 1 ? `${personName(row.people[0])} · ${row.people[0].role}` : `${row.people.length} people helping`}</span>
        </div> : null}
      </Link>
    })}</div> : <div className="mt-4 rounded-lg border border-dashed border-gray-200 py-8 text-center text-xs font-semibold text-gray-400">No goal templates handed to them yet.</div>}
  </section>
}
