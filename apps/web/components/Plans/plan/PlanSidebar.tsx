'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ListChecks, Plus, Users } from 'lucide-react'
import { PersonAvatar, personName } from '@components/Goals/admin/live/ui'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { templateKeys, templatesApi, type TemplateDetail } from '@services/goals/templates'
import type { TemplateDocument } from '@services/goals/types'
import { cn } from '@/lib/utils'
import { documentSteps } from '@components/Plans/editor/documentOps'
import { leafNodes, useRequirementFrameworks } from '@components/Plans/editor/StepRequirementLinks'
import AssignFlow from '@components/Assignments/assign/AssignFlow'
import { smallActionClass, smallPrimaryClass } from '@components/Plans/shared/actions'
import { insightsRoutes } from '@components/Goals/admin/insights/reportRoutes'
import type { TemplateEditing } from '@components/Plans/editor/useTemplate'
import { AsideCard, Tag } from './AsideCard'
import PlanBadgeCard from './PlanBadgeCard'
import { plural } from './planVersions'

type Props = { orgslug: string; orgId: number; token?: string; editing: TemplateEditing; document: TemplateDocument; canAssign: boolean; canEdit: boolean }

/** What the plan does for learners: the badge it earns, the requirements it counts toward, and who has it. */
export default function PlanSidebar({ orgslug, orgId, token, editing, document, canAssign, canEdit }: Props) {
  const template = editing.template!
  return <aside className="flex min-w-0 flex-col gap-3.5 lg:sticky lg:top-5">
    <PlanBadgeCard orgslug={orgslug} orgId={orgId} token={token} editing={editing} document={document} canEdit={canEdit} />
    <RequirementsCard orgslug={orgslug} orgId={orgId} token={token} document={document} canEdit={canEdit} />
    <AssignmentsCard orgslug={orgslug} orgId={orgId} token={token} template={template} canAssign={canAssign} />
  </aside>
}

/** The frameworks the plan's steps count toward, with how much of each it covers. */
function RequirementsCard({ orgslug, orgId, token, document, canEdit }: { orgslug: string; orgId: number; token?: string; document: TemplateDocument; canEdit: boolean }) {
  const frameworks = useRequirementFrameworks(orgId, token)
  const linked = new Set(documentSteps(document).flatMap(({ step }) => step.requirement_node_uuids || []))
  const coverage = frameworks.map((framework) => {
    const leaves = leafNodes(framework.nodes)
    return { ...framework, total: leaves.length, covered: leaves.filter((node) => linked.has(node.node_uuid)).length }
  }).filter((framework) => framework.covered > 0)
  if (!coverage.length) {
    if (!canEdit || !frameworks.length) return null
    return <AsideCard icon={<ListChecks size={16} />} title="Requirements" tag={<Tag>None</Tag>}>
      <p className="mt-2 text-[13.5px] leading-[1.45] text-muted-foreground">Link steps to graduation or state requirements to track progress toward them. Open a step while editing to link it.</p>
    </AsideCard>
  }
  return <AsideCard icon={<ListChecks size={16} />} title="Requirements">
    <p className="mt-2 text-[13.5px] text-muted-foreground">Steps in this plan count toward:</p>
    <ul className="mt-2.5 flex flex-col gap-2">{coverage.map((framework) => <li key={framework.framework_uuid} className="rounded-xl border border-border px-3 py-2.5">
      <div className="flex justify-between gap-2 text-[13px]"><b className="truncate">{framework.name}</b><span className="shrink-0 text-xs text-muted-foreground">{framework.covered} of {plural(framework.total, 'requirement')}</span></div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${framework.total ? framework.covered / framework.total * 100 : 0}%` }} /></div>
    </li>)}</ul>
    <Link href={getUriWithOrg(orgslug, insightsRoutes.coverage())} className={smallActionClass + ' mt-3'}>Coverage report</Link>
  </AsideCard>
}

/** The groups and learners this plan is assigned to, newest first, with Assign. */
function AssignmentsCard({ orgslug, orgId, token, template, canAssign }: { orgslug: string; orgId: number; token?: string; template: TemplateDetail; canAssign: boolean }) {
  const { data: rows, mutate } = useSWR(orgId && token ? templateKeys.assignments(orgId, template.template_uuid) : null, () => templatesApi.assignments(orgId, template.template_uuid, token))
  const active = (rows || []).filter((row) => row.status !== 'ended')
  const learners = active.reduce((total, row) => total + (row.learner_count || 0), 0)
  const live = !!template.live_version && template.status !== 'archived'
  return <AsideCard icon={<Users size={16} />} title="Assignments" tag={learners ? <Tag tone="live">{plural(learners, 'learner')}</Tag> : null}>
    {active.length ? <ul className="mt-2.5 divide-y divide-border">{active.map((row) => {
      const group = row.cohort
      const label = group ? group.name : row.user ? personName(row.user) : row.subject_email || 'Learner'
      const progress = Math.round(row.progress_percent || 0)
      return <li key={row.assignment_uuid}><Link href={getUriWithOrg(orgslug, routePaths.org.admin.planAssignment(row.assignment_uuid))} className="flex items-center gap-3 py-2.5 hover:opacity-80">
        {group ? <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted"><Users size={15} aria-hidden="true" /></span> : <PersonAvatar person={row.user} size={32} />}
        <span className="min-w-0 flex-1"><b className="block truncate text-sm">{label}</b><span className="block truncate text-xs text-muted-foreground">{group ? plural(row.learner_count, 'learner') : row.status === 'paused' ? 'Paused' : 'One learner'}</span></span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground"><span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted sm:w-[72px]"><span className="block h-full rounded-full bg-emerald-600" style={{ width: `${progress}%` }} /></span>{progress}%</span>
      </Link></li>
    })}</ul> : <p className="mt-2 text-[13.5px] leading-[1.45] text-muted-foreground">{live ? 'No one has this plan yet. Assign it to a group or to learners one by one.' : 'Publish a live version to start assigning it.'}</p>}
    {canAssign ? live ? <AssignFlow initialTemplateUuid={template.template_uuid} onAssigned={async () => { await mutate() }}
      trigger={<button type="button" className={cn(active.length ? smallActionClass : smallPrimaryClass, 'mt-3')}><Plus />Assign</button>} />
      : <button type="button" disabled title="No live version" className={smallActionClass + ' mt-3'}><Plus />Assign</button> : null}
  </AsideCard>
}
