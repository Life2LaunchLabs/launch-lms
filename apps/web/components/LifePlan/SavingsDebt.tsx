'use client'
/* eslint-disable no-unused-vars -- parameter names in function types */

import React from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@components/ui/dialog'
import type { Debt, LifeDoc, Policy, Saving, When } from '@services/life/life'
import { useLife } from './LifeContext'
import { LifeIcon } from './icons'
import { LinkedTerms, LoanStory } from './LoanStory'
import { PER_WORD, fromMonthly, lands, money, monthLabel, payoffMonths, phaseOffset, policyAt, toMonthly, uid, type DebtAt, type SavingAt } from './model'

import { tr } from '@/lib/tr'
const num = (s: string) => { const v = Number(String(s).replace(/[$,%\s]/g, '')); return Number.isFinite(v) && v >= 0 ? v : 0 }
export const fieldCls = 'h-10 rounded-xl border border-border bg-background px-3 font-normal outline-none focus:border-[var(--org-primary-color)]'
const linkCls = 'font-extrabold text-[var(--org-primary-color)] dark:text-[color-mix(in_srgb,var(--org-primary-color)_45%,white)]'

const DEBT_ICON: Record<string, string> = { student_loan: 'graduation-cap', car_loan: 'car', mortgage: 'house', card: 'receipt', personal: 'hand-coins', other: 'landmark' }
const SAVE_ICON: Record<string, string> = { k401: 'briefcase', ira: 'piggy-bank', retirement: 'briefcase', savings: 'piggy-bank', other: 'piggy-bank' }
const isK401 = (s: Saving) => s.kind === 'k401' || (s.kind === 'retirement' && s.pct != null)

/** Set what is paid on a debt or put into an account from the stretch in view on, until changed again. */
function setPolicy(doc: LifeDoc, target: string, phase: string, month: number, patch: Partial<Policy>) {
  const list = doc.policies || []
  const at = list.find((p) => p.target === target && p.phase === phase && p.month === month)
  const next: Policy = { id: at?.id || uid('p'), target, phase, month, ...(at ? { pay: at.pay, full: at.full, put: at.put, pct: at.pct } : {}), ...patch }
  doc.policies = [...list.filter((p) => p !== at), next]
}

