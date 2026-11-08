'use client'
/* eslint-disable no-unused-vars -- parameter names in function types */

import React from 'react'
import { CircleSlash, Pencil, Trash2, Wallet } from 'lucide-react'
import type { Saving } from '@services/life/life'
import { useLife } from './LifeContext'
import Sheet from './Sheet'
import { usePhaseEnd } from './DebtCard'
import { MoneyTray, SAVE_ICON, fieldCls, isK401, setPolicy } from './SavingsDebt'
import { cardCls, Field, Monthly, MoneyRow, NumIn, Outlook, RenameSheet, SectionHead, SelectField } from './MoneyParts'
import { LEFT, fromMonthly, money, monthLabel, policyAt, toMonthly, type SavingAt } from './model'

import { tr } from '@/lib/tr'
const num = (s: string) => { const v = Number(String(s).replace(/[$,%\s]/g, '')); return Number.isFinite(v) && v >= 0 ? v : 0 }

/**
 * What is left each month once the budget, debt payments and accounts are paid, and the one thing it goes to:
 * the savings account, a debt or another account. Paying a debt off splits the phase there, and the stretch
 * after it gets its own choice, which follows the payoff wherever it lands.
 */
export function LeftOverCard() {
  const { doc, phase, stretch, projection, update, readOnly } = useLife()
  const g = stretch.g0
  const left = projection.left[g] ?? 0
  const debts = projection.debtsAt(g)
  const owing = debts.filter((d) => d.state === 'owing')
  const accounts = doc.savings.filter((x) => !x.main)
  const main = doc.savings.find((x) => x.main)
  const { to } = projection.leftTo(g)
  const live = to === 'save' || owing.some((d) => d.debt.id === to) || accounts.some((x) => x.id === to) ? to : 'save'
  const gone = to !== live ? doc.debts.find((d) => d.id === to) : null
  // The debt whose payoff starts this stretch: a choice made here follows that payoff.
  const opened = debts.find((d) => d.paidOffAt != null && d.paidOffAt + 1 === g)?.debt.id ?? null
  const shortNow = left < -0.5
  const target = owing.find((d) => d.debt.id === live)
  const pick = (v: string) => update((d) => setPolicy(d, LEFT, phase.id, stretch.m0, { to: v, after: opened }))
  const options: [string, string][] = [
    ['save', main?.title || tr('budget.catalog.savings', 'Savings account')],
    ...owing.map((d) => [d.debt.id, d.debt.title] as [string, string]),
    ...accounts.map((x) => [x.id, x.title] as [string, string]),
  ]
  const story = shortNow ? tr('budget.left.gap_story', 'More goes out than comes in, so the gap comes out of your savings account. If that runs out, it goes on a card.')
    : target ? (target.paidOffAt != null ? tr('budget.left.debt_until', 'Extra on {{t}} until it’s paid off in {{a}}. The stretch after that gets its own choice.', { t: target.debt.title.toLowerCase(), a: monthLabel(doc.start, target.paidOffAt) }) : tr('budget.left.debt_on', 'Extra on {{t}}, on top of what you pay.', { t: target.debt.title.toLowerCase() }))
    : live !== 'save' ? tr('budget.left.account', 'Into {{t}}, on top of what you put in.', { t: accounts.find((x) => x.id === live)?.title || '' })
    : gone ? tr('budget.left.gone', '{{t}} is paid off, so it goes to your savings account. Pick what it goes to next.', { t: gone.title })
    : ''
  return (
    <section aria-label={tr('budget.summary.left_over', 'Left over')}>
      <SectionHead title={shortNow ? tr('budget.summary.gap', 'Gap') : tr('budget.summary.left_over', 'Left over')}>
        <span className={shortNow ? 'text-red-600 dark:text-red-400' : ''}><Monthly value={left} sign={left > 0.5} /></span>
      </SectionHead>
      {(!shortNow && !readOnly) || story ? (
        <div className={`${cardCls} space-y-1.5 py-2.5`}>
          {!shortNow && !readOnly && <SelectField label={tr('budget.left.goes_to', 'Goes to')} value={live} options={options} onChange={pick} />}
          {story && <p className="text-[11px] text-muted-foreground">{story}</p>}
        </div>
      ) : null}
    </section>
  )
}

