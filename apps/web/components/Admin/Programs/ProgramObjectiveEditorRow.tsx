'use client'

import React from 'react'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { GripVertical } from 'lucide-react'
import { getLearningBadges } from '@services/learning/learning'
import { getAPIUrl } from '@services/config/config'
import { programsApi } from '@services/programs/programs'
import { PlanObjectiveDefinitionCard } from '@components/Plans/PlanEditorShared'
import { cn } from '@/lib/utils'

export default function ProgramObjectiveEditorRow({ objective, orgId, token, program, dragHandleProps, dragging }: any) {
  const [saving, setSaving] = React.useState(false)
  const { data: badgeData = [] } = useSWR(token ? ['template-step-badges', token] : null, async ([, accessToken]) => {
    const response = await getLearningBadges(undefined, accessToken)
    return Array.isArray(response) ? response : response?.data || []
  })
  const refresh = () => mutate(`${getAPIUrl()}planning/templates/${program.program_uuid}?org_id=${orgId}`)
  const save = async (draft: any) => {
    setSaving(true)
    try {
      await programsApi.updateObjective(orgId, program.program_uuid, objective.objective_uuid, {
        title: draft.title.trim(), description: draft.description || '', custom_fields: draft.fields,
        allow_learner_confirmation: !draft.completion_restricted,
        default_start_rule: 'phase_start', default_due_rule: 'phase_end',
        default_allow_late: Boolean(draft.default_allow_late),
      }, token)
      await refresh(); toast.success('Objective updated.')
    } catch (error: any) { toast.error(error?.message || 'Could not update the objective.') } finally { setSaving(false) }
  }
  return <div className={cn('group flex items-stretch gap-1', dragging && 'rounded-xl shadow-xl ring-2 ring-blue-300')}>
    <button {...dragHandleProps} className="w-7 cursor-grab rounded-lg text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100 focus:opacity-100" aria-label={`Move ${objective.title}`}><GripVertical size={16} className="mx-auto" /></button>
    <div className="min-w-0 flex-1"><PlanObjectiveDefinitionCard objective={{ ...objective, fields: objective.fields || objective.custom_fields || [], completion_restricted: !objective.allow_learner_confirmation }} mode="template" badges={badgeData} saving={saving} onSave={save} /></div>
  </div>
}
