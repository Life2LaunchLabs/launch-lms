'use client'

import React from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import { GOAL_ICONS } from '@components/Goals/goalIcons'
import { PLAN_PALETTES, planPalette } from '@components/Goals/planColors'
import { goalsApi } from '@services/goals/goals'
import { can, type Goal, type GoalIcon, type StepOrder } from '@services/goals/types'
import { cn } from '@/lib/utils'
import { useGoalMutation } from '../useGoalActions'
import EditSheet from './EditSheet'
import { dateValue } from './stepDrafts'

const STEP_ORDERS: Array<{ value: StepOrder; label: string; hint: string }> = [
  { value: 'any', label: 'Any order', hint: 'Every step is open to start.' },
  { value: 'in_order', label: 'In order', hint: 'Each step opens once the one before it is done.' },
  { value: 'by_stage', label: 'Stage by stage', hint: 'A stage opens once the one before it is done.' },
]

/** The goal itself: its name, why it matters, its mark and colour, an optional target date and, tucked away, how its steps open. */
export default function GoalSettingsSheet({ goal, token, color, setColor, onClose }: {
  goal: Goal; token?: string; color: string
  // eslint-disable-next-line no-unused-vars
  setColor?: (color: string) => void
  onClose: () => void
}) {
  const [title, setTitle] = React.useState(goal.title)
  const [description, setDescription] = React.useState(goal.description || '')
  const [icon, setIcon] = React.useState<GoalIcon | null>(goal.icon || null)
  const [target, setTarget] = React.useState(dateValue(goal.target_date))
  const [order, setOrder] = React.useState<StepOrder>(goal.step_order)
  const [shade, setShade] = React.useState(color)
  const { busy, run } = useGoalMutation(goal.goal_uuid)
  const details = can(goal, 'edit_plan_details')
  const schedule = can(goal, 'edit_schedule')
  const structure = can(goal, 'edit_structure')
  // Organization goals show their badge or a target; a learner marks their own.
  const marked = goal.ownership === 'personal'
  const save = async () => {
    if (details && !title.trim()) return
    const changes = {
      ...(details && title.trim() !== goal.title ? { title: title.trim() } : {}),
      ...(details && description !== (goal.description || '') ? { description } : {}),
      ...(details && marked && icon !== (goal.icon || null) ? { icon } : {}),
      ...(schedule && (target || null) !== (dateValue(goal.target_date) || null) ? { target_date: target || null } : {}),
      ...(structure && order !== goal.step_order ? { step_order: order } : {}),
    }
    try {
      if (Object.keys(changes).length) await run(() => goalsApi.update(goal.goal_uuid, changes, token))
      if (setColor && shade !== color) setColor(shade)
      onClose()
    } catch { /* toast shown */ }
  }
  const current = planPalette(shade)
  return <EditSheet open onOpenChange={(open) => { if (!open) onClose() }} color={shade} title="Goal settings"
    footer={<><Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
      <Button type="button" variant="plan" disabled={busy || (details && !title.trim())} onClick={() => void save()}>{busy ? <Loader2 size={14} className="animate-spin" /> : null}Save</Button></>}>
    <div className="flex flex-col gap-5">
      {details ? <>
        <div className="flex flex-col gap-1"><Label htmlFor="goal-title">Goal</Label><Input id="goal-title" value={title} onChange={(event) => setTitle(event.target.value)} /></div>
        <div className="flex flex-col gap-1"><Label htmlFor="goal-why">Why it matters <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="goal-why" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A line or two is plenty" /></div>
        {marked ? <div className="flex flex-col gap-2">
          <Label>Icon</Label>
          <div role="radiogroup" aria-label="Icon" className="grid grid-cols-6 gap-2">
            {GOAL_ICONS.map(({ key, label, icon: Icon }) => {
              const on = (icon || 'target') === key
              return <button key={key} type="button" role="radio" aria-checked={on} aria-label={label} onClick={() => setIcon(key === 'target' ? null : key)}
                className={cn('flex h-11 items-center justify-center rounded-xl border-2 transition', on ? 'border-[var(--plan-face)] bg-[color-mix(in_srgb,var(--plan-face)_15%,hsl(var(--card)))] text-[var(--plan-accent)]' : 'border-border text-muted-foreground hover:border-[var(--plan-face)]')}>
                <Icon size={18} aria-hidden="true" />
              </button>
            })}
          </div>
        </div> : null}
      </> : null}
      {setColor ? <div className="flex flex-col gap-2">
        <Label>Colour</Label>
        <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2">
          {PLAN_PALETTES.map((palette) => <button key={palette.key} type="button" role="radio" aria-label={palette.label} aria-checked={palette.key === current.key} onClick={() => setShade(palette.face)}
            className="flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 ring-offset-popover transition aria-checked:ring-2 aria-checked:ring-foreground/50" style={{ backgroundColor: palette.face, color: palette.faceInk }}>
            {palette.key === current.key ? <Check size={14} strokeWidth={3} /> : null}
          </button>)}
        </div>
      </div> : null}
      {schedule ? <div className="flex flex-col gap-1">
        <Label htmlFor="goal-target">Target date <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Input id="goal-target" type="date" value={target} onChange={(event) => setTarget(event.target.value)} className="sm:w-56" />
      </div> : null}
      {structure ? <details className="group/advanced rounded-xl border border-border/70 px-3 py-2" open={goal.step_order !== 'any'}>
        <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between text-sm font-bold text-muted-foreground">Advanced<span aria-hidden="true" className="text-xs transition-transform group-open/advanced:rotate-180">▾</span></summary>
        <div role="radiogroup" aria-label="How steps open" className="mt-2 flex flex-col gap-2 pb-1">
          {STEP_ORDERS.map((option) => <label key={option.value} className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="radio" name="step-order" className="mt-1" checked={order === option.value} onChange={() => setOrder(option.value)} />
            <span><span className="block font-bold">{option.label}</span><span className="block text-xs text-muted-foreground">{option.hint}</span></span>
          </label>)}
        </div>
      </details> : null}
    </div>
  </EditSheet>
}
