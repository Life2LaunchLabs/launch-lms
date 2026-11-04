'use client'
/* eslint-disable no-unused-vars -- parameter names in function types */

import React from 'react'
import { Link2 } from 'lucide-react'
import { amortized, money, monthLabel, payoffMonths } from './model'

const num = (s: string) => { const v = Number(String(s).replace(/[$,%\s]/g, '')); return Number.isFinite(v) && v >= 0 ? v : 0 }
const fieldCls = 'h-10 w-full rounded-xl border border-border bg-background px-3 font-normal outline-none focus:border-[var(--org-primary-color)]'

/** Month by month: what is owed, paying `pay` a month from the first month, until it is paid or 100 years pass. */
export function schedule(balance: number, rate: number, pay: number): { owed: number[]; total: number; months: number | null } {
  const owed = [balance]
  let b = balance, total = 0
  for (let m = 0; m < 1200 && b > 0.5; m++) {
    const withInt = b * (1 + rate / 1200)
    const p = Math.min(withInt, pay)
    if (p <= withInt - b + 1e-9 && withInt > 0.5) return { owed, total, months: null }
    total += p; b = withInt - p; owed.push(Math.max(0, b))
  }
  return { owed, total, months: b > 0.5 ? null : owed.length - 1 }
}

const yearsText = (months: number) => {
  const y = Math.floor(months / 12), m = months % 12
  return [y ? `${y} year${y === 1 ? '' : 's'}` : '', m ? `${m} month${m === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ') || '0 months'
}

/**
 * The minimum a month and how long it takes to pay off, linked: change one and the other follows.
 * Years are kept as typed while you type them; the minimum is what gets saved.
 */
export function LinkedTerms({ balance, rate, payment, onPayment, idPrefix }: { balance: number; rate: number; payment: number; onPayment: (v: number) => void; idPrefix: string }) {
  const months = payoffMonths(balance, rate, payment)
  const fromPay = months == null ? '' : String(Math.round((months / 12) * 10) / 10)
  const [years, setYears] = React.useState<string | null>(null)
  const [pay, setPay] = React.useState<string | null>(null)
  const shownYears = years ?? fromPay
  const shownPay = pay ?? (payment ? String(Math.round(payment * 100) / 100) : '')
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
      <label className="grid gap-1 text-sm font-semibold" htmlFor={`${idPrefix}-min`}>Minimum a month
        <input id={`${idPrefix}-min`} className={fieldCls} inputMode="decimal" placeholder="$0" value={shownPay}
          onChange={(e) => { setPay(e.target.value); setYears(null); onPayment(num(e.target.value)) }} onBlur={() => setPay(null)} />
      </label>
      <span className="mb-2.5 grid size-6 place-items-center rounded-full bg-muted text-muted-foreground" title="Linked: change one and the other follows" aria-hidden="true"><Link2 className="size-3.5" /></span>
      <label className="grid gap-1 text-sm font-semibold" htmlFor={`${idPrefix}-yrs`}>Paid off in (years)
        <input id={`${idPrefix}-yrs`} className={fieldCls} inputMode="decimal" placeholder={balance > 0 && payment > 0 && months == null ? 'Never' : '10'} value={shownYears}
          onChange={(e) => { setYears(e.target.value); setPay(null); const y = num(e.target.value); if (y > 0) onPayment(Math.ceil(amortized(balance, rate, Math.round(y * 12)) * 100) / 100) }} onBlur={() => setYears(null)} />
      </label>
      {balance > 0 && payment > 0 && months == null && <p className="col-span-3 text-xs font-semibold text-red-700 dark:text-red-300">This doesn't cover the interest, so it never gets paid off. The least that does is {money(Math.ceil((balance * rate) / 1200) + 1)} a month.</p>}
    </div>
  )
}

/**
 * What a loan means, in order: the money that comes in and when, what you pay and for how long,
 * what it costs in all, and a small line of what you owe going down.
 */
export function LoanStory({ planStart, startG, balance, rate, payment, lands, already }: { planStart: string; startG: number; balance: number; rate: number; payment: number; lands: boolean; already: boolean }) {
  if (!(balance > 0)) return null
  const s = schedule(balance, rate, payment)
  const end = s.months != null ? startG + s.months - 1 : null
  const interest = s.total - balance
  const W = 280, H = 56
  const pts = s.owed.slice(0, 1201)
  const n = Math.max(1, (s.months ?? pts.length - 1))
  const line = pts.map((v, i) => `${((i / n) * W).toFixed(1)},${(4 + (1 - v / balance) * (H - 8)).toFixed(1)}`).join(' ')
  const rows: [string, React.ReactNode][] = []
  if (already) rows.push([monthLabel(planStart, startG), <>You already owe <b>{money(balance)}</b>. No new money comes in.</>])
  else rows.push([monthLabel(planStart, startG), lands ? <><b className="text-emerald-700 dark:text-emerald-400">+{money(balance)}</b> lands in your savings, and you owe it from then.</> : <>You borrow <b>{money(balance)}</b> to pay for it. It goes to the seller, not into savings.</>])
  if (payment > 0) rows.push([end != null ? `${monthLabel(planStart, startG)} to ${monthLabel(planStart, end)}` : `From ${monthLabel(planStart, startG)}`, <>You pay <b>{money(payment)}</b> a month{s.months != null ? <> for {yearsText(s.months)}</> : <>, which never pays it off</>}.</>])
  else rows.push(['Each month', <>No payment set yet, so it only grows with interest.</>])
  return (
    <div className="rounded-xl bg-muted/60 p-3 text-sm">
      <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">What this loan means</p>
      <ol className="mt-2 space-y-1.5">
        {rows.map(([when, what]) => <li key={when} className="grid grid-cols-[minmax(0,7.5rem)_1fr] gap-3"><span className="text-muted-foreground">{when}</span><span>{what}</span></li>)}
        {s.months != null && payment > 0 && <li className="grid grid-cols-[minmax(0,7.5rem)_1fr] gap-3"><span className="text-muted-foreground">In all</span><span>You pay back <b>{money(s.total)}</b>: the {money(balance)} plus <b>{money(interest)}</b> in interest.</span></li>}
      </ol>
      {payment > 0 && s.months != null && (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-3 h-14 w-full" role="img" aria-label={`What you owe goes from ${money(balance)} to $0 by ${end != null ? monthLabel(planStart, end) : 'the end'}`}>
          <polyline points={`0,${H} ${line} ${W},${H}`} fill="#E0662E" fillOpacity="0.12" stroke="none" />
          <polyline points={line} fill="none" stroke="#E0662E" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      {payment > 0 && s.months != null && <div className="flex justify-between text-[11px] text-muted-foreground"><span>Owe {money(balance)}</span><span>$0 by {monthLabel(planStart, end!)}</span></div>}
    </div>
  )
}
