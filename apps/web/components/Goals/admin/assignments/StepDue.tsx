'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { CalendarDays, Loader2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { goalAdminApi, type MatrixColumn } from '@services/goals/admin'
import { dayOf } from '@services/goals/cohort'
import { addDays } from '@services/goals/timing'
import { cn } from '@/lib/utils'
import type { TodoContext } from './StepTodos'

/** "Due today", "Due tomorrow", "Due Fri, Oct 24", or "Was due Oct 17" once it has passed. */
export function dueLabel(due: string, today: string) {
  if (due === today) return 'Due today'
  if (due === addDays(today, 1)) return 'Due tomorrow'
  const date = new Date(`${due}T12:00:00`)
  const sameYear = date.getFullYear() === new Date(`${today}T12:00:00`).getFullYear()
  if (due < today) return `Was due ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' })}`
  return `Due ${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' })}`
}

/**
 * When the step is due on the assignment, and for whoever runs it a way to set, move or clear
 * that date: a handout due next week. Without a date of its own, a step is due when its stage ends. Learners' plans move with it, except dates changed for one learner.
 */
export default function StepDue({ column, due, withStage, ctx }: { column: MatrixColumn; due: string | null; withStage: boolean; ctx: TodoContext }) {
  const today = dayOf(ctx.now)
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(due && !withStage ? due : addDays(today, 7))
  const [saving, setSaving] = React.useState(false)
  const editable = ctx.canReschedule && ctx.status !== 'ended'
  const late = Boolean(due && due < today && column.aggregate.done_count < column.aggregate.learner_count)
  const save = async (value: string | null) => {
    setSaving(true)
    try {
      await goalAdminApi.setStepDue(ctx.orgId, ctx.assignmentUuid, column.template_key, value, ctx.token)
      toast.success(value ? `${dueLabel(value, today)}. Learners’ plans show it.` : 'Due date cleared. It closes with its stage.')
      setEditing(false)
      await ctx.refresh()
    } catch (error: any) { toast.error(error?.message || 'That date didn’t save') } finally { setSaving(false) }
  }
  if (!editing) return <div className="flex flex-wrap items-center gap-2">
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-bold', late ? 'text-red-700' : due ? 'text-foreground' : 'text-muted-foreground')}>
      <CalendarDays size={15} aria-hidden="true" />{due ? dueLabel(due, today) : 'No due date'}
    </span>
    {due && withStage ? <span className="text-xs text-muted-foreground">when the stage ends</span> : null}
    {editable ? <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => { setDraft(due && !withStage ? due : addDays(today, 7)); setEditing(true) }}>
      {due ? 'Change' : 'Set a due date'}
    </Button> : null}
  </div>
  return <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); if (draft) void save(draft) }}>
    <label className="sr-only" htmlFor={`due-${column.template_key}`}>Due date</label>
    <input id={`due-${column.template_key}`} type="date" value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus
      className="h-8 rounded-lg border border-input bg-background px-2 text-sm" />
    <Button type="submit" size="sm" disabled={saving || !draft}>{saving ? <Loader2 size={14} className="animate-spin" /> : null}Save</Button>
    {column.due_set ? <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => void save(null)}>Clear</Button> : null}
    <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button>
  </form>
}
