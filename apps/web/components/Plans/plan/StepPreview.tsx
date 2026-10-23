'use client'

import React from 'react'
import type { StepDraft } from '@components/Goals/edit/StepEditor'
import { planVars } from '@components/Goals/planColors'
import { stepDefinition, type StepActions, type StepCardProps } from '@components/Goals/steps'
import { PlanCover, coverPalette, type CoverSource } from '@components/Plans/shared/PlanCover'
import type { Goal, Step } from '@services/goals/types'

const nothing = async () => false
const ACTIONS: StepActions = { busy: false, setStatus: nothing, saveSubmission: nothing, saveNote: nothing, addEntry: nothing, updateEntry: nothing, deleteEntry: nothing, openActivity: () => {} }

/** The step being written as a learner's step, so the learner's own card can show it. */
function previewStep(draft: StepDraft): Step {
  return {
    step_uuid: 'preview', stage_uuid: null, position: 0, type: draft.type, title: draft.title, description: draft.description,
    config: draft.config, materials: (draft.materials || []) as unknown as Step['materials'], completed_by: draft.completed_by, review_required: draft.review_required,
    start_date: null, due_date: null, held: false, after_step_uuids: [], requirement_links: [], status: 'not_started', locked: false, locked_reason: null,
    state: 'open', fraction: 0, result: null, submission: {}, answer: '', learner_note: '', reviewer_note: '', feedback_history: [], completed_at: null,
    completion_method: null, entries: [], reference: null,
  }
}

function previewGoal(plan: CoverSource, orgId: number, step: Step): Goal {
  return {
    goal_uuid: 'preview', title: plan.title || 'Your plan', description: '', ownership: 'external', source: 'assignment',
    status: 'active', org_id: orgId, start_date: null, target_date: null, finished_at: null, finish: {}, owner: null, subject: null,
    capabilities: ['view_plan', 'update_progress', 'contribute_fields'], progress: { done: 0, total: 1 }, stages: [], unstaged_steps: [step],
  }
}

/**
 * What learners see: the learner app's own card for the step, filled from the editor as it changes,
 * on a phone. Buttons in it can be pressed but nothing is saved.
 */
export default function StepPreview({ draft, plan, orgId, orgslug, token }: { draft: StepDraft; plan: CoverSource; orgId: number; orgslug: string; token?: string }) {
  const definition = stepDefinition(draft.type)
  const Icon = definition.icon
  const CardBody = definition.CardBody as React.ComponentType<StepCardProps>
  const step = previewStep(draft)
  const goal = previewGoal(plan, orgId, step)
  return <div className="dark w-full max-w-[360px]" data-plan="" style={planVars(coverPalette(plan).key)}>
    <div className="rounded-[30px] border-[6px] border-[hsl(200_20%_18%)] bg-background p-3.5 text-foreground shadow-[0_30px_60px_hsl(200_40%_5%/.3)]">
      <div className="flex items-center gap-2 px-1 pb-3 pt-1 text-xs font-semibold text-muted-foreground">
        <PlanCover plan={plan} iconSize={12} className="h-[22px] w-[22px] rounded-[7px]" /><span className="truncate">{plan.title || 'Your plan'}</span>
      </div>
      <div className="flex flex-col gap-3 rounded-[20px] border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white shadow-[inset_0_-3px_0_hsl(0_0%_0%/.2)]" style={{ background: definition.color }}><Icon size={20} aria-hidden="true" /></span>
          <div className="min-w-0">
            <h4 className="text-[17px] font-bold leading-tight">{draft.title || <span className="font-medium italic text-muted-foreground">Step title</span>}</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">{definition.label}{draft.review_required ? ' · Your mentor reviews this' : ''}</p>
          </div>
        </div>
        {/* Clicks inside the card work like the learner's, but links don't leave the editor. */}
        <div className="flex flex-col gap-3 [&_a]:pointer-events-none" onSubmitCapture={(event) => event.preventDefault()}>
          <CardBody goal={goal} step={step} actions={ACTIONS} canWork staff={false} orgslug={orgslug} token={token} />
        </div>
      </div>
    </div>
  </div>
}
