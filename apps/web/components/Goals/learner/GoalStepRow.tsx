'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@components/ui/button'
import { Skeleton } from '@components/ui/skeleton'
import { PathNode } from '@components/Goals/path/PathNode'
import { aggregateLine, aggregateNode, lockedSentence, statusLine } from '@components/Goals/path/stepText'
import { stepDefinition } from '@components/Goals/steps'
import StepBody from '@components/Goals/steps/StepBody'
import { useStepActions } from '@components/Goals/useGoalActions'
import { StepChatButton } from '@components/Goals/chat/GoalChat'
import type { StepAggregate } from '@services/goals/admin'
import { can, type Goal, type Step } from '@services/goals/types'

/** Who is looking at the path. */
export type PathViewer = { orgslug: string; token?: string; viewerUserId?: number }

/**
 * Where the path is seen from: the learner on their own plan, staff over one learner's
 * shoulder, or staff on an assignment's plan across its cohort.
 */
export type PathPerspective = 'learner' | 'staff' | 'cohort'

/**
 * What a step's card lets the viewer do: the learner works their own steps; staff who review
 * the goal approve, send back or mark done for them. Nobody works a step from a cohort's plan.
 */
export function stepAccess(goal: Goal, perspective: PathPerspective, viewerUserId?: number) {
  const subject = viewerUserId !== undefined && goal.subject?.id === viewerUserId
  return {
    canWork: perspective === 'learner' && subject && can(goal, 'update_progress'),
    staff: perspective !== 'learner' && can(goal, 'complete_restricted_objectives'),
  }
}

type RowProps = {
  goal: Goal
  step: Step
  viewer: PathViewer
  perspective: PathPerspective
  selected: boolean
  last: boolean
  onSelect: () => void
  // eslint-disable-next-line no-unused-vars
  onGoTo: (stepUuid: string) => void
  onOpenActivity: () => void
  onAsk?: () => void
  /** The step's own menu (edit, move, delete), for whoever can edit the goal. */
  menu?: React.ReactNode
  /** Lines under the row, such as Coach's suggested changes to it. */
  after?: React.ReactNode
  /** The step across a cohort: its node and status line count learners instead of one learner's progress. */
  aggregate?: StepAggregate
  /** What opens in place of the step's card when it's selected, such as staff's to-dos on it. */
  body?: React.ReactNode
}

/** A step on the goal's path: its node, title and status; selected, its card opens in place. */
export function GoalStepRow({ goal, step, viewer, perspective, selected, last, onSelect, onGoTo, onOpenActivity, onAsk, menu, after, aggregate, body }: RowProps) {
  const definition = stepDefinition(step.type)
  const RowResult = aggregate ? undefined : definition.RowResult
  const status = aggregate ? aggregateLine(aggregate) : statusLine(step)
  const node = aggregate ? aggregateNode(aggregate) : step
  const locked = step.state === 'locked'
  const done = node.state === 'done'
  return <li id={`step-${step.step_uuid}`} data-step-shell={step.step_uuid} className="relative flex items-start gap-4 pb-4 scroll-mt-24">
    {!last ? <span aria-hidden="true" className={cn('absolute left-[28px] top-12 bottom-0 w-[3px] -translate-x-1/2 rounded-full', done ? 'bg-[var(--plan-face)]/60' : 'bg-border')} /> : null}
    <button type="button" onClick={onSelect} aria-label={`${step.title}, ${status}`} aria-expanded={selected} className="flex w-14 shrink-0 justify-center rounded-full pt-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
      <PathNode state={node.state} fraction={node.fraction} icon={definition.icon} selected={selected} />
    </button>
    <div className={cn('min-w-0 flex-1', selected ? 'rounded-2xl border-2 bg-card p-4 shadow-[0_4px_0_hsl(var(--edge))]' : 'pt-2', selected && (locked ? 'border-border' : 'border-[var(--plan-face)]'))}>
      <div className="flex items-start gap-1">
        <button type="button" onClick={onSelect} tabIndex={-1} className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
          <span className={cn('max-w-full font-bold leading-snug', selected ? 'text-lg' : 'truncate text-base', (done || locked) && !selected && 'text-muted-foreground')}>{step.title}</span>
          <span className="text-xs font-semibold text-muted-foreground">{status}</span>
        </button>
        <span className="-mt-1 shrink-0"><StepChatButton step={step} quiet={!selected} label={perspective === 'cohort' ? 'Discuss' : undefined} /></span>
        {menu ? <span className={cn('shrink-0', selected ? '-mr-2 -mt-1' : '-mt-1')}>{menu}</span> : null}
      </div>
      {!selected && RowResult && step.result ? <div className="mt-2"><RowResult step={step as never} /></div> : null}
      {selected ? <div className="mt-3 flex flex-col gap-3">
        {body !== undefined ? body : locked ? <LockedBody step={step} onGoTo={onGoTo} /> : <StepCard goal={goal} step={step} viewer={viewer} perspective={perspective} onOpenActivity={onOpenActivity} onAsk={onAsk && !done && step.state !== 'waiting' ? onAsk : undefined} />}
      </div> : null}
      {after}
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

/** The selected step's card body from the registry, worked on in place. */
function StepCard({ goal, step, viewer, perspective, onOpenActivity, onAsk }: { goal: Goal; step: Step; viewer: PathViewer; perspective: PathPerspective; onOpenActivity: () => void; onAsk?: () => void }) {
  const actions = useStepActions(goal, step, viewer.token, onOpenActivity, onAsk)
  const { canWork, staff } = stepAccess(goal, perspective, viewer.viewerUserId)
  return <StepBody goal={goal} step={step} actions={actions} canWork={canWork} staff={staff} orgslug={viewer.orgslug} token={viewer.token} viewerUserId={viewer.viewerUserId} />
}

/** A path of steps while they load: nodes on the line, a title and a status line beside each. */
export function GoalPathSkeleton({ count = 5 }: { count?: number }) {
  return <div className="flex flex-col gap-4">
    <Skeleton className="h-12 rounded-2xl" />
    <ol aria-hidden="true" className="flex flex-col">
      {Array.from({ length: count }).map((_, index) => <li key={index} className="relative flex items-start gap-4 pb-4">
        {index < count - 1 ? <span className="absolute left-[28px] top-12 bottom-0 w-[3px] -translate-x-1/2 rounded-full bg-border" /> : null}
        <span className="flex w-14 shrink-0 justify-center pt-0.5"><span className={cn('rounded-full bg-muted motion-safe:animate-pulse', index === 0 ? 'h-[52px] w-[52px]' : 'h-11 w-11')} /></span>
        <span className="flex min-w-0 flex-1 flex-col gap-2 pt-2.5">
          <span className="h-4 rounded-md bg-muted motion-safe:animate-pulse" style={{ width: `${[62, 48, 70, 55][index % 4]}%` }} />
          <span className="h-3 w-24 rounded-md bg-muted motion-safe:animate-pulse" />
        </span>
      </li>)}
    </ol>
  </div>
}
