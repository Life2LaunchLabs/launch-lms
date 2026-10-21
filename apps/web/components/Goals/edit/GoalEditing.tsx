'use client'

import React from 'react'
import { ArrowDown, ArrowUp, Copy, CornerDownRight, Flag, Loader2, MoreVertical, Pencil, Plus, Trash2, Undo2, X } from 'lucide-react'
import { Button } from '@components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { goalsApi } from '@services/goals/goals'
import { can, goalSteps, type Goal, type Stage, type Step, type StepTypeKey } from '@services/goals/types'
import { cn } from '@/lib/utils'
import { stepDefinition } from '../steps'
import { useGoalMutation } from '../useGoalActions'
import EditSheet from './EditSheet'
import GoalSettingsSheet from './GoalSettingsSheet'
import { QUICK_KINDS } from './kindGuess'
import StageSheet from './StageSheet'
import StepEditor, { draftProblem, newStepDraft, type StepDraft } from './StepEditor'
import { liveMode, stepChanges, stepDraft, stepInput } from './stepDrafts'

type Target =
  | { kind: 'add-step'; stageUuid: string | null; type: StepTypeKey }
  | { kind: 'step'; step: Step }
  | { kind: 'add-stage' }
  | { kind: 'stage'; stage: Stage }
  | { kind: 'settings' }

type Editing = {
  goal: Goal
  token?: string
  /** Can add, change and remove stages and steps. */
  structure: boolean
  // eslint-disable-next-line no-unused-vars
  open: (target: Target) => void
}

const EditingContext = React.createContext<Editing | null>(null)

/** Editing for the goal in view, one object at a time; null when the viewer can't edit it. */
export const useGoalEditing = () => React.useContext(EditingContext)

/**
 * Editing a goal object by object: each step and stage has its own menu, and changing one
 * opens it in a sheet over the goal, so the goal itself never switches into an edit mode.
 */
export function GoalEditingProvider({ goal, token, color, setColor, children }: {
  /** The open goal; null while it loads, which edits nothing. */
  goal: Goal | null; token?: string; color: string
  // eslint-disable-next-line no-unused-vars
  setColor?: (color: string) => void
  children: React.ReactNode
}) {
  const [target, setTarget] = React.useState<Target | null>(null)
  const structure = can(goal || undefined, 'edit_structure')
  const editable = structure || can(goal || undefined, 'edit_schedule') || can(goal || undefined, 'edit_plan_details')
  const value = React.useMemo(() => goal && editable ? { goal, token, structure, open: setTarget } : null, [editable, goal, token, structure])
  React.useEffect(() => setTarget(null), [goal?.goal_uuid])
  const close = () => setTarget(null)
  if (!goal) return <EditingContext.Provider value={null}>{children}</EditingContext.Provider>
  // A step edited while the goal changes underneath shows its latest version.
  const liveStep = target?.kind === 'step' ? [...goal.stages.flatMap((stage) => stage.steps), ...goal.unstaged_steps].find((step) => step.step_uuid === target.step.step_uuid) : undefined
  const liveStage = target?.kind === 'stage' ? goal.stages.find((stage) => stage.stage_uuid === target.stage.stage_uuid) : undefined
  return <EditingContext.Provider value={value}>
    {children}
    {target?.kind === 'add-step' ? <AddStepSheet key={`add-${target.stageUuid}-${target.type}`} goal={goal} token={token} color={color} stageUuid={target.stageUuid} type={target.type} onClose={close} /> : null}
    {target?.kind === 'step' && liveStep ? <EditStepSheet key={liveStep.step_uuid} goal={goal} step={liveStep} token={token} color={color} onClose={close} /> : null}
    {target?.kind === 'add-stage' || (target?.kind === 'stage' && liveStage) ? <StageSheet goal={goal} stage={liveStage} token={token} color={color} onClose={close} /> : null}
    {target?.kind === 'settings' ? <GoalSettingsSheet goal={goal} token={token} color={color} setColor={setColor} onClose={close} /> : null}
  </EditingContext.Provider>
}

