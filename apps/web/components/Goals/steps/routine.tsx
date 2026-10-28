'use client'

import React from 'react'
import { Flame, Repeat } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Step, StepResult } from '@services/goals/types'
import { actionText, cadenceText, localToday, progressText } from '@services/goals/routine'
import { shortDate } from '../path/stepText'
import type { StepCardProps, StepDefinition } from './registry'
import { Feedback, FinishControls, StepIntro } from './shared'
import { RoutineActionInput } from './routineAction'
import { RoutineChart, RoutineSparkline } from './routineChart'
import { cleanRoutine, DEFAULT_ROUTINE, RoutineConfigPanel, routineConfig, routineProblem } from './routineEditor'

type RoutineResult = Extract<StepResult, { kind: 'routine' }>

const resultOf = (step: Step<'routine'>): RoutineResult | null => (step.result?.kind === 'routine' ? step.result : null)

/** A time's name: today, since the day the current one came round, or the day an earlier one did. */
function periodName(start: string, current: string) {
  if (start === localToday()) return 'Today'
  return start === current ? `Since ${shortDate(start)}` : shortDate(start)
}

function Progress({ done, wanted }: { done: number; wanted: number }) {
  return <div className="h-2 overflow-hidden rounded-full bg-border" aria-hidden="true">
    <div className="h-full rounded-full bg-[var(--plan-face)] transition-[width]" style={{ width: `${Math.min(100, (done / Math.max(1, wanted)) * 100)}%` }} />
  </div>
}

function RoutineRow({ step }: { step: Step<'routine'> }) {
  const result = resultOf(step)
  if (!result || result.total === 0 || result.periods.length < 2) return null
  return <div className="mt-1.5"><RoutineSparkline periods={result.periods} /></div>
}

function RoutineCard({ step, actions, canWork, staff, compact }: StepCardProps<'routine'>) {
  const config = routineConfig(step.config)
  const result = resultOf(step)
  const current = result?.current || localToday()
  const [picked, setPicked] = React.useState<string | null>(null)
  const selected = compact || !result?.periods.some((period) => period.start === picked) ? current : picked!
  const period = result?.periods.find((item) => item.start === selected)
  const open = canWork && !step.locked && step.status !== 'completed' && step.status !== 'excused'
  const done = period?.done ?? 0
  const wanted = period?.wanted ?? 1
  const progress = <div className="flex flex-col gap-1.5">
    <p className="flex items-baseline justify-between gap-2 text-sm font-bold">
      <span>{actionText(config.action)} <span className="font-semibold text-muted-foreground">· {periodName(selected, current)}</span></span>
      <span className={cn('shrink-0 text-xs', done >= wanted ? 'text-[var(--plan-accent)]' : 'text-muted-foreground')}>{progressText(config.action, done, wanted)}</span>
    </p>
    {config.action.kind === 'list' ? <Progress done={done} wanted={wanted} /> : null}
  </div>
  const input = <RoutineActionInput key={selected} step={step} action={config.action} period={selected} current={current} actions={actions} open={open} />

  if (compact) return <div className="flex flex-col gap-2">{progress}{input}</div>
  return <div className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--plan-accent)]"><Repeat size={14} aria-hidden="true" />{cadenceText(config)}</span>
      {result && result.streak >= 2 ? <span className="inline-flex items-center gap-1 text-xs font-extrabold text-muted-foreground"><Flame size={13} aria-hidden="true" />{result.streak} in a row</span> : null}
    </div>
    <StepIntro step={step} />
    <Feedback step={step} />
    {result && result.periods.length > 1 ? <RoutineChart action={config.action} periods={result.periods} current={current} selected={selected} onSelect={setPicked} /> : null}
    {progress}
    {input}
    {selected !== current ? <button type="button" onClick={() => setPicked(null)} className="self-start text-xs font-bold text-[var(--plan-accent)] underline-offset-2 hover:underline">Back to now</button> : null}
    <FinishControls step={step} actions={actions} canWork={canWork} staff={staff} finishLabel="End this routine" />
  </div>
}

export const routine: StepDefinition<'routine'> = {
  type: 'routine',
  label: 'Routine',
  color: '#5E9A14',
  hint: 'A habit logged every day or week, with a chart.',
  example: 'Log what you spend each day',
  icon: Repeat,
  statusLine: (step) => {
    const result = resultOf(step)
    const config = routineConfig(step.config)
    return result ? `${cadenceText(config)} · ${progressText(config.action, result.done, result.wanted)}` : cadenceText(config)
  },
  RowResult: RoutineRow,
  CardBody: RoutineCard,
  ConfigPanel: RoutineConfigPanel,
  cleanConfig: cleanRoutine,
  configProblem: (config) => routineProblem(routineConfig(config)),
  defaultConfig: () => ({ ...DEFAULT_ROUTINE, action: { ...DEFAULT_ROUTINE.action } }),
}
