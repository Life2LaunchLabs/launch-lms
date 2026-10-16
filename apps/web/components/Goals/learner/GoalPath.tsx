'use client'

import React from 'react'
import { Sparkles, Trophy } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useHub } from '@components/Hub/HubContext'
import { Button } from '@components/ui/button'
import { planVars } from '@components/Goals/planColors'
import { getUriWithOrg } from '@services/config/config'
import { goalSteps, type Goal, type Stage, type Step } from '@services/goals/types'
import { AddStageButton, AddStepButton, StageMenu, StepMenu, useGoalEditing } from '@components/Goals/edit/GoalEditing'
import { GoalChangeLine, StageChangeLine, StepChangeLine, SuggestedStageLine, SuggestedStepLine } from '@components/Goals/edit/GoalProposals'
import useGoalCoachSession from '@components/Goals/edit/useGoalCoachSession'
import { useGoalProposals } from '@components/Goals/edit/useGoalProposals'
import { cn } from '@/lib/utils'
import GoalFindings from './GoalFindings'
import { canMoveStages, FinishStep, MoveOnLine, ScheduleNotes, useMoveToStage } from './GoalStages'
import type { GoalBadge } from './GoalHeader'
import { GoalStepRow, type PathViewer } from './GoalStepRow'

type Section = { key: string; title: string; stage?: Stage; index: number; steps: Step[] }

/** The goal's stages as sections; an empty stage stays when it can be planned from here. */
function sectionsOf(goal: Goal, keepEmpty: boolean): Section[] {
  const sections: Section[] = goal.stages.map((stage, index) => ({ key: stage.stage_uuid, title: stage.title, stage, index, steps: stage.steps }))
  if (goal.unstaged_steps.length) sections.push({ key: 'loose', title: sections.length ? 'More steps' : 'Steps', index: sections.length, steps: goal.unstaged_steps })
  return sections.filter((section) => section.steps.length || (keepEmpty && section.stage))
}

const workable = (step: Step) => step.state === 'open' || step.state === 'started' || step.state === 'retry'

/** The step to do next: the first one open to work on, else the first not done. */
export function nextStep(goal: Goal) {
  const steps = goalSteps(goal)
  return steps.find(workable) || steps.find((step) => step.state !== 'done')
}

const shortDate = (value?: string | null) => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''

/** A stage's line over its title, as the feed's sections have one: where it sits, and its dates. */
function stageEyebrow(section: Section, active: boolean) {
  const stage = section.stage
  const dates = stage?.start_date || stage?.due_date ? [shortDate(stage.start_date), shortDate(stage.due_date)].filter(Boolean).join(' – ') : ''
  return [active ? 'Now' : section.stage ? `Stage ${section.index + 1}` : '', dates].filter(Boolean).join(' · ')
}

type GoalPathProps = {
  goal: Goal
  color: string
  badge?: GoalBadge
  viewer: PathViewer
  selectedUuid: string
  // eslint-disable-next-line no-unused-vars
  onSelect: (stepUuid: string) => void
  /** Coach's suggestions on this goal show in place (the learner's own goal). */
  token?: string
  own?: boolean
}

/**
 * A goal below its header: its stages as sections of steps, opened at the next step. Whoever
 * can edit the goal does it object by object, from each step's and stage's menu, and Coach's
 * suggestions sit where they would go. Staff see the same path.
 */
