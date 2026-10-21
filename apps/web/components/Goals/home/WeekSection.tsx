'use client'

import React from 'react'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { ChevronDown, PartyPopper, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { goalsHomeApi, homeUrl, type GoalsHomePayload, type HomeItem, type HomeWeek } from '@services/goals/home'
import { HomeStepList, isDone, itemKey } from './HomeStepList'

const RANGE = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const PACES = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15]

export function range(start?: string, end?: string) {
  if (!start || !end) return ''
  const day = (value: string) => RANGE.format(new Date(`${value.slice(0, 10)}T12:00:00`))
  return `${day(start)} – ${day(end)}`
}

const firstUp = (items: HomeItem[]) => items.find((item) => item.state === 'open' || item.state === 'started' || item.state === 'retry') || items.find((item) => item.state === 'locked')

type WeekProps = {
  data: GoalsHomePayload
  orgslug: string
  token?: string
  // eslint-disable-next-line no-unused-vars
  getGoalColor: (goalUuid?: string) => string
}

/** This week, its pace and steps, then next week, the months ahead and later. */
export function Week({ data, orgslug, token, getGoalColor }: WeekProps) {
  const [selected, setSelected] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const week = data.week
  const openItems = week.items.filter((item) => !isDone(item))
  const doneItems = week.items.filter(isDone)
  const first = firstUp(openItems)
  const selectedKey = selected || (first ? itemKey(first) : '')

  const select = (item: HomeItem) => setSelected(itemKey(item) === selectedKey ? 'none' : itemKey(item))
  const goTo = (stepUuid: string) => {
    const target = [...week.items, ...data.next_week.items, ...data.months.flatMap((group) => group.items), ...data.later.flatMap((group) => group.items)].find((item) => item.step_uuid === stepUuid)
    if (target) setSelected(itemKey(target))
    document.getElementById(`step-${stepUuid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  const update = async (change: () => Promise<GoalsHomePayload>, failed: string) => {
    setBusy(true)
    try { await mutate(homeUrl(), await change(), false) } catch { toast.error(failed) } finally { setBusy(false) }
  }
  const list = (items: HomeItem[]) => <HomeStepList items={items} orgslug={orgslug} token={token} getGoalColor={getGoalColor} selectedKey={selectedKey} onSelect={select} onGoTo={goTo} />
  const groups: { key: string; label: string; sub?: string; items: HomeItem[] }[] = [
    ...(data.next_week.items.length ? [{ key: 'next', label: 'Next week', sub: range(data.next_week.start, data.next_week.end), items: data.next_week.items }] : []),
    ...data.months.map((group) => ({ key: group.key, label: group.label, items: group.items })),
    ...(data.later.length ? [{ key: 'later', label: 'Later', sub: 'Whenever you’re ready', items: data.later.flatMap((group) => group.items) }] : []),
  ]

  return <div className="flex flex-col gap-10">
    <section aria-labelledby="this-week" className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">{range(week.start, week.end)}</p>
          <h2 id="this-week" className="text-2xl font-extrabold tracking-tight">This week</h2>
        </div>
        <PaceChip done={week.done_count} pace={week.target} nextPace={week.next_target ?? week.target} planned={week.planned} onChange={(target) => void update(() => goalsHomeApi.setPace(target, token), 'Could not change your weekly pace')} />
      </div>
      <PaceBar done={week.done_count} pace={week.target} />
      {week.new_goals?.length ? <NewGoals week={week} busy={busy} onPull={(goalUuid) => void update(() => goalsHomeApi.pullInGoal(goalUuid, token), 'Could not add this goal to your week')} /> : null}
      {week.complete ? <WeekComplete week={week} busy={busy} onMore={() => void update(() => goalsHomeApi.readyForMore(token), 'Could not add more steps')} />
        : openItems.length ? list(openItems)
        : <p className="rounded-2xl bg-card px-4 py-8 text-center text-sm font-bold text-muted-foreground">Nothing planned for this week yet.</p>}
      {doneItems.length ? <details className="group/done-week">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-xl py-2 text-sm font-bold text-muted-foreground">
          {doneItems.some((item) => item.state === 'waiting') ? 'Handed in and done this week' : 'Done this week'} · {doneItems.length}
          <ChevronDown size={16} className="transition-transform group-open/done-week:rotate-180" aria-hidden="true" />
        </summary>
        {list(doneItems)}
      </details> : null}
    </section>

    {groups.map((group) => <section key={group.key} aria-label={group.label}>
      <details open={group.key === 'next' ? true : undefined} className="group/later">
        <summary className="mb-3 flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-xl py-2 focus-visible:outline focus-visible:outline-2">
          <h2 className="text-xl font-extrabold tracking-tight">{group.label}</h2>
          <span className="text-sm text-muted-foreground">{group.items.length} {group.items.length === 1 ? 'step' : 'steps'}{group.sub ? ` · ${group.sub}` : ''}</span>
          <ChevronDown size={18} className="ml-auto text-muted-foreground transition-transform group-open/later:rotate-180" aria-hidden="true" />
        </summary>
        {list(group.items)}
      </details>
    </section>)}
  </div>
}

/**
 * Steps done out of the weekly pace, which opens a menu to change it. Going past the
 * pace turns it gold. A new pace starts next week, so this week's plan holds.
 */
// eslint-disable-next-line no-unused-vars
function PaceChip({ done, pace, nextPace, planned, onChange }: { done: number; pace: number; nextPace: number; planned: boolean; onChange: (pace: number) => void }) {
  const over = done > pace
  return <div className="flex flex-col items-end gap-1">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`${done} of your ${pace} steps this week. Change pace`}
          className={cn('flex h-10 items-center gap-1.5 rounded-xl px-3 font-extrabold tabular-nums transition-[background-color,box-shadow] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
            over ? 'week-gold shadow-[0_3px_0_var(--week-gold-edge)]' : 'border-2 border-border bg-card shadow-[0_3px_0_hsl(var(--border))] hover:bg-raised')}>
          <span className="relative z-10 flex items-baseline leading-none"><span className="text-lg">{done}</span><span className="text-sm opacity-70">/{pace}</span></span>
          <ChevronDown size={15} className="relative z-10 opacity-70" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span>Change pace</span>
          <span className="text-xs font-normal text-muted-foreground">{planned ? 'Steps a week, starting next week' : 'Steps a week'}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={String(nextPace)} onValueChange={(value) => onChange(Number(value))} className="grid grid-cols-4 gap-1 p-1">
          {PACES.map((value) => <DropdownMenuRadioItem key={value} value={String(value)} className="justify-center pl-2 pr-2 font-bold tabular-nums data-[state=checked]:bg-accent [&>span:first-child]:hidden">{value}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
    {nextPace !== pace ? <span className="text-xs font-semibold text-muted-foreground">{nextPace} a week from next week</span> : null}
  </div>
}

/** Progress toward the weekly pace: green until it fills, gold once you go past it. */
function PaceBar({ done, pace }: { done: number; pace: number }) {
  const over = done > pace
  const percent = pace ? Math.min(100, Math.round((done * 100) / pace)) : 0
  return <div role="progressbar" aria-label="Weekly pace" aria-valuenow={done} aria-valuemin={0} aria-valuemax={pace} aria-valuetext={`${done} of ${pace} steps`} className="h-3 overflow-hidden rounded-full bg-muted">
    <span className={cn('block h-full rounded-full transition-[width] duration-500 ease-out', over ? 'week-gold' : 'bg-[var(--week-green)]')} style={{ width: `${percent ? Math.max(4, percent) : 0}%` }} />
  </div>
}

/** Goals started after the week was planned: they wait in Next week unless the learner pulls them in. */
// eslint-disable-next-line no-unused-vars
function NewGoals({ week, busy, onPull }: { week: HomeWeek; busy: boolean; onPull: (goalUuid: string) => void }) {
  return <ul className="flex flex-col gap-2">
    {week.new_goals.map(({ goal, steps }) => <li key={goal.goal_uuid} className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-dashed border-border px-4 py-3">
      <p className="min-w-0 flex-1 text-sm"><span className="font-bold">{goal.title}</span><span className="text-muted-foreground"> started after this week was planned.</span></p>
      <Button type="button" size="sm" variant="surface" disabled={busy} onClick={() => onPull(goal.goal_uuid)}><Plus size={15} aria-hidden="true" />Add {steps} {steps === 1 ? 'step' : 'steps'} this week</Button>
    </li>)}
  </ul>
}

/** Everything planned this week is done: celebrate, then offer more only if the learner asks. */
function WeekComplete({ week, busy, onMore }: { week: HomeWeek; busy: boolean; onMore: () => void }) {
  return <div className="flex flex-col items-center gap-4 rounded-3xl bg-card px-5 py-8 text-center" role="status">
    <PartyPopper size={36} className="text-[var(--org-primary-color,currentColor)]" aria-hidden="true" />
    <div>
      <p className="text-xl font-extrabold tracking-tight">Well done!</p>
      <p className="mt-1 text-sm text-muted-foreground">{week.can_boost ? 'You finished everything for this week. Enjoy it — or keep going.' : 'You finished everything for this week, and you’re all caught up.'}</p>
    </div>
    {week.can_boost ? <Button type="button" variant="surface" disabled={busy} onClick={onMore}>{busy ? 'Adding…' : 'Pull 3 more'}</Button> : null}
  </div>
}
