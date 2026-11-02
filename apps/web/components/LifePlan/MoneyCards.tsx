'use client'

import React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@components/ui/dialog'
import type { Asset, Debt, LifeEvent, Saving, When } from '@services/life/life'
import { useLife } from './LifeContext'
import { LifeIcon } from './icons'
import { money, monthLabel, phaseOffset, uid } from './model'

const num = (s: string) => { const v = Number(String(s).replace(/[$,%\s]/g, '')); return Number.isFinite(v) ? v : 0 }

function Card({ title, note, onAdd, addLabel, children, empty }: { title: string; note?: string; onAdd: () => void; addLabel: string; children: React.ReactNode; empty: boolean }) {
  return (
    <section className="rounded-2xl bg-card p-4 shadow-[0_1px_0_hsl(var(--border))] sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-extrabold">{title}</h3>
        <button type="button" onClick={onAdd} className="inline-flex items-center gap-1 text-sm font-extrabold text-[var(--org-primary-color)] dark:text-[color-mix(in_srgb,var(--org-primary-color)_45%,white)]"><Plus className="size-4" />{addLabel}</button>
      </div>
      {note && <p className="mt-0.5 text-sm text-muted-foreground">{note}</p>}
      <div className={empty ? 'contents' : 'mt-2'}>{children}</div>
    </section>
  )
}

function Item({ icon, title, sub, value, tone, onClick }: { icon: string; title: string; sub?: string; value: string; tone?: 'in' | 'out'; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 border-b border-border/70 py-3 text-left last:border-b-0">
      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-muted"><LifeIcon name={icon} /></span>
      <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{title}</span>{sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}</span>
      <span className={`font-semibold tabular-nums ${tone === 'in' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{value}</span>
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1 text-sm font-semibold">{label}{children}</label>
}
const inputCls = 'h-10 rounded-xl border border-border bg-background px-3 font-normal outline-none focus:border-[var(--org-primary-color)]'

function Editor({ title, open, onClose, onSave, onRemove, children }: { title: string; open: boolean; onClose: () => void; onSave: () => void; onRemove?: () => void; children: React.ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form className="space-y-3 pt-2" onSubmit={(e) => { e.preventDefault(); onSave(); onClose() }}>
          {children}
          <div className="flex items-center justify-between gap-2 pt-2">
            {onRemove ? <Button type="button" variant="ghost" className="text-destructive" onClick={() => { onRemove(); onClose() }}><Trash2 />Remove</Button> : <span />}
            <Button type="submit" variant="brand">Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** A month in the phase in view; "already" means before the plan starts. */
// eslint-disable-next-line no-unused-vars -- parameter names in a function type
function WhenSelect({ value, onChange, already }: { value: When | null; onChange: (w: When | null) => void; already?: string }) {
  const { doc, phase } = useLife()
  const off = phaseOffset(doc, phase.id)
  const v = value ? `${value.phase}|${value.month}` : ''
  return (
    <select className={inputCls} value={v} onChange={(e) => { const [p, m] = e.target.value.split('|'); onChange(e.target.value ? { phase: p, month: Number(m) } : null) }}>
      {already && <option value="">{already}</option>}
      {value && value.phase !== phase.id && <option value={v}>{monthLabel(doc.start, phaseOffset(doc, value.phase) + value.month)}</option>}
      {Array.from({ length: phase.months }, (_, m) => <option key={m} value={`${phase.id}|${m}`}>{monthLabel(doc.start, off + m)}</option>)}
    </select>
  )
}
const whenLabel = (doc: any, w?: When | null) => (w ? monthLabel(doc.start, phaseOffset(doc, w.phase) + w.month) : '')

export function OneTimeCard() {
  const { doc, phase, stretch, update } = useLife()
  const [edit, setEdit] = React.useState<LifeEvent | null>(null)
  const [isNew, setIsNew] = React.useState(false)
  const [f, setF] = React.useState({ title: '', amount: '', dir: 'out' as 'in' | 'out', month: 0 })
  const evs = doc.events.filter((e) => e.phase === phase.id).sort((a, b) => a.month - b.month)
  const off = phaseOffset(doc, phase.id)
  const open = (e: LifeEvent | null) => {
    const ev = e || { id: uid('e'), phase: phase.id, month: stretch.m0, title: '', amount: 0 }
    setIsNew(!e); setEdit(ev); setF({ title: ev.title, amount: ev.amount ? String(Math.abs(ev.amount)) : '', dir: ev.amount > 0 ? 'in' : 'out', month: ev.month })
  }
  return (
    <Card title="One-time money" note={evs.length ? undefined : 'Big costs or money that comes once, like a deposit, a laptop, or a graduation gift.'} addLabel="Add" onAdd={() => open(null)} empty={!evs.length}>
      {evs.map((e) => <Item key={e.id} icon={e.amount >= 0 ? 'arrow-down-left' : 'arrow-up-right'} title={e.title} sub={monthLabel(doc.start, off + e.month)} value={money(e.amount, { sign: true })} tone={e.amount > 0 ? 'in' : 'out'} onClick={() => open(e)} />)}
      <Editor title={isNew ? 'Add one-time money' : 'One-time money'} open={!!edit} onClose={() => setEdit(null)}
        onRemove={isNew ? undefined : () => update((d) => { d.events = d.events.filter((x) => x.id !== edit!.id) })}
        onSave={() => {
          if (!f.title.trim()) return
          const ev = { ...edit!, title: f.title.trim(), month: f.month, amount: (f.dir === 'in' ? 1 : -1) * Math.abs(num(f.amount)) }
          update((d) => { d.events = [...d.events.filter((x) => x.id !== ev.id), ev] })
        }}>
        <Field label="What"><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Like &quot;Apartment deposit&quot;" autoFocus /></Field>
        <div className="flex gap-1.5">
          {(['out', 'in'] as const).map((d) => <button key={d} type="button" aria-pressed={f.dir === d} onClick={() => setF({ ...f, dir: d })} className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${f.dir === d ? 'bg-[var(--org-primary-color)] text-[var(--org-on-primary-color)] ring-transparent' : 'ring-border'}`}>{d === 'out' ? 'I pay' : 'I get'}</button>)}
        </div>
        <Field label="How much"><input className={inputCls} inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="$0" /></Field>
        <Field label="When"><select className={inputCls} value={f.month} onChange={(e) => setF({ ...f, month: Number(e.target.value) })}>{Array.from({ length: phase.months }, (_, m) => <option key={m} value={m}>{monthLabel(doc.start, off + m)}</option>)}</select></Field>
      </Editor>
    </Card>
  )
}

