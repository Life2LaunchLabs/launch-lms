'use client'
import React from 'react'
import Link from 'next/link'
import { ClipboardCheck, Flag, GraduationCap, Hourglass, Stamp } from 'lucide-react'
import { PathNode } from '@components/Goals/path/PathNode'
import { PLAN_COLORS, planVars } from '@components/Goals/planColors'
import { stepDefinition } from '@components/Goals/steps'
import { getUriWithOrg } from '@services/config/config'
import type { InboxKind } from '@services/goals/admin'
import type { AdminHome, HomeAttentionRow, HomeTodayItem, HomeWaiting } from '@services/goals/adminHome'
import type { NodeState } from '@services/goals/types'
import { homeLinks } from './links'
import { Chip, WidgetCard, WidgetEmpty, WidgetList, WidgetRow, dayLabel, plural } from './WidgetCard'

const KIND: Record<InboxKind, { verb: string; icon: React.ElementType; tone: 'blue' | 'green' | 'amber' }> = {
  review: { verb: 'to review', icon: ClipboardCheck, tone: 'green' },
  grade: { verb: 'to grade', icon: GraduationCap, tone: 'green' },
  confirm: { verb: 'to confirm', icon: Stamp, tone: 'blue' },
  nudge: { verb: 'gone quiet', icon: Hourglass, tone: 'amber' },
}

/** Work waiting on the viewer: submissions to review or grade, events to confirm, quiet learners, and chat reports. */
export function WaitingWidget({ data, orgslug, title }: { data: HomeWaiting; orgslug: string; title: string }) {
  return (
    <WidgetCard title={title} count={data.total} more={{ href: getUriWithOrg(orgslug, homeLinks.assignments()), label: 'Assignments' }}>
      {data.groups.length || data.reports ? <WidgetList>
        {data.groups.map((group) => {
          const look = KIND[group.kind]
          const Icon = look.icon
          const where = [group.template?.title, group.group?.name].filter(Boolean).join(' · ')
          return <WidgetRow key={`${group.kind}:${group.assignment_uuid}:${group.step_key || group.step_uuid || group.activity_uuid}`}
            href={getUriWithOrg(orgslug, homeLinks.waiting(group))}
            lead={<Icon size={18} className="shrink-0 text-gray-400" aria-hidden="true" />}
            title={group.step.title}
            detail={[group.step.stage_title, where].filter(Boolean).join(' · ')}
            trailing={<Chip tone={look.tone}>{group.count} {look.verb}</Chip>} />
        })}
        {data.reports ? <WidgetRow href={getUriWithOrg(orgslug, homeLinks.reports())} lead={<Flag size={18} className="shrink-0 text-gray-400" aria-hidden="true" />}
          title="Chat reports" detail="Messages people reported for an admin to look at" trailing={<Chip tone="red">{data.reports} open</Chip>} /> : null}
      </WidgetList> : <WidgetEmpty>Nothing waiting on you.</WidgetEmpty>}
    </WidgetCard>
  )
}

const colorOf = (uuid: string) => PLAN_COLORS[[...uuid].reduce((sum, char) => sum + char.charCodeAt(0), 0) % PLAN_COLORS.length]

function stepState(item: Extract<HomeTodayItem, { kind: 'step_closes' }>): { state: NodeState; fraction: number } {
  const { done, learners } = item.counts
  if (learners && done >= learners) return { state: 'done', fraction: 1 }
  return done ? { state: 'started', fraction: done / learners } : { state: 'open', fraction: 0 }
}

function stepDetail(item: Extract<HomeTodayItem, { kind: 'step_closes' }>) {
  const { counts } = item
  if (item.completed_by === 'staff') return counts.needs_settle ? `${counts.needs_settle} still to settle` : `${counts.done} of ${counts.learners} done`
  return [`${counts.done + counts.handed_in + counts.to_grade} of ${counts.learners} handed in`, counts.handed_in + counts.to_grade ? `${counts.handed_in + counts.to_grade} to review` : ''].filter(Boolean).join(' · ')
}

