'use client'
/* eslint-disable no-unused-vars -- parameter names in function types */

import React from 'react'
import { CalendarRange, FileText, Pencil, Trash2 } from 'lucide-react'
import type { Debt } from '@services/life/life'
import { useLife } from './LifeContext'
import { LinkedTerms, LoanStory } from './LoanStory'
import Sheet from './Sheet'
import { DEBT_ICON, WhenPick, fieldCls, setPolicy } from './SavingsDebt'
import { Field, Monthly, MoneyRow, NumIn, ObjectCard, ObjectSection, Outlook, RenameSheet, SelectField, SheetActions, usePhaseEnd } from './MoneyParts'
import { fromMonthly, lands, money, monthLabel, payoffMonths, phaseOffset, policyAt, toMonthly, type DebtAt } from './model'

import { tr } from '@/lib/tr'
const num = (s: string) => { const v = Number(String(s).replace(/[$,%\s]/g, '')); return Number.isFinite(v) && v >= 0 ? v : 0 }

/** When a debt is paid off at what is paid in the stretch in view, and what is still owed when the phase ends. */
function useDebtOutlook(at: DebtAt) {
  const { doc, stretch, projection } = useLife()
  const { end, endLabel } = usePhaseEnd()
  const { debt: d, state, balance, payment, paidOffAt } = at
  const hist = projection.historyOf(d.id)
  const endOwed = hist[Math.min(end, hist.length - 1)] ?? 0
  const months = state === 'owing' ? payoffMonths(balance, d.rate, payment) : null
  const offLabel = paidOffAt != null ? monthLabel(doc.start, paidOffAt) : state === 'owing' && months != null ? monthLabel(doc.start, stretch.g0 + months - 1) : null
  return { endOwed, endLabel, offLabel }
}

/** Loans and cards, as things you have: what each one is owed at, how far it's paid back, and when it's paid off. */
export function DebtsSection() {
  const { doc, stretch, projection } = useLife()
  const g = stretch.g0
  const short = projection.short[g] || 0
  if (!doc.debts.length && short <= 0.5) return null
  const debts = projection.debtsAt(g)
  const owed = debts.reduce((a, d) => a + (d.state === 'owing' ? d.balance : 0), 0) + short
  return (
    <ObjectSection title={tr('budget.debts.debts', 'Debts')} label={tr('budget.debts.owed_in', 'owed in {{a}}', { a: monthLabel(doc.start, g) })} figure={money(owed)}>
      {debts.map((d) => <DebtObject key={d.debt.id} at={d} />)}
      {short > 0.5 && <ShortObject owed={short} />}
    </ObjectSection>
  )
}

function DebtObject({ at }: { at: DebtAt }) {
  const { doc } = useLife()
  const [open, setOpen] = React.useState(false)
  const { debt: d, state, balance, startsAt } = at
  const { endOwed, offLabel } = useDebtOutlook(at)
  const chip = [`${d.rate}%`, state === 'later' ? tr('budget.line.from_a', 'from {{a}}', { a: monthLabel(doc.start, startsAt!) }) : offLabel ? tr('budget.debt.paid_off_a', 'paid off {{a}}', { a: offLabel }) : state === 'owing' ? tr('budget.debt.not_paid_off', 'not paid off at this rate') : ''].filter(Boolean).join(' · ')
  const foot = state === 'paid' ? '' : endOwed > 0.5 ? tr('budget.debt.owed_by_end', '{{m}} owed by end', { m: money(endOwed) }) : tr('budget.debt.gone_by_end', 'paid off by end')
  return <>
    <ObjectCard id={`m:${d.id}`} tone="debt" icon={DEBT_ICON[d.kind] || 'landmark'} title={d.title} onOpen={() => setOpen(true)} muted={state !== 'owing'}
      value={state === 'paid' ? tr('lit.savings_debt.paid_off', 'Paid off') : money(state === 'later' ? d.balance : balance)}
      label={state === 'later' ? tr('budget.debts.to_borrow', 'to borrow') : state === 'owing' ? tr('budget.debts.owed', 'owed') : ''}
      chip={chip} foot={foot} progress={state === 'owing' && d.balance > 0 ? 1 - balance / Math.max(d.balance, balance) : null} />
    <DebtSheet open={open} at={at} onClose={() => setOpen(false)} />
  </>
}

