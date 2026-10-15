'use client'

import React from 'react'
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import { Plus, Sparkles, X } from 'lucide-react'
import { useHub } from '@components/Hub/HubContext'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { goalsApi } from '@services/goals/goals'
import { can, type Goal, type Step } from '@services/goals/types'
import { cn } from '@/lib/utils'
import { useGoalMutation } from '../useGoalActions'
import { ProposedStageEditor, ProposedStepEditor } from './GoalProposals'
import StageHeader from './StageHeader'
import { EditStepRow, StepAdder } from './StepRows'
import { useGoalProposals } from './useGoalProposals'

const LOOSE = 'loose'

/**
 * A goal's stages and steps while editing. Steps drag between stages; Coach's proposed stages
 * and steps appear in place for review. Every change saves as it's made.
 */
export default function GoalStructureEditor({ goal, token, showDates }: { goal: Goal; token?: string; showDates: boolean }) {
  const hub = useHub()
  const canEdit = can(goal, 'edit_structure')
  const [openStep, setOpenStep] = React.useState('')
  const { busy, run } = useGoalMutation(goal.goal_uuid)
  const proposals = useGoalProposals(goal)
  const askCoach = (prompt: string) => hub?.open({ prompt })

  const onDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result
    if (!destination || (source.droppableId === destination.droppableId && source.index === destination.index)) return
    const stageUuid = destination.droppableId === LOOSE ? null : destination.droppableId
    void run(() => goalsApi.moveStep(goal.goal_uuid, draggableId, { stage_uuid: stageUuid, position: destination.index }, token)).catch(() => undefined)
  }

  const stepList = (key: string, steps: Step[], stageUuid: string | null, stageTitle?: string) => {
    const proposed = proposals.steps.filter((item) => item.stageUuid === (stageUuid || ''))
    const empty = !steps.length && !proposed.length
    return <>
      <Droppable droppableId={key} isDropDisabled={!canEdit}>
        {(provided, snapshot) => <ol ref={provided.innerRef} {...provided.droppableProps} className={cn('flex min-h-4 flex-col gap-2 rounded-2xl transition-colors', snapshot.isDraggingOver && 'bg-raised/60')}>
          {steps.map((step, index) => <Draggable key={step.step_uuid} draggableId={step.step_uuid} index={index} isDragDisabled={!canEdit || busy}>
            {(drag, dragging) => <li ref={drag.innerRef} {...drag.draggableProps} style={drag.draggableProps.style}>
              <EditStepRow goal={goal} step={step} token={token} open={openStep === step.step_uuid} onOpenChange={(open) => setOpenStep(open ? step.step_uuid : '')} dragHandle={drag.dragHandleProps} dragging={dragging.isDragging} />
            </li>}
          </Draggable>)}
          {provided.placeholder}
        </ol>}
      </Droppable>
      {proposed.map(({ step, stageUuid: target, recovered }) => <ProposedStepEditor key={step.local_id} goal={goal} step={step} stageUuid={target} recovered={recovered} token={token} onStageChange={(next) => proposals.moveStep(step.local_id, next)} onSettled={proposals.settleStep} />)}
      {canEdit ? <div className={cn('grid gap-2', empty && stageTitle && hub && 'sm:grid-cols-2')}>
        <StepAdder goal={goal} stageUuid={stageUuid} token={token} />
        {empty && stageTitle && hub ? <button type="button" onClick={() => askCoach(`Suggest a few steps for the stage “${stageTitle}” of my goal “${goal.title}”.`)} className="flex h-12 items-center gap-3 rounded-2xl border-2 border-dashed border-border px-4 text-sm font-bold text-muted-foreground transition hover:border-[var(--plan-face)] hover:text-foreground"><Sparkles size={16} className="text-[#7cc4ff]" aria-hidden="true" />Ideas from Coach</button> : null}
      </div> : null}
    </>
  }

  const looseProposals = proposals.steps.some((item) => !item.stageUuid)
  return <DragDropContext onDragEnd={onDragEnd}>
    <div className="flex flex-col gap-8">
      {goal.stages.map((stage, index) => <section key={stage.stage_uuid} id={`goal-stage-${stage.stage_uuid}`} aria-label={stage.title} className="flex flex-col gap-3">
        <StageHeader goal={goal} stage={stage} index={index} token={token} showDates={showDates} />
        {stepList(stage.stage_uuid, stage.steps, stage.stage_uuid, stage.title)}
      </section>)}
      {goal.unstaged_steps.length || looseProposals || !goal.stages.length ? <section aria-label={goal.stages.length ? 'More steps' : 'Steps'} className="flex flex-col gap-3">
        {goal.stages.length ? <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">More steps</h3> : null}
        {stepList(LOOSE, goal.unstaged_steps, null)}
      </section> : null}
      {proposals.stages.map(({ stage, position, recovered }) => <ProposedStageEditor key={stage.local_id} goal={goal} stage={stage} position={position} recovered={recovered} token={token} onSettled={proposals.settleStage} />)}
      {canEdit ? <StageAdder goal={goal} token={token} /> : null}
      {canEdit && hub ? <div className="flex items-center gap-3 rounded-2xl bg-card p-4">
        <Sparkles size={20} className="shrink-0 text-[#7cc4ff]" aria-hidden="true" />
        <p className="flex-1 text-sm text-muted-foreground">Ask Coach to suggest stages or steps for this goal.</p>
        <Button type="button" variant="surface" size="sm" onClick={() => askCoach(`Suggest a few steps for my goal “${goal.title}”.`)}>Suggest</Button>
      </div> : null}
    </div>
  </DragDropContext>
}

/** Adds a stage with just a name and, if the learner knows it, rough timing. */
function StageAdder({ goal, token }: { goal: Goal; token?: string }) {
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState('')
  const [timing, setTiming] = React.useState('')
  const { busy, run } = useGoalMutation(goal.goal_uuid)
  const add = async () => {
    if (!title.trim()) return
    try { await run(() => goalsApi.addStage(goal.goal_uuid, { title: title.trim(), timing: timing.trim() }, token)); setTitle(''); setTiming(''); setOpen(false) } catch { /* toast shown */ }
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="flex w-fit items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground"><Plus size={15} />{goal.stages.length ? 'Add a stage' : 'Group steps into stages'}</button>
  return <form aria-label="New stage" onSubmit={(event) => { event.preventDefault(); void add() }} className="flex flex-wrap gap-2 rounded-2xl border-2 border-border bg-card p-2">
    <Input autoFocus aria-label="Stage name" value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false) }} placeholder="Stage name" className="h-10 min-w-[10rem] flex-[2]" />
    <Input aria-label="Rough timing" value={timing} onChange={(event) => setTiming(event.target.value)} placeholder="Rough timing (optional)" className="h-10 min-w-[8rem] flex-1" />
    <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Cancel"><X size={16} /></Button>
    <Button type="submit" variant="surface" size="sm" className="h-10" disabled={busy || !title.trim()}>Add</Button>
  </form>
}