/** Steps closing and stages opening this week across the assignments the viewer staffs, as rows on a path like the learner's This week. */
export function TodayWidget({ data, orgslug, title }: { data: NonNullable<AdminHome['today']>; orgslug: string; title: string }) {
  return (
    <WidgetCard title={title} more={{ href: getUriWithOrg(orgslug, homeLinks.assignments()), label: 'Assignments' }}>
      {data.items.length ? <ol className="flex flex-col px-5 pt-4">
        {data.items.map((item, index) => {
          const last = index === data.items.length - 1
          const opening = item.kind === 'stage_opens'
          const { state, fraction } = opening ? { state: 'open' as NodeState, fraction: 0 } : stepState(item)
          const icon = opening ? Flag : stepDefinition(item.type || 'task').icon
          const waiting = !opening && item.counts.handed_in + item.counts.to_grade > 0
          const href = waiting ? homeLinks.waiting({ kind: 'review', assignment_uuid: item.assignment_uuid, step_key: item.step_key, step_uuid: null, activity_uuid: null }) : homeLinks.assignment(item)
          return <li key={`${item.assignment_uuid}:${item.kind}:${opening ? item.stage_key : item.step_key}`} style={planVars(colorOf(item.assignment_uuid))} className="relative flex items-start gap-4 pb-4">
            {!last ? <span aria-hidden="true" className="absolute left-[22px] top-12 bottom-0 w-[3px] -translate-x-1/2 rounded-full bg-border" /> : null}
            <span className="flex w-11 shrink-0 justify-center"><PathNode state={state} fraction={fraction} icon={icon} size={44} /></span>
            <Link href={getUriWithOrg(orgslug, href)} className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5 hover:opacity-80">
              <span className="truncate text-xs font-extrabold text-[var(--plan-accent)]">{item.template_title}{item.assigned_to ? ` · ${item.assigned_to}` : ''}</span>
              <span className="truncate text-base font-bold leading-snug text-gray-900">{opening ? `${item.title} starts` : item.title}</span>
              <span className="text-xs font-semibold text-gray-500">{dayLabel(item.date)} · {opening ? plural(item.step_count, 'step') : `closes · ${stepDetail(item)}`}</span>
            </Link>
          </li>
        })}
      </ol> : <WidgetEmpty>Nothing opens or closes in the next {data.days} days.</WidgetEmpty>}
      {data.total > data.items.length ? <p className="px-5 pb-3 text-xs text-gray-500">{data.total - data.items.length} more this week</p> : null}
    </WidgetCard>
  )
}

/** Assignments where learners are behind or work waits on staff, worst first. */
export function AttentionWidget({ data, orgslug, title }: { data: { assignments: HomeAttentionRow[]; total: number }; orgslug: string; title: string }) {
  return (
    <WidgetCard title={title} count={data.total} more={{ href: getUriWithOrg(orgslug, homeLinks.assignments()) }}>
      {data.assignments.length ? <WidgetList>
        {data.assignments.map((row) => <WidgetRow key={row.assignment_uuid} href={getUriWithOrg(orgslug, homeLinks.assignment(row))}
          title={row.template_title}
          detail={<>
            {row.assigned_to} · {plural(row.learner_count, 'learner')} · {row.progress_percent}% done
            <span aria-hidden="true" className="mt-1.5 block h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-gray-100"><span className="block h-full rounded-full bg-gray-800" style={{ width: `${row.progress_percent}%` }} /></span>
          </>}
          trailing={<>
            {row.behind_count ? <Chip tone="amber">{row.behind_count} behind</Chip> : null}
            {row.overdue_count ? <Chip tone="red">{plural(row.overdue_count, 'overdue step')}</Chip> : null}
            {row.needs_you_count ? <Chip tone="blue">{row.needs_you_count} need you</Chip> : null}
          </>} />)}
      </WidgetList> : <WidgetEmpty>Every assignment is on track.</WidgetEmpty>}
    </WidgetCard>
  )
}
