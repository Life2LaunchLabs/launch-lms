'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { ChevronDown, Compass, Loader2, PartyPopper, Plus, Sparkles } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { planningApi } from '@services/planning/planning'
import { getAPIUrl, getUriWithOrg } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { Button } from '@components/ui/button'
import { useHub } from '@components/Hub/HubContext'
import { SelectedStepBody, StepStack, stepState, type StepItem } from './StepStack'
import { planVars } from './planColors'
import { PlanMark, PlanProgress } from './PlanHeader'

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

/** The Plans landing page: the learner's plans, invitations, this week's steps, then what comes later. */
export default function PlansHome({ orgslug, token, plans, completed, invitations, completedError, retryCompleted, refresh, choose, creating, getPlanColor, onCreate, renderObjective }: PlansHomeProps) {
  const router = useRouter()
  const hub = useHub()
  const { data, error, isLoading, mutate: retry } = useSWR<any>(token ? homeKey() : null, (url: string) => swrFetcher(url, token), { revalidateOnFocus: true })
  const [selected, setSelected] = React.useState('')
  const [open, setOpen] = React.useState<StepItem | null>(null)
  const [busy, setBusy] = React.useState(false)
  const weekItems: StepItem[] = data?.week?.items || []
  const openItems = weekItems.filter((item) => stepState(item) !== 'done')
  const doneItems = weekItems.filter((item) => stepState(item) === 'done')
  const selectedUuid = selected || firstUp(openItems)?.objective_uuid || ''

  if (error) return <div className="mt-6 rounded-xl border border-border bg-card p-5" role="alert"><p className="text-sm">Your weekly steps could not load.</p><button type="button" onClick={() => void retry()} className="mt-3 min-h-11 text-sm font-semibold underline">Try again</button></div>
  if (isLoading || !data) return <div className="flex min-h-[45vh] items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
  if (!data.plans?.length && !plans.length) return <><Invitations invitations={invitations} token={token} refresh={refresh} /><EmptyHome orgslug={orgslug} onCreate={onCreate} creating={creating} /></>

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
  const pullIn = async (planUuid: string) => {
    setBusy(true)
    try { await mutate(homeKey(), await planningApi.pullInPlan(planUuid, token), false) } catch { toast.error('Could not add that plan to this week') } finally { setBusy(false) }
  }
  const pace = async (target: number) => {
    try { await mutate(homeKey(), await planningApi.setPace(target, token), false) } catch { toast.error('Could not change your weekly goal') }
  }
  const week = data.week
  const groups: { key: string; label: string; sub?: string; items: StepItem[] }[] = [
    ...(data.next_week?.items?.length ? [{ key: 'next', label: 'Next week', sub: range(data.next_week.start, data.next_week.end), items: data.next_week.items }] : []),
    ...(data.months || []).map((group: any) => ({ key: group.key, label: group.label, items: group.items })),
    ...((data.later || []).length ? [{ key: 'later', label: 'Later', sub: 'Whenever you’re ready', items: (data.later || []).flatMap((group: any) => group.items) }] : []),
  ]

  return <div className="mt-6 flex flex-col gap-10">
    <PlanCards orgslug={orgslug} plans={plans} getPlanColor={getPlanColor} choose={choose} onCreate={onCreate} creating={creating} />
    <Invitations invitations={invitations} token={token} refresh={refresh} />

    <section aria-labelledby="this-week" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">{range(week.start, week.end)}</p>
          <h2 id="this-week" className="text-2xl font-extrabold tracking-tight">This week</h2>
        </div>
        <p className="text-sm font-bold">{week.done_count} of {week.total} done</p>
      </div>
      <div className="flex gap-1.5" aria-hidden="true">
        {weekItems.map((item) => <span key={item.objective_uuid} className="h-3 flex-1 rounded-full bg-muted" style={item.progress?.status === 'completed' ? { backgroundColor: getPlanColor(item.plan?.plan_uuid) } : undefined} />)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{week.complete ? 'You did everything you planned this week.' : 'Next up is picked for you, but anything open is fair game.'}</span>
        <label className="inline-flex items-center gap-2 font-bold">
          Aim for
          <select value={week.target} onChange={(event) => pace(Number(event.target.value))} className="h-9 rounded-xl border-2 border-border bg-card px-2 font-extrabold text-foreground">
            {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          steps a week
        </label>
      </div>
      {week.total > week.target ? <p className="text-xs text-muted-foreground">Dated and overdue steps are included alongside your weekly goal.</p> : null}
      {week.complete ? <WeekComplete week={week} busy={busy} onMore={more} onPullIn={pullIn} />
        : openItems.length ? <StepStack items={openItems} colorFor={colorFor} selectedUuid={selectedUuid} currentUuid={firstUp(openItems)?.objective_uuid} onSelect={select} showPlanName renderSelected={renderSelected} />
        : <p className="rounded-2xl bg-card px-4 py-8 text-center text-sm font-bold text-muted-foreground">Nothing planned for this week yet.</p>}
      {doneItems.length ? <details className="group/done-week">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-xl py-2 text-sm font-bold text-muted-foreground">
          {doneItems.some((item) => item.progress?.status === 'submitted') ? 'Submitted and done this week' : 'Done this week'} · {doneItems.length}
          <ChevronDown size={16} className="transition-transform group-open/done-week:rotate-180" aria-hidden="true" />
        </summary>
        <StepStack items={doneItems} colorFor={colorFor} selectedUuid={selectedUuid} onSelect={select} showPlanName renderSelected={renderSelected} />
      </details> : null}
      {!week.complete && week.can_boost ? <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-card px-4 py-4">
        <Sparkles size={20} className="text-muted-foreground" aria-hidden="true" />
        <span className="flex-1 text-sm font-bold">Moving fast? Pull a few more steps into this week.</span>
        <Button type="button" variant="surface" disabled={busy} onClick={more}>{busy ? 'Adding…' : 'Ready for more'}</Button>
      </div> : null}
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

    <CompletedPlans plans={completed} getPlanColor={getPlanColor} choose={choose} error={completedError} retry={retryCompleted} />
    <Modal isDialogOpen={Boolean(open)} onOpenChange={(value) => { if (!value) setOpen(null) }} minWidth="lg" minHeight="no-min" dialogTitle={open?.title || ''} dialogContent={open ? renderObjective(open, () => setOpen(null)) : null} />
  </div>
}

/** Everything planned this week is done: celebrate, then offer more only if the learner wants it. */
// eslint-disable-next-line no-unused-vars
function WeekComplete({ week, busy, onMore, onPullIn }: { week: any; busy: boolean; onMore: () => void; onPullIn: (planUuid: string) => void }) {
  const offers: { plan: { plan_uuid: string; name: string }; steps: number }[] = week.new_plans || []
  return <div className="flex flex-col items-center gap-4 rounded-3xl bg-card px-5 py-8 text-center" role="status">
    <PartyPopper size={36} className="text-[var(--org-primary-color,currentColor)]" aria-hidden="true" />
    <div>
      <p className="text-xl font-extrabold tracking-tight">Week complete!</p>
      <p className="mt-1 text-sm text-muted-foreground">You finished all {week.done_count} {week.done_count === 1 ? 'step' : 'steps'} you planned. Enjoy it — or keep going.</p>
    </div>
    {offers.length || week.can_boost ? <div className="flex w-full max-w-md flex-col gap-2">
      {offers.map((offer) => <Button key={offer.plan.plan_uuid} type="button" variant="brand" disabled={busy} onClick={() => onPullIn(offer.plan.plan_uuid)}>
        Add {offer.steps} {offer.steps === 1 ? 'step' : 'steps'} from {offer.plan.name}
      </Button>)}
      {week.can_boost ? <Button type="button" variant="surface" disabled={busy} onClick={onMore}>{busy ? 'Adding…' : 'Pull 3 more steps'}</Button> : null}
    </div> : null}
  </div>
}

/** The learner's plans as cards, with making or finding another at the end. */
// eslint-disable-next-line no-unused-vars
function PlanCards({ orgslug, plans, getPlanColor, choose, onCreate, creating }: { orgslug: string; plans: any[]; getPlanColor: (uuid?: string) => string; choose: (plan: any) => void; onCreate: () => void; creating?: boolean }) {
  return <section aria-label="Your plans" className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 xl:grid-cols-3">
    {plans.map((plan) => {
      const percent = Math.round(plan.progress_percent || 0)
      const forWhom = !plan.is_mine ? plan.subject?.name || plan.target_name : ''
      return <button key={plan.plan_uuid} type="button" onClick={() => choose(plan)} aria-label={`${plan.name}, ${percent}% complete`} data-plan="" style={planVars(getPlanColor(plan.plan_uuid))}
        className="flex w-[80%] shrink-0 snap-start flex-col gap-4 rounded-3xl bg-[var(--plan-deep)] p-5 text-left text-[var(--plan-deep-ink)] shadow-[0_6px_0_var(--plan-deep-edge)] transition active:translate-y-1 active:shadow-[0_2px_0_var(--plan-deep-edge)] md:w-auto">
        <span className="flex items-start gap-3">
          <PlanMark badge={plan.badge || plan.source_badge} size="sm" />
          <span className="min-w-0 flex-1">
            {forWhom ? <span className="block text-xs font-extrabold uppercase tracking-wider opacity-80">For {forWhom}</span> : null}
            <span className="line-clamp-2 text-lg font-extrabold leading-snug">{plan.name}</span>
          </span>
        </span>
        <span className="mt-auto flex items-center gap-3"><PlanProgress percent={percent} label={`${plan.name} progress`} /><span className="text-xs font-bold tabular-nums">{percent}%</span></span>
      </button>
    })}
    <div className="flex w-[80%] shrink-0 snap-start flex-col justify-center gap-2 rounded-3xl border-2 border-dashed border-border p-4 md:w-auto">
      <Button type="button" variant="surface" onClick={onCreate} disabled={creating}><Plus size={16} />{creating ? 'Creating…' : 'Create your own'}</Button>
      <Button type="button" variant="ghost" asChild><Link href={getUriWithOrg(orgslug, '/discover')}><Compass size={16} />Find one in Discover</Link></Button>
    </div>
  </section>
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
