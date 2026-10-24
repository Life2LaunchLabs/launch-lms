'use client'

import React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { ArrowUpRight, Layers3, Loader2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LearnerRows } from '@components/Assignments/page/PeopleTab'
import { StatusLegend } from '@components/Assignments/StatusBar'
import { assignmentHref, datesLine } from '@components/Goals/admin/assignments/shared'
import AssignFlow from '@components/Assignments/assign/AssignFlow'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { cohortKey, goalAdminApi, type Cohort } from '@services/goals/admin'
import { assignmentApi, assignmentKeys } from '@services/assignments/assignments'
import { shownLearners } from '@services/assignments/people'
import { usePeopleContext } from './usePeople'

/**
 * The group's Plans tab: the plans handed to it, one assignment's learners at a time, each with where they are and what they need.
 * Its requirements report lives in Insights now; the old requirements view redirects there.
 */
export default function GroupWork({ orgslug, groupId }: { orgslug: string; groupId: number }) {
  const { orgId, token } = usePeopleContext()
  const { data: cohort, error, mutate } = useSWR(orgId && token ? cohortKey(groupId, orgId) : null,
    () => goalAdminApi.cohort(orgId, groupId, token), { revalidateOnFocus: false })
  return <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8f8f8] py-6 dark:bg-background">
    {error ? <p className="p-8 text-center text-sm text-muted-foreground">{error.message || 'This group’s plans didn’t load.'}</p>
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
  const { data: people, error } = useSWR(current && orgId && token ? assignmentKeys.people(orgId, current.assignment_uuid) : null,
    () => assignmentApi.people(orgId, current!.assignment_uuid, token), { revalidateOnFocus: false })
  const assign = <AssignFlow initialGroupIds={[groupId]} onAssigned={() => void refresh()} trigger={<button type="button" className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-medium hover:bg-muted"><Plus size={15} />Assign a plan</button>} />
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
      : !people ? <Spinner />
      : <div className="space-y-3">
        <div className="overflow-hidden rounded-2xl border border-border bg-card"><LearnerRows rows={shownLearners(people.learners, 'all', 'az')} ended={current.status === 'ended'} /></div>
        <StatusLegend />
      </div>}
  </div>
}
