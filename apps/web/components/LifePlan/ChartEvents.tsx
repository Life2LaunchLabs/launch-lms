'use client'

import React from 'react'
import { ArrowRight, X } from 'lucide-react'
import { useLife } from './LifeContext'
import { LifeIcon } from './icons'
import { money, monthLabel, phaseOffset, stretches } from './model'
import type { Mark } from './model'

import { tr } from '@/lib/tr'
const ICON: Record<Mark['kind'], string> = { loan: 'landmark', buy: 'shopping-bag', sell: 'tag', once: 'receipt', start: 'flag', short: 'triangle-alert' }

/** The marks that land in each month from g0 to g1 (inclusive), grouped by month. */
export function marksBetween(marks: Mark[], g0: number, g1: number): [number, Mark[]][] {
  const by = new Map<number, Mark[]>()
  marks.forEach((x) => { if (x.g >= g0 && x.g <= g1) by.set(x.g, [...(by.get(x.g) || []), x]) })
  return [...by.entries()].sort((a, b) => a[0] - b[0])
}

/** Up, down or neither, for the dot's color. */
export function markTone(ms: Mark[]): 'in' | 'out' | 'warn' | 'plain' {
  if (ms.some((x) => x.kind === 'short')) return 'warn'
  const sum = ms.reduce((a, x) => a + x.amount, 0)
  return sum > 0.5 ? 'in' : sum < -0.5 ? 'out' : 'plain'
}

export const toneCls = {
  in: 'bg-emerald-600 text-white',
  out: 'bg-[#E0662E] text-white',
  warn: 'bg-red-600 text-white',
  plain: 'bg-card text-foreground ring-2 ring-border',
}

export function markIcon(ms: Mark[]) { return ms.length > 1 ? 'layers' : ICON[ms[0].kind] }

/** A round, clickable dot for the month's marks. */
export function MarkDot({ ms, onClick, active, style, label }: { ms: Mark[]; onClick: () => void; active: boolean; style: React.CSSProperties; label: string }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick() }} aria-label={label} title={label} aria-expanded={active}
      className={`absolute z-[3] grid size-[22px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full shadow-sm transition-transform hover:scale-110 ${toneCls[markTone(ms)]} ${active ? 'scale-110 outline outline-2 outline-offset-2 outline-[var(--org-primary-color)]' : ''}`} style={style}>
      <LifeIcon name={markIcon(ms)} className="size-3" />
    </button>
  )
}

export const markLabel = (ms: Mark[]) => ms.map((x) => (x.kind === 'short' ? tr('lit.chart_events.savings_run_out', 'Savings run out') : x.title)).join(', ')

/**
 * Why the line jumps in month g: each thing that lands, the rest of the month's budget,
 * and savings and debt before and after. "Show it" opens the row it comes from.
 */
