'use client'

import React from 'react'
import Link from 'next/link'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { ChevronDown, Compass, Plus } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Reveal, Skeleton } from '@components/ui/skeleton'
import useGoalInvitations, { type OrgGoalInvitation } from '@components/Hooks/useGoalInvitations'
import { planVars } from '@components/Goals/planColors'
import { getUriWithOrg } from '@services/config/config'
import { isGoalsKey } from '@services/goals/goals'
import { homeUrl, type GoalsHomePayload } from '@services/goals/home'
import { goalSharingApi, myInvitationsKey, type ReceivedInvitation } from '@services/goals/sharing'
import type { GoalSummary } from '@services/goals/types'
import { swrFetcher } from '@services/utils/ts/requests'
import { HomeStepListSkeleton } from './HomeStepList'
import { Week } from './WeekSection'

/** The SWR key of the learner's This week payload. */
export const homeKey = () => homeUrl()

type GoalsHomeProps = {
  orgslug: string
  token?: string
  /** The learner's active goals; the overview's tabs show them above this. */
  goals: GoalSummary[]
  finished: GoalSummary[]
  // eslint-disable-next-line no-unused-vars
  choose: (goal: GoalSummary) => void
  // eslint-disable-next-line no-unused-vars
  getGoalColor: (goalUuid?: string) => string
  onCreate: () => void
  creating: boolean
  finishedError?: boolean
  retryFinished?: () => void
}

/** The overview below the goal tabs: invitations, this week's steps, what comes later, then finished goals. */
export default function GoalsHome({ orgslug, token, goals, finished, choose, getGoalColor, onCreate, creating, finishedError, retryFinished }: GoalsHomeProps) {
  const { data, error, mutate: retry } = useSWR<GoalsHomePayload>(token ? homeKey() : null, (url: string) => swrFetcher(url, token), { revalidateOnFocus: true })
  const { data: invitations = [] } = useSWR<ReceivedInvitation[]>(token ? myInvitationsKey() : null, (url: string) => swrFetcher(url, token), { revalidateOnFocus: true })

  if (error) return <div className="rounded-xl border border-border bg-card p-5" role="alert"><p className="text-sm">Your weekly steps could not load.</p><button type="button" onClick={() => void retry()} className="mt-3 min-h-11 text-sm font-semibold underline">Try again</button></div>
  if (data && !data.goals.length && !goals.length) return <><Invitations invitations={invitations} token={token} /><EmptyHome orgslug={orgslug} onCreate={onCreate} creating={creating} /></>

  return <div className="flex flex-col gap-10">
    <Invitations invitations={invitations} token={token} />
    <Reveal ready={Boolean(data)} fallback={<WeekSkeleton />}>
      {data ? <Week data={data} orgslug={orgslug} token={token} getGoalColor={getGoalColor} /> : null}
    </Reveal>
    <FinishedGoals goals={finished} getGoalColor={getGoalColor} choose={choose} error={finishedError} retry={retryFinished} />
  </div>
}

/** The overview's shape while the week loads: the heading, pace, bar and a few steps. */
export function WeekSkeleton() {
  return <div className="flex flex-col gap-4">
    <div className="flex items-end justify-between gap-3">
      <div className="flex flex-col gap-2"><Skeleton className="h-3 w-24 rounded-md" /><Skeleton className="h-7 w-36 rounded-lg" /></div>
      <Skeleton className="h-10 w-20 rounded-xl" />
    </div>
    <Skeleton className="h-3 rounded-full" />
    <HomeStepListSkeleton count={4} />
  </div>
}

