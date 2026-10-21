'use client'

import React from 'react'
import Link from 'next/link'
import { ChevronRight, Mail, User, Users } from 'lucide-react'
import { getUriWithOrg } from '@services/config/config'
import { cn } from '@/lib/utils'
import { PersonAvatar, personName } from '../live/ui'
import { assignmentHref, assignmentLabel, Chip, datesLine, StatusChip, type AssignmentRow } from './shared'

/** The columns of a plan card's assignment rows from tablet width up (stacked on a phone). */
export const PLAN_ROW_GRID = 'md:grid md:grid-cols-[minmax(0,1fr)_150px_88px_128px_minmax(104px,150px)_56px] md:items-center md:gap-4'

type Need = { grade: number; settle: number }

/**
 * One assignment in a list: who it's for, where it stands, its dates and staff, and what waits on the viewer;
 * the whole row opens the assignment. `layout="table"` lines the same facts up in columns under a plan card,
 * with a progress bar.
 */
export function AssignmentListRow({ assignment, orgslug, showTemplate, need, actions, banner, layout = 'list' }: {
  assignment: AssignmentRow & { progress_percent?: number }
  orgslug: string
  showTemplate: boolean
  need?: Need
  actions: React.ReactNode
  banner?: React.ReactNode
  layout?: 'list' | 'table'
}) {
  const Icon = assignment.assignment_type === 'group' ? Users : assignment.assignment_type === 'external' ? Mail : User
  const who = assignmentLabel(assignment)
  const waiting = Boolean(need?.grade || need?.settle)
  const needs = <>
    {need?.grade ? <Chip tone="blue">{need.grade} to grade</Chip> : null}
    {need?.settle ? <Chip tone="amber">{need.settle} to settle</Chip> : null}
  </>
  if (layout === 'table') return <TableRow assignment={assignment} orgslug={orgslug} icon={<Icon size={16} aria-hidden="true" />} who={who} needs={waiting ? needs : null} actions={actions} banner={banner} />
  // On a phone the title and its details get the full width; what waits on you and the menu go on a line of their own.
  return <li className="relative flex flex-wrap items-center gap-3 p-4 transition hover:bg-muted/50 sm:flex-nowrap">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Icon size={18} aria-hidden="true" /></span>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={getUriWithOrg(orgslug, assignmentHref(assignment))} className="min-w-0 text-sm font-black after:absolute after:inset-0 focus-visible:outline-none sm:truncate">
          {showTemplate ? `${assignment.template_title} · ${who}` : who}
        </Link>
        <StatusChip status={assignment.status} />
        {assignment.version ? <span className="text-[11px] font-semibold text-muted-foreground">v{assignment.version}</span> : null}
      </div>
      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{assignment.learner_count} learner{assignment.learner_count === 1 ? '' : 's'}{assignment.assignment_type === 'group' ? ' · people who join the group get it too' : ''}</span>
        <span>{datesLine(assignment)}</span>
        {assignment.staff.length ? <span>Staff: {assignment.staff.map((person) => [person.first_name, person.last_name].filter(Boolean).join(' ') || person.username).join(', ')}</span> : null}
      </p>
      {banner ? <div className="relative z-10">{banner}</div> : null}
    </div>
    <div className={cn('order-last w-full items-center justify-between gap-3 pl-[52px] sm:order-none sm:flex sm:w-auto sm:justify-end sm:pl-0', waiting || actions ? 'flex' : 'hidden')}>
      <span className="flex shrink-0 flex-wrap gap-1.5 sm:justify-end" aria-label="Waiting on you">{needs}</span>
      {actions ? <span className="relative z-10 shrink-0">{actions}</span> : null}
    </div>
    <ChevronRight size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
  </li>
}

function TableRow({ assignment, orgslug, icon, who, needs, actions, banner }: {
  assignment: AssignmentRow & { progress_percent?: number }
  orgslug: string
  icon: React.ReactNode
  who: string
  needs: React.ReactNode
  actions: React.ReactNode
  banner?: React.ReactNode
}) {
  const progress = Math.max(0, Math.min(100, Math.round(assignment.progress_percent ?? 0)))
  const staff = assignment.staff.map((person) => personName(person))
  return <li className="relative px-4 py-3 transition hover:bg-muted/50 sm:px-5">
    <div className={cn('flex flex-col gap-2', PLAN_ROW_GRID)}>
      <div className="flex min-w-0 items-center gap-3 pr-16 md:pr-0">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">{icon}</span>
        <div className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <Link href={getUriWithOrg(orgslug, assignmentHref(assignment))} className="truncate text-sm font-bold after:absolute after:inset-0 focus-visible:outline-none">{who}</Link>
            {/* Active is the norm; only a paused or ended assignment says so. */}
            {assignment.status !== 'active' ? <StatusChip status={assignment.status} /> : null}
          </span>
          <p className="truncate text-xs text-muted-foreground">{assignment.learner_count} learner{assignment.learner_count === 1 ? '' : 's'}{assignment.version ? ` · v${assignment.version}` : ''}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-11 md:contents">
        <span className="text-xs tabular-nums text-muted-foreground md:text-sm">{datesLine(assignment)}</span>
        <span className="flex items-center -space-x-1.5" aria-label={staff.length ? `Staff: ${staff.join(', ')}` : 'No staff'} title={staff.join(', ')}>
          {assignment.staff.slice(0, 3).map((person) => <span key={person.id} className="rounded-full ring-2 ring-card"><PersonAvatar person={person} size={24} /></span>)}
          {assignment.staff.length > 3 ? <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold ring-2 ring-card">+{assignment.staff.length - 3}</span> : null}
        </span>
      </div>
      <div className="flex items-center gap-2 pl-11 md:pl-0" aria-label={`Progress ${progress}%`}>
        <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"><span className={cn('block h-full rounded-full', progress === 100 ? 'bg-green-500' : 'bg-violet-500')} style={{ width: `${progress}%` }} /></span>
        <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{progress}%</span>
      </div>
      <div className="flex flex-wrap gap-1.5 pl-11 md:pl-0" aria-label="Waiting on you">
        {needs || <span className="text-xs text-muted-foreground">{assignment.status === 'ended' ? 'Finished' : 'All clear'}</span>}
      </div>
      <div className="absolute right-3 top-3 flex items-center justify-end gap-1 md:static">
        {actions ? <span className="relative z-10">{actions}</span> : null}
        <ChevronRight size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
    </div>
    {banner ? <div className="relative z-10 md:pl-11">{banner}</div> : null}
  </li>
}
