'use client'

import React from 'react'
import useSWR from 'swr'
import { Search } from 'lucide-react'
import { PlanTile } from '@components/Assignments/Pair'
import { templateKeys, templatesApi } from '@services/goals/templates'
import type { GoalTemplate } from '@services/goals/types'
import { StepHead } from './flowUi'

/** Opened from a group or person rather than a plan: which plan to assign first. Only plans with a live version can go out. */
export default function PlanChooser({ orgId, token, onPick }: { orgId: number; token?: string; onPick: (templateUuid: string) => void }) { // eslint-disable-line no-unused-vars
  const { data } = useSWR<GoalTemplate[]>(orgId && token ? templateKeys.list(orgId) : null, () => templatesApi.list(orgId, token), { revalidateOnFocus: false })
  const [query, setQuery] = React.useState('')
  const q = query.trim().toLowerCase()
  const plans = (data || []).filter((plan) => plan.published_version && plan.status !== 'archived' && (!q || plan.title.toLowerCase().includes(q)))
  return <div className="mx-auto w-full max-w-[560px] px-6 pb-10 pt-8">
    <StepHead eyebrow="Assign" title="Which plan?" lede="Pick the plan to hand out. You choose who gets it next." />
    <label className="mt-[22px] flex h-12 items-center gap-2 rounded-[18px] border-[1.5px] border-border bg-card px-3 focus-within:border-ring">
      <Search size={17} className="text-muted-foreground" aria-hidden="true" />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search plans" aria-label="Search plans" className="h-full flex-1 bg-transparent text-[15px] outline-none" />
    </label>
    <div className="mt-3 flex flex-col gap-1 rounded-[18px] border border-border bg-card p-1.5">
      {plans.length ? plans.map((plan) => <button key={plan.template_uuid} type="button" onClick={() => onPick(plan.template_uuid)} className="flex items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-muted">
        <PlanTile plan={{ template_uuid: plan.template_uuid, title: plan.title, thumbnail_image: plan.thumbnail_image, icon: plan.icon, color: plan.color, version: plan.published_version }} />
        <span className="flex min-w-0 flex-col"><b className="truncate text-sm">{plan.title}</b><span className="truncate text-[12.5px] text-muted-foreground">{plan.description || `Version ${plan.published_version}`}</span></span>
      </button>) : <p className="px-3 py-2.5 text-[13.5px] text-muted-foreground">{data ? 'No live plans match.' : 'Loading plans…'}</p>}
    </div>
  </div>
}