export function DebtCard() {
  const { doc, catalog, stretch, projection, update } = useLife()
  const [edit, setEdit] = React.useState<Debt | null>(null)
  const [isNew, setIsNew] = React.useState(false)
  const [f, setF] = React.useState<any>({})
  const now = projection.debtsAt(stretch.g0)
  const short = projection.short[stretch.g0] || 0
  const open = (d: Debt | null) => {
    const x = d || { id: uid('d'), kind: 'student_loan', title: 'Student loan', balance: 0, rate: 5.5, payment: 0, start: null }
    setIsNew(!d); setEdit(x); setF({ ...x, balance: x.balance ? String(x.balance) : '', rate: String(x.rate), payment: x.payment ? String(x.payment) : '' })
  }
  const linked = (d: Debt) => doc.assets.find((a) => a.loan_id === d.id)
  return (
    <Card title="Debt" note={!now.length && !short ? 'Loans and cards you pay back. Loans for a car or home are added with the thing you buy.' : undefined} addLabel="Add a loan" onAdd={() => open(null)} empty={!now.length && !short}>
      {now.map(({ debt, balance, payment }) => <Item key={debt.id} icon="landmark" title={debt.title} sub={`${money(payment)} a month at ${debt.rate}%`} value={money(-balance)} onClick={() => open(debt)} />)}
      {short > 0.5 && <div className="flex items-center gap-3 py-3"><span className="grid size-8 place-items-center rounded-xl bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"><LifeIcon name="receipt" /></span><span className="flex-1"><b className="block font-semibold">Money you'd be short</b><span className="text-xs text-muted-foreground">Your budget doesn't cover this yet.</span></span><b className="tabular-nums text-red-700 dark:text-red-300">{money(-short)}</b></div>}
      <p className="sr-only">{doc.debts.length === 1 ? "1 debt" : `${doc.debts.length} debts`}</p>
      <Editor title={isNew ? 'Add a loan' : edit?.title || 'Loan'} open={!!edit} onClose={() => setEdit(null)}
        onRemove={isNew ? undefined : () => update((d) => { d.debts = d.debts.filter((x) => x.id !== edit!.id); d.assets.forEach((a) => { if (a.loan_id === edit!.id) a.loan_id = null }) })}
        onSave={() => {
          const x: Debt = { ...edit!, kind: f.kind, title: f.title.trim() || 'Loan', balance: num(f.balance), rate: num(f.rate), payment: num(f.payment), start: f.start }
          update((d) => { d.debts = [...d.debts.filter((y) => y.id !== x.id), x] })
        }}>
        <Field label="Kind"><select className={inputCls} value={f.kind} onChange={(e) => { const k = catalog?.debt_kinds.find((x) => x.key === e.target.value); setF({ ...f, kind: e.target.value, title: f.title && f.title !== catalog?.debt_kinds.find((x) => x.key === f.kind)?.title ? f.title : k?.title || '' }) }}>
          {catalog?.debt_kinds.map((k) => <option key={k.key} value={k.key}>{k.title}</option>)}</select></Field>
        <Field label="Name"><input className={inputCls} value={f.title || ''} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label={f.start ? 'How much you borrow' : 'What you owe now'}><input className={inputCls} inputMode="decimal" value={f.balance || ''} onChange={(e) => setF({ ...f, balance: e.target.value })} placeholder="$0" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Interest (% a year)"><input className={inputCls} inputMode="decimal" value={f.rate || ''} onChange={(e) => setF({ ...f, rate: e.target.value })} /></Field>
          <Field label="Payment a month"><input className={inputCls} inputMode="decimal" value={f.payment || ''} onChange={(e) => setF({ ...f, payment: e.target.value })} placeholder="$0" /></Field>
        </div>
        {edit && !linked(edit) && <Field label="When"><WhenSelect value={f.start || null} onChange={(w) => setF({ ...f, start: w })} already="I already have it" /></Field>}
        <p className="text-xs text-muted-foreground">Put in your loan's real rate and payment. We don't estimate these yet.</p>
      </Editor>
    </Card>
  )
}

