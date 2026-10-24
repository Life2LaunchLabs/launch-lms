'use client'

import React from 'react'
import { DragDropContext, Draggable, Droppable, type DraggableProvidedDragHandleProps, type DropResult } from '@hello-pangea/dnd'
import { ArrowDown, ArrowUp, Clock3, GripVertical, Layers3, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { STEP_TYPE_ORDER, stepDefinition } from '@components/Goals/steps'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { Input } from '@components/ui/input'
import { addStage, mapStage, moveStage, moveStep, removeStage } from '@components/Plans/editor/documentOps'
import { useRequirementFrameworks } from '@components/Plans/editor/StepRequirementLinks'
import type { TemplateEditing } from '@components/Plans/editor/useTemplate'
import { smallGhostClass, smallPrimaryClass } from '@components/Plans/shared/actions'
import type { TemplateDocument, TemplateStage, TemplateStep } from '@services/goals/types'
import { cn } from '@/lib/utils'
import PlanDialog from './PlanDialog'
import StepModal, { type StepTarget } from './StepModal'
import { plural } from './planVersions'

type Props = { orgslug: string; orgId: number; token?: string; editing: TemplateEditing; document: TemplateDocument; editMode: boolean }

const defaultStageTitle = (index: number) => `Stage ${index + 1}`

/**
 * The plan's steps. One stage reads as a plain list; from two on, each has a "Stage N" heading.
 * While editing, a step opens in the step editor, steps drag between stages, and stages are added
 * under the list. Otherwise a step opens to show everything it's set to.
 */
export default function PlanSteps({ orgslug, orgId, token, editing, document, editMode }: Props) {
  const frameworks = useRequirementFrameworks(orgId, token)
  const [target, setTarget] = React.useState<StepTarget>(null)
  const stages = document.stages
  const staged = stages.length > 1
  const count = stages.reduce((total, stage) => total + stage.steps.length, 0)
  const save = editing.save

  const onDragEnd = (result: DropResult) => {
    const { source, destination } = result
    if (!destination || (source.droppableId === destination.droppableId && source.index === destination.index)) return
    void save((current) => moveStep(current, source.droppableId, source.index, destination.droppableId, destination.index))
  }
  // Splitting names the first stage too, unless it already has a name of its own (older plans call it "Steps").
  const split = () => save((current) => addStage(['', 'steps'].includes(current.stages[0].title.trim().toLowerCase()) ? mapStage(current, current.stages[0].key as string, (stage) => ({ ...stage, title: defaultStageTitle(0) })) : current, defaultStageTitle(current.stages.length), null))

  let body: React.ReactNode
  if (!editMode) {
    body = count ? stages.map((stage, index) => <div key={stage.key || index}>
      {staged ? <StageHeading stage={stage} index={index} /> : null}
      <ol className="flex flex-col gap-2">{stage.steps.map((step) => <li key={step.key}><StepRow step={step} onOpen={() => setTarget({ stageKey: stage.key as string, stepKey: step.key })} /></li>)}</ol>
    </div>) : <p className="text-sm text-muted-foreground">No steps yet.</p>
  } else if (!count && !staged) {
    body = <button type="button" onClick={() => setTarget({ stageKey: stages[0].key as string })}
      className="flex w-full flex-col items-center gap-3 rounded-[22px] border-2 border-dashed border-brand/45 bg-brand-soft/60 px-6 py-[38px] transition-colors hover:border-brand hover:bg-brand-soft">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-brand text-white shadow-[0_10px_24px_hsl(var(--brand)/.4)]"><Plus size={26} aria-hidden="true" /></span>
      <b className="text-lg">Add your first step</b>
      <span className="text-sm text-muted-foreground">Tasks, write-ups, uploads, events, decisions and more</span>
      <span className="mt-1 flex gap-1.5" aria-hidden="true">{STEP_TYPE_ORDER.slice(0, 7).map((type) => { const definition = stepDefinition(type); const Icon = definition.icon; return <i key={type} className="grid h-7 w-7 place-items-center rounded-lg text-white" style={{ background: definition.color }}><Icon size={15} /></i> })}</span>
    </button>
  } else {
    body = <DragDropContext onDragEnd={onDragEnd}>
      {stages.map((stage, index) => <div key={stage.key}>
        {staged ? <StageHeading stage={stage} index={index} editing={editing} count={stages.length} /> : null}
        <Droppable droppableId={stage.key as string}>{(list, over) => <ol ref={list.innerRef} {...list.droppableProps} className={cn('flex min-h-2 flex-col gap-2 rounded-2xl transition-colors', over.isDraggingOver && 'bg-brand-soft/50')}>
          {stage.steps.map((step, stepIndex) => <Draggable key={step.key} draggableId={step.key as string} index={stepIndex} isDragDisabled={editing.saving}>{(drag, snapshot) =>
            <li ref={drag.innerRef} {...drag.draggableProps} style={drag.draggableProps.style}>
              <StepRow step={step} dragHandle={drag.dragHandleProps} dragging={snapshot.isDragging} onOpen={() => setTarget({ stageKey: stage.key as string, stepKey: step.key })} />
            </li>}</Draggable>)}
          {list.placeholder}
        </ol>}</Droppable>
        <div className="mt-2.5 flex flex-col gap-1.5">
          <button type="button" onClick={() => setTarget({ stageKey: stage.key as string })} disabled={editing.stale}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-border p-3.5 text-sm font-bold text-muted-foreground transition-colors hover:border-brand hover:text-brand-ink">
            <Plus size={18} aria-hidden="true" />{staged ? `Add step to ${stage.title}` : 'Add step'}
          </button>
          {staged ? null : <StageDivider onClick={() => void split()} icon={<Layers3 size={15} aria-hidden="true" />}>Split into stages</StageDivider>}
        </div>
      </div>)}
      {staged ? <StageDivider onClick={() => void save((current) => addStage(current, defaultStageTitle(current.stages.length), null))} icon={<Plus size={15} aria-hidden="true" />}>Add stage {stages.length + 1}</StageDivider> : null}
    </DragDropContext>
  }

  return <section aria-labelledby="plan-steps">
    <div className="mb-3 mt-[30px] flex items-center justify-between gap-3 border-b border-border pb-2.5">
      <h2 id="plan-steps" className="text-xl font-bold">Steps</h2>
      <span className="text-[13px] text-muted-foreground">{count ? `${plural(count, 'step')}${staged ? ` · ${plural(stages.length, 'stage')}` : ''}` : ''}{editMode && count ? ' · Click a step to edit it' : ''}</span>
    </div>
    {body}
    <StepModal target={target} setTarget={setTarget} orgslug={orgslug} orgId={orgId} token={token} editing={editing} document={document} frameworks={frameworks} readOnly={!editMode} />
  </section>
}

/** One step: its type's colored tile, title, and a line with the type and how it's finished. */
function StepRow({ step, onOpen, dragHandle, dragging }: { step: TemplateStep; onOpen: () => void; dragHandle?: DraggableProvidedDragHandleProps | null; dragging?: boolean }) {
  const definition = stepDefinition(step.type)
  const Icon = definition.icon
  const line = [definition.label, step.completed_by === 'staff' ? 'Done by staff' : null, step.due_week ? `Due week ${step.due_week}` : null, step.after?.length ? `After ${plural(step.after.length, 'step')}` : null].filter(Boolean).join(' · ')
  const tags = [step.review_required ? 'Needs review' : null, step.staff_guide || step.staff_materials?.length ? 'Staff guide' : null].filter(Boolean)
  return <div className={cn('group relative grid grid-cols-[18px_40px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border bg-card py-3 pl-2 pr-3.5 transition hover:border-foreground/20 hover:shadow-[0_1px_2px_hsl(200_30%_10%/.06),0_8px_28px_hsl(200_30%_10%/.08)] motion-safe:animate-[plan-rise_.3s_both]',
    dragging && 'shadow-xl ring-2 ring-brand/40')}>
    {dragHandle ? <span {...dragHandle} aria-label={`Move ${step.title}`} className="relative z-10 grid cursor-grab place-items-center text-muted-foreground opacity-40 hover:opacity-100 active:cursor-grabbing"><GripVertical size={14} /></span> : <span aria-hidden="true" />}
    <span className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ background: definition.color }}><Icon size={20} aria-hidden="true" /></span>
    <button type="button" onClick={onOpen} className="min-w-0 text-left after:absolute after:inset-0 after:rounded-2xl">
      <b className="block truncate text-[14.5px]">{step.title || 'Untitled step'}</b>
      <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">{line}</span>
    </button>
    <span className="flex gap-1.5">{tags.map((tag) => <span key={tag} className="hidden whitespace-nowrap rounded-full bg-muted px-2 py-[3px] text-[11.5px] font-bold text-muted-foreground sm:inline-flex">{tag}</span>)}</span>
  </div>
}

