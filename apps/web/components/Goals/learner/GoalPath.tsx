'use client'

import React from 'react'
import { Flag, Trophy } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useHub } from '@components/Hub/HubContext'
import { Button } from '@components/ui/button'
import { planVars } from '@components/Goals/planColors'
import { getUriWithOrg } from '@services/config/config'
import { goalSteps, type Goal, type Step } from '@services/goals/types'
import { cn } from '@/lib/utils'
import GoalFindings from './GoalFindings'
import type { GoalBadge } from './GoalHeader'
import { GoalStepRow, type PathViewer } from './GoalStepRow'

type Section = { key: string; title: string; milestone?: string; stageUuid?: string; steps: Step[] }

/** The goal's stages as sections; empty stages stay when they can be planned from here. */
function sectionsOf(goal: Goal, keepEmpty: boolean): Section[] {
  const sections: Section[] = goal.stages.map((stage) => ({ key: stage.stage_uuid, title: stage.title, milestone: stage.milestone, stageUuid: stage.stage_uuid, steps: stage.steps }))
  if (goal.unstaged_steps.length) sections.push({ key: 'loose', title: sections.length ? 'More steps' : 'Steps', steps: goal.unstaged_steps })
  return sections.filter((section) => section.steps.length || (keepEmpty && section.stageUuid))
}

const workable = (step: Step) => step.state === 'open' || step.state === 'started' || step.state === 'retry'

/** The step to do next: the first one open to work on, else the first not done. */
export function nextStep(goal: Goal) {
  const steps = goalSteps(goal)
  return steps.find(workable) || steps.find((step) => step.state !== 'done')
}

type GoalPathProps = {
  goal: Goal
  color: string
  badge?: GoalBadge
  viewer: PathViewer
  selectedUuid: string
  // eslint-disable-next-line no-unused-vars
  onSelect: (stepUuid: string) => void
  onEdit?: () => void
  /** Turns editing on at an empty stage ("Start planning"). */
  // eslint-disable-next-line no-unused-vars
  onPlanStage?: (stageUuid: string) => void
}

/** A goal below its header: its stages as sections of steps, opened at the next step. Staff see the same path. */
export default function GoalPath({ goal, color, badge, viewer, selectedUuid, onSelect, onEdit, onPlanStage }: GoalPathProps) {
  const router = useRouter()
  const hub = useHub()
  const sections = React.useMemo(() => sectionsOf(goal, Boolean(onPlanStage)), [goal, onPlanStage])
  const total = goal.progress.total
  const done = goal.progress.done
  const nextUuid = nextStep(goal)?.step_uuid
  const selected = selectedUuid || nextUuid || ''

  // Open at the step asked for, else the one to do next, like a path that starts where you left off.
  React.useEffect(() => {
    if (!selected) return
    const frame = window.requestAnimationFrame(() => {
      const node = document.getElementById(`step-${selected}`)
      const rect = node?.getBoundingClientRect()
      if (node && rect && (rect.top < 0 || rect.bottom > window.innerHeight)) node.scrollIntoView({ block: 'center' })
    })
    return () => window.cancelAnimationFrame(frame)
    // Only when a goal opens, not after every change to it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal.goal_uuid])

  const goTo = (stepUuid: string) => { onSelect(stepUuid); document.getElementById(`step-${stepUuid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
  const openActivity = (step: Step) => router.push(getUriWithOrg(viewer.orgslug, `/plans/${encodeURIComponent(goal.goal_uuid)}/steps/${encodeURIComponent(step.step_uuid)}/activity`))
  const ask = hub && !viewer.staff ? (step: Step) => hub.open({ prompt: `Help me with “${step.title}” in my goal “${goal.title}”.` }) : undefined

  return <div data-plan="" style={planVars(color)} className="flex flex-col gap-8">
    <GoalFindings goal={goal} onGoTo={goTo} />
    {sections.length ? sections.map((section) => {
      const sectionDone = section.steps.filter((step) => step.state === 'done').length
      const empty = !section.steps.length
      const waiting = empty || section.steps.every((step) => step.state === 'locked')
      return <section key={section.key} aria-label={section.title} className="flex flex-col gap-4">
        {sections.length > 1 || (section.title !== 'Steps' && section.title !== goal.title) ? <div className={cn('flex flex-col gap-1 rounded-2xl border-2 px-4 py-3', waiting ? 'border-border text-muted-foreground' : 'border-[var(--plan-face)] bg-[color-mix(in_srgb,var(--plan-face)_12%,hsl(var(--card)))]')}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-extrabold tracking-tight">{section.title}</h2>
            {empty ? null : <span className="shrink-0 text-xs font-bold text-muted-foreground">{sectionDone} of {section.steps.length}</span>}
          </div>
          {section.milestone ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Flag size={13} aria-hidden="true" className="shrink-0" />{section.milestone}</p> : null}
          {empty && onPlanStage && section.stageUuid ? <Button type="button" variant="surface" size="sm" className="mt-2 self-start" onClick={() => onPlanStage(section.stageUuid!)}>Start planning</Button> : null}
        </div> : null}
        <ol className="flex flex-col">
          {section.steps.map((step, index) => <GoalStepRow key={step.step_uuid} goal={goal} step={step} viewer={viewer} selected={step.step_uuid === selected} last={index === section.steps.length - 1}
            onSelect={() => onSelect(step.step_uuid)} onGoTo={goTo} onOpenActivity={() => openActivity(step)} onAsk={ask ? () => ask(step) : undefined} />)}
        </ol>
      </section>
    }) : <div className="rounded-2xl border-2 border-dashed border-border px-6 py-10 text-center">
      <p className="font-bold">No steps yet</p>
      {onEdit ? <Button type="button" variant="plan" className="mt-4" onClick={onEdit}>Add steps</Button> : null}
    </div>}
    {total ? <div className="flex items-center gap-4">
      <span className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-full', done === total ? 'bg-[var(--plan-face)] text-[var(--plan-face-ink)] shadow-[0_4px_0_var(--plan-edge)]' : 'bg-muted text-muted-foreground')} aria-hidden="true"><Trophy size={24} /></span>
      <div>
        <p className="font-extrabold">{done === total ? 'All steps done' : 'Your goal'}</p>
        <p className="text-sm text-muted-foreground">{badge?.name ? `${badge.name} badge` : 'Every step brings you closer.'}</p>
        {done === total && badge ? <Button variant="link" asChild className="h-auto p-0 text-xs"><a href={getUriWithOrg(viewer.orgslug, '/portfolio/badges')}>View earned badges</a></Button> : null}
      </div>
    </div> : null}
  </div>
}
