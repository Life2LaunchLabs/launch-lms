'use client'
import React from 'react'
import Link from 'next/link'
import { Flag } from 'lucide-react'
import { PathNode } from '@components/Goals/path/PathNode'
import { PLAN_COLORS, planVars } from '@components/Goals/planColors'
import { stepDefinition } from '@components/Goals/steps'
import { getUriWithOrg } from '@services/config/config'
import type { HomeTodayItem, HomeWeek } from '@services/goals/adminHome'
import type { NodeState } from '@services/goals/types'
import { homeLinks } from './links'
import { WidgetCard, WidgetEmpty, dayLabel, plural } from './WidgetCard'

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

/** Steps closing and stages opening this week across the viewer's assignments, as rows on a path like the learner's This week. */
export function WeekWidget({ data, orgslug }: { data: HomeWeek; orgslug: string }) {
  return (
    <WidgetCard title="This week" more={{ href: getUriWithOrg(orgslug, homeLinks.assignments()), label: 'Assignments' }}>
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
