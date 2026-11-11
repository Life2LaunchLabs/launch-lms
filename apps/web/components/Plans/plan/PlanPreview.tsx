'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { RotateCcw } from 'lucide-react'
import { planVars } from '@components/Goals/planColors'
import GoalPath from '@components/Goals/learner/GoalPath'
import { GoalHeaderCard } from '@components/Goals/learner/GoalHeader'
import StepBody from '@components/Goals/steps/StepBody'
import type { StepActions } from '@components/Goals/steps/registry'
import { coverPalette } from '@components/Plans/shared/PlanCover'
import type { GoalTemplate, Step, TemplateDocument, TemplateStep } from '@services/goals/types'
import { cn } from '@/lib/utils'
import PlanDialog from './PlanDialog'
import { applyWork, finishedStatus, keyOfStep, previewGoal, type PreviewWork, type WorkChange } from './previewSandbox'

type Props = {
  open: boolean
  // eslint-disable-next-line no-unused-vars
  setOpen: (open: boolean) => void
  template: GoalTemplate
  /** What the page shows: the draft for editors, else the live version. */
  document: TemplateDocument
  /** The live version, when the page shows a draft that differs from it. */
  liveDocument?: TemplateDocument | null
  orgId: number
  orgslug: string
  orgName?: string
  token?: string
}

/**
 * Preview: the plan as someone you assign it to gets it, on their own path and step cards.
 * Steps can be worked through (finished, filled in, unlocked in order, stages opened) but
 * all of it stays in this dialog: nothing is saved and nobody is assigned anything.
 */
export default function PlanPreview({ open, setOpen, template, document, liveDocument, orgId, orgslug, orgName, token }: Props) {
  const [version, setVersion] = React.useState<'draft' | 'live'>('draft')
  const [work, setWork] = React.useState<PreviewWork>({})
  const [stageIndex, setStageIndex] = React.useState(0)
  const [selected, setSelected] = React.useState('')
  const reset = React.useCallback(() => { setWork({}); setStageIndex(0); setSelected('') }, [])
  // Each time it opens, it starts from the beginning.
  React.useEffect(() => { if (open) { reset(); setVersion('draft') } }, [open, reset])

  const shown = version === 'live' && liveDocument ? liveDocument : document
  const color = coverPalette(template).key
  const goal = React.useMemo(() => previewGoal({ document: shown, orgId, icon: template.icon, work, stageIndex }), [shown, orgId, template.icon, work, stageIndex])
  const stages = React.useMemo(() => shown.stages || [], [shown])
  const templateSteps = React.useMemo(() => new Map<string, TemplateStep>(stages.flatMap((stage, si) => stage.steps.map((step, ti) => [`preview-step-${step.key || `preview-${si}-${ti}`}`, step] as const))), [stages])

  const actionsFor = (step: Step): StepActions => {
    const key = keyOfStep(step.step_uuid)
    const change = async (next: WorkChange) => { setWork((current) => applyWork(current, key, next)); return true }
    return {
      busy: false,
      setStatus: (status) => change({ kind: 'status', status: finishedStatus(templateSteps.get(step.step_uuid) || {}, status) }),
      saveSubmission: (data) => change({ kind: 'submission', ...data }),
      saveNote: (note) => change({ kind: 'note', note }),
      addEntry: (entry) => change({ kind: 'add-entry', entry }),
      updateEntry: (entryUuid, data) => change({ kind: 'update-entry', entryUuid, data }),
      deleteEntry: (entryUuid) => change({ kind: 'delete-entry', entryUuid }),
      visitResource: async () => true,
      openActivity: () => { toast('Activities play once the plan is assigned.') },
    }
  }

  const footer = <>
    <p className="mr-auto text-[13px] text-muted-foreground">Nothing you do here is saved.</p>
    {stages.length > 1 ? <label className="flex items-center gap-2 text-[13px] font-semibold">
      <span>On stage</span>
      <select value={Math.min(stageIndex, stages.length - 1)} onChange={(event) => setStageIndex(Number(event.target.value))}
        className="h-9 max-w-[220px] rounded-[10px] border border-border bg-card px-2.5 text-[13px] font-semibold">
        {stages.map((stage, index) => <option key={stage.key || index} value={index}>{index + 1}. {stage.title || `Stage ${index + 1}`}</option>)}
      </select>
    </label> : null}
    <button type="button" onClick={reset} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold hover:bg-muted">
      <RotateCcw size={14} aria-hidden="true" />Start over
    </button>
  </>

  return <PlanDialog open={open} onOpenChange={setOpen} title="Preview" description="The plan as someone you assign it to sees it. Nothing here is saved." size="wide" footer={footer} bodyClassName="p-0">
    <div className="dark theme-island min-h-full bg-background text-foreground" data-testid="plan-preview">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pb-10 pt-5 sm:px-6">
        {liveDocument ? <div role="group" aria-label="Version" className="flex self-start rounded-full bg-muted p-1 text-[13px] font-bold">
          {(['draft', 'live'] as const).map((value) => <button key={value} type="button" aria-pressed={version === value} onClick={() => { setVersion(value); reset() }}
            className={cn('h-8 rounded-full px-3.5', version === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {value === 'draft' ? 'Your draft' : 'Live version'}</button>)}
        </div> : null}
        <div data-plan="" style={planVars(color)}>
          <GoalHeaderCard goal={{ goal_uuid: `preview-${template.template_uuid}`, title: goal.title, description: goal.description, icon: goal.icon, organization: { name: orgName } }}
            done={goal.progress.done} total={goal.progress.total} />
        </div>
        <GoalPath goal={goal} color={color} perspective="learner" viewer={{ orgslug, token }} selectedUuid={selected} onSelect={setSelected}
          stepBody={(step) => step.locked ? undefined : <StepBody goal={goal} step={step} actions={actionsFor(step)} canWork staff={false} orgslug={orgslug} token={token} />} />
      </div>
    </div>
  </PlanDialog>
}
