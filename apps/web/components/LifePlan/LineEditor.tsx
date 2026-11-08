'use client'

import React from 'react'
import { ChevronDown, RotateCcw, Search } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import { lifeApi, type CatalogItem, type Estimate, type Line, type Occupation, type Unit } from '@services/life/life'
import { useLife } from './LifeContext'
import PayChart from './PayChart'
import SourceInfo from './SourceInfo'
import Sheet from './Sheet'
import { pctOf, points, rankText } from './payDist'
import { DEFAULT_HOURS, PER_WORD, WEEKS_PER_MONTH, fromMonthly, money, monthLabel, phaseOffset, toMonthly, type LineValue, type Per } from './model'

import { tr } from '@/lib/tr'

const parse = (s: string) => { const v = Number(String(s).replace(/[$,\s]/g, '')); return Number.isFinite(v) && v >= 0 ? v : null }
const fmt = (v: number, cents = false) => v.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })
const PER_SHORT: Record<Unit, string> = { hr: 'hr', wk: 'wk', mo: 'mo', yr: 'yr' }

/** How pay is entered: by the hour or as a yearly salary. */
export type PayMode = 'hr' | 'yr'
export const payMode = (line: Line): PayMode => (line.settings?.pay === 'yr' || line.settings?.pay === 'hr' ? line.settings.pay : line.own?.unit === 'yr' ? 'yr' : 'hr')
export const hoursOf = (line: Line) => line.own?.hours ?? line.hours ?? DEFAULT_HOURS
/** The hourly rate behind a line's monthly pay. */
export const rateOf = (line: Line, monthly: number) => (line.own?.unit === 'hr' ? line.own.value : monthly / (hoursOf(line) * WEEKS_PER_MONTH))