function StageDivider({ onClick, icon, children }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="mt-2 flex w-full items-center gap-3 py-1.5 text-[12.5px] font-bold text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border hover:text-brand-ink">
    {icon}{children}
  </button>
}

/** "Stage N" and its name; while editing, the name is typed in place and the menu has its timing, order and removal. */
function StageHeading({ stage, index, editing, count = 0 }: { stage: TemplateStage; index: number; editing?: TemplateEditing; count?: number }) {
  const named = stage.title !== defaultStageTitle(index)
  const [name, setName] = React.useState(named ? stage.title : '')
  const [timingOpen, setTimingOpen] = React.useState(false)
  React.useEffect(() => setName(named ? stage.title : ''), [stage.title, named])
  const key = stage.key as string
  const rename = () => {
    const next = name.trim() || defaultStageTitle(index)
    if (editing && next !== stage.title) void editing.save((current) => mapStage(current, key, (item) => ({ ...item, title: next })))
  }
  const remove = () => {
    if (!editing) return
    const steps = stage.steps.length
    if (!steps || window.confirm(`Remove ${stage.title} and its ${plural(steps, 'step')} from the draft?`)) void editing.save((current) => removeStage(current, key), 'Stage removed.')
  }
  const meta = [stage.timing, stage.duration_weeks ? plural(stage.duration_weeks, 'week') : null].filter(Boolean).join(' · ')
  return <div className="mb-2.5 mt-[22px] flex items-center gap-2.5">
    <span className="whitespace-nowrap text-[11px] font-extrabold uppercase tracking-[.06em] text-muted-foreground">Stage {index + 1}</span>
    {editing ? <input value={name} onChange={(event) => setName(event.target.value)} onBlur={rename} placeholder="Name this stage" aria-label={`Stage ${index + 1} name`}
      onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setName(named ? stage.title : ''); event.currentTarget.blur() } }}
      className="min-w-0 flex-1 border-0 border-b-2 border-transparent bg-transparent py-0.5 text-[17px] font-bold outline-none placeholder:font-semibold placeholder:text-muted-foreground/60 hover:border-border focus:border-brand" />
      : <h3 className="min-w-0 flex-1 truncate text-[17px] font-bold">{named ? stage.title : ''}</h3>}
    {meta ? <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground"><Clock3 size={13} aria-hidden="true" />{meta}</span> : null}
    {editing ? <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><button type="button" aria-label={`${stage.title} options`} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><MoreHorizontal size={16} /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setTimingOpen(true)}><Clock3 />Length and timing</DropdownMenuItem>
          {index > 0 ? <DropdownMenuItem onSelect={() => void editing.save((current) => moveStage(current, index, index - 1))}><ArrowUp />Move up</DropdownMenuItem> : null}
          {index < count - 1 ? <DropdownMenuItem onSelect={() => void editing.save((current) => moveStage(current, index, index + 1))}><ArrowDown />Move down</DropdownMenuItem> : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={remove} className="text-red-600"><Trash2 />Remove stage</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <StageTiming open={timingOpen} setOpen={setTimingOpen} stage={stage} editing={editing} />
    </> : null}
  </div>
}

