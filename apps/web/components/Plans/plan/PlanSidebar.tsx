'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Plus, Users } from 'lucide-react'
import { PersonAvatar, SectionCard, personName } from '@components/Goals/admin/live/ui'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { templateKeys, templatesApi, type TemplateDetail } from '@services/goals/templates'
import type { TemplateDocument } from '@services/goals/types'
import { documentSteps } from '@components/Plans/editor/documentOps'
import { leafNodes, useRequirementFrameworks } from '@components/Plans/editor/StepRequirementLinks'
import TemplateBadgeSection from '@components/Plans/editor/TemplateBadgeSection'
import GoalAssignmentModal from '@components/Plans/editor/GoalAssignmentModal'
import { insightsRoutes } from '@components/Goals/admin/insights/reportRoutes'
import { plural } from './planVersions'

type Props = { orgslug: string; orgId: number; token?: string; template: TemplateDetail; document: TemplateDocument; canAssign: boolean }

/** Badge, Requirements and Assignments, each only when it has something to say. */
export default function PlanSidebar({ orgslug, orgId, token, template, document, canAssign }: Props) {
  return <aside className="flex min-w-0 flex-col gap-4">
    <TemplateBadgeSection orgslug={orgslug} orgId={orgId} token={token} templateUuid={template.template_uuid} />
    <RequirementsCard orgslug={orgslug} orgId={orgId} token={token} document={document} />
    <AssignmentsCard orgslug={orgslug} orgId={orgId} token={token} template={template} canAssign={canAssign} />
  </aside>
}

function RequirementsCard({ orgslug, orgId, token, document }: { orgslug: string; orgId: number; token?: string; document: TemplateDocument }) {
  const frameworks = useRequirementFrameworks(orgId, token)
  const linked = new Set(documentSteps(document).flatMap(({ step }) => step.requirement_node_uuids || []))
  const coverage = frameworks.map((framework) => {
    const leaves = leafNodes(framework.nodes)
    return { ...framework, total: leaves.length, covered: leaves.filter((node) => linked.has(node.node_uuid)).length }
  }).filter((framework) => framework.covered > 0)
  if (!coverage.length) return null
  return <SectionCard title="Requirements" action={<Link href={getUriWithOrg(orgslug, insightsRoutes.coverage())} className="text-xs font-bold text-gray-900 hover:text-blue-700">Coverage</Link>}>
    <div className="space-y-3">{coverage.map((framework) => <div key={framework.framework_uuid}>
      <div className="mb-1 flex justify-between gap-2 text-[13px]"><span className="truncate font-semibold text-gray-900">{framework.name}</span><span className="shrink-0 text-gray-500">{framework.covered} of {framework.total}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-black" style={{ width: `${framework.total ? framework.covered / framework.total * 100 : 0}%` }} /></div>
    </div>)}</div>
  </SectionCard>
}

/** The groups and learners this plan is assigned to, newest first, with Assign. */
function AssignmentsCard({ orgslug, orgId, token, template, canAssign }: { orgslug: string; orgId: number; token?: string; template: TemplateDetail; canAssign: boolean }) {
  const { data: rows, mutate } = useSWR(orgId && token ? templateKeys.assignments(orgId, template.template_uuid) : null, () => templatesApi.assignments(orgId, template.template_uuid, token))
  const active = (rows || []).filter((row) => row.status !== 'ended')
  const learners = active.reduce((total, row) => total + (row.learner_count || 0), 0)
  const assignable = canAssign && template.status !== 'archived' && !!template.live_version
  return <SectionCard title="Assignments" action={learners ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-800">{plural(learners, 'learner')}</span> : null}>
    {active.length ? <ul className="-mt-1 divide-y divide-gray-100">{active.map((row) => {
      const group = row.cohort
      const label = group ? group.name : row.user ? personName(row.user) : row.subject_email || 'Learner'
      return <li key={row.assignment_uuid}><Link href={getUriWithOrg(orgslug, routePaths.org.admin.planAssignment(row.assignment_uuid))} className="flex items-center gap-3 py-2.5 hover:opacity-80">
        {group ? <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100"><Users size={15} aria-hidden="true" /></span> : <PersonAvatar person={row.user} size={32} />}
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{label}</span><span className="block truncate text-xs text-gray-500">{group ? plural(row.learner_count, 'learner') : row.status === 'paused' ? 'Paused' : 'Individual'}</span></span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-gray-500"><span className="h-1.5 w-12 overflow-hidden rounded-full bg-gray-100"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${row.progress_percent || 0}%` }} /></span>{Math.round(row.progress_percent || 0)}%</span>
      </Link></li>
    })}</ul> : <p className="text-sm text-gray-500">{template.live_version ? 'Not assigned to anyone yet.' : 'Publish a live version to assign it.'}</p>}
    {assignable ? <GoalAssignmentModal initialTemplateUuid={template.template_uuid} onAssigned={async () => { await mutate() }}
      trigger={<button type="button" className="mt-3 inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-sm font-bold hover:bg-muted"><Plus size={15} />Assign</button>} /> : null}
  </SectionCard>
}