/** Savings: what goes into each account a month in the stretch in view, and what's in it by the end of the phase. */
export function SavingsCard() {
  const { doc, stretch, projection, readOnly } = useLife()
  const [adding, setAdding] = React.useState(false)
  const g = stretch.g0
  const saves = projection.savingsAt(g)
  const toMain = (projection.left[g] ?? 0) - (projection.extraDebt[g] ?? 0) - (projection.extraSave[g] ?? 0)
  const putting = (projection.put[g] ?? 0) + (projection.extraSave[g] ?? 0) + toMain
  const main = doc.savings.find((s) => s.main)
  const others = doc.savings.filter((s) => !s.main)
  const addLabel = tr('lit.savings_debt.add_an_account', 'Add an account')
  return (
    <section aria-label={tr('budget.chart_events.savings', 'Savings')}>
      <SectionHead title={tr('budget.chart_events.savings', 'Savings')} label={putting >= -0.5 ? tr('budget.save.putting_in', 'putting in') : tr('budget.save.taking_out', 'taking out')} onAdd={() => setAdding(true)} addLabel={addLabel}>
        <span className={putting < -0.5 ? 'text-red-600 dark:text-red-400' : ''}><Monthly value={Math.abs(putting)} /></span>
      </SectionHead>
      <div className={cardCls}>
        {main && <MainRow s={main} at={saves.find((x) => x.id === main.id)!} flow={toMain} first />}
        {others.map((s, i) => <AccountRow key={s.id} s={s} at={saves.find((x) => x.id === s.id)!} first={!main && i === 0} />)}
      </div>
      {adding && !readOnly && <MoneyTray start="save" onClose={() => setAdding(false)} />}
    </section>
  )
}

function useEndBalance(id: string) {
  const { projection } = useLife()
  const { end, endLabel } = usePhaseEnd()
  const hist = projection.historyOf(id)
  return { endBal: hist[Math.min(end, hist.length - 1)] ?? 0, endLabel }
}

/** The savings account: it takes what is left over (or covers the gap). */
function MainRow({ s, at, flow, first }: { s: Saving; at: SavingAt; flow: number; first: boolean }) {
  const { doc, stretch, update } = useLife()
  const { endBal, endLabel } = useEndBalance(s.id)
  const [sheet, setSheet] = React.useState<'name' | 'details' | null>(null)
  const down = flow < -0.5
  const sub = s.rate ? `${s.rate}% interest` : ''
  const startLabel = monthLabel(doc.start, stretch.g0)
  return (
    <MoneyRow id={`m:${s.id}`} icon="piggy-bank" title={s.title} first={first} sub={sub} under={tr('budget.save.by_end', '{{m}} by end', { m: money(endBal) })}
      amount={<span className={down ? 'text-red-700 dark:text-red-300' : ''}><Monthly value={flow} sign={flow > 0.5} /></span>}
      menu={[{ icon: <Pencil />, label: tr('budget.line.rename', 'Rename'), onSelect: () => setSheet('name') }, { icon: <Wallet />, label: tr('budget.save.balances', 'Balances'), onSelect: () => setSheet('details') }]}>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label={tr('lit.savings_debt.interest', 'Interest')}><NumIn label={tr('budget.savings_debt.interest_a_year', 'Interest (% a year)')} prefix="" suffix="% a year" value={s.rate} onSet={(v) => update((d) => { const x = d.savings.find((y) => y.id === s.id); if (x) x.rate = Math.min(100, v) })} /></Field>
      </div>
      <Outlook>{tr('budget.save.in_it_from', '{{m}} in it in {{s}}, {{e}} by {{a}}.', { m: money(at.balance), s: startLabel, e: money(endBal), a: endLabel })}{' '}
        {down ? tr('lit.savings_debt.your_budget_debt_and_accounts', 'Your budget, debt and accounts take more than comes in, so this comes out of savings. If it runs out, the rest goes on a card.') : tr('budget.save.main_story', 'Whatever is left after your budget, debt payments and other accounts goes here, unless you send it to debt.')}</Outlook>
      <RenameSheet open={sheet === 'name'} value={s.title} onClose={() => setSheet(null)} onSave={(t) => t && update((d) => { const x = d.savings.find((y) => y.id === s.id); if (x) x.title = t })} />
      <BalancesSheet open={sheet === 'details'} s={s} onClose={() => setSheet(null)} />
    </MoneyRow>
  )
}

