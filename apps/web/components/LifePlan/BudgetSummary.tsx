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

/** Three numbers at the top: income after tax, expenses, and what's left over (or short). */
export default function BudgetSummary() {
  const { per, phase, projection } = useLife()
  const { inn, out, left, debtPay, saving, pay } = useTotals()
  const missing = projection.missing.filter((x) => x.phase === phase.id).length
  const short = left < -0.5
  const tile = 'min-w-0 rounded-2xl bg-card px-2.5 py-2.5 shadow-[0_1px_0_hsl(var(--border))] sm:px-4 sm:py-3'
  const big = 'block truncate text-base font-extrabold tabular-nums tracking-tight sm:text-2xl'
  return (
    <section aria-label={tr('budget.summary.this_stretch', 'This stretch in numbers')}>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className={tile}>
          <span className="block truncate text-xs font-semibold text-muted-foreground sm:text-sm" title={pay > 0 ? tr('budget.budget_table.after_tax', 'after tax') : undefined}>{tr('lit.budget_table.income', 'Income')}</span>
          <b className={`${big} text-emerald-600 dark:text-emerald-400`}>{money(fromMonthly(inn, per))}<PerTag per={per} /></b>
        </div>
        <div className={tile}>
          <span className="block truncate text-xs font-semibold text-muted-foreground sm:text-sm">{tr('lit.budget_table.expenses', 'Expenses')}</span>
          <b className={big}>{money(fromMonthly(out, per))}<PerTag per={per} /></b>
        </div>
        <div className={`${tile} ${short ? 'bg-red-50 dark:bg-red-950/50' : ''}`}>
          <span className={`flex items-center gap-1 text-xs font-semibold sm:text-sm ${short ? 'text-red-600 dark:text-red-300' : 'text-muted-foreground'}`}>
            <span className="truncate">{short ? tr('budget.summary.gap', 'Gap') : tr('budget.summary.left_over', 'Left over')}</span>
            {(debtPay > 0 || saving > 0) && (
              <Popover>
                <PopoverTrigger className="rounded-full p-0.5 hover:bg-muted" aria-label={tr('budget.summary.how_this_adds_up', 'How this adds up')}><Info className="size-3.5" /></PopoverTrigger>
                <PopoverContent side="bottom" align="end" className="w-64 p-3 text-xs text-muted-foreground">
                  {tr('budget.budget_table.after', 'After')}{' '}{[debtPay > 0 && tr('budget.summary.to_debt', '{{money}} to debt', { money: money(fromMonthly(debtPay, per)) }), saving > 0 && tr('budget.summary.into_savings', '{{money}} into savings', { money: money(fromMonthly(saving, per)) })].filter(Boolean).join(tr('budget.summary.and', ' and '))}.{' '}
                  {short ? tr('budget.summary.short_comes_from', 'The gap comes out of savings, then goes on a card.') : tr('budget.budget_table.what_s_left_goes_into', 'What\'s left goes into your savings account.')}
                </PopoverContent>
              </Popover>
            )}
          </span>
          <b className={`${big} ${short ? 'text-red-600 dark:text-red-300' : ''}`}>{left > 0.5 ? '+' : ''}{money(fromMonthly(left, per))}<PerTag per={per} /></b>
        </div>
      </div>
      {missing > 0 && <p className="mt-2 text-xs text-muted-foreground">{missing === 1 ? tr('budget.phase_chart.one_line_has', 'One line has') : tr('budget.phase_chart.missing_lines_have', '{{missing}} lines have', { missing })}{' '}{tr('budget.phase_chart.no_number_yet_so', 'no number yet, so')}{' '}{missing === 1 ? tr('budget.phase_chart.it_isn_t', 'it isn\'t') : tr('budget.phase_chart.they_aren_t', 'they aren\'t')}{' '}{tr('budget.phase_chart.counted', 'counted.')}</p>}
    </section>
  )
}
