'use client'

import React from 'react'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { Check, ChevronDown, GripVertical, Loader2 } from 'lucide-react'
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
    <div className="min-w-0 flex-1 space-y-2"><PlanObjectiveDefinitionCard objective={{ ...objective, fields: objective.fields || objective.custom_fields || [], completion_restricted: !objective.allow_learner_confirmation }} mode="template" badges={badgeData} saving={saving} onSave={save} /><RequirementMappings objective={objective} orgId={orgId} token={token} programUuid={program.program_uuid} refresh={refresh} /></div>
  </div>
}

function RequirementMappings({ objective, orgId, token, programUuid, refresh }: any) {
  const [open, setOpen] = React.useState(false), [saving, setSaving] = React.useState(false)
  const { data: frameworks = [] } = useSWR(open && token ? `${getAPIUrl()}planning/requirements?org_id=${orgId}` : null, (url) => fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json()))
  const [selected, setSelected] = React.useState<string[]>((objective.requirement_mappings || []).map((item: any) => item.node_uuid))
  React.useEffect(() => setSelected((objective.requirement_mappings || []).map((item: any) => item.node_uuid)), [objective.requirement_mappings])
  const toggle = (uuid: string) => setSelected((current) => current.includes(uuid) ? current.filter((item) => item !== uuid) : [...current, uuid])
  const save = async () => { setSaving(true); try { await programsApi.updateObjectiveRequirements(orgId, programUuid, objective.objective_uuid, selected, token); await refresh(); setOpen(false); toast.success('Requirement mappings saved.') } catch (error: any) { toast.error(error?.message || 'Could not save requirement mappings.') } finally { setSaving(false) } }
  const current = objective.requirement_mappings || []
  return <div className="rounded-lg border border-border bg-card"><button onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"><span><span className="block text-[10px] font-black uppercase tracking-wide text-muted-foreground">Satisfies</span><span className="mt-0.5 block text-xs font-semibold">{current.length ? current.map((item: any) => `${item.node_code ? `${item.node_code} · ` : ''}${item.node_title}`).join(', ') : 'No requirement mappings'}</span></span><ChevronDown size={15} className={open ? 'rotate-180' : ''} /></button>{open ? <div className="border-t border-border p-4"><p className="mb-3 text-xs text-muted-foreground">A staff-verified completion satisfies every selected requirement.</p><div className="max-h-64 space-y-3 overflow-y-auto">{frameworks.map((framework: any) => <div key={framework.framework_uuid}><p className="mb-1 text-[10px] font-black uppercase tracking-wide text-blue-700">{framework.name}</p>{leafNodes(framework.nodes || []).map((node: any) => <label key={node.node_uuid} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"><input type="checkbox" checked={selected.includes(node.node_uuid)} onChange={() => toggle(node.node_uuid)} className="sr-only" /><span className={`flex h-4 w-4 items-center justify-center rounded border ${selected.includes(node.node_uuid) ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300'}`}>{selected.includes(node.node_uuid) ? <Check size={11} /> : null}</span><span>{node.code ? `${node.code} · ` : ''}{node.title}</span></label>)}</div>)}{!frameworks.length ? <p className="text-xs text-muted-foreground">Create a requirement framework first.</p> : null}</div><div className="mt-4 flex justify-end"><button onClick={() => void save()} disabled={saving} className="flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-xs font-bold text-white disabled:opacity-40">{saving ? <Loader2 className="animate-spin" size={13} /> : null}Save mappings</button></div></div> : null}</div>
}

function leafNodes(nodes: any[]) { const parents = new Set(nodes.map((node) => node.parent_node_uuid).filter(Boolean)); return nodes.filter((node) => !parents.has(node.node_uuid)) }