export function SavingsCard() {
  const { doc, catalog, stretch, projection, update } = useLife()
  const [edit, setEdit] = React.useState<Saving | null>(null)
  const [isNew, setIsNew] = React.useState(false)
  const [f, setF] = React.useState<any>({})
  const at = projection.savingsAt(stretch.g0)
  const open = (s: Saving | null) => {
    const x = s || { id: uid('s'), kind: 'retirement', title: 'Retirement (401k or IRA)', balance: 0, rate: 0, monthly: 0, main: false }
    setIsNew(!s); setEdit(x); setF({ ...x, balance: x.balance ? String(x.balance) : '', rate: String(x.rate), monthly: x.monthly ? String(x.monthly) : '' })
  }
  return (
    <Card title="Savings" note="Your savings account gets whatever is left over each month." addLabel="Add" onAdd={() => open(null)} empty={false}>
      {doc.savings.map((s) => <Item key={s.id} icon="piggy-bank" title={s.title} sub={s.main ? `Started with ${money(s.balance)}` : `${money(s.monthly)} a month`} value={money(at.find((x) => x.id === s.id)?.balance ?? 0)} onClick={() => open(s)} />)}
      <Editor title={isNew ? 'Add savings' : edit?.title || 'Savings'} open={!!edit} onClose={() => setEdit(null)}
        onRemove={isNew || edit?.main ? undefined : () => update((d) => { d.savings = d.savings.filter((x) => x.id !== edit!.id) })}
        onSave={() => {
          const x: Saving = { ...edit!, kind: f.kind, title: f.title.trim() || 'Savings', balance: num(f.balance), rate: num(f.rate), monthly: edit!.main ? 0 : num(f.monthly) }
          update((d) => { d.savings = d.savings.some((y) => y.id === x.id) ? d.savings.map((y) => (y.id === x.id ? x : y)) : [...d.savings, x] })
        }}>
        {!edit?.main && <Field label="Kind"><select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, title: catalog?.savings_kinds.find((k) => k.key === e.target.value)?.title || f.title })}>
          {catalog?.savings_kinds.map((k) => <option key={k.key} value={k.key}>{k.title}</option>)}</select></Field>}
        <Field label="Name"><input className={inputCls} value={f.title || ''} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label={`What's in it at ${monthLabel(doc.start, 0)}`}><input className={inputCls} inputMode="decimal" value={f.balance || ''} onChange={(e) => setF({ ...f, balance: e.target.value })} placeholder="$0" /></Field>
        <div className="grid grid-cols-2 gap-3">
          {!edit?.main && <Field label="Put in a month"><input className={inputCls} inputMode="decimal" value={f.monthly || ''} onChange={(e) => setF({ ...f, monthly: e.target.value })} placeholder="$0" /></Field>}
          <Field label="Growth (% a year)"><input className={inputCls} inputMode="decimal" value={f.rate || ''} onChange={(e) => setF({ ...f, rate: e.target.value })} placeholder="0" /></Field>
        </div>
        <p className="text-xs text-muted-foreground">Use your account's real rate. We don't estimate growth yet, so it starts at 0%.</p>
      </Editor>
    </Card>
  )
}

