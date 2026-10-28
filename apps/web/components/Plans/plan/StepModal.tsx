'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil } from 'lucide-react'
import StepEditor, { draftProblem, newStepDraft, savedConfig, type StepDraft } from '@components/Goals/edit/StepEditor'
import { planVars } from '@components/Goals/planColors'
import { stepDefinition } from '@components/Goals/steps'
import { coverPalette } from '@components/Plans/shared/PlanCover'
import { smallGhostClass, smallPrimaryClass } from '@components/Plans/shared/actions'
import { addStep, documentSteps, draftToStep, mapStep, removeStep, stepChoices, stepToDraft } from '@components/Plans/editor/documentOps'
import StepRequirementLinks, { type RequirementFramework } from '@components/Plans/editor/StepRequirementLinks'
import type { TemplateEditing } from '@components/Plans/editor/useTemplate'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { templatesApi } from '@services/goals/templates'
import type { ActivityConfig, StepTypeKey, TemplateDocument, TemplateStep } from '@services/goals/types'
import PlanDialog from './PlanDialog'
import StepPreview from './StepPreview'

/** Which step the dialog is on: a stage to add to (picking a type first), or one step to open. */
export type StepTarget = { stageKey: string; stepKey?: string } | null

const PICKER_ORDER: StepTypeKey[] = ['task', 'write', 'upload', 'decision', 'event', 'routine', 'explore', 'activity', 'portfolio', 'badge']

/** The admin activity editor for a plan's activity step. */
export const templateActivityHref = (orgslug: string, templateUuid: string, activityUuid: string) =>
  getUriWithOrg(orgslug, `${routePaths.org.admin.template(templateUuid)}/activity/${encodeURIComponent(activityUuid.replace(/^learning_activity_/, ''))}`)

type Props = {
  target: StepTarget
  setTarget: React.Dispatch<React.SetStateAction<StepTarget>>
  orgslug: string
  orgId: number
  token?: string
  editing: TemplateEditing
  /** The steps shown: the draft while editing, else the live version. */
  document: TemplateDocument
  frameworks: RequirementFramework[]
  /** Show the step without changing it. */
  readOnly: boolean
}

/**
 * Adding a step: pick its type, then write it with what learners will see beside it. Opening a step
 * goes straight to the same editor. Changes save to the draft when the dialog's button is pressed.
 */
