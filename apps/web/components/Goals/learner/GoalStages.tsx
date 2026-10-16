'use client'

import React from 'react'
import { useSWRConfig } from 'swr'
import { AlertTriangle, ArrowRight, BookOpen, Flag, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@components/ui/button'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import EditSheet from '@components/Goals/edit/EditSheet'
import { getUriWithOrg } from '@services/config/config'
import { goalsApi, goalUrl, isGoalsKey } from '@services/goals/goals'
import { goalLifecycleApi } from '@services/goals/lifecycle'
import { can, type Goal, type Stage } from '@services/goals/types'
import { cn } from '@/lib/utils'
import { useGoalMutation } from '../useGoalActions'

/** Whoever works or schedules the goal can move it between stages. */
export const canMoveStages = (goal: Goal) => goal.status === 'active' && (can(goal, 'update_progress') || can(goal, 'edit_schedule'))

const unfinished = (stage: Stage) => stage.steps.filter((step) => step.state !== 'done').length

/** Asking before the goal moves to another stage, since moving is the only way it does besides a date. */
export function useMoveToStage(goal: Goal, token?: string, color = '') {
  const [stage, setStage] = React.useState<Stage | null>(null)
  const { busy, run } = useGoalMutation(goal.goal_uuid)
  const current = goal.stages.find((item) => item.stage_uuid === goal.current_stage_uuid)
  const left = current ? unfinished(current) : 0
  const back = Boolean(stage && current && stage.position < current.position)
  const move = async () => {
    if (!stage) return
    try { await run(() => goalsApi.setCurrentStage(goal.goal_uuid, stage.stage_uuid, token), `On to ${stage.title}`); setStage(null) } catch { /* toast shown */ }
  }
  const sheet = stage ? <EditSheet open onOpenChange={(open) => { if (!open) setStage(null) }} color={color} title={back ? `Go back to ${stage.title}?` : `Move on to ${stage.title}?`}
    description={current && left && !back ? `${left} step${left === 1 ? '' : 's'} in ${current.title} ${left === 1 ? 'isn’t' : 'aren’t'} done. ${left === 1 ? 'It stays' : 'They stay'} open, so you can come back to ${left === 1 ? 'it' : 'them'}.` : `${stage.title} becomes the stage you’re on.`}
    footer={<><Button type="button" variant="ghost" disabled={busy} onClick={() => setStage(null)}>Not yet</Button>
      <Button type="button" variant="plan" disabled={busy} onClick={() => void move()}>{busy ? <Loader2 size={14} className="animate-spin" /> : null}{back ? 'Go back' : 'Move on'}</Button></>} /> : null
  return { ask: setStage, sheet }
}

/** Under the stage the goal is on, once its steps are done: the way on to the next one. */
export function MoveOnLine({ stage, next, onMove }: { stage: Stage; next?: Stage; onMove: () => void }) {
  if (!next || !stage.steps.length || unfinished(stage)) return null
  return <div className="ml-[72px] flex flex-wrap items-center gap-3 rounded-2xl bg-[color-mix(in_srgb,var(--plan-face)_12%,hsl(var(--card)))] px-4 py-3">
    <p className="min-w-0 flex-1 text-sm font-bold">{stage.title} is done.</p>
    <Button type="button" variant="plan" size="sm" onClick={onMove}>Move on to {next.title}<ArrowRight size={14} aria-hidden="true" /></Button>
  </div>
}

/** A quiet note where the plan's dates can't all come true, on the stage or step it's about. */
export function ScheduleNotes({ goal, stageUuid, stepUuid, className }: { goal: Goal; stageUuid?: string; stepUuid?: string; className?: string }) {
  const notes = (goal.schedule_warnings || []).filter((item) => (stageUuid && item.stage_uuid === stageUuid) || (stepUuid && item.step_uuid === stepUuid))
  if (!notes.length || !(can(goal, 'edit_schedule') || can(goal, 'edit_structure'))) return null
  return <ul className={cn('flex flex-col gap-1', className)}>
    {notes.map((note) => <li key={`${note.kind}-${note.message}`} className="flex items-start gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
      <AlertTriangle size={13} aria-hidden="true" className="mt-px shrink-0" />{note.message}
    </li>)}
  </ul>
}

const REACHED: Array<{ value: NonNullable<Goal['finish']['reached']>; label: string }> = [
  { value: 'yes', label: 'Yes' },
  { value: 'partly', label: 'Partly' },
  { value: 'changed', label: 'I changed direction' },
]

/**
 * The last step on a learner's own goal: saying it's done, and how it went. A goal handed to
 * them finishes by itself when its steps are done, so it has no such step.
 */
export function FinishStep({ goal, token, color, orgslug }: { goal: Goal; token?: string; color: string; orgslug: string }) {
  const { mutate } = useSWRConfig()
  const [open, setOpen] = React.useState(false)
  const [reached, setReached] = React.useState<Goal['finish']['reached'] | null>(null)
  const [said, setSaid] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  if (goal.ownership !== 'personal' || !can(goal, 'edit_plan_details') || !['active', 'finished'].includes(goal.status)) return null
  const finished = goal.status === 'finished'
  const all = goal.progress.total > 0 && goal.progress.done === goal.progress.total
  const left = goal.progress.total - goal.progress.done
  const finish = async () => {
    setBusy(true)
    try {
      await goalLifecycleApi.finish(goal.goal_uuid, token, { reached, what_happened: said })
      await mutate(goalUrl(goal.goal_uuid))
      await mutate((key) => isGoalsKey(key) && key !== goalUrl(goal.goal_uuid))
      setOpen(false)
      toast.success('Goal finished')
    } catch (error: any) {
      toast.error(error?.message || 'Could not finish this goal')
    } finally {
      setBusy(false)
    }
  }
  return <section aria-label="Finish" className="flex gap-4">
    <span aria-hidden="true" className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-full', finished || all ? 'bg-[var(--plan-face)] text-[var(--plan-face-ink)] shadow-[0_4px_0_var(--plan-edge)]' : 'bg-muted text-muted-foreground')}><Flag size={22} /></span>
    <div className={cn('flex min-w-0 flex-1 flex-col gap-3 rounded-2xl border-2 p-4', all && !finished ? 'border-[var(--plan-face)]' : 'border-border')}>
      <div>
        <h2 className="font-extrabold">{finished ? 'Goal finished' : 'Finish your goal'}</h2>
        <p className="text-sm text-muted-foreground">{finished
          ? `You finished this on ${new Date(goal.finished_at || Date.now()).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}.`
          : all ? 'Every step is done. Say how it went, and your story comes next.' : 'Whenever you’re ready, even with steps left. Say how it went, and your story comes next.'}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {finished ? <Button variant="surface" asChild><a href={getUriWithOrg(orgslug, `/plans/${encodeURIComponent(goal.goal_uuid)}/story`)}><BookOpen size={15} aria-hidden="true" />Watch your story</a></Button>
          : <Button type="button" variant={all ? 'plan' : 'surface'} onClick={() => setOpen(true)}><Flag size={15} aria-hidden="true" />Finish goal</Button>}
      </div>
    </div>
    {open ? <EditSheet open onOpenChange={setOpen} color={color} title="Finish your goal"
      description={left > 0 ? `${left} step${left === 1 ? '' : 's'} ${left === 1 ? 'isn’t' : 'aren’t'} done. That’s fine; you can reopen the goal later.` : undefined}
      footer={<><Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Not yet</Button>
        <Button type="button" variant="plan" disabled={busy} onClick={() => void finish()}>{busy ? <Loader2 size={14} className="animate-spin" /> : null}Finish goal</Button></>}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>Did you get there?</Label>
          <div role="radiogroup" aria-label="Did you get there?" className="flex flex-wrap gap-2">
            {REACHED.map((option) => <button key={option.value} type="button" role="radio" aria-checked={reached === option.value} onClick={() => setReached(reached === option.value ? null : option.value)}
              className={cn('min-h-10 rounded-xl border-2 px-3 text-sm font-bold transition', reached === option.value ? 'border-[var(--plan-face)] bg-[color-mix(in_srgb,var(--plan-face)_15%,hsl(var(--card)))]' : 'border-border hover:border-[var(--plan-face)]')}>{option.label}</button>)}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="goal-what-happened">What happened? <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Textarea id="goal-what-happened" rows={3} value={said} maxLength={2000} onChange={(event) => setSaid(event.target.value)} placeholder="A line or two for your story" />
        </div>
      </div>
    </EditSheet> : null}
  </section>
}
