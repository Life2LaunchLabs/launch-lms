'use client'

import React from 'react'
import { Info } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import { useLife } from './LifeContext'
import { isTaxable, monthlyTax } from './tax'
import { activeAt, fromMonthly, money } from './model'

import { tr } from '@/lib/tr'

/** The stretch in view, a month at a time: pay before tax, the tax on it, income after tax, expenses, and what's left after debt payments and savings. */
export function useTotals() {
  const { phase, stretch, valueOf, projection } = useLife()
  const lines = phase.lines.filter((l) => activeAt(l, stretch.m0))
  const total = (side: 'in' | 'out') => lines.filter((l) => l.side === side).reduce((a, l) => a + (valueOf(phase, l).monthly ?? 0), 0)
  const pay = lines.filter(isTaxable).reduce((a, l) => a + (valueOf(phase, l).monthly ?? 0), 0)
  const tax = monthlyTax(phase, pay)
  const inn = total('in') - tax, out = total('out')
  const debtPay = projection.paid[stretch.g0] ?? 0, saving = projection.put[stretch.g0] ?? 0
  return { lines, pay, tax, inn, out, debtPay, saving, left: inn - out - debtPay - saving }
}

/** The muted "/mo" after an amount. */
export function PerTag({ per }: { per: string }) {
  return <span className="ml-px text-[0.62em] font-semibold text-muted-foreground">/{tr(`budget.per_short.${per}`, per)}</span>
}

/** Three numbers at the top: income after tax, expenses (loan payments included), and what goes into savings (or the gap). */
export default function BudgetSummary() {
  const { per } = useLife()
  const { inn, out, left, debtPay, saving, pay } = useTotals()
  const short = left < -0.5
  const saved = saving + left
  const tile = 'min-w-0 rounded-xl bg-card px-2.5 py-1.5 shadow-[0_1px_0_hsl(var(--border))] sm:px-3.5 sm:py-2'
  const big = 'block truncate text-base font-extrabold tabular-nums tracking-tight sm:text-xl'
  return (
    <section aria-label={tr('budget.summary.this_stretch', 'This stretch in numbers')}>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className={tile}>
          <span className="block truncate text-[11px] font-semibold text-muted-foreground sm:text-xs" title={pay > 0 ? tr('budget.budget_table.after_tax', 'after tax') : undefined}>{tr('lit.budget_table.income', 'Income')}</span>
          <b className={`${big} text-emerald-600 dark:text-emerald-400`}>{money(fromMonthly(inn, per))}<PerTag per={per} /></b>
        </div>
        <div className={tile}>
          <span className="block truncate text-[11px] font-semibold text-muted-foreground sm:text-xs">{tr('lit.budget_table.expenses', 'Expenses')}</span>
          <b className={big}>{money(fromMonthly(out + debtPay, per))}<PerTag per={per} /></b>
        </div>
        <div className={`${tile} ${short ? 'bg-red-500/10 dark:bg-red-500/[0.13]' : ''}`}>
          <span className={`flex items-center gap-1 text-[11px] font-semibold sm:text-xs ${short ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
            <span className="truncate">{short ? tr('budget.summary.gap', 'Gap') : tr('budget.summary.saving', 'Saving')}</span>
            {saving > 0.5 && (
              <Popover>
                <PopoverTrigger className="rounded-full p-0.5 hover:bg-muted" aria-label={tr('budget.summary.how_this_adds_up', 'How this adds up')}><Info className="size-3.5" /></PopoverTrigger>
                <PopoverContent side="bottom" align="end" className="w-64 p-3 text-xs text-muted-foreground">
                  {short
                    ? tr('budget.summary.gap_after', 'After {{m}} into your accounts, more goes out than comes in. The gap comes out of your savings account, then goes on a card.', { m: money(fromMonthly(saving, per)) })
                    : tr('budget.summary.saving_split', '{{a}} into your accounts and {{b}} left in your savings account.', { a: money(fromMonthly(saving, per)), b: money(fromMonthly(left, per)) })}
                </PopoverContent>
              </Popover>
            )}
          </span>
          <b className={`${big} ${short ? 'text-red-600 dark:text-red-400' : ''}`}>{short ? money(fromMonthly(left, per)) : `${saved > 0.5 ? '+' : ''}${money(fromMonthly(saved, per))}`}<PerTag per={per} /></b>
        </div>
      </div>
    </section>
  )
}
