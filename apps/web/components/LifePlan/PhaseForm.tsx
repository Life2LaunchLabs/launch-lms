'use client'

import React from 'react'
import { MapPin, Search } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { lifeApi, type PlaceOption } from '@services/life/life'

export const PHASE_KINDS: [string, string][] = [
  ['school', 'In school'],
  ['study', 'College or training'],
  ['work', 'Working'],
  ['gap', 'Gap or travel'],
  ['family', 'Family or care'],
  ['other', 'Something else'],
]

export interface PhaseDraft { title: string; kind: string; place: string | null; placeLabel: string; months: number }

/** Search Oregon towns and counties, or any state. */
// eslint-disable-next-line no-unused-vars -- parameter names in a function type
export function PlacePicker({ token, value, label, onPick }: { token?: string; value: string | null; label: string; onPick: (p: PlaceOption | null) => void }) {
  const [q, setQ] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const [rows, setRows] = React.useState<PlaceOption[]>([])
  React.useEffect(() => {
    if (!open) return
    let live = true
    const t = setTimeout(() => { lifeApi.places(q, token).then((r) => { if (live) setRows(r.places) }).catch(() => {}) }, 150)
    return () => { live = false; clearTimeout(t) }
  }, [q, open, token])
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-2 rounded-xl border border-input bg-background px-3 py-2 text-left text-sm">
        <MapPin className="size-4 text-muted-foreground" />
        <span className={value ? 'font-semibold' : 'text-muted-foreground'}>{value ? label : 'Pick a town, county or state'}</span>
      </button>
    )
  }
  return (
    <div className="rounded-xl border border-input bg-background">
      <div className="flex items-center gap-2 border-b border-border px-3">
        <Search className="size-4 text-muted-foreground" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search places" aria-label="Search places" className="h-10 w-full bg-transparent text-sm outline-none" />
      </div>
      <ul className="max-h-56 overflow-auto py-1" role="listbox" aria-label="Places">
        {rows.map((r) => (
          <li key={r.key}>
            <button type="button" role="option" aria-selected={value === r.key} onClick={() => { onPick(r); setOpen(false); setQ('') }} className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted">
              <span className="font-semibold">{r.label}</span><span className="text-xs text-muted-foreground">{r.detail}</span>
            </button>
          </li>
        ))}
        {!rows.length && <li className="px-3 py-2 text-sm text-muted-foreground">No matches</li>}
      </ul>
    </div>
  )
}

// eslint-disable-next-line no-unused-vars -- parameter names in a function type
export function PhaseForm({ token, initial, submitLabel, onSubmit, onCancel }: { token?: string; initial: PhaseDraft; submitLabel: string; onSubmit: (d: PhaseDraft) => void; onCancel?: () => void }) {
  const [d, setD] = React.useState<PhaseDraft>(initial)
  const years = Math.floor(d.months / 12), months = d.months % 12
  // Zero is allowed while typing, and the form says so instead of quietly making it a month.
  const setDur = (y: number, m: number) => setD({ ...d, months: Math.max(0, Math.min(1200, y * 12 + m)) })
  const tooShort = d.months < 1
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (d.title.trim() && !tooShort) onSubmit({ ...d, title: d.title.trim() }) }}>
      <div className="space-y-1.5">
        <Label htmlFor="phase-title">What's this phase?</Label>
        <Input id="phase-title" value={d.title} maxLength={120} placeholder="High school in Eugene" onChange={(e) => setD({ ...d, title: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>What you're mostly doing</Label>
        <div className="flex flex-wrap gap-2">
          {PHASE_KINDS.map(([k, t]) => (
            <button key={k} type="button" aria-pressed={d.kind === k} onClick={() => setD({ ...d, kind: k })} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${d.kind === k ? 'border-transparent bg-foreground text-background' : 'border-border text-foreground hover:bg-muted'}`}>{t}</button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Where</Label>
        <PlacePicker token={token} value={d.place} label={d.placeLabel} onPick={(p) => setD({ ...d, place: p?.key ?? null, placeLabel: p?.label ?? '' })} />
        <p className="text-xs text-muted-foreground">Estimates are for this place when we have them.</p>
      </div>
      <div className="space-y-1.5">
        <Label>How long</Label>
        <div className="flex items-center gap-2 text-sm">
          <Input aria-label="Years" type="number" min={0} max={100} className="w-20" value={years} onChange={(e) => setDur(Number(e.target.value) || 0, months)} /> years
          <Input aria-label="Months" type="number" min={0} max={11} className="w-20" value={months} onChange={(e) => setDur(years, Math.min(11, Number(e.target.value) || 0))} aria-invalid={tooShort} aria-describedby={tooShort ? 'phase-length-error' : undefined} /> months
        </div>
        {tooShort && <p id="phase-length-error" role="alert" className="text-sm font-semibold text-destructive">A phase needs to last at least one month.</p>}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={!d.title.trim() || tooShort}>{submitLabel}</Button>
      </div>
    </form>
  )
}
