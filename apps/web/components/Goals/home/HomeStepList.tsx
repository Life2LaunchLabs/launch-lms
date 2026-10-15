'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@components/ui/button'
import { Skeleton } from '@components/ui/skeleton'
import { useHub } from '@components/Hub/HubContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { planVars } from '@components/Goals/planColors'
import { PathNode } from '@components/Goals/path/PathNode'
import { lockedSentence, statusLine } from '@components/Goals/path/stepText'
import { stepDefinition, type StepCardProps } from '@components/Goals/steps'
import { useStepActions } from '@components/Goals/useGoalActions'
import { getUriWithOrg } from '@services/config/config'
import { goalUrl } from '@services/goals/goals'
import type { HomeItem } from '@services/goals/home'
import { can, goalSteps, type Goal, type Step } from '@services/goals/types'
import { swrFetcher } from '@services/utils/ts/requests'

/** A home item as a step, until its goal loads with the full step (config, entries, materials). */
function itemStep(item: HomeItem): Step {
  return {
    step_uuid: item.step_uuid, stage_uuid: item.stage?.stage_uuid ?? null, position: 0, type: item.type, title: item.title, description: item.description || '',
    config: stepDefinition(item.type).defaultConfig(), materials: [], completed_by: 'learner', review_required: false,
    start_date: null, due_date: item.due_date, allow_late: false, held: false, after_step_uuids: [], requirement_links: [],
    status: item.status, locked: item.locked, locked_reason: item.locked_reason, state: item.state, fraction: item.fraction, result: item.result,
    submission: {}, answer: '', learner_note: '', reviewer_note: '', feedback_history: [], completed_at: item.completed_at,
    completion_method: null, entries: [], reference: null,
  }
}

export const itemKey = (item: HomeItem) => `${item.placement}:${item.step_uuid}`
export const isDone = (item: HomeItem) => item.state === 'done' || item.state === 'waiting'

type ListProps = {
  items: HomeItem[]
  orgslug: string
  token?: string
  // eslint-disable-next-line no-unused-vars
  getGoalColor: (goalUuid?: string) => string
  selectedKey: string
  // eslint-disable-next-line no-unused-vars
  onSelect: (item: HomeItem) => void
  // eslint-disable-next-line no-unused-vars
  onGoTo: (stepUuid: string) => void
}

/** Steps from several goals on one path, each under its goal's name, opening in place. */
export function HomeStepList({ items, orgslug, token, getGoalColor, selectedKey, onSelect, onGoTo }: ListProps) {
  return <ol className="flex flex-col">
    {items.map((item, index) => <HomeStepRow key={itemKey(item)} item={item} orgslug={orgslug} token={token} color={getGoalColor(item.goal.goal_uuid)}
      selected={itemKey(item) === selectedKey} last={index === items.length - 1} onSelect={() => onSelect(item)} onGoTo={onGoTo} />)}
  </ol>
}

type RowProps = { item: HomeItem; orgslug: string; token?: string; color: string; selected: boolean; last: boolean; onSelect: () => void; onGoTo: ListProps['onGoTo'] }

