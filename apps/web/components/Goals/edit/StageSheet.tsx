'use client'

import React from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { goalsApi } from '@services/goals/goals'
import { can, type Goal, type Stage } from '@services/goals/types'
import { useGoalMutation } from '../useGoalActions'
import EditSheet from './EditSheet'
import { dateValue } from './stepDrafts'

/** A stage's name and, if wanted, when it starts and ends. Adds a stage when there is none to edit. */
export default function StageSheet({ goal, stage, token, color, onClose }: { goal: Goal; stage?: Stage; token?: string; color: string; onClose: () => void }) {
  const [title, setTitle] = React.useState(stage?.title || '')
  const [start, setStart] = React.useState(dateValue(stage?.start_date))
  const [end, setEnd] = React.useState(dateValue(stage?.due_date))
  const { busy, run } = useGoalMutation(goal.goal_uuid)
  const canName = can(goal, 'edit_structure')
  const canSchedule = can(goal, 'edit_schedule')
  const save = async () => {
    const name = title.trim()
    if (!name) return
    const dates = canSchedule ? { start_date: start || null, due_date: end || null } : {}
    try {
      if (!stage) {
        const created = await run(() => goalsApi.addStage(goal.goal_uuid, { title: name }, token)) as Goal
        const added = created?.stages?.[created.stages.length - 1]
        if (added && (start || end) && canSchedule) await run(() => goalsApi.updateStage(goal.goal_uuid, added.stage_uuid, dates, token))
      } else {
        const changes = {
          ...(canName && name !== stage.title ? { title: name } : {}),
          ...(canSchedule && (start || null) !== (dateValue(stage.start_date) || null) ? { start_date: start || null } : {}),
          ...(canSchedule && (end || null) !== (dateValue(stage.due_date) || null) ? { due_date: end || null } : {}),
        }
        if (Object.keys(changes).length) await run(() => goalsApi.updateStage(goal.goal_uuid, stage.stage_uuid, changes, token))
      }
      onClose()
    } catch { /* toast shown */ }
  }
  return <EditSheet open onOpenChange={(open) => { if (!open) onClose() }} color={color} title={stage ? 'Edit stage' : 'New stage'}
    footer={<><Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
      <Button type="button" variant="plan" disabled={busy || !title.trim()} onClick={() => void save()}>{busy ? <Loader2 size={14} className="animate-spin" /> : null}{stage ? 'Save' : 'Add stage'}</Button></>}>
    <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void save() }}>
      <div className="flex flex-col gap-1"><Label htmlFor="stage-title">Name</Label>
        <Input id="stage-title" value={title} disabled={!canName} autoFocus={!stage} onChange={(event) => setTitle(event.target.value)} placeholder="Research, Apply, Decide…" />
      </div>
      {canSchedule ? <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1"><Label htmlFor="stage-start">Starts <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="stage-start" type="date" value={start} max={end || undefined} onChange={(event) => setStart(event.target.value)} /></div>
        <div className="flex flex-col gap-1"><Label htmlFor="stage-end">Ends <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="stage-end" type="date" value={end} min={start || undefined} onChange={(event) => setEnd(event.target.value)} /></div>
        <p className="text-xs text-muted-foreground sm:col-span-2">Without dates, the stage starts when you move on to it.</p>
      </div> : null}
      <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
    </form>
  </EditSheet>
}