export default function GoalPath({ goal, color, badge, viewer, selectedUuid, onSelect, own = false }: GoalPathProps) {
  const router = useRouter()
  const hub = useHub()
  const editing = useGoalEditing()
  const proposals = useGoalProposals(goal, own ? viewer.token : undefined)
  const coach = useGoalCoachSession(goal, viewer.token)
  const sections = React.useMemo(() => sectionsOf(goal, Boolean(editing?.structure)), [goal, editing?.structure])
  const total = goal.progress.total
  const done = goal.progress.done
  const nextUuid = nextStep(goal)?.step_uuid
  const selected = selectedUuid || nextUuid || ''
  const current = goal.current_stage_uuid
  const mover = useMoveToStage(goal, viewer.token, color)
  const movable = canMoveStages(goal) && !viewer.staff

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
  const looseSuggestions = proposals.steps.filter((item) => !item.stageUuid)

  return <div data-plan="" style={planVars(color)} className="flex flex-col gap-8">
    <GoalFindings goal={goal} onGoTo={goTo} />
    {proposals.goalChanges.map((item) => <GoalChangeLine key={item.change.local_id} goal={goal} item={item} token={viewer.token} onSettled={proposals.settle} />)}
    {sections.length ? sections.map((section) => {
      const sectionDone = section.steps.filter((step) => step.state === 'done').length
      const active = Boolean(section.stage && section.stage.stage_uuid === current)
      const suggested = section.stage ? proposals.steps.filter((item) => item.stageUuid === section.stage!.stage_uuid) : looseSuggestions
      const eyebrow = stageEyebrow(section, active)
      const titled = sections.length > 1 || (section.title !== 'Steps' && section.title !== goal.title) || Boolean(editing?.structure)
      return <section key={section.key} id={section.stage ? `goal-stage-${section.stage.stage_uuid}` : undefined} aria-label={section.title} className="flex scroll-mt-24 flex-col gap-3">
        {titled ? <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            {eyebrow ? <p className={cn('flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider', active ? 'text-[var(--plan-accent)]' : 'text-muted-foreground')}>
              {active ? <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--plan-face)]" /> : null}{eyebrow}
            </p> : null}
            <h2 className={cn('text-xl font-extrabold tracking-tight', !active && current && 'text-foreground/80')}>{section.title}</h2>
            <ScheduleNotes goal={goal} stageUuid={section.stage?.stage_uuid} className="mt-1" />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {section.steps.length ? <span className="text-xs font-bold text-muted-foreground">{sectionDone} of {section.steps.length}</span> : null}
            {section.stage ? <StageMenu stage={section.stage} index={section.index} onMakeCurrent={movable && !active ? () => mover.ask(section.stage!) : undefined} /> : null}
          </div>
        </div> : null}
        {section.stage ? proposals.stageChanges.filter((item) => item.change.stage_uuid === section.stage!.stage_uuid).map((item) => <StageChangeLine key={item.change.local_id} goal={goal} item={item} token={viewer.token} onSettled={proposals.settle} />) : null}
        {section.steps.length ? <ol className="flex flex-col">
          {section.steps.map((step, index) => <GoalStepRow key={step.step_uuid} goal={goal} step={step} viewer={viewer} selected={step.step_uuid === selected} last={index === section.steps.length - 1}
            onSelect={() => onSelect(step.step_uuid)} onGoTo={goTo} onOpenActivity={() => openActivity(step)} onAsk={ask ? () => ask(step) : undefined}
            menu={<StepMenu step={step} />}
            after={<><ScheduleNotes goal={goal} stepUuid={step.step_uuid} className="pb-1" />{proposals.stepChanges.filter((item) => item.change.step_uuid === step.step_uuid).map((item) => <StepChangeLine key={item.change.local_id} goal={goal} item={item} token={viewer.token} onSettled={proposals.settle} />)}</>} />)}
        </ol> : <p className="ml-[72px] text-sm text-muted-foreground">No steps here yet.</p>}
        {active && movable ? <MoveOnLine stage={section.stage!} next={goal.stages[section.index + 1]} onMove={() => mover.ask(goal.stages[section.index + 1])} /> : null}
        {suggested.length ? <ul aria-label="Suggested steps" className="flex flex-col">
          {suggested.map((item) => <SuggestedStepLine key={item.step.local_id} goal={goal} item={item} token={viewer.token} onSettled={proposals.settle} />)}
        </ul> : null}
        <div className="flex flex-wrap items-center gap-1">
          <AddStepButton stageUuid={section.stage?.stage_uuid ?? null} />
          {editing?.structure && own && coach.available && !coach.session && !section.steps.length && !suggested.length && section.stage ? <button type="button" onClick={() => void coach.start(`Suggest a few steps for the stage “${section.title}”.`)}
            className="flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-bold text-muted-foreground transition hover:bg-muted hover:text-foreground"><Sparkles size={14} aria-hidden="true" />Plan with Coach</button> : null}
        </div>
      </section>
    }) : <div className="rounded-2xl border-2 border-dashed border-border px-6 py-10 text-center">
      <p className="font-bold">No steps yet</p>
      {editing?.structure ? <Button type="button" variant="plan" className="mt-4" onClick={() => editing.open({ kind: 'add-step', stageUuid: null })}>Add a step</Button> : null}
    </div>}
    {proposals.stages.map((item) => <SuggestedStageLine key={item.stage.local_id} goal={goal} item={item} token={viewer.token} onSettled={proposals.settle} />)}
    <AddStageButton />
    {mover.sheet}
    {goal.ownership === 'personal' ? <FinishStep goal={goal} token={viewer.token} color={color} orgslug={viewer.orgslug} /> : total ? <div className="flex items-center gap-4">
      <span className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-full', done === total ? 'bg-[var(--plan-face)] text-[var(--plan-face-ink)] shadow-[0_4px_0_var(--plan-edge)]' : 'bg-muted text-muted-foreground')} aria-hidden="true"><Trophy size={24} /></span>
      <div>
        <p className="font-extrabold">{done === total ? 'All steps done' : 'Your goal'}</p>
        <p className="text-sm text-muted-foreground">{badge?.name ? `${badge.name} badge` : 'Every step brings you closer.'}</p>
        {done === total && badge ? <Button variant="link" asChild className="h-auto p-0 text-xs"><a href={getUriWithOrg(viewer.orgslug, '/portfolio/badges')}>View earned badges</a></Button> : null}
      </div>
    </div> : null}
  </div>
}
