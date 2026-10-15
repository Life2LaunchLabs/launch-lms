'use client'

import React from 'react'
import { ArrowDown, ArrowUp, Check, Loader2, Pencil, Trash2, X } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import { goalsApi } from '@services/goals/goals'
import { can, type Goal, type Stage } from '@services/goals/types'
import { shortDate } from '../path/stepText'
import { useGoalMutation } from '../useGoalActions'
import { dateValue } from './stepDrafts'

/** A stage's name, rough timing, dates and details, edited in place; plus moving and deleting it. */
export default function StageHeader({ goal, stage, index, token, showDates }: { goal: Goal; stage: Stage; index: number; token?: string; showDates: boolean }) {
  const canEdit = can(goal, 'edit_structure')
  const canSchedule = can(goal, 'edit_schedule') && showDates
  const initial = React.useMemo(() => ({ title: stage.title, timing: stage.timing || '', description: stage.description || '', start_date: dateValue(stage.start_date), due_date: dateValue(stage.due_date) }), [stage])
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(initial)
  const { busy, run } = useGoalMutation(goal.goal_uuid)
  const id = `stage-${stage.stage_uuid}`

  const save = async () => {
    if (!draft.title.trim()) return
    const changes: Record<string, string | null> = {}
    if (canEdit) for (const key of ['title', 'timing', 'description'] as const) if (draft[key] !== initial[key]) changes[key] = key === 'title' ? draft.title.trim() : draft[key]
    if (canSchedule) for (const key of ['start_date', 'due_date'] as const) if (draft[key] !== initial[key]) changes[key] = draft[key] || null
    try {
      if (Object.keys(changes).length) await run(() => goalsApi.updateStage(goal.goal_uuid, stage.stage_uuid, changes, token))
      setEditing(false)
    } catch { /* toast shown */ }
  }
  const move = (offset: number) => {
    const order = goal.stages.map((item) => item.stage_uuid)
    const [moved] = order.splice(index, 1)
    order.splice(index + offset, 0, moved)
    void run(() => goalsApi.reorderStages(goal.goal_uuid, order, token)).catch(() => undefined)
  }
  const remove = () => {
    if (!window.confirm(`Delete the stage “${stage.title}”?`)) return
    void run(() => goalsApi.deleteStage(goal.goal_uuid, stage.stage_uuid, token), 'Stage deleted').catch(() => undefined)
  }

  if (editing) return <form aria-label={`Edit ${stage.title}`} onSubmit={(event) => { event.preventDefault(); void save() }} className="flex flex-col gap-3 rounded-2xl border-2 border-border bg-card p-4">
    <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
      <div className="flex flex-col gap-1"><Label htmlFor={`${id}-title`}>Stage name</Label><Input id={`${id}-title`} autoFocus disabled={!canEdit} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></div>
      <div className="flex flex-col gap-1"><Label htmlFor={`${id}-timing`}>Rough timing</Label><Input id={`${id}-timing`} disabled={!canEdit} value={draft.timing} onChange={(event) => setDraft({ ...draft, timing: event.target.value })} placeholder="This fall, two weeks…" /></div>
    </div>
    {canSchedule ? <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1"><Label htmlFor={`${id}-start`}>Starts</Label><Input id={`${id}-start`} type="date" value={draft.start_date} onChange={(event) => setDraft({ ...draft, start_date: event.target.value })} /></div>
      <div className="flex flex-col gap-1"><Label htmlFor={`${id}-due`}>Ends</Label><Input id={`${id}-due`} type="date" value={draft.due_date} onChange={(event) => setDraft({ ...draft, due_date: event.target.value })} /></div>
    </div> : null}
    {canEdit ? <div className="flex flex-col gap-1"><Label htmlFor={`${id}-details`}>Details</Label><Textarea id={`${id}-details`} rows={2} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Anything that helps" /></div> : null}
    <div className="flex justify-end gap-2">
      <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setDraft(initial); setEditing(false) }}><X size={14} />Cancel</Button>
      <Button type="submit" variant="plan" size="sm" disabled={busy || !draft.title.trim()}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Save stage</Button>
    </div>
  </form>

  const when = [stage.timing, stage.start_date || stage.due_date ? [shortDate(stage.start_date), shortDate(stage.due_date)].filter(Boolean).join(' – ') : ''].filter(Boolean).join(' · ')
  return <div className="flex items-start gap-2">
    <div className="min-w-0 flex-1">
      <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">{stage.title}{when ? <span className="ml-2 font-semibold normal-case tracking-normal">· {when}</span> : null}</h3>
      {stage.description ? <p className="mt-1 text-sm text-muted-foreground">{stage.description}</p> : null}
    </div>
    {canEdit || canSchedule ? <span className="flex shrink-0 items-center">
      {canEdit ? <>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={busy || index === 0} onClick={() => move(-1)} aria-label={`Move ${stage.title} up`}><ArrowUp size={13} /></Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={busy || index === goal.stages.length - 1} onClick={() => move(1)} aria-label={`Move ${stage.title} down`}><ArrowDown size={13} /></Button>
      </> : null}
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setDraft(initial); setEditing(true) }} aria-label={`Edit ${stage.title}`}><Pencil size={13} /></Button>
      {canEdit ? <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={busy || stage.steps.length > 0} title={stage.steps.length ? 'Move or delete its steps first' : undefined} onClick={remove} aria-label={`Delete ${stage.title}`}><Trash2 size={13} /></Button> : null}
    </span> : null}
  </div>
}
