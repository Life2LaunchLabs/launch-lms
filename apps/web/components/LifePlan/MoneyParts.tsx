'use client'
/* eslint-disable no-unused-vars -- parameter names in function types */

import React from 'react'
import { ChevronDown, ChevronRight, MoreVertical, Plus } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { Button } from '@components/ui/button'
import Sheet from './Sheet'
import { useLife } from './LifeContext'
import { LifeIcon } from './icons'
import { PerTag } from './BudgetSummary'
import { fromMonthly, money, monthLabel, phaseOffset } from './model'
import { cn } from '@/lib/utils'

import { tr } from '@/lib/tr'

/** "Sep 2027" for a month of the phase in view. */
export function useMonthOf() {
  const { doc, phase } = useLife()
  const off = phaseOffset(doc, phase.id)
  return (m: number) => monthLabel(doc.start, off + m)
}

/** Where the phase in view ends, as an index into a balance history (the balance after its last month). */
export function usePhaseEnd() {
  const { doc, phase } = useLife()
  const end = phaseOffset(doc, phase.id) + phase.months
  return { end, endLabel: monthLabel(doc.start, end - 1) }
}

/** A monthly amount with its muted "/mo", in the period the learner reads in. */
export function Monthly({ value, sign = false, className = '' }: { value: number; sign?: boolean; className?: string }) {
  const { per } = useLife()
  return <span className={`tabular-nums ${className}`}>{money(fromMonthly(value, per), { sign })}<PerTag per={per} /></span>
}

/** A section's heading: its name, then a small word saying what the figure is ("paying", "putting in"), the figure and an add button. */
export function SectionHead({ title, label, children, onAdd, addLabel }: { title: string; label?: string; children?: React.ReactNode; onAdd?: () => void; addLabel?: string }) {
  const { readOnly } = useLife()
  return (
    <div className="mb-1.5 flex items-center justify-between gap-3 px-1">
      <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
      <span className="flex min-w-0 items-baseline gap-2">
        {label && <span className="truncate text-xs font-semibold text-muted-foreground">{label}</span>}
        {children && <b className="text-lg font-extrabold">{children}</b>}
        {!readOnly && !onAdd && <span className="w-8 shrink-0" aria-hidden="true" />}
        {!readOnly && onAdd && <Button variant="secondary" size="icon" className="size-8 self-center rounded-full [&_svg]:size-4" onClick={onAdd} aria-label={addLabel} title={addLabel}><Plus /></Button>}
      </span>
    </div>
  )
}

export const cardCls = 'rounded-2xl bg-card px-3 shadow-[0_1px_0_hsl(var(--border))] sm:px-4'

export interface MenuItem { icon: React.ReactNode; label: string; onSelect: () => void; danger?: boolean }

/**
 * One row in the same style as a budget line: icon, name inline with its monthly amount and a chevron,
 * what it's set to underneath, and a muted note under the amount. Opens in place; its menu sits top right.
 */
