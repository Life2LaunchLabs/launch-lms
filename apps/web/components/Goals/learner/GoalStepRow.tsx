'use client'

import React from 'react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@components/ui/button'
import { Skeleton } from '@components/ui/skeleton'
import { PathNode } from '@components/Goals/path/PathNode'
import { lockedSentence, statusLine } from '@components/Goals/path/stepText'
import { stepDefinition, type StepCardProps } from '@components/Goals/steps'
import { useStepActions } from '@components/Goals/useGoalActions'
import type { Goal, Step } from '@services/goals/types'

/** Who is looking at the path, and what they can do on it. */
export type PathViewer = { orgslug: string; token?: string; viewerUserId?: number; canWork: boolean; staff: boolean }

type RowProps = {
  goal: Goal
  step: Step
  viewer: PathViewer
  selected: boolean
  last: boolean
  onSelect: () => void
  // eslint-disable-next-line no-unused-vars
  onGoTo: (stepUuid: string) => void
  onOpenActivity: () => void
  onAsk?: () => void
}

/** A step on the goal's path: its node, title and status; selected, its card opens in place. */
export function GoalStepRow({ goal, step, viewer, selected, last, onSelect, onGoTo, onOpenActivity, onAsk }: RowProps) {
  const definition = stepDefinition(step.type)
  const RowResult = definition.RowResult
  const status = statusLine(step)
  const locked = step.state === 'locked'
  const done = step.state === 'done'
  return <li id={`step-${step.step_uuid}`} data-step-shell={step.step_uuid} className="relative flex items-start gap-4 pb-4 scroll-mt-24">
    {!last ? <span aria-hidden="true" className={cn('absolute left-[28px] top-12 bottom-0 w-[3px] -translate-x-1/2 rounded-full', done ? 'bg-[var(--plan-face)]/60' : 'bg-border')} /> : null}
    <button type="button" onClick={onSelect} aria-label={`${step.title}, ${status}`} aria-expanded={selected} className="flex w-14 shrink-0 justify-center rounded-full pt-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
      <PathNode state={step.state} fraction={step.fraction} icon={definition.icon} selected={selected} />
    </button>
    <div className={cn('min-w-0 flex-1', selected ? 'rounded-2xl border-2 bg-card p-4 shadow-[0_4px_0_hsl(var(--edge))]' : 'pt-2', selected && (locked ? 'border-border' : 'border-[var(--plan-face)]'))}>
      <button type="button" onClick={onSelect} tabIndex={-1} className="flex w-full min-w-0 flex-col items-start gap-0.5 text-left">
        <span className={cn('max-w-full font-bold leading-snug', selected ? 'text-lg' : 'truncate text-base', (done || locked) && !selected && 'text-muted-foreground')}>{step.title}</span>
        <span className="text-xs font-semibold text-muted-foreground">{status}</span>
      </button>
      {!selected && RowResult && step.result ? <div className="mt-2"><RowResult step={step as never} /></div> : null}
      {selected ? <div className="mt-3 flex flex-col gap-3">
        {locked ? <LockedBody step={step} onGoTo={onGoTo} /> : <StepCard goal={goal} step={step} viewer={viewer} onOpenActivity={onOpenActivity} />}
        {onAsk && !done ? <Button type="button" variant="surface" className="self-start" onClick={onAsk}><Sparkles size={15} aria-hidden="true" />Ask Coach</Button> : null}
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

/** The selected step's card body from the registry, worked on in place. */
function StepCard({ goal, step, viewer, onOpenActivity }: { goal: Goal; step: Step; viewer: PathViewer; onOpenActivity: () => void }) {
  const actions = useStepActions(goal, step, viewer.token, onOpenActivity)
  const CardBody = stepDefinition(step.type).CardBody as React.ComponentType<StepCardProps>
  return <CardBody goal={goal} step={step} actions={actions} canWork={viewer.canWork} staff={viewer.staff} orgslug={viewer.orgslug} token={viewer.token} viewerUserId={viewer.viewerUserId} />
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
