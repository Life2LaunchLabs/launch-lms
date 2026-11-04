'use client'

import React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@components/ui/dialog'
import type { LifeEvent, When } from '@services/life/life'
import { useLife } from './LifeContext'
import { LifeIcon } from './icons'
import { money, monthLabel, phaseOffset, uid } from './model'

const num = (s: string) => { const v = Number(String(s).replace(/[$,%\s]/g, '')); return Number.isFinite(v) ? v : 0 }

function Card({ title, note, onAdd, addLabel, children, empty }: { title: string; note?: string; onAdd: () => void; addLabel: string; children: React.ReactNode; empty: boolean }) {
  const { readOnly } = useLife()
  return (
    <section className="rounded-2xl bg-card p-4 shadow-[0_1px_0_hsl(var(--border))] sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-extrabold">{title}</h3>
        {readOnly ? null : <button type="button" onClick={onAdd} className="inline-flex items-center gap-1 text-sm font-extrabold text-[var(--org-primary-color)] dark:text-[color-mix(in_srgb,var(--org-primary-color)_45%,white)]"><Plus className="size-4" />{addLabel}</button>}
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

export function OneTimeCard() {
  const { doc, phase, stretch, update, projection, setOpenLine } = useLife()
  const [edit, setEdit] = React.useState<LifeEvent | null>(null)
  const [isNew, setIsNew] = React.useState(false)
  const [f, setF] = React.useState({ title: '', amount: '', dir: 'out' as 'in' | 'out', month: 0 })
  const evs = doc.events.filter((e) => e.phase === phase.id).sort((a, b) => a.month - b.month)
  const off = phaseOffset(doc, phase.id)
  // Loan money lands here too, so a short month sits next to the money that covers it.
  const loans = projection.marks.filter((x) => x.kind === 'loan' && x.amount > 0.5 && x.g >= off && x.g < off + phase.months)
  const goTo = (id: string | null) => { if (!id) return; setOpenLine(`m:${id}`); requestAnimationFrame(() => document.getElementById(`row-m:${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })) }
  const open = (e: LifeEvent | null) => {
    const ev = e || { id: uid('e'), phase: phase.id, month: stretch.m0, title: '', amount: 0 }
    setIsNew(!e); setEdit(ev); setF({ title: ev.title, amount: ev.amount ? String(Math.abs(ev.amount)) : '', dir: ev.amount > 0 ? 'in' : 'out', month: ev.month })
  }
  return (
    <Card title="One-time money" note={evs.length || loans.length ? undefined : 'Big costs or money that comes once, like a deposit, a laptop, or a graduation gift.'} addLabel="Add" onAdd={() => open(null)} empty={!evs.length && !loans.length}>
      {loans.map((x) => <Item key={`loan-${x.ref}`} icon="landmark" title={`${x.title} money`} sub={`${monthLabel(doc.start, x.g)} · from your loan`} value={money(x.amount, { sign: true })} tone="in" onClick={() => goTo(x.ref)} />)}
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
