'use client'
import React from 'react'
import Link from 'next/link'
import { ArrowRight, MessageSquareText, Play } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@components/ui/dialog'
import StatusBar, { StatusLegend } from '@components/Assignments/StatusBar'
import { PlanTile, TargetTile } from '@components/Assignments/Pair'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { rowDates, rowSubtitle } from '@services/assignments/list'
import { needTotal, needsText, plural } from '@services/assignments/status'
import type { HomeAssignmentRow } from '@services/goals/adminHome'
import { ROLE_LABEL } from './Sections'

const admin = routePaths.org.admin

/** How the viewer works with an assignment, by their role on it. */
const HOW: Record<NonNullable<HomeAssignmentRow['my_role']>, string> = {
  lead: 'You run it: its dates, reminders and reviews. Learners see you as their lead.',
  review: 'You review what learners hand in and answer their questions. Both land in Needs you on Home.',
  comment: 'You can see the plan and where everyone is, and comment in its threads.',
}

/**
 * The assignment brief: who it's for, where they are, what needs the viewer and how they work with it,
 * with the places to go next. It opens from a row in Your assignments and from First steps.
 */
export default function AssignmentBrief({ row, orgslug, onClose }: { row: HomeAssignmentRow | null; orgslug: string; onClose: () => void }) {
  return (
    <Dialog open={!!row} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-2xl p-0">
        {row ? <Brief row={row} orgslug={orgslug} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function Brief({ row, orgslug }: { row: HomeAssignmentRow; orgslug: string }) {
  const [start, end] = rowDates(row)
  const target = row.target
  const thread = target.type === 'group' ? admin.threads.group(target.id, row.assignment_uuid) : target.type === 'person' && target.person ? admin.threads.person(target.person.id) : null
  const needs = needTotal(row.needs)
  return <>
    <div className="flex items-start gap-3 px-6 pb-4 pt-6">
      <TargetTile target={target} size="lg" />
      <div className="min-w-0 pr-8">
        <DialogTitle className="text-lg font-bold leading-snug text-gray-900">{target.name || 'Invitation'}</DialogTitle>
        <DialogDescription className="mt-0.5 flex items-center gap-1.5 text-sm text-gray-500"><PlanTile plan={row.plan} size="sm" />{row.plan.title}{row.plan.version ? ` · v${row.plan.version}` : ''}</DialogDescription>
      </div>
    </div>
    <div className="space-y-5 px-6 pb-6">
      <section>
        <h3 className="mb-1.5 text-xs font-bold uppercase tracking-[0.06em] text-gray-500">Where they are</h3>
        <p className="mb-2 text-sm text-gray-700">{rowSubtitle(row) || plural(row.learner_count, 'learner')}{row.step_count ? ` · ${plural(row.step_count, 'step')}` : ''}</p>
        <StatusBar counts={row.counts} size="lg" unit={row.learner_count > 1 ? 'steps across the group' : 'steps'} label={`${target.name} on ${row.plan.title}`} />
        <span className="mt-1 flex justify-between text-xs text-gray-500"><span>{start}</span><span>{end}</span></span>
        <StatusLegend className="mt-2" />
      </section>
      <section>
        <h3 className="mb-1.5 text-xs font-bold uppercase tracking-[0.06em] text-gray-500">What needs you</h3>
        <p className="text-sm text-gray-700">{needs && row.my_role !== 'comment' ? needsText(row.needs) : 'Nothing right now.'}</p>
      </section>
      {row.my_role ? <section>
        <h3 className="mb-1.5 text-xs font-bold uppercase tracking-[0.06em] text-gray-500">You: {ROLE_LABEL[row.my_role]}</h3>
        <p className="text-sm text-gray-700">{HOW[row.my_role]}</p>
      </section> : null}
      <div className="flex flex-wrap gap-2 pt-1">
        <Link href={getUriWithOrg(orgslug, admin.planAssignment(row.assignment_uuid))} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800">Open assignment<ArrowRight size={15} /></Link>
        {thread ? <Link href={getUriWithOrg(orgslug, thread)} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-gray-200 px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50"><MessageSquareText size={15} />Their thread</Link> : null}
        <Link href={getUriWithOrg(orgslug, admin.template(row.plan.template_uuid))} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-gray-200 px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50"><Play size={15} />The plan</Link>
      </div>
    </div>
  </>
}
