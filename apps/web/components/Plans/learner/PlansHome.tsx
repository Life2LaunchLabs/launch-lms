'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { Compass, Loader2, Plus, Sparkles } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { planningApi } from '@services/planning/planning'
import { getAPIUrl, getUriWithOrg } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { cn } from '@/lib/utils'
import { SelectedStepBody, StepStack, type StepItem } from './StepStack'
import { planTone } from './planColors'

export const homeKey = () => `${getAPIUrl()}planning/home`
const RANGE = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

function range(start?: string, end?: string) {
  if (!start || !end) return ''
  const day = (value: string) => RANGE.format(new Date(`${value.slice(0, 10)}T12:00:00`))
  return `${day(start)} – ${day(end)}`
}

function firstUp(items: StepItem[]) {
  return items.find((item) => item.availability?.state === 'open' && item.progress?.status !== 'completed')
    || items.find((item) => item.progress?.status !== 'completed')
    || items[0]
}

type PlansHomeProps = {
  orgslug: string
  token?: string
  // eslint-disable-next-line no-unused-vars
  getPlanColor: (planUuid?: string) => string
  onCreate: () => void
  /** The full step card (fields, notes, completion) shown when a step is started. */
  // eslint-disable-next-line no-unused-vars
  renderObjective: (item: StepItem, close: () => void) => React.ReactNode
}

export default function PlansHome({ orgslug, token, getPlanColor, onCreate, renderObjective }: PlansHomeProps) {
  const router = useRouter()
  const { data, error, isLoading, mutate: retry } = useSWR<any>(token ? homeKey() : null, (url: string) => swrFetcher(url, token), { revalidateOnFocus: true })
  const [selected, setSelected] = React.useState('')
  const [open, setOpen] = React.useState<StepItem | null>(null)
  const [busy, setBusy] = React.useState(false)
  const weekItems: StepItem[] = data?.week?.items || []
  const selectedUuid = selected || firstUp(weekItems)?.objective_uuid || ''

  if (error) return <div className="mt-6 rounded-xl border border-border bg-card p-5" role="alert"><p className="text-sm">Your weekly steps could not load.</p><button type="button" onClick={() => void retry()} className="mt-3 min-h-11 text-sm font-semibold underline">Try again</button></div>
  if (isLoading || !data) return <div className="flex min-h-[45vh] items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
  if (!data.plans?.length) return <EmptyHome orgslug={orgslug} onCreate={onCreate} />

  const colorFor = (item: StepItem) => getPlanColor(item.plan?.plan_uuid)
  const select = (item: StepItem) => setSelected(item.objective_uuid)
  const goTo = (objectiveUuid: string) => {
    setSelected(objectiveUuid)
    document.getElementById(`step-${objectiveUuid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  const renderSelected = (item: StepItem, state: 'open' | 'not_ready' | 'done') => <SelectedStepBody item={item} state={state} onStart={() => item.activity_id && item.plan ? router.push(getUriWithOrg(orgslug, `/plans/${encodeURIComponent(item.plan.slug)}/objectives/${item.objective_uuid}/activity`)) : setOpen(item)} onGoTo={goTo} />
  const more = async () => {
    setBusy(true)
    try { await mutate(homeKey(), await planningApi.readyForMore(token), false) } catch { toast.error('Could not add more steps') } finally { setBusy(false) }
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

  return <div className="mt-6 flex flex-col gap-7">
    <section aria-labelledby="this-week" className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">{range(week.start, week.end)}</p>
          <h2 id="this-week" className="text-2xl font-semibold tracking-tight">This week</h2>
        </div>
        <p className="text-sm font-semibold">{week.done_count} of {week.total} done</p>
      </div>
      <div className="mt-4 flex gap-1.5 px-1" aria-hidden="true">
        {weekItems.map((item) => <span key={item.objective_uuid} className="h-2 flex-1 rounded-full bg-muted" style={item.progress?.status === 'completed' ? { backgroundColor: planTone(colorFor(item)).ring } : undefined} />)}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1 text-sm text-muted-foreground">
        <span>{week.complete ? 'You did everything you planned this week.' : 'Next up is picked for you, but anything open is fair game.'}</span>
        <label className="inline-flex items-center gap-2 font-bold">
          Aim for
          <select value={week.target} onChange={(event) => pace(Number(event.target.value))} className="h-9 rounded-lg border border-border bg-background px-2 font-black text-foreground">
            {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          steps a week
        </label>
      </div>
      {week.total > week.target ? <p className="mt-2 px-1 text-xs text-muted-foreground">Dated and overdue steps are included alongside your weekly goal.</p> : null}
      {weekItems.length
        ? <div className="mt-4"><StepStack items={weekItems} colorFor={colorFor} selectedUuid={selectedUuid} onSelect={select} showPlanName renderSelected={renderSelected} /></div>
        : <p className="mt-6 rounded-2xl bg-muted px-4 py-8 text-center text-sm font-semibold text-muted-foreground">Nothing planned for this week yet.</p>}
      {week.can_boost ? <div className={cn('mt-5 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-4', 'bg-muted/60')}>
        <Sparkles size={20} className={'text-muted-foreground'} aria-hidden="true" />
        <span className="flex-1 text-sm font-bold">{week.complete ? 'Week done. Want to keep going?' : 'Moving fast? Pull a few more steps into this week.'}</span>
        <button type="button" disabled={busy} onClick={more} className={cn('min-h-11 rounded-2xl px-5 text-sm font-black transition active:translate-y-[3px] disabled:opacity-60', 'border border-border bg-card text-foreground')}>
          {busy ? 'Adding…' : 'Ready for more'}
        </button>
      </div> : null}
    </section>

    {groups.map((group) => <section key={group.key} aria-label={group.label}>
      <details open={group.key === 'next' ? true : undefined}>
        <summary className="mb-2 min-h-11 cursor-pointer rounded-lg py-2 text-sm text-muted-foreground focus-visible:outline focus-visible:outline-2">
          <h2 className="ml-2 inline text-xl font-semibold tracking-tight text-foreground">{group.label}</h2>
          <span className="ml-3">{group.items.length} {group.items.length === 1 ? 'step' : 'steps'}{group.sub ? ` · ${group.sub}` : ''}</span>
        </summary>
        <StepStack items={group.items} colorFor={colorFor} selectedUuid={selectedUuid} onSelect={select} showPlanName renderSelected={renderSelected} />
      </details>
    </section>)}

    <Modal isDialogOpen={Boolean(open)} onOpenChange={(value) => { if (!value) setOpen(null) }} minWidth="lg" minHeight="no-min" dialogTitle={open?.title || ''} dialogContent={open ? renderObjective(open, () => setOpen(null)) : null} />
  </div>
}

function EmptyHome({ orgslug, onCreate }: { orgslug: string; onCreate: () => void }) {
  return <div className="mt-8 rounded-[28px] border border-dashed border-border px-6 py-14 text-center">
    <h2 className="text-2xl font-black">Start with something that matters</h2>
    <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Make your own plan, or pick a badge to earn and its plan shows up here.</p>
    <div className="mt-6 flex flex-wrap justify-center gap-3">
      <button type="button" onClick={onCreate} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-black text-background"><Plus size={16} />Create your own</button>
      <Link href={getUriWithOrg(orgslug, '/badges')} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-black"><Compass size={16} />Find one in Discover</Link>
    </div>
  </div>
}