/** A number typed in place, styled like the value it replaces. */
export function InPlace({ value, onCommit, label, prefix = '$', suffix, width = 6, disabled }: { value: number; onCommit: (v: number) => void; label: string; prefix?: string; suffix?: string; width?: number; disabled?: boolean }) {
  return (
    <label className="inline-flex items-baseline font-extrabold tabular-nums">
      {prefix}
      <input aria-label={label} inputMode="decimal" key={`${label}${value}`} defaultValue={String(Math.round(value * 100) / 100)} disabled={disabled} style={{ width: `${width}ch` }}
        className="border-b-[1.5px] border-dashed border-border bg-transparent text-right outline-none focus:border-[var(--org-primary-color)]"
        onBlur={(e) => { const n = num(e.target.value); if (Math.abs(n - value) > 0.004) onCommit(n) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
      {suffix && <span className="ml-0.5 text-sm font-semibold text-muted-foreground">{suffix}</span>}
    </label>
  )
}

/** The lines behind a number, in a box so they don't read as part of the tally. */
export function Facts({ rows, note }: { rows: [string, React.ReactNode][]; note?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-muted/60 p-3 text-sm">
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        {rows.map(([k, v]) => <React.Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-semibold tabular-nums">{v}</dd></React.Fragment>)}
      </dl>
      {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
    </div>
  )
}

export function RowShell({ id, icon, title, value, tone, children, onRemove }: { id: string; icon: string; title: string; value: React.ReactNode; tone?: 'muted' | 'bad'; children: React.ReactNode; onRemove?: () => void }) {
  const { openLine, setOpenLine, readOnly } = useLife()
  const open = openLine === id
  return (
    <div id={`row-${id}`} className="border-b border-border/70 last:border-b-0">
      <div className="flex items-center gap-3 py-3">
        <button type="button" aria-expanded={open} onClick={() => setOpenLine(open ? null : id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-muted"><LifeIcon name={icon} /></span>
          <span className={`min-w-0 flex-1 truncate ${open ? 'font-extrabold' : 'font-semibold'}`}>{title}</span>
          {!open && <span className={`font-semibold tabular-nums ${tone === 'muted' ? 'text-sm text-muted-foreground' : tone === 'bad' ? 'text-red-700 dark:text-red-300' : ''}`}>{value}</span>}
        </button>
        {open && onRemove && !readOnly && <button type="button" onClick={() => { onRemove(); setOpenLine(null) }} aria-label={`Remove ${title}`} title={tr('budget.budget_table.remove', 'Remove')} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="size-4" /></button>}
      </div>
      {open && <div className="space-y-3 pb-4">{children}</div>}
    </div>
  )
}

function Section({ id, title, total, children }: { id: string; title: string; total: React.ReactNode; children: React.ReactNode }) {
  const [shut, setShut] = React.useState(false)
  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5">
        <button type="button" aria-expanded={!shut} aria-controls={`sd-${id}`} onClick={() => setShut(!shut)} className="inline-flex items-center gap-2 text-lg font-extrabold">{title}<ChevronDown className={`size-4 transition-transform ${shut ? '-rotate-90' : ''}`} /></button>
        <span className="text-sm font-extrabold tabular-nums">{total}</span>
      </div>
      {!shut && <div id={`sd-${id}`} className="px-4 pb-2 sm:px-5">{children}</div>}
    </div>
  )
}

/** Debt and savings in one card: what goes to each this stretch, and the savings account takes what is left. */
export function SavingsDebtCard() {
  const { doc, stretch, per, projection, readOnly } = useLife()
  const [adding, setAdding] = React.useState(false)
  const g = stretch.g0
  const debts = projection.debtsAt(g)
  const saves = projection.savingsAt(g)
  const short = projection.short[g] || 0
  const paid = projection.paid[g] ?? 0
  const put = projection.put[g] ?? 0
  const left = projection.left[g] ?? 0
  const p = (v: number) => money(fromMonthly(v, per))
  const owed = debts.reduce((a, d) => a + (d.state === 'owing' ? d.balance : 0), 0) + short
  const mainSave = doc.savings.find((s) => s.main)
  return (
    <section className="overflow-hidden rounded-2xl bg-card shadow-[0_1px_0_hsl(var(--border))]">
      <Section id="debt" title={tr('budget.chart_events.debt', 'Debt')} total={paid > 0.5 ? `paying ${p(paid)}/${per}` : owed > 0.5 ? `${money(owed)} owed` : tr('lit.savings_debt.none', 'None')}>
        {debts.map((d) => <DebtRow key={d.debt.id} at={d} />)}
        {short > 0.5 && <ShortRow owed={short} />}
        {!debts.length && short <= 0.5 && <p className="pb-3 text-sm text-muted-foreground">{tr('budget.savings_debt.loans_and_cards_you_pay', 'Loans and cards you pay back. A loan for a car or a home is added with the thing you buy.')}</p>}
      </Section>
      <Section id="save" title={tr('budget.chart_events.savings', 'Savings')} total={left + put >= 0 ? `saving ${p(left + put)}/${per}` : <span className="text-red-700 dark:text-red-300">{tr('budget.savings_debt.drawing_p_per', 'drawing {{p}}/{{per}}', { p: p(-(left + put)), per })}</span>}>
        {doc.savings.filter((s) => !s.main).map((s) => <AccountRow key={s.id} s={s} at={saves.find((x) => x.id === s.id)!} />)}
        {mainSave && <MainRow s={mainSave} at={saves.find((x) => x.id === mainSave.id)!} left={left} />}
      </Section>
      {!readOnly && <div className="px-4 pb-4 pt-2 sm:px-5"><button type="button" onClick={() => setAdding(true)} className={`inline-flex items-center gap-1 text-sm ${linkCls}`}><Plus className="size-4" />{tr('budget.savings_debt.add_a_debt_or_an', 'Add a debt or an account')}</button></div>}
      {adding && <MoneyTray onClose={() => setAdding(false)} />}
      <p className="sr-only">{PER_WORD[per]}</p>
    </section>
  )
}

function DebtRow({ at }: { at: DebtAt }) {
  const { doc, phase, stretch, per, update, readOnly, catalog } = useLife()
  const { debt: d, state, balance, payment, minimum, startsAt, paidOffAt } = at
  const [details, setDetails] = React.useState(false)
  const pol = policyAt(doc, d.id, stretch.g0)
  const card = d.kind === 'card'
  const value = state === 'later' ? `Starts ${monthLabel(doc.start, startsAt!)}` : state === 'paid' ? tr('lit.savings_debt.paid_off', 'Paid off') : money(fromMonthly(payment, per))
  const months = state === 'owing' ? payoffMonths(balance, d.rate, payment) : null
  // The plan's own payoff month counts later changes (like paying a card in full); past the plan, extrapolate this stretch's payment.
  const off = paidOffAt != null ? monthLabel(doc.start, paidOffAt) : state !== 'owing' ? '—' : months == null ? tr('lit.savings_debt.not_at_this_rate', 'Not at this rate') : monthLabel(doc.start, stretch.g0 + months - 1)
  const linked = doc.assets.find((a) => a.loan_id === d.id)
  const startOwe = phase.starting?.debts?.[d.id]
  const edit = (fn: (x: Debt) => void) => update((doc2) => { const x = doc2.debts.find((y) => y.id === d.id); if (x) fn(x) })
  return (
    <RowShell id={`m:${d.id}`} icon={DEBT_ICON[d.kind] || 'landmark'} title={d.title} value={value} tone={state === 'owing' ? undefined : 'muted'}
      onRemove={linked ? undefined : () => update((doc2) => { doc2.debts = doc2.debts.filter((x) => x.id !== d.id); doc2.policies = (doc2.policies || []).filter((x) => x.target !== d.id) })}>
      <Facts rows={[
        [state === 'later' ? tr('lit.savings_debt.you_borrow', 'You borrow') : tr('lit.savings_debt.you_owe', 'You owe'), money(balance)],
        [tr('lit.savings_debt.interest', 'Interest'), `${d.rate}% a year`],
        [tr('lit.savings_debt.minimum', 'Minimum'), `${money(fromMonthly(state === 'owing' ? minimum : d.payment, per))} a ${PER_WORD[per]}`],
        [tr('lit.savings_debt.paid_off', 'Paid off'), off],
        ...(state === 'later' ? [[tr('lit.savings_debt.money_into_savings', 'Money into savings'), lands(doc, d) ? `+${money(d.balance)} when you take it` : 'No']] as [string, string][] : []),
      ]} note={linked ? <>{tr('budget.savings_debt.this_loan_pays_for_tolowercase', 'This loan pays for {{toLowerCase}}.', { toLowerCase: linked.title.toLowerCase() })}</> : state === 'later' ? tr('lit.savings_debt.payments_start_the_month_you', 'Payments start the month you take it out.') : tr('lit.savings_debt.what_you_pay_carries_on', 'What you pay carries on until you change it in a later stretch.')} />
      {state === 'owing' && !readOnly && (
        <div className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-2">
          {card && <button type="button" aria-pressed={!!pol?.full} onClick={() => update((doc2) => setPolicy(doc2, d.id, phase.id, stretch.m0, { full: !pol?.full, pay: null }))} className={`mr-auto rounded-full px-3 py-1 text-xs font-semibold ring-1 ${pol?.full ? 'bg-[var(--org-primary-color)] text-[var(--org-on-primary-color)] ring-transparent' : 'ring-border'}`}>{tr('budget.savings_debt.pay_it_all_off', 'Pay it all off')}</button>}
          <span className="text-sm text-muted-foreground">{tr('budget.savings_debt.you_pay_from_monthlabel', 'You pay from {{monthLabel}}', { monthLabel: monthLabel(doc.start, stretch.g0) })}</span>
          <InPlace label={`What you pay on ${d.title} each ${PER_WORD[per]}`} value={fromMonthly(payment, per)} suffix={`/${per}`} disabled={!!pol?.full}
            onCommit={(v) => update((doc2) => setPolicy(doc2, d.id, phase.id, stretch.m0, { pay: Math.max(d.payment, toMonthly(v, per)), full: null }))} />
        </div>
      )}
      {!readOnly && <button type="button" onClick={() => setDetails(!details)} aria-expanded={details} className="text-xs font-semibold text-muted-foreground underline decoration-dashed underline-offset-4 hover:text-foreground">{details ? tr('budget.savings_debt.hide_the_loan_terms', 'Hide the loan terms') : tr('budget.savings_debt.change_the_loan_terms', 'Change the loan terms')}</button>}
      {details && !readOnly && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold">{tr('budget.add_tray.name', 'Name')}<input className={fieldCls} defaultValue={d.title} onBlur={(e) => e.target.value.trim() && edit((x) => { x.title = e.target.value.trim() })} /></label>
          <label className="grid gap-1 text-sm font-semibold">{tr('budget.savings_debt.kind', 'Kind')}<select className={fieldCls} value={d.kind} onChange={(e) => edit((x) => { x.kind = e.target.value })}>{catalog?.debt_kinds.map((k) => <option key={k.key} value={k.key}>{k.title}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-semibold">{d.start ? tr('budget.savings_debt.how_much_you_borrow', 'How much you borrow') : `What you owe at ${monthLabel(doc.start, 0)}`}<input className={fieldCls} inputMode="decimal" defaultValue={String(d.balance)} onBlur={(e) => edit((x) => { x.balance = num(e.target.value) })} /></label>
          <label className="grid gap-1 text-sm font-semibold">{tr('budget.savings_debt.interest_a_year', 'Interest (% a year)')}<input className={fieldCls} inputMode="decimal" defaultValue={String(d.rate)} onBlur={(e) => edit((x) => { x.rate = num(e.target.value) })} /></label>
          <div className="sm:col-span-2"><LinkedTerms idPrefix={d.id} balance={d.balance} rate={d.rate} payment={d.payment} onPayment={(v) => edit((x) => { x.payment = v })} /></div>
          <div className="sm:col-span-2"><LoanStory planStart={doc.start} startG={startsAt ?? 0} balance={d.balance} rate={d.rate} payment={d.payment} lands={lands(doc, d)} already={!d.start} /></div>
          {(!d.start || (startsAt != null && startsAt < phaseOffset(doc, phase.id))) && (
            <label className="grid gap-1 text-sm font-semibold sm:col-span-2">{tr('budget.savings_debt.what_you_really_owe_when', 'What you really owe when {{title}} starts (optional)', { title: phase.title })}
              <input className={fieldCls} inputMode="decimal" placeholder={tr('budget.savings_debt.leave_empty_to_carry_on', 'Leave empty to carry on from before')} defaultValue={startOwe != null ? String(startOwe) : ''}
                onBlur={(e) => { const t = e.target.value.trim(); update((doc2) => { const ph = doc2.phases.find((x) => x.id === phase.id)!; const st = { ...(ph.starting || {}), debts: { ...(ph.starting?.debts || {}) } }; if (t) st.debts[d.id] = num(t); else delete st.debts[d.id]; ph.starting = st }) }} />
            </label>
          )}
        </div>
      )}
    </RowShell>
  )
}

function ShortRow({ owed }: { owed: number }) {
  const { doc, projection, update, readOnly } = useLife()
  return (
    <RowShell id="m:short" icon="receipt" title={tr('budget.savings_debt.card_for_money_you_re', 'Card for money you\'re short')} value={money(owed)} tone="bad">
      <Facts rows={[[tr('lit.savings_debt.you_owe', 'You owe'), money(owed)], [tr('lit.savings_debt.interest', 'Interest'), `${projection.cardRate}% a year`]]}
        note={<>{tr('budget.savings_debt.your_savings_ran_out_so', 'Your savings ran out, so the rest goes on a card. It\'s paid back first from what\'s left in later months.')}{doc.card_rate == null ? tr('budget.savings_debt.we_have_no_published_card', ' We have no published card rate to start from yet, so put in your card\'s rate.') : ''}</>} />
      {!readOnly && <div className="flex items-baseline justify-end gap-3"><span className="text-sm text-muted-foreground">{tr('budget.savings_debt.card_rate', 'Card rate')}</span><InPlace label={tr('budget.savings_debt.card_rate_percent_a_year', 'Card rate, percent a year')} prefix="" suffix="% a year" width={4} value={projection.cardRate} onCommit={(v) => update((d) => { d.card_rate = Math.min(100, v) })} /></div>}
    </RowShell>
  )
}

function AccountRow({ s, at }: { s: Saving; at: SavingAt }) {
  const { doc, phase, stretch, per, update, readOnly } = useLife()
  const [details, setDetails] = React.useState(false)
  const pol = policyAt(doc, s.id, stretch.g0)
  const k = isK401(s)
  const pct = pol?.pct ?? s.pct ?? null
  const edit = (fn: (x: Saving) => void) => update((doc2) => { const x = doc2.savings.find((y) => y.id === s.id); if (x) fn(x) })
  const startIn = phase.starting?.savings?.[s.id]
  return (
    <RowShell id={`m:${s.id}`} icon={SAVE_ICON[s.kind] || 'piggy-bank'} title={s.title} value={at.put > 0.5 ? money(fromMonthly(at.put, per)) : 'Nothing going in'} tone={at.put > 0.5 ? undefined : 'muted'}
      onRemove={() => update((doc2) => { doc2.savings = doc2.savings.filter((x) => x.id !== s.id); doc2.policies = (doc2.policies || []).filter((x) => x.target !== s.id) })}>
      <Facts rows={[
        [tr('lit.savings_debt.in_it_now', 'In it now'), money(at.balance)],
        ...(k ? [[tr('lit.savings_debt.you_put_in', 'You put in'), pct != null ? `${pct}% of pay` : '—'], [tr('lit.savings_debt.your_employer_adds', 'Your employer adds'), s.match ? `${money(fromMonthly(at.match, per))} a ${PER_WORD[per]} (up to ${s.match}% of pay)` : tr('lit.plan_compare.nothing', 'Nothing')]] as [string, string][] : []),
        [tr('lit.savings_debt.growth', 'Growth'), `${s.rate}% a year`],
      ]} note={k && pct && at.put < 0.5 ? 'A 401(k) comes out of pay from work, so nothing goes in without a job.' : tr('lit.savings_debt.what_you_put_in_carries', 'What you put in carries on until you change it in a later stretch.')} />
      {!readOnly && (
        <div className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-2">
          {at.put > 0.5 && <button type="button" onClick={() => update((doc2) => setPolicy(doc2, s.id, phase.id, stretch.m0, k ? { pct: 0 } : { put: 0 }))} className="mr-auto text-xs font-semibold text-muted-foreground underline decoration-dashed underline-offset-4 hover:text-foreground">{tr('budget.savings_debt.stop_adding_to_it_from', 'Stop adding to it from here on')}</button>}
          <span className="text-sm text-muted-foreground">{tr('budget.savings_debt.you_put_in_from_monthlabel', 'You put in from {{monthLabel}}', { monthLabel: monthLabel(doc.start, stretch.g0) })}</span>
          {k ? <InPlace label={`Percent of pay into ${s.title}`} prefix="" suffix="% of pay" width={4} value={pct ?? 0} onCommit={(v) => update((doc2) => setPolicy(doc2, s.id, phase.id, stretch.m0, { pct: Math.min(100, v) }))} />
            : <InPlace label={`What you put into ${s.title} each ${PER_WORD[per]}`} suffix={`/${per}`} value={fromMonthly(at.put, per)} onCommit={(v) => update((doc2) => setPolicy(doc2, s.id, phase.id, stretch.m0, { put: toMonthly(v, per) }))} />}
        </div>
      )}
      {!readOnly && <button type="button" onClick={() => setDetails(!details)} aria-expanded={details} className="text-xs font-semibold text-muted-foreground underline decoration-dashed underline-offset-4 hover:text-foreground">{details ? tr('budget.savings_debt.hide_the_account_details', 'Hide the account details') : tr('budget.savings_debt.change_the_account_details', 'Change the account details')}</button>}
      {details && !readOnly && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold">{tr('budget.add_tray.name', 'Name')}<input className={fieldCls} defaultValue={s.title} onBlur={(e) => e.target.value.trim() && edit((x) => { x.title = e.target.value.trim() })} /></label>
          <label className="grid gap-1 text-sm font-semibold">{tr('budget.savings_debt.in_it_at_monthlabel', 'In it at {{monthLabel}}', { monthLabel: monthLabel(doc.start, 0) })}<input className={fieldCls} inputMode="decimal" defaultValue={String(s.balance)} onBlur={(e) => edit((x) => { x.balance = num(e.target.value) })} /></label>
          <label className="grid gap-1 text-sm font-semibold">{tr('budget.savings_debt.growth_a_year', 'Growth (% a year)')}<input className={fieldCls} inputMode="decimal" defaultValue={String(s.rate)} onBlur={(e) => edit((x) => { x.rate = num(e.target.value) })} /></label>
          {k && <label className="grid gap-1 text-sm font-semibold">{tr('budget.savings_debt.employer_matches_up_to_of', 'Employer matches up to (% of pay)')}<input className={fieldCls} inputMode="decimal" defaultValue={s.match != null ? String(s.match) : ''} placeholder="0" onBlur={(e) => edit((x) => { x.match = e.target.value.trim() ? Math.min(100, num(e.target.value)) : null })} /></label>}
          <StartingField id={s.id} value={startIn} label={tr('budget.savings_debt.what_s_really_in_it', 'What\'s really in it when {{title}} starts (optional)', { title: phase.title })} />
        </div>
      )}
    </RowShell>
  )
}

function StartingField({ id, value, label }: { id: string; value?: number; label: string }) {
  const { phase, update } = useLife()
  return (
    <label className="grid gap-1 text-sm font-semibold sm:col-span-2">{label}
      <input className={fieldCls} inputMode="decimal" placeholder={tr('budget.savings_debt.leave_empty_to_carry_on', 'Leave empty to carry on from before')} defaultValue={value != null ? String(value) : ''}
        onBlur={(e) => { const t = e.target.value.trim(); update((doc2) => { const ph = doc2.phases.find((x) => x.id === phase.id)!; const st = { ...(ph.starting || {}), savings: { ...(ph.starting?.savings || {}) } }; if (t) st.savings[id] = num(t); else delete st.savings[id]; ph.starting = st }) }} />
    </label>
  )
}

/** The savings account: the bottom line, going up with what is left or down with what is short. */
function MainRow({ s, at, left }: { s: Saving; at: SavingAt; left: number }) {
  const { per, update, readOnly, phase } = useLife()
  const up = left >= 0
  return (
    <RowShell id={`m:${s.id}`} icon="piggy-bank" title={s.title} value={up ? `saving ${money(fromMonthly(left, per))}` : `drawing ${money(fromMonthly(-left, per))}`} tone={up ? undefined : 'bad'}>
      <Facts rows={[[tr('lit.savings_debt.in_the_account', 'In the account'), money(at.balance)], [tr('lit.savings_debt.interest', 'Interest'), `${s.rate}% a year`]]}
        note={up ? tr('lit.savings_debt.whatever_is_left_after_your', 'Whatever is left after your budget, debt and other accounts goes here.') : tr('lit.savings_debt.your_budget_debt_and_accounts', 'Your budget, debt and accounts take more than comes in, so this comes out of savings. If it runs out, the rest goes on a card.')} />
      {!readOnly && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold">{tr('budget.savings_debt.interest_a_year', 'Interest (% a year)')}<input className={fieldCls} inputMode="decimal" defaultValue={String(s.rate)} onBlur={(e) => update((d) => { const x = d.savings.find((y) => y.id === s.id); if (x) x.rate = num(e.target.value) })} /></label>
          <StartingField id={s.id} value={phase.starting?.savings?.[s.id]} label={tr('budget.savings_debt.what_s_really_in_it', 'What\'s really in it when {{title}} starts (optional)', { title: phase.title })} />
        </div>
      )}
    </RowShell>
  )
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
export function MoneyTray({ onClose }: { onClose: () => void }) {
  const { catalog } = useLife()
  const [side, setSide] = React.useState<'debt' | 'save' | null>(null)
  const [kind, setKind] = React.useState<string | null>(null)
  const kinds = side === 'debt' ? (catalog?.debt_kinds || []).filter((k) => k.key !== 'mortgage' && k.key !== 'car_loan').map((k) => ({ ...k, icon: DEBT_ICON[k.key] || 'landmark' })) : ACCOUNT_KINDS
  const title = kind ? kinds.find((k) => k.key === kind)?.title || tr('lit.people_access.add', 'Add') : side === 'debt' ? tr('lit.savings_debt.add_a_debt', 'Add a debt') : side === 'save' ? tr('lit.savings_debt.add_an_account', 'Add an account') : tr('lit.savings_debt.add_a_debt_or_an', 'Add a debt or an account')
  const back = kind ? () => setKind(null) : side ? () => setSide(null) : null
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