export default function StepModal({ target, setTarget, orgslug, orgId, token, editing, document, frameworks, readOnly }: Props) {
  const router = useRouter()
  const template = editing.template!
  const existing = target?.stepKey ? documentSteps(document).find(({ step }) => step.key === target.stepKey)?.step || null : null
  const [type, setType] = React.useState<StepTypeKey | null>(null)
  const [draft, setDraft] = React.useState<StepDraft | null>(null)
  const [links, setLinks] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState(false)
  // Reset whenever the dialog opens on something else.
  React.useEffect(() => {
    setType(existing?.type || null)
    setDraft(existing ? stepToDraft(existing) : null)
    setLinks(existing?.requirement_node_uuids || [])
  }, [target?.stageKey, target?.stepKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => setTarget(null)
  const pick = (next: StepTypeKey) => { setType(next); setDraft(newStepDraft(next)) }
  const plan = { ...template, title: document.template.title || template.title }

  if (!target) return null
  if (!existing && (!type || !draft)) {
    return <PlanDialog open onOpenChange={(open) => !open && close()} title="Add a step" size="md" description="Pick what kind of step to add.">
      <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {PICKER_ORDER.map((key) => {
          const definition = stepDefinition(key)
          const Icon = definition.icon
          return <li key={key} className="flex"><button type="button" onClick={() => pick(key)} style={{ '--type': definition.color } as React.CSSProperties}
            className="flex w-full items-start gap-3.5 rounded-2xl border border-border bg-card p-3.5 text-left transition hover:-translate-y-px hover:border-[var(--type)] hover:shadow-[0_1px_2px_hsl(200_30%_10%/.06),0_8px_28px_hsl(200_30%_10%/.08)]">
            <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl text-white" style={{ background: definition.color }}><Icon size={21} aria-hidden="true" /></span>
            <span className="min-w-0"><b className="block text-[15px]">{definition.label}</b><span className="text-[13px] leading-snug text-muted-foreground">{definition.hint}</span>
              <em className="mt-1.5 block text-xs not-italic text-muted-foreground/85">e.g. {definition.example}</em></span>
          </button></li>
        })}
      </ul>
    </PlanDialog>
  }
  if (!draft) return null

  const definition = stepDefinition(draft.type)
  const Icon = definition.icon
  const problem = draftProblem(draft)
  const activityUuid = existing?.type === 'activity' ? (existing.config as ActivityConfig).activity_uuid : ''

  const save = async () => {
    if (problem || readOnly) return
    setBusy(true)
    try {
      const step: TemplateStep = { ...draftToStep({ ...draft, config: savedConfig(draft) }, existing || undefined), requirement_node_uuids: links }
      const saved = existing
        ? await editing.save((current) => mapStep(current, existing.key as string, () => step), 'Step saved.')
        : await editing.save((current) => addStep(current, target.stageKey, step), 'Step added.')
      if (!saved) return
      close()
      // A new activity gets its activity on save: open it to write its pages.
      if (!existing && step.type === 'activity') {
        const fresh = await templatesApi.get(orgId, template.template_uuid, token)
        const made = documentSteps(fresh.document).find((item) => item.step.key === step.key)?.step
        const uuid = made ? (made.config as ActivityConfig).activity_uuid : ''
        if (uuid) router.push(templateActivityHref(orgslug, template.template_uuid, uuid))
      }
    } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!existing || !window.confirm(`Remove "${existing.title}" from the draft?`)) return
    if (await editing.save((current) => removeStep(current, existing.key as string), 'Step removed.')) close()
  }

  const typePill = <span className="inline-flex items-center gap-2 self-start rounded-full bg-muted py-1.5 pl-1.5 pr-2.5 text-[13px] font-bold">
    <i className="grid h-6 w-6 place-items-center rounded-[7px] text-white" style={{ background: definition.color }}><Icon size={13} aria-hidden="true" /></i>
    {definition.label}{existing ? null : <span className="ml-1 font-semibold text-muted-foreground">Change</span>}
  </span>
  const footer = readOnly ? <button type="button" className={smallGhostClass + ' h-10 px-4 text-sm'} onClick={close}>Close</button> : <>
    {existing ? <button type="button" className={smallGhostClass + ' mr-auto h-10 px-4 text-sm text-red-600 hover:text-red-700'} onClick={() => void remove()} disabled={busy || editing.saving}>Delete step</button> : null}
    {activityUuid ? <a href={templateActivityHref(orgslug, template.template_uuid, activityUuid)} className={smallGhostClass + ' h-10 px-4 text-sm'}><Pencil />Edit activity</a> : null}
    <button type="button" className={smallGhostClass + ' h-10 px-4 text-sm'} onClick={close}>Cancel</button>
    <button type="button" className={smallPrimaryClass + ' h-10 px-4 text-sm'} onClick={() => void save()} disabled={busy || editing.saving || editing.stale || !!problem}>{busy ? <Loader2 className="animate-spin" /> : null}{existing ? 'Save' : 'Add step'}</button>
  </>
  const planLinked = new Set(documentSteps(document).filter(({ step }) => step.key !== existing?.key).flatMap(({ step }) => step.requirement_node_uuids || []))
  const fields = <StepEditor value={draft} onChange={setDraft} mode="template" others={stepChoices(document, existing?.key)} typeLocked orgId={orgId} token={token} />

  return <PlanDialog open onOpenChange={(open) => !open && close()} size="wide" footer={footer} bodyClassName="p-0"
    title={readOnly ? existing?.title || 'Step' : existing ? 'Edit step' : `New ${definition.label.toLowerCase()} step`} onBack={existing ? undefined : () => setType(null)}>
    <div className="grid min-h-full md:grid-cols-2" data-plan="" style={planVars(coverPalette(plan).key)}>
      <div className="flex min-w-0 flex-col gap-4 p-[22px] md:overflow-y-auto md:border-r md:border-border">
        {existing || readOnly ? typePill : <button type="button" onClick={() => setType(null)} className="self-start">{typePill}</button>}
        {readOnly ? <fieldset disabled className="min-w-0">{fields}</fieldset> : fields}
        {frameworks.length ? <StepRequirementLinks value={links} onChange={setLinks} frameworks={frameworks} readOnly={readOnly} planLinked={planLinked} /> : null}
      </div>
      <div className="flex min-w-0 flex-col items-center gap-3 bg-muted/60 p-[22px] md:overflow-y-auto">
        <div className="flex w-full justify-between text-xs font-bold uppercase tracking-[.06em] text-muted-foreground"><span>What learners see</span><span>Live preview</span></div>
        <StepPreview draft={draft} plan={plan} orgId={orgId} orgslug={orgslug} token={token} />
        {draft.staff_guide ? <div className="w-full max-w-[360px] rounded-[14px] border border-dashed border-border bg-card p-3 text-[13px]"><b className="mb-1 block">Staff see this too</b><span className="whitespace-pre-wrap text-muted-foreground">{draft.staff_guide}</span></div> : null}
      </div>
    </div>
  </PlanDialog>
}
