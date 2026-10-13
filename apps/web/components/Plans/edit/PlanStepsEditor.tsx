'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import { Check, ChevronDown, GripVertical, Loader2, Pencil, Plus, Sparkles, X } from 'lucide-react'
import { useHub } from '@components/Hub/HubContext'
import { Button } from '@components/ui/button'
import { planningApi } from '@services/planning/planning'
import { cn } from '@/lib/utils'
import ObjectiveCard from '../objective/ObjectiveCard'
import { dateValue, inlineEditableClass } from '../planDates'
import { ProposedObjectiveEditor, ProposedPhaseEditor } from './HubProposals'

type AgentPhase = { operationId: string; position: number; phase: { local_id: string; name: string; description: string; due_date: string } }
type AgentObjective = { operationId: string; targetPhaseUuid: string; objective: { local_id: string; title: string; description: string; due_date: string; phase_name: string } }

/**
 * A plan's steps while editing: chapters in order, each a reorderable list. Steps drag
 * between chapters; Hub's proposed chapters and steps appear in place for review.
 */
export default function PlanStepsEditor({ detail, orgslug, token, viewerUserId, refresh, color, selectedObjectiveUuid, setSelectedObjectiveUuid }: any) {
  const hub = useHub()
  const canEdit = detail.capabilities.includes('edit_structure')
  const canSchedule = detail.capabilities.includes('edit_schedule')
  const [adding, setAdding] = React.useState<string | null>(null)
  const [newTitle, setNewTitle] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [newObjectiveUuid, setNewObjectiveUuid] = React.useState('')
  const [agentPhases, setAgentPhases] = React.useState<AgentPhase[]>([])
  const [agentObjectives, setAgentObjectives] = React.useState<AgentObjective[]>([])
  const handled = React.useRef(new Set<string>())
  const phases = React.useMemo(() => detail.phases || [], [detail.phases])
  const allObjectives = detail.objectives || phases.flatMap((phase: any) => phase.objectives || [])
  const loose = allObjectives.filter((objective: any) => !objective.phase_uuid)
  const editingThisPlan = hub?.editRun?.status === 'active' && hub.editRun.scope.kind === 'plan' && hub.editRun.scope.target_uuid === detail.plan_uuid

  React.useEffect(() => {
    if (editingThisPlan) return
    setAgentPhases([]); setAgentObjectives([]); handled.current.clear()
  }, [detail.plan_uuid, editingThisPlan])

  // Hub's proposals arrive as operations; show each once until the learner saves or cancels it.
  React.useEffect(() => {
    if (!editingThisPlan) return
    const pending = hub?.editOperations || []
    const phaseAdditions = pending.flatMap((operation) => operation.type === 'add_plan_phases' && !handled.current.has(operation.operation_id) ? [operation] : [])
    const additions = pending.flatMap((operation) => operation.type === 'add_plan_objectives' && !handled.current.has(operation.operation_id) ? [operation] : [])
    if (!additions.length && !phaseAdditions.length) return
    for (const operation of [...phaseAdditions, ...additions]) handled.current.add(operation.operation_id)
    const settled = new Set((hub?.editRun?.objects || []).filter((item) => item.status !== 'editing').map((item) => item.object_key))
    setAgentPhases((current) => {
      const known = new Set(current.map((item) => item.phase.local_id))
      return [...current, ...phaseAdditions.flatMap((operation) => operation.phases.filter((phase) => !known.has(phase.local_id) && !settled.has(phase.local_id)).map((phase, position) => ({ operationId: operation.operation_id, position: phases.length + position, phase })))]
    })
    setAgentObjectives((current) => {
      const known = new Set(current.map((item) => item.objective.local_id))
      return [...current, ...additions.flatMap((operation) => operation.objectives.filter((objective) => !known.has(objective.local_id) && !settled.has(objective.local_id)).map((objective) => {
        const recovered = hub?.editRun?.objects.find((item) => item.object_key === objective.local_id && item.status === 'editing')
        return { operationId: operation.operation_id, targetPhaseUuid: String(recovered?.current_fields.phase_uuid || phases.find((phase: any) => phase.name === objective.phase_name)?.phase_uuid || phases[0]?.phase_uuid || ''), objective }
      }))]
    })
  }, [editingThisPlan, phases, hub?.editOperations, hub?.editRun?.objects])

  const finishReview = (kind: 'phases' | 'objectives', remaining: number, decision: string) => {
    const run = hub?.editRun
    if (!run || remaining) return
    hub.enqueueEditContinuation({ id: crypto.randomUUID(), conversationUuid: run.conversation_uuid, runUuid: run.run_uuid, content: `[[hub-session-event]] You finished reviewing the proposed ${kind}\n${decision}\nAll proposed ${kind} have now been reviewed. Continue working toward our editing goal.` })
  }
  const settleObjective = (localId: string, decision: string) => {
    setAgentObjectives((current) => current.filter((item) => item.objective.local_id !== localId))
    finishReview('objectives', agentObjectives.filter((item) => item.objective.local_id !== localId).length, decision)
  }
  const settlePhase = (localId: string, decision: string) => {
    setAgentPhases((current) => current.filter((item) => item.phase.local_id !== localId))
    finishReview('phases', agentPhases.filter((item) => item.phase.local_id !== localId).length, decision)
  }

  const addObjective = async (phaseUuid: string | null) => {
    if (!newTitle.trim()) return
    setSaving(true)
    try {
      const updated = await planningApi.addObjective(detail.slug, { title: newTitle.trim(), phase_uuid: phaseUuid }, token)
      const created = updated.objectives?.at(-1)
      setNewTitle(''); setAdding(null); await refresh()
      if (created) { setSelectedObjectiveUuid(created.objective_uuid); setNewObjectiveUuid(created.objective_uuid) }
    } catch (error: any) { toast.error(error?.message || 'Could not add this step.') } finally { setSaving(false) }
  }

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return
    const { source, destination, draggableId } = result
    if (source.droppableId === destination.droppableId && source.index === destination.index) return
    const objective = allObjectives.find((item: any) => item.objective_uuid === draggableId)
    if (!objective) return
    const phaseUuid = destination.droppableId === 'loose' ? null : destination.droppableId
    const others = allObjectives.filter((item: any) => item.objective_uuid !== draggableId)
    const destinationItems = others.filter((item: any) => (item.phase_uuid || null) === phaseUuid)
    const anchor = destinationItems[destination.index] || destinationItems.at(-1)
    const anchorIndex = anchor ? others.indexOf(anchor) + (destinationItems[destination.index] ? 0 : 1) : others.length
    const ordered = [...others.slice(0, anchorIndex), objective, ...others.slice(anchorIndex)]
    setSaving(true)
    try {
      await Promise.all(ordered.map((item: any, position: number) => planningApi.updateObjective(detail.slug, item.objective_uuid, { position, ...(item.objective_uuid === draggableId ? { phase_uuid: phaseUuid } : {}) }, token)))
      await refresh()
    } catch (error: any) { toast.error(error?.message || 'Could not move this step.') } finally { setSaving(false) }
  }

  const stepList = (key: string, items: any[], phaseUuid: string | null) => {
    const proposed = agentObjectives.filter((item) => item.targetPhaseUuid === (phaseUuid || ''))
    return <>
      <Droppable droppableId={key} isDropDisabled={!canEdit}>
        {(provided, snapshot) => <ol ref={provided.innerRef} {...provided.droppableProps} className={cn('flex min-h-4 flex-col gap-2 rounded-2xl transition-colors', snapshot.isDraggingOver && 'bg-raised/60')}>
          {items.map((objective: any, index: number) => <Draggable key={objective.objective_uuid} draggableId={objective.objective_uuid} index={index} isDragDisabled={!canEdit || saving}>
            {(drag, dragging) => <li id={`hub-object-${objective.objective_uuid}`} ref={drag.innerRef} {...drag.draggableProps} data-objective-shell={objective.objective_uuid} tabIndex={-1} style={drag.draggableProps.style} className={cn('flex items-stretch overflow-hidden rounded-2xl border-2 border-border bg-card outline-none', dragging.isDragging && 'shadow-2xl ring-2 ring-[var(--plan-face)]')}>
              <button type="button" aria-label={`Drag ${objective.title}`} {...drag.dragHandleProps} className={cn('flex w-9 shrink-0 cursor-grab items-start justify-center pt-5 text-muted-foreground/60 hover:text-muted-foreground', !canEdit && 'invisible')}><GripVertical size={16} /></button>
              <div className="min-w-0 flex-1"><ObjectiveCard item={{ ...objective, plan: { plan_uuid: detail.plan_uuid, slug: detail.slug, name: detail.name }, subject: detail.subject, is_mine: detail.is_mine }} orgslug={orgslug} token={token} viewerUserId={viewerUserId} refresh={refresh} color={color} editorMode detail={detail} expanded={selectedObjectiveUuid === objective.objective_uuid} startEditing={newObjectiveUuid === objective.objective_uuid} onStartedEditing={() => setNewObjectiveUuid('')} onExpandedChange={(open: boolean) => setSelectedObjectiveUuid(open ? objective.objective_uuid : '')} /></div>
            </li>}
          </Draggable>)}
          {provided.placeholder}
        </ol>}
      </Droppable>
      {proposed.map(({ operationId, objective }) => <ProposedObjectiveEditor key={objective.local_id} operationId={operationId} objective={objective} recovered={hub?.editRun?.objects.find((item) => item.object_key === objective.local_id && item.status === 'editing')} detail={detail} phases={phases} color={color} token={token} refresh={refresh} onPhaseChange={(next: string) => setAgentObjectives((current) => current.map((item) => item.objective.local_id === objective.local_id ? { ...item, targetPhaseUuid: next } : item))} onSettled={settleObjective} />)}
      {canEdit ? <StepAdder open={adding === key} setOpen={(open) => setAdding(open ? key : null)} title={newTitle} setTitle={setNewTitle} saving={saving} onAdd={() => void addObjective(phaseUuid)} /> : null}
    </>
  }

  return <DragDropContext onDragEnd={(result) => void onDragEnd(result)}>
    <div className="flex flex-col gap-8">
      {phases.map((phase: any) => <section key={phase.phase_uuid} id={`plan-phase-${phase.phase_uuid}`} aria-label={phase.name} className="flex flex-col gap-3">
        <PhaseHeader phase={phase} detail={detail} token={token} refresh={refresh} canEdit={canEdit} canSchedule={canSchedule} />
        {stepList(phase.phase_uuid, (phase.objectives || []), phase.phase_uuid)}
      </section>)}
      {loose.length || !phases.length ? <section aria-label={phases.length ? 'More steps' : 'Steps'} className="flex flex-col gap-3">
        {phases.length ? <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">More steps</h3> : null}
        {stepList('loose', loose, null)}
      </section> : null}
      {agentPhases.map(({ operationId, position, phase }) => <ProposedPhaseEditor key={phase.local_id} operationId={operationId} position={position} phase={phase} recovered={hub?.editRun?.objects.find((item) => item.object_key === phase.local_id && item.status === 'editing')} detail={detail} token={token} refresh={refresh} onSettled={settlePhase} />)}
      {canEdit ? <ChapterAdder detail={detail} token={token} refresh={refresh} /> : null}
      {canEdit && hub ? <div className="flex items-center gap-3 rounded-2xl bg-card p-4">
        <Sparkles size={20} className="shrink-0 text-[#7cc4ff]" aria-hidden="true" />
        <p className="flex-1 text-sm text-muted-foreground">Ask Hub to suggest steps for this plan.</p>
        <Button type="button" variant="surface" size="sm" onClick={() => hub.open({ prompt: `Suggest a few steps for my plan “${detail.name}”.` })}>Suggest</Button>
      </div> : null}
    </div>
  </DragDropContext>
}

