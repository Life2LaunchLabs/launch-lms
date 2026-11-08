'use client'

import React from 'react'
import { ChevronDown, Info, RotateCcw } from 'lucide-react'
import { Button } from '@components/ui/button'
import { useLife } from './LifeContext'
import Sheet from './Sheet'
import { estimateTax, stateName, stateOf, type Filing } from './tax'
import { PER_WORD, fromMonthly, money } from './model'

import { tr } from '@/lib/tr'

const parse = (s: string) => { const v = Number(String(s).replace(/[$,\s]/g, '')); return Number.isFinite(v) && v >= 0 ? v : null }
const pct = (r: number) => `${(r * 100).toFixed(r > 0 && r < 0.1 ? 1 : 0)}%`

/** "after 16% tax" beside the Income total, opening a sheet with how the tax on pay from work is worked out. */
export default function TaxButton({ pay, tax }: { pay: number; tax: number }) {
  const { phase, per, updatePhase, readOnly } = useLife()
  const [open, setOpen] = React.useState(false)
  const [src, setSrc] = React.useState<string | null>(null)
  const filing: Filing = phase.tax?.filing || 'single'
  const own = phase.tax?.rate ?? null
  const est = estimateTax(pay * 12, filing, stateOf(phase.place))
  const rate = pay > 0 ? tax / pay : 0
  const setTax = (patch: { filing?: Filing; rate?: number | null }) => updatePhase((p) => { p.tax = { filing, rate: own, ...p.tax, ...patch } })
  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)} className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">
        {own === 0 ? tr('budget.tax.already_after_tax', 'already after tax') : tr('budget.tax.after_pct_tax', 'after {{pct}} tax', { pct: pct(rate) })}<ChevronDown className="size-3.5" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={tr('budget.tax.taxes', 'Taxes')}
        description={tr('budget.tax.summary', '{{tax}} a {{per}} on {{pay}} of pay, {{pct}}{{yours}}.', { tax: money(fromMonthly(tax, per)), per: PER_WORD[per], pay: money(fromMonthly(pay, per)), pct: pct(rate), yours: own == null ? '' : tr('budget.budget_table.your_rate', ' (your rate)') })}>
        <div className="space-y-3">
          <div className={`rounded-xl bg-muted/60 p-3 ${own != null ? 'opacity-75' : ''}`}>
            <div className="flex items-baseline justify-between text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
              <span>{tr('budget.budget_table.estimate', 'Estimate')}</span><span className="tabular-nums normal-case tracking-normal">{pct(est.rate)} · {money(fromMonthly(est.annual / 12, per))} a {PER_WORD[per]}</span>
            </div>
            <ul className="mt-1">
              {est.parts.map((x) => (
                <li key={x.key} className="border-b border-border/60 py-1.5 text-sm last:border-b-0">
                  <div className="flex items-center gap-2">
                    <span className="flex-1">{x.title}</span>
                    <span className="tabular-nums text-muted-foreground">{money(fromMonthly(x.annual / 12, per))}</span>
                    <button type="button" onClick={() => setSrc(src === x.key ? null : x.key)} aria-expanded={src === x.key} aria-label={tr('budget.budget_table.where_tolowercase_comes_from', 'Where {{toLowerCase}} comes from', { toLowerCase: x.title.toLowerCase() })} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted"><Info className="size-3.5" /></button>
                  </div>
                  {src === x.key && <p className="mt-1 text-xs text-muted-foreground">{x.note}. <a className="font-semibold text-[var(--org-primary-color)] underline dark:text-[color-mix(in_srgb,var(--org-primary-color)_45%,white)]" href={x.source.url} target="_blank" rel="noreferrer">{x.source.publisher}, {x.source.title}</a></p>}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-muted-foreground">
              {est.stateCovered ? '' : est.state ? tr('budget.budget_table.statename_s_own_income_tax', '{{stateName}}\'s own income tax isn\'t included yet. ', { stateName: stateName(est.state) }) : tr('budget.budget_table.pick_a_place_for_this', 'Pick a place for this phase to include state tax. ')}
              {tr('budget.budget_table.worked_out_on_work_income', 'Worked out on Work income as wages for a full year, with the standard deduction and no credits. Aid isn\'t taxed here.')}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-semibold text-muted-foreground">{tr('budget.budget_table.filing', 'Filing')}</span>
              {([['single', tr('lit.budget_table.single', 'Single')], ['joint', tr('lit.budget_table.married_filing_together', 'Married, filing together')]] as [Filing, string][]).map(([k, t]) => (
                <button key={k} type="button" aria-pressed={filing === k} disabled={readOnly} onClick={() => setTax({ filing: k })} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${filing === k ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground'}`}>{t}</button>
              ))}
            </div>
            {own != null && <Button variant="ghost" size="sm" className="mt-2" onClick={() => setTax({ rate: null })}><RotateCcw />{tr('budget.budget_table.use_the_estimate', 'Use the estimate')}</Button>}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 text-sm">
            {own == null && !readOnly && <button type="button" onClick={() => setTax({ rate: 0 })} className="mr-auto text-xs font-semibold text-muted-foreground underline decoration-dashed underline-offset-4 hover:text-foreground">{tr('budget.budget_table.my_pay_is_already_after', 'My pay is already after tax')}</button>}
            <span className="text-muted-foreground">{own == null ? tr('budget.budget_table.use_your_own_rate', 'Use your own rate') : own === 0 ? tr('budget.budget_table.your_pay_is_already_after', 'Your pay is already after tax') : tr('budget.budget_table.your_rate_2', 'Your rate')}</span>
            <label className="inline-flex items-baseline font-semibold tabular-nums">
              <input aria-label={tr('budget.budget_table.your_tax_rate_percent', 'Your tax rate, percent')} inputMode="decimal" key={`r${own}`} defaultValue={own == null ? '' : String(own)} placeholder={(est.rate * 100).toFixed(1)}
                style={{ width: '5ch' }}
                className="border-b-[1.5px] border-dashed border-border bg-transparent text-right outline-none placeholder:font-normal focus:border-[var(--org-primary-color)]"
                onBlur={(e) => { const t = e.target.value.trim(); if (!t) return; const n = parse(t.replace('%', '')); if (n == null || n > 100 || n === own) return; setTax({ rate: Math.round(n * 10) / 10 }) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />%
            </label>
          </div>
        </div>
      </Sheet>
    </>
  )
}