/** When a stage happens: rough timing words, and its length in weeks (which due weeks count within). */
function StageTiming({ open, setOpen, stage, editing }: { open: boolean; setOpen: React.Dispatch<React.SetStateAction<boolean>>; stage: TemplateStage; editing: TemplateEditing }) {
  const [timing, setTiming] = React.useState('')
  const [weeks, setWeeks] = React.useState('')
  React.useEffect(() => { if (open) { setTiming(stage.timing || ''); setWeeks(stage.duration_weeks ? String(stage.duration_weeks) : '') } }, [open, stage])
  const save = async () => {
    if (await editing.save((current) => mapStage(current, stage.key as string, (item) => ({ ...item, timing: timing.trim(), duration_weeks: weeks ? Math.max(1, Number(weeks)) : null })))) setOpen(false)
  }
  return <PlanDialog open={open} onOpenChange={setOpen} title={`${stage.title}: length and timing`}
    footer={<><button type="button" className={smallGhostClass + ' h-10 px-4 text-sm'} onClick={() => setOpen(false)}>Cancel</button><button type="button" className={smallPrimaryClass + ' h-10 px-4 text-sm'} onClick={() => void save()} disabled={editing.saving}>Save</button></>}>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1.5 text-[13px] font-bold">Rough timing<Input value={timing} onChange={(event) => setTiming(event.target.value)} placeholder="e.g. Fall" /></label>
      <label className="flex flex-col gap-1.5 text-[13px] font-bold">Length in weeks<Input type="number" min={1} value={weeks} onChange={(event) => setWeeks(event.target.value)} placeholder="Optional" /></label>
    </div>
    <p className="mt-3 text-[12.5px] text-muted-foreground">Steps can only be due in a week once the stage has a length.</p>
  </PlanDialog>
}
