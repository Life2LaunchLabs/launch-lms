'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { DragDropContext, Draggable, Droppable, type DraggableProvidedDragHandleProps, type DropResult } from '@hello-pangea/dnd'
import { Check, Clock3, GripVertical, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { planVars } from '@components/Goals/planColors'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { templatesApi, type OutdatedBadgeStep } from '@services/goals/templates'
import type { TemplateStage } from '@services/goals/types'
import { cn } from '@/lib/utils'
import { addStage, addStep, mapStage, mapStep, moveStage, moveStep, removeStage, removeStep, stepChoices } from './documentOps'
import { useRequirementFrameworks } from './StepRequirementLinks'
import TemplateStepRow, { NewTemplateStep } from './TemplateStepRow'
import type { TemplateEditing } from './useTemplate'

/** `readOnly`: every stage and step shown, nothing added, moved, changed or removed (a template the viewer can't edit). */
type Props = { orgslug: string; orgId: number; token?: string; editing: TemplateEditing; readOnly?: boolean }

/** The template's stages and steps: add, edit, reorder and remove, each change saved to the draft. */
export default function TemplateSteps({ orgslug, orgId, token, editing, readOnly = false }: Props) {
  const template = editing.template
  const frameworks = useRequirementFrameworks(orgId, token)
  const [stageOpen, setStageOpen] = React.useState(false)
  const [stageTitle, setStageTitle] = React.useState('')
  const [stageWeeks, setStageWeeks] = React.useState('')
  if (!template) return null
  const document = template.document
  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return
    if (result.type === 'TEMPLATE_STAGE') {
      if (result.source.index !== result.destination.index) void editing.save((current) => moveStage(current, result.source.index, result.destination!.index))
      return
    }
    const { source, destination } = result
    if (source.droppableId === destination.droppableId && source.index === destination.index) return
    void editing.save((current) => moveStep(current, source.droppableId, source.index, destination.droppableId, destination.index))
  }
  const createStage = async () => {
    if (!stageTitle.trim()) return
    if (await editing.save((current) => addStage(current, stageTitle, stageWeeks ? Math.max(1, Number(stageWeeks)) : null), 'Stage added.')) { setStageOpen(false); setStageTitle(''); setStageWeeks('') }
  }
  return <div className="px-4 pb-10 pt-6 sm:px-10" data-plan="" style={planVars()}><div className="mx-auto max-w-5xl">
    {readOnly ? <p className="mb-5 text-xs text-muted-foreground">View only. Open a step to see all of its settings.</p> : <div className="mb-5 flex items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">Edits save to the draft. Learners get them once you publish.{editing.saving ? <Loader2 size={13} className="ml-2 inline animate-spin" /> : null}</p>
      <Modal isDialogOpen={stageOpen} onOpenChange={setStageOpen} minHeight="no-min" minWidth="md" dialogTitle="Add a stage" dialogDescription="Stages group steps: terms, units, milestones or anything that makes sense to learners."
        dialogTrigger={<Button variant="outline" size="sm"><Plus />Add stage</Button>}
        dialogContent={<div className="space-y-4 p-2">
          <label className="block text-xs font-bold"><span className="mb-2 block">Stage name</span><Input autoFocus value={stageTitle} onChange={(event) => setStageTitle(event.target.value)} placeholder="Term 2" /></label>
          <label className="block text-xs font-bold"><span className="mb-2 block">Length in weeks (optional; needed for due weeks)</span><Input type="number" min={1} value={stageWeeks} onChange={(event) => setStageWeeks(event.target.value)} placeholder="6" /></label>
          <Button className="ml-auto flex" onClick={() => void createStage()} disabled={!stageTitle.trim() || editing.saving}>{editing.saving ? <Loader2 className="animate-spin" /> : null}Add stage</Button>
        </div>} />
    </div>}
    {readOnly ? null : <BadgeVersionNotice orgId={orgId} token={token} editing={editing} outdated={template.outdated_badge_steps || []} />}
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="template-stages" type="TEMPLATE_STAGE">{(provided) => <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-8">
        {document.stages.map((stage, index) => <Draggable key={stage.key} draggableId={`stage:${stage.key}`} index={index} isDragDisabled={editing.saving || readOnly}>{(drag, snapshot) =>
          <div ref={drag.innerRef} {...drag.draggableProps} style={drag.draggableProps.style} className={cn(snapshot.isDragging && 'rounded-xl bg-card p-3 shadow-xl ring-2 ring-blue-300')}>
            <StageHeader stage={stage} editing={editing} canRemove={document.stages.length > 1} dragHandleProps={drag.dragHandleProps} readOnly={readOnly} />
            <Droppable droppableId={stage.key as string} type="TEMPLATE_STEP">{(list, over) => <div ref={list.innerRef} {...list.droppableProps} className={cn('space-y-2 py-3 transition', over.isDraggingOver && 'rounded-lg bg-blue-50/70 ring-2 ring-inset ring-blue-200')}>
              {stage.steps.map((step, stepIndex) => <Draggable key={step.key} draggableId={step.key as string} index={stepIndex} isDragDisabled={editing.saving || readOnly}>{(stepDrag, stepSnapshot) =>
                <div ref={stepDrag.innerRef} {...stepDrag.draggableProps} style={stepDrag.draggableProps.style}>
                  <TemplateStepRow step={step} stage={stage} others={stepChoices(document, step.key)} orgslug={orgslug} orgId={orgId} token={token} templateUuid={template.template_uuid} frameworks={frameworks}
                    saving={editing.saving} dragHandleProps={stepDrag.dragHandleProps} dragging={stepSnapshot.isDragging} readOnly={readOnly}
                    onSave={(next, done) => editing.save((current) => mapStep(current, step.key as string, () => next), done)}
                    onDelete={() => editing.save((current) => removeStep(current, step.key as string), 'Step removed.')} />
                </div>}</Draggable>)}
              {list.placeholder}
              {!stage.steps.length ? <div className="rounded-lg border border-dashed border-border py-7 text-center text-xs font-semibold text-muted-foreground">No steps in this stage yet.</div> : null}
              {readOnly ? null : <NewTemplateStep stage={stage} others={stepChoices(document)} orgId={orgId} token={token} saving={editing.saving} onAdd={(step) => editing.save((current) => addStep(current, stage.key as string, step), `Step added to ${stage.title}.`)} />}
            </div>}</Droppable>
          </div>}</Draggable>)}
        {provided.placeholder}
      </div>}</Droppable>
    </DragDropContext>
  </div></div>
}