/** The kinds a step can be added as here: a learner's own goal never points at an organization's activities or badges. */
const addableKinds = (goal: Goal): StepTypeKey[] => goal.ownership === 'personal' ? QUICK_KINDS : ['task', 'upload', 'write', 'explore', 'decision', 'routine', 'event', 'activity', 'badge']

/** Kinds that point at something chosen (an activity, a badge), so they open in the editor before they're added. */
const NEEDS_PICK: StepTypeKey[] = ['activity', 'badge']

/** Adding a step that needs something chosen first: nothing is saved until Add step. */
function AddStepSheet({ goal, token, color, stageUuid, type, onClose }: { goal: Goal; token?: string; color: string; stageUuid: string | null; type: StepTypeKey; onClose: () => void }) {
  const mode = liveMode(goal)
  const [draft, setDraft] = React.useState<StepDraft>(() => newStepDraft(type))
  const { busy, run } = useGoalMutation(goal.goal_uuid)
  const stage = goal.stages.find((item) => item.stage_uuid === stageUuid)
  const save = async () => {
    if (draftProblem(draft)) return
    try {
      await run(() => goalsApi.addStep(goal.goal_uuid, { ...stepInput(draft, mode), stage_uuid: stageUuid }, token), 'Step added')
      onClose()
    } catch { /* toast shown */ }
  }
  return <EditSheet open onOpenChange={(open) => { if (!open) onClose() }} color={color} title={`New ${stepDefinition(type).label.toLowerCase()} step`} description={stage ? `In ${stage.title}` : undefined}
    footer={<><Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
      <Button type="button" variant="plan" disabled={busy || !!draftProblem(draft)} onClick={() => void save()}>{busy ? <Loader2 size={14} className="animate-spin" /> : null}Add step</Button></>}>
    <form onSubmit={(event) => { event.preventDefault(); void save() }} className="contents">
      <StepEditor value={draft} onChange={setDraft} mode={mode} typeLocked live={{ goal, stageUuid }} orgId={goal.org_id} token={token} />
      <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
    </form>
  </EditSheet>
}

/** A step's name, details, its kind's settings and timing, saved together. */
function EditStepSheet({ goal, step, token, color, onClose }: { goal: Goal; step: Step; token?: string; color: string; onClose: () => void }) {
  const mode = liveMode(goal)
  const initial = React.useMemo(() => stepDraft(step), [step])
  const [draft, setDraft] = React.useState<StepDraft>(initial)
  const { busy, run } = useGoalMutation(goal.goal_uuid)
  const save = async () => {
    const changes = draftProblem(draft) ? {} : stepChanges(initial, draft, mode)
    try {
      if (Object.keys(changes).length) await run(() => goalsApi.updateStep(goal.goal_uuid, step.step_uuid, changes, token))
      onClose()
    } catch { /* toast shown */ }
  }
  return <EditSheet open onOpenChange={(open) => { if (!open) onClose() }} color={color} title="Edit step" description={stepDefinition(step.type).label}
    footer={<><Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
      <Button type="button" variant="plan" disabled={busy || !!draftProblem(draft)} onClick={() => void save()}>{busy ? <Loader2 size={14} className="animate-spin" /> : null}Save</Button></>}>
    <StepEditor value={draft} onChange={setDraft} mode={mode} typeLocked live={{ goal, stageUuid: step.stage_uuid, stepUuid: step.step_uuid }} orgId={goal.org_id} token={token} />
  </EditSheet>
}

const done = (step: Step) => step.status === 'completed' || step.status === 'excused'
const menuButton = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 data-[state=open]:bg-muted'

