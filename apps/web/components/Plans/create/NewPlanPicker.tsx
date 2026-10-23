'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { ArrowRight, Compass, Loader2, Medal, Plus } from 'lucide-react'
import { useStaff } from '@components/Goals/admin/assignments/shared'
import { stepDefinition } from '@components/Goals/steps'
import { coverPalette } from '@components/Plans/shared/PlanCover'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { plansSummaryKey } from '@services/goals/adminHome'
import { isTemplatesKey, templateKeys, templatesApi, type PlanStarter } from '@services/goals/templates'
import { cn } from '@/lib/utils'

const ALL = 'all'

/** The New plan modal's body: categories of starter plans on the left; Create your own, then the starters. */
export default function NewPlanPicker({ orgslug, onDone }: { orgslug: string; onDone: () => void }) {
  const router = useRouter()
  const { orgId, token } = useStaff()
  const { data, error } = useSWR(orgId && token ? templateKeys.starters(orgId) : null, () => templatesApi.starters(orgId, token))
  const [category, setCategory] = React.useState(ALL)
  const [busy, setBusy] = React.useState<string | null>(null)

  const open = async (key: string, make: () => Promise<{ template_uuid: string }>) => {
    if (busy) return
    setBusy(key)
    try {
      const plan = await make()
      await Promise.all([mutate(isTemplatesKey), mutate(plansSummaryKey(orgId))])
      onDone()
      router.push(getUriWithOrg(orgslug, routePaths.org.admin.template(plan.template_uuid)))
    } catch (failure: any) { toast.error(failure?.message || 'Could not create the plan.'); setBusy(null) }
  }
  const starters = data?.starters || []
  const shown = category === ALL ? starters : starters.filter((starter) => starter.categories.includes(category))
  const nav = [{ collection_uuid: ALL, name: 'All starters', count: starters.length }, ...(data?.categories || []).filter((item) => item.count)]

  return <div className={cn('grid min-h-0 flex-1 grid-cols-1', starters.length && 'md:grid-cols-[240px_minmax(0,1fr)]')}>
    {starters.length ? <nav aria-label="Starter plan categories" className="flex gap-1 overflow-x-auto border-b border-border p-2.5 md:block md:space-y-0.5 md:overflow-y-auto md:border-b-0 md:border-r md:px-3 md:py-[18px]">
      <h4 className="hidden px-2.5 pb-2 text-xs font-bold uppercase tracking-[.06em] text-muted-foreground md:block">Starter plans</h4>
      {nav.map((item) => <button key={item.collection_uuid} type="button" aria-pressed={category === item.collection_uuid} onClick={() => setCategory(item.collection_uuid)}
        className={cn('flex shrink-0 items-center justify-between gap-1.5 whitespace-nowrap rounded-[10px] px-2.5 py-2 text-left text-sm md:w-full',
          category === item.collection_uuid ? 'bg-brand-soft font-bold text-brand-ink' : 'font-medium hover:bg-muted')}>
        {item.name}<span className="rounded-full bg-muted px-[7px] py-px text-[11px] font-medium text-muted-foreground">{item.count}</span>
      </button>)}
    </nav> : null}
    <div className="min-h-0 overflow-y-auto p-[22px]">
      <h3 className="mb-3 text-base font-bold">Create your own</h3>
      <button type="button" disabled={!!busy} onClick={() => void open('scratch', () => templatesApi.create(orgId, { title: 'Untitled plan' }, token))}
        className="mb-[26px] flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left transition hover:border-brand hover:shadow-[0_1px_2px_hsl(200_30%_10%/.06),0_8px_28px_hsl(200_30%_10%/.08)]">
        <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[14px] bg-brand-soft text-brand">{busy === 'scratch' ? <Loader2 size={24} className="animate-spin" /> : <Plus size={26} />}</span>
        <span className="min-w-0"><b className="block text-[15px]">Start from scratch</b><span className="text-[13px] text-muted-foreground">A blank plan. Add steps one at a time.</span></span>
        <ArrowRight size={20} className="ml-auto shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      {starters.length ? <>
        <h3 className="mb-3 text-base font-bold">Start from a starter plan</h3>
        <p className="-mt-1.5 mb-3.5 text-[13px] text-muted-foreground">Short plans that show off what steps can do. Everything is editable.</p>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3.5">
          {shown.map((starter) => <li key={starter.template_uuid} className="flex">
            <StarterCard starter={starter} busy={busy === starter.template_uuid} disabled={!!busy}
              onPick={() => void open(starter.template_uuid, () => templatesApi.useStarter(orgId, starter.template_uuid, token))} />
          </li>)}
        </ul>
      </> : error || data ? <Link href={getUriWithOrg(orgslug, routePaths.org.admin.discover())} onClick={onDone}
        className="flex items-center gap-4 rounded-2xl border border-dashed border-border p-4 text-left transition hover:border-brand">
        <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[14px] bg-muted text-foreground"><Compass size={24} /></span>
        <span className="min-w-0"><b className="block text-[15px]">Or add a ready-made plan</b><span className="text-[13px] text-muted-foreground">Browse plans from Life2Launch and partners in Discover.</span></span>
        <ArrowRight size={20} className="ml-auto shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link> : <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" /></div>}
    </div>
  </div>
}

