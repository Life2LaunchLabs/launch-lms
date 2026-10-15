'use client'

import React from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { SectionCard } from '@components/Goals/admin/shared'
import { stepDefinition } from '@components/Goals/steps'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { TemplateDetail } from '@services/goals/templates'
import type { TemplateStep } from '@services/goals/types'
import { documentSteps } from './documentOps'
import { leafNodes, useRequirementFrameworks } from './StepRequirementLinks'
import { assignmentLabel, assignmentPath, useTemplateAssignments } from './TemplateAssignments'
import { TemplateStatusChip } from './TemplateList'

/** What staff do with a step once a learner reaches it. */
const reviewKind = (step: TemplateStep) => step.completed_by === 'staff' ? 'sign-off' : step.review_required ? 'review' : null

/** A template at a glance: what learners get, who has it, which requirements it meets. */
export default function TemplateOverview({ orgslug, orgId, token, template }: { orgslug: string; orgId: number; token?: string; template: TemplateDetail }) {
  const frameworks = useRequirementFrameworks(orgId, token)
  const { data: allAssignments = [] } = useTemplateAssignments(orgId, template.template_uuid, token)
  const document = template.document
  const stages = document.stages
  const stepCount = documentSteps(document).length
  const weeks = stages.reduce((sum, stage) => sum + (Number(stage.duration_weeks) || 0), 0)
  const assignments = allAssignments.filter((item) => item.active)
  const learners = assignments.reduce((sum, item) => sum + Number(item.learner_count || 0), 0)
  const linked = new Set(documentSteps(document).flatMap(({ step }) => step.requirement_node_uuids || []))
  const coverage = frameworks.map((framework) => {
    const leaves = leafNodes(framework.nodes)
    return { ...framework, total: leaves.length, covered: leaves.filter((node) => linked.has(node.node_uuid)).length }
  }).filter((framework) => framework.covered > 0)
  const roles = document.roles
  const staffRole = roles?.definitions.find((role) => role.key === roles.staff_role_key)

  return <div className="flex flex-col gap-6 px-10 pb-10 pt-6 xl:flex-row xl:items-start">
    <section aria-label="What learners get" className="min-w-0 flex-1">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-base font-black text-gray-950">What learners get</h2><span className="text-xs text-gray-500">{stages.length} stage{stages.length === 1 ? '' : 's'} · {stepCount} step{stepCount === 1 ? '' : 's'}{weeks ? ` · about ${weeks} weeks` : ''}</span></div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        {stages.map((stage, index) => <div key={stage.key} className="rounded-xl border border-gray-100 bg-white p-4 nice-shadow">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Stage {index + 1}{stage.duration_weeks ? ` · ${stage.duration_weeks} wk` : stage.timing ? ` · ${stage.timing}` : ''}</p>
          <p className="mb-3 text-sm font-black text-gray-950">{stage.title}</p>
          <ul className="space-y-2">
            {stage.steps.map((step) => {
              const Icon = stepDefinition(step.type).icon
              const kind = reviewKind(step)
              return <li key={step.key} className="flex items-center gap-2 text-[13px]">
                <Icon size={13} className="shrink-0 text-gray-500" aria-label={stepDefinition(step.type).label} />
                <span className="min-w-0 flex-1 truncate text-gray-900">{step.title}</span>
                {kind ? <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{kind}</span> : null}
              </li>
            })}
            {!stage.steps.length ? <li className="text-xs text-gray-400">No steps yet</li> : null}
          </ul>
        </div>)}
      </div>
      <p className="mt-3 text-xs text-gray-500">Review and sign-off steps land in the Inbox of the staff named when the template is handed out.</p>
    </section>

    <div className="flex w-full shrink-0 flex-col gap-4 xl:w-80">
      <SectionCard title="Handed out" action={<span className="text-xs text-gray-500">{learners} learner{learners === 1 ? '' : 's'}</span>}>
        {assignments.length ? <ul className="-my-1 divide-y divide-gray-50">
          {assignments.slice(0, 6).map((assignment) => <li key={assignment.assignment_uuid}><Link href={getUriWithOrg(orgslug, assignmentPath(assignment))} className="flex items-center gap-3 py-2.5">
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-gray-900">{assignmentLabel(assignment)}</span><span className="block text-xs text-gray-500">{assignment.learner_count} learner{assignment.learner_count === 1 ? '' : 's'}{assignment.ready_for_review_count ? ` · ${assignment.ready_for_review_count} to review` : ''}</span></span>
            <span className="text-xs font-bold text-gray-700">{assignment.progress_percent}%</span>
            <ChevronRight size={14} className="text-gray-300" />
          </Link></li>)}
        </ul> : <p className="text-sm text-gray-500">Not handed out yet.</p>}
        {assignments.length > 6 ? <Link href={getUriWithOrg(orgslug, routePaths.org.dash.goalTemplatePage(template.template_uuid, 'assignments'))} className="mt-2 block text-xs font-bold text-gray-900">All {assignments.length}</Link> : null}
      </SectionCard>
      <SectionCard title="Requirements it meets">
        {coverage.length ? <div className="space-y-3">{coverage.map((framework) => <div key={framework.framework_uuid}>
          <div className="mb-1 flex justify-between gap-2 text-[13px]"><span className="truncate font-semibold text-gray-900">{framework.name}</span><span className="shrink-0 text-gray-500">{framework.covered} of {framework.total}</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-black" style={{ width: `${framework.total ? framework.covered / framework.total * 100 : 0}%` }} /></div>
        </div>)}</div> : <p className="text-sm text-gray-500">No steps are linked to a requirement yet.</p>}
        <Link href={getUriWithOrg(orgslug, routePaths.org.dash.planRequirements())} className="mt-3 block text-xs font-bold text-gray-900 hover:text-blue-700">See coverage</Link>
      </SectionCard>
      <SectionCard title="When it’s handed out">
        <dl className="space-y-2 text-[13px]">
          <div className="flex justify-between gap-3"><dt className="text-gray-500">Staff role</dt><dd className="font-semibold text-gray-900">{staffRole?.name || 'Reviewer'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-gray-500">Status</dt><dd><TemplateStatusChip template={template} /></dd></div>
          {document.template.instructions ? <div><dt className="text-gray-500">Instructions for staff</dt><dd className="mt-1 line-clamp-3 text-gray-800">{document.template.instructions}</dd></div> : null}
        </dl>
      </SectionCard>
    </div>
  </div>
}
