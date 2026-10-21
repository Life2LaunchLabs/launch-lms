'use client'

import React from 'react'
import { CalendarDays, Check, ChevronDown, ChevronLeft, Link2, Loader2, Search } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import { goalsApi } from '@services/goals/goals'
import { afterChoices, stageBounds, stageClash, type StageClash } from '@services/goals/timing'
import { can, type Goal } from '@services/goals/types'
import { cn } from '@/lib/utils'
import { shortDate } from '../path/stepText'
import { useGoalMutation } from '../useGoalActions'
import type { StepDraft } from './StepEditor'

type Side = 'open' | 'close'
const PLAN_VARS = ['--plan-face', '--plan-edge', '--plan-face-ink', '--plan-accent']
type View = 'menu' | 'date' | 'after' | 'clash'

type TimingProps = {
  goal: Goal
  stageUuid: string | null
  /** The step being edited; none while it's being added. */
  stepUuid?: string
  value: StepDraft
  // eslint-disable-next-line no-unused-vars
  set: (patch: Partial<StepDraft>) => void
  token?: string
}

/**
 * When a step opens and closes, as two chips. Each starts at its stage's edge, which is also
 * the outer limit: a date outside the stage asks whether the step or the stage should move.
 * Open can instead wait on another step; the ones it can't wait on show why.
 */
export default function StepTiming(props: TimingProps) {
  return <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Timing">
    <TimingChip side="open" {...props} />
    <TimingChip side="close" {...props} />
  </div>
}

function TimingChip({ side, goal, stageUuid, stepUuid, value, set, token }: TimingProps & { side: Side }) {
  const [open, setOpen] = React.useState(false)
  const [view, setView] = React.useState<View>('menu')
  const [date, setDate] = React.useState('')
  const [clash, setClash] = React.useState<StageClash | null>(null)
  const [query, setQuery] = React.useState('')
  const [shade, setShade] = React.useState<React.CSSProperties>({})
  const trigger = React.useRef<HTMLButtonElement>(null)
  const { busy, run } = useGoalMutation(goal.goal_uuid)
  const stage = goal.stages.find((item) => item.stage_uuid === stageUuid) || null
  const bounds = stageBounds(goal, stage)
  const own = side === 'open' ? value.start_date : value.due_date
  const waitsFor = side === 'open' && value.after.length ? afterChoices(goal, stageUuid, stepUuid).find((item) => value.after.includes(item.step.step_uuid)) : undefined
  const label = side === 'open'
    ? waitsFor ? `After ${waitsFor.step.title}` : own ? shortDate(own) : stage ? 'Start of stage' : 'Any time'
    : own ? shortDate(own) : stage ? 'End of stage' : goal.target_date ? 'End of goal' : 'No close'
  const edge = side === 'open' ? bounds.start : bounds.end
  const setOwn = (day: string | null) => set(side === 'open' ? { start_date: day, after: [] } : { due_date: day })
  const reset = (next: boolean) => {
    // The menu opens in a portal, outside the goal's colours, so it takes them from the chip.
    if (next && trigger.current) {
      const style = getComputedStyle(trigger.current)
      setShade(Object.fromEntries(PLAN_VARS.map((name) => [name, style.getPropertyValue(name)])) as React.CSSProperties)
    }
    setOpen(next)
    if (!next) { setView('menu'); setClash(null); setQuery('') }
  }
  const close = () => reset(false)

  const pick = () => {
    if (!date) return
    const found = stageClash(goal, stage, date)
    if (found) { setClash(found); setView('clash'); return }
    setOwn(date)
    close()
  }
  const moveStage = async ({ move }: StageClash) => {
    try {
      await run(() => move.kind === 'stage'
        ? goalsApi.updateStage(goal.goal_uuid, move.stage.stage_uuid, { start_date: move.start_date }, token)
        : goalsApi.update(goal.goal_uuid, { target_date: move.target_date }, token))
      setOwn(date)
      close()
    } catch { /* toast shown */ }
  }
  const other = side === 'open' ? value.due_date : value.start_date
  const backwards = Boolean(date && other && (side === 'open' ? date > other : date < other))
  const canMoveStage = can(goal, 'edit_schedule')

  return <Popover open={open} onOpenChange={reset}>
    <PopoverTrigger asChild>
      <button ref={trigger} type="button" aria-label={`${side === 'open' ? 'Opens' : 'Closes'}: ${label}`}
        className={cn('flex min-h-9 max-w-full items-center gap-1.5 rounded-full border-2 px-3 text-sm transition hover:border-[var(--plan-face)] data-[state=open]:border-[var(--plan-face)]',
          own || waitsFor ? 'border-[var(--plan-face)] bg-[color-mix(in_srgb,var(--plan-face)_12%,hsl(var(--card)))]' : 'border-border')}>
        <span className="font-semibold text-muted-foreground">{side === 'open' ? 'Opens' : 'Closes'}</span>
        <span className="truncate font-bold">{label}</span>
        <ChevronDown size={14} aria-hidden="true" className="shrink-0 text-muted-foreground" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-80 p-2" style={shade}>
      {view === 'menu' ? <div role="menu" className="flex flex-col">
        <Option on={!own && !waitsFor} title={side === 'open' ? (stage ? 'Start of stage' : 'Any time') : stage ? 'End of stage' : 'With the goal'}
          hint={edge ? shortDate(edge) : side === 'open' ? 'When the goal moves on to this stage' : 'When the next stage starts'}
          onClick={() => { set(side === 'open' ? { start_date: null, after: [] } : { due_date: null }); close() }} />
        <Option on={Boolean(own)} title="On a date…" hint={own ? shortDate(own) : undefined} icon={<CalendarDays size={15} />} onClick={() => { setDate(own || edge || ''); setView('date') }} />
        {side === 'open' ? <Option on={Boolean(waitsFor)} title="After another step…" hint={waitsFor?.step.title} icon={<Link2 size={15} />} onClick={() => setView('after')} /> : null}
      </div> : null}

      {view === 'date' ? <form className="flex flex-col gap-2 p-1" onSubmit={(event) => { event.preventDefault(); pick() }}>
        <Back onClick={() => setView('menu')}>{side === 'open' ? 'Opens on' : 'Closes on'}</Back>
        <Input type="date" autoFocus aria-label={side === 'open' ? 'Open date' : 'Close date'} value={date} onChange={(event) => setDate(event.target.value)} />
        {backwards ? <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">{side === 'open' ? 'That’s after it closes.' : 'That’s before it opens.'}</p> : null}
        <Button type="submit" variant="plan" size="sm" disabled={!date || backwards}>Set date</Button>
      </form> : null}

      {view === 'clash' && clash ? <div className="flex flex-col gap-2 p-1">
        <p className="text-sm font-bold">{clash.side === 'before' ? `That’s before ${stage?.title} starts (${shortDate(clash.stepDate)}).` : `That’s after ${stage?.title} ends (${shortDate(clash.stepDate)}).`}</p>
        <p className="text-sm text-muted-foreground">Which should move?</p>
        <Button type="button" variant="surface" size="sm" className="justify-start" disabled={busy} onClick={() => { setOwn(clash.stepDate === edge ? null : clash.stepDate); close() }}>
          Keep the step in its stage ({shortDate(clash.stepDate)})
        </Button>
        {canMoveStage ? <Button type="button" variant="plan" size="sm" className="justify-start" disabled={busy} onClick={() => void moveStage(clash)}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : null}
          {clash.move.kind === 'stage' ? `Start ${clash.move.stage.title} ${shortDate(clash.move.start_date)}` : `Move the goal’s target to ${shortDate(clash.move.target_date)}`}
        </Button> : null}
        <Button type="button" variant="ghost" size="sm" onClick={() => setView('date')}>Pick another date</Button>
      </div> : null}

      {view === 'after' ? <AfterList goal={goal} stageUuid={stageUuid} stepUuid={stepUuid} closes={value.due_date} query={query} setQuery={setQuery} chosen={value.after}
        onBack={() => setView('menu')} onPick={(uuid) => { set({ after: [uuid], start_date: null }); close() }} /> : null}
    </PopoverContent>
  </Popover>
}