/** A starter: a tinted picture of its first steps, its name and what it's for, then the step types it uses and whether it earns a badge. */
function StarterCard({ starter, busy, disabled, onPick }: { starter: PlanStarter; busy: boolean; disabled: boolean; onPick: () => void }) {
  const palette = coverPalette(starter)
  return <button type="button" disabled={disabled} onClick={onPick} aria-label={`Start from ${starter.title}`}
    className="flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-left transition hover:border-brand hover:shadow-[0_1px_2px_hsl(200_30%_10%/.06),0_8px_28px_hsl(200_30%_10%/.08)] disabled:cursor-wait">
    <span className="relative grid h-[120px] w-full place-items-center overflow-hidden p-3.5" style={{ background: `color-mix(in srgb, ${palette.deep} 16%, hsl(var(--card)))` }}>
      <span className="grid w-[82%] min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5 overflow-hidden rounded-xl bg-white p-2.5 text-[11.5px] font-semibold text-[hsl(200_30%_9%)] shadow-[0_10px_24px_hsl(200_40%_10%/.12)]">
        {starter.preview.slice(0, 2).map((step, index) => {
          const definition = stepDefinition(step.type)
          const Icon = definition.icon
          return <span key={index} className="flex min-w-0 items-center gap-2 rounded-lg bg-[hsl(200_22%_96%)] p-1.5">
            <i className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-white" style={{ background: definition.color }}><Icon size={12} aria-hidden="true" /></i>
            <span className="truncate">{step.title || definition.label}</span>
          </span>
        })}
      </span>
      {busy ? <span className="absolute inset-0 grid place-items-center bg-white/60"><Loader2 className="animate-spin" /></span> : null}
    </span>
    <span className="flex flex-1 flex-col gap-1 px-3.5 pb-3.5 pt-3">
      <b className="text-[14.5px]">{starter.title}</b>
      {starter.description ? <span className="line-clamp-2 text-[12.5px] leading-snug text-muted-foreground">{starter.description}</span> : null}
      <span className="mt-1.5 flex flex-wrap gap-1">
        {starter.types.map((type) => <span key={type} className="rounded-full bg-muted px-2 py-[3px] text-[11.5px] font-bold text-muted-foreground">{stepDefinition(type).label}</span>)}
        {starter.earns_badge ? <span className="inline-flex items-center gap-[5px] rounded-full bg-[hsl(45_95%_90%)] px-2 py-[3px] text-[11.5px] font-bold text-[hsl(35_80%_28%)]"><Medal size={12} aria-hidden="true" />Badge</span> : null}
      </span>
    </span>
  </button>
}
