'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowLeft, Shield } from 'lucide-react'
import { CaretRight } from '@phosphor-icons/react'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { goalAdminApi, matrixKey } from '@services/goals/admin'
import { cn } from '@/lib/utils'
import { PageLoader, personName } from '../live/ui'
import AssignmentActions from './AssignmentActions'
import AssignmentLearners from './AssignmentLearners'
import AssignmentPlan from './AssignmentPlan'
import { assignmentLabel, datesLine, StatusChip, useStaff } from './shared'

export type AssignmentTab = 'plan' | 'learners'

/**
 * One assignment, a template handed to a group or a person. Plan: the template's steps counted
 * across its learners, with what's left for staff on each. Learners: where each one stands.
 */
export default function AssignmentDetail({ orgslug, assignmentUuid, tab = 'plan' }: { orgslug: string; assignmentUuid: string; tab?: AssignmentTab }) {
  const { orgId, token, viewerId, admin } = useStaff()
  const { data: matrix, error, isLoading, mutate } = useSWR(orgId && token ? matrixKey(assignmentUuid, orgId) : null, () => goalAdminApi.matrix(orgId, assignmentUuid, token), { revalidateOnFocus: false })
  const back = getUriWithOrg(orgslug, routePaths.org.admin.assignments())

  if (isLoading || (!matrix && !error)) return <PageLoader tall />
  if (error || !matrix) return <main className="flex min-h-[70vh] items-center justify-center px-4">
    <div className="rounded-xl border border-border bg-card p-10 text-center">
      <Shield className="mx-auto text-muted-foreground" size={38} aria-hidden="true" />
      <h1 className="mt-3 text-lg font-black">Assignment unavailable</h1>
      <p className="mt-1 text-sm text-muted-foreground">{error?.message || 'You need to staff this assignment to open it.'}</p>
      <Link href={back} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-blue-700"><ArrowLeft size={14} />Assignments</Link>
    </div>
  </main>

  const assignment = matrix.assignment
  const tabs: Array<{ id: AssignmentTab; label: string }> = [{ id: 'plan', label: 'Plan' }, { id: 'learners', label: `Learners · ${matrix.learners.length}` }]
  const facts = [
    assignmentLabel(assignment),
    `${matrix.learners.length} learner${matrix.learners.length === 1 ? '' : 's'}`,
    datesLine(assignment),
    matrix.version ? `v${matrix.version}` : '',
    assignment.staff.length ? `Staff: ${assignment.staff.map((person) => personName(person)).join(', ')}` : '',
  ].filter(Boolean)
  return <main className="min-h-full w-full bg-background">
    <header className="border-b border-border px-4 pt-6 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <nav aria-label="Breadcrumb" className="flex min-h-10 min-w-0 flex-wrap items-center gap-1.5 text-xs font-bold text-muted-foreground md:min-h-0">
          <Link href={back} className="hover:text-foreground">Plans</Link>
          <CaretRight size={12} aria-hidden="true" />
          {assignment.template_uuid
            ? <Link href={getUriWithOrg(orgslug, routePaths.org.admin.template(assignment.template_uuid))} className="min-w-0 truncate hover:text-foreground">{assignment.template_title}</Link>
            : <span className="min-w-0 truncate">{assignment.template_title}</span>}
          <CaretRight size={12} aria-hidden="true" />
          <span aria-current="page" className="min-w-0 truncate text-foreground">{assignmentLabel(assignment)}</span>
        </nav>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-black tracking-tight">{assignment.template_title}</h1><StatusChip status={assignment.status} /></div>
            <p className="mt-1 text-sm text-muted-foreground">{facts.join(' · ')}</p>
          </div>
          {admin ? <AssignmentActions assignment={assignment} orgId={orgId} token={token} onChanged={() => mutate()} /> : null}
        </div>
        <nav className="mt-5 flex gap-1 text-sm font-black" aria-label="Assignment">
          {tabs.map((item) => <Link key={item.id} href={getUriWithOrg(orgslug, routePaths.org.admin.planAssignment(assignmentUuid, item.id))} aria-current={tab === item.id ? 'page' : undefined}
            className={cn('border-b-4 px-3 py-2 transition', tab === item.id ? 'border-foreground' : 'border-transparent opacity-60 hover:opacity-90')}>{item.label}</Link>)}
        </nav>
      </div>
    </header>
    <div className="px-4 py-6 sm:px-6 lg:px-10"><div className="mx-auto max-w-5xl">
      {tab === 'plan' ? <div className="mx-auto max-w-3xl"><AssignmentPlan matrix={matrix} viewerUserId={viewerId}
        ctx={{ orgslug, orgId, token, assignmentUuid, admin, refresh: () => mutate() }} /></div>
        : <AssignmentLearners matrix={matrix} orgslug={orgslug} orgId={orgId} token={token} />}
    </div></div>
  </main>
}
