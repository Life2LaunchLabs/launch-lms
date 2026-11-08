'use client'
/* eslint-disable no-unused-vars -- parameter names in function types */

import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@components/ui/dialog'
import type { Debt, LifeDoc, Policy, Saving, When } from '@services/life/life'
import { useLife } from './LifeContext'
import { LifeIcon } from './icons'
import { LinkedTerms, LoanStory } from './LoanStory'
import { monthLabel, phaseOffset, uid } from './model'

import { tr } from '@/lib/tr'
const num = (s: string) => { const v = Number(String(s).replace(/[$,%\s]/g, '')); return Number.isFinite(v) && v >= 0 ? v : 0 }
export const fieldCls = 'h-10 rounded-xl border border-border bg-background px-3 font-normal outline-none focus:border-[var(--org-primary-color)]'
const linkCls = 'font-extrabold text-[var(--org-primary-color)] dark:text-[color-mix(in_srgb,var(--org-primary-color)_45%,white)]'

export const DEBT_ICON: Record<string, string> = { student_loan: 'graduation-cap', car_loan: 'car', mortgage: 'house', card: 'receipt', personal: 'hand-coins', other: 'landmark' }
export const SAVE_ICON: Record<string, string> = { k401: 'briefcase', ira: 'piggy-bank', retirement: 'briefcase', savings: 'piggy-bank', other: 'piggy-bank' }
export const isK401 = (s: Saving) => s.kind === 'k401' || (s.kind === 'retirement' && s.pct != null)

/** Set what is paid on a debt or put into an account from the stretch in view on, until changed again. */
export function setPolicy(doc: LifeDoc, target: string, phase: string, month: number, patch: Partial<Policy>) {
  const list = doc.policies || []
  const at = list.find((p) => p.target === target && p.phase === phase && p.month === month)
  const next: Policy = { id: at?.id || uid('p'), target, phase, month, ...(at ? { pay: at.pay, full: at.full, put: at.put, pct: at.pct, to: at.to } : {}), ...patch }
  doc.policies = [...list.filter((p) => p !== at), next]
}

/* ---------------------------------------------------------------- adding */

const ACCOUNT_KINDS: { key: string; title: string; icon: string }[] = [
  { key: 'k401', get title() { return tr('budget.savings_debt.401_k_through_work', '401(k) through work') }, icon: 'briefcase' },
  { key: 'ira', get title() { return tr('budget.savings_debt.ira', 'IRA') }, icon: 'piggy-bank' },
  { key: 'savings', get title() { return tr('budget.savings_debt.another_savings_account', 'Another savings account') }, icon: 'piggy-bank' },
]

export function Pick({ icon, label, note, onClick }: { icon: string; label: string; note?: string; onClick: () => void }) {
  return (
    <li><button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left font-semibold hover:bg-muted">
      <span className="grid size-9 place-items-center rounded-xl bg-muted"><LifeIcon name={icon} /></span><span className="flex-1">{label}{note && <small className="block font-normal text-muted-foreground">{note}</small>}</span><ChevronRight className="size-4 text-muted-foreground" />
    </button></li>
  )
}