function StepAdder({ open, setOpen, title, setTitle, saving, onAdd }: { open: boolean; setOpen: (open: boolean) => void; title: string; setTitle: (title: string) => void; saving: boolean; onAdd: () => void }) { // eslint-disable-line no-unused-vars
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="flex h-12 items-center gap-3 rounded-2xl border-2 border-dashed border-border px-4 text-sm font-bold text-muted-foreground transition hover:border-[var(--plan-face)] hover:text-foreground"><Plus size={16} />Add a step</button>
  return <div className="flex gap-2 rounded-2xl border-2 border-[var(--plan-face)] bg-card p-2">
    <input autoFocus aria-label="New step" value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onAdd(); if (event.key === 'Escape') setOpen(false) }} placeholder="What needs to happen?" className="h-10 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" />
    <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Cancel"><X size={16} /></Button>
    <Button type="button" variant="plan" size="sm" className="h-10" disabled={saving || !title.trim()} onClick={onAdd}>Add</Button>
  </div>
}

function ChapterAdder({ detail, token, refresh }: any) {
  const [name, setName] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const add = async () => {
    if (!name.trim()) return
    setSaving(true)
    try { await planningApi.addPhase(detail.slug, { name: name.trim() }, token); setName(''); setOpen(false); await refresh() }
    catch (error: any) { toast.error(error?.message || 'Could not add this chapter.') } finally { setSaving(false) }
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="flex w-fit items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground"><Plus size={15} />{detail.phases?.length ? 'Add a chapter' : 'Group steps into chapters'}</button>
  return <div className="flex gap-2 rounded-2xl border-2 border-border bg-card p-2">
    <input autoFocus aria-label="Chapter name" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void add(); if (event.key === 'Escape') setOpen(false) }} placeholder="Chapter name" className="h-10 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" />
    <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Cancel"><X size={16} /></Button>
    <Button type="button" variant="surface" size="sm" className="h-10" disabled={saving || !name.trim()} onClick={() => void add()}>Add</Button>
  </div>
}