/** What you pay on a debt in the stretch in view: its minimum (or, for a card, all of it) and your own amount. */
function PayFields({ at }: { at: DebtAt }) {
  const { doc, phase, stretch, per, update } = useLife()
  const { debt: d, state, payment } = at
  const pol = policyAt(doc, d.id, stretch.g0)
  const perShort = `/${tr(`budget.per_short.${per}`, per)}`
  const edit = (fn: (x: Debt) => void) => update((doc2) => { const x = doc2.debts.find((y) => y.id === d.id); if (x) fn(x) })
  const setPay = (patch: { pay?: number | null; full?: boolean | null }) => update((doc2) => setPolicy(doc2, d.id, phase.id, stretch.m0, patch))
  return <>
    <div className="grid grid-cols-2 gap-2.5">
      <Field label={tr('lit.savings_debt.interest', 'Interest')}><NumIn label={tr('budget.savings_debt.interest_a_year', 'Interest (% a year)')} prefix="" suffix="% a year" value={d.rate} onSet={(v) => edit((x) => { x.rate = Math.min(100, v) })} /></Field>
      {d.kind === 'card'
        ? <SelectField label={tr('budget.debt.each_month', 'Each month you pay')} value={pol?.full ? 'full' : 'set'} options={[['set', tr('budget.debt.an_amount', 'An amount')], ['full', tr('budget.debt.all_of_it', 'All of it')]]} onChange={(v) => setPay({ full: v === 'full', pay: null })} />
        : <Field label={tr('lit.savings_debt.minimum', 'Minimum')}><NumIn label={tr('lit.savings_debt.minimum', 'Minimum')} suffix={perShort} value={fromMonthly(d.payment, per)} onSet={(v) => edit((x) => { x.payment = toMonthly(v, per) })} /></Field>}
    </div>
    {state !== 'paid' && (
      <div className="flex items-end gap-3">
        <span className="mb-2 flex-1 text-xs text-muted-foreground">{state === 'later' ? tr('lit.savings_debt.payments_start_the_month_you', 'Payments start the month you take it out.') : tr('budget.debt.from_on', 'From {{a}} on, until you change it', { a: monthLabel(doc.start, stretch.g0) })}</span>
        <Field label={tr('budget.debt.you_pay', 'You pay')} hot className="w-40 shrink-0">
          <NumIn label={tr('budget.savings_debt.what_you_pay_on_title', 'What you pay on {{title}} each {{value}}', { title: d.title, value: per })} disabled={!!pol?.full || state !== 'owing'} suffix={perShort}
            value={fromMonthly(state === 'owing' ? payment : d.payment, per)} onSet={(v) => setPay({ pay: Math.max(d.payment, toMonthly(v, per)), full: null })} />
        </Field>
      </div>
    )}
  </>
}

function DebtStory({ at }: { at: DebtAt }) {
  const { doc, phase, stretch } = useLife()
  const { endOwed, endLabel, offLabel } = useDebtOutlook(at)
  const { debt: d, state, balance, startsAt } = at
  const linked = doc.assets.find((a) => a.loan_id === d.id)
  return (
    <Outlook>
      {state === 'later'
        ? <>{tr('budget.debt.later_story', 'You borrow {{m}} in {{a}}.', { m: money(d.balance), a: monthLabel(doc.start, startsAt!) })}{' '}{lands(doc, d) ? tr('budget.debt.lands', 'The money goes into your savings.') : linked ? tr('budget.savings_debt.this_loan_pays_for_tolowercase', 'This loan pays for {{toLowerCase}}.', { toLowerCase: linked.title.toLowerCase() }) : ''}</>
        : state === 'paid' ? tr('budget.debt.paid_story', 'Nothing left to pay.')
        : <>{tr('budget.debt.owe_from', 'You owe {{m}} in {{s}}', { m: money(balance), s: monthLabel(doc.start, stretch.g0) })}{endOwed > 0.5 ? tr('budget.debt.owe_end', ' and {{m}} by {{a}}, the end of {{p}}', { m: money(endOwed), a: endLabel, p: phase.title }) : tr('budget.debt.gone_end', ', paid off before {{p}} ends', { p: phase.title })}.{' '}
          {offLabel ? tr('budget.debt.off_on', 'At this rate it’s paid off in {{a}}.', { a: offLabel }) : tr('budget.debt.never', 'This doesn’t cover the interest, so what you owe keeps growing.')}</>}
    </Outlook>
  )
}

