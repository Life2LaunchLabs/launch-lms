'use client'

import React from 'react'
import Link from 'next/link'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { ChevronDown, Compass, Plus } from 'lucide-react'
import { Button } from '@components/ui/button'
import useGoalInvitations, { type OrgGoalInvitation } from '@components/Hooks/useGoalInvitations'
import { GoalTabs } from '@components/Goals/learner/GoalHeader'
import { phaseOfGoal, type PhaseGroup } from '@components/Goals/learner/phases'
import PhaseStack, { StartPhaseCard } from '@components/Goals/phases/PhaseStack'
import PhaseDialog, { type PhaseEdit } from '@components/Goals/phases/PhaseDialog'
import useLifePlan from '@components/Goals/phases/useLifePlan'
import { usePlacePhotos } from '@components/Goals/phases/PhaseCover'
import SharedWithYou from '@components/LifePlan/SharedWithYou'
import { planVars } from '@components/Goals/planColors'
import { getUriWithOrg, routePaths } from '@services/config/config'
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

/** A phase's name with when it is: "NOW Finish high school", "NEXT College from Sep 2027". */
export function PhaseHeading({ group, as: Tag = 'h2', children }: { group: Pick<PhaseGroup<unknown>, 'title' | 'when' | 'starts'>; as?: 'h1' | 'h2'; children?: React.ReactNode }) {
  return <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
    {group.when ? <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{WHEN[group.when]}</span> : null}
    <Tag className="text-xl font-extrabold tracking-tight">{group.title}</Tag>
    {group.when && group.when !== 'now' && group.starts ? <span className="text-sm text-muted-foreground">from {monthYear(group.starts)}</span> : null}
    {children}
  </div>
}

/** Start a goal in a phase, or find one: one row under the phase's goals, whatever their number. */
export function AddToPhase({ orgslug, phaseTitle, empty, onCreate, creating }: { orgslug: string; phaseTitle?: string; empty?: boolean; onCreate: () => void; creating: boolean }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-[18px] border-2 border-dashed border-border p-2 pl-4">
    <span className="min-w-0 flex-1 text-sm text-muted-foreground">{empty ? `No goals${phaseTitle ? ` for ${phaseTitle}` : ''} yet.` : 'Add another goal here.'}</span>
    <Button type="button" variant="surface" size="sm" onClick={onCreate} disabled={creating}><Plus size={15} />{creating ? 'Starting…' : 'Create your own'}</Button>
    <Button type="button" variant="ghost" size="sm" asChild><Link href={getUriWithOrg(orgslug, '/discover')}><Compass size={15} />Discover</Link></Button>
  </div>
}

/** Plans: invitations, then the phases of the learner's life as pictures, then finished goals. */
export default function GoalsHome({ orgslug, token, goals, finished, life, choose, onIntent, getGoalColor, onCreate, creating, finishedError, retryFinished }: GoalsHomeProps) {
  const router = useRouter()
  const { data: invitations = [] } = useSWR<ReceivedInvitation[]>(token ? myInvitationsKey() : null, (url: string) => swrFetcher(url, token), { revalidateOnFocus: true })
  const { change } = useLifePlan(token)
  const photos = usePlacePhotos(token)
  const [phaseEdit, setPhaseEdit] = React.useState<PhaseEdit | null>(null)
  const open = goals.filter((goal) => goal.target_kind !== 'group' && goal.status !== 'pending')
  const dialog = <PhaseDialog edit={phaseEdit} doc={life || null} token={token} onClose={() => setPhaseEdit(null)} change={change}
    onAdded={(id) => router.push(getUriWithOrg(orgslug, routePaths.org.phase(id)))} />

  if (life?.phases?.length) {
    const goalsIn: Record<string, number> = {}
    for (const goal of open) { const id = phaseOfGoal(life, goal.goal_uuid); if (id) goalsIn[id] = (goalsIn[id] || 0) + 1 }
    return <div className="mx-auto flex w-full max-w-[780px] flex-col gap-10">
      <SharedWithYou token={token} />
      <Invitations invitations={invitations} token={token} />
      <PhaseStack doc={life} orgslug={orgslug} goalsIn={goalsIn} photos={photos} onAdd={() => setPhaseEdit({ mode: 'add' })} />
      <FinishedGoals goals={finished} getGoalColor={getGoalColor} choose={choose} error={finishedError} retry={retryFinished} />
      {dialog}
    </div>
  }

  // No phases yet: start the plan with the phase they're in; goals they already have wait below.
  return <div className="mx-auto flex w-full max-w-[780px] flex-col gap-10">
    <SharedWithYou token={token} />
    <Invitations invitations={invitations} token={token} />
    <StartPhaseCard onStart={() => setPhaseEdit({ mode: 'add' })} />
    {open.length ? <section aria-label="Your goals" className="flex flex-col gap-3">
      <h2 className="text-xl font-extrabold tracking-tight">Your goals</h2>
      <GoalTabs label="Your goals" goals={open} getGoalColor={getGoalColor} choose={choose} onIntent={onIntent} />
      <AddToPhase orgslug={orgslug} onCreate={() => onCreate()} creating={creating} />
    </section> : <EmptyHome orgslug={orgslug} onCreate={() => onCreate()} creating={creating} />}
    <FinishedGoals goals={finished} getGoalColor={getGoalColor} choose={choose} error={finishedError} retry={retryFinished} open={!open.length} />
    {dialog}
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
    <h2 className="text-2xl font-extrabold">Then add something to work toward</h2>
    <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Set your own goal, or pick a badge to earn and its goal shows up here.</p>
    <div className="mt-6 flex flex-wrap justify-center gap-3">
      <Button type="button" variant="brand" onClick={onCreate} disabled={creating}><Plus size={16} />{creating ? 'Starting…' : 'Create your own'}</Button>
      <Button type="button" variant="surface" asChild><Link href={getUriWithOrg(orgslug, '/discover')}><Compass size={16} />Find one in Discover</Link></Button>
    </div>
  </div>
}
