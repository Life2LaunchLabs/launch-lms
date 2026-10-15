'use client'

import React from 'react'
import { Check } from 'lucide-react'
import { Button } from '@components/ui/button'
import { PLAN_PALETTES, planPalette, planVars } from '@components/Goals/planColors'
import { goalsApi } from '@services/goals/goals'
import { can, type Goal, type StepOrder } from '@services/goals/types'
import { cn } from '@/lib/utils'
import { useGoalMutation } from '../useGoalActions'
import GoalStructureEditor from './GoalStructureEditor'
import { dateValue, usesPlanning } from './stepDrafts'

const field = 'h-11 w-full rounded-xl border-2 border-border bg-background px-3 text-sm outline-none transition focus:border-[var(--plan-face)]'
const caption = 'grid gap-1.5 text-xs font-extrabold uppercase tracking-wider text-muted-foreground'

const STEP_ORDERS: Array<{ value: StepOrder; label: string; hint: string }> = [
  { value: 'any', label: 'Any order', hint: 'Every step can be started any time.' },
  { value: 'in_order', label: 'In order', hint: 'Each step opens when the one before it is done.' },
  { value: 'by_stage', label: 'Stage by stage', hint: 'A stage opens when the one before it is done, or on its start date.' },
]

/**
 * Editing a live goal in one place: its title, details, target date, step order and colour on
 * top, its stages and steps below. Stages and steps save as they change; the details save with
 * Save changes. A learner's own goal keeps dates and step order hidden until they turn them on.
 */
// eslint-disable-next-line no-unused-vars
export default function GoalEditMode({ goal, orgslug, token, color, setColor, focusDetails = false, onDone }: { goal: Goal; orgslug: string; token?: string; color: string; setColor?: (color: string) => void; focusDetails?: boolean; onDone: () => void }) {
  const personal = goal.ownership === 'personal'
  const initial = React.useMemo(() => ({ title: goal.title, description: goal.description || '', target_date: dateValue(goal.target_date), step_order: goal.step_order }), [goal.title, goal.description, goal.target_date, goal.step_order])
  const [draft, setDraft] = React.useState(initial)
  const [showDates, setShowDates] = React.useState(() => usesPlanning(goal))
  const { busy, run } = useGoalMutation(goal.goal_uuid)
  const current = planPalette(color)
  const order = STEP_ORDERS.find((option) => option.value === draft.step_order) || STEP_ORDERS[0]
  const canDetails = can(goal, 'edit_plan_details')
  const canSchedule = can(goal, 'edit_schedule') && showDates
  const canOrder = can(goal, 'edit_structure') && showDates

  const save = async () => {
    if (!draft.title.trim()) return
    const changes: Parameters<typeof goalsApi.update>[1] = {}
    if (canDetails && draft.title.trim() !== initial.title) changes.title = draft.title.trim()
    if (canDetails && draft.description !== initial.description) changes.description = draft.description
    if (canSchedule && draft.target_date !== initial.target_date) changes.target_date = draft.target_date || null
    if (canOrder && draft.step_order !== initial.step_order) changes.step_order = draft.step_order
    if (!Object.keys(changes).length) { onDone(); return }
    try {
      // Order changes need edit_structure and the rest edit_plan_details, so they go separately.
      const { step_order, ...rest } = changes
      if (Object.keys(rest).length) await run(() => goalsApi.update(goal.goal_uuid, rest, token))
      if (step_order) await run(() => goalsApi.update(goal.goal_uuid, { step_order }, token))
      onDone()
    } catch { /* toast shown */ }
  }

  return <div data-plan="" data-orgslug={orgslug} style={planVars(color)} className="flex flex-col gap-8">
    <form aria-label="Goal details" onSubmit={(event) => { event.preventDefault(); void save() }} className="flex flex-col gap-4 rounded-3xl border-2 border-border border-t-[6px] border-t-[var(--plan-face)] bg-card p-5">
      {canDetails ? <>
        <label className={caption}>Goal
          <input autoFocus={focusDetails} onFocus={(event) => { if (focusDetails) event.target.select() }} required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={cn(field, 'text-lg font-extrabold normal-case tracking-normal text-foreground')} />
        </label>
        <label className={caption}>Description
          <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="What this goal is for" className={cn(field, 'h-auto min-h-20 py-2 font-normal normal-case tracking-normal text-foreground')} />
        </label>
      </> : <h1 className="text-2xl font-extrabold">{goal.title}</h1>}
      {personal && (can(goal, 'edit_schedule') || can(goal, 'edit_structure')) ? <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={showDates} onChange={(event) => setShowDates(event.target.checked)} />Use dates and step order
      </label> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {canSchedule ? <label className={caption}>Target date (optional)
          <input type="date" value={draft.target_date} onChange={(event) => setDraft({ ...draft, target_date: event.target.value })} className={cn(field, 'font-normal normal-case tracking-normal text-foreground')} />
        </label> : null}
        {setColor ? <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Colour</legend>
          <div className="flex flex-wrap gap-2">{PLAN_PALETTES.map((palette) => <button key={palette.key} type="button" aria-label={palette.label} aria-pressed={palette.key === current.key} onClick={() => setColor(palette.face)} className="flex h-9 w-9 items-center justify-center rounded-full shadow-[0_3px_0_var(--swatch-edge)]" style={{ backgroundColor: palette.face, color: palette.faceInk, '--swatch-edge': palette.edge } as React.CSSProperties}>{palette.key === current.key ? <Check size={16} strokeWidth={3} /> : null}</button>)}</div>
        </fieldset> : null}
      </div>
      {canOrder ? <label className="block border-t border-border pt-4">
        <span className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground">When steps open</span>
        <select value={order.value} disabled={busy} onChange={(event) => setDraft({ ...draft, step_order: event.target.value as StepOrder })} className="mt-2 h-9 w-full rounded-lg border border-border bg-background px-2 text-xs font-black">
          {STEP_ORDERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <span className="mt-1.5 block text-[10px] leading-4 text-muted-foreground">{order.hint}</span>
      </label> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={busy} onClick={() => { setDraft(initial); onDone() }}>Cancel</Button>
        <Button type="submit" variant="plan" disabled={busy || !draft.title.trim()}>{busy ? 'Saving…' : 'Save changes'}</Button>
      </div>
    </form>
    <section aria-label="Stages and steps" className="flex flex-col gap-4">
      <div><h2 className="text-xl font-extrabold">Steps</h2><p className="text-sm text-muted-foreground">Drag steps to move them. Changes here save as you go.</p></div>
      <GoalStructureEditor goal={goal} token={token} showDates={showDates} />
    </section>
  </div>
}
