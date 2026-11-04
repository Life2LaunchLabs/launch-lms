'use client'
/* eslint-disable no-unused-vars -- parameter names in function types */

import React from 'react'
import { ChevronLeft, ChevronRight, Plus, Tag } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@components/ui/dialog'
import type { Asset, Debt, LifeDoc, Line, When } from '@services/life/life'
import { useLife } from './LifeContext'
import { LifeIcon } from './icons'
import { LinkedTerms, LoanStory } from './LoanStory'
import { InPlace, Pick, RowShell, WhenPick, fieldCls } from './SavingsDebt'
import { fromMonthly, money, monthLabel, phaseOffset, uid } from './model'

const num = (s: string) => { const v = Number(String(s).replace(/[$,%\s]/g, '')); return Number.isFinite(v) ? v : 0 }
const linkCls = 'font-extrabold text-[var(--org-primary-color)] dark:text-[color-mix(in_srgb,var(--org-primary-color)_45%,white)]'

const KINDS = [
  { key: 'car', title: 'A car', icon: 'car', costs: ['car_insurance', 'gas', 'car_repairs'] },
  { key: 'home', title: 'A home', icon: 'house', costs: ['property_tax', 'home_insurance', 'home_upkeep'] },
  { key: 'other', title: 'Something else', icon: 'package', costs: [] as string[] },
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

/** Things you own: what each is worth now, and its story — bought, loan, running costs, worth now, sold. */
export function YouOwnCard() {
  const { doc, stretch, projection, readOnly } = useLife()
  const [adding, setAdding] = React.useState(false)
  const at = projection.assetsAt(stretch.g0)
  const total = at.reduce((s, x) => s + x.value, 0)
  return (
    <section className="overflow-hidden rounded-2xl bg-card shadow-[0_1px_0_hsl(var(--border))]">
      <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5">
        <h3 className="text-lg font-extrabold">You own</h3>
        <span className="text-sm font-extrabold tabular-nums">{money(total)}</span>
      </div>
      <div className="px-4 sm:px-5">
        {doc.assets.map((a) => <AssetRow key={a.id} a={a} value={at.find((x) => x.asset.id === a.id)?.value ?? 0} />)}
        {!doc.assets.length && <p className="pb-3 text-sm text-muted-foreground">Nothing big yet, like a car or a home. What it's worth counts on top of your savings.</p>}
      </div>
      {!readOnly && <div className="px-4 pb-4 pt-2 sm:px-5"><button type="button" onClick={() => setAdding(true)} className={`inline-flex items-center gap-1 text-sm ${linkCls}`}><Plus className="size-4" />Add something you own</button></div>}
      {adding && <OwnTray onClose={() => setAdding(false)} />}
    </section>
  )
}

function Step({ icon, title, children, value }: { icon: React.ReactNode; title: string; children?: React.ReactNode; value?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 py-2 text-sm last:border-b-0">
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-background text-muted-foreground">{icon}</span>
      <b className="font-semibold">{title}</b>
      <span className="flex flex-1 flex-wrap items-center gap-2 text-muted-foreground">{children}</span>
      {value != null && <span className="ml-auto font-semibold tabular-nums">{value}</span>}
    </li>
  )
}

function AssetRow({ a, value }: { a: Asset; value: number }) {
  const { doc, phase, stretch, per, projection, update, setOpenLine, readOnly } = useLife()
  const loan = doc.debts.find((d) => d.id === a.loan_id)
  const loanAt = loan ? projection.debtsAt(stretch.g0).find((x) => x.debt.id === loan.id) : null
  const costs = doc.phases.find((p) => p.id === phase.id)?.lines.filter((l) => l.asset === a.id) || []
  const later = a.bought && stretch.g0 < gOf(doc, a.bought)
  const gone = a.sold && stretch.g0 >= gOf(doc, a.sold)
  const shown = later ? `Get it ${monthLabel(doc.start, gOf(doc, a.bought!))}` : gone ? `Sold ${monthLabel(doc.start, gOf(doc, a.sold!))}` : money(value)
  const edit = (fn: (x: Asset, d: LifeDoc) => void) => update((d) => { const x = d.assets.find((y) => y.id === a.id); if (x) fn(x, d) })
  const go = (id: string) => { setOpenLine(id); requestAnimationFrame(() => document.getElementById(`row-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })) }
  const sellAt = (): When => { const m = Math.min(phase.months - 1, stretch.m0 + 12); return { phase: phase.id, month: m } }
  return (
    <RowShell id={`own:${a.id}`} icon={kindOf(a.kind).icon} title={a.title} value={shown} tone={later || gone ? 'muted' : undefined}
      onRemove={() => update((d) => {
        d.assets = d.assets.filter((x) => x.id !== a.id)
        if (a.loan_id) { d.debts = d.debts.filter((x) => x.id !== a.loan_id); d.policies = (d.policies || []).filter((p) => p.target !== a.loan_id) }
        d.phases.forEach((p) => { p.lines = p.lines.filter((l) => l.asset !== a.id) })
      })}>
      <ol className="rounded-xl bg-muted/60 px-3 py-1">
        {a.bought
          ? <Step icon={<LifeIcon name="arrow-up-right" />} title="Bought">
              {readOnly ? monthLabel(doc.start, gOf(doc, a.bought)) : <span className="w-40"><WhenPick value={a.bought} onChange={(w) => edit((x, d) => { x.bought = w; if (x.loan_id) { const l = d.debts.find((y) => y.id === x.loan_id); if (l) l.start = w } })} /></span>}
              {!readOnly && <InPlace label={`Price of ${a.title}`} value={a.value} onCommit={(v) => edit((x, d) => { x.value = v; const l = d.debts.find((y) => y.id === x.loan_id); if (l) l.balance = Math.max(0, v - (x.down ?? 0)) })} />}
              {readOnly && money(a.value)}
            </Step>
          : <Step icon={<LifeIcon name="flag" />} title={`Yours from ${monthLabel(doc.start, 0)}`} value={readOnly ? money(a.value) : <InPlace label={`What ${a.title} is worth`} value={a.value} onCommit={(v) => edit((x) => { x.value = v })} />}>worth</Step>}
        {a.bought && loan && <>
          <Step icon={<LifeIcon name="piggy-bank" />} title="Down payment" value={readOnly ? money(a.down ?? 0) : <InPlace label="Down payment" value={a.down ?? 0} onCommit={(v) => edit((x, d) => { x.down = Math.min(x.value, v); const l = d.debts.find((y) => y.id === x.loan_id); if (l) l.balance = Math.max(0, x.value - x.down) })} />}>from savings</Step>
          <li className="border-b border-border/60 py-2 last:border-b-0">
            <button type="button" onClick={() => go(`m:${loan.id}`)} className="flex w-full items-center gap-3 rounded-lg bg-background px-2 py-2 text-left text-sm hover:bg-card">
              <LifeIcon name="landmark" /><span className="flex-1"><b className="block">{loan.title}</b><small className="text-muted-foreground">{loanAt && loanAt.state === 'owing' ? `${money(loanAt.balance)} left at ${loan.rate}%` : loanAt?.state === 'later' ? `${money(loan.balance)} at ${loan.rate}%, starts with the purchase` : 'Paid off'}</small></span>
              {loanAt && loanAt.payment > 0.5 && <span className="font-semibold tabular-nums">paying {money(fromMonthly(loanAt.payment, per))}/{per}</span>}<ChevronRight className="size-4 text-muted-foreground" />
            </button>
          </li>
        </>}
        {a.bought && !loan && <Step icon={<LifeIcon name="piggy-bank" />} title="Paid in cash" value={money(a.value)}>from savings</Step>}
        {costs.length > 0 && (
          <li className="border-b border-border/60 py-2 last:border-b-0">
            <button type="button" onClick={() => go(costs[0].id)} className="flex w-full items-center gap-3 rounded-lg bg-background px-2 py-2 text-left text-sm hover:bg-card">
              <LifeIcon name="receipt" /><span className="flex-1"><b className="block">Running costs</b><small className="text-muted-foreground">{costs.map((l) => l.title).join(', ')} · in your budget</small></span><ChevronRight className="size-4 text-muted-foreground" />
            </button>
          </li>
        )}
        {!gone && <Step icon={<LifeIcon name="sparkles" />} title={later ? 'Worth when you get it' : 'Worth now'} value={money(later ? a.value : value)}>
          {readOnly ? `${a.change}% a year` : <InPlace label="Value change, percent a year" prefix="" suffix="% a year" width={4} value={a.change} onCommit={(v) => edit((x) => { x.change = Math.max(-100, Math.min(100, v)) })} />}
          {!a.sold && !readOnly && <Button type="button" size="sm" variant="outline" onClick={() => edit((x, d) => { const w = sellAt(); x.sold = { ...w, price: Math.round(value || x.value) }; endCosts(d, x) })}><Tag />Sell</Button>}
        </Step>}
        {a.sold && <Step icon={<Tag className="size-4" />} title="Sold">
          {readOnly ? monthLabel(doc.start, gOf(doc, a.sold)) : <span className="w-40"><WhenPick value={a.sold} onChange={(w) => edit((x, d) => { x.sold = { ...w, price: x.sold!.price }; endCosts(d, x) })} /></span>}
          {!readOnly && <InPlace label="Sale price" value={a.sold.price} onCommit={(v) => edit((x) => { x.sold = { ...x.sold!, price: v } })} />}
          {!readOnly && <button type="button" onClick={() => edit((x, d) => { x.sold = null; endCosts(d, x) })} className="text-xs font-semibold underline decoration-dashed underline-offset-4 hover:text-foreground">Keep it</button>}
        </Step>}
      </ol>
      {a.sold && loan && <p className="text-xs text-muted-foreground">Whatever is left on the loan is paid off from the sale.</p>}
    </RowShell>
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
        <DialogHeader><DialogTitle className="flex items-center gap-1">{back && <Button variant="ghost" size="icon" onClick={back} aria-label="Back" className="-ml-2"><ChevronLeft /></Button>}{k ? k.title : 'Add something you own'}</DialogTitle></DialogHeader>
        {!k && <ul className="grid gap-1 pt-2">{KINDS.map((x) => <Pick key={x.key} icon={x.icon} label={x.title} onClick={() => setKind(x.key)} />)}</ul>}
        {k && !how && <ul className="grid gap-1 pt-2">
          <Pick icon="flag" label="I already own it" note="It's yours when your plan starts. No money changes hands." onClick={() => setHow('have')} />
          <Pick icon="piggy-bank" label="I buy it with savings" note="The price comes out of your savings on the day you buy it." onClick={() => setHow('cash')} />
          <Pick icon="landmark" label="I buy it with a loan" note="A down payment from savings, and a loan for the rest." onClick={() => setHow('loan')} />
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
  const base = kind === 'car' ? 'Car' : kind === 'home' ? 'Home' : ''
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
      <label className="grid gap-1 text-sm font-semibold">Name<input className={fieldCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={kind === 'other' ? 'Like "Laptop"' : ''} /></label>
      {how !== 'have' && <label className="grid gap-1 text-sm font-semibold">When you buy it<WhenPick value={f.when} onChange={(w) => setF({ ...f, when: w })} /></label>}
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-sm font-semibold">{how === 'have' ? "What it's worth" : 'Price'}<input className={fieldCls} inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="$0" autoFocus /></label>
        <label className="grid gap-1 text-sm font-semibold">Value each year (%)<input className={fieldCls} inputMode="decimal" value={f.change} onChange={(e) => setF({ ...f, change: e.target.value })} placeholder="0" /></label>
      </div>
      {how === 'loan' && <>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm font-semibold">Down payment<input className={fieldCls} inputMode="decimal" value={f.down} onChange={(e) => setF({ ...f, down: e.target.value })} placeholder="$0" /></label>
          <label className="grid gap-1 text-sm font-semibold">Loan interest (% a year)<input className={fieldCls} inputMode="decimal" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} placeholder="0" /></label>
        </div>
        <LinkedTerms idPrefix="own" balance={price - down} rate={rate} payment={payment} onPayment={setPayment} />
      </>}
      <div className="rounded-xl bg-muted/60 p-3 text-sm">
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">What happens</p>
        <ol className="mt-2 space-y-1.5">
          {how === 'have' && <li>It's yours from {monthLabel(doc.start, 0)}, worth <b>{money(price)}</b>. No money changes hands.</li>}
          {how === 'cash' && <li>{monthLabel(doc.start, startG)}: <b>−{money(price)}</b> out of your savings, and you own something worth {money(price)}.</li>}
          {how === 'loan' && <li>{monthLabel(doc.start, startG)}: <b>−{money(down)}</b> down payment out of your savings, and a loan of <b>{money(price - down)}</b> pays the rest.</li>}
          {num(f.change) !== 0 && <li>Its value {num(f.change) < 0 ? 'drops' : 'grows'} about {Math.abs(num(f.change))}% a year.</li>}
          {costs.length > 0 && <li>Its running costs go into your budget, for you to fill in.</li>}
        </ol>
      </div>
      {how === 'loan' && <LoanStory planStart={doc.start} startG={startG} balance={price - down} rate={rate} payment={payment} lands={false} already={false} />}
      {items.length > 0 && <fieldset className="grid gap-1.5 text-sm font-semibold"><legend className="mb-1">Add its running costs to your budget</legend>
        {items.map((i) => <label key={i.key} className="flex items-center gap-2 font-normal"><input type="checkbox" checked={costs.includes(i.key)} onChange={(e) => setCosts(e.target.checked ? [...costs, i.key] : costs.filter((c) => c !== i.key))} /><LifeIcon name={i.icon} />{i.title}</label>)}
      </fieldset>}
      <p className="text-xs text-muted-foreground">We don't guess prices or how values change yet. Put in your own numbers; you can change all of them later.</p>
      <Button type="submit" variant="brand" className="w-full">Add it</Button>
    </form>
  )
}
