'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Switch } from '@components/ui/switch'
import { stepDefinition } from '@components/Goals/steps'
import type { StepTypeKey } from '@services/goals/types'
import { scheduleFlags, scheduleSummary, type StepDates } from '@services/assignments/status'

/** The date inputs on the assignments screens. */
export const DATE_INPUT = 'h-[34px] w-[148px] rounded-[10px] border-[1.5px] border-border bg-card px-2 text-[13px] focus:border-brand focus:outline-none'

function MiniSwitch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) { // eslint-disable-line no-unused-vars
  return <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-foreground">
    <Switch checked={checked} onCheckedChange={onChange} className="data-[state=checked]:bg-good" />{label}
  </label>
}

/**
 * A step in a schedule as one quiet line: its type, title, anything its switches change, and its
 * dates. Opened, it sets the step's start and due dates, whether it opens with its stage, and
 * whether late work is taken.
 */
export default function ScheduleLine({ step, dates, event, open, onToggle, onChange }: {
  step: { key: string; title: string; type: string }
  dates: StepDates
  /** An event step's date, which stands in for a due date. */
  event?: string | null
  open: boolean
  onToggle: () => void
  onChange: (dates: StepDates) => void // eslint-disable-line no-unused-vars
}) {
  const type = stepDefinition(step.type as StepTypeKey)
  const Icon = type.icon
  const flags = scheduleFlags(dates)
  const set = Boolean(dates.start_date || dates.due_date)
  return <div className={cn('rounded-xl', open && 'bg-card shadow-[inset_0_0_0_1px_hsl(var(--border))]')}>
    <button type="button" onClick={onToggle} aria-expanded={open}
      className="flex min-h-10 w-full flex-wrap items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-muted/60 sm:flex-nowrap">
      <span className="grid shrink-0" style={{ color: type.color }}><Icon size={17} aria-hidden="true" /></span>
      <span className="min-w-0 flex-1 truncate">{step.title}</span>
      {flags ? <span className="whitespace-nowrap text-[11.5px] font-semibold text-amber-700 dark:text-amber-300">{flags}</span> : null}
      <span className={cn('whitespace-nowrap text-[12.5px] tabular-nums', set ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{scheduleSummary(dates, event)}</span>
    </button>
    {open ? <div className="flex flex-wrap items-end gap-x-3.5 gap-y-2.5 pb-3 pl-[37px] pr-2.5 pt-0.5">
      <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted-foreground">Start
        <input type="date" className={DATE_INPUT} value={dates.start_date || ''} aria-label={`${step.title} start`}
          onChange={(event) => onChange({ ...dates, start_date: event.target.value || null })} />
      </label>
      <label className="flex flex-col gap-0.5 text-[11px] font-bold text-muted-foreground">Due
        <input type="date" className={DATE_INPUT} value={dates.due_date || ''} aria-label={`${step.title} due`}
          onChange={(event) => onChange({ ...dates, due_date: event.target.value || null })} />
      </label>
      <span className="flex flex-wrap gap-3.5 pb-2">
        {dates.start_date ? <MiniSwitch checked={dates.open_early !== false} onChange={(value) => onChange({ ...dates, open_early: value })} label="Open from start of stage" /> : null}
        <MiniSwitch checked={dates.allow_late !== false} onChange={(value) => onChange({ ...dates, allow_late: value })} label="Allow late" />
      </span>
    </div> : null}
  </div>
}