function HomeStepRow({ item, orgslug, token, color, selected, last, onSelect, onGoTo }: RowProps) {
  const router = useRouter()
  const hub = useHub()
  // Shared with the goal's own page, so a change on the card shows everywhere at once.
  const { data: goal } = useSWR<Goal>(token ? goalUrl(item.goal.goal_uuid) : null, (url: string) => swrFetcher(url, token))
  const full = goal ? goalSteps(goal).find((step) => step.step_uuid === item.step_uuid) : undefined
  const step = full || itemStep(item)
  const definition = stepDefinition(step.type)
  const RowResult = definition.RowResult
  const status = statusLine(step)
  const locked = step.state === 'locked'
  const done = step.state === 'done'
  const openActivity = () => router.push(getUriWithOrg(orgslug, `/plans/${encodeURIComponent(item.goal.goal_uuid)}/steps/${encodeURIComponent(item.step_uuid)}/activity`))
  const ask = hub ? () => hub.open({ prompt: `Help me with “${step.title}” in my goal “${item.goal.title}”.` }) : undefined

  return <li id={`step-${item.step_uuid}`} data-step-shell={item.step_uuid} data-plan="" style={planVars(color)} className="relative flex items-start gap-4 pb-4 scroll-mt-24">
    {!last ? <span aria-hidden="true" className={cn('absolute left-[28px] top-12 bottom-0 w-[3px] -translate-x-1/2 rounded-full', done ? 'bg-[var(--plan-face)]/60' : 'bg-border')} /> : null}
    <button type="button" onClick={onSelect} aria-label={`${step.title}, ${status}`} aria-expanded={selected} className="flex w-14 shrink-0 justify-center rounded-full pt-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
      <PathNode state={step.state} fraction={step.fraction} icon={definition.icon} selected={selected} />
    </button>
    <div className={cn('min-w-0 flex-1', selected ? 'rounded-2xl border-2 bg-card p-4 shadow-[0_4px_0_hsl(var(--edge))]' : 'pt-1', selected && (locked ? 'border-border' : 'border-[var(--plan-face)]'))}>
      <button type="button" onClick={onSelect} tabIndex={-1} className="flex w-full min-w-0 flex-col items-start gap-0.5 text-left">
        <span className="inline-flex max-w-full items-center gap-1.5 truncate text-xs font-extrabold text-[var(--plan-accent)]">{item.goal.title}</span>
        <span className={cn('max-w-full font-bold leading-snug', selected ? 'text-lg' : 'truncate text-base', (done || locked) && !selected && 'text-muted-foreground')}>{step.title}</span>
        <span className="text-xs font-semibold text-muted-foreground">{status}</span>
      </button>
      {!selected && RowResult && step.result ? <div className="mt-2"><RowResult step={step as never} /></div> : null}
      {selected ? <div className="mt-3 flex flex-col gap-3">
        {locked ? <LockedBody step={step} onGoTo={onGoTo} />
          : goal && full ? <StepCard goal={goal} step={full} orgslug={orgslug} token={token} openActivity={openActivity} />
          : <div className="flex flex-col gap-2" aria-hidden="true"><Skeleton className="h-4 w-4/5 rounded-md" /><Skeleton className="h-10 w-32 rounded-xl" /></div>}
        {ask && !done ? <Button type="button" variant="surface" className="self-start" onClick={ask}><Sparkles size={15} aria-hidden="true" />Ask Coach</Button> : null}
      </div> : null}
    </div>
  </li>
}

// eslint-disable-next-line no-unused-vars
function LockedBody({ step, onGoTo }: { step: Step; onGoTo: (stepUuid: string) => void }) {
  const reason = step.locked_reason
  const text = `${lockedSentence(step)} ${step.description || ''}`.trim()
  return <>
    {text ? <p className="text-sm leading-6 text-foreground/80">{text}</p> : null}
    {reason?.kind === 'after' ? <Button type="button" variant="surface" className="self-start" onClick={() => onGoTo(reason.step_uuid)}>Go to {reason.title}</Button> : null}
  </>
}

/** The step's own card body from the registry, worked on right here. */
function StepCard({ goal, step, orgslug, token, openActivity }: { goal: Goal; step: Step; orgslug: string; token?: string; openActivity: () => void }) {
  const actions = useStepActions(goal, step, token, openActivity)
  const CardBody = stepDefinition(step.type).CardBody as React.ComponentType<StepCardProps>
  const session = useLHSession() as any
  const canWork = can(goal, 'update_progress') || can(goal, 'contribute_fields')
  return <CardBody goal={goal} step={step} actions={actions} canWork={canWork} staff={false} orgslug={orgslug} token={token} viewerUserId={session?.data?.user?.id} />
}

/** A path of steps while they load: nodes on the line, a goal name, title and status beside each. */
export function HomeStepListSkeleton({ count = 4 }: { count?: number }) {
  return <ol aria-hidden="true" className="flex flex-col">
    {Array.from({ length: count }).map((_, index) => <li key={index} className="relative flex items-start gap-4 pb-4">
      {index < count - 1 ? <span className="absolute left-[28px] top-12 bottom-0 w-[3px] -translate-x-1/2 rounded-full bg-border" /> : null}
      <span className="flex w-14 shrink-0 justify-center pt-0.5"><span className="h-11 w-11 rounded-full bg-muted motion-safe:animate-pulse" /></span>
      <span className="flex min-w-0 flex-1 flex-col gap-2 pt-1.5">
        <span className="h-3 w-20 rounded-md bg-muted motion-safe:animate-pulse" />
        <span className="h-4 rounded-md bg-muted motion-safe:animate-pulse" style={{ width: `${[62, 48, 70, 55][index % 4]}%` }} />
        <span className="h-3 w-24 rounded-md bg-muted motion-safe:animate-pulse" />
      </span>
    </li>)}
  </ol>
}