/** Invitations to work on someone's goal, and goals an organization handed the learner, answered here. */
function Invitations({ invitations, token }: { invitations: ReceivedInvitation[]; token?: string }) {
  const [busy, setBusy] = React.useState('')
  const { invitations: orgGoals, respond: respondOrg } = useGoalInvitations()
  if (!invitations.length && !orgGoals.length) return null
  const answer = async (uuid: string, send: () => Promise<unknown>) => {
    setBusy(uuid)
    try { await send(); await mutate(isGoalsKey) } catch { toast.error('Could not respond to this invitation') } finally { setBusy('') }
  }
  const respond = (uuid: string, accept: boolean) => answer(uuid, () => goalSharingApi.respondInvitation(uuid, accept, token))
  const respondGoal = (goal: OrgGoalInvitation, accept: boolean) => answer(goal.goal_uuid, () => respondOrg(goal, accept))
  return <section aria-label="Goal invitations" className="flex flex-col gap-3">
    <h2 className="text-xl font-extrabold tracking-tight">Invitations</h2>
    {orgGoals.map((goal) => <div key={goal.goal_uuid} className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-border bg-card p-4">
      <div className="min-w-0 flex-1">
        <p className="font-bold">{goal.title}</p>
        <p className="text-sm text-muted-foreground">{goal.organization?.name || 'Launch LMS'}</p>
      </div>
      <Button size="sm" variant="ghost" disabled={busy === goal.goal_uuid} onClick={() => void respondGoal(goal, false)}>Decline</Button>
      <Button size="sm" variant="brand" disabled={busy === goal.goal_uuid} onClick={() => void respondGoal(goal, true)}>Accept</Button>
    </div>)}
    {invitations.map((invite) => <div key={invite.invitation_uuid} className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-border bg-card p-4">
      <div className="min-w-0 flex-1">
        <p className="font-bold">{invite.goal.title}</p>
        <p className="text-sm text-muted-foreground">{invite.organization?.name || invite.invited_by?.name || invite.invited_by?.username || 'Launch LMS'}{invite.kind !== 'subject' ? ` · Help as ${invite.role.name}` : ''}</p>
      </div>
      <Button size="sm" variant="ghost" disabled={busy === invite.invitation_uuid} onClick={() => void respond(invite.invitation_uuid, false)}>Decline</Button>
      <Button size="sm" variant="brand" disabled={busy === invite.invitation_uuid} onClick={() => void respond(invite.invitation_uuid, true)}>Accept</Button>
    </div>)}
  </section>
}

// eslint-disable-next-line no-unused-vars
function FinishedGoals({ goals, getGoalColor, choose, error, retry }: { goals: GoalSummary[]; getGoalColor: (uuid?: string) => string; choose: (goal: GoalSummary) => void; error?: boolean; retry?: () => void }) {
  if (error) return retry ? <Button variant="ghost" onClick={retry} className="w-fit text-xs">Retry finished goals</Button> : null
  if (!goals.length) return null
  return <details className="group/done">
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-xl py-2">
      <h2 className="text-xl font-extrabold tracking-tight">Finished</h2>
      <span className="text-sm text-muted-foreground">{goals.length} {goals.length === 1 ? 'goal' : 'goals'}</span>
      <ChevronDown size={18} className="ml-auto text-muted-foreground transition-transform group-open/done:rotate-180" aria-hidden="true" />
    </summary>
    <ul className="mt-2 flex flex-col gap-2">{goals.map((goal) => <li key={goal.goal_uuid}><button type="button" onClick={() => choose(goal)} data-plan="" style={planVars(getGoalColor(goal.goal_uuid))} className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-card px-4 text-left hover:bg-raised">
      <span className="h-3 w-3 rounded-full bg-[var(--plan-face)]" aria-hidden="true" /><span className="flex-1 font-bold">{goal.title}</span><span className="text-xs text-muted-foreground">Done</span>
    </button></li>)}</ul>
  </details>
}

function EmptyHome({ orgslug, onCreate, creating }: { orgslug: string; onCreate: () => void; creating: boolean }) {
  return <div className="mt-8 rounded-3xl border-2 border-dashed border-border px-6 py-14 text-center">
    <h2 className="text-2xl font-extrabold">Start with something that matters</h2>
    <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Set your own goal, or pick a badge to earn and its goal shows up here.</p>
    <div className="mt-6 flex flex-wrap justify-center gap-3">
      <Button type="button" variant="brand" onClick={onCreate} disabled={creating}><Plus size={16} />{creating ? 'Creating…' : 'Create your own'}</Button>
      <Button type="button" variant="surface" asChild><Link href={getUriWithOrg(orgslug, '/discover')}><Compass size={16} />Find one in Discover</Link></Button>
    </div>
  </div>
}
