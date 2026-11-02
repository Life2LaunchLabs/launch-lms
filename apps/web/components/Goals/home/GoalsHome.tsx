'use client'

import React from 'react'
import Link from 'next/link'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { ChevronDown, Compass, Map, Plus } from 'lucide-react'
import { Button } from '@components/ui/button'
import useGoalInvitations, { type OrgGoalInvitation } from '@components/Hooks/useGoalInvitations'
import { GoalTabs } from '@components/Goals/learner/GoalHeader'
import { groupByPhase, type PhaseGroup } from '@components/Goals/learner/phases'
import { planVars } from '@components/Goals/planColors'
import { getUriWithOrg } from '@services/config/config'
import { isGoalsKey } from '@services/goals/goals'
import { homeUrl } from '@services/goals/home'
import type { LifeDoc } from '@services/life/life'
import { goalSharingApi, myInvitationsKey, type ReceivedInvitation } from '@services/goals/sharing'
import type { GoalSummary } from '@services/goals/types'
import { swrFetcher } from '@services/utils/ts/requests'

/** The SWR key of the learner's home payload (finished goals waiting to greet them). */
export const homeKey = () => homeUrl()

type GoalsHomeProps = {
  orgslug: string
  token?: string
  /** The learner's active goals, shown in the phases of their life plan. */
  goals: GoalSummary[]
  finished: GoalSummary[]
  /** The learner's life plan; without one, goals sit in one group. */
  life?: LifeDoc | null
  // eslint-disable-next-line no-unused-vars
  choose: (goal: GoalSummary) => void
  // eslint-disable-next-line no-unused-vars
  onIntent?: (goal: GoalSummary) => void
  // eslint-disable-next-line no-unused-vars
  getGoalColor: (goalUuid?: string) => string
  // eslint-disable-next-line no-unused-vars
  onCreate: (phaseId?: string | null) => void
  creating: boolean
  finishedError?: boolean
  retryFinished?: () => void
}

const WHEN = { now: 'Now', next: 'Next', later: 'Later', done: 'Before' } as const
const monthYear = (value?: string) => {
  if (!value) return ''
  const [year, month] = value.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

/** The overview: invitations, then each phase of the learner's life with its goals, then finished goals. */
export default function GoalsHome({ orgslug, token, goals, finished, life, choose, onIntent, getGoalColor, onCreate, creating, finishedError, retryFinished }: GoalsHomeProps) {
  const { data: invitations = [] } = useSWR<ReceivedInvitation[]>(token ? myInvitationsKey() : null, (url: string) => swrFetcher(url, token), { revalidateOnFocus: true })
  const open = goals.filter((goal) => goal.target_kind !== 'group' && goal.status !== 'pending')
  // With nothing active and no plan, finished goals stay in reach under the empty state, opened.
  if (!open.length && !life?.phases?.length) return <div className="flex flex-col gap-10">
    <Invitations invitations={invitations} token={token} />
    <EmptyHome orgslug={orgslug} onCreate={() => onCreate()} creating={creating} />
    <FinishedGoals goals={finished} getGoalColor={getGoalColor} choose={choose} error={finishedError} retry={retryFinished} open />
  </div>

  const groups = groupByPhase(life, open)
  return <div className="flex flex-col gap-10">
    <Invitations invitations={invitations} token={token} />
    {groups.map((group) => <PhaseSection key={group.id || 'all'} group={group} orgslug={orgslug} choose={choose} onIntent={onIntent} getGoalColor={getGoalColor} onCreate={() => onCreate(group.id)} creating={creating} />)}
    {!life?.phases?.length ? <Link href={getUriWithOrg(orgslug, '/life')} className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-border p-4 hover:border-foreground/30">
      <Map size={20} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0"><b className="block font-bold">Map out the phases of your life</b><small className="block text-sm text-muted-foreground">Then each goal sits in the phase it belongs to.</small></span>
    </Link> : null}
    <FinishedGoals goals={finished} getGoalColor={getGoalColor} choose={choose} error={finishedError} retry={retryFinished} />
  </div>
}

// eslint-disable-next-line no-unused-vars
function PhaseSection({ group, orgslug, choose, onIntent, getGoalColor, onCreate, creating }: { group: PhaseGroup<GoalSummary>; orgslug: string; choose: (goal: GoalSummary) => void; onIntent?: (goal: GoalSummary) => void; getGoalColor: (goalUuid?: string) => string; onCreate: () => void; creating: boolean }) {
  const title = group.when ? `${WHEN[group.when]}: ${group.title}` : group.title
  return <section aria-label={title} className="flex flex-col gap-3">
    <div className="flex flex-wrap items-baseline gap-x-3">
      {group.when ? <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{WHEN[group.when]}</span> : null}
      <h2 className="text-xl font-extrabold tracking-tight">{group.title}</h2>
      {group.when && group.when !== 'now' && group.starts ? <span className="text-sm text-muted-foreground">from {monthYear(group.starts)}</span> : null}
    </div>
    <GoalTabs label={`Goals for ${group.title}`} goals={group.goals} getGoalColor={getGoalColor} choose={choose} onIntent={onIntent}>
      <div className="flex w-[78%] shrink-0 snap-start items-center gap-2 rounded-[18px] border-2 border-dashed border-border p-2 sm:w-[46%] md:w-auto">
        <Button type="button" variant="surface" size="sm" className="flex-1" onClick={onCreate} disabled={creating}><Plus size={15} />{creating ? 'Starting…' : 'Create your own'}</Button>
        <Button type="button" variant="ghost" size="sm" asChild><Link href={getUriWithOrg(orgslug, '/discover')}><Compass size={15} />Discover</Link></Button>
      </div>
    </GoalTabs>
  </section>
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
function FinishedGoals({ goals, getGoalColor, choose, error, retry, open = false }: { goals: GoalSummary[]; getGoalColor: (uuid?: string) => string; choose: (goal: GoalSummary) => void; error?: boolean; retry?: () => void; open?: boolean }) {
  if (error) return retry ? <Button variant="ghost" onClick={retry} className="w-fit text-xs">Retry finished goals</Button> : null
  if (!goals.length) return null
  return <details className="group/done" open={open}>
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
  return <div className="rounded-3xl border-2 border-dashed border-border px-6 py-14 text-center">
    <h2 className="text-2xl font-extrabold">Start with something that matters</h2>
    <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Set your own goal, or pick a badge to earn and its goal shows up here.</p>
    <div className="mt-6 flex flex-wrap justify-center gap-3">
      <Button type="button" variant="brand" onClick={onCreate} disabled={creating}><Plus size={16} />{creating ? 'Starting…' : 'Create your own'}</Button>
      <Button type="button" variant="surface" asChild><Link href={getUriWithOrg(orgslug, '/discover')}><Compass size={16} />Find one in Discover</Link></Button>
    </div>
  </div>
}