export function MoneyRow({ id, icon, title, amount, sub, under, first, menu, children }: { id: string; icon: string; title: string; amount: React.ReactNode; sub?: string; under?: string; first: boolean; menu?: MenuItem[]; children?: React.ReactNode }) {
  const { openLine, setOpenLine, readOnly } = useLife()
  const open = openLine === id
  return (
    <div id={`row-${id}`} className={`relative ${first ? '' : 'border-t border-border/70'}`}>
      <button type="button" aria-expanded={open} onClick={() => setOpenLine(open ? null : id)} className="flex w-full items-center gap-2.5 py-2 text-left text-[15px]">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground"><LifeIcon name={icon} className="size-[15px]" /></span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="flex items-baseline gap-2">
            <span className={`min-w-0 flex-1 truncate ${open ? 'font-extrabold' : 'font-semibold'}`}>{title}</span>
            <span className="shrink-0 font-semibold">{amount}</span>
          </span>
          {(sub || under) && <span className="mt-0.5 flex items-baseline gap-2 text-[11px] text-muted-foreground"><span className="min-w-0 flex-1 truncate">{sub}</span>{under && <span className="shrink-0">{under}</span>}</span>}
        </span>
        {open ? <span className="w-8 shrink-0" aria-hidden="true" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
      </button>
      {open && !readOnly && menu && menu.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><button type="button" className="absolute right-0 top-2 grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={tr('budget.line.line_options', 'Options for {{title}}', { title })}><MoreVertical className="size-4" /></button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {menu.map((m) => <DropdownMenuItem key={m.label} className={m.danger ? 'text-destructive focus:text-destructive' : ''} onSelect={() => { m.onSelect(); if (m.danger) setOpenLine(null) }}><span className="mr-2 [&_svg]:size-4">{m.icon}</span>{m.label}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {open && <div className="space-y-3 border-t border-border/70 pb-3 pt-2.5 text-sm">{children}</div>}
    </div>
  )
}

/** A labelled box in the settings or amount section of an open row: the label above, the field inside. */
export function Field({ label, children, hot = false, className = '' }: { label: string; children: React.ReactNode; hot?: boolean; className?: string }) {
  return (
    <label className={`grid min-w-0 gap-1 ${className}`}>
      <span className="truncate text-[11px] font-semibold text-muted-foreground">{label}</span>
      <span className={`flex h-9 min-w-0 items-center gap-0.5 rounded-lg border bg-background px-2.5 text-[15px] font-semibold tabular-nums focus-within:border-[var(--org-primary-color)] ${hot ? 'border-[var(--org-primary-color)] ring-1 ring-[var(--org-primary-color)]' : 'border-border'}`}>{children}</span>
    </label>
  )
}

/** A select in the same box. */
export function SelectField({ label, value, options, onChange, className = '' }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void; className?: string }) {
  return (
    <label className={`grid min-w-0 gap-1 ${className}`}>
      <span className="truncate text-[11px] font-semibold text-muted-foreground">{label}</span>
      <span className="relative">
        <select className="h-9 w-full appearance-none rounded-lg border border-border bg-background pl-2.5 pr-8 text-sm font-semibold" value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </span>
    </label>
  )
}

const toNum = (s: string) => { const v = Number(String(s).replace(/[$,%\s]/g, '')); return Number.isFinite(v) && v >= 0 ? v : 0 }

/** A number typed into a Field, committed when it loses focus. */
export function NumIn({ value, onSet, label, prefix = '$', suffix, disabled, placeholder = '0' }: { value: number | null; onSet: (n: number) => void; label: string; prefix?: string; suffix?: string; disabled?: boolean; placeholder?: string }) {
  const shown = value == null ? '' : String(Math.round(value * 100) / 100)
  return <>
    {prefix && <span className="text-muted-foreground">{prefix}</span>}
    <input aria-label={label} inputMode="decimal" key={`${label}${shown}`} defaultValue={shown} disabled={disabled} placeholder={placeholder}
      className="w-full min-w-0 bg-transparent outline-none placeholder:font-normal disabled:opacity-60"
      onBlur={(e) => { const t = e.target.value.trim(); if (!t && value == null) return; const n = toNum(t); if (value == null || Math.abs(n - value) > 0.004) onSet(n) }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
    {suffix && <span className="shrink-0 text-xs font-normal text-muted-foreground">{suffix}</span>}
  </>
}

/** The bottom of an open row: a short muted summary line with what happens by the end of the phase. */
export function Outlook({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-muted/60 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">{children}</p>
}

/** Rename something, in a sheet from its row's menu. An empty name puts back the one it had by default. */
export function RenameSheet({ open, value, onClose, onSave }: { open: boolean; value: string; onClose: () => void; onSave: (v: string) => void }) {
  const [v, setV] = React.useState(value)
  React.useEffect(() => { if (open) setV(value) }, [open, value])
  return (
    <Sheet open={open} onClose={onClose} title={tr('budget.line.rename', 'Rename')}>
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); onSave(v.trim()); onClose() }}>
        <input autoFocus aria-label={tr('budget.add_tray.name', 'Name')} value={v} onChange={(e) => setV(e.target.value)} maxLength={120}
          className="h-10 rounded-xl border border-border bg-background px-3 text-[15px] font-semibold outline-none focus:border-[var(--org-primary-color)]" />
        <button type="submit" className="h-10 rounded-xl bg-[var(--org-primary-color)] text-sm font-bold text-[var(--org-on-primary-color)]">{tr('budget.line.done', 'Done')}</button>
      </form>
    </Sheet>
  )
}