/** The little line under a budget line's name: what its settings are set to. */
export function subtitle(line: Line, item: CatalogItem | undefined, v: LineValue): string {
  if (item?.hourly) {
    if (v.monthly == null) return ''
    if (payMode(line) === 'yr') return `${money(v.monthly * 12)}/yr`
    const r = rateOf(line, v.monthly)
    return `${hoursOf(line)} hr/wk · ${money(r, { cents: Math.abs(r - Math.round(r)) > 0.004 })}/hr`
  }
  const parts = (item?.settings || []).filter((s) => s.kind === 'choice').map((s) => {
    const val = line.settings?.[s.key] ?? s.default
    const label = s.choices?.find(([k]) => k === val)?.[1]
    if (!label) return ''
    if (s.key === 'share') return val === 1 ? tr('budget.line.just_you', 'just you') : val === 2 ? tr('budget.line.split_with_roommate', 'split with roommate') : tr('budget.line.split_with_n', 'split with {{n}} roommates', { n: Number(val) - 1 })
    if (s.key === 'bedrooms') return val === 0 ? label : tr('budget.line.n_bed', '{{n}} bed', { n: val })
    return label
  }).filter(Boolean)
  if (line.own && line.own.unit !== 'mo') parts.push(`${money(line.own.value)}/${PER_SHORT[line.own.unit]}`)
  const s = parts.join(' · ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** How your own number compares, under the amount: "Top 20%" against a distribution, "21% above estimate" against one figure. */
export function standing(line: Line, item: CatalogItem | undefined, est: Estimate | null, v: LineValue): string {
  if (!line.own || v.monthly == null || !est) return ''
  if (item?.hourly) {
    const mode = payMode(line), pts = points(est, mode)
    if (pts) { const val = mode === 'yr' ? v.monthly * 12 : rateOf(line, v.monthly); return rankText(pctOf(val, pts), pts, val) }
  } else {
    const unit: Unit = line.own.unit === 'hr' ? 'mo' : line.own.unit, pts = points(est, unit)
    if (pts) { const val = fromMonthly(v.monthly, unit); return rankText(pctOf(val, pts), pts, val) }
  }
  if (!v.estMonthly) return ''
  const d = (v.monthly - v.estMonthly) / v.estMonthly
  return Math.abs(d) < 0.05 ? '' : d > 0 ? tr('budget.line.pct_above', '{{n}}% above estimate', { n: Math.round(d * 100) }) : tr('budget.line.pct_below', '{{n}}% below estimate', { n: Math.round(-d * 100) })
}

/** A labelled box: the label above, the field inside. */
function Field({ label, children, hot = false, className = '' }: { label: string; children: React.ReactNode; hot?: boolean; className?: string }) {
  return (
    <label className={`grid min-w-0 gap-1 ${className}`}>
      <span className="truncate text-[11px] font-semibold text-muted-foreground">{label}</span>
      <span className={`flex h-9 min-w-0 items-center gap-0.5 rounded-lg border bg-background px-2.5 text-[15px] font-semibold tabular-nums focus-within:border-[var(--org-primary-color)] ${hot ? 'border-[var(--org-primary-color)] ring-1 ring-[var(--org-primary-color)]' : 'border-border'}`}>{children}</span>
    </label>
  )
}

// eslint-disable-next-line no-unused-vars -- parameter names in a function type
function Num({ value, cents, onSet, label, suffix, prefix = '$' }: { value: number | null; cents?: boolean; onSet: (n: number) => void; label: string; suffix?: string; prefix?: string }) {
  return <>
    {prefix && <span className="text-muted-foreground">{prefix}</span>}
    <input aria-label={label} inputMode="decimal" key={`${value}`} defaultValue={value == null ? '' : fmt(value, cents)} placeholder="0"
      className="w-full min-w-0 bg-transparent outline-none placeholder:font-normal"
      onBlur={(e) => { const n = parse(e.target.value); if (n != null && (value == null || Math.abs(n - value) > (cents ? 0.004 : 0.5))) onSet(n) }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
    {suffix && <span className="shrink-0 text-xs font-normal text-muted-foreground">{suffix}</span>}
  </>
}

/** An open budget line: its settings, then its amount (and how it's worked out), then the estimate. */
export default function LineEditor({ line, est, item }: { line: Line; est: Estimate | null; item?: CatalogItem }) {
  const { phase, valueOf, per, updatePhase, estimatesLoading, token } = useLife()
  const v = valueOf(phase, line)
  // eslint-disable-next-line no-unused-vars -- parameter names in a function type
  const set = (fn: (l: Line) => void) => updatePhase((p) => { const l = p.lines.find((x) => x.id === line.id); if (l) fn(l) })
  const setSetting = (k: string, val: any, title?: string) => set((l) => { l.settings = { ...(l.settings || {}), [k]: val }; if (title) l.title = title })
  const pay = !!item?.hourly
  const mode = payMode(line)
  const hours = hoursOf(line)
  const shown = v.monthly == null ? null : fromMonthly(v.monthly, per)
  const [calc, setCalc] = React.useState(!pay && !!line.own && line.own.unit !== per)
  const choices = (item?.settings || []).filter((s) => s.kind === 'choice')
  const occupation = item?.settings?.find((s) => s.kind === 'occupation')

  const setPay = (monthly: number, m: PayMode = mode, h = hours) => set((l) => {
    l.settings = { ...(l.settings || {}), pay: m }
    l.own = m === 'yr' ? { unit: 'yr', value: Math.round(monthly * 12) } : { unit: 'hr', value: Math.round((monthly / (h * WEEKS_PER_MONTH)) * 100) / 100, hours: h }
  })
  const switchMode = (m: PayMode) => {
    if (m === mode) return
    if (line.own && v.monthly != null) setPay(v.monthly, m)
    else setSetting('pay', m)
  }
  const setHours = (h: number) => set((l) => { l.hours = h; if (l.own?.unit === 'hr') l.own.hours = h })
  const amountTo = (n: number) => {
    const monthly = toMonthly(n, per)
    if (pay) setPay(monthly)
    else set((l) => { l.own = { unit: per, value: n, hours: null } })
  }
  const reset = () => set((l) => { l.own = null })
  const unitPts = est ? points(est, pay ? mode : (calc && line.own ? line.own.unit : per)) : null
  const chartUnit: Unit = pay ? mode : (calc && line.own ? line.own.unit : per)
  const chartValue = v.monthly == null ? null : pay ? (mode === 'yr' ? v.monthly * 12 : rateOf(line, v.monthly)) : fromMonthly(v.monthly, chartUnit)
  const pick = (val: number) => {
    if (!pay) { set((l) => { l.own = { unit: chartUnit, value: val, hours: null } }); return }
    set((l) => { l.settings = { ...(l.settings || {}), pay: mode }; l.own = mode === 'yr' ? { unit: 'yr', value: val } : { unit: 'hr', value: val, hours } })
  }
  const diff = line.own && v.monthly != null && v.estMonthly ? (v.monthly - v.estMonthly) / v.estMonthly : null

  return (
    <div className="space-y-3 border-t border-border/70 pb-3 pt-2.5">
      {(occupation || pay || choices.length > 0) && (
        <div className="grid grid-cols-2 gap-2.5">
          {occupation && (
            <div className="grid min-w-0 gap-1">
              <span className="text-[11px] font-semibold text-muted-foreground">{tr('budget.line.occupation', 'Occupation')}</span>
              <OccupationPop token={token} value={line.settings?.soc} label={line.settings?.soc_title || (line.settings?.soc ? line.title : undefined)}
                onPick={(o) => set((l) => { l.settings = { ...(l.settings || {}), soc: o.soc, soc_title: o.title }; if (l.title === 'A job' || !l.title || l.title === line.settings?.soc_title) l.title = o.title })} />
            </div>
          )}
          {pay && (
            <div className="grid min-w-0 gap-1">
              <span className="text-[11px] font-semibold text-muted-foreground">{tr('budget.line.input', 'Input')}</span>
              <div className="grid h-9 grid-cols-2 rounded-lg bg-muted p-0.5" role="group" aria-label={tr('budget.line.enter_pay_as', 'Enter pay as')}>
                {(['hr', 'yr'] as PayMode[]).map((m) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => switchMode(m)} className={`rounded-md text-sm font-semibold ${mode === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{m === 'hr' ? tr('budget.line.hourly', 'Hourly') : tr('budget.line.salary', 'Salary')}</button>)}
              </div>
            </div>
          )}
          {choices.map((s) => (
            <label key={s.key} className="grid min-w-0 gap-1">
              <span className="text-[11px] font-semibold text-muted-foreground">{s.title}</span>
              <span className="relative">
                <select className="h-9 w-full appearance-none rounded-lg border border-border bg-background pl-2.5 pr-8 text-sm font-semibold" value={String(line.settings?.[s.key] ?? s.default)}
                  onChange={(e) => { const c = s.choices!.find(([k]) => String(k) === e.target.value); if (c) setSetting(s.key, c[0]) }}>
                  {s.choices!.map(([k, t]) => <option key={String(k)} value={String(k)}>{t}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              </span>
            </label>
          ))}
        </div>
      )}

      {pay ? (
        <div className={`grid gap-2.5 ${mode === 'hr' ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {mode === 'hr' ? <>
            <Field label={tr('budget.line.hourly_rate', 'Hourly rate')}><Num label={tr('budget.line.hourly_rate', 'Hourly rate')} cents value={v.monthly == null ? null : rateOf(line, v.monthly)} onSet={(n) => setPay(n * hours * WEEKS_PER_MONTH)} /></Field>
            <Field label={tr('budget.line.hrs_per_week', 'Hrs per week')}><Num label={tr('budget.line.hours_per_week', 'Hours per week')} prefix="" value={hours} onSet={(h) => { if (h > 0 && h <= 100) setHours(h) }} /></Field>
          </> : <Field label={tr('budget.line.yearly_salary', 'Yearly salary')}><Num label={tr('budget.line.yearly_salary', 'Yearly salary')} value={v.monthly == null ? null : Math.round(v.monthly * 12)} onSet={(n) => setPay(n / 12)} /></Field>}
          <Field label={tr('budget.add_tray.amount', 'Amount')} hot><Num label={`${line.title} a ${PER_WORD[per]}`} value={shown == null ? null : Math.round(shown)} onSet={amountTo} suffix={`/${PER_SHORT[per]}`} /></Field>
        </div>
      ) : (
        <div className="flex items-end gap-3">
          <button type="button" onClick={() => setCalc(!calc)} aria-pressed={calc} title={tr('budget.budget_table.work_it_out', 'Work it out')} aria-label={tr('budget.budget_table.work_it_out', 'Work it out')} className={`mb-1 shrink-0 rounded-lg p-1.5 ${calc ? 'bg-muted text-foreground' : 'text-muted-foreground opacity-70 hover:opacity-100'}`}><CalcIcon /></button>
          {calc ? <Calc line={line} v={v} per={per} set={set} /> : <span className="flex-1" />}
          <Field label={tr('budget.add_tray.amount', 'Amount')} hot className="w-40 shrink-0"><Num label={`${line.title} a ${PER_WORD[per]}`} value={shown == null ? null : Math.round(shown)} onSet={amountTo} suffix={`/${PER_SHORT[per]}`} /></Field>
        </div>
      )}

      {item?.metric && (estimatesLoading && !est ? <p className="text-sm text-muted-foreground">{tr('budget.budget_table.looking_for_an_estimate', 'Looking for an estimate…')}</p>
        : !est ? <p className="text-sm text-muted-foreground">{tr('budget.budget_table.we_don_t_have_a', 'We don\'t have a sourced estimate for this')}{' '}{phase.place_label ? `in ${phase.place_label}` : 'here'}{' '}{tr('budget.budget_table.yet_so_use_your_own', 'yet, so use your own number.')}</p>
        : unitPts ? <PayChart title={pay ? tr('budget.line.pay_distribution', 'Pay distribution') : tr('budget.line.what_people_pay', 'What people pay')} pts={unitPts} unit={chartUnit} value={chartValue} est={est} own={!!line.own} onPick={pick} onReset={reset} />
        : (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{tr('budget.budget_table.estimate', 'Estimate')}</span>
            <b className="font-semibold tabular-nums">{money(fromMonthly(v.estMonthly ?? 0, per))}<span className="text-xs font-normal text-muted-foreground">/{PER_SHORT[per]}</span></b>
            {diff != null && Math.abs(diff) >= 0.005 && <button type="button" onClick={reset} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={tr('budget.budget_table.use_the_estimate', 'Use the estimate')} title={tr('budget.budget_table.use_the_estimate', 'Use the estimate')}><RotateCcw className="size-3.5" /></button>}
            <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">{diff != null && Math.abs(diff) >= 0.05 ? (diff > 0 ? tr('budget.line.pct_above', '{{n}}% above estimate', { n: Math.round(diff * 100) }) : tr('budget.line.pct_below', '{{n}}% below estimate', { n: Math.round(-diff * 100) })) : v.calc || ''}</span>
            <SourceInfo est={est} label={tr('budget.budget_table.where_tolowercase_comes_from', 'Where {{toLowerCase}} comes from', { toLowerCase: line.title.toLowerCase() })} />
          </div>
        ))}

    </div>
  )
}

/** When a line starts and stops within the phase, in a sheet from the line's menu. */
export function DatesSheet({ line, open, onClose }: { line: Line; open: boolean; onClose: () => void }) {
  const { doc, phase, updatePhase } = useLife()
  const off = phaseOffset(doc, phase.id)
  const months = Array.from({ length: phase.months }, (_, m) => m)
  // eslint-disable-next-line no-unused-vars -- parameter names in a function type
  const set = (fn: (l: Line) => void) => updatePhase((p) => { const l = p.lines.find((x) => x.id === line.id); if (l) fn(l) })
  return (
    <Sheet open={open} onClose={onClose} title={tr('budget.line.adjust_dates', 'Adjust dates')} description={tr('budget.line.dates_help', 'When {{title}} starts and stops during {{phase}}.', { title: line.title, phase: phase.title })}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
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
      </div>
      <button type="button" onClick={onClose} className="mt-1 h-10 rounded-xl bg-[var(--org-primary-color)] text-sm font-bold text-[var(--org-on-primary-color)]">{tr('budget.line.done', 'Done')}</button>
    </Sheet>
  )
}

/** The working behind an amount: so much a week, a month or a year. */
// eslint-disable-next-line no-unused-vars -- parameter names in a function type
function Calc({ line, v, per, set }: { line: Line; v: LineValue; per: Per; set: (fn: (l: Line) => void) => void }) {
  const unit: Unit = line.own?.unit && line.own.unit !== 'hr' ? line.own.unit : per
  const raw = line.own && line.own.unit === unit ? line.own.value : v.monthly != null ? fromMonthly(v.monthly, unit) : null
  return (
    <div className="grid min-w-0 flex-1 grid-cols-2 gap-2.5">
      <Field label={tr('budget.line.how_much', 'How much')}><Num label={tr('budget.line.how_much', 'How much')} value={raw == null ? null : Math.round(raw * 100) / 100} cents={!!raw && raw % 1 > 0} onSet={(n) => set((l) => { l.own = { unit, value: n, hours: null } })} /></Field>
      <label className="grid min-w-0 gap-1">
        <span className="text-[11px] font-semibold text-muted-foreground">{tr('budget.line.every', 'Every')}</span>
        <span className="relative">
          <select aria-label={tr('budget.add_tray.per', 'Per')} className="h-9 w-full appearance-none rounded-lg border border-border bg-background pl-2.5 pr-8 text-sm font-semibold" value={unit}
            onChange={(e) => { const u = e.target.value as Unit; if (v.monthly != null) set((l) => { l.own = { unit: u, value: Math.round(fromMonthly(v.monthly!, u) * 100) / 100, hours: null } }) }}>
            {(['wk', 'mo', 'yr'] as Unit[]).map((u) => <option key={u} value={u}>{u === 'wk' ? tr('budget.per.week', 'week') : u === 'mo' ? tr('budget.per.month', 'month') : tr('budget.per.year', 'year')}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        </span>
      </label>
    </div>
  )
}

/** The occupation, as a box that opens a search. */
// eslint-disable-next-line no-unused-vars -- parameter names in a function type
function OccupationPop({ token, value, label, onPick }: { token?: string; value?: string; label?: string; onPick: (o: Occupation) => void }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger type="button" className="flex h-9 min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 text-left text-sm font-semibold">
        <span className={`truncate ${label || value ? '' : 'font-normal text-muted-foreground'}`}>{label || value || tr('budget.line.pick_a_job', 'Pick a job')}</span><ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <OccupationPicker token={token} value={value} onPick={(o) => { onPick(o); setOpen(false) }} startOpen />
      </PopoverContent>
    </Popover>
  )
}

// eslint-disable-next-line no-unused-vars -- parameter names in a function type
export function OccupationPicker({ token, value, label, onPick, onPicked, startOpen = false }: { token?: string; value?: string; label?: string; onPick?: (o: Occupation) => void; onPicked?: (o: Occupation) => void; startOpen?: boolean }) {
  const [q, setQ] = React.useState('')
  const [rows, setRows] = React.useState<Occupation[] | null>(null)
  const [open, setOpen] = React.useState(startOpen || !value)
  React.useEffect(() => {
    if (!open) return
    let live = true
    const t = setTimeout(() => { lifeApi.occupations(q, token).then((r) => { if (live) setRows(r.occupations) }).catch(() => setRows([])) }, 150)
    return () => { live = false; clearTimeout(t) }
  }, [q, open, token])
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-muted-foreground">{tr('budget.budget_table.job', 'Job:')}{' '}<span className="text-foreground underline decoration-dashed underline-offset-4">{label || value}</span></button>
  return (
    <div className="rounded-xl bg-card ring-1 ring-border">
      <div className="flex items-center gap-2 px-3"><Search className="size-4 text-muted-foreground" /><input autoFocus={startOpen} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('budget.budget_table.find_the_job_for_a', 'Find the job for a pay estimate')} aria-label={tr('budget.budget_table.find_a_job', 'Find a job')} className="h-9 w-full bg-transparent text-sm outline-none" /></div>
      {rows && (rows.length ? (
        <ul className="max-h-48 overflow-auto border-t border-border py-1">
          {rows.map((o) => <li key={o.soc}><button type="button" onClick={() => { onPick?.(o); onPicked?.(o); if (!startOpen) setOpen(false) }} className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted">{o.title}</button></li>)}
        </ul>
      ) : <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">{tr('budget.budget_table.no_pay_figures_loaded_for', 'No pay figures loaded for jobs like that yet. Enter your own pay below.')}</p>)}
    </div>
  )
}

function CalcIcon() {
  return <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 11h.01M12 11h.01M16 11h.01M8 14.5h.01M12 14.5h.01M16 14.5h.01M8 18h.01M12 18h4" /></svg>
}