/** A debt's details: what you pay, its story, and its terms, dates, name and removal. */
function DebtSheet({ open, at, onClose }: { open: boolean; at: DebtAt; onClose: () => void }) {
  const { doc, update, readOnly } = useLife()
  const [sheet, setSheet] = React.useState<'terms' | 'dates' | 'name' | null>(null)
  const { debt: d, startsAt } = at
  const linked = doc.assets.find((a) => a.loan_id === d.id)
  const edit = (fn: (x: Debt) => void) => update((doc2) => { const x = doc2.debts.find((y) => y.id === d.id); if (x) fn(x) })
  const actions = [
    { icon: <Pencil />, label: tr('budget.line.rename', 'Rename'), onSelect: () => setSheet('name') },
    { icon: <FileText />, label: tr('budget.debt.loan_terms', 'Loan terms'), onSelect: () => setSheet('terms') },
    ...(d.start && !linked ? [{ icon: <CalendarRange />, label: tr('budget.line.adjust_dates', 'Adjust dates'), onSelect: () => setSheet('dates') }] : []),
    ...(linked ? [] : [{ icon: <Trash2 />, label: tr('budget.budget_table.remove', 'Remove'), danger: true, onSelect: () => { onClose(); update((doc2) => { doc2.debts = doc2.debts.filter((x) => x.id !== d.id); doc2.policies = (doc2.policies || []).filter((x) => x.target !== d.id) }) } }]),
  ]
  return (
    <Sheet open={open} onClose={onClose} title={d.title}>
      <fieldset disabled={readOnly} className="grid min-w-0 gap-3 text-sm">
        <PayFields at={at} />
        <DebtStory at={at} />
        {!readOnly && <SheetActions items={actions} />}
      </fieldset>
      <RenameSheet open={sheet === 'name'} value={d.title} onClose={() => setSheet(null)} onSave={(t) => t && edit((x) => { x.title = t })} />
      <TermsSheet open={sheet === 'terms'} debt={d} startsAt={startsAt} onClose={() => setSheet(null)} />
      {d.start && <Sheet open={sheet === 'dates'} onClose={() => setSheet(null)} title={tr('budget.line.adjust_dates', 'Adjust dates')} description={tr('budget.debt.dates_help', 'The month you take out {{t}}.', { t: d.title })}>
        <WhenPick value={d.start} onChange={(w) => edit((x) => { x.start = w })} />
        <button type="button" onClick={() => setSheet(null)} className="h-10 rounded-xl bg-[var(--org-primary-color)] text-sm font-bold text-[var(--org-on-primary-color)]">{tr('budget.line.done', 'Done')}</button>
      </Sheet>}
    </Sheet>
  )
}

/** A loan payment, as an expense line: what you pay on it this stretch. The loan itself is a card further down. */
export function DebtPayRow({ at, first }: { at: DebtAt; first: boolean }) {
  const [open, setOpen] = React.useState(false)
  const { offLabel } = useDebtOutlook(at)
  const { debt: d } = at
  const sub = [tr('budget.debts.payment', 'payment'), `${d.rate}%`, offLabel ? tr('budget.debt.paid_off_a', 'paid off {{a}}', { a: offLabel }) : tr('budget.debt.not_paid_off', 'not paid off at this rate')].join(' · ')
  return (
    <MoneyRow id={`pay:${d.id}`} icon={DEBT_ICON[d.kind] || 'landmark'} title={d.title} amount={<Monthly value={at.payment} />} sub={sub} first={first}
      menu={[{ icon: <FileText />, label: tr('budget.debts.see_the_loan', 'See the loan'), onSelect: () => setOpen(true) }]}>
      <PayFields at={at} />
      <DebtStory at={at} />
      <DebtSheet open={open} at={at} onClose={() => setOpen(false)} />
    </MoneyRow>
  )
}

