'use client'
/* eslint-disable no-unused-vars -- parameter names in function types */

import React from 'react'
import useSWR from 'swr'
import { Check, ChevronDown, Home, Info, MapPin, Sparkles, Briefcase, Users } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@components/ui/dialog'
import { Button } from '@components/ui/button'
import { Skeleton } from '@components/ui/skeleton'
import { lifeApi, type Catalog, type Estimate, type Line, type Phase } from '@services/life/life'
import { activityText, householdLabel, livingLabel } from '@components/Goals/phases/setup'
import { cn } from '@/lib/utils'
import { estimateQuery, lineValue, money, toMonthly } from './model'
import { applyRows, planRows, shareSettings, type Row } from './prefill'

import { tr } from '@/lib/tr'
export type EstimatesMode = 'start' | 'change' | 'fill'
interface Knob { share?: number; hours?: number; plan?: string }
/** A state or national figure stands in for the city. A school's own figure (filed under the US) doesn't. */
export const isWide = (e?: Estimate | null) => !!e && ['state', 'us'].includes(e.level) && !e.dims?.school

/**
 * Estimates: the lines and amounts a phase's picks suggest, as one list that reads like the budget.
 * Start a budget from them, fill in what's missing, or, after a pick changes (`base` is the phase
 * before), see what to add, remove and update. With `auto` nothing is shown: the ticked-by-default
 * changes apply on their own (the learner said "don't ask").
 */