function AccountRow({ s, at, first }: { s: Saving; at: SavingAt; first: boolean }) {
  const { doc, phase, stretch, per, update } = useLife()
  const { endBal, endLabel } = useEndBalance(s.id)
  const [sheet, setSheet] = React.useState<'name' | 'details' | null>(null)
  const pol = policyAt(doc, s.id, stretch.g0)
  const k = isK401(s)
  const pct = pol?.pct ?? s.pct ?? null
  const edit = (fn: (x: Saving) => void) => update((doc2) => { const x = doc2.savings.find((y) => y.id === s.id); if (x) fn(x) })
  const setPut = (patch: { put?: number; pct?: number }) => update((doc2) => setPolicy(doc2, s.id, phase.id, stretch.m0, patch))
  const perShort = `/${tr(`budget.per_short.${per}`, per)}`
  const sub = [k ? tr('budget.save.pct_of_pay', '{{n}}% of pay', { n: pct ?? 0 }) : '', at.extra > 0.5 ? tr('budget.save.plus_left_over', '+{{m}} left over', { m: money(fromMonthly(at.extra, per)) }) : '', at.match > 0.5 ? tr('budget.save.plus_match', '+{{m}} from work', { m: money(fromMonthly(at.match, per)) }) : '', s.rate ? `${s.rate}% growth` : ''].filter(Boolean).join(' · ')
  return (
    <MoneyRow id={`m:${s.id}`} icon={SAVE_ICON[s.kind] || 'piggy-bank'} title={s.title} first={first} sub={sub} under={tr('budget.save.by_end', '{{m}} by end', { m: money(endBal) })}
      amount={at.put + at.extra > 0.5 ? <Monthly value={at.put + at.extra} /> : <span className="text-sm text-muted-foreground">{tr('budget.save.nothing_in', 'Nothing in')}</span>}
      menu={[
        { icon: <Pencil />, label: tr('budget.line.rename', 'Rename'), onSelect: () => setSheet('name') },
        { icon: <Wallet />, label: tr('budget.save.balances', 'Balances'), onSelect: () => setSheet('details') },
        ...(at.put > 0.5 ? [{ icon: <CircleSlash />, label: tr('budget.save.stop_adding', 'Stop adding from here'), onSelect: () => setPut(k ? { pct: 0 } : { put: 0 }) }] : []),
        { icon: <Trash2 />, label: tr('budget.budget_table.remove', 'Remove'), danger: true, onSelect: () => update((doc2) => { doc2.savings = doc2.savings.filter((x) => x.id !== s.id); doc2.policies = (doc2.policies || []).filter((x) => x.target !== s.id) }) },
      ]}>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label={tr('lit.savings_debt.growth', 'Growth')}><NumIn label={tr('budget.savings_debt.growth_a_year', 'Growth (% a year)')} prefix="" suffix="% a year" value={s.rate} onSet={(v) => edit((x) => { x.rate = Math.min(100, v) })} /></Field>
        {k && <Field label={tr('budget.save.match_up_to', 'Work matches up to')}><NumIn label={tr('budget.savings_debt.employer_matches_up_to_of', 'Employer matches up to (% of pay)')} prefix="" suffix="% of pay" value={s.match ?? null} onSet={(v) => edit((x) => { x.match = Math.min(100, v) })} /></Field>}
      </div>
      <div className="flex items-end gap-3">
        <span className="mb-2 flex-1 text-xs text-muted-foreground">{tr('budget.debt.from_on', 'From {{a}} on, until you change it', { a: monthLabel(doc.start, stretch.g0) })}</span>
        {k
          ? <Field label={tr('budget.save.you_put_in', 'You put in')} hot className="w-40 shrink-0"><NumIn label={tr('budget.savings_debt.percent_of_pay_into_title', 'Percent of pay into {{title}}', { title: s.title })} prefix="" suffix="% of pay" value={pct ?? 0} onSet={(v) => setPut({ pct: Math.min(100, v) })} /></Field>
          : <Field label={tr('budget.save.you_put_in', 'You put in')} hot className="w-40 shrink-0"><NumIn label={tr('budget.savings_debt.what_you_put_into_title', 'What you put into {{title}} each {{value}}', { title: s.title, value: per })} suffix={perShort} value={fromMonthly(at.put, per)} onSet={(v) => setPut({ put: toMonthly(v, per) })} /></Field>}
      </div>
      <Outlook>{tr('budget.save.in_it_from', '{{m}} in it in {{s}}, {{e}} by {{a}}.', { m: money(at.balance), s: monthLabel(doc.start, stretch.g0), e: money(endBal), a: endLabel })}
        {k && pct && at.put < 0.5 ? ` ${tr('budget.save.k401_no_job', 'A 401(k) comes out of pay from work, so nothing goes in without a job.')}` : ''}</Outlook>
      <RenameSheet open={sheet === 'name'} value={s.title} onClose={() => setSheet(null)} onSave={(t) => t && edit((x) => { x.title = t })} />
      <BalancesSheet open={sheet === 'details'} s={s} onClose={() => setSheet(null)} />
    </MoneyRow>
  )
}

