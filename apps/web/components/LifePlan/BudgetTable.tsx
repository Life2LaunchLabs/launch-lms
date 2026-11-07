'use client'

import React from 'react'
import { AlertTriangle, ChevronDown, Info, Plus, RotateCcw, Search, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { lifeApi, type Estimate, type Line, type Occupation, type Unit } from '@services/life/life'
import { useLife } from './LifeContext'
import { isWide } from './EstimatesDialog'
import { LifeIcon } from './icons'
import { estimateTax, isTaxable, monthlyTax, stateName, stateOf, type Filing } from './tax'
import { DEFAULT_HOURS, PER_WORD, SHARED_METRICS, activeAt, fromMonthly, money, monthLabel, phaseOffset, toMonthly } from './model'

import { tr } from '@/lib/tr'
const parse = (s: string) => { const v = Number(String(s).replace(/[$,\s]/g, '')); return Number.isFinite(v) && v >= 0 ? v : null }
const fmt = (v: number, cents = false) => v.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })

/** Income and expenses for the stretch in view, grouped like the Add tray. */
export default function BudgetTable() {
  const { doc, phase, stretch, catalog, valueOf, per, openAdd, openEstimates, projection, readOnly } = useLife()
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({})
  const lines = phase.lines.filter((l) => activeAt(l, stretch.m0))
  const total = (side: 'in' | 'out') => lines.filter((l) => l.side === side).reduce((a, l) => a + (valueOf(phase, l).monthly ?? 0), 0)
  const pay = lines.filter(isTaxable).reduce((a, l) => a + (valueOf(phase, l).monthly ?? 0), 0)
  const tax = monthlyTax(phase, pay)
  const inn = total('in') - tax, out = total('out')
  const g = stretch.g0
  const debtPay = projection.paid[g] ?? 0, saving = projection.put[g] ?? 0
  const left = inn - out - debtPay - saving
  const cats = catalog?.categories || []

  const section = (side: 'in' | 'out', title: string, value: number) => {
    const open = !collapsed[side]
    const groups = cats.filter((c) => c.side === side).map((c) => ({ c, rows: lines.filter((l) => l.side === side && (l.cat === c.key || (!cats.some((x) => x.key === l.cat) && c.key === `other_${side}`))) }))
    return (
      <div className="border-b border-border last:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5">
          <button type="button" aria-expanded={open} onClick={() => setCollapsed({ ...collapsed, [side]: open })} className="inline-flex items-center gap-2 text-lg font-extrabold">
            {title}<ChevronDown className={`size-4 transition-transform ${open ? '' : '-rotate-90'}`} />
          </button>
          <span className="flex items-baseline gap-2">
            {side === 'in' && pay > 0 && <span className="text-xs font-semibold text-muted-foreground">{tr('budget.budget_table.after_tax', 'after tax')}</span>}
            <b className={`text-lg font-extrabold tabular-nums ${side === 'in' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{side === 'out' && value > 0.5 ? '−' : ''}{money(fromMonthly(value, per))}<Per per={per} /></b>
            <span className="w-9 shrink-0" aria-hidden="true" />
          </span>
        </div>
        {side === 'in' && pay > 0 && <TaxLine pay={pay} tax={tax} />}
        {open && (
          <div className="px-4 pb-3 sm:px-5">
            {groups.filter((x) => x.rows.length || (x.c.expected && !readOnly)).map(({ c, rows }) => (
              <div key={c.key}>
                <div className="pt-3 text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">{c.title}</div>
                {rows.map((l) => <Row key={l.id} line={l} />)}
                {!rows.length && !readOnly && (
                  <button type="button" onClick={() => openAdd(side, c.key)} className="flex w-full items-center gap-3 border-b border-border/70 py-3 text-left font-semibold text-muted-foreground hover:text-foreground">
                    <Plus className="size-4" />{tr('careers.career_compare.add_tolowercase', 'Add {{toLowerCase}}', { toLowerCase: c.title.toLowerCase() })}
                  </button>
                )}
              </div>
            ))}
            {!lines.some((l) => l.side === side) && side === 'in' && <p className="pt-3 text-sm text-muted-foreground">{tr('budget.budget_table.nothing_coming_in_yet', 'Nothing coming in yet.')}</p>}
            {readOnly ? null : <button type="button" onClick={() => openAdd(side)} className="mt-2 inline-flex items-center gap-1.5 py-2 text-sm font-extrabold text-[var(--org-primary-color)] dark:text-[color-mix(in_srgb,var(--org-primary-color)_45%,white)]">
              <Plus className="size-4" />{side === 'in' ? tr('budget.add_tray.add_income', 'Add income') : tr('budget.add_tray.add_an_expense', 'Add an expense')}
            </button>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-[0_1px_0_hsl(var(--border))]">
      {!phase.lines.length && !readOnly && openEstimates ? <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-[color-mix(in_srgb,var(--org-primary-color)_8%,transparent)] px-4 py-4 sm:px-5">
        <span className="min-w-0"><b className="block text-base font-extrabold">{tr('budget.budget_table.start_your_budget', 'Start your budget')}</b><span className="text-sm text-muted-foreground">{tr('budget.budget_table.we_ll_suggest_lines_and', 'We’ll suggest lines and amounts from where you live, how you live and what you’re doing.')}</span></span>
        <Button variant="brand" size="sm" onClick={openEstimates}><Sparkles size={15} />{tr('budget.budget_table.see_estimates', 'See estimates')}</Button>
      </div> : null}
      {section('in', tr('lit.budget_table.income', 'Income'), inn)}
      {section('out', tr('lit.budget_table.expenses', 'Expenses'), out)}
      <div className={`px-4 py-4 sm:px-5 ${left >= 0 ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'}`}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-base font-extrabold">{left >= 0 ? `Left over each ${PER_WORD[per]}` : `Short each ${PER_WORD[per]}`}</span>
          <span className="flex items-baseline"><b className="text-xl font-extrabold tabular-nums">{left >= 0 ? '+' : '−'}{money(Math.abs(fromMonthly(left, per)))}</b><span className="w-9 shrink-0" aria-hidden="true" /></span>
        </div>
        {(debtPay > 0 || saving > 0) && <p className="mt-1 text-xs font-semibold opacity-80">{tr('budget.budget_table.after', 'After')}{' '}{[debtPay > 0 && `${money(fromMonthly(debtPay, per))} to debt`, saving > 0 && `${money(fromMonthly(saving, per))} into savings`].filter(Boolean).join(' and ')}{tr('budget.budget_table.what_s_left_goes_into', '. What\'s left goes into your savings account.')}</p>}
      </div>
      <p className="sr-only">{monthLabel(doc.start, phaseOffset(doc, phase.id))}</p>
    </div>
  )
}

/** The muted "/mo" after an amount. */
function Per({ per }: { per: string }) {
  return <span className="ml-px text-[0.78em] font-normal text-muted-foreground">/{per}</span>
}

const pct = (r: number) => `${(r * 100).toFixed(r > 0 && r < 0.1 ? 1 : 0)}%`

/** One compact line under the Income total: the tax on pay from work, opening into how it's worked out. */
function TaxLine({ pay, tax }: { pay: number; tax: number }) {
  const { phase, per, updatePhase, readOnly } = useLife()
  const [open, setOpen] = React.useState(false)
  const [src, setSrc] = React.useState<string | null>(null)
  const filing: Filing = phase.tax?.filing || 'single'
  const own = phase.tax?.rate ?? null
  const est = estimateTax(pay * 12, filing, stateOf(phase.place))
  const rate = pay > 0 ? tax / pay : 0
  const setTax = (patch: { filing?: Filing; rate?: number | null }) => updatePhase((p) => { p.tax = { filing, rate: own, ...p.tax, ...patch } })
  return (
    <div className="-mt-2 px-4 pb-3 sm:px-5">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <span className="inline-flex items-center gap-1.5">{tr('budget.budget_table.taxes_on_money_of_pay', 'Taxes on {{money}} of pay · {{pct}}', { money: money(fromMonthly(pay, per)), pct: pct(rate) })}{own == null ? '' : tr('budget.budget_table.your_rate', ' (your rate)')}<ChevronDown className={`size-3.5 transition-transform ${open ? '' : '-rotate-90'}`} /></span>
        <span className="tabular-nums">{tax > 0.5 ? '−' : ''}{money(fromMonthly(tax, per))}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-3">
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
                    <button type="button" onClick={() => setSrc(src === x.key ? null : x.key)} aria-expanded={src === x.key} aria-label={`Where ${x.title.toLowerCase()} comes from`} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted"><Info className="size-3.5" /></button>
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
      )}
    </div>
  )
}

function Row({ line }: { line: Line }) {
  const { phase, catalog, valueOf, per, openLine, setOpenLine, estimates, estimatesLoading } = useLife()
  const item = catalog?.items.find((i) => i.key === line.item)
  const cat = catalog?.categories.find((c) => c.key === line.cat)
  const v = valueOf(phase, line)
  const open = openLine === line.id
  const est = estimates[`${phase.id}:${line.id}`]
  const sign = line.side === 'out' ? '−' : ''
  const value = v.monthly == null ? null : fromMonthly(v.monthly, per)
  const [src, setSrc] = React.useState(false)
  const onEst = !line.own && !!est
  const wide = onEst && isWide(est)
  // Your own number far from ours: say so on the line.
  const far = line.own && v.monthly != null && v.estMonthly != null && Math.abs(v.monthly - v.estMonthly) > Math.max(25, v.estMonthly * 0.15)
  return (
    <div id={`row-${line.id}`} className="border-b border-border/70 last:border-b-0">
      <div className="flex w-full items-center gap-3">
        <button type="button" aria-expanded={open} onClick={() => setOpenLine(open ? null : line.id)} className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left">
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-muted text-foreground"><LifeIcon name={item?.icon || cat?.icon} /></span>
          <span className="min-w-0 flex-1">
            <span className={`block truncate ${open ? 'font-extrabold' : 'font-semibold'}`}>{line.title}</span>
            {far && !open ? <small className="flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400"><AlertTriangle className="size-3" aria-hidden="true" />{v.monthly! < v.estMonthly! ? tr('budget.budget_table.much_lower', 'Much lower') : tr('budget.budget_table.much_higher', 'Much higher')}{' '}{tr('budget.budget_table.than_our_money_estimate', 'than our {{money}} estimate', { money: money(fromMonthly(v.estMonthly!, per)) })}</small> : null}
          </span>
          {!open && (value == null
            ? <span className="text-sm font-semibold text-muted-foreground">{item?.metric && estimatesLoading ? '…' : tr('budget.budget_table.add_your_number', 'Add your number')}</span>
            : <span className={`font-semibold tabular-nums ${line.side === 'in' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{sign}{money(value)}<Per per={per} /></span>)}
        </button>
        <span className="inline-flex w-9 shrink-0 items-center justify-end gap-px">
          {wide && !open ? <span className="font-bold text-amber-600 dark:text-amber-400" aria-label={tr('budget.budget_table.not_for_your_city', 'Not for your city')}>*</span> : null}
          {onEst && !open ? <button type="button" onClick={() => setSrc(!src)} aria-expanded={src} aria-label={`Where ${line.title.toLowerCase()} comes from`} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Info className="size-4" /></button> : null}
        </span>
      </div>
      {src && onEst && !open ? <p className="mb-2 ml-11 mr-9 rounded-lg bg-muted/70 px-2.5 py-1.5 text-xs text-muted-foreground"><b className="text-foreground">{est!.source.title}</b>, {est!.source.publisher}. {est!.label}.{est!.scaled_by ? tr('budget.budget_table.local_prices_title_publisher_place', ' Local prices: {{title}}, {{publisher}} ({{place_label}} {{round}}, US = 100).', { title: est!.scaled_by.source.title, publisher: est!.scaled_by.source.publisher, place_label: est!.scaled_by.place_label, round: Math.round(est!.scaled_by.value) }) : est!.place_label ? ` ${est!.place_label}.` : ''}{wide ? tr('budget.budget_table.not_for_value_itself_this', ' * Not for {{value}} itself: this is the {{value2}} figure.', { value: est!.asked_place_label || tr('budget.budget_table.your_city', 'your city'), value2: est!.level === 'us' ? tr('budget.budget_table.national', 'national') : tr('budget.budget_table.state', 'state') }) : ''}</p> : null}
      {open && <RowEditor line={line} est={est ?? null} hasMetric={!!item?.metric} />}
    </div>
  )
}

function RowEditor({ line, est, hasMetric }: { line: Line; est: Estimate | null; hasMetric: boolean }) {
  const { doc, phase, catalog, valueOf, per, updatePhase, setOpenLine, estimatesLoading, token } = useLife()
  const off = phaseOffset(doc, phase.id)
  const item = catalog?.items.find((i) => i.key === line.item)
  const v = valueOf(phase, line)
  const [showSrc, setShowSrc] = React.useState(false)
  const [calc, setCalc] = React.useState(!!line.own && line.own.unit !== per)
  // eslint-disable-next-line no-unused-vars -- parameter names in a function type
  const set = (fn: (l: Line) => void) => updatePhase((p) => { const l = p.lines.find((x) => x.id === line.id); if (l) fn(l) })
  const hourly = !!item?.hourly || line.own?.unit === 'hr'
  const unit: Unit = line.own?.unit || (est?.period === 'hr' ? 'hr' : per)
  const hours = line.own?.hours ?? line.hours ?? DEFAULT_HOURS
  const shown = v.monthly == null ? null : fromMonthly(v.monthly, per)
  const raw = line.own ? line.own.value : v.monthly != null ? fromMonthly(v.monthly, unit, hours) : null
  const setOwn = (value: number | null, u: Unit = unit, h = hours) => set((l) => { l.own = value == null ? null : { unit: u, value, hours: u === 'hr' ? h : null } })
  const months = Array.from({ length: phase.months }, (_, m) => m)

  return (
    <div className="space-y-3 pb-4">
      {hasMetric && (
        <div className={`rounded-xl bg-muted/60 p-3 ${line.own ? 'opacity-75' : ''}`}>
          <div className="flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
            <span>{tr('budget.budget_table.estimate', 'Estimate')}</span>
            {est && <button type="button" onClick={() => setShowSrc(!showSrc)} aria-expanded={showSrc} aria-label={tr('budget.budget_table.where_this_comes_from', 'Where this comes from')} className="rounded-full p-1 hover:bg-muted"><Info className="size-4" /></button>}
          </div>
          {estimatesLoading && !est ? <p className="mt-1 text-sm text-muted-foreground">{tr('budget.budget_table.looking_for_an_estimate', 'Looking for an estimate…')}</p>
            : !est ? <p className="mt-1 text-sm text-muted-foreground">{tr('budget.budget_table.we_don_t_have_a', 'We don\'t have a sourced estimate for this')}{' '}{phase.place_label ? `in ${phase.place_label}` : 'here'}{' '}{tr('budget.budget_table.yet_so_use_your_own', 'yet, so use your own number.')}</p>
            : <EstimateView est={est} line={line} />}
          {showSrc && est && (
            <div className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
              <p><b className="text-foreground">{est.source.title}</b>, {est.source.publisher}{est.source.released ? ` (${est.source.released})` : ''}. {est.source.dataset}.</p>
              {est.scaled_by ? <p>{tr('budget.budget_table.at_local_prices', 'At local prices:')}{' '}<b className="text-foreground">{est.scaled_by.source.title}</b>, {est.scaled_by.source.publisher}. {est.scaled_by.label}: {est.scaled_by.value.toFixed(1)}.</p> : null}
              {est.source.notes && <p className="mt-1">{est.source.notes}</p>}
              {est.source.url && <a className="mt-1 inline-block font-semibold text-[var(--org-primary-color)] dark:text-[color-mix(in_srgb,var(--org-primary-color)_45%,white)] underline" href={est.source.url} target="_blank" rel="noreferrer">{tr('budget.budget_table.see_the_source', 'See the source')}</a>}
            </div>
          )}
          {item?.settings?.length ? <Settings line={line} token={token} /> : null}
          {line.own && v.estMonthly != null && <Button variant="ghost" size="sm" className="mt-2" onClick={() => setOwn(null)}><RotateCcw />{tr('budget.budget_table.use_the_estimate', 'Use the estimate')}</Button>}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-2 text-sm">
        {calc && (
          <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
            <label className="inline-flex items-baseline border-b-[1.5px] border-dashed border-border font-semibold tabular-nums focus-within:border-[var(--org-primary-color)]">$
              <input aria-label={tr('budget.add_tray.amount', 'Amount')} inputMode="decimal" className="w-20 bg-transparent text-right outline-none" key={`a${raw}${unit}`} defaultValue={raw == null ? '' : fmt(raw, unit === 'hr')} placeholder="0" onBlur={(e) => { const n = parse(e.target.value); if (n != null && n !== raw) setOwn(n) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
            </label>
            <select aria-label={tr('budget.add_tray.per', 'Per')} className="rounded-md border-b-[1.5px] border-dashed border-border bg-transparent font-semibold" value={unit} onChange={(e) => { const u = e.target.value as Unit; if (raw != null) setOwn(fromMonthly(v.monthly ?? 0, u, hours), u) }}>
              {(hourly ? ['hr', 'wk', 'mo', 'yr'] : ['wk', 'mo', 'yr']).map((u) => <option key={u} value={u}>{u === 'hr' ? tr('budget.add_tray.an_hour', 'an hour') : u === 'wk' ? tr('budget.add_tray.a_week', 'a week') : u === 'mo' ? tr('budget.add_tray.a_month', 'a month') : tr('budget.add_tray.a_year', 'a year')}</option>)}
            </select>
            {unit === 'hr' && <>
              <span className="text-muted-foreground">×</span>
              <label className="inline-flex items-baseline border-b-[1.5px] border-dashed border-border font-semibold focus-within:border-[var(--org-primary-color)]">
                <input aria-label={tr('budget.add_tray.hours_a_week', 'Hours a week')} inputMode="decimal" className="w-10 bg-transparent text-right outline-none" key={`h${hours}`} defaultValue={hours} onBlur={(e) => { const h = parse(e.target.value); if (h == null || h === hours) return; if (line.own) setOwn(line.own.value, 'hr', h); else set((l) => { l.hours = h }) }} />
              </label>
              <span className="text-muted-foreground">{tr('budget.add_tray.hrs_a_week', 'hrs a week')}</span>
            </>}
            <span className="font-bold text-muted-foreground">=</span>
          </span>
        )}
        <button type="button" onClick={() => setCalc(!calc)} aria-pressed={calc} title={tr('budget.budget_table.work_it_out', 'Work it out')} aria-label={tr('budget.budget_table.work_it_out', 'Work it out')} className={`rounded-lg p-1.5 ${calc ? 'bg-muted text-foreground' : 'text-muted-foreground opacity-70 hover:opacity-100'}`}>
          <CalcIcon />
        </button>
        <label className={`inline-flex items-baseline font-semibold tabular-nums ${line.side === 'in' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
          {line.side === 'out' && shown ? '−' : ''}$
          <input aria-label={`${line.title} a ${PER_WORD[per]}`} inputMode="decimal" key={`v${shown}${per}`} defaultValue={shown == null ? '' : fmt(shown)} placeholder={tr('budget.budget_table.add_your_number', 'Add your number')}
            style={{ width: `${Math.max(shown == null ? 13 : fmt(shown).length + 1, 4)}ch` }}
            className="border-b-[1.5px] border-transparent bg-transparent text-right outline-none placeholder:text-sm placeholder:font-normal hover:border-border focus:border-[var(--org-primary-color)]"
            onBlur={(e) => { const n = parse(e.target.value); if (n == null || (shown != null && Math.abs(n - shown) < 0.5)) return; setOwn(n, per) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
        </label>
      </div>
      {line.own && v.estMonthly != null && <p className="text-right text-xs text-muted-foreground">{tr('budget.budget_table.your_number_the_estimate_is', 'Your number. The estimate is {{money}} a {{value}}.', { money: money(fromMonthly(v.estMonthly, per)), value: PER_WORD[per] })}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3 text-sm">
        <span className="inline-flex flex-wrap items-center gap-1.5 text-muted-foreground">
          {tr('budget.budget_table.from', 'From')}
          <select aria-label={tr('budget.add_tray.starts', 'Starts')} className="rounded-md bg-muted px-1.5 py-1 font-semibold text-foreground" value={line.start || 0} onChange={(e) => set((l) => { l.start = Number(e.target.value); if (l.end != null && l.end <= l.start) l.end = null })}>
            {months.map((m) => <option key={m} value={m}>{m === 0 ? tr('budget.budget_table.the_start', 'the start') : monthLabel(doc.start, off + m)}</option>)}
          </select>
          {tr('budget.budget_table.to', 'to')}
          <select aria-label={tr('budget.budget_table.ends', 'Ends')} className="rounded-md bg-muted px-1.5 py-1 font-semibold text-foreground" value={line.end ?? ''} onChange={(e) => set((l) => { l.end = e.target.value === '' ? null : Number(e.target.value) })}>
            <option value="">{tr('budget.budget_table.the_end', 'the end')}</option>
            {months.filter((m) => m > (line.start || 0)).map((m) => <option key={m} value={m}>{monthLabel(doc.start, off + m)}</option>)}
          </select>
        </span>
        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { updatePhase((p) => { p.lines = p.lines.filter((l) => l.id !== line.id) }); setOpenLine(null) }}><Trash2 />{tr('budget.budget_table.remove', 'Remove')}</Button>
      </div>
    </div>
  )
}

function EstimateView({ est, line }: { est: Estimate; line: Line }) {
  const { per, phase, valueOf } = useLife()
  const v = valueOf(phase, line)
  const p = est.percentiles
  const hours = line.hours ?? DEFAULT_HOURS
  const conv = (x: number) => fromMonthly(toMonthly(x, est.period, hours) / (SHARED_METRICS.includes(est.metric) ? Number(line.settings?.share || 1) : 1), per)
  const what = est.metric === 'rent' ? `${est.stat ? `${est.stat.charAt(0).toUpperCase()}${est.stat.slice(1)}` : tr('lit.prefill.rent', 'Rent')} for ${est.dims.bedrooms === 0 ? 'a studio' : `a ${est.dims.bedrooms} bedroom`}` : est.metric === 'wage' ? `${est.stat === 'median' ? tr('lit.budget_table.median_pay', 'Median pay') : tr('lit.budget_table.pay', 'Pay')} for ${est.label.toLowerCase()}` : est.label
  return (
    <div className="mt-1">
      <div className="flex items-baseline gap-1.5"><b className="text-sm font-bold tabular-nums text-muted-foreground">{money(fromMonthly(v.estMonthly ?? 0, per))}</b><span className="text-xs text-muted-foreground">a {PER_WORD[per]}</span></div>
      {v.calc && <p className="text-xs text-muted-foreground">{v.calc}</p>}
      <p className="mt-1 text-xs text-muted-foreground">{tr('budget.budget_table.what_in_place_label', '{{what}} in {{place_label}}', { what, place_label: est.place_label })}{est.fallback && est.asked_place_label && est.place_label !== est.asked_place_label ? `. No figure for ${est.asked_place_label} itself yet.` : '.'}</p>
      {p && p.p10 != null && p.p90 != null && (
        <div className="mt-2">
          <div className="relative h-2 rounded-full bg-border">
            <span className="absolute inset-y-0 rounded-full bg-muted-foreground/40" style={{ left: `${((p.p25 - p.p10) / (p.p90 - p.p10)) * 100}%`, right: `${((p.p90 - p.p75) / (p.p90 - p.p10)) * 100}%` }} />
            <span className="absolute -top-0.5 h-3 w-0.5 bg-foreground" style={{ left: `${((p.p50 - p.p10) / (p.p90 - p.p10)) * 100}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[11px] font-semibold tabular-nums text-muted-foreground">
            <span>{tr('budget.budget_table.money_low', '{{money}} low', { money: money(conv(p.p10)) })}</span><span>{tr('budget.budget_table.middle_half_money_to_money2', 'middle half {{money}} to {{money2}}', { money: money(conv(p.p25)), money2: money(conv(p.p75)) })}</span><span>{tr('budget.budget_table.money_high', '{{money}} high', { money: money(conv(p.p90)) })}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function Settings({ line, token }: { line: Line; token?: string }) {
  const { catalog, updatePhase } = useLife()
  const item = catalog?.items.find((i) => i.key === line.item)
  const set = (k: string, v: any, title?: string) => updatePhase((p) => { const l = p.lines.find((x) => x.id === line.id); if (!l) return; l.settings = { ...(l.settings || {}), [k]: v }; if (title) l.title = title })
  return (
    <div className="mt-3 space-y-2">
      {item?.settings?.map((s) => s.kind === 'choice' ? (
        <div key={s.key} className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold text-muted-foreground">{s.title}</span>
          {s.choices!.map(([val, t]) => {
            const on = (line.settings?.[s.key] ?? s.default) === val
            return <button key={String(val)} type="button" aria-pressed={on} onClick={() => set(s.key, val)} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${on ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground'}`}>{t}</button>
          })}
        </div>
      ) : <OccupationPicker key={s.key} token={token} value={line.settings?.soc} label={line.settings?.soc_title} onPick={(o) => set('soc', o.soc, line.title === 'A job' || !line.title ? o.title : undefined)} onPicked={(o) => updatePhase((p) => { const l = p.lines.find((x) => x.id === line.id); if (l) l.settings = { ...(l.settings || {}), soc: o.soc, soc_title: o.title } })} />)}
    </div>
  )
}

// eslint-disable-next-line no-unused-vars -- parameter names in a function type
export function OccupationPicker({ token, value, label, onPick, onPicked }: { token?: string; value?: string; label?: string; onPick?: (o: Occupation) => void; onPicked?: (o: Occupation) => void }) {
  const [q, setQ] = React.useState('')
  const [rows, setRows] = React.useState<Occupation[] | null>(null)
  const [open, setOpen] = React.useState(!value)
  React.useEffect(() => {
    if (!open) return
    let live = true
    const t = setTimeout(() => { lifeApi.occupations(q, token).then((r) => { if (live) setRows(r.occupations) }).catch(() => setRows([])) }, 150)
    return () => { live = false; clearTimeout(t) }
  }, [q, open, token])
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-muted-foreground">{tr('budget.budget_table.job', 'Job:')}{' '}<span className="text-foreground underline decoration-dashed underline-offset-4">{label || value}</span></button>
  return (
    <div className="rounded-xl bg-card ring-1 ring-border">
      <div className="flex items-center gap-2 px-3"><Search className="size-4 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('budget.budget_table.find_the_job_for_a', 'Find the job for a pay estimate')} aria-label={tr('budget.budget_table.find_a_job', 'Find a job')} className="h-9 w-full bg-transparent text-sm outline-none" /></div>
      {rows && (rows.length ? (
        <ul className="max-h-48 overflow-auto border-t border-border py-1">
          {rows.map((o) => <li key={o.soc}><button type="button" onClick={() => { onPick?.(o); onPicked?.(o); setOpen(false) }} className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted">{o.title}</button></li>)}
        </ul>
      ) : <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">{tr('budget.budget_table.no_pay_figures_loaded_for', 'No pay figures loaded for jobs like that yet. Enter your own pay below.')}</p>)}
    </div>
  )
}

function CalcIcon() {
  return <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 11h.01M12 11h.01M16 11h.01M8 14.5h.01M12 14.5h.01M16 14.5h.01M8 18h.01M12 18h4" /></svg>
}
