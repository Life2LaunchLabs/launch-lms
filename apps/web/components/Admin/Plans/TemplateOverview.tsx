'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ChevronRight } from 'lucide-react'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { SectionCard, StatusPill, StepTypeIcon } from './shared'

function learnerFills(objective: any) {
  return (objective.custom_fields || objective.fields || []).some((field: any) => !field.restricted && field.type !== 'badge')
}

/** What a reviewer does with a step once a learner reaches it. */
function reviewKind(objective: any): 'review' | 'sign-off' | null {
  if (objective.allow_learner_confirmation) return null
  return learnerFills(objective) ? 'review' : 'sign-off'
}

export default function TemplateOverview({ orgslug, orgId, token, program }: { orgslug: string; orgId: number; token?: string; program: any }) {
  const { data: frameworks = [] } = useSWR(orgId && token ? `${getAPIUrl()}planning/requirements?org_id=${orgId}` : null, (url) => swrFetcher(url, token))
  const phases: any[] = program.phases || []
  const stepCount = phases.reduce((sum, phase) => sum + (phase.objectives?.length || 0), 0)
  const weeks = phases.reduce((sum, phase) => sum + (Number(phase.suggested_duration_weeks) || 0), 0)
  const assignments: any[] = (program.assignments || []).filter((item: any) => item.active)
  const learners = assignments.reduce((sum, item) => sum + Number(item.learner_count || 0), 0)
  const mapped = new Set((program.objectives || []).flatMap((objective: any) => (objective.requirement_mappings || []).map((item: any) => item.node_uuid)))
  const coverage = (frameworks as any[]).map((framework) => {
    const parents = new Set((framework.nodes || []).map((node: any) => node.parent_node_uuid).filter(Boolean))
    const leaves = (framework.nodes || []).filter((node: any) => !parents.has(node.node_uuid))
    return { ...framework, total: leaves.length, covered: leaves.filter((node: any) => mapped.has(node.node_uuid)).length }
  }).filter((framework) => framework.covered > 0)
  const staffRole = (program.role_definitions || []).find((role: any) => role.key === program.default_staff_role_key)

  return <div className="flex flex-col gap-6 px-10 pb-10 pt-6 xl:flex-row xl:items-start">
    <section aria-label="What learners get" className="min-w-0 flex-1">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-base font-black text-gray-950">What learners get</h2><span className="text-xs text-gray-500">{phases.length} chapter{phases.length === 1 ? '' : 's'} · {stepCount} step{stepCount === 1 ? '' : 's'}{weeks ? ` · about ${weeks} weeks` : ''}</span></div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        {phases.map((phase, index) => <div key={phase.phase_uuid} className="rounded-xl border border-gray-100 bg-white p-4 nice-shadow">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Chapter {index + 1}{phase.suggested_duration_weeks ? ` · ${phase.suggested_duration_weeks} wk` : ''}</p>
          <p className="mb-3 text-sm font-black text-gray-950">{phase.name}</p>
          <ul className="space-y-2">
            {(phase.objectives || []).map((objective: any) => {
              const kind = reviewKind(objective)
              const types = (objective.custom_fields || []).filter((field: any) => !field.restricted).map((field: any) => field.type)
              return <li key={objective.objective_uuid} className="flex items-center gap-2 text-[13px]">
                <StepTypeIcon types={types} size={13} />
                <span className="min-w-0 flex-1 truncate text-gray-900">{objective.title}</span>
                {kind ? <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{kind}</span> : null}
              </li>
            })}
            {!phase.objectives?.length ? <li className="text-xs text-gray-400">No steps yet</li> : null}
          </ul>
        </div>)}
      </div>
      <p className="mt-3 text-xs text-gray-500">Review and sign-off steps land in the Inbox of the staff named when the template is handed out.</p>
    </section>

    <div className="flex w-full shrink-0 flex-col gap-4 xl:w-80">
      <SectionCard title="Handed out" action={<span className="text-xs text-gray-500">{learners} learner{learners === 1 ? '' : 's'}</span>}>
        {assignments.length ? <ul className="-my-1 divide-y divide-gray-50">
          {assignments.slice(0, 6).map((assignment) => {
            const target = assignment.cohort ? routePaths.org.dash.users.groupPlans(assignment.cohort.id, assignment.assignment_uuid) : assignment.user?.username ? routePaths.org.dash.users.userPage(assignment.user.username, 'plans') : routePaths.org.dash.planAssignment(assignment.assignment_uuid)
            const label = assignment.cohort?.name || [assignment.user?.first_name, assignment.user?.last_name].filter(Boolean).join(' ') || assignment.user?.username || assignment.subject_email || 'Learner'
            return <li key={assignment.assignment_uuid}><Link href={getUriWithOrg(orgslug, target)} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-gray-900">{label}</span><span className="block text-xs text-gray-500">{assignment.learner_count} learner{assignment.learner_count === 1 ? '' : 's'}{assignment.ready_for_review_count ? ` · ${assignment.ready_for_review_count} to review` : ''}</span></span>
              <span className="text-xs font-bold text-gray-700">{assignment.progress_percent}%</span>
              <ChevronRight size={14} className="text-gray-300" />
            </Link></li>
          })}
        </ul> : <p className="text-sm text-gray-500">Not handed out yet.</p>}
        {assignments.length > 6 ? <Link href={getUriWithOrg(orgslug, routePaths.org.dash.programPage(program.program_uuid, 'assignments'))} className="mt-2 block text-xs font-bold text-gray-900">All {assignments.length}</Link> : null}
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
          <div className="flex justify-between gap-3"><dt className="text-gray-500">Status</dt><dd><StatusPill tone={program.status === 'active' || program.status === 'published' ? 'green' : 'amber'}>{program.status || 'draft'}</StatusPill></dd></div>
          {program.instructions ? <div><dt className="text-gray-500">Instructions for staff</dt><dd className="mt-1 line-clamp-3 text-gray-800">{program.instructions}</dd></div> : null}
        </dl>
      </SectionCard>
    </div>
  </div>
}