function StageHeader({ stage, editing, canRemove, dragHandleProps, readOnly = false }: { stage: TemplateStage; editing: TemplateEditing; canRemove: boolean; dragHandleProps?: DraggableProvidedDragHandleProps | null; readOnly?: boolean }) {
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState(stage.title)
  const [timing, setTiming] = React.useState(stage.timing || '')
  const [weeks, setWeeks] = React.useState(stage.duration_weeks ? String(stage.duration_weeks) : '')
  React.useEffect(() => { if (!open) { setTitle(stage.title); setTiming(stage.timing || ''); setWeeks(stage.duration_weeks ? String(stage.duration_weeks) : '') } }, [stage, open])
  const save = async () => {
    if (!title.trim()) return
    if (await editing.save((current) => mapStage(current, stage.key as string, (item) => ({ ...item, title: title.trim(), timing: timing.trim(), duration_weeks: weeks ? Math.max(1, Number(weeks)) : null })))) setOpen(false)
  }
  const remove = () => {
    if (window.confirm(`Remove the stage "${stage.title}" and its ${stage.steps.length} step${stage.steps.length === 1 ? '' : 's'} from the draft?`)) void editing.save((current) => removeStage(current, stage.key as string), 'Stage removed.')
  }
  return <div className="group flex min-h-12 flex-wrap items-center gap-3 border-b border-border pb-2">
    {readOnly ? null : <button type="button" {...dragHandleProps} className="cursor-grab rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 active:cursor-grabbing" aria-label={`Move ${stage.title}`}><GripVertical size={18} /></button>}
    {open && !readOnly ? <>
      <Input autoFocus aria-label="Stage name" value={title} onChange={(event) => setTitle(event.target.value)} className="h-9 min-w-44 flex-1 font-bold" />
      <Input aria-label="Rough timing" value={timing} onChange={(event) => setTiming(event.target.value)} placeholder="Rough timing, e.g. Fall" className="h-9 w-40" />
      <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">Weeks<Input type="number" min={1} value={weeks} onChange={(event) => setWeeks(event.target.value)} className="h-9 w-20" /></label>
      <Button size="sm" onClick={() => void save()} disabled={editing.saving}>{editing.saving ? <Loader2 className="animate-spin" /> : <Check />}Save</Button>
      {canRemove ? <Button size="sm" variant="ghost" className="text-red-700" onClick={remove}><Trash2 />Remove</Button> : null}
    </> : <>
      <h3 className="min-w-0 flex-1 text-base font-black text-foreground">{stage.title}</h3>
      {stage.timing ? <span className="text-xs font-semibold text-muted-foreground">{stage.timing}</span> : null}
      {stage.duration_weeks ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Clock3 size={13} />{stage.duration_weeks} week{stage.duration_weeks === 1 ? '' : 's'}</span> : null}
      {readOnly ? null : <button type="button" onClick={() => setOpen(true)} aria-label={`Edit ${stage.title}`} className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus:opacity-100 group-hover:opacity-100"><Pencil size={14} /></button>}
    </>}
  </div>
}

/** Badge steps pinned to an older major version: compare, then move them on (accepting earlier awards or not). */
function BadgeVersionNotice({ orgId, token, editing, outdated }: { orgId: number; token?: string; editing: TemplateEditing; outdated: OutdatedBadgeStep[] }) {
  const [compareOpen, setCompareOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  if (!outdated.length || !editing.template) return null
  const update = async (acceptPrevious: boolean) => {
    setBusy(true)
    try {
      await editing.replace(await templatesApi.updateBadgeVersions(orgId, editing.template!.template_uuid, acceptPrevious, token))
      toast.success(acceptPrevious ? 'Updated; earlier versions of the badge still count.' : 'Updated; learners need the new version of the badge.')
    } catch (error: any) { toast.error(error?.message || 'Could not update the badge steps.') } finally { setBusy(false) }
  }
  return <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
    <p className="text-xs font-bold text-amber-950">A badge has a newer major version.</p>
    <p className="mt-0.5 text-[11px] text-amber-800">Choose whether earlier awards still count for {outdated.map((item) => item.title).join(', ')}. Goals already handed out keep their version.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <Modal isDialogOpen={compareOpen} onOpenChange={setCompareOpen} minWidth="md" dialogTitle="Compare badge versions" dialogDescription="What changed in each badge, and how many people hold an earlier version."
        dialogTrigger={<button type="button" className="rounded-lg border border-amber-900 px-3 py-2 text-xs font-bold text-amber-950">Compare versions</button>}
        dialogContent={<div className="space-y-4">{outdated.map((item) => <section key={item.step_key} className="rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3"><p className="text-sm font-black">{item.title} · {item.badge_name}</p><span className="text-xs font-bold text-amber-800">{item.earlier_version_holder_count} earlier-version holder{item.earlier_version_holder_count === 1 ? '' : 's'}</span></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">{(['previous', 'latest'] as const).map((side) => { const version = item.version_comparison[side]; return <div key={side} className="rounded-lg bg-muted p-3">
            <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">{side === 'previous' ? 'Earlier' : 'New'} · v{version.semantic_version}</p><p className="mt-1 text-sm font-bold">{version.title}</p>{version.description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{version.description}</p> : null}
          </div> })}</div>
        </section>)}</div>} />
      <button type="button" disabled={busy || editing.stale} onClick={() => void update(true)} className="rounded-lg border border-amber-900 px-3 py-2 text-xs font-bold text-amber-950 disabled:opacity-50">Earlier versions count</button>
      <button type="button" disabled={busy || editing.stale} onClick={() => void update(false)} className="rounded-lg bg-amber-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? <Loader2 size={13} className="mr-1 inline animate-spin" /> : null}Require the new version</button>
    </div>
  </div>
}