export function OwnCard() {
  const { doc, phase, catalog, stretch, projection, update } = useLife()
  const [edit, setEdit] = React.useState<Asset | null>(null)
  const [isNew, setIsNew] = React.useState(false)
  const [f, setF] = React.useState<any>({})
  const at = projection.assetsAt(stretch.g0)
  const open = (a: Asset | null) => {
    const x = a || { id: uid('a'), kind: 'car', title: 'Car', value: 0, change: 0, bought: null, down: null, loan_id: null, sold: null }
    const loan = doc.debts.find((d) => d.id === x.loan_id)
    setIsNew(!a); setEdit(x)
    setF({ ...x, value: x.value ? String(x.value) : '', change: String(x.change), down: x.down != null ? String(x.down) : '', loan: !!loan, rate: loan ? String(loan.rate) : '', payment: loan ? String(loan.payment) : '', sell: !!x.sold, soldAt: x.sold ? { phase: x.sold.phase, month: x.sold.month } : null, price: x.sold ? String(x.sold.price) : '' })
  }
  const icon = (k: string) => catalog?.asset_kinds.find((x) => x.key === k)?.icon || 'package'
  return (
    <Card title="Things you own" note={!at.length ? 'Like a car. Its value counts on top of your savings.' : undefined} addLabel="Add" onAdd={() => open(null)} empty={!at.length && !doc.assets.length}>
      {doc.assets.map((a) => { const v = at.find((x) => x.asset.id === a.id)?.value; return <Item key={a.id} icon={icon(a.kind)} title={a.title} sub={a.bought ? `Get it ${whenLabel(doc, a.bought)}` : a.sold ? `Sell it ${whenLabel(doc, a.sold)}` : undefined} value={v ? money(v) : '—'} onClick={() => open(a)} /> })}
      <Editor title={isNew ? 'Add something you own' : edit?.title || 'Thing you own'} open={!!edit} onClose={() => setEdit(null)}
        onRemove={isNew ? undefined : () => update((d) => { d.assets = d.assets.filter((x) => x.id !== edit!.id); if (edit!.loan_id) d.debts = d.debts.filter((x) => x.id !== edit!.loan_id) })}
        onSave={() => update((d) => {
          const value = num(f.value)
          const a: Asset = { ...edit!, kind: f.kind, title: f.title.trim() || 'Something', value, change: num(f.change), bought: f.bought || null, sold: f.sell && f.soldAt ? { ...f.soldAt, price: num(f.price) } : null, down: null }
          const old = d.debts.find((x) => x.id === edit!.loan_id)
          if (f.bought && f.loan) {
            const down = Math.min(value, num(f.down))
            const loan: Debt = { id: old?.id || uid('d'), kind: a.kind === 'home' ? 'mortgage' : a.kind === 'car' ? 'car_loan' : 'personal', title: `${a.title} loan`, balance: value - down, rate: num(f.rate), payment: num(f.payment), start: f.bought }
            d.debts = [...d.debts.filter((x) => x.id !== loan.id), loan]
            a.loan_id = loan.id; a.down = down
          } else { if (old) d.debts = d.debts.filter((x) => x.id !== old.id); a.loan_id = null }
          d.assets = [...d.assets.filter((x) => x.id !== a.id), a]
        })}>
        <Field label="Kind"><select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, title: catalog?.asset_kinds.find((k) => k.key === e.target.value)?.title || f.title })}>
          {catalog?.asset_kinds.map((k) => <option key={k.key} value={k.key}>{k.title}</option>)}</select></Field>
        <Field label="Name"><input className={inputCls} value={f.title || ''} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="When"><WhenSelect value={f.bought || null} onChange={(w) => setF({ ...f, bought: w })} already="I already own it" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={f.bought ? 'Price' : "What it's worth"}><input className={inputCls} inputMode="decimal" value={f.value || ''} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder="$0" /></Field>
          <Field label="Value change (% a year)"><input className={inputCls} inputMode="decimal" value={f.change || ''} onChange={(e) => setF({ ...f, change: e.target.value })} placeholder="0" /></Field>
        </div>
        {f.bought && <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!!f.loan} onChange={(e) => setF({ ...f, loan: e.target.checked })} />Pay with a loan</label>}
        {f.bought && f.loan && <div className="grid grid-cols-3 gap-2">
          <Field label="Down"><input className={inputCls} inputMode="decimal" value={f.down || ''} onChange={(e) => setF({ ...f, down: e.target.value })} placeholder="$0" /></Field>
          <Field label="Rate %"><input className={inputCls} inputMode="decimal" value={f.rate || ''} onChange={(e) => setF({ ...f, rate: e.target.value })} /></Field>
          <Field label="A month"><input className={inputCls} inputMode="decimal" value={f.payment || ''} onChange={(e) => setF({ ...f, payment: e.target.value })} placeholder="$0" /></Field>
        </div>}
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!!f.sell} onChange={(e) => setF({ ...f, sell: e.target.checked, soldAt: f.soldAt || { phase: phase.id, month: phase.months - 1 } })} />Sell it later</label>
        {f.sell && <div className="grid grid-cols-2 gap-3">
          <Field label="When"><WhenSelect value={f.soldAt} onChange={(w) => setF({ ...f, soldAt: w })} /></Field>
          <Field label="For"><input className={inputCls} inputMode="decimal" value={f.price || ''} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="$0" /></Field>
        </div>}
      </Editor>
    </Card>
  )
}