/** A step's own menu: edit, duplicate, move, reopen, delete. */
export function StepMenu({ step, className }: { step: Step; className?: string }) {
  const editing = useGoalEditing()
  const { busy, run } = useGoalMutation(editing?.goal.goal_uuid || '')
  if (!editing) return null
  const { goal, token, structure } = editing
  const stageSteps = goal.stages.find((stage) => stage.steps.some((item) => item.step_uuid === step.step_uuid))?.steps || goal.unstaged_steps
  const stageUuid = goal.stages.find((stage) => stage.steps.some((item) => item.step_uuid === step.step_uuid))?.stage_uuid ?? null
  const index = stageSteps.findIndex((item) => item.step_uuid === step.step_uuid)
  const quiet = (change: () => Promise<unknown>, message?: string) => void run(change, message).catch(() => undefined)
  const move = (stage: string | null, position: number) => quiet(() => goalsApi.moveStep(goal.goal_uuid, step.step_uuid, { stage_uuid: stage, position }, token))
  const duplicate = () => quiet(() => goalsApi.addStep(goal.goal_uuid, { ...stepInput({ ...stepDraft(step), title: `${step.title} (copy)` }, liveMode(goal)), stage_uuid: stageUuid, position: index + 1 }, token), 'Step duplicated')
  const remove = () => {
    const worked = step.state === 'done' || step.state === 'started' || Boolean(step.result)
    if (!window.confirm(worked ? `Delete “${step.title}”? What you've done on it goes too.` : `Delete “${step.title}”?`)) return
    quiet(() => goalsApi.deleteStep(goal.goal_uuid, step.step_uuid, token), 'Step deleted')
  }
  const reopen = done(step) && (can(goal, 'update_progress') || can(goal, 'complete_restricted_objectives'))
  const otherStages = goal.stages.filter((stage) => stage.stage_uuid !== stageUuid)
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button type="button" disabled={busy} aria-label={`More for ${step.title}`} className={cn(menuButton, className)}>{busy ? <Loader2 size={16} className="animate-spin" /> : <MoreVertical size={16} />}</button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-44">
      <DropdownMenuItem onSelect={() => editing.open({ kind: 'step', step })}><Pencil size={14} className="mr-2" />Edit</DropdownMenuItem>
      {structure ? <DropdownMenuItem onSelect={duplicate}><Copy size={14} className="mr-2" />Duplicate</DropdownMenuItem> : null}
      {reopen ? <DropdownMenuItem onSelect={() => quiet(() => goalsApi.setStatus(goal.goal_uuid, step.step_uuid, 'in_progress', undefined, token), 'Step reopened')}><Undo2 size={14} className="mr-2" />Reopen</DropdownMenuItem> : null}
      {structure ? <>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={index <= 0} onSelect={() => move(stageUuid, index - 1)}><ArrowUp size={14} className="mr-2" />Move up</DropdownMenuItem>
        <DropdownMenuItem disabled={index >= stageSteps.length - 1} onSelect={() => move(stageUuid, index + 1)}><ArrowDown size={14} className="mr-2" />Move down</DropdownMenuItem>
        {otherStages.length ? <DropdownMenuSub>
          <DropdownMenuSubTrigger><CornerDownRight size={14} className="mr-2" />Move to stage</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>{otherStages.map((stage) => <DropdownMenuItem key={stage.stage_uuid} onSelect={() => move(stage.stage_uuid, stage.steps.length)}>{stage.title}</DropdownMenuItem>)}</DropdownMenuSubContent>
        </DropdownMenuSub> : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={remove} className="text-red-600"><Trash2 size={14} className="mr-2" />Delete</DropdownMenuItem>
      </> : null}
    </DropdownMenuContent>
  </DropdownMenu>
}

/** A stage's own menu: make it the current stage, edit, move, delete (once its steps have moved on). */
export function StageMenu({ stage, index, onMakeCurrent }: { stage: Stage; index: number; onMakeCurrent?: () => void }) {
  const editing = useGoalEditing()
  const { busy, run } = useGoalMutation(editing?.goal.goal_uuid || '')
  if (!editing) return null
  const { goal, token, structure } = editing
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
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button type="button" disabled={busy} aria-label={`More for ${stage.title}`} className={menuButton}>{busy ? <Loader2 size={16} className="animate-spin" /> : <MoreVertical size={16} />}</button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-44">
      {onMakeCurrent ? <DropdownMenuItem onSelect={onMakeCurrent}><Flag size={14} className="mr-2" />Make this the current stage</DropdownMenuItem> : null}
      <DropdownMenuItem onSelect={() => editing.open({ kind: 'stage', stage })}><Pencil size={14} className="mr-2" />Edit stage</DropdownMenuItem>
      {structure ? <>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={index === 0} onSelect={() => move(-1)}><ArrowUp size={14} className="mr-2" />Move up</DropdownMenuItem>
        <DropdownMenuItem disabled={index === goal.stages.length - 1} onSelect={() => move(1)}><ArrowDown size={14} className="mr-2" />Move down</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={stage.steps.length > 0} onSelect={remove} className="text-red-600"><Trash2 size={14} className="mr-2" />{stage.steps.length ? 'Delete (move its steps first)' : 'Delete stage'}</DropdownMenuItem>
      </> : null}
    </DropdownMenuContent>
  </DropdownMenu>
}

/**
 * "Add a step" at the foot of a stage: the + opens the kinds in line (and turns into an ✕ to
 * cancel), and picking one adds the step and opens it to name it.
 */
export function AddStepButton({ stageUuid, className }: { stageUuid: string | null; className?: string }) {
  const editing = useGoalEditing()
  const [choosing, setChoosing] = React.useState(false)
  const { busy, run } = useGoalMutation(editing?.goal.goal_uuid || '')
  if (!editing?.structure) return null
  const { goal, token } = editing
  const add = async (type: StepTypeKey) => {
    if (NEEDS_PICK.includes(type)) { setChoosing(false); editing.open({ kind: 'add-step', stageUuid, type }); return }
    const before = new Set(goalSteps(goal).map((step) => step.step_uuid))
    try {
      const draft = newStepDraft(type, stepDefinition(type).label)
      const updated = await run(() => goalsApi.addStep(goal.goal_uuid, { ...stepInput(draft, liveMode(goal)), stage_uuid: stageUuid }, token)) as Goal
      setChoosing(false)
      const added = updated?.stages ? goalSteps(updated).find((step) => !before.has(step.step_uuid)) : undefined
      if (added) editing.open({ kind: 'step', step: added })
    } catch { /* toast shown */ }
  }
  return <div role="group" aria-label={choosing ? 'Add a step' : undefined} className={cn('ml-[72px] flex flex-wrap items-center gap-1.5', className)}>
    <button type="button" aria-expanded={choosing} aria-label={choosing ? 'Cancel adding a step' : undefined} onClick={() => setChoosing(!choosing)}
      className="flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-bold text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2">
      {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : choosing ? <X size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}{choosing ? null : 'Add a step'}
    </button>
    {choosing ? addableKinds(goal).map((type) => {
      const definition = stepDefinition(type)
      const Icon = definition.icon
      return <button key={type} type="button" disabled={busy} onClick={() => void add(type)} title={definition.hint} aria-label={`Add ${definition.label}`}
        className="flex min-h-9 items-center gap-1.5 rounded-full border-2 border-border bg-card px-3 text-sm font-bold transition hover:border-[var(--plan-face)] disabled:opacity-50">
        <Icon size={14} aria-hidden="true" className="text-[var(--plan-accent)]" />{definition.label}
      </button>
    }) : null}
  </div>
}

/** "Add a stage" at the foot of the goal. */
export function AddStageButton() {
  const editing = useGoalEditing()
  if (!editing?.structure) return null
  return <button type="button" onClick={() => editing.open({ kind: 'add-stage' })}
    className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border px-4 text-sm font-bold text-muted-foreground transition hover:border-[var(--plan-face)] hover:text-foreground focus-visible:outline focus-visible:outline-2">
    <span aria-hidden="true" className="text-lg leading-none">+</span>Add a stage
  </button>
}
