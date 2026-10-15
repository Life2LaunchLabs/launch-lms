'use client'

import React from 'react'
import type { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd'
import { ChevronDown, GripVertical, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { goalsApi } from '@services/goals/goals'
import { can, type Goal, type Step } from '@services/goals/types'
import { cn } from '@/lib/utils'
import { stepDefinition } from '../steps'
import { statusLine } from '../path/stepText'
import { useGoalMutation } from '../useGoalActions'
import StepEditor, { newStepDraft, type StepDraft } from './StepEditor'
import { liveMode, otherSteps, stepChanges, stepDraft, stepInput } from './stepDrafts'

/** One step while the goal is being edited: its row, and the step editor when opened. */
export function EditStepRow({ goal, step, token, open, onOpenChange, dragHandle, dragging }: {
  goal: Goal; step: Step; token?: string; open: boolean; dragHandle?: DraggableProvidedDragHandleProps | null; dragging?: boolean
  // eslint-disable-next-line no-unused-vars
  onOpenChange: (open: boolean) => void
}) {
  const mode = liveMode(goal)
  const canEdit = can(goal, 'edit_structure')
  const canSchedule = can(goal, 'edit_schedule')
  const initial = React.useMemo(() => stepDraft(step), [step])
  const [draft, setDraft] = React.useState<StepDraft>(initial)
  const { busy, run } = useGoalMutation(goal.goal_uuid)
  const definition = stepDefinition(step.type)
  const Icon = definition.icon
  React.useEffect(() => { if (!open) setDraft(initial) }, [initial, open])

  const save = async () => {
    if (!draft.title.trim()) return
    const changes = stepChanges(initial, draft, mode)
    try {
      if (Object.keys(changes).length) await run(() => goalsApi.updateStep(goal.goal_uuid, step.step_uuid, changes, token), 'Step saved')
      onOpenChange(false)
    } catch { /* toast shown */ }
  }
  const remove = async () => {
    if (!window.confirm(`Delete “${step.title}”? Anything done on it goes too.`)) return
    try { await run(() => goalsApi.deleteStep(goal.goal_uuid, step.step_uuid, token), 'Step deleted') } catch { /* toast shown */ }
  }

  return <div id={`hub-object-${step.step_uuid}`} tabIndex={-1} className={cn('flex items-stretch overflow-hidden rounded-2xl border-2 border-border bg-card outline-none', dragging && 'shadow-2xl ring-2 ring-[var(--plan-face)]')}>
    <span {...dragHandle} aria-label={`Drag ${step.title}`} className={cn('flex w-9 shrink-0 cursor-grab items-start justify-center pt-4 text-muted-foreground/60 hover:text-muted-foreground', !canEdit && 'invisible')}><GripVertical size={16} /></span>
    <div className="min-w-0 flex-1">
      <button type="button" aria-expanded={open} onClick={() => onOpenChange(!open)} className="flex w-full items-center gap-3 py-3 pr-3 text-left">
        <Icon size={18} aria-hidden="true" className="shrink-0 text-[var(--plan-accent)]" />
        <span className="min-w-0 flex-1"><span className="block truncate font-bold">{step.title || 'Untitled step'}</span><span className="block truncate text-xs text-muted-foreground">{definition.label} · {statusLine(step)}</span></span>
        <ChevronDown size={16} className={cn('shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open ? <div className="flex flex-col gap-4 border-t border-border py-4 pr-4">
        {canEdit || canSchedule ? <StepEditor value={draft} onChange={setDraft} mode={mode} typeLocked others={otherSteps(goal, step.step_uuid)} orgId={goal.org_id} token={token} /> : <p className="text-sm text-muted-foreground">{step.description || 'No details.'}</p>}
        <div className="flex items-center justify-between gap-2">
          {canEdit ? <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void remove()}><Trash2 size={14} />Delete step</Button> : <span />}
          <span className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
            {canEdit || canSchedule ? <Button type="button" variant="plan" size="sm" disabled={busy || !draft.title.trim()} onClick={() => void save()}>{busy ? <Loader2 size={14} className="animate-spin" /> : null}Save step</Button> : null}
          </span>
        </div>
      </div> : null}
    </div>
  </div>
}

/** "Add a step": the step editor for a new step in one stage (or in no stage). */
export function StepAdder({ goal, stageUuid, token, label = 'Add a step' }: { goal: Goal; stageUuid: string | null; token?: string; label?: string }) {
  const mode = liveMode(goal)
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<StepDraft>(() => newStepDraft('task'))
  const { busy, run } = useGoalMutation(goal.goal_uuid)
  const add = async () => {
    if (!draft.title.trim()) return
    try {
      await run(() => goalsApi.addStep(goal.goal_uuid, { ...stepInput(draft, mode), stage_uuid: stageUuid }, token), 'Step added')
      setDraft(newStepDraft(draft.type)); setOpen(false)
    } catch { /* toast shown */ }
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="flex h-12 w-full items-center gap-3 rounded-2xl border-2 border-dashed border-border px-4 text-sm font-bold text-muted-foreground transition hover:border-[var(--plan-face)] hover:text-foreground"><Plus size={16} />{label}</button>
  return <div className="flex flex-col gap-4 rounded-2xl border-2 border-[var(--plan-face)] bg-card p-4">
    <StepEditor value={draft} onChange={setDraft} mode={mode} others={otherSteps(goal)} orgId={goal.org_id} token={token} />
    <div className="flex justify-end gap-2">
      <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
      <Button type="button" variant="plan" size="sm" disabled={busy || !draft.title.trim()} onClick={() => void add()}>{busy ? <Loader2 size={14} className="animate-spin" /> : null}Add step</Button>
    </div>
  </div>
}