export default function EstimatesDialog({ open, mode, base, phase, catalog, token, auto, onApply, onClose }: {
  open: boolean
  mode: EstimatesMode
  base: Phase | null
  phase: Phase
  catalog?: Catalog
  token?: string
  auto?: boolean
  onApply: (lines: Line[], opts: { dontAsk: boolean; count: number }) => void
  /** `empty`: closed by itself because nothing in the budget changes. */
  onClose: (empty?: boolean) => void
}) {
  const [checked, setChecked] = React.useState<Record<string, boolean>>({})
  const [knobs, setKnobs] = React.useState<Record<string, Knob>>({})
  const [info, setInfo] = React.useState<string | null>(null)
  const [dontAsk, setDontAsk] = React.useState(false)
  React.useEffect(() => { if (open) { setChecked({}); setKnobs({}); setInfo(null); setDontAsk(false) } }, [open, base])

  const before = mode === 'change' ? base : null
  const rows = React.useMemo(() => (catalog ? planRows(before, phase, catalog) : []), [before, phase, catalog])
  const nextOf = React.useCallback((r: Row): Line | undefined => {
    if (!r.next) return undefined
    const k = knobs[r.id]
    if (!k) return r.next
    const settings = { ...r.next.settings }
    if (k.share != null) Object.assign(settings, r.item === 'rent' ? shareSettings(phase.living, k.share, phase.household) : { share: k.share })
    if (k.plan) settings.plan = k.plan
    return { ...r.next, settings, hours: k.hours ?? r.next.hours }
  }, [knobs, phase.living, phase.household])

  const queries = React.useMemo(() => {
    if (!catalog) return []
    const out: { id: string; metric: string; place?: string | null; dims: Record<string, any> }[] = []
    const add = (id: string, p: Phase, l?: Line) => { const q = l && estimateQuery(catalog, p, l); if (q) out.push({ ...q, id }) }
    for (const r of rows) {
      if (r.kind !== 'add') add(`o|${r.id}`, before || phase, r.line)
      if (r.kind !== 'remove') add(`n|${r.id}`, phase, nextOf(r))
    }
    return out
  }, [rows, catalog, before, phase, nextOf])
  const qKey = JSON.stringify(queries)
  const { data, isLoading } = useSWR(open && token && queries.length ? ['life-estimates-prefill', qKey] : null, () => lifeApi.estimates(queries, token), { revalidateOnFocus: false, keepPreviousData: true })
  const est: Record<string, Estimate | null> = React.useMemo(() => data?.estimates || {}, [data])
  const loading = open && !!queries.length && (isLoading || !data)

  /** Each row with its amounts a month: what it was, what it would be, and what it does to the money left over. */
  const shown = React.useMemo(() => rows.map((r) => {
    const next = nextOf(r)
    const oldEst = r.line ? lineValue(r.line, est[`o|${r.id}`]).estMonthly : null
    const newEst = next ? lineValue(next, est[`n|${r.id}`]).estMonthly : null
    const mine = !!r.line?.own
    const was = r.line ? (mine ? toMonthly(r.line.own!.value, r.line.own!.unit, r.line.own!.hours ?? r.line.hours) : oldEst) : null
    const dir = r.side === 'in' ? 1 : -1
    const effect = r.kind === 'add' ? dir * (newEst ?? 0) : r.kind === 'remove' ? -dir * (was ?? 0) : dir * ((newEst ?? 0) - (was ?? 0))
    const moved = r.kind !== 'change' || !!knobs[r.id] || (newEst != null && (oldEst == null || Math.abs(newEst - oldEst) >= 1))
    return { r, next, was, now: newEst, mine, effect, moved, src: r.kind === 'remove' ? est[`o|${r.id}`] : est[`n|${r.id}`], def: r.kind === 'change' ? !mine : true }
  }), [rows, nextOf, est, knobs])
  const list = React.useMemo(() => shown.filter((x) => x.moved), [shown])
  const isOn = (x: (typeof list)[number]) => checked[x.r.id] ?? x.def
  const on = list.filter(isOn)
  const total = (side: 'in' | 'out') => on.filter((x) => x.r.side === side).reduce((a, x) => a + x.effect, 0)
  // Starting or filling in: left over counts what the budget already has, plus what's ticked here.
  const has = mode === 'change' ? 0 : phase.lines.reduce((a, l) => {
    const row = shown.find((x) => x.r.line?.id === l.id)
    return a + (l.side === 'in' ? 1 : -1) * ((row ? row.was : lineValue(l, null).monthly) ?? 0)
  }, 0)
  const net = has + total('in') + total('out')

  const apply = (ask: boolean) => {
    const keep = new Set(list.filter((x) => checked[x.r.id] ?? x.def).map((x) => x.r.id))
    const rowsNow = list.map((x) => ({ ...x.r, next: x.next }))
    const lines = applyRows(phase.lines, rowsNow, (r) => keep.has(r.id), (r) => list.find((x) => x.r.id === r.id)?.was ?? null)
    onApply(lines, { dontAsk: ask, count: keep.size })
  }
  const applyRef = React.useRef(apply)
  React.useEffect(() => { applyRef.current = apply })

  // "Don't ask": once the amounts are in, apply what's ticked by default and say so.
  const done = React.useRef(false)
  React.useEffect(() => { if (!open) done.current = false }, [open])
  React.useEffect(() => {
    if (!open || loading || done.current || !catalog) return
    // A change that moves nothing in the budget doesn't need asking about.
    if (!auto && (mode !== 'change' || list.length)) return
    done.current = true
    if (!list.length) { onClose(true); return }
    applyRef.current(false)
    toast.success(`Updated ${on.length} budget line${on.length === 1 ? '' : 's'} to the new estimates.`)
    onClose()
  }, [auto, open, loading, list.length, on.length, onClose, catalog, mode])
  if (auto || (mode === 'change' && (loading || !catalog || !list.length))) return null

  const start = mode !== 'change'
  const chips: { icon: React.ReactNode; now: string; was?: string }[] = []
  const place = (p?: Phase | null) => p?.place_label || 'No place yet'
  const doing = (p?: Phase | null) => (p?.activities || []).map(activityText).join(' + ') || 'Nothing picked'
  if (start) {
    if (phase.place_label) chips.push({ icon: <MapPin size={14} />, now: phase.place_label })
    if (phase.living) chips.push({ icon: <Home size={14} />, now: livingLabel(phase.living) })
    if (phase.activities?.length) chips.push({ icon: <Briefcase size={14} />, now: doing(phase) })
    chips.push({ icon: <Users size={14} />, now: householdLabel(phase.household) })
  } else if (base) {
    if ((base.place || '') !== (phase.place || '')) chips.push({ icon: <MapPin size={14} />, now: place(phase), was: place(base) })
    if ((base.living || '') !== (phase.living || '')) chips.push({ icon: <Home size={14} />, now: livingLabel(phase.living) || 'Not picked', was: (livingLabel(base.living) || 'not picked').toLowerCase() })
    if (doing(base) !== doing(phase)) chips.push({ icon: <Briefcase size={14} />, now: doing(phase), was: doing(base) })
    if (householdLabel(base.household) !== householdLabel(phase.household) || JSON.stringify(base.household?.kids || []) !== JSON.stringify(phase.household?.kids || [])) chips.push({ icon: <Users size={14} />, now: householdLabel(phase.household), was: householdLabel(base.household).toLowerCase() })
  }

  const amount = (v: number) => <>{money(Math.round(v), { sign: true })}<span className="ml-px text-[0.8em] font-normal text-muted-foreground">{tr('budget.estimates_dialog.mo', '/mo')}</span></>
  const section = (side: 'in' | 'out', title: string) => {
    const items = list.filter((x) => x.r.side === side)
    if (!items.length) return null
    return <div className="grid">
      <h4 className="pb-1 pt-2 text-base font-extrabold">{title}</h4>
      {items.map((x) => <RowView key={x.r.id} x={x} on={isOn(x)} info={info === x.r.id} amount={amount} loading={loading} catalog={catalog}
        onToggle={() => setChecked({ ...checked, [x.r.id]: !isOn(x) })} onInfo={() => setInfo(info === x.r.id ? null : x.r.id)}
        onKnob={(k) => setKnobs({ ...knobs, [x.r.id]: { ...knobs[x.r.id], ...k } })} />)}
      <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_36px] items-baseline gap-x-2.5 border-t border-border pt-1.5 text-sm text-muted-foreground">
        <span>{start ? tr('budget.estimates_dialog.total', 'Total') : tr('careers.career_profile.change', 'Change')}</span>
        <b className={cn('text-[15px] font-extrabold tabular-nums', side === 'in' ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground')}>{amount(total(side))}</b><span />
      </div>
    </div>
  }

  return <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
    <DialogContent className="max-h-[92dvh] max-w-[440px] overflow-y-auto p-5">
      <DialogTitle className="text-xl font-extrabold">{tr('budget.estimates_dialog.estimates', 'Estimates')}</DialogTitle>
      <DialogDescription className="sr-only">{start ? tr('budget.estimates_dialog.lines_and_amounts_for_this', 'Lines and amounts for this phase, from where you live, how you live and what you’re doing.') : tr('budget.estimates_dialog.what_your_change_does_to', 'What your change does to this phase’s budget.')}</DialogDescription>
      {chips.length ? <div className="mt-3 grid gap-1.5">{chips.map((c, i) => <div key={i} className="flex flex-wrap items-center gap-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-semibold">{c.icon}{c.now}</span>
        {c.was ? <span className="text-sm text-muted-foreground">{tr('budget.estimates_dialog.was_was', 'was {{was}}', { was: c.was })}</span> : null}
      </div>)}</div> : null}
      {!catalog || (loading && !list.length) ? <div className="mt-4 grid gap-2"><Skeleton className="h-6" /><Skeleton className="h-6" /><Skeleton className="h-6" /></div>
        : !list.length ? <p className="mt-4 text-sm text-muted-foreground">{start ? tr('budget.estimates_dialog.your_budget_already_has_every', 'Your budget already has every line we’d suggest.') : tr('budget.estimates_dialog.nothing_in_your_budget_changes', 'Nothing in your budget changes.')}</p>
        : <div className="mt-2 grid gap-2">
          {section('in', 'Income')}
          {section('out', 'Expenses')}
          <div className="grid grid-cols-[minmax(0,1fr)_auto_36px] items-baseline gap-x-2.5 border-t border-border pt-2.5">
            <span className="text-base font-extrabold">{start ? tr('budget.estimates_dialog.left_over_before_taxes', 'Left over, before taxes') : tr('budget.estimates_dialog.left_over_changes_by', 'Left over changes by')}</span>
            <b className={cn('font-extrabold tabular-nums', net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>{amount(net)}</b><span />
          </div>
          <p className="text-xs text-muted-foreground">{tr('budget.estimates_dialog.lines_with', 'Lines with')}{' '}<span className="font-bold text-amber-600 dark:text-amber-400">*</span>{' '}{tr('budget.estimates_dialog.use_a_state_or_national', 'use a state or national figure, not one for your city. Tap')}{' '}<Info className="inline size-3" />{' '}{tr('budget.estimates_dialog.to_see_where_a_number', 'to see where a number comes from.')}</p>
        </div>}
      {list.length && !start ? <label className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} className="size-4 accent-[var(--org-primary-color)]" />{tr('budget.estimates_dialog.don_t_ask_next_time', 'Don’t ask next time, just update')}</label> : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {list.length ? <Button variant="brand" disabled={!on.length || !catalog} onClick={() => { apply(dontAsk); onClose() }}><Sparkles size={15} />{start ? `Add ${on.length} line${on.length === 1 ? '' : 's'}` : `Apply ${on.length} change${on.length === 1 ? '' : 's'}`}</Button> : null}
        <Button variant="ghost" onClick={() => onClose()}>{list.length ? tr('budget.estimates_dialog.not_now', 'Not now') : tr('discover.resource_sheet.close', 'Close')}</Button>
      </div>
    </DialogContent>
  </Dialog>
}

interface Shown { r: Row; next?: Line; was: number | null; now: number | null; mine: boolean; effect: number; src?: Estimate | null }

/** One line: tick, name, old → new for a change, the amount, and where it comes from; its knobs as chips underneath. */
function RowView({ x, on, info, amount, loading, catalog, onToggle, onInfo, onKnob }: { x: Shown; on: boolean; info: boolean; amount: (v: number) => React.ReactNode; loading: boolean; catalog?: Catalog; onToggle: () => void; onInfo: () => void; onKnob: (k: Knob) => void }) {
  const { r, src } = x
  const gone = r.kind === 'remove'
  const value = r.kind === 'change' ? x.effect : r.kind === 'add' ? (x.now == null ? null : (r.side === 'in' ? 1 : -1) * x.now) : (x.was == null ? null : (r.side === 'in' ? 1 : -1) * x.was)
  const wide = isWide(src)
  const shareSetting = catalog?.items.find((i) => i.key === r.item)?.settings?.find((s) => s.key === 'share')
  const planSetting = catalog?.items.find((i) => i.key === r.item)?.settings?.find((s) => s.key === 'plan')
  const next = x.next
  return <div className="grid">
    <div className="grid grid-cols-[20px_minmax(0,1fr)_auto_auto_36px] items-center gap-x-2.5 py-1">
      <button type="button" role="checkbox" aria-checked={on} aria-label={`${gone ? 'Remove' : r.kind === 'add' ? 'Add' : 'Update'} ${r.title}`} onClick={onToggle}
        className={cn('grid size-5 place-items-center rounded-md border-2', on ? 'border-[var(--org-primary-color)] bg-[var(--org-primary-color)] text-white' : 'border-border')}>{on ? <Check size={13} strokeWidth={3} /> : null}</button>
      <span className={cn('min-w-0 truncate', gone && 'text-muted-foreground line-through', !on && 'text-muted-foreground')}>{r.title}</span>
      <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{r.kind === 'change' && x.now != null ? <>{x.mine ? tr('budget.estimates_dialog.yours', 'yours ') : ''}<s>{money(Math.round(x.was ?? 0))}</s> → {money(Math.round(x.now))}</> : null}</span>
      <span className={cn('min-w-[76px] text-right font-semibold tabular-nums', (gone || !on) && 'text-muted-foreground', gone && 'line-through')}>
        {value == null ? (loading ? '…' : <span className="text-xs font-normal text-muted-foreground">{tr('budget.estimates_dialog.no_estimate_yet', 'No estimate yet')}</span>) : amount(value)}
      </span>
      <span className="inline-flex w-9 items-center justify-end gap-px">
        {wide ? <span className="font-bold text-amber-600 dark:text-amber-400" aria-label={tr('budget.budget_table.not_for_your_city', 'Not for your city')}>*</span> : null}
        {src ? <button type="button" onClick={onInfo} aria-expanded={info} aria-label={`Where ${r.title.toLowerCase()} comes from`} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Info className="size-4" /></button> : null}
      </span>
    </div>
    {!gone && next && (shareSetting || planSetting || r.item === 'job') ? <div className="flex flex-wrap gap-1.5 pb-1.5 pl-[30px]">
      {shareSetting ? <label className="relative inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold hover:ring-1 hover:ring-[var(--org-primary-color)]">
        <select aria-label={tr('budget.estimates_dialog.split_with', 'Split with')} value={Number(next.settings.share || 1)} onChange={(e) => onKnob({ share: Number(e.target.value) })} className="cursor-pointer appearance-none bg-transparent pr-4 outline-none">
          {shareSetting.choices!.map(([v, t]) => <option key={String(v)} value={v}>{t}</option>)}
        </select><ChevronDown className="pointer-events-none absolute right-2 size-3" />
      </label> : null}
      {planSetting ? <label className="relative inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold hover:ring-1 hover:ring-[var(--org-primary-color)]">
        <select aria-label={planSetting.title} value={String(next.settings.plan || planSetting.default)} onChange={(e) => onKnob({ plan: e.target.value })} className="cursor-pointer appearance-none bg-transparent pr-4 outline-none">
          {planSetting.choices!.map(([v, t]) => <option key={String(v)} value={v}>{t}</option>)}
        </select><ChevronDown className="pointer-events-none absolute right-2 size-3" />
      </label> : null}
      {r.item === 'job' ? <Hours value={next.hours ?? 40} onChange={(h) => onKnob({ hours: h })} /> : null}
    </div> : null}
    {info && src ? <p className="mb-1.5 ml-[30px] mr-9 rounded-lg bg-muted/70 px-2.5 py-1.5 text-xs text-muted-foreground">
      {gone ? tr('budget.estimates_dialog.was_based_on', 'Was based on: ') : ''}<b className="text-foreground">{src.source.title}</b>, {src.source.publisher}. {src.label}.{src.scaled_by ? <>{' '}{tr('budget.estimates_dialog.local_prices', 'Local prices:')}{' '}<b className="text-foreground">{src.scaled_by.source.title}</b>{tr('budget.estimates_dialog.publisher_place_label_round_us', ', {{publisher}} ({{place_label}} {{round}}, US = 100).', { publisher: src.scaled_by.source.publisher, place_label: src.scaled_by.place_label, round: Math.round(src.scaled_by.value) })}</> : src.place_label ? ` ${src.place_label}.` : ''}
      {wide ? tr('budget.budget_table.not_for_value_itself_this', ' * Not for {{value}} itself: this is the {{value2}} figure.', { value: src.asked_place_label || 'your city', value2: src.level === 'us' ? 'national' : 'state' }) : ''}
    </p> : null}
  </div>
}

/** "20 hrs/wk": tap to type a new number. */
function Hours({ value, onChange }: { value: number; onChange: (h: number) => void }) {
  const [edit, setEdit] = React.useState(false)
  if (!edit) return <button type="button" onClick={() => setEdit(true)} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold hover:ring-1 hover:ring-[var(--org-primary-color)]">{tr('budget.estimates_dialog.value_hrs_wk', '{{value}} hrs/wk', { value })}</button>
  return <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold">
    <input autoFocus aria-label={tr('budget.add_tray.hours_a_week', 'Hours a week')} inputMode="numeric" defaultValue={value} className="w-8 bg-transparent text-right outline-none"
      onBlur={(e) => { const h = Number(e.target.value); if (Number.isFinite(h) && h > 0 && h <= 80) onChange(Math.round(h)); setEdit(false) }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEdit(false) }} />{' '}{tr('budget.estimates_dialog.hrs_wk', 'hrs/wk')}
  </span>
}
