'use client'

import React from 'react'
import Link from 'next/link'
import { ChevronRight, Layers3, Plus } from 'lucide-react'
import GoalAssignmentModal from '@components/Goals/admin/templates/GoalAssignmentModal'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { ManagedUser } from '@services/goals/admin'
import { cn } from '@/lib/utils'
import { PersonAvatar, personName } from '../live/ui'

/** One learner's plans for staff: the templates handed to them, and other plans staff can see. Each opens as staff work it. */
export default function ManagedUserGoals({ orgslug, userId, data, refresh, compact = false }: { orgslug: string; userId: number; data?: ManagedUser; refresh: () => Promise<unknown>; compact?: boolean }) {
  const assigned = data?.assignments || []
  const assignedGoals = new Set(assigned.map((item) => item.goal.goal_uuid))
  const others = (data?.goals || []).filter((goal) => !assignedGoals.has(goal.goal_uuid))
  const rows = [
    ...assigned.map((item) => ({ key: item.goal.goal_uuid, href: getUriWithOrg(orgslug, routePaths.org.dash.livePlan(item.goal.goal_uuid)), title: item.template_title, detail: item.cohort?.name ? `Through ${item.cohort.name}` : 'Assigned directly', progress: item.goal.progress, people: item.goal.people || [] })),
    ...others.map((goal) => ({ key: goal.goal_uuid, href: getUriWithOrg(orgslug, routePaths.org.dash.livePlan(goal.goal_uuid)), title: goal.title, detail: goal.status === 'finished' ? 'Finished' : 'Shared with staff', progress: goal.progress, people: goal.people || [] })),
  ]
  return <section className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow">
    <div className="flex items-center justify-between gap-4">
      <div><h2 className="flex items-center gap-2 text-sm font-bold text-gray-900"><Layers3 size={17} />Plans</h2><p className="mt-1 text-xs text-gray-500">Goal templates handed to them directly or through a group. Their own plans stay private unless they share them.</p></div>
      <GoalAssignmentModal initialUserIds={[userId]} onAssigned={() => void refresh()} trigger={<button type="button" className="inline-flex items-center gap-1.5 rounded-lg bg-black px-3 py-2 text-xs font-bold text-white"><Plus size={14} />Assign a template</button>} />
    </div>
    {rows.length ? <div className={cn('mt-4 grid gap-3', !compact && 'md:grid-cols-2')}>{rows.map((row) => {
      const percent = row.progress.total ? Math.round(row.progress.done * 100 / row.progress.total) : 0
      return <Link key={row.key} href={row.href} className="group rounded-lg border border-gray-200 p-4 transition hover:border-blue-300">
        <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-gray-900 group-hover:text-blue-700">{row.title}</p><p className="mt-1 text-xs text-gray-500">{row.detail}</p></div><ChevronRight size={16} className="text-gray-300 group-hover:text-blue-600" /></div>
        <div className="mt-3 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${percent}%` }} /></div><span className="text-[10px] font-black text-gray-500">{percent}%</span></div>
        {row.people.length ? <div className="mt-3 flex items-center gap-2" title={row.people.map((item) => `${personName(item)}, ${item.role}`).join('\n')}>
          <div className="flex -space-x-1.5">{row.people.slice(0, 4).map((item) => <span key={item.id} className="rounded-full ring-2 ring-white"><PersonAvatar person={item} size={22} /></span>)}</div>
          <span className="truncate text-[11px] text-gray-500">{row.people.length === 1 ? `${personName(row.people[0])} · ${row.people[0].role}` : `${row.people.length} people helping`}</span>
        </div> : null}
      </Link>
    })}</div> : <div className="mt-4 rounded-lg border border-dashed border-gray-200 py-8 text-center text-xs font-semibold text-gray-400">No goal templates handed to them yet.</div>}
  </section>
}
