'use client'

import React from 'react'
import { DragDropContext, Draggable, Droppable, type DraggableProvidedDragHandleProps, type DropResult } from '@hello-pangea/dnd'
import { ArrowDown, ArrowUp, Check, Flag, GripVertical, Loader2, Plus, SlidersHorizontal, Sparkles, Trash2, X } from 'lucide-react'
import { Button } from '@components/ui/button'
import { PLAN_PALETTES, planPalette } from '@components/Goals/planColors'
import { goalsApi } from '@services/goals/goals'
import { can, type Goal, type Stage, type Step, type StepOrder, type StepTypeKey } from '@services/goals/types'
import { cn } from '@/lib/utils'
import { statusLine } from '../path/stepText'
import { stepDefinition } from '../steps'
import { useGoalMutation } from '../useGoalActions'
import EditableText from './EditableText'
import { GoalChangeLine, StageChangeLine, StepChangeLine, SuggestedStageLine, SuggestedStepLine } from './GoalProposals'
import { QUICK_KINDS, guessStepKind } from './kindGuess'
import StepEditor, { newStepDraft, type StepDraft } from './StepEditor'
import { dateValue, liveMode, otherSteps, stepChanges, stepDraft, stepInput, usesPlanning } from './stepDrafts'
import useGoalCoachSession from './useGoalCoachSession'
import { useGoalProposals, type PendingStageChange } from './useGoalProposals'

const LOOSE = 'loose'

/** The very faint grid behind a goal while it is being edited, so editing never looks like doing. */
export const EDIT_GRID: React.CSSProperties = {
  backgroundImage: 'linear-gradient(to right, hsl(var(--border) / 0.45) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border) / 0.45) 1px, transparent 1px)',
  backgroundSize: '24px 24px',
}

const STEP_ORDERS: Array<{ value: StepOrder; label: string }> = [
  { value: 'any', label: 'Any order' },
  { value: 'in_order', label: 'In order' },
  { value: 'by_stage', label: 'Stage by stage' },
]

type Props = {
  goal: Goal
  token?: string
  color: string
  // eslint-disable-next-line no-unused-vars
  setColor?: (color: string) => void
  /** A stage whose add line takes focus when editing opens ("Start planning"). */
  focusStage?: string
}

/**
 * The goal's own path, edited in place: stage names and milestones, step titles, the order of
 * steps and an add line under every stage are all fields where they normally sit. Every change
 * saves as it is made. Coach's suggested steps sit in the stack as quiet lines.
 */