export function MarkCard({ g, ms, onClose, onShow, className = '' }: { g: number; ms: Mark[]; onClose: () => void; onShow?: () => void; className?: string }) {
  const { doc, projection, selectStretch, setOpenLine } = useLife()
  const once = ms.reduce((a, x) => a + x.amount, 0)
  const savBefore = projection.sav[g], savAfter = projection.sav[g + 1] ?? projection.sav[g]
  const debtBefore = projection.debt[g], debtAfter = projection.debt[g + 1] ?? projection.debt[g]
  const ownBefore = projection.own[g], ownAfter = projection.own[g + 1] ?? projection.own[g]
  const starts = ms.some((x) => x.kind === 'start')
  const rest = savAfter - savBefore - once
  const show = (x: Mark) => {
    const id = x.kind === 'loan' ? `m:${x.ref}` : x.kind === 'buy' || x.kind === 'sell' ? `own:${x.ref}` : x.kind === 'short' ? 'm:short' : x.kind === 'once' ? `ev:${x.ref}` : null
    // Show the budget as it is that month, then open the row.
    let left = g
    const p = doc.phases.find((ph) => { const o = phaseOffset(doc, ph.id); if (g >= o && g < o + ph.months) { left = g - o; return true } return false })
    if (p) { const s = stretches(doc, p).find((st) => left >= st.m0 && left <= st.m1); if (s) selectStretch(p.id, s.i) }
    onShow?.()
    if (!id) return
    if (!id.startsWith('ev:')) setOpenLine(id)
    setTimeout(() => { const el = document.getElementById(`row-${id}`); el?.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (id.startsWith('ev:')) (el as HTMLElement | null)?.focus({ preventScroll: true }) }, 60)
  }
  return (
    <div role="dialog" aria-label={tr('budget.chart_events.what_happens_in_monthlabel', 'What happens in {{monthLabel}}', { monthLabel: monthLabel(doc.start, g) })} className={`w-[min(20rem,calc(100vw-2.5rem))] rounded-2xl bg-card p-3 text-sm shadow-lg ring-1 ring-border ${className}`}
      onPointerMove={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">{tr('budget.chart_events.why_the_line_moves_monthlabel', 'Why the line moves · {{monthLabel}}', { monthLabel: monthLabel(doc.start, g) })}</p>
        <button type="button" onClick={onClose} aria-label={tr('discover.resource_sheet.close', 'Close')} className="-mr-1 -mt-1 rounded-full p-1 text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
      </div>
      <ul className="mt-2 space-y-2">
        {ms.map((x, k) => {
          const t = explain(doc, x, projection.cardRate)
          return (
            <li key={k} className="flex items-start gap-2.5">
              <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ${toneCls[markTone([x])]}`}><LifeIcon name={ICON[x.kind]} className="size-3.5" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2"><b className="truncate">{t.title}</b>{Math.abs(x.amount) > 0.5 && <b className={`shrink-0 tabular-nums ${x.amount > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-[#B9481A] dark:text-[#F08A5D]'}`}>{money(x.amount, { sign: true })}</b>}</span>
                <span className="block text-xs text-muted-foreground">{t.why}</span>
                {x.kind !== 'start' && <button type="button" onClick={() => show(x)} className="mt-0.5 inline-flex items-center gap-1 text-xs font-extrabold text-[var(--org-primary-color)] dark:text-[color-mix(in_srgb,var(--org-primary-color)_45%,white)]">{tr('budget.chart_events.show_it', 'Show it')}<ArrowRight className="size-3" /></button>}
              </span>
            </li>
          )
        })}
      </ul>
      <div className="mt-3 space-y-1 rounded-xl bg-muted/60 p-2.5 text-xs">
        {!starts && Math.abs(rest) > 0.5 && <p className="flex justify-between gap-2"><span className="text-muted-foreground">{tr('budget.chart_events.the_rest_of_the_month', 'The rest of the month\'s budget')}</span><b className="tabular-nums">{money(rest, { sign: true })}</b></p>}
        <p className="flex justify-between gap-2"><span className="text-muted-foreground">{tr('budget.chart_events.savings', 'Savings')}</span><b className="tabular-nums">{money(savBefore)} → {money(savAfter)}</b></p>
        {Math.abs(ownAfter - ownBefore) > 0.5 && <p className="flex justify-between gap-2"><span className="text-muted-foreground">{tr('budget.chart_events.things_you_own', 'Things you own')}</span><b className="tabular-nums">{money(ownBefore)} → {money(ownAfter)}</b></p>}
        {(debtBefore > 0.5 || debtAfter > 0.5) && <p className="flex justify-between gap-2"><span className="text-muted-foreground">{tr('budget.chart_events.debt', 'Debt')}</span><b className="tabular-nums text-[#B9481A] dark:text-[#F08A5D]">{money(debtBefore)} → {money(debtAfter)}</b></p>}
      </div>
    </div>
  )
}

function explain(doc: ReturnType<typeof useLife>['doc'], x: Mark, cardRate: number): { title: string; why: string } {
  if (x.kind === 'loan') {
    const d = doc.debts.find((v) => v.id === x.ref)
    return x.amount > 0.5
      ? { title: `${x.title} money`, why: tr('budget.chart_events.the_loan_lands_in_your', 'The loan lands in your savings, and you owe {{money}} from now on.', { money: money(d?.balance ?? x.amount) }) }
      : { title: `${x.title} starts`, why: tr('budget.chart_events.you_owe_money_from_now', 'You owe {{money}} from now on. The money doesn\'t go into your savings.', { money: money(d?.balance ?? 0) }) }
  }
  if (x.kind === 'buy') {
    const a = doc.assets.find((v) => v.id === x.ref)
    return { title: `You buy ${x.title.toLowerCase()}`, why: a?.loan_id ? tr('lit.chart_events.this_is_the_down_payment', 'This is the down payment. A loan covers the rest, so debt goes up too.') : tr('lit.chart_events.paid_from_your_savings_it', 'Paid from your savings. It now counts as something you own.') }
  }
  if (x.kind === 'sell') {
    const a = doc.assets.find((v) => v.id === x.ref)
    return { title: `You sell ${x.title.toLowerCase()}`, why: a?.loan_id ? tr('lit.chart_events.what_s_left_of_the', 'What\'s left of the sale price after paying off its loan.') : tr('lit.chart_events.the_sale_price_goes_into', 'The sale price goes into your savings.') }
  }
  if (x.kind === 'once') return { title: x.title, why: x.amount >= 0 ? tr('lit.chart_events.one_time_money_that_comes', 'One-time money that comes in.') : 'A one-time cost, paid from your savings.' }
  if (x.kind === 'start') return { title: x.title, why: tr('budget.chart_events.you_set_your_real_numbers', 'You set your real numbers here, so they replace what the plan worked out.') }
  return { title: tr('budget.chart_events.savings_run_out', 'Savings run out'), why: cardRate > 0 ? `More goes out than you have, so the rest goes on a credit card at ${cardRate}% a year and shows as debt.` : tr('lit.chart_events.more_goes_out_than_you', 'More goes out than you have, so the rest goes on a credit card and shows as debt.') }
}
