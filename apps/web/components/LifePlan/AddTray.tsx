'use client'

import React from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@components/ui/dialog'
import type { CatalogItem, Line, Side, Unit } from '@services/life/life'
import { useLife } from './LifeContext'
import { LifeIcon } from './icons'
import { OccupationPicker } from './BudgetTable'
import { DEFAULT_HOURS, monthLabel, phaseOffset, uid } from './model'

export interface AddTarget { side: Side; cat?: string }

const parse = (s: string) => { const v = Number(String(s).replace(/[$,\s]/g, '')); return s.trim() && Number.isFinite(v) && v >= 0 ? v : null }

/** Category, then item, then a check of the assumptions before the line goes in. */
export default function AddTray({ target, onClose }: { target: AddTarget | null; onClose: () => void }) {
  const { catalog } = useLife()
  const [cat, setCat] = React.useState<string | null>(null)
  const [pick, setPick] = React.useState<CatalogItem | null>(null)
  const [q, setQ] = React.useState('')
  React.useEffect(() => { setCat(target?.cat || null); setPick(null); setQ('') }, [target])
  if (!target || !catalog) return null
  const side = target.side
  const cats = catalog.categories.filter((c) => c.side === side)
  const c = cats.find((x) => x.key === cat)
  const items = c ? catalog.items.filter((i) => i.cat === c.key && (!q || i.title.toLowerCase().includes(q.toLowerCase()))) : []
  const back = pick ? () => setPick(null) : c && !target.cat ? () => { setCat(null); setQ('') } : null
  const custom: CatalogItem | null = c ? { key: '', cat: c.key, title: '', icon: c.icon } : null

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1">
            {back && <Button variant="ghost" size="icon" onClick={back} aria-label="Back" className="-ml-2"><ChevronLeft /></Button>}
            {pick ? (pick.title || 'Something else') : c ? `Add ${c.title.toLowerCase()}` : side === 'in' ? 'Add income' : 'Add an expense'}
          </DialogTitle>
        </DialogHeader>
        {!c && (
          <ul className="grid gap-1 pt-2">
            {cats.map((x) => (
              <li key={x.key}><button type="button" onClick={() => setCat(x.key)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left font-semibold hover:bg-muted">
                <span className="grid size-9 place-items-center rounded-xl bg-muted"><LifeIcon name={x.icon} /></span>{x.title}<ChevronRight className="ml-auto size-4 text-muted-foreground" />
              </button></li>
            ))}
          </ul>
        )}
        {c && !pick && (
          <div className="pt-2">
            {catalog.items.filter((i) => i.cat === c.key).length > 6 && (
              <label className="mb-2 flex items-center gap-2 rounded-xl bg-muted px-3"><Search className="size-4 text-muted-foreground" />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search" className="h-10 w-full bg-transparent outline-none" />
              </label>
            )}
            <ul className="grid gap-1">
              {items.map((i) => (
                <li key={i.key}><button type="button" onClick={() => setPick(i)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left font-semibold hover:bg-muted">
                  <span className="grid size-9 place-items-center rounded-xl bg-muted"><LifeIcon name={i.icon} /></span>{i.title}
                  {i.metric && <span className="ml-auto text-xs font-semibold text-muted-foreground">can estimate</span>}
                </button></li>
              ))}
              <li><button type="button" onClick={() => setPick(custom)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">
                <span className="grid size-9 place-items-center rounded-xl bg-muted"><LifeIcon name="pencil" /></span>Something else
              </button></li>
            </ul>
          </div>
        )}
        {pick && <Confirm item={pick} side={side} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function Confirm({ item, side, onDone }: { item: CatalogItem; side: Side; onDone: () => void }) {
  const { doc, phase, stretch, per, updatePhase, setOpenLine, token } = useLife()
  const [title, setTitle] = React.useState(item.title)
  const [settings, setSettings] = React.useState<Record<string, any>>(() => Object.fromEntries((item.settings || []).filter((s) => s.default !== undefined).map((s) => [s.key, s.default])))
  const [amount, setAmount] = React.useState('')
  const [unit, setUnit] = React.useState<Unit>(item.hourly ? 'hr' : per)
  const [hours, setHours] = React.useState(String(DEFAULT_HOURS))
  const [start, setStart] = React.useState(stretch.m0)
  const off = phaseOffset(doc, phase.id)
  const n = parse(amount)
  const ok = title.trim() && (n != null || item.metric || amount.trim() === '')

  const add = () => {
    const h = parse(hours) ?? DEFAULT_HOURS
    const line: Line = {
      id: uid('l'), cat: item.cat, item: item.key || null, title: title.trim(), side, settings, start, end: null,
      hours: item.hourly ? h : null, own: n == null ? null : { unit, value: n, hours: unit === 'hr' ? h : null },
    }
    updatePhase((p) => { p.lines.push(line) })
    setOpenLine(line.id)
    onDone()
  }

  return (
    <form className="space-y-4 pt-2" onSubmit={(e) => { e.preventDefault(); if (ok) add() }}>
      <label className="grid gap-1 text-sm font-semibold">Name
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={side === 'in' ? 'Like "Tutoring"' : 'Like "Concert tickets"'} autoFocus={!item.key} className="h-10 rounded-xl border border-border bg-background px-3 font-normal outline-none focus:border-[var(--org-primary-color)]" />
      </label>
      {(item.settings || []).map((s) => s.kind === 'choice' ? (
        <div key={s.key} className="grid gap-1.5 text-sm font-semibold">{s.title}
          <div className="flex flex-wrap gap-1.5">
            {s.choices!.map(([v, t]) => <button key={String(v)} type="button" aria-pressed={settings[s.key] === v} onClick={() => setSettings({ ...settings, [s.key]: v })}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${settings[s.key] === v ? 'bg-[var(--org-primary-color)] text-[var(--org-on-primary-color)] ring-transparent' : 'ring-border hover:bg-muted'}`}>{t}</button>)}
          </div>
        </div>
      ) : (
        <div key={s.key} className="grid gap-1.5 text-sm font-semibold">{s.title}
          <OccupationPicker token={token} value={settings.soc} label={settings.soc_title} onPick={(o) => { setSettings({ ...settings, soc: o.soc, soc_title: o.title }); if (title === item.title) setTitle(o.title) }} />
        </div>
      ))}
      <div className="grid gap-1 text-sm font-semibold">
        {item.metric ? 'Your number (leave empty to use the estimate)' : 'How much'}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-xl border border-border bg-background px-3 focus-within:border-[var(--org-primary-color)]">$
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" aria-label="Amount" className="h-10 w-24 bg-transparent pl-1 font-normal outline-none" />
          </span>
          <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} aria-label="Per" className="h-10 rounded-xl border border-border bg-background px-2 font-normal">
            {(item.hourly ? ['hr', 'wk', 'mo', 'yr'] : ['wk', 'mo', 'yr']).map((u) => <option key={u} value={u}>{u === 'hr' ? 'an hour' : u === 'wk' ? 'a week' : u === 'mo' ? 'a month' : 'a year'}</option>)}
          </select>
          {(item.hourly) && <span className="inline-flex items-center gap-1 font-normal text-muted-foreground">
            <input value={hours} onChange={(e) => setHours(e.target.value)} inputMode="decimal" aria-label="Hours a week" className="h-10 w-14 rounded-xl border border-border bg-background px-2 text-right text-foreground outline-none" /> hrs a week
          </span>}
        </div>
        {item.metric && <span className="text-xs font-normal text-muted-foreground">We only show an estimate when we have a published source for {phase.place_label || 'this place'}.</span>}
      </div>
      <label className="grid gap-1 text-sm font-semibold">Starts
        <select value={start} onChange={(e) => setStart(Number(e.target.value))} className="h-10 rounded-xl border border-border bg-background px-2 font-normal">
          {Array.from({ length: phase.months }, (_, m) => <option key={m} value={m}>{m === 0 ? `At the start (${monthLabel(doc.start, off)})` : monthLabel(doc.start, off + m)}</option>)}
        </select>
      </label>
      <Button type="submit" variant="brand" className="w-full" disabled={!ok}>Add {title.trim() ? `"${title.trim()}"` : ''}</Button>
    </form>
  )
}