/** Debt or account, then its type, then a form whose numbers can all be changed before it goes in. */
export function MoneyTray({ onClose, start = null }: { onClose: () => void; start?: 'debt' | 'save' | null }) {
  const { catalog } = useLife()
  const [side, setSide] = React.useState<'debt' | 'save' | null>(start)
  const [kind, setKind] = React.useState<string | null>(null)
  const kinds = side === 'debt' ? (catalog?.debt_kinds || []).filter((k) => k.key !== 'mortgage' && k.key !== 'car_loan').map((k) => ({ ...k, icon: DEBT_ICON[k.key] || 'landmark' })) : ACCOUNT_KINDS
  const title = kind ? kinds.find((k) => k.key === kind)?.title || tr('lit.people_access.add', 'Add') : side === 'debt' ? tr('lit.savings_debt.add_a_debt', 'Add a debt') : side === 'save' ? tr('lit.savings_debt.add_an_account', 'Add an account') : tr('lit.savings_debt.add_a_debt_or_an', 'Add a debt or an account')
  const back = kind ? () => setKind(null) : side && !start ? () => setSide(null) : null
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-1">{back && <Button variant="ghost" size="icon" onClick={back} aria-label={tr('budget.add_tray.back', 'Back')} className="-ml-2"><ChevronLeft /></Button>}{title}</DialogTitle></DialogHeader>
        {!side && <ul className="grid gap-1 pt-2">
          <Pick icon="landmark" label={tr('budget.chart_events.debt', 'Debt')} note="A student loan, a credit card, money you borrowed" onClick={() => setSide('debt')} />
          <Pick icon="piggy-bank" label={tr('budget.savings_debt.savings_or_retirement_account', 'Savings or retirement account')} note="A 401(k), an IRA, another account" onClick={() => setSide('save')} />
        </ul>}
        {side && !kind && <ul className="grid gap-1 pt-2">
          {kinds.map((k) => <Pick key={k.key} icon={k.icon} label={k.title} onClick={() => setKind(k.key)} />)}
          {side === 'debt' && <li className="px-2 pt-2 text-xs text-muted-foreground">{tr('budget.savings_debt.a_loan_for_a_car', 'A loan for a car or a home is added with the thing you buy, under You own.')}</li>}
        </ul>}
        {side === 'debt' && kind && <DebtForm kind={kind} title={kinds.find((k) => k.key === kind)?.title || tr('budget.savings_debt.loan', 'Loan')} onDone={onClose} />}
        {side === 'save' && kind && <AccountForm kind={kind} title={kinds.find((k) => k.key === kind)?.title || tr('budget.savings_debt.account', 'Account')} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

export function WhenPick({ value, onChange }: { value: When; onChange: (w: When) => void }) {
  const { doc } = useLife()
  return (
    <select className={fieldCls} value={`${value.phase}|${value.month}`} onChange={(e) => { const [p, m] = e.target.value.split('|'); onChange({ phase: p, month: Number(m) }) }} aria-label={tr('budget.money_cards.when', 'When')}>
      {doc.phases.map((p) => <optgroup key={p.id} label={p.title}>{Array.from({ length: Math.min(p.months, 600) }, (_, m) => <option key={m} value={`${p.id}|${m}`}>{monthLabel(doc.start, phaseOffset(doc, p.id) + m)}</option>)}</optgroup>)}
    </select>
  )
}

function DebtForm({ kind, title, onDone }: { kind: string; title: string; onDone: () => void }) {
  const { doc, phase, stretch, update, setOpenLine } = useLife()
  const card = kind === 'card'
  const [f, setF] = React.useState({ title: card ? tr('lit.savings_debt.credit_card', 'Credit card') : title, later: !card, when: { phase: phase.id, month: stretch.m0 } as When, received: true, balance: '', rate: '' })
  const [payment, setPayment] = React.useState(0)
  const bal = num(f.balance), rate = num(f.rate)
  const startG = f.later ? phaseOffset(doc, f.when.phase) + f.when.month : 0
  const add = () => {
    const d: Debt = { id: uid('d'), kind, title: f.title.trim() || title, balance: bal, rate, payment, start: f.later ? f.when : null, received: f.later ? f.received : null }
    update((doc2) => { doc2.debts.push(d) })
    setOpenLine(`m:${d.id}`)
    onDone()
  }
  const choice = (later: boolean, label: string, sub: string) => (
    <button type="button" aria-pressed={f.later === later} onClick={() => setF({ ...f, later })}
      className={`rounded-xl px-3 py-2 text-left ring-1 ${f.later === later ? 'bg-[color-mix(in_srgb,var(--org-primary-color)_14%,transparent)] ring-[var(--org-primary-color)]' : 'ring-border hover:bg-muted'}`}>
      <b className="block text-sm">{label}</b><small className="block text-xs text-muted-foreground">{sub}</small>
    </button>
  )
  return (
    <form className="space-y-4 pt-2" onSubmit={(e) => { e.preventDefault(); add() }}>
      <label className="grid gap-1 text-sm font-semibold">{tr('budget.add_tray.name', 'Name')}<input className={fieldCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
      <div className="grid gap-1.5 text-sm font-semibold">{tr('budget.savings_debt.when_does_it_start', 'When does it start?')}
        <div className="grid grid-cols-2 gap-2">
          {choice(true, card ? 'I start using it' : 'I take it out', tr('lit.savings_debt.on_a_date_in_your', 'On a date in your plan. The money comes in then.'))}
          {choice(false, 'I already owe it', `Owed from the start of your plan, ${monthLabel(doc.start, 0)}. No money comes in.`)}
        </div>
      </div>
      {f.later && <>
        <label className="grid gap-1 text-sm font-semibold">{tr('budget.savings_debt.date_you_take_it_out', 'Date you take it out')}<WhenPick value={f.when} onChange={(w) => setF({ ...f, when: w })} /></label>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={f.received} onChange={(e) => setF({ ...f, received: e.target.checked })} />{tr('budget.savings_debt.the_money_goes_into_my', 'The money goes into my savings')}</label>
      </>}
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-sm font-semibold">{f.later ? tr('budget.savings_debt.how_much_you_borrow', 'How much you borrow') : tr('budget.savings_debt.what_you_owe', 'What you owe')}<input className={fieldCls} inputMode="decimal" value={f.balance} onChange={(e) => setF({ ...f, balance: e.target.value })} placeholder="$0" autoFocus /></label>
        <label className="grid gap-1 text-sm font-semibold">{tr('budget.savings_debt.interest_a_year', 'Interest (% a year)')}<input className={fieldCls} inputMode="decimal" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} placeholder="0" /></label>
      </div>
      <LinkedTerms idPrefix="new" balance={bal} rate={rate} payment={payment} onPayment={setPayment} />
      <LoanStory planStart={doc.start} startG={startG} balance={bal} rate={rate} payment={payment} lands={f.later && f.received} already={!f.later} />
      <p className="text-xs text-muted-foreground">{card ? tr('budget.savings_debt.your_statement_shows_the_balance', 'Your statement shows the balance, the rate and the minimum.') : tr('budget.savings_debt.your_loan_papers_show_the', 'Your loan papers show the rate and the monthly payment. Paying more than the minimum is usually allowed and pays it off sooner; you can do that later, stretch by stretch.')}</p>
      <Button type="submit" variant="brand" className="w-full">{tr('budget.add_tray.add', 'Add')}{' '}{f.title.trim() ? `"${f.title.trim()}"` : ''}</Button>
    </form>
  )
}

function AccountForm({ kind, title, onDone }: { kind: string; title: string; onDone: () => void }) {
  const { update, setOpenLine } = useLife()
  const k = kind === 'k401'
  const [f, setF] = React.useState({ title: k ? '401(k)' : kind === 'ira' ? 'IRA' : tr('lit.savings_debt.savings', 'Savings'), balance: '', monthly: '', pct: '', match: '', rate: '' })
  const add = () => {
    const s: Saving = { id: uid('s'), kind, title: f.title.trim() || title, balance: num(f.balance), rate: num(f.rate), monthly: k ? 0 : num(f.monthly), main: false, pct: k ? Math.min(100, num(f.pct)) : null, match: k && f.match.trim() ? Math.min(100, num(f.match)) : null }
    update((doc) => { doc.savings.push(s) })
    setOpenLine(`m:${s.id}`)
    onDone()
  }
  return (
    <form className="space-y-4 pt-2" onSubmit={(e) => { e.preventDefault(); add() }}>
      <label className="grid gap-1 text-sm font-semibold">{tr('budget.add_tray.name', 'Name')}<input className={fieldCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-sm font-semibold">{tr('budget.savings_debt.in_it_now', 'In it now')}<input className={fieldCls} inputMode="decimal" value={f.balance} onChange={(e) => setF({ ...f, balance: e.target.value })} placeholder="$0" autoFocus /></label>
        {k ? <>
          <label className="grid gap-1 text-sm font-semibold">{tr('budget.savings_debt.you_put_in_of_pay', 'You put in (% of pay)')}<input className={fieldCls} inputMode="decimal" value={f.pct} onChange={(e) => setF({ ...f, pct: e.target.value })} placeholder="0" /></label>
          <label className="grid gap-1 text-sm font-semibold">{tr('budget.savings_debt.employer_matches_up_to_of', 'Employer matches up to (% of pay)')}<input className={fieldCls} inputMode="decimal" value={f.match} onChange={(e) => setF({ ...f, match: e.target.value })} placeholder="0" /></label>
        </> : <label className="grid gap-1 text-sm font-semibold">{tr('budget.savings_debt.put_in_a_month', 'Put in a month')}<input className={fieldCls} inputMode="decimal" value={f.monthly} onChange={(e) => setF({ ...f, monthly: e.target.value })} placeholder="$0" /></label>}
        <label className="grid gap-1 text-sm font-semibold">{tr('budget.savings_debt.growth_a_year', 'Growth (% a year)')}<input className={fieldCls} inputMode="decimal" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} placeholder="0" /></label>
      </div>
      <p className="text-xs text-muted-foreground">{k ? tr('budget.savings_debt.your_employer_s_benefits_page', 'Your employer\'s benefits page says how much they match. We don\'t guess growth, so put in your own rate.') : tr('budget.savings_debt.we_don_t_guess_growth', 'We don\'t guess growth, so put in your account\'s rate.')}</p>
      <Button type="submit" variant="brand" className="w-full">{tr('budget.add_tray.add', 'Add')}{' '}{f.title.trim() ? `"${f.title.trim()}"` : ''}</Button>
    </form>
  )
}
