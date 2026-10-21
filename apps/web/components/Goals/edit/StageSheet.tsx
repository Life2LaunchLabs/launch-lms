'use client'

import React from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { goalsApi } from '@services/goals/goals'
import { addDays } from '@services/goals/timing'
import { can, type Goal, type Stage, type Step } from '@services/goals/types'
import { shortDate } from '../path/stepText'
import { useGoalMutation } from '../useGoalActions'
import EditSheet from './EditSheet'
import { dateValue } from './stepDrafts'

type Clash = { step: Step; clear: { start_date?: null; due_date?: null } }

/**
 * Step dates a new stage start would push outside their stage: this stage's steps that open or
 * close before it, and the stage before's steps that open or close after it (that stage now
 * ends the day before).
 */
function clashesWith(goal: Goal, stage: Stage, start: string): Clash[] {
  if (!start) return []
  const index = goal.stages.findIndex((item) => item.stage_uuid === stage.stage_uuid)
  const before = index > 0 ? goal.stages[index - 1] : null
  const ends = addDays(start, -1)
  // eslint-disable-next-line no-unused-vars
  const outside = (step: Step, test: (day: string) => boolean): Clash | null => {
    const clear = {
      ...(step.start_date && test(dateValue(step.start_date)) ? { start_date: null } : {}),
      ...(step.due_date && test(dateValue(step.due_date)) ? { due_date: null } : {}),
    }
    return Object.keys(clear).length ? { step, clear } : null
  }
  return [
    ...stage.steps.map((step) => outside(step, (day) => day < start)),
    ...(before?.steps || []).map((step) => outside(step, (day) => day > ends)),
  ].filter((item): item is Clash => Boolean(item))
}

/**
 * A stage's name and, if wanted, when it starts. A stage has no end: it runs until the next one
 * starts. A start that would leave step dates outside their stage asks which should move.
 */
export default function StageSheet({ goal, stage, token, color, onClose }: { goal: Goal; stage?: Stage; token?: string; color: string; onClose: () => void }) {
  const [title, setTitle] = React.useState(stage?.title || '')
  const [start, setStart] = React.useState(dateValue(stage?.start_date))
  const [clashes, setClashes] = React.useState<Clash[] | null>(null)
  const { busy, run } = useGoalMutation(goal.goal_uuid)
  const canName = can(goal, 'edit_structure')
  const canSchedule = can(goal, 'edit_schedule')
  const save = async (moveSteps = false) => {
    const name = title.trim()
    if (!name) return
    const startChanged = canSchedule && (start || null) !== (dateValue(stage?.start_date) || null)
    if (stage && startChanged && !moveSteps) {
      const found = clashesWith(goal, stage, start)
      if (found.length) { setClashes(found); return }
    }
    try {
      if (!stage) {
        const created = await run(() => goalsApi.addStage(goal.goal_uuid, { title: name }, token)) as Goal
        const added = created?.stages?.[created.stages.length - 1]
        if (added && start && canSchedule) await run(() => goalsApi.updateStage(goal.goal_uuid, added.stage_uuid, { start_date: start }, token))
      } else {
        for (const clash of moveSteps ? clashes || [] : []) await run(() => goalsApi.updateStep(goal.goal_uuid, clash.step.step_uuid, clash.clear, token))
        const changes = {
          ...(canName && name !== stage.title ? { title: name } : {}),
          ...(startChanged ? { start_date: start || null } : {}),
        }
        if (Object.keys(changes).length) await run(() => goalsApi.updateStage(goal.goal_uuid, stage.stage_uuid, changes, token))
      }
      onClose()
    } catch { /* toast shown */ }
  }
  if (clashes) {
    return <EditSheet open onOpenChange={(open) => { if (!open) onClose() }} color={color} title="Which should move?"
      description={`Starting ${stage?.title} ${shortDate(start)} leaves ${clashes.length === 1 ? 'a step' : `${clashes.length} steps`} outside ${clashes.length === 1 ? 'its' : 'their'} stage.`}
      footer={<><Button type="button" variant="ghost" disabled={busy} onClick={() => setClashes(null)}>Keep the stage as it was</Button>
        <Button type="button" variant="plan" disabled={busy} onClick={() => void save(true)}>{busy ? <Loader2 size={14} className="animate-spin" /> : null}Move the steps</Button></>}>
      <ul className="flex flex-col gap-1 text-sm">
        {clashes.map((clash) => <li key={clash.step.step_uuid} className="rounded-xl bg-muted px-3 py-2"><span className="font-bold">{clash.step.title}</span>
          <span className="block text-xs text-muted-foreground">{[clash.clear.start_date === null ? `opens ${shortDate(clash.step.start_date)}` : '', clash.clear.due_date === null ? `closes ${shortDate(clash.step.due_date)}` : ''].filter(Boolean).join(', ')}; it would go with its stage instead</span></li>)}
      </ul>
    </EditSheet>
  }
  return <EditSheet open onOpenChange={(open) => { if (!open) onClose() }} color={color} title={stage ? 'Edit stage' : 'New stage'}
    footer={<><Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
      <Button type="button" variant="plan" disabled={busy || !title.trim()} onClick={() => void save()}>{busy ? <Loader2 size={14} className="animate-spin" /> : null}{stage ? 'Save' : 'Add stage'}</Button></>}>
    <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void save() }}>
      <div className="flex flex-col gap-1"><Label htmlFor="stage-title">Name</Label>
        <Input id="stage-title" value={title} disabled={!canName} autoFocus={!stage} onChange={(event) => setTitle(event.target.value)} placeholder="Research, Apply, Decide…" />
      </div>
      {canSchedule ? <div className="flex flex-col gap-1">
        <Label htmlFor="stage-start">Starts <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Input id="stage-start" type="date" value={start} onChange={(event) => setStart(event.target.value)} className="sm:w-56" />
        <p className="text-xs text-muted-foreground">It runs until the next stage starts. Without a date, it starts when you move on to it.</p>
      </div> : null}
      <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
    </form>
  </EditSheet>
}
