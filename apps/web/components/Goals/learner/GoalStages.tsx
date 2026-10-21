'use client'

import React from 'react'
import { useSWRConfig } from 'swr'
import { AlertTriangle, ArrowRight, BookOpen, CalendarDays, Flag, Loader2, Lock, LockOpen, MoreVertical, PartyPopper, Sparkles, Trophy } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import EditSheet from '@components/Goals/edit/EditSheet'
import { dateValue } from '@components/Goals/edit/stepDrafts'
import { getUriWithOrg } from '@services/config/config'
import { goalsApi, goalUrl, isGoalsKey } from '@services/goals/goals'
import { goalLifecycleApi } from '@services/goals/lifecycle'
import { can, type Goal, type Stage } from '@services/goals/types'
import { cn } from '@/lib/utils'
import { shortDate } from '../path/stepText'
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
 * The goal's last section, after its stages: one locked step, Complete, that unlocks when every
 * step is done. On a learner's own goal it's where they claim it (or finish early, from its
 * menu); a goal handed to them finishes by itself. Its date is the goal's target.
 */
export function FinishSection({ goal, token, color, orgslug, badge }: { goal: Goal; token?: string; color: string; orgslug: string; badge?: { name?: string } | null }) {
  const { mutate } = useSWRConfig()
  const [sheet, setSheet] = React.useState<'finish' | 'date' | null>(null)
  const [reached, setReached] = React.useState<Goal['finish']['reached'] | null>(null)
  const [said, setSaid] = React.useState('')
  const [target, setTarget] = React.useState(dateValue(goal.target_date))
  const [busy, setBusy] = React.useState(false)
  const { busy: saving, run } = useGoalMutation(goal.goal_uuid)
  const total = goal.progress.total
  const left = total - goal.progress.done
  if (!total && goal.ownership !== 'personal') return null
  const finished = goal.status === 'finished'
  const unlocked = total > 0 && left === 0
  const claimable = goal.ownership === 'personal' && can(goal, 'edit_plan_details') && goal.status === 'active'
  const dated = can(goal, 'edit_schedule') && goal.status === 'active'
  const when = finished ? `Finished ${shortDate(goal.finished_at)}` : goal.target_date ? `By ${shortDate(goal.target_date)}` : ''
  const finish = async () => {
    setBusy(true)
    try {
      await goalLifecycleApi.finish(goal.goal_uuid, token, { reached, what_happened: said })
      await mutate(goalUrl(goal.goal_uuid))
      await mutate((key) => isGoalsKey(key) && key !== goalUrl(goal.goal_uuid))
      setSheet(null)
      toast.success('Goal finished')
    } catch (error: any) {
      toast.error(error?.message || 'Could not finish this goal')
    } finally {
      setBusy(false)
    }
  }
  const saveDate = async () => {
    try { await run(() => goalsApi.update(goal.goal_uuid, { target_date: target || null }, token)); setSheet(null) } catch { /* toast shown */ }
  }
  const Mark = finished ? Trophy : unlocked ? LockOpen : Lock
  return <section aria-label="Finish" className="relative overflow-hidden rounded-3xl bg-[var(--plan-face)] px-5 py-5 text-[var(--plan-face-ink)] shadow-[0_6px_0_var(--plan-edge)] sm:px-7">
    {unlocked && !finished ? <Sparkles aria-hidden="true" size={120} className="pointer-events-none absolute -right-6 -top-6 opacity-15 motion-safe:animate-pulse" /> : null}
    <div className="relative flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-xl font-extrabold tracking-tight">Finish</h2>
        {when ? <p className="text-sm font-semibold opacity-75">{when}</p> : null}
      </div>
      {dated || (claimable && !unlocked) ? <DropdownMenu>
        <DropdownMenuTrigger asChild><button type="button" aria-label="More for Finish" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition hover:bg-black/10 data-[state=open]:bg-black/10"><MoreVertical size={16} /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          {dated ? <DropdownMenuItem onSelect={() => { setTarget(dateValue(goal.target_date)); setSheet('date') }}><CalendarDays size={14} className="mr-2" />{goal.target_date ? 'Change the date' : 'Set a date'}</DropdownMenuItem> : null}
          {claimable && !unlocked ? <DropdownMenuItem onSelect={() => setSheet('finish')}><Flag size={14} className="mr-2" />Finish early</DropdownMenuItem> : null}
        </DropdownMenuContent>
      </DropdownMenu> : null}
    </div>
    <div className={cn('relative mt-4 flex flex-wrap items-center gap-4 rounded-2xl p-4 transition', unlocked && !finished ? 'bg-[var(--plan-face-ink)] text-[var(--plan-face)] shadow-[0_4px_0_rgb(0_0_0/0.25)]' : 'bg-black/10')}>
      <span aria-hidden="true" className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl', unlocked && !finished ? 'bg-[var(--plan-face)] text-[var(--plan-face-ink)] motion-safe:animate-bounce' : 'bg-black/15')}><Mark size={26} /></span>
      <div className="min-w-0 flex-1 basis-40">
        <p className="font-extrabold">{finished ? 'Victory claimed' : unlocked ? 'Unlocked. Claim your victory!' : 'Locked'}</p>
        <p className="text-sm opacity-80">{finished
          ? goal.ownership === 'personal' ? 'Your story is ready.' : badge?.name ? `You earned the ${badge.name} badge.` : 'Every step is done.'
          : unlocked ? goal.ownership === 'personal' ? 'Every step is done. Say how it went.' : 'Every step is done.'
            : total ? `${left} step${left === 1 ? '' : 's'} to go to unlock it.` : 'Add steps, and finishing them unlocks it.'}</p>
      </div>
      {finished && goal.ownership === 'personal' ? <a href={getUriWithOrg(orgslug, `/plans/${encodeURIComponent(goal.goal_uuid)}/story`)} className="flex min-h-10 items-center gap-2 rounded-xl bg-[var(--plan-face-ink)] px-4 text-sm font-extrabold text-[var(--plan-face)]"><BookOpen size={15} aria-hidden="true" />Watch your story</a>
        : finished && badge ? <a href={getUriWithOrg(orgslug, '/portfolio/badges')} className="flex min-h-10 items-center gap-2 rounded-xl bg-[var(--plan-face-ink)] px-4 text-sm font-extrabold text-[var(--plan-face)]">View badges</a>
          : claimable ? <button type="button" disabled={!unlocked} onClick={() => setSheet('finish')}
            className={cn('flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-extrabold transition sm:w-auto', unlocked ? 'bg-[var(--plan-face)] text-[var(--plan-face-ink)] shadow-[0_4px_0_var(--plan-edge)] hover:brightness-105 active:translate-y-0.5 active:shadow-none' : 'cursor-not-allowed bg-black/10 opacity-60')}>
            {unlocked ? <PartyPopper size={16} aria-hidden="true" /> : <Lock size={15} aria-hidden="true" />}Claim victory</button> : null}
    </div>
    {sheet === 'finish' ? <EditSheet open onOpenChange={(open) => { if (!open) setSheet(null) }} color={color} title={unlocked ? 'Claim your victory' : 'Finish early?'}
      description={left > 0 ? `${left} step${left === 1 ? '' : 's'} ${left === 1 ? 'isn’t' : 'aren’t'} done. That’s fine; you can reopen the goal later.` : undefined}
      footer={<><Button type="button" variant="ghost" disabled={busy} onClick={() => setSheet(null)}>Not yet</Button>
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
    {sheet === 'date' ? <EditSheet open onOpenChange={(open) => { if (!open) setSheet(null) }} color={color} title="Finish date" description="When you want to get there. The last stage runs until then."
      footer={<><Button type="button" variant="ghost" disabled={saving} onClick={() => setSheet(null)}>Cancel</Button>
        <Button type="button" variant="plan" disabled={saving} onClick={() => void saveDate()}>{saving ? <Loader2 size={14} className="animate-spin" /> : null}Save</Button></>}>
      <div className="flex flex-col gap-1"><Label htmlFor="goal-target">Date <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Input id="goal-target" type="date" value={target} onChange={(event) => setTarget(event.target.value)} className="sm:w-56" /></div>
    </EditSheet> : null}
  </section>
}
