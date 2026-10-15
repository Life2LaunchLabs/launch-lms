'use client'

import React from 'react'
import { ChevronDown, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'
import { stepDefinition } from '@components/Goals/steps'
import { goalSteps, type Goal, type Step } from '@services/goals/types'

const GROUPS: Array<{ key: 'answers' | 'decisions' | 'results'; title: string }> = [
  { key: 'answers', title: 'Answers' },
  { key: 'decisions', title: 'Decisions' },
  { key: 'results', title: 'Results' },
]

function groupOf(step: Step): 'answers' | 'decisions' | 'results' | null {
  if (step.type === 'decision') return step.result ? 'decisions' : null
  if (step.answer?.trim() || step.result?.kind === 'text') return 'answers'
  if (step.result && step.result.kind !== 'rsvp') return 'results'
  return null
}

/** "What I've found": the goal's answers, decisions and results in one collapsible panel, each linking to its step. */
// eslint-disable-next-line no-unused-vars
export default function GoalFindings({ goal, onGoTo }: { goal: Goal; onGoTo: (stepUuid: string) => void }) {
  const [open, setOpen] = React.useState(false)
  const found = goalSteps(goal).map((step) => ({ step, group: groupOf(step) })).filter((item) => item.group)
  if (!found.length) return null
  return <section aria-label="What I've found" className="rounded-2xl border-2 border-border bg-card">
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--plan-face)_18%,hsl(var(--card)))] text-[var(--plan-accent)]"><Lightbulb size={18} aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-extrabold">What I&apos;ve found</span>
        <span className="block text-xs font-semibold text-muted-foreground">{found.length} {found.length === 1 ? 'thing' : 'things'} from your steps</span>
      </span>
      <ChevronDown size={18} aria-hidden="true" className={cn('shrink-0 transition-transform', open && 'rotate-180')} />
    </button>
    {open ? <div className="flex flex-col gap-4 border-t-2 border-border px-4 py-4">
      {GROUPS.map((group) => {
        const items = found.filter((item) => item.group === group.key)
        if (!items.length) return null
        return <div key={group.key} className="flex flex-col gap-2">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">{group.title}</h3>
          <ul className="flex flex-col gap-2">
            {items.map(({ step }) => {
              const RowResult = stepDefinition(step.type).RowResult
              const text = step.answer?.trim()
              return <li key={step.step_uuid} className="rounded-xl bg-muted/50 px-3 py-2">
                <button type="button" onClick={() => onGoTo(step.step_uuid)} className="text-left text-sm font-bold text-[var(--plan-accent)] hover:underline">{step.title}</button>
                {text ? <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm text-foreground/80">{text}</p> : null}
                {!text && RowResult && step.result ? <div className="mt-1"><RowResult step={step as never} /></div> : null}
              </li>
            })}
          </ul>
        </div>
      })}
    </div> : null}
  </section>
}
