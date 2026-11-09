'use client'

import React from 'react'
import { ChevronRight, Trash2 } from 'lucide-react'
import { SectionHead, cardCls } from './MoneyParts'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@components/ui/dialog'
import type { LifeEvent } from '@services/life/life'
import { useLife } from './LifeContext'
import { LifeIcon } from './icons'
import { money, monthLabel, phaseOffset, uid } from './model'

import { tr } from '@/lib/tr'
const num = (s: string) => { const v = Number(String(s).replace(/[$,%\s]/g, '')); return Number.isFinite(v) ? v : 0 }

function Item({ id, icon, title, sub, value, tone, onClick }: { id?: string; icon: string; title: string; sub?: string; value: string; tone?: 'in' | 'out'; onClick: () => void }) {
  return (
    <button id={id} type="button" onClick={onClick} className="flex w-full items-center gap-2.5 border-t border-border/70 py-2 text-left text-[15px] first:border-t-0">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground"><LifeIcon name={icon} className="size-[15px]" /></span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="flex items-baseline gap-2"><span className="min-w-0 flex-1 truncate font-semibold">{title}</span><span className={`shrink-0 font-semibold tabular-nums ${tone === 'in' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{value}</span></span>
        {sub && <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{sub}</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
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
            {onRemove ? <Button type="button" variant="ghost" className="text-destructive" onClick={() => { onRemove(); onClose() }}><Trash2 />{tr('budget.budget_table.remove', 'Remove')}</Button> : <span />}
            <Button type="submit" variant="brand">{tr('careers.career_take.save', 'Save')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Money that moves once in the phase in view: things you pay or get, and loan money landing. Shown once there is any. */
export function TransfersSection() {
  const { doc, phase, projection, setOpenLine } = useLife()
  const [edit, setEdit] = React.useState<LifeEvent | null>(null)
  const evs = doc.events.filter((e) => e.phase === phase.id).sort((a, b) => a.month - b.month)
  const off = phaseOffset(doc, phase.id)
  // Loan money lands here too, so a short month sits next to the money that covers it.
  const loans = projection.marks.filter((x) => x.kind === 'loan' && x.amount > 0.5 && x.g >= off && x.g < off + phase.months)
  if (!evs.length && !loans.length) return null
  const goTo = (id: string | null) => { if (!id) return; requestAnimationFrame(() => document.getElementById(`m:${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })); setOpenLine(null) }
  return (
    <section aria-label={tr('budget.transfers.transfers', 'Transfers')}>
      <SectionHead title={tr('budget.transfers.transfers', 'Transfers')} />
      <div className={cardCls}>
        {loans.map((x) => <Item key={`loan-${x.ref}`} icon="landmark" title={`${x.title} money`} sub={`${monthLabel(doc.start, x.g)} · from your loan`} value={money(x.amount, { sign: true })} tone="in" onClick={() => goTo(x.ref)} />)}
        {evs.map((e) => <Item key={e.id} id={`row-ev:${e.id}`} icon={e.amount >= 0 ? 'arrow-down-left' : 'arrow-up-right'} title={e.title} sub={monthLabel(doc.start, off + e.month)} value={money(e.amount, { sign: true })} tone={e.amount > 0 ? 'in' : 'out'} onClick={() => setEdit(e)} />)}
      </div>
      {edit && <TransferDialog event={edit} onClose={() => setEdit(null)} />}
    </section>
  )
}

/** Add or change money that moves once: what, which way, how much and when. `event` null adds a new one. */
export function TransferDialog({ event, onClose }: { event: LifeEvent | null; onClose: () => void }) {
  const { doc, phase, stretch, update } = useLife()
  const off = phaseOffset(doc, phase.id)
  const ev = React.useMemo(() => event || { id: uid('e'), phase: phase.id, month: stretch.m0, title: '', amount: 0 }, [event, phase.id, stretch.m0])
  const [f, setF] = React.useState({ title: ev.title, amount: ev.amount ? String(Math.abs(ev.amount)) : '', dir: (ev.amount > 0 ? 'in' : 'out') as 'in' | 'out', month: ev.month })
  return (
    <Editor title={event ? tr('budget.transfers.transfer', 'Transfer') : tr('budget.transfers.add_a_transfer', 'Add a transfer')} open onClose={onClose}
      onRemove={event ? () => update((d) => { d.events = d.events.filter((x) => x.id !== ev.id) }) : undefined}
      onSave={() => {
        if (!f.title.trim()) return
        const next = { ...ev, title: f.title.trim(), month: f.month, amount: (f.dir === 'in' ? 1 : -1) * Math.abs(num(f.amount)) }
        update((d) => { d.events = [...d.events.filter((x) => x.id !== next.id), next] })
      }}>
      <Field label={tr('budget.money_cards.what', 'What')}><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={tr('budget.money_cards.like_quot_apartment_deposit_quot', 'Like "Apartment deposit"')} autoFocus /></Field>
      <div className="flex gap-1.5">
        {(['out', 'in'] as const).map((d) => <button key={d} type="button" aria-pressed={f.dir === d} onClick={() => setF({ ...f, dir: d })} className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${f.dir === d ? 'bg-[var(--org-primary-color)] text-[var(--org-on-primary-color)] ring-transparent' : 'ring-border'}`}>{d === 'out' ? tr('budget.money_cards.i_pay', 'I pay') : tr('budget.money_cards.i_get', 'I get')}</button>)}
      </div>
      <Field label={tr('budget.add_tray.how_much', 'How much')}><input className={inputCls} inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="$0" /></Field>
      <Field label={tr('budget.money_cards.when', 'When')}><select className={inputCls} value={f.month} onChange={(e) => setF({ ...f, month: Number(e.target.value) })}>{Array.from({ length: phase.months }, (_, m) => <option key={m} value={m}>{monthLabel(doc.start, off + m)}</option>)}</select></Field>
    </Editor>
  )
}