/** What's in an account when the plan starts, and (optionally) what's really in it when this phase starts. */
function BalancesSheet({ open, s, onClose }: { open: boolean; s: Saving; onClose: () => void }) {
  const { doc, phase, update } = useLife()
  const startIn = phase.starting?.savings?.[s.id]
  return (
    <Sheet open={open} onClose={onClose} title={tr('budget.save.balances', 'Balances')}>
      <label className="grid gap-1 text-sm font-semibold">{tr('budget.savings_debt.in_it_at_monthlabel', 'In it at {{monthLabel}}', { monthLabel: monthLabel(doc.start, 0) })}
        <input className={fieldCls} inputMode="decimal" defaultValue={String(s.balance)} onBlur={(e) => update((d) => { const x = d.savings.find((y) => y.id === s.id); if (x) x.balance = num(e.target.value) })} /></label>
      <label className="grid gap-1 text-sm font-semibold">{tr('budget.savings_debt.what_s_really_in_it', 'What\'s really in it when {{title}} starts (optional)', { title: phase.title })}
        <input className={fieldCls} inputMode="decimal" placeholder={tr('budget.savings_debt.leave_empty_to_carry_on', 'Leave empty to carry on from before')} defaultValue={startIn != null ? String(startIn) : ''}
          onBlur={(e) => { const t = e.target.value.trim(); update((doc2) => { const ph = doc2.phases.find((x) => x.id === phase.id)!; const st = { ...(ph.starting || {}), savings: { ...(ph.starting?.savings || {}) } }; if (t) st.savings[s.id] = num(t); else delete st.savings[s.id]; ph.starting = st }) }} /></label>
      <button type="button" onClick={onClose} className="h-10 rounded-xl bg-[var(--org-primary-color)] text-sm font-bold text-[var(--org-on-primary-color)]">{tr('budget.line.done', 'Done')}</button>
    </Sheet>
  )
}