/** The loan's terms: kind, amount, rate and payment, its story, and what is really owed when the phase starts. */
function TermsSheet({ open, debt: d, startsAt, onClose }: { open: boolean; debt: Debt; startsAt: number | null; onClose: () => void }) {
  const { doc, phase, catalog, update } = useLife()
  const edit = (fn: (x: Debt) => void) => update((doc2) => { const x = doc2.debts.find((y) => y.id === d.id); if (x) fn(x) })
  const startOwe = phase.starting?.debts?.[d.id]
  return (
    <Sheet open={open} onClose={onClose} title={tr('budget.debt.loan_terms', 'Loan terms')}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold">{tr('budget.savings_debt.kind', 'Kind')}<select className={fieldCls} value={d.kind} onChange={(e) => edit((x) => { x.kind = e.target.value })}>{catalog?.debt_kinds.map((k) => <option key={k.key} value={k.key}>{k.title}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">{d.start ? tr('budget.savings_debt.how_much_you_borrow', 'How much you borrow') : tr('budget.savings_debt.what_you_owe_at_monthlabel', 'What you owe at {{monthLabel}}', { monthLabel: monthLabel(doc.start, 0) })}<input className={fieldCls} inputMode="decimal" defaultValue={String(d.balance)} onBlur={(e) => edit((x) => { x.balance = num(e.target.value) })} /></label>
        <div className="sm:col-span-2"><LinkedTerms idPrefix={d.id} balance={d.balance} rate={d.rate} payment={d.payment} onPayment={(v) => edit((x) => { x.payment = v })} /></div>
        <div className="sm:col-span-2"><LoanStory planStart={doc.start} startG={startsAt ?? 0} balance={d.balance} rate={d.rate} payment={d.payment} lands={lands(doc, d)} already={!d.start} /></div>
        {(!d.start || (startsAt != null && startsAt < phaseOffset(doc, phase.id))) && (
          <label className="grid gap-1 text-sm font-semibold sm:col-span-2">{tr('budget.savings_debt.what_you_really_owe_when', 'What you really owe when {{title}} starts (optional)', { title: phase.title })}
            <input className={fieldCls} inputMode="decimal" placeholder={tr('budget.savings_debt.leave_empty_to_carry_on', 'Leave empty to carry on from before')} defaultValue={startOwe != null ? String(startOwe) : ''}
              onBlur={(e) => { const t = e.target.value.trim(); update((doc2) => { const ph = doc2.phases.find((x) => x.id === phase.id)!; const st = { ...(ph.starting || {}), debts: { ...(ph.starting?.debts || {}) } }; if (t) st.debts[d.id] = num(t); else delete st.debts[d.id]; ph.starting = st }) }} />
          </label>
        )}
      </div>
      <button type="button" onClick={onClose} className="h-10 rounded-xl bg-[var(--org-primary-color)] text-sm font-bold text-[var(--org-on-primary-color)]">{tr('budget.line.done', 'Done')}</button>
    </Sheet>
  )
}

/** Money you'd be short: it goes on a card, paid back first from what is left in later months. */
function ShortObject({ owed }: { owed: number }) {
  const { doc, projection, update, readOnly } = useLife()
  const [open, setOpen] = React.useState(false)
  return <>
    <ObjectCard id="m:short" tone="debt" icon="receipt" title={tr('budget.savings_debt.card_for_money_you_re', 'Card for money you\'re short')} value={money(owed)} label={tr('budget.debts.owed', 'owed')}
      chip={tr('budget.debts.short_chip', '{{r}}% · your savings ran out', { r: projection.cardRate })} onOpen={() => setOpen(true)} />
    <Sheet open={open} onClose={() => setOpen(false)} title={tr('budget.savings_debt.card_for_money_you_re', 'Card for money you\'re short')}>
      <fieldset disabled={readOnly} className="grid min-w-0 gap-3 text-sm">
        <Field label={tr('budget.savings_debt.card_rate', 'Card rate')} className="w-48"><NumIn label={tr('budget.savings_debt.card_rate_percent_a_year', 'Card rate, percent a year')} prefix="" suffix="% a year" value={projection.cardRate} onSet={(v) => update((d) => { d.card_rate = Math.min(100, v) })} /></Field>
        <Outlook>{tr('budget.savings_debt.your_savings_ran_out_so', 'Your savings ran out, so the rest goes on a card. It\'s paid back first from what\'s left in later months.')}{doc.card_rate == null ? tr('budget.savings_debt.we_have_no_published_card', ' We have no published card rate to start from yet, so put in your card\'s rate.') : ''}</Outlook>
      </fieldset>
    </Sheet>
  </>
}