function Option({ on, title, hint, icon, onClick }: { on: boolean; title: string; hint?: string; icon?: React.ReactNode; onClick: () => void }) {
  return <button type="button" role="menuitemradio" aria-checked={on} onClick={onClick} className="flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted">
    <span aria-hidden="true" className="flex w-4 shrink-0 justify-center text-[var(--plan-accent)]">{on ? <Check size={15} /> : <span className="text-muted-foreground">{icon}</span>}</span>
    <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{title}</span>{hint ? <span className="block truncate text-xs text-muted-foreground">{hint}</span> : null}</span>
  </button>
}

function Back({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="flex items-center gap-1 self-start rounded-md text-sm font-bold text-muted-foreground hover:text-foreground"><ChevronLeft size={15} aria-hidden="true" />{children}</button>
}

type AfterListProps = {
  goal: Goal; stageUuid: string | null; stepUuid?: string; closes?: string | null; query: string; chosen: string[]
  // eslint-disable-next-line no-unused-vars
  setQuery: (value: string) => void
  // eslint-disable-next-line no-unused-vars
  onPick: (stepUuid: string) => void
  onBack: () => void
}

/** The other steps, searchable; the ones this step can't wait on are greyed with the reason. */
function AfterList({ goal, stageUuid, stepUuid, closes, query, chosen, setQuery, onPick, onBack }: AfterListProps) {
  const needle = query.trim().toLowerCase()
  const choices = afterChoices(goal, stageUuid, stepUuid, closes).filter((item) => !needle || item.step.title.toLowerCase().includes(needle))
  return <div className="flex flex-col gap-2 p-1">
    <Back onClick={onBack}>Opens after</Back>
    <div className="relative"><Search size={14} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a step" aria-label="Find a step" className="pl-8" />
    </div>
    <ul role="listbox" aria-label="Steps" className="flex max-h-64 flex-col overflow-y-auto">
      {choices.length ? choices.map(({ step, stage, reason }) => <li key={step.step_uuid}>
        <button type="button" role="option" aria-selected={chosen.includes(step.step_uuid)} aria-disabled={Boolean(reason)} disabled={Boolean(reason)} onClick={() => onPick(step.step_uuid)}
          className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left enabled:hover:bg-muted disabled:cursor-not-allowed">
          <span className="min-w-0 flex-1">
            <span className={cn('block truncate text-sm font-bold', reason && 'text-muted-foreground/70')}>{step.title || 'Untitled step'}</span>
            <span className="block truncate text-xs text-muted-foreground">{reason || stage?.title || 'More steps'}</span>
          </span>
          {chosen.includes(step.step_uuid) ? <Check size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--plan-accent)]" /> : null}
        </button>
      </li>) : <li className="px-2 py-3 text-sm text-muted-foreground">No steps match.</li>}
    </ul>
  </div>
}
