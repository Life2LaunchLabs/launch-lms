'use client'

import React from 'react'
import Link from 'next/link'
import { ChevronDown, GripVertical, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import type { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd'
import StepEditor, { newStepDraft, type StepDraft } from '@components/Goals/edit/StepEditor'
import { stepDefinition } from '@components/Goals/steps'
import { Button } from '@components/ui/button'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { ActivityConfig, TemplateStage, TemplateStep } from '@services/goals/types'
import { cn } from '@/lib/utils'
import { draftToStep, stepToDraft } from './documentOps'
import StepRequirementLinks, { type RequirementFramework } from './StepRequirementLinks'

type Choices = Array<{ id: string; title: string }>

/** The admin activity editor for a template's activity step. */
export const templateActivityHref = (orgslug: string, templateUuid: string, activityUuid: string) =>
  getUriWithOrg(orgslug, `${routePaths.org.dash.program(templateUuid)}/activity/${encodeURIComponent(activityUuid.replace(/^learning_activity_/, ''))}`)

function StepSummary({ step, stage }: { step: TemplateStep; stage: TemplateStage }) {
  const definition = stepDefinition(step.type)
  const bits = [
    definition.label,
    step.completed_by === 'staff' ? 'staff mark it done' : step.review_required ? 'staff review' : null,
    step.due_week && stage.duration_weeks ? `due week ${step.due_week}` : null,
    step.after?.length ? `waits on ${step.after.length}` : null,
  ].filter(Boolean)
  return <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{bits.join(' · ')}</span>
}

type RowProps = {
  step: TemplateStep
  stage: TemplateStage
  others: Choices
  orgslug: string
  orgId: number
  token?: string
  templateUuid: string
  frameworks: RequirementFramework[]
  saving: boolean
  dragHandleProps?: DraggableProvidedDragHandleProps | null
  dragging?: boolean
  // eslint-disable-next-line no-unused-vars
  onSave: (step: TemplateStep, done?: string) => Promise<boolean>
  onDelete: () => Promise<boolean>
}

/** One template step: a compact row that opens into the shared step editor and its requirement links. */
export default function TemplateStepRow({ step, stage, others, orgslug, orgId, token, templateUuid, frameworks, saving, dragHandleProps, dragging, onSave, onDelete }: RowProps) {
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<StepDraft>(() => stepToDraft(step))
  React.useEffect(() => { if (!open) setDraft(stepToDraft(step)) }, [step, open])
  const definition = stepDefinition(step.type)
  const Icon = definition.icon
  const activityUuid = step.type === 'activity' ? (step.config as ActivityConfig).activity_uuid : ''
  const save = async () => { if (draft.title.trim() && await onSave(draftToStep(draft, step), 'Step saved.')) setOpen(false) }
  return <div className={cn('group flex items-stretch gap-1', dragging && 'rounded-xl shadow-xl ring-2 ring-blue-300')}>
    <button type="button" {...dragHandleProps} className="w-7 cursor-grab rounded-lg text-muted-foreground opacity-0 hover:bg-muted focus:opacity-100 group-hover:opacity-100" aria-label={`Move ${step.title}`}><GripVertical size={16} className="mx-auto" /></button>
    <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <div className="flex items-center gap-3 p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--plan-face)_15%,hsl(var(--card)))] text-[var(--plan-accent)]"><Icon size={17} aria-hidden="true" /></span>
        <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-black">{step.title}</span><StepSummary step={step} stage={stage} />
        </button>
        {activityUuid ? <Button asChild size="sm" variant="outline"><Link href={templateActivityHref(orgslug, templateUuid, activityUuid)}><Pencil />Edit activity</Link></Button> : null}
        <button type="button" onClick={() => setOpen((current) => !current)} aria-label={open ? 'Close step' : 'Edit step'} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"><ChevronDown size={16} className={open ? 'rotate-180' : ''} /></button>
      </div>
      {open ? <div className="space-y-4 border-t border-border p-4">
        <StepEditor value={draft} onChange={setDraft} mode="template" others={others} typeLocked orgId={orgId} token={token} />
        <StepRequirementLinks value={step.requirement_node_uuids || []} frameworks={frameworks} saving={saving} onSave={(nodes) => onSave({ ...step, requirement_node_uuids: nodes }, 'Requirement links saved.')} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" size="sm" variant="ghost" className="text-red-700" disabled={saving} onClick={() => { if (window.confirm(`Remove "${step.title}" from the template draft?`)) void onDelete() }}><Trash2 />Remove step</Button>
          <div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="button" size="sm" disabled={saving || !draft.title.trim()} onClick={() => void save()}>{saving ? <Loader2 className="animate-spin" /> : null}Save step</Button></div>
        </div>
      </div> : null}
    </div>
  </div>
}

/** Adds a step to a stage: pick its type, then fill in the same editor. Activity steps get their activity on save. */
export function NewTemplateStep({ stage, others, orgId, token, saving, onAdd }: { stage: TemplateStage; others: Choices; orgId: number; token?: string; saving: boolean; onAdd: (step: TemplateStep) => Promise<boolean> }) { // eslint-disable-line no-unused-vars
  const [draft, setDraft] = React.useState<StepDraft | null>(null)
  if (!draft) return <button type="button" onClick={() => setDraft(newStepDraft('task'))} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border text-xs font-bold text-muted-foreground transition hover:border-foreground hover:bg-muted hover:text-foreground"><Plus size={15} />Add a step</button>
  const add = async () => {
    if (!draft.title.trim()) return
    if (await onAdd(draftToStep(draft))) setDraft(null)
  }
  return <section className="rounded-xl border border-[var(--plan-face)] bg-card p-4 shadow-xs">
    <p className="mb-3 text-xs font-black">New step · {stage.title}</p>
    <StepEditor value={draft} onChange={setDraft} mode="template" others={others} orgId={orgId} token={token} />
    {draft.type === 'activity' ? <p className="mt-3 text-xs text-muted-foreground">Its activity is created when you add the step; write its pages next with Edit activity.</p> : null}
    <div className="mt-4 flex justify-end gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button><Button type="button" size="sm" onClick={() => void add()} disabled={saving || !draft.title.trim()}>{saving ? <Loader2 className="animate-spin" /> : <Plus />}Add step</Button></div>
  </section>
}