/** A chapter's name, end date and details, editable in place. */
function PhaseHeader({ phase, detail, token, refresh, canEdit, canSchedule }: any) {
  const initial = { name: phase.name, description: phase.description || '', due_date: dateValue(phase.due_date) }
  const [editing, setEditing] = React.useState(false)
  const [detailsOpen, setDetailsOpen] = React.useState(false)
  const [draft, setDraft] = React.useState(initial)
  const [saving, setSaving] = React.useState(false)
  const save = async () => {
    if (!draft.name.trim()) return
    setSaving(true)
    try { await planningApi.updatePhase(detail.slug, phase.phase_uuid, { ...(canEdit ? { name: draft.name.trim(), description: draft.description } : {}), ...(canSchedule ? { due_date: draft.due_date || null } : {}) }, token); await refresh(); setEditing(false) }
    catch (error: any) { toast.error(error?.message || 'Could not update this chapter.') } finally { setSaving(false) }
  }
  if (editing) return <div className="flex flex-col gap-2 rounded-2xl bg-card p-3">
    <div className="flex items-center gap-2">
      <input autoFocus aria-label="Chapter name" value={draft.name} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={cn(inlineEditableClass, 'min-w-0 flex-1 text-base font-bold')} />
      {canSchedule ? <input type="date" aria-label={`${phase.name} end date`} value={draft.due_date} onChange={(event) => setDraft({ ...draft, due_date: event.target.value })} className="h-9 rounded-xl border-2 border-border bg-background px-2 text-xs" /> : null}
      <Button type="button" variant="ghost" size="icon" disabled={saving} onClick={() => { setDraft(initial); setEditing(false) }} aria-label={`Cancel editing ${phase.name}`}><X size={15} /></Button>
      <Button type="button" variant="plan" size="icon" disabled={saving || !draft.name.trim()} onClick={() => void save()} aria-label={`Save ${phase.name}`}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />}</Button>
    </div>
    {canEdit ? <textarea aria-label="Chapter details" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Add context for this chapter" className={cn(inlineEditableClass, 'min-h-16 w-full resize-y px-1 py-2 text-sm')} /> : null}
  </div>
  return <div>
    <div className="group/phase flex items-center gap-2">
      <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">{phase.name}</h3>
      {phase.due_date ? <span className="text-xs text-muted-foreground">· ends {new Date(`${dateValue(phase.due_date)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span> : null}
      {phase.description ? <button type="button" onClick={() => setDetailsOpen(!detailsOpen)} aria-label={`${detailsOpen ? 'Hide' : 'Show'} details for ${phase.name}`} className="rounded p-1 text-muted-foreground hover:bg-raised"><ChevronDown size={13} className={cn('transition-transform', detailsOpen && 'rotate-180')} /></button> : null}
      {canEdit || canSchedule ? <button type="button" onClick={() => { setDraft(initial); setEditing(true) }} aria-label={`Edit ${phase.name}`} className="rounded p-1 text-muted-foreground hover:bg-raised"><Pencil size={13} /></button> : null}
    </div>
    {detailsOpen && phase.description ? <p className="mt-2 text-sm text-muted-foreground">{phase.description}</p> : null}
  </div>
}
