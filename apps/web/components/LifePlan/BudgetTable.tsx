'use client'

import React from 'react'
import { AlertTriangle, CalendarRange, ChevronRight, MoreVertical, Plus, Sparkles, Trash2 } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { Button } from '@components/ui/button'
import type { Line } from '@services/life/life'
import { useLife } from './LifeContext'
import { isWide } from './EstimatesDialog'
import { LifeIcon } from './icons'
import { PerTag, useTotals } from './BudgetSummary'
import LineEditor, { DatesSheet, subtitle } from './LineEditor'
import TaxButton from './TaxButton'
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
        <div className="mb-1.5 flex items-center justify-between gap-3 px-1">
          <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
          <span className="flex items-center gap-2">
            {side === 'in' && pay > 0 && <TaxButton pay={pay} tax={tax} />}
            <b className={`text-lg font-extrabold tabular-nums ${side === 'in' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{money(fromMonthly(value, per))}<PerTag per={per} /></b>
            {readOnly ? null : <Button variant="secondary" size="icon" className="size-8 rounded-full [&_svg]:size-4" onClick={() => openAdd(side)} aria-label={addLabel} title={addLabel}><Plus /></Button>}
          </span>
        </div>
        <div className="rounded-2xl bg-card px-3 shadow-[0_1px_0_hsl(var(--border))] sm:px-4">
          {rows.map((l, i) => <Row key={l.id} line={l} first={i === 0} />)}
          {!rows.length && <p className="py-4 text-sm text-muted-foreground">{side === 'in' ? tr('budget.budget_table.nothing_coming_in_yet', 'Nothing coming in yet.') : tr('budget.budget_table.nothing_going_out_yet', 'Nothing going out yet.')}</p>}
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-5">
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
  const { phase, catalog, valueOf, per, openLine, setOpenLine, estimates, estimatesLoading, updatePhase, readOnly } = useLife()
  const [dates, setDates] = React.useState(false)
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
    <div id={`row-${line.id}`} className={`relative ${first ? '' : 'border-t border-border/70'}`}>
      <button type="button" aria-expanded={open} onClick={() => setOpenLine(open ? null : line.id)} className="flex w-full items-center gap-2.5 py-2 text-left text-[15px]">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground"><LifeIcon name={item?.icon || cat?.icon} className="size-[15px]" /></span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className={`block truncate ${open ? 'font-extrabold' : 'font-semibold'}`}>{line.title}</span>
          {far && !open ? <small className="flex items-center gap-1 truncate text-[11px] font-semibold text-amber-600 dark:text-amber-400"><AlertTriangle className="size-3 shrink-0" aria-hidden="true" />{v.monthly! < v.estMonthly! ? tr('budget.line.pct_below', '{{n}}% below estimate', { n: Math.round((1 - v.monthly! / v.estMonthly!) * 100) }) : tr('budget.line.pct_above', '{{n}}% above estimate', { n: Math.round((v.monthly! / v.estMonthly! - 1) * 100) })}</small>
            : sub ? <small className="block truncate text-[11px] text-muted-foreground">{sub}</small> : null}
        </span>
        {value == null
          ? <span className="text-sm font-semibold text-muted-foreground">{item?.metric && estimatesLoading ? '…' : tr('budget.budget_table.add_your_number', 'Add your number')}</span>
          : <span className={`font-semibold tabular-nums ${line.side === 'in' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{money(value)}<PerTag per={per} />{wide ? <sup className="ml-0.5 font-bold text-amber-600 dark:text-amber-400" title={tr('budget.budget_table.not_for_your_city', 'Not for your city')}>*</sup> : null}</span>}
        {open ? <span className="w-8 shrink-0" aria-hidden="true" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
      </button>
      {open && !readOnly && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><button type="button" className="absolute right-0 top-2 grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={tr('budget.line.line_options', 'Options for {{title}}', { title: line.title })}><MoreVertical className="size-4" /></button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={() => setDates(true)}><CalendarRange className="mr-2 size-4" />{tr('budget.line.adjust_dates', 'Adjust dates')}</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => { updatePhase((p) => { p.lines = p.lines.filter((l) => l.id !== line.id) }); setOpenLine(null) }}><Trash2 className="mr-2 size-4" />{tr('budget.budget_table.remove', 'Remove')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {open && <LineEditor line={line} est={est} item={item} />}
      {dates && <DatesSheet line={line} open onClose={() => setDates(false)} />}
    </div>
  )
}