/** The colors of a kind of object card: debts in rose, assets in sky. */
export const TONE = {
  debt: { card: 'bg-rose-500/[0.07] ring-rose-500/20 hover:bg-rose-500/[0.11]', icon: 'bg-rose-500/15 text-rose-600 dark:text-rose-300', bar: 'bg-rose-500' },
  asset: { card: 'bg-sky-500/[0.07] ring-sky-500/20 hover:bg-sky-500/[0.11]', icon: 'bg-sky-500/15 text-sky-600 dark:text-sky-300', bar: 'bg-sky-500' },
} as const

/**
 * A thing you have, rather than money that moves each month: a loan or something you own. A bigger, tinted card
 * with its big number (owed, or worth), a line under it and an optional progress bar; it opens its details.
 */
export function ObjectCard({ id, tone, icon, title, value, label, chip, foot, progress, muted, onOpen }: { id: string; tone: keyof typeof TONE; icon: string; title: string; value: string; label: string; chip?: string; foot?: string; progress?: number | null; muted?: boolean; onOpen: () => void }) {
  const t = TONE[tone]
  return (
    <button id={id} type="button" onClick={onOpen} className={cn('flex min-w-0 flex-col gap-2 rounded-2xl p-3.5 text-left ring-1 transition-colors', t.card, muted && 'opacity-70')}>
      <span className="flex items-center gap-2">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', t.icon)}><LifeIcon name={icon} className="size-[18px]" /></span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{title}</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </span>
      <span className="leading-none"><b className="text-2xl font-extrabold tabular-nums tracking-tight">{value}</b> <span className="text-xs font-semibold text-muted-foreground">{label}</span></span>
      {progress != null && <span className="h-1.5 overflow-hidden rounded-full bg-foreground/10"><span className={cn('block h-full rounded-full', t.bar)} style={{ width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%` }} /></span>}
      {(chip || foot) && <span className="flex items-baseline gap-2 text-[11px] text-muted-foreground"><span className="min-w-0 flex-1 truncate">{chip}</span>{foot && <span className="shrink-0">{foot}</span>}</span>}
    </button>
  )
}

/** A section of object cards: a heading, then the cards two across on wider screens. */
export function ObjectSection({ title, label, figure, children }: { title: string; label?: string; figure?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="mb-1.5 flex items-center justify-between gap-3 px-1">
        <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
        {figure != null && <span className="flex min-w-0 items-baseline gap-2">{label && <span className="truncate text-xs font-semibold text-muted-foreground">{label}</span>}<b className="text-lg font-extrabold tabular-nums">{figure}</b></span>}
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">{children}</div>
    </section>
  )
}

/** The actions at the bottom of an object's details sheet. */
export function SheetActions({ items }: { items: MenuItem[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 border-t border-border/70 pt-3">
      {items.map((m) => <button key={m.label} type="button" onClick={m.onSelect} className={cn('flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold ring-1 ring-border hover:bg-muted [&_svg]:size-4', m.danger && 'text-destructive')}>{m.icon}{m.label}</button>)}
    </div>
  )
}

/** Small buttons to add what isn't there yet: a debt, something you own, money that moves once. */
export function AddRow({ items }: { items: { label: string; onClick: () => void }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-1">
      <span className="text-xs font-semibold text-muted-foreground">{tr('lit.people_access.add', 'Add')}</span>
      {items.map((x) => <button key={x.label} type="button" onClick={x.onClick} className="flex h-9 items-center gap-1.5 rounded-full bg-card px-3.5 text-sm font-semibold shadow-[0_1px_0_hsl(var(--border))] hover:bg-muted [&_svg]:size-4"><Plus />{x.label}</button>)}
    </div>
  )
}
