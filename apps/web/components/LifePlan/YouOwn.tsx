'use client'
/* eslint-disable no-unused-vars -- parameter names in function types */

import React from 'react'
import { CalendarRange, ChevronLeft, ChevronRight, Pencil, Tag, Trash2, Undo2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@components/ui/dialog'
import type { Asset, Debt, LifeDoc, Line, When } from '@services/life/life'
import { useLife } from './LifeContext'
import { LifeIcon } from './icons'
import { LinkedTerms, LoanStory } from './LoanStory'
import { Pick, WhenPick, fieldCls } from './SavingsDebt'
import Sheet from './Sheet'
import { usePhaseEnd } from './DebtCard'
import { cardCls, Field, Monthly, MoneyRow, NumIn, Outlook, RenameSheet, SectionHead } from './MoneyParts'
import { fromMonthly, money, monthLabel, phaseOffset, uid } from './model'

import { tr } from '@/lib/tr'
const num = (s: string) => { const v = Number(String(s).replace(/[$,%\s]/g, '')); return Number.isFinite(v) ? v : 0 }

const KINDS = [
  { key: 'car', get title() { return tr('budget.you_own.a_car', 'A car') }, icon: 'car', costs: ['car_insurance', 'gas', 'car_repairs'] },
  { key: 'home', get title() { return tr('budget.you_own.a_home', 'A home') }, icon: 'house', costs: ['property_tax', 'home_insurance', 'home_upkeep'] },
  { key: 'other', get title() { return tr('budget.add_tray.something_else', 'Something else') }, icon: 'package', costs: [] as string[] },
]
const kindOf = (k: string) => KINDS.find((x) => x.key === k) || KINDS[2]
type How = 'have' | 'cash' | 'loan'
const gOf = (doc: LifeDoc, w: When) => phaseOffset(doc, w.phase) + w.month

/** Running costs for a thing: a line in the phase it arrives in, from that month, and in every phase after. */
function addCosts(doc: LifeDoc, a: Asset, keys: string[], catalogItems: { key: string; cat: string; title: string }[]) {
  const from = a.bought ? doc.phases.findIndex((p) => p.id === a.bought!.phase) : 0
  doc.phases.forEach((p, i) => {
    if (i < from) return
    keys.forEach((k) => {
      const it = catalogItems.find((x) => x.key === k); if (!it) return
      const line: Line = { id: uid('l'), cat: it.cat, item: it.key, title: it.title, side: 'out', settings: {}, start: i === from && a.bought ? a.bought.month : 0, end: null, hours: null, own: null, asset: a.id }
      p.lines.push(line)
    })
  })
}

/** After a sale, its running costs stop that month and are gone from later phases. */
function endCosts(doc: LifeDoc, a: Asset) {
  const at = a.sold ? doc.phases.findIndex((p) => p.id === a.sold!.phase) : -1
  doc.phases.forEach((p, i) => {
    p.lines.forEach((l) => { if (l.asset === a.id) l.end = at >= 0 && i === at ? Math.max(l.start + 1, a.sold!.month) : null })
    if (at >= 0 && i > at) p.lines = p.lines.filter((l) => l.asset !== a.id)
  })
}

/** Things you own: how much value each gains or loses a month, and what it's worth by the end of the phase. */
export function YouOwnCard() {
  const { doc, stretch, projection, readOnly } = useLife()
  const [adding, setAdding] = React.useState(false)
  const at = projection.assetsAt(stretch.g0)
  const change = at.reduce((s, x) => s + monthlyChange(x.asset, x.value), 0)
  const addLabel = tr('budget.you_own.add_something_you_own', 'Add something you own')
  return (
    <section aria-label={tr('budget.you_own.you_own', 'You own')}>
      <SectionHead title={tr('budget.you_own.you_own', 'You own')} label={at.length ? (change < -0.5 ? tr('budget.own.losing', 'losing value') : change > 0.5 ? tr('budget.own.gaining', 'gaining value') : undefined) : undefined} onAdd={() => setAdding(true)} addLabel={addLabel}>
        {at.length > 0 && Math.abs(change) > 0.5 && <Monthly value={Math.abs(change)} />}
      </SectionHead>
      <div className={cardCls}>
        {doc.assets.map((a, i) => <AssetRow key={a.id} a={a} value={at.find((x) => x.asset.id === a.id)?.value ?? 0} first={i === 0} />)}
        {!doc.assets.length && <p className="py-4 text-sm text-muted-foreground">{tr('budget.you_own.nothing_big_yet_like_a', 'Nothing big yet, like a car or a home. What it\'s worth counts on top of your savings.')}</p>}
      </div>
      {adding && !readOnly && <OwnTray onClose={() => setAdding(false)} />}
    </section>
  )
}

/** Value gained (+) or lost (−) in a month at the thing's yearly rate. */
const monthlyChange = (a: Asset, value: number) => value * (Math.pow(1 + a.change / 100, 1 / 12) - 1)

function AssetRow({ a, value, first }: { a: Asset; value: number; first: boolean }) {
  const { doc, phase, stretch, per, projection, update, setOpenLine } = useLife()
  const { end, endLabel } = usePhaseEnd()
  const [sheet, setSheet] = React.useState<'name' | 'dates' | null>(null)
  const loan = doc.debts.find((d) => d.id === a.loan_id)
  const loanAt = loan ? projection.debtsAt(stretch.g0).find((x) => x.debt.id === loan.id) : null
  const costs = doc.phases.find((p) => p.id === phase.id)?.lines.filter((l) => l.asset === a.id) || []
  const later = !!a.bought && stretch.g0 < gOf(doc, a.bought)
  const gone = !!a.sold && stretch.g0 >= gOf(doc, a.sold)
  const hist = projection.historyOf(a.id)
  const endVal = hist[Math.min(end, hist.length - 1)] ?? 0
  const change = later || gone ? 0 : monthlyChange(a, value)
  const edit = (fn: (x: Asset, d: LifeDoc) => void) => update((d) => { const x = d.assets.find((y) => y.id === a.id); if (x) fn(x, d) })
  const go = (id: string) => { setOpenLine(id); requestAnimationFrame(() => document.getElementById(`row-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })) }
  const sellAt = (): When => { const m = Math.min(phase.months - 1, stretch.m0 + 12); return { phase: phase.id, month: m } }
  const when = (w: When) => monthLabel(doc.start, gOf(doc, w))
  const sub = [
    a.bought ? (later ? tr('budget.own.get_it_a', 'get it {{a}}', { a: when(a.bought) }) : tr('budget.own.bought_a', 'bought {{a}}', { a: when(a.bought) })) : '',
    a.sold ? (gone ? tr('budget.own.sold_a', 'sold {{a}}', { a: when(a.sold) }) : tr('budget.own.sell_a', 'sell {{a}}', { a: when(a.sold) })) : '',
    `${a.change > 0 ? '+' : ''}${a.change}%/yr`,
    loan ? tr('budget.own.with_loan', 'with a loan') : '',
  ].filter(Boolean).join(' · ')
  const under = gone ? '' : endVal > 0.5 ? tr('budget.own.worth_by_end', 'worth {{m}} by end', { m: money(endVal) }) : ''
  const amount = later || gone ? <span className="text-sm text-muted-foreground">{gone ? tr('budget.you_own.sold', 'Sold') : tr('budget.debt.not_yet', 'Not yet')}</span>
    : Math.abs(change) < 0.5 ? <span className="text-sm text-muted-foreground">{money(value)}</span> : <span className={change < 0 ? '' : 'text-emerald-600 dark:text-emerald-400'}><Monthly value={change} sign /></span>
  const remove = () => update((d) => {
    d.assets = d.assets.filter((x) => x.id !== a.id)
    if (a.loan_id) { d.debts = d.debts.filter((x) => x.id !== a.loan_id); d.policies = (d.policies || []).filter((p) => p.target !== a.loan_id) }
    d.phases.forEach((p) => { p.lines = p.lines.filter((l) => l.asset !== a.id) })
  })
  const menu = [
    { icon: <Pencil />, label: tr('budget.line.rename', 'Rename'), onSelect: () => setSheet('name') },
    ...(a.bought || a.sold ? [{ icon: <CalendarRange />, label: tr('budget.line.adjust_dates', 'Adjust dates'), onSelect: () => setSheet('dates') }] : []),
    a.sold ? { icon: <Undo2 />, label: tr('budget.you_own.keep_it', 'Keep it'), onSelect: () => edit((x, d) => { x.sold = null; endCosts(d, x) }) }
      : { icon: <Tag />, label: tr('budget.you_own.sell', 'Sell'), onSelect: () => edit((x, d) => { x.sold = { ...sellAt(), price: Math.round(value || x.value) }; endCosts(d, x) }) },
    { icon: <Trash2 />, label: tr('budget.budget_table.remove', 'Remove'), danger: true, onSelect: remove },
  ]
  const priceSet = (v: number) => edit((x, d) => { x.value = v; const l = d.debts.find((y) => y.id === x.loan_id); if (l) l.balance = Math.max(0, v - (x.down ?? 0)) })
  return (
    <MoneyRow id={`own:${a.id}`} icon={kindOf(a.kind).icon} title={a.title} amount={amount} sub={sub} under={under} first={first} menu={menu}>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label={a.bought ? tr('budget.you_own.price', 'Price') : tr('budget.you_own.what_it_s_worth', 'What it\'s worth')}><NumIn label={tr('budget.you_own.price_of_title', 'Price of {{title}}', { title: a.title })} value={a.value} onSet={priceSet} /></Field>
        <Field label={tr('budget.own.value_change', 'Value each year')}><NumIn label={tr('budget.you_own.value_change_percent_a_year', 'Value change, percent a year')} prefix="" suffix="%" value={a.change} onSet={(v) => edit((x) => { x.change = Math.max(-100, Math.min(100, v)) })} /></Field>
        {a.bought && loan && <Field label={tr('budget.you_own.down_payment', 'Down payment')}><NumIn label={tr('budget.you_own.down_payment', 'Down payment')} value={a.down ?? 0} onSet={(v) => edit((x, d) => { x.down = Math.min(x.value, v); const l = d.debts.find((y) => y.id === x.loan_id); if (l) l.balance = Math.max(0, x.value - x.down) })} /></Field>}
        {a.sold && <Field label={tr('budget.you_own.sale_price', 'Sale price')}><NumIn label={tr('budget.you_own.sale_price', 'Sale price')} value={a.sold.price} onSet={(v) => edit((x) => { x.sold = { ...x.sold!, price: v } })} /></Field>}
      </div>
      {(loan || costs.length > 0) && (
        <div className="grid gap-1.5">
          {loan && <LinkRow icon="landmark" title={loan.title} sub={loanAt?.state === 'owing' ? tr('budget.you_own.money_left_at_rate', '{{money}} left at {{rate}}%', { money: money(loanAt.balance), rate: loan.rate }) : loanAt?.state === 'later' ? tr('budget.you_own.money_at_rate_starts_with', '{{money}} at {{rate}}%, starts with the purchase', { money: money(loan.balance), rate: loan.rate }) : tr('budget.you_own.paid_off', 'Paid off')}
            value={loanAt && loanAt.payment > 0.5 ? `${money(fromMonthly(loanAt.payment, per))}/${tr(`budget.per_short.${per}`, per)}` : undefined} onClick={() => go(`m:${loan.id}`)} />}
          {costs.length > 0 && <LinkRow icon="receipt" title={tr('budget.you_own.running_costs', 'Running costs')} sub={`${costs.map((l) => l.title).join(', ')} ${tr('budget.you_own.in_your_budget', '· in your budget')}`} onClick={() => go(costs[0].id)} />}
        </div>
      )}
      <Outlook>
        {a.bought && later ? <>{tr('budget.own.buy_story', 'You buy it in {{a}}', { a: when(a.bought) })}{loan ? tr('budget.own.buy_loan', ', {{m}} down from savings and a loan for the rest.', { m: money(a.down ?? 0) }) : tr('budget.own.buy_cash', ', {{m}} out of savings.', { m: money(a.value) })}</>
          : gone ? tr('budget.own.sold_story', 'Sold in {{a}} for {{m}}.', { a: when(a.sold!), m: money(a.sold!.price) })
          : <>{tr('budget.own.worth_from', 'Worth {{m}} in {{s}}', { m: money(value), s: monthLabel(doc.start, stretch.g0) })}{endVal > 0.5 ? tr('budget.own.worth_end', ' and {{m}} by {{a}}.', { m: money(endVal), a: endLabel }) : '.'}</>}
        {a.sold && loan && !gone ? ` ${tr('budget.you_own.whatever_is_left_on_the', 'Whatever is left on the loan is paid off from the sale.')}` : ''}
      </Outlook>
      <RenameSheet open={sheet === 'name'} value={a.title} onClose={() => setSheet(null)} onSave={(t) => t && edit((x) => { x.title = t })} />
      <Sheet open={sheet === 'dates'} onClose={() => setSheet(null)} title={tr('budget.line.adjust_dates', 'Adjust dates')}>
        {a.bought && <label className="grid gap-1 text-sm font-semibold">{tr('budget.you_own.when_you_buy_it', 'When you buy it')}<WhenPick value={a.bought} onChange={(w) => edit((x, d) => { x.bought = w; if (x.loan_id) { const l = d.debts.find((y) => y.id === x.loan_id); if (l) l.start = w } })} /></label>}
        {a.sold && <label className="grid gap-1 text-sm font-semibold">{tr('budget.own.when_you_sell', 'When you sell it')}<WhenPick value={a.sold} onChange={(w) => edit((x, d) => { x.sold = { ...w, price: x.sold!.price }; endCosts(d, x) })} /></label>}
        <button type="button" onClick={() => setSheet(null)} className="h-10 rounded-xl bg-[var(--org-primary-color)] text-sm font-bold text-[var(--org-on-primary-color)]">{tr('budget.line.done', 'Done')}</button>
      </Sheet>
    </MoneyRow>
  )
}

function LinkRow({ icon, title, sub, value, onClick }: { icon: string; title: string; sub: string; value?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2.5 rounded-lg bg-muted/60 px-2.5 py-2 text-left text-sm hover:bg-muted">
      <LifeIcon name={icon} className="size-4 text-muted-foreground" /><span className="min-w-0 flex-1 leading-tight"><b className="block truncate font-semibold">{title}</b><small className="block truncate text-[11px] text-muted-foreground">{sub}</small></span>
      {value && <span className="shrink-0 font-semibold tabular-nums">{value}</span>}<ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

/** A car, a home or something else; then how it comes into your life; then its numbers, all editable before it goes in. */
function OwnTray({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = React.useState<string | null>(null)
  const [how, setHow] = React.useState<How | null>(null)
  const k = kind ? kindOf(kind) : null
  const back = how ? () => setHow(null) : kind ? () => setKind(null) : null
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-1">{back && <Button variant="ghost" size="icon" onClick={back} aria-label={tr('budget.add_tray.back', 'Back')} className="-ml-2"><ChevronLeft /></Button>}{k ? k.title : tr('budget.you_own.add_something_you_own', 'Add something you own')}</DialogTitle></DialogHeader>
        {!k && <ul className="grid gap-1 pt-2">{KINDS.map((x) => <Pick key={x.key} icon={x.icon} label={x.title} onClick={() => setKind(x.key)} />)}</ul>}
        {k && !how && <ul className="grid gap-1 pt-2">
          <Pick icon="flag" label={tr('budget.you_own.i_already_own_it', 'I already own it')} note={tr('lit.you_own.it_s_yours_when_your', 'It\'s yours when your plan starts. No money changes hands.')} onClick={() => setHow('have')} />
          <Pick icon="piggy-bank" label={tr('budget.you_own.i_buy_it_with_savings', 'I buy it with savings')} note={tr('lit.you_own.the_price_comes_out_of', 'The price comes out of your savings on the day you buy it.')} onClick={() => setHow('cash')} />
          <Pick icon="landmark" label={tr('budget.you_own.i_buy_it_with_a', 'I buy it with a loan')} note="A down payment from savings, and a loan for the rest." onClick={() => setHow('loan')} />
        </ul>}
        {k && how && <OwnForm kind={k.key} how={how} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function OwnForm({ kind, how, onDone }: { kind: string; how: How; onDone: () => void }) {
  const { doc, phase, stretch, catalog, update, setOpenLine } = useLife()
  const k = kindOf(kind)
  const n = doc.assets.filter((x) => x.kind === kind).length
  const base = kind === 'car' ? tr('lit.you_own.car', 'Car') : kind === 'home' ? 'Home' : ''
  const [f, setF] = React.useState({ title: base ? (n ? `${base} ${n + 1}` : base) : '', price: '', when: { phase: phase.id, month: stretch.m0 } as When, change: '', down: '', rate: '' })
  const [payment, setPayment] = React.useState(0)
  const [costs, setCosts] = React.useState<string[]>(k.costs)
  const price = Math.max(0, num(f.price)), down = Math.min(price, Math.max(0, num(f.down))), rate = Math.max(0, num(f.rate))
  const startG = how === 'have' ? 0 : gOf(doc, f.when)
  const add = () => {
    const a: Asset = { id: uid('a'), kind, title: f.title.trim() || k.title, value: price, change: Math.max(-100, Math.min(100, num(f.change))), bought: how === 'have' ? null : f.when, down: how === 'loan' ? down : null, loan_id: null, sold: null }
    update((d) => {
      if (how === 'loan') {
        const loan: Debt = { id: uid('d'), kind: kind === 'home' ? 'mortgage' : kind === 'car' ? 'car_loan' : 'personal', title: `Loan for ${a.title.toLowerCase()}`, balance: price - down, rate, payment, start: f.when, received: false }
        d.debts.push(loan); a.loan_id = loan.id
      }
      d.assets.push(a)
      addCosts(d, a, costs, catalog?.items || [])
    })
    setOpenLine(`own:${a.id}`)
    onDone()
  }
  const items = k.costs.map((c) => catalog?.items.find((i) => i.key === c)).filter(Boolean) as { key: string; title: string; icon: string }[]
  return (
    <form className="space-y-4 pt-2" onSubmit={(e) => { e.preventDefault(); add() }}>
      <label className="grid gap-1 text-sm font-semibold">{tr('budget.add_tray.name', 'Name')}<input className={fieldCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={kind === 'other' ? tr('budget.you_own.like_laptop', 'Like "Laptop"') : ''} /></label>
      {how !== 'have' && <label className="grid gap-1 text-sm font-semibold">{tr('budget.you_own.when_you_buy_it', 'When you buy it')}<WhenPick value={f.when} onChange={(w) => setF({ ...f, when: w })} /></label>}
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-sm font-semibold">{how === 'have' ? tr('budget.you_own.what_it_s_worth', 'What it\'s worth') : tr('budget.you_own.price', 'Price')}<input className={fieldCls} inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="$0" autoFocus /></label>
        <label className="grid gap-1 text-sm font-semibold">{tr('budget.you_own.value_each_year', 'Value each year (%)')}<input className={fieldCls} inputMode="decimal" value={f.change} onChange={(e) => setF({ ...f, change: e.target.value })} placeholder="0" /></label>
      </div>
      {how === 'loan' && <>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm font-semibold">{tr('budget.you_own.down_payment', 'Down payment')}<input className={fieldCls} inputMode="decimal" value={f.down} onChange={(e) => setF({ ...f, down: e.target.value })} placeholder="$0" /></label>
          <label className="grid gap-1 text-sm font-semibold">{tr('budget.you_own.loan_interest_a_year', 'Loan interest (% a year)')}<input className={fieldCls} inputMode="decimal" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} placeholder="0" /></label>
        </div>
        <LinkedTerms idPrefix="own" balance={price - down} rate={rate} payment={payment} onPayment={setPayment} />
      </>}
      <div className="rounded-xl bg-muted/60 p-3 text-sm">
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">{tr('budget.you_own.what_happens', 'What happens')}</p>
        <ol className="mt-2 space-y-1.5">
          {how === 'have' && <li>{tr('budget.you_own.it_s_yours_from_monthlabel', 'It\'s yours from {{monthLabel}}, worth', { monthLabel: monthLabel(doc.start, 0) })}{' '}<b>{money(price)}</b>{tr('budget.you_own.no_money_changes_hands', '. No money changes hands.')}</li>}
          {how === 'cash' && <li>{monthLabel(doc.start, startG)}: <b>−{money(price)}</b>{' '}{tr('budget.you_own.out_of_your_savings_and', 'out of your savings, and you own something worth {{money}}.', { money: money(price) })}</li>}
          {how === 'loan' && <li>{monthLabel(doc.start, startG)}: <b>−{money(down)}</b>{' '}{tr('budget.you_own.down_payment_out_of_your', 'down payment out of your savings, and a loan of')}{' '}<b>{money(price - down)}</b>{' '}{tr('budget.you_own.pays_the_rest', 'pays the rest.')}</li>}
          {num(f.change) !== 0 && <li>{tr('budget.you_own.its_value', 'Its value')}{' '}{num(f.change) < 0 ? 'drops' : 'grows'}{' '}{tr('budget.you_own.about_abs_a_year', 'about {{abs}}% a year.', { abs: Math.abs(num(f.change)) })}</li>}
          {costs.length > 0 && <li>{tr('budget.you_own.its_running_costs_go_into', 'Its running costs go into your budget, for you to fill in.')}</li>}
        </ol>
      </div>
      {how === 'loan' && <LoanStory planStart={doc.start} startG={startG} balance={price - down} rate={rate} payment={payment} lands={false} already={false} />}
      {items.length > 0 && <fieldset className="grid gap-1.5 text-sm font-semibold"><legend className="mb-1">{tr('budget.you_own.add_its_running_costs_to', 'Add its running costs to your budget')}</legend>
        {items.map((i) => <label key={i.key} className="flex items-center gap-2 font-normal"><input type="checkbox" checked={costs.includes(i.key)} onChange={(e) => setCosts(e.target.checked ? [...costs, i.key] : costs.filter((c) => c !== i.key))} /><LifeIcon name={i.icon} />{i.title}</label>)}
      </fieldset>}
      <p className="text-xs text-muted-foreground">{tr('budget.you_own.we_don_t_guess_prices', 'We don\'t guess prices or how values change yet. Put in your own numbers; you can change all of them later.')}</p>
      <Button type="submit" variant="brand" className="w-full">{tr('budget.you_own.add_it', 'Add it')}</Button>
    </form>
  )
}
