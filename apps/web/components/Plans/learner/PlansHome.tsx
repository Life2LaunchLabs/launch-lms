'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { ChevronDown, Compass, PartyPopper, Plus } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { planningApi } from '@services/planning/planning'
import { getAPIUrl, getUriWithOrg } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { Button } from '@components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { Reveal, Skeleton } from '@components/ui/skeleton'
import { useHub } from '@components/Hub/HubContext'
import { cn } from '@/lib/utils'
import { SelectedStepBody, StepStack, StepStackSkeleton, stepState, type StepItem } from './StepStack'
import { planVars } from './planColors'

export const homeKey = () => `${getAPIUrl()}planning/home`
const RANGE = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

function range(start?: string, end?: string) {
  if (!start || !end) return ''
  const day = (value: string) => RANGE.format(new Date(`${value.slice(0, 10)}T12:00:00`))
  return `${day(start)} – ${day(end)}`
}

function firstUp(items: StepItem[]) {
  return items.find((item) => stepState(item) === 'open')
    || items.find((item) => stepState(item) === 'not_ready')
}

type PlansHomeProps = {
  orgslug: string
  token?: string
  /** The learner's active plans; the overview's tabs show them above this. */
  plans: any[]
  completed: any[]
  invitations: any[]
  completedError?: boolean
  retryCompleted: () => void
  refresh: () => Promise<unknown>
  // eslint-disable-next-line no-unused-vars
  choose: (plan: any) => void
  creating?: boolean
  // eslint-disable-next-line no-unused-vars
  getPlanColor: (planUuid?: string) => string
  onCreate: () => void
  /** The full step card (fields, notes, completion) shown when a step is started. */
  // eslint-disable-next-line no-unused-vars
  renderObjective: (item: StepItem, close: () => void) => React.ReactNode
}

const GOALS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15]

/** The overview below the plan tabs: invitations, this week's steps, then what comes later. */
export default function PlansHome({ orgslug, token, plans, completed, invitations, completedError, retryCompleted, refresh, choose, creating, getPlanColor, onCreate, renderObjective }: PlansHomeProps) {
  const { data, error, mutate: retry } = useSWR<any>(token ? homeKey() : null, (url: string) => swrFetcher(url, token), { revalidateOnFocus: true })

  if (error) return <div className="rounded-xl border border-border bg-card p-5" role="alert"><p className="text-sm">Your weekly steps could not load.</p><button type="button" onClick={() => void retry()} className="mt-3 min-h-11 text-sm font-semibold underline">Try again</button></div>
  if (data && !data.plans?.length && !plans.length) return <><Invitations invitations={invitations} token={token} refresh={refresh} /><EmptyHome orgslug={orgslug} onCreate={onCreate} creating={creating} /></>

  return <div className="flex flex-col gap-10">
    <Invitations invitations={invitations} token={token} refresh={refresh} />
    <Reveal ready={Boolean(data)} fallback={<WeekSkeleton />}>
      {data ? <Week data={data} orgslug={orgslug} token={token} getPlanColor={getPlanColor} renderObjective={renderObjective} /> : null}
    </Reveal>
    <CompletedPlans plans={completed} getPlanColor={getPlanColor} choose={choose} error={completedError} retry={retryCompleted} />
  </div>
}