export default function GoalPathEditor({ goal, token, color, setColor, focusStage }: Props) {
  const canEdit = can(goal, 'edit_structure')
  const [openStep, setOpenStep] = React.useState('')
  const [showDates, setShowDates] = React.useState(() => usesPlanning(goal))
  const { busy, run } = useGoalMutation(goal.goal_uuid)
  // Coach works only on the learner's own goal (only its owner can delete it); staff editing it see no suggestions.
  const own = goal.ownership === 'personal' && can(goal, 'delete_plan')
  const proposals = useGoalProposals(goal, own ? token : undefined)
  const coach = useGoalCoachSession(goal, token)

  React.useEffect(() => {
    if (focusStage) document.getElementById(`goal-stage-${focusStage}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusStage])

  const onDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result
    if (!destination || (source.droppableId === destination.droppableId && source.index === destination.index)) return
    const stageUuid = destination.droppableId === LOOSE ? null : destination.droppableId
    void run(() => goalsApi.moveStep(goal.goal_uuid, draggableId, { stage_uuid: stageUuid, position: destination.index }, token)).catch(() => undefined)
  }

  const stepList = (key: string, steps: Step[], stageUuid: string | null, stageTitle?: string) => {
    const suggested = proposals.steps.filter((item) => item.stageUuid === (stageUuid || ''))
    return <div className="flex flex-col">
      <Droppable droppableId={key} isDropDisabled={!canEdit}>
        {(provided, snapshot) => <ol ref={provided.innerRef} {...provided.droppableProps} className={cn('flex min-h-2 flex-col gap-1 rounded-2xl transition-colors', snapshot.isDraggingOver && 'bg-[color-mix(in_srgb,var(--plan-face)_10%,transparent)]')}>
          {steps.map((step, index) => <Draggable key={step.step_uuid} draggableId={step.step_uuid} index={index} isDragDisabled={!canEdit || busy}>
            {(drag, dragging) => <li ref={drag.innerRef} {...drag.draggableProps} style={drag.draggableProps.style}>
              <EditStepLine goal={goal} step={step} token={token} open={openStep === step.step_uuid} onOpenChange={(open) => setOpenStep(open ? step.step_uuid : '')} dragHandle={drag.dragHandleProps} dragging={dragging.isDragging} />
              {proposals.stepChanges.filter((item) => item.change.step_uuid === step.step_uuid).map((item) => <div key={item.change.local_id} className="ml-14 mt-1"><StepChangeLine goal={goal} item={item} token={token} onSettled={proposals.settle} /></div>)}
            </li>}
          </Draggable>)}
          {provided.placeholder}
        </ol>}
      </Droppable>
      {suggested.length ? <ul aria-label="Suggested steps" className="flex flex-col">
        {suggested.map((item) => <SuggestedStepLine key={item.step.local_id} goal={goal} item={item} token={token} onSettled={proposals.settle} />)}
      </ul> : null}
      {canEdit ? <AddStepLine goal={goal} stageUuid={stageUuid} token={token} autoFocus={Boolean(focusStage) && focusStage === stageUuid} /> : null}
      {canEdit && own && coach.available && !steps.length && !suggested.length && stageTitle ? <button type="button" onClick={() => void coach.start(`Suggest a few steps for the stage “${stageTitle}”.`)}
        className="ml-14 mt-1 flex w-fit items-center gap-2 rounded-lg px-1 text-xs font-bold text-muted-foreground transition hover:text-foreground"><Sparkles size={13} aria-hidden="true" />Plan with Coach</button> : null}
    </div>
  }

  const looseSuggestions = proposals.steps.some((item) => !item.stageUuid)
  return <div className="-mx-3 flex flex-col gap-8 rounded-3xl px-3 py-4 sm:-mx-5 sm:px-5" style={EDIT_GRID} data-goal-editing="">
    {proposals.goalChanges.map((item) => <GoalChangeLine key={item.change.local_id} goal={goal} item={item} token={token} onSettled={proposals.settle} />)}
    <GoalSettingsRow goal={goal} token={token} color={color} setColor={setColor} showDates={showDates} setShowDates={setShowDates} />
    <DragDropContext onDragEnd={onDragEnd}>
      {goal.stages.map((stage, index) => <section key={stage.stage_uuid} id={`goal-stage-${stage.stage_uuid}`} aria-label={stage.title} className="flex scroll-mt-24 flex-col gap-3">
        <StageEditHeader goal={goal} stage={stage} index={index} token={token} showDates={showDates} changes={proposals.stageChanges.filter((item) => item.change.stage_uuid === stage.stage_uuid)} onSettled={proposals.settle} />
        {stepList(stage.stage_uuid, stage.steps, stage.stage_uuid, stage.title)}
      </section>)}
      {goal.unstaged_steps.length || looseSuggestions || !goal.stages.length ? <section aria-label={goal.stages.length ? 'More steps' : 'Steps'} className="flex flex-col gap-3">
        {goal.stages.length ? <h2 className="px-1 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">More steps</h2> : null}
        {stepList(LOOSE, goal.unstaged_steps, null)}
      </section> : null}
    </DragDropContext>
    {proposals.stages.map((item) => <SuggestedStageLine key={item.stage.local_id} goal={goal} item={item} token={token} onSettled={proposals.settle} />)}
    {canEdit ? <AddStageLine goal={goal} token={token} /> : null}
  </div>
}

/** Colour, and for goals that use them, the target date and when steps open. Each saves on change. */
function GoalSettingsRow({ goal, token, color, setColor, showDates, setShowDates }: {
  goal: Goal; token?: string; color: string; showDates: boolean
  // eslint-disable-next-line no-unused-vars
  setColor?: (color: string) => void
  // eslint-disable-next-line no-unused-vars
  setShowDates: (show: boolean) => void
}) {
  const { busy, run } = useGoalMutation(goal.goal_uuid)
  const current = planPalette(color)
  const personal = goal.ownership === 'personal'
  const canSchedule = can(goal, 'edit_schedule')
  const canOrder = can(goal, 'edit_structure')
  const save = (changes: Parameters<typeof goalsApi.update>[1]) => void run(() => goalsApi.update(goal.goal_uuid, changes, token), undefined, true).catch(() => undefined)
  return <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-xs font-bold text-muted-foreground">
    {setColor ? <div role="group" aria-label="Colour" className="flex items-center gap-1.5">
      {PLAN_PALETTES.map((palette) => <button key={palette.key} type="button" aria-label={palette.label} aria-pressed={palette.key === current.key} onClick={() => setColor(palette.face)}
        className="flex h-6 w-6 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition aria-pressed:ring-2 aria-pressed:ring-foreground/40" style={{ backgroundColor: palette.face, color: palette.faceInk }}>
        {palette.key === current.key ? <Check size={12} strokeWidth={3} /> : null}
      </button>)}
    </div> : null}
    {personal && (canSchedule || canOrder) ? <label className="flex items-center gap-2"><input type="checkbox" checked={showDates} onChange={(event) => setShowDates(event.target.checked)} />Dates and step order</label> : null}
    {showDates && canSchedule ? <label className="flex items-center gap-2">Target date
      <input type="date" disabled={busy} defaultValue={dateValue(goal.target_date)} key={goal.target_date || 'none'} onChange={(event) => save({ target_date: event.target.value || null })} className="h-8 rounded-lg border border-border bg-background px-2 text-xs" />
    </label> : null}
    {showDates && canOrder ? <label className="flex items-center gap-2">Steps open
      <select value={goal.step_order} disabled={busy} onChange={(event) => save({ step_order: event.target.value as StepOrder })} className="h-8 rounded-lg border border-border bg-background px-2 text-xs font-bold">
        {STEP_ORDERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label> : null}
  </div>
}

/** A stage's name, milestone and rough timing as fields in its header, plus moving and deleting it. */
function StageEditHeader({ goal, stage, index, token, showDates, changes, onSettled }: {
  goal: Goal; stage: Stage; index: number; token?: string; showDates: boolean; changes: PendingStageChange[]
  onSettled: React.ComponentProps<typeof StageChangeLine>['onSettled']
}) {
  const canEdit = can(goal, 'edit_structure')
  const canSchedule = can(goal, 'edit_schedule') && showDates
  const { busy, run } = useGoalMutation(goal.goal_uuid)
  const save = (changes: Parameters<typeof goalsApi.updateStage>[2]) => run(() => goalsApi.updateStage(goal.goal_uuid, stage.stage_uuid, changes, token), undefined, true)
  const move = (offset: number) => {
    const order = goal.stages.map((item) => item.stage_uuid)
    const [moved] = order.splice(index, 1)
    order.splice(index + offset, 0, moved)
    void run(() => goalsApi.reorderStages(goal.goal_uuid, order, token)).catch(() => undefined)
  }
  const remove = () => {
    if (!window.confirm(`Delete the stage “${stage.title}”?`)) return
    void run(() => goalsApi.deleteStage(goal.goal_uuid, stage.stage_uuid, token), 'Stage deleted').catch(() => undefined)
  }
  return <div className="flex flex-col gap-2">
  <div className="flex items-start gap-2 rounded-2xl border-2 border-border bg-card px-4 py-3">
    <div className="grid min-w-0 flex-1 gap-1">
      <EditableText value={stage.title} label="Stage name" required disabled={!canEdit} onSave={(title) => save({ title })} className="text-lg font-extrabold tracking-tight" />
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Flag size={13} aria-hidden="true" className="shrink-0" />
        <EditableText value={stage.milestone || ''} label="Milestone" placeholder="Milestone: what reaching the end looks like" disabled={!canEdit} onSave={(milestone) => save({ milestone })} />
      </div>
      <EditableText value={stage.timing || ''} label="Rough timing" placeholder="Rough timing (optional)" disabled={!canEdit} onSave={(timing) => save({ timing })} className="text-xs text-muted-foreground" />
      {canSchedule ? <div className="mt-1 flex flex-wrap gap-3 text-xs font-bold text-muted-foreground">
        <label className="flex items-center gap-2">Starts<input type="date" key={`s-${stage.start_date}`} defaultValue={dateValue(stage.start_date)} onChange={(event) => void save({ start_date: event.target.value || null }).catch(() => undefined)} className="h-8 rounded-lg border border-border bg-background px-2" /></label>
        <label className="flex items-center gap-2">Ends<input type="date" key={`d-${stage.due_date}`} defaultValue={dateValue(stage.due_date)} onChange={(event) => void save({ due_date: event.target.value || null }).catch(() => undefined)} className="h-8 rounded-lg border border-border bg-background px-2" /></label>
      </div> : null}
    </div>
    {canEdit ? <span className="flex shrink-0 items-center">
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={busy || index === 0} onClick={() => move(-1)} aria-label={`Move ${stage.title} up`}><ArrowUp size={13} /></Button>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={busy || index === goal.stages.length - 1} onClick={() => move(1)} aria-label={`Move ${stage.title} down`}><ArrowDown size={13} /></Button>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={busy || stage.steps.length > 0} title={stage.steps.length ? 'Move or delete its steps first' : undefined} onClick={remove} aria-label={`Delete ${stage.title}`}><Trash2 size={13} /></Button>
    </span> : null}
  </div>
  {changes.map((item) => <StageChangeLine key={item.change.local_id} goal={goal} item={item} token={token} onSettled={onSettled} />)}
  </div>
}

const hasWork = (step: Step) => step.state === 'done' || step.state === 'started' || Boolean(step.result)

/** One step while editing: its title is a field, a handle drags it, Details opens the rest of it. */
function EditStepLine({ goal, step, token, open, onOpenChange, dragHandle, dragging }: {
  goal: Goal; step: Step; token?: string; open: boolean; dragHandle?: DraggableProvidedDragHandleProps | null; dragging?: boolean
  // eslint-disable-next-line no-unused-vars
  onOpenChange: (open: boolean) => void
}) {
  const definition = stepDefinition(step.type)
  const Icon = definition.icon
  const canEdit = can(goal, 'edit_structure')
  const { busy, run } = useGoalMutation(goal.goal_uuid)
  const remove = async () => {
    if (hasWork(step) && !window.confirm(`Remove “${step.title}”? What you've done on it goes too.`)) return
    try { await run(() => goalsApi.deleteStep(goal.goal_uuid, step.step_uuid, token)) } catch { /* toast shown */ }
  }
  return <div id={`step-${step.step_uuid}`} data-step-shell={step.step_uuid} className={cn('rounded-2xl transition', open && 'border-2 border-[var(--plan-face)] bg-card pb-3', dragging && 'bg-card shadow-2xl ring-2 ring-[var(--plan-face)]')}>
    <div className="flex items-center gap-1 py-1 pr-1">
      <span {...dragHandle} aria-label={`Drag ${step.title}`} className={cn('flex w-5 shrink-0 cursor-grab justify-center text-muted-foreground/50 hover:text-muted-foreground', !canEdit && 'invisible')}><GripVertical size={15} /></span>
      <span className="flex w-9 shrink-0 justify-center"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-[var(--plan-accent)]" aria-hidden="true"><Icon size={16} /></span></span>
      <div className="ml-2 min-w-0 flex-1">
        <EditableText value={step.title} label="Step title" required disabled={!canEdit} onSave={(title) => run(() => goalsApi.updateStep(goal.goal_uuid, step.step_uuid, { title }, token), undefined, true)} className="font-bold" />
        <span className="block truncate text-xs text-muted-foreground">{definition.label} · {statusLine(step)}</span>
      </div>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-expanded={open} aria-label={`Details for ${step.title}`} onClick={() => onOpenChange(!open)}><SlidersHorizontal size={15} /></Button>
      {canEdit ? <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={busy} aria-label={`Remove ${step.title}`} onClick={() => void remove()}><X size={15} /></Button> : null}
    </div>
    {open ? <StepDetails goal={goal} step={step} token={token} onClose={() => onOpenChange(false)} /> : null}
  </div>
}

/** The rest of a step (details, its kind's settings, due date) in the single step editor. */
function StepDetails({ goal, step, token, onClose }: { goal: Goal; step: Step; token?: string; onClose: () => void }) {
  const mode = liveMode(goal)
  const initial = React.useMemo(() => stepDraft(step), [step])
  const [draft, setDraft] = React.useState<StepDraft>(initial)
  const { busy, run } = useGoalMutation(goal.goal_uuid)
  const editable = can(goal, 'edit_structure') || can(goal, 'edit_schedule')
  const done = async () => {
    const changes = draft.title.trim() ? stepChanges(initial, draft, mode) : {}
    try {
      if (Object.keys(changes).length) await run(() => goalsApi.updateStep(goal.goal_uuid, step.step_uuid, changes, token))
      onClose()
    } catch { /* toast shown */ }
  }
  return <div className="flex flex-col gap-4 border-t border-border px-4 pt-4">
    {editable ? <StepEditor value={draft} onChange={setDraft} mode={mode} typeLocked others={otherSteps(goal, step.step_uuid)} orgId={goal.org_id} token={token} /> : <p className="text-sm text-muted-foreground">{step.description || 'No details.'}</p>}
    <div className="flex justify-end gap-2">
      <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onClose}>Cancel</Button>
      {editable ? <Button type="button" variant="plan" size="sm" disabled={busy} onClick={() => void done()}>{busy ? <Loader2 size={14} className="animate-spin" /> : null}Done</Button> : null}
    </div>
  </div>
}

/** "Add a step": type it and press Enter. Its kind is guessed from the wording, one tap to change. */
function AddStepLine({ goal, stageUuid, token, autoFocus }: { goal: Goal; stageUuid: string | null; token?: string; autoFocus?: boolean }) {
  const mode = liveMode(goal)
  const [title, setTitle] = React.useState('')
  const [picked, setPicked] = React.useState<StepTypeKey | null>(null)
  const { busy, run } = useGoalMutation(goal.goal_uuid)
  const kind = picked || guessStepKind(title)
  const add = async () => {
    const text = title.trim()
    if (!text) return
    try {
      await run(() => goalsApi.addStep(goal.goal_uuid, { ...stepInput(newStepDraft(kind, text), mode), stage_uuid: stageUuid }, token))
      setTitle(''); setPicked(null)
    } catch { /* toast shown */ }
  }
  return <form aria-label="Add a step" onSubmit={(event) => { event.preventDefault(); void add() }} className="flex items-center gap-1 py-1 pr-1 text-sm">
    <span className="w-5 shrink-0" />
    <span className="flex w-9 shrink-0 justify-center text-muted-foreground">{busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}</span>
    <input aria-label="New step" value={title} autoFocus={autoFocus} disabled={busy} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { setTitle(''); setPicked(null) } }}
      placeholder="Add a step" className="ml-2 h-9 min-w-0 flex-1 rounded-md bg-transparent px-1 font-semibold outline-none placeholder:font-semibold placeholder:text-muted-foreground focus:bg-current/[0.06]" />
    {title.trim() ? <select aria-label="Kind of step" value={kind} onChange={(event) => setPicked(event.target.value as StepTypeKey)} className="h-8 shrink-0 rounded-lg border border-border bg-background px-2 text-xs font-bold">
      {QUICK_KINDS.map((type) => <option key={type} value={type}>{stepDefinition(type).label}</option>)}
    </select> : null}
    {/* Enter isn't the only way to save: a phone keyboard may not offer it. */}
    {title.trim() ? <Button type="submit" variant="plan" size="sm" className="h-8 shrink-0" disabled={busy}>Add</Button> : null}
  </form>
}

/** "Add a stage": a name and Enter. */
function AddStageLine({ goal, token }: { goal: Goal; token?: string }) {
  const [title, setTitle] = React.useState('')
  const { busy, run } = useGoalMutation(goal.goal_uuid)
  const add = async () => {
    if (!title.trim()) return
    try { await run(() => goalsApi.addStage(goal.goal_uuid, { title: title.trim() }, token)); setTitle('') } catch { /* toast shown */ }
  }
  return <form aria-label="Add a stage" onSubmit={(event) => { event.preventDefault(); void add() }} className="flex items-center gap-3 rounded-2xl border-2 border-border/70 bg-card/60 px-4 py-2">
    {busy ? <Loader2 size={16} className="animate-spin text-muted-foreground" /> : <Plus size={16} className="text-muted-foreground" />}
    <input aria-label="New stage" value={title} disabled={busy} onChange={(event) => setTitle(event.target.value)} placeholder={goal.stages.length ? 'Add a stage' : 'Group steps into stages'}
      className="h-9 min-w-0 flex-1 bg-transparent font-extrabold outline-none placeholder:text-muted-foreground" />
  </form>
}
