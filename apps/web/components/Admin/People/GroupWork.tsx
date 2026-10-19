'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CohortGoals } from '@components/Goals/admin/live/CohortGoals'
import GroupRequirementsGrid from '@components/Goals/admin/live/GroupRequirementsGrid'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { cohortKey, goalAdminApi } from '@services/goals/admin'
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

/** The group's plans (each assignment's grid, with export) or its requirements report. */
export default function GroupWork({ orgslug, groupId, view }: { orgslug: string; groupId: number; view: GroupView }) {
  const { orgId, token } = usePeopleContext()
  const { data: cohort, error, mutate } = useSWR(view === 'plans' && orgId && token ? cohortKey(groupId, orgId) : null,
    () => goalAdminApi.cohort(orgId, groupId, token), { revalidateOnFocus: false })
  return <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8f8f8] py-6">
    {view === 'requirements' ? <div className="px-4 md:px-10"><GroupRequirementsGrid orgslug={orgslug} orgId={orgId} token={token} groupId={groupId} /></div>
      : error ? <p className="p-8 text-center text-sm text-muted-foreground">{error.message || 'This group’s plans didn’t load.'}</p>
      : !cohort ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      : <React.Suspense><CohortGoals orgslug={orgslug} orgId={orgId} token={token} groupId={groupId} cohort={cohort} refresh={() => mutate()} /></React.Suspense>}
  </div>
}
