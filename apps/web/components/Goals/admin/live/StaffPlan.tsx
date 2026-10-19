'use client'

import React from 'react'
import Link from 'next/link'
import useSWR, { useSWRConfig } from 'swr'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { Archive, ArrowLeft, Loader2, Shield } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import GoalHeaderActions from '@components/Goals/learner/GoalHeaderActions'
import { GoalHeaderCard } from '@components/Goals/learner/GoalHeader'
import { planVars } from '@components/Goals/planColors'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { goalsApi, goalUrl, isGoalsKey } from '@services/goals/goals'
import { goalLifecycleApi } from '@services/goals/lifecycle'
import { can, type Goal } from '@services/goals/types'
import StaffGoalPath from './StaffGoalPath'
import { PageLoader } from './ui'

/**
 * One learner's plan from the staff side: its header card (who it's shared with, settings, the
 * plan's feed) over the path the learner sees, with staff controls on each step. The feed opens
 * beside it; ?chat=plan opens it on arrival.
 */
export default function StaffPlan({ orgslug, goalUuid }: { orgslug: string; goalUuid: string }) {
  const session = useLHSession() as any
  const org = useOrg() as any
  const router = useRouter()
  const token: string | undefined = session?.data?.tokens?.access_token
  const orgId = Number(org?.id)
  const { data: goal, isLoading, error } = useSWR<Goal>(token ? goalUrl(goalUuid) : null, () => goalsApi.get(goalUuid, token), { revalidateOnFocus: false })

  if (isLoading) return <PageLoader tall />
  if (error || !goal) return <main className="flex min-h-[70vh] items-center justify-center bg-background px-4">
    <div className="rounded-xl border border-border bg-card p-10 text-center">
      <Shield className="mx-auto text-muted-foreground" size={38} aria-hidden="true" />
      <h1 className="mt-3 text-lg font-black">Plan unavailable</h1>
      <p className="mt-1 text-sm text-muted-foreground">You need access to this plan to view it.</p>
      <Link href={getUriWithOrg(orgslug, routePaths.org.dash.plans())} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-blue-700"><ArrowLeft size={14} />Back to the Inbox</Link>
    </div>
  </main>

  const subject = goal.subject
  const learnerPage = subject?.username ? routePaths.org.dash.users.userPage(subject.username, 'plans') : routePaths.org.dash.plans()
  const back = () => router.push(getUriWithOrg(orgslug, learnerPage))
  return <main className="min-h-full w-full bg-background px-4 pb-12 pt-6 sm:px-6 lg:px-10">
    <div className="mx-auto max-w-3xl space-y-6">
      <Breadcrumbs items={[
        { label: 'Users', href: getUriWithOrg(orgslug, routePaths.org.dash.users.users()) },
        ...(subject?.username ? [{ label: subject.name || subject.username, href: getUriWithOrg(orgslug, learnerPage) }] : []),
        { label: goal.title },
      ]} />
      <StaffGoalPath goal={goal} orgslug={orgslug} orgId={orgId} token={token} viewerUserId={session?.data?.user?.id}
        header={(color) => <div data-plan="" style={planVars(color)}>
          <GoalHeaderCard goal={goal as never} done={goal.progress.done} total={goal.progress.total}
            actions={<div className="flex flex-col gap-3">
              <GoalHeaderActions orgslug={orgslug} goal={goal} token={token} onBack={back} />
              <ArchivePlan goal={goal} token={token} onArchived={back} />
            </div>} />
        </div>} />
    </div>
  </main>
}

/** Takes an organization's plan off the learner's list, for staff who may. */
function ArchivePlan({ goal, token, onArchived }: { goal: Goal; token?: string; onArchived: () => void }) {
  const { mutate } = useSWRConfig()
  const [saving, setSaving] = React.useState(false)
  if (!can(goal, 'archive_plan') || goal.status === 'archived') return null
  const archive = async () => {
    if (!window.confirm(`Archive “${goal.title}”? It comes off ${goal.subject?.name || 'the learner'}’s list; the template and other learners don’t change.`)) return
    setSaving(true)
    try { await goalLifecycleApi.archive(goal.goal_uuid, token); await mutate((key) => isGoalsKey(key)); toast.success('Plan archived.'); onArchived() } catch (problem: any) { toast.error(problem?.message || 'Could not archive the plan.') } finally { setSaving(false) }
  }
  return <button type="button" disabled={saving} onClick={() => void archive()} className="flex w-fit items-center gap-1.5 text-xs font-bold opacity-80 hover:underline hover:opacity-100 disabled:opacity-50">
    {saving ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} aria-hidden="true" />}Archive plan
  </button>
}