/** This week, its goal and steps, then next week, the months ahead and later. */
// eslint-disable-next-line no-unused-vars
function Week({ data, orgslug, token, getPlanColor, renderObjective }: { data: any; orgslug: string; token?: string; getPlanColor: (planUuid?: string) => string; renderObjective: PlansHomeProps['renderObjective'] }) {
  const router = useRouter()
  const hub = useHub()
  const [selected, setSelected] = React.useState('')
  const [open, setOpen] = React.useState<StepItem | null>(null)
  const [busy, setBusy] = React.useState(false)
  const week = data.week
  const weekItems: StepItem[] = week?.items || []
  const openItems = weekItems.filter((item) => stepState(item) !== 'done')
  const doneItems = weekItems.filter((item) => stepState(item) === 'done')
  const selectedUuid = selected || firstUp(openItems)?.objective_uuid || ''

  const colorFor = (item: StepItem) => getPlanColor(item.plan?.plan_uuid)
  const select = (item: StepItem) => setSelected(item.objective_uuid)
  const goTo = (objectiveUuid: string) => {
    setSelected(objectiveUuid)
    document.getElementById(`step-${objectiveUuid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  const renderSelected = (item: StepItem, state: 'open' | 'not_ready' | 'done') => <SelectedStepBody item={item} state={state} onStart={() => item.activity_id && item.plan ? router.push(getUriWithOrg(orgslug, `/plans/${encodeURIComponent(item.plan.slug)}/objectives/${item.objective_uuid}/activity`)) : setOpen(item)} onGoTo={goTo} onAsk={hub ? () => hub.open({ prompt: `Help me with “${item.title}”${item.plan ? ` in my plan “${item.plan.name}”` : ''}.` }) : undefined} />
  const more = async () => {
    setBusy(true)
    try { await mutate(homeKey(), await planningApi.readyForMore(token), false) } catch { toast.error('Could not add more steps') } finally { setBusy(false) }
  }
  const pace = async (target: number) => {
    try { await mutate(homeKey(), await planningApi.setPace(target, token), false) } catch { toast.error('Could not change your weekly goal') }
  }
  const groups: { key: string; label: string; sub?: string; items: StepItem[] }[] = [
    ...(data.next_week?.items?.length ? [{ key: 'next', label: 'Next week', sub: range(data.next_week.start, data.next_week.end), items: data.next_week.items }] : []),
    ...(data.months || []).map((group: any) => ({ key: group.key, label: group.label, items: group.items })),
    ...((data.later || []).length ? [{ key: 'later', label: 'Later', sub: 'Whenever you’re ready', items: (data.later || []).flatMap((group: any) => group.items) }] : []),
  ]

  return <div className="flex flex-col gap-10">
    <section aria-labelledby="this-week" className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">{range(week.start, week.end)}</p>
          <h2 id="this-week" className="text-2xl font-extrabold tracking-tight">This week</h2>
        </div>
        <GoalChip done={week.done_count} goal={week.target} nextGoal={week.next_target ?? week.target} planned={Boolean(week.planned)} onChange={pace} />
      </div>
      <GoalBar done={week.done_count} goal={week.target} />
      {week.complete ? <WeekComplete week={week} busy={busy} onMore={more} />
        : openItems.length ? <StepStack items={openItems} colorFor={colorFor} selectedUuid={selectedUuid} currentUuid={firstUp(openItems)?.objective_uuid} onSelect={select} showPlanName renderSelected={renderSelected} />
        : <p className="rounded-2xl bg-card px-4 py-8 text-center text-sm font-bold text-muted-foreground">Nothing planned for this week yet.</p>}
      {doneItems.length ? <details className="group/done-week">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-xl py-2 text-sm font-bold text-muted-foreground">
          {doneItems.some((item) => item.progress?.status === 'submitted') ? 'Submitted and done this week' : 'Done this week'} · {doneItems.length}
          <ChevronDown size={16} className="transition-transform group-open/done-week:rotate-180" aria-hidden="true" />
        </summary>
        <StepStack items={doneItems} colorFor={colorFor} selectedUuid={selectedUuid} onSelect={select} showPlanName renderSelected={renderSelected} />
      </details> : null}
    </section>

    {groups.map((group) => <section key={group.key} aria-label={group.label}>
      <details open={group.key === 'next' ? true : undefined} className="group/later">
        <summary className="mb-3 flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-xl py-2 focus-visible:outline focus-visible:outline-2">
          <h2 className="text-xl font-extrabold tracking-tight">{group.label}</h2>
          <span className="text-sm text-muted-foreground">{group.items.length} {group.items.length === 1 ? 'step' : 'steps'}{group.sub ? ` · ${group.sub}` : ''}</span>
          <ChevronDown size={18} className="ml-auto text-muted-foreground transition-transform group-open/later:rotate-180" aria-hidden="true" />
        </summary>
        <StepStack items={group.items} colorFor={colorFor} selectedUuid={selectedUuid} onSelect={select} showPlanName renderSelected={renderSelected} />
      </details>
    </section>)}
    <Modal isDialogOpen={Boolean(open)} onOpenChange={(value) => { if (!value) setOpen(null) }} minWidth="lg" minHeight="no-min" dialogTitle={open?.title || ''} dialogContent={open ? renderObjective(open, () => setOpen(null)) : null} />
  </div>
}

/**
 * Steps done out of the weekly goal, which opens a menu to change the goal. Going past
 * the goal turns it gold. A new goal starts next week, so this week's plan holds.
 */
// eslint-disable-next-line no-unused-vars
function GoalChip({ done, goal, nextGoal, planned, onChange }: { done: number; goal: number; nextGoal: number; planned: boolean; onChange: (goal: number) => void }) {
  const over = done > goal
  const pending = nextGoal !== goal
  return <div className="flex flex-col items-end gap-1">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`${done} of your goal of ${goal} steps this week. Change goal`}
          className={cn('flex h-10 items-center gap-1.5 rounded-xl px-3 font-extrabold tabular-nums transition-[background-color,box-shadow] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
            over ? 'week-gold shadow-[0_3px_0_var(--week-gold-edge)]' : 'border-2 border-border bg-card shadow-[0_3px_0_hsl(var(--border))] hover:bg-raised')}>
          <span className="relative z-10 text-lg leading-none">{done}</span>
          <span className="relative z-10 text-sm leading-none opacity-70">/{goal}</span>
          <ChevronDown size={15} className="relative z-10 opacity-70" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span>Change goal</span>
          <span className="text-xs font-normal text-muted-foreground">{planned ? 'Steps a week, starting next week' : 'Steps a week'}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={String(nextGoal)} onValueChange={(value) => onChange(Number(value))} className="grid grid-cols-4 gap-1 p-1">
          {GOALS.map((value) => <DropdownMenuRadioItem key={value} value={String(value)} className="justify-center pl-2 pr-2 font-bold tabular-nums data-[state=checked]:bg-accent [&>span:first-child]:hidden">{value}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
    {pending ? <span className="text-xs font-semibold text-muted-foreground">Goal {nextGoal} from next week</span> : null}
  </div>
}

/** Progress toward the weekly goal: green until it fills, gold once you go past it. */
function GoalBar({ done, goal }: { done: number; goal: number }) {
  const over = done > goal
  const percent = goal ? Math.min(100, Math.round((done * 100) / goal)) : 0
  return <div role="progressbar" aria-label="Weekly goal" aria-valuenow={done} aria-valuemin={0} aria-valuemax={goal} aria-valuetext={`${done} of ${goal} steps`} className="h-3 overflow-hidden rounded-full bg-muted">
    <span className={cn('block h-full rounded-full transition-[width] duration-500 ease-out', over ? 'week-gold' : 'bg-[var(--week-green)]')} style={{ width: `${percent ? Math.max(4, percent) : 0}%` }} />
  </div>
}

/** Everything planned this week is done: celebrate, then offer more only if the learner asks. */
function WeekComplete({ week, busy, onMore }: { week: any; busy: boolean; onMore: () => void }) {
  return <div className="flex flex-col items-center gap-4 rounded-3xl bg-card px-5 py-8 text-center" role="status">
    <PartyPopper size={36} className="text-[var(--org-primary-color,currentColor)]" aria-hidden="true" />
    <div>
      <p className="text-xl font-extrabold tracking-tight">Well done!</p>
      <p className="mt-1 text-sm text-muted-foreground">{week.can_boost ? 'You finished everything for this week. Enjoy it — or keep going.' : 'You finished everything for this week, and you’re all caught up.'}</p>
    </div>
    {week.can_boost ? <Button type="button" variant="surface" disabled={busy} onClick={onMore}>{busy ? 'Adding…' : 'Pull 3 more'}</Button> : null}
  </div>
}

/** The overview's shape while the week loads: the heading, goal, bar and a few steps. */
export function WeekSkeleton() {
  return <div className="flex flex-col gap-4">
    <div className="flex items-end justify-between gap-3">
      <div className="flex flex-col gap-2"><Skeleton className="h-3 w-24 rounded-md" /><Skeleton className="h-7 w-36 rounded-lg" /></div>
      <Skeleton className="h-10 w-20 rounded-xl" />
    </div>
    <Skeleton className="h-3 rounded-full" />
    <StepStackSkeleton count={4} />
  </div>
}

function Invitations({ invitations, token, refresh }: { invitations: any[]; token?: string; refresh: () => Promise<unknown> }) {
  if (!invitations.length) return null
  const respond = async (uuid: string, accept: boolean) => { try { await planningApi.respond(uuid, accept, token); await refresh() } catch { toast.error('Could not respond to this invitation') } }
  return <section aria-label="Plan invitations" className="flex flex-col gap-3">
    <h2 className="text-xl font-extrabold tracking-tight">Invitations</h2>
    {invitations.map((invite) => <div key={invite.invitation_uuid} className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-border bg-card p-4">
      <div className="min-w-0 flex-1"><p className="font-bold">{invite.plan.name}</p><p className="text-sm text-muted-foreground">{invite.source_organization?.name || invite.invited_by?.name || invite.invited_by?.username || 'Launch LMS'}{invite.kind !== 'subject' ? ` · Help as ${invite.role.name}` : ''}</p></div>
      <Button size="sm" variant="ghost" onClick={() => void respond(invite.invitation_uuid, false)}>Decline</Button>
      <Button size="sm" variant="brand" onClick={() => void respond(invite.invitation_uuid, true)}>Accept</Button>
    </div>)}
  </section>
}

// eslint-disable-next-line no-unused-vars
function CompletedPlans({ plans, getPlanColor, choose, error, retry }: { plans: any[]; getPlanColor: (uuid?: string) => string; choose: (plan: any) => void; error?: boolean; retry: () => void }) {
  if (error) return <Button variant="ghost" onClick={retry} className="w-fit text-xs">Retry completed plans</Button>
  if (!plans.length) return null
  return <details className="group/done">
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-xl py-2">
      <h2 className="text-xl font-extrabold tracking-tight">Completed</h2>
      <span className="text-sm text-muted-foreground">{plans.length} {plans.length === 1 ? 'plan' : 'plans'}</span>
      <ChevronDown size={18} className="ml-auto text-muted-foreground transition-transform group-open/done:rotate-180" aria-hidden="true" />
    </summary>
    <ul className="mt-2 flex flex-col gap-2">{plans.map((plan) => <li key={plan.plan_uuid}><button type="button" onClick={() => choose(plan)} data-plan="" style={planVars(getPlanColor(plan.plan_uuid))} className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-card px-4 text-left hover:bg-raised">
      <span className="h-3 w-3 rounded-full bg-[var(--plan-face)]" aria-hidden="true" /><span className="flex-1 font-bold">{plan.name}</span><span className="text-xs text-muted-foreground">Done</span>
    </button></li>)}</ul>
  </details>
}

function EmptyHome({ orgslug, onCreate, creating }: { orgslug: string; onCreate: () => void; creating?: boolean }) {
  return <div className="mt-8 rounded-3xl border-2 border-dashed border-border px-6 py-14 text-center">
    <h2 className="text-2xl font-extrabold">Start with something that matters</h2>
    <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Make your own plan, or pick a badge to earn and its plan shows up here.</p>
    <div className="mt-6 flex flex-wrap justify-center gap-3">
      <Button type="button" variant="brand" onClick={onCreate} disabled={creating}><Plus size={16} />{creating ? 'Creating…' : 'Create your own'}</Button>
      <Button type="button" variant="surface" asChild><Link href={getUriWithOrg(orgslug, '/discover')}><Compass size={16} />Find one in Discover</Link></Button>
    </div>
  </div>
}
