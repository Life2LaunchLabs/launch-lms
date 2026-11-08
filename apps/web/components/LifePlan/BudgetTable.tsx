'use client'

import React from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Plus, Sparkles } from 'lucide-react'
import { Button } from '@components/ui/button'
import type { Line } from '@services/life/life'
import { useLife } from './LifeContext'
import { isWide } from './EstimatesDialog'
import { LifeIcon } from './icons'
import { PerTag, useTotals } from './BudgetSummary'
import LineEditor, { subtitle } from './LineEditor'
import TaxRow from './TaxRow'
import { fromMonthly, money } from './model'

import { tr } from '@/lib/tr'

export { OccupationPicker } from './LineEditor'

/** Income and expenses for the stretch in view, each its own card with its total and an add button above it. */
export default function BudgetTable() {
  const { phase, catalog, per, openAdd, openEstimates, readOnly } = useLife()
  const { lines, pay, tax, inn, out } = useTotals()
  const order = (catalog?.categories || []).map((c) => c.key)
  const rank = (l: Line) => { const i = order.indexOf(l.cat); return i < 0 ? order.length : i }

  const section = (side: 'in' | 'out', title: string, value: number) => {
    const rows = lines.filter((l) => l.side === side).sort((a, b) => rank(a) - rank(b))
    const addLabel = side === 'in' ? tr('budget.add_tray.add_income', 'Add income') : tr('budget.add_tray.add_an_expense', 'Add an expense')
    return (
      <section aria-label={title}>
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
          <span className="flex items-center gap-2">
            {side === 'in' && pay > 0 && <span className="text-xs font-semibold text-muted-foreground">{tr('budget.budget_table.after_tax', 'after tax')}</span>}
            <b className={`text-xl font-extrabold tabular-nums ${side === 'in' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{money(fromMonthly(value, per))}<PerTag per={per} /></b>
            {readOnly ? null : <Button variant="secondary" size="icon" className="size-9 rounded-full" onClick={() => openAdd(side)} aria-label={addLabel} title={addLabel}><Plus /></Button>}
          </span>
        </div>
        <div className="rounded-2xl bg-card px-4 shadow-[0_1px_0_hsl(var(--border))] sm:px-5">
          {rows.map((l, i) => <Row key={l.id} line={l} first={i === 0} />)}
          {!rows.length && <p className="py-4 text-sm text-muted-foreground">{side === 'in' ? tr('budget.budget_table.nothing_coming_in_yet', 'Nothing coming in yet.') : tr('budget.budget_table.nothing_going_out_yet', 'Nothing going out yet.')}</p>}
          {side === 'in' && pay > 0 && <TaxRow pay={pay} tax={tax} />}
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-6">
      {!phase.lines.length && !readOnly && openEstimates ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[color-mix(in_srgb,var(--org-primary-color)_8%,transparent)] px-4 py-4 sm:px-5">
        <span className="min-w-0"><b className="block text-base font-extrabold">{tr('budget.budget_table.start_your_budget', 'Start your budget')}</b><span className="text-sm text-muted-foreground">{tr('budget.budget_table.we_ll_suggest_lines_and', 'We’ll suggest lines and amounts from where you live, how you live and what you’re doing.')}</span></span>
        <Button variant="brand" size="sm" onClick={openEstimates}><Sparkles size={15} />{tr('budget.budget_table.see_estimates', 'See estimates')}</Button>
      </div> : null}
      {section('in', tr('lit.budget_table.income', 'Income'), inn)}
      {section('out', tr('lit.budget_table.expenses', 'Expenses'), out)}
    </div>
  )
}

/** One budget line: icon, name with what its settings are set to, and its amount. Opens in place. */
function Row({ line, first }: { line: Line; first: boolean }) {
  const { phase, catalog, valueOf, per, openLine, setOpenLine, estimates, estimatesLoading } = useLife()
  const item = catalog?.items.find((i) => i.key === line.item)
  const cat = catalog?.categories.find((c) => c.key === line.cat)
  const v = valueOf(phase, line)
  const open = openLine === line.id
  const est = estimates[`${phase.id}:${line.id}`] ?? null
  const value = v.monthly == null ? null : fromMonthly(v.monthly, per)
  const wide = !line.own && isWide(est)
  // Your own number far from ours: say so on the line.
  const far = line.own && v.monthly != null && v.estMonthly != null && Math.abs(v.monthly - v.estMonthly) > Math.max(25, v.estMonthly * 0.15)
  const sub = subtitle(line, item, v)
  return (
    <div id={`row-${line.id}`} className={first ? '' : 'border-t border-border/70'}>
      <button type="button" aria-expanded={open} onClick={() => setOpenLine(open ? null : line.id)} className="flex w-full items-center gap-3 py-3 text-left">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-foreground"><LifeIcon name={item?.icon || cat?.icon} /></span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className={`block truncate ${open ? 'font-extrabold' : 'font-semibold'}`}>{line.title}</span>
          {far && !open ? <small className="flex items-center gap-1 truncate text-xs font-semibold text-amber-600 dark:text-amber-400"><AlertTriangle className="size-3 shrink-0" aria-hidden="true" />{v.monthly! < v.estMonthly! ? tr('budget.line.pct_below', '{{n}}% below estimate', { n: Math.round((1 - v.monthly! / v.estMonthly!) * 100) }) : tr('budget.line.pct_above', '{{n}}% above estimate', { n: Math.round((v.monthly! / v.estMonthly! - 1) * 100) })}</small>
            : sub ? <small className="block truncate text-xs text-muted-foreground">{sub}</small> : null}
        </span>
        {value == null
          ? <span className="text-sm font-semibold text-muted-foreground">{item?.metric && estimatesLoading ? '…' : tr('budget.budget_table.add_your_number', 'Add your number')}</span>
          : <span className={`font-semibold tabular-nums ${line.side === 'in' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{money(value)}<PerTag per={per} />{wide ? <sup className="ml-0.5 font-bold text-amber-600 dark:text-amber-400" title={tr('budget.budget_table.not_for_your_city', 'Not for your city')}>*</sup> : null}</span>}
        {open ? <ChevronDown className="size-4 shrink-0 rotate-180 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
      </button>
      {open && <LineEditor line={line} est={est} item={item} />}
    </div>
  )
}
