'use client'

import React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { ArrowUpRight, Layers3, Loader2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import AssignmentLearners from '@components/Goals/admin/assignments/AssignmentLearners'
import { assignmentHref, datesLine } from '@components/Goals/admin/assignments/shared'
import GroupRequirementsGrid from '@components/Goals/admin/live/GroupRequirementsGrid'
import GoalAssignmentModal from '@components/Goals/admin/templates/GoalAssignmentModal'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { cohortKey, goalAdminApi, matrixKey, type Cohort } from '@services/goals/admin'
import type { GroupView } from '@services/routing/paths'
import { usePeopleContext } from './usePeople'

const TABS: Array<{ id: GroupView | undefined; label: string }> = [{ id: undefined, label: 'Chat' }, { id: 'plans', label: 'Plans' }, { id: 'requirements', label: 'Requirements' }]

/** A group's chat, plans and requirements, one at a time beside the list. */
export function GroupTabs({ orgslug, groupId, view }: { orgslug: string; groupId: number; view?: GroupView }) {
  return <nav aria-label="Group" className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-3">
    {TABS.map((tab) => <Link key={tab.label} href={getUriWithOrg(orgslug, routePaths.org.admin.people.group(groupId, tab.id))} aria-current={view === tab.id ? 'page' : undefined}
      className={cn('rounded-full px-3 py-1 text-sm font-semibold', view === tab.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>{tab.label}</Link>)}
  </nav>
}

/** The group's plans (one assignment's learners, with export) or its requirements report. */
export default function GroupWork({ orgslug, groupId, view }: { orgslug: string; groupId: number; view: GroupView }) {
  const { orgId, token } = usePeopleContext()
  const { data: cohort, error, mutate } = useSWR(view === 'plans' && orgId && token ? cohortKey(groupId, orgId) : null,
    () => goalAdminApi.cohort(orgId, groupId, token), { revalidateOnFocus: false })
  return <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8f8f8] py-6">
    {view === 'requirements' ? <div className="px-4 md:px-10"><GroupRequirementsGrid orgslug={orgslug} orgId={orgId} token={token} groupId={groupId} /></div>
      : error ? <p className="p-8 text-center text-sm text-muted-foreground">{error.message || 'This group’s plans didn’t load.'}</p>
      : !cohort ? <Spinner />
      : <React.Suspense fallback={<Spinner />}><GroupPlans orgslug={orgslug} groupId={groupId} cohort={cohort} refresh={() => mutate()} /></React.Suspense>}
  </div>
}

const Spinner = () => <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

/** The plans handed to a group as chips, with the chosen one's learners from its assignment page. */
function GroupPlans({ orgslug, groupId, cohort, refresh }: { orgslug: string; groupId: number; cohort: Cohort; refresh: () => Promise<unknown> }) {
  const { orgId, token } = usePeopleContext()
  const requested = useSearchParams().get('assignment')
  const all = [...cohort.assignments, ...cohort.completed_assignments]
  const current = all.find((item) => item.assignment_uuid === requested) || all[0]
  const { data: matrix, error } = useSWR(current && orgId && token ? matrixKey(current.assignment_uuid, orgId) : null,
    () => goalAdminApi.matrix(orgId, current!.assignment_uuid, token), { revalidateOnFocus: false })
  const assign = <GoalAssignmentModal initialGroupIds={[groupId]} onAssigned={() => void refresh()} trigger={<button type="button" className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-medium hover:bg-muted"><Plus size={15} />Assign a plan</button>} />
  if (!current) return <div className="px-4 md:px-10"><div className="rounded-xl border-2 border-dashed border-border bg-card py-16 text-center"><Layers3 className="mx-auto h-9 w-9 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">No plans are assigned to this group yet.</p><div className="mt-4 flex justify-center">{assign}</div></div></div>
  return <div className="space-y-4 px-4 md:px-10">
    <div className="flex flex-wrap items-center gap-2">
      {all.map((item) => <Link key={item.assignment_uuid} href={getUriWithOrg(orgslug, routePaths.org.admin.people.group(groupId, 'plans', item.assignment_uuid))} aria-current={item.assignment_uuid === current.assignment_uuid ? 'true' : undefined}
        className={cn('inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-semibold', item.assignment_uuid === current.assignment_uuid ? 'border-foreground bg-foreground text-background' : 'border-border bg-background hover:bg-muted')}>
        {item.template_title}<span className="text-xs opacity-70">{item.status === 'ended' ? 'ended' : `${item.progress_percent}%`}</span>
      </Link>)}
      <span className="flex-1" />
      <span className="text-xs text-muted-foreground">{datesLine(current)}</span>
      <Link href={getUriWithOrg(orgslug, assignmentHref(current))} className="inline-flex min-h-9 items-center gap-1 text-xs font-bold text-blue-700"><ArrowUpRight size={14} />Open assignment</Link>
      {assign}
    </div>
    {error ? <p className="p-8 text-center text-sm text-muted-foreground">{error.message || 'This plan’s learners didn’t load.'}</p>
      : !matrix ? <Spinner />
      : <AssignmentLearners matrix={matrix} orgslug={orgslug} orgId={orgId} token={token} />}
  </div>
}
