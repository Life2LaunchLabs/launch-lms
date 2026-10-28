'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { DragDropContext, Draggable, Droppable, type DraggableProvidedDragHandleProps, type DropResult } from '@hello-pangea/dnd'
import { ArrowDown, ArrowUp, Clock3, GripVertical, Layers3, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { draftProblem, savedConfig } from '@components/Goals/edit/StepEditor'
import { stepDefinition } from '@components/Goals/steps'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { Input } from '@components/ui/input'
import { addStage, addStep, documentSteps, draftToStep, insertStep, mapStage, mapStep, moveStage, moveStep, newKey, removeStage, removeStep, stepChoices, stepToDraft } from '@components/Plans/editor/documentOps'
import { useRequirementFrameworks } from '@components/Plans/editor/StepRequirementLinks'
import type { TemplateEditing } from '@components/Plans/editor/useTemplate'
import { smallGhostClass, smallPrimaryClass } from '@components/Plans/shared/actions'
import { templatesApi } from '@services/goals/templates'
import type { ActivityConfig, StepTypeKey, TemplateDocument, TemplateStage, TemplateStep } from '@services/goals/types'
import { cn } from '@/lib/utils'
import PlanDialog from './PlanDialog'
import InlineStep, { freshStep, StepTypeRow, type OpenStep } from './InlineStep'
import StepModal, { templateActivityHref, type StepTarget } from './StepModal'
import { plural } from './planVersions'

type Props = { orgslug: string; orgId: number; token?: string; editing: TemplateEditing; document: TemplateDocument; editMode: boolean }
type Spot = { stageKey: string; index: number }

const defaultStageTitle = (index: number) => `Stage ${index + 1}`
// Popups the open step owns: clicking in them doesn't close it.
// Controls marked data-step-action (opening a step, adding one) close the open step themselves.
const KEEP_OPEN = '[data-inline-step], [data-step-action], [data-step-types], [data-radix-popper-content-wrapper], [role="dialog"], [role="alertdialog"], [role="menu"], [data-step-toast]'

/** The step as it saves: the typed draft over what the document has (an activity keeps the activity it made). */
function stepFrom(open: OpenStep, previous?: TemplateStep): TemplateStep {
  const step: TemplateStep = { ...draftToStep({ ...open.draft, config: savedConfig(open.draft) }, previous || ({ key: open.key, materials: [], requirement_node_uuids: [] } as unknown as TemplateStep)), requirement_node_uuids: open.links }
  if (previous?.type === 'activity' && step.type === 'activity') step.config = previous.config
  return step
}

/** Why the open step can't save yet: the editor's reasons, or a due week the stage's length doesn't reach. */
function stepProblem(open: OpenStep, stageWeeks: number | null | undefined): string | null {
  const due = open.draft.due_week
  if (due && !stageWeeks) return 'Give the stage a length to set a due week'
  if (due && stageWeeks && due > stageWeeks) return `The stage is only ${plural(stageWeeks, 'week')} long`
  return draftProblem(open.draft)
}

const activityUuidOf = (step?: TemplateStep | null) => step?.type === 'activity' ? (step.config as ActivityConfig).activity_uuid || '' : ''

/**
 * The plan's steps. One stage reads as a plain list; from two on, each has a "Stage N" heading.
 * Editors change steps where they sit: a step opens in place, Add step (or the + between two steps)
 * shows the step types, and every change saves into the draft as you type. Otherwise a step opens
 * to show everything it's set to.
 */
export default function PlanSteps({ orgslug, orgId, token, editing, document, editMode }: Props) {
  const router = useRouter()
  const frameworks = useRequirementFrameworks(orgId, token)
  const [target, setTarget] = React.useState<StepTarget>(null)
  const [open, setOpenState] = React.useState<OpenStep | null>(null)
  const [adding, setAdding] = React.useState<Spot | null>(null)
  const openRef = React.useRef<OpenStep | null>(null)
  const spot = React.useRef<Spot | null>(null)
  const dirty = React.useRef(false)
  const setOpen = (next: OpenStep | null) => { openRef.current = next; setOpenState(next) }
  const template = editing.template!
  const save = editing.save
  const inDocument = (key: string) => documentSteps(document).some(({ step }) => step.key === key)
  const stageWeeksOf = (key: string) => (documentSteps(document).find(({ step }) => step.key === key)?.stage || document.stages.find((stage) => stage.key === spot.current?.stageKey))?.duration_weeks
  const problemOf = (current: OpenStep) => stepProblem(current, stageWeeksOf(current.key))

  // A new step shows where it was added before it's saved.
  const stages = React.useMemo(() => {
    if (!open || !spot.current || inDocument(open.key)) return document.stages
    const where = spot.current
    return document.stages.map((stage) => stage.key === where.stageKey ? { ...stage, steps: [...stage.steps.slice(0, where.index), stepFrom(open), ...stage.steps.slice(where.index)] } : stage)
  }, [document, open]) // eslint-disable-line react-hooks/exhaustive-deps
  const staged = stages.length > 1
  const count = stages.reduce((total, stage) => total + stage.steps.length, 0)

  /** Saves the open step if it changed and is complete (a new step waits for its title). */
  const persist = async (current: OpenStep | null = openRef.current) => {
    if (!current || !dirty.current || problemOf(current)) return !dirty.current
    dirty.current = false
    const where = spot.current
    const saved = await save((doc) => documentSteps(doc).some(({ step }) => step.key === current.key)
      ? mapStep(doc, current.key, (previous) => stepFrom(current, previous))
      : where && doc.stages.some((stage) => stage.key === where.stageKey) ? insertStep(doc, where.stageKey, where.index, stepFrom(current)) : addStep(doc, doc.stages[0].key as string, stepFrom(current)))
    if (!saved) dirty.current = true
    return saved
  }
  // Changes save a moment after typing stops.
  React.useEffect(() => {
    if (!open || !dirty.current) return
    const timer = window.setTimeout(() => void persist(), 700)
    return () => window.clearTimeout(timer)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Closes the open step, saving it. A new step with no title is dropped. */
  const close = (): boolean => {
    const current = openRef.current
    if (!current) return true
    const problem = dirty.current ? problemOf(current) : null
    // Typed work is never thrown away: a step that can't save yet stays open until it can (or is deleted).
    if (problem && current.draft.title.trim()) { toast.error(`${problem} first, or delete the step.`); return false }
    setOpen(null)
    if (!problem) void persist(current)
    else dirty.current = false
    return true
  }
  const openStep = (stageKey: string, step: TemplateStep) => {
    if (openRef.current?.key === step.key || !close()) return
    setAdding(null)
    spot.current = null
    dirty.current = false
    setOpen({ ...stepToOpen(step), key: step.key as string })
    void stageKey
  }
  const startAdding = (where: Spot) => { if (close()) setAdding(where) }
  const pick = (type: StepTypeKey) => {
    if (!adding) return
    spot.current = adding
    dirty.current = false
    setAdding(null)
    setOpen(freshStep(newKey('step'), type))
  }
  const change = (next: OpenStep) => { dirty.current = true; setOpen(next) }

  // Clicking away closes the step (or the type row).
  React.useEffect(() => {
    if (!open && !adding) return
    const away = (event: MouseEvent) => {
      const element = event.target as Element | null
      // A control that swapped itself out on click (a chip turning into its input) is gone by now. While a menu
      // or dialog is up the page ignores the pointer, so its clicks land on the page itself.
      if (!element?.closest || !element.isConnected || element.closest(KEEP_OPEN) || window.document.querySelector('[role="menu"], [role="dialog"], [role="alertdialog"]')) return
      setAdding(null)
      close()
    }
    window.document.addEventListener('click', away)
    return () => window.document.removeEventListener('click', away)
  })
  // Unsaved typing is saved when leaving the page.
  React.useEffect(() => () => { if (dirty.current) void persist() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const duplicate = async () => {
    const current = openRef.current
    if (!current || !(await persist(current))) return
    const key = newKey('step')
    const title = `${current.draft.title.trim()} (copy)`
    const copied = await save((doc) => {
      const found = documentSteps(doc).find(({ step }) => step.key === current.key)
      if (!found) return doc
      const index = found.stage.steps.findIndex((step) => step.key === current.key)
      return insertStep(doc, found.stage.key as string, index + 1, { ...stepFrom(current, found.step), key, title })
    }, 'Step duplicated.')
    if (copied) { dirty.current = false; setOpen({ ...current, key, draft: { ...current.draft, title }, isNew: false }) }
  }
  const remove = async () => {
    const current = openRef.current
    if (!current) return
    const found = documentSteps(document).find(({ step }) => step.key === current.key)
    dirty.current = false
    setOpen(null)
    if (!found) return
    const activity = found.step.type === 'activity'
    if (activity && !window.confirm(`Delete "${found.step.title}" and its pages from the draft?`)) return
    const index = found.stage.steps.findIndex((step) => step.key === current.key)
    if (!(await save((doc) => removeStep(doc, current.key)))) return
    if (activity) { toast.success('Step deleted.'); return }
    toast((shown) => <span data-step-toast="" className="flex items-center gap-3 text-sm">Deleted “{found.step.title || 'Untitled step'}”.
      <button type="button" className="font-bold text-brand-ink underline" onClick={() => { toast.dismiss(shown.id); void save((doc) => insertStep(doc, found.stage.key as string, index, found.step), 'Step restored.') }}>Undo</button>
    </span>, { duration: 5000 })
  }
  const openActivity = async () => {
    const current = openRef.current
    if (!current) return
    const named = current.draft.title.trim() ? current : { ...current, draft: { ...current.draft, title: 'New activity' } }
    dirty.current = true
    setOpen(named)
    if (!(await persist(named))) return
    const fresh = await templatesApi.get(orgId, template.template_uuid, token)
    const uuid = activityUuidOf(documentSteps(fresh.document).find(({ step }) => step.key === named.key)?.step)
    if (uuid) router.push(templateActivityHref(orgslug, template.template_uuid, uuid))
  }

  const onDragEnd = (result: DropResult) => {
    const { source, destination } = result
    if (!destination || (source.droppableId === destination.droppableId && source.index === destination.index)) return
    void save((current) => moveStep(current, source.droppableId, source.index, destination.droppableId, destination.index))
  }
  // Splitting names the first stage too, unless it already has a name of its own (older plans call it "Steps").
  const split = () => save((current) => addStage(['', 'steps'].includes(current.stages[0].title.trim().toLowerCase()) ? mapStage(current, current.stages[0].key as string, (stage) => ({ ...stage, title: defaultStageTitle(0) })) : current, defaultStageTitle(current.stages.length), null))
  const isAdding = (stageKey: string, index: number) => adding?.stageKey === stageKey && adding.index === index
  const typeRow = <StepTypeRow onPick={pick} onClose={() => setAdding(null)} />

  const inlineStep = (step: TemplateStep, drag?: DraggableProvidedDragHandleProps | null) => {
    const current = open!
    const stored = documentSteps(document).find((item) => item.step.key === step.key)?.step
    const activityUuid = activityUuidOf(stored)
    return <InlineStep value={{ ...current, activityUuid, isNew: !stored }} onChange={change} onClose={() => void close()} onDuplicate={() => void duplicate()} onDelete={() => void remove()} onOpenActivity={() => void openActivity()}
      activityHref={activityUuid ? templateActivityHref(orgslug, template.template_uuid, activityUuid) : ''} orgId={orgId} token={token} templateUuid={template.template_uuid}
      frameworks={frameworks} planLinked={new Set(documentSteps(document).filter((item) => item.step.key !== step.key).flatMap((item) => item.step.requirement_node_uuids || []))}
      others={stepChoices(document, step.key)} saving={editing.saving} autoFocus={!stored} dragHandle={drag}
      problem={current.draft.title.trim() ? problemOf(current) : null} stageWeeks={stageWeeksOf(step.key as string) ?? null}
      onStageWeeks={(weeks) => { const stageKey = (documentSteps(document).find((item) => item.step.key === step.key)?.stage.key || spot.current?.stageKey) as string; void save((doc) => mapStage(doc, stageKey, (stage) => ({ ...stage, duration_weeks: weeks }))) }} />
  }

  let body: React.ReactNode
  if (!editMode) {
    body = count ? stages.map((stage, index) => <div key={stage.key || index}>
      {staged ? <StageHeading stage={stage} index={index} /> : null}
      <ol className="flex flex-col gap-2">{stage.steps.map((step) => <li key={step.key}><StepRow step={step} onOpen={() => setTarget({ stageKey: stage.key as string, stepKey: step.key })} /></li>)}</ol>
    </div>) : <p className="text-sm text-muted-foreground">No steps yet.</p>
  } else if (!count && !staged) {
    const first = { stageKey: stages[0].key as string, index: 0 }
    body = adding ? typeRow : <button type="button" data-step-action="" onClick={() => startAdding(first)} disabled={editing.stale}
      className="flex w-full flex-col items-center gap-3 rounded-[22px] border-2 border-dashed border-brand/45 bg-brand-soft/60 px-6 py-[38px] transition-colors hover:border-brand hover:bg-brand-soft">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-brand text-white shadow-[0_10px_24px_hsl(var(--brand)/.4)]"><Plus size={26} aria-hidden="true" /></span>
      <b className="text-lg">Add your first step</b>
      <span className="text-sm text-muted-foreground">Tasks, write-ups, uploads, events, decisions and more</span>
    </button>
  } else {
    body = <DragDropContext onDragEnd={onDragEnd}>
      {stages.map((stage, index) => { const stageKey = stage.key as string; return <div key={stageKey}>
        {staged ? <StageHeading stage={stage} index={index} editing={editing} count={stages.length} /> : null}
        <Droppable droppableId={stageKey}>{(list, over) => <ol ref={list.innerRef} {...list.droppableProps} className={cn('flex min-h-2 flex-col rounded-2xl transition-colors', over.isDraggingOver && 'bg-brand-soft/50')}>
          {stage.steps.map((step, stepIndex) => <React.Fragment key={step.key}>
            {isAdding(stageKey, stepIndex) ? <li className="py-1">{typeRow}</li> : <Gap first={stepIndex === 0} disabled={editing.stale} onClick={() => startAdding({ stageKey, index: stepIndex })} />}
            <Draggable draggableId={step.key as string} index={stepIndex} isDragDisabled={editing.saving || open?.key === step.key}>{(drag, snapshot) =>
              <li ref={drag.innerRef} {...drag.draggableProps} style={drag.draggableProps.style}>
                {open?.key === step.key ? inlineStep(step, drag.dragHandleProps)
                  : <StepRow step={step} dragHandle={drag.dragHandleProps} dragging={snapshot.isDragging} onOpen={() => openStep(stageKey, step)} />}
              </li>}</Draggable>
          </React.Fragment>)}
          {list.placeholder}
        </ol>}</Droppable>
        <div className="mt-2.5 flex flex-col gap-1.5">
          {isAdding(stageKey, stage.steps.length) ? typeRow : <button type="button" data-step-action="" onClick={() => startAdding({ stageKey, index: stage.steps.length })} disabled={editing.stale}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-border p-3.5 text-sm font-bold text-muted-foreground transition-colors hover:border-brand hover:text-brand-ink">
            <Plus size={18} aria-hidden="true" />{staged ? `Add step to ${stage.title}` : 'Add step'}
          </button>}
          {staged ? null : <StageDivider onClick={() => void split()} icon={<Layers3 size={15} aria-hidden="true" />}>Split into stages</StageDivider>}
        </div>
      </div> })}
      {staged ? <StageDivider onClick={() => void save((current) => addStage(current, defaultStageTitle(current.stages.length), null))} icon={<Plus size={15} aria-hidden="true" />}>Add stage {stages.length + 1}</StageDivider> : null}
    </DragDropContext>
  }

  return <section aria-labelledby="plan-steps">
    <div className="mb-3 mt-[30px] flex items-center justify-between gap-3 border-b border-border pb-2.5">
      <h2 id="plan-steps" className="text-xl font-bold">Steps</h2>
      <span className="text-[13px] text-muted-foreground">{count ? `${plural(count, 'step')}${staged ? ` · ${plural(stages.length, 'stage')}` : ''}` : ''}{editMode && count ? ' · Click a step to edit it' : ''}</span>
    </div>
    {body}
    {editMode ? null : <StepModal target={target} setTarget={setTarget} orgslug={orgslug} orgId={orgId} token={token} editing={editing} document={document} frameworks={frameworks} readOnly />}
  </section>
}

/** The open form of a saved step. */
function stepToOpen(step: TemplateStep): OpenStep {
  return { key: step.key as string, draft: stepToDraft(step), links: step.requirement_node_uuids || [], isNew: false, activityUuid: activityUuidOf(step) }
}

/** The space between two steps; hovering shows a + that adds a step there. */
function Gap({ first, disabled, onClick }: { first: boolean; disabled: boolean; onClick: () => void }) {
  return <li className={cn('group/gap relative flex items-center justify-center', first ? 'h-0' : 'h-2')}>
    {first ? null : <button type="button" data-step-action="" onClick={onClick} disabled={disabled} aria-label="Add a step here"
      className="absolute z-10 flex h-5 w-full items-center gap-2 px-6 opacity-0 transition-opacity before:h-px before:flex-1 before:bg-brand/50 after:h-px after:flex-1 after:bg-brand/50 hover:opacity-100 focus-visible:opacity-100">
      <i className="grid h-5 w-5 place-items-center rounded-full bg-brand text-white"><Plus size={12} aria-hidden="true" /></i>
    </button>}
  </li>
}

/** One step: its type's colored tile, title, and a line with the type and how it's finished. */
function StepRow({ step, onOpen, dragHandle, dragging }: { step: TemplateStep; onOpen: () => void; dragHandle?: DraggableProvidedDragHandleProps | null; dragging?: boolean }) {
  const definition = stepDefinition(step.type)
  const Icon = definition.icon
  const line = [definition.label, step.completed_by === 'staff' ? 'Done by staff' : null, step.due_week ? `Due week ${step.due_week}` : null, step.after?.length ? `After ${plural(step.after.length, 'step')}` : null].filter(Boolean).join(' · ')
  const tags = [step.review_required ? 'Needs review' : null, step.requirement_node_uuids?.length ? plural(step.requirement_node_uuids.length, 'requirement') : null, step.staff_guide || step.staff_materials?.length ? 'Staff guide' : null].filter(Boolean)
  return <div className={cn('group relative grid grid-cols-[18px_40px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border bg-card py-3 pl-2 pr-3.5 transition hover:border-foreground/20 hover:shadow-[0_1px_2px_hsl(200_30%_10%/.06),0_8px_28px_hsl(200_30%_10%/.08)] motion-safe:animate-[plan-rise_.3s_both]',
    dragging && 'shadow-xl ring-2 ring-brand/40')}>
    {dragHandle ? <span {...dragHandle} aria-label={`Move ${step.title}`} className="relative z-10 grid cursor-grab place-items-center text-muted-foreground opacity-40 hover:opacity-100 active:cursor-grabbing"><GripVertical size={14} /></span> : <span aria-hidden="true" />}
    <span className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ background: definition.color }}><Icon size={20} aria-hidden="true" /></span>
    <button type="button" data-step-action="" onClick={onOpen} className="min-w-0 text-left after:absolute after:inset-0 after:rounded-2xl">
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
