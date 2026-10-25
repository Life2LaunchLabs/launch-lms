'use client'

import React from 'react'
import { Check, ChevronDown, LayoutGrid, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PlanCover } from '@components/Plans/shared/PlanCover'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import type { ThreadCounts, ThreadFilter, ThreadPlan } from '@services/school/threads'

/** A step the context bar can narrow to. */
export interface StepOption { id: string; title: string; updates?: number; done?: boolean }

const planId = (plan: ThreadPlan) => plan.goal_uuid || plan.assignment_uuid || plan.title

function Cover({ plan, size = 'h-7 w-7' }: { plan: ThreadPlan; size?: string }) {
  if (!plan.cover) return <span className={cn('grid shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground', size)}><LayoutGrid size={14} aria-hidden="true" /></span>
  return <PlanCover plan={{ ...plan.cover, icon: plan.cover.icon as any, title: plan.title }} className={cn('shrink-0 rounded-lg', size)} iconSize={14} />
}

/**
 * What the thread is about: everything, or one plan (one assignment, for a group) and maybe one
 * of its steps. With everything, each plan is a tab with how much waits on you in it. With a plan
 * picked, it shows with an x to go back to everything, and its step, when one is picked, has its
 * own x to go back to the whole plan.
 */
export function ContextBar({ plans, focus, onFocus, steps, step, onStep }: {
  plans: ThreadPlan[]
  focus: string | null
  onFocus: (id: string | null) => void // eslint-disable-line no-unused-vars
  steps: StepOption[]
  step: string | null
  onStep: (id: string | null) => void // eslint-disable-line no-unused-vars
}) {
  if (!plans.length) return null
  const picked = focus ? plans.find((plan) => planId(plan) === focus) : undefined
  const shell = 'flex shrink-0 items-center gap-2 overflow-x-auto px-3 pb-2.5 [scrollbar-width:none] sm:px-5'
  if (!picked) return <div role="group" aria-label="Working on" className={shell}>
    <button type="button" aria-pressed="true" className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-foreground px-3 text-sm font-bold text-background">
      <LayoutGrid size={15} aria-hidden="true" />All
    </button>
    {plans.map((plan) => <button key={planId(plan)} type="button" aria-pressed="false" onClick={() => onFocus(planId(plan))}
      className={cn('flex h-10 shrink-0 items-center gap-2 rounded-xl border border-border py-1 pl-1.5 pr-3 text-left text-sm font-semibold hover:bg-muted/60', plan.status === 'ended' && 'opacity-60')}>
      <Cover plan={plan} />
      <span className="max-w-44 truncate leading-tight">{plan.title}{plan.status !== 'active' ? <small className="block text-[11px] font-medium capitalize text-muted-foreground">{plan.status}</small> : null}</span>
      {plan.needs ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--org-primary-color)] px-1.5 text-[11px] font-bold text-white" aria-label={`${plan.needs} waiting on you`}>{plan.needs}</span> : null}
    </button>)}
  </div>
  const chosen = step ? steps.find((item) => item.id === step) : undefined
  return <div role="group" aria-label="Working on" className={shell}>
    <span className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-foreground py-1 pl-1.5 pr-1 text-sm font-bold">
      <Cover plan={picked} /><span className="max-w-44 truncate">{picked.title}</span>
      <button type="button" onClick={() => onFocus(null)} aria-label="Show everything" title="Show everything" className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><X size={15} /></button>
    </span>
    {steps.length ? <>
      <span aria-hidden="true" className="text-muted-foreground">›</span>
      {chosen ? <span className="flex h-10 shrink-0 items-center gap-1 rounded-xl border border-foreground py-1 pl-3 pr-1 text-sm font-semibold">
        <StepPicker steps={steps} step={step} onStep={onStep}><button type="button" className="flex max-w-56 items-center gap-1 truncate">{chosen.title}<ChevronDown size={14} className="shrink-0 opacity-60" aria-hidden="true" /></button></StepPicker>
        <button type="button" onClick={() => onStep(null)} aria-label={`Stop showing only ${chosen.title}`} title="All steps" className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><X size={15} /></button>
      </span> : <StepPicker steps={steps} step={step} onStep={onStep}>
        <button type="button" className="flex h-10 shrink-0 items-center gap-1 rounded-xl border border-dashed border-border px-3 text-sm font-semibold text-muted-foreground hover:text-foreground">All steps<ChevronDown size={14} aria-hidden="true" /></button>
      </StepPicker>}
    </> : null}
  </div>
}

function StepPicker({ steps, step, onStep, children }: { steps: StepOption[]; step: string | null; onStep: (id: string | null) => void; children: React.ReactNode }) { // eslint-disable-line no-unused-vars
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-y-auto">
      <DropdownMenuItem onSelect={() => onStep(null)} className="font-semibold">All steps</DropdownMenuItem>
      {steps.map((item) => <DropdownMenuItem key={item.id} onSelect={() => onStep(item.id)} className="flex items-center gap-2">
        <span className="w-4 shrink-0">{item.id === step ? <Check size={14} aria-hidden="true" /> : null}</span>
        <span className={cn('min-w-0 flex-1 truncate', item.done && 'text-muted-foreground')}>{item.title}</span>
        {item.updates ? <span className="text-xs text-muted-foreground">{item.updates}</span> : null}
      </DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>
}

const CHIPS: Array<{ key: Exclude<ThreadFilter, 'all'>; label: string; tone: string }> = [
  { key: 'review', label: 'Review', tone: '' },
  { key: 'questions', label: 'Questions', tone: 'text-amber-700 dark:text-amber-300' },
  { key: 'requests', label: 'Requests', tone: 'text-amber-700 dark:text-amber-300' },
  { key: 'past_due', label: 'Past due', tone: 'text-red-700 dark:text-red-300' },
  { key: 'staff_only', label: 'Staff only', tone: '' },
]

/** What waits on you here, each a filter with its count; only the ones with something in them show. */
export function FilterChips({ counts, value, onChange }: { counts: ThreadCounts; value: ThreadFilter; onChange: (value: ThreadFilter) => void }) { // eslint-disable-line no-unused-vars
  const shown = CHIPS.filter((chip) => counts[chip.key] || chip.key === value)
  if (!shown.length) return null
  const chip = (on: boolean) => cn('flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors',
    on ? 'border-foreground bg-foreground text-background' : 'border-border hover:bg-muted/60')
  return <div role="radiogroup" aria-label="Show" className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border px-3 pb-2.5 [scrollbar-width:none] sm:px-5">
    <button type="button" role="radio" aria-checked={value === 'all'} onClick={() => onChange('all')} className={chip(value === 'all')}>All</button>
    {shown.map((item) => <button key={item.key} type="button" role="radio" aria-checked={value === item.key} onClick={() => onChange(item.key)} className={chip(value === item.key)}>
      {item.label}{counts[item.key] ? <span className={cn('font-bold', value === item.key ? '' : item.tone)}>{counts[item.key]}</span> : null}
    </button>)}
  </div>
}
